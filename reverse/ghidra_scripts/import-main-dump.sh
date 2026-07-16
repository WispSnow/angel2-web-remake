#!/bin/zsh
set -euo pipefail

root="${0:A:h:h:h}"
cd "$root"

dump="reverse/dumps/angel2-main-image-0fb8.bin"
module_dump="reverse/dumps/angel2-main-module-offset.bin"
script_dir="reverse/ghidra_scripts"

if [[ ! -f "$dump" ]]; then
  print -u2 "Missing $dump; capture the runtime image first."
  exit 1
fi

if command -v analyzeHeadless >/dev/null 2>&1; then
  headless="$(command -v analyzeHeadless)"
else
  headless="$(brew --prefix ghidra)/libexec/support/analyzeHeadless"
fi

cp "$dump" "$module_dump"

"$headless" reverse/ghidra Angel2Reverse \
  -import "$dump" \
  -loader BinaryLoader \
  -processor "x86:LE:16:Real Mode" \
  -loader-baseAddr "0FB8:0000" \
  -scriptPath "$script_dir" \
  -preScript MarkLoadedMainEntry.java "0FB8:0000" ANGEL2_RUNTIME_ENTRY \
  -analysisTimeoutPerFile 120 \
  -overwrite

"$headless" reverse/ghidra Angel2Reverse \
  -import "$module_dump" \
  -loader BinaryLoader \
  -processor "x86:LE:16:Real Mode" \
  -loader-baseAddr "0000:0000" \
  -scriptPath "$script_dir" \
  -preScript ConfigureModuleOffsetAnalysis.java \
  -preScript MarkLoadedMainEntry.java "0000:0000" ANGEL2_MODULE_ENTRY \
  -postScript ApplyAngel2Labels.java \
  -analysisTimeoutPerFile 120 \
  -overwrite
