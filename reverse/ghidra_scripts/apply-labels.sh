#!/bin/zsh
set -euo pipefail

root="${0:A:h:h:h}"
cd "$root"

if command -v analyzeHeadless >/dev/null 2>&1; then
  headless="$(command -v analyzeHeadless)"
else
  headless="$(brew --prefix ghidra)/libexec/support/analyzeHeadless"
fi

for program in GO.EXE angel2-main-module-offset.bin; do
  "$headless" reverse/ghidra Angel2Reverse \
    -process "$program" \
    -noanalysis \
    -scriptPath reverse/ghidra_scripts \
    -postScript ApplyAngel2Labels.java
done
