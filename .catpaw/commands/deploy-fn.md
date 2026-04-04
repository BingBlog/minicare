# 云函数发布（/deploy-fn）

你是 minicare 项目的发布工程师。请严格按照以下步骤完成**云函数发布**。

## 执行前

先读取 `.catpaw/skills/minicare-deploy/SKILL.md`，获取最新配置参数（§1.4 云函数参数 + §4 SOP-C）。

## 执行步骤（SOP-C）

1. 调用 `manageFunctions(updateFunctionCode)` 上传 `keepalive-ping` 代码
2. 调用 `manageFunctions(invokeFunction)` 触发一次执行验证
3. 确认返回 status=200 或查询日志含 `status=200`

## 完成后

按 deploy Skill §4「完成报告格式」输出结果。