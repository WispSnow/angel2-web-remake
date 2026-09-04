#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = path.join(root, "reverse/parsed/native/ai-rules.json");
const outputPath = path.join(root, "src/game/content/ai-technique-dialogue.generated.ts");

const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
const presentation = evidence.rules?.aiTechniquePresentation;
if (!presentation) throw new Error("missing native AI technique presentation evidence");

const expectedActionCodes = [
  "1L", "2L", "3L", "4L",
  "1F", "2F", "3F", "4F", "1V", "2V", "3V",
  "1C", "2C", "3C", "4C",
  "1D", "2D", "3D",
  "1I", "2I", "3I",
  "1H", "2H", "3H",
  "AD", "AA", "SD", "SA", "IP", "SN", "LA", "TR", "WD",
];
const actionBindings = presentation.actionBindings ?? [];
const groups = presentation.groups ?? [];
if (groups.length !== 14 || actionBindings.length !== 33) {
  throw new Error(
    `expected 14 AI dialogue groups and 33 bindings, got ${groups.length}/${actionBindings.length}`,
  );
}
const actualActionCodes = actionBindings.map(({ actionCode }) => actionCode);
if (JSON.stringify(actualActionCodes) !== JSON.stringify(expectedActionCodes)) {
  throw new Error(`native AI dialogue action order changed: ${actualActionCodes.join(",")}`);
}
if (groups.some(({ presentationGroup }, index) => presentationGroup !== index + 10)) {
  throw new Error("native AI dialogue groups are no longer contiguous 10..23");
}

// Contextual entries outside 0Ah..17h share the DS:84BB table but each belongs
// to its own trigger rather than to the 33 AI action rows, so they are published
// under semantic keys instead of joining the native-code map. Only the entries
// the remake actually drives are listed; 06h and 19h have no call site in the
// release build and must stay unimplemented.
// `gate` records how the line reaches `0000:C97E`: `direct` sites are player
// responses that the ＡＩ對話 switch never silences, `aiDialogue` sites go through
// `1000:254F` and must honour DS:111C exactly like the technique lines, and
// `mixed` means the same line has one of each, so the caller picks.
const CONTEXTUAL_LINES = [
  { key: "restingLowLife", selector: "00h", record: "resting-low-life", gate: "aiDialogue", text: "快不行了!...我必需休息一下." },
  { key: "breakingContact", selector: "01h", record: "breaking-contact", gate: "aiDialogue", text: "我體力太低了!|先閃一邊...." },
  { key: "surrounded", selector: "02h", record: "surrounded", gate: "aiDialogue", text: "這....被包圍了." },
  // `1000:2291`: the rest a class flow takes after its attack, shot or
  // technique found nothing to do while the unit is below full life.
  { key: "restingToRecover", selector: "05h", record: "resting-to-recover", gate: "aiDialogue", text: "等我補足體力就去教訓妳." },
  { key: "shootingAnnounce", selector: "08h", record: "shooting-announce", gate: "aiDialogue", text: "看我的飛箭." },
  { key: "spellSealed", selector: "1Ah", record: "spell-sealed", gate: "direct", text: "我中了禁咒，無法使用法術．" },
  { key: "noTargetInRange", selector: "1Bh", record: "no-target-in-range", gate: "direct", text: "沒有人在我的攻擊範圍內．" },
  { key: "confusedActor", selector: "1Ch", record: "confused-actor", gate: "direct", text: "我的頭好昏，無法思考．" },
  // The dodge line is the one entry with both kinds of call site: the player's
  // own shot answers through `0000:C97E`, the AI's through `1000:254F`, so the
  // switch silences it only when the AI is the one shooting.
  { key: "dodgedShot", selector: "1Dh", record: "dodged-shot", gate: "mixed", text: "要打中我沒那麼容易．" },
  { key: "counterattack", selector: "1Eh", record: "counterattack", gate: "direct", text: "妳竟敢打我．" },
  // The one entry with a numeric field: `0000:EF56` writes the award into the
  // five ASCII digits before the window opens, so the digits ship verbatim and
  // the runtime substitutes them the same way the native does.
  { key: "experienceGain", selector: "18h", record: "experience-gain", gate: "direct", text: "得經驗值00000 點" },
];
const NUMERIC_CONTEXTUAL_LINES = new Map([["experienceGain", { digits: "00000", writer: "0000:EF56" }]]);
const contextualTable = evidence.rules?.contextualBattleLines;
if (!contextualTable?.entries) throw new Error("missing native contextual battle-line evidence");
const contextualBySelector = new Map(
  contextualTable.entries.map((entry) => [entry.selector, entry]),
);
const contextualLines = Object.fromEntries(CONTEXTUAL_LINES.map((line) => {
  const entry = contextualBySelector.get(line.selector);
  if (!entry) throw new Error(`missing contextual battle line ${line.selector}`);
  if (entry.text !== line.text) {
    throw new Error(`contextual line ${line.selector}: expected ${line.text}, got ${entry.text}`);
  }
  if (!entry.reachable) throw new Error(`contextual line ${line.selector} lost its call site`);
  // The gate is a property of the call sites, not a hand-written label.
  const gate = entry.emitters.every(({ target }) => target.startsWith("1000:254F"))
    ? "aiDialogue"
    : entry.emitters.every(({ target }) => target.startsWith("0000:C97"))
      ? "direct"
      : "mixed";
  if (gate !== line.gate) {
    throw new Error(`contextual line ${line.selector}: expected ${line.gate} gate, call sites say ${gate}`);
  }
  const numeric = NUMERIC_CONTEXTUAL_LINES.get(line.key);
  if (numeric && !entry.text.includes(numeric.digits)) {
    throw new Error(`contextual line ${line.selector} lost its ${numeric.digits} numeric field`);
  }
  return [line.key, {
    record: line.record,
    selector: Number.parseInt(entry.selector, 16),
    pointerEntry: entry.pointerEntry,
    address: entry.address,
    gate,
    // `|` is the native newline inside a single contextual string.
    text: entry.text.replaceAll("|", "\n"),
    emitters: entry.emitters.map(({ address }) => address),
    // `0000:EF56` overwrites exactly these ASCII cells, blanking leading zeros
    // to spaces, so the field is a fixed-width right-aligned slot rather than a
    // free-form placeholder.
    ...(numeric ? { numericField: { digits: numeric.digits, writer: numeric.writer } } : {}),
  }];
}));

// The confusion route keeps its own dedicated evidence block, so cross-check the
// two extractions against each other rather than trusting one of them.
const confusionRoute = evidence.rules?.playerConfusionRoute;
const confusedActorLine = confusionRoute?.confusionBranch;
if (confusedActorLine?.text !== contextualLines.confusedActor.text
  || confusedActorLine.address !== contextualLines.confusedActor.address) {
  throw new Error("player-confusion route and contextual line table disagree");
}

const byNativeCode = Object.fromEntries(actionBindings.map((binding) => [
  binding.actionCode,
  {
    nativeCode: binding.actionCode,
    presentationGroup: binding.presentationGroup,
    selector: binding.presentationGroup,
    address: binding.address,
    text: binding.text,
  },
]));
const groupCatalog = groups.map((group) => ({
  presentationGroup: group.presentationGroup,
  selector: group.presentationGroup,
  pointerEntry: group.pointerEntry,
  address: group.address,
  text: group.text,
}));

const source = `// Generated by scripts/generate-ai-technique-dialogue.mjs from native AI evidence.\n`
  + `// Do not hand-edit.\n`
  + `export interface NativeAiTechniqueDialogueRecord {\n`
  + `  readonly nativeCode: string;\n`
  + `  readonly presentationGroup: number;\n`
  + `  readonly selector: number;\n`
  + `  readonly address: \`DS:\${string}\`;\n`
  + `  readonly text: string;\n`
  + `}\n\n`
  + `export const NATIVE_AI_TECHNIQUE_DIALOGUE_GROUPS = ${JSON.stringify(groupCatalog, null, 2)} as const;\n\n`
  + `export const NATIVE_AI_TECHNIQUE_DIALOGUE_BY_CODE: Readonly<Record<string, NativeAiTechniqueDialogueRecord>> = ${JSON.stringify(byNativeCode, null, 2)};\n\n`
  + `export interface NativeContextualBattleLine {\n`
  + `  readonly record: string;\n`
  + `  readonly selector: number;\n`
  + `  readonly pointerEntry: \`DS:\${string}\`;\n`
  + `  readonly address: \`DS:\${string}\`;\n`
  + `  /** \`aiDialogue\` lines are silenced by the ＡＩ對話 switch; \`direct\` ones are not. */\n`
  + `  readonly gate: "aiDialogue" | "direct" | "mixed";\n`
  + `  readonly text: string;\n`
  + `  /** Native call sites that play this line. */\n`
  + `  readonly emitters: readonly string[];\n`
  + `}\n\n`
  + `/**\n`
  + ` * DS:84BB entries outside the AI technique groups. Each carries the gate its\n`
  + ` * own call sites use: the player responses reach \`0000:C97E\` directly and\n`
  + ` * are never silenced, while the AI lines go through \`1000:254F\` and follow\n`
  + ` * the ＡＩ對話 switch.\n`
  + ` */\n`
  + `export const NATIVE_CONTEXTUAL_BATTLE_LINES = ${JSON.stringify(contextualLines, null, 2)} as const;\n\n`
  + `export const NATIVE_CONFUSED_ACTOR_DIALOGUE = NATIVE_CONTEXTUAL_BATTLE_LINES.confusedActor;\n`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, source, "utf8");
console.log(
  `wrote ${path.relative(root, outputPath)} with ${groups.length} groups, ${actionBindings.length} action bindings`
    + ` and ${CONTEXTUAL_LINES.length} contextual battle lines`,
);
