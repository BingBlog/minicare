"""质量治理：噪声块识别与人工恢复决定（US-07 / PRD §7.5 / TECH-015 §8.6）

**默认屏蔽 + 可恢复 + 人工优先于规则**：
  · 命中规则的块标记为「不参与检索」（`retrieval_status=excluded`），但内容完整保留
  · 人工恢复过的块，**后续重切不会再被规则屏蔽**（决定落 `edits/excludes.json`）
  · 人工也可以主动屏蔽规则未命中的块

本模块是**纯函数**：输入 Chunk 列表 + 配置 + 人工决定，输出判定表；不做任何 IO。
IO（读写 `edits/excludes.json`）在 `overrides_*` 两个函数里，由调用方显式传入路径。
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from ..config import NoiseConfig
from ..fsutil import ensure_dir
from ..models import Chunk

OVERRIDES_FILE = "excludes.json"

# 页码残留模式：·12· / 第 12 页 / 裸数字行
PAGE_NUMBER_RE = re.compile(r"^(·\s*\d{1,4}\s*·|第\s*\d{1,4}\s*页|\d{1,4})$")
_TAG_RE = re.compile(r"<[^>]+>")


@dataclass
class NoiseVerdict:
    """单块判定结果"""

    excluded: bool = False
    rule: str = ""
    reason: str = ""
    by: str = ""          # rule / manual_restore / manual_exclude


def _strip_tags(html: str) -> str:
    return _TAG_RE.sub("", html or "")


def _norm(text: str) -> str:
    return re.sub(r"\s+", "", text or "")


def is_rule_excluded(
    chunk: Chunk, cfg: NoiseConfig, position_ratio: float, repeat_count: int
) -> NoiseVerdict:
    """按四类规则判定单块（PRD §7.5 的唯一实现）

    Args:
        position_ratio: 该块在**文档中的相对位置**（0=开头，1=结尾）。
            ⚠️ 必须由页码推导，不能用块列表序号：`chunk_document` 会按 `header_path`
            排序，而「参考文献」的汉字编码小于「第N节」，排序后会跑到**最前面** ——
            用序号判断"位于文档后部"会永远失效（这是本规则最早版本的隐藏缺陷）。
        repeat_count: 该块规范化文本在**不同页码**上出现的次数（判定页眉页脚残留）
    """
    title = (chunk.title or "").strip()
    header_last = (chunk.header_path or "").split("/")[-1].strip()

    # 规则 1 · 参考文献 / 引用列表 —— 标题匹配 且 位于文档后 reference_tail_ratio
    try:
        pat = re.compile(cfg.reference_title_pattern, re.IGNORECASE)
    except re.error:
        pat = re.compile(r"^(参考文献|引用文献|References?|Bibliography)$", re.IGNORECASE)
    in_tail = position_ratio >= (1 - cfg.reference_tail_ratio)
    if in_tail and (pat.match(title) or pat.match(header_last)):
        return NoiseVerdict(
            True, "reference_list",
            f"标题「{title or header_last}」且位于文档后 {int((1 - position_ratio) * 100)}% 处",
            "rule",
        )

    # 规则 2 · 空表
    # **主判据是"有没有数据行"，不是字符数**：PRD §7.5 原定"去标签后 < 20 字"经实测会
    # 误杀短而有效的表格（例：`起病时间/2~72h + 持续时间/数小时至数天` 仅 19 字），
    # 因此改为 `行数 ≤ 1`（只有表头或完全无行）为主、字符数为辅（防 HTML 残渣），
    # 阈值也从 20 下调到 8（见 config/pipeline.yaml 的注释与 PRD §7.5 修订）。
    if chunk.chunk_type == "table":
        lowered = (chunk.content or "").lower()
        rows = lowered.count("<tr")
        stripped_len = len(_norm(_strip_tags(chunk.content)))
        if rows <= 1 or stripped_len < cfg.empty_table_min_chars:
            return NoiseVerdict(
                True, "empty_table",
                f"表格仅 {rows} 行且去标签后 {stripped_len} 字", "rule",
            )

    # 规则 3 · 页眉页脚残留 —— 短文本 + 页码模式 + 跨页重复（三条件同时命中）
    text = _norm(chunk.content)
    looks_like_page_number = PAGE_NUMBER_RE.match(text) or any(
        PAGE_NUMBER_RE.match(_norm(ln)) for ln in (chunk.content or "").splitlines() if ln.strip()
    )
    if len(text) < cfg.page_furniture_max_chars and repeat_count >= 2 and looks_like_page_number:
        return NoiseVerdict(
            True, "page_furniture",
            f"短文本见于 {repeat_count} 个不同页面且形如页码", "rule",
        )

    # 规则 4 · 纯图无题注
    if chunk.chunk_type == "image":
        # 题注判定：标题里带「图N」或内容含题注文本
        has_caption = bool(re.search(r"图\s*\d+", title)) or bool(re.search(r"图\s*\d+", chunk.content or ""))
        if not has_caption:
            return NoiseVerdict(True, "figure_no_caption", "图片块且无题注文本", "rule")

    return NoiseVerdict(False)


def document_position_ratios(chunks: list[Chunk]) -> dict[str, float]:
    """推导每块的文档相对位置（0=开头，1=结尾）

    **优先用页码**：`page_idx / max_page`。页码是文档物理顺序的可信代理。
    **退化到序号**：仅当没有任何块有页码时，用 `i / (n-1)`（注意此时受排序影响，
    位置判断可能不准 —— 保守起见宁可漏判也不误判）。
    """
    total = len(chunks)
    pages = [c.page_idx for c in chunks if c.page_idx is not None]
    max_page = max(pages) if pages else 0
    out: dict[str, float] = {}
    for i, c in enumerate(chunks):
        if max_page > 0 and c.page_idx is not None:
            out[c.kb_id] = min(1.0, max(0.0, c.page_idx / max_page))
        elif total > 1:
            out[c.kb_id] = i / (total - 1)
        else:
            out[c.kb_id] = 0.0
    return out


def detect(chunks: list[Chunk], cfg: NoiseConfig) -> dict[str, NoiseVerdict]:
    """对整篇文档的所有块做规则判定，返回 {kb_id: NoiseVerdict}"""
    # 跨页重复计数：规范化文本 → 出现的不同 page_idx 集合
    pages_by_text: dict[str, set] = {}
    for c in chunks:
        key = _norm(c.content)[:60]
        if not key:
            continue
        pages_by_text.setdefault(key, set()).add(c.page_idx)

    ratios = document_position_ratios(chunks)
    verdicts: dict[str, NoiseVerdict] = {}
    for c in chunks:
        repeat = len(pages_by_text.get(_norm(c.content)[:60], set()))
        verdicts[c.kb_id] = is_rule_excluded(c, cfg, ratios.get(c.kb_id, 0.0), repeat)
    return verdicts


# ── 人工决定（跨 run 存续）──────────────────────────────────────────────


def empty_overrides() -> dict:
    return {"restore": [], "exclude": []}


def load_overrides(edits_root: Path) -> dict:
    """读取人工决定；文件缺失/损坏时返回空表（不阻塞流程）"""
    path = Path(edits_root) / OVERRIDES_FILE
    if not path.exists():
        return empty_overrides()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return empty_overrides()
    return {
        "restore": list(data.get("restore") or []),
        "exclude": list(data.get("exclude") or []),
    }


def save_overrides(edits_root: Path, overrides: dict) -> Path:
    root = ensure_dir(edits_root)
    path = root / OVERRIDES_FILE
    payload = {
        "restore": sorted(set(overrides.get("restore") or [])),
        "exclude": sorted(set(overrides.get("exclude") or [])),
        "updated_at": _now(),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def overrides_hash(overrides: dict) -> str:
    """人工决定的指纹 —— 必须进 segment 的 cache_key，否则恢复后重跑会命中旧缓存。"""
    from ..artifact import sha256_text

    material = json.dumps(
        {"restore": sorted(set(overrides.get("restore") or [])),
         "exclude": sorted(set(overrides.get("exclude") or []))},
        ensure_ascii=False, sort_keys=True,
    )
    return sha256_text(material)[:16]


def apply_overrides(verdicts: dict[str, NoiseVerdict], overrides: dict) -> dict[str, NoiseVerdict]:
    """应用人工决定：**人工优先于规则**（PRD D-15）

    · restore：规则判屏蔽 → 改为不屏蔽（留痕 by=manual_restore）
    · exclude：无论规则如何 → 屏蔽（留痕 by=manual_exclude）
    两者冲突时 exclude 优先（更保守）。
    """
    restore = set(overrides.get("restore") or [])
    exclude = set(overrides.get("exclude") or [])
    out: dict[str, NoiseVerdict] = {}
    for kb_id, v in verdicts.items():
        if kb_id in exclude:
            out[kb_id] = NoiseVerdict(True, "manual", "人工屏蔽", "manual_exclude")
        elif kb_id in restore:
            out[kb_id] = NoiseVerdict(False, "", "人工已恢复检索", "manual_restore")
        else:
            out[kb_id] = v
    return out


def _now() -> str:
    from datetime import datetime

    return datetime.now().astimezone().isoformat(timespec="seconds")
