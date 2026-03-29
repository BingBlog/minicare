# ── Stage 1: build ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# 先复制依赖文件，利用 Docker layer cache
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

# 复制源码并构建
COPY . .
RUN npm run build

# ── Stage 2: production ─────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# 只安装生产依赖
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --prefer-offline

# 从构建阶段复制编译产物
COPY --from=builder /app/dist ./dist

# CloudRun 会注入 PORT 环境变量（通常为 80 或 8080）
EXPOSE 3000

CMD ["node", "dist/main"]
