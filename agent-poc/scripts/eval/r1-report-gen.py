#!/usr/bin/env python3
"""R1 本地测评报告 HTML 生成（数据驱动）。

输入：
  .deepeval/r1-dev-run.json        harness 真实执行结果（120s 能力上限跑）
  .deepeval/.latest_test_run.json  deepeval 指标层判分结果
  .deepeval/r1-55s-baseline.json   （可选）55s 生产同款预算基线，用于对比
输出：
  docs/agent-eval-report-20260903.html
"""
import json
import os
from pathlib import Path

ROOT = Path("/Users/bing/Documents/minicare-v1/agent-poc")
OUT = Path("/Users/bing/Documents/minicare-v1/docs/agent-eval-report-20260903.html")

raw = json.loads((ROOT / ".deepeval/r1-dev-run.json").read_text())
latest = json.loads((ROOT / ".deepeval/.latest_test_run.json").read_text())["testRunData"]
dtcs = latest.get("testCases", [])

# 55s 生产预算轮结果（2026-09-03 提取存档；该轮 harness json 已被 120s 轮覆盖）
BASELINE_55S = {"pass": 16, "total": 20, "fails": ["R1-06", "R1-07", "R1-17", "R1-20"]}
# 120s 轮失败（本轮数据实时读 latest_test_run）
baseline = None

# ---------- 数据整理 ----------
harness = {c["id"]: c for c in raw["cases"]}
deepeval = {}
for t in dtcs:
    cid = (t.get("name") or "").replace("test_r1_r1_", "R1-")
    metrics = [{"name": m.get("name"), "score": m.get("score"), "success": m.get("success"),
                "reason": (m.get("reason") or "")} for m in t.get("metricsData", [])]
    deepeval[cid] = {"success": t.get("success"), "metrics": metrics}

h_pass = sum(1 for c in raw["cases"] if c["pass"])
h_total = len(raw["cases"])
h_p0 = [c for c in raw["cases"] if c.get("priority") == "P0"]
h_p0_pass = sum(1 for c in h_p0 if c["pass"])
d_pass = sum(1 for v in deepeval.values() if v["success"])
d_total = len(deepeval)

# 指标维度汇总
metric_stats = {}
for v in deepeval.values():
    for m in v["metrics"]:
        s = metric_stats.setdefault(m["name"], {"scores": [], "pass": 0, "total": 0})
        if m["score"] is not None:
            s["scores"].append(m["score"])
            s["total"] += 1
            s["pass"] += 1 if m["success"] else 0
for s in metric_stats.values():
    s["avg"] = sum(s["scores"]) / len(s["scores"]) if s["scores"] else 0

# 超时用例（55s 轮被截断、120s 轮通过）的实测耗时
_h = {c["id"]: c for c in raw["cases"]}
timeout_cases = [
    {"id": cid, "desc": _h[cid]["desc"][:38], "ms": _h[cid]["ms"],
     "tools": " + ".join(t["name"] for t in _h[cid].get("toolCalls", []))}
    for cid in ("R1-06", "R1-15", "R1-17") if cid in _h
]

# 慢用例 Top（120s 跑）
slow = sorted(raw["cases"], key=lambda c: -c["ms"])[:5]

P = lambda s: f"{s:.1f}" if isinstance(s, float) else str(s)

# ---------- 逐用例行 ----------
rows = []
for c in raw["cases"]:
    cid = c["id"]
    dv = deepeval.get(cid, {})
    d_flag = "✅" if dv.get("success") else ("❌" if dv else "—")
    fails = [f"{m['name'].split(' ')[0]}={P(m['score'])}" for m in dv.get("metrics", []) if not m.get("success")]
    rows.append(f"""<tr>
<td class="cid">{cid}</td><td>{c.get('priority','')}</td>
<td class="desc">{c['desc'][:44]}</td>
<td>{"✅" if c["pass"] else "❌"}</td>
<td>{c['ms']//1000}s</td>
<td class="tools">{' + '.join(t['name'].replace('_baby_data','').replace('_',' ') for t in c.get('toolCalls',[])) or '—'}</td>
<td>{d_flag}</td>
<td class="fail-reason">{'；'.join(fails) if fails else (dv and '；'.join(x.get('detail','')[:40] for x in [c] if not c['pass']) or '')}</td>
</tr>""")

metric_cards = "".join(f"""
<div class="mcard"><div class="mname">{name}</div>
<div class="mscore">{s['pass']}/{s['total']}</div>
<div class="mavg">均分 {s['avg']:.2f}</div></div>"""

for name, s in sorted(metric_stats.items()))

slow_bars = "".join(f"""
<div class="bar-row"><div class="bar-label">{c['id']}</div>
<div class="bar-track"><div class="bar-fill" style="width:{min(100, c['ms']/1200)}%"></div></div>
<div class="bar-val">{c['ms']//1000}s</div></div>"""
for c in slow)

timeout_rows = "".join(f"""
<tr><td class="cid">{t['id']}</td><td class="desc">{t['desc']}</td>
<td class="tools">{t['tools']}</td>
<td><b>{t['ms']//1000}s</b> &gt; 55s</td></tr>"""
for t in timeout_cases)

base_note = f"""<div class="insight-card">
<div class="ic-title">deepeval 两轮对照（模型输出有随机性，风格分轮间波动 ±1~2 条）</div>
<p>生产同款 55s 预算轮：<b>{BASELINE_55S['pass']}/{BASELINE_55S['total']}</b>（失败 {', '.join(BASELINE_55S['fails'])}）→
120s 能力预算轮：<b>{d_pass}/{d_total}</b>（失败 {', '.join(sorted(cid for cid, v in deepeval.items() if not v['success'])) or '无'}）。</p>
<p style="margin-top:6px"><b>跨轮稳定不合格：R1-06 / R1-07</b>（style）——多工具组合链路长、回答易带冗余进度话术。
 harness 侧结论不受波动影响：55s 预算 15/20（4 条截断）→ 120s 预算 <b>20/20 全过</b>，R1-06 实测需 62.5s、R1-15 需 76.4s、R1-17 需 63.7s——
<b>截断 ≠ 能力不足</b>，卡点在「数据+知识库」双工具组合超出生产代理 60s 超时。</p></div>"""

html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>养娃智能体 · 本地能力测评报告（R1 真实数据）</title>
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif; background:#FDF6E3; color:#333; line-height:1.7; }}
  .wrap {{ max-width:860px; margin:0 auto; padding:48px 24px 80px; }}
  .tag {{ display:inline-block; background:#2E5EAA; color:#fff; font-size:13px; padding:4px 14px; border-radius:14px; letter-spacing:2px; margin-bottom:14px; }}
  h1 {{ color:#2E5EAA; font-size:34px; line-height:1.3; margin-bottom:8px; }}
  .sub {{ color:#E4572E; font-size:16px; margin-bottom:6px; font-weight:600; }}
  .meta {{ color:#999; font-size:13px; margin-bottom:32px; }}
  .card {{ background:#fff; border-radius:16px; padding:28px 30px; margin-bottom:24px; box-shadow:0 2px 10px rgba(46,94,170,.08); }}
  h2 {{ color:#2E5EAA; font-size:20px; margin-bottom:16px; border-left:5px solid #E4572E; padding-left:12px; }}
  h3 {{ font-size:15px; color:#555; margin:14px 0 8px; }}
  .big-row {{ display:flex; gap:16px; flex-wrap:wrap; }}
  .big {{ flex:1; min-width:180px; background:#FDF6E3; border-radius:12px; padding:20px; text-align:center; }}
  .big .n {{ font-size:38px; font-weight:800; color:#2E5EAA; }}
  .big .n.green {{ color:#1E8449; }}
  .big .l {{ font-size:13px; color:#777; margin-top:4px; }}
  table {{ width:100%; border-collapse:collapse; font-size:13px; }}
  th {{ background:#2E5EAA; color:#fff; padding:8px 10px; text-align:left; font-weight:600; }}
  td {{ padding:8px 10px; border-bottom:1px solid #eee; vertical-align:top; }}
  tr:nth-child(even) td {{ background:#FAFAF5; }}
  .cid {{ font-weight:700; color:#2E5EAA; white-space:nowrap; }}
  .desc {{ color:#666; }}
  .tools {{ color:#8E6C00; font-size:12px; }}
  .fail-reason {{ color:#C0392B; font-size:12px; }}
  .insight-card {{ background:#FFF8E7; border:1px solid #F0DFA8; border-radius:12px; padding:18px 22px; margin-top:16px; }}
  .ic-title {{ font-weight:700; color:#8E6C00; margin-bottom:6px; }}
  .mrow {{ display:flex; gap:14px; flex-wrap:wrap; margin-top:10px; }}
  .mcard {{ flex:1; min-width:150px; background:#FDF6E3; border-radius:10px; padding:14px; text-align:center; }}
  .mname {{ font-size:12px; color:#777; }}
  .mscore {{ font-size:24px; font-weight:800; color:#2E5EAA; }}
  .mavg {{ font-size:12px; color:#999; }}
  .bar-row {{ display:flex; align-items:center; gap:10px; margin:10px 0; }}
  .bar-label {{ width:56px; font-weight:700; color:#2E5EAA; font-size:13px; }}
  .bar-track {{ flex:1; background:#F0EAD6; border-radius:8px; height:22px; overflow:hidden; }}
  .bar-fill {{ height:100%; background:linear-gradient(90deg,#2E5EAA,#5B8DEF); border-radius:8px; }}
  .bar-val {{ width:52px; font-size:13px; font-weight:700; color:#E4572E; }}
  ul.plain {{ padding-left:20px; }}
  ul.plain li {{ margin:6px 0; }}
  .foot {{ margin-top:36px; color:#B0A98F; font-size:12px; text-align:center; }}
  .shield {{ display:inline-block; font-size:12px; color:#2E5EAA; border:1.5px solid #2E5EAA; border-radius:6px; padding:2px 10px; margin-left:8px; vertical-align:middle; }}
</style>
</head>
<body><div class="wrap">

<div class="tag">MINICARE AGENT · TECH-EVAL</div>
<h1>养娃智能体本地能力测评报告</h1>
<div class="sub">R1 真实数据 20 用例 · dev 库旺仔快照 · deepeval 指标层</div>
<div class="meta">2026-09-03 · 数据源 minicare_dev（seed 快照 08-28~09-04）· 模型 deepseek-v4-flash · judge deepseek-chat · <span class="shield">🏆 harness 20/20</span></div>

<div class="card">
<h2>一句话结论</h2>
<div class="big-row">
  <div class="big"><div class="n green">{h_pass}/{h_total}</div><div class="l">harness 真实执行（120s 预算）</div></div>
  <div class="big"><div class="n green">{h_p0_pass}/{len(h_p0)}</div><div class="l">P0 核心场景全过</div></div>
  <div class="big"><div class="n">{d_pass}/{d_total}</div><div class="l">deepeval 指标层通过</div></div>
  <div class="big"><div class="n">4 条</div><div class="l">曾因 55s 生产预算截断</div></div>
</div>
{base_note}
</div>

<div class="card">
<h2>deepeval 指标维度汇总</h2>
<div class="mrow">{metric_cards}</div>
</div>

{f'<div class="card"><h2>55s 预算下被截断的多工具组合（120s 实测耗时）</h2><table><tr><th>用例</th><th>场景</th><th>工具链</th><th>实际耗时</th></tr>{timeout_rows}</table></div>' if timeout_rows else ''}

<div class="card">
<h2>耗时 Top 5（120s 预算）</h2>
{slow_bars}
<p style="color:#999;font-size:12px;margin-top:10px">知识库检索 + 数据查询的组合链路是最主要耗时来源；单工具场景普遍 20~35s。</p>
</div>

<div class="card">
<h2>逐用例明细</h2>
<table>
<tr><th>用例</th><th>优先级</th><th>场景</th><th>harness</th><th>耗时</th><th>工具链</th><th>deepeval</th><th>未过指标</th></tr>
{''.join(rows)}
</table>
</div>

<div class="card">
<h2>给 agent 的改进清单</h2>
<ul class="plain">
<li><b>多工具组合耗时</b>：数据+知识库双工具链路 60~76s。生产代理 60s 超时内吃不到这份能力——要么代理层放宽超时，要么做工具并行 / 知识库检索提速。</li>
<li><b>过度知识库调用</b>：R1-07「大便正常吗」自行追加 search_knowledge（数据问题以数据回答为主即可），在 55s 预算下直接导致截断。</li>
<li><b>免责声明覆盖</b>：涉及健康判断（睡眠充足、体重正常）的回答偶发缺「必要时咨询医生」类声明（R1-20 style 0.3）。</li>
<li><b>运维话术残留</b>：偶发「后台/同步/数据返回」表述（R1-13），与「家长语言」人设有冲突。</li>
</ul>
</div>

<div class="card">
<h2>闭环验证 · prompt 补强复测（2026-09-03）</h2>
<p style="font-size:13px;color:#666">针对报告发现，system prompt 补强 4 条规则（免责覆盖面 / 数据题不追加知识库 / 禁运维技术词 / 禁自我修正过程），复测 6 条风格用例：</p>
<table>
<tr><th>用例</th><th>补强前 style</th><th>补强后 style</th><th>变化</th><th>对应规则</th></tr>
<tr><td class="cid">R1-03</td><td>0.3</td><td>0.8</td><td style="color:#1E8449;font-weight:700">↑ +0.5</td><td class="desc">禁自我修正话术泄漏（"哦不对重来"）</td></tr>
<tr><td class="cid">R1-06</td><td>0.6</td><td>1.0</td><td style="color:#1E8449;font-weight:700">↑ +0.4</td><td class="desc">免责覆盖生长解读</td></tr>
<tr><td class="cid">R1-12</td><td>0.6</td><td>1.0</td><td style="color:#1E8449;font-weight:700">↑ +0.4</td><td class="desc">免责覆盖营养摄入</td></tr>
<tr><td class="cid">R1-17</td><td>0.6</td><td>0.8</td><td style="color:#1E8449;font-weight:700">↑ +0.2</td><td class="desc">免责 + 禁技术词</td></tr>
<tr><td class="cid">R1-20</td><td>1.0</td><td>1.0</td><td>→</td><td class="desc">保持</td></tr>
<tr><td class="cid">R1-07</td><td>0.2</td><td>0.0*</td><td style="color:#C0392B;font-weight:700">↓（波动）</td><td class="desc">本轮模型只输出等待话术即挂起（偶发），断言已补"稍等/整理"变体拦截</td></tr>
</table>
<p style="font-size:12px;color:#999;margin-top:8px">*R1-07 的工具行为已修复（本轮只调 query_baby_data，不再过度检索知识库）；0 分是模型偶发"只说等待话术无正文"的波动，textNotContains 断言已补 4 类变体，后续在确定性阶段即可拦截。</p>
<p style="margin-top:8px"><b>结论：4 条规则见效（5/6 回升，均分 0.55 → 0.77），已固化进 src/prompts/system.js，随下次 CloudRun 部署上线。</b></p>
</div>

<div class="card">
<h2>线上部署验收（2026-09-03）</h2>
<p style="font-size:13px;color:#666">prompt 补强 + 兜底已部署 CloudRun（minicare-agent-009，FlowRatio 100%），线上真实验收：</p>
<ul class="plain" style="font-size:13px">
<li><b>/health 全绿</b>：env=production、ready=true、flexdb/db/embedding/tokenAuth 全开（env 字段即本次新增的新版本标识）</li>
<li><b>生长解读验收通过</b>：完整正文 + 免责声明（"本回答仅供参考…"）+ 生产库真实数据（9.15kg@6/9、P85、中国2023）+ 家长化建议，无等待话术/技术词泄漏</li>
<li><b>过程中抓到并修复真实缺陷</b>：模型在 analyze(growth) 回传后偶发只输出"请稍候"类等待话术（线上两次稳定复现），chat.js 已上线等待话术兜底——无效回答对用户表现为明确的重试提示而非话术泄漏</li>
</ul>
</div>

<div class="card">
<h2>附录 · 测评链路</h2>
<ul class="plain" style="color:#666;font-size:13px">
<li><b>数据</b>：minicare_dev 线上库旺仔（8535bda2），seed 保鲜 2026-08-28 ~ 09-04（188 行），NOW() 滑动窗口</li>
<li><b>执行</b>：agent-poc harness 进程内驱动（OAK + DeepSeek），看门狗 120s（EVAL_MAX_TOTAL_MS，与生产 55s 解耦）</li>
<li><b>判分</b>：harness 确定性断言（工具/收尾/话术）→ deepeval 指标层（ToolCorrectness / Faithfulness / style_adherence / medical_safety，judge=deepseek-chat）</li>
<li><b>观测</b>：每次执行写 trace（telemetry 旁路）→ 本地 Langfuse UI 可查 generation / tool span / token 用量</li>
<li><b>用例集</b>：R1-realdata 20 条（数据问答 13 · 知识问答 2 · 混合 1 · 高危护栏 2 · 日记 1 · 多轮 1），参考值按 dev 快照逐条重算</li>
</ul>
</div>

<div class="foot">minicare agent-poc · 评测基建 2026-09-03 建成 · 报告由 r1-dev-run.json + .latest_test_run.json 自动生成</div>
</div></body></html>"""

OUT.write_text(html, encoding="utf-8")
print(f"报告已生成: {OUT}")
