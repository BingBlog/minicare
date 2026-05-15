# .agents/ — Rules & Skills 单一数据源

本目录是项目 rules 和 skills 的**唯一可编辑数据源**。

## 目录结构

```
.agents/
├── rules/          ← 5 个规则文件（.mdc）
└── skills/         ← 8 个 skill 目录
```

## 引用关系

其他 IDE 目录通过 symlink 指向本目录，**禁止直接编辑**：

| IDE 目录 | 引用方式 |
|---------|---------|
| `.cursor/rules` | symlink → `.agents/rules` |
| `.cursor/skills/*` | symlink → `.agents/skills/*` |
| `.trae/rules` | symlink → `.agents/rules` |
| `.trae/skills` | symlink → `.agents/skills` |
| `.opencode/rules` | symlink → `.agents/rules` |
| `.opencode/skills` | symlink → `.agents/skills` |

## 编辑规则

- ✅ **允许**：编辑 `.agents/rules/` 和 `.agents/skills/` 中的文件
- ❌ **禁止**：通过 `.cursor/`、`.trae/`、`.opencode/` 路径编辑（虽然 symlink 透明可写，但应遵守约定）

## 新增文件

如需新增 rule 或 skill：
1. 在 `.agents/rules/` 或 `.agents/skills/` 中创建文件
2. 如需在 `.cursor/skills/` 中单独引用，创建对应的 symlink
3. `.trae/` 和 `.opencode/` 的 rules/skills 已整体 symlink，无需额外操作
