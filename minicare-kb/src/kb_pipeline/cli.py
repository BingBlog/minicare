"""CLI 入口：kb-pipeline parse / chunk / import / embed / pipeline"""
from __future__ import annotations

import json
from pathlib import Path

import click

from .config import Settings, get_settings
from .logger import get_logger

log = get_logger(__name__)


@click.group()
@click.pass_context
def main(ctx: click.Context) -> None:
    """敏宝知识库管线（解析→切块→校验→入库）"""
    ctx.ensure_object(dict)
    ctx.obj["settings"] = get_settings()


@main.command()
@click.option("--source", type=click.Path(path_type=Path), default=None, help="源文件目录（默认 源文件/）")
@click.option("--out", "out_dir", type=click.Path(path_type=Path), default=None, help="产物目录（默认 minerU解析版本/）")
@click.option("--force", is_flag=True, help="清旧产物重跑（默认跳过已有）")
@click.pass_context
def parse(ctx, source, out_dir, force) -> None:
    """① 解析：MinerU 云端 pipeline → 产物目录（幂等跳过）"""
    from .mineru.uploader import parse_dir

    s: Settings = ctx.obj["settings"]
    src = source or s.source_dir
    out = out_dir or s.out_dir
    if not s.mineru_api_token:
        raise click.ClickException("缺少 MINERU_API_TOKEN（.env）")
    stats = parse_dir(src, out, s, force=force)
    click.echo(f"完成: 共 {stats.total} 个文件, 成功 {stats.done}, 跳过 {stats.skipped}, 失败 {len(stats.failed)}")
    if stats.failed:
        click.echo(f"失败清单: {stats.failed}")


@main.command()
@click.option("--doc", default=None, help="单文档调试（doc_id，默认全部）")
@click.option("--out", "out_jsonl", type=click.Path(path_type=Path), default=None, help="chunks.jsonl 路径")
@click.option("--splitter", type=click.Choice(["self", "llama"]), default="self", help="切块方案：self=自研（默认）/ llama=LlamaIndex 原生")
@click.pass_context
def chunk(ctx, doc, out_jsonl, splitter) -> None:
    """② 清洗+切块+锚定+校验 → chunks.jsonl + review 报告（--splitter 切换切块方案）"""
    from .anchors.page_anchor import anchor_chunk, build_page_index
    from .metadata.annotate import annotate_chunk
    from .mineru.result import scan_documents
    from .preprocess.clean import clean_text
    from .store.knowledge_base import write_chunks_jsonl
    from .validate.numbers import check_chunk
    from .validate.pdf_layer import cross_check

    if splitter == "self":
        from .chunking.pipeline import chunk_document
    else:
        from .chunking.llama import chunk_document_llama as chunk_document

    s: Settings = ctx.obj["settings"]
    out_path = out_jsonl or s.store_cfg.chunk_jsonl
    docs = scan_documents(s.out_dir, s)
    if doc:
        docs = [d for d in docs if d.doc_id == doc]
    if not docs:
        raise click.ClickException(f"未找到文档（out_dir={s.out_dir}，doc={doc or '全部'}）")

    all_chunks: list = []
    review_items: list[tuple] = []
    for d in docs:
        md_text = d.md_path.read_text(encoding="utf-8")
        cleaned = clean_text(md_text)
        chunks = chunk_document(d, cleaned, s)
        page_index = build_page_index(d.content_list_path) if d.content_list_path else []
        for c in chunks:
            anchor_chunk(c, page_index)
            check_chunk(c, s)
            annotate_chunk(c, s)
            if c.review:
                cands = cross_check(c, d.pdf_path)
                review_items.append((c.kb_id, c.title, c.review_reason, cands, d.doc_id))
        all_chunks.extend(chunks)
        log.info(f"[chunk] {d.doc_id}: {len(chunks)} 块 (review {sum(1 for c in chunks if c.review)})")

    write_chunks_jsonl(all_chunks, out_path)
    # review 报告
    if review_items:
        rp = s.store_cfg.review_report
        rp.parent.mkdir(parents=True, exist_ok=True)
        with open(rp, "w", encoding="utf-8") as f:
            f.write("# 数字缺失复核清单\n\n")
            for kb_id, title, reason, cands, doc_id in review_items:
                f.write(f"- `{kb_id}` [{doc_id}] {title}\n  - {reason}\n")
                for cand in cands:
                    f.write(f"  - {cand}\n")
        click.echo(f"review 清单: {rp}")
    click.echo(f"完成: {len(docs)} 文档 → {len(all_chunks)} 块, review {len(review_items)} 条 → {out_path}")


@main.command()
@click.option("--chunks", "chunks_path", type=click.Path(path_type=Path), default=None, help="chunks.jsonl")
@click.option("--replace", is_flag=True, help="清空表后全量重入（离线管线默认语义）")
@click.pass_context
def import_kb(ctx, chunks_path, replace) -> None:
    """③ 入库：chunks.jsonl → knowledge_base（幂等 upsert；--replace 全量重入）"""
    from .store.knowledge_base import load_chunks_jsonl, upsert_knowledge_base

    s: Settings = ctx.obj["settings"]
    path = chunks_path or s.store_cfg.chunk_jsonl
    if not path.exists():
        raise click.ClickException(f"chunks.jsonl 不存在: {path}")
    if not s.db_user:
        raise click.ClickException("缺少 DB 配置（.env）")
    chunks = load_chunks_jsonl(path)
    ok, review = upsert_knowledge_base(chunks, s, replace=replace)
    click.echo(f"入库完成: {ok} 条（review {review} 条已标 [待复核]）")


@main.command()
@click.option("--limit", type=int, default=None, help="只向量化前 N 条（调试用）")
@click.pass_context
def embed(ctx, limit) -> None:
    """④ embedding：全量 active 且非 review 条目 → TokenHub → 写回 BLOB（增量，可断点续跑）"""
    from .embed.runner import embed_all

    s: Settings = ctx.obj["settings"]
    if not s.db_user:
        raise click.ClickException("缺少 DB 配置（.env）")
    if not s.tokenhub_api_key:
        raise click.ClickException("缺少 TokenHub API Key（TOKENHUB_API_KEY，.env）")
    done, skipped_review = embed_all(s, limit=limit)
    click.echo(f"embedding 完成: {done} 条向量化, review {skipped_review} 条跳过")


@main.command()
@click.option("--source", type=click.Path(path_type=Path), default=None)
@click.option("--out", "out_dir", type=click.Path(path_type=Path), default=None)
@click.pass_context
def pipeline(ctx, source, out_dir) -> None:
    """全流程：parse → chunk（→ import 需 DB，默认跳过）"""
    ctx.invoke(parse, source=source, out_dir=out_dir)
    ctx.invoke(chunk, doc=None, out_jsonl=None)


if __name__ == "__main__":
    main()
