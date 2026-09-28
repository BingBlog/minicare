"""DeepSeek 自定义 judge —— DeepEval 的 LLM-as-a-judge 模型适配层。

DeepEval 默认用 OpenAI 做 judge；这里通过继承 DeepEvalBaseLLM 接入
DeepSeek 的 OpenAI 兼容端点（https://api.deepseek.com），
key 复用 agent-poc/.env.local 的 DEEPSEEK_API_KEY。

judge 模型默认 deepseek-v4-flash（与被测 agent 同档，2026-09-01 用户决策）。
注意：deepseek-chat 在该端点会解析为 deepseek-v4-flash；若后续发现 judge 偏袒/漏判
（同模型 judge 判断力不足），可换 deepseek-v4-pro 或更强模型。
"""
import os
from pathlib import Path

from deepeval.models import DeepEvalBaseLLM


def _load_deepseek_key() -> str:
    key = os.environ.get("DEEPSEEK_API_KEY")
    if key:
        return key
    env_local = Path(__file__).resolve().parents[2] / ".env.local"
    if env_local.exists():
        for line in env_local.read_text().splitlines():
            if line.strip().startswith("DEEPSEEK_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("缺少 DEEPSEEK_API_KEY（环境变量或 agent-poc/.env.local）")


class DeepSeekJudge(DeepEvalBaseLLM):
    """用 DeepSeek 模型充当所有 G-Eval / Faithfulness / ToolCorrectness 的 judge。

    默认 deepseek-v4-flash（与被测 agent 同档）。
    """

    def __init__(self, model: str = "deepseek-v4-flash", temperature: float = 0.0):
        self.model_name_ = model
        self.temperature = temperature
        from openai import OpenAI

        self.client = OpenAI(
            api_key=_load_deepseek_key(),
            base_url="https://api.deepseek.com",
        )
        # DeepEval 会在生成指标 prompt 时尝试先取一次 schema/CoT，超时调大更稳
        self.client.with_options(timeout=120)

    def load_model(self):
        return self.client

    def generate(self, prompt: str) -> str:
        resp = self.client.chat.completions.create(
            model=self.model_name_,
            messages=[{"role": "user", "content": prompt}],
            temperature=self.temperature,
        )
        return resp.choices[0].message.content or ""

    async def a_generate(self, prompt: str) -> str:
        return self.generate(prompt)

    def get_model_name(self) -> str:
        return self.model_name_
