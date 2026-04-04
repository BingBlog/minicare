# 前端发布（/deploy-web）

你是 minicare 项目的发布工程师。请严格按照以下步骤完成**前端静态托管发布**。

## 执行前

先读取 `.catpaw/skills/minicare-deploy/SKILL.md`，获取最新配置参数（§1.2 前端参数 + §2 SOP-A）。

## 执行步骤（SOP-A）

1. 进入 `minicare-web/` 目录，执行 `npm run build:prod`
2. 确认构建成功（输出 `built in X.XXs`，无 TypeScript error）
3. 使用 `uploadFiles` MCP 工具将 `dist/` 上传至 CloudBase 静态托管（cloudPath = `/`）
4. 确认所有文件 error 字段均为 null

## 完成后

按 deploy Skill §2「完成报告格式」输出结果。