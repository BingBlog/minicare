# minicare-agent — CloudRun 部署（M8 tech §5）
# ⚠️ 必须用非 root 用户运行：Claude CLI 拒绝 root 下 --dangerously-skip-permissions
FROM node:20-slim

WORKDIR /app

# 先拷贝依赖清单，利用层缓存
COPY package.json package-lock.json .npmrc ./
RUN npm install --no-audit --no-fund

# 复制源码（.dockerignore 已排除 node_modules/.env.local）
COPY src ./src

# 创建非 root 运行用户（Claude CLI 安全限制）
RUN useradd -m -u 1001 oak && \
    mkdir -p /tmp/oak-claude /app && \
    chown -R oak:oak /app /tmp/oak-claude

# 可写目录（CLAUDE_CONFIG_DIR 兜底到 /tmp）+ 时区
ENV CLAUDE_CONFIG_DIR=/tmp/oak-claude \
    NODE_ENV=production \
    TZ=Asia/Shanghai \
    PORT=3000 \
    HOME=/home/oak

USER oak

EXPOSE 3000
CMD ["node", "src/server.js"]
