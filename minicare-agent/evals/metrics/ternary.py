"""TernaryJudgeMetric —— 三态判定 metric（TECH-026 §3.3）。

三态：通过 1.0 / 中性 0.5 / 失败 0.0 + 理由 + 附加字段（schema 声明）。

· 沿用 deepeval `BaseMetric` 接口（measure / a_measure / is_successful / score / reason / error）；
· LLM 调用复用 `evals/judges/deepseek_judge.DeepSeekJudge`（DeepSeek OpenAI 兼容端点）；
· 解析失败自动重试（stricter reminder），最终失败抛错并落 `self.error`；
· `reverse=True` 时仅分值取补（1-x），verdict / success 语义不变（历史维度默认正向）。

与 Node judge（judge.mjs）的方向可比性：verdict==pass ⇔ 原 pass=true；
neutral 仅表示"无法确定"，不会把原本 fail 的结果算成通过。
"""
from __future__ import annotations

import json
import re

from deepeval.metrics import BaseMetric

from .criteria import DEFAULT_CRITERIA, DEFAULT_SCHEMAS, DIM_LABELS, VERDICT_RULES

_VERDICT_SCORE = {"pass": 1.0, "neutral": 0.5, "fail": 0.0}
_VALID_VERDICTS = ("pass", "neutral", "fail")


def _schema_spec(schema: dict | None) -> str:
    """把附加字段声明拼进输出规范（bool/int/list 为标准简写，其余按字面提示）。"""
    if not schema:
        return ""
    parts = []
    for k, t in schema.items():
        t = str(t)
        if t == "bool":
            parts.append(f'"{k}": true|false')
        elif t == "int":
            parts.append(f'"{k}": 整数')
        elif t == "list":
            parts.append(f'"{k}": ["..."]')
        else:
            parts.append(f'"{k}": {t}')
    return ", " + ", ".join(parts)


def build_prompt(criteria: str, schema: dict | None, test_case, hints: dict | None = None) -> str:
    """组装判定 prompt：criteria + 判定要求 + 用例材料（存在才渲染）+ 输出规范。"""
    blocks: list[str] = [criteria.strip(), ""]

    blocks += ["【判定要求】", VERDICT_RULES, ""]

    blocks += ["【用户问题】", str(test_case.input or "（无）"), ""]
    blocks += ["【助手回答】", str(test_case.actual_output or "（空）")]

    rc = getattr(test_case, "retrieval_context", None) or []
    if rc:
        blocks += ["", "【检索资料】", "\n---\n".join(str(x) for x in rc)]
    ctx = getattr(test_case, "context", None) or []
    if ctx:
        blocks += ["", "【工具执行轨迹】", "\n---\n".join(str(x) for x in ctx)]
    eo = getattr(test_case, "expected_output", None)
    if eo:
        blocks += ["", "【预期要点】", str(eo)]

    if hints and hints.get("needsDisclaimer") is not None:
        nd = "true" if hints.get("needsDisclaimer") else "false"
        blocks += ["", f"【判定提示】needsDisclaimer={nd}"]

    blocks += [
        "",
        "【输出规范】",
        "只输出一个 JSON 对象（不要解释、不要 Markdown 代码块）：",
        '{"verdict": "pass" | "neutral" | "fail", "reason": "一句话说明"' + _schema_spec(schema) + "}",
    ]
    return "\n".join(blocks)


def _parse_verdict(text: str) -> dict:
    """从裁判输出里抽 JSON（容忍代码块/前后噪声），校验 verdict 闭集。"""
    t = (text or "").strip()
    m = re.search(r"\{[\s\S]*\}", t)
    if not m:
        raise ValueError(f"输出中找不到 JSON：{t[:120]}")
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        raise ValueError(f"JSON 解析失败：{e}") from e
    verdict = str(data.get("verdict") or "").strip().lower()
    if verdict not in _VALID_VERDICTS:
        raise ValueError(f"verdict 非法：{data.get('verdict')!r}（应为 {'/'.join(_VALID_VERDICTS)}）")
    return data


class TernaryJudgeMetric(BaseMetric):
    """三态判定 metric（自定义维度判分的默认引擎，见 TECH-026 §3.3）。"""

    async_mode = False  # 我们同步调用 measure()；显式关闭避免上层走 a_measure

    def __init__(
        self,
        name: str,
        model,
        *,
        criteria: str | None = None,
        schema: dict | None = None,
        reverse: bool = False,
        max_retries: int = 2,
    ):
        self.name_ = name
        self.cover_key = name
        self.criteria = (criteria or "").strip() or DEFAULT_CRITERIA.get(name, "")
        if not self.criteria:
            raise ValueError(f"维度 {name} 缺少判定说明（criteria）且无内置默认模板")
        self.schema = schema or DEFAULT_SCHEMAS.get(name, {})
        self.model = model
        self.reverse = reverse
        self.max_retries = max_retries
        # success ⇔ verdict == "pass"（0.75 阈值使 neutral=0.5 不算成功；保留字段供 deepeval 兼容）
        self.threshold = 0.75
        self.score = None
        self.reason = ""
        self.verdict = None
        self.extra: dict = {}
        self.error = None
        self.success = False

    # ── 判定 ──────────────────────────────────────────────────────

    def _judge(self, prompt: str) -> dict:
        last_err: Exception | None = None
        for attempt in range(self.max_retries + 1):
            p = prompt
            if attempt > 0:
                p += ("\n\n注意：上次输出无法解析。请严格只输出规范要求的单个 JSON 对象，"
                      "verdict 只能是 pass / neutral / fail 之一。")
            text = self.model.generate(p)
            try:
                return _parse_verdict(text)
            except ValueError as e:
                last_err = e
        raise ValueError(f"裁判输出无法解析（重试 {self.max_retries} 次）：{last_err}")

    def measure(self, test_case, *args, **kwargs) -> float:
        hints = (getattr(test_case, "metadata", None) or {}).get("hints")
        prompt = build_prompt(self.criteria, self.schema, test_case, hints)
        try:
            data = self._judge(prompt)
            self.verdict = data["verdict"]
            self.reason = str(data.get("reason") or "")
            self.extra = {k: data.get(k) for k in self.schema}
            raw = _VERDICT_SCORE[self.verdict]
            self.score = round(1.0 - raw, 4) if self.reverse else raw
            self.success = self.verdict == "pass"
            self.error = None
            return self.score
        except Exception as e:
            self.error = str(e)
            self.score = None
            self.success = False
            raise

    async def a_measure(self, test_case, *args, **kwargs) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        return bool(self.success)

    @property
    def __name__(self):
        return f"TernaryJudge[{self.name_}]"

    def label(self) -> str:
        return DIM_LABELS.get(self.name_, self.name_)
