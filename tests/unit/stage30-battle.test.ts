import { describe, expect, it } from "vitest";
import {
  STAGE30_EVENT_PROGRAM,
  STAGE30_FORM_CLASS_IDS_BY_DIFFICULTY,
} from "../../src/game/content/stage30";
import { completeCampaignRoster } from "../../src/game/content/stage0";
import { Stage30Battle } from "../../src/game/simulation/stage30-battle";
import type { CampaignState, Difficulty, UnitClassId } from "../../src/game/types";

const campaignFor = (difficulty: Difficulty): CampaignState => ({
  stageId: "stage-30",
  ruleset: "stableRemake",
  difficulty,
  roster: completeCampaignRoster([
    { slot: 0, classId: "land-knight", experience: 900, life: 280 },
    { slot: 7, classId: "magic-priest", experience: 700, life: 190 },
    { slot: 40, classId: "magic-sword-warrior", experience: 0, life: 150 },
  ]),
  rngState: 0x30_30_30_30,
  rngCalls: 30,
});

function commitOpeningForm(battle: Stage30Battle, classId: UnitClassId = "soldier"): void {
  battle.queueUnitFormTransition("2:27", {
    classId,
    name: "維絲塔",
    portrait: 41,
    experience: 0,
  }, STAGE30_EVENT_PROGRAM.contextualLine);
  battle.commitNextUnitTransformation();
}

describe("stage 30 battle simulation", () => {
  it("inherits the fixed allied trio and opens with the named Empress", () => {
    const battle = new Stage30Battle(campaignFor(2));
    expect(battle.units.filter(({ side }) => side === 1)).toEqual([
      expect.objectContaining({ id: "1:40", classId: "magic-sword-warrior", x: 30, y: 19 }),
      expect.objectContaining({ id: "1:7", classId: "magic-priest", name: "琴斯", portrait: 14, x: 26, y: 25 }),
      expect.objectContaining({ id: "1:0", classId: "land-knight", name: "妮雅", portrait: 46, x: 28, y: 25 }),
    ]);
    expect(battle.unit("2:27")).toMatchObject({
      classId: "empress", name: "維絲塔", portrait: 41, x: 28, y: 17,
    });
    expect(battle.forceForUnit("1:0")).toMatchObject({ control: "player", commanderId: "1:0" });
    expect(battle.forceForUnit("2:27")).toMatchObject({ control: "independent-ai" });
    expect(battle.enemyAiIntentFor("2:27")).toBe("pursuit");
  });

  it("queues the opening Empress-to-soldier mutation until the contextual line is acknowledged", () => {
    const battle = new Stage30Battle(campaignFor(0));
    battle.queueUnitFormTransition("2:27", {
      classId: "soldier",
      name: "維絲塔",
      portrait: 41,
      experience: 0,
    }, STAGE30_EVENT_PROGRAM.contextualLine);
    expect(battle.unit("2:27")?.classId).toBe("empress");
    expect(battle.pendingUnitTransformations[0]).toMatchObject({
      before: { classId: "empress", portrait: 41 },
      after: { classId: "soldier", name: "維絲塔", experience: 0 },
      reason: "scripted",
      retainsBeforeUntilCommit: true,
      context: { selector: 34, address: "DS:8762" },
    });
    expect(() => battle.serializableSnapshot()).toThrow(/cannot save/u);
    battle.commitNextUnitTransformation();
    expect(battle.unit("2:27")).toMatchObject({
      classId: "soldier",
      name: "維絲塔",
      portrait: 41,
      experience: 0,
      acted: false,
    });
  });

  it("runs all four deterministic form counts and converts the final form to allied slot 23", () => {
    for (const difficulty of [0, 1, 2, 3] as const) {
      const battle = new Stage30Battle(campaignFor(difficulty));
      commitOpeningForm(battle);
      const sequence = STAGE30_FORM_CLASS_IDS_BY_DIFFICULTY[difficulty];
      expect(sequence).toHaveLength(8 * (difficulty + 1));
      for (const [index, classId] of sequence.entries()) {
        const vesta = battle.unit("2:27");
        const nia = battle.unit("1:0");
        expect(vesta?.classId, `difficulty ${difficulty}, form ${index}`).toBe(classId);
        if (!vesta || !nia) throw new Error("stage 30 sequence lost a required unit");
        nia.x = vesta.x;
        nia.y = vesta.y + 1;
        nia.acted = false;
        vesta.life = 1;
        battle.attack(nia.id, vesta.id);
        expect(battle.unit("2:27")).toBeUndefined();
        expect(battle.outcome()).toBe("ongoing");
        const pending = battle.pendingUnitTransformations[0];
        expect(pending?.before.classId).toBe(classId);
        expect(pending?.before.portrait).toBe(41);
        expect(pending?.context.text).toContain("頭好痛啊");
        const committed = battle.commitNextUnitTransformation();
        if (index < sequence.length - 1) {
          expect(committed.after).toMatchObject({
            id: "2:27",
            classId: sequence[index + 1],
            name: "維絲塔",
            portrait: 41,
            experience: 0,
            acted: false,
          });
          expect(committed.after.life).toBe(battle.statsFor(committed.after).maxLife);
          expect(battle.outcome()).toBe("ongoing");
        } else {
          expect(committed.after).toMatchObject({
            id: "1:23", side: 1, slot: 23, classId: "empress", name: "維絲塔", portrait: 41,
          });
          expect(battle.unit("2:27")).toBeUndefined();
          expect(battle.outcome()).toBe("victory");
          expect(battle.campaignSnapshot().roster.find(({ slot }) => slot === 23))
            .toMatchObject({ classId: "empress", experience: 0 });
        }
      }
    }
  });

  it("preserves the defeated form action bit and supports special-action defeats", () => {
    const battle = new Stage30Battle(campaignFor(1));
    commitOpeningForm(battle);
    const vesta = battle.unit("2:27");
    if (!vesta) throw new Error("stage 30 soldier form is missing");
    vesta.acted = true;
    const nia = battle.unit("1:0");
    if (!nia) throw new Error("stage 30 Nia is missing");
    nia.x = vesta.x;
    nia.y = vesta.y + 1;
    nia.acted = false;
    vesta.life = 1;
    battle.attack(nia.id, vesta.id);
    expect(battle.commitNextUnitTransformation().after).toMatchObject({
      classId: "magic-sword-warrior", acted: true,
    });

    const kins = battle.unit("1:7");
    const nextVesta = battle.unit("2:27");
    if (!kins || !nextVesta) throw new Error("stage 30 special-action fixture is incomplete");
    kins.x = nextVesta.x;
    kins.y = nextVesta.y + 1;
    kins.acted = false;
    nextVesta.acted = false;
    nextVesta.life = 1;
    const prepared = battle.prepareSpecialAction({
      actionId: "lightning-1",
      actorId: kins.id,
      targetId: nextVesta.id,
    });
    battle.commitPreparedAction(prepared);
    expect(battle.pendingUnitTransformations[0]).toMatchObject({
      before: { classId: "magic-sword-warrior" },
      after: { classId: "jungle-warrior", experience: 0 },
      reason: "defeat",
    });
  });

  it("queues the next form when Vesta dies to an ordinary counterattack", () => {
    const battle = new Stage30Battle(campaignFor(0));
    commitOpeningForm(battle);
    const vesta = battle.unit("2:27");
    const nia = battle.unit("1:0");
    if (!vesta || !nia) throw new Error("stage 30 counterattack fixture is incomplete");
    vesta.x = 28;
    vesta.y = 24;
    vesta.life = 1;
    vesta.acted = false;
    nia.x = 28;
    nia.y = 25;
    nia.life = battle.statsFor(nia).maxLife;
    nia.acted = false;

    const result = battle.attack(vesta.id, nia.id);

    expect(result.counterDamage).toBeGreaterThan(0);
    expect(battle.unit("2:27")).toBeUndefined();
    expect(battle.pendingUnitTransformations[0]).toMatchObject({
      before: { classId: "soldier", acted: true },
      after: { classId: "magic-sword-warrior", acted: true, experience: 0 },
      reason: "defeat",
    });
  });

  it("keeps Nia defeat precedence while a form transition is pending", () => {
    const battle = new Stage30Battle(campaignFor(0));
    commitOpeningForm(battle);
    const vesta = battle.unit("2:27");
    const nia = battle.unit("1:0");
    if (!vesta || !nia) throw new Error("stage 30 defeat fixture is incomplete");
    nia.x = vesta.x;
    nia.y = vesta.y + 1;
    nia.acted = false;
    vesta.life = 1;
    battle.attack(nia.id, vesta.id);
    battle.units = battle.units.filter(({ id }) => id !== nia.id);
    expect(battle.outcome()).toBe("ongoing");
    battle.commitNextUnitTransformation();
    expect(battle.outcome()).toBe("defeat");
  });
});
