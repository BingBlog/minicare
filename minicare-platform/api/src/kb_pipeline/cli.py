"""CLI 入口：kb-pipeline parse / chunk / import / embed / pipeline"""
from __future__ import annotations

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
        from .fsutil import ensure_dir

        rp = s.store_cfg.review_report
        ensure_dir(rp.parent)
        with open(rp, "w", encoding="utf-8") as f:
            f.write("# 数字缺失复核清单\n\n")
            for kb_id, title, reason, cands, doc_id in review_items:
                f.write(f"- `{kb_id}` [{doc_id}] {title}\n  - {reason}\n")
                f.writelines(f"  - {cand}\n" for cand in cands)
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
    """全流程：parse → chunk（→ import 需 DB，默认跳过）

    【旧路径】单函数顺序执行。新流程请用 `kb-pipeline run`（七步编排，支持缓存与单步重跑）。
    """
    ctx.invoke(parse, source=source, out_dir=out_dir)
    ctx.invoke(chunk, doc=None, out_jsonl=None)


# ═══════════════════════════════════════════════════════════════════════════
# 七步编排（PRD-008 第 1 期）——推荐路径
# ═══════════════════════════════════════════════════════════════════════════


@main.command(name="config")
@click.pass_context
def show_config(ctx) -> None:
    """查看生效阈值表（含每项来源：yaml / code-default）"""
    from .config import format_effective_table

    click.echo(format_effective_table(ctx.obj["settings"]))


@main.command(name="steps")
def list_steps() -> None:
    """列出七步定义与依赖拓扑"""
    from .registry import STEP_ORDER, STEP_REGISTRY

    click.echo("七步流水线（PRD-008 §6.1）：")
    for i, sid in enumerate(STEP_ORDER, 1):
        spec = STEP_REGISTRY[sid]
        deps = ", ".join(spec.requires) or "-"
        conc = "并发" if not spec.local_only else "串行"
        click.echo(f"  {i}. {sid:<10} {spec.label:<6} 依赖={deps:<22} {conc}")


def _orchestrator(ctx):
    from .orchestrator import Orchestrator

    s = ctx.obj["settings"]
    return s, Orchestrator(s)


def _print_run(payload: dict) -> None:
    click.echo(f"文档 {payload['doc_id']}  最终状态: {payload['status']}")
    for st in payload["steps"]:
        mark = {"succeeded": "✔", "skipped_cached": "↻", "failed": "✘"}.get(st["status"], "·")
        extra = ""
        if st["status"] == "skipped_cached":
            extra = " (缓存命中)"
        elif st["stats"]:
            extra = " " + " ".join(f"{k}={v}" for k, v in list(st["stats"].items())[:4])
        click.echo(f"  {mark} {st['step_id']:<10} {st['status']:<16}{st['duration_ms']:>6}ms{extra}")
        for w in st.get("warnings") or []:
            click.echo(f"      ⚠ {w}")
        if st.get("error"):
            click.echo(f"      ✘ {st['error']}")


@main.command()
@click.option("--doc", required=True, help="doc_id（MinerU 产物目录名 / 源文件名去扩展名）")
@click.option("--region", type=click.Choice(["cn", "intl"]), default="cn", help="语料地区")
@click.option("--until", default=None, help="跑到该步骤为止（如 until=segment）")
@click.option("--force", is_flag=True, help="绕过缓存强制重跑")
@click.option("--write", is_flag=True, help="允许真实副作用（写库/调向量服务）；默认全程 dry-run")
@click.option("--enqueue", is_flag=True, help="只入队不执行（配合 kb-pipeline drain）")
@click.option("--source", type=click.Path(path_type=Path), default=None, help="源文件目录")
@click.option("--out", "out_dir", type=click.Path(path_type=Path), default=None, help="MinerU 产物目录")
@click.pass_context
def run(ctx, doc, region, until, force, write, enqueue, source, out_dir) -> None:
    """按七步编排跑一份文档（默认 dry-run：不写库、不调向量服务）

    例：kb-pipeline run --doc <doc_id> --region cn            # 本地全流程验证
        kb-pipeline run --doc <doc_id> --until segment        # 只跑到切块
        kb-pipeline run --doc <doc_id> --force --write        # 强制重跑并真实写库
    """
    s, orch = _orchestrator(ctx)
    if not s.yaml_loaded:
        click.echo("[warn] pipeline.yaml 未生效，当前全部使用代码默认阈值（见 kb-pipeline config）")

    if enqueue:
        tid = orch.submit(doc, force=force)
        click.echo(f"已入队 task_id={tid}（kb-pipeline drain 消费）")
        return

    payload = orch.run_pipeline(
        doc,
        region=region,
        until=until,
        force=force,
        dry_run=not write,
        source_dir=source,
        out_dir=out_dir,
    )
    _print_run(payload)
    if not write:
        click.echo("（dry-run：未写库、未调用向量服务；加 --write 可执行真实副作用）")


@main.command()
@click.option("--doc", required=True, help="doc_id")
@click.option("--step", "step_id", required=True, help="步骤名（见 kb-pipeline steps）")
@click.option("--region", type=click.Choice(["cn", "intl"]), default="cn")
@click.option("--force", is_flag=True, help="绕过缓存强制重跑")
@click.option("--write", is_flag=True, help="允许真实副作用")
@click.option("--source", type=click.Path(path_type=Path), default=None)
@click.option("--out", "out_dir", type=click.Path(path_type=Path), default=None)
@click.pass_context
def step(ctx, doc, step_id, region, force, write, source, out_dir) -> None:
    """只跑某一步（上游产物必须已就绪；用于单步重试与排障）"""
    _settings, orch = _orchestrator(ctx)
    res = orch.run_step(
        doc, step_id, region=region, force=force, dry_run=not write,
        source_dir=source, out_dir=out_dir,
    )
    click.echo(f"{step_id}: {res.status}  {res.duration_ms}ms  {res.stats}")
    for w in res.warnings:
        click.echo(f"  ⚠ {w}")
    if res.error:
        click.echo(f"  ✘ {res.error}")
    click.echo(f"派生状态: {orch.derive_status(doc)}")


@main.command()
@click.option("--doc", required=True, help="doc_id")
@click.pass_context
def show(ctx, doc) -> None:
    """查看某文档的七步状态、产物指纹与历史 run"""
    from .registry import STEP_ORDER

    _settings, orch = _orchestrator(ctx)
    store = orch.store_for(doc)
    manifest = store.load_manifest()
    click.echo(f"文档 {doc}  派生状态: {orch.derive_status(doc)}")
    click.echo(f"manifest: {store.manifest_path}")
    click.echo(f"{'步骤':<12}{'状态':<14}{'run_id':<28}{'耗时':>8}  产物指纹")
    for sid in STEP_ORDER:
        entry = manifest.get("steps", {}).get(sid, {})
        cur = next((r for r in entry.get("runs", []) if r.get("run_id") == entry.get("current_run")), None)
        if cur is None:
            click.echo(f"{sid:<12}{entry.get('status', 'pending'):<14}{'-':<28}{'-':>8}  -")
            continue
        click.echo(
            f"{sid:<12}{entry.get('status', ''):<14}{cur.get('run_id', ''):<28}"
            f"{cur.get('duration_ms', 0):>6}ms  {str(cur.get('artifact_hash', ''))[:12]}"
            f"  runs={len(entry.get('runs', []))}"
        )
    nxt = orch.next_step_to_run(doc)
    click.echo(f"下一步应执行: {nxt or '（全部已完成）'}")


@main.command()
@click.option("--doc", required=True, help="doc_id")
@click.option("--from", "from_step", required=True, help="从该步开始作废（含自身及全部下游）")
@click.pass_context
def invalidate(ctx, doc, from_step) -> None:
    """作废某步及其下游（标 stale，产物文件保留）"""
    _settings, orch = _orchestrator(ctx)
    marked = orch.invalidate(doc, from_step)
    click.echo("已标为待重跑: " + ", ".join(marked))
    click.echo(
        "提示：产物文件按 PRD FR-1.8 保留；若上游输入未变，重跑会因内容寻址命中缓存"
        "（结果与上次一致）。要强制真实重算请加 --force。"
    )


@main.command()
@click.option("--resume", is_flag=True, help="把上次崩溃遗留的 running 任务退回队列")
@click.option("--cancel-all", is_flag=True, help="取消全部排队/执行中的任务")
@click.pass_context
def queue(ctx, resume, cancel_all) -> None:
    """查看任务队列状态（单用户本机，串行执行）"""
    _settings, orch = _orchestrator(ctx)
    if resume:
        ids = orch.resume()
        click.echo(f"已恢复 {len(ids)} 个孤儿任务: {', '.join(ids) or '-'}")
    if cancel_all:
        n = orch.queue.cancel_all()
        click.echo(f"已请求取消 {n} 个任务")
    click.echo("状态统计: " + str(orch.queue.stats()))
    for t in orch.queue.list_tasks(limit=20):
        pos = orch.queue.position(t["task_id"])
        pos_s = f" 队列第 {pos} 位" if pos else ""
        click.echo(f"  {t['task_id'][:8]}  {t['doc_id']:<40} {t['kind']:<9} {t['state']:<10}"
                   f"{t.get('progress_hint') or ''}{pos_s}")


@main.command()
@click.option("--write", is_flag=True, help="允许真实副作用（写库/调向量服务）")
@click.option("--region", type=click.Choice(["cn", "intl"]), default="cn")
@click.pass_context
def drain(ctx, write, region) -> None:
    """串行消费任务队列直到为空"""
    _settings, orch = _orchestrator(ctx)
    outcomes = orch.drain(region=region, dry_run=not write)
    if not outcomes:
        click.echo("队列为空")
    for o in outcomes:
        click.echo(f"--- {o['doc_id']} ({o.get('task_id', '')[:8]}) → {o.get('status')}")
        for st in o.get("steps", []):
            click.echo(f"    {st['step_id']:<10} {st['status']}")


@main.command()
@click.option("--host", default="127.0.0.1", show_default=True, help="监听地址（默认仅本机）")
@click.option("--port", default=8787, show_default=True, help="监听端口（TECH-015 §3.1 约定）")
@click.option("--reload", is_flag=True, help="代码变更自动重载（开发用）")
@click.pass_context
def serve(ctx, host, port, reload) -> None:
    """启动本地 Web 开发环境（v0：看七步状态、跑 dry-run、单步重跑、作废）

    例：kb-pipeline serve                  # → http://127.0.0.1:8787
        kb-pipeline serve --reload          # 开发模式

    ⚠️ 本环境**不开放写库**（迁移 021 未执行 + index 实跑路径未验证）。
    """
    try:
        import uvicorn
    except ImportError as e:
        raise click.ClickException(
            '缺少 Web 依赖。安装：.venv/bin/pip install -e ".[web]"'
        ) from e

    s = ctx.obj["settings"]
    if not s.yaml_loaded:
        click.echo("[warn] pipeline.yaml 未生效，当前全部使用代码默认阈值（见 kb-pipeline config）")
    click.echo(f"敏宝管理平台 · 本地开发环境 → http://{host}:{port}")
    click.echo(f"  管线版本 {_pipeline_version()} · 数据根 {s.platform_cfg.data_root}")
    click.echo("  只读模式：不写库；运行均为 dry-run")

    from .web.api import frontend_dist

    dist = frontend_dist()
    if dist is None:
        click.echo(
            "  前端：内嵌单页 v0（未找到构建产物）\n"
            "    要启用 React 前端：cd minicare-platform/web && npm install && npm run build"
        )
    else:
        click.echo(f"  前端：React 构建产物（{dist}）")

    if reload:
        # --reload 需要 import 字符串，走工厂函数
        uvicorn.run("kb_pipeline.web.api:get_asgi_app", host=host, port=port, reload=True, factory=True)
    else:
        from .web.api import create_app

        uvicorn.run(create_app(), host=host, port=port)


def _pipeline_version() -> str:
    from . import __version__

    return __version__


def _register_extra_commands() -> None:
    """注册第 2–5 期能力（corpus / chunks / review / quality / contract / publish / gaps）"""
    from .cli_extra import register

    register(main)


_register_extra_commands()


if __name__ == "__main__":
    main()
