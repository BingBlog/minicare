"""Web 层扩展路由（第 2–5 期能力）

按能力域分组，挂在 `/api` 下。约定与 api.py 一致：
  · 写库一律拒绝（`_guard`）—— 迁移 021 未执行、`index` 实跑路径未验证
  · 数据缺失时返回明确的 `ready: false` + 原因，**不假装有数据**
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import time
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import FileResponse, PlainTextResponse

from ..config import get_settings
from ..orchestrator import Orchestrator

router = APIRouter(prefix="/api")

WRITE_REJECT = (
    "本环境不开放写库：迁移 021 尚未执行，且 index 的真实入库路径未在本地验证。"
    "如需写库请用 CLI，或先完成 TECH-015 §9.1 的前置条件。"
)


def _read_head(path: str, n: int = 4000) -> str:
    """读文件前 n 个字符（用于正文抽取预填）；失败返回空串，不抛异常"""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read(n)
    except OSError:
        return ""


def _guard(payload: dict | None) -> dict:
    payload = payload or {}
    if payload.get("write") or payload.get("allow_write"):
        raise HTTPException(status_code=403, detail=WRITE_REJECT)
    return payload


def _orc() -> Orchestrator:
    return Orchestrator(get_settings())


def _doc_dirs() -> dict[str, dict[str, Any]]:
    from ..mineru.result import scan_documents

    s = get_settings()
    out: dict[str, dict[str, Any]] = {}
    for d in scan_documents(s.out_dir, s):
        out[d.doc_id] = {
            "region": d.region, "source": d.source, "title": d.title,
            "md": str(d.md_path), "pdf": str(d.pdf_path) if d.pdf_path else None,
            "content_list": str(d.content_list_path) if d.content_list_path else None,
            # MinerU 内部块模型（更细的块/行 bbox）；旧产物没有 → None
            "middle": str(d.middle_path) if d.middle_path else None,
        }
    return out


def _doc_entry(doc_id: str) -> dict[str, Any]:
    """按 doc_id 取扫描到的文档条目。

    ⚠️ 这是**所有文件服务端点的唯一入口**：`doc_id` 来自 URL，但必须先在这里查到
    才能继续 —— 条目来自真实目录名（目录名不可能含 `/`），因此天然阻断路径穿越；
    不接受任何用户拼接的路径。
    """
    entry = _doc_dirs().get(doc_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"未知文档: {doc_id}")
    return entry


def _empty_region_text(entry: dict[str, Any], raw_items: list[dict[str, Any]]) -> dict[int, str]:
    """空文本块 → 该位置**原文实际印的字**（PDF 自带文字层）。

    用途见 `anchors.chunk_align.find_continuations`：MinerU 对**跨栏 / 跨页段落**只给一个落点的
    `bbox`，其余落点记成**空文本块**（没有 md 片段，文本对齐挂不上）。拿文字层核对"那个位置上印的
    确实是这一段的字"，就能把这些落点**认回来**，而不是靠几何猜。

    取不到文字层（没装渲染依赖 / 没有源 PDF / 扫描件）时返回 `{}` —— 调用方退回纯几何判断。
    """
    if not entry.get("pdf") or not raw_items:
        return {}
    empties = [
        (i, b)
        for i, b in enumerate(raw_items)
        if b.get("type") == "text"
        and not (b.get("text") or "").strip()
        and isinstance(b.get("bbox"), list)
        and len(b["bbox"]) == 4
    ]
    if not empties:
        return {}
    from ..render_pages import text_in_bboxes

    got = text_in_bboxes(entry["pdf"], [(b.get("page_idx") or 0, tuple(b["bbox"])) for _, b in empties])
    return {i: t for (i, _), t in zip(empties, got) if t}


# ══════════════════════════════════════════════════════════════════════════
# 语料档案（US-01 / US-02）
# ══════════════════════════════════════════════════════════════════════════


# ── 列表页原文摘要（卡片预览用）──────────────────────────────────────
#
# 目标：卡片上给一句"这份文档讲什么"，**不是**全文预览（全文用 `/docs/{id}/parsed/md`）。
#
# 为什么要批量端点：列表页有 20 份，逐个调 `parsed/md` 会把每份**全文**都传一遍
# （实测有几份 md 上百 KB，WHO 那份 246KB）。这里每份只读**开头 8KB**，整包只有几 KB。
#
# 为什么读 8KB 就够：实测 20 份语料里「摘要 / 【摘要】/ Abstract / Summary」出现的位置
# 全部落在**前 5KB**（WHO 的 `Summary` 在 4600、EAACI 的 `Abstract` 在 2440、
# AAP 的在 952、NIAID 的在 4857，中文两份在 59/96）。
EXCERPT_HEAD_CHARS = 8000
EXCERPT_LIMIT = 150

# 摘要标记：命中即取该段。
# 结构化标签（BACKGROUND:/OBJECTIVE:…）是最可靠的信号 —— 实测 LEAP-On 那篇的真摘要就是
# 「BACKGROUND: In a randomized trial…」这一段，位置**在** `## Abstract` 标题之前，
# 而标题后面紧跟的却是作者名单。只认「Abstract」会抽到作者名单。
_EXCERPT_LABELS = (
    "摘要", "【摘要】", "abstract", "summary",
    "background:", "objective:", "objectives:", "importance:",
    "introduction:", "methods:", "results:", "conclusions:",
)
# 这几个词比较弱（可能出现在目录里），要求必须落在**段首 60 字内**才算数。
# 实测 WHO 那份的 `Summary` 落在「Contents」目录段的第 109 字 → 靠这条排除掉。
_EXCERPT_WEAK_LABELS = ("摘要", "abstract", "summary")

# 前置页眉噪声 —— 出现在正文之前的版权/书号/联系方式/免责声明等，绝不能当摘要
_EXCERPT_NOISE = (
    "licence", "license", "copyright", "isbn", "doi:", "doi.org", "http", "www.",
    "all rights reserved", "suggested citation", "cataloguing", "sales, rights",
    "third-party materials", "disclaimer", "designations employed",
    "endorsed or recommended", "reasonable precautions",
    "corresponding author", "通信作者", "收稿日期", "基金项目", "中图分类号",
    "文献标识码", "文章编号", "引用本文", "编辑部", "作者简介", "作者单位",
)
# 学位/头衔缩写：成串出现即为作者名单或编委简介
_EXCERPT_DEGREE_RE = re.compile(
    r"\b(?:M\.?D|Ph\.?D|M\.?S|M\.?P\.?H|M\.?B|B\.?S|B\.?Ch|D\.?M|MSc|BSc|DSc|JD|MPH|RN)\b"
)
# 单位/职务词：与学位缩写同现时判为作者简介
_EXCERPT_AFFIL_RE = re.compile(
    r"(University|Universi|Department of|School of|Medical School|Hospital|Institute|"
    r"College|Center|Centre|Board of Directors|President|Chair|Prof\.)"
)
# md 路径 → (mtime, size, limit) → 摘要；文件没变就不重复读盘
_excerpt_cache: dict[str, tuple[tuple[float, int, int], str | None]] = {}


def _plain_excerpt(text: str) -> str:
    """把一段 markdown 压成可读纯文本（去图片/链接壳/标题标记/强调/上标/HTML 残渣）"""
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)        # 图片
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)      # 链接保留文字
    text = re.sub(r"<sup>.*?</sup>", "", text, flags=re.S)    # 上标编号（英文作者名后成串出现）
    text = re.sub(r"<[^>]+>", " ", text)                      # 其它 HTML
    text = re.sub(r"^[#>\s]+", "", text, flags=re.M)          # 标题 / 引用标记
    text = re.sub(r"[*_`]+", "", text)                        # 强调
    text = re.sub(r"\s+", " ", text)
    return text.strip(" ·—-—:：")


def _is_front_matter(block: str) -> bool:
    """判断这段是不是"前置件"（版权免责 / 作者名单 / 编委简介 / 全大写标题）—— 都不能当摘要"""
    low = block.lower()
    if any(n in low for n in _EXCERPT_NOISE):
        return True
    words = re.findall(r"[A-Za-z]{3,}", block)
    if words and sum(1 for w in words if w.isupper()) / len(words) >= 0.6:
        return True                                          # 全大写 → 标题
    degrees = len(_EXCERPT_DEGREE_RE.findall(block))
    if degrees >= 2:
        return True                                          # 学位缩写成串 → 作者名单
    if degrees >= 1 and _EXCERPT_AFFIL_RE.search(block):
        return True                                          # 学位 + 单位 → 编委简介
    # 括号职务（(Chair) / (Co-Chair)）—— 正文叙述里几乎不会出现，是编委/作者名单的强信号。
    # 实测 WAO_DRACMA_2012 那份的名单里没有学位缩写，只能靠这条认出来。
    if re.search(r"\((?:Co-)?Chair(?:person|man)?\)", block):
        return True
    # 姓名密度：连续「首字母大写 + 大写开头词」成串、逗号也成串，且几乎没句末句读 → 名单
    names = len(re.findall(r"\b[A-Z][a-z]{2,}\s+[A-Z][a-z]", block))
    if names >= 6 and block.count(",") >= 6 and "。" not in block:
        return True
    return False


def _match_excerpt_label(block: str) -> int | None:
    """段落里有没有摘要标记？返回该标记的段内偏移（无则 None）"""
    low = block.lower()
    for label in _EXCERPT_LABELS:
        if low.startswith(label):
            return 0
    for label in _EXCERPT_WEAK_LABELS:                       # 弱标记必须在段首附近
        pos = low.find(label)
        if 0 <= pos <= 60:
            return pos
    return None


def _excerpt_from_md(md_path: Path, limit: int = EXCERPT_LIMIT) -> str | None:
    """从 md 头部抽一段能代表全文的摘要；实在抽不到返回 None（卡片就不显示摘要行）

    两级：① 优先取摘要标记所在段（含结构化标签 BACKGROUND:/OBJECTIVE: 等）；
         ② 兜底取第一个像正文的段落（够长、有句读、不是前置件）。
    **抽不到时宁可留空，也不拿版权声明或作者名单充数** —— 卡片上少一行，
    比放一段"本书版权归 WHO 所有"要有用得多。
    """
    try:
        st = md_path.stat()
    except OSError:
        return None
    key = str(md_path)
    sig = (st.st_mtime, st.st_size, limit)
    cached = _excerpt_cache.get(key)
    if cached and cached[0] == sig:
        return cached[1]

    raw = _read_head(str(md_path), EXCERPT_HEAD_CHARS)
    blocks = [b for b in (_plain_excerpt(x) for x in re.split(r"\n\s*\n", raw)) if b]

    picked: str | None = None
    for i, block in enumerate(blocks):
        pos = _match_excerpt_label(block)
        if pos is None:
            continue
        body = block[pos:]
        # 标记自己单独成段时（如「## Abstract」后另起一段正文），把后面的正文接上；
        # 但接进来的段**必须不是前置件**（否则就是 LEAP-On 那种「Abstract + 作者名单」）
        for j in (i + 1, i + 2):
            if len(body) >= 40 or j >= len(blocks):
                break
            if not _is_front_matter(blocks[j]):
                body = f"{body} {blocks[j]}"
        if len(body) >= 40:                                  # 太短说明只匹配到一个孤立标题词
            picked = body
            break

    if picked is None:
        for block in blocks:
            if len(block) < 80 or _is_front_matter(block):
                continue
            # 无句读且不长 → 更像标题行，跳过（否则英文刊会拿到重复三遍的标题）
            if not re.search(r"[。.；;：:]", block) and len(block) < 140:
                continue
            picked = block
            break

    out = None if picked is None else (
        picked if len(picked) <= limit else picked[:limit].rstrip() + "…"
    )
    _excerpt_cache[key] = (sig, out)
    return out


@router.get("/corpus/excerpts")
def corpus_excerpts(limit: int = EXCERPT_LIMIT) -> dict:
    """批量返回每份文档的原文摘要（列表页卡片预览用）

    `null` 表示这份抽不出像样的摘要（前置件全是版权/作者名单，或还没解析）——
    卡片**不显示摘要行**，而不是拿噪声充数。
    """
    out: dict[str, str | None] = {}
    for doc_id, meta in _doc_dirs().items():
        md = meta.get("md") or ""
        out[doc_id] = _excerpt_from_md(Path(md), limit) if md else None
    return {"excerpts": out, "limit": limit, "count": len(out)}


@router.get("/corpus")
def corpus_list() -> dict:
    from ..corpus import CorpusLedger

    orc = _orc()
    ledger = CorpusLedger(orc.db)
    return {"items": ledger.list(), "completeness": ledger.completeness(),
            "missing": ledger.missing_required()}


@router.post("/corpus/sync")
def corpus_sync(payload: dict = Body(default={})) -> dict:
    """把「已解析但未登记」的文档批量补进台账（来源两级瀑布预填）

    这是第 1 期的实用桥接：语料已经在盘上解析好了，没必要再走一遍上传。
    doc_id 沿用管线的稳定 ID（MinerU 产物目录名）。
    """
    from ..corpus import CorpusLedger, prefill

    _guard(payload)
    orc = _orc()
    ledger = CorpusLedger(orc.db)
    added, updated = [], []
    for doc_id, meta in _doc_dirs().items():
        body = _read_head(meta.get("md") or "")
        fields = prefill(filename=f"{doc_id}.md", region=meta["region"], doc_id=doc_id, body_text=body)
        fields["kind"] = "pdf" if meta.get("pdf") else "html"
        if ledger.get(doc_id):
            updated.append(doc_id)
            ledger.register(fields, status=ledger.get(doc_id)["status"])
        else:
            ledger.register(fields, status="pending")
            added.append(doc_id)
    return {"added": len(added), "updated": len(updated),
            "items": added + updated, "completeness": ledger.completeness()}


@router.post("/corpus/{doc_id}/supersede")
def corpus_supersede(doc_id: str, payload: dict = Body(default={})) -> dict:
    """建立取代关系：旧版归档，新版 version+1"""
    from ..corpus import CorpusLedger

    p = _guard(payload)
    new_id = p.get("new_doc_id")
    if not new_id:
        raise HTTPException(status_code=400, detail="缺少 new_doc_id")
    row = CorpusLedger(_orc().db).make_new_version(doc_id, new_id)
    return {"ok": True, "row": row}


@router.patch("/corpus/{doc_id}")
def corpus_update(doc_id: str, payload: dict = Body(default={})) -> dict:
    from ..corpus import CorpusLedger

    p = _guard(payload)
    if str(p.get("year", "")).isdigit():
        p["year"] = int(p["year"])
    row = CorpusLedger(_orc().db).update(doc_id, **{k: v for k, v in p.items() if k != "write"})
    if row is None:
        raise HTTPException(status_code=404, detail=f"未登记的文档: {doc_id}")
    return {"ok": True, "row": row}


@router.get("/corpus/export")
def corpus_export() -> dict:
    from ..corpus import CorpusLedger

    return {"markdown": CorpusLedger(_orc().db).export_markdown()}


# ── 上传新文档（US-01：登记源文件 · 判重 · 来源预填）──────────────────────
#
# 与「批量同步」（`POST /corpus/sync`）的分工：
#   · sync 是第 1 期的**过渡桥** —— 把已经在盘上解析好的语料补进台账；
#   · 本组端点是**真正的入口** —— 用户从浏览器把新文件交进来，落源目录并登记。
#
# 两条与管线严格对齐的约定（不要各写一套）：
#   1. **doc_id = 源文件名的 stem**。`steps/preflight.find_source_file()` 与
#      `steps/parse._parse_cloud()` 都按 `{source_dir}/{国内|国际}/{doc_id}{后缀}` 找源文件，
#      MinerU 产物目录名也是它。所以这里**不能拿 sha256 当 doc_id** —— 那会把文档列表刷成一片哈希。
#   2. **判重按内容 sha256**（PRD US-01 场景 2）。源目录只有几十 MB，现场全量哈希约 1 秒，
#      于是无需改表结构、加索引或落 hash 列，每次上传现算即可。
#
# 本组端点只写**本机**（源目录 + 本机 SQLite 台账），不碰远程知识库，
# 因此与 `ALLOW_WRITE`（管的是 `knowledge_base` 表的写入）无关 —— 与 `corpus_sync` 同类。

UPLOAD_SUFFIXES = (".pdf", ".html", ".htm")
# 单文件上限：PRD-008 Q-01 写「建议 ≤100MB（未最终定）」，先按此硬拦并明确报错
UPLOAD_MAX_BYTES = 100 * 1024 * 1024
# 判重窗允许的三种处置（PRD US-01 场景 2）
CONFLICT_ACTIONS = ("skip", "overwrite", "keep_both")


def _region_dirname(region: str) -> str:
    from ..steps import REGION_DIRS

    return REGION_DIRS.get(region, "国内")


def _safe_doc_id(raw_name: str) -> str:
    """文件名 → doc_id。这是**唯一**由用户输入直接决定路径的地方，必须压掉分隔符与 `..`"""
    stem = Path(raw_name).stem
    stem = re.sub(r"[\\/]+", "_", stem)          # 路径分隔符
    stem = re.sub(r"[\x00-\x1f]+", "", stem)     # 控制字符
    stem = stem.replace("..", "_").strip(" ._")
    return stem[:120] or "untitled"


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _iter_source_files():
    """遍历源目录下的全部源文件 → (region_code, Path)"""
    s = get_settings()
    for code in ("cn", "intl"):
        base = s.source_dir / _region_dirname(code)
        if not base.exists():
            continue
        for f in sorted(base.iterdir()):
            if f.is_file() and f.suffix.lower() in UPLOAD_SUFFIXES:
                yield code, f


def _find_by_content(sha: str) -> tuple[str, Path] | None:
    """按内容 sha256 在源目录里找同一份文件（判重主判据）"""
    from ..corpus import sha256_file

    for code, p in _iter_source_files():
        try:
            if sha256_file(p) == sha:
                return code, p
        except OSError:  # 单个文件读不了不该让上传失败
            continue
    return None


def _source_path(region: str, doc_id: str) -> Path | None:
    """该 doc 在指定地区源目录里已有的文件（后缀不定）"""
    base = get_settings().source_dir / _region_dirname(region)
    for suf in UPLOAD_SUFFIXES:
        p = base / f"{doc_id}{suf}"
        if p.exists():
            return p
    return None


def _head_text(data: bytes, suffix: str) -> str:
    """「正文抽取」的输入：HTML 去标签；PDF 用 pypdf 抽前两页。抽不到返回空串（不影响上传）"""
    if suffix in (".html", ".htm"):
        try:
            return re.sub(r"<[^>]+>", " ", data.decode("utf-8", errors="replace"))[:6000]
        except Exception:  # noqa: BLE001
            return ""
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(data))
            out: list[str] = []
            for page in reader.pages[:2]:
                out.append(page.extract_text() or "")
            return "\n".join(out)[:6000]
        except Exception:  # noqa: BLE001 - 加密/损坏 PDF 不该让上传失败，只是抽不到
            return ""
    return ""


def _chunk_count(doc_id: str) -> int | None:
    """当前切片数（判重窗要显示）；没有切块产物返回 None（界面显示「—」）"""
    try:
        seg = _orc().store_for(doc_id).read_current_artifact("segment")
    except Exception:  # noqa: BLE001
        return None
    return len(seg.get("chunks") or []) if seg else None


def _describe_existing(doc_id: str) -> dict:
    """已有文档的现状（判重窗展示用）：台账行 + 产物目录 + 切片数"""
    from ..corpus import CorpusLedger

    row = CorpusLedger(_orc().db).get(doc_id) or {}
    s = get_settings()
    return {
        "doc_id": doc_id,
        "region": row.get("region") or "cn",
        "filename": row.get("filename") or "",
        "source_name": row.get("source_name") or "",
        "status": row.get("status") or "",
        "version": int(row.get("version") or 1),
        "created_at": row.get("created_at") or "",
        "size_bytes": int(row.get("size_bytes") or 0),
        "registered": bool(row),
        "has_products": any((s.out_dir / _region_dirname(c) / doc_id).exists() for c in ("cn", "intl")),
        "chunks": _chunk_count(doc_id),
    }


def _free_doc_id(base: str) -> str:
    """「并存为 v2」：找一个没被占用的 doc_id（`_v2` / `_v3` …）"""
    from ..corpus import CorpusLedger

    ledger = CorpusLedger(_orc().db)
    for n in range(2, 100):
        cand = f"{base}_v{n}"
        if not ledger.get(cand) and not any(_source_path(c, cand) for c in ("cn", "intl")):
            return cand
    raise HTTPException(status_code=409, detail=f"{base} 的版本号已用尽（_v2 ~ _v99）")


def _write_source(region: str, doc_id: str, suffix: str, data: bytes) -> tuple[Path, list[str]]:
    """把源文件写入 `source_dir/{国内|国际}/<doc_id><后缀>`

    · 先写 `.part` 再 rename：中途失败不会留下半个文件（PRD US-01「不留半条记录」）
    · 顺手清掉**同名但不同后缀**的旧文件 —— 「一个 doc_id 一份源文件」是
      `preflight.find_source_file()` 与 `scan_documents()` 的隐含前提，
      留着会造成"到底用哪份"的不确定（返回 `replaced` 让调用方如实告知）
    """
    base = get_settings().source_dir / _region_dirname(region)
    base.mkdir(parents=True, exist_ok=True)
    replaced: list[str] = []
    for other in UPLOAD_SUFFIXES:
        if other == suffix:
            continue
        q = base / f"{doc_id}{other}"
        if q.exists():
            q.unlink()
            replaced.append(q.name)
    dst = base / f"{doc_id}{suffix}"
    tmp = dst.with_name(dst.name + ".part")
    tmp.write_bytes(data)
    tmp.replace(dst)
    return dst, replaced


@router.post("/corpus/upload")
async def corpus_upload(
    request: Request,
    filename: str,
    region: str = "cn",
    dry: bool = False,
    on_conflict: str = "skip",
) -> dict:
    """上传一份新语料：校验 → 判重 → 来源预填 →（非 dry 时）落源目录并登记台账。

    `dry=true` 只做前两步，**不落盘、不登记** —— 前端用它渲染「登记预填表单」，
    用户核对无误后再发一次同样内容的正式请求。两次请求都带文件字节：
    本机 localhost、单文件 ≤100MB，重传一遍比在服务端存临时文件更简单，
    也保住了「登记是原子的」（PRD US-01 异常处理：不产生半条记录）。

    请求体是**原始文件字节**（不是 multipart）：前端 `fetch(url, {body: file})` 即可。
    这样不必为 multipart 引入额外依赖，也不需要在这里解析表单。
    """
    from ..corpus import CorpusLedger, prefill

    if region not in ("cn", "intl"):
        raise HTTPException(status_code=400, detail=f"未知地区「{region}」，只接受 cn（国内）/ intl（国际）")
    if on_conflict not in CONFLICT_ACTIONS:
        raise HTTPException(status_code=400, detail=f"未知冲突处置「{on_conflict}」，只接受 {' / '.join(CONFLICT_ACTIONS)}")

    raw_name = (filename or "").strip()
    if not raw_name:
        raise HTTPException(status_code=400, detail="缺少 filename 参数（取上传文件的原始文件名）")

    suffix = Path(raw_name).suffix.lower()
    # PRD US-01 场景 5：格式不支持要**明确拒绝并列出支持的格式**
    if suffix not in UPLOAD_SUFFIXES:
        raise HTTPException(
            status_code=415,
            detail=f"不支持的格式「{suffix or '无扩展名'}」；本平台只收 PDF 与 HTML（.pdf / .html / .htm）",
        )

    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="请求体为空（没有收到文件内容）")
    if len(data) > UPLOAD_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"文件 {len(data) / 1048576:.1f}MB 超过单文件上限 {UPLOAD_MAX_BYTES // 1048576}MB",
        )

    sha = _sha256_bytes(data)
    doc_id = _safe_doc_id(raw_name)
    kind = "pdf" if suffix == ".pdf" else "html"

    fields = prefill(filename=raw_name, region=region, doc_id=doc_id, body_text=_head_text(data, suffix))
    fields["kind"] = kind

    ledger = CorpusLedger(_orc().db)
    existing_row = ledger.get(doc_id)
    existing_path = _source_path(region, doc_id)

    # ── 判重：两条独立判据 ──
    #   same_content —— 内容 sha256 已在源目录（同名或改名重发都算同一份）
    #   same_name    —— doc_id 已被占用但内容不同（改了内容再发）
    content_hit = _find_by_content(sha)
    conflict: dict | None = None
    if content_hit is not None:
        hit_region, hit_path = content_hit
        conflict = {
            **_describe_existing(hit_path.stem),
            "kind": "same_content",
            "path": str(hit_path),
            "hit_region": hit_region,
            "renamed": hit_path.stem != doc_id,
        }
    elif existing_path is not None or existing_row is not None:
        conflict = {
            **_describe_existing(doc_id),
            "kind": "same_name",
            "path": str(existing_path) if existing_path else "",
            "hit_region": region,
            "renamed": False,
        }

    out: dict[str, Any] = {
        "ok": True,
        "dry": bool(dry),
        "doc_id": doc_id,
        "filename": raw_name,
        "region": region,
        "kind": kind,
        "size_bytes": len(data),
        "sha256": sha[:16],
        "prefill": fields,
        "missing_required": fields.get("missing_required") or [],
        "conflict": conflict,
        "registered": False,
        "written": False,
        "skipped": False,
        "replaced": [],
    }

    # ── 预览（dry）：什么都不落，只把待确认的东西交回去 ──
    if dry:
        out["message"] = "存在冲突，请选择处置方式" if conflict else "预检通过：可以登记"
        return out

    # ── 冲突 + 跳过：不产生任何新记录（PRD US-01 场景 2 的第一选）──
    if conflict is not None and on_conflict == "skip":
        out["skipped"] = True
        out["message"] = "已跳过：既未落盘、也未登记，未产生任何新记录"
        return out

    # ── 并存为 v2：换一个 doc_id，登记为独立文档 ──
    if conflict is not None and on_conflict == "keep_both":
        target = _free_doc_id(conflict["doc_id"] if conflict["renamed"] else doc_id)
        path, replaced = _write_source(region, target, suffix, data)
        kfields = prefill(
            filename=f"{target}{suffix}", region=region, doc_id=target, body_text=_head_text(data, suffix)
        )
        kfields["kind"] = kind
        kfields["supersedes"] = conflict["doc_id"]
        row = ledger.register(
            {**kfields, "size_bytes": len(data)},
            status="pending",
            note=f"与 {conflict['doc_id']} 并存（该文档原有切片与向量不受影响）",
        )
        row = ledger.update(target, version=int(conflict.get("version") or 1) + 1) or row
        out.update(
            doc_id=target,
            prefill=kfields,
            registered=True,
            written=True,
            replaced=replaced,
            path=str(path),
            row=row,
            completeness=ledger.completeness(),
            message=f"已并存登记为 {target}（旧文档 {conflict['doc_id']} 保持原状）",
        )
        return out

    # ── 覆盖为新版本（无冲突时也走这条 = 正常登记）──
    old_id = (conflict or {}).get("doc_id")
    if conflict is not None and old_id and old_id != doc_id:
        # 内容相同但换了名字：旧文档归档 + 建立取代关系（旧产物**保留可查**）
        ledger.update(old_id, status="archived", superseded_by=doc_id)
    path, replaced = _write_source(region, doc_id, suffix, data)
    fields["supersedes"] = old_id if old_id and old_id != doc_id else (existing_row or {}).get("supersedes")
    row = ledger.register(
        {**fields, "size_bytes": len(data)},
        status="pending",
        note="重新上传覆盖：该文档原有切片与向量已失效" if conflict is not None else "",
    )
    if conflict is not None:
        # 版本 +1 并作废全部产物 → 六步回到待跑（`register` 会沿用旧 version，故显式改）
        base_version = int((existing_row or {}).get("version") or conflict.get("version") or 1)
        row = ledger.update(doc_id, version=base_version + 1) or row
        marked = _orchestrator_invalidate(doc_id)
        out["invalidated"] = marked

    out.update(
        registered=True,
        written=True,
        replaced=replaced,
        path=str(path),
        row=row,
        completeness=ledger.completeness(),
        message=(
            f"已覆盖登记：{doc_id}，版本 v{row.get('version')}，原有切片与向量已失效，可重新跑六步"
            if conflict is not None
            else f"已登记：{doc_id}（状态 待处理，尚未解析）"
        ),
    )
    return out


def _orchestrator_invalidate(doc_id: str) -> list[str]:
    """作废该文档的全部产物（标 stale），使六步回到「待跑」"""
    try:
        return _orc().invalidate(doc_id, "preflight")
    except Exception:  # noqa: BLE001 - 没有 manifest 时无可作废，不该让登记失败
        return []


# （2026-10-09 删除）原「元信息总览 / 抽取覆盖率」跨文档视图及其数据端点：
#   `GET /api/metadata`、`METADATA_FIELDS`、`_MAPPING_SLOTS`、`_extraction_coverage` 等 ——
#   工作台页签「元信息解析与确认」是文档级子页面，不再承载全库视图（用户要求）；背景见 gotchas §4。


# ══════════════════════════════════════════════════════════════════════════
# 元信息 LLM 抽取（工作台页签「元信息解析与确认」的下半区）
# ══════════════════════════════════════════════════════════════════════════
#
# 为什么不是管线步骤：它不参与 cache_key / 六步依赖，也不该被「作废切块」连带失效；
# 结果落在 `corpus/{doc_id}/llm/`（既非管线产物、也非人工产物），按需重跑即可。
# 与 `keywords.py` 同一范式：LLM 主路径 → 规则降级 → 显式告警，**绝不把规则结果伪装成 LLM 结果**。

def _meta_gateway():
    from ..metadata.llm_extract import MetadataLLMGateway

    return MetadataLLMGateway(get_settings())


def _llm_status() -> dict[str, Any]:
    gw = _meta_gateway()
    return {"available": gw.available, "model": gw.model, "base_url": gw.base_url,
            "env_var": "DEEPSEEK_API_KEY"}


@router.get("/metadata/schema")
def metadata_schema() -> dict:
    """语料级共享 schema + LLM 可用性（界面据此显示"当前是 LLM 归纳还是内置默认"）"""
    from ..metadata.schema import load_schema

    s = get_settings()
    return {
        "schema": load_schema(s.platform_cfg.data_root),
        "llm": _llm_status(),
        "thresholds": {"llm_brief_chars": s.metadata_cfg.llm_brief_chars,
                       "llm_schema_samples": s.metadata_cfg.llm_schema_samples},
    }


@router.post("/metadata/schema/induce")
def metadata_schema_induce(payload: dict = Body(default={})) -> dict:
    """用 LLM 重新归纳语料级 schema 并落盘

    写的是**平台数据目录**（`data/llm/metadata_schema.json`），不碰知识库 ——
    因此不受 `ALLOW_WRITE` 约束（那个闸门管的是 knowledge_base 表）。
    """
    from ..metadata.llm_extract import build_brief
    from ..metadata.schema import save_schema

    s = get_settings()
    _guard(payload)
    orc = _orc()
    limit = int(payload.get("samples") or s.metadata_cfg.llm_schema_samples)
    briefs = []
    for doc_id, meta in sorted(_doc_dirs().items()):
        if len(briefs) >= limit:
            break
        na = orc.store_for(doc_id).read_current_artifact("normalize")
        if not na:
            continue
        briefs.append(build_brief(doc_id, meta.get("region") or "cn", na.get("md") or "",
                                  0, s.metadata_cfg.llm_brief_chars))
    if not briefs:
        raise HTTPException(status_code=409,
                            detail="没有任何文档具备归一化产物，无法归纳（先跑一次「正文清洗」）")

    schema, stats = _meta_gateway().induce_schema(briefs)
    if not schema:
        raise HTTPException(status_code=502,
                            detail="；".join(stats.get("warnings") or ["LLM 归纳失败"]))
    path = save_schema(s.platform_cfg.data_root, schema)
    return {"ok": True, "path": str(path), "stats": stats, "schema": schema}


def _fallback_meta_values(orc, doc_id: str, region: str, normalized_md: str) -> dict[str, Any]:
    """规则降级时可用的兜底值：台账优先，其次 `corpus.prefill` 的两级瀑布（与既有的规则路径一致）"""
    from ..corpus import CorpusLedger, prefill

    row = CorpusLedger(orc.db).get(doc_id)
    sug = prefill(filename=(row or {}).get("filename") or f"{doc_id}.md", region=region,
                  doc_id=doc_id, body_text=normalized_md[:4000])
    return {
        k: ((row or {}).get(k) or sug.get(k))
        for k in ("source_name", "publisher", "year", "region", "evidence_level",
                  "applicable_age", "license")
    }


@router.get("/docs/{doc_id}/meta-extract")
def meta_extract_get(doc_id: str) -> dict:
    """单文档元信息抽取结果（可能还没跑过）+ schema + LLM 可用性 —— 一次请求够渲染整页"""
    from ..metadata.schema import load_schema

    entry = _doc_entry(doc_id)
    s = get_settings()
    orc = _orc()
    store = orc.store_for(doc_id)
    return {
        "doc_id": doc_id,
        "schema": load_schema(s.platform_cfg.data_root),
        "llm": _llm_status(),
        "thresholds": {"llm_brief_chars": s.metadata_cfg.llm_brief_chars},
        "result": _meta_gateway().load_result(store.llm_root),
        "has_normalized": store.current_run("normalize") is not None,
        "region": entry.get("region"),
    }


@router.post("/docs/{doc_id}/meta-extract")
def meta_extract_run(doc_id: str, payload: dict = Body(default={})) -> dict:
    """跑一次元信息抽取（LLM 主路径，失败/无 key 则规则降级并告警）"""
    from ..metadata.llm_extract import build_brief
    from ..metadata.schema import load_schema

    entry = _doc_entry(doc_id)
    p = _guard(payload)
    s = get_settings()
    orc = _orc()
    store = orc.store_for(doc_id)
    na = store.read_current_artifact("normalize")
    if not na:
        raise HTTPException(status_code=409,
                            detail="该文档还没有归一化产物，无法抽取（先跑一次「正文清洗」）")

    schema = load_schema(s.platform_cfg.data_root)
    seg = store.read_current_artifact("segment") or {}
    brief = build_brief(doc_id, entry.get("region") or "cn", na.get("md") or "",
                        int(seg.get("page_index_size") or 0), s.metadata_cfg.llm_brief_chars)
    fb = _fallback_meta_values(orc, doc_id, entry.get("region") or "cn", na.get("md") or "")
    result, stats = _meta_gateway().extract(
        brief, schema, llm_root=store.llm_root, fallback_values=fb, force=bool(p.get("force")),
    )
    return {"ok": True, "stats": stats, "result": result}


# ══════════════════════════════════════════════════════════════════════════
# 暂停点（US-04 / US-05）
# ══════════════════════════════════════════════════════════════════════════


# 「元信息解析与确认」表单的字段（与 `corpus/ledger.py` 的台账字段、前端 `META_FIELDS` 对齐）
_META_CAND_FIELDS = ("source_name", "publisher", "year", "region",
                     "evidence_level", "applicable_age", "license")


def _meta_candidates(doc_id: str, ledger, orc, suggestion: dict) -> dict[str, list[dict]]:
    """「元信息解析与确认」表单逐字段候选值 —— 按文档的实际情况给出可选项。

    四个真实来源，按可信度顺序排序并去重（同一值只保留最先出现的来源）：
      ① **代码映射表**（`metadata_cfg.doc_mapping`，人工整理的 20 条，优先级最高）
      ② **预填建议**（文件名规则 / 正文抽取，即 `prefill()` 的产出）
      ③ **本文档 LLM 抽取结果**（`corpus/{doc_id}/llm/metadata.json`，「元信息解析与确认」跑过抽取才有）
      ④ **台账其他文档已用值**（publisher / license / applicable_age，保证跨文档口径一致）

    ⚠️ 只作为"选项"，不会自动写入任何东西 —— 点选与保存仍由人工在表单里完成
    （PUT /meta 的链路不变，仍然"改值 → 切块及下游重跑"）。
    """
    s = get_settings()
    buckets: dict[str, list[dict]] = {k: [] for k in _META_CAND_FIELDS}

    def add(field: str, value: Any, origin: str) -> None:
        if field not in buckets or value in (None, "", 0) or isinstance(value, (list, dict)):
            return
        text = str(value).strip()
        if not text or any(c["value"] == text for c in buckets[field]):
            return
        buckets[field].append({"value": text, "from": origin})

    # ① 代码映射表：[source_name, evidence_level, applicable_age]
    mapping = s.metadata_cfg.doc_mapping.get(doc_id) or []
    for field, idx in (("source_name", 0), ("evidence_level", 1), ("applicable_age", 2)):
        if len(mapping) > idx:
            add(field, mapping[idx], "doc_mapping")

    # ② 预填建议（文件名规则 / 正文抽取）
    for k in _META_CAND_FIELDS:
        add(k, suggestion.get(k), "prefill")

    # ③ 本文档 LLM 抽取结果（结果文件在 = 跑过；损坏/不存在按 None 处理）
    result = _meta_gateway().load_result(orc.store_for(doc_id).llm_root) or {}
    for k, v in (result.get("values") or {}).items():
        if isinstance(v, dict):
            add(k, v.get("value"), "llm")

    # ④ 台账其他文档已用值（同源文档口径复用）
    for r in ledger.list():
        if r.get("doc_id") == doc_id:
            continue
        for k in ("publisher", "license", "applicable_age"):
            add(k, r.get(k), "ledger")

    return {k: v for k, v in buckets.items() if v}


@router.get("/docs/{doc_id}/meta")
def meta_get(doc_id: str) -> dict:
    """信息确认表单数据（「元信息解析与确认」上半区）：台账字段 + 来源标注 + 预填建议 + 逐字段候选值（可选项）"""
    from ..corpus import CorpusLedger, prefill

    orc = _orc()
    ledger = CorpusLedger(orc.db)
    row = ledger.get(doc_id)
    meta = _doc_dirs().get(doc_id) or {}
    body = _read_head(meta.get("md") or "")
    suggestion = prefill(filename=row["filename"] if row else f"{doc_id}.md",
                          region=(row or {}).get("region") or meta.get("region") or "cn",
                          doc_id=doc_id, body_text=body)
    field_source = json.loads(row["field_source"]) if row and row.get("field_source") else suggestion["field_source"]
    return {
        "doc_id": doc_id, "ready": bool(row),
        "row": row, "suggestion": {k: suggestion[k] for k in
                                   ("source_name", "publisher", "year", "region",
                                    "evidence_level", "applicable_age", "license")},
        "field_source": field_source,
        "candidates": _meta_candidates(doc_id, ledger, orc, suggestion),
        "missing_required": suggestion["missing_required"],
        "state": orc.doc_state.get(doc_id),
        "derived_status": orc.derive_status(doc_id),
    }


@router.put("/docs/{doc_id}/meta")
def meta_put(doc_id: str, payload: dict = Body(default={})) -> dict:
    """提交信息确认表单（「元信息解析与确认」上半区）：写台账字段 + 记下人工核对结果（**不触发重新解析**）

    ⚠️ 这里**不再"放行"任何东西** —— 人工闸门机制已于 2026-10-09 整体移除，
    保存元数据不影响流程能否继续（`confirm` 参数保留但已无副作用，仅为兼容老前端）。
    """
    from ..corpus import CorpusLedger

    p = _guard(payload)
    orc = _orc()
    fields = {k: p.get(k) for k in ("source_name", "publisher", "year", "region",
                                    "evidence_level", "applicable_age", "license", "source_url")
              if p.get(k) is not None}
    if str(fields.get("year", "")).isdigit():
        fields["year"] = int(fields["year"])
    if fields:
        CorpusLedger(orc.db).update(doc_id, **fields)
        orc.save_meta(doc_id, meta=fields or None,
                      region=fields.get("region") or "cn")
        # 只改元数据也要让下游（切块起）失效 —— 元数据要冗余进切片
        orc.invalidate(doc_id, "segment")
    return {"ok": True, "state": orc.doc_state.get(doc_id),
            "derived_status": orc.derive_status(doc_id)}


@router.get("/docs/{doc_id}/chunks")
def chunks_get(doc_id: str, include: str = "all") -> dict:
    """切片列表（已应用人工编辑，并标出可找回项）"""
    from ..edits import EditStore, apply_chunk_edits, find_recoverable

    orc = _orc()
    store = orc.store_for(doc_id)
    seg = store.read_current_artifact("segment")
    if seg is None:
        return {"doc_id": doc_id, "ready": False, "chunks": [], "reason": "还没有切块产物"}

    es = EditStore(store.edits_root)
    machine = seg.get("chunks", [])
    chunks, stats = apply_chunk_edits(machine, es.load_chunks())
    if include == "review":
        chunks = [c for c in chunks if c.get("review")]
    elif include == "excluded":
        chunks = [c for c in chunks if c.get("excluded") or c.get("disabled")]
    return {
        "doc_id": doc_id, "ready": True,
        "chunks": chunks,
        "edit_stats": stats,
        "edits": es.load_chunks().get("entries", []),
        "recoverable": find_recoverable(machine, es.load_chunks()),
        "state": orc.doc_state.get(doc_id),
        "derived_status": orc.derive_status(doc_id),
        "excluded_summary": seg.get("excluded_summary", {}),
    }


@router.get("/docs/{doc_id}/translation")
def translation_get(doc_id: str) -> dict:
    """翻译产物 + 人工修正合并（「切片对照」页的译文数据源；TECH-019 §4）

    - 机翻产物来自 translate 步骤（translate.json）；人工修正来自 edits 覆盖层（最高优先）
    - `stale` = 译文的 src_hash 与**当前装配块**不一致（正文被改过 → 建议重翻/重校）
    """
    from ..edits import EditStore
    from ..steps.finalize import chunk_src_hash, finalize_chunks

    orc = _orc()
    store = orc.store_for(doc_id)
    tr = store.read_current_artifact("translate")
    if tr is None:
        return {"doc_id": doc_id, "ready": False,
                "reason": "还没有翻译产物（先跑「翻译」步骤）",
                "items": {}, "stats": {}, "overlay_count": 0, "warnings": []}

    # 当前装配块（与步骤同源）—— 过期检测是增强项，装配失败不阻塞页面主体
    cur_hashes: dict[str, str] = {}
    seg = store.read_current_artifact("segment")
    if seg is not None:
        try:
            chunks, _es, _rs = finalize_chunks(store, seg, orc.settings)
            cur_hashes = {c["kb_id"]: chunk_src_hash(c) for c in chunks}
        except Exception:  # noqa: BLE001
            cur_hashes = {}

    overlay = EditStore(store.edits_root).load_translations().get("entries", {})

    items: dict[str, dict] = {}
    for kb_id, raw in (tr.get("items") or {}).items():
        item = dict(raw)
        cur = cur_hashes.get(kb_id)
        o = overlay.get(kb_id)
        if o:
            item["zh"] = o.get("zh") or item.get("zh")
            item["quality"] = "reviewed"
            src = o.get("src_hash") or ""
        else:
            item.setdefault("quality", "mt")
            src = item.get("src_hash") or ""
        item["stale"] = bool(cur and src and src != cur)
        if item.get("zh"):
            item["status"] = "translated"
        items[kb_id] = item

    # 运行态统计（token 用量等）在 manifest 的 run stats 里，不在产物 payload 内
    run = store.current_run("translate") or {}
    mstats = run.get("stats") or {}

    return {
        "doc_id": doc_id,
        "ready": True,
        "stats": {
            "model": tr.get("model"),
            "prompt_version": tr.get("prompt_version"),
            "glossary_version": tr.get("glossary_version"),
            "counts": tr.get("counts") or {},
            "tokens": {"in": mstats.get("tokens_in", 0), "out": mstats.get("tokens_out", 0)},
        },
        "overlay_count": len(overlay),
        "items": items,
        "warnings": tr.get("warnings") or [],
    }


@router.post("/docs/{doc_id}/chunks/{kb_id}/translation")
def chunk_translation_save(doc_id: str, kb_id: str, payload: dict = Body(default={})) -> dict:
    """保存人工修正译文（覆盖层最高优先；**不触发管线重跑** —— 与「编辑正文」语义不同）"""
    from ..edits import EditStore
    from ..steps.finalize import chunk_src_hash, finalize_chunks

    p = _guard(payload)
    zh = str(p.get("zh") or "").strip()
    if not zh:
        raise HTTPException(status_code=400, detail="缺少 zh（译文内容）")
    orc = _orc()
    store = orc.store_for(doc_id)
    seg = store.read_current_artifact("segment")
    if seg is None:
        raise HTTPException(status_code=400, detail="还没有切块产物，无法定位切片")
    chunks, _es, _rs = finalize_chunks(store, seg, orc.settings)
    cur = next((c for c in chunks if c.get("kb_id") == kb_id), None)
    if cur is None:
        raise HTTPException(status_code=404, detail=f"切片不存在：{kb_id}")
    entry = EditStore(store.edits_root).set_translation(kb_id, zh, src_hash=chunk_src_hash(cur))
    return {"ok": True, "kb_id": kb_id, "entry": entry}


@router.post("/docs/{doc_id}/chunks/{kb_id}/translation/reset")
def chunk_translation_reset(doc_id: str, kb_id: str, payload: dict = Body(default={})) -> dict:
    """删除译文修正覆盖层条目（回到机翻值）"""
    from ..edits import EditStore

    _guard(payload)
    cleared = EditStore(_orc().store_for(doc_id).edits_root).clear_translation(kb_id)
    return {"ok": True, "kb_id": kb_id, "cleared": cleared}


def _after_chunk_edit(doc_id: str, orc: Orchestrator) -> None:
    """人工编辑切片后：标切块及下游待重跑（重跑时 index 会优先读人工产物）"""
    orc.invalidate(doc_id, "segment")


@router.post("/docs/{doc_id}/chunks/{kb_id}/edit")
def chunk_edit(doc_id: str, kb_id: str, payload: dict = Body(default={})) -> dict:
    from ..edits import OP_EDIT, EditStore

    p = _guard(payload)
    text = p.get("text")
    if not text:
        raise HTTPException(status_code=400, detail="缺少 text")
    orc = _orc()
    store = orc.store_for(doc_id)
    run = store.current_run("segment") or {}
    EditStore(store.edits_root).add_entry(
        {"op": OP_EDIT, "chunk_id": kb_id, "text": text},
        base_run_id=run.get("run_id", ""), base_content_hash=run.get("artifact_hash", ""))
    _after_chunk_edit(doc_id, orc)
    return {"ok": True, "kb_id": kb_id, "op": OP_EDIT}


@router.post("/docs/{doc_id}/chunks/{kb_id}/disable")
def chunk_disable(doc_id: str, kb_id: str) -> dict:
    from ..edits import OP_DISABLE, EditStore

    orc = _orc()
    store = orc.store_for(doc_id)
    run = store.current_run("segment") or {}
    EditStore(store.edits_root).add_entry(
        {"op": OP_DISABLE, "chunk_id": kb_id},
        base_run_id=run.get("run_id", ""), base_content_hash=run.get("artifact_hash", ""))
    _after_chunk_edit(doc_id, orc)
    return {"ok": True, "kb_id": kb_id, "op": OP_DISABLE}


@router.post("/docs/{doc_id}/chunks/{kb_id}/delete")
def chunk_delete(doc_id: str, kb_id: str) -> dict:
    from ..edits import OP_DELETE, EditStore

    orc = _orc()
    store = orc.store_for(doc_id)
    run = store.current_run("segment") or {}
    EditStore(store.edits_root).add_entry(
        {"op": OP_DELETE, "chunk_id": kb_id},
        base_run_id=run.get("run_id", ""), base_content_hash=run.get("artifact_hash", ""))
    _after_chunk_edit(doc_id, orc)
    return {"ok": True, "kb_id": kb_id, "op": OP_DELETE}


@router.post("/docs/{doc_id}/chunks/{kb_id}/split")
def chunk_split(doc_id: str, kb_id: str, payload: dict = Body(default={})) -> dict:
    from ..edits import OP_SPLIT, EditStore

    p = _guard(payload)
    positions = [int(x) for x in (p.get("positions") or []) if str(x).isdigit()]
    if not positions:
        raise HTTPException(status_code=400, detail="缺少 positions（字符偏移数组）")
    orc = _orc()
    store = orc.store_for(doc_id)
    seg = store.read_current_artifact("segment") or {}
    src = next((c for c in seg.get("chunks", []) if c["kb_id"] == kb_id), None)
    if src is None:
        raise HTTPException(status_code=404, detail=f"未找到切片 {kb_id}")
    text = src.get("content") or ""
    parts, prev = [], 0
    for cut in sorted(positions):
        if 0 < cut < len(text):
            parts.append(text[prev:cut])
            prev = cut
    parts.append(text[prev:])
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="拆分点无效")
    run = store.current_run("segment") or {}
    EditStore(store.edits_root).add_entry(
        {"op": OP_SPLIT, "src": kb_id, "parts": parts},
        base_run_id=run.get("run_id", ""), base_content_hash=run.get("artifact_hash", ""))
    _after_chunk_edit(doc_id, orc)
    return {"ok": True, "parts": len(parts)}


@router.post("/docs/{doc_id}/chunks/{kb_id}/mark")
def chunk_mark(doc_id: str, kb_id: str, payload: dict = Body(default={})) -> dict:
    """给切片打「错误标记」（如"内容不完整"）

    ⚠️ 这是**标注**、不是内容变换：不会改变切片、不会进 cache_key、**也不会让它退出检索**。
    要真正排除它，标完之后还得用「禁用 / 删除」。界面上必须把这点讲清楚。
    """
    from ..edits.marks import MARK_REASONS, set_mark

    p = _guard(payload)
    reason = str(p.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="缺少 reason")
    store = _orc().store_for(doc_id)
    # 校验 kb_id 真的存在：否则标记会写到一个不存在的切片上，事后看像是"标记丢了"
    seg = store.read_current_artifact("segment") or {}
    if not any(c.get("kb_id") == kb_id for c in seg.get("chunks") or []):
        raise HTTPException(status_code=404, detail=f"未找到切片 {kb_id}")
    got = set_mark(store.edits_root, kb_id, reason, str(p.get("note") or ""))
    return {"ok": True, "kb_id": kb_id, "mark": got, "reasons": list(MARK_REASONS)}


@router.post("/docs/{doc_id}/chunks/{kb_id}/unmark")
def chunk_unmark(doc_id: str, kb_id: str) -> dict:
    from ..edits.marks import clear_mark

    store = _orc().store_for(doc_id)
    return {"ok": True, "kb_id": kb_id, "cleared": clear_mark(store.edits_root, kb_id)}


@router.post("/docs/{doc_id}/chunks/merge")
def chunk_merge(doc_id: str, payload: dict = Body(default={})) -> dict:
    from ..edits import OP_MERGE, EditStore

    p = _guard(payload)
    kb_ids = p.get("kb_ids") or []
    if len(kb_ids) < 2:
        raise HTTPException(status_code=400, detail="至少需要 2 个 kb_id")
    orc = _orc()
    store = orc.store_for(doc_id)
    run = store.current_run("segment") or {}
    EditStore(store.edits_root).add_entry(
        {"op": OP_MERGE, "src": list(kb_ids)},
        base_run_id=run.get("run_id", ""), base_content_hash=run.get("artifact_hash", ""))
    _after_chunk_edit(doc_id, orc)
    return {"ok": True, "merged": len(kb_ids)}


# ══════════════════════════════════════════════════════════════════════════
# 解析高危敏感信息复核（US-06，原「内容复核」2026-10-09 改名）
# ══════════════════════════════════════════════════════════════════════════


@router.get("/docs/{doc_id}/reviews")
def reviews_get(doc_id: str) -> dict:
    from ..edits import EditStore
    from ..quality.review import pending_items

    orc = _orc()
    v = orc.store_for(doc_id).read_current_artifact("validate")
    if v is None:
        return {"doc_id": doc_id, "ready": False, "items": [], "reason": "还没有校验产物"}
    items = v.get("review_items") or []
    resolutions = EditStore(orc.store_for(doc_id).edits_root).load_reviews()
    for it in items:
        rec = resolutions["items"].get(it["kb_id"])
        if rec:
            it["resolution"] = rec
    return {"doc_id": doc_id, "ready": True, "items": items,
            "pending": pending_items(v.get("chunks", [])),
            "rule_exceptions": resolutions["rule_exceptions"]}


@router.post("/docs/{doc_id}/reviews/{kb_id}/resolve")
def review_resolve(doc_id: str, kb_id: str, payload: dict = Body(default={})) -> dict:
    from ..edits import EditStore

    p = _guard(payload)
    state = p.get("state")
    if state not in ("accepted", "edited", "rejected", "unresolvable"):
        raise HTTPException(status_code=400, detail="state 必须是 accepted/edited/rejected/unresolvable")
    if state in ("accepted", "edited") and not p.get("value"):
        raise HTTPException(status_code=400, detail="accepted / edited 必须提供 value")
    orc = _orc()
    EditStore(orc.store_for(doc_id).edits_root).set_review(
        kb_id, state=state, value=p.get("value") or "", rule=p.get("rule") or "")
    orc.invalidate(doc_id, "validate")
    return {"ok": True, "kb_id": kb_id, "state": state,
            "note": "已标 validate 及下游待重跑；内容被改的块会在 index 时重算向量"}


# ══════════════════════════════════════════════════════════════════════════
# 入库结果（US-09）
# ══════════════════════════════════════════════════════════════════════════


@router.get("/docs/{doc_id}/index-result")
def index_result(doc_id: str) -> dict:
    orc = _orc()
    payload = orc.store_for(doc_id).read_current_artifact("index")
    if payload is None:
        return {"doc_id": doc_id, "ready": False, "reason": "还没有索引产物"}
    return {"doc_id": doc_id, "ready": True, **payload}


# ══════════════════════════════════════════════════════════════════════════
# 检索质检（US-11）
# ══════════════════════════════════════════════════════════════════════════


@router.get("/quality")
def quality_state() -> dict:
    from ..regression import RegressionRunner

    s = get_settings()
    orc = _orc()
    r = RegressionRunner(s, orc.db, orc.data_root)
    cases = r.cases()
    return {"cases": len(cases), "gold_pairs": sum(len(v) for v in r.gold_map().values()),
            "gold_version": r.gold_version(), "baseline": r._load_baseline(),
            "thresholds": {"recall_min": s.regression_cfg.recall_at_10_min,
                           "harmful_max": s.regression_cfg.harmful_recall_max}}


@router.post("/quality/run")
def quality_run(payload: dict = Body(default={})) -> dict:
    """旧版同步质检入口（兼容保留；新形态见 `router_quality.py` 的 /api/quality/runs）。

    返回体在 PRD-011 口径之上补一层**旧字段别名**（`metrics.recall_at_k` /
    `thresholds.recall_min` / `delta.recall_at_k`），供内嵌回退页（ui.py）继续可用。
    前置检查不通过（如缺 TOKENHUB_API_KEY）返回 `status=blocked` 的**正常响应**（不是 500）。
    """
    from ..regression import RegressionRunner

    p = _guard(payload)
    s = get_settings()
    orc = _orc()
    runner = RegressionRunner(s, orc.db, orc.data_root)
    scope = str(p.get("scope") or "all")
    chk = runner.precheck(scope)
    if not chk["ok"]:
        return {"status": "blocked", "message": "前置检查未通过：" + "；".join(chk["issues"]),
                "metrics": {}, "blocked_issues": chk["issues"]}
    try:
        r = runner.run(
            scope=scope, top_k=int(p.get("k") or 10), limit=p.get("limit"),
            record_baseline=not p.get("no_baseline"))
    except RuntimeError as e:
        return {"status": "failed", "message": str(e), "metrics": {}}
    m = r.get("metrics") or {}
    if m and "recall_at_k" not in m:
        m["recall_at_k"] = m.get("recall10")
    th = r.get("thresholds") or {}
    if th and "recall_min" not in th:
        th["recall_min"] = th.get("recall10_min")
    delta = r.get("delta")
    if isinstance(delta, dict) and "recall_at_k" not in delta:
        r["delta"] = {
            "recall_at_k": (delta.get("recall10") or 0) / 100,
            "harmful_rate": (delta.get("harmful_rate") or 0) / 100,
        }
    return r


@router.post("/quality/search")
def quality_search(payload: dict = Body(default={})) -> dict:
    """检索测试：输入问题直跑平台检索实现，返回 top-k 召回明细（US-11 配套工具）。

    与质检共用同一个 `retrieve()` —— 默认参数下「这里看到什么 = 质检/智能体看到什么」（同一实现）。
    只读：不写库、不落基线。向量 Key 未配置/调用失败时按降级链只走全文路，
    并把降级原因带回页面 —— 避免把「链路降级」误读成「召回变差」。

    召回参数（**实验**，2026-10-09 增，仅本页使用；不传 = 线上口径）：
      · `mode`: hybrid（默认）/ fts（仅全文）/ vector（仅向量）；
      · `keyword_weight`: 0~1，混合模式下全文路权重（均衡 0.5 = 与线上等权一致）。
    """
    from ..retrieval import retrieve

    p = _guard(payload)
    query = str(p.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="问题不能为空")
    if len(query) > 500:
        raise HTTPException(status_code=400, detail="问题过长（≤500 字）")
    try:
        k = max(1, min(int(p.get("k") or 10), 50))
    except (TypeError, ValueError):
        k = 10
    risk_level = p.get("risk_level") or None
    if risk_level and risk_level not in ("low", "caution", "emergency"):
        raise HTTPException(status_code=400, detail="risk_level 取值须为 low / caution / emergency")
    mode = str(p.get("mode") or "hybrid")
    if mode not in ("hybrid", "fts", "vector"):
        raise HTTPException(status_code=400, detail="mode 取值须为 hybrid / fts / vector")
    keyword_weight = p.get("keyword_weight")
    if keyword_weight is not None:
        try:
            keyword_weight = float(keyword_weight)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="keyword_weight 须为 0~1 的数字") from None
        if not 0.0 <= keyword_weight <= 1.0:
            raise HTTPException(status_code=400, detail="keyword_weight 须在 0~1 之间")

    s = get_settings()
    trace: dict = {}
    t0 = time.perf_counter()
    try:
        results = retrieve(s, query, top_k=k, risk_level=risk_level,
                           category=p.get("category") or None,
                           mode=mode, keyword_weight=keyword_weight, trace=trace)
    except Exception as e:      # noqa: BLE001 - 库不可达等基础故障要给页面可读文案
        raise HTTPException(status_code=502, detail=f"检索不可用：{e}") from e
    return {"ok": True, "query": query, "k": k, "count": len(results),
            "elapsed_ms": int((time.perf_counter() - t0) * 1000),
            **trace, "results": results}


# ══════════════════════════════════════════════════════════════════════════
# 知识缺口（US-12）
# ══════════════════════════════════════════════════════════════════════════


@router.get("/gaps")
def gaps_get() -> dict:
    from ..gaps import GapLedger, search_log_aggregate

    orc = _orc()
    ledger = GapLedger(orc.db)
    return {"items": ledger.list(), "stats": ledger.stats(),
            "online_misses": search_log_aggregate(orc.db)}


@router.post("/gaps/collect")
def gaps_collect() -> dict:
    from ..gaps import GapLedger
    from ..regression import RegressionRunner

    s = get_settings()
    orc = _orc()
    r = RegressionRunner(s, orc.db, orc.data_root).run(record_baseline=False)
    if r["status"] not in ("ok", "gold_stale"):
        return {"ok": False, "message": r.get("message"), "added": []}
    added = GapLedger(orc.db).from_regression(r)
    return {"ok": True, "added": added}


@router.post("/gaps/{gap_id}/defer")
def gaps_defer(gap_id: str, payload: dict = Body(default={})) -> dict:
    from ..gaps import GapLedger

    p = _guard(payload)
    try:
        row = GapLedger(_orc().db).defer(gap_id, p.get("reason") or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True, "row": row}


@router.post("/gaps/{gap_id}/close")
def gaps_close(gap_id: str, payload: dict = Body(default={})) -> dict:
    from ..gaps import GapLedger

    p = _guard(payload)
    return {"ok": True, "row": GapLedger(_orc().db).close(gap_id, p.get("reason") or "已补录语料")}


# （2026-10-09 删除）「智能体对接（US-13）」的 /contract 与 /contract/validate 端点
# 已随前端页面一并移除（知识库对接 Agent 的测评由「Agent 测评」域覆盖）。
# 契约定义与校验能力保留在 `kb_pipeline.contract` 模块与 CLI（`kb-pipeline contract`）。


# ══════════════════════════════════════════════════════════════════════════
# 发布（US-10）
# ══════════════════════════════════════════════════════════════════════════


@router.get("/publish/state")
def publish_state() -> dict:
    from ..publish import Publisher

    s = get_settings()
    orc = _orc()
    pub = Publisher(s, orc.db, orc.data_root)
    return {"snapshots": pub.list_snapshots(), "records": pub.records()}


@router.post("/publish/checks")
def publish_checks(payload: dict = Body(default={})) -> dict:
    from ..publish import Publisher

    p = _guard(payload)
    s = get_settings()
    orc = _orc()
    docs = p.get("doc_ids") or list(_doc_dirs().keys())
    return {"doc_ids": docs, "checks": Publisher(s, orc.db, orc.data_root).preflight_checks(docs)}


@router.post("/publish/plan")
def publish_plan(payload: dict = Body(default={})) -> dict:
    """发布计划：可发布（已就绪）文档 + 暂不可发布清单（含原因）+ 针对发布范围的检查。

    发布页的唯一数据源（2026-10-09）：页面**只展示已就绪的文档**作为发布范围，
    其它文档逐份说明"为什么还不能发"（附修复入口），不拦截发布 ——
    只要有可发布内容就能执行。`checks` 只对可发布组计算。

    文档口径 = **产物目录 ∪ 台账**（与「文档管理」列表一致）：刚登记、还没解析的文档
    也要出现在「暂不可发布」里说明原因，而不是凭空消失。
    """
    from ..corpus import CorpusLedger
    from ..publish import Publisher

    p = payload or {}
    s = get_settings()
    orc = _orc()
    idx = _doc_dirs()
    try:
        for row in CorpusLedger(orc.db).list():
            did = row["doc_id"]
            if row.get("status") == "archived" or did in idx:
                continue
            idx[did] = {"region": row.get("region") or "cn"}
    except Exception:  # noqa: BLE001 - 台账不可读时退回"只按产物目录"，别让计划页整体挂掉
        pass
    docs = p.get("doc_ids") or list(idx.keys())
    regions = {d: (idx.get(d) or {}).get("region") or "cn" for d in docs}
    return Publisher(s, orc.db, orc.data_root).plan(docs, regions=regions)


@router.post("/publish/run")
def publish_run(payload: dict = Body(default={})) -> dict:
    from ..publish import Publisher

    p = _guard(payload)
    s = get_settings()
    orc = _orc()
    docs = p.get("doc_ids") or list(_doc_dirs().keys())
    return Publisher(s, orc.db, orc.data_root).publish(
        docs, target_env=p.get("target_env") or "dev", forced=bool(p.get("force")))


@router.post("/publish/snapshot")
def publish_snapshot(payload: dict = Body(default={})) -> dict:
    from ..publish import Publisher

    p = _guard(payload)
    s = get_settings()
    orc = _orc()
    return Publisher(s, orc.db, orc.data_root).snapshot(note=p.get("note") or "")


@router.post("/publish/rollback")
def publish_rollback(payload: dict = Body(default={})) -> dict:
    from ..publish import Publisher

    p = _guard(payload)
    name = p.get("snapshot")
    if not name:
        raise HTTPException(status_code=400, detail="缺少 snapshot")
    s = get_settings()
    orc = _orc()
    return Publisher(s, orc.db, orc.data_root).rollback(name)


# ══════════════════════════════════════════════════════════════════════════
# 解析对照（US-14）：解析产物 ↔ 源文档
# ══════════════════════════════════════════════════════════════════════════

# HTML 来源的源文件后缀（国内/国际 各有约 4 份是下载页而非 PDF）
_SOURCE_HTML_SUFFIXES = (".html", ".htm")


def _source_html(doc_id: str, region: str) -> Path | None:
    """HTML 来源的源文件：`source_dir/{国内|国际}/<doc_id>.html`

    仅用于展示，且以 `text/plain` 下发 —— 不执行这些下载页里可能存在的脚本。
    """
    s = get_settings()
    region_dir = "国内" if region == "cn" else "国际"
    for suf in _SOURCE_HTML_SUFFIXES:
        p = s.source_dir / region_dir / f"{doc_id}{suf}"
        if p.exists():
            return p
    return None


@router.get("/docs/{doc_id}/parsed")
def parsed_get(doc_id: str) -> dict:
    """解析产物结构：按页分组的块 + 统计，供与源文档并排对照

    数据源是 MinerU 的 `*_content_list.json`（含 `page_idx` / `bbox` / `type`）与 `<doc>.md`。
    没有 content_list 的文档（HTML 来源）没有块可对齐：整份 Markdown 经 `md_full` 下发，
    由前端右栏直接展示（无联动高亮）。
    """
    entry = _doc_entry(doc_id)
    md_path = Path(entry["md"])
    md_text = md_path.read_text(encoding="utf-8", errors="replace") if md_path.exists() else ""

    cl_raw = entry.get("content_list")
    cl_path = Path(cl_raw) if cl_raw else None
    raw_items: list[dict[str, Any]] = []
    if cl_path is not None and cl_path.exists():
        raw_items = json.loads(cl_path.read_text(encoding="utf-8"))

    from ..block_regions import bbox_texts_for_blocks, block_regions, block_text

    blocks: list[dict[str, Any]] = [
        {
            "i": i,
            "type": b.get("type") or "unknown",
            "page_idx": b.get("page_idx"),
            "bbox": b.get("bbox"),
            # ⚠️ `list` 型的正文在 `list_items` 里，不在 `text` 里（`text` 恒为空）——
            # 直接用 `text` 会让界面显示"（无文本）"，而块里其实有几十条参考文献。
            "text": block_text(b),
        }
        for i, b in enumerate(raw_items)
    ]

    # 每个块的**其余落点**：MinerU 的 `bbox` 有时只覆盖块的一部分（`list` 只覆盖第一条、
    # 跨栏段落只覆盖第一栏），这里用 PDF 文字层按 MinerU 的粒度还原成若干矩形。
    # 判据与实现见 `block_regions.py`（对照 MinerU 源码 `content_list/common.py: unit_bbox`）。
    if raw_items and entry.get("pdf"):
        region_texts = bbox_texts_for_blocks(entry["pdf"], raw_items)
        for i, b in enumerate(blocks):
            regions = block_regions(entry["pdf"], raw_items[i], bbox_text=region_texts[i])
            if regions:
                b["regions"] = regions

    by_type: dict[str, int] = {}
    for b in blocks:
        by_type[b["type"]] = by_type.get(b["type"], 0) + 1
    page_ids = sorted({b["page_idx"] for b in blocks if b["page_idx"] is not None})

    has_pdf = bool(entry.get("pdf"))
    quoted = quote(doc_id, safe="")
    from .. import render_pages
    from ..md_align import build_chunks, rewrite_image_paths

    # Markdown ↔ 块对齐：让前端能"点左侧原文 → 右侧 md 段落高亮"。
    # 图片路径同时改写为后端可服务的绝对路径（md 里是 images/<hash>.jpg 相对路径）。
    img_base = f"/api/docs/{quoted}/img"
    md_preamble = ""
    md_chunks: list[dict[str, Any]] = []
    if md_text and raw_items:
        preamble, chunks = build_chunks(md_text, raw_items)
        md_preamble = rewrite_image_paths(preamble, img_base)
        md_chunks = [{"block_i": c["block_i"], "md": rewrite_image_paths(c["md"], img_base)} for c in chunks]

    # **无块对齐**时（下载页来源没有 content_list，或一个块都没挂上）把整份 md 下发，
    # 右栏直接展示（不做联动高亮 —— 没有块可点）。有块对齐时留空，避免重复下发全文。
    md_full = ""
    if not md_chunks and md_text:
        md_full = rewrite_image_paths(md_text, img_base)

    # 续排区域：跨栏 / 跨页段落被 MinerU 记成"空文本块"的那几个落点（**没有 md 片段**）。
    # 用 PDF 文字层核对"那个位置上印的确实是这一段的字"之后，记下它属于哪个块 ——
    # 前端据此把它们当成所属块的一部分（点它 → 右栏滚到那个块的 md 片段并高亮），
    # 而不是给一句"该块不在 Markdown 中"（那对用户是**错的**：那些字就在 markdown 里，
    # 只是被记在了同段的前一个块上）。见 docs/tech/TECH-015-kb-platform-gotchas.md §5。
    region_of: dict[str, int] = {}
    if md_chunks and raw_items:
        from ..anchors.chunk_align import find_continuations

        rt = _empty_region_text(entry, raw_items)
        for c in md_chunks:
            bi = int(c["block_i"])
            if not (0 <= bi < len(raw_items)):
                continue
            for ci in find_continuations(
                [bi], raw_items, chunk_text=raw_items[bi].get("text") or "", region_text=rt
            ):
                region_of.setdefault(str(ci), bi)

    return {
        "doc_id": doc_id,
        "ready": bool(blocks or md_text),
        "source_name": entry.get("source"),
        "title": entry.get("title"),
        "region": entry.get("region"),
        "kind": "pdf" if has_pdf else "html",
        "has_pdf": has_pdf,
        "has_content_list": bool(blocks),
        # MinerU 的内部块模型在不在（它比 content_list 细：逐块/逐行 bbox）。
        # 旧产物没有 → 块级高亮只能用 PDF 文字层反推（`block_regions.py`）。
        "has_middle": bool(entry.get("middle")),
        "page_count": (max(page_ids) + 1) if page_ids else 0,
        "md_chars": len(md_text),
        "stats": {"blocks": len(blocks), "by_type": by_type, "pages": len(page_ids)},
        # 按页分组的块，供左侧页面图叠加高亮框（每页一项，避免前端自己分组）
        "blocks": blocks,
        # ── Markdown 对齐（US-14）─────────────────────────────────────────
        # md_chunks[i].block_i ↔ blocks[].i；不含 md 片段的多为 header/footer/page_number
        # （MinerU 不把它们写进 markdown）
        "md_preamble": md_preamble,
        "md_chunks": md_chunks,
        # 无块对齐时（HTML 下载页来源）的整份 Markdown（已改写图片路径），右栏直接展示；
        # 有块对齐时为空串。见函数顶部 `md_full` 处的说明。
        "md_full": md_full,
        "md_aligned": len(md_chunks),
        # **续排区域**：`{"空块 i": 所属块 i}`。跨栏 / 跨页段落的其余落点（MinerU 记成空文本块、
        # 没有 md 片段），已用 PDF 文字层核对过归属 —— 前端把它们当作所属块的一部分。
        "region_of": region_of,
        "source_url": f"/api/docs/{quoted}/source",
        "md_url": f"/api/docs/{quoted}/parsed/md",
        "img_url_base": img_base,
        # ── bbox 高亮（US-14）──────────────────────────────────────────────
        # bbox 已按每页归一化到 0~1000（两轴独立，不保持纵横比），故前端用百分比定位即可，
        # 与渲染分辨率无关。详见 `render_pages.py` 顶部的实测结论。
        "bbox_space": 1000,
        "page_url_base": f"/api/docs/{quoted}/page",
        "render_scale": render_pages.DEFAULT_SCALE,
        "render_available": render_pages.available(),
    }


# ══════════════════════════════════════════════════════════════════════════
# 清洗对比（US-14 的清洗版）：原始解析 md ↔ 清洗后 md
# ══════════════════════════════════════════════════════════════════════════


def _read_parse_raw_md(store: Any, parse: dict[str, Any]) -> str | None:
    """取 parse 的原始 md 文本。

    优先用 parse 产物记录的 `md_path`（normalize 的输入就是它，证据链最准）；
    文件被移走时退回 `raw/` 里的同名副本（parse 落盘时复制进来的永久备份）。
    """
    cands: list[Path] = []
    if parse.get("md_path"):
        cands.append(Path(str(parse["md_path"])))
    if parse.get("md_name"):
        cands.append(store.raw_root / str(parse["md_name"]))
    for p in cands:
        try:
            if p.is_file():
                return p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
    # 最后的兜底：raw/ 里的第一个 *.md（md_name 缺失或被改名的旧产物）
    try:
        for p in sorted(store.raw_root.glob("*.md")):
            return p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        pass
    return None


@router.get("/docs/{doc_id}/normalize-diff")
def normalize_diff_get(doc_id: str) -> dict:
    """「清洗对比」页（工作台页签 ③）的数据源：正文清洗前后的逐行对照。

    推导走 normalize 产物的 `line_map`（输出行 ← 原始行）—— 与切片精确对齐
    （`anchors/chunk_align`）同一套行号链口径，实测 100% 命中；**不做文本 diff 匹配**。
    旧版产物缺 line_map 时如实返回 `ready=false` + 原因（重跑「正文清洗」即可），不猜。

    另附两项**源文档定位**数据（2026-10-09）：
      · `block_i` —— 改动行所属 content_list 块（左栏高亮的联动键）；
      · `del_boxes` —— **被删掉的字**在 PDF 页面上的精确小矩形（文字层词级定位，`render_pages`），
        定位不到就不放（前端退化为该块的虚线回退框），绝不猜。
    """
    from ..preprocess.diff import build_normalize_diff

    entry = _doc_entry(doc_id)          # 404 守卫 + 源文件路径（pdf 用于精确回位）
    orc = _orc()
    store = orc.store_for(doc_id)
    norm = store.read_current_artifact("normalize")
    if norm is None:
        return {
            "doc_id": doc_id,
            "ready": False,
            "reason": "还没有清洗产物。请先在「文档管理」对这份文档执行「进行清洗」。",
        }
    line_map = norm.get("line_map") or []
    if not line_map:
        return {
            "doc_id": doc_id,
            "ready": False,
            "reason": "该文档的清洗产物没有行号映射（旧版产物）：请重跑一次「正文清洗」后再看对比。",
        }
    parse = store.read_current_artifact("parse") or {}
    raw_md = _read_parse_raw_md(store, parse)
    if raw_md is None:
        return {
            "doc_id": doc_id,
            "ready": False,
            "reason": "原始解析 md 不可读（parse 产物缺失或文件已被移走）：请重跑「解析」或「正文清洗」。",
        }
    diff = build_normalize_diff(raw_md, str(norm.get("md") or ""), line_map)
    diff["doc_id"] = doc_id
    if diff.get("ready"):
        diff["heading_count"] = int(norm.get("heading_count") or 0)
        # ── 源文档定位（2026-10-09 加）────────────────────────────────────
        # ① 每个「修改 / 删除」行 → 它所属的 content_list 块下标（`block_i`），供前端在
        #    **源 PDF** 上与行双向联动（与 `/parsed` 的 md 片段同源：都走 `md_align` 的块锚点偏移）；
        # ② 每个被删段 → 它在页面上**实际印到的精确小矩形**（`del_boxes`，文字层词级定位）。
        # HTML 来源（无 content_list）或读取失败时**不阻断对照本身** —— 没有 block_i / del_boxes，
        # 前端自动退回单栏或块级回退框。
        cl = parse.get("content_list_path")
        try:
            items = (
                json.loads(Path(cl).read_text(encoding="utf-8"))
                if cl and Path(cl).exists()
                else None
            )
        except (OSError, json.JSONDecodeError):
            items = None
        if items:
            from ..md_align import lines_to_blocks
            from ..render_pages import locate_printed_text, visible_for_pdf

            line_blocks = lines_to_blocks(raw_md, items)
            pdf_path = entry.get("pdf")
            for it in diff.get("lines", []):
                src = it.get("src")
                if it.get("type") not in ("changed", "removed") or not isinstance(src, int):
                    continue
                if 0 <= src - 1 < len(line_blocks) and line_blocks[src - 1] is not None:
                    it["block_i"] = line_blocks[src - 1]

                if pdf_path is None or it.get("block_i") is None:
                    continue
                bi = it["block_i"]
                if not (0 <= bi < len(items)):
                    continue
                page = items[bi].get("page_idx")
                if page is None:
                    continue
                spans = (
                    [(str(it.get("text") or ""), "", "")]
                    if it.get("type") == "removed"
                    else _deleted_spans(it.get("before_parts") or [])
                )
                boxes: list[dict[str, Any]] = []
                for span, prev_un, next_un in spans[:12]:
                    vis = visible_for_pdf(span)
                    if not vis.strip():
                        continue        # 纯空白删除：原文里没有"可框的字"
                    rects = locate_printed_text(
                        pdf_path,
                        int(page),
                        vis,
                        before_ctx=visible_for_pdf(prev_un)[-60:],
                        after_ctx=visible_for_pdf(next_un)[:60],
                    )
                    for r in rects[:2]:
                        boxes.append({
                            "page_idx": int(page),
                            "bbox": [round(v) for v in r],
                            "text": span.strip()[:40],
                        })
                    if len(boxes) >= 12:
                        break
                if boxes:
                    it["del_boxes"] = boxes
    return diff


def _deleted_spans(before_parts: list[dict]) -> list[tuple[str, str, str]]:
    """从行内差段里取「被删段」及其两侧**保留文字**（做定位上下文用）。

    返回 [(被删原文, 前文, 后文), …]。前/后文取最近的未删段全文（定位器内部再截尾/头），
    连续多个被删段各自用"上一保留段 / 下一保留段"—— 上标成串出现时靠它们区分位置。
    """
    out: list[tuple[str, str, str]] = []
    for k, p in enumerate(before_parts or []):
        if p.get("m") != 1:
            continue
        prev_un = next(
            (before_parts[j]["t"] for j in range(k - 1, -1, -1) if before_parts[j].get("m") == 0),
            "",
        )
        next_un = next(
            (before_parts[j]["t"] for j in range(k + 1, len(before_parts)) if before_parts[j].get("m") == 0),
            "",
        )
        out.append((str(p.get("t") or ""), str(prev_un), str(next_un)))
    return out


@router.get("/docs/{doc_id}/preflight")
def doc_preflight(doc_id: str) -> dict:
    """预检产物 + **检查项清单** + 逐页文字层明细 —— 「解析详情 → 预检」页签的数据源

    预检（`steps/preflight.py`）做的是「解析前、纯本机」的六件事：
      ① 源文件定位 ② 源文件类型 ③ 页数 ④ 逐页文字层字符数（阈值判定扫描页）
      ⑤ 扫描页占比 → 是否需要 OCR ⑥ 解析档位推荐
    另有两条兜底：单页 / 整份 PDF 读取失败时降级而不中断，以及——本端点额外算一项
    **「结论是否真的接线到解析」**（预检的 `need_ocr` 目前只是建议，见该检查项的说明）。

    逐页明细**现场重算**而不是读产物：产物里只存了扫描页下标与总字符数，
    没存逐页字符数；重算实测 135 页 0.7s，可接受，且与产物同一实现（`scan_pdf_pages`）。
    """
    from ..steps.preflight import scan_pdf_pages, tier_label

    _doc_entry(doc_id)      # 404 守卫：doc_id 必须来自真实目录名（见 `_doc_entry` 的说明）
    store = _orc().store_for(doc_id)
    art = store.read_current_artifact("preflight")
    if art is None:
        return {
            "doc_id": doc_id,
            "ready": False,
            "reason": "还没有预检产物。请在「文档管理」对该文档执行「进行预检」。",
        }

    s = get_settings()
    cfg = s.preflight_cfg
    thresholds = {
        "min_text_chars_per_page": cfg.min_text_chars_per_page,
        "scan_page_ratio_for_ocr": cfg.scan_page_ratio_for_ocr,
    }
    checks: list[dict[str, Any]] = []

    def chk(cid: str, label: str, status: str, detail: str) -> None:
        checks.append({"id": cid, "label": label, "status": status, "detail": detail})

    # ① 源文件定位
    if art.get("source_missing") or not art.get("source_file"):
        chk("source", "源文件定位", "fail",
            f"在「{s.source_dir}/{{国内|国际}}/」下找不到 {doc_id}.pdf/.html/.htm —— "
            "预检无法读取文字层，档位按最保守处理")
    else:
        chk("source", "源文件定位", "pass", str(art["source_file"]))

    # ② 源文件类型
    kind = art.get("kind") or "unknown"
    chk("kind", "源文件类型", "info",
        {"pdf": "PDF — 可逐页读文字层", "html": "HTML 页面 — 无文字层可判，跳过 OCR 判定"}
        .get(kind, "未知"))

    # ③ 页数
    chk("pages", "页数", "info", f"{art.get('page_count') or 0} 页")

    # ④ 逐页文字层（现场重算）
    pages: list[dict[str, Any]] = []
    pages_error = ""
    if kind == "pdf" and art.get("source_file"):
        try:
            _, pages, _ = scan_pdf_pages(Path(art["source_file"]), cfg.min_text_chars_per_page)
        except Exception as e:  # noqa: BLE001 - 重算失败不影响其余检查项
            pages_error = str(e)

    if kind != "pdf":
        chk("text_layer", "文字层完整性", "info", "非 PDF 来源，无文字层可判")
    elif pages_error:
        chk("text_layer", "文字层完整性", "warn", f"逐页重算失败：{pages_error}")
    else:
        scanned = [p for p in pages if p["scanned"]]
        chars = sorted(p["chars"] for p in pages)
        mid = chars[len(chars) // 2] if chars else 0
        chk("text_layer", "文字层完整性",
            "warn" if scanned else "pass",
            f"逐页字符数 中位 {mid} · 最小 {chars[0] if chars else 0} · 最大 {chars[-1] if chars else 0}；"
            f"低于阈值 {cfg.min_text_chars_per_page} 字的判定为扫描页：{len(scanned)} 页"
            + (f"（第 {'、'.join(str(p['i'] + 1) for p in scanned[:12])} 页"
               + ("…" if len(scanned) > 12 else "") + "）" if scanned else ""))

    # ⑤ OCR 需求判定
    ratio = float(art.get("scanned_ratio") or 0)
    if kind != "pdf":
        chk("ocr", "OCR 需求判定", "info", "非 PDF 来源，无需判定")
    else:
        need = bool(art.get("need_ocr"))
        chk("ocr", "OCR 需求判定", "warn" if need else "pass",
            f"扫描页占比 {ratio:.0%} {'>' if need else '≤'} 阈值 "
            f"{cfg.scan_page_ratio_for_ocr:.0%} → {'需要' if need else '不需要'} OCR")

    # ⑥ 解析档位推荐
    _tier = str(art.get("recommended_tier") or "")
    chk("tier", "解析档位推荐", "info",
        f"{tier_label(_tier) or '—'} · {art.get('tier_reason') or ''}")

    # ⑦ 异常与兜底
    warns = list(art.get("warnings") or [])
    chk("exceptions", "异常与兜底", "warn" if warns else "pass",
        "；".join(warns) if warns else "无异常（单页/整份读取失败都会降级而不中断，此处为空即未触发）")

    # ⑧ 结论是否接线到下游 —— 预检宣称"替代手工 ocr_files 清单（技术债 T7）"，但接线要看得见
    mc = s.mineru_cfg
    need_ocr = bool(art.get("need_ocr"))
    wired = (not need_ocr) or mc.is_ocr or (doc_id in set(mc.ocr_files))
    if need_ocr and not wired:
        chk("wired", "结论是否接线到解析", "warn",
            "预检判定需要 OCR，但解析配置（mineru.is_ocr / ocr_files）里没有体现 —— "
            "预检的 need_ocr 目前只是**建议**，解析步骤并未消费它（技术债 T7 尚未闭环）")
    else:
        chk("wired", "结论是否接线到解析", "pass",
            "预检结论与解析配置一致" + ("" if need_ocr else "（本份不需要 OCR，无接线缺口）"))

    return {
        "doc_id": doc_id,
        "ready": True,
        "thresholds": thresholds,
        "checks": checks,
        "pages": pages,
        "pages_error": pages_error,
        "artifact": art,
    }


@router.get("/docs/{doc_id}/segments")
def doc_segments(doc_id: str) -> dict:
    """切块产物 + 与原文块的**精确**对齐 —— 「切片对照」页的数据源（US-14 的切片版）

    与 `/parsed` 的分工：那个给「解析产物 ↔ 原文」（块 + md 片段 + bbox），
    这个给「切块产物 ↔ 原文」（切片 + 它覆盖的 block_i）。左侧 PDF 复用同一个 `PdfDocument`。

    对齐走 `anchors/chunk_align`（行号链，实测 100% 命中）。行号链不成立时
    （旧产物没有 `line_map`、或表格跨行导致行数变化）**不猜**：返回 `aligned: false` +
    明确原因，前端退化为按页码定位并把原因显示出来。
    """
    from ..anchors.chunk_align import (
        align_chunks_to_blocks,
        find_continuations,
        load_content_list,
        merge_continuations,
    )
    from ..chunking.pipeline import doc_order_key
    from ..edits.marks import MARK_REASONS, load_marks

    entry = _doc_entry(doc_id)
    orc = _orc()
    store = orc.store_for(doc_id)
    seg = store.read_current_artifact("segment")
    if seg is None:
        return {
            "doc_id": doc_id,
            "ready": False,
            "reason": "还没有切块产物。请先在「文档管理」对这份文档执行「进行切块」。",
        }

    norm = store.read_current_artifact("normalize") or {}
    line_map = norm.get("line_map") or []
    chunks: list[dict[str, Any]] = list(seg.get("chunks") or [])

    # ① 只展示**本文档**的切片：切块产物按目录归属，理论上不会混入别的文档；万一产物被改写
    #    （人工产物合并写错、跨文档复制），这里直接剔除并**报数**，不让它悄悄出现在列表里。
    foreign = [c for c in chunks if c.get("doc_id") and str(c.get("doc_id")) != doc_id]
    if foreign:
        chunks = [c for c in chunks if not c.get("doc_id") or str(c.get("doc_id")) == doc_id]

    # ② 按**文档阅读顺序**展示（源行号，旧产物退回 kb_id 里的创建序号；
    #    见 `chunking.pipeline.doc_order_key`）。落盘的旧产物是按 `header_path` **字典序**
    #    排的（Abbreviations → Abstract → Appendix…），读起来像别的文档；这里在读取侧兜住，
    #    重跑切块后即成为无操作。
    chunks.sort(key=lambda c: doc_order_key(c.get("line_start"), str(c.get("kb_id") or "")))

    md_text = ""
    if entry.get("md"):
        p = Path(entry["md"])
        md_text = p.read_text(encoding="utf-8", errors="replace") if p.exists() else ""
    raw_items = load_content_list(entry.get("content_list"))

    # 三件事都要成立才谈得上精确对齐：有行映射、有内容块、且**切块产物本身带源行号**。
    # 只判前两者会得出"aligned=true 但一片都没对上"的误导结论（旧版切块产物就是这种）。
    has_lines = any(c.get("line_start") is not None for c in chunks)
    if not line_map:
        note = ("归一化产物里没有 `line_map`（旧版产物）：无法换算回原文坐标，"
                "请重跑一次「正文清洗」或「进行切块」后再看精确对齐。")
    elif not raw_items:
        note = "该文档没有 content_list（下载页来源），无法做块级对照。"
    elif not has_lines:
        note = ("切块产物是旧版（没有记录源行号）：请对这份文档重跑「进行切块」"
                "（若被闸门拦住，先放行暂停点 1）后再看精确对齐。")
    else:
        note = ""

    ok = bool(line_map and raw_items and has_lines)
    block_map = align_chunks_to_blocks(
        chunks, md_text=md_text, raw_items=raw_items, line_map=line_map
    ) if ok else {}

    # 续排区域：MinerU 对**跨栏/跨页段落**只给一栏的 bbox，其余版面上的落点是**空文本块**
    # （没有 md 片段 → 挂不上文本对齐）。不补的话，选中该切片时右栏 / 下一页那半段原文
    # 根本不会高亮，看起来就是"少了后面半截"。
    #
    # 现在这一步是**可验证**的：先从 PDF 自带文字层把每个空块位置上的**实际文字**取回来，
    # 与切片正文比对，对得上才收（见 chunk_align.find_continuations 的 `region_text`）。
    # 取不到文字层时退回纯几何判断。
    region_text = _empty_region_text(entry, raw_items) if ok else {}

    cont_map: dict[str, list[int]] = {}
    for kb, bis in (block_map.items() if ok else []):
        c = next((x for x in chunks if str(x.get("kb_id")) == kb), None)
        cont_map[kb] = find_continuations(
            bis,
            raw_items,
            chunk_text=(c.get("content") if c else None),
            region_text=region_text,
        )
    # 续排区域**直接并进 block_is**：它们同样属于这个切片（文字层已经核对过），
    # 所以界面按同一种样式高亮，不再区分"实线 / 虚线续接"。
    merged_map = {kb: bis for kb, bis in block_map.items()}
    for kb, bis in block_map.items():
        if cont_map.get(kb):
            merged_map[kb] = merge_continuations(bis, cont_map[kb])

    marks = load_marks(store.edits_root)
    out: list[dict[str, Any]] = []
    for c in chunks:
        kb_id = str(c.get("kb_id"))
        out.append({
            "kb_id": kb_id,
            "title": c.get("title") or "",
            "header_path": c.get("header_path") or "",
            "chunk_type": c.get("chunk_type") or "",
            "content": c.get("content") or "",
            "chars": len(c.get("content") or ""),
            "page_idx": c.get("page_idx"),
            "line_start": c.get("line_start"),
            "line_end": c.get("line_end"),
            "risk_level": c.get("risk_level"),
            "keywords": c.get("keywords"),
            "excluded": bool(c.get("excluded")),
            "exclude_rule": c.get("exclude_rule"),
            "exclude_by": c.get("exclude_by"),
            "review": bool(c.get("review")),
            "review_reason": c.get("review_reason"),
            "edited": bool(c.get("edited")),
            "disabled": bool(c.get("disabled")),
            "retrieval_status": c.get("retrieval_status"),
            # 该切片覆盖的 content_list 块下标（空 = 没对上，前端按 page_idx 兜底）。
            # ⚠️ 含**续排区域**：跨栏/跨页段落被 MinerU 记成"空文本块"的那几个落点也在里面
            # （已用 PDF 文字层核对该位置印的确实是本切片的字，见 find_continuations）。
            # 所以这些块与文本对齐上的块**同等**高亮，界面不再区分实线/虚线。
            "block_is": merged_map.get(kb_id, []),
            # 人工错误标记（标注，不改变内容、不影响检索）
            "mark": marks.get(kb_id),
        })

    by_type: dict[str, int] = {}
    for c in out:
        by_type[c["chunk_type"]] = by_type.get(c["chunk_type"], 0) + 1
    aligned = sum(1 for c in out if c["block_is"])
    return {
        "doc_id": doc_id,
        "ready": True,
        "aligned": ok,
        "note": note,
        # 图片地址前缀：切片正文里的图片是 md 的相对路径（`images/<sha>.jpg`），
        # 前端渲染前要用它改写（与 `/parsed` 的 `img_url_base` 同口径）。
        # ⚠️ 只给前缀，**不改写 content 本身** —— 正文会被「编辑正文」原样写回产物，
        # 后端若提前改写，绝对 URL 就会被烤进产物里。
        "img_url_base": f"/api/docs/{quote(doc_id, safe='')}/img",
        "stats": {
            "chunks": len(out),
            "aligned": aligned,
            "aligned_pct": round(aligned / len(out) * 100) if out else 0,
            "by_type": by_type,
            "excluded": sum(1 for c in out if c["excluded"]),
            "review": sum(1 for c in out if c["review"]),
            "disabled": sum(1 for c in out if c["disabled"]),
            "edited": sum(1 for c in out if c["edited"]),
            "marked": len(marks),
            # 被并入高亮的**续排区域**块数（跨栏/跨页段落落在其他位置的视觉区域）
            "merged_regions": sum(len(v) for v in cont_map.values()),
            # 因 `doc_id` 不属于本文档而被剔除的切片数（正常恒为 0；非 0 说明产物被改写坏了）
            "foreign_dropped": len(foreign),
            "total_chars": sum(c["chars"] for c in out),
            "block_count": len(raw_items),
        },
        # 错误标记：预设取值域 + 按原因统计（统计是后续改切块规则的依据）
        "mark_reasons": list(MARK_REASONS),
        "marks_summary": dict(Counter(m["reason"] for m in marks.values())),
        "warnings": list(seg.get("warnings") or []),
        "chunks": out,
    }


@router.get("/docs/{doc_id}/img/{name}")
def doc_image(doc_id: str, name: str):
    """文档产物里的图片（markdown 的 `![](images/<hash>.jpg)` 指向这里）

    `name` 只允许**纯文件名**：先经 `doc_id` 白名单（真实目录名）拿到文档目录，再要求
    `name` 不含路径分隔符且最终落点正是该文档的 `images/` 目录，杜绝路径穿越。
    """
    entry = _doc_entry(doc_id)
    if "/" in name or "\\" in name or name in ("", ".", ".."):
        raise HTTPException(status_code=400, detail="非法的图片名")
    img_root = Path(entry["md"]).parent / "images"
    p = img_root / name
    if not p.is_file() or p.parent.resolve() != img_root.resolve():
        raise HTTPException(status_code=404, detail=f"图片不存在: {name}")
    return FileResponse(str(p), headers={"Cache-Control": "public, max-age=86400"})


@router.get("/docs/{doc_id}/page/{page_idx}.png")
def page_png(doc_id: str, page_idx: int, scale: float = 2.0):
    """把源 PDF 的第 `page_idx` 页（0 基）渲成 PNG，供左栏展示与 bbox 叠加

    结果按 `doc_id/scale` 缓存在 `data/pages/`（已 gitignore），命中即直接返回。
    """
    from .. import render_pages

    entry = _doc_entry(doc_id)
    pdf = entry.get("pdf")
    if not pdf:
        raise HTTPException(status_code=404, detail=f"该文档没有源 PDF（下载页来源）: {doc_id}")

    orc = _orc()
    try:
        p = render_pages.render_page_png(Path(pdf), orc.data_root, doc_id, page_idx, scale)
    except IndexError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except render_pages.RenderUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    # 页面图对同一 doc_id+scale 不可变，可长缓存
    return FileResponse(str(p), media_type="image/png",
                        headers={"Cache-Control": "public, max-age=86400"})


@router.get("/docs/{doc_id}/source")
def source_file(doc_id: str):
    """源文档原文件：PDF 交给浏览器原生查看器（`inline`）；HTML 来源按纯文本下发"""
    entry = _doc_entry(doc_id)
    pdf = entry.get("pdf")
    if pdf:
        p = Path(pdf)
        if p.exists():
            # ⚠️ 不要手写 Content-Disposition：文档名几乎都是中文，HTTP 头只接受 latin-1，
            #    裸写会抛 UnicodeEncodeError（实测 500）。用 filename= 交给 Starlette 做
            #    RFC 5987（filename*=utf-8''…）编码。
            return FileResponse(str(p), media_type="application/pdf",
                                filename=p.name, content_disposition_type="inline")
    html = _source_html(doc_id, entry.get("region") or "cn")
    if html is not None:
        return PlainTextResponse(html.read_text(encoding="utf-8", errors="replace"),
                                 media_type="text/plain; charset=utf-8")
    raise HTTPException(status_code=404, detail=f"该文档没有可用的源文件: {doc_id}")


@router.get("/docs/{doc_id}/parsed/md")
def parsed_md(doc_id: str) -> PlainTextResponse:
    """MinerU 解析出的 Markdown 全文（纯文本，供「解析原文」模式）"""
    entry = _doc_entry(doc_id)
    p = Path(entry["md"])
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"解析产物不存在: {doc_id}")
    return PlainTextResponse(p.read_text(encoding="utf-8", errors="replace"),
                             media_type="text/plain; charset=utf-8")
