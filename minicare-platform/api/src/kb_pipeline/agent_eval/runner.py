"""Agent 测评运行调度器（TECH-021 §4）：配置物化 + 子进程驱动 + 进度解析 + 结果入库。

一次运行 = 一个后台线程 + 一个 Node 子进程（`minicare-agent/scripts/eval/eval-agent.mjs`）：

  1. **物化**（§4.1）：按「任务或手工 scope」从 `eval_case` 选取用例，联同 `eval_judge` /
     `eval_dimension` 配置写成 `data/eval/runs/<run_id>/{cases.json, judges.json, meta.json}`；
  2. **执行**：spawn harness 并传 `--cases-file/--judges-file`（评测语义零重写，D3/S-04）；
  3. **进度**：解析子进程 stdout 的 `@@EVAL@@ {json}` 行（harness `--emit-progress`）；
  4. **入库**：运行结束读取 `--json=` 报告 → 写台账；gate 汇总按维度配置口径（§4.3）。

并发：模块级单例 `RUNNER`，同一时间仅一个运行（D7）。
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path

from ..config import REPO_ROOT, get_settings
from ..fsutil import ensure_dir
from ..platform_db import PlatformDB
from .catalog import EvalCatalog, case_to_harness_item, effective_ctx
from .ledger import EvalLedger, compute_gate, group_label, priority_label

AGENT_DIR = REPO_ROOT / "minicare-agent"
HARNESS_REL = "scripts/eval/eval-agent.mjs"
PROGRESS_PREFIX = "@@EVAL@@ "
LOG_TAIL_MAX = 60


# ── 环境探测（帮助函数）───────────────────────────────────────────────


def find_node() -> str | None:
    """定位 Node 可执行文件（平台服务可能以受限 PATH 启动，做多级兜底）。"""
    candidates = [
        os.environ.get("CODEBUDDY_NODE_BIN"),
        "/Users/bing/.workbuddy/binaries/node/versions/22.22.2-6/bin/node",
        shutil.which("node"),
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
    ]
    for c in candidates:
        if c and Path(c).is_file():
            return c
    return None


def clean_child_env() -> dict:
    """剥离 WorkBuddy 沙箱注入（fs broker shim 等），子进程用干净环境跑。"""
    env = dict(os.environ)
    for k in list(env):
        if k == "NODE_OPTIONS" or k.startswith("CODEBUDDY_"):
            env.pop(k, None)
    return env


def parse_scope_str(s: str) -> dict:
    """手工 scope 串 → scope dict（TECH-021 §3.4 的 scope_json 同构）。

    支持：`all` / `group:<组[,组]>` / `ids:<用例[,用例]>`
    """
    s = (s or "all").strip()
    if s == "all":
        return {"all": True}
    if s.startswith("group:"):
        groups = [x.strip() for x in s[len("group:"):].split(",") if x.strip()]
        if not groups:
            raise ValueError("group: 后缺少组名")
        return {"groups": groups}
    if s.startswith("ids:"):
        ids = [x.strip() for x in s[len("ids:"):].split(",") if x.strip()]
        if not ids:
            raise ValueError("ids: 后缺少用例号")
        return {"ids": ids}
    raise ValueError(f"未知 scope：{s}（支持 all / group:xx[,yy] / ids:xx,yy）")


def scope_label_of(scope: dict) -> str:
    """scope dict → 展示标签（与首期风格一致）。"""
    if not scope or scope.get("all"):
        return "全部"
    parts = []
    if scope.get("groups"):
        parts.append("分组 " + "+".join(group_label(g) for g in scope["groups"]))
    if scope.get("ids"):
        parts.append(f"指定 {len(scope['ids'])} 条")
    if scope.get("tags"):
        parts.append("标签 " + "+".join(scope["tags"]))
    if scope.get("priorities"):
        parts.append("优先级 " + "+".join(priority_label(p) for p in scope["priorities"]))
    return " · ".join(parts) or "全部"


def _read_env_local(key: str) -> str | None:
    f = AGENT_DIR / ".env.local"
    if not f.is_file():
        return None
    try:
        m = re.search(rf"^{re.escape(key)}=(.+)$", f.read_text(encoding="utf-8"), re.M)
        return m.group(1).strip() if m else None
    except OSError:
        return None


def _file_hash(p: Path) -> str | None:
    try:
        return hashlib.sha256(p.read_bytes()).hexdigest()[:12]
    except OSError:
        return None


def _git_rev() -> str | None:
    try:
        r = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                           cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=5)
        return r.stdout.strip() if r.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


# ── 调度器 ────────────────────────────────────────────────────────────


class EvalRunner:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active: dict | None = None
        self._proc: subprocess.Popen | None = None
        self._thread: threading.Thread | None = None

    @staticmethod
    def _ledger() -> EvalLedger:
        return EvalLedger(PlatformDB(get_settings().platform_cfg.db_path))

    @staticmethod
    def _catalog() -> EvalCatalog:
        return EvalCatalog(PlatformDB(get_settings().platform_cfg.db_path))

    # ── 前置检查（US-01）─────────────────────────────────────────────

    def check(self) -> dict:
        node = find_node()
        env_file = AGENT_DIR / ".env.local"
        env_ok = False
        if env_file.is_file():
            try:
                env_ok = "DEEPSEEK_API_KEY=" in env_file.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                env_ok = False
        harness_ok = (AGENT_DIR / HARNESS_REL).is_file()
        cases_row = self._catalog().db.query_one("SELECT COUNT(*) AS n FROM eval_case WHERE enabled = 1")
        cases_ready = bool(cases_row and cases_row["n"] > 0)
        running = self._active is not None
        issues: list[str] = []
        if not AGENT_DIR.is_dir():
            issues.append("minicare-agent 目录不存在")
        if not node:
            issues.append("未找到 node 可执行文件")
        if not env_ok:
            issues.append("minicare-agent/.env.local 缺失或未配置 DEEPSEEK_API_KEY")
        if not harness_ok:
            issues.append(f"{HARNESS_REL} 不存在")
        if not cases_ready:
            issues.append("用例库为空——请到「测评用例」页导入或新建用例")
        if running:
            issues.append(f"已有运行进行中（{self._active['run_id']}）")
        return {
            "ok": not issues,
            "node": node,
            "agent_dir": str(AGENT_DIR),
            "env_local": env_ok,
            "harness": harness_ok,
            "cases_ready": cases_ready,
            "running": running,
            "active_run_id": (self._active or {}).get("run_id"),
            "issues": issues,
        }

    # ── 配置物化（TECH-021 §4.1）────────────────────────────────────

    def _judges_map(self) -> dict[str, dict]:
        """当前启用的四个 LLM 裁判配置（TECH-021 §4.2；物化 / 试跑共用）。"""
        judges_map: dict[str, dict] = {}
        for j in self._catalog().list_judges(enabled=True):
            key = j["dim_id"].split("-", 1)[1] if "-" in j["dim_id"] else j["dim_id"]
            if key in ("faithfulness", "completeness", "guardrail", "style") and j.get("prompt"):
                judges_map[key] = {
                    "prompt": j["prompt"],
                    "model": j["model"] or "deepseek-v4-pro",
                    "temperature": j["temperature"] if j["temperature"] is not None else 0,
                }
        return judges_map

    def _materialize(self, run_id: str, scope: dict, dim_ids: list[str] | None) -> dict:
        """写 data/eval/runs/<run_id>/{cases.json, judges.json, meta.json}；返回物化上下文。"""
        settings = get_settings()
        cat = self._catalog()
        cases = cat.select_cases(scope)
        if not cases:
            raise RuntimeError("用例筛选结果为空——检查任务/范围的用例选择条件，或用例是否启用")
        dims = cat.list_dimensions(enabled=True)
        if dim_ids:
            keep = set(dim_ids)
            dims = [d for d in dims if d["dim_id"] in keep]
        judges_map = self._judges_map()
        run_dir = ensure_dir(settings.platform_cfg.data_root / "eval" / "runs" / run_id).resolve()
        cases_path = run_dir / "cases.json"
        judges_path = run_dir / "judges.json"
        meta_path = run_dir / "meta.json"
        cases_path.write_text(
            json.dumps({"cases": [case_to_harness_item(c) for c in cases]}, ensure_ascii=False, indent=1),
            encoding="utf-8")
        judges_path.write_text(json.dumps(judges_map, ensure_ascii=False, indent=1), encoding="utf-8")
        meta_path.write_text(json.dumps({
            "dimensions": dims,
            "case_count": len(cases),
            "case_ids": [c["case_id"] for c in cases],
        }, ensure_ascii=False, indent=1), encoding="utf-8")
        return {
            "run_dir": run_dir, "cases_path": cases_path, "judges_path": judges_path,
            "case_count": len(cases), "cases_hash": _file_hash(cases_path),
            "case_ids": [c["case_id"] for c in cases],
            "dims": dims, "judge_keys": sorted(judges_map.keys()),
            # 全局运行身份（pipeline.yaml → eval.ctx；用例 ctx 的用户键以此为准）
            "eval_ctx": effective_ctx({}),
        }

    # ── 发起运行（US-01）─────────────────────────────────────────────

    def start(self, *, scope: str | None = None, task_id: str | None = None,
              judge: bool | None = None, runs_n: int | None = None) -> dict:
        if runs_n is not None and (runs_n < 1 or runs_n > 3):
            raise ValueError("runs 需在 1..3 之间")
        with self._lock:
            if self._active is not None:
                a = self._active
                raise RuntimeError(
                    f"已有运行进行中（{a['run_id']}，进度 {a['done']}/{a['total'] or '?'}）"
                    "——等待其完成或先中止"
                )
            chk = self.check()
            if not chk["ok"]:
                raise RuntimeError("环境检查未通过：" + "；".join(chk["issues"]))

            cat = self._catalog()
            task = None
            if task_id:
                task = cat.get_task(task_id)
                if not task:
                    raise ValueError(f"任务不存在：{task_id}")
                if not task["enabled"]:
                    raise ValueError(f"任务已停用：{task_id}")

            if task:
                scope_dict = task["scope"] or {"all": True}
                dim_ids = task.get("dims")
                eff_judge = judge if judge is not None else bool(task["judge"])
                eff_runs = runs_n if runs_n is not None else (task["runs_n"] or 1)
                scope_ledger = f"task:{task['task_id']}"
                scope_label = task["name"]
            else:
                scope_dict = parse_scope_str(scope or "all")
                dim_ids = None
                eff_judge = judge if judge is not None else True
                eff_runs = runs_n if runs_n is not None else 1
                scope_ledger = scope or "all"
                scope_label = scope_label_of(scope_dict)

            base = datetime.now().strftime("%Y%m%d-%H%M%S")
            run_id = base
            n = 1
            while self._ledger().db.query_one("SELECT run_id FROM eval_run WHERE run_id = ?", (run_id,)):
                n += 1
                run_id = f"{base}-{n}"

            mz = self._materialize(run_id, scope_dict, dim_ids)
            env_snapshot = self._env_snapshot(eff_judge, task_id=task_id, mz=mz)
            self._ledger().create_run(
                run_id=run_id, scope=scope_ledger, scope_label=scope_label,
                judge=eff_judge, runs_n=eff_runs, env_snapshot=env_snapshot, task_id=task_id)

            self._active = {
                "run_id": run_id, "task_id": task_id, "scope": scope_ledger,
                "scope_label": scope_label, "judge": eff_judge, "runs_n": eff_runs,
                "status": "running", "done": 0, "total": mz["case_count"], "passed": 0,
                "current": None, "current_desc": None, "started_ms": int(time.time() * 1000),
                "recent": [], "cases": {}, "log_tail": [], "cancel_requested": False,
                "dims": mz["dims"],
            }
            self._thread = threading.Thread(
                target=self._worker, args=(run_id, mz, eff_judge, eff_runs), daemon=True)
            self._thread.start()
            return {
                "run_id": run_id, "task_id": task_id, "scope_label": scope_label,
                "judge": eff_judge, "runs_n": eff_runs, "case_count": mz["case_count"],
            }

    # ── 进度 / 终止（US-02）──────────────────────────────────────────

    def progress(self, run_id: str) -> dict | None:
        a = self._active
        if a is None:
            run = self._ledger().get_run(run_id, with_cases=False)
            if not run:
                return None
            return {"run_id": run_id, "status": run["status"], "live": False,
                    "done": None, "total": None, "current": None,
                    "elapsed_ms": run["duration_ms"], "recent": []}
        if a["run_id"] != run_id:
            return None
        return {
            "run_id": run_id, "status": a["status"], "live": True,
            "done": a["done"], "total": a["total"], "passed": a["passed"],
            "current": a["current"], "current_desc": a.get("current_desc"),
            "elapsed_ms": int(time.time() * 1000) - a["started_ms"],
            "recent": a["recent"][-8:],
        }

    def cancel(self, run_id: str) -> bool:
        with self._lock:
            a = self._active
            if a is None or a["run_id"] != run_id:
                return False
            a["cancel_requested"] = True
            proc = self._proc
        if proc is not None and proc.poll() is None:
            proc.terminate()
        return True

    # ── ETA 估算（TECH-022 B7）──────────────────────────────────────

    def estimate(self, *, scope: str | None = None, task_id: str | None = None,
                 judge: bool | None = None, runs_n: int | None = None) -> dict:
        """按当前选择估算耗时：用例数 × 历史单例均时（按 judge 口径分桶）。

        历史样本 = completed 运行的 `duration_ms / summary.total` 聚合；无样本时回退经验值。
        """
        cat = self._catalog()
        lg = self._ledger()
        if task_id:
            task = cat.get_task(task_id)
            if not task:
                raise ValueError(f"任务不存在：{task_id}")
            scope_dict = task["scope"] or {"all": True}
            eff_judge = bool(judge) if judge is not None else bool(task["judge"])
            eff_runs = runs_n if runs_n is not None else (task["runs_n"] or 1)
        else:
            scope_dict = parse_scope_str(scope or "all")
            eff_judge = bool(judge) if judge is not None else True
            eff_runs = runs_n if runs_n is not None else 1
        eff_runs = max(1, min(3, int(eff_runs)))
        cases = cat.select_cases(scope_dict)

        want_judge = 1 if eff_judge else 0
        dur_sum = 0
        case_sum = 0
        sample = 0
        for r in lg.list_runs(limit=200):
            s = r.get("summary") or {}
            n = s.get("total") or 0
            if r["status"] != "completed" or not r.get("duration_ms") or not n:
                continue
            if (1 if r.get("judge") else 0) != want_judge:
                continue
            dur_sum += int(r["duration_ms"])
            case_sum += int(n)
            sample += 1
        if case_sum > 0:
            per_case_ms = dur_sum / case_sum
            basis = "history"
        else:
            per_case_ms = 35000.0 if eff_judge else 5000.0
            basis = "default"
        return {
            "case_count": len(cases), "judge": eff_judge, "runs_n": eff_runs,
            "est_ms": int(per_case_ms * len(cases) * eff_runs),
            "per_case_ms": int(per_case_ms),
            "sample_runs": sample, "basis": basis,
        }

    # ── 裁判试跑（TECH-022 B6）──────────────────────────────────────

    def rejudge(self, *, judge_id: str, case_id: str, run_id: str | None = None) -> dict:
        """用当前裁判配置对「历史回答」重新判分——不跑被测 agent、不写台账。

        校准闭环的最小入口：改完裁判 prompt → 对既有回答立即验证判分行为变化。
        来源回答取指定运行；未指定时取最近一轮含该用例且有回答的 completed 运行。
        """
        settings = get_settings()
        cat = self._catalog()
        lg = self._ledger()
        judge = next((j for j in cat.list_judges() if j["judge_id"] == judge_id), None)
        if not judge:
            raise ValueError(f"裁判不存在：{judge_id}")
        key = judge["dim_id"].split("-", 1)[1] if "-" in judge["dim_id"] else judge["dim_id"]
        if key not in ("faithfulness", "completeness", "guardrail", "style"):
            raise ValueError(f"该裁判类型暂不支持试跑：{key}")

        case = cat.get_case(case_id)
        if not case:
            raise ValueError(f"用例不存在：{case_id}")
        cfg = case.get("judge") or {}
        if not cfg.get(key):
            raise ValueError(f"用例 {case_id} 未配置「{key}」判分，试跑无从判起")

        # 来源回答：指定运行优先；否则最近一轮含该用例且有回答的 completed 运行
        db = lg.db
        src_run_id: str
        row: dict
        if run_id:
            found = db.query_one(
                "SELECT * FROM eval_case_result WHERE run_id = ? AND case_id = ?",
                (run_id, case_id))
            if not found:
                raise ValueError(f"运行 {run_id} 中没有用例 {case_id} 的结果")
            src_run_id, row = run_id, found
        else:
            rows = db.query(
                "SELECT r.* FROM eval_case_result r JOIN eval_run e ON e.run_id = r.run_id"
                " WHERE r.case_id = ? AND e.status = 'completed'"
                " ORDER BY e.created_at DESC LIMIT 20", (case_id,))
            hit = next((r for r in rows if (r.get("answer") or "").strip()), None)
            if not hit:
                raise ValueError("该用例还没有可试跑的历史回答——先对它发起一次运行后再试")
            src_run_id, row = hit["run_id"], hit

        def _load(v: object, default: object) -> object:
            if isinstance(v, str):
                try:
                    return json.loads(v)
                except json.JSONDecodeError:
                    return default
            return v if v is not None else default

        fixture = {
            "answer": row.get("answer") or "",
            "toolCalls": _load(row.get("tool_calls"), []),
        }
        prev_all = _load(row.get("judge"), None) or {}

        base = datetime.now().strftime("%Y%m%d-%H%M%S")
        rj_dir = ensure_dir(
            settings.platform_cfg.data_root / "eval" / "rejudge" / f"{base}-{case_id}").resolve()
        case_path = rj_dir / "case.json"
        fixture_path = rj_dir / "fixture.json"
        judges_path = rj_dir / "judges.json"
        out_path = rj_dir / "out.json"
        case_path.write_text(
            json.dumps(case_to_harness_item(case), ensure_ascii=False, indent=1), encoding="utf-8")
        fixture_path.write_text(json.dumps(fixture, ensure_ascii=False), encoding="utf-8")
        judges_path.write_text(
            json.dumps(self._judges_map(), ensure_ascii=False, indent=1), encoding="utf-8")

        node = find_node()
        cmd = [node or "node", "scripts/eval/rejudge.mjs",
               f"--case-file={case_path}", f"--fixture-file={fixture_path}",
               f"--judges-file={judges_path}", f"--out={out_path}"]
        try:
            proc = subprocess.run(
                cmd, cwd=str(AGENT_DIR), capture_output=True, text=True,
                env=clean_child_env(), timeout=240)
        except subprocess.TimeoutExpired as e:
            raise TimeoutError("试跑超时（240s）——判分模型无响应，请重试") from e
        if not out_path.is_file():
            tail = ((proc.stderr or "") + (proc.stdout or ""))[-500:]
            raise RuntimeError(f"试跑执行失败（exit={proc.returncode}）：{tail}")
        verdict_all = json.loads(out_path.read_text(encoding="utf-8"))
        return {
            "judge_id": judge_id, "dim_key": key, "case_id": case_id,
            "source_run_id": src_run_id,
            "judge": verdict_all.get(key),
            "all": verdict_all,
            "prev": prev_all.get(key),
            "prev_run_id": src_run_id if prev_all.get(key) is not None else None,
            "dir": str(rj_dir),
        }

    # ── 工作线程 ────────────────────────────────────────────────────

    def _worker(self, run_id: str, mz: dict, judge: bool, runs_n: int) -> None:
        settings = get_settings()
        report_dir = ensure_dir(settings.platform_cfg.data_root / "eval" / "reports")
        # 绝对化：子进程 cwd=minicare-agent，相对路径会把报告写到错误位置（曾踩：ENOENT 崩溃）
        report_path = (report_dir / f"{run_id}.json").resolve()
        log_path = (report_dir / f"{run_id}.log").resolve()
        node = find_node()
        cmd = [node or "node", HARNESS_REL,
               f"--cases-file={mz['cases_path']}",
               f"--judges-file={mz['judges_path']}",
               "--emit-progress", f"--json={report_path}"]
        if not judge:
            cmd.append("--no-judge")
        if runs_n > 1:
            cmd.append(f"--runs={runs_n}")

        ledger = self._ledger()
        started_ms = (self._active or {}).get("started_ms") or int(time.time() * 1000)
        status = "completed"
        error: str | None = None

        try:
            self._proc = subprocess.Popen(
                cmd, cwd=str(AGENT_DIR),
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, bufsize=1, env=clean_child_env(),
            )
        except OSError as e:
            self._finish(run_id, ledger, status="failed", error=f"启动 harness 失败：{e}",
                         duration_ms=int(time.time() * 1000) - started_ms)
            return

        assert self._proc.stdout is not None
        log_f = log_path.open("w", encoding="utf-8")
        try:
            for raw in self._proc.stdout:
                log_f.write(raw)
                line = raw.rstrip("\n")
                if line.startswith(PROGRESS_PREFIX):
                    try:
                        msg = json.loads(line[len(PROGRESS_PREFIX):])
                    except json.JSONDecodeError:
                        continue
                    self._on_progress(msg)
                else:
                    self._append_log(line)
        finally:
            log_f.close()

        code = self._proc.wait()
        cancelled = bool(self._active and self._active.get("cancel_requested"))

        summary: dict | None = None
        cases: list[dict] = []
        if cancelled:
            status = "cancelled"
            cases = self._partial_cases()
            summary = {"total": len(cases), "passed": (self._active or {}).get("passed", 0),
                       "p0": None, "p0Pass": None, "censored": True,
                       "note": "已中止：仅覆盖已完成用例"}
        elif report_path.is_file():
            try:
                report = json.loads(report_path.read_text(encoding="utf-8"))
                cases = [self._norm_case(c) for c in report.get("cases", [])]
                summary = self._build_summary(cases, mz.get("dims"))
            except (OSError, json.JSONDecodeError) as e:
                status = "failed"
                error = f"解析报告失败：{e}"
        else:
            status = "failed"
            error = (f"harness 退出码 {code} 且未产出报告；"
                     f"日志尾部：{self._log_tail(12)}（完整日志：{log_path.name}）")

        if cases:
            ledger.insert_case_results(run_id, cases)
        self._finish(run_id, ledger, status=status, summary=summary, error=error,
                     duration_ms=int(time.time() * 1000) - started_ms)

    # ── 进度解析 ────────────────────────────────────────────────────

    def _on_progress(self, msg: dict) -> None:
        a = self._active
        if a is None:
            return
        t = msg.get("type")
        if t == "case-start":
            a["total"] = msg.get("total") or a["total"]
            a["current"] = msg.get("id")
            a["current_desc"] = msg.get("desc")
        elif t == "case-end":
            a["done"] = msg.get("idx") or (a["done"] + 1)
            a["total"] = msg.get("total") or a["total"]
            if msg.get("pass"):
                a["passed"] += 1
            rec = {"id": msg.get("id"), "pass": bool(msg.get("pass")),
                   "stage": msg.get("stage"), "ms": msg.get("ms")}
            a["recent"].append(rec)
            a["cases"][str(msg.get("id"))] = rec
            a["current"] = None
            a["current_desc"] = None
        elif t == "done":
            a["total"] = msg.get("total") or a["total"]
            a["passed"] = int(msg.get("passed", a["passed"]))

    def _append_log(self, line: str) -> None:
        a = self._active
        if a is None:
            return
        tail = a["log_tail"]
        tail.append(line)
        if len(tail) > LOG_TAIL_MAX:
            del tail[: len(tail) - LOG_TAIL_MAX]

    def _log_tail(self, n: int) -> str:
        return " / ".join(((self._active or {}).get("log_tail") or [])[-n:])

    # ── 归一化和汇总 ────────────────────────────────────────────────

    def _partial_cases(self) -> list[dict]:
        """中止时的部分结果（来自进度流，字段较精简）。"""
        out = []
        for cid, rec in ((self._active or {}).get("cases") or {}).items():
            out.append({"case_id": cid, "grp": None, "priority": None, "desc": None,
                        "pass": rec["pass"], "stage": rec.get("stage"), "detail": None,
                        "ms": rec.get("ms"), "tool_calls": [], "answer": None, "judge": None,
                        "trace_id": None, "force_finished": False})
        return out

    @staticmethod
    def _norm_case(c: dict) -> dict:
        """harness 报告行（camelCase）→ 表行（snake_case）。"""
        return {
            "case_id": c.get("id"), "grp": c.get("group"),
            "priority": c.get("priority"), "desc": c.get("desc"),
            "pass": bool(c.get("pass")), "stage": c.get("stage"),
            "detail": c.get("detail"), "ms": c.get("ms"),
            "tool_calls": c.get("toolCalls") or [],
            "answer": c.get("answer"), "judge": c.get("judge"),
            "trace_id": c.get("traceId"), "force_finished": bool(c.get("forceFinished")),
        }

    @staticmethod
    def _build_summary(cases: list[dict], dims: list[dict] | None = None) -> dict:
        p0 = [c for c in cases if c.get("priority") == "P0"]
        return {
            "total": len(cases),
            "passed": sum(1 for c in cases if c["pass"]),
            "p0": len(p0),
            "p0Pass": sum(1 for c in p0 if c["pass"]),
            "gate": compute_gate(cases, dims),
        }

    @staticmethod
    def _env_snapshot(judge: bool, *, task_id: str | None = None,
                      mz: dict | None = None) -> dict:
        snap: dict = {
            "agent_model": os.environ.get("MODEL_DEFAULT") or "deepseek-v4-flash",
            "judge_model": "deepseek-v4-pro" if judge else None,
            "db": _read_env_local("DB_NAME"),
            "git": _git_rev(),
            "harness": HARNESS_REL,
        }
        if task_id:
            snap["task_id"] = task_id
        if mz:
            snap["cases"] = {
                "count": mz["case_count"],
                "hash": mz["cases_hash"],
                "ids": [c for c in (mz.get("case_ids") or [])][:80],
            }
            snap["dims"] = [d["dim_id"] for d in mz.get("dims") or []]
            snap["judges"] = mz.get("judge_keys") or []
            # 全局运行身份（用例 ctx 用户键的真相源；空 = 未配置、回落用例自带值）
            snap["eval_ctx"] = mz.get("eval_ctx") or None
        return snap

    def _finish(self, run_id: str, ledger: EvalLedger, *, status: str,
                summary: dict | None = None, error: str | None = None,
                duration_ms: int | None = None) -> None:
        try:
            ledger.finish_run(run_id, status=status, summary=summary, error=error,
                              duration_ms=duration_ms)
        finally:
            with self._lock:
                if self._active and self._active["run_id"] == run_id:
                    self._active = None
                    self._proc = None


RUNNER = EvalRunner()
