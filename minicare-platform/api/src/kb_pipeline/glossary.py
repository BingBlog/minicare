"""术语表（TECH-019 §3.5）：CMPA / 食物过敏领域的受控译名

- 数据文件 `config/glossary.yaml`（业务数据，与 pipeline.yaml 的阈值分离；git 可 diff/review）
- 匹配大小写不敏感、按词边界（避免 "AD" 命中 "HEAD" 这类噪音）
- `glossary_hash` 进 translate 步骤参数：改表只重翻**命中受影响词条**的块
  （内容缓存键含每块的命中集合，未命中词条变化不会引发重翻）
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from .artifact import canonical_json, sha256_text


@dataclass(frozen=True)
class Term:
    en: str
    zh: str
    keep_en: bool = False


def load_glossary(path: Path | str | None) -> list[Term]:
    """读取术语表；文件缺失/损坏时返回空表（翻译照常进行，只是没有受控译名）"""
    p = Path(path) if path else None
    if not p or not p.exists():
        return []
    try:
        import yaml

        data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception:  # noqa: BLE001 - 术语表问题不该阻断翻译
        return []
    out: list[Term] = []
    for raw in data.get("terms") or []:
        raw = raw or {}
        en = str(raw.get("en") or "").strip()
        zh = str(raw.get("zh") or "").strip()
        if not en or not zh:
            continue
        out.append(Term(en=en, zh=zh, keep_en=bool(raw.get("keep_en"))))
    return out


def glossary_hash(terms: list[Term]) -> str:
    """术语表指纹（进 translate 的 cache_key；排序保证与词条书写顺序无关）"""
    material = canonical_json([
        {"en": t.en, "zh": t.zh, "keep_en": t.keep_en}
        for t in sorted(terms, key=lambda x: x.en.lower())
    ])
    return sha256_text(material)[:16]


def match_terms(text: str, terms: list[Term], limit: int = 20) -> list[Term]:
    """返回文本命中的术语（保持词表顺序，稳定、便于缓存键构造）"""
    if not text or not terms:
        return []
    hits: list[Term] = []
    for t in terms:
        pattern = r"(?<![A-Za-z])" + re.escape(t.en) + r"(?![A-Za-z])"
        if re.search(pattern, text, re.IGNORECASE):
            hits.append(t)
            if len(hits) >= max(1, int(limit)):
                break
    return hits
