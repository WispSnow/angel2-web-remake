#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DATA_SEGMENT = 0x1eba;
const DATA_LINEAR_BASE = DATA_SEGMENT * 16;
const KILL_REWARD_TABLE_OFFSET = 0x784e;
const LEVEL_DIFFERENCE_TABLE_OFFSET = 0x77fd;
const LEVEL_DIFFERENCE_TABLE_WORDS = 13;
const GROWTH_CODE_SEGMENT_FILE_BASE = 0x18b60;
const GROWTH_TABLE_CS_OFFSET = 0x036a;
const SENTINEL = 0xffff;

const CODE_SIGNATURES = [
  { address: "0000:90D8", offset: 0x90d8, hex: "ff360460c70604604e00" },
  { address: "0000:9123", offset: 0x9123, hex: "a122008ec08b1ebf77268a07" },
  { address: "0000:9161", offset: 0x9161, hex: "8b1ebf77e8c2bea1c931" },
  { address: "0000:91F1", offset: 0x91f1, hex: "8b1ec177e832bea1c931" },
  { address: "0000:926B", offset: 0x926b, hex: "f6061911017404e82100" },
  { address: "0000:92C5", offset: 0x92c5, hex: "813ebb773047740b833eb97700" },
  { address: "0000:92DC", offset: 0x92dc, hex: "8b1ec177e847bd833ec93100" },
  { address: "0000:931B", offset: 0x931b, hex: "8b1ec177e808bd833ec931007501c3a1bd773d304e7401c3e83c0083ff04" },
  { address: "0000:9372", offset: 0x9372, hex: "8b16c931b9c40933f633ffa124008ec0268a04" },
  { address: "0000:939E", offset: 0x939e, hex: "8bf0a124008ec0268a14a122008ec0268a3480fa00" },
  { address: "0000:93F2", offset: 0x93f2, hex: "8b3ebf77e86401893eb777" },
  { address: "0000:942E", offset: 0x942e, hex: "8b3ec177e82801893eb977" },
  { address: "0000:946A", offset: 0x946a, hex: "a1a7018ec033db268a1d03db" },
  { address: "0000:9490", offset: 0x9490, hex: "a1cb773b06cd77750c" },
  { address: "0000:94E3", offset: 0x94e3, hex: "a1cb773b06cd77750c" },
  { address: "0000:95D2", offset: 0x95d2, hex: "33c0e4403bc277f8c3" },
  { address: "0000:95DB", offset: 0x95db, hex: "33db8b874e783dffff" },
  { address: "0000:96C2", offset: 0x96c2, hex: "c60690794ec70693790000" },
  { address: "0000:783D", offset: 0x783d, hex: "8bdee8e8d7f706ab310080" },
  { address: "0000:A096", offset: 0xa096, hex: "8b1ec177e88daf833ec93101" },
  { address: "0000:A0C6", offset: 0xa0c6, hex: "8b1ec177e85daf833ec93102" },
  { address: "0000:A0F6", offset: 0xa0f6, hex: "a1647a8b1ed77c2bc37204" },
  { address: "0000:A10C", offset: 0xa10c, hex: "a1ea7a8b1ed77c2bc37204" },
  { address: "0000:A122", offset: 0xa122, hex: "a1647a8b1e667a8907" },
  { address: "0000:A17B", offset: 0xa17b, hex: "e86601e8420dc7062d7d96a0" },
  { address: "0000:4DCD", offset: 0x4dcd, hex: "9a9b005d139aac009d13c6067cfa4e" },
  { address: "1000:35DC", offset: 0x135dc, hex: "e85400c706ca1cd045e80a00c706ca1cec4b" },
  { address: "1000:35F2", offset: 0x135f2, hex: "b8ba1e8ed88ec033ffb93a00518b1eca1c8b31bb0800b90800" },
  { address: "1000:3633", offset: 0x13633, hex: "bb0000b9c40951539a58500000833ec93100" },
  { address: "1000:2300", offset: 0x12300, hex: "2e833e7f015974092e833e7f01417401c38b1e161f9a58500000a1f63ba33f0da1c531a3470da1bd31a3450dbea53183c6088b04a900807406c7063f0dff00a19d31c3" },
  { address: "1000:8CC1", offset: 0x18cc1, hex: "8b36b9318b440cb8018089440ccb" },
  { address: "1000:8CCF", offset: 0x18ccf, hex: "8b36b9318b440cb8000089440ccb" },
  { address: "1000:8CDD", offset: 0x18cdd, hex: "8b36b9318b440203c1894402cb" },
  { address: "1000:8CEA", offset: 0x18cea, hex: "8b36b9318b440ab8038089440acb" },
  { address: "1000:8CF8", offset: 0x18cf8, hex: "8b36b9318b4408b80380894408cb" },
  { address: "1000:8D06", offset: 0x18d06, hex: "8b36b9318b4412b80380894412cb" },
  { address: "1000:8D14", offset: 0x18d14, hex: "8b36b9318b4410b80380894410cb" },
  { address: "1000:8D22", offset: 0x18d22, hex: "8b36b9318b440eb8038089440ecb" },
  { address: "1000:8D30", offset: 0x18d30, hex: "8b36b9318b4414b80380894414cb" },
  { address: "1000:8D3E", offset: 0x18d3e, hex: "8b36b9318b4416b80380894416cb" },
  { address: "1000:8D4C", offset: 0x18d4c, hex: "8b36b9318b441225ff7f8944128b441025ff7f" },
  { address: "1000:8E5B", offset: 0x18e5b, hex: "e82700e80100cb" },
  { address: "1000:8E62", offset: 0x18e62, hex: "a18e310116a1313b06a1317212" },
  { address: "1000:8E85", offset: 0x18e85, hex: "8b169d3133db2e8b876a033dffff" },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function dataLinear(dsOffset, bytes, buffer) {
  const linear = DATA_LINEAR_BASE + dsOffset;
  if (linear < 0 || linear + bytes > buffer.length) {
    throw new Error(`DS:${hex(dsOffset)} is outside the runtime image`);
  }
  return linear;
}

function decodeCode(word) {
  return String.fromCharCode(word & 0xff, (word >>> 8) & 0xff);
}

function validateCodeSignatures(buffer) {
  return CODE_SIGNATURES.map((signature) => {
    const expected = Buffer.from(signature.hex, "hex");
    const actual = buffer.subarray(signature.offset, signature.offset + expected.length);
    if (!actual.equals(expected)) {
      throw new Error(`${signature.address}: combat code signature mismatch`);
    }
    return {
      address: signature.address,
      fileOffset: signature.offset,
      bytes: expected.length,
      sha256: sha256(expected),
    };
  });
}

function descriptorIndex(descriptors) {
  if (!Array.isArray(descriptors?.records) || descriptors.records.length !== 39) {
    throw new Error("expected 39 native unit descriptors");
  }
  const byCode = new Map();
  for (const record of descriptors.records) {
    for (const code of record.codeVariants) {
      const values = byCode.get(code) ?? [];
      values.push({ record: record.record, name: record.normalizedName });
      byCode.set(code, values);
    }
  }
  return byCode;
}

function parseKillRewards(buffer, descriptorsByCode) {
  const entries = [];
  let cursor = dataLinear(KILL_REWARD_TABLE_OFFSET, 4, buffer);
  for (let index = 0; index < 64; index += 1, cursor += 4) {
    const codeWord = buffer.readUInt16LE(cursor);
    const reward = buffer.readUInt16LE(cursor + 2);
    if (codeWord === SENTINEL) {
      return {
        address: `${hex(DATA_SEGMENT)}:${hex(KILL_REWARD_TABLE_OFFSET)}`,
        fileOffset: dataLinear(KILL_REWARD_TABLE_OFFSET, 4, buffer),
        entryCount: entries.length,
        sentinelFileOffset: cursor,
        entries,
      };
    }
    const code = decodeCode(codeWord);
    const matches = descriptorsByCode.get(code) ?? [];
    entries.push({
      index,
      codeWord,
      code,
      reward,
      descriptorMatches: matches,
    });
  }
  throw new Error("kill-reward table has no FFFF sentinel in 64 entries");
}

function specialUnit(descriptorsByCode, code) {
  const matches = descriptorsByCode.get(code) ?? [];
  if (matches.length !== 1) {
    throw new Error(`${code}: expected one native descriptor match, got ${matches.length}`);
  }
  return { code, ...matches[0] };
}

function parsePostThirdRowGrowth(buffer, descriptorsByCode) {
  const tableFileOffset = GROWTH_CODE_SEGMENT_FILE_BASE + GROWTH_TABLE_CS_OFFSET;
  const entries = [];
  let cursor = tableFileOffset;
  for (let index = 0; index < 64; index += 1, cursor += 8) {
    const codeWord = buffer.readUInt16LE(cursor);
    if (codeWord === SENTINEL) {
      return {
        logicalAddress: `CS:${hex(GROWTH_TABLE_CS_OFFSET)}`,
        fileOffset: tableFileOffset,
        entryCount: entries.length,
        sentinelFileOffset: cursor,
        entries,
      };
    }
    const code = decodeCode(codeWord);
    entries.push({
      index,
      codeWord,
      code,
      thresholdIncrement: buffer.readUInt16LE(cursor + 2),
      attackIncrement: buffer.readUInt16LE(cursor + 4),
      maxLifeIncrement: buffer.readUInt16LE(cursor + 6),
      descriptorMatches: descriptorsByCode.get(code) ?? [],
    });
  }
  throw new Error("post-third-row growth table has no FFFF sentinel in 64 entries");
}

async function extract(runtimePath, descriptorPath, outputPath) {
  const [buffer, descriptors] = await Promise.all([
    readFile(runtimePath),
    readFile(descriptorPath, "utf8").then(JSON.parse),
  ]);
  const descriptorsByCode = descriptorIndex(descriptors);
  const signatures = validateCodeSignatures(buffer);
  const killRewards = parseKillRewards(buffer, descriptorsByCode);
  if (killRewards.entryCount !== 35) {
    throw new Error(`expected 35 normal-unit kill rewards, got ${killRewards.entryCount}`);
  }
  const levelDifferenceTable = Array.from(
    { length: LEVEL_DIFFERENCE_TABLE_WORDS },
    (_, index) => buffer.readUInt16LE(
      dataLinear(LEVEL_DIFFERENCE_TABLE_OFFSET + index * 2, 2, buffer),
    ),
  );
  const expectedDifferenceTable = [15, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115, 125];
  if (!levelDifferenceTable.every((value, index) => value === expectedDifferenceTable[index])) {
    throw new Error("level-difference scratch table no longer matches the recovered runtime");
  }
  const postThirdRowGrowth = parsePostThirdRowGrowth(buffer, descriptorsByCode);
  if (postThirdRowGrowth.entryCount !== 23) {
    throw new Error(`expected 23 post-third-row growth entries, got ${postThirdRowGrowth.entryCount}`);
  }

  const result = {
    format: "ANGEL2 module 29 ordinary attack, counter, life and experience rules",
    source: runtimePath,
    sourceBytes: buffer.length,
    sourceSha256: sha256(buffer),
    unitDescriptors: descriptorPath,
    addressModel: {
      code0000FileBase: 0,
      code1000FileBase: 0x10000,
      dataSegment: DATA_SEGMENT,
      dataLinearBase: DATA_LINEAR_BASE,
      growthTableRuntimeCodeSegmentFileBase: GROWTH_CODE_SEGMENT_FILE_BASE,
    },
    randomSource: {
      function: "0000:95D2",
      mechanism: "read PIT channel-0 counter byte from I/O port 0x40 until AL <= DX",
      ordinaryAttackDx: 3,
      returnedDomain: [0, 1, 2, 3],
      ordinaryAddendDomainAfterPlus4: [4, 5, 6, 7],
      note: "the native rejection loop proves the domain, not statistical uniformity",
    },
    terrainDefense: {
      lookupChain: ["0000:946A", "1000:41A1"],
      formula: "terrainDefense = floor(defense * terrainPercent / 100)",
      evidence: "the board terrain byte selects a unit-profile word, then 93F2/942E multiply current defense by that word and divide by 100",
      unresolved: "the 24 terrain slot names and profile percentages are not yet mapped to visible terrain",
    },
    damage: {
      primary: {
        formula: "max(0, attacker.attack - defender.defense - defender.terrainDefense) + random4to7_a + random4to7_b",
        randomTotalRange: [8, 14],
        evidence: [
          "0000:9490 performs saturating attack-minus-defense-minus-terrain and adds the first PIT value plus 4",
          "0000:94E3 unconditionally adds a second PIT value plus 4 to primaryDamage",
        ],
        originalQuirk: "the second random addend is written to primaryDamage, not counterDamage",
      },
      counter: {
        baseFormula: "floor(max(0, defender.attack - attacker.defense - attacker.terrainDefense) / 2)",
        eligibility: "primary target survived AND attacker.code != '0G' AND defender.unitDisableByte == 0",
        noCounterAttacker: specialUnit(descriptorsByCode, "0G"),
        reflectionOverride: {
          defender: specialUnit(descriptorsByCode, "2E"),
          trigger: "one direct PIT port-0x40 read has bit 0 set",
          formulaWhenTriggered: "counterDamage = primaryDamage",
          animationFlag: "DS:77B4 = 'Y' in the map-animation path",
        },
      },
      hitModel: {
        missBranchFound: false,
        criticalBranchFound: false,
        ordinaryChainInterpretation: "ordinary physical attacks always resolve a non-negative damage value; only additive random damage and the 2E override occur in this chain",
      },
    },
    lifeApplication: {
      stateLayout: { currentLifeOffset: 0, experienceOffset: 2 },
      mapAnimationPath: {
        selector: "DS:1119 bit0 = 0",
        function: "0000:783D",
        behavior: "decrement life one point per animation step, clamp at zero, stop once the target is gone",
        immunity: "unit state +0x0C bit15 skips each decrement",
      },
      fullBattleAnimationPath: {
        selector: "DS:1119 bit0 = 1",
        functions: ["0000:A096", "0000:A0C6", "0000:A0F6", "0000:A10C", "0000:A122"],
        behavior: "subtract the complete damage from a mirrored life value with unsigned saturation at zero, then write it to state +0",
        observedDifference: "this direct subtraction path does not test state +0x0C bit15",
      },
      deathRemoval: {
        function: "0000:96C2",
        behavior: "scan all 2500 cells; when current life is zero, clear the current board unit through the removal path",
        poisonBoundaryQuirk: "the full-round poison/status chain never calls this removal function; a poison tick can leave a zero-life unit present on both board maps",
      },
    },
    statusLifecycle: {
      roundBoundary: {
        function: "0000:4DCD",
        callerContext: "standard battle loop after the side-2 phase and victory/defeat checks, before the next player phase",
        order: [
          "reset/presentation work",
          "increment DS:2F83 round counter",
          "redraw round display",
          "apply poison ticks to every occupied board cell",
          "decrement all eight status words for both side pointer tables",
          "run stage-specific round events",
        ],
        cadence: "once per complete player + side-1-autonomous + side-2 round, not once per faction phase",
      },
      slots: [
        { offset: 0x08, name: "攻击提升", setter: "1000:8CF8", appliedValue: 0x8003, consumer: "effective attack +20" },
        { offset: 0x0a, name: "防御提升", setter: "1000:8CEA", appliedValue: 0x8003, consumer: "effective defense +20" },
        { offset: 0x0c, name: "防魔", setter: "1000:8CC1", clearFunction: "1000:8CCF", appliedValue: 0x8001, consumer: "effect-specific protection; also blocks map-path movement and one-point damage" },
        {
          offset: 0x0e,
          name: "混乱",
          setter: "1000:8D22",
          appliedValue: 0x8003,
          consumer: "1000:2300 tests bit15 through SI=31A5h+8 and overrides the loaded AI behavior with FFh",
          aiBehavior: {
            ordinaryClasses: "1000:18A1 routes FFh to defensive retreat: choose the highest-terrain-defense reachable empty cell with no orthogonally adjacent enemy, then end the action",
            shootingTechniqueAndEmpressDragonClasses: "1000:192C/19DD/1A68 route FFh to the first ascending nonzero movement-range cell whose PIT bit0 is zero, move if different, then end without attacking/shooting/casting",
            playerSelection: "0000:55D3 does not test confusion, so the status does not directly disable manual selection",
          },
          auditCorrection: "the earlier direct-address audit missed this indirect read because the code forms 31ADh as SI=31A5h+8",
        },
        { offset: 0x10, name: "攻击下降", setter: "1000:8D14", appliedValue: 0x8003, consumer: "effective attack -20" },
        { offset: 0x12, name: "防御下降", setter: "1000:8D06", appliedValue: 0x8003, consumer: "effective defense -20" },
        { offset: 0x14, name: "施毒", setter: "1000:8D30", appliedValue: 0x8003, consumer: "full-round poison tick" },
        { offset: 0x16, name: "禁咒", setter: "1000:8D3E", appliedValue: 0x8003, consumer: "blocks the player technique menu and forces technique-class AI through the ordinary-AI path" },
      ],
      setters: {
        behavior: "each setter overwrites the complete word; applying the same status again refreshes it to 0x8003 (or defense magic to 0x8001)",
      },
      decrement: {
        function: "1000:35F2",
        tables: ["DS:45D0 side-1 unit-state pointer table", "DS:4BEC side-2 unit-state pointer table"],
        recordsPerTable: 58,
        offsets: [0x08, 0x0a, 0x0c, 0x0e, 0x10, 0x12, 0x14, 0x16],
        formula: "if bit15 is set: counter = (word & 0x7FFF) - 1; write 0 when counter == 0, otherwise write 0x8000 | counter",
        example: ["8003h", "8002h", "8001h", "0000h"],
      },
      poison: {
        function: "1000:3633",
        scan: "all 2500 board cells; apply once for every occupied cell whose state +0x14 bit15 is set",
        formula: "currentLife = floor(currentLife / 2)",
        minimumClamp: 0,
        orderRelativeToCountdown: "poison damage is applied before the status counter is decremented at the same round boundary",
        zeroLifeBehavior: {
          removedByStatusChain: false,
          playerSelectable: true,
          objectivePresence: "absence/all-defeated checks inspect board side/slot maps, so a zero-life poison victim still counts as present",
          aiBehavior: "a zero-life AI unit evaluates to 0% life and enters the low-life rest policy",
          fidelityWarning: "do not treat poison reaching zero as ordinary attack death unless intentionally fixing this native quirk",
        },
      },
      purification: {
        function: "1000:8D4C",
        behavior: [
          "clear bit15 while preserving low counters for defense-down, attack-down and confusion",
          "write 0x7FFF to poison and spell-seal",
          "bit15-clear words are ignored by the countdown",
          "later status setters overwrite 0x7FFF, so purification does not create permanent immunity",
        ],
      },
    },
    experience: {
      writeFunction: "1000:8CDD",
      writeBehavior: "unitState.experience (+0x02) += award",
      primaryHitTargetSurvives: "target.level + random4to7",
      primaryHitTargetDies: "killReward[target.code] + random4to7",
      counterHitTargetSurvives: "floor((target.level + random4to7) / 2)",
      counterHitTargetDies: "killReward[target.code] + random4to7",
      deathBranchReason: "death removal changes the target cell to side 0 before 9161/91F1 choose the surviving-target or removed-target award path",
      killRewards,
      overwrittenScratchTable: {
        address: `${hex(DATA_SEGMENT)}:${hex(LEVEL_DIFFERENCE_TABLE_OFFSET)}`,
        valuesByNonnegativeLevelDifference: levelDifferenceTable,
        status: "computed into DS:77DB/77DD by 9490/94E3 but overwritten or bypassed by every observed final experience-write branch",
        implementationRule: "preserve as evidence of original dead/intermediate logic; do not use as the confirmed award formula",
      },
      cumulativeProgression: {
        currentExperienceStorage: "unit state +0x02",
        firstThreeRows: "load row 1, then replace it with row 2/3 whenever currentExperience >= that row's field0 threshold",
        experienceSpentOnOrdinaryLevel: false,
        postThirdRowFormula: [
          "nextThreshold = thirdRowThreshold",
          "repeat: nextThreshold += thresholdIncrement",
          "while currentExperience >= nextThreshold: attack += attackIncrement; maxLife += maxLifeIncrement; growthRowCount += 1",
        ],
        defenseIncrementAfterThirdRow: 0,
        classSpecificTable: postThirdRowGrowth,
        defaultWhenCodeMissing: {
          thresholdIncrement: 100,
          attackIncrement: 1,
          maxLifeIncrement: 10,
        },
        fourthAndFifthDataRows: "not consumed by the recovered module-29 battle stat selector; post-third-row growth uses this code table instead",
        promotionReset: "promotion commit at 0000:0744 writes zero to unit state +0x02",
      },
    },
    ordinaryAttackStatusApplication: {
      function: "0000:92DC",
      callSites: ["0000:928F", "0000:92AF"],
      timing: "called once on the selected map/full battle presentation path after the primary hit and any eligible counter damage have resolved",
      attackerSource: "the original attacker class code in DS:77BB",
      defenderSource: "the original defender unit loaded from DS:77C1",
      counterBehavior: "counter damage does not invoke this handler with the counterattacker as a new status source",
    },
    ordinaryAttackStatuses: [
      {
        attacker: specialUnit(descriptorsByCode, "1G"),
        stateOffset: 0x12,
        value: 0x8003,
        confirmedEffect: "effective defense -20 while bit15 is set",
      },
      {
        attacker: specialUnit(descriptorsByCode, "1E"),
        stateOffset: 0x10,
        value: 0x8003,
        confirmedEffect: "effective attack -20 while bit15 is set",
      },
      {
        attacker: specialUnit(descriptorsByCode, "2G"),
        stateOffset: 0x0e,
        value: 0x8003,
        confirmedEffect: "applies the same status slot named 混亂 by player technique LA; when the unit enters AI scheduling, bit15 forces behavior FFh and a class-dependent movement-only action",
      },
      {
        attacker: specialUnit(descriptorsByCode, "0H"),
        stateOffset: 0x14,
        value: 0x8003,
        confirmedEffect: "applies the same status slot named 施毒 by player technique IP; at each full-round boundary current life becomes floor(current life / 2) before countdown",
      },
    ],
    waterWarriorSplit: {
      function: "0000:931B",
      callSites: ["0000:9292", "0000:92A3"],
      defender: specialUnit(descriptorsByCode, "0N"),
      trigger: "the original defender still occupies DS:77C1 after an ordinary melee attack sequence",
      excludedSources: [
        "a water warrior acting as the original attacker and taking counter damage",
        "shooting",
        "techniques",
        "route or stage damage",
      ],
      count: {
        function: "0000:9372",
        identity: "same side byte and same unit-slot byte across all 2500 board cells",
        maximumBoardCells: 4,
        additionsPerTrigger: 1,
      },
      placement: {
        function: "0000:939E",
        candidateOrder: ["defenderCell-50 (up)", "defenderCell+50 (down)", "defenderCell-1 (left)", "defenderCell+1 (right)"],
        eligibility: "candidate board cell is empty and its movement-rule value is neither 98 nor 99",
        result: "copy the defender cell's side byte and unit-slot byte to the first eligible candidate, then return",
        randomCalls: 0,
      },
      sharedState: {
        mechanism: "all split board cells retain the same unit-slot byte and therefore resolve through one unit-state record",
        confirmedSharedFields: ["current life", "experience", "status words"],
        death: "the 0000:96C2 zero-life scan clears every board cell that resolves to the shared zero-life state",
        actionMarker: "the per-board-cell acted bit is copied at split time; it is not part of the shared unit-state record",
      },
      presentation: "no separate split animation or sound call was found; the handler writes the new board cell directly",
    },
    actionConsumption: {
      function: "0000:9123",
      behavior: "OR 0x80 into the attacker's board unit-slot byte before damage resolution",
      consequence: "the ordinary attack consumes that board unit's action marker even if later damage is zero",
    },
    verifiedCodeSignatures: signatures,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `extracted ordinary combat rules, water-warrior splitting, and ${killRewards.entryCount} kill rewards to ${outputPath}`,
  );
}

function usage() {
  return "usage: angel2-combat-formulas.mjs --extract MODULE29-UNPACKED.bin UNIT-DESCRIPTORS.json OUTPUT.json";
}

const [command, runtimePath, descriptorPath, outputPath] = process.argv.slice(2);
if (
  command !== "--extract" ||
  runtimePath === undefined ||
  descriptorPath === undefined ||
  outputPath === undefined
) {
  console.error(usage());
  process.exitCode = 1;
} else {
  extract(runtimePath, descriptorPath, outputPath).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export {
  CODE_SIGNATURES,
  DATA_SEGMENT,
  GROWTH_CODE_SEGMENT_FILE_BASE,
  GROWTH_TABLE_CS_OFFSET,
  KILL_REWARD_TABLE_OFFSET,
  LEVEL_DIFFERENCE_TABLE_OFFSET,
  parseKillRewards,
  parsePostThirdRowGrowth,
};
