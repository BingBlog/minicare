#!/usr/bin/env python
"""minicare 测评判分引擎（TECH-026 §3.4）。

读 scoring-input.json（平台导出）→ 用 deepeval 指标逐用例逐维度判分 → 写 scores.json。

用法（项目自有 venv，见 evals/README.md §三）：
    cd minicare-agent
    DEEPEVAL_TELEMETRY_OPT_OUT=YES ./evals/.venv/bin/python evals/score_run.py \
        --input scoring-input.json --out scores.json [--only guardrail,style] [--model deepseek-v4-pro]

输入/输出结构见 TECH-026 §3.4；维度判定说明缺省回退 `metrics/criteria.py` 的内置模板。
逐 (用例, 维度) 隔离错误：单点失败写 `{"error": ...}`，整轮不中断。
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent        # evals/
AGENT_ROOT = ROOT.parent                      # minicare-agent/
for _p in (str(AGENT_ROOT), str(ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from evals.judges.deepseek_judge import DeepSeekJudge                      # noqa: E402
from evals.metrics.ternary import TernaryJudgeMetric                       # noqa: E402


def _deepeval_version() -> str:
    try:
        import deepeval
        return getattr(deepeval, "__version__", "unknown")
    except Exception:
        return "unknown"


def build_test_case(case: dict):
    """scoring-input case → LLMTestCase（LLMTestCase 是 pydantic 模型，关键字传参）。"""
    from deepeval.test_case import LLMTestCase, ToolCall

    tools = []
    for t in case.get("tools_called") or []:
        if not (isinstance(t, dict) and t.get("name")):
            continue
        kwargs = {"name": t["name"]}
        if isinstance(t.get("input"), dict):
            kwargs["input_parameters"] = t["input"]
        tools.append(ToolCall(**kwargs))

    tc = LLMTestCase(
        input=case.get("input") or "",
        actual_output=case.get("actual_output") or "",
        expected_output=case.get("expected") or None,
        context=case.get("context") or None,
        retrieval_context=case.get("retrieval_context") or None,
        metadata={"case_id": case.get("case_id"), "hints": case.get("hints") or None},
    )
    if tools:
        tc.tools_called = tools
    return tc


def build_metric(dim: dict, model):
    """维度定义 → deepeval metric 实例（ternary 默认；geval / builtin 预留）。"""
    key = dim["key"]
    mt = (dim.get("metric_type") or "ternary").strip()
    if mt == "ternary":
        return TernaryJudgeMetric(
            name=key,
            model=model,
            criteria=dim.get("criteria"),
            schema=dim.get("schema"),
            reverse=bool(dim.get("reverse")),
        )
    if mt == "geval":
        from deepeval.metrics import GEval
        from deepeval.test_case import SingleTurnParams as TCParams
        params = [getattr(TCParams, p) for p in (dim.get("evaluation_params") or ["INPUT", "ACTUAL_OUTPUT"])]
        return GEval(
            name=key,
            criteria=dim.get("criteria") or "",
            evaluation_params=params,
            model=model,
            threshold=float(dim.get("threshold") or 0.5),
        )
    if mt.startswith("builtin:"):
        name = mt.split(":", 1)[1]
        if name == "faithfulness":
            from deepeval.metrics import FaithfulnessMetric
            return FaithfulnessMetric(model=model, threshold=float(dim.get("threshold") or 0.5), include_reason=True)
        if name == "tool_correctness":
            from deepeval.metrics import ToolCorrectnessMetric
            return ToolCorrectnessMetric(model=model, threshold=float(dim.get("threshold") or 1.0))
        raise NotImplementedError(f"builtin 指标未接入：{name}")
    raise ValueError(f"未知 metric_type：{mt}")


def main() -> int:
    ap = argparse.ArgumentParser(description="minicare 测评判分引擎（deepeval）")
    ap.add_argument("--input", required=True, help="scoring-input.json 路径")
    ap.add_argument("--out", required=True, help="scores.json 输出路径")
    ap.add_argument("--only", default=None, help="仅判这些维度（逗号分隔 key）")
    ap.add_argument("--model", default=None, help="judge 模型覆盖（默认取 input.judge_model.name）")
    args = ap.parse_args()

    spec = json.loads(Path(args.input).read_text(encoding="utf-8"))
    jm = spec.get("judge_model") or {}
    model_name = args.model or jm.get("name") or "deepseek-v4-pro"
    temperature = float(jm.get("temperature") or 0)
    model = DeepSeekJudge(model=model_name, temperature=temperature)

    only = set(x.strip() for x in args.only.split(",") if x.strip()) if args.only else None
    dims = [d for d in (spec.get("dimensions") or []) if not only or d["key"] in only]

    metrics: dict[str, object] = {}
    build_errors: dict[str, str] = {}
    for d in dims:
        try:
            metrics[d["key"]] = build_metric(d, model)
        except Exception as e:  # noqa: BLE001
            build_errors[d["key"]] = str(e)

    results: dict[str, dict] = {}
    errors: dict[str, dict] = {}
    t0 = time.time()
    n_calls = n_errors = 0

    for case in spec.get("cases") or []:
        cid = str(case.get("case_id"))
        apply_keys = case.get("dims") or [d["key"] for d in dims]
        try:
            tc = build_test_case(case)
        except Exception as e:  # noqa: BLE001
            results[cid] = {k: {"error": f"用例构建失败：{e}"} for k in apply_keys}
            n_errors += len(apply_keys)
            continue
        out: dict[str, dict] = {}
        for key in apply_keys:
            if key in build_errors:
                out[key] = {"error": f"指标构建失败：{build_errors[key]}"}
                n_errors += 1
                continue
            metric = metrics.get(key)
            if metric is None:
                continue
            n_calls += 1
            try:
                metric.measure(tc)
                rec = {
                    "pass": bool(metric.success),
                    "verdict": metric.verdict,
                    "score": metric.score,
                    "reason": metric.reason,
                }
                for k in (metric.schema or {}):
                    rec[k] = metric.extra.get(k)
                out[key] = rec
            except Exception as e:  # noqa: BLE001
                n_errors += 1
                msg = getattr(metric, "error", None) or str(e)
                out[key] = {"error": msg}
                errors.setdefault(cid, {})[key] = msg
        results[cid] = out
        brief = " ".join(f"{k}={v.get('verdict') or 'ERR'}" for k, v in out.items())
        print(f"[score] {cid} · {brief}", flush=True)

    payload = {
        "results": results,
        "meta": {
            "engine": "deepeval",
            "deepeval": _deepeval_version(),
            "model": model_name,
            "temperature": temperature,
            "elapsed_ms": int((time.time() - t0) * 1000),
            "calls": n_calls,
            "failed": n_errors,
            "errors": errors,
        },
    }
    Path(args.out).write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✓ 判分完成：{len(results)} 用例 / {n_calls} 次判定 / {n_errors} 失败 / "
          f"{payload['meta']['elapsed_ms']}ms → {args.out}")
    return 0 if n_errors == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
