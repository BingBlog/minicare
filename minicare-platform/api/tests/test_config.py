"""配置加载：YAML 真实生效 + 来源标注 + 类型转换

这些用例锁定**技术债 T12**（config/pipeline.yaml 曾长期不存在，
导致 `CONFIG_FILE.exists()` 永假、YAML 覆盖逻辑从未执行、调参实际要改 Python 源码）。
"""
from __future__ import annotations

from pathlib import Path

from kb_pipeline.config import (
    CONFIG_FILE,
    SOURCE_DEFAULT,
    SOURCE_YAML,
    effective_thresholds,
    format_effective_table,
    load_settings,
)


def test_repo_config_file_exists():
    assert CONFIG_FILE.exists(), "config/pipeline.yaml 必须存在（T12 回归）"
    assert CONFIG_FILE.name == "pipeline.yaml"


def test_yaml_is_actually_loaded():
    s = load_settings()
    assert s.yaml_loaded is True
    assert s.source_of("chunk") == SOURCE_YAML
    assert s.source_of("validate") == SOURCE_YAML


def test_yaml_change_takes_effect_without_code_change(tmp_path: Path):
    """改 YAML 即生效 —— 这是「阈值集中配置」这条 NFR 的最小验证"""
    base = CONFIG_FILE.read_text(encoding="utf-8")
    changed = base.replace("max_section_chars: 1200", "max_section_chars: 777")
    assert changed != base, "锚点失效：pipeline.yaml 里的 max_section_chars 默认值被改动了"
    p = tmp_path / "pipeline.yaml"
    p.write_text(changed, encoding="utf-8")

    s = load_settings(p)
    assert s.chunk_cfg.max_section_chars == 777
    assert s.source_of("chunk") == SOURCE_YAML


def test_missing_yaml_falls_back_to_code_defaults(tmp_path: Path):
    """YAML 缺失时必须回落代码默认值，且**明确标注来源**（不能假装已生效）"""
    s = load_settings(tmp_path / "not-exist.yaml")
    assert s.yaml_loaded is False
    assert s.source_of("chunk") == SOURCE_DEFAULT
    assert s.chunk_cfg.max_section_chars == 1200
    assert "YAML 未生效" in format_effective_table(s)


def test_path_fields_are_coerced_from_yaml(tmp_path: Path):
    """YAML 里的字符串路径必须被转成 Path

    原实现用 `model_copy(update=...)` 合并，不做类型转换 —— Path 字段会静默变成 str。
    本用例锁定改用 `model_validate` 之后的行为。
    """
    p = tmp_path / "pipeline.yaml"
    p.write_text(
        "platform:\n  db_path: data/platform.db\n  data_root: data\nstore:\n  chunk_jsonl: var/c.jsonl\n",
        encoding="utf-8",
    )
    s = load_settings(p)
    assert isinstance(s.platform_cfg.db_path, Path)
    assert isinstance(s.platform_cfg.data_root, Path)
    assert isinstance(s.store_cfg.chunk_jsonl, Path)


def test_unknown_yaml_section_is_reported(tmp_path: Path):
    """顶层键拼错时应可被察觉（避免"改了但没生效"再次发生）"""
    p = tmp_path / "pipeline.yaml"
    p.write_text("chunkk:\n  max_section_chars: 1\n", encoding="utf-8")
    s = load_settings(p)
    assert s.source_of("__keys__") == "chunkk"
    assert s.chunk_cfg.max_section_chars == 1200      # 拼错的分组不生效


def test_effective_table_covers_all_groups():
    s = load_settings()
    rows = effective_thresholds(s)
    assert {r["group"] for r in rows} >= {"mineru", "chunk", "validate", "platform"}
    assert all(r["source"] in (SOURCE_YAML, SOURCE_DEFAULT) for r in rows)


def test_default_dirs_point_to_existing_paths():
    """默认源/产物目录必须真实存在

    原默认值指向 `docs/敏宝知识库/{源文件,minerU解析版本}`，与仓库实际布局
    `docs/knowledge/source/{raw,mineru-parsed}` 不符 —— 会让 pypdf 交叉校验静默跳过。
    """
    s = load_settings()
    assert s.source_dir.exists(), f"source_dir 不存在: {s.source_dir}"
    assert s.out_dir.exists(), f"out_dir 不存在: {s.out_dir}"
    assert "knowledge/source" in str(s.source_dir)


def test_metadata_llm_thresholds_come_from_yaml():
    """元信息 LLM 抽取的两个阈值必须由 YAML 提供（新增阈值的回归钉子）

    对应 pipeline.yaml 的 `metadata:` 段；`doc_mapping` 刻意不在 YAML 里（业务数据），
    因此只断言这两个阈值。
    """
    s = load_settings()
    assert s.metadata_cfg.llm_brief_chars == 12000
    assert s.metadata_cfg.llm_schema_samples == 6
    assert s.source_of("metadata") == SOURCE_YAML

    rows = {(r["group"], r["key"]): r for r in effective_thresholds(s)}
    assert rows[("metadata", "llm_brief_chars")]["source"] == SOURCE_YAML
    assert rows[("metadata", "llm_schema_samples")]["value"] == "6"


def test_metadata_brief_chars_change_takes_effect(tmp_path: Path):
    """改 YAML 里的 llm_brief_chars 即生效（与 chunk 阈值同一套机制）"""
    base = CONFIG_FILE.read_text(encoding="utf-8")
    changed = base.replace("llm_brief_chars: 12000", "llm_brief_chars: 555")
    assert changed != base, "锚点失效：pipeline.yaml 里的 llm_brief_chars 默认值被改动了"
    p = tmp_path / "pipeline.yaml"
    p.write_text(changed, encoding="utf-8")
    assert load_settings(p).metadata_cfg.llm_brief_chars == 555


def test_translate_thresholds_come_from_yaml():
    """翻译步骤阈值必须由 YAML 提供（TECH-019 第 7 步的回归钉子）

    对应 pipeline.yaml 的 `translate:` 段；`glossary_path` 刻意不在 YAML 里
    （代码默认锚定 PROJECT_ROOT，避免相对路径随 cwd 漂移）。
    """
    s = load_settings()
    assert s.translate_cfg.enabled is True
    assert s.translate_cfg.budget_calls_per_doc == 200
    assert s.translate_cfg.skip_cjk_ratio == 0.5
    assert s.source_of("translate") == SOURCE_YAML

    rows = {(r["group"], r["key"]): r for r in effective_thresholds(s)}
    assert rows[("translate", "skip_cjk_ratio")]["source"] == SOURCE_YAML
    assert rows[("translate", "budget_tokens_per_doc")]["value"] == "400000"
