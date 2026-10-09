"""编排器与任务队列：缓存、下游失效、状态派生、断点恢复、取消

对应 PRD-008 §6 与 US-03 / US-08 的验收标准。
"""
from __future__ import annotations

from pathlib import Path

import pytest

from kb_pipeline.config import CONFIG_FILE, load_settings
from kb_pipeline.orchestrator import (
    DOC_FAILED,
    DOC_PENDING,
    DOC_PROCESSING,
    DOC_READY,
    DOC_STALE,
    Orchestrator,
)
from kb_pipeline.platform_db import STATE_CANCELLED, STATE_DONE, STATE_QUEUED, TaskQueue


def _run(orc, corpus, **kw):
    kw.setdefault("dry_run", True)
    return orc.run_pipeline(
        corpus["doc_id"], region=corpus["region"],
        source_dir=corpus["source_dir"], out_dir=corpus["out_dir"], **kw
    )


def _statuses(result: dict) -> dict[str, str]:
    return {s["step_id"]: s["status"] for s in result["steps"]}


# ── 无人工闸门（回归护栏）──────────────────────────────────────────────


def test_pipeline_runs_straight_through_without_any_confirmation(orc, corpus):
    """六步一路跑到底，不需要任何"放行" —— 人工闸门机制已于 2026-10-09 整体移除。

    回归护栏：早期 `segment` 会被「暂停点 1」拦住并返回 `blocked_gate`，
    现在应当正常 succeeded 且 `blocked is None`。
    """
    result = _run(orc, corpus)
    st = _statuses(result)
    assert st["segment"] == "succeeded"
    assert result["blocked"] is None
    assert "blocked_gate" not in st.values()


# ── 缓存与重跑 ──────────────────────────────────────────────────────────


def test_second_run_hits_cache_for_all_steps(orc, corpus):
    _run(orc, corpus)
    result = _run(orc, corpus)
    assert set(_statuses(result).values()) == {"skipped_cached"}


def test_force_bypasses_cache(orc, corpus):
    _run(orc, corpus)
    result = _run(orc, corpus, force=True)
    assert set(_statuses(result).values()) == {"succeeded"}


def test_changed_threshold_reruns_step_and_downstream(tmp_path, corpus, repo_settings):
    """改校验参数 → 只重跑 validate 与 index，上游命中缓存（US-08 核心验收）

    注意参数选择：必须选一个**真会改变产物内容**的参数。例如给风险关键词表新增
    「危及生命」会让首块 risk_level 从 low 变 caution；若只改名一个本就命中 review 的
    关键词，产物不变、下游缓存命中是正确的（内容寻址语义），测不出失效传播。
    """
    base = CONFIG_FILE.read_text(encoding="utf-8")
    changed = base.replace("    - 监测\n", "    - 监测\n    - 危及生命\n")
    assert changed != base, "锚点失效：pipeline.yaml 的 risk_caution_keywords 结构变了"
    yaml_path = tmp_path / "pipeline-changed.yaml"
    yaml_path.write_text(changed, encoding="utf-8")

    o1 = Orchestrator(repo_settings, data_root=tmp_path / "data", queue=TaskQueue(tmp_path / "q.db"))
    first = _run(o1, corpus)
    assert first["status"] == DOC_AWAITING_REVIEW

    o2 = Orchestrator(load_settings(yaml_path), data_root=tmp_path / "data",
                      queue=TaskQueue(tmp_path / "q2.db"))
    second = _run(o2, corpus)
    st = _statuses(second)
    assert st["preflight"] == "skipped_cached"
    assert st["parse"] == "skipped_cached"
    assert st["normalize"] == "skipped_cached"
    assert st["segment"] == "skipped_cached"
    assert st["validate"] == "succeeded", "校验参数变了，必须重跑"
    assert st["index"] == "succeeded", "上游产物内容变了，索引必须重跑"


def test_invalidate_then_rerun(orc, corpus):
    _run(orc, corpus)
    marked = orc.invalidate(corpus["doc_id"], "segment")
    assert marked == ["segment", "validate", "index"]
    result = _run(orc, corpus)
    st = _statuses(result)
    assert st["preflight"] == "skipped_cached"
    assert st["segment"] == "skipped_cached"     # 输入未变 → 内容寻址命中缓存


def test_unknown_step_raises(orc, corpus):
    with pytest.raises(KeyError):
        orc.run_step(corpus["doc_id"], "nope")


def test_step_before_upstream_ready_fails_clearly(orc, corpus):
    res = orc.run_step(corpus["doc_id"], "validate", region=corpus["region"],
                       source_dir=corpus["source_dir"], out_dir=corpus["out_dir"])
    assert res.status == "failed"
    assert "未就绪" in res.error


# ── 状态派生 ────────────────────────────────────────────────────────────


def test_status_progression(orc, corpus):
    """状态派生：待处理 → 已就绪。

    ⚠️ 早期还有「待确认元数据 / 待校对切片」两级（对应两个人工暂停点），
    闸门机制已于 2026-10-09 整体移除，派生状态只看产物。
    """
    doc = corpus["doc_id"]
    assert orc.derive_status(doc) == DOC_PENDING
    _run(orc, corpus, until="segment")
    assert orc.derive_status(doc) == DOC_PENDING      # 六步没跑完，还不算就绪
    _run(orc, corpus)
    assert orc.derive_status(doc) == DOC_READY


def test_failed_step_derives_failed(orc, corpus):
    store = orc.store_for(corpus["doc_id"])
    store.mark_failed(step_id="parse", error="boom")
    assert orc.derive_status(corpus["doc_id"]) == DOC_FAILED


def test_stale_takes_priority_over_ready(orc, corpus):
    """回归：上游已完成 + 下游待重跑 → 必须是「待更新」

    早期实现的 `derive_status` 把 stale 判断放在"已就绪"之后，导致这种文档被误判成
    「待处理」—— 界面上表现为"六步有 3 步已完成，头部却写待处理"。
    """
    _run(orc, corpus)
    assert orc.derive_status(corpus["doc_id"]) == DOC_READY

    orc.invalidate(corpus["doc_id"], "segment")
    assert orc.derive_status(corpus["doc_id"]) == DOC_STALE


def test_processing_comes_from_task_queue(orc, corpus):
    """「处理中」来自队列任务状态 —— manifest 的步骤状态里没有 running（执行中不写产物）"""
    assert orc.derive_status(corpus["doc_id"]) == DOC_PENDING
    tid = orc.submit(corpus["doc_id"])
    orc.queue.mark_running(tid)
    assert orc.derive_status(corpus["doc_id"]) == DOC_PROCESSING
    orc.queue.mark_done(tid)
    assert orc.derive_status(corpus["doc_id"]) == DOC_PENDING


def test_next_step_to_run(orc, corpus):
    assert orc.next_step_to_run(corpus["doc_id"]) == "preflight"
    _run(orc, corpus, until="normalize")
    assert orc.next_step_to_run(corpus["doc_id"]) == "segment"


# ── 任务队列 ────────────────────────────────────────────────────────────


def test_queue_enqueue_position_and_drain(orc, corpus):
    tid = orc.submit(corpus["doc_id"])
    assert orc.queue.position(tid) == 1
    assert orc.queue.get(tid)["state"] == STATE_QUEUED

    outcomes = orc.drain(region=corpus["region"], dry_run=True,
                         source_dir=corpus["source_dir"], out_dir=corpus["out_dir"])
    assert len(outcomes) == 1
    assert orc.queue.get(tid)["state"] == STATE_DONE


def test_cancel_queued_task_is_immediate(orc, corpus):
    tid = orc.submit(corpus["doc_id"])
    assert orc.queue.request_cancel(tid) is True
    assert orc.queue.get(tid)["state"] == STATE_CANCELLED
    assert orc.queue.next_queued() is None          # 已取消的不再被取出


def test_cancel_all_and_stats(orc, corpus):
    orc.submit(corpus["doc_id"])
    orc.submit(corpus["doc_id"])
    assert orc.queue.cancel_all() == 2
    assert orc.queue.stats().get(STATE_CANCELLED) == 2


def test_resume_orphans_requeues_running(tmp_path: Path):
    q = TaskQueue(tmp_path / "platform.db")
    tid = q.enqueue("doc-x")
    q.mark_running(tid)
    assert q.get(tid)["state"] == "running"

    resumed = q.resume_orphans()
    assert resumed == [tid]
    assert q.get(tid)["state"] == STATE_QUEUED


def test_queue_is_persistent_across_instances(tmp_path: Path):
    """队列即表 —— 进程重启后仍能读到（断点恢复的基础）"""
    db = tmp_path / "platform.db"
    q1 = TaskQueue(db)
    tid = q1.enqueue("doc-y")
    q2 = TaskQueue(db)
    assert q2.get(tid)["doc_id"] == "doc-y"
