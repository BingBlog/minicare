"""元数据标注：keywords 提取 + 风险分级（在数字校验后调用）"""
from __future__ import annotations

from ..config import Settings
from ..models import Chunk
from ..validate.numbers import apply_risk_keywords


def annotate_chunk(chunk: Chunk, settings: Settings) -> Chunk:
    """补全 keywords 并应用风险关键词规则（原地修改）"""
    # keywords：标题 + 前 200 字中的医学术语（简单：标题词 + 章节词去重）
    import re

    terms = re.findall(r"[\u4e00-\u9fff]{2,6}", chunk.title)
    keywords = list(dict.fromkeys(terms))[:8]
    if keywords:
        chunk.keywords = ",".join(keywords)
    # 风险分级
    apply_risk_keywords(chunk, settings)
    return chunk
