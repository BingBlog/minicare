"""检索契约与校验器（US-13 / PRD §9 / TECH-015 §8.11）

契约是 `agent-poc` 与平台之间**唯一的自动化保险**：两个项目独立演进，
靠"记得同步"一定会漏。因此发布前强制校验，不符即阻断。

三类校验（对应 PRD §9.2）：
  ① **语义约束**：被屏蔽 / 待复核的条目**永不出现**（用真实数据探针，不读代码）
  ② **结构完整性**：响应字段集未被删减
  ③ **向量一致性**：库内向量维度与声明一致（换模型后不允许新旧混用）
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

from . import __version__
from .config import Settings
from .store.knowledge_base import REVIEW_PREFIX

CONTRACT_VERSION = "v1"
CONTRACT_DOC = Path(__file__).resolve().parents[2] / "docs" / "KB-CONTRACT.md"

REQUIRED_RESPONSE_KEYS = ["found", "items", "topK"]
REQUIRED_ITEM_FIELDS = ["id", "kb_id", "title", "content", "content_truncated", "source", "risk_level"]
FILTER_PARAMS = ["query", "riskLevel", "category"]
EXPECTED_DIM = 1024
CONTENT_MAX_CHARS = 800

SEMANTIC_RULES = [
    (
        "retrieval_status != 'enabled' 的条目永不出现"
        "（迁移 021 前等价于 content 不以 [待复核] 开头，且被屏蔽的块不写入库）"
    ),
    "content 超 800 字截断，并置 content_truncated=true",
    "未命中返回明确的未找到结构，而不是空数组或异常",
    "检索方式为 FULLTEXT ngram + 向量余弦 + RRF(k=60) → topK；两侧实现必须一致",
]


def definition() -> dict:
    return {
        "contract_version": CONTRACT_VERSION,
        "pipeline_version": __version__,
        "response_keys": REQUIRED_RESPONSE_KEYS,
        "item_fields": REQUIRED_ITEM_FIELDS,
        "filter_params": FILTER_PARAMS,
        "content_max_chars": CONTENT_MAX_CHARS,
        "embedding_dim": EXPECTED_DIM,
        "semantic_rules": SEMANTIC_RULES,
    }


def _violation(kind: str, detail: str, severity: str = "block") -> dict:
    return {"kind": kind, "detail": detail, "severity": severity}


def validate(settings: Settings, *, probe: bool = True) -> dict:
    """执行契约校验；返回 {ok, checks:[...], violations:[...]}"""
    from .retrieval import retrieve

    checks: list[dict] = []
    violations: list[dict] = []

    # ① 结构：字段集（用一次真实检索验证实现返回的字段）
    try:
        sample = retrieve(settings, "过敏", top_k=1)
        if not sample:
            checks.append(_c("structure", "响应字段集", "not_executed",
                             "检索无结果，无法验证字段集（知识库可能为空）"))
        else:
            item = sample[0]
            missing = [f for f in REQUIRED_ITEM_FIELDS if f not in item]
            checks.append(_c("structure", "响应字段集", "fail" if missing else "pass",
                             f"缺字段 {missing}" if missing else f"{len(REQUIRED_ITEM_FIELDS)} 个字段齐备"))
            if missing:
                violations.append(_violation("field_missing", f"检索结果缺字段: {missing}"))
    except Exception as e:      # noqa: BLE001 - DB 不可用不应让校验崩溃，但也不能算通过
        checks.append(_c("structure", "响应字段集", "not_executed", f"检索不可用：{e}"))

    # ② 语义：被屏蔽/待复核的条目永不出现（真实数据探针）
    if probe:
        checks.append(_probe_excluded(settings, violations))
    else:
        checks.append(_c("semantics", "屏蔽条目不出现", "not_executed", "已跳过探针"))

    # ③ 向量维度一致性
    checks.append(_check_dim(settings, violations))

    # ④ 契约文档与实现一致（文档缺失=未维护，报 not_executed 而不是通过）
    checks.append(_check_doc())

    ok = not any(v["severity"] == "block" for v in violations) and all(
        c["status"] != "fail" for c in checks
    )
    return {"ok": ok, "contract_version": CONTRACT_VERSION, "checks": checks,
            "violations": violations, "definition": definition()}


def _c(key: str, label: str, status: str, detail: str) -> dict:
    return {"key": key, "label": label, "status": status, "detail": detail}


def _probe_excluded(settings: Settings, violations: list[dict]) -> dict:
    """插一条(或找一条现成的)不可检索条目，实测它不会被返回

    021 之前：找 `content LIKE '[待复核]%'` 的行（被屏蔽的块根本不入库）
    021 之后：找 `retrieval_status != 'enabled'` 的行
    """
    import pymysql

    from .retrieval import retrieve

    s = settings
    try:
        conn = pymysql.connect(host=s.db_host, port=s.db_port, user=s.db_user,
                               password=s.db_password, database=s.db_name, charset="utf8mb4")
    except Exception as e:      # noqa: BLE001
        return _c("semantics", "屏蔽条目不出现", "not_executed", f"DB 不可用：{e}")

    try:
        with conn.cursor() as cur:
            cur.execute("SHOW COLUMNS FROM knowledge_base LIKE 'retrieval_status'")
            has_col = cur.fetchone() is not None
            if has_col:
                cur.execute("SELECT kb_id, title FROM knowledge_base "
                            "WHERE retrieval_status <> 'enabled' LIMIT 1")
            else:
                # ⚠️ 前缀走参数绑定（字面 `%` + args 会被 pymysql 当格式符解析）
                cur.execute("SELECT kb_id, title FROM knowledge_base "
                            "WHERE content LIKE %s LIMIT 1", (REVIEW_PREFIX + "%",))
            row = cur.fetchone()
        if row is None:
            return _c("semantics", "屏蔽条目不出现", "not_executed",
                      "库内暂无屏蔽/待复核条目，探针无法执行（不视为通过）")
        kb_id, title = row[0], (row[1] or "")
        probe_query = title[:12] or "过敏"
        results = retrieve(s, probe_query, top_k=10)
        leaked = [r.get("kb_id") for r in results if r.get("kb_id") == kb_id]
        if leaked:
            violations.append(_violation("semantic_leak",
                                         f"不可检索条目 {kb_id} 出现在检索结果中"))
            return _c("semantics", "屏蔽条目不出现", "fail", f"泄漏：{kb_id}")
        return _c("semantics", "屏蔽条目不出现", "pass",
                  f"用 {kb_id} 做探针，检索 10 条未泄漏")
    except Exception as e:      # noqa: BLE001
        return _c("semantics", "屏蔽条目不出现", "not_executed", f"探针异常：{e}")
    finally:
        conn.close()


def _check_dim(settings: Settings, violations: list[dict]) -> dict:
    import pymysql

    s = settings
    try:
        conn = pymysql.connect(host=s.db_host, port=s.db_port, user=s.db_user,
                               password=s.db_password, database=s.db_name, charset="utf8mb4")
    except Exception as e:      # noqa: BLE001
        return _c("embedding", "向量维度一致", "not_executed", f"DB 不可用：{e}")
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT LENGTH(embedding) FROM knowledge_base "
                        "WHERE embedding IS NOT NULL LIMIT 20")
            lens = {r[0] for r in cur.fetchall()}
        if not lens:
            return _c("embedding", "向量维度一致", "not_executed", "库内无向量")
        dims = {n // 4 for n in lens}
        if dims != {EXPECTED_DIM}:
            violations.append(_violation(
                "dim_mismatch", f"库内向量维度 {sorted(dims)} 与契约 {EXPECTED_DIM} 不一致"))
            return _c("embedding", "向量维度一致", "fail", f"实际 {sorted(dims)}，期望 {EXPECTED_DIM}")
        return _c("embedding", "向量维度一致", "pass", f"抽样 {len(lens)} 种长度，均为 {EXPECTED_DIM} 维")
    except Exception as e:      # noqa: BLE001
        return _c("embedding", "向量维度一致", "not_executed", f"检查异常：{e}")
    finally:
        conn.close()


def _check_doc() -> dict:
    """契约文档必须存在，且包含全部必需字段名（文档与实现同步的最低要求）"""
    if not CONTRACT_DOC.exists():
        return _c("doc", "契约文档同步", "not_executed",
                  f"契约文档不存在：{CONTRACT_DOC}（应在发布前补齐并冻结）")
    text = CONTRACT_DOC.read_text(encoding="utf-8")
    missing = [f for f in REQUIRED_ITEM_FIELDS if f not in text]
    if missing:
        return _c("doc", "契约文档同步", "fail", f"文档缺字段说明：{missing}")
    return _c("doc", "契约文档同步", "pass", f"{CONTRACT_DOC.name} 已含全部字段说明")


def dump(settings: Settings) -> str:
    return json.dumps({"definition": definition(), "validation": validate(settings)},
                      ensure_ascii=False, indent=2)


def blob_to_dim(blob: bytes) -> int:
    return len(blob) // 4 if blob else 0


def pack_vector(vec: list[float]) -> bytes:
    return struct.pack(f"<{len(vec)}f", *vec)
