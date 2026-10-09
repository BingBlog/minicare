#!/usr/bin/env bash
#
# IDE 镜像软链的检查 / 重建工具
#
# 用法：
#   bash .agents/scripts/setup-links.sh          修复模式（幂等，默认）
#   bash .agents/scripts/setup-links.sh --check  只检查不修改；发现异常退出码为 1
#
# 为什么需要这个脚本：
#   git 只保存软链的「目标字符串」（blob mode 120000），不保存它指向的内容。
#   如果目标写成绝对路径（如 /Users/xxx/Documents/xxx/.agents/rules），换机器或
#   把仓库 clone 到别的目录后软链立刻断开 —— 而 `git status` 依然是干净的，
#   断链会被静默提交进版本库。
#
#   顺带说明：相对路径软链本身是进版本库的，clone 后 git 会自动重建，无需本脚本。
#   本脚本服务于三种情况：① 历史遗留的绝对路径软链；② 被 .gitignore 忽略、
#   无法靠 git 分发的软链；③ 随时自检。CI 会用 --check 防止绝对路径软链再次混入。

set -euo pipefail

CHECK_ONLY=0
case "${1-}" in
  --check)  CHECK_ONLY=1 ;;
  -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
  "")       ;;
  *)        echo "未知参数：$1（可用：--check）" >&2; exit 2 ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

fixed=0
ok=0
broken=0
conflict=0

# link <链接路径> <应当指向的相对目标>
link() {
  local path="$1" target="$2"

  if [ -L "$path" ]; then
    if [ "$(readlink "$path")" = "$target" ]; then
      printf '  ok      %s -> %s\n' "$path" "$target"
      ok=$((ok + 1))
      return 0
    fi
    local actual
    actual="$(readlink "$path")"
    if [ "$CHECK_ONLY" -eq 1 ]; then
      if [ -e "$path" ]; then
        printf '  WRONG   %s -> %s（应为 %s）\n' "$path" "$actual" "$target"
      else
        printf '  BROKEN  %s -> %s（目标不存在）\n' "$path" "$actual"
      fi
      broken=$((broken + 1))
      return 0
    fi
    rm -f "$path"   # 悬空 / 绝对路径 / 写错目标的软链一律重建
  elif [ -e "$path" ]; then
    printf '  CONFLICT %s 是实体文件或目录，未覆盖（请人工确认）\n' "$path"
    conflict=$((conflict + 1))
    return 0
  fi

  mkdir -p "$(dirname "$path")"
  ln -s "$target" "$path"
  printf '  fixed   %s -> %s\n' "$path" "$target"
  fixed=$((fixed + 1))
}

if [ "$CHECK_ONLY" -eq 1 ]; then
  # 注意：变量名后面的中文全角字符必须用 ${} 明确界定，否则 bash 会把
  # 多字节字符的首字节当成变量名的一部分（配合 set -u 直接报错）。
  echo "模式：只检查（仓库根 ${REPO_ROOT}）"
else
  echo "模式：修复（仓库根 ${REPO_ROOT}）"
fi
echo

echo "[1/3] 目录级软链"
link .cursor/rules ../.agents/rules
link .trae/rules   ../.agents/rules
link .trae/skills  ../.agents/skills

echo
echo "[2/3] Cursor 技能级软链（按需挂载，不含 gitnexus 系列）"
for name in cloudbase database-designer minicare-deploy minicare-design \
            minicare-dev prd-doc-writer web-to-mp-page-migration; do
  link ".cursor/skills/$name" "../../.agents/skills/$name"
done

echo
echo "[3/3] 需本地重建的软链（.workbuddy/* 被 .gitignore 忽略，仅 skills 已放行）"
link .workbuddy/skills ../.agents/skills

echo
echo "--- 附加检查：实体副本漂移（工具管理区，本脚本不修改）---"
drift=0
for s in cli debugging exploring guide impact-analysis refactoring; do
  src=".agents/skills/gitnexus-$s/SKILL.md"
  for copy in ".claude/skills/gitnexus-$s/SKILL.md" ".claude/skills/gitnexus/gitnexus-$s/SKILL.md"; do
    if [ -f "$copy" ] && [ -f "$src" ]; then
      if ! diff -q "$src" "$copy" >/dev/null 2>&1; then
        printf '  drift   %s 与 %s 不一致\n' "$copy" "$src"
        drift=$((drift + 1))
      fi
    fi
  done
done
if [ "$drift" -eq 0 ]; then
  echo "  无漂移"
fi

echo
if [ "$CHECK_ONLY" -eq 1 ]; then
  printf '检查结果：正常 %d 个，异常 %d 个，冲突 %d 个（副本漂移 %d 处）\n' \
    "$ok" "$broken" "$conflict" "$drift"
  if [ "$broken" -gt 0 ] || [ "$conflict" -gt 0 ]; then
    echo
    echo "存在异常。运行 'bash .agents/scripts/setup-links.sh'（不带 --check）修复。"
    exit 1
  fi
  echo "全部正常，换机器后无需额外操作。"
else
  printf '完成：修复 %d 个，已正确 %d 个，冲突 %d 个（副本漂移 %d 处）\n' \
    "$fixed" "$ok" "$conflict" "$drift"
  if [ "$conflict" -gt 0 ]; then
    echo "注意：有 $conflict 个路径是实体文件/目录，脚本未覆盖，请人工确认。"
  fi
fi
