import { beforeAll, describe, expect, test } from "vitest";
import {
  aiTechniqueDialogueFor,
  confusedActorDialogueFor,
  contextualBattleDialogueFor,
  experienceGainDialogueFor,
  nativeExperienceLineText,
  nativeAiTechniqueDialogueForCode,
  NATIVE_AI_TECHNIQUE_DIALOGUE_BY_CODE,
  NATIVE_AI_TECHNIQUE_DIALOGUE_GROUPS,
  NATIVE_CONFUSED_ACTOR_DIALOGUE,
  NATIVE_CONTEXTUAL_BATTLE_LINES,
} from "../../src/game/content/ai-technique-dialogue";
import { HALF_DRAGON_TELEPORT_ACTION_ID } from "../../src/game/content/actions";
import { activateStage1Content } from "../../src/game/content/stage1";

beforeAll(() => activateStage1Content());

describe("native AI technique dialogue", () => {
  test("binds all 33 native AI action rows to the 14 exact contextual lines", () => {
    expect(NATIVE_AI_TECHNIQUE_DIALOGUE_GROUPS.map(({ selector, address, text }) => ({
      selector,
      address,
      text,
    }))).toEqual([
      { selector: 0x0a, address: "DS:85CA", text: "看我的火球魔法." },
      { selector: 0x0b, address: "DS:85DA", text: "看我的雷電魔法." },
      { selector: 0x0c, address: "DS:85EA", text: "看我的冰魔法." },
      { selector: 0x0d, address: "DS:85F8", text: "看我的巨龍." },
      { selector: 0x0e, address: "DS:8604", text: "生命全." },
      { selector: 0x0f, address: "DS:860C", text: "生命單." },
      { selector: 0x10, address: "DS:8614", text: "防禦提昇." },
      { selector: 0x11, address: "DS:861E", text: "功擊提昇." },
      { selector: 0x12, address: "DS:8628", text: "防禦降低." },
      { selector: 0x13, address: "DS:8632", text: "功擊降低." },
      { selector: 0x14, address: "DS:863C", text: "中毒." },
      { selector: 0x15, address: "DS:8642", text: "禁咒." },
      { selector: 0x16, address: "DS:8648", text: "混亂." },
      { selector: 0x17, address: "DS:864E", text: "破邪." },
    ]);
    expect(Object.keys(NATIVE_AI_TECHNIQUE_DIALOGUE_BY_CODE)).toEqual([
      "1L", "2L", "3L", "4L",
      "1F", "2F", "3F", "4F", "1V", "2V", "3V",
      "1C", "2C", "3C", "4C",
      "1D", "2D", "3D",
      "1I", "2I", "3I",
      "1H", "2H", "3H",
      "AD", "AA", "SD", "SA", "IP", "SN", "LA", "TR", "WD",
    ]);
    for (const record of Object.values(NATIVE_AI_TECHNIQUE_DIALOGUE_BY_CODE)) {
      expect(NATIVE_AI_TECHNIQUE_DIALOGUE_GROUPS.find(
        ({ presentationGroup }) => presentationGroup === record.presentationGroup,
      )).toMatchObject({
        selector: record.selector,
        address: record.address,
        text: record.text,
      });
    }
    expect(nativeAiTechniqueDialogueForCode("WD")).toMatchObject({
      presentationGroup: 11,
      text: "看我的雷電魔法.",
    });
    expect(nativeAiTechniqueDialogueForCode("1V")).toMatchObject({
      presentationGroup: 10,
      text: "看我的火球魔法.",
    });
    for (const missing of ["SM", "FM", "OJ"]) {
      expect(nativeAiTechniqueDialogueForCode(missing)).toBeUndefined();
    }
  });

  test("projects the shared native line into the actor side's dialogue window", () => {
    expect(aiTechniqueDialogueFor({ name: "騎士團修女", portrait: 49, side: 2 }, "fire-1"))
      .toMatchObject({
        activeSlot: "lower",
        lower: {
          portrait: 49,
          speaker: "騎士團修女・初級炎暴",
          text: "看我的火球魔法.",
        },
        source: { record: "ai-technique", wait: 0x0a, address: "DS:85CA" },
      });
    expect(aiTechniqueDialogueFor({ name: "邪法師", portrait: 53, side: 2 }, "fire-2"))
      .toMatchObject({
        activeSlot: "lower",
        lower: {
          portrait: 53,
          speaker: "邪法師・中級炎暴",
          text: "看我的火球魔法.",
        },
        source: { record: "ai-technique", wait: 0x0a, address: "DS:85CA" },
      });
    expect(aiTechniqueDialogueFor({ name: "希蜜", portrait: 47, side: 1 }, "heal-1"))
      .toMatchObject({
        activeSlot: "upper",
        upper: {
          portrait: 47,
          speaker: "希蜜・初級治療",
          text: "生命單.",
        },
        source: { record: "ai-technique", wait: 0x0f, address: "DS:860C" },
      });
    expect(aiTechniqueDialogueFor({ name: "祈導師", portrait: 47, side: 2 }, "heal-2"))
      .toMatchObject({
        activeSlot: "lower",
        lower: {
          speaker: "祈導師・中級治療",
          text: "生命單.",
        },
        source: { record: "ai-technique", wait: 0x0f, address: "DS:860C" },
      });
    expect(aiTechniqueDialogueFor({ name: "魔導師", portrait: 47, side: 2 }, "heal-3"))
      .toMatchObject({
        activeSlot: "lower",
        lower: {
          speaker: "魔導師・高級治療",
          text: "生命單.",
        },
        source: { record: "ai-technique", wait: 0x0f, address: "DS:860C" },
      });
    expect(aiTechniqueDialogueFor({ name: "祈導師", portrait: 47, side: 2 }, "recovery-2"))
      .toMatchObject({
        activeSlot: "lower",
        lower: {
          speaker: "祈導師・中級回復",
          text: "生命全.",
        },
        source: { record: "ai-technique", wait: 0x0e, address: "DS:8604" },
      });
    expect(aiTechniqueDialogueFor({ name: "祈導師", portrait: 47, side: 2 }, "recovery-3"))
      .toMatchObject({
        activeSlot: "lower",
        lower: {
          speaker: "祈導師・高級回復",
          text: "生命全.",
        },
        source: { record: "ai-technique", wait: 0x0e, address: "DS:8604" },
      });
    expect(aiTechniqueDialogueFor({ name: "魔導師", portrait: 47, side: 2 }, "attack-up"))
      .toMatchObject({
        activeSlot: "lower",
        lower: {
          speaker: "魔導師・攻擊提昇",
          text: "功擊提昇.",
        },
        source: { record: "ai-technique", wait: 0x11, address: "DS:861E" },
      });
    expect(aiTechniqueDialogueFor({ name: "祈導師", portrait: 47, side: 2 }, "defense-up"))
      .toMatchObject({
        activeSlot: "lower",
        lower: {
          speaker: "祈導師・防禦提昇",
          text: "防禦提昇.",
        },
        source: { record: "ai-technique", wait: 0x10, address: "DS:8614" },
      });
    expect(aiTechniqueDialogueFor({ name: "咒術師", portrait: 47, side: 2 }, "confusion"))
      .toMatchObject({
        activeSlot: "lower",
        lower: {
          speaker: "咒術師・混亂",
          text: "混亂.",
        },
        source: { record: "ai-technique", wait: 0x16, address: "DS:8648" },
      });
    for (const [name, actionId] of [
      ["弓兵", "archer-shot"],
      ["弩兵", "crossbow-shot"],
      ["魔弓兵", "magic-archer-shot"],
    ] as const) {
      expect(aiTechniqueDialogueFor({ name, portrait: 59, side: 2 }, actionId))
        .toBeUndefined();
    }
    expect(aiTechniqueDialogueFor(
      { name: "半龍戰士", portrait: 58, side: 2 },
      HALF_DRAGON_TELEPORT_ACTION_ID,
    )).toBeUndefined();
  });
});

describe("native contextual battle lines", () => {
  test("publishes the DS:84BB entries that sit outside the technique groups", () => {
    expect(Object.entries(NATIVE_CONTEXTUAL_BATTLE_LINES).map(([key, line]) => [
      key,
      line.selector,
      line.address,
      line.gate,
      line.text,
      line.emitters,
    ])).toEqual([
      // Planner-emitted lines: they reach the renderer through the
      // ＡＩ對話-gated `1000:254F`.
      ["restingLowLife", 0x00, "DS:8501", "aiDialogue", "快不行了!...我必需休息一下.", ["1000:2287"]],
      ["breakingContact", 0x01, "DS:851D", "aiDialogue", "我體力太低了!\n先閃一邊....", ["1000:2265"]],
      ["surrounded", 0x02, "DS:8538", "aiDialogue", "這....被包圍了.", ["1000:227B"]],
      ["shootingAnnounce", 0x08, "DS:85A5", "aiDialogue", "看我的飛箭.", ["1000:1F6D"]],
      // Player responses: direct `0000:C97E` sites the switch never silences.
      ["spellSealed", 0x1a, "DS:8677", "direct", "我中了禁咒，無法使用法術．", ["0000:701F"]],
      ["noTargetInRange", 0x1b, "DS:8692", "direct", "沒有人在我的攻擊範圍內．", ["0000:70ED"]],
      ["confusedActor", 0x1c, "DS:86AB", "direct", "我的頭好昏，無法思考．", ["0000:671D"]],
      // The one line with both kinds of site, so the caller picks the gate.
      ["dodgedShot", 0x1d, "DS:86C2", "mixed", "要打中我沒那麼容易．", ["0000:7260", "1000:1FB2"]],
      ["counterattack", 0x1e, "DS:86D7", "direct", "妳竟敢打我．", ["0000:92C1"]],
      // The only entry with a numeric field: two ordinary-combat kill branches
      // and the player's own 技術 commit, all three writing the award first.
      ["experienceGain", 0x18, "DS:8654", "direct", "得經驗值00000 點",
        ["0000:7678", "0000:91C1", "0000:924F"]],
    ]);

    // 0Ah..17h belong to the 33 AI action rows; these lines have their own
    // triggers and must not join them.
    const techniqueSelectors: readonly number[] = NATIVE_AI_TECHNIQUE_DIALOGUE_GROUPS
      .map(({ selector }) => selector);
    for (const { selector } of Object.values(NATIVE_CONTEXTUAL_BATTLE_LINES)) {
      expect(techniqueSelectors).not.toContain(selector);
    }
    expect(NATIVE_CONFUSED_ACTOR_DIALOGUE).toBe(NATIVE_CONTEXTUAL_BATTLE_LINES.confusedActor);
  });

  test("speaks in the acting unit's own window with its own portrait", () => {
    expect(confusedActorDialogueFor({ name: "士兵", portrait: 60, side: 1 })).toEqual({
      activeSlot: "upper",
      upper: { portrait: 60, speaker: "士兵", text: "我的頭好昏，無法思考．" },
      lower: undefined,
      source: { record: "confused-actor", wait: 0x1c, address: "DS:86AB" },
    });
    expect(contextualBattleDialogueFor({ name: "邪法師", portrait: 53, side: 2 }, "spellSealed"))
      .toEqual({
        activeSlot: "lower",
        upper: undefined,
        lower: { portrait: 53, speaker: "邪法師", text: "我中了禁咒，無法使用法術．" },
        source: { record: "spell-sealed", wait: 0x1a, address: "DS:8677" },
      });
    expect(contextualBattleDialogueFor({ name: "迅龍騎士", portrait: 59, side: 2 }, "dodgedShot"))
      .toMatchObject({
        activeSlot: "lower",
        lower: { speaker: "迅龍騎士", text: "要打中我沒那麼容易．" },
        source: { record: "dodged-shot", wait: 0x1d },
      });
    expect(contextualBattleDialogueFor({ name: "士兵", portrait: 60, side: 1 }, "counterattack"))
      .toMatchObject({
        activeSlot: "upper",
        upper: { speaker: "士兵", text: "妳竟敢打我．" },
        source: { record: "counterattack", wait: 0x1e },
      });
  });
});

describe("native contextual battle-line gates", () => {
  test("splits the table into planner lines, player responses and the mixed one", () => {
    const byGate = (gate: string) => Object.entries(NATIVE_CONTEXTUAL_BATTLE_LINES)
      .filter(([, line]) => line.gate === gate)
      .map(([key]) => key);
    // `1000:254F` carries the ＡＩ對話 switch, so everything behind it is
    // silenceable and everything reaching `0000:C97E` directly is not.
    expect(byGate("aiDialogue"))
      .toEqual(["restingLowLife", "breakingContact", "surrounded", "shootingAnnounce"]);
    expect(byGate("direct"))
      .toEqual([
        "spellSealed",
        "noTargetInRange",
        "confusedActor",
        "counterattack",
        "experienceGain",
      ]);
    expect(byGate("mixed")).toEqual(["dodgedShot"]);
  });
});

describe("the experience window's numeric field", () => {
  test("keeps the record verbatim and right-aligns the award in its five cells", () => {
    const line = NATIVE_CONTEXTUAL_BATTLE_LINES.experienceGain;
    expect(line).toMatchObject({
      selector: 0x18,
      pointerEntry: "DS:84EB",
      address: "DS:8654",
      gate: "direct",
      text: "得經驗值00000 點",
      emitters: ["0000:7678", "0000:91C1", "0000:924F"],
      numericField: { digits: "00000", writer: "0000:EF56" },
    });
    // `0000:EF56` divides down from 10,000, then blanks leading zeros and puts
    // a single `0` back when the whole field blanked out.
    expect(nativeExperienceLineText(0)).toBe("得經驗值    0 點");
    expect(nativeExperienceLineText(7)).toBe("得經驗值    7 點");
    expect(nativeExperienceLineText(52)).toBe("得經驗值   52 點");
    expect(nativeExperienceLineText(12_345)).toBe("得經驗值12345 點");
    // The writer only ever sees a 16-bit register.
    expect(nativeExperienceLineText(70_000)).toBe("得經驗值65535 點");
    expect(nativeExperienceLineText(-3)).toBe("得經驗值    0 點");
  });

  test("speaks from the earner's own side window with that unit's portrait", () => {
    expect(experienceGainDialogueFor({ name: "妮雅", portrait: 1, side: 1 }, 46))
      .toMatchObject({
        activeSlot: "upper",
        upper: { speaker: "妮雅", portrait: 1, text: "得經驗值   46 點" },
        source: { record: "experience-gain", wait: 0x18, address: "DS:8654" },
      });
    expect(experienceGainDialogueFor({ name: "士兵", portrait: 60, side: 2 }, 8))
      .toMatchObject({
        activeSlot: "lower",
        lower: { speaker: "士兵", portrait: 60, text: "得經驗值    8 點" },
        source: { record: "experience-gain", wait: 0x18 },
      });
  });
});
