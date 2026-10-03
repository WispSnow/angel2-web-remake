#!/usr/bin/env node

/**
 * 原版Debug模式的运行时内容：各原版选单与效果绑定、F1／EDIT／兵種／地型编辑器版面、格号读数几何、
 * 音乐盒名单与播放规则。
 * 来源只有 `reverse/parsed/native/debug-mode.json`（`reverse/tools/angel2-debug-mode.mjs` 导出）；
 * 选单原文、名单顺序与单曲集合都从那里读，不在 TypeScript 里手抄。
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRelative = "reverse/parsed/native/debug-mode.json";
const outputPath = path.join(root, "src/game/content/debug-mode.generated.ts");

const catalogRelative = "reverse/parsed/native/music-catalog.json";
const [sourceBytes, catalogBytes] = await Promise.all([
  readFile(path.join(root, sourceRelative)),
  readFile(path.join(root, catalogRelative)),
]);
const evidence = JSON.parse(sourceBytes.toString("utf8"));
const catalog = JSON.parse(catalogBytes.toString("utf8"));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const pickRect = ({ x, y, width, height, colour }) => ({ x, y, width, height, colour });

assert(evidence.format === "ANGEL2 module 29 developer debug mode", "unexpected debug-mode evidence format");
assert(evidence.gate?.address === "DS:132F" && evidence.gate.enabledValue === "Y", "debug gate evidence missing");

const sideLifeMenu = (key, menu, binding) => {
  assert(menu.items.length === 3, `${key} menu must have three items`);
  return {
    key,
    side: binding.side,
    descriptor: menu.descriptor,
    items: menu.items.map(({ code, label }) => {
      const effect = binding.results[code];
      assert(effect === "full" || effect === "remove" || effect === "one", `${key} ${code} has no verified effect`);
      return { code, label, effect };
    }),
  };
};

const sideLifeMenus = {
  enemy: sideLifeMenu("F3", evidence.menus.f3, evidence.sideLifeMenus.f3),
  ally: sideLifeMenu("F4", evidence.menus.f4, evidence.sideLifeMenus.f4),
};
assert(sideLifeMenus.enemy.side === 2 && sideLifeMenus.ally.side === 1, "F3/F4 side binding changed");

// F2：四项结果码与入口都来自 `0000:3113` 的分支。
const editTargets = ["allyUnitEditor", "enemyUnitEditor", "classDataEditor", "terrainDataEditor"];
const editMenu = {
  key: "F2",
  descriptor: evidence.menus.f2.descriptor,
  items: evidence.menus.f2.items.map(({ code, label }, index) => {
    const binding = evidence.editMenu.results[code];
    assert(binding?.target === editTargets[index], `F2 ${code} target drifted`);
    return { code, label, target: binding.target };
  }),
};

// F5／F6 一级选单与 `0000:6C66` 的二级选单；`治 療`／`生命全 ` 两个标题打开的二级选单对调是原文。
const techniqueCategory = (key, menu) => ({
  key,
  descriptor: menu.descriptor,
  items: menu.items.map(({ code, label }) => {
    const ranks = evidence.menus.techniqueRanks[code];
    assert(ranks && evidence.techniqueTest.rankMenuByCategory[code] === ranks.descriptor,
      `${key} ${code} has no verified rank menu`);
    return {
      code,
      label,
      ranks: ranks.items.map((item) => ({ code: item.code, label: item.label })),
    };
  }),
});
const techniqueMenus = {
  attack: techniqueCategory("F5", evidence.menus.f5),
  support: techniqueCategory("F6", evidence.menus.f6),
};
const techniqueCodes = [...techniqueMenus.attack.items, ...techniqueMenus.support.items]
  .flatMap(({ ranks }) => ranks.map(({ code }) => code));
assert(techniqueCodes.length === 31 && new Set(techniqueCodes).size === 31, "technique test must offer 31 distinct codes");
assert(techniqueMenus.support.items[0].ranks[0].code === "1I", "the 治療 header must still open the 回復 ranks");

const behaviourEvidence = evidence.aiBehaviourEditor;
assert(behaviourEvidence.labels.length === 13 && behaviourEvidence.labels.every(({ label }) => label),
  "F1 must name 13 behaviour values");
const behaviourEditor = {
  labels: behaviourEvidence.labels.map(({ value, label }) => ({ value, label })),
  selectableValues: behaviourEvidence.layout.selectableValues,
  layout: {
    panel: pickRect(behaviourEvidence.layout.panel),
    inner: pickRect(behaviourEvidence.layout.inner),
    figure: { x: behaviourEvidence.layout.figure.x, y: behaviourEvidence.layout.figure.y },
    labels: behaviourEvidence.layout.labels,
    highlight: behaviourEvidence.layout.highlight,
  },
};

// 我／敵 EDIT 的整屏版面（`0000:0ABE`）；行為框的標籤改用 F1 那張 13 項表（原版 EDIT 的表第 9 項
// 指回表本身、第 11 項讀到偽指標，見 `unitEditor.knownDefects`）。
const unitEditorEvidence = evidence.unitEditor;
assert(unitEditorEvidence?.layout?.grid?.columns === 3 && unitEditorEvidence.layout.grid.rows === 5,
  "unit editor grid evidence missing");
assert(unitEditorEvidence.layout.pageTabs.count === 4, "unit editor must have four pages");
const unitEditor = {
  layout: unitEditorEvidence.layout,
  exitLabel: unitEditorEvidence.layout.exit.text.label,
};

// 兵種（`0000:1294`）：表头原文照画；七列对应 `DATA` 行的字段，`field5` 原版标「魔防」、等级列重用「經驗」。
const classEditorEvidence = evidence.classDataEditor;
const classFieldByEvidence = {
  experienceThreshold: "experienceThreshold",
  attack: "attack",
  defense: "defense",
  life: "maxLife",
  movement: "movement",
  field5: "reservedField5",
  level: "level",
};
assert(classEditorEvidence.header.columns.length === 7, "the class editor must show seven DATA fields");
const classEditorLayout = classEditorEvidence.layout;
assert(classEditorLayout.table.columns.length === 7 && classEditorLayout.table.rows.length === 5,
  "the class editor table must be five rows by seven columns");
assert(classEditorEvidence.header.columns.every(({ x }, index) => x === classEditorLayout.table.columns[index]),
  "class editor header columns must sit over the value columns");
const classEditor = {
  header: classEditorEvidence.header.raw,
  fields: classEditorEvidence.header.columns.map(({ field, label }) => {
    const catalogField = classFieldByEvidence[field];
    assert(catalogField, `unknown class editor field ${field}`);
    return { field: catalogField, label };
  }),
  layout: classEditorLayout,
};

// 地型（`0000:1B3A`）：24 个原版地形名；第 24 项是 profile 之间的重叠字，不是逻辑地形槽。
const terrainEditorEvidence = evidence.terrainDataEditor;
assert(terrainEditorEvidence.terrainLabels.length === 24, "the terrain editor must name 24 strip cells");
const terrainEditor = {
  labels: terrainEditorEvidence.terrainLabels.map(({ slot, label, caution }) => ({
    slot,
    label,
    logicalSlot: caution === undefined,
  })),
  layout: terrainEditorEvidence.layout,
};
assert(terrainEditor.labels.filter(({ logicalSlot }) => logicalSlot).length === 23,
  "exactly 23 strip cells must be logical terrain slots");

const readout = evidence.cellReadout;
assert(readout?.digits === 5 && readout.fields.length === 2, "cell readout evidence missing");
const cellReadout = {
  digits: readout.digits,
  fields: readout.fields.map(({ id, clear, text }) => ({
    id,
    clear: { x: clear.x, y: clear.y, width: clear.width, height: clear.height },
    text,
  })),
};

const box = evidence.musicBox;
assert(box.entries.length === 32, "music box must list 32 table entries");
const lastReachableIndex = box.indexVariable.last;
assert(lastReachableIndex === 30, "music box index wrap changed");
const singleLoopRecords = box.playback.singleLoopRecords;
const musicBox = {
  lastReachableIndex,
  singleLoopRecords,
  entries: box.entries.map(({ index, container, record, legacyName, reachable }) => {
    assert(reachable === (index <= lastReachableIndex), `music box entry ${index} reachability drifted`);
    // MUSIC 记录 N 若不在单曲集合里，原版先提交 N+1 入场，再接 N 循环（`1000:3342..338E`）。
    const kind = singleLoopRecords.includes(record) ? "loop" : "intro-loop";
    assert(kind === "loop" || container === "MUSIC", `${legacyName} cannot be a MAGIC pair`);
    return { index, container, record, legacyName, reachable, kind };
  }),
};

// 音乐盒的用途说明只引用已闭合的原生用途：战场曲对的逐关表（场景号）与其余单曲角色。
const recordUsage = Object.fromEntries(catalog.records.map(({ key, roles }) => {
  const playerPhaseScenes = roles.flatMap(({ stageUse }) => stageUse?.playerPhase ?? []);
  const enemyPhaseScenes = roles.flatMap(({ stageUse }) => stageUse?.enemyPhase ?? []);
  return [key, { roles: roles.map(({ id }) => id), playerPhaseScenes, enemyPhaseScenes }];
}));
for (const entry of musicBox.entries) {
  if (entry.container !== "MUSIC") continue;
  const usage = recordUsage[`MUSIC/${entry.record}`];
  assert(usage && usage.roles.length > 0, `MUSIC/${entry.record} has no catalogued role`);
}
const sceneOverride = catalog.stageTables.enemyPhase.sceneOverrides
  .map(({ scene, key }) => ({ scene, key }));
assert(sceneOverride.length === 1 && sceneOverride[0].key === "UN/48" && sceneOverride[0].scene === 37,
  "the stage-37 enemy-phase track moved");

const hash = createHash("sha256").update(sourceBytes).digest("hex");
const catalogHash = createHash("sha256").update(catalogBytes).digest("hex");
const json = (value) => JSON.stringify(value);
const output = `// Generated by scripts/generate-debug-mode.mjs from ${sourceRelative}. Do not hand-edit.

export const ORIGINAL_DEBUG_MODE_SOURCES = ${json([
  { path: sourceRelative, sha256: hash, bytes: sourceBytes.length },
  { path: catalogRelative, sha256: catalogHash, bytes: catalogBytes.length },
])} as const;

/** F3（敌方）／F4（我方）原版选单：原文、结果码与 \`536B..53DD\` 已核验的效果。 */
export const NATIVE_DEBUG_SIDE_LIFE_MENUS = ${json(sideLifeMenus)} as const;

/** F2 原版选单 DS:\`413C\`：我／敵 EDIT 与第三批的兵種／地型编辑器。 */
export const NATIVE_DEBUG_EDIT_MENU = ${json(editMenu)} as const;

/** F5／F6 技术测试的一级与二级原版选单（\`0000:6C16\`、\`0000:6C66\`），二级项是原版技术代码。 */
export const NATIVE_DEBUG_TECHNIQUE_MENUS = ${json(techniqueMenus)} as const;

/** F1 行为编辑器 \`0000:2302\`：13 个原版行为名、指针可选的值与原生 640×350 版面。 */
export const NATIVE_DEBUG_BEHAVIOUR_EDITOR = ${json(behaviourEditor)} as const;

/** 我／敵 EDIT（\`0000:0ABE\`）：每方 60 槽、4 页 × 15 项列优先，原生 640×350 版面与配色。 */
export const NATIVE_DEBUG_UNIT_EDITOR = ${json(unitEditor)} as const;

/** 兵種（\`0000:1294\`）：39 条职业 × 5 行 × 7 列的 \`DATA\` 编辑器，原生 640×350 版面与配色。 */
export const NATIVE_DEBUG_CLASS_EDITOR = ${json(classEditor)} as const;

/** 地型（\`0000:1B3A\`）：24 格地形条、职业 0..36 的移动消耗与地形防御，原生 640×350 版面与配色。 */
export const NATIVE_DEBUG_TERRAIN_EDITOR = ${json(terrainEditor)} as const;

/** 调试键 2 的两个五位数字段（\`0000:326A\`），原生 640×350 座标。 */
export const NATIVE_DEBUG_CELL_READOUT = ${json(cellReadout)} as const;

/** 音乐盒名单 DS:19F6：序号在 0..lastReachableIndex 之间回绕，第 32 项因此选不到。 */
export const NATIVE_MUSIC_BOX = ${json(musicBox)} as const;

/** \`MUSIC.SWF\` 每条记录已闭合的原生用途；战场曲对的阶段关卡用原版内部场景号。 */
export const NATIVE_MUSIC_RECORD_USAGE: Readonly<Record<string, {
  readonly roles: readonly string[];
  readonly playerPhaseScenes: readonly number[];
  readonly enemyPhaseScenes: readonly number[];
}>> = ${json(recordUsage)};

/** 逐关表之外唯一的场景分支：第 37 关敌方阶段改播 \`UN/48\`（\`1000:36E6\`）。 */
export const NATIVE_ENEMY_PHASE_SCENE_OVERRIDES = ${json(sceneOverride)} as const;
`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, output);
console.log(`wrote ${path.relative(root, outputPath)}: ${musicBox.entries.length} music box entries`);
