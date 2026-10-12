"""配置加载：config/pipeline.yaml + .env（pydantic-settings）

设计要点（TECH-015 §4.9 / PRD-008 §12.2）：
  1. `config/pipeline.yaml` 是阈值的**唯一权威来源**，代码默认值只是兜底。
  2. 每个配置分组的**来源可查**（yaml / code-default），`format_effective_table()`
     用于启动时打印，防止再出现"以为改了 YAML 其实没生效"（技术债 T12）。
  3. YAML 合并走 `model_validate` 而非 `model_copy` —— 后者不做类型转换，
     会把 `Path` 字段悄悄变成 `str`。
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field, PrivateAttr
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]  # minicare-platform/api/
CONFIG_FILE = PROJECT_ROOT / "config" / "pipeline.yaml"
# ⚠️ 2026-10-09 迁移修正：kb 移入 minicare-platform/api 后，仓库根（docs/knowledge 所在）是
# minicare/ —— 原 `PROJECT_ROOT.parent` 解析成 minicare-platform 会断掉 source/out 目录
# （症状：/parsed 等文档详情 404、PDF 交叉校验静默跳过）。
REPO_ROOT = PROJECT_ROOT.parent.parent  # minicare/（仓库根）

# 源文件与产物目录（2026-10-03 修正：原指向不存在的 docs/敏宝知识库/*，
# 与仓库实际布局 docs/knowledge/source/{raw,mineru-parsed} 不符 —— 详见 TECH-015 §2.3）
DEFAULT_SOURCE_DIR = REPO_ROOT / "docs" / "knowledge" / "source" / "raw"
DEFAULT_OUT_DIR = REPO_ROOT / "docs" / "knowledge" / "source" / "mineru-parsed"

SOURCE_YAML = "yaml"
SOURCE_DEFAULT = "code-default"


class MineruConfig(BaseModel):
    base_url: str = "https://mineru.net"
    model_pdf: str = "pipeline"      # 引擎：pipeline（保真）/ vlm（丢数字，禁用）
    model_html: str = "MinerU-HTML"
    language: str = "ch"
    poll_interval_s: int = 8
    poll_timeout_s: int = 600
    batch_max: int = 50
    is_ocr: bool = False
    # 需开启 OCR 的扫描件清单（临时兜底；预检步骤落地后由逐页判定替代）
    ocr_files: list[str] = Field(default_factory=list)


class ChunkConfig(BaseModel):
    chunk_size: int = 600            # 字符（中文友好）
    chunk_overlap: int = 100
    max_section_chars: int = 1200    # 超过则降级递归切分
    header_path_separator: str = "/"


class ValidateConfig(BaseModel):
    enabled: bool = True
    pypdf_cross_check: bool = True   # 原 PDF 文字层交叉校验
    # 9 类数字缺失模式（正则）
    patterns: dict[str, str] = Field(
        default_factory=lambda: {
            "剂量缺值": r"为\s*次",
            "剂量缺值2": r"为\s*[∶:]\s*肾上腺素",
            "最大剂量缺值": r"最大剂量\s*[，。]",
            "百分比缺值": r"仅有\s*[^0-9%]{0,4}严重过敏反应",
            "重复次数缺值": r"重复注射\s*次",
            "年龄范围缺值": r"（\s*岁）",
            "儿童剂量缺值": r"儿童\s*[，,]\s*每次",
            "每次剂量缺值": r"每次\s*[，,]",
            "剂次缺值": r"需要\s*剂以上",
        }
    )
    # risk_level 关键词规则（命中→caution/emergency）
    risk_caution_keywords: list[str] = Field(
        default_factory=lambda: ["急救", "肾上腺素", "剂量", "禁忌", "监测"]
    )
    risk_emergency_keywords: list[str] = Field(
        default_factory=lambda: ["休克", "死亡", "禁用", "心跳呼吸骤停", "立即转诊"]
    )


class MetadataConfig(BaseModel):
    # 元信息 LLM 抽取的两个阈值（`pipeline.yaml` 的 `metadata:` 段是其权威来源）
    #
    # 为什么是一个"有界摘要"而不是全文：抽取要一次调用覆盖全部字段，喂全文既超预算也超上下文。
    # 折中方案 = 标题树（覆盖到尾部章节）+ 正文前 N 字（机构/年份/摘要最密集的地方）。
    # 因此结果里必须如实记录喂了多少、是否截断 —— 长文档尾部确实可能漏抽。
    llm_brief_chars: int = 12000
    # 归纳语料级 schema 时抽多少份文档当样本（跨国内/国际各取几份）
    llm_schema_samples: int = 6

    # 文件名 → (source, evidence_level, applicable_age) 映射表
    #
    # ⚠️ 迁移去向：本表属**业务数据**而非阈值，PRD-008 §19 D-04 要求台账只存 DB。
    #    按 TECH-015 §4.9 第 4 点，它将在第 3 期迁入 `kb_corpus`，届时 YAML 不再承担业务数据。
    #    在此之前保留在代码默认值（刻意不搬进 pipeline.yaml，避免两处维护与转写错漏）。
    doc_mapping: dict[str, list[str]] = Field(
        default_factory=lambda: {
            "严重过敏反应诊断和临床管理专家共识_2025": ["严重过敏反应诊断和临床管理专家共识(2025)", "consensus", ""],
            "2025_婴幼儿过敏性疾病预防健康教育专家共识": ["婴幼儿过敏性疾病预防健康教育专家共识(2025)", "consensus", ""],
            "中国婴儿轻中度非IgE介导CMPA指南_2022_用户提供": ["中国婴儿轻中度非IgE介导CMPA指南(2022)", "guideline", ""],
            "婴幼儿CMPA全程与序贯及主动营养管理策略_2025_用户提供": ["婴幼儿CMPA全程与序贯及主动营养管理策略(2025)", "consensus", ""],
            "AD外用共识_2025_特应性皮炎外用治疗与管理": ["特应性皮炎外用治疗与管理共识(2025)", "consensus", ""],
            "卫健委_婴幼儿营养喂养评估服务指南_试行_2024": ["婴幼儿营养喂养评估服务指南(试行)(2024)", "policy", ""],
            "广东_0-12月龄婴儿特殊营养需求喂养专家共识_2024": ["0-12月龄婴儿特殊营养需求喂养专家共识(2024)", "consensus", ""],
            # 国际
            "AAP_2025.10_早期引入与过敏模式": ["早期引入与过敏模式(AAP Pediatrics 2025)", "guideline", ""],
            "AAP_HealthyChildren_花生过敏预防指南": ["花生过敏预防指南(AAP HealthyChildren)", "edu", ""],
            "EAACI_2025_IgE食物过敏管理指南": ["IgE介导食物过敏管理指南(EAACI 2025)", "guideline", ""],
            "FDA_2021_早期引入花生健康声明": ["早期引入花生健康声明(FDA 2021)", "policy", ""],
            "LEAP-On_2016_花生回避": ["LEAP-On 花生回避研究(NEJM 2016)", "RCT", ""],
            "NIAID_2010_食物过敏指南": ["食物过敏诊断与管理指南(NIAID 2010)", "guideline", ""],
            "NIAID_2017_花生过敏预防增补": ["花生过敏预防增补指南(NIAID 2017)", "guideline", ""],
            "USDA_HHS_2025-2030膳食指南_摘要版_第10版": ["2025-2030膳食指南摘要版(USDA/HHS)", "policy", ""],
            "WAO_DRACMA_2012_牛奶蛋白过敏完整指南": ["牛奶蛋白过敏完整指南(WAO DRACMA 2012)", "guideline", ""],
            "WAO_DRACMA_2022_免疫治疗更新": ["牛奶蛋白过敏免疫治疗更新(WAO DRACMA 2022)", "guideline", ""],
            "WAO_DRACMA_2022_诊断更新": ["牛奶蛋白过敏诊断更新(WAO DRACMA 2022)", "guideline", ""],
            "WAO_White_Book_on_Allergy": ["过敏白皮书(WAO White Book)", "guideline", ""],
            "WHO_2023_辅食喂养指南": ["婴幼儿辅食喂养指南(WHO 2023)", "guideline", ""],
        }
    )


class StoreConfig(BaseModel):
    chunk_jsonl: Path = PROJECT_ROOT / "var" / "chunks.jsonl"
    review_report: Path = PROJECT_ROOT / "var" / "review.md"


class PlatformConfig(BaseModel):
    """平台运行态配置（TECH-015 §4.9 / §8.1）"""

    version: str = "0.2.0"           # 参与 cache_key（PRD D-11）
    parse_concurrency: int = 2       # 解析并发；本地步骤串行
    artifact_keep_runs: int = 3      # 非 current run 产物保留个数
    db_path: Path = PROJECT_ROOT / "data" / "platform.db"
    data_root: Path = PROJECT_ROOT / "data"


class PreflightConfig(BaseModel):
    """预检阈值（第 2 期接入）"""

    min_text_chars_per_page: int = 50
    scan_page_ratio_for_ocr: float = 0.3


class NoiseConfig(BaseModel):
    """噪声块规则（第 2 期接入，PRD §7.5）

    `empty_table_min_chars` 默认 8 而非 PRD 原定的 20：空表的**主判据是行数 ≤ 1**，
    字符数只用于兜 HTML 残渣；实测 20 会误杀短而有效的表格（2×2 剂量表仅 19 字）。
    `reference_tail_ratio` 默认 0.3 而非 PRD 原定的 0.2：位置用**块起始页**推导，
    对"横跨多页的大块"会系统性低估（实测 NIAID 的 References 块起始于 104/133 页
    = 0.782，却一直延续到文末），0.2 阈值判不到它。
    """

    reference_title_pattern: str = r"^(参考文献|引用文献|References?|Bibliography)$"
    reference_tail_ratio: float = 0.3
    empty_table_min_chars: int = 8
    page_furniture_max_chars: int = 40
    exclude_default: bool = True


class RegressionConfig(BaseModel):
    """检索质检门槛（第 4 期接入；PRD-011 扩展为五项指标 + 三态口径）

    · `recall_at_5_min` —— 新增参考门槛（@5 看"够不够准"，@10 看"够不够全"）
    · `emergency_min` / `emergency_gate` —— 高危必召回（emergency 题 gold 命中率）；
      默认纳入达标判定（100%），可关
    · `diag_depth` —— 诊断检索深度（归因用：最佳位次 ≤depth 内可归"排序问题"）
    · `metric_version` —— 指标口径版本：v1=旧的"非 gold 即有害"；v2=三态（只有 negative 记有害）。
      口径变更会让新旧数字不可直接比较，运行快照记录它、页面据此提示
    """

    recall_at_10_min: float = 0.95
    recall_at_5_min: float = 0.90
    harmful_recall_max: float = 0.10
    emergency_min: float = 1.00
    emergency_gate: bool = True
    diag_depth: int = 20
    metric_version: str = "v2-tri-state"
    page_anchor_min: float = 1.00
    gold_version: str = "v3-tri-state"


class PublishConfig(BaseModel):
    """发布前检查开关与快照保留（第 4 期接入）"""

    require_meta_complete: bool = True
    require_no_red_flags: bool = True
    require_excludes_confirmed: bool = True
    require_regression_pass: bool = True
    snapshot_keep: int = 5


class LlmConfig(BaseModel):
    """关键词生成预算（第 5 期接入）"""

    keyword_enabled: bool = True
    budget_calls_per_doc: int = 80
    budget_tokens_per_doc: int = 60000
    concurrency: int = 4
    prompt_version: str = "v1"


class TranslateConfig(BaseModel):
    """翻译步骤（TECH-019）：块级双语对 —— LLM 主路径 + 内容级缓存 + 降级不阻塞

    与 llm（关键词）分开成组：翻译是"重活"（块数多、token 多），预算与并发独立调。
    `glossary_path` 指向术语表数据文件（与 pipeline.yaml 分离：一个是阈值、一个是术语数据）。
    """

    enabled: bool = True
    prompt_version: str = "v1"
    # CJK 占比 ≥ 此值判为中文块 → 跳过（国内文档近零成本）
    skip_cjk_ratio: float = 0.5
    # 是否翻译被屏蔽块（默认否：参考文献等省 token；恢复屏蔽后重跑自然补齐）
    translate_excluded: bool = False
    # 单文档调用上限与 token 上限（超限剩余块标 failed，不中断）
    # ⚠️ 表格块（HTML 逐单元格翻译）输出 token 明显高于正文：实测一份 20 块的英文文档
    #    （含大表）≈ 15 万 token，故默认放宽到 40 万 —— 它是安全阀，不是成本闸。
    budget_calls_per_doc: int = 200
    budget_tokens_per_doc: int = 400000
    # 每块注入术语表的条数上限（控 token、保相关）
    max_glossary_hits: int = 20
    concurrency: int = 4
    # 术语表（业务数据文件；进 translate 参数 hash → 改表只重翻受影响块）
    glossary_path: Path = PROJECT_ROOT / "config" / "glossary.yaml"


class EvalConfig(BaseModel):
    """Agent 测评运行身份（TECH-021 增补；「全局配置」页可见可改）

    口径（用户定）：**ctx 中的用户信息是全局设置的，用例无需各自携带** ——
    `ctx`（userId / familyId / babyId）统一在此配置，运行物化（runner._materialize →
    `agent_eval/catalog.effective_ctx`）与用例导出时注入到每条用例，并覆盖用例内同名的
    用户键；全局未配置（全空）时回落用例自带值（兼容旧数据）。空值键按"未设置"处理。
    """

    ctx: dict[str, str] = Field(default_factory=dict)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    # 密钥（仅 .env）
    mineru_api_token: str = ""
    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_user: str = ""
    db_password: str = ""
    db_name: str = "minicare_dev"
    hunyuan_api_key: str = ""
    # TokenHub API Key（sk- 开头，OpenAI 兼容接口；混元老平台已停止新购）
    tokenhub_api_key: str = ""
    # TokenHub 向量模型：kinfra-text-embedding-0.6b（1024 维，默认）/ kinfra-text-embedding-4b（2560 维）
    tokenhub_embedding_model: str = "kinfra-text-embedding-0.6b"
    # LLM（OpenAI 兼容；关键词抽取 / 元信息抽取用）
    #
    # ⚠️ 这几个**必须走 Settings**（pydantic-settings 的 env_file），不能用 `os.environ.get()`：
    #    `env_file` 只把 .env 填进 Settings 字段，**不会导出到 os.environ** ——
    #    之前 `keywords.py` 用 `os.environ.get("DEEPSEEK_API_KEY")`，于是在服务/CLI 进程里
    #    它永远为空，关键词 LLM 路径**一直静默降级为规则抽取**（实测 2026-10-04）。
    #    环境变量仍可覆盖（pydantic-settings 大小写不敏感：DEEPSEEK_API_KEY / KB_LLM_BASE_URL）。
    deepseek_api_key: str = ""
    kb_llm_base_url: str = "https://api.deepseek.com"
    kb_llm_model: str = "deepseek-v4-flash"
    # 混元 embedding 凭证（TC3 签名；缺省回落 TCB_SECRET_ID/KEY）
    hunyuan_secret_id: str = ""
    hunyuan_secret_key: str = ""
    tcb_secret_id: str = ""
    tcb_secret_key: str = ""
    tcb_ai_secret_id: str = ""
    tcb_ai_secret_key: str = ""

    # 路径（默认指向仓库 docs/knowledge/source）
    source_dir: Path = DEFAULT_SOURCE_DIR
    out_dir: Path = DEFAULT_OUT_DIR

    # 子配置（yaml）——字段名避开 pydantic 保留字
    mineru_cfg: MineruConfig = MineruConfig()
    chunk_cfg: ChunkConfig = ChunkConfig()
    validate_cfg: ValidateConfig = ValidateConfig()
    metadata_cfg: MetadataConfig = MetadataConfig()
    store_cfg: StoreConfig = StoreConfig()
    platform_cfg: PlatformConfig = PlatformConfig()
    preflight_cfg: PreflightConfig = PreflightConfig()
    noise_cfg: NoiseConfig = NoiseConfig()
    regression_cfg: RegressionConfig = RegressionConfig()
    publish_cfg: PublishConfig = PublishConfig()
    llm_cfg: LlmConfig = LlmConfig()
    translate_cfg: TranslateConfig = TranslateConfig()
    eval_cfg: EvalConfig = EvalConfig()

    # ── 观测（Langfuse，TECH-030）──
    # 口径（2026-10-11 用户拍板）：**平台 = 观测服务的控制面** —— 负责 Langfuse 栈的
    # 启停编排（本机 Docker / colima）与 FlexDB → Langfuse 数据同步；pk/sk 密钥在平台 .env。
    # `obs_unit_dir` 指向「观测运行单元」（compose + 同步脚本）所在目录：默认 minicare-agent/，
    # 为 Electron 打包留注入点（打包后指向随包分发的内置副本，见 TECH-030 §3.1）。
    obs_enabled: bool = True
    obs_autostart: bool = True          # 平台启动时自动拉起观测栈（异步，不阻塞平台）
    obs_stop_on_exit: bool = True       # 平台退出时停止观测栈容器（保留数据卷；--reload 开发模式跳过）
    obs_unit_dir: Path = REPO_ROOT / "minicare-agent"
    obs_compose_file: str = ""          # 空 = {obs_unit_dir}/langfuse/docker-compose.yml
    obs_langfuse_port: int = 3100       # Langfuse Web 宿主端口（compose 端口映射）
    obs_langfuse_public_url: str = "http://localhost:3100"  # 打开 UI / trace 深链接的地址
    obs_pg_port: int = 5433             # Langfuse Postgres 宿主端口
    obs_docker_cli: str = ""            # 空 = 自动探测（PATH / Homebrew / Docker Desktop 常见路径）
    # Langfuse 凭据（同步子进程注入；D-5：平台为单一控制面，缺省时回落 agent .env.local）
    langfuse_host: str = "http://localhost:3100"
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""

    # 每个配置分组的来源（yaml / code-default），不做校验、不进序列化
    _sources: dict[str, str] = PrivateAttr(default_factory=dict)
    _config_file: str = PrivateAttr(default="")
    _yaml_loaded: bool = PrivateAttr(default=False)

    def source_of(self, group: str) -> str:
        """查询某配置分组的来源，如 'chunk' → 'yaml'"""
        return self._sources.get(group, SOURCE_DEFAULT)

    @property
    def config_file(self) -> str:
        return self._config_file

    @property
    def yaml_loaded(self) -> bool:
        """YAML 是否真的被读取并合并（false 表示全走代码默认值）"""
        return self._yaml_loaded


# YAML 节名 → Settings 字段名
SECTION_MAP: dict[str, str] = {
    "mineru": "mineru_cfg",
    "chunk": "chunk_cfg",
    "validate": "validate_cfg",
    "metadata": "metadata_cfg",
    "store": "store_cfg",
    "platform": "platform_cfg",
    "preflight": "preflight_cfg",
    "noise": "noise_cfg",
    "regression": "regression_cfg",
    "publish": "publish_cfg",
    "llm": "llm_cfg",
    "translate": "translate_cfg",
    "eval": "eval_cfg",
}


def load_settings(config_file: Path | None = None, env_file: str | None = None) -> Settings:
    """无缓存加载配置（热重载与测试用）。

    Args:
        config_file: 显式指定 YAML；缺省用 CONFIG_FILE（可用环境变量 KB_CONFIG_FILE 覆盖）
        env_file: 显式指定 .env；传空字符串可禁用（测试用）
    """
    cfg_path = config_file or Path(os.environ.get("KB_CONFIG_FILE") or CONFIG_FILE)
    kwargs: dict = {}
    if env_file is not None:
        kwargs["_env_file"] = env_file or None
    s = Settings(**kwargs)
    object.__setattr__(s, "_config_file", str(cfg_path))
    object.__setattr__(s, "_yaml_loaded", False)
    sources = {group: SOURCE_DEFAULT for group in SECTION_MAP}
    sources["__keys__"] = SOURCE_DEFAULT

    if cfg_path.exists():
        import yaml

        with open(cfg_path, encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        for yaml_key, field_name in SECTION_MAP.items():
            if yaml_key not in data or data[yaml_key] is None:
                continue
            cur = getattr(s, field_name)
            # model_validate 会做类型转换（Path/int/float）；model_copy 不会
            merged = type(cur).model_validate({**cur.model_dump(), **data[yaml_key]})
            object.__setattr__(s, field_name, merged)
            sources[yaml_key] = SOURCE_YAML
        object.__setattr__(s, "_yaml_loaded", True)
        # 未被任何分组消费的顶层键（拼写错误兜底提示）
        unknown = [k for k in data if k not in SECTION_MAP]
        sources["__keys__"] = ",".join(unknown) if unknown else SOURCE_YAML
    object.__setattr__(s, "_sources", sources)
    return s


@lru_cache
def get_settings() -> Settings:
    """进程内缓存的配置读取（业务代码统一用这个）"""
    return load_settings()


def reload_settings() -> Settings:
    """清缓存并重读（改 YAML 后热生效）"""
    get_settings.cache_clear()
    return get_settings()


def get_active_sources() -> dict[str, str]:
    """当前生效配置的分组来源表"""
    s = get_settings()
    return {g: s.source_of(g) for g in SECTION_MAP}


def effective_thresholds(s: Settings | None = None) -> list[dict[str, str]]:
    """生效阈值表：[(分组, 配置项, 生效值, 来源)]，供启动打印与测试断言。"""
    s = s or get_settings()
    rows: list[dict[str, str]] = []
    groups = [
        ("mineru", s.mineru_cfg),
        ("chunk", s.chunk_cfg),
        ("validate", s.validate_cfg),
        ("platform", s.platform_cfg),
        ("preflight", s.preflight_cfg),
        ("noise", s.noise_cfg),
        ("regression", s.regression_cfg),
        ("publish", s.publish_cfg),
        ("llm", s.llm_cfg),
        ("translate", s.translate_cfg),
        # 元信息 LLM 抽取的两个阈值。顺带把 `doc_mapping` 也带出来（显示为 `<dict len=N>`）——
        # 它此前在界面上完全不可见，而它恰恰是当前切片元信息的实际来源（见 MEMORY 的元信息链路一节）。
        ("metadata", s.metadata_cfg),
        # Agent 测评全局身份（pipeline.yaml 的 `eval:` 段；「全局配置」页可改）
        ("eval", s.eval_cfg),
    ]
    for group, cfg in groups:
        src = s.source_of(group)
        for key, value in cfg.model_dump().items():
            if isinstance(value, (list, dict)) and len(value) > 3:
                shown = f"<{type(value).__name__} len={len(value)}>"
            else:
                shown = str(value)
            rows.append({"group": group, "key": key, "value": shown, "source": src})
    return rows


def format_effective_table(s: Settings | None = None) -> str:
    """启动打印用的生效阈值表（含 YAML 是否生效的显著提示）"""
    s = s or get_settings()
    lines = [f"[config] 配置文件 {s.config_file}"]
    if not s.yaml_loaded:
        lines.append("[config] ⚠️ YAML 未生效（文件不存在或为空），以下全部为代码默认值")
    else:
        lines.append("[config] ✔ YAML 已生效；来源列标注每个分组的实际来源")
    rows = effective_thresholds(s)
    width_key = max((len(r["key"]) for r in rows), default=0)
    cur_group = ""
    for r in rows:
        if r["group"] != cur_group:
            cur_group = r["group"]
            lines.append(f"  ── {cur_group}  (来源: {r['source']})")
        lines.append(f"     {r['key']:<{width_key}}  {r['value']}")
    return "\n".join(lines)
