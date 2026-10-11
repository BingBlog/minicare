"""判分引擎接线（TECH-026 §3.5 / 第 1.5 期 B4）。

提供三件事：
  · `export_input(run_id)`：把一次运行的结果整理为判分引擎输入（scoring-input.json 结构）；
  · `execute_scoring(run_id)`：执行判分阶段——导出 → spawn `evals/score_run.py`（项目自有 venv）
    → 解析 scores.json → `apply_scores()` 回写 → 状态维护（pending/running/done/failed）；
  · `apply_scores()`：逐例 judge/verdict 重算 + summary（passed/gate）重算。

单一事实源约定：
  · 用例选择与判分适用性（哪些用例判哪些维度）以 `eval_case.judge` 配置为准（运行快照 cases.json）；
  · 维度判定说明（criteria）本期走引擎内置默认（`evals/metrics/criteria.py`），B5 起可由 `eval_judge.prompt` 覆盖。

CLI（导出）：
    cd minicare-platform/api && .venv/bin/python -m kb_pipeline.agent_eval.scoring \
        --run <run_id> --out /tmp/scoring-input.json
"""
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any, Callable

from ..config import REPO_ROOT, get_settings
from ..fsutil import ensure_dir
from ..platform_db import PlatformDB
from .catalog import EvalCatalog
from .ledger import EvalLedger, compute_gate

# 判分维度键（与用例 judge 配置键、Node judge key 同名；独立保留以便未来分叉）
DIMENSION_KEYS: tuple[str, ...] = ("faithfulness", "completeness", "guardrail", "style")

DIMENSION_LABELS: dict[str, str] = {
    "faithfulness": "忠实度",
    "completeness": "关键信息完整",
    "guardrail": "高危护栏",
    "style": "角色风格",
}

DEFAULT_JUDGE_MODEL = "deepseek-v4-pro"


def _case_defs_of(run_id: str) -> dict[str, dict]:
    """运行快照用例定义（`data/eval/runs/<run_id>/cases.json`）；缺失返回空 dict。"""
    f = get_settings().platform_cfg.data_root / "eval" / "runs" / run_id / "cases.json"
    try:
        data = json.loads(Path(f).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    out: dict[str, dict] = {}
    for c in data.get("cases") or []:
        if c.get("id"):
            out[c["id"]] = c
    return out


def _tool_execution_text(tool_calls: list[dict]) -> str | None:
    """工具轨迹文本化（与 Node 侧 collectToolOutputs 同构：含入参 + 返回）。"""
    if not tool_calls:
        return None
    parts = []
    for t in tool_calls:
        inp = json.dumps(t.get("input") or {}, ensure_ascii=False)
        parts.append(f"[工具 {t.get('name')} input={inp}]\n{t.get('output') or ''}")
    return "\n\n".join(parts)


def judge_of_dim(dim: dict, judges_by_id: dict[str, dict]) -> dict | None:
    """维度 → 归属裁判（裁判中心化 C6）：`dim.judge_id` 优先；回退首期 `judge.dim_id` 匹配。"""
    jid = dim.get("judge_id")
    if jid and jid in judges_by_id:
        return judges_by_id[jid]
    for j in judges_by_id.values():
        if j.get("dim_id") == dim.get("dim_id"):
            return j
    return None


def _criteria_of(dim: dict, judge: dict) -> str | None:
    """判定要点优先级（C6）：维度 `criteria` → 裁判 `params.criteria`（缺省由引擎内置模板兜底）。"""
    crit = dim.get("criteria")
    if isinstance(crit, str) and crit.strip():
        return crit.strip()
    params = judge.get("params")
    crit = params.get("criteria") if isinstance(params, dict) else None
    if isinstance(crit, str) and crit.strip():
        return crit.strip()
    return None


def _compile_dimensions() -> list[dict]:
    """配置驱动编译（TECH-026 §3.3 + C6 裁判中心化）：case 级维度（挂裁判）→ 判分维度 spec。

    每维度 spec：`key / name / metric_type / criteria / reverse / weight / indicator_id`。
    criteria 优先级 = 维度 criteria → 裁判 params.criteria → 引擎内置模板（criteria.py）。
    配置为空（未 seed）时回退四维度内置（向后兼容）。
    """
    cat = EvalCatalog(PlatformDB(get_settings().platform_cfg.db_path))
    judges = {j["judge_id"]: j for j in cat.list_judges(enabled=True)}
    dims: list[dict] = []
    for d in cat.list_dimensions(enabled=True, level="case"):
        j = judge_of_dim(d, judges)
        if not j:
            continue  # 未挂裁判的维度不进入判分引擎
        key = d.get("metric_key") or (d["dim_id"].split("-", 1)[1] if "-" in d["dim_id"] else d["dim_id"])
        spec: dict[str, Any] = {
            "key": key,
            "name": d["name"],
            "metric_type": j.get("metric_type") or "ternary",
            "reverse": bool(d.get("reverse")),
            "weight": float(d.get("weight") or 1),
            "indicator_id": d.get("indicator_id"),
        }
        crit = _criteria_of(d, j)
        if crit:
            spec["criteria"] = crit
        dims.append(spec)
    if not dims:  # 回退：配置为空（未 seed）时的内置四维度
        dims = [
            {"key": k, "name": DIMENSION_LABELS[k], "metric_type": "ternary",
             "reverse": False, "weight": 1, "indicator_id": None}
            for k in DIMENSION_KEYS
        ]
    return dims


def export_input(run_id: str) -> dict:
    """把一次运行导出为判分引擎输入（TECH-026 §3.4 的 scoring-input.json 结构）。"""
    ledger = EvalLedger(PlatformDB(get_settings().platform_cfg.db_path))
    run = ledger.get_run(run_id)
    if not run:
        raise ValueError(f"运行不存在：{run_id}")

    dims = _compile_dimensions()
    dims_by_key = {d["key"]: d for d in dims}

    defs = _case_defs_of(run_id)
    cases_in: list[dict] = []
    for c in run.get("cases") or []:
        d = defs.get(c["case_id"]) or {}
        jcfg = d.get("judge") or {}
        dims_for_case = [k for k in dims_by_key if isinstance(jcfg, dict) and jcfg.get(k)]
        if not dims_for_case:
            continue  # 未配置裁判的用例不判
        # 只判"进入过评审"的样本（对齐 Node judge 语义：确定性断言失败 / 执行异常不进入主观判分）
        if (c.get("stage") or "") not in ("ok", "judge"):
            continue
        item: dict[str, Any] = {
            "case_id": c["case_id"],
            "input": d.get("message") or (c.get("desc") or c["case_id"]),
            "actual_output": c.get("answer") or "",
            "dims": dims_for_case,
        }
        tool_text = _tool_execution_text(c.get("tool_calls") or [])
        if tool_text:
            item["context"] = [tool_text]
        retrieval = [t.get("output") or "" for t in (c.get("tool_calls") or [])
                     if t.get("name") == "search_knowledge" and t.get("output")]
        if retrieval:
            item["retrieval_context"] = retrieval
        comp = jcfg.get("completeness") if isinstance(jcfg, dict) else None
        golden = (comp or {}).get("goldenPoints") if isinstance(comp, dict) else None
        if golden:
            item["expected"] = "\n".join(f"- {p}" for p in golden)
        st = jcfg.get("style") if isinstance(jcfg, dict) else None
        hints: dict[str, bool] = {}
        if isinstance(st, dict) and st.get("needsDisclaimer") is not None:
            hints["needsDisclaimer"] = bool(st.get("needsDisclaimer"))
        if hints:
            item["hints"] = hints
        cases_in.append(item)

    if not cases_in:
        raise ValueError(f"运行 {run_id} 无可判分用例（用例未配置裁判或全部未产出）")

    judge_model = (run.get("env_snapshot") or {}).get("judge_model") or DEFAULT_JUDGE_MODEL
    return {
        "run_id": run_id,
        "judge_model": {"name": judge_model, "temperature": 0},
        "dimensions": dims,
        "cases": cases_in,
    }


# ── 判分阶段执行（B4）────────────────────────────────────────────────


def _agent_dir() -> Path:
    return REPO_ROOT / "minicare-agent"


def _venv_python() -> Path:
    return _agent_dir() / "evals" / ".venv" / "bin" / "python"


def _run_dir(run_id: str) -> Path:
    return ensure_dir(get_settings().platform_cfg.data_root / "eval" / "runs" / run_id).resolve()


def _clean_env() -> dict:
    """剥离 WorkBuddy 沙箱注入（fs broker 等）；与 runner.clean_child_env 同源（避免循环导入）。"""
    env = dict(os.environ)
    for k in list(env):
        if k == "NODE_OPTIONS" or k.startswith("CODEBUDDY_"):
            env.pop(k, None)
    env["DEEPEVAL_TELEMETRY_OPT_OUT"] = "YES"
    return env


def _dims_snapshot(run_id: str) -> list[dict] | None:
    """从运行物化快照读维度配置（gate 重算用）；缺失返回 None（回退默认口径）。"""
    try:
        data = json.loads((_run_dir(run_id) / "meta.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    dims = data.get("dimensions")
    return dims if isinstance(dims, list) and dims else None


def execute_scoring(run_id: str, *, on_progress: Callable[[int, int], None] | None = None,
                    on_proc: Callable[[subprocess.Popen], None] | None = None,
                    timeout_s: int = 2400) -> dict:
    """执行判分阶段（含状态维护）：pending → running → done / failed。

    · `on_progress(done, total)`：引擎按用例判分进度（运行进度展示）；
    · `on_proc(proc)`：把子进程句柄交给调用方（支持中止）；
    · 失败时置 `scoring='failed'` 并抛错（执行结果不受影响）。
    """
    settings = get_settings()
    ledger = EvalLedger(PlatformDB(settings.platform_cfg.db_path))
    ledger.set_scoring(run_id, "running")
    try:
        meta = _run_engine(run_id, on_progress=on_progress, on_proc=on_proc, timeout_s=timeout_s)
    except Exception as e:  # noqa: BLE001
        ledger.set_scoring(run_id, "failed", error=str(e))
        raise
    ledger.set_scoring(run_id, "done", meta=meta)
    return meta


def _run_engine(run_id: str, *, on_progress: Callable[[int, int], None] | None,
                on_proc: Callable[[subprocess.Popen], None] | None,
                timeout_s: int) -> dict:
    """导出 → spawn 引擎子进程 → 解析 scores.json → 回写台账。"""
    py = _venv_python()
    if not py.is_file():
        raise RuntimeError(
            "判分引擎环境缺失：minicare-agent/evals/.venv 不存在——"
            "按 evals/README.md §三 重建（python3 -m venv evals/.venv && "
            "HTTPS_PROXY=http://127.0.0.1:7897 evals/.venv/bin/pip install -r evals/requirements.txt）")

    spec = export_input(run_id)
    run_dir = _run_dir(run_id)
    input_path = run_dir / "scoring-input.json"
    scores_path = run_dir / "scores.json"
    input_path.write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
    total = len(spec["cases"])

    cmd = [str(py), "evals/score_run.py", f"--input={input_path}", f"--out={scores_path}"]
    proc = subprocess.Popen(
        cmd, cwd=str(_agent_dir()),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1, env=_clean_env(),
    )
    if on_proc:
        on_proc(proc)

    tail: list[str] = []
    done = 0
    t0 = time.time()
    timed_out = False
    assert proc.stdout is not None
    for raw in proc.stdout:
        line = raw.rstrip("\n")
        tail.append(line)
        if len(tail) > 80:
            del tail[: len(tail) - 80]
        if line.startswith("[score] "):
            done += 1
            if on_progress:
                on_progress(done, total)
        if time.time() - t0 > timeout_s:
            timed_out = True
            proc.terminate()
            break
    code = proc.wait()
    if timed_out:
        raise TimeoutError(f"判分超时（>{timeout_s}s）——已中止子进程")

    if not scores_path.is_file():
        raise RuntimeError(f"判分引擎未产出 scores.json（exit={code}）：{' / '.join(tail[-8:])}")
    scores = json.loads(scores_path.read_text(encoding="utf-8"))
    applied = apply_scores(run_id, scores.get("results") or {}, spec)
    meta = dict(scores.get("meta") or {})
    meta.update(applied)
    return meta


def _sample_scores(case_judge: dict, dims_by_key: dict) -> tuple[float | None, dict]:
    """样本分与指标分（TECH-026 §5.2）。

    维度分（引擎 score 已含反向取补）→ 指标分（加权平均）→ 样本分（指标算术平均）。
    · 判分失败（error）/ 缺失 / 未挂指标的维度剔除（"不可用不计入"）；
    · 无可用指标的样本 → (None, {})。
    """
    ind_sum: dict[str, float] = {}
    ind_w: dict[str, float] = {}
    for key, rec in (case_judge or {}).items():
        spec = dims_by_key.get(key)
        if not spec or not isinstance(rec, dict) or "error" in rec:
            continue
        ind = spec.get("indicator_id")
        if not ind:
            continue
        score = rec.get("score")
        if score is None:
            continue
        w = float(spec.get("weight") or 1)
        ind_sum[ind] = ind_sum.get(ind, 0.0) + w * float(score)
        ind_w[ind] = ind_w.get(ind, 0.0) + w
    ind_scores = {i: round(ind_sum[i] / ind_w[i], 4) for i in ind_sum if ind_w.get(i)}
    if not ind_scores:
        return None, {}
    sample = round(sum(ind_scores.values()) / len(ind_scores), 4)
    return sample, ind_scores


def apply_scores(run_id: str, scores: dict[str, dict], spec: dict | None = None) -> dict:
    """把引擎分数回写台账（TECH-026 §3.5）。

    逐例：`judge` = 引擎各维度结果（字段与旧格式兼容，gate/证据链零改动）；
    最终裁决 = 全部已判维度 `verdict == pass`（判分仅覆盖"进入过评审"的样本）→ 重算 `pass/stage/detail`；
    第 2 期：按 `spec.dimensions`（运行快照）聚合**指标分/样本分**并写回；
    随后重算 run summary（passed/gate，维度口径取物化快照）。
    """
    ledger = EvalLedger(PlatformDB(get_settings().platform_cfg.db_path))
    run = ledger.get_run(run_id)
    if not run:
        raise ValueError(f"运行不存在：{run_id}")
    dims_by_key = {d["key"]: d for d in (spec or {}).get("dimensions", []) if isinstance(d, dict) and d.get("key")}

    updated = 0
    for c in run.get("cases") or []:
        sd = scores.get(c["case_id"])
        if not sd:
            continue
        judge: dict = {}
        failures: list[str] = []
        for dim, rec in sd.items():
            judge[dim] = rec
            if "error" in rec:
                failures.append(f"{dim}: 裁判执行失败（{str(rec['error'])[:80]}）")
            elif not rec.get("pass"):
                reason = rec.get("reason") or rec.get("verdict") or "fail"
                failures.append(f"{dim}: {reason}")
        ledger.update_case_judge(
            run_id, c["case_id"], judge=judge,
            pass_=len(failures) == 0,
            stage=("judge" if failures else "ok"),
            detail=("；".join(failures) if failures else None),
        )
        # 第 2 期：指标分 / 样本分（样本快照维度为准）
        if dims_by_key:
            sample, ind_scores = _sample_scores(judge, dims_by_key)
            ledger.update_case_score(run_id, c["case_id"],
                                     sample_score=sample, indicator_scores=ind_scores)
        updated += 1

    # summary 重算（passed + gate）；dims 取运行物化快照，缺失回退默认口径
    cases2 = (ledger.get_run(run_id) or {}).get("cases") or []
    dims = _dims_snapshot(run_id)
    gate = compute_gate(cases2, dims)
    p0 = [c for c in cases2 if (c.get("priority") or "") == "P0"]
    summary = {
        **(run.get("summary") or {}),
        "total": len(cases2),
        "passed": sum(1 for c in cases2 if c["pass"]),
        "p0": len(p0),
        "p0Pass": sum(1 for c in p0 if c["pass"]),
        "gate": gate,
    }
    ledger.update_summary(run_id, summary)
    scored = [c["sample_score"] for c in cases2 if c.get("sample_score") is not None]
    sample_avg = round(sum(scored) / len(scored), 4) if scored else None
    return {"applied": updated, "passed": summary["passed"], "total": summary["total"],
            "sample_avg": sample_avg, "sample_n": len(scored)}


# ── 单维度重判（C4：裁判试跑走判分引擎）──────────────────────────────


def dim_spec_of(dim: dict, judge: dict) -> dict:
    """维度配置 + 裁判 → 引擎维度 spec（与 `_compile_dimensions` 同构，单维度场景用）。"""
    key = dim.get("metric_key") or (
        dim["dim_id"].split("-", 1)[1] if "-" in dim["dim_id"] else dim["dim_id"])
    spec: dict[str, Any] = {
        "key": key,
        "name": dim["name"],
        "metric_type": judge.get("metric_type") or "ternary",
        "reverse": bool(dim.get("reverse")),
        "weight": float(dim.get("weight") or 1),
        "indicator_id": dim.get("indicator_id"),
    }
    crit = _criteria_of(dim, judge)
    if crit:
        spec["criteria"] = crit
    return spec


def _case_item_for_rejudge(case: dict, answer: str, tool_calls: list[dict] | None,
                           keys: list[str]) -> dict:
    """用例 + 历史回答 → 引擎用例项（与 `export_input` 的逐例组装同源）。"""
    item: dict[str, Any] = {
        "case_id": case["case_id"],
        "input": case.get("message") or case["case_id"],
        "actual_output": answer or "",
        "dims": keys,
    }
    tool_text = _tool_execution_text(tool_calls or [])
    if tool_text:
        item["context"] = [tool_text]
    retrieval = [t.get("output") or "" for t in (tool_calls or [])
                 if t.get("name") == "search_knowledge" and t.get("output")]
    if retrieval:
        item["retrieval_context"] = retrieval
    jcfg = case.get("judge") or {}
    comp = jcfg.get("completeness") if isinstance(jcfg, dict) else None
    golden = (comp or {}).get("goldenPoints") if isinstance(comp, dict) else None
    if golden:
        item["expected"] = "\n".join(f"- {p}" for p in golden)
    st = jcfg.get("style") if isinstance(jcfg, dict) else None
    if isinstance(st, dict) and st.get("needsDisclaimer") is not None:
        item["hints"] = {"needsDisclaimer": bool(st.get("needsDisclaimer"))}
    return item


def run_rejudge_engine(*, judge: dict, dim: dict, case: dict, answer: str,
                       tool_calls: list[dict] | None, rj_dir: Path,
                       timeout_s: int = 300) -> tuple[dict, dict]:
    """单维度重判（C4）：写 scoring-input.json → spawn 引擎 → 读 scores.json。

    返回 `(rec, meta)`：rec = 该维度判定记录（pass/verdict/score/reason[+schema]）或 `{"error": …}`；
    meta = 引擎元数据（deepeval 版本 / model / elapsed_ms）。
    语义与正式判分链路一致（同一引擎、同一 criteria 优先级：judge.params.criteria → 内置模板）。
    """
    dim_spec = dim_spec_of(dim, judge)
    key = dim_spec["key"]
    item = _case_item_for_rejudge(case, answer, tool_calls, [key])
    spec = {
        "run_id": f"rejudge:{case['case_id']}",
        "judge_model": {
            "name": judge.get("model") or DEFAULT_JUDGE_MODEL,
            "temperature": float(judge.get("temperature") or 0),
        },
        "dimensions": [dim_spec],
        "cases": [item],
    }
    py = _venv_python()
    if not py.is_file():
        raise RuntimeError(
            "判分引擎环境缺失：minicare-agent/evals/.venv 不存在——"
            "按 evals/README.md §三 重建")
    input_path = rj_dir / "scoring-input.json"
    out_path = rj_dir / "scores.json"
    input_path.write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")

    cmd = [str(py), "evals/score_run.py", f"--input={input_path}", f"--out={out_path}"]
    proc = subprocess.run(
        cmd, cwd=str(_agent_dir()), capture_output=True, text=True,
        env=_clean_env(), timeout=timeout_s)
    if not out_path.is_file():
        tail = ((proc.stderr or "") + (proc.stdout or ""))[-500:]
        raise RuntimeError(f"试跑执行失败（exit={proc.returncode}）：{tail}")
    payload = json.loads(out_path.read_text(encoding="utf-8"))
    rec = ((payload.get("results") or {}).get(case["case_id"]) or {}).get(key)
    if not isinstance(rec, dict):
        rec = {"error": "引擎未产出该维度结果"}
    return rec, dict(payload.get("meta") or {})


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="导出一轮运行的判分引擎输入（scoring-input.json）")
    ap.add_argument("--run", required=True, help="run_id")
    ap.add_argument("--out", required=True, help="输出路径")
    args = ap.parse_args(argv)

    spec = export_input(args.run)
    Path(args.out).write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✓ 已导出：{len(spec['cases'])} 用例 → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
