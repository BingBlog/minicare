#!/bin/bash
# ============================================================
# 看板模拟数据生成脚本
# 为今天创建一整天的宝宝记录，用于 Dashboard 看板展示测试
# ============================================================

set -e
API="http://localhost:3001"

# ── 1. 登录 ──────────────────────────────────────────────────
echo "==> 登录..."
SEND=$(curl -s -X POST "$API/api/auth/send-code" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000"}')
echo "  发送验证码: $SEND"

LOGIN=$(curl -s -X POST "$API/api/auth/verify-code" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","code":"123456"}')

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
IS_NEW=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('isNewUser', False))")
echo "  Token: ${TOKEN:0:20}..."
echo "  isNewUser: $IS_NEW"

AUTH="Authorization: Bearer $TOKEN"

# ── 2. 确保有家庭和宝宝 ──────────────────────────────────────
echo ""
echo "==> 查询家庭..."
FAMILIES=$(curl -s "$API/api/family/mine" -H "$AUTH")
FAMILY_COUNT=$(echo "$FAMILIES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))")

if [ "$FAMILY_COUNT" = "0" ]; then
  echo "  没有家庭，创建中..."
  CREATE_FAM=$(curl -s -X POST "$API/api/family" \
    -H "$AUTH" -H 'Content-Type: application/json' \
    -d '{"name":"看板测试家庭"}')
  echo "  创建家庭: $CREATE_FAM"
  FAMILIES=$(curl -s "$API/api/family/mine" -H "$AUTH")
fi

FAMILY_ID=$(echo "$FAMILIES" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
echo "  Family ID: $FAMILY_ID"

echo ""
echo "==> 查询宝宝..."
BABY=$(curl -s "$API/api/family/$FAMILY_ID/baby" -H "$AUTH")
BABY_ID=$(echo "$BABY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('id','') if isinstance(d,dict) else '')
" 2>/dev/null || echo "")

if [ -z "$BABY_ID" ]; then
  echo "  没有宝宝，创建中..."
  CREATE_BABY=$(curl -s -X POST "$API/api/family/$FAMILY_ID/baby" \
    -H "$AUTH" -H 'Content-Type: application/json' \
    -d '{
      "name": "小豆豆",
      "birth_date": "2025-11-15",
      "gender": "female",
      "allergy_types": ["milk"],
      "allergy_level": "mild",
      "birth_weight_g": 3250,
      "birth_height_cm": 50
    }')
  echo "  创建宝宝: $CREATE_BABY"
  BABY=$(curl -s "$API/api/family/$FAMILY_ID/baby" -H "$AUTH")
  BABY_ID=$(echo "$BABY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
fi

echo "  Baby ID: $BABY_ID"

# ── 辅助函数 ──────────────────────────────────────────────────
TODAY=$(date +%Y-%m-%d)

post() {
  local endpoint="$1"
  local data="$2"
  local result=$(curl -s -X POST "$API/api/family/$FAMILY_ID/records/$endpoint" \
    -H "$AUTH" -H 'Content-Type: application/json' \
    -d "$data")
  echo "  $endpoint: $result"
}

patch() {
  local endpoint="$1"
  local data="$2"
  local result=$(curl -s -X PATCH "$API/api/family/$FAMILY_ID/records/$endpoint" \
    -H "$AUTH" -H 'Content-Type: application/json' \
    -d "$data")
  echo "  PATCH $endpoint: $result"
}

# ── 3. 创建喂养记录 ──────────────────────────────────────────
echo ""
echo "==> 创建喂养记录..."

# 01:30 夜奶 - 母乳
post "feeding" "{
  \"baby_id\": \"$BABY_ID\",
  \"feed_type\": \"breast\",
  \"record_time\": \"${TODAY}T01:30:00.000+08:00\",
  \"breast_side\": \"left\",
  \"duration_min\": 12
}"

# 05:00 夜奶 - 配方奶
post "feeding" "{
  \"baby_id\": \"$BABY_ID\",
  \"feed_type\": \"formula\",
  \"record_time\": \"${TODAY}T05:00:00.000+08:00\",
  \"formula_ml\": 120,
  \"milk_types\": [\"aa\"],
  \"milk_scoops\": {\"aa\": 4}
}"

# 08:15 早餐 - 母乳
post "feeding" "{
  \"baby_id\": \"$BABY_ID\",
  \"feed_type\": \"breast\",
  \"record_time\": \"${TODAY}T08:15:00.000+08:00\",
  \"breast_side\": \"both\",
  \"duration_min\": 18
}"

# 10:00 加餐 - 配方奶
post "feeding" "{
  \"baby_id\": \"$BABY_ID\",
  \"feed_type\": \"formula\",
  \"record_time\": \"${TODAY}T10:00:00.000+08:00\",
  \"formula_ml\": 150,
  \"milk_types\": [\"aa\", \"eh_no_lactose\"],
  \"milk_scoops\": {\"aa\": 3, \"eh_no_lactose\": 2}
}"

# 12:00 午餐 - 辅食
post "feeding" "{
  \"baby_id\": \"$BABY_ID\",
  \"feed_type\": \"complementary\",
  \"record_time\": \"${TODAY}T12:00:00.000+08:00\",
  \"complementary_food\": \"南瓜米糊+蛋黄\",
  \"amount_g\": 80
}"

# 15:00 下午茶 - 配方奶
post "feeding" "{
  \"baby_id\": \"$BABY_ID\",
  \"feed_type\": \"formula\",
  \"record_time\": \"${TODAY}T15:00:00.000+08:00\",
  \"formula_ml\": 130,
  \"milk_types\": [\"aa\"],
  \"milk_scoops\": {\"aa\": 4.5}
}"

# 18:00 晚餐 - 辅食
post "feeding" "{
  \"baby_id\": \"$BABY_ID\",
  \"feed_type\": \"complementary\",
  \"record_time\": \"${TODAY}T18:00:00.000+08:00\",
  \"complementary_food\": \"胡萝卜泥+鳕鱼\",
  \"amount_g\": 60
}"

# 20:30 睡前奶 - 母乳
post "feeding" "{
  \"baby_id\": \"$BABY_ID\",
  \"feed_type\": \"breast\",
  \"record_time\": \"${TODAY}T20:30:00.000+08:00\",
  \"breast_side\": \"right\",
  \"duration_min\": 15
}"

# ── 4. 创建营养素/补剂记录 ────────────────────────────────────
echo ""
echo "==> 创建补剂记录..."

# 09:00 维D + 铁剂
post "feeding" "{
  \"baby_id\": \"$BABY_ID\",
  \"feed_type\": \"complementary\",
  \"record_time\": \"${TODAY}T09:00:00.000+08:00\",
  \"complementary_food\": \"营养素\",
  \"supplement_items\": [
    {\"key\": \"vitD\", \"label\": \"维D\", \"dose\": \"400\", \"unit\": \"IU\"},
    {\"key\": \"iron\", \"label\": \"铁剂\", \"dose\": \"1\", \"unit\": \"ml\"}
  ]
}"

# 16:00 益生菌
post "feeding" "{
  \"baby_id\": \"$BABY_ID\",
  \"feed_type\": \"complementary\",
  \"record_time\": \"${TODAY}T16:00:00.000+08:00\",
  \"complementary_food\": \"营养素\",
  \"supplement_items\": [
    {\"key\": \"probiotics\", \"label\": \"益生菌\", \"dose\": \"1\", \"unit\": \"袋\"}
  ]
}"

# 20:00 钙剂
post "feeding" "{
  \"baby_id\": \"$BABY_ID\",
  \"feed_type\": \"complementary\",
  \"record_time\": \"${TODAY}T20:00:00.000+08:00\",
  \"complementary_food\": \"营养素\",
  \"supplement_items\": [
    {\"key\": \"calcium\", \"label\": \"钙剂\", \"dose\": \"5\", \"unit\": \"ml\"}
  ]
}"

# ── 5. 创建睡眠记录 ──────────────────────────────────────────
echo ""
echo "==> 创建睡眠记录..."

# 夜觉 21:00 - 05:00（补录已完成）
post "sleep/complete" "{
  \"baby_id\": \"$BABY_ID\",
  \"start_time\": \"${TODAY}T21:00:00.000+08:00\",
  \"end_time\": \"${TODAY}T05:00:00.000+08:00\",
  \"quality\": \"normal\",
  \"sleep_period\": \"night\",
  \"note\": \"中间醒了一次吃奶\"
}"

# 上午觉 09:30 - 10:45
post "sleep/complete" "{
  \"baby_id\": \"$BABY_ID\",
  \"start_time\": \"${TODAY}T09:30:00.000+08:00\",
  \"end_time\": \"${TODAY}T10:45:00.000+08:00\",
  \"quality\": \"good\",
  \"sleep_period\": \"morning_nap\"
}"

# 下午觉 13:00 - 14:30
post "sleep/complete" "{
  \"baby_id\": \"$BABY_ID\",
  \"start_time\": \"${TODAY}T13:00:00.000+08:00\",
  \"end_time\": \"${TODAY}T14:30:00.000+08:00\",
  \"quality\": \"good\",
  \"sleep_period\": \"afternoon_nap\"
}"

# ── 6. 创建尿布记录 ──────────────────────────────────────────
echo ""
echo "==> 创建尿布记录..."

# 02:00 夜间换尿布 - 嘘嘘
post "diaper" "{
  \"baby_id\": \"$BABY_ID\",
  \"diaper_type\": \"wet\",
  \"record_time\": \"${TODAY}T02:00:00.000+08:00\"
}"

# 06:30 早起 - 混合
post "diaper" "{
  \"baby_id\": \"$BABY_ID\",
  \"diaper_type\": \"mixed\",
  \"record_time\": \"${TODAY}T06:30:00.000+08:00\",
  \"color\": \"yellow\",
  \"poop_type\": \"normal\"
}"

# 08:30 - 嘘嘘
post "diaper" "{
  \"baby_id\": \"$BABY_ID\",
  \"diaper_type\": \"wet\",
  \"record_time\": \"${TODAY}T08:30:00.000+08:00\"
}"

# 10:30 - 臭臭
post "diaper" "{
  \"baby_id\": \"$BABY_ID\",
  \"diaper_type\": \"dirty\",
  \"record_time\": \"${TODAY}T10:30:00.000+08:00\",
  \"color\": \"green\",
  \"poop_type\": \"loose\",
  \"butt_condition\": \"slightly_red\"
}"

# 12:30 - 嘘嘘
post "diaper" "{
  \"baby_id\": \"$BABY_ID\",
  \"diaper_type\": \"wet\",
  \"record_time\": \"${TODAY}T12:30:00.000+08:00\"
}"

# 14:45 - 混合
post "diaper" "{
  \"baby_id\": \"$BABY_ID\",
  \"diaper_type\": \"mixed\",
  \"record_time\": \"${TODAY}T14:45:00.000+08:00\",
  \"color\": \"yellow\",
  \"poop_type\": \"normal\",
  \"butt_condition\": \"normal\"
}"

# 17:00 - 嘘嘘
post "diaper" "{
  \"baby_id\": \"$BABY_ID\",
  \"diaper_type\": \"wet\",
  \"record_time\": \"${TODAY}T17:00:00.000+08:00\"
}"

# 19:30 - 臭臭
post "diaper" "{
  \"baby_id\": \"$BABY_ID\",
  \"diaper_type\": \"dirty\",
  \"record_time\": \"${TODAY}T19:30:00.000+08:00\",
  \"color\": \"brown\",
  \"poop_type\": \"normal\"
}"

# ── 7. 创建活动记录 ──────────────────────────────────────────
echo ""
echo "==> 创建活动记录..."

# 07:30 大运动 - 趴趴练习
post "activity" "{
  \"baby_id\": \"$BABY_ID\",
  \"activity_type\": \"gross_motor\",
  \"record_time\": \"${TODAY}T07:30:00.000+08:00\",
  \"duration_min\": 15,
  \"intensity\": \"medium\",
  \"note\": \"趴趴抬头练习，状态不错\"
}"

# 11:00 早教互动
post "activity" "{
  \"baby_id\": \"$BABY_ID\",
  \"activity_type\": \"edu_play\",
  \"record_time\": \"${TODAY}T11:00:00.000+08:00\",
  \"duration_min\": 20,
  \"intensity\": \"easy\",
  \"note\": \"黑白卡+摇铃\"
}"

# 15:30 户外活动
post "activity" "{
  \"baby_id\": \"$BABY_ID\",
  \"activity_type\": \"outdoor\",
  \"record_time\": \"${TODAY}T15:30:00.000+08:00\",
  \"duration_min\": 30,
  \"intensity\": \"easy\",
  \"note\": \"小区散步晒太阳\"
}"

# 17:30 精细运动
post "activity" "{
  \"baby_id\": \"$BABY_ID\",
  \"activity_type\": \"fine_motor\",
  \"record_time\": \"${TODAY}T17:30:00.000+08:00\",
  \"duration_min\": 10,
  \"intensity\": \"easy\",
  \"note\": \"抓握练习\"
}"

# ── 8. 创建健康记录 ──────────────────────────────────────────
echo ""
echo "==> 创建健康记录..."

# 07:00 晨起体温
post "health" "{
  \"baby_id\": \"$BABY_ID\",
  \"record_time\": \"${TODAY}T07:00:00.000+08:00\",
  \"temperature\": 36.5,
  \"skin_care\": [\"面霜保湿\", \"身体乳\"],
  \"note\": \"晨起状态好\"
}"

# 14:00 午后体温
post "health" "{
  \"baby_id\": \"$BABY_ID\",
  \"record_time\": \"${TODAY}T14:00:00.000+08:00\",
  \"temperature\": 36.8,
  \"note\": \"午觉醒来\"
}"

# 19:00 洗澡后护理
post "health" "{
  \"baby_id\": \"$BABY_ID\",
  \"record_time\": \"${TODAY}T19:00:00.000+08:00\",
  \"temperature\": 36.6,
  \"skin_care\": [\"洗澡\", \"涂抹面霜\", \"肚脐护理\"],
  \"note\": \"洗澡后全身保湿\"
}"

# ── 9. 创建表现记录 ──────────────────────────────────────────
echo ""
echo "==> 创建表现记录..."

# 08:00 早上精神状态
post "symptom" "{
  \"baby_id\": \"$BABY_ID\",
  \"record_time\": \"${TODAY}T08:00:00.000+08:00\",
  \"symptoms\": [],
  \"spirit\": \"active\",
  \"mood\": \"happy\",
  \"note\": \"早上醒来很开心，咿咿呀呀\"
}"

# 16:00 下午状态
post "symptom" "{
  \"baby_id\": \"$BABY_ID\",
  \"record_time\": \"${TODAY}T16:00:00.000+08:00\",
  \"symptoms\": [],
  \"spirit\": \"normal\",
  \"mood\": \"neutral\"
}"

echo ""
echo "============================================"
echo "  模拟数据创建完成！"
echo "  Family: $FAMILY_ID"
echo "  Baby:   $BABY_ID ($TODAY)"
echo "  喂养: 8条  补剂: 3条  睡眠: 3条"
echo "  尿布: 8条  活动: 4条  健康: 3条  表现: 2条"
echo "============================================"
echo ""
echo "  访问看板: http://localhost:3000/#/dashboard"
echo ""
