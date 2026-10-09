"""产物仓库：cache_key 语义、manifest 不变量、失效传播、保留策略

其中 `test_failed_run_never_becomes_current` 与
`test_mark_cached_ignores_failed_records` 是**今天修掉的两个真实 bug 的回归锁定**：
曾出现"上游显示 succeeded、下游却报上游未就绪"，根因是 `mark_cached` 按 cache_key
匹配到了同名 run 的**失败记录**，把 `current_run` 指向了失败 run。
"""
from __future__ import annotations

import json
from pathlib import Path

from kb_pipeline.artifact import ArtifactStore, compute_cache_key

PV = "0.2.0"


def _store(tmp_path: Path, doc_id: str = "doc") -> ArtifactStore:
    return ArtifactStore(tmp_path / "data", doc_id, PV)


def _key(step: str, upstream=None, params=None, engine="e", engine_version="v1", pv=PV) -> str:
    return compute_cache_key(
        step_id=step,
        upstream_hashes=upstream or {},
        params=params,
        engine=engine,
        engine_version=engine_version,
        platform_version=pv,
    )


def _write(store: ArtifactStore, step: str, key: str, payload: dict, params=None) -> str:
    return store.write_run(
        step_id=step,
        cache_key=key,
        payload=payload,
        engine="e",
        engine_version="v1",
        params=params or {},
        upstream={},
    )


# ── cache_key ────────────────────────────────────────────────────────────


def test_cache_key_is_stable():
    assert _key("segment", {"normalize": "h1"}, {"a": 1}) == _key("segment", {"normalize": "h1"}, {"a": 1})


def test_cache_key_sensitive_to_every_component():
    base = _key("segment", {"normalize": "h1"}, {"a": 1})
    assert base != _key("validate", {"normalize": "h1"}, {"a": 1})          # 步骤
    assert base != _key("segment", {"normalize": "h2"}, {"a": 1})          # 上游产物 hash
    assert base != _key("segment", {"normalize": "h1"}, {"a": 2})          # 参数
    assert base != _key("segment", {"normalize": "h1"}, {"a": 1}, engine="self-chunker")
    assert base != _key("segment", {"normalize": "h1"}, {"a": 1}, engine_version="v2")
    # 平台代码版本（PRD D-11）：代码改了行为变了，缓存必须失效
    assert base != _key("segment", {"normalize": "h1"}, {"a": 1}, pv="0.2.1")


def test_params_hash_ignores_key_order():
    assert _key("segment", {}, {"a": 1, "b": 2}) == _key("segment", {}, {"b": 2, "a": 1})


# ── 写入与读取 ───────────────────────────────────────────────────────────


def test_write_then_read_artifact(tmp_path: Path):
    store = _store(tmp_path)
    key = _key("preflight")
    _write(store, "preflight", key, {"page_count": 3})
    assert store.artifact_exists("preflight", key)
    assert store.read_artifact("preflight", key)["page_count"] == 3
    assert store.read_current_artifact("preflight")["page_count"] == 3


def test_atomic_write_leaves_no_tmp(tmp_path: Path):
    store = _store(tmp_path)
    _write(store, "preflight", _key("preflight"), {"a": 1})
    tmp_root = store.work_root / ".tmp"
    leftovers = list(tmp_root.iterdir()) if tmp_root.exists() else []
    assert leftovers == [], f"存在未清理的临时目录: {leftovers}"


def test_same_run_id_not_appended_twice(tmp_path: Path):
    store = _store(tmp_path)
    key = _key("preflight")
    _write(store, "preflight", key, {"a": 1}, params={"p": 1})
    _write(store, "preflight", key, {"a": 2}, params={"p": 1})
    runs = store.list_runs("preflight")
    assert len(runs) == 1, "同 run_id 重跑应替换记录而非追加"


# ── manifest 不变量（回归）───────────────────────────────────────────────


def test_failed_run_never_becomes_current(tmp_path: Path):
    """失败记录绝不能成为 current_run 被下游引用"""
    store = _store(tmp_path)
    pkey = _key("preflight")
    _write(store, "preflight", pkey, {"ok": True})
    upstream = {"preflight": store.current_run("preflight")["artifact_hash"]}
    key = _key("parse", upstream)
    _write(store, "parse", key, {"md_chars": 10})

    assert store.current_run("parse") is not None
    ok_run_id = store.current_run("parse")["run_id"]

    store.mark_failed(step_id="parse", error="boom", cache_key=key, params={"step": "parse"})
    assert store.step_status("parse") == "failed"
    assert store.current_run("parse") is not None, "失败不得清空 current_run"
    assert store.current_run("parse")["run_id"] == ok_run_id


def test_mark_cached_ignores_failed_records(tmp_path: Path):
    """回归：命中缓存时只能把 current_run 指向成功记录"""
    store = _store(tmp_path)
    pkey = _key("preflight")
    _write(store, "preflight", pkey, {"ok": True})
    upstream = {"preflight": store.current_run("preflight")["artifact_hash"]}
    key = _key("parse", upstream)
    _write(store, "parse", key, {"md_chars": 10})
    ok_run_id = store.current_run("parse")["run_id"]

    # 先制造一条同 cache_key 的失败记录，再模拟缓存命中
    store.mark_failed(step_id="parse", error="boom", cache_key=key, params={"step": "parse"})
    store.mark_cached(step_id="parse", cache_key=key)

    run = store.current_run("parse")
    assert run is not None
    assert run["run_id"] == ok_run_id
    assert run["status"] == "succeeded"
    # 下游此时必须能正常取到上游 hash（这正是之前报"上游未就绪"的场景）
    assert store.upstream_hashes("normalize")["parse"] == run["artifact_hash"]


def test_mark_failed_dedupes_repeated_retries(tmp_path: Path):
    store = _store(tmp_path)
    for _ in range(3):
        store.mark_failed(step_id="parse", error="same", cache_key="k", params={"step": "parse"})
    assert len(store.list_runs("parse")) == 1


def test_upstream_not_ready_raises(tmp_path: Path):
    store = _store(tmp_path)
    try:
        store.upstream_hashes("parse")       # preflight 尚未成功
    except Exception as e:                   # noqa: BLE001
        assert "未就绪" in str(e)
    else:
        raise AssertionError("上游未就绪时应当报错，不允许盲跑")


# ── 失效传播与保留策略 ───────────────────────────────────────────────────


def _chain(store: ArtifactStore) -> dict:
    """建立 preflight→parse→normalize→segment→validate→index 的成功链"""
    hashes: dict[str, str] = {}
    payloads = {
        "preflight": {"n": 1}, "parse": {"n": 2}, "normalize": {"n": 3},
        "segment": {"n": 4}, "validate": {"n": 5}, "index": {"n": 6},
    }
    spec_engine = {
        "preflight": ("pypdf", "6.x"), "parse": ("mineru", "4.0"), "normalize": ("rules", "v1"),
        "segment": ("self-chunker", "v1"), "validate": ("rules", "v1"), "index": ("tokenhub", "k"),
    }
    keys: dict[str, str] = {}
    for step, payload in payloads.items():
        eng, ver = spec_engine[step]
        req = {
            "preflight": [], "parse": ["preflight"], "normalize": ["parse"],
            "segment": ["normalize"], "validate": ["segment"], "index": ["validate"],
        }[step]
        key = _key(step, {r: hashes[r] for r in req}, {"step": step}, eng, ver)
        _write(store, step, key, payload, {"step": step})
        hashes[step] = store.current_run(step)["artifact_hash"]
        keys[step] = key
    return keys


def test_invalidate_marks_downstream_stale_but_keeps_files(tmp_path: Path):
    store = _store(tmp_path)
    keys = _chain(store)
    marked = store.invalidate("segment")

    assert marked == ["segment", "validate", "index"]
    assert store.step_status("segment") == "stale"
    assert store.step_status("validate") == "stale"
    assert store.step_status("preflight") == "succeeded"
    # PRD FR-1.8：产物文件保留，可对比可回退
    for step in ("segment", "validate", "index"):
        assert store.artifact_exists(step, keys[step]), f"{step} 产物被误删"


def test_prune_keeps_current_and_never_touches_raw_edits(tmp_path: Path):
    store = _store(tmp_path)
    store.ensure_dirs()
    (store.raw_root / "keep.md").write_text("raw", encoding="utf-8")
    (store.edits_root / "chunks.edited.json").write_text("{}", encoding="utf-8")

    for i in range(5):        # 5 次不同参数 → 5 个 run 目录
        _write(store, "preflight", _key("preflight", params={"i": i}), {"i": i}, params={"i": i})

    store.prune(keep=1)
    assert (store.raw_root / "keep.md").exists(), "raw/ 永不清理"
    assert (store.edits_root / "chunks.edited.json").exists(), "edits/ 永不清理"
    # current run 目录必须存活
    cur = store.current_run("preflight")
    assert store.artifact_exists("preflight", cur["cache_key"])


def test_manifest_is_valid_json_with_steps(tmp_path: Path):
    store = _store(tmp_path)
    _chain(store)
    manifest = json.loads(store.manifest_path.read_text(encoding="utf-8"))
    assert manifest["doc_id"] == "doc"
    assert set(manifest["steps"]) == {"preflight", "parse", "normalize", "segment", "validate", "index"}
    assert manifest["steps"]["validate"]["status"] == "succeeded"


def test_set_current_switches_run_and_stales_downstream(tmp_path: Path):
    store = _store(tmp_path)
    _chain(store)
    first = store.list_runs("normalize")[0]["run_id"]
    store.set_current("normalize", first)
    assert store.step_status("segment") == "stale"


# ── 失效传播的精确性（回归：缓存命中不得污染下游状态）────────────────────


def test_cache_hit_does_not_stale_downstream(tmp_path: Path):
    """缓存命中和"什么都没改变"等价，下游不应变待更新

    回归背景：早期 `mark_cached` 会调 `_mark_downstream_stale`，导致
    "只是在界面上看了一眼状态、下游就变成待更新"。
    """
    store = _store(tmp_path)
    _chain(store)
    key = store.current_run("normalize")["cache_key"]
    store.mark_cached(step_id="normalize", cache_key=key)
    assert store.step_status("normalize") == "succeeded"
    assert store.step_status("segment") == "succeeded"
    assert store.step_status("validate") == "succeeded"
    assert store.step_status("index") == "succeeded"


def test_write_run_only_stales_downstream_when_content_changed(tmp_path: Path):
    """只有产物指纹变了才让下游重跑（内容寻址语义）"""
    store = _store(tmp_path)
    _chain(store)

    # 同内容再写一次 → 下游保持 succeeded
    _write(store, "segment", store.current_run("segment")["cache_key"], {"n": 4}, {"step": "segment"})
    assert store.step_status("validate") == "succeeded", "内容未变不应标 stale"

    # 内容变化 → 下游必须 stale
    _write(store, "segment", store.current_run("segment")["cache_key"], {"n": 999}, {"step": "segment"})
    assert store.step_status("validate") == "stale"
    assert store.step_status("index") == "stale"


def test_invalidate_returns_full_closure_even_if_already_stale(tmp_path: Path):
    """作废的返回值必须是完整下游闭包（供界面准确提示），而非"仅状态变化者" """
    store = _store(tmp_path)
    _chain(store)
    assert store.invalidate("segment") == ["segment", "validate", "index"]
    assert store.invalidate("segment") == ["segment", "validate", "index"]
