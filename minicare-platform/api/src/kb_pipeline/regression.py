"""检索质检执行引擎（US-11 / PRD-011 §3）

指标（口径 v2「三态」）：
  · **精确 Recall@5 / @10** —— gold 层命中率（同一份结果出两档，k=5/10）
  · **MRR**                —— 首个 gold 块位次的倒数均值（排得前不前）
  · **有害召回率**          —— top-5 中命中 **negative 层**的比例
                             （口径 v2：acceptable 与未标注块都不算有害 —— 修掉 16 条"伪有害"）
  · **高危必召回**          —— emergency 题 gold 命中率（门槛 100%，默认纳入达标判定）

四条纪律（PRD §1.5 决策）：
  1. **三态标注**：gold 必命中 / acceptable 命中不算错 / negative 进 top5 记有害；
  2. **诊断深度**：逐题检索 `diag_depth=20`（指标仍按 k=5/10 算），未命中才能归因
     （11–20 → 排序问题；不进 20 → 覆盖缺口）；
  3. **台账为单一事实源**：每次运行写 `kb_recall_run` + `kb_recall_case_result`（逐题随跑随写，
     中止/崩溃也保留已完成部分）；`recall-baseline.json` 仅作兼容镜像；
  4. **不静默降级**：嵌入服务不可用（向量路没跑）→ 运行失败并给出原因，不产出偏科结果；
     gold 全失效 → 显式报「gold_stale」，**绝不静默算成未命中**。
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import time
from datetime import datetime
from pathlib import Path

from .config import Settings
from .platform_db import PlatformDB, new_id
from .quality.import_runner import fetch_kb_states, module_label, parse_testset
from .quality.ledger import RecallLedger

SCOPES = ("all", "emergency", "out_of_scope")


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _git_rev() -> str | None:
    from .config import REPO_ROOT
    try:
        r = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                           cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=5)
        return r.stdout.strip() if r.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


# ── scope 解析与展示 ───────────────────────────────────────────────────


def parse_scope(s: str) -> dict:
    """`all` / `modules:A,C` / `emergency` / `out_of_scope` → dict（与台账 scope 串同构）"""
    s = (s or "all").strip()
    if s in SCOPES:
        return {s: True}
    if s.startswith("modules:"):
        mods = [x.strip().upper() for x in s[len("modules:"):].split(",") if x.strip()]
        if not mods:
            raise ValueError("modules: 后缺少模块名（如 modules:A,C）")
        return {"modules": mods}
    raise ValueError(f"未知 scope：{s}（支持 all / modules:A,C / emergency / out_of_scope）")


def scope_label(scope: str, count: int) -> str:
    d = parse_scope(scope)
    if d.get("all"):
        return f"全部（{count} 题）"
    if d.get("emergency"):
        return f"仅高危（{count} 题）"
    if d.get("out_of_scope"):
        return f"仅负样本（{count} 题）"
    return f"模块 {'·'.join(module_label(m) for m in d['modules'])}（{count} 题）"


def _evidence(attribution: str | None, best_rank, top_k: int, diag_depth: int) -> str:
    return {
        "ranked": f"gold 块最佳位次 {best_rank}（超出 k={top_k}，差一点进榜）",
        "coverage": f"gold 块在库可检索，但未进诊断深度 {diag_depth}",
        "excluded": "gold 块存在但被排除检索（去「已屏蔽内容」恢复）",
        "map_stale": "gold 块已不存在（重切导致 kb_id 变化，需重映射）",
    }.get(attribution or "", "人工判断")


class RegressionRunner:
    def __init__(self, settings: Settings, db: PlatformDB, data_root: Path) -> None:
        self.settings = settings
        self.db = db
        self.data_root = Path(data_root)
        self.cfg = settings.regression_cfg

    # ── 用例与映射 ──────────────────────────────────────────────────────

    def cases(self, scope: str = "all") -> list[dict]:
        """启用中的用例（按 scope 过滤）；`expect` 已从 expect_json 解码。"""
        rows = self.db.query("SELECT * FROM kb_recall_case WHERE enabled=1 ORDER BY case_id")
        d = parse_scope(scope)
        out: list[dict] = []
        for r in rows:
            try:
                expect = json.loads(r.get("expect_json") or "{}")
            except json.JSONDecodeError:
                expect = {}
            case = {
                "case_id": r["case_id"], "module": r["module"], "question": r["question"],
                "theme": r.get("theme"), "risk": r.get("risk") or "low",
                "case_type": r.get("case_type") or "answerable",
                "source": r.get("source") or "seed", "expect": expect,
            }
            if d.get("all"):
                pass
            elif d.get("emergency") and case["risk"] != "emergency":
                continue
            elif d.get("out_of_scope") and case["case_type"] != "out_of_scope":
                continue
            elif d.get("modules") and case["module"] not in d["modules"]:
                continue
            out.append(case)
        return out

    def _gold_rows(self) -> dict[str, list[dict]]:
        """`{case_id: [{kb_id, tier, entry_code, title}]}`（kb_recall_gold 全量）"""
        out: dict[str, list[dict]] = {}
        for r in self.db.query("SELECT * FROM kb_recall_gold ORDER BY case_id, tier, is_primary DESC"):
            out.setdefault(r["case_id"], []).append({
                "kb_id": r["kb_id"], "tier": r["tier"] or "gold",
                "entry_code": r.get("entry_code"), "title": r.get("chunk_title") or "",
            })
        return out

    def gold_map(self) -> dict[str, list[str]]:
        """兼容旧口径：仅 gold 层的 `{case_id: [kb_id]}`"""
        out: dict[str, list[str]] = {}
        for case_id, rows in self._gold_rows().items():
            gold = [t["kb_id"] for t in rows if t["tier"] == "gold"]
            if gold:
                out[case_id] = gold
        return out

    def gold_version(self) -> str:
        row = self.db.query_one("SELECT gold_version FROM kb_recall_gold LIMIT 1")
        return (row or {}).get("gold_version", self.cfg.gold_version)

    def seed_cases_from_markdown(self, path: Path) -> int:
        """从种子文件（表格式 Markdown）解析题目入库（仅题目与标注，不含映射展开）。

        保留此方法供 CLI `quality seed` 使用；完整导入（含映射体检与写入）走
        `kb-pipeline quality import` 或界面「用例集 → 导入」。
        """
        p = Path(path)
        if not p.exists():
            return 0
        cases = parse_testset(p.read_text(encoding="utf-8"))
        for c in cases:
            ex = self.db.query_one("SELECT enabled FROM kb_recall_case WHERE case_id=?", (c["case_id"],))
            self.db.upsert("kb_recall_case", ["case_id"], {
                "case_id": c["case_id"], "module": c["module"], "question": c["question"],
                "theme": c["theme"], "enabled": int(ex["enabled"]) if ex else 1,
                "risk": c["risk"], "case_type": c["case_type"],
                "expect_json": json.dumps(c["expect"], ensure_ascii=False),
                "source": "seed", "note": None,
            })
        return len(cases)

    def import_gold(self, mapping: dict[str, list[str]], version: str | None = None) -> int:
        """导入/覆盖某批题目的 **gold 层**块映射（`{case_id: [kb_id]}`；旧 CLI 兼容）。

        只替换 gold 层（acceptable / negative 层由用例导入通道维护）。
        """
        ver = version or self.cfg.gold_version
        now = _now()
        n = 0
        for case_id, kb_ids in mapping.items():
            self.db.execute("DELETE FROM kb_recall_gold WHERE case_id=? AND tier='gold'", (case_id,))
            for i, kb_id in enumerate(kb_ids):
                self.db.upsert("kb_recall_gold", ["case_id", "kb_id"], {
                    "case_id": case_id, "kb_id": kb_id,
                    "is_primary": 1 if i == 0 else 0,
                    "gold_version": ver, "mapped_at": now,
                    "tier": "gold", "entry_code": None, "chunk_title": None,
                })
                n += 1
        return n

    # ── gold 失效识别（CLI `quality check` / 兼容口径）──────────────────

    def check_gold_valid(self) -> dict:
        """比对 gold 的 kb_id 是否仍存在于知识库；**全部**缺失即"映射已失效"。

        返回 {checked, broken_cases, broken_pairs, valid}
        """
        states, err = fetch_kb_states(self.settings)
        if err:
            raise RuntimeError(err)
        assert states is not None
        gold_rows = self._gold_rows()
        broken_cases: list[str] = []
        broken_pairs = 0
        checked = 0
        for case in self.cases("all"):
            if case["case_type"] != "answerable":
                continue
            gold = [t["kb_id"] for t in gold_rows.get(case["case_id"], []) if t["tier"] == "gold"]
            if not gold:
                broken_cases.append(case["case_id"])
                continue
            checked += len(gold)
            missing = [k for k in gold if k not in states]
            if missing and len(missing) == len(gold):
                broken_cases.append(case["case_id"])
            broken_pairs += len(missing)
        return {"checked": checked, "broken_cases": broken_cases,
                "broken_pairs": broken_pairs, "valid": not broken_cases}

    # ── 前置检查（US-03）───────────────────────────────────────────────

    def precheck(self, scope: str = "all") -> dict:
        cases = self.cases(scope)
        ans = [c for c in cases if c["case_type"] == "answerable"]
        oos = [c for c in cases if c["case_type"] == "out_of_scope"]
        issues: list[str] = []
        blocked: list[str] = []
        warn: list[str] = []
        db_ok, db_err = False, None
        kb_count: int | None = None
        if not cases:
            issues.append("所选范围内没有启用的用例（先到「用例集」导入测试集，或调整范围）")
        else:
            states, db_err = fetch_kb_states(self.settings)
            db_ok = states is not None
            kb_count = len(states) if states is not None else None
            if states is None:
                issues.append(f"数据库不可达，无法体检映射：{db_err}")
            else:
                gold_rows = self._gold_rows()
                for c in ans:
                    gold = [t["kb_id"] for t in gold_rows.get(c["case_id"], []) if t["tier"] == "gold"]
                    st = [states.get(k, "missing") for k in gold]
                    if not st or all(x != "enabled" for x in st):
                        blocked.append(c["case_id"])
                    elif any(x != "enabled" for x in st):
                        warn.append(c["case_id"])
                if blocked:
                    issues.append(f"{len(blocked)} 道题目的 gold 全部失效或未映射："
                                  f"{'、'.join(blocked[:8])}（重新导入映射或重映射后再跑）")
        if not self.settings.tokenhub_api_key:
            issues.append("未配置 TOKENHUB_API_KEY（嵌入服务不可用；质检必须走与线上一致的混合检索）")
        return {"ok": not issues, "issues": issues, "scope": scope,
                "scope_label": scope_label(scope, len(cases)),
                "cases": len(cases), "answerable": len(ans), "out_of_scope": len(oos),
                "blocked_cases": blocked, "warn_cases": warn,
                "db_ok": db_ok, "db_error": db_err, "kb_count": kb_count}

    # ── 环境快照 ────────────────────────────────────────────────────────

    def build_env_snapshot(self, *, top_k: int, diag_depth: int, cases: list[dict],
                           kb_count: int | None = None) -> dict:
        digest = hashlib.sha256("|".join(
            f"{c['case_id']}|{c['question']}|{json.dumps(c['expect'], ensure_ascii=False, sort_keys=True)}"
            for c in cases
        ).encode("utf-8")).hexdigest()[:12]
        return {
            "embedding": self.settings.tokenhub_embedding_model,
            "rrf_k": 60, "top_k": top_k, "diag_depth": diag_depth,
            "kb_rows": kb_count,
            "case_set": {"count": len(cases), "hash": digest},
            "metric_version": self.cfg.metric_version,
            "gold_version": self.gold_version(),
            "git": _git_rev(),
        }

    # ── 执行（US-04/05/06 的数据层）────────────────────────────────────

    def run(self, *, scope: str = "all", top_k: int | None = None,
            diag_depth: int | None = None, limit: int | None = None,
            record_baseline: bool = True, run_id: str | None = None,
            ledger: RecallLedger | None = None,
            progress_cb=None, cancel_check=None) -> dict:
        """逐题执行质检并写台账。

        · `progress_cb(done, total, current, rec)` —— 每题开始（rec=None）与结束（rec=结果）各回调一次；
        · `cancel_check() -> bool` —— 每题之间询问是否中止（True = 中止，保留已完成部分）；
        · 三个不执行的分支：范围为空 → `not_executed`；gold 全失效 → `gold_stale`（显式，不算未命中）；
          嵌入服务不可用 → 抛 `RuntimeError`（调度器记为 failed）。
        """
        from .retrieval import retrieve

        top_k = int(top_k or 10)
        diag_depth = max(int(diag_depth or self.cfg.diag_depth), top_k)
        led = ledger or RecallLedger(self.db)
        cases = self.cases(scope)
        if limit:
            cases = cases[:int(limit)]

        # 运行行：调度器会先建（进度可查）；CLI 直跑则这里补建
        if run_id is None:
            run_id = self._new_run_id()
        if not led.run_exists(run_id):
            led.create_run(run_id=run_id, scope=scope, scope_label=scope_label(scope, len(cases)),
                           top_k=top_k, diag_depth=diag_depth,
                           env_snapshot=self.build_env_snapshot(
                               top_k=top_k, diag_depth=diag_depth, cases=cases))

        if not cases:
            msg = "所选范围内没有启用的用例：先到「用例集」导入测试集"
            led.finish_run(run_id, status="failed", error=msg)
            return {"status": "not_executed", "run_id": run_id, "message": msg, "metrics": {}}

        states, db_err = fetch_kb_states(self.settings)
        if states is None:
            msg = f"数据库不可达：{db_err}"
            led.finish_run(run_id, status="failed", error=msg)
            return {"status": "failed", "run_id": run_id, "message": msg, "metrics": {}}

        gold_rows = self._gold_rows()
        # gold 失效拦截（范围级）：全失效/未映射的题显式报出，绝不静默算成未命中
        blocked = []
        for c in cases:
            if c["case_type"] != "answerable":
                continue
            gold = [t["kb_id"] for t in gold_rows.get(c["case_id"], []) if t["tier"] == "gold"]
            if not gold or all(states.get(k) != "enabled" for k in gold):
                blocked.append(c["case_id"])
        if blocked:
            msg = (f"gold 映射已失效或未映射（{len(blocked)} 题）：{'、'.join(blocked[:10])}"
                   "——请重新导入映射或重映射；失效不会被算成未命中")
            led.finish_run(run_id, status="failed", error=msg)
            return {"status": "gold_stale", "run_id": run_id, "message": msg,
                    "broken_cases": blocked, "metrics": {}}

        total = len(cases)
        details: list[dict] = []
        cancelled = False
        started_ms = int(time.time() * 1000)
        try:
            for i, case in enumerate(cases):
                if cancel_check is not None and cancel_check():
                    cancelled = True
                    break
                if progress_cb is not None:
                    progress_cb(i, total, case["case_id"], None)
                t0 = time.perf_counter()
                rec = self._run_one(case, gold_rows, states, top_k, diag_depth, retrieve)
                rec["ms"] = int((time.perf_counter() - t0) * 1000)
                details.append(rec)
                led.insert_case_result(run_id, rec)
                if progress_cb is not None:
                    progress_cb(i + 1, total, None, {
                        "case_id": rec["case_id"], "verdict": rec["verdict"],
                        "attribution": rec["attribution"], "ms": rec["ms"],
                    })
        except Exception as e:  # noqa: BLE001 - 中途异常（如嵌入服务掉线）也要落台账，不留孤儿 running 行
            led.finish_run(run_id, status="failed", error=f"运行异常：{e}")
            raise

        duration_ms = int(time.time() * 1000) - started_ms
        metrics = self._metrics(details, top_k, cancelled=cancelled,
                                metric_version=self.cfg.metric_version)
        thresholds = {
            "recall5_min": self.cfg.recall_at_5_min,
            "recall10_min": self.cfg.recall_at_10_min,
            "harmful_max": self.cfg.harmful_recall_max,
            "emergency_min": self.cfg.emergency_min,
            "emergency_gate": self.cfg.emergency_gate,
        }
        passed = None
        if not cancelled:
            passed = (metrics["recall10"] >= thresholds["recall10_min"]
                      and metrics["harmful_rate"] <= thresholds["harmful_max"])
            if self.cfg.emergency_gate and metrics.get("emergency_recall") is not None:
                passed = passed and metrics["emergency_recall"] >= thresholds["emergency_min"]

        if cancelled:
            led.finish_run(run_id, status="cancelled", metrics=metrics, thresholds=thresholds,
                           passed=None, error="用户中止：仅覆盖已完成题目", duration_ms=duration_ms)
        else:
            led.finish_run(run_id, status="completed", metrics=metrics, thresholds=thresholds,
                           passed=passed, duration_ms=duration_ms)
            delta = led.compute_delta(run_id)
            led.set_delta(run_id, baseline_run_id=(delta or {}).get("prev_run_id"), delta=delta)
            if record_baseline:
                self._save_baseline(metrics, run_id=run_id)

        misses = [{
            "case_id": d["case_id"], "question": d["question"],
            "expected": [t["kb_id"] for t in d["expected"].get("gold") or []],
            "attribution": d["attribution"],
            "evidence": _evidence(d["attribution"], d["best_rank"], top_k, diag_depth),
        } for d in details if d["verdict"] == "miss"]

        run_meta = led.get_run(run_id, with_cases=False) or {}
        return {
            "status": "ok", "run_id": run_id,
            "scope": scope, "scope_label": scope_label(scope, len(cases)),
            "metrics": metrics, "thresholds": thresholds, "passed": passed,
            "cancelled": cancelled, "duration_ms": duration_ms,
            "gold_version": self.gold_version(),
            "baseline": self._load_baseline(),
            "delta": (run_meta.get("delta") or {}).get("metrics") if run_meta.get("delta") else None,
            "misses": misses, "details": details,
            "broken_cases": [],
            "note": "页码溯源准确率需读各文档 segment 产物抽样，属独立验收项，此处不计算",
        }

    # ── 单题执行 ────────────────────────────────────────────────────────

    def _run_one(self, case: dict, gold_rows: dict[str, list[dict]],
                 states: dict[str, str], top_k: int, diag_depth: int, retrieve) -> dict:
        expected_raw = gold_rows.get(case["case_id"], [])
        expected: dict[str, list[dict]] = {"gold": [], "acceptable": [], "negative": []}
        for t in expected_raw:
            expected.setdefault(t["tier"], []).append({
                "kb_id": t["kb_id"], "entry_code": t["entry_code"], "title": t["title"],
                "state": states.get(t["kb_id"], "missing"),
            })
        gold_ids = {t["kb_id"] for t in expected.get("gold") or []}
        neg_ids = {t["kb_id"] for t in expected.get("negative") or []}

        trace: dict = {}
        results = retrieve(self.settings, case["question"], top_k=diag_depth, trace=trace)
        if not trace.get("vector_used"):
            # 不静默降级：向量路没跑（缺 Key / 调用失败）时结果会偏科，整轮失败并说明原因
            raise RuntimeError(
                f"嵌入服务不可用（{trace.get('vector_degraded') or '未知原因'}）"
                "——质检要求与线上一致的混合检索（FULLTEXT + 向量），已中止"
            )

        tier_of: dict[str, str] = {}
        for tier in ("gold", "acceptable", "negative"):
            for t in expected.get(tier) or []:
                tier_of.setdefault(t["kb_id"], tier)

        topk = [{
            "rank": idx, "kb_id": r.get("kb_id"), "title": r.get("title"),
            "score": round(float(r.get("score") or 0), 4),
            "tier": tier_of.get(r.get("kb_id"), "unlabeled"),
        } for idx, r in enumerate(results[:top_k], 1)]

        first_hit_rank = None
        best_rank_int = None
        for idx, r in enumerate(results, 1):
            if r.get("kb_id") in gold_ids:
                best_rank_int = idx
                if idx <= top_k:
                    first_hit_rank = idx
                break
        best_rank = str(best_rank_int) if best_rank_int else f"gt{diag_depth}"

        harmful = [{
            "rank": idx, "kb_id": r.get("kb_id"), "title": r.get("title"),
        } for idx, r in enumerate(results[:5], 1) if r.get("kb_id") in neg_ids]

        if case["case_type"] == "out_of_scope":
            verdict, attribution = "out_of_scope", None
        else:
            verdict = "hit" if first_hit_rank is not None else "miss"
            attribution = None
            if verdict == "miss":
                live_gold = [t for t in expected.get("gold") or [] if t["state"] == "enabled"]
                if not live_gold:
                    attribution = ("excluded"
                                   if any(t["state"] == "excluded" for t in expected.get("gold") or [])
                                   else "map_stale")
                elif best_rank_int is None:
                    attribution = "coverage"
                else:
                    attribution = "ranked"

        return {
            "case_id": case["case_id"], "module": case["module"], "risk": case["risk"],
            "question": case["question"], "verdict": verdict, "attribution": attribution,
            "first_hit_rank": first_hit_rank, "best_rank": best_rank,
            "top1_score": topk[0]["score"] if topk else None,
            "expected": expected, "topk": topk, "harmful": harmful,
        }

    # ── 指标 ────────────────────────────────────────────────────────────

    @staticmethod
    def _metrics(details: list[dict], top_k: int, *, cancelled: bool = False,
                 metric_version: str = "v2-tri-state") -> dict:
        ans = [d for d in details if d["verdict"] in ("hit", "miss")]
        oos = [d for d in details if d["verdict"] == "out_of_scope"]
        n = len(ans)
        hit5 = len([d for d in ans if d["first_hit_rank"] is not None and d["first_hit_rank"] <= 5])
        hit10 = len([d for d in ans if d["first_hit_rank"] is not None])
        mrr = (sum(1.0 / d["first_hit_rank"] for d in ans if d["first_hit_rank"]) / n) if n else 0.0
        harmful_n = sum(len(d["harmful"]) for d in ans)
        slots = sum(len(d["topk"][:5]) for d in ans)
        em = [d for d in ans if d["risk"] == "emergency"]
        buckets: dict[str, int] = {}
        for d in ans:
            if d["verdict"] == "miss":
                key = d["attribution"] or "unknown"
                buckets[key] = buckets.get(key, 0) + 1
        return {
            "k": top_k,
            "recall5": round(hit5 / n, 4) if n else None,
            "recall10": round(hit10 / n, 4) if n else None,
            "mrr": round(mrr, 4) if n else None,
            "harmful_rate": round(harmful_n / slots, 4) if slots else 0.0,
            "emergency_recall": (round(len([d for d in em if d["first_hit_rank"] is not None]) / len(em), 4)
                                 if em else None),
            "n": len(details), "answerable": n, "out_of_scope": len(oos),
            "buckets": buckets,
            "metric_version": metric_version,
            "note": "已中止：仅覆盖已完成题目" if cancelled else None,
        }

    # ── 基线（兼容镜像）─────────────────────────────────────────────────

    @property
    def baseline_path(self) -> Path:
        from .fsutil import ensure_dir

        return ensure_dir(self.data_root / "quality") / "recall-baseline.json"

    def _load_baseline(self) -> dict | None:
        p = self.baseline_path
        if not p.exists():
            return None
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None

    def _save_baseline(self, metrics: dict, *, run_id: str | None = None) -> None:
        """写兼容镜像（旧读取方：publish 的兜底路径 / 旧字段消费）。

        ⚠️ 单一事实源是台账（`kb_recall_run`）；本文件只为兼容保留，键名对齐旧格式：
        `k` / `recall_at_k` / `harmful_rate` + 新增指标。
        """
        out = {
            "k": metrics.get("k", 10),
            "recall_at_k": metrics.get("recall10"),
            "harmful_rate": metrics.get("harmful_rate"),
            "recall5": metrics.get("recall5"),
            "recall10": metrics.get("recall10"),
            "mrr": metrics.get("mrr"),
            "emergency_recall": metrics.get("emergency_recall"),
            "answerable": metrics.get("answerable"),
            "metric_version": metrics.get("metric_version"),
            "run_id": run_id,
            "recorded_at": _now(),
        }
        self.baseline_path.write_text(
            json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    # ── 内部工具 ────────────────────────────────────────────────────────

    def _new_run_id(self) -> str:
        base = datetime.now().strftime("%Y%m%d-%H%M%S")
        run_id, n = base, 1
        while self.db.query_one("SELECT run_id FROM kb_recall_run WHERE run_id=?", (run_id,)):
            n += 1
            run_id = f"{base}-{n}"
        return run_id


def new_case_id() -> str:
    return new_id()
