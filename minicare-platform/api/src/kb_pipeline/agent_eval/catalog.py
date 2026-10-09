"""测评台配置对象（TECH-021 §3）：用例 / 裁判 / 维度 / 任务的读写与选择。

DB 为运行时唯一源（S-03）；`runner` 物化执行配置时从这里取数（§4 执行链路）。
API 出参统一 snake_case；JSON 列在出参时解码为对象。
"""
from __future__ import annotations

import json
from typing import Any

from ..config import get_settings
from ..platform_db import PlatformDB
from .ledger import now_iso


def _d(v: Any) -> str | None:
    return json.dumps(v, ensure_ascii=False) if v is not None else None


def _l(s: str | None, default: Any = None) -> Any:
    if not s:
        return default
    try:
        return json.loads(s)
    except Exception:
        return default


def _tags_str(v: Any) -> str:
    if isinstance(v, list):
        return ",".join(str(t).strip() for t in v if str(t).strip())
    return str(v or "").strip().strip(",")


def _tags_list(s: str | None) -> list[str]:
    return [t for t in (s or "").split(",") if t]


class EvalCatalog:
    """四对象 CRUD。"""

    def __init__(self, db: PlatformDB) -> None:
        self.db = db

    # ══ 用例 ══════════════════════════════════════════════════════════

    def list_cases(self, *, grp: str | None = None, tag: str | None = None,
                   enabled: bool | None = None, q: str | None = None) -> list[dict]:
        sql = "SELECT * FROM eval_case WHERE 1=1"
        args: list[Any] = []
        if grp:
            sql += " AND grp = ?"
            args.append(grp)
        if tag:
            sql += " AND (',' || IFNULL(tags,'') || ',') LIKE ?"
            args.append(f"%,{tag},%")
        if enabled is not None:
            sql += " AND enabled = ?"
            args.append(1 if enabled else 0)
        if q:
            sql += " AND (case_id LIKE ? OR IFNULL(desc,'') LIKE ? OR message LIKE ?)"
            args += [f"%{q}%"] * 3
        sql += " ORDER BY sort_order, case_id"
        return [_case_out(r) for r in self.db.query(sql, tuple(args))]

    def get_case(self, case_id: str) -> dict | None:
        r = self.db.query_one("SELECT * FROM eval_case WHERE case_id = ?", (case_id,))
        return _case_out(r) if r else None

    def upsert_case(self, p: dict) -> dict:
        cid = str(p.get("case_id") or "").strip()
        if not cid:
            raise ValueError("case_id 不能为空")
        if not str(p.get("message") or "").strip():
            raise ValueError("message 不能为空")
        old = self.db.query_one("SELECT created_at FROM eval_case WHERE case_id = ?", (cid,))
        ts = now_iso()
        self.db.upsert("eval_case", ["case_id"], {
            "case_id": cid,
            "grp": str(p.get("grp") or "custom").strip(),
            "priority": p.get("priority") or None,
            "desc": p.get("desc") or None,
            "message": str(p.get("message")),
            "ctx_json": _d(p.get("ctx") or {}),
            "history_json": _d(p.get("history") or []),
            "expect_json": _d(p.get("expect") or {}),
            "judge_json": _d(p.get("judge")) if p.get("judge") is not None else None,
            "extra_json": _d(p.get("extra")) if p.get("extra") else None,
            "tags": _tags_str(p.get("tags")),
            "enabled": 1 if p.get("enabled", True) else 0,
            "sort_order": int(p.get("sort_order") or 0),
            "created_at": (old or {}).get("created_at") or ts,
            "updated_at": ts,
        })
        out = self.get_case(cid)
        assert out is not None
        return out

    def delete_case(self, case_id: str) -> bool:
        if not self.db.query_one("SELECT 1 AS x FROM eval_case WHERE case_id = ?", (case_id,)):
            return False
        self.db.execute("DELETE FROM eval_case WHERE case_id = ?", (case_id,))
        return True

    def select_cases(self, scope: dict | None) -> list[dict]:
        """按 scope 过滤启用用例。scope 键：all / groups / ids / tags / priorities。

        多个键同时给时取**交集**（AND）；同键列表内取并集（OR）；`all` 或全空 = 全部。
        """
        cases = self.list_cases(enabled=True)
        if not scope or scope.get("all"):
            return cases
        out = cases
        groups = scope.get("groups") or []
        ids = set(scope.get("ids") or [])
        tags = scope.get("tags") or []
        prs = set(scope.get("priorities") or [])
        if groups:
            out = [c for c in out if any(c["grp"].startswith(g) for g in groups)]
        if ids:
            out = [c for c in out if c["case_id"] in ids]
        if tags:
            out = [c for c in out if any(t in c["tags"] for t in tags)]
        if prs:
            out = [c for c in out if c["priority"] in prs]
        return out

    def export_cases(self) -> dict:
        """导出为 harness 兼容结构（供 `--cases-file` 与 git 留档）。"""
        items = [case_to_harness_item(c) for c in self.list_cases(enabled=True)]
        return {"cases": items, "count": len(items)}

    # ══ 裁判 ══════════════════════════════════════════════════════════

    def list_judges(self, *, enabled: bool | None = None) -> list[dict]:
        sql = "SELECT * FROM eval_judge WHERE 1=1"
        args: list[Any] = []
        if enabled is not None:
            sql += " AND enabled = ?"
            args.append(1 if enabled else 0)
        sql += " ORDER BY judge_id"
        return [_judge_out(r) for r in self.db.query(sql, tuple(args))]

    def upsert_judge(self, p: dict) -> dict:
        jid = str(p.get("judge_id") or "").strip()
        if not jid:
            raise ValueError("judge_id 不能为空")
        old = self.db.query_one("SELECT created_at FROM eval_judge WHERE judge_id = ?", (jid,))
        ts = now_iso()
        self.db.upsert("eval_judge", ["judge_id"], {
            "judge_id": jid,
            "dim_id": str(p.get("dim_id") or "").strip(),
            "name": str(p.get("name") or jid),
            "type": str(p.get("type") or "llm"),
            "model": p.get("model") or "deepseek-v4-pro",
            "temperature": float(p.get("temperature") or 0),
            "prompt": p.get("prompt"),
            "code_ref": p.get("code_ref"),
            "enabled": 1 if p.get("enabled", True) else 0,
            "created_at": (old or {}).get("created_at") or ts,
            "updated_at": ts,
        })
        row = self.db.query_one("SELECT * FROM eval_judge WHERE judge_id = ?", (jid,))
        return _judge_out(row)  # type: ignore[arg-type]

    # ══ 维度 ══════════════════════════════════════════════════════════

    def list_dimensions(self, *, enabled: bool | None = None,
                        level: str | None = None) -> list[dict]:
        sql = "SELECT * FROM eval_dimension WHERE 1=1"
        args: list[Any] = []
        if enabled is not None:
            sql += " AND enabled = ?"
            args.append(1 if enabled else 0)
        if level:
            sql += " AND level = ?"
            args.append(level)
        sql += " ORDER BY sort_order, dim_id"
        return [_dim_out(r) for r in self.db.query(sql, tuple(args))]

    def upsert_dimension(self, p: dict) -> dict:
        did = str(p.get("dim_id") or "").strip()
        if not did:
            raise ValueError("dim_id 不能为空")
        old = self.db.query_one("SELECT created_at FROM eval_dimension WHERE dim_id = ?", (did,))
        ts = now_iso()
        th = p.get("threshold")
        self.db.upsert("eval_dimension", ["dim_id"], {
            "dim_id": did,
            "name": str(p.get("name") or did),
            "level": str(p.get("level") or "case"),
            "grp": p.get("grp"),
            "description": p.get("description"),
            "score_type": str(p.get("score_type") or "boolean"),
            "threshold": (float(th) if th is not None and str(th) != "" else None),
            "weight": float(p.get("weight") or 1),
            "must_pass": 1 if p.get("must_pass") else 0,
            "enabled": 1 if p.get("enabled", True) else 0,
            "sort_order": int(p.get("sort_order") or 0),
            "created_at": (old or {}).get("created_at") or ts,
            "updated_at": ts,
        })
        row = self.db.query_one("SELECT * FROM eval_dimension WHERE dim_id = ?", (did,))
        return _dim_out(row)  # type: ignore[arg-type]

    # ══ 任务 ══════════════════════════════════════════════════════════

    def list_tasks(self) -> list[dict]:
        return [_task_out(r) for r in self.db.query(
            "SELECT * FROM eval_task ORDER BY created_at DESC")]

    def get_task(self, task_id: str) -> dict | None:
        r = self.db.query_one("SELECT * FROM eval_task WHERE task_id = ?", (task_id,))
        return _task_out(r) if r else None

    def upsert_task(self, p: dict) -> dict:
        tid = str(p.get("task_id") or "").strip()
        if not tid:
            raise ValueError("task_id 不能为空")
        if not str(p.get("name") or "").strip():
            raise ValueError("name 不能为空")
        if not p.get("scope"):
            raise ValueError("scope 不能为空")
        old = self.db.query_one("SELECT created_at FROM eval_task WHERE task_id = ?", (tid,))
        ts = now_iso()
        self.db.upsert("eval_task", ["task_id"], {
            "task_id": tid,
            "name": str(p.get("name")),
            "scope_json": _d(p.get("scope")) or "{}",
            "dims_json": _d(p.get("dims")) if p.get("dims") else None,
            "judge": 1 if p.get("judge", True) else 0,
            "runs_n": max(1, min(3, int(p.get("runs_n") or 1))),
            "note": p.get("note"),
            "enabled": 1 if p.get("enabled", True) else 0,
            "created_at": (old or {}).get("created_at") or ts,
            "updated_at": ts,
        })
        out = self.get_task(tid)
        assert out is not None
        return out

    def delete_task(self, task_id: str) -> bool:
        if not self.db.query_one("SELECT 1 AS x FROM eval_task WHERE task_id = ?", (task_id,)):
            return False
        self.db.execute("DELETE FROM eval_task WHERE task_id = ?", (task_id,))
        return True


# ── 出参映射 ──────────────────────────────────────────────────────────

# 用例 ctx 中的「用户信息」键（harness agent-runner 消费的三个）：来源为**全局配置**
# （pipeline.yaml → eval.ctx，「用户信息是全局设置的」）—— 用例无需设置，运行物化 /
# 导出时由 effective_ctx() 注入并覆盖；前端编辑器保存时也会把这三个键从用例中剥离。
USER_CTX_KEYS = ("userId", "familyId", "babyId")


def effective_ctx(case_ctx: dict | None = None) -> dict:
    """用例 ctx × 全局运行身份 → 实际下发给 harness 的 ctx。

    语义：
      · 全局配置（eval.ctx）里的**非空键覆盖用例内同名键**（用例里的用户信息一律让位）；
      · 全局未配置（全空）时回落用例自带值（兼容旧数据 / 未配置环境）；
      · 非用户键（未来扩展）按用例原样保留。
    """
    g = {k: v for k, v in (get_settings().eval_cfg.ctx or {}).items() if str(v or "").strip()}
    case_ctx = dict(case_ctx or {})
    if not g:
        return case_ctx
    out = {k: v for k, v in case_ctx.items() if k not in USER_CTX_KEYS}
    out.update(g)
    return out


def case_to_harness_item(c: dict) -> dict:
    """eval_case 出参 → harness case 结构（物化 / 导出共用）。

    ctx 走 `effective_ctx()`：全局运行身份在此注入（行为上"用户信息全局设置"的落点）。
    """
    item: dict = {
        "id": c["case_id"], "group": c["grp"], "priority": c["priority"],
        "desc": c["desc"], "message": c["message"],
        "ctx": effective_ctx(c.get("ctx")), "history": c["history"], "expect": c["expect"],
    }
    if c.get("judge") is not None:
        item["judge"] = c["judge"]
    if c.get("extra"):
        item.update(c["extra"])
    return item


def _case_out(r: dict) -> dict:
    return {
        "case_id": r["case_id"], "grp": r["grp"], "priority": r["priority"],
        "desc": r["desc"], "message": r["message"],
        "ctx": _l(r["ctx_json"], {}), "history": _l(r["history_json"], []),
        "expect": _l(r["expect_json"], {}), "judge": _l(r["judge_json"]),
        "extra": _l(r["extra_json"]),
        "tags": _tags_list(r["tags"]),
        "enabled": bool(r["enabled"]), "sort_order": r["sort_order"],
        "created_at": r["created_at"], "updated_at": r["updated_at"],
    }


def _judge_out(r: dict) -> dict:
    return {
        "judge_id": r["judge_id"], "dim_id": r["dim_id"], "name": r["name"],
        "type": r["type"], "model": r["model"], "temperature": r["temperature"],
        "prompt": r["prompt"], "code_ref": r["code_ref"], "enabled": bool(r["enabled"]),
        "created_at": r["created_at"], "updated_at": r["updated_at"],
    }


def _dim_out(r: dict) -> dict:
    return {
        "dim_id": r["dim_id"], "name": r["name"], "level": r["level"], "grp": r["grp"],
        "description": r["description"], "score_type": r["score_type"],
        "threshold": r["threshold"], "weight": r["weight"], "must_pass": bool(r["must_pass"]),
        "enabled": bool(r["enabled"]), "sort_order": r["sort_order"],
        "created_at": r["created_at"], "updated_at": r["updated_at"],
    }


def _task_out(r: dict) -> dict:
    return {
        "task_id": r["task_id"], "name": r["name"],
        "scope": _l(r["scope_json"], {}), "dims": _l(r["dims_json"]),
        "judge": bool(r["judge"]), "runs_n": r["runs_n"], "note": r["note"],
        "enabled": bool(r["enabled"]),
        "created_at": r["created_at"], "updated_at": r["updated_at"],
    }
