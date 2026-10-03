import { describe, expect, it } from "vitest";
import {
  BATTLE_ACTION_DEFINITIONS,
  presentationActionIdsForClass,
  shootingActionIdFor,
  techniqueActionIdsFor,
} from "../../src/game/content/actions";
import {
  classDefinition,
  promotionExperienceThresholdFor,
  promotionReachableClassIds,
  promotionTargetsFor,
  type ClassId,
} from "../../src/game/content/classes";
import { parseSaveData } from "../../src/game/save";
import { consumedEventIdsForBattleResume } from "../../src/game/simulation/stage-events";
import { promoteUnit } from "../../src/game/simulation/promotion";
import type { Stage0Battle } from "../../src/game/simulation/battle";
import { INITIAL_STAGE_RUNTIME } from "../../src/game/stage-runtime";
import type { BattleSaveData, CampaignState } from "../../src/game/types";

/**
 * 第 0 关的我方都从士兵起步，但 99 回合足够修女反复治疗一路攒经验：用户在第 43 回合
 * 把希蜜从修女转成了魔術士／僧侶。本文件只经第 0 关自己的运行时建立战斗，不载入任何
 * 后续关卡模块——技术规则目录是模块级状态，别的关卡一旦登记就会掩盖第 0 关的缺口。
 */
const ENTRY: CampaignState = {
  stageId: "stage-00",
  ruleset: "stableRemake",
  difficulty: 0,
  roster: [],
  rngState: 0x0bad_cafe,
  rngCalls: 0,
};

const STAGE0_ALLY_CLASSES = promotionReachableClassIds(["soldier"]);

/** Every promotion chain a stage-0 soldier can walk, root first. */
function promotionChains(classId: ClassId): ClassId[][] {
  const targets = promotionTargetsFor(classId);
  if (targets.length === 0) return [[classId]];
  return [[classId], ...targets.flatMap(({ id }) =>
    promotionChains(id).map((chain) => [classId, ...chain]))];
}

/** Promotes 希蜜 along `chain` the way the battle would: reach the threshold, then commit. */
function promoteAlong(battle: Stage0Battle, chain: readonly ClassId[]): void {
  const ximi = battle.unit("1:1");
  if (!ximi) throw new Error("stage 0 lost 希蜜");
  for (const target of chain.slice(1)) {
    ximi.experience = promotionExperienceThresholdFor(ximi.classId);
    promoteUnit(ximi, target);
  }
  ximi.life = battle.statsFor(ximi).maxLife;
}

function battleSave(battle: Stage0Battle): BattleSaveData {
  const campaign = battle.campaignSnapshot();
  const ximi = battle.unit("1:1");
  if (!ximi) throw new Error("stage 0 lost 希蜜");
  return {
    format: "ANGEL2-web-save",
    version: 129,
    contentVersion: "ice-cast-experience-construction-zone-1",
    kind: "battle",
    savedAt: "2026-10-01T12:00:00.000Z",
    saveCount: 1,
    stageId: "stage-00",
    stageLabel: "瓦爾克麗宮",
    ruleset: campaign.ruleset,
    difficulty: campaign.difficulty,
    rngState: campaign.rngState,
    rngCalls: campaign.rngCalls,
    roster: campaign.roster,
    recordCounters: campaign.recordCounters ?? Array<number>(75).fill(0),
    stageEntrySnapshot: {
      ...ENTRY,
      roster: INITIAL_STAGE_RUNTIME.createBattle(ENTRY).campaignSnapshot().roster,
      recordCounters: Array<number>(75).fill(0),
    },
    stageProgress: 0,
    consumedEventIds: consumedEventIdsForBattleResume(battle.stage, 43),
    battle: {
      phase: "player",
      ...battle.serializableSnapshot(),
      round: 43,
      cursor: { x: ximi.x, y: ximi.y },
      cameraOrigin: { ...battle.stage.viewport.initialOrigin },
    },
  };
}

describe("stage 0 supports the whole promotion closure of its soldiers", () => {
  it("reaches every second and third promotion from the soldier start", () => {
    // 士兵 → 4 个一转 → 9 个二转 → 18 个三转：第 0 关没有部署，棋盘上的我方就是全部候选。
    expect(STAGE0_ALLY_CLASSES).toHaveLength(32);
    expect(STAGE0_ALLY_CLASSES).toEqual(expect.arrayContaining([
      "magician",
      "monk",
      "priest",
      "crossbow",
      "magic-archer",
      "evil-mage",
      "magic-master",
      "wizard",
      "prayer-guide",
      "magic-guide",
      "magic-priest",
      "curse-master",
      "great-dragon-knight",
    ]));
  });

  it("defines every technique and shot those careers can open in the stage-0 runtime", () => {
    const battle = INITIAL_STAGE_RUNTIME.createBattle(ENTRY);
    const caster = battle.unit("1:1");
    if (!caster) throw new Error("stage 0 lost 希蜜");
    const missing: string[] = [];
    for (const classId of STAGE0_ALLY_CLASSES) {
      const rows = classDefinition(classId).dataRows.slice(0, 3);
      for (const { experienceThreshold } of rows) {
        const unit = { classId, experience: experienceThreshold };
        const actionIds = [
          ...techniqueActionIdsFor(unit),
          ...[shootingActionIdFor(classId, 1)].filter((id) => id !== undefined),
        ];
        for (const actionId of actionIds) {
          // `ui.ts` reads `.label` straight off this table to build the 技術 menu.
          if (BATTLE_ACTION_DEFINITIONS[actionId]?.label === undefined) {
            missing.push(`${classId}@${experienceThreshold}: ${actionId}`);
            continue;
          }
          caster.classId = classId;
          caster.experience = experienceThreshold;
          expect(() => battle.actionTargetCells(caster.id, actionId), actionId).not.toThrow();
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("presents every map action its allies can reach", () => {
    const presented = new Set(INITIAL_STAGE_RUNTIME.mapPresentationActionIds);
    const missing = STAGE0_ALLY_CLASSES.flatMap((classId) =>
      presentationActionIdsForClass(classId, 1)
        .filter((actionId) => !presented.has(actionId))
        .map((actionId) => `${classId}: ${actionId}`));
    expect(missing).toEqual([]);
  });

  it("casts the magician's 1L in stage 0 and keeps the board saveable", () => {
    const battle = INITIAL_STAGE_RUNTIME.createBattle(ENTRY);
    promoteAlong(battle, ["soldier", "sister", "magician"]);
    const ximi = battle.unit("1:1");
    const enemy = battle.units.find(({ side }) => side === 2);
    if (!ximi || !enemy) throw new Error("missing stage 0 fixtures");
    ximi.x = 20;
    ximi.y = 20;
    enemy.x = 22;
    enemy.y = 20;
    battle.units = battle.units.filter((unit) => unit === enemy
      || (unit.side === 1 && (unit.x !== 22 || unit.y !== 20)));

    expect(techniqueActionIdsFor(ximi)).toEqual(["fire-1", "lightning-1", "ice-1"]);
    const prepared = battle.prepareSpecialAction({
      actionId: "lightning-1",
      actorId: ximi.id,
      targetId: enemy.id,
    });
    battle.commitPreparedAction(prepared);
    expect(ximi.acted).toBe(true);
    expect(ximi.experience).toBeGreaterThan(0);

    const save = battleSave(battle);
    expect(parseSaveData(JSON.stringify(save))).toEqual(save);
  });

  it.each(promotionChains("soldier").filter((chain) => chain.length > 1)
    .map((chain) => [chain.join(" → "), chain] as const))(
    "reads back a stage-0 battle record after %s",
    (_label, chain) => {
      const battle = INITIAL_STAGE_RUNTIME.createBattle(ENTRY);
      promoteAlong(battle, chain);
      const save = battleSave(battle);
      expect(parseSaveData(JSON.stringify(save))).toEqual(save);
      const restored = INITIAL_STAGE_RUNTIME.restoreBattle(save, save.battle);
      expect(restored.unit("1:1")?.classId).toBe(chain.at(-1));
    },
  );
});
