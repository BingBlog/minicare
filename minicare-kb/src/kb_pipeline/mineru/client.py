"""MinerU 云端 API 客户端：批量提交 / 轮询 / 下载 zip"""
from __future__ import annotations

import time

import httpx

from ..logger import get_logger

log = get_logger(__name__)

# ⚠️ 经验：Node/Python 请求必须显式 Content-Length（chunked 会被拒：-10002 type mismatch）
# httpx 默认按 body 长度设置 Content-Length，无此问题


class MineruError(RuntimeError):
    pass


class MineruClient:
    def __init__(self, token: str, base_url: str = "https://mineru.net", timeout_s: int = 60):
        self._headers = {"Authorization": f"Bearer {token}"}
        self.base_url = base_url.rstrip("/")
        # 大文件（9MB PDF）PUT 上传需更长写超时；读超时放宽给轮询下载
        self._client = httpx.Client(
            timeout=httpx.Timeout(timeout_s, connect=30, read=180, write=240, pool=30),
            headers=self._headers,
        )

    # ---- 提交：本地上传批量 ----
    def submit_upload_batch(
        self, files: list[dict], model_version: str, language: str = "ch", page_ranges: dict[str, str] | None = None
    ) -> dict:
        """files: [{"name": "...", "data_id": "..."}]（≤50 个）
        page_ranges: 可选 {data_id: "2,4-6"} 分段解析（超 200 页文档用）
        返回 {batch_id, file_urls: [str, ...]}（file_urls 是字符串数组）"""
        body = {
            "files": [
                {
                    "name": f["name"],
                    "data_id": f.get("data_id", f["name"]),
                    **({"page_ranges": page_ranges[f.get("data_id", f["name"])]} if page_ranges and f.get("data_id", f["name"]) in page_ranges else {}),
                }
                for f in files
            ],
            "model_version": model_version,
            "language": language,
        }
        r = self._client.post(f"{self.base_url}/api/v4/file-urls/batch", json=body)
        r.raise_for_status()
        data = r.json()
        if data.get("code") != 0:
            raise MineruError(f"提交失败: {data.get('msg')} (code={data.get('code')})")
        return data["data"]  # {batch_id, file_urls}

    # ---- PUT 上传本地文件到签名 URL ----
    def upload_file(self, file_url: str, content: bytes) -> None:
        # OSS 签名直传：不需要 Content-Type，必须有 Content-Length；失败重试 2 次
        for attempt in range(3):
            try:
                r = self._client.put(file_url, content=content, headers={"Content-Length": str(len(content))})
            except httpx.TimeoutException:
                if attempt == 2:
                    raise MineruError(f"PUT 上传超时（重试 3 次失败）")
                continue
            if r.status_code != 200:
                if attempt == 2:
                    raise MineruError(f"PUT 上传失败: {r.status_code} {r.text[:200]}")
                continue
            return

    # ---- 轮询批量结果 ----
    def poll_batch(self, batch_id: str, interval_s: int = 8, timeout_s: int = 600) -> list[dict]:
        """返回 extract_result 列表：每项含 file_name/state/full_zip_url/err_msg/extract_progress"""
        deadline = time.time() + timeout_s
        last = {}
        while time.time() < deadline:
            r = self._client.get(f"{self.base_url}/api/v4/extract-results/batch/{batch_id}")
            r.raise_for_status()
            data = r.json()
            results = (data.get("data") or {}).get("extract_result") or []
            if not results:
                time.sleep(interval_s)
                continue
            last = {item["file_name"]: item for item in results}
            if all(item["state"] in ("done", "failed") for item in results):
                return list(last.values())
            time.sleep(interval_s)
        raise MineruError(f"轮询超时（{timeout_s}s），最后状态: {[(k, v.get('state')) for k, v in last.items()]}")

    # ---- 下载结果 zip ----
    def download_zip(self, full_zip_url: str) -> bytes:
        r = httpx.get(full_zip_url, timeout=120)
        r.raise_for_status()
        return r.content

    def close(self) -> None:
        self._client.close()
