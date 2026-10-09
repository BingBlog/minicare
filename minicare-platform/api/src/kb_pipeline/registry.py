"""步骤注册表：七步的定义与依赖拓扑（PRD-008 §5.3 / §6.1；TECH-019 扩展）

七步替代原有 4 步（parse / chunk / import / embed）。关键变化是把「解析高危敏感信息复核」
从 chunk 里拆出来独立成步 —— 这是 US-06「改规则只重跑复核」能够成立的前提。
第 7 步 `translate`（TECH-019）：块级双语对，插在 validate 与 index 之间。
"""
from __future__ import annotations

from dataclasses import dataclass, field

# 依赖拓扑：preflight → parse → normalize → segment → validate → translate → index
# 各步**全程无人工闸门**：早期版本在 normalize→segment 之间设过「暂停点 1（信息确认）」，
# 该机制已整体移除（2026-10-09，见 PRD-008 §0）。元数据核对/切片校对/译文修正仍可在界面上做，
# 但它们是**可选操作**，不再拦截流程。
STEP_ORDER: tuple[str, ...] = (
    "preflight",
    "parse",
    "normalize",
    "segment",
    "validate",
    "translate",
    "index",
)


@dataclass(frozen=True)
class StepSpec:
    step_id: str
    label: str                      # 界面用中文名
    requires: tuple[str, ...]       # 上游步骤
    engine: str                     # 引擎名
    engine_version: str             # 引擎版本（与 engine 分开，避免 run_id 拼接重复）
    artifact: str                   # 产物文件名（不含目录）
    local_only: bool = True         # True=本地计算（串行）；False=外部 IO（可并发）


STEP_REGISTRY: dict[str, StepSpec] = {
    "preflight": StepSpec("preflight", "预检", (), "pypdf", "6.x", "preflight.json"),
    "parse": StepSpec(
        "parse", "解析", ("preflight",), "mineru", "4.0", "parse.json", local_only=False
    ),
    "normalize": StepSpec("normalize", "正文清洗", ("parse",), "rules", "v1", "normalize.json"),
    "segment": StepSpec("segment", "切块", ("normalize",), "self-chunker", "v1", "segment.json"),
    "validate": StepSpec(
        "validate", "解析高危敏感信息复核", ("segment",), "rules", "v1", "validate.json", local_only=False
    ),
    "translate": StepSpec(
        "translate", "翻译", ("validate",), "llm", "v1", "translate.json", local_only=False
    ),
    "index": StepSpec(
        "index", "索引", ("translate",), "tokenhub", "kinfra-0.6b", "index.json", local_only=False
    ),
}


def downstream_of(step_id: str) -> list[str]:
    """返回某步骤的全部下游（含间接），按拓扑序。"""
    if step_id not in STEP_REGISTRY:
        raise KeyError(f"未知步骤: {step_id}")
    out: list[str] = []
    frontier = [step_id]
    while frontier:
        cur = frontier.pop(0)
        for sid in STEP_ORDER:
            if cur in STEP_REGISTRY[sid].requires and sid not in out:
                out.append(sid)
                frontier.append(sid)
    return [s for s in STEP_ORDER if s in out]


def upstream_of(step_id: str) -> list[str]:
    return list(STEP_REGISTRY[step_id].requires)


def assert_registry_consistent() -> None:
    """启动自检：拓扑必须无环、依赖必须已定义、顺序必须与 STEP_ORDER 一致"""
    seen: set[str] = set()
    for sid in STEP_ORDER:
        if sid not in STEP_REGISTRY:
            raise AssertionError(f"STEP_ORDER 中的 {sid} 未在注册表定义")
        spec = STEP_REGISTRY[sid]
        for dep in spec.requires:
            if dep not in STEP_REGISTRY:
                raise AssertionError(f"{sid} 依赖未定义的步骤 {dep}")
            if dep not in seen:
                raise AssertionError(f"{sid} 依赖 {dep}，但它排在后面（拓扑序错误）")
        seen.add(sid)
    extra = set(STEP_REGISTRY) - set(STEP_ORDER)
    if extra:
        raise AssertionError(f"注册表存在未纳入 STEP_ORDER 的步骤: {sorted(extra)}")


@dataclass
class StepRunResult:
    """一次步骤执行的结果摘要（供编排层与界面使用）"""

    step_id: str
    run_id: str = ""
    status: str = "pending"     # succeeded / failed / skipped_cached / skipped_no_capability
    duration_ms: int = 0
    stats: dict = field(default_factory=dict)
    error: str = ""
    warnings: list[str] = field(default_factory=list)
