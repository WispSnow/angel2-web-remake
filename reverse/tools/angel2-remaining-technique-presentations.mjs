#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DATA_LINEAR_BASE = 0x1eba0;

const CODE_SIGNATURES = [
  ["0000:0220", 4, "request-loaded-voc-entry-a", "8b6dd90ff475aa49aa931335b5539ed716ef748f4d3392af5b9c9ba17501f754"],
  ["0000:0224", 4, "request-loaded-voc-entry-b", "2bb7c58ceb1cc7383836b71b15403552628c8eacc52f0ac21240cdc2c0990384"],
  ["0000:628E", 24, "prepare-selected-target-area", "d2f7058c2c859965fedcb944e305b9935f28913d0eb5252853c3d57cc374e85a"],
  ["0000:63CF", 24, "finalize-effect-and-remove-dead", "890aa887e43c682522204464358d54a0ba01449e86ff6d6e18c45c821d85f913"],
  ["0000:64B7", 16, "draw-descriptor-and-wait", "3353721d4dc04b0e6453ae019538a25e348e00cb3266ed86e6ddabc115166f3e"],
  ["0000:D3B2", 24, "wait-native-ticks", "20deeed86b46a3cd2bba9568f8a6444f46eaf2d6ec3580610793da194af72e90"],
  ["0000:FD8E", 24, "load-resource-record", "ab51095d8e738209fe774abf664288f00c8339b6645d89624ba365e6e6ffa222"],
  ["1000:937A", 24, "load-graphic", "541745b8e83dac35cbc1161732525f52449d1d6b48b2bc354165b2b27af88abd"],

  ["0000:CD6D", 24, "stomp-dragon-wrapper", "d3c8c6a109ebb6b592b55cf08f49d7f9c48e5fbd57ccfb7c7b38ddb1d4e831bf"],
  ["0000:CD85", 24, "stomp-male-wrapper", "ea16ea7fc6556d946840041ed9f4fd0b0bbb13ad88012af45ed27bd70e01e7cb"],
  ["0000:CD9D", 24, "stomp-female-wrapper", "0b2f7c764b7b8b9528ca607fa6975775af4fd6109c0db6ea6134bf69513aadf0"],
  ["1000:11BC", 194, "stomp-common-loader-and-presentation", "32d9782b7a8d4eb1fab4d8c2ff71896a1344710abf408140b4bf74935314cb68"],
  ["1000:127E", 210, "stomp-side-resource-dispatch", "de56f068330663d80413430482557e444b2373ea0504119d258500a31659c998"],
  ["1000:137A", 144, "stomp-three-quake-cycles", "cbcf8a012412da7359490dbeb4ed3a61ee3d23a595640c8af7dfc5c2a89ba244"],
  ["1000:140A", 26, "stomp-linear-motion", "611c1f3208e160579aae7e76622da32813c25e211b742a15dc23c8f097d8d856"],
  ["1000:1424", 68, "stomp-two-frame-draw", "08511955b853752dc1eaac16078f3bea6739a9c0d207cf36f49f56e9270fcdf5"],
  ["1000:1468", 16, "stomp-page-toggle-loop", "bcf6bd048f6e23db917f511548f5b4387d5534064083a782f27469d3cccffbe6"],

  ["0000:CE1E", 41, "defense-up-wrapper", "d0a41e90180fbee2f10b7c7148764e44bc2c52ead28b8ff9046ac40574399d2e"],
  ["0000:CE47", 41, "attack-up-wrapper", "fb660aaf557f4a3e0cede16497cd15b706bb6ff11e0eff3bff7035718bd4571a"],
  ["0000:CE70", 41, "magic-defense-wrapper", "5eeebcb19cad4f78326345736e66177aa1a810658bdb8a9ce1ae5b7183ccfe88"],
  ["0000:CE99", 41, "defense-down-wrapper", "89eddd34e9ece2ef74e087d85c7b5fdfd10b6cc6fdf2f33ece73add6ca0310e1"],
  ["0000:CEC2", 41, "attack-down-wrapper", "d13e34dc6f8d7bbd266ba2a00d5b73a9afb91f0b14c84a7ca8585dc9ffc5cfdc"],
  ["0000:CEEB", 65, "confusion-wrapper-and-immunity", "e26492fe9347e24cd409a3d1f0f66629435e3a1bbe47a45b5360f536911d16e9"],
  ["0000:CF2C", 65, "poison-wrapper-and-immunity", "f37edd5e3ad94ba6c7a5de62fb45c0cd076d5fe4319d1142f8c5bd68a2b3cd36"],
  ["0000:CF6D", 41, "dispel-wrapper", "6787e6f8933c3a87c7a81a71a9db6e6373ac29100508870e215ef4718f0cd814"],
  ["0000:CF96", 49, "spell-seal-wrapper-and-immunity", "87196a48ea548c6ba3e4452ba7aabef18b3575da76cc74e43c9f344a05cbfe7e"],
  ["1000:74FE", 115, "defense-up-presentation", "5093b0b207d93aceb6e0e9957681114e90236a453436ab8712c8b313349aee72"],
  ["1000:7572", 124, "shared-attack-up-magic-defense-presentation", "bc5b36d6be2198469b50ff1bba3900034a8691e6b060d72a63e5ea0755ae0bed"],
  ["1000:75EE", 115, "defense-down-presentation", "e2c93e6fc02e64a414594c150655e1abadc32100190d0265c7100f38722d3e4f"],
  ["1000:7662", 115, "attack-down-presentation", "5581666f94d06b1f9cb87c4aa53f7a3a80fae4575aa945d912460ff04bedd200"],
  ["1000:76D6", 88, "confusion-presentation", "8d49f6d0e57db00ad4c304e148dc68997a478caf3b865547f39e4ff067b3de4e"],
  ["1000:772E", 260, "poison-two-phase-presentation", "42fbf150900542102f3d034b824acf0b30f40d89021fe36d4850e2fd594bd79b"],
  ["1000:7832", 88, "spell-seal-presentation", "df18ca62c8075ef57592dc1fd36d5cefea813500d82fc2c1e646170ea3d74a62"],
  ["1000:7AC0", 70, "dispel-presentation-entry", "93f7427dfc3841131907e19ea6adc684a2634183b2b02100de87da970ebbbbda"],
  ["1000:7B06", 96, "dispel-staggered-phase", "f27bafef2b33243393b389e2fc64cce21c0c0877bc60b7d2e966a9bb1b4f0bfd"],
  ["1000:7B66", 46, "dispel-final-phase", "c29aecb7078e164b98b0dbb555a50f20693d53924b5dea4c066ca6d68c385624"],

  ["0000:CAE1", 6, "prayer-wrapper", "3e8e01d5a83e1bb0cdcfcd65aa091ed17d924094c6cac9f232f8c7edfe8f3379"],
  ["1000:591C", 12, "prayer-entry", "7ebf11da7c65f24bdcc84de669079cb219bf1da93aa0ea5797d7cd419bfb4075"],
  ["1000:5928", 107, "prayer-board-scan", "bc359b9cf56bc0cd6aca6b67404878c6bf2fadec1cde44445f50511f0b8fb44d"],
  ["1000:5993", 23, "prayer-result-wait", "904f711f91c24472b686dda37319898c0d54fc2ca064aa1db6c9b2a729ac210b"],
  ["1000:59AA", 367, "prayer-procedural-presentation", "f1567c092aa8e179605d8a191249022db0d9cfa922e67cfef69095160df32ca0"],
  ["1000:5B19", 75, "prayer-heal-outcome", "700644c2b7529f909277d8733b803289f7c7344bdbaadac5d1de3c85024a02e1"],
  ["1000:5B64", 62, "prayer-experience-outcome", "f2a8b5abe4059430edb3434205b5432ac8822149e5a4fafa40293e1fb68bd394"],
  ["1000:5BA2", 34, "prayer-attack-up-outcome", "ec09d30f24c334183eb76e7f8e7c29343331cdcf20dc29dc6f27bc5a070dfffb"],
  ["1000:5BC4", 34, "prayer-defense-up-outcome", "f8af12113fd0b6b2559ee270833f0e3dda070525366a13552ba1e326f99f67a0"],
  ["1000:5BE6", 24, "prayer-pit-remainder", "ca0edf24512d7196d265ca05ffef5477153243455731e723c280e9d241232859"],

  ["0000:CAE7", 18, "iron-plate-wrapper", "755c3d1ce2ed83c39abd0b1c253137e4245815089c87ee2fe5d8f221b2052fb4"],
  ["0000:CAF9", 18, "obstacle-wrapper", "f7e5a1954f8ac077c814cb9af4821811e7f45d8fddf455ac031bad8434b64d13"],
  ["1000:7C92", 34, "iron-plate-terrain-write", "eb9ad2d93468a9d9c80dfbc97ba66e0c7a94f921d1f5d869000f383141ed33e1"],
  ["1000:7CB4", 34, "obstacle-terrain-write", "c1e338f12a62239b13449df25019620bf830deda78fb063ffaece43e439eec67"],
];

const DATA_SIGNATURES = [
  [0x0cf4, 0x0d34, "stomp-draw-descriptors", "2d63863dfe7f0dddbec365e0608844f2f207a7c4f4080f19973ff3f0a5b0fef1"],
  [0x1746, 0x17ca, "shared-buff-debuff-descriptors", "8337c8a53745b1ea26fe1ee5c500323e8b2829acda09e8bcc7f8ea5afb871a57"],
  [0x6028, 0x6086, "prayer-procedural-data-and-result-strings", "215a74ff3c122e675cd73ca9095ec2252eecb30ac4bd381c7cbeeca0f6baf0bd"],
  [0x6cea, 0x6e1a, "defense-up-and-defense-down-descriptors", "759c56c6604127de3a1b20572dc6ccd895f51d854d2df2e658707c0eabdfd7ce"],
  [0x6e1a, 0x6eee, "attack-down-and-confusion-descriptors", "ed955ceeffcc2c2da5ba7f67e03d7b1170a7a80060b16aee09f68e3f3dd35ae1"],
  [0x6eee, 0x7056, "poison-and-seal-descriptors", "aad5bbfe75812d49f07ef7a8ee6a379c14134a70f47ab373881f82069d26a114"],
  [0x71db, 0x723d, "dispel-dynamic-descriptor-and-tables", "b2e29e40db8aec4e93dd3eae9c99311a20a092504aae6be5000b8b29ff325187"],
];

const GRAPHIC_RECORDS = {
  MAGIC: [16, 17, 18, 33, 36, 44, 45, 46, 49, 50, 51, 52, 53, 54],
  UN: [57],
};

const EXPECTED_RENDERED_FRAMES = {
  "MAGIC/16": 40,
  "MAGIC/17": 48,
  "MAGIC/18": 32,
  "MAGIC/33": 24,
  "MAGIC/36": 45,
  "MAGIC/44": 48,
  "MAGIC/45": 40,
  "MAGIC/46": 22,
  "MAGIC/49": 2,
  "MAGIC/50": 2,
  "MAGIC/51": 2,
  "MAGIC/52": 2,
  "MAGIC/53": 2,
  "MAGIC/54": 2,
  "UN/57": 47,
};

const CONTACT_SHEETS = [
  "techniques-remaining/MAGIC-0016-attack-up-magic-defense.png",
  "techniques-remaining/MAGIC-0017-poison-rise.png",
  "techniques-remaining/MAGIC-0018-poison-cloud.png",
  "techniques-remaining/MAGIC-0033-defense-up.png",
  "techniques-remaining/MAGIC-0036-spell-seal.png",
  "techniques-remaining/MAGIC-0044-confusion.png",
  "techniques-remaining/MAGIC-0045-defense-down.png",
  "techniques-remaining/MAGIC-0046-attack-down.png",
  "techniques-remaining/MAGIC-0049-0054-stomp.png",
  "techniques-remaining/UN-0057-dispel.png",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function linearAddress(address) {
  const match = /^([0-9A-F]{4}):([0-9A-F]{4})$/i.exec(address);
  assert(match !== null, `invalid segmented address ${address}`);
  return Number.parseInt(match[1], 16) * 16 + Number.parseInt(match[2], 16);
}

function dsLinear(offset) {
  return DATA_LINEAR_BASE + offset;
}

function checkedSlice(buffer, start, end, label) {
  assert(start >= 0 && end >= start && end <= buffer.length,
    `${label}: ${start}..${end} outside ${buffer.length}-byte source`);
  return buffer.subarray(start, end);
}

function readWord(buffer, dsOffset) {
  return checkedSlice(buffer, dsLinear(dsOffset), dsLinear(dsOffset) + 2,
    `DS:${hex(dsOffset)}`).readUInt16LE(0);
}

function readSignedWord(buffer, dsOffset) {
  return checkedSlice(buffer, dsLinear(dsOffset), dsLinear(dsOffset) + 2,
    `DS:${hex(dsOffset)}`).readInt16LE(0);
}

function readPointers(buffer, dsOffset, count) {
  return Array.from({ length: count }, (_, index) => readWord(buffer, dsOffset + index * 2));
}

function terminatedPointers(buffer, dsOffset) {
  const pointers = [];
  for (let index = 0; index < 128; index += 1) {
    const pointer = readWord(buffer, dsOffset + index * 2);
    if (pointer === 0xffff) return pointers;
    pointers.push(pointer);
  }
  throw new Error(`DS:${hex(dsOffset)}: unterminated pointer table`);
}

function expectPointers(buffer, dsOffset, expected) {
  const pointers = terminatedPointers(buffer, dsOffset);
  assert(pointers.join(",") === expected.join(","),
    `DS:${hex(dsOffset)}: unexpected descriptor pointer sequence`);
  return pointers;
}

function decodeDescriptor(buffer, dsOffset) {
  const width = readWord(buffer, dsOffset + 4);
  const height = readWord(buffer, dsOffset + 6);
  assert(width > 0 && height > 0 && width * height <= 64,
    `DS:${hex(dsOffset)}: invalid descriptor dimensions ${width}x${height}`);
  const tileCodes = Array.from({ length: width * height }, (_, index) =>
    readWord(buffer, dsOffset + 8 + index * 2));
  return {
    address: `DS:${hex(dsOffset)}`,
    xOffset: readSignedWord(buffer, dsOffset),
    yOffset: readSignedWord(buffer, dsOffset + 2),
    width,
    height,
    tileCodes,
    low7BitFrameIndices: tileCodes.map((code) => code === 0 ? null : (code & 0x7f) - 1),
  };
}

function descriptorStage(buffer, resource, pointerTable, expectedPointers, waitPerDrawNativeTicks) {
  const pointers = expectPointers(buffer, pointerTable, expectedPointers);
  return {
    resource,
    pointerTable: `DS:${hex(pointerTable)}`,
    descriptorSequence: pointers.map((pointer) => decodeDescriptor(buffer, pointer)),
    drawCount: pointers.length,
    waitPerDrawNativeTicks,
    fixedGraphicWaitNativeTicks: pointers.length * waitPerDrawNativeTicks,
  };
}

function validateCodeSignatures(buffer) {
  return CODE_SIGNATURES.map(([address, bytes, role, expectedSha256]) => {
    const start = linearAddress(address);
    const payload = checkedSlice(buffer, start, start + bytes, address);
    assert(sha256(payload) === expectedSha256, `${address}: ${role} signature mismatch`);
    return { address, role, bytes, sha256: expectedSha256 };
  });
}

function validateDataSignatures(buffer) {
  return DATA_SIGNATURES.map(([start, end, role, expectedSha256]) => {
    const payload = checkedSlice(buffer, dsLinear(start), dsLinear(end), role);
    assert(sha256(payload) === expectedSha256, `DS:${hex(start)}: ${role} signature mismatch`);
    return {
      address: `DS:${hex(start)}`,
      endExclusive: `DS:${hex(end)}`,
      role,
      bytes: end - start,
      sha256: expectedSha256,
    };
  });
}

async function graphicCatalog(extractedRoot, decodedRoot, planarRoot) {
  const result = [];
  for (const [group, records] of Object.entries(GRAPHIC_RECORDS)) {
    const [extracted, decoded, planar] = await Promise.all([
      readFile(path.join(extractedRoot, group, "manifest.json"), "utf8").then(JSON.parse),
      readFile(path.join(decodedRoot, group, "manifest.json"), "utf8").then(JSON.parse),
      readFile(path.join(planarRoot, group, "manifest.json"), "utf8").then(JSON.parse),
    ]);
    for (const record of records) {
      const source = extracted.records.find((entry) => entry.index === record);
      const decodedEntry = decoded.entries.find((entry) => entry.record === record);
      const rendered = planar.entries.find((entry) => entry.record === record);
      assert(source !== undefined && !source.missing && !source.terminator,
        `${group}/${record}: source record is unavailable`);
      assert(decodedEntry !== undefined, `${group}/${record}: decoded entry is unavailable`);
      assert(rendered !== undefined && rendered.rendered,
        `${group}/${record}: rendered entry is unavailable`);
      const sourcePath = path.join(extractedRoot, group, `${String(record).padStart(4, "0")}.bin`);
      const payload = await readFile(sourcePath);
      const entry = {
        key: `${group}/${record}`,
        group,
        record,
        sourcePath,
        sourceBytes: payload.length,
        sourceSha256: sha256(payload),
        decodedKind: decodedEntry.kind,
        decodedStreams: decodedEntry.streams.filter((stream) => stream.present).length,
        renderedFrames: rendered.images.length,
        renderedPaths: rendered.images.map((image) => path.join(planarRoot, group, image.output)),
      };
      assert(entry.renderedFrames === EXPECTED_RENDERED_FRAMES[entry.key],
        `${entry.key}: expected ${EXPECTED_RENDERED_FRAMES[entry.key]} rendered frames, got ${entry.renderedFrames}`);
      result.push(entry);
    }
  }
  return result;
}

function audioCatalog(audioManifest, audioManifestPath, extractedRoot) {
  const references = [
    ["E", 8, "defense-down and attack-down"],
    ["E", 58, "poison second phase"],
    ["MAGIC", 82, "all three stomp variants"],
    ["UN", 51, "shared attack-up and magic-defense presentation"],
    ["UN", 52, "defense-up presentation"],
  ];
  return references.map(([group, record, role]) => {
    const entry = audioManifest.entries.find((candidate) =>
      candidate.group === group && candidate.record === record);
    assert(entry !== undefined, `${group}/${record}: converted audio entry is unavailable`);
    return {
      key: `${group}/${record}`,
      group,
      record,
      role,
      sourcePath: path.join(extractedRoot, entry.source),
      sourceBytes: entry.sourceBytes,
      sourceSha256: entry.sourceSha256,
      outputPath: path.join(path.dirname(audioManifestPath), entry.output),
      codec: entry.codec,
      sampleRate: entry.sampleRate,
      channels: entry.channels,
      durationSeconds: entry.durationSeconds,
    };
  });
}

async function contactSheetCatalog(planarRoot) {
  const root = path.join(path.dirname(planarRoot), "contact-sheets");
  return Promise.all(CONTACT_SHEETS.map(async (relativePath) => {
    const sheetPath = path.join(root, relativePath);
    const payload = await readFile(sheetPath);
    return { path: sheetPath, bytes: payload.length, sha256: sha256(payload) };
  }));
}

function simulateDispel(buffer) {
  const firstTable = readPointers(buffer, 0x71f7, 14);
  const secondTable = readPointers(buffer, 0x7213, 13);
  const finalTable = readPointers(buffer, 0x722d, 8);
  assert(firstTable.join(",") === [...Array.from({ length: 13 }, (_, index) => index + 1), 0xff].join(","),
    "unexpected first dispel table");
  assert(secondTable.join(",") === [1, 2, 3, 14, 15, 16, 17, 18, 19, 20, 21, 22, 0xff].join(","),
    "unexpected second dispel table");
  assert(finalTable.join(",") === [1, 2, 3, 23, 23, 23, 23, 0xff].join(","),
    "unexpected final dispel table");

  const counters = [0, 0, 0, 0, 0];
  const tiles = [0, 0, 0, 0, 0];
  const tables = [firstTable, secondTable, firstTable, secondTable, finalTable];
  const draws = [];
  let complete = false;
  while (!complete) {
    draws.push([...tiles]);
    const update = (slot, terminalBehavior) => {
      const value = tables[slot][counters[slot]];
      if (value === 0xff) {
        terminalBehavior();
      } else {
        tiles[slot] = value;
        counters[slot] += 1;
      }
    };
    update(0, () => { tiles[0] = 0; });
    if (counters[0] > 4) update(1, () => { tiles[1] = 0; });
    if (counters[0] > 8) update(2, () => { tiles[2] = 0; });
    if (counters[0] > 12) update(3, () => { tiles[3] = 0; });
    if (counters[3] > 4) update(4, () => { complete = true; });
    assert(draws.length <= 64, "dispel phase did not terminate");
  }
  assert(draws.length === 24, `expected 24 dispel stagger draws, got ${draws.length}`);
  assert(tiles.join(",") === [0, 0, 0, 22, 23].join(","),
    "unexpected dispel stagger terminal state");

  tiles[4] = 23;
  const finalDraws = [];
  for (let index = 0; index < 25; index += 1) {
    finalDraws.push([...tiles]);
    tiles[4] += 1;
  }
  tiles[4] = 0;
  finalDraws.push([...tiles]);
  assert(finalDraws.length === 26 && finalDraws[24][4] === 47 && finalDraws[25][4] === 0,
    "unexpected dispel final draw sequence");

  return {
    resource: "UN/57",
    descriptor: decodeDescriptor(buffer, 0x71db),
    phase1: {
      drawCount: draws.length,
      runtimeTileCodeStates: draws,
      waitPerDrawNativeTicks: 5,
      fixedGraphicWaitNativeTicks: 120,
      behavior: "five 1x1 streams enter at stagger thresholds; the first four clear on their table terminator",
    },
    phase2: {
      drawCount: finalDraws.length,
      runtimeTileCodeStates: finalDraws,
      waitPerDrawNativeTicks: 5,
      fixedGraphicWaitNativeTicks: 130,
      behavior: "tile 22 remains in the fourth row while the fifth row advances 23..47, followed by one clear draw",
    },
    fixedGraphicWaitNativeTicks: 250,
  };
}

function buildStomp() {
  const risingPositions = Array.from({ length: 6 }, (_, index) => 25 + index * 30);
  const quakeCycle = [145, 125, 110, 125, 145, 175];
  const fallingPositions = Array.from({ length: 9 }, (_, index) => 175 - index * 20);
  const actions = [
    { code: "1D", visibleName: "龍踏", variant: 0, horizontalDrawCoordinate: 0x0152,
      graphicByTargetSide: { side1: "MAGIC/50", side2: "MAGIC/49" } },
    { code: "2D", visibleName: "男踏", variant: 1, horizontalDrawCoordinate: 0x0170,
      graphicByTargetSide: { side1: "MAGIC/52", side2: "MAGIC/51" } },
    { code: "3D", visibleName: "女踏", variant: 2, horizontalDrawCoordinate: 0x0170,
      graphicByTargetSide: { side1: "MAGIC/54", side2: "MAGIC/53" } },
  ];
  return {
    family: "D",
    commonEntry: "1000:11BC",
    wrapperEntries: { "1D": "0000:CD6D", "2D": "0000:CD85", "3D": "0000:CD9D" },
    audioResource: "MAGIC/82",
    audioRequestEntry: "0000:0220",
    presentation: {
      drawPrimitive: "1000:1424 draws both loaded frames at the current procedural coordinates",
      rising: { positions: risingPositions, graphicDraws: 6, timedSteps: 5, waitPerTimedStepNativeTicks: 1 },
      preQuakePageToggles: 10,
      quake: { cyclePositions: quakeCycle, cycles: 3, graphicDraws: 18, explicitWaitNativeTicks: 0 },
      postQuakePageToggles: 2,
      falling: { positions: fallingPositions, graphicDraws: 9, timedSteps: 8, waitPerTimedStepNativeTicks: 1 },
      graphicDrawCount: 33,
      fixedGraphicWaitNativeTicks: 13,
      audioRequests: [
        { afterGraphicDraw: 6, afterFixedWaitNativeTicks: 5, role: "after rising phase" },
        { afterGraphicDraw: 12, afterFixedWaitNativeTicks: 5, role: "after quake cycle 1" },
        { afterGraphicDraw: 18, afterFixedWaitNativeTicks: 5, role: "after quake cycle 2" },
        { afterGraphicDraw: 24, afterFixedWaitNativeTicks: 5, role: "after quake cycle 3" },
      ],
      restoreBeforeSettlement: ["DS:0CF4", "DS:0D04", "DS:0D14"],
    },
    actions,
    normalPlayerResources: { "1D": "MAGIC/49", "2D": "MAGIC/51", "3D": "MAGIC/53" },
    settlementBoundary: "all 33 procedural two-frame draws, four MAGIC/82 requests, page toggles, 13 explicit native ticks and three restore descriptors finish before the relocated 173B:0006 damage consumer scans units; 0000:63CF removes zero-life units afterward",
  };
}

function buildStatuses(buffer) {
  const defenseUp = descriptorStage(buffer, "MAGIC/33", 0x6cea,
    [0x6d02, 0x6d12, 0x6d22, 0x6d32, 0x6d42, 0x6d52, 0x6d42, 0x6d32, 0x6d22, 0x6d12, 0x6d02], 15);
  const defenseDown = descriptorStage(buffer, "MAGIC/45", 0x6d64,
    [0x6d7a, 0x6d8a, 0x6d9a, 0x6daa, 0x6dba, 0x6dca, 0x6dda, 0x6dea, 0x6dfa, 0x6e0a], 15);
  const attackDown = descriptorStage(buffer, "MAGIC/46", 0x6e1a,
    [0x1746, 0x1752, 0x175e, 0x176a, 0x1776, 0x1782, 0x178e, 0x179a, 0x17a6, 0x17b2, 0x17be], 15);
  const confusion = descriptorStage(buffer, "MAGIC/44", 0x6e34,
    [0x6e4c, 0x6e60, 0x6e74, 0x6e88, 0x6e9c, 0x6eb0, 0x6ec4, 0x6ed8, 0x6eb0, 0x6ec4, 0x6ed8], 15);
  const poisonCloud = descriptorStage(buffer, "MAGIC/18", 0x6efe,
    [0x6f20, 0x6f30, 0x6f40, 0x6f50, 0x6f60, 0x6f70, 0x6f80, 0x6f90,
      0x6f80, 0x6f70, 0x6f80, 0x6f90, 0x6f80, 0x6f70, 0x6f80, 0x6f90], 10);
  const spellSeal = descriptorStage(buffer, "MAGIC/36", 0x6fa2,
    [0x6fb6, 0x6fca, 0x6fde, 0x6ff2, 0x7006, 0x7006, 0x701a, 0x702e, 0x7042], 25);

  const sharedPositive = {
    resource: "MAGIC/16",
    descriptor: decodeDescriptor(buffer, 0x1746),
    runtimeTileCodePairs: Array.from({ length: 20 }, (_, index) => [index + 1, index + 21]),
    drawCount: 20,
    waitPerDrawNativeTicks: 15,
    fixedGraphicWaitNativeTicks: 300,
  };
  const poisonRise = {
    resource: "MAGIC/17",
    descriptor: decodeDescriptor(buffer, 0x6eee),
    runtimeTileCodeStates: [
      ...Array.from({ length: 12 }, (_, index) =>
        Array.from({ length: 4 }, (_, tile) => index * 4 + tile + 1)),
      [1, 2, 3, 4],
    ],
    drawCount: 13,
    waitPerDrawNativeTicks: 10,
    fixedGraphicWaitNativeTicks: 130,
  };
  const dispel = simulateDispel(buffer);

  const actions = [
    { code: "AD", visibleName: "防禦提升", wrapper: "0000:CE1E", presentationEntry: "1000:74FE",
      phases: [defenseUp], audioRequests: [{ resource: "UN/52", entry: "0000:0224", afterFixedWaitNativeTicks: 0 }],
      fixedGraphicWaitNativeTicks: 165, mutation: "unit+0A = 8003h" },
    { code: "AA", visibleName: "攻擊提升", wrapper: "0000:CE47", presentationEntry: "1000:7572",
      phases: [sharedPositive], audioRequests: [{ resource: "UN/51", entry: "0000:0224", afterFixedWaitNativeTicks: 0 }],
      fixedGraphicWaitNativeTicks: 300, mutation: "unit+08 = 8003h" },
    { code: "FM", visibleName: "防魔", wrapper: "0000:CE70", presentationEntry: "1000:7572",
      phases: [sharedPositive], audioRequests: [{ resource: "UN/51", entry: "0000:0224", afterFixedWaitNativeTicks: 0 }],
      fixedGraphicWaitNativeTicks: 300, mutation: "unit+0C = 8001h",
      originalQuirk: "AA and FM intentionally call the exact same graphic and audio presentation" },
    { code: "SD", visibleName: "防禦下降", wrapper: "0000:CE99", presentationEntry: "1000:75EE",
      phases: [defenseDown], audioRequests: [{ resource: "E/8", entry: "0000:0224", afterFixedWaitNativeTicks: 0 }],
      fixedGraphicWaitNativeTicks: 150, mutation: "unit+12 = 8003h" },
    { code: "SA", visibleName: "攻擊下降", wrapper: "0000:CEC2", presentationEntry: "1000:7662",
      phases: [attackDown], audioRequests: [{ resource: "E/8", entry: "0000:0224", afterFixedWaitNativeTicks: 0 }],
      fixedGraphicWaitNativeTicks: 165, mutation: "unit+10 = 8003h" },
    { code: "LA", visibleName: "混亂", wrapper: "0000:CEEB", presentationEntry: "1000:76D6",
      phases: [confusion], audioRequests: [], fixedGraphicWaitNativeTicks: 165,
      mutation: "unit+0E = 8003h unless class is 1P/2P/3P", immuneClasses: ["1P", "2P", "3P"] },
    { code: "IP", visibleName: "施毒", wrapper: "0000:CF2C", presentationEntry: "1000:772E",
      phases: [poisonRise, poisonCloud],
      audioRequests: [{ resource: "E/58", entry: "0000:0220", afterFixedWaitNativeTicks: 130 }],
      fixedGraphicWaitNativeTicks: 290,
      mutation: "unit+14 = 8003h unless class is 1P/2P/3P", immuneClasses: ["1P", "2P", "3P"] },
    { code: "TR", visibleName: "破邪", wrapper: "0000:CF6D", presentationEntry: "1000:7AC0",
      phases: [dispel.phase1, dispel.phase2], audioRequests: [], fixedGraphicWaitNativeTicks: 250,
      dynamicPresentation: dispel,
      mutation: "clear bit15 at unit+12/+10/+0E, then write 7FFFh to unit+14/+16" },
    { code: "SN", visibleName: "禁咒", wrapper: "0000:CF96", presentationEntry: "1000:7832",
      phases: [spellSeal], audioRequests: [], fixedGraphicWaitNativeTicks: 225,
      mutation: "unit+16 = 8003h unless class is 1P", immuneClasses: ["1P"] },
  ];

  assert(actions.map((entry) => entry.fixedGraphicWaitNativeTicks).join(",") ===
    "165,300,300,150,165,165,290,250,225", "unexpected status fixed waits");
  return {
    family: "status",
    actions,
    settlementBoundary: "every wrapper calls its complete presentation first; only after finalization returns does it reload the selected target, perform any boss-immunity test, write or clear status words, and then calculate casting experience",
    immunityPresentationRule: "LA/IP/SN immunity is tested after the full graphic presentation, so immune bosses still show the complete effect before the status write is skipped",
  };
}

function readDollarString(buffer, dsOffset) {
  const start = dsLinear(dsOffset);
  let end = start;
  while (end < buffer.length && buffer[end] !== 0x24) end += 1;
  assert(end < buffer.length, `DS:${hex(dsOffset)}: unterminated dollar string`);
  return new TextDecoder("big5").decode(buffer.subarray(start, end));
}

function buildPrayer(buffer) {
  const strings = {
    heal: readDollarString(buffer, 0x604e),
    experience: readDollarString(buffer, 0x6061),
    attackUp: readDollarString(buffer, 0x6074),
    defenseUp: readDollarString(buffer, 0x607d),
  };
  assert(JSON.stringify(strings) === JSON.stringify({
    heal: "生 命 加|00000 點.",
    experience: "經 驗 加|00000 點.",
    attackUp: "攻擊增加",
    defenseUp: "防禦增加",
  }), "unexpected prayer result strings");
  return {
    family: "OJ",
    visibleName: "祈禱",
    wrapper: "0000:CAE1",
    entry: "1000:591C",
    scan: {
      cells: 2500,
      eligibility: "occupied and side is not 2",
      perUnitGate: "read PIT channel-0 low byte and continue only when bit0 is 1 (approximately one half)",
      order: "linear cell index 0..2499",
    },
    resourceLoads: { graphicArchiveRecords: [], audioArchiveRecords: [] },
    presentation: {
      type: "procedural screen drawing",
      entry: "1000:59AA",
      description: "toggle the active page, draw a 16-step two-column field plus fixed decorations with low-level screen primitives, then show one result string",
      resultStrings: strings,
      fixedArchiveFrameSequence: false,
      resultHold: {
        entry: "1000:5993",
        iterations: 30,
        waitPerIterationNativeTicks: 2,
        maximumNativeTicksPerTriggeredUnit: 60,
        skippable: "the loop exits early when DS:F590 equals 1",
      },
    },
    outcomes: [
      { roll: 0, visibleText: strings.heal, effect: "restore 5..14 life, capped at maximum life" },
      { roll: 1, visibleText: strings.experience, effect: "add 5..14 experience" },
      { roll: 2, visibleText: strings.attackUp, effect: "write attack-up status 8003h" },
      { roll: 3, visibleText: strings.defenseUp, effect: "write defense-up status 8003h" },
    ],
    synchronizationRule: "each passing allied unit is resolved independently: procedural field first, then outcome/amount roll, result text draw, outcome mutation, page switch and an input-skippable hold of at most 60 native ticks; there is no single global presentation followed by global settlement",
  };
}

function buildEngineering() {
  return {
    family: "K",
    visibleName: "工兵構造",
    actions: [
      { code: "1K", visibleName: "鐵板", wrapper: "0000:CAE7", writer: "1000:7C92",
        sourceToken: "copied at battle load from original map cell (16,25), linear index 1266" },
      { code: "2K", visibleName: "障礙", wrapper: "0000:CAF9", writer: "1000:7CB4",
        sourceToken: "copied at battle load from original map cell (16,26), linear index 1316" },
    ],
    write: {
      target: "selected linear terrain index",
      byteCount: 5,
      offsets: [0, 1, 2, 3, 4],
      values: ["sourceToken", "sourceToken+1", "sourceToken+2", "sourceToken+3", "sourceToken+4"],
    },
    resourceLoads: { graphicArchiveRecords: [], audioArchiveRecords: [] },
    synchronizationRule: "the action wrapper calls the five-byte terrain writer directly; there is no dedicated effect graphic, VOC request, descriptor wait or delayed settlement. The changed terrain becomes visible through the normal board redraw after the action returns",
  };
}

function buildPresentations(buffer) {
  return {
    stomp: buildStomp(),
    statuses: buildStatuses(buffer),
    prayer: buildPrayer(buffer),
    engineering: buildEngineering(),
  };
}

async function extract(modulePath, audioManifestPath, extractedRoot, decodedRoot, planarRoot, outputPath) {
  const [moduleBuffer, audioBuffer, graphics, contactSheets] = await Promise.all([
    readFile(modulePath),
    readFile(audioManifestPath),
    graphicCatalog(extractedRoot, decodedRoot, planarRoot),
    contactSheetCatalog(planarRoot),
  ]);
  const audioManifest = JSON.parse(audioBuffer.toString("utf8"));
  const presentations = buildPresentations(moduleBuffer);
  const result = {
    format: "ANGEL2 remaining technique presentation rules",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    source: {
      path: modulePath,
      bytes: moduleBuffer.length,
      sha256: sha256(moduleBuffer),
      dataLinearBase: DATA_LINEAR_BASE,
      audioManifest: { path: audioManifestPath, bytes: audioBuffer.length, sha256: sha256(audioBuffer) },
    },
    verifiedCodeSignatures: validateCodeSignatures(moduleBuffer),
    verifiedDataSignatures: validateDataSignatures(moduleBuffer),
    renderMode: {
      fullScreenOrdinaryCombatDispatchUsed: false,
      rule: "stomp and status effects use board/procedural effect paths; prayer uses its own procedural screen composition; engineering has no dedicated presentation path",
    },
    presentations,
    resourceCatalog: {
      graphicEntries: graphics,
      audioEntries: audioCatalog(audioManifest, audioManifestPath, extractedRoot),
      contactSheets,
    },
    closure: {
      actionCodes: ["1D", "2D", "3D", "AD", "AA", "FM", "SD", "SA", "LA", "IP", "TR", "SN", "OJ", "1K", "2K"],
      actionCount: 15,
      graphicRecordCount: graphics.length,
      audioRecordCount: 5,
      codeSignatureCount: CODE_SIGNATURES.length,
      dataSignatureCount: DATA_SIGNATURES.length,
      conclusion: "the remaining player-accessible technique presentations are closed at the resource, ordering and rule-synchronization level",
    },
    evidenceBoundary: {
      confirmed: "three stomp variants, nine status/dispel actions, prayer and two engineering writes; archive resources, descriptor/runtime frame order, sound request points, explicit native waits and presentation-to-rule mutation boundaries",
      preservedUnknown: "exact original names of low-level drawing primitives and PIT sampling distributions beyond proven gates/value ranges; the released nominal native tick is 10.000151 ms",
      implementation: "frozen until phase-1 GDD review passes",
    },
  };
  assert(result.closure.actionCodes.length === result.closure.actionCount, "unexpected closure action count");
  assert(result.closure.graphicRecordCount === 15, "unexpected graphic resource count");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `extracted remaining technique presentations: ${CODE_SIGNATURES.length} code signatures, ` +
    `${DATA_SIGNATURES.length} data signatures, 15 actions, 15 graphics and 5 audio records`,
  );
  return result;
}

function usage() {
  return "usage: angel2-remaining-technique-presentations.mjs --extract MODULE29 AUDIO_MANIFEST " +
    "EXTRACTED_ROOT DECODED_ROOT PLANAR_ROOT OUTPUT_JSON";
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "--extract" || args.length !== 6) throw new Error(usage());
  await extract(...args);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { buildPresentations, extract };
