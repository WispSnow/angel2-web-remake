#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";

const DATA_SEGMENT = 0x1eba;
const DATA_LINEAR_BASE = DATA_SEGMENT * 16;
const AI_CLASS_POOL_TABLE = 0x0d9e;
const AI_ACTION_TABLE = 0x0ee8;
const AI_CONTEXT_DIALOGUE_POINTER_TABLE = 0x84bb;
const SENTINEL = 0xffff;

const CODE_SIGNATURES = [
  { address: "0000:644D", offset: 0x0644d, hex: "a124008ec0268a043c0174053c02740dc3813ef41e435974" },
  { address: "0000:722B", offset: 0x0722b, hex: "e440a801740f8b1ec177e8f2dda19d313d30457404e82100" },
  { address: "1000:14D8", offset: 0x114d8, hex: "2ec7067f0159002ec706810146592ec606830102e8da0d" },
  { address: "1000:1519", offset: 0x11519, hex: "2ec7067f0141002ec706810146412ec606830101e8d00d" },
  { address: "1000:16BC", offset: 0x116bc, hex: "a1430d3d304174603d3141745b3d324174563d35417451" },
  { address: "1000:1728", offset: 0x11728, hex: "813e430d33417411813e430d30497409813e430d314974" },
  { address: "1000:1745", offset: 0x11745, hex: "a1430d3d344174383d304474333d3144742e3d32447429" },
  { address: "1000:1795", offset: 0x11795, hex: "a1430d3d305074063d31507401c3e8c202c3" },
  { address: "1000:1D67", offset: 0x11d67, hex: "2ea17f01a30f1fa1470da3181f9a04009d139ad1057010" },
  { address: "1000:1DA2", offset: 0x11da2, hex: "e80700e85200e8a600c3" },
  { address: "1000:1DAC", offset: 0x11dac, hex: "bb9e0da1430d8b0f3bc1740b83f9ff740583c304ebf0" },
  { address: "1000:1DFA", offset: 0x11dfa, hex: "33c0e4403b069a0d73f68bd88b369c0d03db8b00a34a3d" },
  { address: "1000:1E19", offset: 0x11e19, hex: "bbe80ea14a3d8b0f3bc1740e83f9ff740583c30aebf0" },
  { address: "1000:1E51", offset: 0x11e51, hex: "2ea17f01a3f91e2ea1710aa3181fa1e40effd0833e051f" },
  { address: "1000:1E6B", offset: 0x11e6b, hex: "9afc7b0000e81d062ea1770a3d3143743d3d324374383d334374333d3443742e2ea1790affd0893ec1778b1e161f2ea1730ae8af06a1c177a3095ab91400a1e60e9adeca0000" },
  { address: "1000:1EEB", offset: 0x11eeb, hex: "2ec706790a880a9a2d069d13c3" },
  { address: "1000:1EFE", offset: 0x11efe, hex: "2ec706790a9b0a9a16069d13c3" },
  { address: "1000:1F11", offset: 0x11f11, hex: "a1430d3d334174113d304974133d31497415c706181f0500" },
  { address: "1000:1F3F", offset: 0x11f3f, hex: "2ea17f01a3f91ee8c8ff9ad8059d13833e051f007422" },
  { address: "1000:1F7B", offset: 0x11f7b, hex: "e440a80174118b1ec1779a58500000a19d313d30457404" },
  { address: "1000:1FB6", offset: 0x11fb6, hex: "a1430d3d3341740b3d3049741a3d31497429c3ba1400" },
  { address: "1000:2016", offset: 0x12016, hex: "2e8a26c10be44002c4b4003bc272072e2816c10bebea" },
  { address: "1000:2233", offset: 0x12233, hex: "e832023d140072453d28007204ba5900c3a13f0d3d0100" },
  { address: "1000:2291", offset: 0x12291, hex: "e8d4013bd17204ba5900c38b36161f8936bf778936095a" },
  { address: "1000:2300", offset: 0x12300, hex: "2e833e7f015974092e833e7f01417401c38b1e161f9a58500000a1f63ba33f0da1c531a3470da1bd31a3450dbea53183c6088b04a900807406c7063f0dff00a19d31c3" },
  { address: "1000:2468", offset: 0x12468, hex: "8b1e161f9a5850000033d2a19f31bb6400f7e33d0000" },
  { address: "1000:3FE6", offset: 0x13fe6, hex: "e8d9ffc7064a3d3000c7060f1f30000ee8dbf9e83800" },
  { address: "1000:3FFD", offset: 0x13ffd, hex: "e884ffc7064a3d3000c7060f1f30000ee8c4f9e82100" },
  { address: "1000:4065", offset: 0x14065, hex: "3c0074043ac27501c306a1a9018ec0268a04073c007401" },
  { address: "1000:4264", offset: 0x14264, hex: "9a58500000a1c9313d010074063d0200740dc3c706f41e" },
  { address: "1000:070A", offset: 0x1070a, hex: "8b3e161f893e8304c7062c044800c70666040000c70668040000a1a9018ec0e80700a16604a37a04" },
  { address: "1000:0897", offset: 0x10897, hex: "ba30008b0e6804833e56040074173b0e36047711ba31008b0e3604a14604a3660489367c04833e58" },
  { address: "1000:0993", offset: 0x10993, hex: "8b3e161f893e8304c7062c04bc02c70666040000c70668040000a1a9018ec0e87efda16604a37a04cb" },
  { address: "1000:0AE1", offset: 0x10ae1, hex: "a1a9018ec0c7062c040904e844fca124008ec0c7062c046404c7067e040000c606800400e82bfccb" },
  { address: "1000:0B09", offset: 0x10b09, hex: "3c027401c38ad08bfe83c732268a053c007408fec83ad073028ad08bfe83c7ce268a053c007408fe" },
  { address: "1000:0B64", offset: 0x10b64, hex: "3c0074099a080047113ac47501c3a1a9018ec08bfe83c732268a053c00740d3a0680047207a28004893e7e04c3" },
  { address: "1000:0D83", offset: 0x10d83, hex: "a38504891e8704a1a9018ec0c7062c049c06bf0000e898f9cb3c007501c3a124008ec033c0268a04" },
  { address: "1000:18A1", offset: 0x118a1, hex: "e8b90c83fa597419a13f0d3d0c0074623dff00746fe87a0983fa597404e87107c3e8140383fa4e7404e86507c3e8b007" },
  { address: "1000:192C", offset: 0x1192c, hex: "a13f0d3d0c007503e998003dff007503e99700e8f10883fa59740983fa4d7475e8e306c3a13f0d3d010074239a830570" },
  { address: "1000:19DD", offset: 0x119dd, hex: "e85308a13f0d3d0c0074723dff00747483fa597404e83d06c3a13f0d3d010074169a8305701083f900740ce8970383fa" },
  { address: "1000:1A68", offset: 0x11a68, hex: "e8c807a13f0d3d0c0074773dff00747983fa59740983fa4d745ae8ad05c3a13f0d3d010074169a8305701083f900740c" },
  { address: "1000:1AF8", offset: 0x11af8, hex: "8b36161f8936bf77b83000a30f1fb83200a3181f9a04009d138b36161fe83e0083ff0074359a2900de172ea17f01a30f" },
  { address: "1000:1B56", offset: 0x11b56, hex: "a122008ec0268a04a8807401c3a1470da3181fa1772e3d0400740e3d000074133d09007418bf0000c3bf7d00c706181f" },
  { address: "1000:1BD9", offset: 0x11bd9, hex: "e8810983fa597503e9bf00a13f0d3d040074223d0600741d3d080074183d0a0074133d0000750a833e340d597503e99900ba4e00c32ea17f" },
  { address: "1000:1D0B", offset: 0x11d0b, hex: "2ea17f01a30f1fa1470da3181f9a04009d1333c02ea083018b1ef63b4b9a930270108b36161f8b3e7a043bfe742a83ff" },
  { address: "1000:2044", offset: 0x12044, hex: "2ea17f01a30f1fa1470da3181f9a04009d1333c02ea083018b1ef63b4b9a0a0070108b36161f8b3e7a0483ff00740a3b" },
  { address: "1000:2081", offset: 0x12081, hex: "a13f0d3d01007504e8b8ffc32ea17f01a30f1fa1470da3181f9a04009d1333c02ea083018b1ef63b4b9a0a0070108b36" },
  { address: "1000:20DB", offset: 0x120db, hex: "8b36161f2ea17f01a30f1fb8c800a3181f9a04009d139ae10370108b36161f8b3e7e0483ff0074293bf774259a2900de172ea17f" },
  { address: "1000:212D", offset: 0x1212d, hex: "2ea17f01a30f1fa1470da3181f9a04009d13e82c008b36161f8b3e7a0483ff00741b3bfe74179a2900de179aaf04de17" },
  { address: "1000:216E", offset: 0x1216e, hex: "a1a9018ec033ffb9c409268a053c007406e440a8017409e2f1c7067a040000c3893e7a04c3" },
  { address: "1000:2193", offset: 0x12193, hex: "2ea17f01a30f1fc7060f1f4100a1470d3d08007703b80800a3181f9a04009d1333c02ea083018b1ef63b4b9a0a0070108b36161f" },
  { address: "1000:255D", offset: 0x1255d, hex: "a13f0d3d00007504ba4e00c3ba4e00c3" },
  { address: "1000:254F", offset: 0x1254f, hex: "803e1c11017401c39a7ac90000c3" },
  { address: "1000:3D6D", offset: 0x13d6d, hex: "813e0f1f46597436813e0f1f464d742e813e0f1f43597426813e0f1f434d741e813e0f1f46417416833e0f1f59740f83" },
  { address: "1000:3DC5", offset: 0x13dc5, hex: "833e0f1f4d7437833e0f1f597430813e0f1f46597428813e0f1f464d7420813e0f1f43597418813e0f1f434d7410833e" },
  { address: "1000:40EE", offset: 0x140ee, hex: "813e0f1f46597417833e0f1f597410813e0f1f46417408833e0f1f417401c3a1a9018ec0c7061a1f5f07e8f7fca12400" },
  { address: "0000:7BFC", offset: 0x07bfc, hex: "e80100cb" },
];

const DATA_SIGNATURES = [
  { address: "DS:111C", offset: 0x1fcbc, hex: "01" },
  { address: "DS:84BB[0Ah]", offset: 0x2706f, hex: "ca85" },
  { address: "DS:85CA", offset: 0x2716a, hex: "acdda7daaabaa4f5b279c55daa6b2e24" },
  { address: "DS:84BB[0Fh]", offset: 0x27079, hex: "0c86" },
  { address: "DS:860C", offset: 0x271ac, hex: "a5cda952b3e62e24" },
  { address: "DS:84BB[0Ah..17h]", offset: 0x2706f, hex: "ca85da85ea85f88504860c8614861e86288632863c86428648864e86" },
  { address: "DS:85CA..8653", offset: 0x2716a, hex: "acdda7daaabaa4f5b279c55daa6b2e24acdda7daaabab970b971c55daa6b2e24acdda7daaabaa642c55daa6b2e24acdda7daaabaa5a8c0732e24a5cda952a5fe2e24a5cda952b3e62e24a8bebf6db4a3aa402e24a55cc0bbb4a3aa402e24a8bebf6dadb0a7432e24a55cc0bbadb0a7432e24a4a4ac722e24b854a9472e24b256b6c32e24af7da8b82e24" },
];

const EXPECTED_AI_TECHNIQUE_DIALOGUE_GROUPS = [
  { presentationGroup: 10, text: "看我的火球魔法." },
  { presentationGroup: 11, text: "看我的雷電魔法." },
  { presentationGroup: 12, text: "看我的冰魔法." },
  { presentationGroup: 13, text: "看我的巨龍." },
  { presentationGroup: 14, text: "生命全." },
  { presentationGroup: 15, text: "生命單." },
  { presentationGroup: 16, text: "防禦提昇." },
  { presentationGroup: 17, text: "功擊提昇." },
  { presentationGroup: 18, text: "防禦降低." },
  { presentationGroup: 19, text: "功擊降低." },
  { presentationGroup: 20, text: "中毒." },
  { presentationGroup: 21, text: "禁咒." },
  { presentationGroup: 22, text: "混亂." },
  { presentationGroup: 23, text: "破邪." },
];

const EXPECTED_CLASS_POOLS = {
  "4A": [["1F", "1H"], ["1F", "1H"], ["1F", "1H"]],
  "0D": [["1H", "1I"], ["1H", "1I"], ["1H", "1I"]],
  "1D": [["1F", "1I"], ["1F", "1I"], ["1F", "1I"]],
  "2D": [["1F", "1L", "1C"], ["1F", "1L", "1C"], ["1F", "1L", "1C"]],
  "0J": [["1H", "1I", "AD"], ["1H", "2I", "AD"], ["2H", "3I", "AD", "SM"]],
  "1J": [["1H", "1I", "AA"], ["2H", "1I", "AA"], ["3H", "2I", "AA", "FM"]],
  "0K": [["1F", "1I", "SD"], ["1F", "1L", "1I", "SD"], ["2F", "1L", "1I", "SD", "TR"]],
  "1K": [["1H", "SA", "LA"], ["1H", "SA", "LA", "IP"], ["1H", "SA", "LA", "IP", "SN"]],
  "0L": [["2F"], ["3F"], ["4F"]],
  "1L": [["2L"], ["3L"], ["4L"]],
  "2L": [["2C"], ["3C"], ["4C"]],
  "3E": [["1D"], ["2D"], ["3D"]],
  "0P": [["WD"], ["WD"], ["WD"]],
  "1P": [["WD"], ["WD"], ["WD"]],
};

const CLASS_DISPATCH = {
  ordinary: ["0A", "1A", "2A", "5A", "0B", "1B", "0C", "1C", "0E", "1E", "2E", "0F", "1F", "0G", "1G", "2G", "0H", "1H", "0N", "1N"],
  shooting: ["3A", "0I", "1I"],
  technique: ["4A", "0D", "1D", "2D", "0J", "1J", "0K", "1K", "0L", "1L", "2L", "3E"],
  empressOrDragonTechnique: ["0P", "1P"],
  stage37BossPart: ["2P", "3P"],
};

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function dataOffset(dsOffset, bytes, buffer) {
  const offset = DATA_LINEAR_BASE + dsOffset;
  if (offset < 0 || offset + bytes > buffer.length) {
    throw new Error(`DS:${hex(dsOffset)} is outside the runtime image`);
  }
  return offset;
}

function decodeCode(word) {
  return String.fromCharCode(word & 0xff, (word >>> 8) & 0xff);
}

function descriptorIndex(descriptors) {
  const byCode = new Map();
  for (const record of descriptors.records ?? []) {
    for (const code of record.codeVariants ?? []) {
      byCode.set(code, { record: record.record, name: record.normalizedName });
    }
  }
  return byCode;
}

function validateSignatures(buffer, signatures, kind) {
  return signatures.map((signature) => {
    const expected = Buffer.from(signature.hex, "hex");
    const actual = buffer.subarray(signature.offset, signature.offset + expected.length);
    if (!actual.equals(expected)) throw new Error(`${signature.address}: AI ${kind} signature mismatch`);
    return {
      address: signature.address,
      fileOffset: signature.offset,
      bytes: expected.length,
      sha256: sha256(expected),
    };
  });
}

function parseActionList(buffer, listOffset) {
  const actions = [];
  for (let cursor = listOffset, count = 0; count < 32; cursor += 2, count += 1) {
    const word = buffer.readUInt16LE(dataOffset(cursor, 2, buffer));
    if (word === SENTINEL) return actions;
    actions.push(decodeCode(word));
  }
  throw new Error(`AI action list DS:${hex(listOffset)} has no sentinel`);
}

function parseClassPools(buffer, descriptorsByCode) {
  const classes = [];
  let cursor = AI_CLASS_POOL_TABLE;
  for (let index = 0; index < 32; index += 1, cursor += 4) {
    const fileOffset = dataOffset(cursor, 4, buffer);
    const classWord = buffer.readUInt16LE(fileOffset);
    if (classWord === SENTINEL) break;
    const classCode = decodeCode(classWord);
    const tierPointerTable = buffer.readUInt16LE(fileOffset + 2);
    const tiers = Array.from({ length: 3 }, (_, tier) => {
      const listOffset = buffer.readUInt16LE(dataOffset(tierPointerTable + tier * 2, 2, buffer));
      return {
        tier: tier + 1,
        address: `${hex(DATA_SEGMENT)}:${hex(listOffset)}`,
        actions: parseActionList(buffer, listOffset),
      };
    });
    const expected = EXPECTED_CLASS_POOLS[classCode];
    if (expected === undefined || !tiers.every((tier, tierIndex) =>
      tier.actions.join(",") === expected[tierIndex].join(","))) {
      throw new Error(`${classCode}: native AI pool differs from the recovered expectation`);
    }
    classes.push({
      classCode,
      descriptor: descriptorsByCode.get(classCode) ?? null,
      tierPointerTable: `${hex(DATA_SEGMENT)}:${hex(tierPointerTable)}`,
      tiers,
    });
  }
  if (classes.length !== 14) throw new Error(`expected 14 AI pool classes, got ${classes.length}`);
  return classes;
}

function parseActionTable(buffer) {
  const selectorNames = new Map([
    [0x0a7b, "enemy"],
    [0x0a8e, "ally"],
  ]);
  const entries = [];
  let cursor = AI_ACTION_TABLE;
  for (let index = 0; index < 64; index += 1, cursor += 10) {
    const fileOffset = dataOffset(cursor, 10, buffer);
    const actionWord = buffer.readUInt16LE(fileOffset);
    if (actionWord === SENTINEL) break;
    const targetSelector = buffer.readUInt16LE(fileOffset + 6);
    entries.push({
      index,
      address: `${hex(DATA_SEGMENT)}:${hex(cursor)}`,
      actionCode: decodeCode(actionWord),
      actionWord,
      effectHandler: `0000:${hex(buffer.readUInt16LE(fileOffset + 2))}`,
      presentationGroup: buffer.readUInt16LE(fileOffset + 4),
      targetSelector: `1000:${hex(targetSelector)}`,
      targetGroup: selectorNames.get(targetSelector) ?? "unknown",
      selectionRadius: buffer.readUInt16LE(fileOffset + 8),
    });
  }
  if (entries.length !== 33) throw new Error(`expected 33 AI action entries, got ${entries.length}`);
  return entries;
}

function parseAiTechniqueDialogue(buffer, actionEntries) {
  const decoder = new TextDecoder("big5", { fatal: true });
  const groups = EXPECTED_AI_TECHNIQUE_DIALOGUE_GROUPS.map((expected) => {
    const pointerEntry = AI_CONTEXT_DIALOGUE_POINTER_TABLE + expected.presentationGroup * 2;
    const stringAddress = buffer.readUInt16LE(dataOffset(pointerEntry, 2, buffer));
    const stringFileOffset = dataOffset(stringAddress, 1, buffer);
    const terminator = buffer.indexOf(0x24, stringFileOffset);
    if (terminator < stringFileOffset) {
      throw new Error(`DS:${hex(stringAddress)}: AI dialogue has no dollar terminator`);
    }
    const text = decoder.decode(buffer.subarray(stringFileOffset, terminator));
    if (text !== expected.text) {
      throw new Error(
        `AI presentation group ${expected.presentationGroup}: expected ${expected.text}, got ${text}`,
      );
    }
    return {
      presentationGroup: expected.presentationGroup,
      selector: `${hex(expected.presentationGroup, 2)}h`,
      pointerEntry: `DS:${hex(pointerEntry)}`,
      address: `DS:${hex(stringAddress)}`,
      text,
    };
  });
  const groupsById = new Map(groups.map((group) => [group.presentationGroup, group]));
  const actionBindings = actionEntries.map((action) => {
    const group = groupsById.get(action.presentationGroup);
    if (!group) {
      throw new Error(
        `${action.actionCode}: missing AI dialogue group ${action.presentationGroup}`,
      );
    }
    return {
      actionCode: action.actionCode,
      actionTableAddress: action.address,
      presentationGroup: action.presentationGroup,
      selector: group.selector,
      address: group.address,
      text: group.text,
    };
  });
  if (new Set(actionBindings.map(({ actionCode }) => actionCode)).size !== actionEntries.length) {
    throw new Error("AI dialogue action bindings are not unique by action code");
  }
  return {
    pointerTable: `DS:${hex(AI_CONTEXT_DIALOGUE_POINTER_TABLE)}`,
    presentationGroupRange: [10, 23],
    groups,
    actionBindings,
    coverage: {
      actionRows: actionEntries.length,
      boundActionRows: actionBindings.length,
      distinctDialogueGroups: groups.length,
    },
  };
}

function attachDescriptors(codes, descriptorsByCode) {
  return codes.map((classCode) => ({
    classCode,
    descriptor: descriptorsByCode.get(classCode) ?? null,
  }));
}

function summarizeBehaviorTemplates(templates, templatePath) {
  if (!Array.isArray(templates?.stages)) {
    throw new Error(`${templatePath}: missing battle-template stages`);
  }
  const instances = templates.stages.flatMap((stage) =>
    (stage.activeUnitInstances ?? []).map((unit) => ({
      stage: stage.stage,
      stageKind: stage.stageKind,
      side: unit.side,
      unitSlot: unit.unitSlot,
      cell: unit.cell,
      behavior: unit.perSlotBehavior ?? unit.perSlotState,
      descriptorClass: unit.descriptorClass,
      className: unit.className,
      scenarioUnitFlag: unit.scenarioUnitFlag,
    })),
  );
  if (instances.some((unit) => !Number.isInteger(unit.behavior))) {
    throw new Error(`${templatePath}: one or more active units have no per-slot behavior`);
  }
  const byBehavior = new Map();
  for (const unit of instances) {
    if (!byBehavior.has(unit.behavior)) byBehavior.set(unit.behavior, []);
    byBehavior.get(unit.behavior).push(unit);
  }
  const expectedCounts = new Map([
    [0, 412], [1, 102], [2, 97], [3, 3], [4, 10], [5, 2], [6, 5],
    [7, 1], [8, 2], [11, 6], [12, 32],
  ]);
  const actualDomain = [...byBehavior.keys()].sort((a, b) => a - b);
  const expectedDomain = [...expectedCounts.keys()];
  if (actualDomain.join(",") !== expectedDomain.join(",")) {
    throw new Error(`${templatePath}: unexpected behavior domain ${actualDomain.join(",")}`);
  }
  for (const [behavior, count] of expectedCounts) {
    if (byBehavior.get(behavior).length !== count) {
      throw new Error(
        `${templatePath}: behavior ${behavior} count ${byBehavior.get(behavior).length}, expected ${count}`,
      );
    }
  }
  const distribution = actualDomain.map((behavior) => {
    const units = byBehavior.get(behavior);
    const sideCounts = [...new Set(units.map((unit) => unit.side))]
      .sort((a, b) => a - b)
      .map((side) => ({ side, count: units.filter((unit) => unit.side === side).length }));
    const classes = new Map();
    for (const unit of units) {
      const key = `${unit.descriptorClass ?? "null"}:${unit.className ?? "null"}`;
      classes.set(key, { record: unit.descriptorClass, name: unit.className });
    }
    return {
      behavior,
      count: units.length,
      sideCounts,
      stages: [...new Set(units.map((unit) => unit.stage))].sort((a, b) => a - b),
      classes: [...classes.values()].sort((a, b) =>
        (a.record ?? -1) - (b.record ?? -1) || String(a.name).localeCompare(String(b.name))),
    };
  });
  return {
    source: templatePath,
    fieldBinding: "B template per-slot behavior -> module 29 side-2 DS:5644 or side-1 DS:3BFD -> current scalar DS:3BF6 -> AI scalar DS:0D3F",
    activeInstances: instances.length,
    domain: actualDomain,
    absentStaticValues: [9, 10, 255],
    distribution,
    rareInstances: instances
      .filter((unit) => unit.behavior >= 3)
      .sort((a, b) => a.behavior - b.behavior || a.stage - b.stage || a.side - b.side || a.unitSlot - b.unitSlot),
    observations: [
      "behavior is assigned per unit slot by each battle template, not by DATA.SWF and not intrinsically by class",
      "3/4, 5/6 and 7/8 occur as leader/follower pairs in the templates; the encoded 9/10 pair is implemented but absent from all static templates",
      "behavior 11 appears only in six side-1 campaign-class placeholder slots in stage 2 and follows the ordinary default branch",
      "behavior 12 appears only in stages 0, 4, 9, 35 and alternate stage 39 and enters the fixed stage-route handler",
      "FFh is a runtime-only confusion override and therefore does not occur in static templates",
    ],
  };
}

function nativeRules(descriptorsByCode, behaviorTemplates, aiTechniqueDialogue) {
  return {
    phaseConfiguration: {
      side2: { side: 2, baseMovementMode: "Y", pursuitMode: "FY", entry: "1000:14D8" },
      side1Autonomous: { side: 1, baseMovementMode: "A", pursuitMode: "FA", entry: "1000:1519" },
      waterWarriorOverride: { classCode: "0N", mode: "0" },
      selectedTargetSideAreaModes: {
        side1: { mode: "CM", onePointMapDamageAffectsOnlySide: 1 },
        side2: { mode: "CY", onePointMapDamageAffectsOnlySide: 2 },
        evidence: ["1000:4264", "0000:644D"],
      },
      unboundMode: "1",
    },
    classDispatch: {
      ordinary: attachDescriptors(CLASS_DISPATCH.ordinary, descriptorsByCode),
      shooting: attachDescriptors(CLASS_DISPATCH.shooting, descriptorsByCode),
      technique: attachDescriptors(CLASS_DISPATCH.technique, descriptorsByCode),
      empressOrDragonTechnique: attachDescriptors(CLASS_DISPATCH.empressOrDragonTechnique, descriptorsByCode),
      stage37BossPart: attachDescriptors(CLASS_DISPATCH.stage37BossPart, descriptorsByCode),
      techniqueOverride: "for the 12 ordinary technique classes, DS:31B5 bit15 forces the ordinary-AI path",
      coverage: "the five groups partition all 39 native unit class codes",
    },
    loadedDecisionInputs: {
      currentDataRow: "DS:31BD is copied to DS:0D45 and selects AI technique tier 1..3 after subtracting one and clamping to index 2",
      movement: "DS:31C5 is copied to DS:0D47",
      perSlotBehavior: "DS:3BF6 is copied to DS:0D3F; this is distinct from DATA.SWF field5",
      loader: "1000:2300",
      battleTemplateValidation: behaviorTemplates,
    },
    confusionOverride: {
      stateOffset: "+0E",
      loadedScalar: "DS:31AD, addressed indirectly as SI=31A5h+8",
      trigger: "bit15 set",
      override: "replace the loaded per-slot behavior with FFh",
      ordinaryClasses: "run defensive retreat (highest terrain-defense reachable empty cell with no orthogonally adjacent enemy), then spend the action without attacking",
      shootingTechniqueAndEmpressDragonClasses: "scan nonzero movement-range cells in ascending order and select the first whose PIT bit0 is zero; move if it differs from the origin, then spend the action without shooting/casting",
      playerSelection: "0000:55D3 does not inspect +0E, so confusion does not directly block manual player selection",
      correction: "a previous direct scalar-reference audit missed this consumer because 31ADh is formed by register arithmetic",
      evidence: ["1000:2300", "1000:18A1", "1000:192C", "1000:19DD", "1000:1A68", "1000:1D67", "1000:212D"],
    },
    lowLifePolicy: {
      percentage: "floor(currentLife * 100 / maxLife)",
      below20: "rest and recover 15% max life",
      from20To39: "behavior 1 rests immediately; otherwise, when an adjacent enemy exists, try a defensive retreat and rest if it fails",
      from40: "continue the class action flow",
      fallback: "after failed attack/shot/technique attempts, 1000:2291 rests when currentLife < maxLife; a full-life unit continues to later fallbacks",
      evidence: ["1000:2233", "1000:2291", "1000:2468"],
    },
    targetSelection: {
      enemy: {
        selector: "1000:1EEB -> 1000:3FFD -> 1000:0B91",
        rule: "among reachable opposing units, minimize effective defense; break equal-defense ties by minimum current life",
      },
      ally: {
        selector: "1000:1EFE -> 1000:3FE6 -> 1000:0C1A",
        rule: "among reachable same-side units, maximize missing life; exact ties go to the later scanned cell",
      },
      iceCenter: "AI 1C/2C/3C/4C first requires a reachable enemy but executes with the acting unit's cell as the effect center",
      noCandidate: "the selected action attempt returns failure; its enclosing class flow may then move, rest, or try another fallback",
    },
    aiTechniquePresentation: {
      successfulActionPath: "1000:1E51",
      dialogueGate: {
        label: "ＡＩ對話",
        address: "DS:111C",
        releasedInitialValue: 1,
        callPath: "1000:1E6B -> 1000:254F -> 0000:C97A",
      },
      contextualDialogue: {
        portrait: "the current acting unit portrait",
        side1Window: "upper",
        side2Window: "lower A/18 contextual battle-dialogue window",
        completion: "automatic close and battlefield restore; no confirmation input",
      },
      ...aiTechniqueDialogue,
      viewport: {
        beforeEffect: "1000:1E6B calls 0000:7BFC -> 0000:7C00 to redraw the current viewport",
        effectTarget: "the selected target cell is copied to DS:5A09 immediately before the effect handler call",
        recenter: "the complete successful-action block does not call the target-focus primitive 1000:834A/834E; the native viewport is not recentered on the effect target",
      },
      evidence: ["1000:1E51", "1000:1E6B", "1000:254F", "0000:7BFC", "DS:111C", "DS:84BB[0Ah]", "DS:85CA", "DS:84BB[0Fh]", "DS:860C"],
    },
    shooting: {
      sharedRange: { mode: "2", minimumManhattanRange: 2 },
      targetRule: "minimum effective defense, then minimum current life",
      classes: [
        { classCode: "3A", descriptor: descriptorsByCode.get("3A") ?? null, maximumRange: 5, damage: "30..49 to target" },
        { classCode: "0I", descriptor: descriptorsByCode.get("0I") ?? null, maximumRange: 8, damage: "50..89 to target", differsFromPlayer: "player is 70..89" },
        { classCode: "1I", descriptor: descriptorsByCode.get("1I") ?? null, maximumRange: 6, damage: "roll 50..59; selected target receives 2*floor(roll/2)=50..58, while other eligible occupied line cells receive floor(roll/2)=25..29", differsFromPlayer: "player roll is 50..69, producing selected-target damage 50..68 and other-line-cell damage 25..34" },
      ],
      swiftDragonEvasion: {
        targetClassCode: "0E",
        descriptor: descriptorsByCode.get("0E") ?? null,
        rule: "for both player and AI shooting, PIT port bit0=1 bypasses life damage; the player reaches UN/60 common-shot impact, while AI reaches the UN/62 + E/38 ordinary-hit presentation",
        probabilityWording: "50% candidate from the sampled bit; exact empirical distribution depends on PIT timing",
        evidence: ["0000:722B", "1000:1F7B"],
        machinePresentationEvidence: "reverse/parsed/native/shooting-presentations.json",
      },
      boundedRandom: "1000:2016 returns an integer in 0..DX-1 by PIT-based rejection/accumulation",
    },
    movement: {
      defensiveRetreat: {
        entry: "1000:1D67",
        candidateRule: "reachable empty cell with no orthogonally adjacent enemy",
        score: "maximum terrain-defense percentage; exact ties go to the later scanned cell",
        failure: "returns failure when no candidate exists",
      },
      adjacentEnemyCounter: "1000:0C83 checks the four orthogonal neighbors",
      attackPositionSelection: {
        entry: "1000:070A/0748/078B/07A7/083A/0897",
        targetEligibility: "opposing unit whose finalized base-movement range-map cell is nonzero, meaning at least one orthogonal attack position is reachable",
        candidateOffsets: [50, -1, 1, -50],
        candidateEligibility: "range-map value is nonzero and the cell is empty, except the actor origin is allowed",
        score: "maximize the candidate cell's terrain-defense percentage; exact ties, including ties across enemies, are replaced by the later grid scan/candidate order",
        outputs: "DS:047A receives the move/attack-position cell and DS:047C the enemy target cell",
        deadInputs: "the selector loads target current life, attack, defense and target-terrain defense, but 1000:0897 never reads those saved values",
        execution: "1000:2081 moves to DS:047A when necessary and then attacks DS:047C; behavior 1 uses 1000:2044 and succeeds only when DS:047A already equals the actor origin",
      },
      shootingDistanceTwoPosition: {
        entry: "1000:0993/09BC/09E2 -> 1000:0897; movement wrapper 1000:1D0B",
        candidateOffsetsInNativeOrder: [49, 100, 51, -51, -100, -49, 2, -2],
        geometry: "the eight cells at exact Manhattan distance 2 from each opposing unit",
        score: "same maximum terrain-defense selector as ordinary attack positioning; exact ties go to the later scan/order candidate",
        executionQuirk: "1000:1D0B reports success only after moving to a different selected cell; if the selected best cell is already the origin, the shooting flow treats it as a failed reposition rather than firing from there",
      },
      longPursuit: {
        entry: "1000:20DB -> 1000:0AE1/0B09/0B64",
        probeMap: "build the current side's weighted base movement map with seed 200",
        rangePostprocess: "base Y/A maps reserve enemy-adjacent cells as FFh, finalize reachable attack positions as 2, and enemy cells as 1; 1000:0B09 replaces each value-2 cell with max(nonzero orthogonal neighbor - 1) when larger",
        enemyCandidate: "1000:0B64 checks only enemyCell + 50, requires its range value nonzero, and maximizes that byte; ties go to the later enemy",
        directionalQuirk: "the native selector does not test -50 or +/-1 around the enemy",
        execution: "rebuild the actual movement map with the unit's movement value, path toward the selected +50 goal, and execute one movement endpoint; no attack follows in that action",
      },
      behaviorTwoPursuit: {
        entry: "1000:2193",
        gate: "build mode A (hard-coded even for side 2) with seed max(movement, 8), then run the ordinary adjacent-attack-position selector",
        action: "only when the gate finds a candidate, build the phase pursuit mode FY/FA with seed 100, use the same +50-only pursuit selector and move; never attack in the same action",
        nativeQuirk: "side-2 behavior 2 therefore probes with side-1 occupancy semantics because mode A is written literally",
      },
      pairedLeaderFollowerBehaviors: {
        dispatcher: "1000:1BD9; exact same-side behavior lookup 1000:0D83/0D9C",
        pairs: [
          { leader: 3, follower: 4 },
          { leader: 5, follower: 6 },
          { leader: 7, follower: 8 },
          { leader: 9, follower: 10, staticTemplatePresence: "absent" },
        ],
        nearLeader: "if a same-side leader with behavior follower-1 is already present in the follower's normal movement map, do not spend the action here; continue to the class attack/shot/technique flow",
        farLeader: "otherwise build the phase FY/FA pursuit map with seed 55, locate the same-side leader, move toward it using the actual movement map, and consume the action",
        noLeader: "if the extended map finds no paired leader, continue to the class action flow",
      },
      stageRouteBehavior12: {
        entry: "1000:1AF8/1B56/1BBE",
        machineEvidence: "reverse/parsed/native/behavior12-effects.json",
        rule: "bypasses the ordinary attack/shot/technique decision and follows fixed stage-dependent goals using a mode-0 seed-50 probe, then the normal movement mode",
        stages: [
          { stage: 0, goalCell: 2375, movementOverride: 5 },
          {
            stage: 4,
            goalCell: 125,
            movementOverride: 3,
            movementGuard: "after path calculation, execute movement only when the resulting DI cell is below the original cell index",
            extra: {
              timing: "invoke 1000:6CF8 after every behavior-12 movement attempt, whether or not movement occurred",
              range: "mode 0, seed 3, centered on the actor's post-attempt cell; invert zero/nonzero, so only pre-inversion path-cost <= 2 is safe on ordinary terrain",
              target: "every side-map byte exactly 1 outside the safe region",
              resolution: "currentLife = floor(currentLife / 2); defense magic and all other combat stats are ignored; the common finalizer removes zero-life units",
              presentation: "MAGIC/26, tile codes 12/13, 11 waves x 2 draws x 2 native ticks = 44 ticks; no direct VOC request",
              passedButUnusedCx: 40,
            },
          },
          { stage: 9, movementOverride: 7, thresholds: [
            { actorCellAtLeast: 1316, goalCell: 1266 },
            { actorCellAtLeast: 1184, goalCell: 1134 },
            { actorCellAtLeast: 934, goalCell: 884 },
            {
              actorCellBelow: 934,
              effect: "write DS:2F83=999 without assigning a new DI goal; the preceding range-builder VGA copy normally leaves DI=3450, outside the board",
              nativeUndefinedBehavior: "the unbounded path builder accepts equal zero values in an adjacent unused grid and chooses directions from PIT residue; a terminating trace can fall back to a live reachable cell, play E/14, and move once after victory 999, while a trace over 100 entries overwrites adjacent code-segment data",
              evidenceBoundary: "the stale-DI and overflow mechanism are confirmed; the actual visible route/result remains PIT-, board-state-, and timing-dependent",
            },
          ] },
        ],
        otherStages: "the goal selector explicitly returns zero; behavior 12 still bypasses the class action and consumes the turn without attacking",
        reproductionPolicy: "later safe compatibility default: actorCell < 934 sets victory 999 and consumes the action without invoking the stale path; native memory-walk emulation belongs only in an optional diagnostic bug mode",
      },
      behaviorSummary: {
        zero: "ordinary default branch; can also follow DS:0D34/0D36 scripted goal when that runtime flag is Y",
        one: "stand-ground policy: low-life rest; ordinary melee attacks only if the globally selected best attack position is the current cell; shooting/technique may act from the current position; never performs pursuit movement",
        two: "short-gated pursuit described above after class action failure at full life",
        leadersThreeFiveSevenNine: "ordinary default combat/pursuit plus serving as the target of the following even behavior",
        followersFourSixEightTen: "leader-cohesion pre-step described above, then ordinary class flow if no movement was needed",
        eleven: "no dedicated comparison; follows the ordinary default branch",
        twelve: "fixed stage-route handler",
        confusionFF: "runtime-only movement/retreat behavior described by confusionOverride",
      },
      classFlowQuirks: {
        ordinary: "behavior 1 can attack only from the current globally preferred attack position; ordinary reposition through 1000:2081 may move and attack in the same action; long pursuit and behavior-2 pursuit only move",
        shooting: "behavior 1 stands and fires when it has a target; other ordinary shooting uses 1000:1D0B and fires only after a successful move to a different distance-2 position, while an origin-winning selector result is treated as failure; a follower cohesion move can still continue into the shooting attempt when the leader was already near",
        technique: "uses the same behavior 12/FF, low-life, paired-follower and full-life fallback vocabulary, but keeps its own technique-selection ordering rather than sharing the shooting wrapper",
        empressOrDragon: "uses the same behavior 12/FF, low-life and movement fallbacks around the WD action pool",
      },
      randomReachableCell: "1000:212D/216E for behavior FFh in shooting, technique and empress/dragon classes; scan ascending and accept the first nonzero range cell whose PIT bit0 is zero",
    },
  };
}

async function extract(runtimePath, descriptorPath, guideComparisonPath, battleTemplatePath, outputPath) {
  const [buffer, descriptors, guideComparison, battleTemplates] = await Promise.all([
    readFile(runtimePath),
    readFile(descriptorPath, "utf8").then(JSON.parse),
    readFile(guideComparisonPath, "utf8").then(JSON.parse),
    readFile(battleTemplatePath, "utf8").then(JSON.parse),
  ]);
  const descriptorsByCode = descriptorIndex(descriptors);
  const behaviorTemplates = summarizeBehaviorTemplates(battleTemplates, battleTemplatePath);
  const classPools = parseClassPools(buffer, descriptorsByCode);
  const actionEntries = parseActionTable(buffer);
  const aiTechniqueDialogue = parseAiTechniqueDialogue(buffer, actionEntries);
  const poolCodes = new Set(classPools.flatMap((entry) => entry.tiers.flatMap((tier) => tier.actions)));
  const dispatchCodes = new Set(actionEntries.map((entry) => entry.actionCode));
  const dormantVPoolCodes = ["1V", "2V", "3V"].filter((code) => poolCodes.has(code));
  if (dormantVPoolCodes.length !== 0) {
    throw new Error(`unexpected V action in AI class pools: ${dormantVPoolCodes.join(",")}`);
  }
  const orphanPoolCodes = [...poolCodes].filter((code) => !dispatchCodes.has(code)).sort();
  if (orphanPoolCodes.join(",") !== "FM,SM") {
    throw new Error(`expected native orphan AI pool codes FM,SM; got ${orphanPoolCodes.join(",")}`);
  }
  const allDispatchClasses = Object.values(CLASS_DISPATCH).flat();
  if (allDispatchClasses.length !== 39 || new Set(allDispatchClasses).size !== 39) {
    throw new Error("AI class dispatch groups do not partition 39 unique class codes");
  }

  const result = {
    format: "ANGEL2 module 29 AI class, target, shooting, movement and technique rules",
    evidenceLevel: "C unless a field explicitly says unresolved/inference",
    source: runtimePath,
    sourceBytes: buffer.length,
    sourceSha256: sha256(buffer),
    unitDescriptors: descriptorPath,
    externalGuideValidation: {
      source: guideComparisonPath,
      role: guideComparison.guide?.sourceRole ?? "untrusted_external_modification_guide",
      use: "the external guide proposes unit stats/names/promotions only; AI conclusions in this artifact come from native tables and code",
    },
    addressModel: { dataSegment: hex(DATA_SEGMENT), dataLinearBase: DATA_LINEAR_BASE, code1000FileBase: 0x10000 },
    battleTemplates: battleTemplatePath,
    rules: nativeRules(descriptorsByCode, behaviorTemplates, aiTechniqueDialogue),
    techniqueSelection: {
      classPoolTable: `${hex(DATA_SEGMENT)}:${hex(AI_CLASS_POOL_TABLE)}`,
      tierSelector: "current DATA row count at DS:0D45, minus one and clamped to tier index 0..2",
      selection: "read PIT channel 0 until its byte value is below the list length, then select that zero-based entry",
      classes: classPools,
    },
    actionTable: {
      address: `${hex(DATA_SEGMENT)}:${hex(AI_ACTION_TABLE)}`,
      recordFormat: "actionCode:u16, effectHandler:u16, presentationGroup:u16, targetSelector:u16, selectionRadius:u16; FFFFh sentinel",
      entries: actionEntries,
      vReachability: {
        rowsPresent: ["1V", "2V", "3V"],
        classPoolProducer: null,
        result: "the AI parameter rows are retained compatibility data; none of the 14 released AI class pools can select a V action",
      },
    },
    nativeDataAnomalies: [
      {
        actionCode: "SM",
        source: "0J/祈導師 tier-3 AI pool",
        issue: "absent from the 33-entry AI action table and absent as an instruction scalar; the player menu uses OJ for 祈禱",
        intendedMeaning: "OJ/祈禱 is a strong but unconfirmed correction hypothesis",
      },
      {
        actionCode: "FM",
        source: "1J/魔導師 tier-3 AI pool",
        issue: "valid player 防魔 code but absent from the 33-entry AI action table",
        intendedMeaning: "the desired AI target/range row is not encoded, so a faithful repair requires an explicit design choice",
      },
    ],
    anomalyRuntimeConsequence: {
      confirmed: "1000:1E19 returns N for a missing action, but 1000:1DA2 ignores that return and immediately calls 1000:1E51",
      stateHazard: "the executor can therefore consume zero-initialized or previously retained action handler/range/target fields instead of a freshly resolved row",
      reproductionPolicy: "preserve the raw data in the original-compatibility layer; expose any OJ/FM repair as a separate documented fix/mod option",
      orphanPoolCodes,
    },
    verifiedCodeSignatures: validateSignatures(buffer, CODE_SIGNATURES, "code"),
    verifiedDataSignatures: validateSignatures(buffer, DATA_SIGNATURES, "data"),
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`extracted ${classPools.length} AI class pools, ${actionEntries.length} action/dialogue rows, ${aiTechniqueDialogue.groups.length} dialogue groups, ${orphanPoolCodes.length} native anomalies, ${result.verifiedCodeSignatures.length} code signatures and ${result.verifiedDataSignatures.length} data signatures to ${outputPath}`);
}

function usage() {
  return "usage: angel2-ai-rules.mjs --extract RUNTIME.bin UNIT-DESCRIPTORS.json UNIT-GUIDE-COMPARISON.json BATTLE-TEMPLATES.json OUTPUT.json";
}

async function main() {
  const [mode, runtimePath, descriptorPath, guideComparisonPath, battleTemplatePath, outputPath] = process.argv.slice(2);
  if (mode !== "--extract" || outputPath === undefined) throw new Error(usage());
  await extract(runtimePath, descriptorPath, guideComparisonPath, battleTemplatePath, outputPath);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export {
  extract,
  parseActionTable,
  parseAiTechniqueDialogue,
  parseClassPools,
  summarizeBehaviorTemplates,
};
