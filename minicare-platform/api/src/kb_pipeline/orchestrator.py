"""编排器：步骤执行、缓存命中、闸门、失效传播、状态派生

对应 PRD-008 §6（步骤与状态模型）与 TECH-015 §8.3–§8.5。

关键语义：
  - **缓存命中即跳过**：`cache_key` 由「步骤 + 上游产物 hash + 参数 hash + 引擎版本 +
    平台代码版本」决定，目录存在 = 命中（O(1)）。
  - **无人工闸门**：六步一路跑到底（早期 `segment` 之前的「暂停点 1」已于 2026-10-09 整体移除）。
  - **失效传播**：任一步重跑 → 下游标 `stale`，**产物不删**（可对比、可回退）。
  - **状态派生**：文档状态由步骤状态算出，不手工维护（PRD §6.4）。
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from . import run_registry
from .artifact import (
    STATUS_FAILED,
    STATUS_SKIPPED_CACHED,
    STATUS_STALE,
    STATUS_SUCCEEDED,
    SUCCESS_STATES,
    ArtifactStore,
    StepRunResult,
    UpstreamNotReady,
    compute_cache_key,
)
from .config import Settings
from .logger import get_logger
from .platform_db import STATE_RUNNING, DocStateStore, PlatformDB, TaskQueue
from .registry import STEP_ORDER, STEP_REGISTRY, assert_registry_consistent, downstream_of
from .steps import StepContext, get_step_func

log = get_logger(__name__)

# 派生状态（PRD §6.4）
DOC_PENDING = "pending"
DOC_PROCESSING = "processing"
DOC_FAILED = "failed"
DOC_READY = "ready"
DOC_STALE = "stale"

def default_params(settings: Settings, step_id: str, overrides: dict | None = None) -> dict:
    """步骤参数快照 —— 参与 cache_key，因此阈值变更会自动使该步及下游缓存失效。"""
    base: dict[str, Any] = {"step": step_id}
    if step_id == "preflight":
        cfg = settings.preflight_cfg
        base.update(
            min_text_chars_per_page=cfg.min_text_chars_per_page,
            scan_page_ratio_for_ocr=cfg.scan_page_ratio_for_ocr,
        )
    elif step_id == "parse":
        cfg = settings.mineru_cfg
        base.update(
            mode="auto",
            model_pdf=cfg.model_pdf,
            model_html=cfg.model_html,
            language=cfg.language,
            is_ocr=cfg.is_ocr,
            ocr_files=sorted(cfg.ocr_files),
        )
    elif step_id == "normalize":
        # v2：产物新增 `line_map`（输出行 → 原始 md 行）。切块据此把 `line_start/line_end`
        # 换算回原文，做切片↔块的**精确**对齐。改这个标记只让 normalize 及下游重跑，
        # 解析（parse）不动 —— 不要去改 platform.version，那会让全库重新调 MinerU。
        # @v3：图片引用不再压成 `【图:无题】`，改为保留 `![](images/x.jpg)`（否则前端渲染不出图）。
        # @v4：修 HEADER_FOOTER_RE —— 「中华…杂志」误伤以编辑部名义开头的参考文献条目
        #      （断头 3 条）+ `^\s*` 跨行吞换行令 line_map 行号漂移；另加"行结构不变"防御断言。
        #      见 preprocess/clean.py 注释与 tests/test_clean.py 回归样例（2026-10-09）。
        base.update(ruleset="clean+headings@v4")
    elif step_id == "segment":
        cfg = settings.chunk_cfg
        base.update(
            # @v2：切块开始记录 `line_start/line_end`（源行号），供切片↔原文精确对照。
            # @v3：落盘顺序改为**文档阅读顺序**（原来按 header_path 字典序，列表被打成
            #      Abbreviations → Abstract → Appendix…）。读取侧有同键兜底，但产物本身
            #      也该是有序的 —— 不升这个标记，重跑会命中缓存、产物永远保持乱序。
            splitter="self@v3",
            max_section_chars=cfg.max_section_chars,
            chunk_size=cfg.chunk_size,
            chunk_overlap=cfg.chunk_overlap,
        )
    elif step_id == "validate":
        cfg = settings.validate_cfg
        base.update(
            enabled=cfg.enabled,
            pypdf_cross_check=cfg.pypdf_cross_check,
            patterns=cfg.patterns,
            risk_caution=sorted(cfg.risk_caution_keywords),
            risk_emergency=sorted(cfg.risk_emergency_keywords),
            keyword_source="rule",
        )
    elif step_id == "translate":
        # @v1（TECH-019）：块级双语对。`llm_available` 必须进参数 —— 防止"无 key 的
        # 空产物被缓存、配好 key 后重跑被跳过"；术语表/人工编辑两个文件级指纹在
        # `_run_step_inner` 里追加（与 segment 的 excludes_hash 同款）。
        cfg = settings.translate_cfg
        base.update(
            translator="llm@v1",
            model=settings.kb_llm_model,
            prompt_version=cfg.prompt_version,
            skip_cjk_ratio=cfg.skip_cjk_ratio,
            translate_excluded=cfg.translate_excluded,
            max_glossary_hits=cfg.max_glossary_hits,
            llm_available=bool(settings.deepseek_api_key),
            # 预算进参数：调大预算后重跑能"补翻"此前被预算拦下的块
            # （已成功块走内容缓存，不会重复烧 token）
            budget_calls_per_doc=cfg.budget_calls_per_doc,
            budget_tokens_per_doc=cfg.budget_tokens_per_doc,
        )
    elif step_id == "index":
        base.update(
            embedding_model=settings.tokenhub_embedding_model,
        )
    if overrides:
        base.update(overrides)
    return base


class Orchestrator:
    """七步流水线的执行者（单用户本机，无分布式概念）"""

    def __init__(
        self,
        settings: Settings,
        data_root: Path | None = None,
        queue: TaskQueue | None = None,
    ) -> None:
        assert_registry_consistent()
        self.settings = settings
        self.data_root = Path(data_root or settings.platform_cfg.data_root)
        # 复用队列已经打开的库，避免同进程出现两个 SQLite 连接指向不同文件
        self.db = getattr(queue, "db", None) or PlatformDB(
            self.data_root / "platform.db"
            if data_root is not None else settings.platform_cfg.db_path
        )
        self.queue = queue or TaskQueue(self.db)
        self.doc_state = DocStateStore(self.db)

    # ── 基础 ────────────────────────────────────────────────────────────
    def store_for(self, doc_id: str) -> ArtifactStore:
        return ArtifactStore(self.data_root, doc_id, self.settings.platform_cfg.version)

    def _ctx(self, doc_id: str, region: str, params: dict, dry_run: bool,
             source_dir: Path | None, out_dir: Path | None) -> StepContext:
        return StepContext(
            settings=self.settings,
            store=self.store_for(doc_id),
            doc_id=doc_id,
            region=region,
            params=params,
            source_dir=source_dir,
            out_dir=out_dir,
            dry_run=dry_run,
            db=self.db,
        )

    # ── 单步执行 ────────────────────────────────────────────────────────
    def run_step(
        self,
        doc_id: str,
        step_id: str,
        *,
        region: str = "cn",
        params: dict | None = None,
        force: bool = False,
        dry_run: bool = False,
        source_dir: Path | None = None,
        out_dir: Path | None = None,
        register: bool = True,
    ) -> StepRunResult:
        """单步执行。

        `register=True`（独立调用，如 web 的「单步重跑」）时把运行态登进 `run_registry`，
        供前端显示进度；`run_pipeline` 内部调用时传 `False` —— 流水线自己按步登记，
        避免两层登记互相覆盖。
        """
        if step_id not in STEP_REGISTRY:
            raise KeyError(f"未知步骤: {step_id}")
        if register:
            idx = STEP_ORDER.index(step_id) + 1 if step_id in STEP_ORDER else 0
            run_registry.begin(doc_id, mode="step", total_steps=len(STEP_ORDER))
            run_registry.enter_step(doc_id, step_id, STEP_REGISTRY[step_id].label, idx)
        try:
            res = self._run_step_inner(
                doc_id, step_id,
                region=region, params=params, force=force, dry_run=dry_run,
                source_dir=source_dir, out_dir=out_dir,
            )
            if register:
                run_registry.leave_step(doc_id, step_id, res.status)
            return res
        finally:
            if register:
                run_registry.finish(doc_id)

    def _run_step_inner(
        self,
        doc_id: str,
        step_id: str,
        *,
        region: str = "cn",
        params: dict | None = None,
        force: bool = False,
        dry_run: bool = False,
        source_dir: Path | None = None,
        out_dir: Path | None = None,
    ) -> StepRunResult:
        if step_id not in STEP_REGISTRY:
            raise KeyError(f"未知步骤: {step_id}")
        spec = STEP_REGISTRY[step_id]
        store = self.store_for(doc_id)
        store.ensure_dirs()
        eff_params = default_params(self.settings, step_id, params)

        # 人工屏蔽/恢复决定（edits/excludes.json）是 segment 的输入，必须进 cache_key ——
        # 否则在界面上"恢复检索"后重跑会命中旧缓存，看起来像没生效。
        if step_id == "segment":
            from .quality.noise import load_overrides, overrides_hash

            eff_params["excludes_hash"] = overrides_hash(load_overrides(store.edits_root))

        # 翻译的另两个输入源（术语表 / 人工编辑与复核结论）是**文件级数据**，同样必须进
        # cache_key —— 否则改术语表、或编辑切片后重跑会命中旧缓存（同上一条同理）。
        # ⚠️ 译文修正覆盖层**不**参与（修正只影响展示层，不触发重跑；TECH-019 §3.8）。
        if step_id == "translate":
            from .edits import EditStore, chunk_edits_hash
            from .glossary import glossary_hash, load_glossary

            eff_params["chunk_edits_hash"] = chunk_edits_hash(EditStore(store.edits_root))
            eff_params["glossary_hash"] = glossary_hash(
                load_glossary(self.settings.translate_cfg.glossary_path)
            )

        # 1) 上游就绪检查（不允许盲跑）
        try:
            upstream = store.upstream_hashes(step_id)
        except UpstreamNotReady as e:
            store.mark_failed(step_id=step_id, error=str(e), params=eff_params)
            return StepRunResult(step_id=step_id, status=STATUS_FAILED, error=str(e))

        # 3) 缓存判定
        cache_key = compute_cache_key(
            step_id=step_id,
            upstream_hashes=upstream,
            params=eff_params,
            engine=spec.engine,
            engine_version=spec.engine_version,
            platform_version=self.settings.platform_cfg.version,
        )
        if not force and store.artifact_exists(step_id, cache_key):
            store.mark_cached(step_id=step_id, cache_key=cache_key)
            log.info(f"[step] {doc_id} {step_id} 命中缓存（{cache_key[:8]}）")
            return StepRunResult(step_id=step_id, status=STATUS_SKIPPED_CACHED,
                                 stats={"cached": True})

        # 4) 实跑
        started = time.monotonic()
        ctx = self._ctx(doc_id, region, eff_params, dry_run, source_dir, out_dir)
        try:
            payload, stats = get_step_func(step_id)(ctx)
        except Exception as e:                                  # noqa: BLE001 - 步骤边界统一兜底
            duration = int((time.monotonic() - started) * 1000)
            store.mark_failed(step_id=step_id, error=str(e), cache_key=cache_key, params=eff_params)
            log.error(f"[step] {doc_id} {step_id} 失败: {e}")
            return StepRunResult(step_id=step_id, status=STATUS_FAILED, error=str(e),
                                 duration_ms=duration)

        duration = int((time.monotonic() - started) * 1000)
        warnings = list(payload.get("warnings", []) if isinstance(payload, dict) else [])
        run_id = store.write_run(
            step_id=step_id,
            cache_key=cache_key,
            payload=payload,
            engine=spec.engine,
            engine_version=spec.engine_version,
            params=eff_params,
            upstream=upstream,
            stats=stats,
            duration_ms=duration,
            warnings=warnings,
        )
        # 产物保留策略：清理非 current 的旧 run（raw/ 与 edits/ 不受影响）
        store.prune(self.settings.platform_cfg.artifact_keep_runs)
        log.info(f"[step] {doc_id} {step_id} 完成 {duration}ms {stats}")
        return StepRunResult(
            step_id=step_id, run_id=run_id, status=STATUS_SUCCEEDED,
            duration_ms=duration, stats=stats, warnings=warnings,
        )

    # ── 全流程 ──────────────────────────────────────────────────────────
    def run_pipeline(
        self,
        doc_id: str,
        *,
        region: str = "cn",
        until: str | None = None,
        force: bool = False,
        dry_run: bool = False,
        source_dir: Path | None = None,
        out_dir: Path | None = None,
        task_id: str | None = None,
    ) -> dict:
        """跑六步（可指定 until 提前收口）；返回逐步结果与派生状态

        `blocked` 是**「为什么没跑完」的结构化答案**。当前只有一种 kind：
          · `error` —— 某一步执行失败。
        （早期还有 `gate`（卡在人工闸门），闸门机制已整体移除 —— 2026-10-09。）
        """
        if until and until not in STEP_REGISTRY:
            raise KeyError(f"未知步骤: {until}")
        results: list[StepRunResult] = []
        blocked: dict[str, Any] | None = None
        # 运行态登记：每步 enter/leave（**含缓存命中的步骤**）—— 前端 1s 轮询
        # 拿它画“第 N/6 步 · 步骤名 · 已耗时”，包括秒过的缓存步骤也能看到推进。
        run_registry.begin(doc_id, mode="pipeline", total_steps=len(STEP_ORDER))
        try:
            for idx, step_id in enumerate(STEP_ORDER):
                if task_id and self.queue.is_cancel_requested(task_id):
                    if task_id:
                        self.queue.mark_cancelled(task_id)
                    break
                if task_id:
                    self.queue.set_progress(task_id, f"{STEP_REGISTRY[step_id].label} 处理中")
                run_registry.enter_step(doc_id, step_id, STEP_REGISTRY[step_id].label, idx + 1)
                res = self.run_step(
                    doc_id, step_id, region=region, force=force, dry_run=dry_run,
                    source_dir=source_dir, out_dir=out_dir,
                    register=False,                              # 本方法按步登记，避免双层覆盖
                )
                run_registry.leave_step(doc_id, step_id, res.status)
                results.append(res)
                if res.status == STATUS_FAILED:
                    blocked = {
                        "kind": "error",
                        "step_id": res.step_id,
                        "step_label": STEP_REGISTRY[res.step_id].label,
                        "advice": f"展开该文档的「处理详情」查看 {STEP_REGISTRY[res.step_id].label} "
                                  f"的失败原因，修好输入后从这一步重试。",
                        "message": res.error,
                    }
                    break
                if until and step_id == until:
                    break
        finally:
            # 注销运行态（含异常路径，不能让“运行中”卡死）。error 供排障；
            # 结束后的派生状态由下方 derive_status 单独给出。
            run_registry.finish(doc_id, error=(blocked or {}).get("message"))
        status = self.derive_status(doc_id)
        return {
            "doc_id": doc_id,
            "steps": [
                {"step_id": r.step_id, "status": r.status, "duration_ms": r.duration_ms,
                 "stats": r.stats, "warnings": r.warnings, "error": r.error}
                for r in results
            ],
            "status": status,
            "blocked": blocked,
        }

    # ── 状态派生 ────────────────────────────────────────────────────────
    def derive_status(self, doc_id: str) -> str:
        """派生状态（PRD-008 §6.4）。

        分支顺序即优先级：**失败 > 待更新（存在 stale）> 已就绪 > 处理中 > 待处理**。

        ⚠️ 早期还有「待确认元数据 / 待校对切片」两级（对应两个人工暂停点），
        闸门机制已于 2026-10-09 整体移除 —— 元数据核对与切片校对仍可做，
        但它们是**可选操作**，不再参与状态派生（否则会出现"状态一直停在待确认"的假阻塞）。
        """
        # 运行中优先：产物状态此刻还在逐步写入，报「处理中」最贴合事实。
        # ⚠️ 必须放在产物判断**之前** —— 否则正在重试 failed 步骤的文档会一直报 failed，
        # 与卡片上"运行中"的进度显示自相矛盾。
        if run_registry.is_running(doc_id):
            return DOC_PROCESSING
        steps = self.store_for(doc_id).snapshot()
        if any(s == STATUS_FAILED for s in steps.values()):
            return DOC_FAILED
        if any(s == STATUS_STALE for s in steps.values()):
            return DOC_STALE
        if steps.get("index") in SUCCESS_STATES:
            return DOC_READY
        # 「处理中」来自**任务队列**而非产物状态：manifest 的步骤状态里没有 running
        # （执行中不会先写产物），只有 kb_task 才有 running。
        if any(t.get("doc_id") == doc_id for t in self.queue.list_tasks(state=STATE_RUNNING, limit=50)):
            return DOC_PROCESSING
        return DOC_PENDING

    # ── 元数据表单取值（**可选操作**，不再有"放行"语义）──────────────────
    def save_meta(self, doc_id: str, *, meta: dict | None = None, region: str = "cn") -> dict:
        """保存「信息确认」表单的人工核对结果。

        ⚠️ 这里**不再有任何"放行"含义** —— 人工闸门机制已于 2026-10-09 整体移除。
        保存元数据纯粹是记录核对结果（并供切片元信息回落使用），
        与"流程能不能继续"完全解耦。
        """
        return self.doc_state.upsert(doc_id, region=region, meta=meta)

    def next_step_to_run(self, doc_id: str) -> str | None:
        """按拓扑返回第一个未成功（或 stale）的步骤"""
        steps = self.store_for(doc_id).snapshot()
        for step_id in STEP_ORDER:
            if steps.get(step_id) not in SUCCESS_STATES:
                return step_id
        return None

    # ── 作废 ────────────────────────────────────────────────────────────
    def invalidate(self, doc_id: str, from_step: str) -> list[str]:
        return self.store_for(doc_id).invalidate(from_step)

    def downstream(self, step_id: str) -> list[str]:
        return downstream_of(step_id)

    # ── 任务队列驱动 ────────────────────────────────────────────────────
    def submit(
        self, doc_id: str, *, kind: str = "pipeline", step_id: str | None = None,
        params: dict | None = None, force: bool = False,
    ) -> str:
        return self.queue.enqueue(doc_id, kind=kind, step_id=step_id, params=params, force=force)

    def drain(self, *, region: str = "cn", dry_run: bool = False,
              source_dir: Path | None = None, out_dir: Path | None = None,
              task_options: dict | None = None) -> list[dict]:
        """串行消费队列直到为空（单用户本机；解析并发为第 2 期优化项）"""
        processed: list[dict] = []
        while True:
            task = self.queue.next_queued()
            if task is None:
                break
            task_id = task["task_id"]
            self.queue.mark_running(task_id)
            opts = {**(task_options or {})}
            opts.update({
                "region": region, "force": bool(task["force"]), "dry_run": dry_run,
                "source_dir": source_dir, "out_dir": out_dir,
                "task_id": task_id,
            })
            try:
                if task["kind"] == "step_run" and task["step_id"]:
                    res = self.run_step(task["doc_id"], task["step_id"], **opts)
                    outcome = {"doc_id": task["doc_id"], "task_id": task_id,
                               "steps": [{"step_id": res.step_id, "status": res.status,
                                          "error": res.error, "stats": res.stats}],
                               "status": self.derive_status(task["doc_id"])}
                else:
                    outcome = self.run_pipeline(task["doc_id"], **opts)
                    outcome["task_id"] = task_id
                if self.queue.is_cancel_requested(task_id):
                    self.queue.mark_cancelled(task_id)
                else:
                    self.queue.mark_done(task_id)
            except Exception as e:                              # noqa: BLE001
                self.queue.mark_failed(task_id, str(e))
                outcome = {"doc_id": task["doc_id"], "task_id": task_id, "status": "failed", "error": str(e)}
            processed.append(outcome)
        return processed

    def resume(self) -> list[str]:
        return self.queue.resume_orphans()
