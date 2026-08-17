import { describe, expect, it } from "vitest";
import { genericAllyLabelFor } from "../../src/game/content/generic-ally-labels";
import {
  classFallbackPortraitFor,
  unitDisplayName,
  usesClassIdentity,
} from "../../src/game/content/classes";
import { completeCampaignRoster, createStage0Units } from "../../src/game/content/stage0";
import { STAGE1_DEFINITION } from "../../src/game/content/stage1";
import {
  createDeploymentState,
  finishDeployment,
  reduceDeployment,
} from "../../src/game/simulation/deployment";
import { Stage1Battle } from "../../src/game/simulation/stage1-battle";
import { Stage2Battle } from "../../src/game/simulation/stage2-battle";
import { Stage3Battle } from "../../src/game/simulation/stage3-battle";
import { Stage8Battle } from "../../src/game/simulation/stage8-battle";
import { promoteUnit } from "../../src/game/simulation/promotion";
import type { BattleUnit, CampaignState } from "../../src/game/types";

const campaignAt = (stageId: CampaignState["stageId"]): CampaignState => ({
  stageId,
  ruleset: "stableRemake",
  difficulty: 0,
  roster: completeCampaignRoster(),
  rngState: 0x1234_5678,
  rngCalls: 3,
});

/** 第 1 关名单里槽 40..43 是固定项，只需补一个可选槽就能结束部署。 */
function stage1Deployment() {
  const state = reduceDeployment(
    createDeploymentState(
      STAGE1_DEFINITION.deployment,
      STAGE1_DEFINITION.deployment.eligibleSlots,
    ),
    { type: "toggle-roster-slot", slot: 24 },
  );
  return finishDeployment(state);
}

const genericAllies = (units: readonly BattleUnit[]): BattleUnit[] =>
  units.filter((unit) => unit.side === 1 && usesClassIdentity(unit));

const labelBySlot = (units: readonly BattleUnit[]): Map<number, string> =>
  new Map(genericAllies(units).map((unit) => [unit.slot, genericAllyLabelFor(unit)]));

describe("REMAKE-107 generic ally slot letters", () => {
  it("labels only the native placeholder-descriptor slots on side 1", () => {
    expect(genericAllyLabelFor({ side: 1, slot: 40 })).toBe("A");
    expect(genericAllyLabelFor({ side: 1, slot: 43 })).toBe("D");
    expect(genericAllyLabelFor({ side: 1, slot: 45 })).toBe("F");
    expect(genericAllyLabelFor({ side: 1, slot: 54 })).toBe("O");
    expect(genericAllyLabelFor({ side: 1, slot: 59 })).toBe("T");

    // 槽 22 是 `FFh` 肖像却带真实姓名（愛莉歐拉），槽 34..39 的占位描述符从不出场。
    expect(genericAllyLabelFor({ side: 1, slot: 22 })).toBe("");
    expect(genericAllyLabelFor({ side: 1, slot: 39 })).toBe("");
    expect(genericAllyLabelFor({ side: 1, slot: 60 })).toBe("");
    // side 2 使用另一张描述符表，通用敌兵不参与编号。
    expect(genericAllyLabelFor({ side: 2, slot: 40 })).toBe("");
  });

  it("gives the four stage-0 palace soldiers distinct names", () => {
    const units = createStage0Units();
    expect(labelBySlot(units)).toEqual(new Map([[40, "A"], [41, "B"], [42, "C"], [43, "D"]]));
    expect(genericAllies(units).map((unit) => unit.name).sort())
      .toEqual(["士兵A", "士兵B", "士兵C", "士兵D"]);
    // 具名角色不受影响。
    expect(units.find(({ id }) => id === "1:0")?.name).toBe("妮雅");
    // 敌方通用槽保持模板名，没有字母。
    expect(units.find(({ id }) => id === "2:40")?.name).toBe("騎士團士兵");
  });

  it("keeps a slot's letter stable across the stages that reuse it", () => {
    const stage0 = labelBySlot(createStage0Units());
    const stage1 = labelBySlot(new Stage1Battle(campaignAt("stage-01"), stage1Deployment()).units);
    const stage2 = labelBySlot(new Stage2Battle(campaignAt("stage-02")).units);
    const stage3 = labelBySlot(new Stage3Battle(campaignAt("stage-03")).units);
    const stage8 = labelBySlot(new Stage8Battle(campaignAt("stage-08")).units);

    // B/0001、B/0003 复用同一批战役槽；`REMAKE-108` 让它们跳过第 2 关直接进第 3 关，
    // B/0017 在职业覆写后仍是这批槽。
    for (const slot of [40, 41, 42, 43]) {
      const letter = stage0.get(slot);
      expect(letter, `slot ${slot} has no stage-0 letter`).toBeTruthy();
      expect(stage1.get(slot), `stage 1 slot ${slot}`).toBe(letter);
      expect(stage3.get(slot), `stage 3 slot ${slot}`).toBe(letter);
      expect(stage8.get(slot), `stage 8 slot ${slot}`).toBe(letter);
      expect(stage2.has(slot), `stage 2 must not host slot ${slot}`).toBe(false);
    }
    // 第 2 关保留原有的 44/45，另外四个位置换成 51–54；第 3 关的自动友军 45–47、50 不变。
    expect([...stage2.keys()].sort((a, b) => a - b)).toEqual([44, 45, 51, 52, 53, 54]);
    expect([...stage3.keys()].sort((a, b) => a - b)).toEqual([40, 41, 42, 43, 45, 46, 47, 50]);
    expect(stage3.get(45)).toBe(stage2.get(45));
    expect([...stage2.values()].sort()).toEqual(["E", "F", "L", "M", "N", "O"]);
    expect([...stage3.values()].sort()).toEqual(["A", "B", "C", "D", "F", "G", "H", "K"]);

    for (const [stageId, labels] of [
      ["stage-00", stage0],
      ["stage-01", stage1],
      ["stage-02", stage2],
      ["stage-03", stage3],
      ["stage-08", stage8],
    ] as const) {
      const letters = [...labels.values()];
      expect(new Set(letters).size, `${stageId} reuses a letter`).toBe(letters.length);
      expect(letters.every((letter) => letter !== ""), `${stageId} has an unlabelled generic ally`)
        .toBe(true);
    }
  });

  it("carries the letter through a template class override and a promotion", () => {
    // 第 8 关把槽 40..44 强制覆写为騎兵；字母绑槽位，不绑职业。
    const stage8 = new Stage8Battle(campaignAt("stage-08"));
    const ranger = stage8.unit("1:40");
    expect(ranger).toMatchObject({ classId: "cavalry", name: "騎兵A" });
    expect(unitDisplayName(ranger!)).toBe("騎兵A");

    const promoted = createStage0Units().find(({ id }) => id === "1:40")!;
    promoted.experience = 300;
    promoteUnit(promoted, "warrior");
    expect(promoted).toMatchObject({ classId: "warrior", name: "戰士A" });
  });

  it("re-derives a stale saved name on restore", () => {
    const battle = new Stage2Battle(campaignAt("stage-02"));
    const snapshot = battle.serializableSnapshot();
    battle.restore({
      ...snapshot,
      units: snapshot.units.map((unit) => unit.id === "1:52"
        // 旧存档：还没有槽字母，而且职业已经变了但 name 停在上一个职业。
        ? { ...unit, classId: "warrior", className: "戰士", name: "士兵", portrait: 57 }
        : unit),
    });
    expect(battle.unit("1:52")).toMatchObject({ classId: "warrior", name: "戰士M" });
    expect(classFallbackPortraitFor("warrior", 1)).toBe(57);
  });
});
