# agent 评测（agent-poc/scripts/eval）

> 对应 TECH-010《敏宝助手 Agent 测评方案与技术调研》。P4 落地目录。
> 测的是**被测 agent 的真实行为**（工具调用 / 回答质量 / 护栏 / 会话 / 性能），全部通过 `buildAgent` 本地驱动，不依赖 HTTP 与 FlexDB 临时凭证。

## 结构

```
scripts/eval/
├── lib/
│   ├── agent-runner.mjs   # 复刻 chat.js 事件循环的本地驱动（工具循环防护 + 看门狗）
│   ├── assert.mjs         # 确定性断言（工具名/参数/次数/关键词/done）
│   └── judge.mjs          # LLM-as-judge（deepseek-v4-pro，忠实/完整/护栏/风格）
├── cases/                 # 用例库（JSON）
│   ├── l0-retrieval.json  # L0 检索冒烟
│   ├── l1-tools.json      # L1 工具调用正确性
│   ├── l2-answer.json     # L2 端到端回答质量
│   ├── l3-safety.json     # L3 安全与护栏
│   ├── l4-session.json    # L4 对话与会话
│   └── r1-realdata.json   # R1 线上真实数据用例（旺仔，生产库，运行方法见 R1-realdata-用例说明.md）
├── eval-agent.mjs         # 主 harness
├── rejudge.mjs            # 裁判试跑：用当前裁判配置对**历史回答**重判（不跑 agent、不写台账；平台「测评裁判」页调用）
└── gate.mjs               # 上线闸门（P0 指标汇总）
```

## 用例格式

```json
{
  "id": "L1-01",
  "desc": "知识问题应触发 search_knowledge",
  "priority": "P0",
  "message": "深度水解配方怎么选？",
  "ctx": { "userId": "…", "familyId": "…", "babyId": "…" },
  "history": [],                      // 多轮/会话恢复用，注入 systemPrompt
  "images": [],                       // 图片输入 [{fileId,mimeType}]（预留）
  "expect": {                         // 确定性断言
    "toolCalls": [{ "name": "…", "input": {"key": {"contains": "…"}}, "count": {"gte":1,"lte":1} }],
    "noToolCalls": false,
    "minToolCalls": 1,
    "maxToolCalls": 3,
    "textContains": [],
    "textNotContains": ["正在检索"],
    "done": true,
    "answerNotEmpty": true
  },
  "judge": {                          // LLM-as-judge（确定性断言通过后才执行）
    "faithfulness": true,
    "completeness": { "goldenPoints": ["…"] },
    "guardrail": true,
    "style": { "needsDisclaimer": true }
  }
}
```

参数匹配规则：`contains`（包含）/ `eq`（等于）/ `oneOf` / `exists`。

## 用法

```bash
# 前置：.env.local 含 DEEPSEEK_API_KEY（及 DB/TOKENHUB 供工具真实执行）

# 只跑 P0 用例 + judge（默认）
node scripts/eval/eval-agent.mjs

# 跑全部 / 指定组 / 指定用例
node scripts/eval/eval-agent.mjs --all
node scripts/eval/eval-agent.mjs --group=l1
node scripts/eval/eval-agent.mjs --id=L3-01

# 跳过 LLM-judge（快速确定性回归）
node scripts/eval/eval-agent.mjs --all --no-judge

# 多轮消抖（judge 波动时取多数）
node scripts/eval/eval-agent.mjs --all --runs=3

# 导出报告
node scripts/eval/eval-agent.mjs --all --json=report.json

# 上线闸门（P0 指标：完整率/幻觉率/护栏/收敛/done）
node scripts/eval/gate.mjs

# 裁判试跑：对历史回答重判（校准裁判 prompt 用；判分器与主 harness 完全一致）
node scripts/eval/rejudge.mjs --case-file=<单用例 json> --fixture-file=<{answer,toolCalls} json> \
  [--judges-file=<judges.json>] --out=<verdict json>
```

## 指标口径（对齐 TECH-010 §2.1）

| 指标 | 来源 |
|---|---|
| 关键信息完整率 | judge.completeness（covered/total） |
| 硬幻觉率 | judge.faithfulness.hardHallucination |
| 高危护栏命中率 | judge.guardrail.pass |
| 工具收敛率 | toolCalls ≤3 且未 forceFinished |
| done 到达率 | forceFinished=false |

## 已知边界

- 鉴权/ctx 伪造（L3-13/14）与 FlexDB 跨请求恢复（L4-03 真实链路）属于 **HTTP 集成层**，本 harness 不覆盖，需走 minicare-server 代理层测试。
- judge 存在 LLM 波动：多轮 `--runs=3` 取多数；数值与工具类一律确定性断言。
- 评测调用真实 DeepSeek 与 dev 库，注意耗时与成本（每用例 10-45s，全量约 13 分钟，带 judge 约 30 分钟）。

## 2026-08-23 首轮实测

- 26 用例确定性断言 25/26 通过（P0 18/19），唯一失败 L1-08（组合工具收敛监控，真实性能问题，见下）。
- **组合工具场景超时**：search_knowledge / analyze(summary) 执行耗时 15-25s，叠加易触发 55s MAX_TOTAL_MS（L2-01/L1-05/L1-08 均曾出现）。analyze_baby_data(summary) 内部串行 21 次 DB 查询是主要耗时源。
- 模型偶发输出"正在查询"延迟话术（L1-02 首轮抓到，复跑消失）。
- judge 波动实证：L3-01 style 一次 fail 一次 pass，建议 `--runs=3`。
