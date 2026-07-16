#!/bin/zsh
set -euo pipefail

root="${0:A:h:h:h}"
cd "$root"

module_dir="reverse/unpacked/runtime-modules"
manifest="$module_dir/manifest.json"
script_dir="reverse/ghidra_scripts"

if [[ ! -f "$manifest" ]]; then
  print -u2 "Missing $manifest; reconstruct the UN.SWF runtime modules first."
  exit 1
fi

if command -v analyzeHeadless >/dev/null 2>&1; then
  headless="$(command -v analyzeHeadless)"
else
  headless="$(brew --prefix ghidra)/libexec/support/analyzeHeadless"
fi

while IFS=$'\t' read -r record image entry; do
  input="$module_dir/$image"
  if [[ ! -f "$input" ]]; then
    print -u2 "Missing runtime module image: $input"
    exit 1
  fi
  stem="${image:r}"
  label="ANGEL2_UN_${stem}_ENTRY"
  "$headless" reverse/ghidra Angel2Reverse \
    -import "$input" \
    -loader BinaryLoader \
    -processor "x86:LE:16:Real Mode" \
    -loader-baseAddr "0000:0000" \
    -scriptPath "$script_dir" \
    -preScript ConfigureModuleOffsetAnalysis.java \
    -preScript MarkLoadedMainEntry.java "$entry" "$label" \
    -analysisTimeoutPerFile 120 \
    -overwrite
done < <(jq -r '.modules[] | [.headerRecord, .image, .entryAddress] | @tsv' "$manifest")

print "Imported $(jq -r '.moduleCount' "$manifest") ANGEL2 runtime modules"
