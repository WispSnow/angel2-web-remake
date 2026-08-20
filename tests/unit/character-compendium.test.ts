import { describe, expect, it } from "vitest";
import {
  CHARACTER_GROUPS,
  characterEntry,
  type CharacterEntry,
} from "../../src/game/compendium/character-compendium";
import { CHARACTER_NOTES } from "../../src/game/compendium/character-notes";
import {
  CHARACTER_CATALOG,
  CHARACTER_NATIVE_STAGES,
} from "../../src/game/content/character-catalog.generated";
import { PORTRAIT_CATALOG } from "../../src/game/content/portrait-catalog.generated";
import { STAGE_INDEX } from "../../src/game/content/stage-index";
import { STAGE_RUNTIME_MANIFEST } from "../../src/game/stage-runtime";

const ENTRIES: readonly CharacterEntry[] = CHARACTER_GROUPS.flatMap((group) => group.entries);
const entryOf = (name: string): CharacterEntry => {
  const entry = ENTRIES.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`no compendium entry named ${name}`);
  return entry;
};

describe("character catalog", () => {
  it("keeps one entry per named actor and never repeats an id or portrait", () => {
    expect(ENTRIES).toHaveLength(CHARACTER_CATALOG.length);
    expect(new Set(ENTRIES.map((entry) => entry.id)).size).toBe(ENTRIES.length);
    const portraits = ENTRIES
      .map((entry) => entry.portraitRecord)
      .filter((record): record is number => record !== null);
    expect(new Set(portraits).size).toBe(portraits.length);
  });

  it("resolves every appearance to a stage the remake actually ships", () => {
    // 原版關卡 25 不在戰役路線上；生成的目錄不得把它帶進圖鑑。
    expect(CHARACTER_NATIVE_STAGES).not.toContain(25);
    for (const entry of ENTRIES) {
      expect(entry.stages.length).toBeGreaterThan(0);
      for (const stage of entry.stages) {
        expect(stage.roles.length, `${entry.id}@${stage.stage}`).toBeGreaterThan(0);
        expect(stage.label).not.toBe("");
        if (stage.ordinal === null) {
          // 結局是唯一沒有關卡序數的登場處。
          expect(stage.label).toBe("結局");
          continue;
        }
        expect(Object.values(STAGE_INDEX)
          .some(({ ordinal, label }) => ordinal === stage.ordinal && label === stage.label)).toBe(true);
      }
    }
  });

  it("points every portrait at an asset the portrait catalog publishes", () => {
    for (const entry of ENTRIES) {
      if (entry.portraitRecord === null) {
        expect(entry.portrait).toBeNull();
        continue;
      }
      const record = String(entry.portraitRecord) as keyof typeof PORTRAIT_CATALOG;
      expect(entry.portrait).toBe(PORTRAIT_CATALOG[record].source);
      expect(PORTRAIT_CATALOG[record].displayName?.replace(/\s+/gu, "")).toBe(entry.name);
    }
  });

  it("groups the actors that change sides apart from the two single-side groups", () => {
    const defectors = CHARACTER_GROUPS.find((group) => group.id === "defector")?.entries ?? [];
    expect(defectors.map((entry) => entry.name)).toEqual(
      // 兩側都有描述子的角色：換過陣營的四人加上龍塔七姊妹，依首次登場排序。
      ["葛蒂拉斯", "汀塔琪", "萊茵", "芳", "蘭", "莎", "倩", "麗", "愛", "維絲塔", "嵐"],
    );
    for (const entry of defectors) {
      expect(entry.allySlot).not.toBeNull();
      expect(entry.enemySlot).not.toBeNull();
    }
    for (const group of CHARACTER_GROUPS) {
      if (group.id === "defector") continue;
      for (const entry of group.entries) {
        expect(entry.allySlot === null || entry.enemySlot === null).toBe(true);
      }
    }
  });

  it("marks the objective slots the original writes into each stage", () => {
    const stagesWith = (
      entry: CharacterEntry,
      flag: "mustSurvive" | "objective" | "escort",
    ): number[] => entry.stages.filter((stage) => stage[flag]).map((stage) => stage.stage);

    // 第 3 關由希蜜和黛西負責存活；第 8、11 關換成蘇蘭達。
    expect(stagesWith(entryOf("希蜜"), "mustSurvive")).toEqual([3]);
    expect(stagesWith(entryOf("黛西"), "mustSurvive")).toEqual([3]);
    expect(stagesWith(entryOf("蘇蘭達"), "mustSurvive")).toEqual([8, 11]);
    expect(stagesWith(entryOf("妮雅"), "mustSurvive")).not.toContain(3);

    // 撤離型勝利條件點名的是我方角色，不能被讀成同號的敵方槽。
    expect(stagesWith(entryOf("多莉"), "escort")).toEqual([9]);
    expect(stagesWith(entryOf("蘭"), "objective")).toEqual([15]);
    expect(stagesWith(entryOf("葛蒂拉斯"), "escort")).toEqual([4]);
    expect(stagesWith(entryOf("碧娜維姬"), "objective")).toEqual([26, 36]);
  });

  it("records the actors that only a stage event puts on the board", () => {
    // 第 20 關的妖龍不在靜態模板裡：只看開局編成會把整場首領戰漏掉。
    const dragon = entryOf("妖龍");
    expect(dragon.stages.map((stage) => stage.stage)).toEqual([20, 22]);
    for (const stage of dragon.stages) expect(stage.roles).toContain("scripted");
    expect(dragon.stages.every((stage) => stage.objective)).toBe(true);

    // 龍王只在第 20 關的對白裡出現，從來沒有上過場。
    const dragonKing = entryOf("龍王");
    expect(dragonKing.group).toBe("story");
    expect(dragonKing.stages).toHaveLength(1);
    expect(dragonKing.stages[0].roles).toEqual(["story"]);
  });

  it("reads stage names from the same table the runtime manifest ships", () => {
    // 图鉴只导入轻量的关卡索引，避免为了两个字段把整条模拟链拉进包里；两边必须逐关一致。
    const manifest = Object.fromEntries(Object.values(STAGE_RUNTIME_MANIFEST)
      .map(({ id, ordinal, label }) => [id, { id, ordinal, label }]));
    expect(STAGE_INDEX).toEqual(manifest);
  });

  it("keeps the class-fallback actor without inventing a portrait for her", () => {
    const eliora = entryOf("愛莉歐拉");
    expect(eliora.portraitRecord).toBeNull();
    expect(eliora.portrait).toBeNull();
    expect(eliora.stages.map((stage) => stage.stage)).toEqual([27, 29]);
  });
});

describe("character notes", () => {
  it("only annotates characters the catalog knows", () => {
    for (const id of Object.keys(CHARACTER_NOTES)) {
      expect(() => characterEntry(id as never)).not.toThrow();
    }
  });

  it("never cites a stage the character does not appear in", () => {
    // 原版關卡編號和玩家看到的序數不一致（第 10、11 關互換，25 之後整體位移），
    // 手寫簡介很容易抄成原版編號，所以逐條回頭核對。妮雅那一條刻意數的是「她不在的
    // 三場戰鬥」，是唯一允許引用缺席關卡的簡介。
    const citesAbsence = new Set(["nia"]);
    for (const entry of ENTRIES) {
      if (!entry.note || citesAbsence.has(entry.id)) continue;
      const ordinals = entry.stages
        .map((stage) => stage.ordinal)
        .filter((ordinal): ordinal is number => ordinal !== null);
      for (const [, cited] of entry.note.matchAll(/第 ([\d、]+) 關/gu)) {
        for (const ordinal of cited.split("、")) {
          expect(ordinals, `${entry.id} cites 第 ${ordinal} 關`).toContain(Number(ordinal));
        }
      }
    }
  });

  it("writes a note for every character with lines of their own", () => {
    // 有對白登場的角色都該有導讀；沒有台詞的角色刻意留空，由視圖說明原版沒給。
    const speakers = ENTRIES.filter((entry) =>
      entry.stages.some((stage) => stage.roles.includes("story")));
    const missing = speakers
      .filter((entry) => entry.note === null)
      .map((entry) => entry.name)
      .sort();
    expect(missing).toEqual([
      // 這十名敵將只在第 37 關墓園那段合唱裡各喊一句，原版沒有給她們別的戲份。
      "克諾絲", "哈釘", "娜米", "庫安梅伊", "梅蒂", "瑪西爾", "萊莉", "菲尼雅",
      "阿莉絲", "麗蘭特",
    ].sort());
  });
});
