#!/usr/bin/env bash
# =============================================================
# smoke-staging.sh — staging 后端冒烟测试（部署后验收用，2026-10-11）
#
# 覆盖链路：
#   1-2. 测试模式登录（send-code → verify-code，固定码 123456）
#   3-4. auth/me → family/mine
#   5.   family/:id/baby
#   6-7. schedule/template + schedule/today（PRD-009 新接口）
#   8.   records/feed 列表（旧接口回归）
#   9.   /config（下发版本）
#   10-12. password-status → 设置密码 → 密码登录（TECH-016 新链路）
#
# 用法：bash scripts/smoke-staging.sh
# 前置：staging 服务 AUTH_TEST_MODE=true；测试账号已在 staging 库存在
# =============================================================
set -u
BASE=https://minicare-api-240137-10-1253854169.sh.run.tcloudbase.com
PHONE=13146989718
PASS='Minicare123'
J='Content-Type: application/json'
TMPD=$(mktemp -d /tmp/minicare-smoke.XXXXXX)
trap 'rm -rf "$TMPD"' EXIT
ok() { echo "  → HTTP $1 $2"; }

echo "== 1. send-code（测试模式）=="
C=$(curl -s -o "$TMPD/r1.json" -w '%{http_code}' -X POST $BASE/api/auth/send-code -H "$J" -d "{\"phone\":\"$PHONE\"}"); ok $C "$(head -c 120 "$TMPD/r1.json")"

echo "== 2. verify-code → token =="
C=$(curl -s -o "$TMPD/r2.json" -w '%{http_code}' -X POST $BASE/api/auth/verify-code -H "$J" -d "{\"phone\":\"$PHONE\",\"code\":\"123456\"}"); ok $C
TOKEN=$(python3 -c "import json; print(json.load(open('$TMPD/r2.json')).get('token',''))")
ISNEW=$(python3 -c "import json; print(json.load(open('$TMPD/r2.json')).get('isNewUser'))")
echo "  token 长度=${#TOKEN} isNewUser=$ISNEW"
AUTH="Authorization: Bearer $TOKEN"

echo "== 3. /auth/me =="
C=$(curl -s -o "$TMPD/r3.json" -w '%{http_code}' $BASE/api/auth/me -H "$AUTH"); ok $C "$(head -c 200 "$TMPD/r3.json")"

echo "== 4. /family/mine =="
C=$(curl -s -o "$TMPD/r4.json" -w '%{http_code}' $BASE/api/family/mine -H "$AUTH"); ok $C
FAMILY_ID=$(python3 -c "
import json
d=json.load(open('$TMPD/r4.json'))
fs = d if isinstance(d,list) else (d.get('families') or d.get('list') or d.get('data') or [])
print((fs[0].get('id') or fs[0].get('familyId')) if fs else '')" 2>/dev/null)
echo "  FAMILY_ID=$FAMILY_ID"

echo "== 5. /family/:id/baby =="
C=$(curl -s -o "$TMPD/r5.json" -w '%{http_code}' "$BASE/api/family/$FAMILY_ID/baby" -H "$AUTH"); ok $C
BABY_ID=$(python3 -c "
import json
d=json.load(open('$TMPD/r5.json'))
if isinstance(d, dict) and d.get('id') and d.get('name'): print(d['id'])
else:
    bs = d if isinstance(d,list) else (d.get('babies') or d.get('list') or d.get('data') or [])
    print((bs[0].get('id')) if bs else '')" 2>/dev/null)
echo "  BABY_ID=$BABY_ID"

echo "== 6. schedule/template（新接口）=="
C=$(curl -s -o "$TMPD/r6.json" -w '%{http_code}' "$BASE/api/family/$FAMILY_ID/schedule/template?baby_id=$BABY_ID" -H "$AUTH"); ok $C "$(head -c 150 "$TMPD/r6.json")"

echo "== 7. schedule/today（新接口）=="
C=$(curl -s -o "$TMPD/r7.json" -w '%{http_code}' "$BASE/api/family/$FAMILY_ID/schedule/today?baby_id=$BABY_ID" -H "$AUTH"); ok $C "$(head -c 200 "$TMPD/r7.json")"

echo "== 8. feed 列表（旧接口抽验）=="
C=$(curl -s -o "$TMPD/r8.json" -w '%{http_code}' "$BASE/api/family/$FAMILY_ID/records/feed?baby_id=$BABY_ID&limit=3" -H "$AUTH"); ok $C
python3 -c "
import json
d=json.load(open('$TMPD/r8.json'))
items=d.get('items',[])
print(f'  items={len(items)} hasMore={d.get(\"hasMore\")}')" 2>/dev/null

echo "== 9. /config =="
C=$(curl -s -o "$TMPD/r9.json" -w '%{http_code}' $BASE/api/config); ok $C
python3 -c "
import json
d=json.load(open('$TMPD/r9.json'))
data = d.get('data', d)
print('  config version:', data.get('version') or (data.get('config') or {}).get('version'))" 2>/dev/null

echo "== 10. password-status（新）=="
C=$(curl -s -o "$TMPD/r10.json" -w '%{http_code}' $BASE/api/auth/password-status -H "$AUTH"); ok $C "$(head -c 200 "$TMPD/r10.json")"

echo "== 11. 设置密码（新；10 分钟内短信已验证可免 code）=="
C=$(curl -s -o "$TMPD/r11.json" -w '%{http_code}' -X POST $BASE/api/auth/password -H "$J" -H "$AUTH" -d "{\"newPassword\":\"$PASS\"}"); ok $C "$(head -c 120 "$TMPD/r11.json")"

echo "== 12. 密码登录（新）=="
C=$(curl -s -o "$TMPD/r12.json" -w '%{http_code}' -X POST $BASE/api/auth/login-by-password -H "$J" -d "{\"phone\":\"$PHONE\",\"password\":\"$PASS\"}"); ok $C
python3 -c "
import json
d=json.load(open('$TMPD/r12.json'))
print('  token 长度:', len(d.get('token','')), '| user:', (d.get('user') or {}).get('nickname'))" 2>/dev/null

echo ""
echo "=== 冒烟完成（临时文件已自动清理）==="
