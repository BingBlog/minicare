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

## 三、PRD-009 宝宝日程表「今日作息计划 + 首页提醒」（**第 1 期已实现，待人工验证**）

> PRD：`docs/prd/PRD-009.md`。**实施派工**：`docs/prd/PRD-009-实施派工.md`（三层改动清单 / 契约变更表 / 常量单一定义处 / 分期与 MVS / 实施顺序硬约束）。
> P0 一期 = US-01~US-06（三层同版），P2 = US-07。
> 规模约束自查：新增 2 个页面（`schedule/index`、`schedule/today`）+ 1 张表（`schedule_template_item`，migration 022）。
> ⚠️ 两条硬顺序：**migration 022 → 服务端接口 → 小程序界面**；**后端先发 `bath` 枚举 → 前端后发选项**。
> 验收：后端 `npm run build` 通过；小程序 `tsc --noEmit` 与基线一致（**0 新增类型错误**）；`build:weapp` 产物含 `pages/schedule/{index,today}`。

- [x] **开工前置**：PRD §10 的 #1 默认模板 10 个时间点 / #2 判定窗口 60-90 分钟 / #3 三顿辅食统一提前 120 分钟 / #4 奶固定 4 顿 —— 已于 2026-10-09 全部确认
  - 剩余 #5 `other` 类型是否本期需要、#6 首页 Bar 与既有 `isNight` 的关系 —— 开发侧口径，不影响开工
- [x] **migration 022**：`schedule_template_item` 建表（含 `deleted_at` 软删除 + `KEY idx_sched_baby_time`）
- [x] **服务端 schedule 模块**：`schedule-item-type.ts`（枚举，破循环依赖）/ `schedule.constants.ts`（**判定窗口唯一定义处**）/ `schedule.default-template.ts`（10 项）/ `dto/` / `schedule.service.ts` / `schedule.controller.ts` / `schedule.module.ts`
- [x] **US-01 / US-02 作息计划页**：`pages/schedule/index`（默认模板待确认态 → 增删改 → 全量差集保存 → 本地预校验 + 服务端兜底）
- [x] **US-03 首页日程 Bar**：`pages/home/ScheduleBanner.tsx`（五态 + 60 秒本地倒计时），插入 `home/index.tsx` 的 `home-banners` 插槽（排在最前）；接口失败静默降级
- [x] **US-04 今日日程详情页**：`pages/schedule/today`（进度条 + 时间轴 + 六态徽标 + 点项预填记录时间/类型）
- [x] **US-05 判定口径**：`GET .../schedule/today` 服务端派生；六态状态机；辅食排除营养素（`feed_type='supplement'` 与 `complementary_food='营养素'` 两种历史口径）；复用 `FamilyService.getTodayRecords()` 同一取数口径
- [x] **US-06 活动类型新增 `bath`**（后端先发、前端后发）：`create-activity.dto.ts` / `app-config.data.ts` / mp `api/activity.ts` / `lib/constants.ts` / `ActivityTypeSection.tsx`（6→7 项，"其他"独占整行）/ `activity/index.tsx` / `ActivityColumn.tsx`；已同步 `docs/features/F05-activity.md`
- [x] **口径风险盯防（R1）**：日程 Bar 文案一律「计划 HH:mm」，禁用"预计"；与 `FeedingBanner` 不互相联动
- [x] **R2 已回写**：PRD-006 `01-现状与差距.md` §2.1 已加"计划侧最小实体见 PRD-009"一行；第 2 期实施时不得新建平行实体
- [x] **记录表单预填能力**（US-04 场景3 前置）：`records/feeding` 支持 `initTime`；`records/activity` 支持 `initTime` + `initType`
- [x] **文档同步**：`docs/features/F05-activity.md`（7 类型 + `bath` 边界说明）、`docs/tech/DB-02-schema.md`（补 `schedule_template_item` + 修正 `activity_type` 的废弃 TINYINT 口径）

### 三·补 · PRD-009 追加（2026-10-09 第 2 轮，已实现并接口验收）

> 用户报的三个问题 + 两个拍板决策（① 拖拽=拖动调序并**保存该顺序**；② 顺序兜底**不设偏差上限，纯按顺序**）。

- [x] **问题2 · 补记录跳转参数编码异常**（修复 + 全链路统一）
  - 根因：`Taro.useLoad(options)` **不解码**查询串，而发送端是 `encodeURIComponent` → `initTime=07%3A00` 原样进表单，`addMinutes()` 解析出 `[NaN]` → 界面显示 `NaN:NaN`
  - 修法：`lib/utils.ts` 新增 `decodeParam` / `decodeParams`；`useRecordInit.ts` 在 `opts` 层**统一解码**并新增 `onInitTime` 回调整体下发日程预填时间；`feeding` / `sleep`（不用该 Hook）各自显式解码；`records/index` 与 `medical/type-select` 透传前先解码（避免二次编码）
  - 顺带补齐：`diaper` / `medication` / `activity` 接 `onInitTime`；**`sleep` 新增 `initTime` → `start_time` 预填**（对应「该睡觉了」，此前该参数被静默丢弃）
- [x] **问题1 · 作息计划拖拽排序**：`migration 023` 加 `sort_order` + `idx_sched_baby_sort`；服务端 `selectItems` 改 `ORDER BY sort_order, execute_time, created_at`、保存按数组下标整体重写；小程序 `pages/schedule/index.tsx` 长按拖拽（`measureRowSlots` 缓存槽位 + 页面根节点 touch 事件）+ 删除保存前的强制按时间排序；契约新增 `ScheduleItem.sortOrder`
- [x] **问题3 · 顺序兜底配对**：`schedule.service.ts` 的 `deriveItem` 重构为 `deriveItems`（**两遍配对**：窗口匹配 → 同类未配对项 × 未消费记录按时间升序一一配对，不设偏差上限；安全闸 = 执行时间未到的项不参与）；口径写入 PRD §1.4.2
- [x] **验收**：服务端 `tsc --noEmit` exit 0；小程序 54 条既有错误 / **0 新增**；`build:weapp` 通过（产物含 `sched-item--dragging`、`boundingClientRect`）；端到端脚本 `scripts/e2e-schedule.mjs` **19 PASS / 0 FAIL**（T1 拖拽落库 / T2 顺序兜底 / T3 不跨类型误配 / T4 窗口优先）
- [x] **文档同步（第 2 轮）**：`PRD-009.md`（新 §1.4.2 + D11/D12 + R10/R11 + US-02 场景5/6 + US-05 场景9~12 + §3.2 DDL + §4 响应结构 + §5.3 改造表）、`PRD-009-实施派工.md`（§2.4/2.5 派生口径与出参 + §3.3 改造表 + §5.1/5.2/5.4）、`docs/tech/DB-02-schema.md`、`.agents/skills/minicare-dev/SKILL.md`（3 个新专节）

- [ ] **人工验证（dev mode）**：走一遍「首次进入→默认模板→保存→首页 Bar 五态→今日页补记录→洗澡项自动判定」
  - 追加：作息计划页长按拖动调序 → 保存 → 重进确认顺序未回弹；今日日程「去记录」确认预填时间为计划时间（不再出现 `NaN:NaN`）
- [ ] **待用户拍板的实现取舍（3 处偏离原稿，已写入 PRD §4）**
  - 路由由 `/api/schedule/*?babyId=` 改为**家庭维度** `/api/family/:familyId/schedule/*`（与 `records/*` 同鉴权口径）
  - 默认模板标记 `is_default` → **`isDefault`**（与同响应 `itemType`/`executeTime` 保持一致）
  - PRD §5.4 原定"作息入口放 QuickActions"，实际落地为**首页 banners 插槽内的独立引导条**（无模板时显示"去设置"）——避免把非记录项塞进 `RECORD_TYPE_*` 记录类型映射表
- [ ] **既有缺陷（本次顺带发现，未修）**：`TODO.md` 记录在案
  - `docs/tech/DB-02-schema.md` 的「表清单」严重滞后：只列 13 张，实际 30 张（需按 migration 全量重建）
  - `minicare-mp/src/lib/afterLogin.ts` 有未提交的新文件 + 1 个类型错误（`Family.role` 不存在），非本次改动

### 三·补｜日程项类型扩展 5 → 14 + 单一声明源（**2026-10-09 已实现并接口验收**）

> 诉求：作息计划页「添加一项日程 → 类型」原来只有 5 项，要支持小程序现有全部记录类型，并解决多处枚举漂移。
> 三个决策（用户 2026-10-09 拍板）：① 支持范围 = **仅「待办型」**；② 下发路径 = **复用 `GET /api/config`**；③ `growth` **直接不支持**。

- [x] **服务端单一声明源**：新增 `schedule-item-type.meta.ts`（纯数据：枚举值/默认名/分组/可判定/默认提前量）
      + `schedule-item-type.registry.ts`（`match` / `summary`，`Record<ScheduleItemType, …>` 强制穷举）
- [x] **枚举 5 → 14**：喂食 4（`feeding_formula` / `feeding_breast` / `feeding_food` / `feeding_supplement`）
      + 作息 3（`sleep` / `diaper` / `medication`）+ 活动 6（`activity_outdoor` / `activity_bath` / `_gross_motor` / `_fine_motor` / `_edu_play` / `_daily_care`）+ 其他 1
- [x] **消灭 switch**：`schedule.service.ts::matchRecord` / `buildSummary` 改为查表；
      `schedule.constants.ts` 的 `SCHEDULE_ITEM_TYPE_LABELS` / `isJudgableItemType` / `defaultPrepareOffsetMin` 改为从 meta 派生（**签名与函数名不变**，调用方零改动）
- [x] **`/api/config` 下发**：`app-config.data.ts` 新增 `scheduleItemTypes`（groups + items），`CONFIG_VERSION` → `2026-10-09.1`
- [x] **小程序消费下发**：`lib/schedule.ts` 新增 `buildScheduleTypeIndex()`；`pages/schedule/index.tsx` 的 `TYPE_OPTIONS` 硬编码清单**删除**，改为按分组渲染；
      `today.tsx` 的两份本地跳转表（`RECORD_WEB_ROUTE` / `RECORD_INIT_TYPE`）合并进 `SCHEDULE_ITEM_TYPE_RECORD`；`ScheduleBanner.tsx` 一并改为消费 config
- [x] **验收**：`tsc --noEmit` 本模块 **0 新增错误**（全量 54 条均为既有）；`build:weapp` 通过且产物含新分组样式；
      接口端到端 **10/11 PASS**（唯一「FAIL」是测试预期写错：`other` 在 12:00、当时 13:2x 落在窗口 [11:00,13:30] 内判 `doing` 属正确行为），
      `progress = {done: 8, total: 10}` 证明 `other` 未进分母；负例（同类项重叠 / 非法类型）均正确 400；测试数据已清空
- [ ] **人工验证（dev mode）**：作息计划页展开任一项目 → 「类型」区应显示 **喂食 / 作息 / 活动 / 其他 四组共 14 个** chip，可选中并保存
- [ ] **取舍遗留**：活动未展开 `activity_other`「其他活动」（避免与 `other`「自定义事项」两个"其他"混淆）；
      `activity_type = 'play' / 'tummy_time'` 历史值**不认领**（语义无法一对一映射）—— 如需认领导得补 registry
- [ ] **同类隐患待收敛（建议顺手做）**：`minicare-mp/src/lib/constants.ts::ACTIVITY_TYPE_LABELS` 与后端 `app-config.data.ts::ACTIVITY_TYPE_OPTIONS`
      仍是双写（上一轮刚修过一次键集不符导致文案退化的 bug）。`activityType` 已在 config 下发列表里，可改为消费 config

---

## 四、minicare-mp 小程序（前端）

### Bug 修复
- [ ] **Taro H5 喂养记录页布局问题**：`/pages/records/feeding/index` 顶部 Tab、奶量选择、保存按钮高度异常，图标与文字未对齐（小程序端正常，仅 H5）——在 http://192.168.1.16:10086 验证
- [x] 日记日期错位 / chat 页滚动 / `diary:changed` 未接线 —— 已随 B1–B8 修复完成（见归档）

### 第 1-2 期｜架构对齐（单一真相源收敛，PRD-006 V3.0 §1.3 / §10）
- [ ] **分位数计算收敛为一份**：mp `lib/growth-standards.ts` 与 minicare-agent `src/lib/growth.js` 同源复制 → 下沉服务端一份，两端只消费
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

## 五、功能迭代 F1–F6（跨 mp / server / agent，按「明确 × 简单」排序）

> 评估详见 `docs/agent/tech/OPT-20260919-线上助手问题分析与优化方案.md` §0.2。下面 4-6 两条在「五」「六」章有模块视角的对应条目，以本节为排期口径。

- [x] **F2 日记缺省语义改「昨天」（最简单）** —— 已完成 2026-09-19。`home/HomeDiaryCard.tsx`（原 `TodayDiaryCard` 重命名，日期+文案+跳转带参）、`home/index.tsx`（`loadDiaryPreview` 改用 `yesterdayStr()`）、`diary/index.tsx`（写日记带参+空态文案）、`chat/index.tsx`（preset 缺省改昨天）、`minicare-agent/src/prompts/system.js`（注入当前日期 + **规则 13b 日期硬性规则** + 示例三改「帮我写昨天的日记」）
  - 注：chat 页消费 `date` 参数、详情页「重新生成」带该篇日期**已随 B3 完成**
  - 顺带修掉既有缺陷：`home/index.tsx` 把 `getTodayDateStr()`（展示串 `9月19日 星期六`）当 `date` 参数传接口 → 必然被后端 `^\d{4}-\d{2}-\d{2}$` 拒 → 首页日记卡永久空态
- [x] **F1 日记自动保存闭环** —— 已完成 2026-09-19。**实现方式已修正**：去掉原计划的 `diary_draft` 事件（前端本就能从既有 `tool_result(generate_diary)` 得知本轮生成+权威日期，新事件等于同一事实双链路传递，违反单一真相源）。改为 `chat/index.tsx` 侧 `persistMessages(patch)` + `autoSaveDiary()`：`generate_diary` 完成且未中断 → 无日记则直接落库、已有则不覆盖并弹草稿层；新增 `looksLikeDiary()`（≥40 字且含日期行）防误存；消息下方「已保存到日记 · 查看」。**agent 侧零改动**
- [x] **F3 画像层最小可用版** —— 已完成 2026-09-19。新建 `minicare-agent/src/lib/profile.js`（约 550 行）：5 组 SQL（basic/formula/feeding/growth/freshness）+ 5 分钟 TTL + 单组失败静默降级 + `renderProfileBlock()`；`system.js` 注入 `profileBlock`；`runtime.js` 画像与 runtime 初始化并行
  - 顺带修掉 3 个既有缺陷：`growth.js::bucket()` 无 NaN 守卫（会凭空造分位档、报假数据）、`getBabyProfile`/`ageInMonths` 双份实现、喂养方式判定用「30 天累计条数」这一滞后指标（导致已停母乳仍被判混合喂养）
  - 回归脚本：`minicare-agent/scripts/verify-profile.mjs`（22 项断言全 PASS）
- [ ] **F4 日记结构化数据卡** —— **需 migration 021**（`highlights`/`summary_json` 列不存在）+ 展示形态待定稿 + 依赖 F1（F1 已完成）
- [ ] **F5 医疗/儿保数据获取能力** —— **硬卡 020 上生产**（疫苗本表生产不存在）
- [ ] **F6 画像 41 信号体系** —— 依赖 F3（已完成），6 阶段 / 约 7 SQL / 归一化映射表 / 8 项矛盾检测
- [ ] **agent 发版让 F2/F3 生效** —— prompt 日期规则与画像注入都在 agent 侧，本地验证已过（22 PASS），需 `cd minicare-agent && node scripts/deploy-agent.mjs` 后线上才生效；F1 只改小程序走 `build:weapp`（按环境切换规则，须经用户确认）

## 六、minicare-server（后端）

- [x] **现状感知 v1（第 1 期，最优先；可自验）**：不设目标、只算现状与过程合理性。范围＝PRD-006 §4 的 B/D/I 三组 + 6 条合理性判定（转奶阶内进度与距终点、排敏归一化计数与停滞项、一日种类与类别、维持暴露、数据可信度）；**零新表、零新录入、零界面改动**。方案见 `docs/tech/TECH-014-state-perception-v1.md`。**已上线 `minicare-agent-014`（2026-09-20）**：线上验收 0 次工具调用即答出六板块结论（转奶阶段与距终点、排敏计数/停滞项/重复建档、已耐受未维持、一日多样性、元信号护栏）；验收命令 `node scripts/verify-online.mjs "问题"`
  - [x] 干跑脚本落地并跑通（dev + 生产只读 SQL 双侧实测）
  - [x] 算法落 `minicare-agent/src/lib/perception.js`，注入 `system.js`（`PERCEPTION_INJECT=off` 可回滚）
  - [x] 参考值常量 `REF` 唯一出处，被判定规则共用
  - [x] 验收：`verify-perception.mjs` 52/52、`verify-profile.mjs` 22/22、`eval-agent --group=l1` 8/8
  - [x] 实跑对话验证：注入后 0 次工具调用、直接答出全部结论；元信号护栏生效（"不能据此说没有过敏反应"）
  - [ ] 发版到线上（agent 侧改动未发版前线上不生效）
  - [ ] 归一化别名表：确认「纯米粉 / 小米粉」是否同一食材（TECH-014 §12-Q1）
- [ ] **现状上首页**（第 2 期候选）：把同一批数字做成首页现状卡；出现第二个消费方时按 TECH-013 §4.1 ADR-001 把聚合下沉服务端
- [ ] **感知层完整版（第 1 期原口径，后置）**：8 个矛盾 flag + 频控、护栏出口校验、机制分型落库（migration 022）；方案见 `docs/tech/TECH-013-state-awareness-implementation.md`。**前置已满足**：现状感知 v1 已于 2026-09-20 上线并通过线上验收，本项可启动
- [ ] **排敏进度服务端聚合接口**（替代靠 agent 拉 205 条明细自己数）＝ F5/F6 的一部分
- [x] **agent 生成日记落库** ＝ **F1**（已完成；落库动作在小程序侧，后端 5 个 REST 已就绪，无需改动）
- [x] **`buildSystemPrompt` 增强**：已注入画像与当前日期（F2 的 prompt 侧 + F3 均完成）
- [ ] **生产库迁移 020**：生产仅 18 列、无 vaccine_schedule/baby_vaccine_setting；任何引用 `vaccine_*`/`checkup_*`/`sick_*` 的 agent tool 上线前必须先上 020（dev/staging 已 020/34 列）

## 七、minicare-agent（养娃智能体）

- [ ] **resume 优化（P1）**：时延 4.3-6.8s，大头是每请求 CLI spawn 3-5s
- [ ] **画像/感知信号接入**：转奶进度（formula_mix 阶梯）、生长分位数（percentileOf 已有但未进画像）、排敏双源合并（food_observation + feeding_food_item，需名称归一化）
- [ ] **元信号规则落地**：「无记录」≠「数据陈旧」（母乳 0 条=确定已停；症状 31 天无记录=信息缺失）；覆盖率 <50% 不下阴性结论
- [ ] 评测：R1 基线 15/20，感知层上线后需重跑；改判分逻辑须删 `.deepeval-cache.json`

## 八、数据与运维

- [ ] **旺仔睡眠数据待补**（奶量/大便/体重/身高较完整，睡眠缺失影响分析）
- [ ] 生产 schema 核查走 cloudbase MCP `queryMysqlDatabase`（`dbInstance.schema`=envId）
- [ ] 旺仔数据与其他孩子隔离（多孩子会话隔离是 agent 平台硬性要求）

## 九、知识库平台（PRD-008 / TECH-015 / TECH-017 / TECH-018）

- [x] **翻译步骤（阶段 A）已落地**（2026-10-09）：第 7 步 translate · 块级双语对 · 切片对照 TAB 三态视图+修正入口；CLI 与接口实测通过（详见 [`TECH-019`](docs/tech/TECH-019-kb-translate-step.md) §11 + [gotchas §13](docs/tech/TECH-015-kb-platform-gotchas.md)）。阶段 B（content_zh / 检索消费 / 跨语言评测）另案。
- [ ] **翻译剩余英文文档**：网页端「进行翻译」或 CLI `kb-pipeline step --step translate`（中文文档零成本；首份英文约 2–3 分钟）。
- [ ] **桌面客户端方案待评审**：Electron 壳 + Python sidecar，保留浏览器启动（`.app` vs `kb-pipeline serve` 同一后端、同一前端）。执行方案与分期见 [`docs/tech/TECH-017-kb-desktop-client.md`](docs/tech/TECH-017-kb-desktop-client.md)，**阶段 0（路径可注入 + 环境 profile + 写库闸门）与是否做壳解耦，建议先做**。
- [ ] **迁移 021 阶段 3（回填）**：dev 库 1586 行仍全 `enabled/NULL`，2 条 `[待复核]` 在字段上仍是 enabled —— **切 minicare-agent（阶段 4）之前必须先跑** `scripts/backfill-retrieval-status.py`。
- [ ] **staging / 正式库迁到 019 之后**：020/021/022/024 均未应用；桌面客户端切环境前必须补齐（TECH-017 R-2）。
- [ ] KB 平台真实路径统一验收（`index --write` / 质检实跑 / 发布与回滚 / 关键词 A/B），见 [`PRD-008/06`](docs/prd/PRD-008/06-开发进展与交接.md) §3。

---

## 十、代码质量（超长文件治理，2026-10-09 全仓扫描）

> 扫描口径：源码扩展名（ts/tsx/js/jsx/mjs/py/vue/scss/css/less），自动排除 node_modules、dist、.venv、压缩文件，共 865 个源码文件。
> 结果：**严格 >2000 行仅 3 个文件**（均核实主体为真实代码，非空行 2665 / 1845 / 1356）；>800 行共 23 个，其中**样式文件 8 个**（重灾区是样式，不是业务逻辑）。
> 聚集度排序：**minicare-mp 8 个（样式 6）** > minicare-web 4 > platform/web 3 > .agents 3（技能脚本，可忽略）> platform/api 2 > minicare-server 2（最大 974，最健康）> minicare-agent 1。

- [ ] **拆分候选 ①** `minicare-platform/web/src/styles.css`（2721 行 / 505 规则块）：按域拆分，可随页面改造渐进
- [ ] **拆分候选 ②** `minicare-platform/api/src/kb_pipeline/web/routers.py`（2192 行）：按业务域拆多个 router
- [ ] **拆分候选 ③** minicare-mp 样式体系：`_ipad-adapt-mixins.scss`（2052）+ `ipad-adapt.scss`（988）+ 各页独立大 scss（home 1337 / profile 1259 / feeding 911 / dashboard 878）；方向 = mixins 收敛 + 公共样式抽取
- [ ] **观察名单（暂不动）**：`minicare-web/src/components/ui/icons.tsx`（1626，图标集半自动生成、优先级别看低）、platform/web `types.ts`（996）、mp `ipad-adapt.scss`（988）、server `feed.service.ts`（974）/ `report.service.ts`（970）
- [ ] **是否启动拆分待拍板**（可先出 ① 的具体方案）

---

## 已完成归档

- [x] 文章5《宝宝便血了，先别慌》撰写 + HTML 可视化 + 发布（2026-09）
- [x] **线上助手 B1–B8 全部修复**（2026-09-19，8 个文件）：日记 DATE 收口、对话页滚动、日记日期跟随、medical 字段漂移（`hasTypedMedical` 运行时探测）、首页卡片闪动、`diary:changed` 接线、正文净化；验证：后端构建通过 + 小程序源码 0 类型错误 + B1 全链路 6 项断言 PASS
  - 遗留：**B8 的生产脏数据 SQL 待人工确认后执行**（`docs/agent/tech/OPT-20260919-fix-baby-diary.sql`）
- [x] minicare-agent 延迟尖刺修复：wire-proxy normalizeTarget + DNS 缓存（29s → 4.7s）
- [x] KB 检索向量缓存预热 + stale-while-revalidate（冷 6s → 热 0.1s）
- [x] mp 两个 bug 修复（列表页加载更多数据重复、辅食影响喂养间隔）
