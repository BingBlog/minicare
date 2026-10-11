"""失败样本归因（TECH-026 §3）：分类器 + 常量。

三处共用同一实现（单一事实源）：
  1. `runner` 入库时对失败样本自动分类（`classify_case`）；
  2. `ledger.compute_report` 对 `attribution IS NULL` 的行**读取时实时推导**（旧轮兼容）；
  3. 路由「恢复自动结果」——清空列后同样走实时推导，无需额外入口。

分类输入全部来自既有列（pass / stage / detail / judge），不依赖新采集：
  · `judge` 明细中出现 `{error}` → 裁判执行失败（harness 逐裁判 try/catch 的新格式，TECH-026 T-07）
  · `stage=error`（执行未产出）→ 按错误特征分流 env / data，未命中 → exec
  · `stage=deterministic/judge`（进入过评审）→ skill（被测缺陷）
"""
from __future__ import annotations

# ── 归因分类常量（展示名在前端 `agentEval.ts` 的 ATTRIBUTION_LABEL 对齐）──────

CLASSES: tuple[str, ...] = ("env", "data", "exec", "judge", "skill")

LABELS: dict[str, str] = {
    "env": "环境阻断",
    "data": "测试数据问题",
    "exec": "机评执行失败",
    "judge": "裁判执行失败",
    "skill": "被测缺陷",
}

# ── 自动分类关键词（宽口径 v1，人工改判兜底；TECH-026 §3.1 表）───────────────
#
# 匹配对象 = `detail + error` 的小写拼接串。宁可多归一类（人工可改），不漏识别环境噪声。
# ⚠️ 「超时」为宽口径：Agent 死循环也会超时 → 误归 env 时由人工改判为被测缺陷。

ENV_PATTERNS: tuple[str, ...] = (
    "api_key 未配置", "api key 未配置", "未配置 deepseek", "deepseek_api_key",
    "数据库", "db 未配置", "连接失败", "连接超时",
    "econnrefused", "enotfound", "eai_again", "socket hang up", "fetch failed",
    "network", "timed out", "timeout", "超时",
    "embedding", "tokenhub", "配额", "quota", "429", "502", "503", "bad gateway",
    "图片附件构建失败",
)

DATA_PATTERNS: tuple[str, ...] = (
    "ctx 无效", "用例配置", "expect 为空", "message 为空",
)


def classify_case(c: dict) -> str | None:
    """失败样本 → 归因类；通过样本 → None（不入分布）。

    `c` 为用例结果 dict（snake_case 列出参：pass/stage/detail/judge/error）。
    """
    if c.get("pass"):
        return None
    stage = (c.get("stage") or "").strip()
    judge = c.get("judge") or {}
    # ① 裁判执行失败：任一 judge 明细带 error（harness 逐裁判 try/catch 格式）
    if isinstance(judge, dict):
        for v in judge.values():
            if isinstance(v, dict) and v.get("error"):
                return "judge"
    # ② 执行未产出：按错误特征分流
    if stage == "error":
        blob = f"{c.get('detail') or ''} {c.get('error') or ''}".lower()
        if any(p in blob for p in ENV_PATTERNS):
            return "env"
        if any(p in blob for p in DATA_PATTERNS):
            return "data"
        return "exec"
    # ③ 进入过评审的失败 → 被测缺陷
    if stage in ("deterministic", "judge"):
        return "skill"
    return "exec"  # 兜底（stage 缺失等异常行）
