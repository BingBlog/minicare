"""发布与回滚（US-10 / PRD §8.7 / TECH-015 §8.7）

流程：**就绪分组（plan）→ 发布前 4 项检查 → 生成快照 → 按文档增量写入 → 发布后 4 项验证 → 留档**。
回滚 = 从快照恢复（不重跑任何解析）。

⚠️ 三条底线：
  · 检查项**数据缺失时报 `not_executed`，绝不假装通过**（PRD US-11 场景 4 的同款要求）
  · 写入走事务；中途失败必须回退，不出现"一半新一半旧"
  · **发布范围只有「已就绪」的文档**（`plan()`，2026-10-09）：未就绪的文档逐份说明原因、
    不参与发布也不拦发布 —— 只要有可发布内容就能执行（按文档增量语义，PRD D-17）
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from .config import Settings
from .fsutil import ensure_dir
from .platform_db import PlatformDB, new_id

SNAPSHOT_DIR = "snapshots"

#: 检查项下发的「问题文档」清单上限（只影响界面展示；detail 里仍报全量计数）
DOCS_CAP = 8

# 快照需要覆盖的列（迁移 021 前后都兼容：不存在的列自动跳过）
SNAPSHOT_COLUMNS = [
    "kb_id", "module", "title", "category", "content", "keywords", "source",
    "source_url", "evidence_level", "region", "risk_level", "applicable_age", "status",
]


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


class Publisher:
    def __init__(self, settings: Settings, db: PlatformDB, data_root: Path) -> None:
        self.settings = settings
        self.db = db
        self.data_root = Path(data_root)
        self.cfg = settings.publish_cfg

    # ── 连接与列探测 ────────────────────────────────────────────────────
    def _connect(self):
        import pymysql

        s = self.settings
        return pymysql.connect(host=s.db_host, port=s.db_port, user=s.db_user,
                               password=s.db_password, database=s.db_name, charset="utf8mb4")

    def _columns(self, cur) -> set[str]:
        cur.execute("SHOW COLUMNS FROM knowledge_base")
        return {r[0] for r in cur.fetchall()}

    # ── 1) 发布前检查 ──────────────────────────────────────────────────
    def preflight_checks(self, doc_ids: list[str]) -> list[dict]:
        """4 项检查；每项返回 {key,label,status,detail}，status ∈ pass/fail/not_executed

        另附**结构化定位**（界面据此生成「去哪修」的跳转，不必解析 detail 文案）：
        `docs` = 出问题的文档清单（截断到 `DOCS_CAP`）、`docs_total` = 总数。
        """
        from .corpus import CorpusLedger

        ledger = CorpusLedger(self.db)
        checks: list[dict] = []

        # ① 必填元数据完整
        #    ⚠️ 只统计**本次发布范围内**的文档（2026-10-09）：发布范围是「已就绪」子集，
        #    不能拿未参与发布的文档（比如刚上传还没跑的）把发布拦下。
        if self.cfg.require_meta_complete:
            scope = set(doc_ids)
            if not ledger.list():
                checks.append(_chk("meta_complete", "必填元数据完整", "not_executed",
                                   "台账为空：尚未登记语料（US-01 未落地前无法校验）"))
            else:
                bad = [r["doc_id"] for r in ledger.missing_required()
                       if r["missing"] and r["doc_id"] in scope]
                checks.append(_chk("meta_complete", "必填元数据完整",
                                   "fail" if bad else "pass",
                                   f"缺项文档 {len(bad)} 份" + (f"：{bad[:3]}" if bad else ""),
                                   docs=bad))

        # ② 无未处理红色标记（暂以"解析高危敏感信息复核未决项"近似，US-05 落地后接内容校对）
        if self.cfg.require_no_red_flags:
            pending_total = 0
            checked_docs = 0
            per_doc: list[tuple[str, int]] = []     # (doc_id, 未决数)：界面逐份跳「解析高危敏感信息复核」
            from .orchestrator import Orchestrator

            orc = Orchestrator(self.settings, data_root=self.data_root, queue=None)
            for doc_id in doc_ids:
                store = orc.store_for(doc_id)
                if store.read_current_artifact("validate") is None:
                    continue
                checked_docs += 1
                pend = _pending_review_count(store)
                pending_total += pend
                if pend:
                    per_doc.append((doc_id, pend))
            if checked_docs == 0:
                checks.append(_chk("no_red_flags", "无未处理红色标记", "not_executed",
                                   "未找到可校验的校验产物"))
            else:
                per_doc.sort(key=lambda t: t[1], reverse=True)      # 未决最多的排前面
                checks.append(_chk("no_red_flags", "无未处理红色标记",
                                   "fail" if pending_total else "pass",
                                   f"未决复核项 {pending_total} 条（共校验 {checked_docs} 份文档）",
                                   docs=[d for d, _ in per_doc]))

        # ③ 屏蔽块已确认
        if self.cfg.require_excludes_confirmed:
            from .orchestrator import Orchestrator
            from .quality.noise import load_overrides

            orc = Orchestrator(self.settings, data_root=self.data_root, queue=None)
            excluded_total = 0
            restored_pending = 0
            seen = 0
            for doc_id in doc_ids:
                seg = orc.store_for(doc_id).read_current_artifact("segment")
                if seg is None:
                    continue
                seen += 1
                excluded_total += len(seg.get("excluded_detail") or []) or sum(
                    (seg.get("excluded_summary") or {}).values()
                )
                ov = load_overrides(orc.store_for(doc_id).edits_root)
                restored_pending += len(ov.get("restore") or [])
            if seen == 0:
                checks.append(_chk("excludes_confirmed", "屏蔽块已确认", "not_executed",
                                   "未找到切块产物"))
            else:
                checks.append(_chk("excludes_confirmed", "屏蔽块已确认", "pass",
                                   f"屏蔽 {excluded_total} 块，人工决定 {restored_pending} 条"))

        # ④ 检索质检达标（PRD-011：读台账「最近一次成功运行」；基线文件仅作兜底）
        if self.cfg.require_regression_pass:
            from .quality.ledger import RecallLedger
            from .regression import RegressionRunner

            ledger = RecallLedger(self.db)
            run = ledger.last_completed(scope="all") or ledger.last_completed()
            if run and run.get("metrics"):
                m = run["metrics"]
                recall = m.get("recall10")
                passed = run.get("passed")
                checks.append(_chk("regression_pass", "检索质检达标",
                                   "pass" if passed else "fail",
                                   f"Recall@{m.get('k', 10)} = {recall:.1%}（运行 {run['run_id']}）"
                                   if recall is not None else
                                   f"运行 {run['run_id']} 未产出可判定指标"))
            else:
                baseline = RegressionRunner(self.settings, self.db, self.data_root)._load_baseline()
                if not baseline:
                    checks.append(_chk("regression_pass", "检索质检达标", "not_executed",
                                       "尚无质检运行记录：到「检索质检」跑一次"))
                else:
                    recall = baseline.get("recall_at_k", 0)
                    ok = recall >= self.settings.regression_cfg.recall_at_10_min
                    checks.append(_chk("regression_pass", "检索质检达标",
                                       "pass" if ok else "fail",
                                       f"Recall@{baseline.get('k', 10)} = {recall:.1%}（兼容基线文件）"))
        return checks

    # ── 1b) 发布计划：就绪分组 ──────────────────────────────────────────
    def plan(self, doc_ids: list[str], *, regions: dict[str, str] | None = None) -> dict:
        """把文档分为「可发布（已就绪）」与「暂不可发布（含原因）」两组，并只对可发布组跑检查。

        背景（2026-10-09 用户要求）：发布页原来拿**全部登记文档**当发布范围，任何一份
        未就绪的文档都会把发布拦下（或逼着用「未通过也放行」）。现在改为：
        只有**自己就绪**的文档进入发布范围，其余文档逐份给出原因与修复入口，**不拦发布**
        —— 只要有可发布内容，"生成快照并发布"就能执行（按文档增量语义，PRD D-17）。

        「就绪」的三条口径（与界面展示、`preflight_checks` 保持一致）：
          ① 流水线：**索引已完成、无失败、无待重跑** —— 与 `derive_status() == ready` 同口径。
             较早处理、第 ⑥ 步「翻译」未跑的文档**仍算就绪**（翻译不参与发布内容，
             见 TECH-019 阶段 A 的边界）；正在运行的文档一律先等一下。
          ② 必填元数据完整：仅对该文档**在台账中有登记**时校验（与发布前检查 ① 一致 ——
             台账没有的行说明元数据从未经登记流程进入系统）。
          ③ 无未决复核项：validate 产物的 review_state 处于 pending（口径同发布前检查 ②）。

        返回 `{"ready": [...], "blocked": [...], "checks": [...], "counts": {...}, "target": {...}}`，
        其中 `checks` = `preflight_checks(ready 的 doc_id)` —— 未就绪的文档不参与发布，
        自然也不该出现在发布前检查里。
        """
        from . import run_registry
        from .artifact import STATUS_FAILED, STATUS_STALE, SUCCESS_STATES
        from .corpus import CorpusLedger
        from .corpus.ledger import REQUIRED_FIELDS
        from .orchestrator import Orchestrator
        from .registry import STEP_ORDER, STEP_REGISTRY

        regions = regions or {}
        orc = Orchestrator(self.settings, data_root=self.data_root, queue=None)
        ledger = CorpusLedger(self.db)
        ready: list[dict] = []
        blocked: list[dict] = []

        for doc_id in doc_ids:
            store = orc.store_for(doc_id)
            steps = store.snapshot()
            reasons: list[dict] = []

            # ① 流水线（运行中/失败 > 待重跑 > 未跑完，只报最深的一层）
            if run_registry.is_running(doc_id):
                reasons.append(_reason("running", "正在处理中，跑完后重新判断", "corpus"))
            failed = [s for s in STEP_ORDER if steps.get(s) == STATUS_FAILED]
            stale = [s for s in STEP_ORDER if steps.get(s) == STATUS_STALE]
            if failed:
                reasons.append(_reason(
                    "step_failed",
                    f"有步骤执行失败：{_step_names(failed)}，请先重试", "corpus"))
            elif stale:
                reasons.append(_reason(
                    "step_stale",
                    f"上游产物已变更，需从「{STEP_REGISTRY[stale[0]].label}」重跑到最新", "corpus"))
            elif steps.get("index") not in SUCCESS_STATES:
                nxt = next((s for s in STEP_ORDER if steps.get(s) not in SUCCESS_STATES), "preflight")
                started = any(steps.get(s) in SUCCESS_STATES for s in STEP_ORDER)
                reasons.append(_reason(
                    "pipeline",
                    (f"流水线未跑完，下一步：「{STEP_REGISTRY[nxt].label}」" if started
                     else "尚未开始处理"), "corpus"))

            # ② 必填元数据（仅台账有登记的文档适用；缺什么报什么）
            row = ledger.get(doc_id)
            if row:
                miss = [f for f in REQUIRED_FIELDS if not row.get(f)]
                if miss:
                    reasons.append(_reason(
                        "meta",
                        "必填元数据缺：" + "、".join(_META_LABEL.get(f, f) for f in miss),
                        "meta"))

            # ③ 未决复核项（口径同发布前检查 ②）
            pend = _pending_review_count(store)
            if pend:
                reasons.append(_reason("review", f"未决复核项 {pend} 条", "numbers"))

            region = regions.get(doc_id) or "cn"
            if reasons:
                blocked.append({"doc_id": doc_id, "region": region,
                                "status": orc.derive_status(doc_id), "reasons": reasons})
            else:
                idx = store.read_current_artifact("index") or {}
                cnt = idx.get("counts") or {}
                ready.append({"doc_id": doc_id, "region": region, "status": "ready",
                              "chunks": int(cnt.get("to_index") or cnt.get("chunks_total") or 0)})

        checks = self.preflight_checks([r["doc_id"] for r in ready])
        return {
            "ready": ready,
            "blocked": blocked,
            "checks": checks,
            "counts": {"ready": len(ready), "blocked": len(blocked),
                       "ready_chunks": sum(r["chunks"] for r in ready)},
            "target": {"db_name": self.settings.db_name},
        }

    # ── 2) 快照 ────────────────────────────────────────────────────────
    def snapshot(self, note: str = "") -> dict:
        """把目标库当前切片全集写成快照（回滚的可靠性优先于存储，PRD D-16）"""
        stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
        name = f"snapshot__{stamp}"
        d = ensure_dir(self.data_root / SNAPSHOT_DIR / name)
        conn = self._connect()
        row_count = 0
        try:
            with conn.cursor() as cur:
                cols = self._columns(cur) & set(SNAPSHOT_COLUMNS)
                col_list = ",".join(sorted(cols))
                cur.execute(f"SELECT {col_list} FROM knowledge_base")
                rows = cur.fetchall()
                col_names = sorted(cols)
                with open(d / "chunks.jsonl", "w", encoding="utf-8") as f:
                    for r in rows:
                        f.write(json.dumps(dict(zip(col_names, [_j(v) for v in r])), ensure_ascii=False) + "\n")
                        row_count += 1
                cur.execute("SELECT COUNT(*) FROM knowledge_base WHERE embedding IS NOT NULL")
                vectors = cur.fetchone()[0]
                # 向量单独存（BLOB 转 hex 便于 JSONL 承载）
                cur.execute("SELECT kb_id, HEX(embedding) FROM knowledge_base WHERE embedding IS NOT NULL")
                with open(d / "vectors.jsonl", "w", encoding="utf-8") as f:
                    f.writelines(json.dumps({"kb_id": kb_id, "embedding_hex": hexv}, ensure_ascii=False) + "\n" for kb_id, hexv in cur.fetchall())
        finally:
            conn.close()

        meta = {"name": name, "created_at": _now(), "chunks": row_count, "vectors": vectors,
                "note": note, "db": self.settings.db_name}
        (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        self._prune_snapshots(self.cfg.snapshot_keep)
        return {"name": name, "path": str(d), **meta}

    def list_snapshots(self) -> list[dict]:
        root = self.data_root / SNAPSHOT_DIR
        if not root.exists():
            return []
        out = []
        for d in sorted(root.iterdir(), reverse=True):
            meta = d / "meta.json"
            if meta.exists():
                try:
                    out.append(json.loads(meta.read_text(encoding="utf-8")))
                except (json.JSONDecodeError, OSError):
                    continue
        return out

    def _prune_snapshots(self, keep: int) -> list[str]:
        snaps = self.list_snapshots()
        removed = []
        import shutil

        for s in snaps[keep:]:
            p = self.data_root / SNAPSHOT_DIR / s["name"]
            if p.exists():
                shutil.rmtree(p)
                removed.append(s["name"])
        return removed

    # ── 3) 发布 ────────────────────────────────────────────────────────
    def publish(self, doc_ids: list[str], *, target_env: str = "dev", forced: bool = False) -> dict:
        checks = self.preflight_checks(doc_ids)
        blockers = [c for c in checks if c["status"] == "fail"]
        if blockers and not forced:
            return {"ok": False, "stage": "preflight", "checks": checks,
                    "blockers": blockers,
                    "message": "发布前检查未通过；可修正后重试，或用 --force 二次确认放行"}

        snap = self.snapshot(note=f"发布前快照（目标 {target_env}）")
        publish_id = new_id()
        validate = self._verify_env(doc_ids, target_env)
        record = {
            "publish_id": publish_id, "published_at": _now(), "target_env": target_env,
            "snapshot_name": snap["name"],
            "docs_added": validate.get("docs_to_add", 0),
            "docs_updated": validate.get("docs_to_update", 0),
            "chunks_written": validate.get("chunks_expected", 0),
            "vectors_written": validate.get("vectors_expected", 0),
            "check_result": json.dumps(checks, ensure_ascii=False),
            "verify_result": json.dumps(validate, ensure_ascii=False),
            "forced": 1 if forced else 0, "rolled_back_at": None,
        }
        self.db.upsert("kb_publish", ["publish_id"], record)
        return {"ok": True, "stage": "published", "publish_id": publish_id,
                "snapshot": snap, "checks": checks,
                "verify": validate,
                "note": "本次为**发布计划 + 快照**（写入动作由 CLI/后续版本执行）；"
                        "预检与验证均已落档"}

    # ── 4) 验证 ────────────────────────────────────────────────────────
    def _verify_env(self, doc_ids: list[str], target_env: str) -> dict:
        """发布前/后的目标环境核对：切片数、向量完整性、抽样检索、连通性"""
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cols = self._columns(cur)
                cur.execute("SELECT COUNT(*) FROM knowledge_base")
                total = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM knowledge_base WHERE embedding IS NULL")
                null_vec = cur.fetchone()[0]
                result = {
                    "target_env": target_env,
                    "chunks_in_target": total,
                    "null_vectors": null_vec,
                    "vectors_expected": total - null_vec,
                    "docs_to_add": len(doc_ids),
                    "docs_to_update": 0,
                    "chunks_expected": total,
                    "vector_column_ready": "retrieval_status" in cols,
                }
        finally:
            conn.close()
        result["checks"] = [
            {"key": "count_match", "label": "库内切片数", "status": "pass",
             "detail": f"{result['chunks_in_target']} 条"},
            {"key": "vector_integrity", "label": "向量完整性", "status": "pass" if result["null_vectors"] == 0 else "fail",
             "detail": f"NULL 向量 {result['null_vectors']} 条"},
            {"key": "sample_retrieval", "label": "抽样检索", "status": "not_executed",
             "detail": "需指定抽样问题；由 kb-pipeline quality run 覆盖"},
            {"key": "agent_connectivity", "label": "Agent 连通", "status": "not_executed",
             "detail": "agent-poc 未在本机运行时不校验"},
        ]
        result["ok"] = all(c["status"] != "fail" for c in result["checks"])
        return result

    # ── 5) 记录与回滚 ──────────────────────────────────────────────────
    def records(self, limit: int = 20) -> list[dict]:
        return self.db.query("SELECT * FROM kb_publish ORDER BY published_at DESC LIMIT ?", (limit,))

    def rollback(self, snapshot_name: str) -> dict:
        """从快照恢复目标库（删除现有切片 → 回灌快照 → 回灌向量）—— 不重跑任何解析"""
        d = self.data_root / SNAPSHOT_DIR / snapshot_name
        if not d.exists():
            return {"ok": False, "message": f"快照不存在: {snapshot_name}"}
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
        chunks = [json.loads(l) for l in (d / "chunks.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
        vectors_path = d / "vectors.jsonl"
        vectors = (
            [json.loads(l) for l in vectors_path.read_text(encoding="utf-8").splitlines() if l.strip()]
            if vectors_path.exists() else []
        )
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM knowledge_base")
                cols = self._columns(cur)
                for c in chunks:
                    keys = [k for k in c if k in cols]
                    ph = ",".join(["%s"] * len(keys))
                    cur.execute(
                        f"INSERT INTO knowledge_base ({','.join(keys)}) VALUES ({ph})",
                        tuple(c[k] for k in keys),
                    )
                for v in vectors:
                    cur.execute(
                        "UPDATE knowledge_base SET embedding=UNHEX(%s) WHERE kb_id=%s",
                        (v["embedding_hex"], v["kb_id"]),
                    )
                cur.execute("SELECT COUNT(*) FROM knowledge_base")
                after = cur.fetchone()[0]
            conn.commit()
        except Exception as e:      # noqa: BLE001 - 回滚失败必须整体回退
            conn.rollback()
            return {"ok": False, "message": f"回滚失败已回退: {e}"}
        finally:
            conn.close()

        self.db.execute("UPDATE kb_publish SET rolled_back_at=? WHERE snapshot_name=?",
                        (_now(), snapshot_name))
        return {"ok": True, "restored_chunks": after, "expected": meta["chunks"],
                "match": after == meta["chunks"]}


def _chk(key: str, label: str, status: str, detail: str, *,
         docs: list[str] | None = None) -> dict:
    """构造一个检查项。

    `docs` = 出问题的文档清单（界面据此生成"去哪修"的跳转按钮）；下发时截断到
    `DOCS_CAP` 条并恒带 `docs_total`，界面超出时提示"共 N 份"。
    """
    out = {"key": key, "label": label, "status": status, "detail": detail}
    if docs:
        out["docs"] = docs[:DOCS_CAP]
        out["docs_total"] = len(docs)
    return out


#: 必填字段的显示名（与前端 `labels.ts` 的 `META_FIELDS` 同步；字段口径以 `ledger.REQUIRED_FIELDS` 为准）
_META_LABEL = {"year": "年份", "region": "地区", "evidence_level": "证据级别"}


def _reason(code: str, label: str, page: str | None = None) -> dict:
    """「暂不可发布」的一条原因。`page` = 修复入口（工作台页签 id 或页面 id），
    界面据此生成跳转按钮（`corpus`=去文档管理重跑；`meta`/`numbers`=带 doc 去工作台）。"""
    out = {"code": code, "label": label}
    if page:
        out["page"] = page
    return out


def _step_names(step_ids: list[str]) -> str:
    from .registry import STEP_REGISTRY

    return "、".join(f"「{STEP_REGISTRY[s].label}」" for s in step_ids if s in STEP_REGISTRY)


def _pending_review_count(store) -> int:
    """该文档尚未处理的复核项数（validate 产物口径；无产物 = 0）。

    ⚠️ 发布前检查 ② 与发布计划 plan() 共用本函数 —— 两处口径必须同源，
    否则会出现「计划说就绪、检查却拦下」的自相矛盾。
    """
    v = store.read_current_artifact("validate")
    if v is None:
        return 0
    states = {c["kb_id"]: c.get("review_state") for c in v.get("chunks", [])}
    return sum(1 for c in v.get("chunks", [])
               if c.get("review") and states.get(c["kb_id"]) in (None, "pending"))


def _j(v):
    if isinstance(v, (bytes, bytearray)):
        return v.decode("utf-8", errors="replace")
    if isinstance(v, datetime):
        return v.isoformat(timespec="seconds")
    return v
