"""CLI 扩展命令（第 2–5 期能力）：corpus / meta / chunks / review / quality / contract / publish / gaps / keywords

单独成文件的原因：`cli.py` 已经承担第 1 期的六步命令，再塞进来会过长；
这里按"能力域"分组注册到同一个 click group，用法上仍然是一个 `kb-pipeline`。
"""
from __future__ import annotations

import json
from pathlib import Path

import click

from .config import Settings


def _ctx_objs(ctx) -> tuple[Settings, object]:
    """返回 (settings, orchestrator)"""
    from .orchestrator import Orchestrator

    s: Settings = ctx.obj["settings"]
    return s, Orchestrator(s)


def _db(ctx):
    from .platform_db import PlatformDB

    s: Settings = ctx.obj["settings"]
    return PlatformDB(s.platform_cfg.db_path)


# ══════════════════════════════════════════════════════════════════════════
# 语料档案（US-01 / US-02）
# ══════════════════════════════════════════════════════════════════════════


@click.group()
def corpus() -> None:
    """语料档案与来源台账（US-01 / US-02）"""


@corpus.command("add")
@click.option("--file", "file_path", type=click.Path(path_type=Path, exists=True), required=True)
@click.option("--region", type=click.Choice(["cn", "intl"]), default="cn")
@click.option("--source-name", default=None, help="来源名（缺省按文件名规则预填）")
@click.option("--year", type=int, default=None)
@click.option("--evidence", default=None, help="guideline/consensus/RCT/policy/edu")
@click.option("--publisher", default=None)
@click.option("--license", "license_", default=None)
@click.pass_context
def corpus_add(ctx, file_path, region, source_name, year, evidence, publisher, license_) -> None:
    """登记一份源文件（按内容 sha256 判重，来源两级瀑布预填）"""
    from .corpus import CorpusLedger, prefill, sha256_file

    db = _db(ctx)
    ledger = CorpusLedger(db)
    doc_id = sha256_file(file_path)
    body = ""
    if file_path.suffix.lower() == ".html":
        body = file_path.read_text(encoding="utf-8", errors="replace")[:4000]

    dup = ledger.get(doc_id)
    fields = prefill(filename=file_path.name, region=region, doc_id=doc_id, body_text=body)
    fields.update(size_bytes=file_path.stat().st_size,
                  kind=file_path.suffix.lstrip(".").lower(),
                  source_name=source_name or fields["source_name"],
                  year=year or fields["year"],
                  evidence_level=evidence or fields["evidence_level"],
                  publisher=publisher or fields["publisher"],
                  license=license_)

    similar = ledger.suggest_duplicate(fields["source_name"], exclude_doc_id=doc_id)
    row = ledger.register(fields, status="pending" if not dup else dup["status"])
    click.echo(f"登记 {doc_id[:12]}… → {row['source_name']}（{row.get('year') or '年份待补'}）")
    if dup:
        click.echo(f"  ⚠ 该文件已登记过（首次 {dup['created_at']}，状态 {dup['status']}）")
    if similar:
        click.echo(f"  ⚠ 疑似同一来源：{similar['doc_id'][:12]}…「{similar['source_name']}」")
    if fields["missing_required"]:
        click.echo(f"  ⚠ 必填缺失：{'、'.join(fields['missing_required'])}（该文档不可发布）")


@corpus.command("list")
@click.option("--status", default=None)
@click.pass_context
def corpus_list(ctx, status) -> None:
    """列出语料台账"""
    from .corpus import CorpusLedger

    rows = CorpusLedger(_db(ctx)).list(status)
    if not rows:
        click.echo("台账为空：用 kb-pipeline corpus add 登记")
        return
    click.echo(f"{'doc_id':<14}{'来源':<40}{'年份':<6}{'地区':<6}{'级别':<10}{'状态':<12}许可")
    for r in rows:
        click.echo(f"{(r['doc_id'] or '')[:12]:<14}{(r['source_name'] or '')[:38]:<40}"
                   f"{r['year'] or '—'!s:<6}{r['region'] or '—'!s:<6}"
                   f"{r['evidence_level'] or '—'!s:<10}{r['status']:<12}{r['license'] or '未标注'}")


@corpus.command("missing")
@click.pass_context
def corpus_missing(ctx) -> None:
    """列出来源不全的语料（必填缺失 / 许可证未标注）"""
    from .corpus import CorpusLedger

    ledger = CorpusLedger(_db(ctx))
    rows = ledger.missing_required()
    if not rows:
        click.echo("✔ 全部语料的必填字段与许可证齐备")
        return
    for r in rows:
        flags = []
        if r["missing"]:
            flags.append("必填缺失: " + "、".join(r["missing"]))
        if r["license_missing"]:
            flags.append("许可证未标注")
        click.echo(f"  {r['doc_id'][:12]}… {r['source_name'][:34]:<36} {' / '.join(flags)}")
    click.echo(json.dumps(ledger.completeness(), ensure_ascii=False))


@corpus.command("export")
@click.option("--out", "out_path", type=click.Path(path_type=Path), default=None)
@click.pass_context
def corpus_export(ctx, out_path) -> None:
    """导出台账（Markdown；可进 git 留档）"""
    from .corpus import CorpusLedger

    md = CorpusLedger(_db(ctx)).export_markdown()
    if out_path:
        out_path.write_text(md, encoding="utf-8")
        click.echo(f"已写出 {out_path}")
    else:
        click.echo(md)


@corpus.command("supersede")
@click.option("--old", "old_id", required=True)
@click.option("--new", "new_id", required=True)
@click.pass_context
def corpus_supersede(ctx, old_id, new_id) -> None:
    """建立取代关系：旧版归档，新版 version+1"""
    from .corpus import CorpusLedger

    row = CorpusLedger(_db(ctx)).make_new_version(old_id, new_id)
    click.echo(f"已归档 {old_id[:12]}… → 新版本 v{row.get('version')}（{new_id[:12]}…）")


# ══════════════════════════════════════════════════════════════════════════
# 切片校对（US-05）
# ══════════════════════════════════════════════════════════════════════════


@click.group()
def chunks() -> None:
    """切片校对：编辑 / 禁用 / 删除 / 拆分 / 合并 / 找回旧编辑（US-05）"""


def _current_chunks(orch, doc: str) -> tuple[list[dict], str, str]:
    store = orch.store_for(doc)
    seg = store.read_current_artifact("segment")
    if seg is None:
        raise click.ClickException(f"{doc} 还没有切块产物，先跑 kb-pipeline run")
    run = store.current_run("segment") or {}
    return seg.get("chunks", []), run.get("run_id", ""), run.get("artifact_hash", "")


@chunks.command("list")
@click.option("--doc", required=True)
@click.option("--only", type=click.Choice(["all", "review", "excluded", "edited"]), default="all")
@click.pass_context
def chunks_list(ctx, doc, only) -> None:
    """列出切片（可按复核 / 屏蔽 / 已编辑筛选）"""
    orch = _ctx_objs(ctx)[1]
    rows, _, _ = _current_chunks(orch, doc)
    def keep(c):
        if only == "review":
            return c.get("review")
        if only == "excluded":
            return c.get("excluded") or c.get("disabled")
        if only == "edited":
            return c.get("edited")
        return True
    rows = [c for c in rows if keep(c)]
    click.echo(f"{'kb_id':<30}{'类型':<9}{'页':<6}{'字数':<7}{'状态':<22}标题")
    for c in rows:
        flags = []
        if c.get("review"):
            flags.append("待复核")
        if c.get("review_state"):
            flags[-1:] = [f"核对:{c['review_state']}"]
        if c.get("excluded") or c.get("disabled"):
            flags.append(c.get("exclude_rule") or "屏蔽")
        if c.get("edited"):
            flags.append("已编辑")
        click.echo(f"{c['kb_id'][:28]:<30}{c.get('chunk_type',''):<9}"
                   f"{c.get('page_idx') if c.get('page_idx') is not None else '—'!s:<6}"
                   f"{len(c.get('content') or ''):<7}{'/'.join(flags) or 'ok':<22}"
                   f"{(c.get('title') or '')[:30]}")
    click.echo(f"共 {len(rows)} 块")


@chunks.command("edit")
@click.option("--doc", required=True)
@click.option("--kb-id", required=True)
@click.option("--text", required=True, help="新的切片正文")
@click.pass_context
def chunks_edit(ctx, doc, kb_id, text) -> None:
    """编辑切片正文（落人工产物，不覆盖机器产物）"""
    from .edits import OP_EDIT, EditStore

    orch = _ctx_objs(ctx)[1]
    _, run_id, chash = _current_chunks(orch, doc)
    EditStore(orch.store_for(doc).edits_root).add_entry(
        {"op": OP_EDIT, "chunk_id": kb_id, "text": text},
        base_run_id=run_id, base_content_hash=chash)
    orch.invalidate(doc, "segment")
    click.echo(f"已编辑 {kb_id}；已标 segment 及下游待重跑（重跑即生效，index 会优先读人工产物）")


@chunks.command("disable")
@click.option("--doc", required=True)
@click.option("--kb-id", required=True)
@click.pass_context
def chunks_disable(ctx, doc, kb_id) -> None:
    """禁用切片（保留但不参与检索）"""
    from .edits import OP_DISABLE, EditStore

    orch = _ctx_objs(ctx)[1]
    _, run_id, chash = _current_chunks(orch, doc)
    EditStore(orch.store_for(doc).edits_root).add_entry(
        {"op": OP_DISABLE, "chunk_id": kb_id}, base_run_id=run_id, base_content_hash=chash)
    orch.invalidate(doc, "segment")
    click.echo(f"已禁用 {kb_id}（保留内容，不参与检索）")


@chunks.command("split")
@click.option("--doc", required=True)
@click.option("--kb-id", required=True)
@click.option("--at", "positions", required=True, help="拆分点字符偏移，逗号分隔，如 200,450")
@click.pass_context
def chunks_split(ctx, doc, kb_id, positions) -> None:
    """按字符偏移拆分切片（新块继承章节路径与页码）"""
    from .edits import OP_SPLIT, EditStore

    orch = _ctx_objs(ctx)[1]
    rows, run_id, chash = _current_chunks(orch, doc)
    src = next((c for c in rows if c["kb_id"] == kb_id), None)
    if src is None:
        raise click.ClickException(f"未找到切片 {kb_id}")
    text = src.get("content") or ""
    cuts = sorted(int(x) for x in positions.split(",") if x.strip().isdigit())
    parts, prev = [], 0
    for cut in cuts:
        if 0 < cut < len(text):
            parts.append(text[prev:cut])
            prev = cut
    parts.append(text[prev:])
    if len(parts) < 2:
        raise click.ClickException("拆分点无效（需在正文长度范围内）")
    EditStore(orch.store_for(doc).edits_root).add_entry(
        {"op": OP_SPLIT, "src": kb_id, "parts": parts},
        base_run_id=run_id, base_content_hash=chash)
    orch.invalidate(doc, "segment")
    click.echo(f"已把 {kb_id} 拆为 {len(parts)} 块（继承章节路径与页码）")


@chunks.command("merge")
@click.option("--doc", required=True)
@click.option("--kb-id", "kb_ids", multiple=True, required=True, help="要合并的切片，按顺序给多个")
@click.pass_context
def chunks_merge(ctx, doc, kb_ids) -> None:
    """合并多个切片为一块"""
    from .edits import OP_MERGE, EditStore

    orch = _ctx_objs(ctx)[1]
    _, run_id, chash = _current_chunks(orch, doc)
    EditStore(orch.store_for(doc).edits_root).add_entry(
        {"op": OP_MERGE, "src": list(kb_ids)}, base_run_id=run_id, base_content_hash=chash)
    orch.invalidate(doc, "segment")
    click.echo(f"已合并 {len(kb_ids)} 块")


@chunks.command("recoverable")
@click.option("--doc", required=True)
@click.pass_context
def chunks_recoverable(ctx, doc) -> None:
    """重切之后，列出可找回的旧编辑（按文本相似度，需人工逐条确认）"""
    from .edits import EditStore, find_recoverable

    orch = _ctx_objs(ctx)[1]
    rows, _, _ = _current_chunks(orch, doc)
    store = EditStore(orch.store_for(doc).edits_root)
    cands = find_recoverable(rows, store.load_chunks())
    if not cands:
        click.echo("没有可找回的旧编辑")
        return
    for c in cands:
        click.echo(f"  旧 {c['old_chunk_id']} → 候选 {c['candidate_kb_id']}（相似度 {c['similarity']}）")
    click.echo("逐条确认后可用 kb-pipeline chunks edit 重新应用")


# ══════════════════════════════════════════════════════════════════════════
# 解析高危敏感信息复核（US-06，原「内容复核」2026-10-09 改名）
# ══════════════════════════════════════════════════════════════════════════


@click.group()
def review() -> None:
    """解析高危敏感信息复核四态：待复核 / 已采纳 / 已编辑 / 误报 / 无法补全（US-06）"""


@review.command("list")
@click.option("--doc", required=True)
@click.pass_context
def review_list(ctx, doc) -> None:
    """列出复核清单（含 pypdf 候选补全值）"""
    orch = _ctx_objs(ctx)[1]
    v = orch.store_for(doc).read_current_artifact("validate")
    if v is None:
        raise click.ClickException(f"{doc} 还没有校验产物")
    items = v.get("review_items") or []
    if not items:
        click.echo("✔ 没有待复核项")
        return
    for it in items:
        click.echo(f"  {it['kb_id']:<30}{'/'.join(it.get('patterns') or []) or it.get('reason','')}")
        click.echo(f"      {it.get('title') or ''} · p.{it.get('page_idx')}")
        for c in it.get("candidates") or []:
            click.echo(f"      候选：{c}")


@review.command("resolve")
@click.option("--doc", required=True)
@click.option("--kb-id", required=True)
@click.option("--state", required=True,
              type=click.Choice(["accepted", "edited", "rejected", "unresolvable"]))
@click.option("--value", default="", help="补全值（accepted/edited 时必填）")
@click.option("--rule", default="", help="命中规则名（用于记规则例外）")
@click.pass_context
def review_resolve(ctx, doc, kb_id, state, value, rule) -> None:
    """处置一条复核项；accepted/edited 会补值并标为可检索"""
    from .edits import EditStore

    orch = _ctx_objs(ctx)[1]
    if state in ("accepted", "edited") and not value:
        raise click.ClickException("accepted / edited 必须提供 --value")
    EditStore(orch.store_for(doc).edits_root).set_review(
        kb_id, state=state, value=value, rule=rule)
    orch.invalidate(doc, "validate")
    click.echo(f"{kb_id} → {state}；已标 validate 及下游待重跑（重跑后内容被改的块会重算向量）")


# ══════════════════════════════════════════════════════════════════════════
# 检索质检（US-11）
# ══════════════════════════════════════════════════════════════════════════


@click.group()
def quality() -> None:
    """检索质检：测试集、gold 映射、Recall@k 与有害召回（US-11）"""


@quality.command("seed")
@click.option("--file", "file_path", type=click.Path(path_type=Path, exists=True), required=True)
@click.pass_context
def quality_seed(ctx, file_path) -> None:
    """从题目文件导入测试集（表格式 Markdown；仅题目与标注，不含映射展开）"""
    from .regression import RegressionRunner

    s, orch = _ctx_objs(ctx)
    n = RegressionRunner(s, orch.db, orch.data_root).seed_cases_from_markdown(file_path)
    click.echo(f"导入 {n} 条题目")


@quality.command("import")
@click.option("--testset", "testset_path", default=None,
              help="测试集文件（默认 docs/knowledge/research/召回测试集-种子50题.md）")
@click.option("--mapping", "mapping_path", default=None,
              help="映射表文件（默认 minicare-platform/api/docs/KB-MAPPING.md）")
@click.option("--dry-run/--write", default=True, show_default=True,
              help="默认 dry-run 只出报告；--write 才写入")
@click.pass_context
def quality_import(ctx, testset_path, mapping_path, dry_run) -> None:
    """导入/更新测试集与映射（解析 + 映射体检 + diff；幂等 upsert）"""
    from .quality.import_runner import default_paths, import_dataset

    s, orch = _ctx_objs(ctx)
    d = default_paths()
    report = import_dataset(orch.db, s, testset_path or d["testset"],
                            mapping_path or d["mapping"], dry_run=dry_run)
    click.echo(json.dumps(report, ensure_ascii=False, indent=2))
    if dry_run:
        click.echo("（dry-run 未写入；确认无误后加 --write 正式写入）")


@quality.command("gold")
@click.option("--file", "file_path", type=click.Path(path_type=Path, exists=True), required=True,
              help='JSON：{"A-01": ["kb_id1","kb_id2"], ...}')
@click.option("--version", default=None, help="口径版本，如 v2-manual")
@click.pass_context
def quality_gold(ctx, file_path, version) -> None:
    """导入 gold 映射（人工精修主块 + 语义判定口径）"""
    from .regression import RegressionRunner

    s, orch = _ctx_objs(ctx)
    mapping = json.loads(file_path.read_text(encoding="utf-8"))
    n = RegressionRunner(s, orch.db, orch.data_root).import_gold(mapping, version)
    click.echo(f"导入 {n} 条 gold 映射（口径 {version or s.regression_cfg.gold_version}）")


@quality.command("check")
@click.pass_context
def quality_check(ctx) -> None:
    """只做 gold 失效检查（不评测）"""
    from .regression import RegressionRunner

    s, orch = _ctx_objs(ctx)
    r = RegressionRunner(s, orch.db, orch.data_root).check_gold_valid()
    click.echo(json.dumps(r, ensure_ascii=False, indent=2))


@quality.command("run")
@click.option("--scope", default="all", show_default=True,
              help="all / modules:A,C / emergency / out_of_scope")
@click.option("--k", type=int, default=10, show_default=True)
@click.option("--limit", type=int, default=None)
@click.option("--no-baseline", is_flag=True, help="不覆盖基线镜像（用于对比）")
@click.pass_context
def quality_run(ctx, scope, k, limit, no_baseline) -> None:
    """跑检索质检（Recall@5/@10 + MRR + 有害召回 + 高危必召回；结果入台账）"""
    from .regression import RegressionRunner

    s, orch = _ctx_objs(ctx)
    try:
        r = RegressionRunner(s, orch.db, orch.data_root).run(
            scope=scope, top_k=k, limit=limit, record_baseline=not no_baseline)
    except RuntimeError as e:
        click.echo(f"⚠ 运行失败：{e}")
        raise SystemExit(1) from e
    if r["status"] != "ok":
        click.echo(f"⚠ {r['status']}：{r['message']}")
        for c in r.get("broken_cases", [])[:10]:
            click.echo(f"   失效题目 {c}")
        return

    def pct(v) -> str:
        return "—" if v is None else f"{v:.1%}"

    m, th = r["metrics"], r["thresholds"]
    click.echo(f"运行 {r['run_id']} · {r['scope_label']}")
    click.echo(f"Recall@5 = {pct(m['recall5'])}（门槛 {th['recall5_min']:.0%}）"
               f" · Recall@10 = {pct(m['recall10'])}（门槛 {th['recall10_min']:.0%}）")
    click.echo(f"MRR = {m['mrr']} · 有害召回 {pct(m['harmful_rate'])}（门槛 ≤{th['harmful_max']:.0%}）"
               f" · 高危必召回 {pct(m['emergency_recall'])}")
    if r.get("delta"):
        click.echo("较上次：" + " · ".join(f"{kk} {vv:+.2f}" for kk, vv in r["delta"].items()))
    state = ("■ 已中止（仅覆盖已完成题目）" if r.get("cancelled")
             else ("✔ 达标" if r["passed"] else "✘ 未达标（发布将被阻塞）"))
    click.echo(f"{state} · 口径 {m.get('metric_version')} · 用例集 {r['gold_version']}")
    for miss in r["misses"][:10]:
        click.echo(f"    未命中 {miss['case_id']} {miss['question'][:30]}"
                   f" [{miss.get('attribution')}] {miss.get('evidence', '')}")


# ══════════════════════════════════════════════════════════════════════════
# 智能体对接（US-13）
# ══════════════════════════════════════════════════════════════════════════


@click.group()
def contract() -> None:
    """检索契约：定义、校验、线上观察（US-13）"""


@contract.command("show")
@click.pass_context
def contract_show(ctx) -> None:
    """打印契约定义（字段集 + 语义约束）"""
    from . import contract as c

    click.echo(json.dumps(c.definition(), ensure_ascii=False, indent=2))


@contract.command("validate")
@click.option("--no-probe", is_flag=True, help="跳过语义探针（不连库）")
@click.pass_context
def contract_validate(ctx, no_probe) -> None:
    """发布前契约校验（不符即阻断发布）"""
    from . import contract as c

    s, _ = _ctx_objs(ctx)
    r = c.validate(s, probe=not no_probe)
    for chk in r["checks"]:
        mark = {"pass": "✔", "fail": "✘", "not_executed": "·"}[chk["status"]]
        click.echo(f"  {mark} {chk['label']:<16} {chk['detail']}")
    for v in r["violations"]:
        click.echo(f"  ✘ [{v['kind']}] {v['detail']}")
    click.echo("契约校验：" + ("✔ 通过" if r["ok"] else "✘ 未通过（阻断发布）"))


@contract.command("observe")
@click.option("--days", type=int, default=7, show_default=True)
@click.pass_context
def contract_observe(ctx, days) -> None:
    """线上检索观察：未命中 TOP（来源：远程 kb_search_log；无表则空）"""
    from .gaps import search_log_aggregate

    orch = _ctx_objs(ctx)[1]
    rows = search_log_aggregate(orch.db, days=days)
    if not rows:
        click.echo("没有检索日志（远程库无 kb_search_log 表，或近 N 天无未命中）")
        return
    for r in rows:
        click.echo(f"  {r['count']:>3} 次  {r['query']}")


# ══════════════════════════════════════════════════════════════════════════
# 发布（US-10）
# ══════════════════════════════════════════════════════════════════════════


@click.group()
def publish() -> None:
    """发布上线：发布前检查、快照、发布记录、回滚（US-10）"""


def _publisher(ctx):
    from .publish import Publisher

    s, orch = _ctx_objs(ctx)
    return s, orch, Publisher(s, orch.db, orch.data_root)


@publish.command("checks")
@click.option("--doc", "docs", multiple=True, required=True)
@click.pass_context
def publish_checks(ctx, docs) -> None:
    """只跑发布前 4 项检查"""
    _s, _orch, pub = _publisher(ctx)
    for c in pub.preflight_checks(list(docs)):
        mark = {"pass": "✔", "fail": "✘", "not_executed": "·"}[c["status"]]
        click.echo(f"  {mark} {c['label']:<16} {c['detail']}")


@publish.command("snapshot")
@click.option("--note", default="")
@click.pass_context
def publish_snapshot(ctx, note) -> None:
    """对目标库当前状态生成快照（回滚用）"""
    _s, _orch, pub = _publisher(ctx)
    snap = pub.snapshot(note=note)
    click.echo(f"快照 {snap['name']}：{snap['chunks']} 切片 / {snap['vectors']} 向量 → {snap['path']}")


@publish.command("list")
@click.pass_context
def publish_list(ctx) -> None:
    """列出快照"""
    _s, _orch, pub = _publisher(ctx)
    for s_ in pub.list_snapshots():
        click.echo(f"  {s_['name']}  {s_['created_at']}  {s_['chunks']} 切片  {s_.get('note') or ''}")


@publish.command("run")
@click.option("--doc", "docs", multiple=True, required=True)
@click.option("--env", "target_env", default="dev", show_default=True)
@click.option("--force", is_flag=True, help="检查未通过时二次确认放行（留痕）")
@click.pass_context
def publish_run(ctx, docs, target_env, force) -> None:
    """发布：检查 → 快照 → 写入计划 → 验证 → 留档"""
    _s, _orch, pub = _publisher(ctx)
    r = pub.publish(list(docs), target_env=target_env, forced=force)
    for c in r["checks"]:
        mark = {"pass": "✔", "fail": "✘", "not_executed": "·"}[c["status"]]
        click.echo(f"  {mark} {c['label']:<16} {c['detail']}")
    if not r["ok"]:
        click.echo(f"✘ {r['message']}")
        return
    click.echo(f"✔ 发布计划已生成（{r['publish_id'][:8]}）· 快照 {r['snapshot']['name']}")
    click.echo(f"  {r['note']}")


@publish.command("records")
@click.pass_context
def publish_records(ctx) -> None:
    """发布记录"""
    _s, _orch, pub = _publisher(ctx)
    rows = pub.records()
    if not rows:
        click.echo("暂无发布记录")
        return
    for r in rows:
        click.echo(f"  {r['published_at']}  {r['target_env']:<6} 快照 {r['snapshot_name']:<26}"
                   f"切片 {r['chunks_written']:<6} {'已回滚' if r['rolled_back_at'] else ''}")


@publish.command("rollback")
@click.option("--snapshot", "snapshot_name", required=True)
@click.pass_context
def publish_rollback(ctx, snapshot_name) -> None:
    """回滚到指定快照（不重跑任何解析）"""
    _s, _orch, pub = _publisher(ctx)
    r = pub.rollback(snapshot_name)
    if r["ok"]:
        click.echo(f"✔ 已恢复 {r['restored_chunks']} 切片（快照记录 {r['expected']}，"
                   f"{'一致' if r['match'] else '⚠ 不一致'}）")
    else:
        click.echo(f"✘ {r['message']}")


# ══════════════════════════════════════════════════════════════════════════
# 知识缺口（US-12）
# ══════════════════════════════════════════════════════════════════════════


@click.group()
def gaps() -> None:
    """知识缺口台账：归因、聚合、关闭（US-12）"""


@gaps.command("list")
@click.option("--state", default=None, type=click.Choice(["open", "closed", "deferred"]))
@click.pass_context
def gaps_list(ctx, state) -> None:
    """列出缺口（按出现次数排序）"""
    from .gaps import GapLedger

    orch = _ctx_objs(ctx)[1]
    ledger = GapLedger(orch.db)
    rows = ledger.list(state)
    if not rows:
        click.echo("暂无缺口记录（先跑 kb-pipeline quality run）")
        return
    for r in rows:
        click.echo(f"  [{r['state']:<8}] {r['occurrences']:>2}× {r['attribution']:<15}"
                   f"{r['theme'][:30]:<32}{(r['evidence'] or '')[:40]}")
    click.echo(json.dumps(ledger.stats(), ensure_ascii=False))


@gaps.command("collect")
@click.pass_context
def gaps_collect(ctx) -> None:
    """把最近一次质检的未命中题收进缺口台账（含归因）"""
    from .gaps import GapLedger
    from .regression import RegressionRunner

    s, orch = _ctx_objs(ctx)
    runner = RegressionRunner(s, orch.db, orch.data_root)
    r = runner.run(record_baseline=False)
    if r["status"] not in ("ok", "gold_stale"):
        click.echo(f"⚠ 无法收集：{r['message']}")
        return
    added = GapLedger(orch.db).from_regression(r)
    click.echo(f"已收进 {len(added)} 条缺口记录")
    for g in added:
        click.echo(f"  {g['attribution']:<15}{g['theme'][:32]}")


@gaps.command("defer")
@click.option("--gap-id", required=True)
@click.option("--reason", required=True)
@click.pass_context
def gaps_defer(ctx, gap_id, reason) -> None:
    """标记为暂不处理（必须填原因）"""
    from .gaps import GapLedger

    orch = _ctx_objs(ctx)[1]
    GapLedger(orch.db).defer(gap_id, reason)
    click.echo(f"已标记暂不处理：{reason}")


@gaps.command("close")
@click.option("--gap-id", required=True)
@click.option("--reason", default="已补录语料")
@click.pass_context
def gaps_close(ctx, gap_id, reason) -> None:
    """关闭缺口"""
    from .gaps import GapLedger

    orch = _ctx_objs(ctx)[1]
    GapLedger(orch.db).close(gap_id, reason)
    click.echo(f"已关闭：{reason}")


# ══════════════════════════════════════════════════════════════════════════
# 关键词（US-09）
# ══════════════════════════════════════════════════════════════════════════


@click.command("keywords")
@click.option("--text", required=True, help="待抽关键词的文本片段")
@click.option("--title", default="", help="块标题")
@click.pass_context
def keywords_preview(ctx, text, title) -> None:
    """预览关键词抽取（LLM 主路径 + 规则降级；用于确认降级是否正常）"""
    from .keywords import KeywordGateway, rule_keywords

    s, orch = _ctx_objs(ctx)
    gw = KeywordGateway(orch.db, s)
    result, stats = gw.extract([{"kb_id": "probe", "title": title, "content": text}])
    click.echo(f"关键词：{result.get('probe', '')}")
    click.echo(f"来源统计：{json.dumps(stats, ensure_ascii=False)}")
    click.echo(f"（规则抽取对照：{','.join(rule_keywords(title, text))}）")


# ══════════════════════════════════════════════════════════════════════════


def register(main: click.Group) -> None:
    """把本模块的命令注册到主 group"""
    for cmd in (
        corpus, chunks, review, quality, contract, publish, gaps, keywords_preview,
    ):
        main.add_command(cmd)
