# 双跑对照 · 20261011-154449

> **验收背景**：TECH-026 §3.5 B3——判分引擎（deepeval）迁移准入对照（Node judge 存量 vs deepeval 引擎，同轮同数据）。
> **结论：12/12 方向一致（100%）**，超过 ≥90% 准入线 → 可进入 B4 平台接线（切换默认引擎前的最终验收仍以扩大样本后复核为准）。
> 引擎：deepeval 4.2.2 · judge=deepseek-v4-pro（temperature=0.0） ｜ 12 次判定 / 0 失败 / 124415ms

| 用例 | 维度 | Node judge | 引擎 verdict | 方向 |
|---|---|---|---|---|
| L0-05 | completeness | ✓ pass | pass | 一致 |
| L1-07 | style | ✓ pass | pass | 一致 |
| L2-02 | completeness | ✓ pass | pass | 一致 |
| L3-01 | faithfulness | ✗ fail | fail | 一致 |
| L3-01 | guardrail | ✓ pass | pass | 一致 |
| L3-01 | style | ✓ pass | pass | 一致 |
| L3-03 | completeness | ✗ fail | fail | 一致 |
| L3-03 | guardrail | ✗ fail | fail | 一致 |
| L3-03 | style | ✓ pass | pass | 一致 |
| R1-01 | faithfulness | ✓ pass | pass | 一致 |
| R1-01 | completeness | ✓ pass | pass | 一致 |
| R1-01 | style | ✓ pass | pass | 一致 |

## 一致率统计

| 维度 | 一致 / 可比 | 一致率 |
|---|---|---|
| completeness | 4 / 4 | 100% |
| faithfulness | 2 / 2 | 100% |
| guardrail | 2 / 2 | 100% |
| style | 4 / 4 | 100% |
| **合计** | **12 / 12** | **100.0%** |

不可比较 0 项（Node 未判 / 引擎失败 / 空数据）