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
import { classTraitsFor } from "../../src/game/content/class-traits";
import { DeterministicRng } from "../../src/game/simulation/rng";
import { CLASS_SHOWDOWN_ENVIRONMENT } from "../../src/game/class-showdown-session";
import { ArenaBattle } from "../../src/game/simulation/arena-battle";
import type { ArenaUnitPlacement } from "../../src/game/arena-session";

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

function createWaterSplitBattle(options: {
  attackerClassId?: ClassId;
  attacker?: { x: number; y: number };
  water?: { x: number; y: number };
  blockers?: readonly { id: string; x: number; y: number }[];
  terrainSlotAt?: (position: { x: number; y: number }) => number;
  rng?: DeterministicRng;
} = {}): ArenaBattle {
  const attacker = options.attacker ?? { x: 20, y: 21 };
  const water = options.water ?? { x: 20, y: 20 };
  const placements: ArenaUnitPlacement[] = [
    {
      id: "attacker",
      side: 1,
      slot: 0,
      classId: options.attackerClassId ?? "magic-armor-warrior",
      level: 1,
      ...attacker,
    },
    {
      id: "water",
      side: 2,
      slot: 0,
      classId: "water-warrior",
      level: 1,
      ...water,
    },
    ...(options.blockers ?? []).map((blocker, index) => ({
      ...blocker,
      side: 2 as const,
      slot: index + 1,
      classId: "soldier" as const,
      level: 1 as const,
    })),
  ];
  const environment = options.terrainSlotAt
    ? { ...CLASS_SHOWDOWN_ENVIRONMENT, terrainSlotAt: options.terrainSlotAt }
    : CLASS_SHOWDOWN_ENVIRONMENT;
  return new ArenaBattle(
    placements,
    0,
    options.rng ?? new DeterministicRng(0x0a2e2026),
    environment,
  );
}

describe("native class implementation sequence", () => {
  it("catalogs every confirmed terminal knight and warrior trait without inventing missing branches", () => {
    const traitClasses = [
      "swift-dragon-knight",
      "beast-knight",
      "bone-knight",
      "great-dragon-knight",
      "flying-dragon-knight",
      "great-axe-warrior",
      "magic-sword-warrior",
      "evil-sword-warrior",
      "jungle-warrior",
    ] satisfies readonly ClassId[];
    expect(Object.fromEntries(traitClasses.map(
      (classId) => [classId, classTraitsFor(classId).map(({ id }) => id)],
    )))
      .toEqual({
        "swift-dragon-knight": ["swift-dragon-shooting-evasion"],
        "beast-knight": ["beast-knight-attack-down"],
        "bone-knight": ["bone-knight-full-counter"],
        "great-dragon-knight": ["great-dragon-stomp"],
        "flying-dragon-knight": ["flying-dragon-extra-move"],
        "great-axe-warrior": ["great-axe-no-counter"],
        "magic-sword-warrior": ["magic-sword-defense-down"],
        "evil-sword-warrior": ["evil-sword-confusion"],
        "jungle-warrior": ["jungle-poison"],
      });
    expect(Object.fromEntries(traitClasses.map(
      (classId) => [classId, classTraitsFor(classId).map(({ shortDescription }) => shortDescription)],
    ))).toEqual({
      "swift-dragon-knight": ["約50%閃避弓箭"],
      "beast-knight": ["命中降攻"],
      "bone-knight": ["約50%強力反擊"],
      "great-dragon-knight": ["龍踏技術"],
      "flying-dragon-knight": ["攻後再移動"],
      "great-axe-warrior": ["攻擊無反擊"],
      "magic-sword-warrior": ["命中降防"],
      "evil-sword-warrior": ["命中混亂"],
      "jungle-warrior": ["命中施毒"],
    });
    expect(traitClasses.flatMap((classId) => classTraitsFor(classId))
      .every(({ description }) => description.length > 0)).toBe(true);
    expect(classTraitsFor("demon-dragon-knight")).toEqual([]);
    expect(classTraitsFor("magic-armor-warrior")).toEqual([]);
    expect(classTraitsFor("water-warrior")).toEqual([{
      id: "water-warrior-split",
      shortDescription: "近戰受擊分裂",
      description: "受到普通近戰攻擊且存活時，會在相鄰合法空格新增一個分裂體；全體共享生命，場上最多 4 個。",
    }]);
  });

  it("record 26 water warrior splits one cell per defensive melee hit up to four", () => {
    const rng = new DeterministicRng(0x0a2e2026);
    const battle = createWaterSplitBattle({ rng });
    const attacker = battle.unit("attacker")!;
    const callsBefore = rng.calls;

    const expectedPositions = [
      { x: 20, y: 19 },
      { x: 19, y: 20 },
      { x: 21, y: 20 },
    ];
    for (let splitCount = 2; splitCount <= 4; splitCount += 1) {
      const result = battle.attack(attacker.id, "water");
      expect(result).toMatchObject({
        splitUnitId: `water:split-${splitCount - 1}`,
        splitCount,
        defenderDied: false,
      });
      expect(battle.unit(result.splitUnitId!)).toMatchObject(expectedPositions[splitCount - 2]);
      attacker.acted = false;
    }

    const capped = battle.attack(attacker.id, "water");
    expect(capped.splitUnitId).toBeUndefined();
    expect(capped.splitCount).toBeUndefined();
    expect(battle.units.filter(({ id }) => id === "water" || id.startsWith("water:split-")))
      .toHaveLength(4);
    expect(rng.calls - callsBefore).toBe(12);
  });

  it("water warrior split skips forbidden terrain and occupied cells in native order", () => {
    const battle = createWaterSplitBattle({
      attacker: { x: 19, y: 20 },
      blockers: [{ id: "down-blocker", x: 20, y: 21 }],
      terrainSlotAt: ({ x, y }) => x === 20 && y === 19 ? 0 : 2,
    });

    const result = battle.attack("attacker", "water");

    expect(result).toMatchObject({ splitUnitId: "water:split-1", splitCount: 2 });
    expect(battle.unit("water:split-1")).toMatchObject({ x: 21, y: 20 });
  });

  it("water warrior does not split when all four adjacent cells are illegal", () => {
    const battle = createWaterSplitBattle({
      attacker: { x: 0, y: 1 },
      water: { x: 0, y: 0 },
      blockers: [{ id: "right-blocker", x: 1, y: 0 }],
    });

    const result = battle.attack("attacker", "water");

    expect(result.splitUnitId).toBeUndefined();
    expect(battle.units.filter(({ classId }) => classId === "water-warrior")).toHaveLength(1);
  });

  it("water warrior copies shared state, synchronizes later damage, and dies as one group", () => {
    const battle = createWaterSplitBattle({ attackerClassId: "jungle-warrior" });
    const first = battle.attack("attacker", "water");
    const root = battle.unit("water")!;
    const split = battle.unit(first.splitUnitId!)!;
    expect([root, split].map(({ statuses }) => statuses.poison)).toEqual([3, 3]);
    expect([root.life, split.life]).toEqual([root.life, root.life]);

    const attacker = battle.unit("attacker")!;
    attacker.classId = "archer";
    attacker.acted = false;
    attacker.x = 17;
    attacker.y = 19;
    battle.commitPreparedAction(battle.prepareSpecialAction({
      actionId: "archer-shot",
      actorId: attacker.id,
      targetId: split.id,
      target: { x: split.x, y: split.y },
    }));
    expect(battle.units.filter(({ classId }) => classId === "water-warrior")).toHaveLength(2);
    expect(root.life).toBe(split.life);

    root.acted = false;
    expect(battle.rest(root.id)).toBeGreaterThan(0);
    expect(root.life).toBe(split.life);

    attacker.classId = "jungle-warrior";
    attacker.acted = false;
    attacker.x = 19;
    attacker.y = 19;
    battle.attack(attacker.id, split.id);
    const sharedGroup = battle.units.filter(({ id }) =>
      id === "water" || id.startsWith("water:split-"));
    expect(new Set(sharedGroup.map(({ life }) => life)).size).toBe(1);
    expect(new Set(sharedGroup.map(({ experience }) => experience)).size).toBe(1);
    expect(new Set(sharedGroup.map(({ statuses }) => statuses.poison))).toEqual(new Set([3]));

    for (const unit of sharedGroup) unit.life = 1;
    attacker.acted = false;
    const target = sharedGroup.find(({ id }) => id !== "water")!;
    attacker.x = target.x - 1;
    attacker.y = target.y;
    const fatal = battle.attack(attacker.id, target.id);
    expect(fatal.defenderDied).toBe(true);
    expect(battle.units.some(({ id }) => id === "water" || id.startsWith("water:split-")))
      .toBe(false);
  });

  it("counter damage, shooting, and techniques do not create water warrior splits", () => {
    const counterBattle = new ArenaBattle([
      { id: "water", side: 1, slot: 0, classId: "water-warrior", level: 1, x: 20, y: 20 },
      { id: "target", side: 2, slot: 0, classId: "magic-armor-warrior", level: 1, x: 21, y: 20 },
    ], 0, undefined, CLASS_SHOWDOWN_ENVIRONMENT);
    expect(counterBattle.attack("water", "target").splitUnitId).toBeUndefined();
    expect(counterBattle.units.filter(({ classId }) => classId === "water-warrior")).toHaveLength(1);

    const shootingBattle = new ArenaBattle([
      { id: "archer", side: 1, slot: 0, classId: "archer", level: 1, x: 20, y: 20 },
      { id: "water", side: 2, slot: 0, classId: "water-warrior", level: 1, x: 22, y: 20 },
    ], 0, undefined, CLASS_SHOWDOWN_ENVIRONMENT);
    shootingBattle.commitPreparedAction(shootingBattle.prepareSpecialAction({
      actionId: "archer-shot",
      actorId: "archer",
      targetId: "water",
      target: { x: 22, y: 20 },
    }));
    expect(shootingBattle.units.filter(({ classId }) => classId === "water-warrior"))
      .toHaveLength(1);

    const techniqueBattle = new ArenaBattle([
      { id: "sister", side: 1, slot: 0, classId: "sister", level: 1, x: 20, y: 20 },
      { id: "water", side: 2, slot: 0, classId: "water-warrior", level: 1, x: 21, y: 20 },
    ], 0, undefined, CLASS_SHOWDOWN_ENVIRONMENT);
    techniqueBattle.commitPreparedAction(techniqueBattle.prepareSpecialAction({
      actionId: "fire-1",
      actorId: "sister",
      targetId: "water",
      target: { x: 21, y: 20 },
    }));
    expect(techniqueBattle.units.filter(({ classId }) => classId === "water-warrior"))
      .toHaveLength(1);
  });

  it("restores water warrior shared state and inherited force from a snapshot", () => {
    const battle = createWaterSplitBattle();
    const splitResult = battle.attack("attacker", "water");
    const splitId = splitResult.splitUnitId!;
    const snapshot = battle.serializableSnapshot();
    const restored = createWaterSplitBattle();
    restored.restore(snapshot);

    expect(restored.forceForUnit(splitId)?.id).toBe(restored.forceForUnit("water")?.id);
    const attacker = restored.unit("attacker")!;
    const split = restored.unit(splitId)!;
    attacker.acted = false;
    attacker.x = split.x - 1;
    attacker.y = split.y;
    restored.attack(attacker.id, split.id);
    const group = restored.units.filter(({ id }) =>
      id === "water" || id.startsWith("water:split-"));
    expect(new Set(group.map(({ life }) => life)).size).toBe(1);
    expect(group.every(({ id }) => restored.forceForUnit(id)?.id === "arena-enemy-force"))
      .toBe(true);
  });

  it("record 15 flying dragon knight gets one acted-state path at half current movement", () => {
    const battle = new ArenaBattle([
      {
        id: "flying-dragon",
        side: 1,
        slot: 0,
        classId: "flying-dragon-knight",
        level: 1,
        x: 20,
        y: 20,
      },
      {
        id: "ordinary-ally",
        side: 1,
        slot: 1,
        classId: "soldier",
        level: 1,
        x: 30,
        y: 30,
      },
      {
        id: "enemy",
        side: 2,
        slot: 0,
        classId: "soldier",
        level: 1,
        x: 21,
        y: 20,
      },
    ], 0, undefined, CLASS_SHOWDOWN_ENVIRONMENT);
    const unit = battle.unit("flying-dragon")!;
    const enemy = battle.unit("enemy")!;
    enemy.life = 1;
    const attack = battle.attack(unit.id, enemy.id);

    expect(classTraitsFor(unit.classId).map(({ id }) => id))
      .toContain("flying-dragon-extra-move");
    expect(attack).toMatchObject({ attackerDied: false, defenderDied: true });
    expect(battle.outcome()).toBe("victory");
    expect(battle.canUseFlyingDragonExtraMove(attack)).toBe(true);
    expect(battle.statsFor(unit).movement).toBe(10);
    expect(battle.movementPath(unit.id, { x: 24, y: 20 })).toEqual([]);
    expect(battle.extraMovementRange(unit.id)).toContainEqual({ x: 24, y: 20 });
    expect(battle.extraMovementRange(unit.id)).not.toContainEqual({ x: 25, y: 20 });
    expect(battle.extraMovementPath(unit.id, { x: 24, y: 20 })).toEqual([
      { x: 20, y: 20 },
      { x: 21, y: 20 },
      { x: 22, y: 20 },
      { x: 23, y: 20 },
      { x: 24, y: 20 },
    ]);
    expect(battle.extraMovementPath(unit.id, { x: 25, y: 20 })).toEqual([]);

    const ordinaryAlly = battle.unit("ordinary-ally")!;
    ordinaryAlly.acted = true;
    expect(battle.extraMovementRange(ordinaryAlly.id)).toEqual([]);
    expect(battle.extraMovementPath(ordinaryAlly.id, { x: 29, y: 30 })).toEqual([]);
  });

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

  it("records 14 and 9 use static attack/defense profiles without an exchange trait", () => {
    const demonDragon = classDefinition("demon-dragon-knight");
    const magicArmor = classDefinition("magic-armor-warrior");

    expect(demonDragon.dataRows.slice(0, 3).map(({ level, attack, defense }) => ({
      level,
      attack,
      defense,
    }))).toEqual([
      { level: 10, attack: 87, defense: 45 },
      { level: 11, attack: 93, defense: 48 },
      { level: 12, attack: 99, defense: 51 },
    ]);
    expect(magicArmor.dataRows.slice(0, 3).map(({ level, attack, defense }) => ({
      level,
      attack,
      defense,
    }))).toEqual([
      { level: 10, attack: 76, defense: 60 },
      { level: 11, attack: 78, defense: 72 },
      { level: 12, attack: 80, defense: 84 },
    ]);

    expect(classStatsFor({ classId: "demon-dragon-knight", experience: 0 }))
      .toMatchObject({ attack: 87, defense: 45 });
    expect(classStatsFor({ classId: "magic-armor-warrior", experience: 0 }))
      .toMatchObject({ attack: 76, defense: 60 });
    expect(classTraitsFor("demon-dragon-knight")).toEqual([]);
    expect(classTraitsFor("magic-armor-warrior")).toEqual([]);
    expect(demonDragon.ordinaryHitStatuses).toEqual([]);
    expect(magicArmor.ordinaryHitStatuses).toEqual([]);
    expect(demonDragon.shooting).toBeNull();
    expect(magicArmor.shooting).toBeNull();
    expect(demonDragon.technique).toBeNull();
    expect(magicArmor.technique).toBeNull();
    expect(demonDragon.aiClassDispatch).toEqual({ side1: "ordinary", side2: "ordinary" });
    expect(magicArmor.aiClassDispatch).toEqual({ side1: "ordinary", side2: "ordinary" });
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
