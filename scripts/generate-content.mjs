import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const generators = [
  "generate-class-catalog.mjs",
  "generate-portrait-catalog.mjs",
  "generate-stage0-runtime.mjs",
  "generate-stage1-runtime.mjs",
  "generate-stage2-runtime.mjs",
  "generate-stage3-runtime.mjs",
  "generate-stage4-runtime.mjs",
  "generate-stage5-runtime.mjs",
  "generate-stage0-actions.mjs",
  "generate-stage1-actions.mjs",
  "generate-map-action-atlases.mjs",
  "generate-dynamic-terrain-assets.mjs",
  "generate-ai-technique-dialogue.mjs",
  "generate-technique-lab.mjs",
  "generate-music-assets.mjs",
  "generate-stage38-runtime.mjs",
  "generate-credits-runtime.mjs",
];

const scriptsDirectory = fileURLToPath(new URL(".", import.meta.url));

for (const generator of generators) {
  const result = spawnSync(process.execPath, [`${scriptsDirectory}${generator}`], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
