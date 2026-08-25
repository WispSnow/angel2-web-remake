#!/usr/bin/env bash
#
# 为 git worktree 补齐主检出里被 gitignore 的逆向证据与原始参考文件。
#
# 新建的 worktree 只包含 git 追踪的文件。`reverse/` 下的取证产物和 `ref/` 下的原始
# 资料都被 gitignore，主检出有、worktree 没有。缺了它们，生成脚本、开发服务器和
# 内容测试都会失败，而且失败方式看起来像是本次改动引入的回归。
#
# 用法：在 worktree 内运行 `bash scripts/setup-worktree.sh`。可重复运行。
#
# 要链接的目录从 `reverse/.gitignore` 和 `ref/` 的实际追踪状态推导，不在这里硬编码，
# 这样新增一类证据产物时脚本不会漏掉。

set -euo pipefail

worktree_root=$(git rev-parse --show-toplevel)
main_root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")

if [ "$worktree_root" = "$main_root" ]; then
  echo "这里就是主检出（$main_root），无需补链接。" >&2
  exit 1
fi

# 共享 info/exclude：worktree 私有的 info/exclude 不会被读取，而且 `dir/` 形式的
# 忽略规则匹配不到符号链接，所以链接必须在这里逐条登记，否则 worktree 的
# `git status` 永远不干净。
exclude_file="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
mkdir -p "$(dirname "$exclude_file")"
touch "$exclude_file"

linked=0
skipped=0

register_exclude() {
  local path=$1
  grep -qxF "$path" "$exclude_file" || printf '%s\n' "$path" >> "$exclude_file"
}

link_from_main() {
  local relative=$1
  local source="$main_root/$relative"
  local target="$worktree_root/$relative"

  [ -e "$source" ] || return 0
  if [ -L "$target" ]; then
    skipped=$((skipped + 1))
    register_exclude "$relative"
    return 0
  fi
  if [ -e "$target" ]; then
    echo "  跳过 $relative（worktree 里已有真实文件，不覆盖）"
    return 0
  fi
  mkdir -p "$(dirname "$target")"
  ln -s "$source" "$target"
  register_exclude "$relative"
  echo "  链接 $relative"
  linked=$((linked + 1))
}

# reverse/.gitignore 里每一条 `dir/` 都是主检出独有的取证产物。
while IFS= read -r entry; do
  link_from_main "reverse/${entry%/}"
done < <(grep -E '^[^#[:space:]].*/$' "$worktree_root/reverse/.gitignore")

# ref/ 只追踪 next-project/；其余原始资料（ANGEL2/ 只读游戏文件、关卡列表、参考视频）
# 都要从主检出借用。
if [ -d "$main_root/ref" ]; then
  while IFS= read -r name; do
    git -C "$main_root" ls-files --error-unmatch "ref/$name" >/dev/null 2>&1 && continue
    link_from_main "ref/$name"
  done < <(ls "$main_root/ref")   # 不用 -A：.DS_Store 之类的宿主垃圾不该跟进 worktree
fi

# 原版素材包不随仓库分发，worktree 里必须借用主检出那一份；漏了它，pnpm dev／test／
# build:release 都会被 check-original-assets.mjs 拦下，而且每个 worktree 复制一份要多占 67 MB。
link_from_main "public/assets/original"

echo
echo "已链接 $linked 项，$skipped 项此前已链接。"

if [ ! -d "$worktree_root/node_modules" ]; then
  echo
  echo "还需要在 worktree 内执行一次安装（不要软链主检出的 node_modules）："
  echo "  pnpm install"
fi

echo
echo "跑 e2e 时给这次运行一个独立端口，否则 reuseExistingServer 会接管主检出"
echo "在 4173 上的开发服务器，测到的其实是主检出的工作区："
echo "  ANGEL2_E2E_PORT=4199 pnpm exec playwright test <spec>"
