#!/bin/zsh
set -euo pipefail

root="${0:A:h:h:h}"
cd "$root"

mkdir -p reverse/logs reverse/captures
rm -f reverse/logs/dosbox-x-trace.log
rm -f reverse/logs/dosbox-x-console.log

seconds="${ANGEL2_TRACE_SECONDS:-12}"
exec dosbox-x \
  -defaultconf \
  -conf reverse/dosbox/angel2-trace.conf \
  -log-fileio \
  -silent \
  -exit \
  -time-limit "$seconds" \
  > reverse/logs/dosbox-x-console.log 2>&1
