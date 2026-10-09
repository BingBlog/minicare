"""检索质检运行台账（PRD-011 §4）：`kb_recall_run` / `kb_recall_case_result` 读写与对比。

表定义在 `platform_db.SCHEMA`（IF NOT EXISTS，随 PlatformDB 初始化自动建）。
JSON 列（env_snapshot / metrics / thresholds / delta / expected / topk / harmful）出参时解码。
与 Agent 测评台账（`agent_eval/ledger.py`）同范式：**台账为单一事实源**，
页面、发布闸门、趋势全部读这里；`recall-baseline.json` 仅为兼容镜像。
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from ..platform_db import PlatformDB
from .import_runner import localize_scope_label


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _dumps(v: Any) -> str | None:
    return json.dumps(v, ensure_ascii=False) if v is not None else None


def _loads(s: str | None, default: Any = None) -> Any:
    if not s:
        return default
    try:
        return json.loads(s)
    except Exception:  # noqa: BLE001 - 坏 JSON 不该把页面打挂
        return default


class RecallLedger:
    """检索质检台账（本机 SQLite，单用户）。"""

    def __init__(self, db: PlatformDB) -> None:
        self.db = db

    # ── 写 ────────────────────────────────────────────────────────────

    def create_run(self, *, run_id: str, scope: str, scope_label: str,
                   top_k: int, diag_depth: int, env_snapshot: dict) -> None:
        ts = now_iso()
        self.db.execute(
            "INSERT INTO kb_recall_run (run_id, scope, scope_label, top_k, diag_depth, status,"
            " started_at, env_snapshot, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (run_id, scope, scope_label, top_k, diag_depth, "running",
             ts, _dumps(env_snapshot), ts),
        )

    def run_exists(self, run_id: str) -> bool:
        return self.db.query_one("SELECT run_id FROM kb_recall_run WHERE run_id = ?", (run_id,)) is not None

    def insert_case_result(self, run_id: str, c: dict) -> None:
        """逐题结果（随跑随写：中止/崩溃也能保留已完成部分）"""
        self.db.execute(
            "INSERT INTO kb_recall_case_result (run_id, case_id, module, risk, question, verdict,"
            " attribution, first_hit_rank, top1_score, expected, topk, best_rank, harmful, ms)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (run_id, c.get("case_id"), c.get("module"), c.get("risk"), c.get("question"),
             c.get("verdict"), c.get("attribution"), c.get("first_hit_rank"),
             c.get("top1_score"), _dumps(c.get("expected")), _dumps(c.get("topk")),
             c.get("best_rank"), _dumps(c.get("harmful")), c.get("ms")),
        )

    def finish_run(self, run_id: str, *, status: str, metrics: dict | None = None,
                   thresholds: dict | None = None, passed: bool | None = None,
                   error: str | None = None, duration_ms: int | None = None) -> None:
        self.db.execute(
            "UPDATE kb_recall_run SET status=?, metrics=?, thresholds=?, passed=?, error=?,"
            " duration_ms=?, finished_at=? WHERE run_id=?",
            (status, _dumps(metrics), _dumps(thresholds),
             None if passed is None else (1 if passed else 0),
             error, duration_ms, now_iso(), run_id),
        )

    def set_delta(self, run_id: str, *, baseline_run_id: str | None, delta: dict | None) -> None:
        self.db.execute(
            "UPDATE kb_recall_run SET baseline_run_id=?, delta=? WHERE run_id=?",
            (baseline_run_id, _dumps(delta), run_id),
        )

    # ── 读 ────────────────────────────────────────────────────────────

    def list_runs(self, limit: int = 50) -> list[dict]:
        rows = self.db.query(
            "SELECT * FROM kb_recall_run ORDER BY created_at DESC LIMIT ?", (limit,))
        return [_run_out(r) for r in rows]

    def latest_run(self) -> dict | None:
        row = self.db.query_one("SELECT * FROM kb_recall_run ORDER BY created_at DESC LIMIT 1")
        return _run_out(row) if row else None

    def get_run(self, run_id: str, *, with_cases: bool = True) -> dict | None:
        row = self.db.query_one("SELECT * FROM kb_recall_run WHERE run_id = ?", (run_id,))
        if not row:
            return None
        out = _run_out(row)
        if with_cases:
            cases = self.db.query(
                "SELECT * FROM kb_recall_case_result WHERE run_id = ? ORDER BY id", (run_id,))
            out["cases"] = [_case_out(c) for c in cases]
        return out

    def last_completed(self, scope: str | None = None, *, exclude: str | None = None) -> dict | None:
        """上一次 completed 运行；scope 给定时按**精确 scope 串**匹配（同范围才可比）。"""
        sql = "SELECT * FROM kb_recall_run WHERE status = 'completed'"
        args: list[Any] = []
        if scope:
            sql += " AND scope = ?"
            args.append(scope)
        if exclude:
            sql += " AND run_id != ?"
            args.append(exclude)
        sql += " ORDER BY created_at DESC LIMIT 1"
        row = self.db.query_one(sql, tuple(args))
        return _run_out(row) if row else None

    # ── delta（US-07：与上一次同范围对比）─────────────────────────────

    def compute_delta(self, run_id: str) -> dict | None:
        """指标 delta + 用例级变化三类清单（新增未命中 / 已修复 / 持续未命中）。

        仅比较两轮**共同范围**里 answerable 的题；口径不一致（metric_version 不同）时
        照常出用例级清单（不受口径影响的硬事实），但页面/消费方要按 `metric_version_same`
        决定是否展示分数对比。
        """
        cur = self.get_run(run_id, with_cases=True)
        if not cur or not cur.get("cases"):
            return None
        prev = self.last_completed(cur["scope"], exclude=run_id)
        if not prev:
            return None
        prev = self.get_run(prev["run_id"], with_cases=True) or prev

        def hit_map(run: dict) -> dict[str, bool]:
            return {c["case_id"]: c["verdict"] == "hit" for c in run.get("cases") or []
                    if c["verdict"] in ("hit", "miss")}

        a = hit_map(cur)
        b = hit_map(prev)
        common = set(a) & set(b)

        m_cur = cur.get("metrics") or {}
        m_prev = prev.get("metrics") or {}
        metrics_delta: dict[str, float] = {}
        for key, scale in (("recall5", 100), ("recall10", 100), ("mrr", 1),
                           ("harmful_rate", 100), ("emergency_recall", 100)):
            if m_cur.get(key) is not None and m_prev.get(key) is not None:
                metrics_delta[key] = round((m_cur[key] - m_prev[key]) * scale, 2)

        return {
            "scope": cur["scope"],
            "prev_run_id": prev["run_id"],
            "prev_created_at": prev["created_at"],
            "prev_status": prev["status"],
            "metric_version_same": (
                (m_cur.get("metric_version") or "v2-tri-state")
                == (m_prev.get("metric_version") or "v2-tri-state")
            ),
            "metric_version_cur": m_cur.get("metric_version"),
            "metric_version_prev": m_prev.get("metric_version"),
            "metrics": metrics_delta,
            "new_miss": sorted(i for i in common if not a[i] and b[i]),
            "fixed": sorted(i for i in common if a[i] and not b[i]),
            "still_miss": sorted(i for i in common if not a[i] and not b[i]),
        }

    # ── 运维 ──────────────────────────────────────────────────────────

    def sweep_orphans(self) -> list[str]:
        """平台重启恢复：孤儿 running 运行（进程已不在）→ failed，已完成部分保留。"""
        rows = self.db.query("SELECT run_id FROM kb_recall_run WHERE status = 'running'")
        out = []
        for r in rows:
            self.finish_run(r["run_id"], status="failed",
                            error="平台重启，运行中断（已完成部分的逐题结果保留）")
            out.append(r["run_id"])
        return out


# ── 出参映射 ──────────────────────────────────────────────────────────


def _run_out(r: dict) -> dict:
    return {
        "run_id": r["run_id"], "scope": r["scope"],
        # 旧记录里存的是字母版（`模块 A·C`），出参统一转语义名（`模块 基础认知·诊断检测`）
        "scope_label": localize_scope_label(r["scope_label"]),
        "top_k": r["top_k"], "diag_depth": r["diag_depth"], "status": r["status"],
        "started_at": r["started_at"], "finished_at": r["finished_at"],
        "duration_ms": r["duration_ms"],
        "env_snapshot": _loads(r["env_snapshot"], {}),
        "metrics": _loads(r["metrics"]),
        "thresholds": _loads(r["thresholds"]),
        "passed": None if r["passed"] is None else bool(r["passed"]),
        "baseline_run_id": r.get("baseline_run_id"),
        "delta": _loads(r.get("delta")),
        "error": r["error"], "created_at": r["created_at"],
    }


def _case_out(c: dict) -> dict:
    return {
        "case_id": c["case_id"], "module": c["module"], "risk": c["risk"],
        "question": c["question"], "verdict": c["verdict"],
        "attribution": c["attribution"],
        "first_hit_rank": c["first_hit_rank"], "top1_score": c["top1_score"],
        "expected": _loads(c["expected"], {}), "topk": _loads(c["topk"], []),
        "best_rank": c["best_rank"], "harmful": _loads(c["harmful"], []),
        "ms": c["ms"],
    }


# ── 归因字典（runner / 缺口台账 / 前端共用口径）─────────────────────────

ATTRIBUTION_LABEL: dict[str, str] = {
    "ranked": "排序问题",
    "coverage": "覆盖缺口",
    "excluded": "切片/排除",
    "map_stale": "映射失效",
}
