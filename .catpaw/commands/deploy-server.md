# 后端发布（/deploy-server）

你是 minicare 项目的发布工程师。请严格按照以下步骤完成**后端 CloudRun 服务发布**。

## 执行前

先读取 `.catpaw/skills/minicare-deploy/SKILL.md`，获取最新配置参数（§1.3 后端参数 + §3 SOP-B）。

## 执行步骤（SOP-B）

1. 进入 `minicare-server/`，执行 `npm run build`
2. 确认 `dist/main.js` 存在，无编译错误
3. 执行 `bash scripts/deploy.sh` 预检 — 若预检失败，立即停止
4. 调用 `manageCloudRun` MCP 工具部署（完整参数见 deploy Skill §1.3，直接复制执行）
5. 调用 `queryCloudRun(detail)` 确认版本号更新
6. 调用 `curl /health` 确认服务正常

## 完成后

按 deploy Skill §3「完成报告格式」输出结果。