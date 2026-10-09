"""检索质检台 · Excel 读写（PRD-011 US-01 追加：Excel 模板 / 导入 / 导出）

把「用例集」的维护载体从两份 Markdown（列不固定、两处维护、人改易错）
收敛为一个固定格式的 .xlsx 工作簿，三个工作表：

  · 「测试集」—— 每行一道题（题号 | 问题 | 必命中 | 可接受 | 有害 | 关键要点 | 风险）
  · 「映射表」—— 每行一条 条目 → 知识块 映射（条目编码 | 语义描述 | 知识块ID | 块标题）
  · 「说明」—— 列语义与填写规则（导入时忽略，可自由增删）

三个入口（对应页面的三个动作）：
  · `build_template()`  ——「下载 Excel 模板」：表头 + 示例行 + 说明；
  · `parse_workbook()`  ——「导入」：解析上传字节 → cases / mapping / errors / warnings；
  · `build_export()`    ——「导出当前用例集」：由台账数据生成同构工作簿（改完可直接再导入）。

口径（与 md 通道严格一致，保证两条通道互相可替换）：
  · 题号 `A-01`（字母=模块，N=负样本）；gold 为空 → `case_type=out_of_scope`；
  · 条目引用 `KB-A1（定义分类）`，多个用「、」等任意分隔（按出现顺序解析、去重）；
  · 风险列接受 低/注意/高危（或 low/caution/emergency），导出统一渲染为中文；
  · 「—」「无（库外）」等视为空；空白行忽略；**行级错误逐条列出、有错不写入**。

openpyxl 为惰性导入：仅 Excel 通道的调用才需要它（pyproject 已声明依赖）。
"""
from __future__ import annotations

import io
import re

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

SHEET_CASES = "测试集"
SHEET_MAPPING = "映射表"
SHEET_GUIDE = "说明"

# 工作表名容错（大小写/常见别名；写入固定用上面三个名字）
_CASES_ALIASES = {SHEET_CASES, "用例集", "cases", "case", "testset"}
_MAPPING_ALIASES = {SHEET_MAPPING, "映射", "mapping", "map"}

# ── 取值口径 ──────────────────────────────────────────────────────────

CASE_ID_RE = re.compile(r"^[A-Z]-\d{1,2}$")
ENTRY_RE = re.compile(r"(KB-[A-H]\d+)\s*(?:[（(]([^）)]*)[）)])?", re.IGNORECASE)
KB_CODE_RE = re.compile(r"^KB-[A-H]\d+$")

# 视为「没有」的写法（与历史文件口径一致，另容半角括号）
_EMPTY_CELLS = {"", "—", "-", "–", "无", "无（库外）", "无(库外)", "n/a", "na"}

_RISK_ALIASES = {
    "low": "low", "低": "low",
    "caution": "caution", "注意": "caution",
    "emergency": "emergency", "高危": "emergency", "紧急": "emergency",
}
_RISK_DISPLAY = {"low": "低", "caution": "注意", "emergency": "高危"}

# 表头别名（`_norm_header` 归一后匹配：去括号补充、去 *、去空白、ASCII 小写）。
# 中文键与英文键都接受，顺序固定不敏感（按表头名取列，不按位置）。
_HEADERS_CASES: dict[str, set[str]] = {
    "case_id": {"题号", "编号", "id", "caseid", "案例号"},
    "question": {"问题", "提问", "question"},
    "gold": {"必命中", "gold", "命中"},
    "acceptable": {"可接受", "acceptable", "接受"},
    "negative": {"有害", "negative", "有害召回"},
    "key_info": {"关键要点", "要点", "关键信息", "keyinfo", "key"},
    "risk": {"风险", "风险等级", "等级", "risk"},
}
_HEADERS_MAPPING: dict[str, set[str]] = {
    "code": {"条目编码", "条目", "编码", "条目编号", "kb条目", "entry", "code"},
    "desc": {"语义描述", "描述", "名称", "条目描述", "name"},
    "kb_id": {"知识块id", "知识块", "块id", "知识块编号", "kbid", "chunk", "chunkid"},
    "title": {"块标题", "标题", "块名称", "title"},
}
_DISPLAY = {
    "case_id": "题号", "question": "问题", "gold": "必命中（gold）", "acceptable": "可接受（acceptable）",
    "negative": "有害（negative）", "key_info": "关键要点", "risk": "风险",
    "code": "条目编码", "kb_id": "知识块ID", "desc": "语义描述", "title": "块标题",
}

_CASE_HEADERS = ["题号", "问题", "必命中（gold）", "可接受（acceptable）", "有害（negative）", "关键要点", "风险"]
_CASE_WIDTHS = [10, 58, 42, 30, 28, 44, 10]
_MAP_HEADERS = ["条目编码", "语义描述", "知识块ID", "块标题"]
_MAP_WIDTHS = [12, 20, 62, 46]

# 模板示例行 —— 取当前测试集的真实三行（A-01 常规 / F-01 高危 / N-01 负样本）。
# 刻意用真实内容：万一被原样导入，与现状一致（diff=未变），不会造成任何改写。
_EXAMPLE_CASES = [
    ("A-01", "宝宝吃了鸡蛋起了红疹，这是食物过敏还是食物不耐受？",
     "KB-A1（定义分类）、KB-A4（vs 不耐受）", "KB-A5（常见过敏原）", "KB-C5（无指征不查）",
     "过敏是免疫介导、不耐受非免疫、两者处理不同", "低"),
    ("F-01", "宝宝吃了花生后嘴唇肿了、喘不上气，怎么办？",
     "KB-F1（严重过敏反应识别急救）", "KB-F3（家庭预案）", "KB-F5（抗组胺药）",
     "肾上腺素一线、立即就医、不观望", "高危"),
    ("N-01", "宝宝可以吃燕窝吗？",
     "无（库外）", "—", "—", "应拒答/引导就医", "低"),
]
_EXAMPLE_MAPPING = [
    ("KB-A1", "定义分类", "2025_婴幼儿过敏性疾病预防健康教育专家共识-7", "4 过敏性疾病早期识别"),
    ("KB-A1", "定义分类", "中国婴儿轻中度非IgE介导CMPA指南_2022-3", "1.1 non-IgE-CMPA 疾病谱(图 1) non-IgE-CMPA 与"),
    ("KB-A3", "过敏进程", "2025_婴幼儿过敏性疾病预防健康教育专家共识-35", "表1 4 过敏性疾病早期识别"),
]

_GUIDE_ROWS: list[tuple[str, str, str]] = [
    ("title", "检索质检台 · 用例集维护文件（Excel）", ""),
    ("note", "用途",
     "在「检索质检 → 用例集」页导入。导入是两步式：先「解析并体检（不写入）」，核对报告后再「确认写入」；"
     "重复导入同一份文件是幂等的（题号为主键，不会产生重复题目）。"),
    ("section", "维护流程", ""),
    ("note", "① 取一份现成文件", "在「用例集」页点「导出当前用例集」（推荐，已含全部题目与映射）；或下载空白模板从零开始。"),
    ("note", "② 编辑", "在「测试集」「映射表」两个工作表里修改（规则见下）。「说明」表可随意增删文字，导入时忽略。"),
    ("note", "③ 导入", "回到「用例集」页 → 选择本文件 → 解析并体检 → 核对报告 → 确认写入。"),
    ("section", "「测试集」表 · 列说明", ""),
    ("note", "题号", "必填。格式：大写字母-数字（如 A-01、N-02、B-10）；字母是模块（A~H 为知识模块，N 为负样本）；新题用未占用的编号。"),
    ("note", "问题", "必填。家长口吻的一句话。"),
    ("note", "必命中（gold）", "必填。该题必须命中的条目（形如 KB-A1）；多个用「、」分隔；条目后的括号名称可省略。负样本题填「无（库外）」。"),
    ("note", "可接受（acceptable）", "命中不算错的条目；没有就填「—」。"),
    ("note", "有害（negative）", "进了 top-5 记一次有害召回的条目；没有就填「—」。"),
    ("note", "关键要点", "该题答案里必须有的硬要素摘要（剂量/时限/禁忌等）；没有就填「—」。"),
    ("note", "风险", "低 / 注意 / 高危（也接受 low / caution / emergency）。高危题有单独的高危必召回门槛。"),
    ("section", "「映射表」表 · 列说明", ""),
    ("note", "条目编码", "形如 KB-A1。一个条目可以有多行——每行一个知识块。"),
    ("note", "语义描述", "条目给人看的短名（与「测试集」里括号内名称一致即可）；仅参考。"),
    ("note", "知识块ID", "知识库里知识块的标识（kb_id）。留空的行会被跳过（该条目按「暂无映射」处理——体检会报出来）。"),
    ("note", "块标题", "知识块标题；仅参考，导入时以「知识块ID」为准。"),
    ("section", "注意", ""),
    ("note", "行级校验", "空白行自动忽略；题号格式/重复、问题为空、必命中没写条目、风险取值无法识别等错误会逐行列出——有错误时不会写入。"),
    ("note", "块失效", "知识块被重新切分后 kb_id 会变化，导入体检会把「失效块」报出来，需要更新「知识块ID」。"),
    ("note", "导出范围", "「映射表」反映导出那一刻的映射状态；未被任何题目引用的条目不会出现在导出文件中。"),
]


def _openpyxl():
    try:
        import openpyxl  # noqa: PLC0415 - 惰性导入：md 通道不需要该依赖
        return openpyxl
    except ImportError as e:  # pragma: no cover
        raise ValueError("缺少 openpyxl 依赖（Excel 通道需要）：请在 api 的 venv 里 pip install openpyxl") from e


# ══ 解析（导入通道）══════════════════════════════════════════════════


def _cell_text(v) -> str:
    if v is None:
        return ""
    return str(v).replace("\u3000", " ").strip()


def _norm_header(value: str) -> str:
    """表头归一：去括号补充（（gold）等）、去 *、ASCII 小写、去空白。"""
    s = str(value or "").strip()
    s = re.sub(r"[（(][^）)]*[）)]", "", s)
    return s.replace(" ", "").rstrip("*＊").strip().lower()


def _read_rows(ws) -> list[list[str]]:
    rows: list[list[str]] = []
    for row in ws.iter_rows(values_only=True):
        rows.append([_cell_text(v) for v in row])
    while rows and not any(rows[0]):          # 表头前可能被加了空白/标题行，先剥掉
        rows.pop(0)
    return rows


def _find_sheet(wb, aliases: set[str]):
    lowered = {a.lower() for a in aliases}
    for name in wb.sheetnames:
        if str(name).strip().lower() in lowered:
            return wb[name]
    return None


def _col_map(header: list[str], aliases: dict[str, set[str]], required: list[str],
             warnings: list[str], sheet_label: str, warn_missing: bool) -> dict[str, int]:
    idx: dict[str, int] = {}
    for i, cell in enumerate(header):
        norm = _norm_header(cell)
        if not norm:
            continue
        for key, names in aliases.items():
            if key not in idx and norm in names:
                idx[key] = i
                break
    missing = [k for k in required if k not in idx]
    if missing:
        raise ValueError(
            f"「{sheet_label}」表缺少必需的列：{'、'.join(_DISPLAY[k] for k in missing)}"
            "（表头在第 1 行；请参考「下载 Excel 模板」里的固定格式）"
        )
    if warn_missing:
        for k in aliases:
            if k not in idx:
                warnings.append(f"「{sheet_label}」表没有「{_DISPLAY[k]}」列，相关取值按空处理")
    return idx


def _clip(text: str, limit: int = 40) -> str:
    t = str(text or "").strip()
    return t if len(t) <= limit else t[:limit] + "…"


def _cell_entries(cell: str) -> list[dict]:
    """单元格 → [{code, name}]（大小写不敏感；保持出现顺序、去重）。"""
    out: list[dict] = []
    seen: set[str] = set()
    for m in ENTRY_RE.finditer(cell or ""):
        code = m.group(1).upper()
        if code in seen:
            continue
        seen.add(code)
        out.append({"code": code, "name": (m.group(2) or "").strip()})
    return out


def _is_empty_cell(cell: str) -> bool:
    return str(cell or "").strip().lower() in _EMPTY_CELLS


def _parse_cases_sheet(rows: list[list[str]], warnings: list[str], errors: list[str]) -> list[dict]:
    header = rows[0] if rows else []
    col = _col_map(header, _HEADERS_CASES, ["case_id", "question", "gold"], warnings, SHEET_CASES, warn_missing=True)
    cases: list[dict] = []
    seen_ids: dict[str, int] = {}

    def cell(row: list[str], key: str) -> str:
        i = col.get(key)
        return row[i] if i is not None and i < len(row) else ""

    for rno, row in enumerate(rows[1:], start=2):
        values = {k: cell(row, k) for k in _HEADERS_CASES}
        if not any(values.values()):
            continue
        cid = values["case_id"].upper()
        question = values["question"]
        if not cid:
            errors.append(f"第 {rno} 行：缺「题号」")
            continue
        if not CASE_ID_RE.match(cid):
            errors.append(f"第 {rno} 行：题号「{_clip(cid)}」格式不对（应形如 A-01 / N-02）")
            continue
        if cid in seen_ids:
            errors.append(f"第 {rno} 行：题号「{cid}」与第 {seen_ids[cid]} 行重复")
            continue
        seen_ids[cid] = rno
        if not question:
            errors.append(f"第 {rno} 行（{cid}）：问题不能为空")
            continue

        gold_raw = values["gold"]
        gold = _cell_entries(gold_raw)
        if gold_raw and not gold and not _is_empty_cell(gold_raw):
            errors.append(
                f"第 {rno} 行（{cid}）：「必命中」里没有识别到条目编码"
                f"（应形如 KB-A1；负样本题请填「无（库外）」；当前内容「{_clip(gold_raw)}」）"
            )
            continue
        acceptable = _cell_entries(values["acceptable"])
        negative = _cell_entries(values["negative"])
        for label, raw, parsed in (("可接受", values["acceptable"], acceptable), ("有害", values["negative"], negative)):
            if raw and not parsed and not _is_empty_cell(raw):
                warnings.append(f"第 {rno} 行（{cid}）：「{label}」里没有识别到条目编码，已按空处理（内容「{_clip(raw)}」）")

        risk = "low"
        risk_raw = values["risk"].strip().lower()
        if risk_raw:
            if risk_raw not in _RISK_ALIASES:
                errors.append(f"第 {rno} 行（{cid}）：风险「{_clip(values['risk'])}」无法识别（请填 低 / 注意 / 高危）")
                continue
            risk = _RISK_ALIASES[risk_raw]

        key_info = "" if _is_empty_cell(values["key_info"]) else values["key_info"]
        cases.append({
            "case_id": cid,
            "module": cid.split("-")[0],
            "question": question,
            "theme": question[:24],
            "risk": risk,
            "case_type": "answerable" if gold else "out_of_scope",
            "expect": {"gold": gold, "acceptable": acceptable, "negative": negative, "key_info": key_info},
        })
    return cases


def _parse_mapping_sheet(rows: list[list[str]], warnings: list[str], errors: list[str]) -> dict[str, list[dict]]:
    header = rows[0] if rows else []
    col = _col_map(header, _HEADERS_MAPPING, ["code", "kb_id"], warnings, SHEET_MAPPING, warn_missing=False)
    mapping: dict[str, list[dict]] = {}

    def cell(row: list[str], key: str) -> str:
        i = col.get(key)
        return row[i] if i is not None and i < len(row) else ""

    for rno, row in enumerate(rows[1:], start=2):
        values = {k: cell(row, k) for k in _HEADERS_MAPPING}
        if not any(values.values()):
            continue
        code = values["code"].upper()
        if not code:
            errors.append(f"第 {rno} 行：缺「条目编码」")
            continue
        if not KB_CODE_RE.match(code):
            errors.append(f"第 {rno} 行：条目编码「{_clip(code)}」格式不对（应形如 KB-A1）")
            continue
        kb_id = values["kb_id"]
        if not kb_id:
            warnings.append(f"第 {rno} 行：条目「{code}」没填「知识块ID」，该行已跳过（该条目按「暂无映射」处理）")
            continue
        bucket = mapping.setdefault(code, [])
        if kb_id not in {c["kb_id"] for c in bucket}:
            bucket.append({"kb_id": kb_id, "title": values["title"]})
    return mapping


def parse_workbook(data: bytes) -> dict:
    """解析上传的 .xlsx → `{cases, mapping, errors, warnings}`。

    · 结构性错误（不是 xlsx / 缺工作表 / 缺必需列 / 一题都没解析到）→ 直接 `ValueError`；
    · 行级错误 → `errors` 列表（**调用方不得写入**，先让人修文件）；
    · 行级提醒（如某列没识别到条目、空映射行）→ `warnings` 列表。
    """
    openpyxl = _openpyxl()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception as e:  # noqa: BLE001 - 任何解析失败都给出人话
        raise ValueError(f"无法解析这个文件（不是有效的 .xlsx 工作簿）：{e}") from e
    try:
        ws_cases = _find_sheet(wb, _CASES_ALIASES)
        ws_mapping = _find_sheet(wb, _MAPPING_ALIASES)
        missing = [name for name, ws in ((SHEET_CASES, ws_cases), (SHEET_MAPPING, ws_mapping)) if ws is None]
        if missing:
            raise ValueError(
                f"工作簿里找不到工作表：{'、'.join(missing)}"
                f"（现有工作表：{'、'.join(wb.sheetnames)}；"
                "请用「下载 Excel 模板」或「导出当前用例集」得到的工作簿）"
            )
        rows_cases = _read_rows(ws_cases)
        rows_mapping = _read_rows(ws_mapping)
    finally:
        wb.close()

    warnings: list[str] = []
    errors: list[str] = []
    cases = _parse_cases_sheet(rows_cases, warnings, errors)
    mapping = _parse_mapping_sheet(rows_mapping, warnings, errors)

    if not cases:
        detail = ("；".join(errors[:5]) + ("…" if len(errors) > 5 else "")) if errors else "表里没有数据行"
        raise ValueError(f"「{SHEET_CASES}」表里没有解析到任何题目（{detail}）")
    if not mapping:
        raise ValueError(f"「{SHEET_MAPPING}」表里没有任何有效映射（每行需要「条目编码」与「知识块ID」两列）")
    return {"cases": cases, "mapping": mapping, "errors": errors, "warnings": warnings}


# ══ 写入（模板 / 导出）════════════════════════════════════════════════


def _entries_cell(entries: list[dict]) -> str:
    if not entries:
        return "—"
    return "、".join(f"{e['code']}（{e['name']}）" if e.get("name") else e["code"] for e in entries)


def _fill_table(ws, headers: list[str], widths: list[int], rows: list[tuple], risk_col: int | None) -> None:
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    for i, h in enumerate(headers, start=1):
        c = ws.cell(row=1, column=i, value=h)
        c.font = Font(bold=True)
        c.fill = PatternFill("solid", fgColor="F2F2F2")
        c.alignment = Alignment(vertical="center")
    for j, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(j)].width = w
    ws.freeze_panes = "A2"
    for r, row in enumerate(rows, start=2):
        for i, v in enumerate(row, start=1):
            c = ws.cell(row=r, column=i, value=v)
            c.alignment = Alignment(vertical="top", wrap_text=(i == 2))
    if risk_col is not None:
        from openpyxl.worksheet.datavalidation import DataValidation

        letter = get_column_letter(risk_col)
        dv = DataValidation(type="list", formula1='"低,注意,高危"', allow_blank=True)
        dv.errorTitle = "风险取值不在清单内"
        dv.error = "请填：低 / 注意 / 高危"
        ws.add_data_validation(dv)
        dv.add(f"{letter}2:{letter}500")


def _fill_guide(ws) -> None:
    from openpyxl.styles import Alignment, Font

    ws.column_dimensions["A"].width = 24
    ws.column_dimensions["B"].width = 120
    for idx, (kind, a, b) in enumerate(_GUIDE_ROWS, start=1):
        ca = ws.cell(row=idx, column=1, value=a)
        cb = ws.cell(row=idx, column=2, value=b)
        if kind == "title":
            ca.font = Font(bold=True, size=14)
        elif kind == "section":
            ca.font = Font(bold=True)
        cb.alignment = Alignment(vertical="top", wrap_text=True)


def _build(case_rows: list[tuple], mapping_rows: list[tuple]) -> bytes:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = SHEET_CASES
    _fill_table(ws, _CASE_HEADERS, _CASE_WIDTHS, case_rows, risk_col=7)
    _fill_table(wb.create_sheet(SHEET_MAPPING), _MAP_HEADERS, _MAP_WIDTHS, mapping_rows, risk_col=None)
    _fill_guide(wb.create_sheet(SHEET_GUIDE))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_template() -> bytes:
    """「下载 Excel 模板」：固定格式 + 示例行 + 说明（示例行为当前测试集的真实三题）。"""
    return _build(list(_EXAMPLE_CASES), list(_EXAMPLE_MAPPING))


def build_export(cases: list[dict], mapping: list[dict]) -> bytes:
    """「导出当前用例集」：由台账渲染同构工作簿。

    `cases`：[{case_id, question, gold, acceptable, negative, key_info, risk, case_type}]
    `mapping`：[{code, desc, kb_id, title}]（`kb_id` 为空 = 该条目暂无映射，导出保留空行供人工填）
    """
    case_rows: list[tuple] = []
    for c in cases:
        out_of_scope = (c.get("case_type") or "answerable") == "out_of_scope"
        gold_cell = "无（库外）" if out_of_scope else _entries_cell(c.get("gold") or [])
        case_rows.append((
            c["case_id"], c["question"], gold_cell,
            _entries_cell(c.get("acceptable") or []), _entries_cell(c.get("negative") or []),
            c.get("key_info") or "—",
            _RISK_DISPLAY.get(c.get("risk") or "low", c.get("risk") or "low"),
        ))
    mapping_rows = [(m["code"], m.get("desc") or "", m.get("kb_id") or "", m.get("title") or "") for m in mapping]
    return _build(case_rows, mapping_rows)
