# R1 线上真实数据用例集说明（cases/r1-realdata.json）

> 目标：用**线上真实旺仔数据**驱动 agent 回答质量评估。用例包含：问题、参考答案、执行过程预期（调用的工具+参数）、是否需要召回知识库（`kbRecall` 字段）、LLM-judge 评分要点（`judge`）。
> 创建：2026-08-30 ｜ 组名 `r1-realdata` ｜ 20 条用例（P0×11 / P1×7 / P2×2）

## 一、数据基础（线上库快照 2026-08-30）

- **宝宝**：旺仔，男，2025-12-28 生（评测时约 8 月龄）
- **babyId**：`a54c8980-2aac-473c-a26f-a150fce7ec70`（线上库有两个同名旺仔，此为记录完整者；另一 `e541b81c…` 仅 1 条记录）
- **familyId**：`6bb0e45b-d808-49cf-84c2-9ef7e40abe84`（8 名成员，owner=`308572f1…`）
- **库**：`minicare-cloud-6gqledlle0132cbe`（CynosDB 同实例，与 CloudBase 环境同名）

| 维度 | 快照数据 | 用例依赖点 |
|---|---|---|
| 配方奶 | 近7天 38次/6390ml，日均约900ml（750~1050），每天5-7顿，单次以210ml为主；近30天日均约894ml | R1-01/02/05/17 |
| 母乳 | 近90天 0 条 | R1-10（无数据诚实） |
| 睡眠 | 近7天 42次/4223min，日均约10.1h；**8/25 仅5.7h**（其余9.8~12.2）；近30天日均11.4h | R1-03/04/05/20 |
| 尿布 | 近7天仅4条 dirty、性状 normal | R1-07 |
| 生长 | 10条记录至 **2026-06-09**（体重9150g），此后无新测量；9.15kg@8月龄男 ≈ P50-P85（中国2023：P50=8.7 / P85=9.8） | R1-06 |
| 健康 | 8/17-8/28 共12条体温记录（36.4~37.8，无发热） | R1-08 |
| 表现 | 4条，含 8/19「喷射性呕吐」 | 安全用例背景 |
| 活动 | 近90天 0 条（最近 2026-05-04） | R1-09（无数据诚实） |
| 辅食 | 近30天有记录（真实食物有米粉/西兰花/土豆泥/鸡肉等），**2026-09-01 起工具已 join feeding_food_item 输出食物名** | R1-11（正向断言） |
| 营养素 | 近30天约38条，supplement_items 为 JSON，**2026-09-01 起工具已解析输出名称（维生素 D）** | R1-12（正向断言） |
| 就医 | 8/19 checkup+sick、5/4 疫苗、4/14「补铁 加奶量」，**2026-09-01 起新增 medical 维度可查** | R1-13（正向断言） |
| 知识库 | 1586 条 active（含向量），CMPA/辅食/过敏急救等 17 个 module | R1-15/16/17 |

## 二、场景覆盖矩阵

| # | 场景 | 工具/参数预期 | kbRecall | 优先级 |
|---|---|---|---|---|
| R1-01 | 今日奶量 | query(feeding) | 否 | P0 |
| R1-02 | 近7天奶量 | query(feeding, days=7) | 否 | P0 |
| R1-03 | 睡眠情况 | query(sleep) | 否 | P0 |
| R1-04 | 睡眠异常 | analyze(trend,sleep) **或** query(sleep,trend) 双路径 | 否 | P0 |
| R1-05 | 7天总结 | analyze(summary) | 否 | P0 |
| R1-06 | 生长百分位 | analyze(growth) | 否 | P0 |
| R1-07 | 大便情况 | query(diaper) | 否 | P1 |
| R1-08 | 发烧排查 | query(health) | 否 | P1 |
| R1-09 | 活动（无数据） | query(activity) → hasData=false | 否 | P1 |
| R1-10 | 母乳（无记录） | query(feeding) → 母乳0条 | 否 | P1 |
| R1-11 | 辅食名称（已支持 join） | query(feeding) → 报出真实食物名 | 否 | P1 |
| R1-12 | 补充剂种类（已支持解析） | query(feeding) | 否 | P2 |
| R1-13 | 就医记录（已支持 medical 维度） | query(medical) | 否 | P2 |
| R1-14 | 写今日日记 | generate_diary(date) | 否 | P0 |
| R1-15 | 深水解 vs 氨基酸 | search_knowledge(含"水解") | **是** | P0 |
| R1-16 | 敏宝辅食原则 | search_knowledge | **是** | P0 |
| R1-17 | 奶量够不够（数据+知识） | query(feeding) + search_knowledge(可选) | **是** | P1 |
| R1-18 | 高危：大量便血 | 无需工具，直接护栏 | 否 | P0 |
| R1-19 | 高危：喷射性呕吐 | 无需工具，直接护栏 | 否 | P0 |
| R1-20 | 多轮指代"那睡眠呢" | query(sleep) | 否 | P1 |

## 三、运行方法

```bash
# 关键：DB_NAME 指向线上库（环境变量优先于 .env.local，override:false）
# 工具全部 SELECT-only，对线上库安全
cd minicare-agent
DB_NAME=minicare-cloud-6gqledlle0132cbe node scripts/eval/eval-agent.mjs --group=r1            # P0
DB_NAME=minicare-cloud-6gqledlle0132cbe node scripts/eval/eval-agent.mjs --group=r1 --all      # 全部
DB_NAME=minicare-cloud-6gqledlle0132cbe node scripts/eval/eval-agent.mjs --group=r1 --all --runs=3   # judge 消抖
```

## 四、2026-08-30 冒烟结果

| 用例 | 结果 | 说明 |
|---|---|---|
| R1-02 | ✅ 45s | query(feeding,days=7)，日均奶量正确 |
| R1-06 | ✅ 37s | analyze(growth)，百分位与记录如实 |
| R1-04 | 初版❌→放宽后✅ | **发现**：「有没有异常」模型 2/2 稳定走 `query(sleep, aggregate=trend)` 而非 `analyze(trend)`，回答质量达标（准确定位 8/25、家长化）。属 systemPrompt 的路由灰区——systemPrompt 规则 6 说"趋势→analyze"，模型未遵守但结果更好。可选优化：规则 6 改为"单维趋势可用 query(aggregate=trend)，跨维总结用 analyze"，或将本用例恢复严格断言以驱动 prompt 修正 |

## 五、工具能力边界与已知改进项（已修复，用例同步转为正向断言）

| # | 原问题 | 修复 | 验证 |
|---|---|---|---|
| 1 | 辅食名：food 子表 select 全 NULL，未 join `feeding_food_item` | `queryFeedingRows` 对 food 子表 LEFT JOIN，输出 food_name/amount_g/amount_note | ✅ 线上实测返回「青菜/纯米粉」等真实食物名 |
| 2 | 补充剂种类：`supplement_items` JSON 未解析 | supplement 子表解析 JSON → `supplement_items:[{label,key,dose,unit}]` | ✅ 实测返回「维生素 D」 |
| 3 | 就医记录：`medical_record` 不在工具覆盖 | METRICS 新增 `medical`（→ medical_record，timeCol=visit_date），query/analyze 均可用 | ✅ 实测 90 天窗口返回 8/19 checkup+sick |
| 4 | generate_diary 忽略 date：`dayRecords` 固定 days=1（NOW 窗口） | 新增 `queryMetricOnDate(babyId, metric, date)` 按日精确取数；babyInfo 月龄按日记日期算 | ✅ 实测 date=2026-08-29 聚合该日 feeding:8/sleep:6 |
| 5 | 生长百分位用当前月龄 | `growthAnalysis` 改用 `ageInMonths(birth, last.record_date)`（测量日月龄） | ✅ 9.15kg@5月龄 → **P85-P97**（原按 8 月龄误判 P50-P85，掩盖偏胖） |
| 6 | systemPrompt 规则 6 路由灰区（「有没有异常」走 query 而非 analyze） | 规则 6 改为「单维趋势 query(trend) 或 analyze(trend) 皆可」 | 待全量回归 |
| 7 | 服药记录：`medication_record`（migration 013）不在工具覆盖，问「最近在吃什么药」答不出（2026-09-21） | METRICS 新增 `medication`（→ medication_record，timeCol=record_time，过滤 `deleted_at`）；该维度列清单显式化以剔除 `recorded_by`（用户 UUID）；同时纳入 `profile.freshness` 与 inject 块 | ✅ 实测 90 天窗口返回氯雷他定糖浆 / 西替利嗪滴剂；画像出现「服药 32 天前」 |

> ⚠️ R1-06 百分位预期已随修复改为 **P85-P97（5 月龄测量）**，运行前请勿回退旧值。
> `food_observation`（辅食过敏观察）仍未接入工具，如后续需要可在 METRICS 增加。
> 90 天窗口漂移：生长 6/9 记录在 ~2026-09-07 后移出窗口，R1-06 将变为 hasData=false——届时应先给旺仔补录一条最新体重再跑。

## 六、维护建议

- 数值类断言一律"区间 + judge goldenPoints"，不写精确值（NOW() 滑窗）。
- 每月对照线上数据快照刷新 `_meta.keyNumbers` 与 refAnswer。
- 新增业务工具后，在矩阵中补场景，并优先把"工具盲区"用例（R1-11/12/13）转成正向数据断言。
