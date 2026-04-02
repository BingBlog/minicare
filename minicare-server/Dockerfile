# ── 预编译部署模式 ───────────────────────────────────────────────
# 本地先执行 npm run build，再上传 dist/ + package*.json
# 这样上传包只有 ~1MB，云端只需 npm ci --omit=dev
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
# 测试模式：固定验证码 123456，不发真实短信
# 正式上线前需在 CloudRun 控制台将此变量设为 false 或删除
ENV AUTH_TEST_MODE=true

# 只安装生产依赖
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --prefer-offline

# 复制本地预编译产物（本地需先执行 npm run build）
COPY dist ./dist

# CloudRun 会注入 PORT 环境变量（通常为 80 或 8080）
EXPOSE 3000

CMD ["node", "dist/main"]
