"""配置加载：config/default.yaml + .env（pydantic-settings）"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]  # minicare-kb/
CONFIG_FILE = PROJECT_ROOT / "config" / "default.yaml"
REPO_ROOT = PROJECT_ROOT.parent  # minicare-v1/
DEFAULT_SOURCE_DIR = REPO_ROOT / "docs" / "敏宝知识库" / "源文件"
DEFAULT_OUT_DIR = REPO_ROOT / "docs" / "敏宝知识库" / "minerU解析版本"


class MineruConfig(BaseModel):
    base_url: str = "https://mineru.net"
    model_pdf: str = "pipeline"      # 引擎：pipeline（保真）/ vlm（丢数字，禁用）
    model_html: str = "MinerU-HTML"
    language: str = "ch"
    poll_interval_s: int = 8
    poll_timeout_s: int = 600
    batch_max: int = 50
    is_ocr: bool = False
    # 需开启 OCR 的扫描件清单（文件名，可配）
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
    # 文件名 → (source, evidence_level, applicable_age) 映射表（可扩展）
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
    # 混元 embedding 凭证（TC3 签名；缺省回落 TCB_SECRET_ID/KEY）
    hunyuan_secret_id: str = ""
    hunyuan_secret_key: str = ""
    tcb_secret_id: str = ""
    tcb_secret_key: str = ""
    tcb_ai_secret_id: str = ""
    tcb_ai_secret_key: str = ""

    # 路径（默认指向仓库 docs/敏宝知识库）
    source_dir: Path = DEFAULT_SOURCE_DIR
    out_dir: Path = DEFAULT_OUT_DIR

    # 子配置（yaml）——字段名避开 pydantic 保留字
    mineru_cfg: MineruConfig = MineruConfig()
    chunk_cfg: ChunkConfig = ChunkConfig()
    validate_cfg: ValidateConfig = ValidateConfig()
    metadata_cfg: MetadataConfig = MetadataConfig()
    store_cfg: StoreConfig = StoreConfig()


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    # 加载 yaml 覆盖默认值（yaml 节名 → Settings 字段映射）
    if CONFIG_FILE.exists():
        import yaml

        with open(CONFIG_FILE, encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        section_map = {
            "mineru": "mineru_cfg",
            "chunk": "chunk_cfg",
            "validate": "validate_cfg",
            "metadata": "metadata_cfg",
            "store": "store_cfg",
        }
        for yaml_key, field_name in section_map.items():
            if yaml_key in data:
                cur = getattr(s, field_name)
                merged = cur.model_copy(update=data[yaml_key])
                object.__setattr__(s, field_name, merged)
    return s
