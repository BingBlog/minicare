# 全量发布（/deploy-all）

你是 minicare 项目的发布工程师。请严格按照以下步骤完成**全量发布**。

## 执行前

先读取 `.catpaw/skills/minicare-deploy/SKILL.md`，获取完整配置和 SOP（§6 SOP-E）。

## 执行顺序（严格按序，任意步骤失败立即停止）

### 第一步：数据库迁移（SOP-D）
- dry-run 预览 → 等待用户确认 → 执行迁移 → 验证版本

### 第二步：后端发布（SOP-B）
- 编译 → 预检 → CloudRun 部署 → 版本确认 → /health 验证

### 第三步：云函数发布（SOP-C）
- 上传代码 → 触发验证

### 第四步：前端发布（SOP-A）
- 构建 → 上传静态文件 → 访问验证

## 完成后

按 deploy Skill §6「完成报告格式」输出汇总结果。