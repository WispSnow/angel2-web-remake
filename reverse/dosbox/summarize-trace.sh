#!/bin/zsh
set -euo pipefail

root="${0:A:h:h:h}"
cd "$root"

log="${1:-reverse/logs/dosbox-x-trace.log}"
if [[ ! -f "$log" ]]; then
  print -u2 "Trace log not found: $log"
  exit 1
fi

print "Execution and first-open order:"
rg 'EXEC:Execute|file open command' "$log" \
  | sed -E 's/.*(EXEC:Execute|FILES:(Special )?file open command)/\1/' \
  | awk '!seen[$0]++'

print ""
print "Game files in first-open order:"
rg 'file open command' "$log" \
  | sed -E 's/.* file //' \
  | rg -v '^Z:\\' \
  | awk '!seen[$0]++' \
  | nl -ba
