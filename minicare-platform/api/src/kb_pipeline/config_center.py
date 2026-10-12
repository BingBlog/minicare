"""配置中心：全局配置的读取 / 校验 / 写回（「全局配置」页的后端单一入口）

背景（2026-10-09，用户需求：原「生效阈值」页升级为「全局配置」）：
  · 读 —— 由「只看管线条数（yaml 分组）」扩展为**全量明细**：
    每个分组 × 每个字段的 { 生效值, 代码默认值, 是否写入 yaml, 中文说明 }，
    外加 `.env` 侧的密钥与环境变量（掩码显示、已配置状态、来源）。
  · 写 —— 在线修改并**写回原文件**：
    - `config/pipeline.yaml` 走 ruamel 往返（**注释与排版是文档，必须原样保留**）；
    - `.env` 走行级替换（同样保留其余注释）；
    - 写前备份（`data/config_backups/`，同名保留最近 20 份）+ 整体校验（任何一项非法 → 全量拒绝）；
    - 写后 `reload_settings()` 热重载 —— `get_settings` 是 lru_cache，清缓存即生效，无需重启。

2026-10-11（用户要求：配置页「按 知识库 / Agent 测评 / 观测 等分类展示」）：
  · 每个分组（`GROUP_META.domain`）与每个 .env 项（`ENV_ITEMS[i].domain`）声明**平台域归属**，
    `build_detail` 原样下发 —— 前端 `Config.tsx` 按域分列左导航（含各域的「密钥与环境变量」）；
  · 域取值与前端 `web/src/nav.ts` 的层级 id 对齐（kb/eval/signal/obs/platform），缺省落 kb。

⚠️ 两条安全护栏（写 yaml 时强制）：
  1. **注释行数不允许减少** —— 出过真实事故：用普通 dict 整体替换 `patterns` 节时，
     紧随其后的注释块被挤掉。发现即中止写入；
  2. **写盘后语义回读** —— 重新 parse 写出的文本，逐项断言新值确实落在目标键上。

⚠️ 环境变量写值是「会让 Settings 加载失败的值」的严格守卫（如 DB_PORT 非数字）：
  一旦 `Settings()` 实例化抛错，所有请求（包括本页）都会 500，届时**无法再从界面修复**。
  因此宁可拒绝写入，也不允许坏值进 `.env`。

只读字段：`metadata.doc_mapping`（业务数据，PRD-008 §19 D-04 要求迁入 kb_corpus，
迁完之前刻意不进 yaml，见 pipeline.yaml 顶部注释）—— 界面可见、不可改。
"""
from __future__ import annotations

import io
import os
import re
import shutil
import time
from pathlib import Path
from typing import Any

import yaml as _pyyaml
from pydantic import BaseModel, ValidationError

from .config import (
    DEFAULT_OUT_DIR,
    DEFAULT_SOURCE_DIR,
    PROJECT_ROOT,
    REPO_ROOT,
    SECTION_MAP,
    SOURCE_DEFAULT,
    SOURCE_YAML,
    Settings,
    get_settings,
    reload_settings,
)

__all__ = ["ConfigError", "build_detail", "save_config", "read_raw_file"]


class ConfigError(ValueError):
    """配置中心的用户可见错误（路由层转 422；文案直接展示给用户）"""


# ── 分组元信息（中文名 + 一句话说明 + 平台域归属）─────────────────────────
#
# `domain` = 配置页左导航的**分类依据**（2026-10-11 用户要求「按 知识库 / Agent 测评 /
# 观测 等分类展示」）：取值与前端 `web/src/nav.ts` 的层级 id 对齐 ——
#   kb 知识库 · eval Agent 测评 · signal 信号管理 · obs 观测 · platform 平台级
# 前端按此分列并映射中文名（顺序 = 顶栏域顺序，platform 殿后）；缺省落 kb。

GROUP_META: dict[str, dict[str, str]] = {
    "mineru": {
        "domain": "kb",
        "label": "解析（MinerU 云端）",
        "note": "PDF / HTML → Markdown/JSON 的云端解析；引擎选择直接决定数字保真度，改动后需重跑 parse。",
    },
    "chunk": {
        "domain": "kb",
        "label": "切块",
        "note": "切片粒度与降级策略；参数进 segment 缓存键 —— 改动只影响切块及其下游（翻译/索引）。",
    },
    "validate": {
        "domain": "kb",
        "label": "内容复核（医疗安全门禁）",
        "note": "数字缺失模式库 + 风险分级关键词；命中 → 进人工复核，不进检索。",
    },
    "metadata": {
        "domain": "kb",
        "label": "元信息抽取",
        "note": "LLM 抽取的预算与样本；doc_mapping 属业务数据（只读，将迁入台账）。",
    },
    "store": {
        "domain": "kb",
        "label": "存储路径",
        "note": "CLI 落盘位置（切片 JSONL / 复核报告），相对路径基于 api/ 目录。",
    },
    "platform": {
        "domain": "platform",
        "label": "平台运行态",
        "note": "版本号参与全部步骤的缓存键；解析并发与产物保留轮数。",
    },
    "preflight": {
        "domain": "kb",
        "label": "预检",
        "note": "逐页文字层判定：扫描页识别与 OCR 档位推荐。",
    },
    "noise": {
        "domain": "kb",
        "label": "噪声块规则",
        "note": "参考文献 / 页眉页脚 / 空表的自动屏蔽规则；人工恢复优先于规则。",
    },
    "regression": {
        "domain": "kb",
        "label": "检索质检门槛",
        "note": "质检台达标判定口径；emergency 高危项默认纳入发布闸门。",
    },
    "publish": {
        "domain": "kb",
        "label": "发布检查",
        "note": "发布前四项检查开关与快照保留轮数。",
    },
    "llm": {
        "domain": "kb",
        "label": "LLM 预算（关键词）",
        "note": "关键词生成的开销上限；超限自动降级为规则抽取并告警。",
    },
    "translate": {
        "domain": "kb",
        "label": "翻译",
        "note": "第 7 步块级双语；术语表为独立数据文件（config/glossary.yaml）。",
    },
    "eval": {
        "domain": "eval",
        "label": "Agent 测评 · 全局身份",
        "note": "用例运行时的 ctx 用户信息（userId / familyId / babyId）统一在此设置；运行物化时注入每条用例，覆盖用例内同名键。",
    },
}


# ── 字段元信息（中文标签 / 说明 / 警示）──────────────────────────────────
# 只维护"人可以读的文案"，不重复声明类型与取值范围（那是 pydantic 模型的职责，
# 且写回前会走模型校验）。新增字段不补这里也能用：label 兜底显示原始 key。

FIELD_META: dict[str, dict[str, dict[str, Any]]] = {
    "mineru": {
        "base_url": {"label": "服务地址", "desc": "MinerU 云端解析服务地址（官方 https://mineru.net）"},
        "model_pdf": {
            "label": "PDF 解析引擎",
            "desc": "pipeline = 文字层保真、低幻觉（医疗文档推荐）；vlm = 视觉大模型",
            "warn": "不要改成 vlm：实测丢剂量数字（如 0.5mg/次、25%），与官方基准高分相悖",
        },
        "model_html": {"label": "HTML 解析引擎", "desc": "HTML 来源文档使用的解析引擎（MinerU-HTML）"},
        "language": {"label": "文档语言", "desc": "OCR / 版面模型的语言档位；本项目语料为中文（ch）"},
        "poll_interval_s": {"label": "轮询间隔（秒）", "desc": "提交解析任务后查询状态的间隔"},
        "poll_timeout_s": {"label": "轮询超时（秒）", "desc": "超过该时长仍未完成则判为解析失败"},
        "batch_max": {"label": "批量上限", "desc": "单次批量提交的文档数上限"},
        "is_ocr": {"label": "全局强制 OCR", "desc": "true = 所有文件强制走 OCR（兜底开关；一般交给预检逐页判定）"},
        "ocr_files": {"label": "强制 OCR 文件清单", "desc": "需要强制 OCR 的文件名清单（临时兜底；预检落地后由逐页判定替代）"},
    },
    "chunk": {
        "max_section_chars": {"label": "章节降级阈值（字符）", "desc": "章节超过该长度则降级为按空行段落递归切分"},
        "chunk_size": {"label": "兜底切片长度（字符）", "desc": "定长兜底预留 —— 当前切块按章节/段落边界，不按字符数"},
        "chunk_overlap": {"label": "兜底切片重叠（字符）", "desc": "同上，定长兜底预留，当前路径不使用"},
        "header_path_separator": {"label": "标题路径分隔符", "desc": "header_path 的连接符（如 一级/二级/三级）"},
    },
    "validate": {
        "enabled": {"label": "启用复核", "desc": "关闭后数字缺失模式不再检测（不建议；医疗安全门禁）"},
        "pypdf_cross_check": {"label": "PDF 文字层交叉校验", "desc": "用原 PDF 文字层为缺失数字提供候选值，供人工核对"},
        "patterns": {
            "label": "数字缺失模式库",
            "desc": "每项 = 一条正则（键名是给人读的缺陷类型）；命中 → retrieval_status=review 不进检索",
        },
        "risk_caution_keywords": {"label": "风险关键词 · caution", "desc": "命中 → 风险等级 caution（需留意）"},
        "risk_emergency_keywords": {"label": "风险关键词 · emergency", "desc": "命中 → 风险等级 emergency（最高危）"},
    },
    "metadata": {
        "llm_brief_chars": {
            "label": "LLM 摘要上限（字符）",
            "desc": "喂给抽取 LLM 的正文上限（标题树 + 正文前 N 字）；长文档尾部可能漏抽，结果会记录实际喂入量与截断",
        },
        "llm_schema_samples": {"label": "Schema 归纳样本数", "desc": "归纳语料级共享 schema 时抽取的样本文档份数"},
        "doc_mapping": {
            "label": "文件名映射表（业务数据）",
            "desc": "文件名 → 来源 / 证据级别 / 适用年龄。属业务数据，计划迁入 kb_corpus 台账，当前只读",
        },
    },
    "store": {
        "chunk_jsonl": {"label": "切片 JSONL 路径", "desc": "CLI 导出的切片落盘位置（相对路径基于 api/ 目录）"},
        "review_report": {"label": "复核报告路径", "desc": "CLI 复核报告（Markdown）落盘位置"},
    },
    "platform": {
        "version": {
            "label": "平台代码版本",
            "desc": "参与全部步骤的 cache_key（PRD D-11：避免「代码改了但缓存还命中」）",
            "warn": "改动会让缓存整体失效 —— parse 也会重跑（= 全库重新调 MinerU）。仅随平台代码升级同步修改",
        },
        "parse_concurrency": {"label": "解析并发度", "desc": "parse 步骤（IO 密集）的并发度；本地步骤（清洗/切块/复核/索引）始终串行"},
        "artifact_keep_runs": {"label": "产物保留轮数", "desc": "每步非 current run 的产物保留个数（raw/ 与 edits/ 除外，永不清理）"},
        "db_path": {
            "label": "平台台账数据库",
            "desc": "本机 SQLite 路径（队列 / 台账 / 质检 / 发布记录）",
            "warn": "改错会连到空台账：文档列表、质检历史、发布记录会'凭空消失'（其实是换了库）",
        },
        "data_root": {"label": "产物根目录", "desc": "平台自管数据根（评估运行产物等）；相对仓库根", "warn": "改动前确认目标目录存在且可写"},
    },
    "preflight": {
        "min_text_chars_per_page": {"label": "扫描页判定阈值（字符/页）", "desc": "单页文字层字符数低于该值 → 判为扫描页"},
        "scan_page_ratio_for_ocr": {"label": "OCR 判定占比", "desc": "扫描页占比高于该值 → 建议档位锁定含 OCR"},
    },
    "noise": {
        "reference_title_pattern": {"label": "参考文献标题正则", "desc": "完全匹配该正则的标题判为参考文献块"},
        "reference_tail_ratio": {
            "label": "参考文献位置阈值",
            "desc": "块起始页位于文档后 N 分之 1 才判参考文献（0.3 = 后 30%）",
        },
        "empty_table_min_chars": {"label": "空表辅助阈值（字符）", "desc": "主判据是行数 ≤ 1；此值只兜 HTML 残渣（实测 20 会误杀 19 字的剂量表）"},
        "page_furniture_max_chars": {"label": "页眉页脚长度上限（字符）", "desc": "短于该长度的页眉/页脚块判为装饰性内容"},
        "exclude_default": {"label": "默认屏蔽", "desc": "false = 只标记不屏蔽（规则上线前的试跑核对用）"},
    },
    "regression": {
        "recall_at_10_min": {"label": "Recall@10 门槛", "desc": "质检达标线：够不够全（默认 0.95）"},
        "recall_at_5_min": {"label": "Recall@5 门槛", "desc": "参考门槛：够不够准（默认 0.90）"},
        "harmful_recall_max": {"label": "有害召回上限", "desc": "top-k 中命中 negative 的比例上限（默认 0.10）"},
        "emergency_min": {"label": "高危必召回门槛", "desc": "emergency 题 gold 命中率（默认 1.00 = 必须全中）"},
        "emergency_gate": {"label": "高危项纳入闸门", "desc": "false = 高危指标只展示、不阻塞发布"},
        "diag_depth": {"label": "诊断检索深度", "desc": "归因用：最佳位次 ≤ depth 归「排序问题」，否则归「覆盖缺口」"},
        "metric_version": {"label": "指标口径版本", "desc": "v1 = 非 gold 即有害；v2 = 三态（仅 negative 记有害）。口径变更须留痕"},
        "page_anchor_min": {"label": "页码锚定门槛", "desc": "质检中页码锚定命中率门槛（默认 1.00）"},
        "gold_version": {"label": "gold 口径版本", "desc": "测试集三态标注口径版本（变更须留痕，避免把口径变化误读为质量变化）"},
    },
    "publish": {
        "require_meta_complete": {"label": "要求元数据完整", "desc": "必填元数据缺失 → 发布前检查拦截"},
        "require_no_red_flags": {"label": "要求无高危数字缺失", "desc": "高危数字复核未清零 → 拦截"},
        "require_excludes_confirmed": {"label": "要求屏蔽已确认", "desc": "噪声块屏蔽清单未确认 → 拦截"},
        "require_regression_pass": {"label": "要求质检达标", "desc": "检索质检未通过 → 拦截"},
        "snapshot_keep": {"label": "快照保留个数", "desc": "发布快照的保留轮数"},
    },
    "llm": {
        "keyword_enabled": {"label": "关键词生成开关", "desc": "关闭后索引步骤降级为规则抽取（不调 LLM）"},
        "budget_calls_per_doc": {"label": "单文档调用上限", "desc": "超限降级为规则抽取并告警"},
        "budget_tokens_per_doc": {"label": "单文档 token 上限", "desc": "同上；两者先到先算"},
        "concurrency": {"label": "并发度", "desc": "关键词按块调用 LLM 的并发度"},
        "prompt_version": {"label": "Prompt 版本", "desc": "进缓存参数；改动会重跑关键词抽取"},
    },
    "translate": {
        "enabled": {"label": "启用翻译", "desc": "第 7 步（块级双语对）；关闭则整步跳过"},
        "prompt_version": {"label": "Prompt 版本", "desc": "进缓存参数；改动会重跑翻译"},
        "skip_cjk_ratio": {"label": "中文块跳过阈值", "desc": "CJK 占比 ≥ 此值判为中文块 → 跳过（国内文档近零成本）"},
        "translate_excluded": {"label": "翻译被屏蔽块", "desc": "默认否：参考文献等省 token；恢复屏蔽后重跑自然补齐"},
        "budget_calls_per_doc": {"label": "单文档调用上限", "desc": "超限剩余块标 failed，不中断；重跑只补未译块"},
        "budget_tokens_per_doc": {"label": "单文档 token 上限", "desc": "表格块按单元格翻译 token 明显更高（默认 40 万是安全阀，不是成本闸）"},
        "max_glossary_hits": {"label": "术语表注入上限", "desc": "每块注入术语表的条数上限（控 token、保相关）"},
        "concurrency": {"label": "并发度", "desc": "翻译按块调用 LLM 的并发度"},
        "glossary_path": {"label": "术语表路径", "desc": "业务数据文件（config/glossary.yaml）；其 hash 进缓存参数，改表只重翻受影响块"},
    },
    "eval": {
        "ctx": {
            "label": "运行身份 ctx",
            "desc": "评测运行的固定用户身份（userId / familyId / babyId，UUID 字符串）。用例无需设置，运行时自动注入；留空键按未设置处理",
        },
    },
}

# 只读字段（界面可见、不可在线修改）
READONLY_FIELDS: set[tuple[str, str]] = {("metadata", "doc_mapping")}


# ── 环境变量（.env）元信息 ──────────────────────────────────────────────
# `field` = Settings 的字段名（唯一消费口径）；`secret` = 界面掩码显示；
# `domain` = 配置页左导航的分类（与 GROUP_META 同口径：kb / eval / obs / platform）。
# 顺序即界面展示顺序：凭证在前、连接与路径在后。

ENV_ITEMS: list[dict[str, Any]] = [
    {
        "key": "MINERU_API_TOKEN", "field": "mineru_api_token", "secret": True, "domain": "kb",
        "label": "MinerU 解析 Token",
        "desc": "配置后「解析」步骤可用；未配置时上传的文档无法跑 parse（本机已有产物不受影响）",
    },
    {
        "key": "DEEPSEEK_API_KEY", "field": "deepseek_api_key", "secret": True, "domain": "kb",
        "label": "LLM 密钥（DeepSeek）",
        "desc": "关键词抽取 / 元信息抽取 / 翻译等 LLM 调用（OpenAI 兼容）",
    },
    {
        "key": "TOKENHUB_API_KEY", "field": "tokenhub_api_key", "secret": True, "domain": "kb",
        "label": "向量化密钥（TokenHub）",
        "desc": "检索 query / 入库 content 的 embedding；未配置时检索与质检的向量路降级",
    },
    {
        "key": "HUNYUAN_API_KEY", "field": "hunyuan_api_key", "secret": True, "domain": "kb",
        "label": "混元 API Key（旧平台）",
        "desc": "兼容旧配置保留；新购请用 TokenHub（混元老平台已停止新购）",
    },
    {
        "key": "HUNYUAN_SECRET_ID", "field": "hunyuan_secret_id", "secret": True, "domain": "kb",
        "label": "混元 SecretId（TC3 签名）", "desc": "混元 embedding 的 TC3 签名凭证（ID 侧）",
    },
    {
        "key": "HUNYUAN_SECRET_KEY", "field": "hunyuan_secret_key", "secret": True, "domain": "kb",
        "label": "混元 SecretKey（TC3 签名）", "desc": "混元 embedding 的 TC3 签名凭证（Key 侧）",
    },
    {
        "key": "TCB_SECRET_ID", "field": "tcb_secret_id", "secret": True, "domain": "kb",
        "label": "腾讯云 SecretId", "desc": "embedding TC3 签名的缺省回落凭证",
    },
    {
        "key": "TCB_SECRET_KEY", "field": "tcb_secret_key", "secret": True, "domain": "kb",
        "label": "腾讯云 SecretKey", "desc": "同上（Key 侧）",
    },
    {
        "key": "TCB_AI_SECRET_ID", "field": "tcb_ai_secret_id", "secret": True, "domain": "kb",
        "label": "腾讯云 AI SecretId", "desc": "AI 能力专用凭证（缺省回落 TCB_SECRET_ID）",
    },
    {
        "key": "TCB_AI_SECRET_KEY", "field": "tcb_ai_secret_key", "secret": True, "domain": "kb",
        "label": "腾讯云 AI SecretKey", "desc": "同上（Key 侧）",
    },
    {
        "key": "KB_LLM_BASE_URL", "field": "kb_llm_base_url", "secret": False, "domain": "kb",
        "label": "LLM 接口地址", "desc": "OpenAI 兼容接口；默认 https://api.deepseek.com",
    },
    {
        "key": "KB_LLM_MODEL", "field": "kb_llm_model", "secret": False, "domain": "kb",
        "label": "LLM 模型名", "desc": "默认 deepseek-v4-flash",
    },
    {
        "key": "TOKENHUB_EMBEDDING_MODEL", "field": "tokenhub_embedding_model", "secret": False, "domain": "kb",
        "label": "嵌入模型", "desc": "kinfra-text-embedding-0.6b（1024 维，默认）/ kinfra-text-embedding-4b（2560 维）",
    },
    {
        "key": "DB_HOST", "field": "db_host", "secret": False, "domain": "kb",
        "label": "知识库数据库地址", "desc": "CynosDB（腾讯云 MySQL）；质检 / 契约 / 发布前检查读它",
    },
    {"key": "DB_PORT", "field": "db_port", "secret": False, "domain": "kb", "label": "数据库端口", "desc": "默认 3306（必须为数字）"},
    {
        "key": "DB_NAME", "field": "db_name", "secret": False, "domain": "kb",
        "label": "数据库名",
        "desc": "当前目标库；dev = minicare_dev",
        "warn": "必须保持 minicare_dev —— 指向正式库会让「发布回滚」变成对正式库的全表清空重建（本页已硬拦 minicare-cloud-* 库名）",
    },
    {"key": "DB_USER", "field": "db_user", "secret": False, "domain": "kb", "label": "数据库用户", "desc": ""},
    {"key": "DB_PASSWORD", "field": "db_password", "secret": True, "domain": "kb", "label": "数据库密码", "desc": ""},
    {
        "key": "SOURCE_DIR", "field": "source_dir", "secret": False, "domain": "kb", "default": str(DEFAULT_SOURCE_DIR),
        "label": "源文件目录", "desc": "上传入口目录（喂给 MinerU 的源 PDF / HTML 所在）",
    },
    {
        "key": "OUT_DIR", "field": "out_dir", "secret": False, "domain": "kb", "default": str(DEFAULT_OUT_DIR),
        "label": "解析产物目录", "desc": "MinerU 解析产物的扫描目录（文档列表从这里读）",
    },
    # ── 观测（Langfuse，TECH-030）──
    # 平台 = 观测服务控制面：启停编排 + 数据同步；密钥（pk/sk）也在这里维护。
    {
        "key": "OBS_ENABLED", "field": "obs_enabled", "secret": False, "domain": "obs", "default": "True",
        "label": "观测域开关", "desc": "关闭后平台不再编排观测栈（观测页提示已关闭）",
    },
    {
        "key": "OBS_AUTOSTART", "field": "obs_autostart", "secret": False, "domain": "obs", "default": "True",
        "label": "随平台自动启动", "desc": "平台启动时自动拉起 Langfuse 观测栈（需要本机 Docker / colima）",
    },
    {
        "key": "OBS_STOP_ON_EXIT", "field": "obs_stop_on_exit", "secret": False, "domain": "obs", "default": "True",
        "label": "随平台退出停止", "desc": "平台退出时停止观测栈容器（保留数据卷，下次启动直接复用；开发 --reload 模式自动跳过）",
    },
    {
        "key": "OBS_LANGFUSE_PORT", "field": "obs_langfuse_port", "secret": False, "domain": "obs", "default": "3100",
        "label": "Langfuse 端口", "desc": "Langfuse Web 的宿主端口（默认 3100，须为 1~5 位数字）",
    },
    {
        "key": "OBS_LANGFUSE_PUBLIC_URL", "field": "obs_langfuse_public_url", "secret": False, "domain": "obs",
        "default": "http://localhost:3100",
        "label": "Langfuse 访问地址", "desc": "打开观测 UI 与 trace 深链接使用的地址（默认本机）",
    },
    {
        "key": "OBS_UNIT_DIR", "field": "obs_unit_dir", "secret": False, "domain": "obs",
        "label": "观测运行单元目录", "desc": "Langfuse compose 与同步脚本所在目录（默认 minicare-agent/；桌面版打包后指向内置副本）",
    },
    {
        "key": "LANGFUSE_HOST", "field": "langfuse_host", "secret": False, "domain": "obs", "default": "http://localhost:3100",
        "label": "Langfuse 服务地址（同步用）", "desc": "数据同步导入的目标实例地址",
    },
    {
        "key": "LANGFUSE_PUBLIC_KEY", "field": "langfuse_public_key", "secret": True, "domain": "obs",
        "label": "Langfuse Public Key",
        "desc": "Langfuse 项目设置 → API Keys 创建（pk-lf-…）；数据同步必需，未配置时同步页给出引导",
    },
    {
        "key": "LANGFUSE_SECRET_KEY", "field": "langfuse_secret_key", "secret": True, "domain": "obs",
        "label": "Langfuse Secret Key", "desc": "同上（sk-lf-…）",
    },
]


# ── 读：明细 ────────────────────────────────────────────────────────────


def _jsonify(v: Any) -> Any:
    """把模型值转成可 JSON 化的纯量（Path → str；容器递归）"""
    if isinstance(v, Path):
        return str(v)
    if isinstance(v, BaseModel):
        return _jsonify(v.model_dump())
    if isinstance(v, dict):
        return {k: _jsonify(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_jsonify(x) for x in v]
    return v


def _kind_type(v: Any) -> tuple[str, str]:
    """(kind, type)：kind 决定编辑控件形态（scalar/list/dict），type 决定标量控件细类"""
    if isinstance(v, bool):          # ⚠️ bool 必须是 int 之前（bool 是 int 子类）
        return "scalar", "bool"
    if isinstance(v, int):
        return "scalar", "int"
    if isinstance(v, float):
        return "scalar", "float"
    if isinstance(v, list):
        return "list", "list"
    if isinstance(v, dict):
        return "dict", "dict"
    if isinstance(v, Path):
        return "scalar", "path"
    return "scalar", "str"


def _rel(p: Path | str) -> str:
    """转成仓库相对路径（不在仓库内时原样返回）"""
    try:
        return str(Path(p).resolve().relative_to(REPO_ROOT))
    except (ValueError, OSError):
        return str(p)


def _load_yaml_raw(path: Path) -> dict:
    """读 yaml 原值（仅用于展示"是否写入文件"）；文件缺失/损坏时返回 {}"""
    if not path.exists():
        return {}
    try:
        data = _pyyaml.safe_load(path.read_text(encoding="utf-8")) or {}
        return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001 - 展示用途，不因解析失败阻断页面
        return {}


def _env_file_path() -> Path:
    """与 pydantic-settings 使用的 .env 保持同一路径（model_config 是唯一来源）"""
    raw = Settings.model_config.get("env_file")
    return Path(raw) if raw else PROJECT_ROOT / ".env"


def _parse_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$", line)
        if m:
            out[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return out


def _mask(v: str) -> str:
    if not v:
        return ""
    if len(v) <= 10:
        return "••••••"
    return f"{v[:6]}****{v[-4:]}"


def _same_value(a: Any, b: Any) -> bool:
    """值等价判断（供"已定制"标记用）。

    Path 字段要**解析后再比**：yaml 里写相对路径（`var/chunks.jsonl`）、代码默认是绝对路径
    （`<api>/var/chunks.jsonl`），字面不同但指向同一文件 —— 字面比较会把这类正常配置误标成"已定制"。
    """
    if isinstance(a, Path) and isinstance(b, Path):
        try:
            return a.resolve() == b.resolve()
        except OSError:
            return str(a) == str(b)
    return _jsonify(a) == _jsonify(b)


def build_detail(s: Settings | None = None) -> dict[str, Any]:
    """全量配置明细（GET /api/config/detail 的载荷）"""
    s = s or get_settings()
    cfg_path = Path(s.config_file)
    yaml_raw = _load_yaml_raw(cfg_path)

    groups: list[dict[str, Any]] = []
    n_fields = n_custom = n_from_yaml = 0

    for section, field_name in SECTION_MAP.items():
        cfg = getattr(s, field_name)
        dflt = type(cfg)()  # 代码默认值（同一模型的默认实例）
        raw_sec = yaml_raw.get(section)
        raw_sec = raw_sec if isinstance(raw_sec, dict) else {}
        gmeta = GROUP_META.get(section, {})
        fmeta = FIELD_META.get(section, {})

        fields: list[dict[str, Any]] = []
        for key in type(cfg).model_fields:
            cur, dfl = getattr(cfg, key), getattr(dflt, key)
            kind, typ = _kind_type(cur)
            m = fmeta.get(key) or {}
            in_yaml = key in raw_sec
            customized = not _same_value(cur, dfl)
            fields.append({
                "key": key,
                "label": m.get("label") or key,
                "desc": m.get("desc") or "",
                "warn": m.get("warn"),
                "kind": kind,
                "type": typ,
                "value": _jsonify(cur),
                "default": _jsonify(dfl),
                "in_yaml": in_yaml,
                "source": SOURCE_YAML if in_yaml else SOURCE_DEFAULT,
                "customized": customized,
                "editable": (section, key) not in READONLY_FIELDS,
            })
            n_fields += 1
            n_custom += 1 if customized else 0
            n_from_yaml += 1 if in_yaml else 0

        groups.append({
            "id": section,
            "label": gmeta.get("label") or section,
            # 平台域归属：配置页左导航按它分列（kb/eval/obs/platform…）；缺省落 kb
            "domain": gmeta.get("domain") or "kb",
            "note": gmeta.get("note") or "",
            "fields": fields,
        })

    # ── .env 侧 ──
    env_path = _env_file_path()
    file_vals = _parse_env_file(env_path)
    os_upper = {k.upper() for k in os.environ}
    env_items: list[dict[str, Any]] = []
    for it in ENV_ITEMS:
        raw = getattr(s, it["field"], None)
        text = "" if raw is None else str(raw)
        in_file = it["key"] in file_vals
        in_os = it["key"] in os_upper
        item: dict[str, Any] = {
            "key": it["key"],
            "label": it["label"],
            # 平台域归属（同 GROUP_META.domain）：观测的 9 项由此与知识库密钥分列展示
            "domain": it.get("domain") or "kb",
            "desc": it.get("desc") or "",
            "warn": it.get("warn"),
            "secret": bool(it.get("secret")),
            "configured": bool(text.strip()),
            "source": "environment" if in_os else ("env-file" if in_file else "unset"),
            "in_file": in_file,
            "overridden": bool(it.get("default")) and text != str(it["default"]),
            "editable": True,
        }
        if it.get("default"):
            item["default"] = str(it["default"])
        if it["secret"]:
            item["masked"] = _mask(text)
            item["value"] = None
        else:
            item["value"] = text
        env_items.append(item)

    return {
        "config_file": _rel(cfg_path),
        "env_file": _rel(env_path),
        "yaml_loaded": s.yaml_loaded,
        "groups": groups,
        "env": {
            "path": _rel(env_path),
            "exists": env_path.exists(),
            "items": env_items,
            "configured": sum(1 for i in env_items if i["configured"]),
            "total": len(env_items),
        },
        "stats": {
            "fields": n_fields,
            "customized": n_custom,
            "from_yaml": n_from_yaml,
            "env_items": len(env_items),
        },
    }


def read_raw_file(name: str = "pipeline") -> dict[str, Any]:
    """原始文件（只读预览）。目前只开放 pipeline.yaml —— .env 含密钥，不落 DOM。"""
    s = get_settings()
    if name != "pipeline":
        raise ConfigError(f"未知文件：{name}（仅支持 pipeline）")
    path = Path(s.config_file)
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    return {
        "name": "pipeline.yaml",
        "path": _rel(path),
        "exists": path.exists(),
        "lines": text.count("\n") + (1 if text else 0),
        "text": text,
    }


# ── 写：校验 ────────────────────────────────────────────────────────────


def _fmt_validation(group: str, e: ValidationError) -> str:
    parts = []
    for err in e.errors()[:5]:
        loc = ".".join(str(x) for x in err.get("loc", ()))
        parts.append(f"{group}.{loc}：{err.get('msg')}")
    more = " …" if len(e.errors()) > 5 else ""
    return "配置校验未通过 —— " + "；".join(parts) + more


def _validate_yaml_updates(s: Settings, updates: list[dict]) -> dict[str, dict[str, Any]]:
    """逐项校验（分组/键存在性、只读、类型），返回 {group: {key: 已验证值}}"""
    plan: dict[str, dict[str, Any]] = {}
    for i, u in enumerate(updates):
        if not isinstance(u, dict):
            raise ConfigError(f"第 {i + 1} 项修改格式错误（应为对象）")
        group = str(u.get("group") or "").strip()
        key = str(u.get("key") or "").strip()
        if group not in SECTION_MAP:
            raise ConfigError(f"未知配置分组：{group or '(空)'}")
        model = type(getattr(s, SECTION_MAP[group]))
        if key not in model.model_fields:
            raise ConfigError(f"未知配置项：{group}.{key or '(空)'}")
        if (group, key) in READONLY_FIELDS:
            label = (FIELD_META.get(group, {}).get(key) or {}).get("label") or key
            raise ConfigError(f"「{label}」是只读项，不支持在线修改")
        plan.setdefault(group, {})[key] = u.get("value")

    validated: dict[str, dict[str, Any]] = {}
    for group, kv in plan.items():
        cur = getattr(s, SECTION_MAP[group])
        try:
            merged = type(cur).model_validate({**cur.model_dump(), **kv})
        except ValidationError as e:
            raise ConfigError(_fmt_validation(group, e)) from e
        # 正则模式库：逐条试编译（模型只校验 str，坏正则要到运行时才炸）
        if group == "validate" and "patterns" in kv:
            for pname, pat in (merged.patterns or {}).items():
                try:
                    re.compile(str(pat))
                except re.error as ex:
                    raise ConfigError(f"正则无法编译（patterns.{pname}）：{ex}") from ex
        validated[group] = {k: getattr(merged, k) for k in kv}
    return validated


def _validate_env_updates(updates: list[dict]) -> dict[str, str]:
    """环境变量写值校验 —— **守死"会让 Settings 加载失败的值"**（见模块顶部说明）"""
    known = {it["key"]: it for it in ENV_ITEMS}
    plan: dict[str, str] = {}
    for i, u in enumerate(updates):
        if not isinstance(u, dict):
            raise ConfigError(f"第 {i + 1} 项环境变量格式错误（应为对象）")
        key = str(u.get("key") or "").strip()
        if key not in known:
            raise ConfigError(f"未知环境变量：{key or '(空)'}（仅支持平台已声明的键）")
        raw = u.get("value")
        val = "" if raw is None else str(raw).strip()
        if "\n" in val or "\r" in val:
            raise ConfigError(f"{key} 的值不能包含换行")
        field = known[key]["field"]
        if field == "db_port":
            if not re.fullmatch(r"\d{1,5}", val):
                raise ConfigError("DB_PORT 需为 1~5 位数字（如 3306）；不支持清空")
        if field == "obs_langfuse_port":
            if not re.fullmatch(r"\d{1,5}", val):
                raise ConfigError("OBS_LANGFUSE_PORT 需为 1~5 位数字（如 3100）；不支持清空")
        if field == "obs_unit_dir" and val and not val.startswith("/"):
            raise ConfigError("OBS_UNIT_DIR 需为绝对路径（compose 与脚本的定位锚）")
        # Langfuse 密钥格式守卫（2026-10-11 实测踩坑：说明文字/Public Key 被误粘进字段，
        # 静默入库后直到同步 401 才暴露 —— 宁可在保存时拒绝，清空（留空）仍允许）
        if field == "langfuse_public_key" and val and not val.startswith("pk-lf-"):
            raise ConfigError(
                "LANGFUSE_PUBLIC_KEY 应以 pk-lf- 开头，当前值不是有效的 Public Key。"
                "请到 Langfuse「项目设置 → API Keys」复制（Public Key 填这一格）"
            )
        if field == "langfuse_secret_key" and val and not val.startswith("sk-lf-"):
            raise ConfigError(
                "LANGFUSE_SECRET_KEY 应以 sk-lf- 开头 —— 注意别把 Public Key（pk-lf-…）"
                "填到 Secret Key 这一格（两者是创建时成对给的两个值）"
            )
        if field in ("source_dir", "out_dir"):
            if not val:
                raise ConfigError(f"{key} 不能清空 —— 上传与解析扫描都依赖该目录")
        if field == "db_name" and "minicare-cloud" in val:
            raise ConfigError(
                "拒绝写入正式库名（minicare-cloud-…）：发布回滚会对正式库全表清空重建。"
                "本机环境必须保持 minicare_dev"
            )
        plan[key] = val
    return plan


# ── 写：落盘 ────────────────────────────────────────────────────────────

KEEP_BACKUPS = 20


def _backup_file(path: Path) -> str | None:
    """写前备份到 data/config_backups/（同名保留最近 KEEP_BACKUPS 份）

    ⚠️ 备份失败必须**中止保存**（宁可写不进去，也不能无备份覆写配置文件）；
    失败以 ConfigError 上抛（路由层转 422 展示原文案），不给用户裸 500。
    已知触发场景（2026-10-11）：平台进程由带文件中介的受限环境启动时，
    文件拷贝会被策略拦截（PermissionError）——换普通终端启动即恢复。
    """
    if not path.exists():
        return None
    bdir = PROJECT_ROOT / "data" / "config_backups"
    try:
        bdir.mkdir(parents=True, exist_ok=True)
        ts = time.strftime("%Y%m%d-%H%M%S")
        dst = bdir / f"{path.name}.{ts}.bak"
        n = 1
        while dst.exists():
            dst = bdir / f"{path.name}.{ts}-{n}.bak"
            n += 1
        shutil.copy2(path, dst)
    except OSError as e:
        raise ConfigError(
            f"写前备份失败，已中止保存（原文件未改动）：{e}。"
            "请检查 data/config_backups/ 是否可写；若平台进程由受限环境启动，请改用普通终端启动后重试。"
        ) from e
    olds = sorted(bdir.glob(f"{path.name}.*.bak"))
    for old in olds[:-KEEP_BACKUPS]:
        try:
            old.unlink()
        except OSError:
            pass
    return _rel(dst)


def _atomic_write(path: Path, text: str) -> None:
    """临时文件 + os.replace 原子替换；沿用原文件权限（.env 可能是 600）"""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(text, encoding="utf-8")
    try:
        if path.exists():
            os.chmod(tmp, path.stat().st_mode)
    except OSError:
        pass
    os.replace(tmp, path)


def _yaml_ready(v: Any) -> Any:
    if isinstance(v, Path):
        return str(v)
    if isinstance(v, BaseModel):
        return v.model_dump(mode="json")
    return v


def _count_hash_lines(text: str) -> int:
    return sum(1 for line in text.splitlines() if "#" in line)


def _write_yaml(path: Path, plan: dict[str, dict[str, Any]]) -> None:
    """ruamel 往返写回：注释与排版原样保留；带两条安全护栏（见模块顶部说明）"""
    from ruamel.yaml import YAML as RuamelYAML

    text = path.read_text(encoding="utf-8") if path.exists() else ""
    ry = RuamelYAML()
    ry.preserve_quotes = True
    ry.indent(mapping=2, sequence=4, offset=2)
    data = ry.load(text) if text.strip() else {}
    if not isinstance(data, dict):
        raise ConfigError("pipeline.yaml 顶层结构异常（不是映射），已中止写入")

    for group, kv in plan.items():
        sec = data.get(group)
        if sec is None:
            data[group] = {}
            sec = data[group]
        if not isinstance(sec, dict):
            raise ConfigError(f"pipeline.yaml 的 {group} 节不是映射，已中止写入")
        for key, val in kv.items():
            new_val = _yaml_ready(val)
            cur_val = sec.get(key)
            if isinstance(cur_val, dict) and isinstance(new_val, dict):
                # 就位更新：保留该映射自身的注释（整体替换会丢注释、挤掉下一个键的说明）
                for k2 in [k for k in cur_val if k not in new_val]:
                    del cur_val[k2]
                for k2, v2 in new_val.items():
                    cur_val[k2] = v2
            elif isinstance(cur_val, list) and isinstance(new_val, list):
                cur_val[:] = new_val
            else:
                sec[key] = new_val

    buf = io.StringIO()
    ry.dump(data, buf)
    out = buf.getvalue()

    # 护栏 1：注释行数不允许减少
    if _count_hash_lines(out) < _count_hash_lines(text):
        raise ConfigError("写入被拦截：检测到注释行丢失（pipeline.yaml 的注释是文档，不能少）")

    # 护栏 2：写盘前语义回读（对每个更新项断言新值落位）
    check = _pyyaml.safe_load(out) or {}
    for group, kv in plan.items():
        for key, val in kv.items():
            got = (check.get(group) or {}).get(key)
            if _jsonify(_yaml_ready(val)) != _jsonify(got):
                raise ConfigError(f"写入被拦截：回读校验不一致（{group}.{key}）")

    _atomic_write(path, out)


_ENV_SAFE = re.compile(r"^[A-Za-z0-9_\-./:@,+]*$")


def _env_value(v: str) -> str:
    if v == "":
        return ""
    if _ENV_SAFE.match(v):
        return v
    return '"' + v.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\r", "\\r") + '"'


def _write_env(path: Path, plan: dict[str, str]) -> None:
    """行级替换（保留其余内容与注释）；键不存在时追加到文件末尾"""
    lines = path.read_text(encoding="utf-8").split("\n") if path.exists() else []
    for key, value in plan.items():
        new_line = f"{key}={_env_value(value)}"
        pat = re.compile(rf"^\s*(?:export\s+)?{re.escape(key)}\s*=")
        idx = next((i for i, line in enumerate(lines) if pat.match(line)), None)
        if idx is None:
            while lines and lines[-1].strip() == "":
                lines.pop()
            if lines:
                lines.append("")
            lines.append(new_line)
            lines.append("")
        else:
            lines[idx] = new_line
    text = "\n".join(lines)
    if not text.endswith("\n"):
        text += "\n"
    _atomic_write(path, text)


def save_config(yaml_updates: list[dict], env_updates: list[dict]) -> dict[str, Any]:
    """校验 → 备份 → 写回 → 热重载 → 返回最新明细（PUT /api/config/save 的载荷）"""
    s = get_settings()
    if not yaml_updates and not env_updates:
        raise ConfigError("没有需要保存的修改")

    yaml_plan = _validate_yaml_updates(s, yaml_updates or [])
    env_plan = _validate_env_updates(env_updates or [])

    backups: list[str] = []
    applied: dict[str, list[str]] = {"yaml": [], "env": []}

    if yaml_plan:
        path = Path(s.config_file)
        b = _backup_file(path)
        if b:
            backups.append(b)
        _write_yaml(path, yaml_plan)
        applied["yaml"] = [f"{g}.{k}" for g, kv in yaml_plan.items() for k in kv]

    if env_plan:
        path = _env_file_path()
        b = _backup_file(path)
        if b:
            backups.append(b)
        _write_env(path, env_plan)
        applied["env"] = list(env_plan)

    new_s = reload_settings()
    return {
        "ok": True,
        "count": len(applied["yaml"]) + len(applied["env"]),
        "applied": applied,
        "backups": backups,
        "yaml_loaded": new_s.yaml_loaded,
        "detail": build_detail(new_s),
    }
