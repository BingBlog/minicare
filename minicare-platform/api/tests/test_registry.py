"""步骤注册表：拓扑一致性、依赖闭包、无人工闸门"""
from __future__ import annotations

import pytest

from kb_pipeline.registry import (
    STEP_ORDER,
    STEP_REGISTRY,
    StepSpec,
    assert_registry_consistent,
    downstream_of,
    upstream_of,
)


def test_registry_is_consistent():
    """拓扑无环、依赖已定义、STEP_ORDER 与注册表对齐"""
    assert_registry_consistent()


def test_seven_steps_in_expected_order():
    assert STEP_ORDER == (
        "preflight", "parse", "normalize", "segment", "validate", "translate", "index"
    )


def test_downstream_closure():
    assert downstream_of("preflight") == [
        "parse", "normalize", "segment", "validate", "translate", "index"
    ]
    assert downstream_of("segment") == ["validate", "translate", "index"]
    assert downstream_of("validate") == ["translate", "index"]
    assert downstream_of("translate") == ["index"]
    assert downstream_of("index") == []


def test_upstream_of():
    assert upstream_of("parse") == ["preflight"]
    assert upstream_of("segment") == ["normalize"]
    assert upstream_of("preflight") == []


def test_no_step_requires_a_manual_gate():
    """六步全程无人工闸门 —— 「暂停点」机制已于 2026-10-09 整体移除。

    这条断言是**回归护栏**：一旦有人把 `needs_gate` 加回 `StepSpec`，这里立刻失败。
    """
    assert not hasattr(StepSpec, "needs_gate")
    assert not hasattr(STEP_REGISTRY["segment"], "needs_gate")


def test_unknown_step_raises():
    with pytest.raises(KeyError):
        downstream_of("nope")


def test_engine_and_version_are_separate():
    """engine / engine_version 分开，避免 run_id 出现 `engine@engine` 的重复拼接"""
    for spec in STEP_REGISTRY.values():
        assert spec.engine and spec.engine_version
        assert "@" not in spec.engine
        assert spec.engine != spec.engine_version
