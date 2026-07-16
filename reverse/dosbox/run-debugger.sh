#!/bin/zsh
set -euo pipefail

root="${0:A:h:h:h}"
cd "$root"

mkdir -p reverse/logs reverse/captures reverse/dumps

if [[ "${TERM:-dumb}" == "dumb" ]]; then
  export TERM=xterm-256color
fi

exec dosbox-x \
  -defaultconf \
  -conf reverse/dosbox/angel2-debug.conf
