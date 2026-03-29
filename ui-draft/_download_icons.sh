#!/bin/bash
# 批量下载 Lucide 图标 SVG
BASE="https://unpkg.com/lucide-static@latest/icons"
DEST="/Users/bing/Desktop/工作区/minicare/ui-draft/icons"

icons=(
  # 导航 Tab
  "house"
  "clipboard-list"
  "bar-chart-2"
  "user-round"
  # 快捷记录
  "milk"
  "moon"
  "smile"
  "ruler"
  "hospital"
  "triangle-alert"
  # 表单/操作
  "pencil"
  "camera"
  "search"
  "microscope"
  "syringe"
  "alarm-clock"
  "timer"
  "square-stop"
  "refresh-cw"
  "calendar"
  "trending-up"
  "trash-2"
  "save"
  "upload"
  "plus"
  "chevron-right"
  "x"
  "check"
  "info"
  "bell"
  # 睡眠/时间
  "sun"
  "cloud-sun"
  "bed"
  # 宝宝/用户
  "baby"
  "heart"
  "star"
  # 状态情绪
  "laugh"
  "meh"
  "frown"
  # 活动记录
  "droplets"
  "weight"
  "activity"
  "thermometer"
  # 其他
  "map"
  "palette"
  "settings"
  "log-out"
  "share-2"
  "file-text"
  "circle-dot"
  "timer-reset"
  "play"
  "pause"
  "stop-circle"
  "arrow-left"
  "arrow-right"
  "edit"
  "filter"
  "list"
  "grid-2x2"
  "stethoscope"
  "flask-conical"
  "eye"
  "eye-off"
)

echo "开始下载 ${#icons[@]} 个图标..."
success=0
fail=0

for icon in "${icons[@]}"; do
  url="${BASE}/${icon}.svg"
  dest="${DEST}/${icon}.svg"
  if curl -sfL --max-time 10 "$url" -o "$dest" 2>/dev/null; then
    echo "  ✓ $icon"
    ((success++))
  else
    echo "  ✗ $icon (失败)"
    ((fail++))
  fi
done

echo ""
echo "完成：成功 $success，失败 $fail"
