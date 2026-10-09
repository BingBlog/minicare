"""语料档案与来源映射（US-01 登记判重 / US-02 台账与合规）

**替代 `config.metadata_cfg.doc_mapping` 那张硬编码 20 条映射表**（技术债 T6）：
来源信息从此是**数据**而不是代码，新增语料不需要改 Python。

两处设计要点：
  1. 判重按**内容 sha256**（doc_id 即哈希）→ 同文件天然幂等
  2. 预填走两级瀑布：**文件名规则 → 正文抽取**，抽不到的字段留空并在台账标 ⚠
     （PRD D-08：年份 / 地区 / 证据级别为必填，其余可空）
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

from ..fsutil import ensure_dir

# 证据级别关键词 → 级别（正文抽取兜底用）
EVIDENCE_KEYWORDS: list[tuple[str, str]] = [
    ("指南", "guideline"), ("共识", "consensus"), ("专家建议", "consensus"),
    ("系统评价", "RCT"), ("随机对照", "RCT"), ("RCT", "RCT"),
    ("规范", "policy"), ("通知", "policy"), ("管理办法", "policy"),
    ("科普", "edu"), ("健康教育", "edu"),
]

REGION_BY_DIR = {"国内": "cn", "国际": "intl", "cn": "cn", "intl": "intl"}

# 台账必填字段（PRD D-08）
REQUIRED_FIELDS = ("year", "region", "evidence_level")

_NAME_NOISE = re.compile(r"[（(](用户提供|试行|摘要版|完整版|第\d+版)[）)]|[_\s]+")


def _today() -> str:
    """本地时区的今天（避免 naive date）"""
    from datetime import datetime

    return datetime.now().astimezone().date().isoformat()


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    """流式计算文件内容哈希（判重依据；大文件也不爆内存）"""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            block = f.read(chunk)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def clean_name(stem: str) -> str:
    """文件名 → 可读来源名（去噪声标记、下划线转空格、压空白）"""
    s = _NAME_NOISE.sub(" ", stem)
    return re.sub(r"\s{2,}", " ", s).strip(" _-")


def guess_year(text: str) -> int | None:
    """从文本抽年份：优先 20xx 年，其次括号里的 4 位数"""
    for m in re.finditer(r"(20\d{2})\s*年?", text or ""):
        y = int(m.group(1))
        if 1990 <= y <= int(_today()[:4]) + 1:
            return y
    m = re.search(r"[（(]?(20\d{2})[）)]?", text or "")
    return int(m.group(1)) if m else None


def guess_evidence(text: str) -> str | None:
    for kw, level in EVIDENCE_KEYWORDS:
        if kw in (text or ""):
            return level
    return None


def guess_publisher(text: str) -> str | None:
    """从正文首屏抽发布机构（学会/委员会/卫健委/医院/大学/协会…）"""
    head = (text or "")[:1500]
    m = re.search(
        r"([\u4e00-\u9fff]{2,20}(?:委员会|学会|协会|医学会|卫健委|卫生健康委员会"
        r"|中心|研究院|研究所|大学|医院|联合|组织|部|局|署))",
        head,
    )
    return m.group(1) if m else None


def prefill(
    *,
    filename: str,
    region: str,
    doc_id: str | None = None,
    body_text: str = "",
) -> dict:
    """两级瀑布预填：文件名规则 → 正文抽取

    返回台账字段 + `field_source`（每字段的来源与判定依据），供界面标注置信度。
    文件名的**优先级更高**（人工命名通常更规范），正文只补文件名给不出的字段。
    """
    stem = Path(filename).stem
    name_guess = clean_name(stem)
    src: dict[str, dict] = {}

    def put(field: str, value, origin: str, evidence: str = "") -> None:
        if value in (None, "", 0):
            return
        if fields.get(field) in (None, "", 0):
            fields[field] = value
            src[field] = {"origin": origin, "evidence": evidence or str(value)}

    fields: dict = {
        "doc_id": doc_id,
        "filename": filename,
        "region": region,
        "source_name": None,
        "publisher": None,
        "year": None,
        "evidence_level": None,
        "applicable_age": None,
        "license": None,
        "source_url": None,
        "obtained_at": _today(),
    }

    # ── 一级：文件名规则 ──
    put("source_name", name_guess, "filename_rule", stem)
    put("year", guess_year(stem), "filename_rule", stem)
    put("evidence_level", guess_evidence(stem), "filename_rule", stem)
    m = re.search(r"(\d{1,2}\s*[-~至]\s*\d{1,2}|\d{1,2})\s*月龄", stem)
    if m:
        put("applicable_age", f"{m.group(1)} 月龄", "filename_rule", stem)

    # ── 二级：正文抽取 ──
    if body_text:
        head = body_text[:4000]
        put("publisher", guess_publisher(head), "body_extract", head[:80])
        put("year", guess_year(head), "body_extract", head[:80])
        put("evidence_level", guess_evidence(head), "body_extract", head[:80])
        m = re.search(r"(\d{1,2})\s*[-~至]\s*(\d{1,2})\s*(?:岁|月龄)", head)
        if m:
            put("applicable_age", f"{m.group(1)}-{m.group(2)} 岁", "body_extract", m.group(0))

    fields["field_source"] = src
    fields["missing_required"] = [f for f in REQUIRED_FIELDS if not fields.get(f)]
    return fields


class CorpusLedger:
    """语料档案的读写（落本机 SQLite；US-02 的"台账一致性"以本机库为准，
    与远程库的切片数对账由界面在读取时做）"""

    def __init__(self, db) -> None:
        self.db = db

    # ── 登记与判重 ──
    def get(self, doc_id: str) -> dict | None:
        return self.db.query_one("SELECT * FROM kb_corpus WHERE doc_id=?", (doc_id,))

    def find_by_hash(self, doc_id: str) -> dict | None:
        return self.get(doc_id)

    def list(self, status: str | None = None) -> list[dict]:
        if status:
            return self.db.query("SELECT * FROM kb_corpus WHERE status=? ORDER BY year DESC, doc_id", (status,))
        return self.db.query("SELECT * FROM kb_corpus ORDER BY year DESC, doc_id")

    def suggest_duplicate(self, source_name: str, exclude_doc_id: str = "") -> dict | None:
        """疑似同源：来源名高度相似但内容哈希不同（US-02 场景 3）"""
        target = re.sub(r"\W+", "", source_name or "")
        if len(target) < 6:
            return None
        for row in self.list():
            if row["doc_id"] == exclude_doc_id:
                continue
            other = re.sub(r"\W+", "", row["source_name"] or "")
            if other and (target in other or other in target):
                return row
        return None

    def register(self, fields: dict, *, status: str = "pending", note: str = "") -> dict:
        """登记（幂等：同 doc_id 走 upsert）"""
        doc_id = fields.get("doc_id")
        if not doc_id:
            raise ValueError("登记必须提供 doc_id（内容 sha256）")
        now = _now()
        prev = self.get(doc_id)
        version = (prev["version"] if prev else 1)
        self.db.upsert(
            "kb_corpus",
            ["doc_id"],
            {
                "doc_id": doc_id,
                "filename": fields.get("filename") or "",
                "size_bytes": int(fields.get("size_bytes") or 0),
                "kind": fields.get("kind") or "pdf",
                "region": fields.get("region") or "cn",
                "source_name": fields.get("source_name") or doc_id[:12],
                "publisher": fields.get("publisher"),
                "year": fields.get("year"),
                "evidence_level": fields.get("evidence_level"),
                "applicable_age": fields.get("applicable_age"),
                "license": fields.get("license"),
                "source_url": fields.get("source_url"),
                "obtained_at": fields.get("obtained_at"),
                "version": version,
                "supersedes": fields.get("supersedes"),
                "superseded_by": fields.get("superseded_by"),
                "kb_domain": fields.get("kb_domain") or "default",
                "status": status,
                "field_source": _dump(fields.get("field_source")),
                "note": note or fields.get("note"),
                "created_at": prev["created_at"] if prev else now,
                "updated_at": now,
            },
        )
        return self.get(doc_id)

    def update(self, doc_id: str, **fields) -> dict | None:
        allowed = {
            "source_name", "publisher", "year", "region", "evidence_level", "applicable_age",
            "license", "source_url", "status", "note", "version", "supersedes", "superseded_by",
        }
        patch = {k: v for k, v in fields.items() if k in allowed}
        if not patch:
            return self.get(doc_id)
        patch["updated_at"] = _now()
        cols = ", ".join(f"{k}=?" for k in patch)
        self.db.execute(f"UPDATE kb_corpus SET {cols} WHERE doc_id=?", (*patch.values(), doc_id))
        return self.get(doc_id)

    def set_status(self, doc_id: str, status: str) -> None:
        self.update(doc_id, status=status)

    def make_new_version(self, doc_id: str, new_doc_id: str) -> dict:
        """覆盖为新版本：旧版归档 + 建立取代关系（US-01 判重窗的"覆盖为新版本"）"""
        old = self.get(doc_id)
        if old:
            self.update(doc_id, status="archived", superseded_by=new_doc_id)
        return self.update(new_doc_id, version=((old["version"] if old else 1) + 1),
                           supersedes=doc_id, status="pending") or {}

    def missing_required(self) -> list[dict]:
        """来源不全的语料（US-02 的"仅看缺项"）——必填缺失则不可发布"""
        rows = self.list()
        out = []
        for r in rows:
            miss = [f for f in REQUIRED_FIELDS if not r.get(f)]
            if miss or not r.get("license"):
                out.append({**r, "missing": miss,
                            "license_missing": not r.get("license")})
        return out

    def completeness(self) -> dict:
        rows = self.list()
        total = len(rows)
        miss = self.missing_required()
        return {
            "total": total,
            "missing_required": len([m for m in miss if m["missing"]]),
            "license_missing": len([m for m in miss if m["license_missing"]]),
        }

    def export_markdown(self) -> str:
        """导出台账（Markdown，供人工留档/进 git）"""
        cols = ["doc_id", "source_name", "publisher", "year", "region", "evidence_level",
                "applicable_age", "license", "version", "status"]
        head = "| " + " | ".join(cols) + " |\n|" + "---|" * len(cols) + "\n"
        body = "\n".join(
            "| " + " | ".join(str(r.get(c) or "—") for c in cols) + " |" for r in self.list()
        )
        return f"# 语料台账导出\n\n> 生成：{_now()}\n\n{head}{body}\n"


def _dump(obj) -> str | None:
    import json

    return json.dumps(obj, ensure_ascii=False) if obj is not None else None


def _now() -> str:
    from datetime import datetime

    return datetime.now().astimezone().isoformat(timespec="seconds")


def ensure_corpus_dirs(data_root: Path, doc_id: str) -> Path:
    return ensure_dir(Path(data_root) / "corpus" / doc_id)
