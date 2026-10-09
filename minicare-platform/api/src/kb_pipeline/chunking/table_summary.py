"""表格 LLM 摘要（M3 启用）：对表格 HTML 生成结构化摘要

摘要进 content 供检索（表格 HTML 长、向量被稀释），正文保留在块内。
本期（M1）置空实现，接口固定：summarize_table(html, model) -> str
"""
from __future__ import annotations

from ..logger import get_logger

log = get_logger(__name__)

_DEFAULT_PROMPT = """请为以下医学表格生成简洁摘要（不超过 80 字），格式：
"表X：<主题>，涉及 <要点1>、<要点2>…"
只输出摘要本身，不要解释。

表格内容：
{html}"""


def summarize_table(html: str, model=None) -> str:
    """生成表格摘要。M1 暂返回空（不做 LLM 调用），M3 接入真实模型。"""
    if model is None:
        log.info("[chunk] 表格摘要未启用（M3），返回空")
        return ""
    # TODO(M3): 调用 LLM（复用 M6 视觉链路配置），prompt=_DEFAULT_PROMPT
    raise NotImplementedError("表格 LLM 摘要 M3 实现")
