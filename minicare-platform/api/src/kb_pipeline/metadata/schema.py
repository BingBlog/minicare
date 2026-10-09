"""元信息 Schema：字段定义 + 语料级共享 schema 的读写

## 为什么用「语料级共享 schema」而不是每份文档各生成一套
每份文档各自生成字段，得到的是"这份文档有什么"；但**跨文档不可比较**——
既看不出全库缺哪一类信息，也没法把某个字段直接拿去设检索权重（那需要所有文档同一口径）。
所以 schema 是**一份、全库共用**，可按需重新生成并人工审阅后固化。

## schema 的来源有两级（与 `keywords.py` 同一范式）
1. **LLM 归纳**（主路径）：喂若干份文档样本的标题树 + 开头正文，让模型归纳出一套字段；
2. **代码内置默认**（降级）：`DEFAULT_FIELDS` 就是一份人工整理好的可用 schema ——
   LLM 不可用时直接用它，界面据此仍能显示与抽取（只是字段不随语料演进）。

⚠️ 内置默认里**前 7 个与台账字段完全对齐**（`corpus/ledger.py` 的字段名），
这样「元信息解析与确认」的抽取结果能与信息表单 / 全库视图逐字段对照，不会各说各话。
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "v1"

# 字段类型：string | number | array | enum
BASE_KEYS = ("source_name", "publisher", "year", "region", "evidence_level", "applicable_age", "license")

# 人工评审后认定为"必要"的扩展字段（2026-10-04 按用途分析补的 9 个）。
#
# 为什么人工定而不是全交给 LLM：这些是按**具体工程用途**挑的，泛化归纳拿不到 ——
#   · 检索过滤：过去**没有任何数值型年龄字段**，`applicable_age` 是自由文本（如"生命早期1000天"）
#     无法做区间过滤；`evidence_quality` 与 `evidence_level` 是**两个维度**
#     （文献类型 vs GRADE 证据质量），原先混在一个字段里。
#   · 检索加权：缺**症状词** —— 家长最可能用"便血""湿疹""呕吐"提问，而 `allergy_conditions`
#     只有疾病名。
#   · 医疗安全：`risk_contraindications` 是"禁忌的做法"，缺"禁忌的人群"。
#   · 合规溯源：缺利益冲突声明与版本/更新信息（时效性加权要用）。
#
# 与 BASE_KEYS 的区别：这 9 个**不锁类型**（允许模型调整），但模型漏了会被强制补上；
# 依据是逐字段填充率能验证（见「元信息解析与确认 · 全库」的覆盖率矩阵）。
REVIEW_KEYS = (
    "symptoms", "age_min_months", "age_max_months", "recommendation_strength",
    "evidence_quality", "contraindicated_populations", "diagnostic_criteria",
    "conflict_of_interest", "version_or_update",
    # 第二批（2026-10-04，依据首轮 5 份实测填充率 + 本项目「帮敏宝转奶 / 排敏」的核心场景）
    "emergency_management", "referral_criteria", "weaning_protocol",
)


@dataclass
class FieldSpec:
    key: str
    label: str
    type: str                      # string | number | array | enum
    desc: str
    required: bool = False
    values: list[str] = field(default_factory=list)   # type=enum 时的取值域
    hint: str = ""                 # 给 LLM 的抽取提示（怎么写、什么算命中）
    # 是否与台账字段同名（同名才能和「信息确认」表单对照）
    base: bool = False
    # 是否属于人工评审补充的那批（REVIEW_KEYS）：模型漏了会被补上，但不锁类型
    review: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ── 内置默认 schema（LLM 不可用时的降级，也是 LLM 归纳时的起点）──────────────
DEFAULT_FIELDS: list[FieldSpec] = [
    # —— 与台账对齐的 7 个基础字段 ——
    FieldSpec("source_name", "来源名称", "string", "文档的正式来源名称（指南/共识全称）",
              required=True, base=True, hint="去掉年份后缀与文件扩展名；不要用目录名"),
    FieldSpec("publisher", "发布机构", "string", "发布或出版机构", base=True,
              hint="如「中华医学会变态反应学分会」「国家卫生健康委妇幼健康中心」"),
    FieldSpec("year", "年份", "number", "发布年份（4 位数字）", required=True, base=True,
              hint="取发布时间；同一文档有多个年份时取正式发布年"),
    FieldSpec("region", "地区", "enum", "适用地区口径", required=True, base=True,
              values=["cn", "intl"], hint="国内发布填 cn，国际发布填 intl"),
    FieldSpec("evidence_level", "证据级别", "enum", "文献类型对应的证据级别", required=True, base=True,
              values=["guideline", "consensus", "RCT", "policy", "edu"],
              hint="指南 guideline / 专家共识 consensus / 随机对照试验 RCT / 政策规范 policy / 科普 edu"),
    FieldSpec("applicable_age", "适用年龄", "string", "文档针对的年龄范围（原样表述）", base=True,
              hint="如「0-12 月龄」「儿童」；没有明确范围则留空"),
    FieldSpec("license", "许可证", "string", "版权或许可状态", base=True,
              hint="如 CC BY-NC、© 机构名、未标注"),

    # —— 面向检索与权重的扩展字段（LLM 归纳出来的同类信息也放这一区）——
    FieldSpec("doc_type", "文档类型", "enum", "文档体裁", values=[
        "临床指南", "专家共识", "系统评价/Meta", "随机对照试验", "队列/观察性研究",
        "政策规范", "科普教育", "白皮书", "立场声明",
    ], hint="按体裁选一个最贴近的"),
    FieldSpec("topics", "主题标签", "array", "文档覆盖的核心主题（3-8 个，用于检索加权）",
              hint="用名词短语，如「牛奶蛋白过敏」「辅食添加」「免疫耐受」「转奶」"),
    FieldSpec("allergens", "涉及过敏原", "array", "文档涉及的过敏原",
              hint="如「牛奶蛋白」「花生」「鸡蛋」「小麦」；没有则留空数组"),
    FieldSpec("formula_types", "涉及配方", "array", "文档涉及的配方类型",
              hint="如「深度水解」「氨基酸配方」「适度水解」「普通配方」；没有则留空数组"),
    FieldSpec("population", "人群", "string", "研究对象或适用人群",
              hint="如「婴幼儿」「6 月龄以下婴儿」「有过敏家族史的儿童」"),
    FieldSpec("study_design", "研究设计", "string", "研究设计或制定方法",
              hint="如「多中心 RCT」「GRADE 分级推荐」「专家德尔菲法」；非研究类可留空"),
    FieldSpec("key_recommendations", "核心建议", "array", "文档给出的 3-5 条最关键的可执行建议",
              hint="每条一句话，尽量含动作与条件；不要抄整段"),
    FieldSpec("risk_notes", "风险与禁忌", "array", "禁忌、警示、需要转诊或急诊的情形",
              hint="医疗安全相关，宁多勿漏；没有则留空数组"),
    FieldSpec("dosing_info", "剂量信息", "string", "文档中出现的用药剂量要点",
              hint="如「肾上腺素 0.01 mg/kg，最大 0.5 mg」；无剂量内容则留空"),
    FieldSpec("age_range_months", "月龄区间", "string", "把适用年龄折算成月龄区间",
              hint="格式如「0-12」「0-6」；无法折算则留空"),

    # —— 人工评审补充的 9 个（REVIEW_KEYS）——
    FieldSpec("symptoms", "涉及症状", "array", "文档提到的症状（家长常用症状提问，检索必命中）",
              hint="如「便血」「湿疹」「呕吐」「荨麻疹」「腹泻」「生长迟缓」；3-8 个"),
    FieldSpec("age_min_months", "月龄下限", "number", "适用月龄区间的最小值（数值型，便于过滤）",
              hint="只填数字，如 0 / 6；仅覆盖孕期或无法折算时留空"),
    FieldSpec("age_max_months", "月龄上限", "number", "适用月龄区间的最大值（数值型，便于过滤）",
              hint="只填数字，如 12 / 36；不设上限（成人）时留空"),
    FieldSpec("recommendation_strength", "推荐强度", "enum", "文档对其建议给出的推荐强度",
              values=["强推荐", "弱推荐", "条件性推荐", "未分级"],
              hint="GRADE 系或类似分级；文档没给出分级时选「未分级」"),
    FieldSpec("evidence_quality", "证据质量", "enum", "证据体质量分级（与「证据级别」是两个维度）",
              values=["高", "中", "低", "极低", "未分级"],
              hint="注意：evidence_level 记的是**文献类型**，这里记的是**质量等级**"),
    FieldSpec("contraindicated_populations", "禁忌人群", "array", "明确不适用或需慎用的人群",
              hint="如「对某成分过敏者」「严重肝肾功能不全」「妊娠期」；与 risk_contraindications（禁忌做法）区分"),
    FieldSpec("diagnostic_criteria", "诊断标准", "array", "诊断标准或诊断要点",
              hint="如「口服食物激发试验（OFC）阳性」「SPT 风团 ≥3mm」；2-6 条"),
    FieldSpec("conflict_of_interest", "利益冲突", "string", "利益冲突声明",
              hint="原文的利益冲突/作者贡献声明要点；没有则留空（不要写「无」以外的推测）"),
    FieldSpec("version_or_update", "版本/更新", "string", "版本号或更新说明（时效性判断用）",
              hint="如「2025 修订版」「替代 2010 版」；无明确说明则留空"),
    FieldSpec("emergency_management", "急救处置", "array", "出现紧急情况时的处置步骤",
              hint="如「立即肌注肾上腺素」「平卧抬高下肢」「呼叫 120」；2-5 步，按先后顺序。无则留空数组"),
    FieldSpec("referral_criteria", "转诊/就医指征", "array", "什么情况下必须就医或转诊",
              hint="如「出现呼吸困难」「意识改变」「肾上腺素用后无改善」；这是家长最需要的判断依据"),
    FieldSpec("weaning_protocol", "转奶/配方转换", "string", "特殊配方转普通配方、或转换配方的方案",
              hint="如「回避 6 个月后重新评估」「从氨基酸配方→深度水解→普通配方，每级 2-4 周」；无则留空"),
]


def default_schema() -> dict[str, Any]:
    return {
        "version": SCHEMA_VERSION,
        "source": "builtin",
        "created_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "model": "",
        "sample_docs": [],
        "note": "内置默认 schema（未调用 LLM 归纳）",
        "fields": [f.to_dict() for f in DEFAULT_FIELDS],
    }


def schema_path(data_root: str | Path) -> Path:
    """语料级 schema 落盘位置（与单据文档产物分开：它是全库共用的）"""
    return Path(data_root) / "llm" / "metadata_schema.json"


def _apply_flags(schema: dict[str, Any]) -> dict[str, Any]:
    """`base` / `review` 一律**现算**，不信任文件里存的值。

    理由：这两个标记是 BASE_KEYS / REVIEW_KEYS 的派生量。一旦某个分支忘了写（实测踩过：
    "锁类型"那条分支用内置定义覆盖了 `review`，于是 12 个评审字段全被标成模型自加），
    界面上的「台账 / 评审」标注就会错位，而错的是**标注**、数据是对的 —— 这种 bug 最难发现。
    单一来源放在这里，老产物也自动纠正。
    """
    for f in schema.get("fields") or []:
        k = f.get("key")
        f["base"] = k in BASE_KEYS
        f["review"] = k in REVIEW_KEYS
    return schema


def load_schema(data_root: str | Path) -> dict[str, Any]:
    """读 schema；不存在或损坏时回落到内置默认（不抛异常，界面永远有东西可渲染）"""
    p = schema_path(data_root)
    if p.exists():
        try:
            got = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(got, dict) and got.get("fields"):
                return _apply_flags(got)
        except (ValueError, OSError):
            pass
    return _apply_flags(default_schema())


def save_schema(data_root: str | Path, schema: dict[str, Any]) -> Path:
    p = schema_path(data_root)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(schema, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, p)     # 原子替换：读侧不会看到半个文件
    return p


def fields_hash(fields: Any) -> str:
    """字段定义的指纹 —— 抽取缓存的键之一，也用来判断**已抽取结果是否已过期**

    为什么必须有它：LLM 归纳出的字段**每次都不完全一样**（实测两次归纳的扩展字段名全变了：
    `clinical_focus`/`core_recommendations` → `prevention_strategies`/`management_recommendations`）。
    一旦重新归纳，老结果的键名就与新 schema 对不上，直接按新键查会全部显示"空"——
    那是假象。所以覆盖率视图必须先用这个指纹筛掉过期结果，而不是把它们算成"没抽到"。
    """
    return hashlib.sha256(
        json.dumps(fields, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()[:16]


def normalize_fields(raw: Any) -> list[dict[str, Any]]:
    """把 LLM 返回的字段列表规范化成 FieldSpec 形态

    两条硬规则：
    1. **7 个台账字段一律以内置定义为准**（含 `type` / `values` / `hint`），
       只允许 LLM 补充 `desc`。理由：它们要与信息表单 / 全库视图逐字段对照，
       类型一旦被模型改成 array（实测确实会），对照就无从谈起。
    2. 其余字段按 LLM 给的来，缺 `label`/`type` 时用同名内置定义兜底。
    """
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    builtin = {f.key: f.to_dict() for f in DEFAULT_FIELDS}
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        if key in BASE_KEYS:
            spec = dict(builtin[key])
            spec["desc"] = str(item.get("desc") or spec["desc"])   # 只让模型补描述
            out.append(spec)
            continue
        if key in REVIEW_KEYS:
            # 评审字段：**锁 `type` 与 `values`，其余（label/desc/hint）用模型给的**。
            # 为什么要锁：这些字段要么是要拿去过滤/加权的枚举（取值必须统一，否则
            # 5 份文档给出 5 种英文 token）、要么是要数值化排序的 number。
            # 实测踩过：不锁时模型自行发明了 `strong_for` / `not_assessed`，
            # 既没法过滤，也让"填充率 100%"变成虚的（全是同一个占位值）。
            spec = dict(builtin[key])
            spec["label"] = str(item.get("label") or spec["label"])
            spec["desc"] = str(item.get("desc") or spec["desc"])
            spec["hint"] = str(item.get("hint") or spec["hint"])
            spec["required"] = bool(item.get("required", spec["required"]))
            out.append(spec)
            continue
        base = builtin.get(key, {})
        out.append({
            "key": key,
            "label": str(item.get("label") or base.get("label") or key),
            "type": str(item.get("type") or base.get("type") or "string"),
            "desc": str(item.get("desc") or base.get("desc") or ""),
            "required": bool(item.get("required", base.get("required", False))),
            "values": list(item.get("values") or base.get("values") or []),
            "hint": str(item.get("hint") or base.get("hint") or ""),
            "base": False,
            "review": key in REVIEW_KEYS,
        })
    for key in BASE_KEYS:            # 模型漏掉的基础字段强制补齐
        if key not in seen:
            out.append(builtin[key])
            seen.add(key)
    for key in REVIEW_KEYS:          # 人工评审字段：模型漏了也补上（但若模型给了就用模型的类型）
        if key not in seen:
            out.append(builtin[key])
            seen.add(key)
    # 只有台账字段提到最前（其余保持模型给出的顺序，包括刚补上的评审字段）
    out.sort(key=lambda f: (BASE_KEYS.index(f["key"]) if f["key"] in BASE_KEYS else len(BASE_KEYS)))
    return out
