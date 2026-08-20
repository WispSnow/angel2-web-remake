#!/usr/bin/env node

/**
 * 角色圖鑑的登場資料生成器。
 *
 * 名字、肖像記錄與名冊槽全部取自 `campaign-roster.json` 的原版角色描述子表；出場關卡
 * 由三條互相獨立的原版通道合併而成，缺一條就會漏掉真的會在關卡裡見到的角色：
 *
 * - 靜態模板（`battle-templates.json` 的 `activeUnitInstances`）：開場就擺在棋盤上的槽；
 * - 名單候選（同檔的 `deployment.eligibleUnitSlots`，已按 `scenarioUnitFlags` 過濾）；
 * - 逐關回合事件與完整場景（`stage-events.json`）：戰鬥中才生成或搬上場的槽。
 *
 * 劇情登場再由「關卡 → SAY 記錄 → 記錄裡出現過的肖像編號」推出，因此只在劇情裡說話、
 * 從不上場的角色（例如龍王）也會出現在圖鑑裡。
 */

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const reversePath = (...parts) => path.join(root, "reverse", ...parts);
const outputPath = path.join(root, "src/game/content/character-catalog.generated.ts");
const dialogueDirectory = reversePath("parsed/dialogue");

const inputPaths = {
  campaignRoster: reversePath("parsed/native/campaign-roster.json"),
  battleTemplates: reversePath("parsed/native/battle-templates.json"),
  battleObjectives: reversePath("parsed/native/battle-objectives.json"),
  stageEvents: reversePath("parsed/native/stage-events.json"),
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const inputBuffers = Object.fromEntries(await Promise.all(
  Object.entries(inputPaths).map(async ([id, file]) => [id, await readFile(file)]),
));
const parseInput = (id) => JSON.parse(inputBuffers[id].toString("utf8"));
const campaignRoster = parseInput("campaignRoster");
const battleTemplates = parseInput("battleTemplates");
const battleObjectives = parseInput("battleObjectives");
const stageEvents = parseInput("stageEvents");

/**
 * 原版關卡編號到複刻關卡的對應：25 在戰役路線上被跳過（第 24 關直接接第 26 關），
 * 42 是第 5 關之後的異世界之門插曲，49 是通關後的結局。其餘 0..38 逐一實裝。
 */
const NATIVE_STAGES = [...Array.from({ length: 39 }, (_, index) => index).filter(
  (stage) => stage !== 25,
), 42, 49];

/**
 * 角色語意 ID 由本表給定，不從中文名推導：名字是 Big5 音譯，機器轉寫會在「蘭」和
 * 「嵐」這種同音字上撞號。生成時會逐項核對名字與原版描述子表一致。
 */
const CHARACTERS = [
  { id: "nia", name: "妮雅", allySlot: 0 },
  { id: "ximi", name: "希蜜", allySlot: 1 },
  { id: "mengxinman", name: "蒙欣曼", allySlot: 2 },
  { id: "daixi", name: "黛西", allySlot: 3 },
  { id: "laduona", name: "拉朵那", allySlot: 4 },
  { id: "tingtaqi", name: "汀塔琪", allySlot: 5, enemySlot: 25 },
  { id: "laiyin", name: "萊茵", allySlot: 6, enemySlot: 26 },
  { id: "qinsi", name: "琴斯", allySlot: 7 },
  { id: "sulanda", name: "蘇蘭達", allySlot: 8 },
  { id: "duoli", name: "多莉", allySlot: 9 },
  { id: "malin", name: "瑪琳", allySlot: 10 },
  { id: "molina", name: "摩莉娜", allySlot: 11 },
  { id: "yalisha", name: "亞莉沙", allySlot: 12 },
  { id: "kelisi", name: "克莉絲", allySlot: 13 },
  { id: "shufeiya", name: "舒菲亞", allySlot: 14 },
  { id: "jiexika", name: "潔西卡", allySlot: 15 },
  { id: "zhuliya", name: "茱莉亞", allySlot: 16 },
  { id: "amanni", name: "阿曼妮", allySlot: 17 },
  { id: "leiyila", name: "雷伊拉", allySlot: 18 },
  { id: "tasijia", name: "塔絲加", allySlot: 19 },
  { id: "leiqidite", name: "蕾奇蒂特", allySlot: 20 },
  { id: "aiouliya", name: "愛歐里雅", allySlot: 21 },
  { id: "ailioula", name: "愛莉歐拉", allySlot: 22 },
  { id: "weisita", name: "維絲塔", allySlot: 23, enemySlot: 27 },
  { id: "gedilasi", name: "葛蒂拉斯", allySlot: 24, enemySlot: 2 },
  { id: "fang", name: "芳", allySlot: 25, enemySlot: 8 },
  { id: "lan", name: "蘭", allySlot: 26, enemySlot: 9 },
  { id: "sha", name: "莎", allySlot: 27, enemySlot: 10 },
  { id: "qian", name: "倩", allySlot: 28, enemySlot: 11 },
  { id: "li", name: "麗", allySlot: 29, enemySlot: 12 },
  { id: "ai", name: "愛", allySlot: 30, enemySlot: 13 },
  { id: "ran", name: "嵐", allySlot: 31, enemySlot: 14 },
  { id: "shouhuzhe", name: "守護者", allySlot: 32 },
  // `D/67` 是龍王的第二個肖像記錄，只在第 20 關的解石化演出裡出現。
  { id: "longwang", name: "龍王", allySlot: 33, aliasPortraits: [67] },
  { id: "binaweiji", name: "碧娜維姬", enemySlot: 1 },
  { id: "kuanmeiyi", name: "庫安梅伊", enemySlot: 3 },
  { id: "aixikeluo", name: "艾西柯羅", enemySlot: 4 },
  { id: "feiyiluyin", name: "菲伊魯茵", enemySlot: 5 },
  { id: "fumaroni", name: "芙瑪羅妮", enemySlot: 6 },
  { id: "leinajifu", name: "蕾娜吉芙", enemySlot: 7 },
  { id: "hading", name: "哈釘", enemySlot: 15 },
  { id: "nami", name: "娜米", enemySlot: 16 },
  { id: "meidi", name: "梅蒂", enemySlot: 17 },
  { id: "laili", name: "萊莉", enemySlot: 18 },
  { id: "xiailei", name: "西艾蕾", enemySlot: 19 },
  { id: "kenuosi", name: "克諾絲", enemySlot: 20 },
  { id: "lilante", name: "麗蘭特", enemySlot: 21 },
  { id: "feiniya", name: "菲尼雅", enemySlot: 22 },
  { id: "alisi", name: "阿莉絲", enemySlot: 23 },
  { id: "maxier", name: "瑪西爾", enemySlot: 24 },
  { id: "yaolong", name: "妖龍", enemySlot: 28 },
];

const GENERIC_NAME = /^xxxx/;
const UNNAMED_PORTRAIT = 255;

const namedActors = (actors) => new Map(actors
  .filter((actor) => !GENERIC_NAME.test(actor.normalizedName))
  .map((actor) => [actor.slot, actor]));

const { actors, enemyActors } = campaignRoster.displayResolution;
const allyActors = namedActors(actors);
const enemyActorsBySlot = namedActors(enemyActors);

const ids = new Set();
for (const character of CHARACTERS) {
  if (ids.has(character.id)) throw new Error(`duplicate character id ${character.id}`);
  ids.add(character.id);
  for (const [slot, table, label] of [
    [character.allySlot, allyActors, "side 1"],
    [character.enemySlot, enemyActorsBySlot, "side 2"],
  ]) {
    if (slot === undefined) continue;
    const actor = table.get(slot);
    if (!actor) throw new Error(`${label} slot ${slot} is not a named actor`);
    if (actor.normalizedName !== character.name) {
      throw new Error(`${label} slot ${slot} is ${actor.normalizedName}, not ${character.name}`);
    }
  }
}
for (const [slots, label] of [[allyActors, "side 1"], [enemyActorsBySlot, "side 2"]]) {
  for (const slot of slots.keys()) {
    const known = CHARACTERS.some((character) =>
      (label === "side 1" ? character.allySlot : character.enemySlot) === slot);
    if (!known) throw new Error(`${label} slot ${slot} has no catalog entry`);
  }
}

const characterByAllySlot = new Map(CHARACTERS
  .filter((character) => character.allySlot !== undefined)
  .map((character) => [character.allySlot, character]));
const characterByEnemySlot = new Map(CHARACTERS
  .filter((character) => character.enemySlot !== undefined)
  .map((character) => [character.enemySlot, character]));
const characterBySlot = (side, slot) =>
  (side === 1 ? characterByAllySlot : characterByEnemySlot).get(slot);

/** 兩側描述子指向同一個角色時，肖像記錄逐值相同；`FF` 表示改用職業回退肖像。 */
const portraitRecordFor = (character) => {
  const records = new Set([character.allySlot === undefined
    ? undefined
    : allyActors.get(character.allySlot).portraitRecord,
  character.enemySlot === undefined
    ? undefined
    : enemyActorsBySlot.get(character.enemySlot).portraitRecord,
  ].filter((record) => record !== undefined && record !== UNNAMED_PORTRAIT));
  if (records.size > 1) throw new Error(`${character.id} has conflicting portrait records`);
  return records.size === 1 ? [...records][0] : null;
};

const appearances = new Map(CHARACTERS.map((character) => [character.id, new Map()]));
const stageEntry = (character, stage) => {
  const stages = appearances.get(character.id);
  const entry = stages.get(stage)
    ?? {
      roles: new Set(),
      classNames: new Set(),
      mustSurvive: false,
      objective: false,
      escort: false,
    };
  stages.set(stage, entry);
  return entry;
};
const record = (character, stage, role, className) => {
  if (!character || !NATIVE_STAGES.includes(stage)) return;
  const entry = stageEntry(character, stage);
  entry.roles.add(role);
  if (className) entry.classNames.add(className);
};

for (const template of battleTemplates.stages) {
  for (const instance of template.activeUnitInstances) {
    record(
      characterBySlot(instance.side, instance.unitSlot),
      template.stage,
      "board",
      instance.className,
    );
  }
  for (const slot of template.deployment?.eligibleUnitSlots ?? []) {
    record(characterByAllySlot.get(slot), template.stage, "roster");
  }
}

for (const handler of stageEvents.module29BattleRuntime.handlerBehaviorCatalog.handlers) {
  for (const event of handler.events ?? []) {
    for (const action of event.actions ?? []) {
      if (action.op === "spawn") {
        record(characterBySlot(action.side, action.unitSlot), handler.stage, "scripted");
      }
      for (const slot of action.op === "spawnSequentialSide1Slots" ? action.slots : []) {
        record(characterByAllySlot.get(slot), handler.stage, "scripted");
      }
    }
  }
}
for (const scene of stageEvents.scenes ?? []) {
  for (const action of scene.round1 ?? []) {
    if (action.op !== "spawn") continue;
    record(
      characterBySlot(action.unit.side, action.unit.unitSlot),
      scene.stage,
      "scripted",
      action.unit.className,
    );
  }
}

/**
 * 勝負條件裡點名的槽。玩家在圖鑑上最想知道的兩件事就是「誰不能倒」和「打倒誰就贏」，
 * 而原版把它們寫成同一張表裡的兩個欄位，所以這裡一起讀。
 */
const objectiveSlots = (condition) =>
  [condition.unitSlot, ...(condition.unitSlots ?? [])].filter((slot) => slot !== undefined);
for (const { stage, defeat, victory } of battleObjectives.normalStageObjectives) {
  if (!NATIVE_STAGES.includes(stage)) continue;
  for (const slot of objectiveSlots(defeat)) {
    if (defeat.side !== 1) continue;
    const character = characterByAllySlot.get(slot);
    if (character) stageEntry(character, stage).mustSurvive = true;
  }
  for (const slot of objectiveSlots(victory)) {
    // 勝利條件的 `side` 決定這個槽的意思：2 是要打倒的敵人，1 是要送到出口的我方角色。
    // 只看 `kind` 會把第 9 關的「多莉抵達飛船」誤讀成敵方槽 9。
    const character = victory.side === 2
      ? characterByEnemySlot.get(slot)
      : characterByAllySlot.get(slot);
    if (!character) continue;
    const entry = stageEntry(character, stage);
    if (victory.side === 2) entry.objective = true;
    else entry.escort = true;
  }
}

/** 關卡 → 該關會播放的 SAY 記錄。三條通道都要收，只看開場記錄會漏掉勝利演出。 */
const storyRecordsByStage = new Map();
const addStoryRecord = (stage, storyRecord) => {
  if (storyRecord === null || storyRecord === undefined) return;
  const records = storyRecordsByStage.get(stage) ?? new Set();
  records.add(storyRecord);
  storyRecordsByStage.set(stage, records);
};
for (const entry of stageEvents.module25CampaignStory.stageStoryRecords) {
  addStoryRecord(entry.stage, entry.record);
}
for (const handler of stageEvents.module29BattleRuntime.handlerBehaviorCatalog.handlers) {
  for (const event of handler.events ?? []) {
    for (const storyRecord of event.sayRecords ?? []) addStoryRecord(handler.stage, storyRecord);
  }
}
for (const scene of stageEvents.scenes ?? []) {
  addStoryRecord(scene.stage, scene.module25StoryRecord);
}

const characterByPortrait = new Map();
for (const character of CHARACTERS) {
  const portrait = portraitRecordFor(character);
  for (const id of [portrait, ...(character.aliasPortraits ?? [])]) {
    if (id === null) continue;
    if (characterByPortrait.has(id)) throw new Error(`portrait ${id} maps to two characters`);
    characterByPortrait.set(id, character);
  }
}

const dialogueFiles = new Set(await readdir(dialogueDirectory));
const dialogueDigest = [];
const portraitsInRecord = async (storyRecord) => {
  const file = `${String(storyRecord).padStart(4, "0")}.json`;
  if (!dialogueFiles.has(file)) throw new Error(`missing parsed dialogue record ${file}`);
  const bytes = await readFile(path.join(dialogueDirectory, file));
  dialogueDigest.push(`${file}:${sha256(bytes)}`);
  const portraits = new Set();
  for (const action of JSON.parse(bytes.toString("utf8")).actions) {
    if (Number.isInteger(action.portraitId)) portraits.add(action.portraitId);
  }
  return portraits;
};

for (const stage of NATIVE_STAGES) {
  for (const storyRecord of [...(storyRecordsByStage.get(stage) ?? [])].sort((a, b) => a - b)) {
    for (const portrait of await portraitsInRecord(storyRecord)) {
      record(characterByPortrait.get(portrait), stage, "story");
    }
  }
}

const ROLE_ORDER = ["board", "scripted", "roster", "story"];
const entries = CHARACTERS.map((character) => {
  const stages = appearances.get(character.id);
  if (stages.size === 0) throw new Error(`${character.id} never appears in any stage`);
  return {
    id: character.id,
    name: character.name,
    portraitRecord: portraitRecordFor(character),
    allySlot: character.allySlot ?? null,
    enemySlot: character.enemySlot ?? null,
    appearances: [...stages.entries()]
      .sort(([left], [right]) => NATIVE_STAGES.indexOf(left) - NATIVE_STAGES.indexOf(right))
      .map(([stage, entry]) => ({
        stage,
        roles: ROLE_ORDER.filter((role) => entry.roles.has(role)),
        ...(entry.classNames.size > 0 ? { classNames: [...entry.classNames].sort() } : {}),
        ...(entry.mustSurvive ? { mustSurvive: true } : {}),
        ...(entry.objective ? { objective: true } : {}),
        ...(entry.escort ? { escort: true } : {}),
      })),
  };
});

const sources = Object.fromEntries([
  ...Object.entries(inputPaths).map(([id, file]) => [id, {
    path: path.relative(root, file),
    sha256: sha256(inputBuffers[id]),
  }]),
  ["dialogueRecords", {
    path: `${path.relative(root, dialogueDirectory)}/*.json`,
    records: dialogueDigest.length,
    sha256: sha256(dialogueDigest.sort().join("\n")),
  }],
]);

const source = `// Generated by scripts/generate-character-catalog.mjs from the native actor
// descriptor tables, battle templates, per-stage event handlers and dialogue corpus.
// Do not hand-edit: run pnpm content:characters after the evidence changes.
export const CHARACTER_CATALOG_SOURCES = ${JSON.stringify(sources)} as const;
/** 原版關卡編號；複刻跳過 25，42 是異世界之門插曲，49 是結局。 */
export const CHARACTER_NATIVE_STAGES = ${JSON.stringify(NATIVE_STAGES)} as const;
export type CharacterId = ${entries.map((entry) => JSON.stringify(entry.id)).join(" | ")};
export type CharacterStageRole = ${ROLE_ORDER.map((role) => JSON.stringify(role)).join(" | ")};
export interface CharacterStageAppearance {
  /** 原版關卡編號，不是複刻序數。 */
  stage: number;
  roles: readonly CharacterStageRole[];
  /** 關卡模板釘死的職業；隨戰役名冊繼承職業的槽沒有這一欄。 */
  classNames?: readonly string[];
  /** 這一關把她列進戰敗條件：她被擊倒就輸。 */
  mustSurvive?: true;
  /** 這一關把她列進勝利條件：擊倒她就贏。 */
  objective?: true;
  /** 這一關的勝利條件是把她送到指定出口。 */
  escort?: true;
}
export interface CharacterCatalogEntry {
  id: CharacterId;
  name: string;
  /** \`null\` 表示原版描述子填 FF，改用當前職業的回退肖像。 */
  portraitRecord: number | null;
  allySlot: number | null;
  enemySlot: number | null;
  appearances: readonly CharacterStageAppearance[];
}
export const CHARACTER_CATALOG: readonly CharacterCatalogEntry[] = ${
  JSON.stringify(entries)} as const;
`;
await writeFile(outputPath, source, "utf8");

const appearanceCount = entries.reduce((total, entry) => total + entry.appearances.length, 0);
console.log(
  `wrote ${path.relative(root, outputPath)} `
  + `(${entries.length} characters, ${appearanceCount} stage appearances, `
  + `${dialogueDigest.length} dialogue records)`,
);
