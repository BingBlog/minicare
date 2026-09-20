# minicare 总待办清单

> 规则：每当有新任务、新发现的问题或完成了某项，都更新此文件。
> 状态标记：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已完成 · `[-]` 搁置/取消
> 每条待办尽量带上：背景一句话 + 关键文件/PRD 指针，方便后续直接捡起来继续推进。

---

## 一、内容创作（公众号 CMPA 系列）

- [~] **文章6《含乳糖与不含乳糖深度水解配方之区别》** —— 深度筹备中，待收尾
  - 需厘清：适度水解（预防用，非治疗）vs 深度水解（CMPA 治疗首选）的临床定位差异
  - 需对比两者营养构成与适用场景；品牌中立，不提具体品牌
- [ ] **CMPA 系列推进至第 8 篇**，文章 6 之后继续排期
- [ ] **敏宝辅食添加相关内容**探索（可作为后续选题）
- [ ] 文章存档：`docs/wechat-articles/`（MD + frontmatter），封面终版存 cover.png、清理中间产物

## 二、PRD-006 V3.0 落地分期（派工总口径）

> 口径来源：`docs/prd/PRD-006/04-实施派工.md` **§12.3（定性质：甲/乙/丙）+ §12.4（定期次）+ §8.1（定改哪些文件）**。
> 原 §8.7 的 B1-B6 与旧 §12.2 的 P0/P1/P2 两套批次口径**已废止**，不要再引用批次号。
> 规模约束（§12.6）：单期 ≤3 个小程序页面、≤1 张新表、必须能独立发版且有独立验收。

| 期 | 目标一句话 | 待办（详见下文各章） | 施工层 |
|---|---|---|---|
| **第 1 期 会看** | 助手开口就知道宝宝在哪一程，且知道什么时候不该下结论 | 感知聚合（10 组 41 信号 / 阶段判定 / 7 SQL + 5min TTL）、8 flags + 频控、元信号三态、护栏出口校验、排敏五态统一、机制分型落库（migration 022） | 服务端 + agent（**小程序近零改动**） |
| **第 2 期 打桥** | 分析结论能一键回到界面执行 | 建议卡 schema + 三块渲染、deep link 上下文、今日行动卡双端同源、分位下沉、扩展 `food_observation`、首页提醒改服务端、食材归一化 | 服务端 + agent + 小程序（**三层同版**） |
| **第 3 期 转奶主线** | 把"记录"变成"推进" | US-22 转奶体检 → US-23 转奶计划 + 表单预填 → US-24 记录派生打卡 → US-25 反应分级 | 服务端 + 小程序 + agent |
| **第 4 期 排敏主线** | 把食物谱扩开 | US-27 排敏排期与冲突检测、US-32 计划调整、US-20 里程碑地图 | 服务端 + 小程序 |
| **第 5 期 增值** | 长期粘性与价值证明 | US-28 耐受维持、US-30 复诊摘要（**需 020**）、US-29 收益账本、订阅消息、语音 L3 | 全线 |
| **并行轨 B 录入提速** | 让"说话就能录"覆盖到每个记录页 | 语音补全 ①②③ + 枚举对齐（**零依赖，可独立发版，优先解决录入慢/录入错**） | 服务端 + 小程序 |

**第 1 期最小切片**（§12.5）：不可切出＝感知聚合 + 注入契约 + 元信号三态 + 护栏出口校验；可后置＝8 flags（先发 3 个高价值 flag）、机制分型（但必须在任何计划生成前就位）、分位下沉与 DATE 收敛。**唯一不可延的是排敏五态统一。**

**明确不做（本版 5 期之外）**：多智能体分工、强化学习策略优化、音箱渠道上的计划推进、品牌/商品推荐、化验单识别。

---

## 三、minicare-mp 小程序（前端）

### Bug 修复
- [ ] **Taro H5 喂养记录页布局问题**：`/pages/records/feeding/index` 顶部 Tab、奶量选择、保存按钮高度异常，图标与文字未对齐（小程序端正常，仅 H5）——在 http://192.168.1.16:10086 验证
- [x] 日记日期错位 / chat 页滚动 / `diary:changed` 未接线 —— 已随 B1–B8 修复完成（见归档）

### 第 1-2 期｜架构对齐（单一真相源收敛，PRD-006 V3.0 §1.3 / §10）
- [ ] **分位数计算收敛为一份**：mp `lib/growth-standards.ts` 与 agent-poc `src/lib/growth.js` 同源复制 → 下沉服务端一份，两端只消费
- [ ] **首页排敏进度改为服务端聚合**（现为前端派生）
- [ ] **dashboard 派生待办**改为服务端产生
- [ ] **排敏口径统一为五态**（含 `paused`，PRD 曾写四态）；PRD-006 的 `food_intro_plan` 应改为扩展 `food_observation`，不新建平行表
- [ ] **边界守卫：全局确认无"对话/推送触发记录写入"的路径**（v0.1 的 5 个写工具已撤回，不得回退）

### 第 2 期｜打桥（PRD-006 V3.0 §7）
- [ ] **建议落卡 Advice-to-Card**：agent 建议类产出统一落成卡（`adviceId/kind/summary/target/confidence/expiresAt`），不写库，点"去处理"跳界面且参数预选
- [ ] **对话三块结构化渲染**：`pages/chat` 支持行动卡 / 建议卡 / 数据卡（v0.1 的"回执卡"已撤销）
- [ ] **deep link 上下文协议**：`intent/anchor/state/preset`，agent 起手先复述再回答
- [ ] **agent 只读分析增强**：接 PRD-006 V3.0 §4 状态感知聚合（阶段判定 + 8 flags），**不新增写工具**

### 并行轨 B｜语音录入（TECH-001 延伸，PRD-006 V3.0 §7.6）
- [ ] **① 入口下沉**：各记录表单页内嵌麦克风，带 `recordType` 上下文（现在仅 TabBar FAB 长按）
- [ ] **② 类型补齐**：后端 `VOICE_NLU_CONFIG` 增 `food_observation`（排敏打卡/反应，优先）/ `growth` / `medical`；前端 `VOICE_QUICK_TYPES` 的 `allergy` 与后端枚举对齐
- [ ] **③ 逐字段置信度**：`VoiceParseResult` 由整体 `high/low` 改为逐字段 confidence，低置信留空高亮；`low`/`insufficient` 禁止一键确认
- [ ] **④ 一句多条（L3）**：连续口述拆成多张草稿逐条确认；23 条 `testCases` 需同步扩充并保持全绿
- [ ] **⑤ 与计划联动**：转奶/排敏期"说一句完成打卡"＝语音→表单→保存→**服务端从记录派生打卡状态**（不新增打卡动作）

## 四、功能迭代 F1–F6（跨 mp / server / agent，按「明确 × 简单」排序）

> 评估详见 `docs/agent/tech/OPT-20260919-线上助手问题分析与优化方案.md` §0.2。下面 4-6 两条在「五」「六」章有模块视角的对应条目，以本节为排期口径。

- [x] **F2 日记缺省语义改「昨天」（最简单）** —— 已完成 2026-09-19。`home/HomeDiaryCard.tsx`（原 `TodayDiaryCard` 重命名，日期+文案+跳转带参）、`home/index.tsx`（`loadDiaryPreview` 改用 `yesterdayStr()`）、`diary/index.tsx`（写日记带参+空态文案）、`chat/index.tsx`（preset 缺省改昨天）、`agent-poc/src/prompts/system.js`（注入当前日期 + **规则 13b 日期硬性规则** + 示例三改「帮我写昨天的日记」）
  - 注：chat 页消费 `date` 参数、详情页「重新生成」带该篇日期**已随 B3 完成**
  - 顺带修掉既有缺陷：`home/index.tsx` 把 `getTodayDateStr()`（展示串 `9月19日 星期六`）当 `date` 参数传接口 → 必然被后端 `^\d{4}-\d{2}-\d{2}$` 拒 → 首页日记卡永久空态
- [x] **F1 日记自动保存闭环** —— 已完成 2026-09-19。**实现方式已修正**：去掉原计划的 `diary_draft` 事件（前端本就能从既有 `tool_result(generate_diary)` 得知本轮生成+权威日期，新事件等于同一事实双链路传递，违反单一真相源）。改为 `chat/index.tsx` 侧 `persistMessages(patch)` + `autoSaveDiary()`：`generate_diary` 完成且未中断 → 无日记则直接落库、已有则不覆盖并弹草稿层；新增 `looksLikeDiary()`（≥40 字且含日期行）防误存；消息下方「已保存到日记 · 查看」。**agent 侧零改动**
- [x] **F3 画像层最小可用版** —— 已完成 2026-09-19。新建 `agent-poc/src/lib/profile.js`（约 550 行）：5 组 SQL（basic/formula/feeding/growth/freshness）+ 5 分钟 TTL + 单组失败静默降级 + `renderProfileBlock()`；`system.js` 注入 `profileBlock`；`runtime.js` 画像与 runtime 初始化并行
  - 顺带修掉 3 个既有缺陷：`growth.js::bucket()` 无 NaN 守卫（会凭空造分位档、报假数据）、`getBabyProfile`/`ageInMonths` 双份实现、喂养方式判定用「30 天累计条数」这一滞后指标（导致已停母乳仍被判混合喂养）
  - 回归脚本：`agent-poc/scripts/verify-profile.mjs`（22 项断言全 PASS）
- [ ] **F4 日记结构化数据卡** —— **需 migration 021**（`highlights`/`summary_json` 列不存在）+ 展示形态待定稿 + 依赖 F1（F1 已完成）
- [ ] **F5 医疗/儿保数据获取能力** —— **硬卡 020 上生产**（疫苗本表生产不存在）
- [ ] **F6 画像 41 信号体系** —— 依赖 F3（已完成），6 阶段 / 约 7 SQL / 归一化映射表 / 8 项矛盾检测
- [ ] **agent 发版让 F2/F3 生效** —— prompt 日期规则与画像注入都在 agent 侧，本地验证已过（22 PASS），需 `cd agent-poc && node scripts/deploy-agent.mjs` 后线上才生效；F1 只改小程序走 `build:weapp`（按环境切换规则，须经用户确认）

## 五、minicare-server（后端）

- [x] **现状感知 v1（第 1 期，最优先；可自验）**：不设目标、只算现状与过程合理性。范围＝PRD-006 §4 的 B/D/I 三组 + 6 条合理性判定（转奶阶内进度与距终点、排敏归一化计数与停滞项、一日种类与类别、维持暴露、数据可信度）；**零新表、零新录入、零界面改动**。方案见 `docs/tech/TECH-014-state-perception-v1.md`
  - [x] 干跑脚本落地并跑通（dev + 生产只读 SQL 双侧实测）
  - [x] 算法落 `agent-poc/src/lib/perception.js`，注入 `system.js`（`PERCEPTION_INJECT=off` 可回滚）
  - [x] 参考值常量 `REF` 唯一出处，被判定规则共用
  - [x] 验收：`verify-perception.mjs` 52/52、`verify-profile.mjs` 22/22、`eval-agent --group=l1` 8/8
  - [x] 实跑对话验证：注入后 0 次工具调用、直接答出全部结论；元信号护栏生效（"不能据此说没有过敏反应"）
  - [ ] 发版到线上（agent 侧改动未发版前线上不生效）
  - [ ] 归一化别名表：确认「纯米粉 / 小米粉」是否同一食材（TECH-014 §12-Q1）
- [ ] **现状上首页**（第 2 期候选）：把同一批数字做成首页现状卡；出现第二个消费方时按 TECH-013 §4.1 ADR-001 把聚合下沉服务端
- [ ] **感知层完整版（第 1 期原口径，后置）**：8 个矛盾 flag + 频控、护栏出口校验、机制分型落库（migration 022）；方案见 `docs/tech/TECH-013-state-awareness-implementation.md`。**须在现状感知 v1 验收通过后启动**
- [ ] **排敏进度服务端聚合接口**（替代靠 agent 拉 205 条明细自己数）＝ F5/F6 的一部分
- [x] **agent 生成日记落库** ＝ **F1**（已完成；落库动作在小程序侧，后端 5 个 REST 已就绪，无需改动）
- [x] **`buildSystemPrompt` 增强**：已注入画像与当前日期（F2 的 prompt 侧 + F3 均完成）
- [ ] **生产库迁移 020**：生产仅 18 列、无 vaccine_schedule/baby_vaccine_setting；任何引用 `vaccine_*`/`checkup_*`/`sick_*` 的 agent tool 上线前必须先上 020（dev/staging 已 020/34 列）

## 六、agent-poc（养娃智能体）

- [ ] **resume 优化（P1）**：时延 4.3-6.8s，大头是每请求 CLI spawn 3-5s
- [ ] **画像/感知信号接入**：转奶进度（formula_mix 阶梯）、生长分位数（percentileOf 已有但未进画像）、排敏双源合并（food_observation + feeding_food_item，需名称归一化）
- [ ] **元信号规则落地**：「无记录」≠「数据陈旧」（母乳 0 条=确定已停；症状 31 天无记录=信息缺失）；覆盖率 <50% 不下阴性结论
- [ ] 评测：R1 基线 15/20，感知层上线后需重跑；改判分逻辑须删 `.deepeval-cache.json`

## 七、数据与运维

- [ ] **旺仔睡眠数据待补**（奶量/大便/体重/身高较完整，睡眠缺失影响分析）
- [ ] 生产 schema 核查走 cloudbase MCP `queryMysqlDatabase`（`dbInstance.schema`=envId）
- [ ] 旺仔数据与其他孩子隔离（多孩子会话隔离是 agent 平台硬性要求）

---

## 已完成归档

- [x] 文章5《宝宝便血了，先别慌》撰写 + HTML 可视化 + 发布（2026-09）
- [x] **线上助手 B1–B8 全部修复**（2026-09-19，8 个文件）：日记 DATE 收口、对话页滚动、日记日期跟随、medical 字段漂移（`hasTypedMedical` 运行时探测）、首页卡片闪动、`diary:changed` 接线、正文净化；验证：后端构建通过 + 小程序源码 0 类型错误 + B1 全链路 6 项断言 PASS
  - 遗留：**B8 的生产脏数据 SQL 待人工确认后执行**（`docs/agent/tech/OPT-20260919-fix-baby-diary.sql`）
- [x] agent-poc 延迟尖刺修复：wire-proxy normalizeTarget + DNS 缓存（29s → 4.7s）
- [x] KB 检索向量缓存预热 + stale-while-revalidate（冷 6s → 热 0.1s）
- [x] mp 两个 bug 修复（列表页加载更多数据重复、辅食影响喂养间隔）
