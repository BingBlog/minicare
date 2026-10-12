"""FlexDB → Langfuse 数据同步编排（TECH-030 §2.5）：包装既有 Node 脚本 + 进度解析 + 台账。

设计取舍（D-3）：**不改写 Python** —— 直接 spawn `scripts/langfuse-import.mjs`
（幂等、importedAt 回填、cliEnriched 删除重建等语义都已在脚本内验证过），
平台侧只做三件事：参数透传、进度解析、结果落账（`obs_sync_run`）。

进度协议：脚本 `--progress-json` 模式逐条输出 `@@SYNC@@ {json}` 行
（与测评 harness 的 `@@EVAL@@` 同款口径）；解析失败时回落人类输出行的轻量计数。

边界（与 TECH-030 §2.5 对齐）：
  · 正式导入前：需 Langfuse 健康（探针）+ pk/sk 已配置（平台 .env 优先，回落 agent .env.local）；
  · 试跑（preview / dry-run）：只读 FlexDB，不需要 Langfuse 与 pk/sk；
  · 并发：全局单例，同一时间仅一个同步；取消 = 终止子进程（已完成的回填不丢，可续跑）。
"""
from __future__ import annotations

import json
import re
import subprocess
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path

from ..agent_eval.runner import clean_child_env, find_node
from ..config import get_settings
from ..logger import get_logger
from ..platform_db import PlatformDB

log = get_logger(__name__)

LOG_RING = 200          # 内存保留的日志行数（界面轮询展示）
LOG_TAIL_DB = 4000      # 落库的日志尾最大字符数
SYNC_PREFIX = "@@SYNC@@ "


class ObsSyncError(Exception):
    """同步参数/前置条件错误（路由层转 400）。"""


class ObsSyncBusy(ObsSyncError):
    """已有同步在跑（路由层转 409）。"""


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def read_agent_env(key: str) -> str | None:
    """读 minicare-agent/.env.local 的单个键（平台侧既有惯例，同 runner._read_env_local 口径）。"""
    s = get_settings()
    f = Path(s.obs_unit_dir) / ".env.local"
    if not f.is_file():
        return None
    try:
        m = re.search(rf"^{re.escape(key)}=(.+)$", f.read_text(encoding="utf-8"), re.M)
        return m.group(1).strip() if m else None
    except OSError:
        return None


def langfuse_keys_state() -> dict:
    """pk/sk 配置状态：平台 .env 优先，回落 agent .env.local（D-5 口径）。"""
    s = get_settings()
    pk = s.langfuse_public_key or read_agent_env("LANGFUSE_PUBLIC_KEY") or ""
    sk = s.langfuse_secret_key or read_agent_env("LANGFUSE_SECRET_KEY") or ""
    if s.langfuse_public_key or s.langfuse_secret_key:
        source = "platform"
    elif pk or sk:
        source = "agent-env"
    else:
        source = "none"
    return {"pk_configured": bool(pk), "sk_configured": bool(sk), "source": source}


def flexdb_state() -> dict:
    """FlexDB（TCB）凭证状态：平台 .env 优先，回落 agent .env.local。"""
    s = get_settings()
    plat = bool(s.tcb_secret_id and s.tcb_secret_key)
    if plat:
        return {"configured": True, "source": "platform"}
    agent_pairs = bool(read_agent_env("TCB_SECRET_ID") and read_agent_env("TCB_SECRET_KEY"))
    agent_session = bool(read_agent_env("TCB_SESSION_TOKEN"))
    if agent_pairs or agent_session:
        return {"configured": True, "source": "agent-env"}
    return {"configured": False, "source": "none"}


class ObsSyncManager:
    """同步执行器单例（模块级 `OBS_SYNC`）。"""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._proc: subprocess.Popen | None = None
        self._cancelled = False
        self._lines: deque[str] = deque(maxlen=LOG_RING)
        self._st: dict = self._idle()

    @staticmethod
    def _idle() -> dict:
        return {
            "running": False, "kind": None, "params": {}, "candidates": None,
            "processed": 0, "ok": 0, "fail": 0, "status": "idle", "error": None,
            "started_at": None, "finished_at": None, "last_trace": None,
        }

    # ── 读 ─────────────────────────────────────────────────────────────────

    def snapshot(self, with_lines: bool = True) -> dict:
        with self._lock:
            snap = dict(self._st)
            snap["lines"] = list(self._lines)[-120:] if with_lines else []
            return snap

    def history(self, limit: int = 50) -> list[dict]:
        db = PlatformDB(get_settings().platform_cfg.db_path)
        rows = db.query(
            "SELECT * FROM obs_sync_run ORDER BY id DESC LIMIT ?", (int(limit),)
        )
        for r in rows:
            if r.get("args_json"):
                try:
                    r["args"] = json.loads(r["args_json"])
                except Exception:  # noqa: BLE001
                    r["args"] = None
        return rows

    # ── 写（启动）──────────────────────────────────────────────────────────

    def start(self, params: dict, trigger: str = "ui") -> dict:
        """启动一次同步。`params`：{mode: all|range|trace, limit, from, to, trace_id, dry_run}。"""
        with self._lock:
            if self._st["running"]:
                raise ObsSyncBusy("已有同步进行中，请等待完成或先取消")
        s = get_settings()
        dry = bool(params.get("dry_run"))
        mode = str(params.get("mode") or "all")
        limit = int(params.get("limit") or 50)
        if limit < 1 or limit > 500:
            raise ObsSyncError("条数上限需在 1~500 之间（脚本每次最多扫描 500 条）")

        script = Path(s.obs_unit_dir) / "scripts" / "langfuse-import.mjs"
        if not script.is_file():
            raise ObsSyncError(f"同步脚本不存在：{script}（检查 OBS_UNIT_DIR）")
        node = find_node()
        if not node:
            raise ObsSyncError("未找到 Node 可执行文件（同步脚本依赖 Node 运行）")

        # 前置检查：试跑只依赖 FlexDB；正式导入还需要 Langfuse 健康 + pk/sk
        fx = flexdb_state()
        if not fx["configured"]:
            raise ObsSyncError("FlexDB 凭证未配置（TCB_SECRET_ID/TCB_SECRET_KEY）——线上去重数据源不可读")
        if not dry:
            keys = langfuse_keys_state()
            if not (keys["pk_configured"] and keys["sk_configured"]):
                raise ObsSyncError(
                    "Langfuse API Key 未配置：到 Langfuse 项目设置创建 pk/sk 后填入「全局配置 → 观测」"
                )
            from .stack import probe_health

            health = probe_health(s.langfuse_host)
            if not health["reachable"]:
                raise ObsSyncError("Langfuse 未运行：先在观测页启动观测服务（或等待自动拉起）")

        args: list[str] = [node, str(script), "--progress-json", "--limit", str(limit)]
        scope_label = "全部未导入"
        if mode == "range":
            frm, to = str(params.get("from") or "").strip(), str(params.get("to") or "").strip()
            if not frm and not to:
                raise ObsSyncError("时间范围模式需要至少一个日期（from / to）")
            if frm:
                args += ["--from", frm]
            if to:
                args += ["--to", to]
            scope_label = f"时间范围 {frm or '…'} ~ {to or '…'}"
        elif mode == "trace":
            tid = str(params.get("trace_id") or "").strip()
            if not tid:
                raise ObsSyncError("单条同步需要提供 trace ID")
            args += ["--trace", tid]
            scope_label = f"单条 {tid[:12]}…"
        if dry:
            args.append("--dry-run")
            scope_label = "试跑预览 · " + scope_label

        env = clean_child_env()
        # 平台值为控制面：非空才注入（agent .env.local 由脚本自己 loadLocalEnv 兜底）
        if s.langfuse_host:
            env["LANGFUSE_HOST"] = s.langfuse_host
        if s.langfuse_public_key:
            env["LANGFUSE_PUBLIC_KEY"] = s.langfuse_public_key
        if s.langfuse_secret_key:
            env["LANGFUSE_SECRET_KEY"] = s.langfuse_secret_key
        if s.tcb_secret_id:
            env["TCB_SECRET_ID"] = s.tcb_secret_id
        if s.tcb_secret_key:
            env["TCB_SECRET_KEY"] = s.tcb_secret_key

        try:
            proc = subprocess.Popen(
                args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                bufsize=1, env=env, cwd=str(s.obs_unit_dir),
            )
        except Exception as exc:  # noqa: BLE001
            raise ObsSyncError(f"启动同步进程失败：{exc}") from exc

        with self._lock:
            self._proc = proc
            self._cancelled = False
            self._lines.clear()
            self._st = {
                "running": True, "kind": "preview" if dry else "import", "params": params,
                "candidates": None, "processed": 0, "ok": 0, "fail": 0, "status": "running",
                "error": None, "started_at": _now_iso(), "finished_at": None, "last_trace": None,
            }
            self._meta = {"scope": scope_label, "trigger": trigger, "args": args[2:]}
        threading.Thread(target=self._pump, args=(proc,), name="obs-sync-pump", daemon=True).start()
        return self.snapshot()

    def cancel(self) -> dict:
        with self._lock:
            proc = self._proc
            if not (self._st["running"] and proc):
                return self.snapshot()
            self._cancelled = True
        try:
            proc.terminate()
        except Exception:  # noqa: BLE001
            pass
        return self.snapshot()

    # ── 执行（工作线程）────────────────────────────────────────────────────

    def _append_line(self, line: str) -> None:
        if line.strip():
            with self._lock:
                self._lines.append(line.rstrip())

    def _pump(self, proc: subprocess.Popen) -> None:
        try:
            assert proc.stdout is not None
            for raw in proc.stdout:
                line = raw.rstrip("\n")
                if line.startswith(SYNC_PREFIX):
                    self._on_event(line[len(SYNC_PREFIX):])
                else:
                    self._append_line(line)
        except Exception as exc:  # noqa: BLE001
            self._append_line(f"[平台] 读取输出失败：{exc}")
        rc = proc.wait()
        self._finalize(rc)

    def _on_event(self, payload: str) -> None:
        try:
            evt = json.loads(payload)
        except Exception:  # noqa: BLE001
            return
        kind = evt.get("event")
        with self._lock:
            if kind == "start":
                self._st["candidates"] = evt.get("candidates")
            elif kind == "trace":
                self._st["processed"] = int(evt.get("index") or 0)
                if evt.get("ok"):
                    self._st["ok"] += 1
                else:
                    self._st["fail"] += 1
                    self._append_line(f"[失败] {evt.get('traceId', '?')[:12]}… {evt.get('error') or ''}")
                self._st["last_trace"] = evt.get("traceId")
            elif kind == "done":
                self._st["ok"] = int(evt.get("ok") or self._st["ok"])
                self._st["fail"] = int(evt.get("fail") or self._st["fail"])

    def _finalize(self, rc: int) -> None:
        with self._lock:
            st = self._st
            cancelled = self._cancelled
            ok, fail = st["ok"], st["fail"]
            if cancelled:
                status, err = "cancelled", "已手动取消"
            elif rc != 0 and ok == 0:
                status, err = "error", f"脚本退出码 {rc}（见日志）"
            elif fail > 0 and ok > 0:
                status, err = "partial", f"{fail} 条失败"
            elif fail > 0:
                status, err = "failed", f"{fail} 条失败"
            else:
                status, err = "ok", None
            st.update({
                "running": False, "status": status, "error": err,
                "finished_at": _now_iso(),
            })
            meta = getattr(self, "_meta", {})
            lines = list(self._lines)
            snap_counter = {"candidates": st["candidates"], "ok": ok, "fail": fail}
            started_at = st["started_at"]
        self._write_ledger(status, snap_counter, started_at, lines, meta)

    def _write_ledger(self, status: str, counter: dict, started_at: str | None,
                      lines: list[str], meta: dict) -> None:
        try:
            db = PlatformDB(get_settings().platform_cfg.db_path)
            finished = _now_iso()
            duration_ms = None
            try:
                if started_at:
                    t0 = datetime.fromisoformat(started_at)
                    t1 = datetime.fromisoformat(finished)
                    duration_ms = int((t1 - t0).total_seconds() * 1000)
            except Exception:  # noqa: BLE001
                pass
            db.execute(
                "INSERT INTO obs_sync_run (kind, scope, args_json, candidates, ok, fail, status,"
                " started_at, finished_at, duration_ms, log_tail, trigger)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    "preview" if (meta.get("args") and "--dry-run" in meta["args"]) else "import",
                    meta.get("scope") or "全部未导入",
                    json.dumps(meta.get("args") or []),
                    counter.get("candidates"), counter.get("ok") or 0, counter.get("fail") or 0,
                    status, started_at or finished, finished, duration_ms,
                    ("\n".join(lines))[-LOG_TAIL_DB:], meta.get("trigger") or "ui",
                ),
            )
        except Exception as exc:  # noqa: BLE001 - 台账失败不影响同步本身
            log.warning("obs sync ledger write failed: %s", exc)


OBS_SYNC = ObsSyncManager()
