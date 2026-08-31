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
  "generate-stage6-runtime.mjs",
  "generate-stage7-runtime.mjs",
  "generate-stage8-runtime.mjs",
  "generate-stage9-runtime.mjs",
  "generate-stage10-runtime.mjs",
  "generate-stage11-runtime.mjs",
  "generate-stage12-runtime.mjs",
  "generate-stage13-runtime.mjs",
  "generate-stage14-runtime.mjs",
  "generate-stage15-runtime.mjs",
  "generate-stage16-runtime.mjs",
  "generate-stage17-runtime.mjs",
  "generate-stage18-runtime.mjs",
  "generate-stage19-runtime.mjs",
  "generate-stage20-runtime.mjs",
  "generate-stage21-runtime.mjs",
  "generate-stage22-runtime.mjs",
  "generate-stage23-runtime.mjs",
  "generate-stage24-runtime.mjs",
  "generate-stage26-runtime.mjs",
  "generate-stage27-runtime.mjs",
  "generate-stage28-runtime.mjs",
  "generate-stage29-runtime.mjs",
  "generate-stage30-runtime.mjs",
  "generate-stage31-runtime.mjs",
  "generate-stage32-runtime.mjs",
  "generate-stage33-runtime.mjs",
  "generate-stage34-runtime.mjs",
  "generate-stage35-runtime.mjs",
  "generate-stage36-runtime.mjs",
  "generate-stage37-runtime.mjs",
  "generate-stage38-runtime.mjs",
  "generate-stage49-ending.mjs",
  "generate-stage0-actions.mjs",
  "generate-stage1-actions.mjs",
  "generate-map-action-atlases.mjs",
  "generate-full-combat-atlases.mjs",
  "generate-battle-sprite-atlases.mjs",
  "generate-dynamic-terrain-assets.mjs",
  "generate-ai-technique-dialogue.mjs",
  "generate-technique-lab.mjs",
  "generate-music-assets.mjs",
  "generate-credits-runtime.mjs",
  "generate-resource-manifest.mjs",
];

const scriptsDirectory = fileURLToPath(new URL(".", import.meta.url));

for (const generator of generators) {
  const result = spawnSync(process.execPath, [`${scriptsDirectory}${generator}`], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
