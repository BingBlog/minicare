"""检索质检台 · 导入通道（PRD-011 US-01）

把真实资产导入平台（此前只在脚本里跑、页面看不见）。**两条通道**：

  · **Excel 通道（推荐，`excel_io.py`）**：「用例集」页上传 .xlsx
    （工作表「测试集」+「映射表」），模板下载 / 导出当前用例集 / 导入三个端点；
  · **路径通道（兼容）**：读盘上的 md/json 文件 ——
    测试集 `docs/knowledge/research/召回测试集-种子50题.md`（表格式 Markdown 七列）、
    映射表 `minicare-platform/api/docs/KB-MAPPING.md`（人读版）或 `var/kb_mapping.json`（机器版）。

三条纪律：
  1. **两步式**：dry-run 先出报告（解析 + 映射体检 + diff），确认后才写入（幂等 upsert）；
  2. **体检是一等公民**：映射块是否仍存在于知识库（重切会改 `kb_id`）必须在导入时报出，
     不让"块没了"以"命中率下降"的形式在三天后浮现（R1）；
  3. **稳定层与易变层分离**：用例标注的是**条目**（`KB-A1`，稳定），写入 `kb_recall_gold`
    的是**展开后的块三元组**（随重切漂移）—— 重新导入即完成一次全量重解析。
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

from ..config import REPO_ROOT, Settings
from ..platform_db import PlatformDB
from ..store.knowledge_base import REVIEW_PREFIX

# 题号行：`| A-04 | 宝宝牛奶过敏，以后会不会发展成哮喘？ | ...`
CASE_ROW_RE = re.compile(r"^\|\s*([A-Z]-\d{1,2})\s*\|")
CASE_ID_RE = re.compile(r"^[A-Z]-\d{1,2}$")
# 标注单元格里的条目引用：`KB-A1（定义分类）` / `KB-A4（vs 不耐受）`；名称可缺省
ENTRY_RE = re.compile(r"(KB-[A-H]\d+)\s*(?:（([^）]*)）)?")
RISKS = ("low", "caution", "emergency")


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


# ── 模块语义名（展示层单一事实源）──────────────────────────────────────
#
# 字母是模块的**稳定标识**（题号前缀 `A-01`、范围串 `modules:A`、台账 `module` 列都用它）；
# 中文名是**给人看的语义说明**，命名对齐《召回质量测评方案.md》§2.2 与测试集章节标题。
# 新增模块在此登记一次；用例集筛选、发起范围勾选、运行记录标签统一从这里取。

MODULE_LABELS: dict[str, str] = {
    "A": "基础认知",
    "B": "预防体系",
    "C": "诊断检测",
    "D": "CMPA 专项",
    "E": "营养喂养",
    "F": "症状急症",
    "G": "长期管理",
    "H": "就医联动",
    "N": "负样本",
}


def module_label(module: str) -> str:
    """模块 → 语义名；未登记的新模块兜底显示原值（不吞信息、不制造空串）。"""
    return MODULE_LABELS.get(module, module)


_LABEL_MODULES_RE = re.compile(r"^(模块\s+)([A-Z](?:·[A-Z])*)(（.*)$")


def localize_scope_label(label: str) -> str:
    """历史存量 scope_label 的展示兼容：`模块 A·C（12 题）` → `模块 基础认知·诊断检测（12 题）`。

    生成端（`regression.scope_label`）已直接落语义名；本函数兜住旧运行记录里存的字母版，
    让「执行记录」页不出现两种口径。已是语义名的串原样返回（正则只匹配纯字母段）。
    """
    m = _LABEL_MODULES_RE.match(label or "")
    if not m:
        return label
    names = "·".join(module_label(x) for x in m.group(2).split("·"))
    return m.group(1) + names + m.group(3)


# ── 默认路径 ──────────────────────────────────────────────────────────


def default_paths() -> dict[str, str]:
    return {
        "testset": str(REPO_ROOT / "docs" / "knowledge" / "research" / "召回测试集-种子50题.md"),
        "mapping": str(REPO_ROOT / "minicare-platform" / "api" / "docs" / "KB-MAPPING.md"),
    }


# ── 解析：测试集（表格式 Markdown）─────────────────────────────────────


def _split_row(line: str) -> list[str]:
    return [p.strip() for p in line.strip().strip("|").split("|")]


def _parse_entries(cell: str) -> list[dict]:
    """解析一个标注单元格 → [{code, name}]（保持出现顺序、去重）"""
    cell = (cell or "").strip()
    if not cell or cell in ("—", "-", "无", "无（库外）"):
        return []
    out: list[dict] = []
    seen: set[str] = set()
    for m in ENTRY_RE.finditer(cell):
        code, name = m.group(1), (m.group(2) or "").strip()
        if code in seen:
            continue
        seen.add(code)
        out.append({"code": code, "name": name})
    return out


def parse_testset(text: str) -> list[dict]:
    """宽松解析测试集（表格式）；解析不到任何题目时返回空列表（由调用方报错）。

    列约定（见种子文件表头）：题号 | 问题 | gold | acceptable | negative | key_info | risk。
    负样本题（gold 为「无（库外）」）→ `case_type='out_of_scope'`，不参与召回率分母。
    """
    cases: list[dict] = []
    for raw in text.splitlines():
        if not CASE_ROW_RE.match(raw):
            continue
        parts = _split_row(raw)
        if len(parts) < 7:
            continue
        qid = parts[0]
        if not CASE_ID_RE.match(qid):
            continue
        question = parts[1].strip()
        if not question or question == "question":
            continue
        gold = _parse_entries(parts[2])
        acceptable = _parse_entries(parts[3])
        negative = _parse_entries(parts[4])
        key_info = "" if parts[5] in ("—", "-") else parts[5]
        risk = re.sub(r"[*`\s]", "", parts[6]).lower() or "low"
        if risk not in RISKS:
            risk = "low"
        cases.append({
            "case_id": qid,
            "module": qid.split("-")[0],
            "question": question,
            "theme": question[:24],
            "risk": risk,
            "case_type": "answerable" if gold else "out_of_scope",
            "expect": {"gold": gold, "acceptable": acceptable, "negative": negative,
                       "key_info": key_info},
        })
    return cases


# ── 解析：映射表（KB-MAPPING.md / var/kb_mapping.json）─────────────────


def _clean_kb_id(cell: str) -> str:
    cell = (cell or "").strip()
    if "`" in cell:
        m = re.search(r"`([^`]+)`", cell)
        if m:
            return m.group(1).strip()
    return cell


def parse_mapping_md(text: str) -> dict[str, list[dict]]:
    """人读版映射表：行 `| KB-A1 | 模块 | 语义描述 | `kb_id` | 块标题 | … |`"""
    mapping: dict[str, list[dict]] = {}
    for raw in text.splitlines():
        parts = _split_row(raw)
        if len(parts) < 4:
            continue
        code = parts[0]
        if not re.fullmatch(r"KB-[A-H]\d+", code):
            continue
        kb_id = _clean_kb_id(parts[3])
        if not kb_id or kb_id.startswith("映射知识块"):
            continue
        title = parts[4] if len(parts) > 4 else ""
        bucket = mapping.setdefault(code, [])
        if kb_id not in {c["kb_id"] for c in bucket}:
            bucket.append({"kb_id": kb_id, "title": title})
    return mapping


def parse_mapping_json(text: str) -> dict[str, list[dict]]:
    """机器版：`{"KB-A1": ["kb_id", ...]}` 或 `{"KB-A1": [{"kb_id", "title"}]}`"""
    data = json.loads(text)
    out: dict[str, list[dict]] = {}
    for code, value in (data or {}).items():
        code = str(code)
        if not re.fullmatch(r"KB-[A-H]\d+", code):
            continue
        items: list[dict] = []
        for it in value or []:
            if isinstance(it, str):
                items.append({"kb_id": it, "title": ""})
            elif isinstance(it, dict) and it.get("kb_id"):
                items.append({"kb_id": str(it["kb_id"]), "title": str(it.get("title") or "")})
        out[code] = items
    return out


def load_mapping(path: Path) -> tuple[dict[str, list[dict]], str]:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        return parse_mapping_json(text), "json"
    return parse_mapping_md(text), "md"


# ── 知识库存活探测（映射体检的数据层）────────────────────────────────


def fetch_kb_states(settings: Settings) -> tuple[dict[str, str] | None, str | None]:
    """`{kb_id: 'enabled' | 'excluded'}`（仅 `status=1` 的行）；失败返回 `(None, 原因)`。

    与 `retrieval.py` 的过滤语义严格一致：
      · 迁移 021 之后：`retrieval_status='enabled'` 才可检索；
      · 之前：`content` 前缀不是 `[待复核]` 才可检索。
    **不在结果里的 kb_id = 该块已不存在**（missing）。
    """
    try:
        import pymysql

        conn = pymysql.connect(
            host=settings.db_host, port=settings.db_port, user=settings.db_user,
            password=settings.db_password, database=settings.db_name, charset="utf8mb4",
            connect_timeout=5,
        )
    except Exception as e:  # noqa: BLE001 - 探测失败给出人话原因，不抛
        return None, f"数据库不可达：{e}"
    try:
        from ..retrieval import has_retrieval_status_column

        with conn.cursor() as cur:
            if has_retrieval_status_column(cur):
                cur.execute("SELECT kb_id, retrieval_status FROM knowledge_base WHERE status=1")
                return {
                    r[0]: ("enabled" if (r[1] or "") == "enabled" else "excluded")
                    for r in cur.fetchall()
                }, None
            cur.execute("SELECT kb_id, LEFT(content, 12) FROM knowledge_base WHERE status=1")
            return {
                r[0]: ("excluded" if str(r[1] or "").startswith(REVIEW_PREFIX) else "enabled")
                for r in cur.fetchall()
            }, None
    except Exception as e:  # noqa: BLE001
        return None, f"读取知识库失败：{e}"
    finally:
        conn.close()


# ── 展开与体检 ────────────────────────────────────────────────────────


def resolve_case_triples(case: dict, mapping: dict[str, list[dict]]) -> tuple[list[dict], int]:
    """题的三态条目标注 × 映射表 → 块级三元组（tier / entry_code / title）。

    ⚠️ **块级跨层重叠**（已知数据条件：一个块被多个条目引用——RECALL-REPORT §3.2 的
    "伪有害"根因）按 **gold > acceptable > negative** 优先认领：
    同一块不可能既"应该命中"又"有害"；认领先到者、丢弃后到者的层属，返回（三元组, 重叠数）。
    """
    out: dict[str, dict] = {}
    overlaps = 0
    for tier in ("gold", "acceptable", "negative"):
        for ent in case["expect"].get(tier) or []:
            for chunk in mapping.get(ent["code"]) or []:
                if chunk["kb_id"] in out:
                    overlaps += 1
                    continue
                out[chunk["kb_id"]] = {"kb_id": chunk["kb_id"], "tier": tier,
                                       "entry_code": ent["code"], "title": chunk.get("title") or ""}
    return list(out.values()), overlaps


def case_health(case: dict, triples: list[dict], states: dict[str, str] | None) -> dict:
    """单题映射体检：`status ∈ ok/warn/blocked` + 三层「条目 → 块」明细（用例集页展开数据源）。

    · `blocked` —— answerable 题且 gold 层没有任何「可检索」的块（全失效 / 全被排除 / 未映射）；
    · `warn`    —— gold 层有可检索块，但存在失效/被排除/未映射的部分；
    · `ok`      —— 其余（含负样本题）。
    `states=None`（数据库不可达）→ 块状态一律 `unknown`，不硬判 blocked（页面另行提示）。
    """
    def state_of(t: dict) -> str:
        if states is None:
            return "unknown"
        return states.get(t["kb_id"], "missing")

    by_entry: dict[str, list[dict]] = {}
    for t in triples:
        by_entry.setdefault(t["entry_code"], []).append(t)

    entries: dict[str, list[dict]] = {}
    for tier in ("gold", "acceptable", "negative"):
        rows = []
        for ent in case["expect"].get(tier) or []:
            chunks = by_entry.get(ent["code"]) or []
            states_of = [state_of(c) for c in chunks]
            if not chunks:
                st = "unmapped"
            elif all(s != "enabled" for s in states_of):
                st = "stale"
            elif any(s != "enabled" for s in states_of):
                st = "partial"
            else:
                st = "ok"
            rows.append({
                "code": ent["code"], "name": ent["name"], "status": st,
                "chunks": [{"kb_id": c["kb_id"], "title": c.get("title") or "", "state": s}
                           for c, s in zip(chunks, states_of)],
            })
        entries[tier] = rows

    if case.get("case_type") == "out_of_scope":
        status = "ok"
    else:
        gold_states = [state_of(t) for t in triples if t["tier"] == "gold"]
        if not gold_states or all(s != "enabled" for s in gold_states):
            status = "blocked"
        elif any(s != "enabled" for s in gold_states):
            status = "warn"
        else:
            status = "ok"
    return {"case_id": case["case_id"], "status": status, "entries": entries}


# ── 导入（两步式 + 幂等）───────────────────────────────────────────────


def import_dataset(db: PlatformDB, settings: Settings, testset_path: str,
                   mapping_path: str, dry_run: bool = False) -> dict:
    """按文件路径导入（md / json 兼容通道）。解析 → 体检 → diff →（可选）写入。"""
    ts = Path(testset_path).expanduser()
    mp = Path(mapping_path).expanduser()
    if not ts.is_file():
        raise ValueError(f"测试集文件不存在：{ts}")
    if not mp.is_file():
        raise ValueError(f"映射表文件不存在：{mp}")

    cases = parse_testset(ts.read_text(encoding="utf-8"))
    if not cases:
        raise ValueError("未能从测试集文件识别任何题目（检查文件是否为表格式、题号列是否为 A-01 这类格式）")
    mapping, fmt = load_mapping(mp)
    return _run_import(db, settings, cases=cases, mapping=mapping, fmt=fmt,
                       ts_label=str(ts), mp_label=str(mp), dry_run=dry_run)


def import_dataset_excel(db: PlatformDB, settings: Settings, filename: str,
                         data: bytes, dry_run: bool = False) -> dict:
    """Excel 通道（「用例集」页上传 .xlsx）：解析 → 体检 → diff →（可选）写入。

    行级校验失败（`errors` 非空）时**不写入**——报告以 `ok=false` 返回，先修文件。
    """
    from .excel_io import SHEET_CASES, SHEET_MAPPING, parse_workbook  # 惰性：仅本通道需要 openpyxl

    parsed = parse_workbook(data)
    label = f"上传：{filename}" if (filename or "").strip() else "上传文件"
    return _run_import(db, settings, cases=parsed["cases"], mapping=parsed["mapping"], fmt="xlsx",
                       ts_label=f"{label} ·「{SHEET_CASES}」表", mp_label=f"{label} ·「{SHEET_MAPPING}」表",
                       dry_run=dry_run, errors=parsed["errors"], parse_warnings=parsed["warnings"])


def template_xlsx() -> bytes:
    """「下载 Excel 模板」的字节内容（惰性 import：不装 openpyxl 也能用其余功能）。"""
    from .excel_io import build_template

    return build_template()


def export_workbook(db: PlatformDB) -> bytes:
    """「导出当前用例集」：台账 → 同构 Excel（可直接维护后再导入）。

    · 测试集：取自 `kb_recall_case` 的题面与三态标注（负样本题 gold 渲染为「无（库外）」）；
    · 映射表：条目取自各题 `expect_json` 的引用、块取自 `kb_recall_gold`；
      被引用但暂无映射的条目保留一行空「知识块ID」，供人工补齐。
    """
    from .excel_io import build_export  # 惰性：仅 Excel 通道需要 openpyxl

    rows = db.query("SELECT * FROM kb_recall_case ORDER BY case_id")
    triples = db.query(
        "SELECT case_id, kb_id, tier, entry_code, chunk_title FROM kb_recall_gold "
        "ORDER BY case_id, is_primary DESC, kb_id")

    cases: list[dict] = []
    entry_order: list[str] = []
    entry_desc: dict[str, str] = {}
    for r in rows:
        try:
            expect = json.loads(r.get("expect_json") or "{}")
        except json.JSONDecodeError:
            expect = {}
        for tier in ("gold", "acceptable", "negative"):
            for ent in expect.get(tier) or []:
                code = str(ent.get("code") or "").strip()
                if not code:
                    continue
                if code not in entry_order:
                    entry_order.append(code)
                if ent.get("name") and not entry_desc.get(code):
                    entry_desc[code] = str(ent["name"])
        cases.append({
            "case_id": r["case_id"], "question": r["question"],
            "gold": expect.get("gold") or [], "acceptable": expect.get("acceptable") or [],
            "negative": expect.get("negative") or [],
            "key_info": expect.get("key_info") or "",
            "risk": r.get("risk") or "low", "case_type": r.get("case_type") or "answerable",
        })

    chunks: dict[str, list[dict]] = {}
    seen: set[tuple[str, str]] = set()
    for t in triples:
        pair = (t["entry_code"], t["kb_id"])
        if pair in seen:
            continue
        seen.add(pair)
        chunks.setdefault(t["entry_code"], []).append(
            {"kb_id": t["kb_id"], "title": t.get("chunk_title") or ""})
    mapping_rows: list[dict] = []
    for code in sorted(entry_order, key=_entry_sort_key):
        bucket = chunks.get(code) or [{"kb_id": "", "title": ""}]
        for c in bucket:
            mapping_rows.append({"code": code, "desc": entry_desc.get(code, ""),
                                 "kb_id": c["kb_id"], "title": c["title"]})
    return build_export(cases, mapping_rows)


def _entry_sort_key(code: str) -> tuple[str, int]:
    m = re.fullmatch(r"KB-([A-H])(\d+)", code or "")
    return (m.group(1), int(m.group(2))) if m else ("Z", 0)


def _run_import(db: PlatformDB, settings: Settings, *, cases: list[dict], mapping: dict[str, list[dict]],
                fmt: str, ts_label: str, mp_label: str, dry_run: bool,
                errors: list[str] | None = None, parse_warnings: list[str] | None = None) -> dict:
    """两条通道共用的导入内核：体检 → diff →（可选）写入，返回同构报告。

    `errors` 非空（Excel 行级校验失败）时：**即使 `dry_run=False` 也不写入**。
    """
    errors = list(errors or [])
    states, db_err = fetch_kb_states(settings)

    resolved: dict[str, list[dict]] = {}
    health_cases: list[dict] = []
    overlap_total = 0
    for c in cases:
        triples, overlaps = resolve_case_triples(c, mapping)
        overlap_total += overlaps
        resolved[c["case_id"]] = triples
        health_cases.append(case_health(c, triples, states))

    used_entries = sorted(
        {ent["code"] for c in cases for tier in ("gold", "acceptable", "negative")
         for ent in c["expect"].get(tier) or []}
    )
    unmapped = [code for code in used_entries if not mapping.get(code)]
    by_module: dict[str, int] = {}
    for c in cases:
        by_module[c["module"]] = by_module.get(c["module"], 0) + 1

    existing_rows = {r["case_id"]: r for r in db.query(
        "SELECT case_id, question, expect_json, enabled, source FROM kb_recall_case")}
    new = updated = unchanged = 0
    for c in cases:
        ex = existing_rows.get(c["case_id"])
        if not ex:
            new += 1
            continue
        same = (ex["question"] == c["question"]
                and (ex.get("expect_json") or "") == json.dumps(c["expect"], ensure_ascii=False))
        if same:
            unchanged += 1
        else:
            updated += 1
    removed = [cid for cid, row in existing_rows.items()
               if cid not in {c["case_id"] for c in cases} and (row.get("source") or "seed") == "seed"]

    warnings: list[str] = list(parse_warnings or [])
    if db_err:
        warnings.append(f"映射体检未完成（{db_err}）——块存活状态未知，导入前建议先恢复数据库")
    if unmapped:
        warnings.append(f"{len(unmapped)} 个条目在映射表中没有对应块：{'、'.join(unmapped[:8])}"
                        "（这些题目的期望将缺该条目，运行前检查会按范围拦截）")
    if overlap_total:
        warnings.append(f"{overlap_total} 处块级跨层重叠（一个块被多个条目引用）"
                        "已按 gold > acceptable > negative 认领——不会出现「既命中又有害」")
    if removed:
        warnings.append(f"{len(removed)} 道种子题在当前文件里不存在：{'、'.join(removed[:8])}"
                        "（未自动处理，如需移除请人工停用）")

    report = {
        "ok": not errors,
        "errors": errors,
        "dry_run": bool(dry_run),
        "testset": {
            "path": ts_label, "parsed": len(cases),
            "answerable": len([c for c in cases if c["case_type"] == "answerable"]),
            "out_of_scope": len([c for c in cases if c["case_type"] == "out_of_scope"]),
            "by_module": by_module,
        },
        "mapping": {
            "path": mp_label, "format": fmt,
            "entries": len(mapping), "chunks": sum(len(v) for v in mapping.values()),
        },
        "resolved_chunks": sum(len(v) for v in resolved.values()),
        "tier_overlap": overlap_total,
        "used_entries": len(used_entries),
        "unmapped_entries": unmapped,
        "health": {
            "db_ok": states is not None, "db_error": db_err,
            "ok": len([h for h in health_cases if h["status"] == "ok"]),
            "warn": len([h for h in health_cases if h["status"] == "warn"]),
            "blocked": len([h for h in health_cases if h["status"] == "blocked"]),
            "blocked_cases": [h["case_id"] for h in health_cases if h["status"] == "blocked"],
        },
        "diff": {"new": new, "updated": updated, "unchanged": unchanged,
                 "existing": len(existing_rows), "removed_from_file": removed},
        "warnings": warnings,
        "written": False,
    }
    if dry_run or errors:
        return report

    now = _now()
    ver = settings.regression_cfg.gold_version
    for c in cases:
        ex = existing_rows.get(c["case_id"])
        enabled = int(ex["enabled"]) if ex else 1     # 更新时保留人工启停状态
        db.upsert("kb_recall_case", ["case_id"], {
            "case_id": c["case_id"], "module": c["module"], "question": c["question"],
            "theme": c["theme"], "enabled": enabled, "risk": c["risk"],
            "case_type": c["case_type"],
            "expect_json": json.dumps(c["expect"], ensure_ascii=False),
            "source": (ex.get("source") if ex else None) or "seed",
            "note": None,
        })
        db.execute("DELETE FROM kb_recall_gold WHERE case_id=?", (c["case_id"],))
        first = True
        for t in resolved[c["case_id"]]:
            db.upsert("kb_recall_gold", ["case_id", "kb_id"], {
                "case_id": c["case_id"], "kb_id": t["kb_id"],
                "is_primary": 1 if first else 0,
                "gold_version": ver, "mapped_at": now,
                "tier": t["tier"], "entry_code": t["entry_code"], "chunk_title": t["title"],
            })
            first = False
    report["written"] = True
    return report


# ── 用例集视图（cases 页数据源）─────────────────────────────────────────


def cases_view(db: PlatformDB, settings: Settings) -> dict:
    """逐题明细（三层条目→块 + 存活状态）+ 统计。数据库不可达时状态降级为 unknown。"""
    rows = db.query("SELECT * FROM kb_recall_case ORDER BY case_id")
    states, db_err = fetch_kb_states(settings)
    triples = db.query("SELECT * FROM kb_recall_gold ORDER BY case_id, tier, is_primary DESC")
    by_case: dict[str, list[dict]] = {}
    for t in triples:
        by_case.setdefault(t["case_id"], []).append({
            "kb_id": t["kb_id"], "tier": t["tier"],
            "entry_code": t["entry_code"], "title": t.get("chunk_title") or "",
        })

    items = []
    for r in rows:
        try:
            expect = json.loads(r.get("expect_json") or "{}")
        except json.JSONDecodeError:
            expect = {}
        case = {
            "case_id": r["case_id"], "module": r["module"], "question": r["question"],
            "theme": r.get("theme"), "risk": r.get("risk") or "low",
            "case_type": r.get("case_type") or "answerable",
            "source": r.get("source") or "seed", "note": r.get("note"),
            "enabled": bool(r["enabled"]), "expect": expect,
        }
        h = case_health(case, by_case.get(r["case_id"], []), states)
        items.append({**case, "status": h["status"], "entries": h["entries"]})

    by_module: dict[str, int] = {}
    by_risk: dict[str, int] = {}
    for it in items:
        by_module[it["module"]] = by_module.get(it["module"], 0) + 1
        by_risk[it["risk"]] = by_risk.get(it["risk"], 0) + 1
    stats = {
        "total": len(items),
        "enabled": len([it for it in items if it["enabled"]]),
        "answerable": len([it for it in items if it["case_type"] == "answerable"]),
        "out_of_scope": len([it for it in items if it["case_type"] == "out_of_scope"]),
        "by_module": by_module, "by_risk": by_risk,
        "module_labels": dict(MODULE_LABELS),
        "mapping": {
            "ok": len([it for it in items if it["status"] == "ok"]),
            "warn": len([it for it in items if it["status"] == "warn"]),
            "blocked": len([it for it in items if it["status"] == "blocked"]),
        },
        "db_ok": states is not None, "db_error": db_err,
    }
    return {"items": items, "stats": stats}
