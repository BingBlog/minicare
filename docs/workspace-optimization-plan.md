# minicare 工作空间目录与文档管理优化方案

> 日期：2026-08-23
> 背景：工作空间文件与文档持续膨胀，根目录散落多份大文档、docs/ 索引失效、知识库双处并存、命名规范不统一，导致 coding agent 上下文污染、真源不明、检索成本高。
> 原则：**不删除任何文件，全部 git mv 保留历史；能不物理移动的用状态标注代替；一次性批量更新引用链。**
>
> ✅ **执行状态：2026-08-23 已按本方案完成落地**（commit `1567c2a`，回滚点 `pre-docs-reorg`）；文档管理规范已固化进 AGENTS.md。

---

## 一、现状快照

```
minicare-v1/                              ← 根目录 13 个条目
├── 1-5-year-plan.md       128KB  ← 商业测算报告（创业文档）
├── MVP-MRD.md              22KB  ← 市场需求文档
├── MVP-PRD.md             121KB  ← 巨型 PRD（2404 行，已有拆分版！）
├── minicare-research.md    31KB  ← 早期调研（与 docs/ 产品文档重复）
├── hardware-specs.md        4KB  ← 音箱硬件规格（孤立无家）
├── AGENTS.md / CLAUDE.md          ← agent 规则入口（有效）
├── Claw/                          ← 空目录！无任何内容
├── agent-poc/       419MB   ← node_modules 占 418MB，代码仅 172KB
├── minicare-platform/api/      239MB  ← 知识库管线工程（Python）
├── minicare-mp/ server/ web/      ← 三个正式包
├── Design-Reference/  53 张 png   ← 历史图标参考
├── ui-draft/          15 个 html  ← 历史原型
└── docs/                        ← 文档唯一收纳地（但内部混乱）
    ├── README.md         ← 索引只覆盖 tech/features，已过时
    ├── 13 个散装 md     ← cr-mvp / wangzai-analysis / 中文命名调研等，未入索引
    ├── tech/ 22 篇      ✓ 命名规范（INFRA-*/DB-*/TECH-*）
    ├── features/ 16 篇  ✓ 命名规范（F01~F14）
    ├── prd/             ✓ PRD-001~004 + PRD_REGISTRY 总集
    ├── agent/           ✓ M01~M08（prd/ tech/ 双目录）
    ├── wechat-articles/ ← 01~08 文章（md + 子目录结构不统一）
    ├── 敏宝知识库/      86MB ← 中文目录名；源文件 + 调研文档混放
    └── 敏宝日记1.0版本问题分析与解决方案.md  ← 中文文件名
```

**关键数据**：git 追踪 1664 文件（223 个 md）；node_modules 均已被各子包 .gitignore 忽略（安全）；`private.wxac792556967d5838.key` 未被追踪（安全）；`.gitnexus/` 227MB 已忽略（正常）。

---

## 二、与 coding agent 最佳实践的差距

### 最佳实践基线（coding agent 视角）

| # | 最佳实践 | 现状 | 差距 |
|---|---------|------|------|
| B1 | 根目录只留导航文件（README + AGENTS），文档全部进 docs/ | 5 份大 md 共 **1.9MB** 散落根目录 | ❌ 严重 |
| B2 | 每个信息主题只有**一个权威文档**（Single Source of Truth） | 产品描述 3 份重复、PRD 三层并存 | ❌ 严重 |
| B3 | docs/ 有**完整且强制维护**的索引 | 索引覆盖不足 40%，新增文档从不登记 | ❌ 严重 |
| B4 | 命名规范统一（英文 + 前缀编号），便于 agent 模式识别 | 英文前缀体系与中文散装文件名混用 | ⚠️ 中等 |
| B5 | 文档有**生命周期状态**（draft/active/superseded/archived） | 全部无状态标记，历史与现行无法区分 | ⚠️ 中等 |
| B6 | 历史产物有明确标注，agent 不会误用 | Design-Reference/ui-draft 无任何说明 | ⚠️ 中等 |
| B7 | 空目录不占位、不产生歧义 | Claw/ 空目录与 WorkBuddy/Claw 项目混淆 | ⚠️ 轻微 |

### 问题清单

#### P0 严重（直接影响 agent 工作质量）

**P0-1 根目录文档堆砌，agent 启动即被 1.9MB 文档污染 context**
- `MVP-PRD.md`（2404 行）是**历史快照**——现行规格早已拆分为 `docs/features/F01~F14`（docs/README.md 自己写的："开发时直接阅读 features/ 文件，无需翻阅完整 PRD"），但大部头还躺在根目录，agent 每次扫描都会读到
- `1-5-year-plan.md`（商业测算）、`minicare-research.md`（早期调研）与开发任务无关，却和代码入口平级
- 影响：上下文浪费、两份信息（大部头 vs 拆分版）必有一份过时，agent 无法判断信谁

**P0-2 单一事实源缺失，产品描述三处重复**
- 产品描述：`minicare-research.md`（根）≈ `docs/project-intro.md`（2026-08-15 更新）≈ `docs/overview.md`（2026-05-03 旧）—— 三份并存且更新日期不一致
- PRD 三层：根 `MVP-PRD.md` vs `docs/prd/PRD-001~004`（增量）vs `docs/features/F01~14`（拆分）
- 影响：agent 引用时无法确定权威版本 → 引用过时信息 → 实现偏差

**P0-3 docs/README.md 索引失效**
- 索引只列了 tech/ 与 features/；docs 根下 13 个散装 md、`prd/`、`agent/`、`wechat-articles/`、`敏宝知识库/` 全部未登记
- 影响：agent 不知道存在哪些文档 → 要么全盘扫描费 token，要么漏读关键文档

#### P1 中等（增加 agent 理解成本）

**P1-1 命名规范不一致**
- 中文文件名与英文前缀体系并存：`微信开发者工具调试协议调研.md`、`敏宝日记1.0版本问题分析与解决方案.md`、`敏宝知识库-知识清单与纳入评估.md` vs `INFRA-*`/`F0x-*`/`PRD-0xx`
- **两套 PRD 编号体系**：`docs/prd/PRD-001~004` vs `docs/agent/prd/M01~M08`——M 系列实际是 PRD-003 的模块级展开，但没有任何映射说明
- 影响：agent 检索模式识别失败，编号冲突导致引用混乱

**P1-2 知识库位置割裂、目录命名混淆**
- 知识"资料"在 `docs/敏宝知识库/`（86MB：源文件 PDF + 12 份调研文档混放），知识"工程"在 `minicare-platform/api/`（239MB 管线代码 + 产物），两处互无指引
- 中文目录名被 15+ 个文档引用，agent 和开发者都难以快速分清"资料 vs 工程"

**P1-3 历史产物无状态标记**
- `Design-Reference/`（53 张 png 图标参考）、`ui-draft/`（15 个 html 原型）、`minicare-web/`（维护模式）—— 均无 README 说明"这是历史产物"
- 影响：agent 可能把历史原型当现行设计规范引用，或对维护模式项目做无谓修改

**P1-4 过程性文档与长期文档混放**
- `docs/` 根下 `cr-mvp.md`（一次性的代码审查报告）、`敏宝日记1.0版本问题分析与解决方案.md`（复盘）与 `architecture.md`（长期有效）平级混放
- 影响：agent 分不清"历史事实"与"现行规范"

#### P2 轻微

**P2-1** `Claw/` 空目录占位——与真实的 `~/WorkBuddy/Claw` 项目混淆，无任何说明
**P2-2** `wechat-articles/` 结构不统一：01~04 是 "md + 子目录（cover/visual/html）"，05 只有 md，`images/` 为空目录
**P2-3** `minicare-mp/.env.development/.env.production/.env.staging` 被 git 追踪（内容仅为 API URL/auth 模式，无密钥，属低风险；可接受，不必处理）

---

## 三、目标结构

```
minicare-v1/
├── README.md                   ← 【新增】30 秒导航：项目是什么 + 各目录一句话状态
├── AGENTS.md                   ← 更新：增加"文档管理规范"小节
├── CLAUDE.md                   ← gitnexus 自动生成，不动
├── .agents/ .workbuddy/ .gitnexus/   ← 隐藏配置，不动
├── minicare-server/  minicare-mp/  minicare-web/   ← 三个包，不动
├── agent-poc/                  ← 保留（README 已有状态与结论，无需改动）
├── minicare-platform/api/                ← 保留（工程代码）
├── Design-Reference/  ui-draft/     ← 原位保留 + 状态标注（只加 README，不移动）
├── docs/                       ← 所有文档唯一收纳地
│   ├── README.md               ← 【重写】全量索引 + 生命周期状态列
│   ├── business/               ← 【新】1-5-year-plan / MVP-MRD / MVP-PRD(superseded)
│   ├── product/                ← 【新】overview（合并 3 份重复后唯一）/ design-system
│   ├── prd/  features/  tech/  agent/      ← 已有体系，保留
│   ├── hardware/               ← 【新】hardware-specs + 音箱/摄像头调研 4 篇
│   ├── knowledge/              ← 【新】原 敏宝知识库（源文件/ + 调研/ 分目录）
│   ├── reviews/                ← 【新】cr-mvp / 敏宝日记1.0问题分析（过程性文档）
│   ├── analytics/              ← 【新】wangzai-analysis
│   ├── wechat-articles/        ← 保留（统一结构）
│   └── archive/                ← 【新】minicare-research（早期调研存档）
└── Claw/                       → 【删除】空目录（git 不追踪空目录，无历史损失）
```

**设计原则**：
1. **根目录 = 导航**：只留 README + AGENTS + 包目录，agent 首屏 context 从 1.9MB 降到 ~30KB
2. **单一事实源**：产品描述唯一（`docs/product/overview.md`），PRD 唯一（`docs/prd/` + 注册表），其余只留 superseded 标记不删
3. **物理移动最小化**：能标注解决的（Design-Reference/ui-draft）不移动；必须移动的（根目录文档）一次搬完
4. **引用链一次性修复**：git mv + 批量更新 14+15 个引用文件，不留断链
5. **规范制度化**：命名规范与索引维护写进 AGENTS.md，由规则强制而非人工自觉

---

## 四、落地计划（4 个 Phase，全程 git mv，零删除）

> 前置 ①：先提交当前工作区（有 20+ 个未提交修改），或打 tag `pre-docs-reorg` 作为回滚点。
> 前置 ②：**先补跑一次 GitNexus 图谱基线**（当前图谱已落后 1 个 commit：HEAD `c3df7b9` vs 图谱 lastCommit `4fbe216`）——`node .gitnexus/run.cjs analyze`。原因与影响评估见「六、GitNexus 图谱更新机制」。

### Phase 1 — 根目录瘦身（15 分钟）

| 动作 | 命令要点 | 说明 |
|------|---------|------|
| 商业文档归位 | `git mv 1-5-year-plan.md docs/business/` `git mv MVP-MRD.md docs/business/` | 创业文档，与开发隔离 |
| PRD 快照归位 | `git mv MVP-PRD.md docs/business/` | 顶部加 superseded 横幅，指向 features/ + prd/ |
| 早期调研归档 | `git mv minicare-research.md docs/archive/` | 内容已被 product/overview 取代 |
| 硬件文档归位 | `git mv hardware-specs.md docs/hardware/` | 与 3 篇硬件调研同目录 |
| 新建根 README | 模板见附录 A | 30 秒导航 |
| 删除空占位 | `rmdir Claw/` | 无 git 历史损失 |

### Phase 2 — docs/ 归位与索引重建（30 分钟）

| 动作 | 说明 |
|------|------|
| 散装 md 归位 | `cr-mvp.md`→`reviews/`；`敏宝日记1.0版本问题分析与解决方案.md`→`reviews/`（改名 `REVIEW-1.0-issues.md`）；`wangzai-analysis.md`→`analytics/`；`微信开发者工具调试协议调研.md`→`tech/`（改名 `TECH-009-wechat-devtools-protocol.md`）；音箱/摄像头 4 篇 →`hardware/` |
| 产品文档合并 | `project-intro.md` + `overview.md` → 合并为 `product/overview.md`（保留最新内容），旧文件进 `archive/` |
| 重写 docs/README.md | 全量索引树 + 每个文档标注 status（active/archived/superseded） |
| 更新引用 | 批量更新 14 个引用根目录文档的文件（.agents/skills/minicare-dev/SKILL.md、docs/README.md、6 个 features/ 等）——`grep -rl` 定位后逐一替换为新相对路径 |

### Phase 3 — 命名统一与知识库整理（30 分钟）

| 动作 | 说明 |
|------|------|
| 知识库改名 | `git mv docs/敏宝知识库 docs/knowledge`；内部拆 `source/`（原 源文件/ + minerU解析版本/）与 `research/`（12 份调研文档） |
| 引用批量更新 | 15+ 个引用 `docs/敏宝知识库` 的文件统一替换（含 .agents/skills 下 2 个、docs/agent/ 2 个、PRD-003/004、TECH-006 等） |
| 编号体系说明 | `docs/agent/README.md` 增加映射表：`PRD-003 → M1~M8 模块展开`，消除两套编号歧义 |
| 文章结构统一 | wechat-articles：05 补建子目录收纳素材，空 `images/` 删除或并入统一图片目录 |
| 命名规范落地 | 从今往后新增文档一律英文 + 前缀编号（见第五节） |

### Phase 4 — 状态标注与机制固化（20 分钟）

| 动作 | 说明 |
|------|------|
| 历史产物标注 | `Design-Reference/README.md`、`ui-draft/README.md`：一句话说明"MVP 早期原型，仅供追溯，现行设计以 docs/product/design-system.md 为准" |
| AGENTS.md 增补 | 新增「文档管理规范」小节：① 新增/修改 docs 必须同步更新 docs/README.md 索引 ② 命名规范 ③ 生命周期 status 必填 ④ 根目录禁止新增文档 |
| 收尾验证 | `git status` 确认无意外删除 → 提交一次 → 跑 `node .gitnexus/run.cjs analyze` 增量更新图谱（详见第六节） |
| 回滚方案 | 若引用断裂，`git checkout pre-docs-reorg` 即可整体回滚 |

---

## 五、配套机制（长期生效）

### 5.1 命名规范（新增文档强制）

| 类别 | 规范 | 示例 |
|------|------|------|
| 技术方案 | `TECH-NNN-短横线描述.md` | TECH-009-wechat-devtools-protocol.md |
| 基础设施 | `INFRA-主题.md` | INFRA-cloudbase.md |
| 数据库 | `DB-NN-主题.md` | DB-02-schema.md |
| 功能规格 | `FNN-模块.md` | F03-feeding.md |
| PRD | `PRD-NNN.md` + 注册表登记 | PRD-005.md |
| 审查/复盘 | `REVIEW-主题.md` | REVIEW-1.0-issues.md |
| 一律英文小写 + 前缀编号；**禁止中文文件名**（历史存量按 Phase 3 转换） |

### 5.2 文档生命周期 frontmatter

```yaml
---
status: active        # draft | active | superseded | archived
updated: 2026-08-23
superseded_by: docs/features/F03-feeding.md   # 仅 superseded 时填写
---
```

- `docs/README.md` 索引表增加 status 列，一眼区分"现行/历史"

### 5.3 索引维护规则（写进 AGENTS.md）

- **新增/移动/删除任何 docs/ 文档，必须同步更新 docs/README.md 索引**
- 根目录禁止新增任何 .md 文档（README/AGENTS 除外），一律进 docs/
- 文档修改后必须更新 `updated` 日期与 status，防止"无声过时"

---

## 六、GitNexus 图谱更新机制

### 6.1 现状核查（2026-08-23）

| 项 | 值 |
|----|----|
| 图谱索引范围 | **仅代码符号**（998 文件 / 9305 节点 / 15872 边 / 201 流程）——`csv/` 全是代码元素类型（codeelement/variable/function…），**md 文档不入图** |
| 图谱新鲜度 | lastCommit `4fbe216`（今日 04:53 索引），当前 HEAD `c3df7b9` → **已落后 1 个 commit**（minicare-platform/api 工程化落地后未跑 analyze，与本次重组无关，但应现在补齐） |
| 数据位置 | `.gitnexus/`（227MB，已 gitignore），`run.cjs` 每次 analyze 自动刷新 |

### 6.2 文档重组对图谱的影响评估

| 重组动作 | 对图谱影响 | 原因 |
|----------|-----------|------|
| git mv 根目录 5 份 md → docs/ | **无节点变化** | md 不在图谱索引范围内 |
| docs/敏宝知识库 → docs/knowledge | 无节点变化 | 同上 |
| 删除 Claw/ 空目录 | 无影响 | 空目录本就不被 git 追踪 |
| AGENTS.md / README.md 增改 | 无节点变化 | md |
| **误移代码文件**（如误动 src/） | **节点消失** | 图谱按 git 内容重建，代码移动 = 删除+新增 |

结论：**本次重组是纯文档操作，理论上图谱 stats（998/9305/201）应保持不变**，仅 lastCommit 前移。这是检验重组"是否误伤代码"的天然闸门。

### 6.3 更新流程（并入落地计划）

```
Phase 0 前置：git commit 当前工作区 → node .gitnexus/run.cjs analyze   ← 补齐基线（落后 1 commit）
Phase 4 收尾：git commit 重组 → node .gitnexus/run.cjs analyze          ← 增量分析新 commit
             → gitnexus detect_changes({scope:"compare", base_ref:"pre-docs-reorg"})
               ✓ 校验：变更应全部为 .md；stats 无下降
               ✗ 若代码节点减少 → 说明误动代码 → git checkout 回滚
```

- 命令统一用 `node .gitnexus/run.cjs analyze`（自动选择 pnpm dlx / npx 运行路径，规避 npm 11 arborist 崩溃）；`npx -y gitnexus@latest analyze` 备用
- **analyze 期间勿并行执行其他 git 操作**；网络不稳时走 Clash Verge 代理（127.0.0.1:7890）
- 增量分析只 diff 新 commit，纯 md 变更时耗时很短；`.gitnexus/` 体积增长属正常

---

## 七、收益预期

| 指标 | 现状 | 优化后 |
|------|------|--------|
| agent 首屏 context 污染 | 1.9MB 根目录文档 | ~30KB（README+AGENTS） |
| 产品描述权威版本 | 3 份并存 | 1 份 |
| PRD 体系 | 3 层 + 2 套编号 | 1 套（注册表）+ 模块映射 |
| 文档定位方式 | 全盘扫描/碰运气 | 索引直达 |
| 引用断裂风险 | 存量断链不可见 | 一次性修复 + git mv 保历史 |
| 新增文档合规 | 无约束 | AGENTS.md 规则强制 |
| 图谱新鲜度 | 落后 1 commit | 重组前后各 analyze 一次，detect_changes 校验无代码误伤 |

---

## 附录 A：根目录 README.md 模板

```markdown
# minicare（敏宝日记）

敏宝家庭健康记录小程序 + 养娃智能体。CMPA 系列科普公众号同步运营。

## 目录导航
- `minicare-mp/` 微信小程序（主平台，Taro 4.2）
- `minicare-server/` NestJS 后端（CloudRun）
- `minicare-web/` Web 端（维护模式，历史原型）
- `agent-poc/` 养娃智能体 POC（已验证完成，见其 README）
- `minicare-platform/api/` 敏宝知识库管线工程
- `docs/` 全部文档（从 docs/README.md 进入）
- `Design-Reference/` `ui-draft/` 历史原型，仅供追溯

开发/部署前必读：AGENTS.md（agent 规则）与 docs/README.md（文档索引）。
```

---

## 附录 B：已知引用文件清单（移动后需更新）

**引用根目录文档（14 个）**：`.agents/skills/minicare-dev/SKILL.md`、`docs/README.md`、`docs/project-intro.md`、`docs/design-system.md`、`docs/features/F02/F07/F12/F13/F14`、`.workbuddy/memory/2026-08-15/20/23.md`

**引用 docs/敏宝知识库（15+ 个）**：`.agents/skills/minicare-dev/SKILL.md`、`.agents/skills/minicare-design/SKILL.md`、`docs/agent/prd/M02`、`docs/agent/tech/M02`、`docs/design-system.md`、`docs/prd/PRD-003/004`、`docs/tech/TECH-006`、知识库内部 7 篇

> 执行时以 `grep -rl` 实时复核为准，本清单仅作预估。
