"""线上 trace → 测评用例（PRD-015 / TECH-032）：读取编排 + 处置台账 + 沉淀/忽略/恢复/查重。

三块：
  · `TraceSource` —— spawn 只读脚本 `minicare-agent/scripts/trace-triage.mjs`（`@@TRIAGE@@` 协议），
    进程编排复用 `runner` 的 `find_node / clean_child_env`（与观测同步同构）；
  · `TriageLedger` —— platform.db `eval_trace_triage`（三态：converted / ignored；**无记录 = 未处理**）；
  · 业务函数 —— `list_traces`（合并管线）/ `get_trace` / `convert` / `ignore` / `reopen` / `duplicate_check`。

边界（TECH-032）：trace 原始数据不落平台库（实时只读）；沉淀产出 = 标准 `eval_case`
（`source_json` 挂 `{type:'trace'}` 来源链；期望行为要点 → `judge.completeness.goldenPoints`，
判分引擎 `scoring.py` 直接消费）。
"""
from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime

from ..config import get_settings
from ..logger import get_logger
from ..platform_db import PlatformDB
from .catalog import EvalCatalog
from .runner import AGENT_DIR, clean_child_env, find_node

log = get_logger(__name__)

TRIAGE_PREFIX = "@@TRIAGE@@ "
LIST_TIMEOUT_S = 30.0
DETAIL_TIMEOUT_S = 15.0

# 忽略原因：存英文稳定键，界面映射中文（平台"不裸露代码值"规约）
IGNORE_REASONS = {
    "duplicate": "重复问题",
    "unrepresentative": "不具代表性",
    "anomaly": "数据异常",
    "sensitive": "数据敏感",
    "other": "其他",
}

GROUPS = {"l0", "l1", "l2", "l3", "l4", "r1"}
PRIORITIES = {"P0", "P1", "P2"}
MAX_POINTS = 20


class TraceSourceError(RuntimeError):
    """脚本读取失败（路由层转 502；`not_found=True` 转 404）。"""

    def __init__(self, message: str, *, not_found: bool = False) -> None:
        super().__init__(message)
        self.not_found = not_found


class TraceConflict(RuntimeError):
    """状态冲突（已沉淀/已忽略等；路由层转 409）。"""


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _iso_ms(ms) -> str | None:
    try:
        return datetime.fromtimestamp(float(ms) / 1000).astimezone().isoformat(timespec="seconds")
    except (TypeError, ValueError, OSError):
        return None


def _langfuse_url(trace_id: str) -> str:
    base = (get_settings().obs_langfuse_public_url or "http://localhost:3100").rstrip("/")
    return f"{base}/trace/{trace_id}"


# ── 读取（脚本编排）─────────────────────────────────────────────────────


class TraceSource:
    """`trace-triage.mjs` 的 spawn 封装（只读；解析 `@@TRIAGE@@` 协议行）。"""

    def _run(self, args: list[str], timeout: float) -> dict:
        script = AGENT_DIR / "scripts" / "trace-triage.mjs"
        node = find_node()
        if not node:
            raise TraceSourceError("未找到 Node 可执行文件（读取脚本依赖 Node 运行）")
        if not script.is_file():
            raise TraceSourceError(f"读取脚本不存在：{script}")
        try:
            proc = subprocess.run(
                [node, str(script), *args],
                capture_output=True, text=True, timeout=timeout,
                env=clean_child_env(), cwd=str(AGENT_DIR),
            )
        except subprocess.TimeoutExpired as e:
            raise TraceSourceError(f"读取超时（>{timeout:.0f}s），请稍后重试") from e
        payload = None
        for line in (proc.stdout or "").splitlines():
            if line.startswith(TRIAGE_PREFIX):
                try:
                    payload = json.loads(line[len(TRIAGE_PREFIX):])
                except json.JSONDecodeError:  # noqa: PERF203 - 协议行损坏时继续找下一行
                    continue
        if payload is None:
            tail = ((proc.stdout or "") + (proc.stderr or "")).strip()[-300:]
            raise TraceSourceError(f"读取脚本输出异常（exit={proc.returncode}）：{tail or '（空）'}")
        if not payload.get("ok"):
            err = str(payload.get("error") or "")
            detail = str(payload.get("detail") or "")
            if err == "trace_not_found":
                raise TraceSourceError("该 trace 不存在（可能超出读取窗口）", not_found=True)
            text = {
                "missing_tcb_credentials": "FlexDB 凭证未配置（检查 agent 侧 TCB 凭证）",
                "flexdb_unreachable": "FlexDB 不可达（网络或凭证异常）",
                "bad_args": "读取参数错误",
            }.get(err, f"读取失败：{err or '未知错误'}")
            raise TraceSourceError(f"{text}{f'（{detail[:120]}）' if detail else ''}")
        return payload.get("data") or {}

    def list(self, days: int = 7) -> dict:
        return self._run(["--mode", "list", "--days", str(days)], LIST_TIMEOUT_S)

    def detail(self, trace_id: str) -> dict:
        return self._run(["--mode", "detail", "--trace", trace_id], DETAIL_TIMEOUT_S)


# ── 台账 ────────────────────────────────────────────────────────────────


def _db() -> PlatformDB:
    return PlatformDB(get_settings().platform_cfg.db_path)


class TriageLedger:
    """`eval_trace_triage` 的读写（无记录 = 未处理；恢复 = 删行）。"""

    def __init__(self, db: PlatformDB | None = None) -> None:
        self.db = db or _db()

    def get(self, trace_id: str) -> dict | None:
        return self.db.query_one("SELECT * FROM eval_trace_triage WHERE trace_id = ?", (trace_id,))

    def states_for(self, trace_ids: list[str]) -> dict[str, dict]:
        if not trace_ids:
            return {}
        marks = ",".join("?" * len(trace_ids))
        rows = self.db.query(
            f"SELECT * FROM eval_trace_triage WHERE trace_id IN ({marks})", tuple(trace_ids)
        )
        return {r["trace_id"]: r for r in rows}

    def set(self, trace_id: str, state: str, *, case_id: str | None = None,
            reason: str | None = None, note: str | None = None) -> None:
        ts = _now_iso()
        old = self.get(trace_id)
        self.db.upsert("eval_trace_triage", ["trace_id"], {
            "trace_id": trace_id,
            "state": state,
            "case_id": case_id,
            "reason": reason,
            "note": note,
            "created_at": (old or {}).get("created_at") or ts,
            "updated_at": ts,
        })

    def delete(self, trace_id: str) -> bool:
        if not self.get(trace_id):
            return False
        self.db.execute("DELETE FROM eval_trace_triage WHERE trace_id = ?", (trace_id,))
        return True


def _triage_out(row: dict | None) -> dict:
    if not row:
        return {"state": "untreated", "case_id": None, "reason": None, "note": None, "updated_at": None}
    return {
        "state": row.get("state"),
        "case_id": row.get("case_id"),
        "reason": row.get("reason"),
        "note": row.get("note"),
        "updated_at": row.get("updated_at"),
    }


# ── 业务 ────────────────────────────────────────────────────────────────


def list_traces(*, days: int = 7, state: str = "untreated", q: str | None = None,
                limit: int = 20, offset: int = 0) -> dict:
    """候选队列：脚本读取 → 台账合并 → 状态/关键词筛选 → 分页（counts 为筛选前口径）。"""
    days = min(max(int(days or 7), 1), 90)
    data = TraceSource().list(days)
    items = list(data.get("items") or [])
    marks = TriageLedger().states_for([i.get("traceId") for i in items if i.get("traceId")])
    for it in items:
        row = marks.get(it.get("traceId"))
        it["state"] = (row or {}).get("state") or "untreated"
        it["case_id"] = (row or {}).get("case_id")
        it["reason"] = (row or {}).get("reason")
    counts = {
        "total": len(items),
        "untreated": sum(1 for i in items if i["state"] == "untreated"),
        "converted": sum(1 for i in items if i["state"] == "converted"),
        "ignored": sum(1 for i in items if i["state"] == "ignored"),
    }
    if state in ("untreated", "converted", "ignored"):
        items = [i for i in items if i["state"] == state]
    keyword = (q or "").strip().lower()
    if keyword:
        items = [i for i in items if keyword in str(i.get("message") or "").lower()]
    limit = min(max(int(limit or 20), 1), 100)
    offset = max(int(offset or 0), 0)
    return {
        "items": items[offset:offset + limit],
        "counts": counts,
        "filtered": len(items),
        "window": data.get("window") or {"days": days},
    }


def get_trace(trace_id: str) -> dict:
    """单条详情：脚本 detail + 台账处置 + Langfuse 深链接。"""
    data = TraceSource().detail(trace_id)
    row = TriageLedger().get(trace_id)
    return {
        "trace": data.get("trace") or {},
        "observationsBrief": data.get("observationsBrief") or [],
        "sessionContext": data.get("sessionContext") or [],
        "langfuseUrl": _langfuse_url(trace_id),
        "triage": _triage_out(row),
    }


def _next_trace_case_id(db: PlatformDB) -> str:
    """`T-{seq}` 独立系列（PRD-015 D-06）。单用户本机无并发；convert 侧带防撞循环。"""
    rows = db.query("SELECT case_id FROM eval_case WHERE case_id LIKE 'T-%'")
    maxn = 0
    for r in rows:
        m = re.fullmatch(r"T-(\d+)", str(r.get("case_id") or ""))
        if m:
            maxn = max(maxn, int(m.group(1)))
    return f"T-{maxn + 1:02d}"


def convert(trace_id: str, payload: dict) -> dict:
    """沉淀为用例：校验 → 读 trace → 组装标准 eval_case → 台账置 converted。"""
    p = payload or {}
    db = _db()
    ledger = TriageLedger(db)
    row = ledger.get(trace_id)
    if row and row.get("state") == "converted" and row.get("case_id"):
        raise TraceConflict(f"该 trace 已沉淀为 {row['case_id']}（如需重做请先恢复为未处理）")

    data = TraceSource().detail(trace_id)
    trace = data.get("trace") or {}

    title = str(p.get("title") or "").strip()
    grp = str(p.get("grp") or "").strip()
    priority = str(p.get("priority") or "P1").strip().upper()
    points = [s.strip() for s in str(p.get("expectedPoints") or "").splitlines() if s.strip()]
    if not title:
        raise ValueError("请填写标题")
    if grp not in GROUPS:
        raise ValueError("请选择分组（l0~l4 / r1）")
    if priority not in PRIORITIES:
        raise ValueError("优先级仅支持 P0 / P1 / P2")
    if not points:
        raise ValueError("请填写期望行为要点（至少一条）")
    if len(points) > MAX_POINTS:
        raise ValueError(f"期望行为要点最多 {MAX_POINTS} 条")

    original = str((trace.get("input") or {}).get("message") or "")
    override = p.get("messageOverride")
    override_s = str(override).strip() if override is not None else ""
    message = override_s or original
    if not message:
        raise ValueError("问题文本为空（请填写清洗后的问题）")
    message_edited = bool(override_s and override_s != original)

    tags = ["realdata"]
    if p.get("joinRegression"):
        tags.append("regression")
    for t in (p.get("tags") or []):
        t = str(t).strip()
        if t and t not in tags:
            tags.append(t)

    source = {
        "type": "trace",
        "trace_id": trace_id,
        "started_at": _iso_ms(trace.get("startedAt")),
        "langfuse_url": _langfuse_url(trace_id),
        "messageEdited": message_edited,
    }

    catalog = EvalCatalog(db)
    cid = _next_trace_case_id(db)
    for _ in range(5):  # 防撞（理论并发/手工建号兜底；upsert 对既有号是覆盖，必须先避让）
        if not catalog.get_case(cid):
            break
        cid = _next_trace_case_id(db)
    case = catalog.upsert_case({
        "case_id": cid,
        "message": message,
        "desc": title,
        "grp": grp,
        "priority": priority,
        "expect": {},
        "judge": {"completeness": {"goldenPoints": points}},
        "tags": tags,
        "source": source,
        "enabled": True,
    })
    ledger.set(trace_id, "converted", case_id=case["case_id"])
    log.info("trace-triage: converted %s -> %s", trace_id[:8], case["case_id"])
    return {"ok": True, "case_id": case["case_id"], "case": case,
            "triage": _triage_out(ledger.get(trace_id))}


def ignore(trace_id: str, payload: dict) -> dict:
    """标记忽略：原因枚举 + 「其他」备注必填；已沉淀的不可忽略。"""
    p = payload or {}
    reason = str(p.get("reason") or "").strip()
    note = str(p.get("note") or "").strip()
    if reason not in IGNORE_REASONS:
        raise ValueError("请选择忽略原因")
    if reason == "other" and not note:
        raise ValueError("选择「其他」时请填写备注")
    ledger = TriageLedger()
    row = ledger.get(trace_id)
    if row and row.get("state") == "converted" and row.get("case_id"):
        raise TraceConflict(f"该 trace 已沉淀为 {row['case_id']}，请先处理用例侧")
    ledger.set(trace_id, "ignored", reason=reason, note=note or None)
    return {"ok": True, "triage": _triage_out(ledger.get(trace_id))}


def reopen(trace_id: str) -> dict:
    """恢复为未处理（删台账记录；用例侧另行处理）。"""
    if not TriageLedger().delete(trace_id):
        raise ValueError("该 trace 未曾处置，无需恢复")
    return {"ok": True, "triage": _triage_out(None)}


# ── 查重（P1 精确级：归一化后 完全相等 / 互为包含）────────────────────────

_PUNCT_MAP = str.maketrans({
    "，": ",", "。": ".", "！": "!", "？": "?", "；": ";", "：": ":", "、": ",",
    "（": "(", "）": ")", "“": '"', "”": '"', "‘": "'", "’": "'",
    "～": "~", "…": "...", "·": "", "　": " ",
})


def _norm(s: str) -> str:
    return re.sub(r"\s+", "", s or "").translate(_PUNCT_MAP).lower()


def duplicate_check(message: str) -> dict:
    """与启用中的存量用例比对：exact（完全相等）/ contains（互为包含）；纯提示不阻塞。"""
    target = _norm(message or "")
    if not target:
        return {"exact": [], "contains": [], "samples": []}
    cases = EvalCatalog(_db()).list_cases(enabled=True)
    exact: list[str] = []
    contains: list[str] = []
    by_id: dict[str, dict] = {}
    for c in cases:
        cn = _norm(str(c.get("message") or ""))
        if not cn:
            continue
        cid = str(c.get("case_id") or "")
        if cn == target:
            exact.append(cid)
            by_id[cid] = c
        elif target in cn or cn in target:
            contains.append(cid)
            by_id[cid] = c
    order = (exact + contains)[:3]
    return {
        "exact": exact[:5],
        "contains": contains[:5],
        "samples": [{"case_id": cid, "message": str(by_id[cid].get("message") or "")[:120]} for cid in order],
    }
