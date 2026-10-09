"""步骤 2 · 解析：产出结构化解析产物（MinerU）

两种模式：
  - `local`  —— 直接消费已在盘上的 MinerU 产物目录（`out_dir/{国内|国际}/{doc_id}/`）。
                这是第 1 期的默认路径：让骨架能在**无云凭证**下被完整验证。
  - `cloud`  —— 调 MinerU 云端 API（复用现有 `mineru/` 客户端，不重写）。

产物契约：`pipeline/parse/{cache16}/parse.json` + `raw/`（md、content_list.json、images/）
"""
from __future__ import annotations

from pathlib import Path

from ..fsutil import ensure_dir
from . import StepContext

ENGINE = "mineru"
ENGINE_VERSION_LOCAL = "local-product@1"
ENGINE_VERSION_CLOUD = "cloud-api@4.0"


def _collect_product(doc_dir: Path) -> dict | None:
    """从 MinerU 产物目录收集 md / content_list / images 信息"""
    if not doc_dir.exists():
        return None
    md = next((f for f in sorted(doc_dir.glob("*.md"))), None)
    if md is None:
        return None
    content_list = None
    for f in sorted(doc_dir.glob("*_content_list.json")):
        if not f.name.endswith("_v2.json"):
            content_list = f
            break
    # MinerU 内部块模型（逐块/逐行/逐 span 的 bbox）：content_list 是它的**渲染视图**，
    # 粒度被合成过（参考文献 1 项、跨栏段落只留一栏）。有它才能把高亮粒度做到 MinerU 那么细。
    middle = next((f for f in sorted(doc_dir.glob("*_middle.json"))), None)
    images = sorted(doc_dir.glob("images/*"))
    return {
        "doc_dir": str(doc_dir),
        "md_name": md.name,
        "md_path": str(md),
        "md_chars": len(md.read_text(encoding="utf-8")),
        "content_list_name": content_list.name if content_list else None,
        "content_list_path": str(content_list) if content_list else None,
        "middle_name": middle.name if middle else None,
        "middle_path": str(middle) if middle else None,
        "images_count": len(images),
    }


def _copy_to_raw(
    ctx: StepContext, md_path: Path, content_list: Path | None, middle: Path | None = None
) -> None:
    """把解析原始产物复制进 raw/（永不清理，PRD FR-1.6）"""
    import shutil

    ctx.store.ensure_dirs()
    dst = ctx.store.raw_root
    shutil.copy2(md_path, dst / md_path.name)
    if content_list is not None and content_list.exists():
        shutil.copy2(content_list, dst / content_list.name)
    if middle is not None and middle.exists():
        shutil.copy2(middle, dst / middle.name)
    img_src = md_path.parent / "images"
    if img_src.exists():
        img_dst = ensure_dir(dst / "images")
        for f in img_src.iterdir():
            if f.is_file() and not (img_dst / f.name).exists():
                shutil.copy2(f, img_dst / f.name)


def _parse_cloud(ctx: StepContext) -> dict:
    """调 MinerU 云端解析单篇（复用现有客户端；需 MINERU_API_TOKEN）"""
    from .. import run_registry
    from ..mineru.client import MineruClient
    from ..mineru.uploader import _organize_zip

    src = ctx.resolved_source_dir() / ctx.region_dir
    candidates = [p for p in sorted(src.iterdir()) if p.stem == ctx.doc_id] if src.exists() else []
    if not candidates:
        raise FileNotFoundError(f"未找到源文件: {src}/{ctx.doc_id}.(pdf|html)")
    file_path = candidates[0]
    if not ctx.settings.mineru_api_token:
        raise RuntimeError("缺少 MINERU_API_TOKEN，无法走云端解析（可改用 mode=local）")

    cfg = ctx.settings.mineru_cfg
    model = cfg.model_pdf if file_path.suffix.lower() == ".pdf" else cfg.model_html
    client = MineruClient(ctx.settings.mineru_api_token, base_url=cfg.base_url)

    def _tick(items: list[dict], elapsed_s: int) -> None:
        """把 MinerU 云端状态写进运行登记表 —— 解析是最常见的长步骤（分钟级），
        前端要能看到"云端正在做什么"（排队 / 已解析 N/M 页），而不是停在"解析"两个字上。"""
        parts: list[str] = []
        for it in items:
            prog = it.get("extract_progress") or {}
            if isinstance(prog, dict) and prog.get("total_pages"):
                parts.append(f"已解析 {prog.get('extracted_pages', 0)}/{prog['total_pages']} 页")
            elif it.get("state"):
                parts.append(str(it["state"]))
        tail = "、".join(parts) if parts else "处理中"
        run_registry.set_substep(ctx.doc_id, f"MinerU 云端解析（{tail}，已 {elapsed_s}s）")

    try:
        data = client.submit_upload_batch(
            [{"name": file_path.name, "data_id": file_path.stem}], model, language=cfg.language
        )
        client.upload_file(data["file_urls"][0], file_path.read_bytes())
        run_registry.set_substep(ctx.doc_id, "MinerU 排队中…")
        results = client.poll_batch(
            data["batch_id"], interval_s=cfg.poll_interval_s, timeout_s=cfg.poll_timeout_s,
            on_tick=_tick,
        )
        ok = next((r for r in results if r.get("state") == "done"), None)
        if ok is None:
            raise RuntimeError(f"MinerU 解析失败: {[r.get('err_msg') for r in results]}")
        _organize_zip(
            client.download_zip(ok["full_zip_url"]),
            ctx.resolved_out_dir() / ctx.region_dir,
            file_path.stem,
        )
    finally:
        client.close()
    return {}


def run(ctx: StepContext) -> tuple[dict, dict]:
    doc_dir = ctx.resolved_out_dir() / ctx.region_dir / ctx.doc_id
    mode = ctx.params.get("mode") or "auto"
    if mode == "auto":
        mode = "local" if doc_dir.exists() else "cloud"

    payload: dict = {"doc_id": ctx.doc_id, "region": ctx.region, "mode": mode, "warnings": []}

    if mode == "cloud":
        _parse_cloud(ctx)      # 产出落到 out_dir，下面统一按 local 方式收集
        mode = "cloud"
        payload["mode"] = mode
        engine_version = ENGINE_VERSION_CLOUD
    else:
        engine_version = ENGINE_VERSION_LOCAL

    collected = _collect_product(doc_dir)
    if collected is None:
        raise FileNotFoundError(
            f"未找到可用解析产物: {doc_dir}（mode={mode}；local 模式需 `*.md`）"
        )
    payload.update(collected)
    payload["engine_version"] = engine_version
    _copy_to_raw(
        ctx,
        Path(payload["md_path"]),
        Path(payload["content_list_path"]) if payload["content_list_path"] else None,
        Path(payload["middle_path"]) if payload.get("middle_path") else None,
    )

    stats = {
        "md_chars": payload["md_chars"],
        "images": payload["images_count"],
        "has_content_list": bool(payload["content_list_path"]),
        # 有道更细的块模型（逐块/逐行 bbox）时，界面可以把高亮粒度做到 MinerU 那么细
        "has_middle": bool(payload.get("middle_path")),
    }
    return payload, stats
