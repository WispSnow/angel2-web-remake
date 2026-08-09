import { beforeAll, describe, expect, test } from "vitest";
import {
  aiTechniqueDialogueFor,
  nativeAiTechniqueDialogueForCode,
  NATIVE_AI_TECHNIQUE_DIALOGUE_BY_CODE,
  NATIVE_AI_TECHNIQUE_DIALOGUE_GROUPS,
} from "../../src/game/content/ai-technique-dialogue";
import { CLASS_SHOWDOWN_TELEPORT_ACTION_ID } from "../../src/game/content/actions";
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
      CLASS_SHOWDOWN_TELEPORT_ACTION_ID,
    )).toBeUndefined();
  });
});
