"""知识缺口台账（US-12 / PRD §8.10）

未命中题要**区分三类归因**，否则会把人引向错误的动作：
  · `coverage_gap`   —— 库内确实没有相关内容 → 建议补录语料
  · `slice_excluded` —— gold 块存在但被屏蔽 → 应去「已屏蔽内容」恢复，**不是缺语料**
  · `gold_stale`     —— gold 映射指向的 kb_id 已不存在 → 应重映射，**不是质量下降**

同一主题 + 同一归因只留一条，`occurrences` 累加、优先级随之提升。
"""
from __future__ import annotations

from datetime import datetime

from .platform_db import PlatformDB, new_id


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


class GapLedger:
    def __init__(self, db: PlatformDB) -> None:
        self.db = db

    # ── 归因 ────────────────────────────────────────────────────────────
    def attribute(self, *, expected: list[str], results: list[dict], all_chunks: dict[str, dict],
                  gold_valid: bool = True) -> tuple[str, str]:
        """返回 (归因, 说明)"""
        if not gold_valid:
            return "gold_stale", "gold 映射指向的块已不存在"
        for kb_id in expected:
            c = all_chunks.get(kb_id)
            if c and (c.get("excluded") or c.get("disabled")):
                return "slice_excluded", f"gold 块 {kb_id} 存在但被屏蔽（应去「已屏蔽内容」恢复）"
        if expected and all(k in all_chunks for k in expected):
            top1 = results[0].get("score", 0) if results else 0
            return "coverage_gap", f"gold 块存在但未进 topK（top1 相似度 {top1:.2f}）"
        return "coverage_gap", "库内未见相关内容，疑似语料缺失"

    # ── 记录与聚合 ──────────────────────────────────────────────────────
    def record(self, *, theme: str, attribution: str, evidence: str = "",
               suggestion: str = "") -> dict:
        """同一 (theme, attribution) 累加 occurrences 并刷新 last_seen"""
        row = self.db.query_one(
            "SELECT * FROM kb_gap WHERE theme=? AND attribution=?", (theme, attribution)
        )
        if row:
            self.db.execute(
                "UPDATE kb_gap SET occurrences=occurrences+1, last_seen=?, evidence=COALESCE(?,evidence) "
                "WHERE gap_id=?",
                (_now(), evidence or None, row["gap_id"]),
            )
            if row["state"] == "closed":
                self.db.execute("UPDATE kb_gap SET state='open', close_reason=NULL WHERE gap_id=?",
                                (row["gap_id"],))
            return self.db.query_one("SELECT * FROM kb_gap WHERE gap_id=?", (row["gap_id"],))
        gap_id = new_id()
        self.db.upsert(
            "kb_gap", ["gap_id"],
            {"gap_id": gap_id, "theme": theme, "attribution": attribution, "occurrences": 1,
             "evidence": evidence, "suggestion": suggestion, "first_seen": _now(),
             "last_seen": _now(), "state": "open", "close_reason": None, "linked_doc_id": None},
        )
        return self.db.query_one("SELECT * FROM kb_gap WHERE gap_id=?", (gap_id,))

    def from_regression(self, result: dict) -> list[dict]:
        """把一次质检的未命中题写进缺口台账。

        PRD-011 起：优先使用运行期的**四类归因**（coverage / ranked / excluded / map_stale），
        映射到台账口径（ranked 是新增类：内容在库、只是没排上来，动作是"排查排序"而非"补语料"）。
        """
        out = []
        for miss in result.get("misses", []):
            theme = (miss.get("question") or "")[:24]
            attr = ATTR_TO_GAP.get(miss.get("attribution") or "")
            if attr:
                evidence = f"{miss.get('case_id')}：{miss.get('evidence') or ''}"
            else:
                attr, evidence = self.attribute(
                    expected=miss.get("expected", []), results=[], all_chunks={},
                    gold_valid=result.get("status") != "gold_stale",
                )
                evidence = f"{miss.get('case_id')}：{evidence}"
            out.append(self.record(theme=theme, attribution=attr,
                                   evidence=evidence, suggestion=_suggest(attr)))
        if result.get("status") == "gold_stale":
            for case_id in result.get("broken_cases", []):
                out.append(self.record(theme=f"gold 映射失效 · {case_id}", attribution="gold_stale",
                                       evidence="重切导致 kb_id 变化，需重映射",
                                       suggestion="重做 gold 映射（人工精修主块）"))
        return out

    def list(self, state: str | None = None) -> list[dict]:
        if state:
            return self.db.query("SELECT * FROM kb_gap WHERE state=? ORDER BY occurrences DESC", (state,))
        return self.db.query("SELECT * FROM kb_gap ORDER BY occurrences DESC")

    def stats(self) -> dict:
        rows = self.list()
        return {
            "total": len(rows),
            "open": len([r for r in rows if r["state"] == "open"]),
            "closed": len([r for r in rows if r["state"] == "closed"]),
            "deferred": len([r for r in rows if r["state"] == "deferred"]),
            "by_attribution": {a: len([r for r in rows if r["attribution"] == a])
                               for a in ("coverage_gap", "ranked", "slice_excluded", "gold_stale")},
        }

    def defer(self, gap_id: str, reason: str) -> dict | None:
        """暂不处理必须填原因（防止台账堆积无意义条目）"""
        if not (reason or "").strip():
            raise ValueError("标记为暂不处理必须填写原因")
        self.db.execute("UPDATE kb_gap SET state='deferred', close_reason=? WHERE gap_id=?",
                        (reason.strip(), gap_id))
        return self.db.query_one("SELECT * FROM kb_gap WHERE gap_id=?", (gap_id,))

    def close(self, gap_id: str, reason: str = "已补录语料") -> dict | None:
        self.db.execute("UPDATE kb_gap SET state='closed', close_reason=? WHERE gap_id=?",
                        (reason, gap_id))
        return self.db.query_one("SELECT * FROM kb_gap WHERE gap_id=?", (gap_id,))

    def link(self, gap_id: str, doc_id: str) -> dict | None:
        self.db.execute("UPDATE kb_gap SET linked_doc_id=? WHERE gap_id=?", (doc_id, gap_id))
        return self.db.query_one("SELECT * FROM kb_gap WHERE gap_id=?", (gap_id,))


# 质检运行期归因（PRD-011）→ 缺口台账口径的映射（单一定义处，router_quality 同用）
ATTR_TO_GAP: dict[str, str] = {
    "coverage": "coverage_gap",
    "ranked": "ranked",
    "excluded": "slice_excluded",
    "map_stale": "gold_stale",
}


def _suggest(attribution: str) -> str:
    return {
        "coverage_gap": "补录相关语料（登记 → 六步 → 发布）",
        "ranked": "排查排序（关键词 / 权重 / 切块粒度），内容已在库",
        "slice_excluded": "到「已屏蔽内容」恢复该块",
        "gold_stale": "重做 gold 映射",
    }.get(attribution, "人工判断")


def search_log_aggregate(db: PlatformDB, days: int = 7) -> list[dict]:
    """线上未命中 TOP（来源：远程 `kb_search_log`，US-13 的观察数据）

    远程库不在本机时返回空表 —— **不假装有数据**。
    """
    from .config import get_settings

    s = get_settings()
    try:
        import pymysql

        conn = pymysql.connect(host=s.db_host, port=s.db_port, user=s.db_user,
                               password=s.db_password, database=s.db_name, charset="utf8mb4")
    except Exception:      # noqa: BLE001 - 无远程库时静默返回空
        return []
    try:
        with conn.cursor() as cur:
            cur.execute("SHOW TABLES LIKE 'kb_search_log'")
            if cur.fetchone() is None:
                return []
            cur.execute(
                "SELECT query_text, COUNT(*) AS n FROM kb_search_log "
                "WHERE found=0 AND queried_at >= DATE_SUB(NOW(), INTERVAL %s DAY) "
                "GROUP BY query_text ORDER BY n DESC LIMIT 20",
                (days,),
            )
            return [{"query": r[0], "count": int(r[1])} for r in cur.fetchall()]
    except Exception:      # noqa: BLE001
        return []
    finally:
        conn.close()
