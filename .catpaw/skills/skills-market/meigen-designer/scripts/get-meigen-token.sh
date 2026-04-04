#!/bin/bash

# 美境(Meigen) SSO Token 获取脚本
# 用法: bash get-meigen-token.sh <misId> [--refresh]
#
# --refresh: 尝试使用已存储的 access_token 缓存或 refresh_token 刷新
#            - 如果 access_token 缓存有效（8小时内），直接返回
#            - 否则尝试用 refresh_token 刷新
#            - 刷新失败或没有 refresh_token，则走完整 CIBA 认证流程
#
# 输出: access_token 到 stdout（可直接用于请求）
#       同时将 refresh_token 保存到 meigen/token 文件
#       access_token 缓存保存到 meigen/access_token_cache 文件

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(dirname "$SCRIPT_DIR")"

# ===== 配置 =====
LOGIN_HINT=""
REFRESH_MODE=false

while [ $# -gt 0 ]; do
    case "$1" in
        --refresh)
            REFRESH_MODE=true
            shift
            ;;
        *)
            LOGIN_HINT="$1"
            shift
            ;;
    esac
done

CLIENT_ID="2a7394863a"
BASE_URL="https://ssosv.sankuai.com"
TOKEN_OUTPUT="${WORKSPACE_DIR}/meigen/token"
ACCESS_TOKEN_CACHE="${WORKSPACE_DIR}/meigen/access_token_cache"
CACHE_DURATION=$((8 * 3600))  # 8 小时

# ===== 刷新模式：尝试使用缓存或 refresh_token =====
if [ "$REFRESH_MODE" = true ]; then
    # 1. 先检查 access_token 缓存
    if [ -f "$ACCESS_TOKEN_CACHE" ]; then
        CACHE_CONTENT=$(cat "$ACCESS_TOKEN_CACHE" 2>/dev/null)
        if [ -n "$CACHE_CONTENT" ]; then
            CACHED_TOKEN=$(echo "$CACHE_CONTENT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null)
            CACHED_EXPIRES=$(echo "$CACHE_CONTENT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('expires_at',0))" 2>/dev/null)
            CURRENT_TIME=$(date +%s)

            if [ -n "$CACHED_TOKEN" ] && [ -n "$CACHED_EXPIRES" ] && [ "$CURRENT_TIME" -lt "$CACHED_EXPIRES" ]; then
                echo "✅ 使用缓存的 access_token（剩余 $(( (CACHED_EXPIRES - CURRENT_TIME) / 3600 )) 小时）" >&2
                echo "$CACHED_TOKEN"
                exit 0
            else
                echo "⚠️ access_token 缓存已过期" >&2
            fi
        fi
    fi

    # 2. 缓存无效，尝试用 refresh_token 刷新
    if [ -f "$TOKEN_OUTPUT" ]; then
        REFRESH_TOKEN=$(cat "$TOKEN_OUTPUT")
        if [ -n "$REFRESH_TOKEN" ] && [[ "$REFRESH_TOKEN" == RT_* ]]; then
            echo "🔄 尝试刷新 access_token..." >&2

            JWT=$(python3 "${SCRIPT_DIR}/get-jwt.py")

            RESPONSE=$(curl -s -k -X POST "${BASE_URL}/sson/auth/oidc/v1/token" \
              -H 'Content-Type: application/x-www-form-urlencoded' \
              -d 'grant_type=refresh_token' \
              -d "refresh_token=${REFRESH_TOKEN}" \
              -d "client_id=${CLIENT_ID}" \
              -d 'client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer' \
              -d "client_assertion=${JWT}")

            ACCESS_TOKEN=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
            NEW_REFRESH_TOKEN=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('refresh_token',''))" 2>/dev/null)

            if [ -n "$ACCESS_TOKEN" ]; then
                echo "✅ access_token 刷新成功" >&2

                # 保存新的 refresh_token
                if [ -n "$NEW_REFRESH_TOKEN" ]; then
                    echo -n "$NEW_REFRESH_TOKEN" > "$TOKEN_OUTPUT"
                    echo "✅ 已保存新 refresh_token" >&2
                fi

                # 缓存 access_token
                EXPIRES_AT=$(($(date +%s) + CACHE_DURATION))
                echo "{\"access_token\":\"$ACCESS_TOKEN\",\"expires_at\":$EXPIRES_AT}" > "$ACCESS_TOKEN_CACHE"
                echo "✅ 已缓存 access_token（8小时有效）" >&2

                echo "$ACCESS_TOKEN"
                exit 0
            else
                echo "⚠️ 刷新失败，将重新认证" >&2
            fi
        fi
    fi
fi

# ===== 完整 CIBA 认证流程 =====
if [ -z "$LOGIN_HINT" ]; then
    echo "❌ 错误：请提供登录者 misId" >&2
    echo "" >&2
    echo "使用方式：" >&2
    echo "  bash $0 <misId>          # 完整认证" >&2
    echo "  bash $0 <misId> --refresh # 尝试刷新，失败则重新认证" >&2
    exit 1
fi

echo "🚀 开始获取 Token (CIBA)" >&2
echo "login_hint: $LOGIN_HINT" >&2

# ===== 步骤 1：获取 JWT =====
JWT=$(python3 "${SCRIPT_DIR}/get-jwt.py")

if [ -z "$JWT" ]; then
    echo "❌ JWT 获取失败" >&2
    exit 1
fi

# ===== 步骤 2：bc-authorize 获取 auth_req_id =====
BC_RESPONSE=$(curl -s -k -X POST "${BASE_URL}/sson/auth/oidc/v1/bc-authorize" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'scope=profile' \
  -d "login_hint=${LOGIN_HINT}" \
  -d "client_id=${CLIENT_ID}" \
  -d 'client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer' \
  -d "client_assertion=${JWT}" \
  -d 'requested_expiry=3600')

AUTH_REQ_ID=$(echo "$BC_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('auth_req_id',''))" 2>/dev/null)

if [ -z "$AUTH_REQ_ID" ]; then
    echo "❌ auth_req_id 获取失败" >&2
    echo "响应: $BC_RESPONSE" >&2
    exit 1
fi

echo "✅ auth_req_id: $AUTH_REQ_ID" >&2
echo "⚠️ 请在「大象」App 确认授权" >&2

# ===== 步骤 3：轮询获取 access_token =====
MAX_RETRY=30
RETRY=0
ACCESS_TOKEN=""
REFRESH_TOKEN_CIBA=""

while [ $RETRY -lt $MAX_RETRY ]; do
    RETRY=$((RETRY + 1))

    JWT=$(python3 "${SCRIPT_DIR}/get-jwt.py")

    HTTP_CODE=$(curl -s -k -w "%{http_code}" -o /tmp/token_response.txt -X POST "${BASE_URL}/sson/auth/oidc/v1/token" \
      -H 'Content-Type: application/x-www-form-urlencoded' \
      -d 'grant_type=urn%3Aopenid%3Aparams%3Agrant-type%3Aciba' \
      -d "auth_req_id=${AUTH_REQ_ID}" \
      -d 'client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer' \
      -d "client_assertion=${JWT}" \
      -d "client_id=${CLIENT_ID}")

    BODY=$(cat /tmp/token_response.txt)

    if [ "$HTTP_CODE" = "200" ]; then
        ACCESS_TOKEN=$(echo "$BODY" | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
        REFRESH_TOKEN_CIBA=$(echo "$BODY" | python3 -c "import json,sys; print(json.load(sys.stdin).get('refresh_token',''))" 2>/dev/null)
        if [ -n "$ACCESS_TOKEN" ]; then
            break
        fi
    fi

    sleep 10
done

if [ -z "$ACCESS_TOKEN" ]; then
    echo "❌ 轮询超时，未获取到 access_token" >&2
    exit 1
fi

echo "✅ access_token 获取成功" >&2

# ===== 步骤 4：换票获取最终 access_token =====
JWT=$(python3 "${SCRIPT_DIR}/get-jwt.py")

EXCHANGE_RESPONSE=$(curl -s -k -X POST "${BASE_URL}/sson/auth/oidc/v1/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange' \
  -d "auth_req_id=${AUTH_REQ_ID}" \
  -d 'client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer' \
  -d "client_assertion=${JWT}" \
  -d 'subject_token_type=urn%3Aietf%3Aparams%3Aoauth%3Atoken-type%3Aaccess_token' \
  -d "client_id=${CLIENT_ID}" \
  -d 'audience=com.sankuai.it.ead.citadel' \
  -d "subject_token=${ACCESS_TOKEN}")

FINAL_TOKEN=$(echo "$EXCHANGE_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -z "$FINAL_TOKEN" ]; then
    echo "❌ 换票失败" >&2
    echo "响应: $EXCHANGE_RESPONSE" >&2
    exit 1
fi

echo "✅ 换票成功" >&2

# ===== 步骤 5：保存 token =====
mkdir -p "$(dirname "$TOKEN_OUTPUT")"

# 保存 refresh_token（优先使用 CIBA 阶段的）
FINAL_REFRESH_TOKEN="$REFRESH_TOKEN_CIBA"

if [ -n "$FINAL_REFRESH_TOKEN" ]; then
    echo -n "$FINAL_REFRESH_TOKEN" > "$TOKEN_OUTPUT"
    echo "✅ refresh_token 已保存" >&2
else
    echo -n "$FINAL_TOKEN" > "$TOKEN_OUTPUT"
    echo "⚠️ 未获取到 refresh_token，已保存 access_token" >&2
fi

# 缓存 access_token
EXPIRES_AT=$(($(date +%s) + CACHE_DURATION))
echo "{\"access_token\":\"$FINAL_TOKEN\",\"expires_at\":$EXPIRES_AT}" > "$ACCESS_TOKEN_CACHE"
echo "✅ access_token 已缓存（8小时有效）" >&2

# 输出 access_token
echo "$FINAL_TOKEN"
