"""TokenHub 文本向量化客户端（OpenAI 兼容接口）

腾讯云大模型服务平台 TokenHub（混元老平台已停止新购，新服务统一走 TokenHub）：
  POST https://tokenhub.tencentmaas.com/v1/embeddings
  Authorization: Bearer <API Key>
  model: kinfra-text-embedding-0.6b（1024 维，轻量，推荐）/ kinfra-text-embedding-4b（2560 维）
凭证：TokenHub API Key（sk- 开头）从 .env 读取（TOKENHUB_API_KEY）
"""
from __future__ import annotations

import json

import httpx

from ..config import Settings
from ..logger import get_logger

log = get_logger(__name__)

_BASE_URL = "https://tokenhub.tencentmaas.com/v1"
# 模型：0.6b=1024 维（轻量，默认）/ 4b=2560 维（高质量，CMTEB 72.63）
DEFAULT_MODEL = "kinfra-text-embedding-0.6b"


class TokenHubError(RuntimeError):
    pass


def _model_name(settings: Settings) -> str:
    return settings.tokenhub_embedding_model or DEFAULT_MODEL


def _dim_of(model: str) -> int:
    return 2560 if "4b" in model else 1024


def embed_texts(texts: list[str], settings: Settings, batch_size: int = 16, model: str | None = None) -> list[list[float]]:
    """批量向量化（OpenAI 兼容 /v1/embeddings）。返回每条的向量（0.6b=1024 维 / 4b=2560 维）。"""
    api_key = settings.tokenhub_api_key
    if not api_key:
        raise TokenHubError("缺少 TokenHub API Key（TOKENHUB_API_KEY，.env）")
    model = model or _model_name(settings)

    results: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        payload = json.dumps({"model": model, "input": batch}, ensure_ascii=False).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        try:
            r = httpx.post(f"{_BASE_URL}/embeddings", headers=headers, content=payload, timeout=120)
        except httpx.TimeoutException:
            raise TokenHubError("TokenHub embedding 请求超时")
        if r.status_code != 200:
            raise TokenHubError(f"TokenHub API 错误 {r.status_code}: {r.text[:300]}")
        body = r.json()
        for item in body.get("data", []):
            results.append(item.get("embedding") or [])
        log.info(f"[embed] {model} 批次 {i // batch_size + 1}: {len(batch)} 条完成")
    return results


def embed_one(text: str, settings: Settings) -> list[float]:
    return embed_texts([text], settings)[0]
