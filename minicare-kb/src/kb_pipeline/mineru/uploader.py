"""解析编排：扫描源文件 → 提交 MinerU → 上传 → 轮询 → 解压整理到产物目录"""
from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

from ..config import Settings
from ..logger import get_logger
from ..models import ParseStats
from .client import MineruClient

log = get_logger(__name__)


def _collect_files(source_dir: Path) -> dict[str, list[str]]:
    """按引擎分组收集待解析文件（跳过已存在产物的，幂等）"""
    return {
        "pdf": sorted(f.name for f in source_dir.glob("*.pdf")),
        "html": sorted(f.name for f in source_dir.glob("*.html")),
    }


def _out_dir_exists(out_dir: Path, name: str) -> bool:
    base = Path(name).stem
    d = out_dir / base
    return d.exists() and any(d.glob("*.md"))


def _organize_zip(zip_bytes: bytes, out_dir: Path, base: str) -> None:
    """解压 zip 并整理：保留 <base>.md + *_content_list.json + images/，清理中间态
    产物落在 out_dir/<base>/ 子目录（消费契约）；解压用系统临时目录（/tmp），
    避免在项目目录内产生需删除的中间文件（safe-delete 限制）"""
    import tempfile

    doc_dir = out_dir / base
    doc_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="mineru_zip_") as tmp_str:
        tmp = Path(tmp_str)
        zip_path = tmp / "_result.zip"
        zip_path.write_bytes(zip_bytes)
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(tmp)

        # full.md → <base>/<base>.md
        md_src = tmp / "full.md"
        if md_src.exists():
            shutil.move(str(md_src), str(doc_dir / f"{base}.md"))
        # images/ 合并
        img_src = tmp / "images"
        if img_src.exists():
            img_dst = doc_dir / "images"
            img_dst.mkdir(exist_ok=True)
            for f in img_src.iterdir():
                if not (img_dst / f.name).exists():
                    shutil.move(str(f), str(img_dst))
        # *_content_list.json 保留（v2/layout/model/origin 清理）
        for f in tmp.iterdir():
            if f.name.endswith("_content_list.json") and not f.name.endswith("_v2.json"):
                shutil.move(str(f), str(doc_dir / f.name))
    # TemporaryDirectory 上下文退出时自动清理 /tmp 临时文件（safe-delete 不拦系统临时目录）


def parse_dir(source_dir: Path, out_dir: Path, settings: Settings, force: bool = False) -> ParseStats:
    """解析整个目录（幂等：已有产物的跳过，force=True 时清旧重跑）"""
    stats = ParseStats()
    client = MineruClient(settings.mineru_api_token, base_url=settings.mineru_cfg.base_url)
    try:
        files = _collect_files(source_dir)
        for engine, names in (("pdf", files["pdf"]), ("html", files["html"])):
            if not names:
                continue
            model = settings.mineru_cfg.model_pdf if engine == "pdf" else settings.mineru_cfg.model_html
            if force:
                for n in names:
                    base = Path(n).stem
                    d = out_dir / base
                    if d.exists():
                        shutil.rmtree(d, ignore_errors=True)
                todo = names
                stats.total += len(names)
            else:
                todo = [n for n in names if not _out_dir_exists(out_dir, n)]
                stats.total += len(names)
                stats.skipped += len(names) - len(todo)
            if not todo:
                continue
            log.info(f"[parse] 提交 {len(todo)} 个文件（{model} 引擎, force={force}）")
            # 分批（≤50）
            for i in range(0, len(todo), settings.mineru_cfg.batch_max):
                batch = todo[i : i + settings.mineru_cfg.batch_max]
                files_meta = []
                for name in batch:
                    is_ocr = settings.mineru_cfg.is_ocr or name in settings.mineru_cfg.ocr_files
                    files_meta.append({"name": name, "data_id": name, "is_ocr": is_ocr} if is_ocr else {"name": name, "data_id": name})
                data = client.submit_upload_batch(files_meta, model, language=settings.mineru_cfg.language)
                # 上传
                for name, url in zip(batch, data["file_urls"]):
                    content = (source_dir / name).read_bytes()
                    client.upload_file(url, content)
                    log.info(f"[parse] PUT {name} ({len(content) // 1024}KB)")
                # 轮询
                results = client.poll_batch(
                    data["batch_id"],
                    interval_s=settings.mineru_cfg.poll_interval_s,
                    timeout_s=settings.mineru_cfg.poll_timeout_s,
                )
                for item in results:
                    if item["state"] == "done":
                        base = Path(item["file_name"]).stem
                        zip_bytes = client.download_zip(item["full_zip_url"])
                        _organize_zip(zip_bytes, out_dir, base)
                        stats.done += 1
                        log.info(f"[parse] ✓ {item['file_name']} → {out_dir / base}/")
                    else:
                        stats.failed.append(item["file_name"])
                        log.error(f"[parse] ✗ {item['file_name']}: {item.get('err_msg')}")
        return stats
    finally:
        client.close()
