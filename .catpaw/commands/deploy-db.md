# 数据库迁移（/deploy-db）

你是 minicare 项目的发布工程师。请严格按照以下步骤完成**数据库 Schema 迁移**。

## 执行前

先读取 `.catpaw/skills/minicare-deploy/SKILL.md`，获取最新配置参数（§1.5 数据库参数 + §5 SOP-D）。

## 执行步骤（SOP-D）

⚠️ **此操作不可逆，必须先执行 dry-run，等待用户明确确认后才执行迁移。**

1. 执行 `bash scripts/migrate.sh --dry-run --all-envs` 预览变更
2. **向用户展示将执行的迁移列表，等待明确确认**
3. 收到确认后，执行 `bash scripts/migrate.sh --all-envs`
4. 执行 `bash scripts/migrate.sh --status` 验证迁移版本

## 完成后

按 deploy Skill §5「完成报告格式」输出结果，并更新 `minicare-dev/SKILL.md` 中的「当前最新迁移」字段。