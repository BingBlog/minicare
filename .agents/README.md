# .agents/ — Rules & Skills 单一数据源

本目录是项目 rules 和 skills 的**唯一可编辑数据源**。

## 目录结构

```
.agents/
├── rules/          ← 6 个规则文件（.mdc）
├── scripts/
│   ├── setup-links.sh    ← 镜像软链自检（--check）/ 重建（幂等）
│   └── impact-scan.mjs   ← 功能域影响面扫描
└── skills/         ← 13 个 skill 目录
    ├── 业务技能 6 个   minicare-dev · minicare-deploy · minicare-design
    │                   prd-doc-writer · database-designer · web-to-mp-page-migration
    ├── cloudbase/      路由型技能，下挂 references/ 25 个子技能
    └── gitnexus-* 6 个 cli · exploring · debugging · impact-analysis
                        refactoring · guide
```

## 引用关系

其他 IDE 目录通过 symlink 指向本目录，**禁止直接编辑**：

| IDE 目录 | 引用方式 | 是否进版本库 |
|---------|---------|------------|
| `.cursor/rules` | symlink → `../.agents/rules` | 是（相对路径） |
| `.cursor/skills/*` | symlink → `../../.agents/skills/*`，7 个按需挂载 | 是（相对路径） |
| `.trae/rules` | symlink → `../.agents/rules` | 是（相对路径） |
| `.trae/skills` | symlink → `../.agents/skills` | 是（相对路径） |
| `.workbuddy/skills` | symlink → `../.agents/skills` | 是（`!` 否定规则精确放行） |
| `.opencode/` | 不使用目录；`opencode.json` 直接引用 `.agents/rules/*.mdc` | — |
| `.claude/skills/gitnexus-*` | **实体副本**，由 GitNexus 工具写入并维护 | 是（工具管理区） |

## 换机器 / 新 clone 后

**正常情况什么都不用做。** 所有镜像软链都是相对路径且已进版本库，`git clone` 会原样重建
软链，各 IDE 直接可用。

自检与兜底修复（幂等，可反复执行）：

```bash
bash .agents/scripts/setup-links.sh --check   # 只检查；异常时退出码 1
bash .agents/scripts/setup-links.sh           # 一键修复
```

**为什么还需要脚本**：git 只保存软链的「目标字符串」，不保存它指向的内容。目标一旦写成
绝对路径（如 `/Users/xxx/Documents/xxx/.agents/rules`），换机器或换 clone 目录后软链就会
断开，而 `git status` 依然干净 —— 断链会被静默提交进版本库。脚本负责两种兜底场景：

1. 历史遗留的绝对路径 / 目标写错的软链；
2. 被 `.gitignore` 排除、无法靠 git 分发的软链。

脚本遇同名实体文件/目录会跳过而不覆盖，并在末尾附带检查 `.claude/` 下的实体副本是否与
`.agents/` 源文件漂移（只报告，不修改——那是 GitNexus 工具的管理区）。

**CI 门禁**：`.github/workflows/verify-links.yml` 在每次 push / PR 上运行 `--check`，
拦截绝对路径软链的回归——这类问题在提交者本机完全无感，只有干净 clone 才暴露。

## 编辑规则

- ✅ **允许**：编辑 `.agents/rules/` 和 `.agents/skills/` 中的文件
- ❌ **禁止**：通过 `.cursor/`、`.trae/` 路径编辑（虽然 symlink 透明可写，但应遵守约定）
- ❌ **禁止**：编辑 `.claude/skills/`（GitNexus 工具自动生成，见 `CLAUDE.md` 的 gitnexus 区块）

## 新增文件

如需新增 rule 或 skill：

1. 在 `.agents/rules/` 或 `.agents/skills/` 中创建文件
2. 如需在 `.cursor/skills/` 中单独引用，创建对应的**相对路径** symlink，并把条目补进
   `.agents/scripts/setup-links.sh` 的挂载清单（否则换机器后会漏掉这一个）
3. `.trae/skills` 已整体软链，无需额外操作

> ⚠️ 新增软链时**绝对不要用绝对路径**，否则就是本文档开头那个坑。
