import { describe, expect, it } from "vitest";
import mapRules from "../../reverse/parsed/native/map-rules.json";
import unitCatalog from "../../reverse/parsed/native/unit-catalog.json";
import {
  classDefinition,
  classIdFromNativeRecord,
  classStatsFor,
  classTierFor,
  ordinaryHitStatusFor,
  suppressesOrdinaryCounterFor,
  type ClassId,
} from "../../src/game/content/classes";
import { Stage0Battle } from "../../src/game/simulation/battle";
import { techniqueActionIdsFor } from "../../src/game/content/actions";
import { DeterministicRng } from "../../src/game/simulation/rng";

function nativeRecord(record: number) {
  const value = unitCatalog.records.find((candidate) => candidate.record === record);
  if (!value) throw new Error(`missing native unit catalog record ${record}`);
  return value;
}

function nativeMapRecord(record: number) {
  const value = mapRules.records.find((candidate) => candidate.record === record);
  if (!value) throw new Error(`missing native map-rules record ${record}`);
  return value;
}

function expectGeneratedClassToMatchEvidence(classId: ClassId, record: number): void {
  const definition = classDefinition(classId);
  const evidence = nativeRecord(record);
  const mapEvidence = nativeMapRecord(record);

  expect(definition).toMatchObject({
    id: classId,
    nativeRecord: record,
    nativeName: evidence.name,
    recordKind: evidence.recordKind,
    codes: evidence.codes,
    actionCategory: evidence.playerActionCategory,
    aiClassDispatch: evidence.aiClassDispatch,
    dataRows: evidence.dataRows,
    postThirdRowGrowth: evidence.postThirdRowGrowth,
    killRewards: evidence.killRewards,
    ordinaryHitStatuses: evidence.ordinaryHitStatuses,
    shooting: evidence.shooting,
    technique: evidence.technique,
    movementProfile: evidence.mapRules.movementProfile,
    terrainDefenseProfile: evidence.mapRules.terrainDefenseProfile,
    movementRules: mapEvidence.movementRules,
    terrainDefensePercents: mapEvidence.terrainDefensePercents,
  });
}

describe("native class implementation sequence", () => {
  it("record 0 soldier reproduces native stats, growth, traits, and actions", () => {
    expectGeneratedClassToMatchEvidence("soldier", 0);

    const definition = classDefinition("soldier");
    expect(definition.dataRows.slice(0, 3)).toEqual([
      expect.objectContaining({ experienceThreshold: 0, attack: 39, defense: 21, maxLife: 160, movement: 4, level: 1 }),
      expect.objectContaining({ experienceThreshold: 100, attack: 42, defense: 24, maxLife: 170, movement: 4, level: 2 }),
      expect.objectContaining({ experienceThreshold: 200, attack: 45, defense: 27, maxLife: 180, movement: 4, level: 3 }),
    ]);
    expect(classStatsFor({ classId: "soldier", experience: 300 })).toEqual({
      attack: 46,
      defense: 27,
      maxLife: 190,
      movement: 4,
      level: 4,
    });
    expect(definition.ordinaryHitStatuses).toEqual([]);
    expect(definition.shooting).toBeNull();
    expect(definition.technique).toBeNull();
  });

  it("record 1 magic sword warrior reproduces growth and refreshes defense-down on active ordinary hit", () => {
    expectGeneratedClassToMatchEvidence("magic-sword-warrior", 1);

    const definition = classDefinition("magic-sword-warrior");
    expect(definition.dataRows.slice(0, 3)).toEqual([
      expect.objectContaining({ experienceThreshold: 0, attack: 90, defense: 48, maxLife: 380, movement: 9, level: 10 }),
      expect.objectContaining({ experienceThreshold: 560, attack: 100, defense: 51, maxLife: 410, movement: 9, level: 11 }),
      expect.objectContaining({ experienceThreshold: 1120, attack: 110, defense: 54, maxLife: 440, movement: 9, level: 12 }),
    ]);
    expect(classStatsFor({ classId: "magic-sword-warrior", experience: 1680 })).toEqual({
      attack: 116,
      defense: 54,
      maxLife: 455,
      movement: 9,
      level: 13,
    });
    expect(ordinaryHitStatusFor("magic-sword-warrior")).toEqual({
      key: "defenseDown",
      counter: 3,
    });

    const battle = new Stage0Battle(0);
    const attacker = battle.unit("1:0")!;
    const defender = battle.units.find(({ side }) => side === 2)!;
    battle.units = [attacker, defender];
    attacker.classId = "magic-sword-warrior";
    attacker.className = definition.nativeName;
    attacker.experience = 0;
    attacker.life = classStatsFor(attacker).maxLife;
    attacker.x = 20;
    attacker.y = 20;
    defender.x = 21;
    defender.y = 20;
    defender.statuses.defenseDown = 1;

    battle.attack(attacker.id, defender.id);
    expect(defender.statuses.defenseDown).toBe(3);

  });

  it("record 2 jungle warrior reproduces poison-on-hit and native post-third-row growth", () => {
    expectGeneratedClassToMatchEvidence("jungle-warrior", 2);

    const definition = classDefinition("jungle-warrior");
    expect(definition.dataRows.slice(0, 3)).toEqual([
      expect.objectContaining({ experienceThreshold: 0, attack: 78, defense: 64, maxLife: 450, movement: 8, level: 10 }),
      expect.objectContaining({ experienceThreshold: 570, attack: 81, defense: 70, maxLife: 480, movement: 8, level: 11 }),
      expect.objectContaining({ experienceThreshold: 1140, attack: 84, defense: 76, maxLife: 510, movement: 8, level: 12 }),
    ]);
    expect(classStatsFor({ classId: "jungle-warrior", experience: 1710 })).toEqual({
      attack: 86,
      defense: 76,
      maxLife: 540,
      movement: 8,
      level: 13,
    });
    expect(ordinaryHitStatusFor("jungle-warrior")).toEqual({ key: "poison", counter: 3 });

    const battle = new Stage0Battle(0);
    const attacker = battle.unit("1:0")!;
    const defender = battle.units.find(({ side }) => side === 2)!;
    battle.units = [attacker, defender];
    attacker.classId = "jungle-warrior";
    attacker.className = definition.nativeName;
    attacker.experience = 0;
    attacker.x = 20;
    attacker.y = 20;
    defender.x = 21;
    defender.y = 20;
    defender.life = 101;

    battle.attack(attacker.id, defender.id);
    expect(defender.statuses).toMatchObject({ poison: 3 });
    const lifeAfterHit = defender.life;
    battle.startNextRound();
    expect(defender.life).toBe(Math.floor(lifeAfterHit / 2));
    expect(defender.statuses.poison).toBe(2);
  });

  it("record 3 magic priest reproduces all three native technique tiers", () => {
    expectGeneratedClassToMatchEvidence("magic-priest", 3);

    const definition = classDefinition("magic-priest");
    expect(definition.dataRows.slice(0, 3)).toEqual([
      expect.objectContaining({ experienceThreshold: 0, attack: 53, defense: 38, maxLife: 305, movement: 8, level: 10 }),
      expect.objectContaining({ experienceThreshold: 580, attack: 54, defense: 39, maxLife: 325, movement: 8, level: 11 }),
      expect.objectContaining({ experienceThreshold: 1160, attack: 55, defense: 40, maxLife: 345, movement: 8, level: 12 }),
    ]);
    expect(classStatsFor({ classId: "magic-priest", experience: 1740 })).toEqual({
      attack: 55,
      defense: 40,
      maxLife: 355,
      movement: 8,
      level: 13,
    });
    expect(definition.technique?.tiers.map((tier) => tier.actions.map(({ actionCode }) => actionCode)))
      .toEqual([
        ["1F", "1I", "SD"],
        ["1F", "1L", "1I", "SD"],
        ["2F", "1L", "1I", "SD", "TR"],
      ]);
    expect(classTierFor({ classId: "magic-priest", experience: 0 })).toBe(1);
    expect(classTierFor({ classId: "magic-priest", experience: 580 })).toBe(2);
    expect(classTierFor({ classId: "magic-priest", experience: 1160 })).toBe(3);
    expect(classTierFor({ classId: "magic-priest", experience: 1740 })).toBe(3);
  });

  it("record 4 prayer guide reproduces native healing tiers and growth", () => {
    expectGeneratedClassToMatchEvidence("prayer-guide", 4);

    const definition = classDefinition("prayer-guide");
    expect(definition.dataRows.slice(0, 3)).toEqual([
      expect.objectContaining({ experienceThreshold: 0, attack: 53, defense: 37, maxLife: 320, movement: 8, level: 10 }),
      expect.objectContaining({ experienceThreshold: 590, attack: 54, defense: 38, maxLife: 340, movement: 8, level: 11 }),
      expect.objectContaining({ experienceThreshold: 1180, attack: 55, defense: 39, maxLife: 360, movement: 8, level: 12 }),
    ]);
    expect(classStatsFor({ classId: "prayer-guide", experience: 1770 })).toEqual({
      attack: 55,
      defense: 39,
      maxLife: 372,
      movement: 8,
      level: 13,
    });
    expect(definition.technique?.tiers.map((tier) => tier.actions.map(({ actionCode }) => actionCode)))
      .toEqual([
        ["1H", "1I", "AD"],
        ["1H", "2I", "AD"],
        ["2H", "3I", "AD", "OJ"],
      ]);
  });

  it("record 5 curse master reproduces native status-technique progression", () => {
    expectGeneratedClassToMatchEvidence("curse-master", 5);

    const definition = classDefinition("curse-master");
    expect(definition.dataRows.slice(0, 3)).toEqual([
      expect.objectContaining({ experienceThreshold: 0, attack: 53, defense: 38, maxLife: 305, movement: 8, level: 10 }),
      expect.objectContaining({ experienceThreshold: 580, attack: 54, defense: 39, maxLife: 325, movement: 8, level: 11 }),
      expect.objectContaining({ experienceThreshold: 1160, attack: 55, defense: 40, maxLife: 345, movement: 8, level: 12 }),
    ]);
    expect(classStatsFor({ classId: "curse-master", experience: 1740 })).toEqual({
      attack: 55,
      defense: 40,
      maxLife: 355,
      movement: 8,
      level: 13,
    });
    expect(definition.ordinaryHitStatuses).toEqual([]);
    expect(definition.technique?.tiers.map((tier) => tier.actions.map(({ actionCode }) => actionCode)))
      .toEqual([
        ["1H", "SA", "LA"],
        ["1H", "SA", "LA", "IP"],
        ["1H", "SA", "LA", "IP", "SN"],
      ]);
  });

  it("record 6 magician reproduces the native level-7 spellcaster baseline", () => {
    expectGeneratedClassToMatchEvidence("magician", 6);

    const definition = classDefinition("magician");
    expect(definition.dataRows.slice(0, 3)).toEqual([
      expect.objectContaining({ experienceThreshold: 0, attack: 50, defense: 33, maxLife: 250, movement: 6, level: 7 }),
      expect.objectContaining({ experienceThreshold: 350, attack: 51, defense: 34, maxLife: 260, movement: 6, level: 8 }),
      expect.objectContaining({ experienceThreshold: 700, attack: 52, defense: 35, maxLife: 270, movement: 6, level: 9 }),
    ]);
    expect(classStatsFor({ classId: "magician", experience: 800 })).toEqual({
      attack: 53,
      defense: 35,
      maxLife: 280,
      movement: 6,
      level: 10,
    });
    expect(definition.technique?.tiers.map((tier) => tier.actions.map(({ actionCode }) => actionCode)))
      .toEqual([
        ["1F", "1L", "1C"],
        ["1F", "1L", "1C"],
        ["1F", "1L", "1C"],
      ]);
  });

  it("record 7 great axe warrior reproduces native counter suppression", () => {
    expectGeneratedClassToMatchEvidence("great-axe-warrior", 7);

    const definition = classDefinition("great-axe-warrior");
    expect(definition.dataRows.slice(0, 3)).toEqual([
      expect.objectContaining({ experienceThreshold: 0, attack: 96, defense: 46, maxLife: 380, movement: 8, level: 10 }),
      expect.objectContaining({ experienceThreshold: 580, attack: 108, defense: 47, maxLife: 400, movement: 8, level: 11 }),
      expect.objectContaining({ experienceThreshold: 1160, attack: 120, defense: 48, maxLife: 420, movement: 8, level: 12 }),
    ]);
    expect(classStatsFor({ classId: "great-axe-warrior", experience: 1740 })).toEqual({
      attack: 128,
      defense: 48,
      maxLife: 435,
      movement: 8,
      level: 13,
    });
    expect(suppressesOrdinaryCounterFor("great-axe-warrior")).toBe(true);
    expect(ordinaryHitStatusFor("great-axe-warrior")).toBeUndefined();

    const battle = new Stage0Battle(0);
    const attacker = battle.unit("1:0")!;
    const defender = battle.units.find(({ side }) => side === 2)!;
    battle.units = [attacker, defender];
    attacker.classId = "great-axe-warrior";
    attacker.className = definition.nativeName;
    attacker.x = 20;
    attacker.y = 20;
    defender.x = 21;
    defender.y = 20;
    const attackerLife = attacker.life;
    const result = battle.attack(attacker.id, defender.id);
    expect(result.counterOccurred).toBe(false);
    expect(result.counterDamage).toBe(0);
    expect(attacker.life).toBe(attackerLife);
  });

  it("record 8 half-dragon warrior reproduces the fixed-instance ordinary profile", () => {
    expectGeneratedClassToMatchEvidence("half-dragon-warrior", 8);

    const definition = classDefinition("half-dragon-warrior");
    expect(definition.dataRows.slice(0, 3)).toEqual([
      expect.objectContaining({ experienceThreshold: 0, attack: 66, defense: 36, maxLife: 300, movement: 7, level: 8 }),
      expect.objectContaining({ experienceThreshold: 380, attack: 72, defense: 39, maxLife: 320, movement: 7, level: 9 }),
      expect.objectContaining({ experienceThreshold: 760, attack: 78, defense: 42, maxLife: 340, movement: 7, level: 10 }),
    ]);
    expect(classStatsFor({ classId: "half-dragon-warrior", experience: 1140 })).toEqual({
      attack: 80,
      defense: 42,
      maxLife: 352,
      movement: 7,
      level: 11,
    });
    expect(definition.promotion.targets).toEqual([]);
    expect(definition.ordinaryHitStatuses).toEqual([]);
    expect(definition.shooting).toBeNull();
    expect(definition.technique).toBeNull();
  });

  it("record 9 magic armor warrior reproduces its distinct ordinary growth", () => {
    expectGeneratedClassToMatchEvidence("magic-armor-warrior", 9);

    const definition = classDefinition("magic-armor-warrior");
    expect(definition.dataRows.slice(0, 3)).toEqual([
      expect.objectContaining({ experienceThreshold: 0, attack: 76, defense: 60, maxLife: 450, movement: 8, level: 10 }),
      expect.objectContaining({ experienceThreshold: 590, attack: 78, defense: 72, maxLife: 465, movement: 8, level: 11 }),
      expect.objectContaining({ experienceThreshold: 1180, attack: 80, defense: 84, maxLife: 480, movement: 8, level: 12 }),
    ]);
    expect(classStatsFor({ classId: "magic-armor-warrior", experience: 1770 })).toEqual({
      attack: 81,
      defense: 84,
      maxLife: 505,
      movement: 8,
      level: 13,
    });
    expect(definition.codes.side1).toBe("1H");
    expect(definition.ordinaryHitStatuses).toEqual([]);
    expect(definition.shooting).toBeNull();
    expect(definition.technique).toBeNull();
  });

  it("record 10 magic guide reproduces its support-technique tiers", () => {
    expectGeneratedClassToMatchEvidence("magic-guide", 10);

    const definition = classDefinition("magic-guide");
    expect(definition.dataRows.slice(0, 3)).toEqual([
      expect.objectContaining({ experienceThreshold: 0, attack: 53, defense: 37, maxLife: 320, movement: 8, level: 10 }),
      expect.objectContaining({ experienceThreshold: 590, attack: 54, defense: 38, maxLife: 340, movement: 8, level: 11 }),
      expect.objectContaining({ experienceThreshold: 1180, attack: 55, defense: 39, maxLife: 360, movement: 8, level: 12 }),
    ]);
    expect(classStatsFor({ classId: "magic-guide", experience: 1770 })).toEqual({
      attack: 55,
      defense: 39,
      maxLife: 372,
      movement: 8,
      level: 13,
    });
    expect(definition.technique?.tiers.map((tier) => tier.actions.map(({ actionCode }) => actionCode)))
      .toEqual([
        ["1H", "1I", "AA"],
        ["2H", "1I", "AA"],
        ["3H", "2I", "AA", "FM"],
      ]);
  });

  it("record 11 evil mage reproduces one fire tier per native row", () => {
    expectGeneratedClassToMatchEvidence("evil-mage", 11);

    const definition = classDefinition("evil-mage");
    expect(definition.dataRows.slice(0, 3)).toEqual([
      expect.objectContaining({ experienceThreshold: 0, attack: 53, defense: 36, maxLife: 290, movement: 8, level: 10 }),
      expect.objectContaining({ experienceThreshold: 600, attack: 54, defense: 37, maxLife: 310, movement: 8, level: 11 }),
      expect.objectContaining({ experienceThreshold: 1200, attack: 55, defense: 38, maxLife: 330, movement: 8, level: 12 }),
    ]);
    expect(classStatsFor({ classId: "evil-mage", experience: 1800 })).toEqual({
      attack: 55,
      defense: 38,
      maxLife: 338,
      movement: 8,
      level: 13,
    });
    expect(definition.technique?.tiers.map((tier) => tier.actions.map(({ actionCode }) => actionCode)))
      .toEqual([["2F"], ["3F"], ["4F"]]);
  });

  it("record 12 magic archer reproduces native shooting stats and line damage", () => {
    expectGeneratedClassToMatchEvidence("magic-archer", 12);
    const definition = classDefinition("magic-archer");
    expect(definition.dataRows.slice(0, 3)).toEqual([
      expect.objectContaining({ experienceThreshold: 0, attack: 52, defense: 38, maxLife: 270, movement: 8, level: 7 }),
      expect.objectContaining({ experienceThreshold: 480, attack: 53, defense: 40, maxLife: 290, movement: 8, level: 8 }),
      expect.objectContaining({ experienceThreshold: 960, attack: 54, defense: 42, maxLife: 310, movement: 8, level: 9 }),
    ]);
    expect(classStatsFor({ classId: "magic-archer", experience: 1440 })).toEqual({
      attack: 54,
      defense: 42,
      maxLife: 328,
      movement: 8,
      level: 10,
    });
    expect(definition.shooting).toMatchObject({
      classCode: "1I",
      minimumRange: 2,
      maximumRange: 6,
    });

    const battle = new Stage0Battle(0);
    const attacker = battle.unit("1:0")!;
    const selected = battle.units.find(({ side }) => side === 2)!;
    const lineUnit = battle.units.find(({ side, id }) => side === 2 && id !== selected.id)!;
    battle.units = [attacker, lineUnit, selected];
    attacker.classId = "magic-archer";
    attacker.className = definition.nativeName;
    attacker.experience = 0;
    attacker.x = 20;
    attacker.y = 20;
    lineUnit.x = 22;
    lineUnit.y = 20;
    lineUnit.life = 200;
    selected.x = 23;
    selected.y = 20;
    selected.life = 200;
    const prepared = battle.prepareSpecialAction({
      actionId: "magic-archer-shot",
      actorId: attacker.id,
      targetId: selected.id,
      target: { x: selected.x, y: selected.y },
    });
    const lineDamage = prepared.affectedUnits.find(({ unitId }) => unitId === lineUnit.id);
    const targetDamage = prepared.affectedUnits.find(({ unitId }) => unitId === selected.id);
    expect(lineDamage?.damage).toBeGreaterThanOrEqual(25);
    expect(lineDamage?.damage).toBeLessThanOrEqual(34);
    expect(targetDamage?.damage).toBeGreaterThanOrEqual(50);
    expect(targetDamage?.damage).toBeLessThanOrEqual(68);
    expect(prepared.result.effectCells.length).toBe(4);
    battle.commitPreparedAction(prepared);
    expect(battle.unit(lineUnit.id)?.life).toBe(200 - (lineDamage?.damage ?? 0));
    expect(battle.unit(selected.id)?.life).toBe(200 - (targetDamage?.damage ?? 0));
  });

  it.each([
    [13, "land-knight"],
    [14, "demon-dragon-knight"],
    [15, "flying-dragon-knight"],
    [16, "beast-knight"],
    [17, "bone-knight"],
    [18, "swift-dragon-knight"],
    [19, "great-dragon-knight"],
    [20, "archer"],
    [21, "crossbow"],
    [22, "cavalry"],
    [23, "pegasus-warrior"],
    [24, "sister"],
    [25, "monk"],
    [26, "water-warrior"],
    [27, "divine-sword-warrior"],
    [28, "warrior"],
    [29, "steel-armor-warrior"],
    [30, "priest"],
    [31, "wizard"],
    [32, "magic-master"],
    [33, "evil-sword-warrior"],
    [34, "engineer"],
    [35, "empress"],
    [36, "dragon"],
    [37, "head"],
    [38, "hand"],
  ] as const)("record %i %s matches the complete native catalog contract", (record, classId) => {
    expectGeneratedClassToMatchEvidence(classId, record);
    const definition = classDefinition(classId);
    expect(classStatsFor({ classId, experience: 0 })).toMatchObject({
      attack: definition.dataRows[0].attack,
      defense: definition.dataRows[0].defense,
      maxLife: definition.dataRows[0].maxLife,
      movement: definition.dataRows[0].movement,
      level: definition.dataRows[0].level,
    });
    expect(definition.dataRows.length).toBeGreaterThanOrEqual(3);
  });

  it("records 16 and 33 retain native ordinary-hit status traits", () => {
    expect(ordinaryHitStatusFor("beast-knight")).toEqual({ key: "attackDown", counter: 3 });
    expect(ordinaryHitStatusFor("evil-sword-warrior")).toEqual({ key: "confusion", counter: 3 });
    const battle = new Stage0Battle(0);
    const attacker = battle.unit("1:0")!;
    const defender = battle.units.find(({ side }) => side === 2)!;
    battle.units = [attacker, defender];
    attacker.classId = "beast-knight";
    attacker.x = 20;
    attacker.y = 20;
    defender.x = 21;
    defender.y = 20;
    battle.attack(attacker.id, defender.id);
    expect(defender.statuses.attackDown).toBe(3);
  });

  it.each([
    ["magic-sword-warrior", "defenseDown"],
    ["beast-knight", "attackDown"],
    ["evil-sword-warrior", "confusion"],
    ["jungle-warrior", "poison"],
  ] as const)("%s does not apply %s from a passive counterattack", (classId, statusKey) => {
    const battle = new Stage0Battle(0);
    const activeAttacker = battle.unit("1:0")!;
    const counterAttacker = battle.units.find(({ side }) => side === 2)!;
    battle.units = [activeAttacker, counterAttacker];
    activeAttacker.x = 20;
    activeAttacker.y = 20;
    counterAttacker.classId = classId;
    counterAttacker.className = classDefinition(classId).nativeName;
    counterAttacker.experience = 0;
    counterAttacker.life = classStatsFor(counterAttacker).maxLife;
    counterAttacker.x = 21;
    counterAttacker.y = 20;

    const result = battle.attack(activeAttacker.id, counterAttacker.id);

    expect(result.counterOccurred).toBe(true);
    expect(activeAttacker.statuses[statusKey]).toBe(0);
  });

  it("record 17 bone knight uses the native full-damage counter candidate", () => {
    const battle = new Stage0Battle(0);
    const attacker = battle.unit("1:0")!;
    const defender = battle.units.find(({ side }) => side === 2)!;
    battle.units = [attacker, defender];
    attacker.x = 20;
    attacker.y = 20;
    defender.classId = "bone-knight";
    defender.x = 21;
    defender.y = 20;
    const result = battle.attack(attacker.id, defender.id);
    expect(result.counterOccurred).toBe(true);
    expect(result.counterDamage).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.counterDamage)).toBe(true);
  });

  it("all native technique careers expose each recorded tier through the shared action map", () => {
    for (const record of nativeRecordsForCategory("technique")) {
      const classId = classIdFromRecord(record);
      const definition = classDefinition(classId);
      const actions = techniqueActionIdsFor({ classId, experience: 0 });
      expect(actions).toHaveLength(definition.technique?.tiers[0]?.actions.length ?? 0);
      expect(actions.length).toBeGreaterThan(0);
    }
    expect(techniqueActionIdsFor({ classId: "priest", experience: 0 })).toEqual([
      "fire-1",
      "recovery-1",
    ]);
  });

  it("record 21 crossbow uses the native long shooting range and damage", () => {
    const battle = new Stage0Battle(0);
    const attacker = battle.unit("1:0")!;
    const target = battle.units.find(({ side }) => side === 2)!;
    battle.units = [attacker, target];
    attacker.classId = "crossbow";
    attacker.className = classDefinition("crossbow").nativeName;
    attacker.x = 20;
    attacker.y = 20;
    target.x = 26;
    target.y = 20;
    target.life = 200;
    expect(battle.actionTargetCells(attacker.id, "crossbow-shot")).toContainEqual({ x: 26, y: 20 });
    const prepared = battle.prepareSpecialAction({
      actionId: "crossbow-shot",
      actorId: attacker.id,
      targetId: target.id,
      target: { x: target.x, y: target.y },
    });
    expect(prepared.result.damage).toBeGreaterThanOrEqual(70);
    expect(prepared.result.damage).toBeLessThanOrEqual(89);
  });

  it("record 18 swift dragon knight can evade shooting on the native bit candidate", () => {
    const battle = new Stage0Battle(0, new DeterministicRng(1));
    const attacker = battle.unit("1:0")!;
    const target = battle.units.find(({ side }) => side === 2)!;
    battle.units = [attacker, target];
    attacker.classId = "archer";
    attacker.x = 20;
    attacker.y = 20;
    target.classId = "swift-dragon-knight";
    target.x = 22;
    target.y = 20;
    const prepared = battle.prepareSpecialAction({
      actionId: "archer-shot",
      actorId: attacker.id,
      targetId: target.id,
      target: { x: target.x, y: target.y },
    });
    expect(prepared.result.damage).toBe(0);
    expect(prepared.result.targetDied).toBe(false);
  });
});

function nativeRecordsForCategory(category: string): number[] {
  return unitCatalog.records
    .filter((record) => record.playerActionCategory === category)
    .map(({ record }) => record);
}

function classIdFromRecord(record: number): ClassId {
  const classId = classIdFromNativeRecord(record);
  if (!classId) throw new Error(`missing generated class for record ${record}`);
  return classId;
}
