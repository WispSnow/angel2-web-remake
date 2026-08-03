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
  ["0000:6425", 8, "clear-map-effect-buffer", "fecebe51f288c94e665ae6da94cc21f7daaf65545f2aa568e1e246b607685ec0"],
  ["0000:642B", 13, "draw-map-effect-without-wait", "9994e0b48d0d4300b50bf583df7d89eb5e8a4d1cb4a91da843f9fd5924d2a1ee"],
  ["0000:63CF", 24, "finalize-effect-and-remove-dead", "890aa887e43c682522204464358d54a0ba01449e86ff6d6e18c45c821d85f913"],
  ["0000:64A1", 11, "flush-map-effect-and-wait", "56e78310c68116c64a537e2d75a9df2c7439be5366dbea11c82f9d325d2c91ed"],
  ["0000:64B7", 16, "draw-descriptor-and-wait", "3353721d4dc04b0e6453ae019538a25e348e00cb3266ed86e6ddabc115166f3e"],
  ["0000:64D6", 16, "apply-one-fire-damage-point", "442f4f824d85a18c947418efc6fcb337dd47362b26ed438b0a875ae0e6a1586d"],
  ["1000:5DB2", 24, "lightning-1-presentation", "63b88a19e3000b598262878e5c2b9dc4481b793a25fb0baed3213a50bdab82e3"],
  ["1000:5E80", 24, "lightning-2-presentation", "a43a28c9f95ef73e171ee76e043a197ec4e4cab99cdeb1f442624a3e7df6e32f"],
  ["1000:5F62", 96, "lightning-3-presentation-and-rising-anchor", "dfb649ff61ae484ed349da75f9d3df20d0a6abf600de8f5e28dea60938d59150"],
  ["1000:6084", 24, "lightning-4-presentation", "1ef18e9f92958456029199ece7bf9af77f31e137c126c2c7b9facc0a77b0d185"],
  ["1000:6C14", 24, "lightning-1-hit-loader", "cee44c02aeea90d1bfe0cae0555a43b241c855a9cc515838b3a5ee2e2172d665"],
  ["1000:6C4D", 24, "lightning-2-hit-loader", "6657e0fd56e75d77ec3ab16971cad60397297a699f63f3bf732d1cddf29d9a35"],
  ["1000:6C86", 24, "lightning-3-hit-loader", "671c308452a1156684c96cbd132dafc92f3e9b99c54030c5fb4c04ebeb48bece"],
  ["1000:6CBF", 24, "lightning-4-hit-loader", "a8eccecbe3477ac510ac5449c894503ee38194196178fedd22bc73ff83e0ebb8"],
  ["1000:6D39", 7, "lightning-common-hit-presentation", "a828e38a62455bb958f52833d98ab84d4b886310d955862e250232c7de179f33"],
  ["1000:6D4C", 24, "lightning-range-wave", "90a81a85bf8588b7da4b6c565ae57faede5bc9798c20939ca076fd3f594ec0ca"],
  ["1000:6D94", 24, "lightning-cleanup-loader", "21270ea98a5aadc0816ca7346ed21e75bc6556c4fceaf010aa36e10103340e72"],
  ["1000:6DBC", 24, "lightning-cleanup-five-stages", "15c8325b3df4405718e7f4e04da1c1b6b4c570ce31141692195ac98e8c6c9431"],
  ["1000:6DE8", 24, "draw-lightning-cleanup-on-enemy-cells", "ba5c0e3d78ba0b7f106a1341940930e12e5071d0581357529dc4b9347224d3d7"],
  ["1000:6E25", 24, "find-range-map-maximum-minus-one", "306fc5743c59098d109f884a9cccfab268d2757c4a31f5c46c271bf9fe045850"],
  ["1000:6E46", 24, "draw-lightning-wave-on-stage-cells", "d08a5b1796dcbee6abd4a6456d4a89971cd5fcb38ef01ba4579f50a1ce397486"],
  ["1000:7166", 24, "apply-lightning-damage-after-presentation", "39d24bb03083638848777dfcf4cc6fef52db3759c4bcf254e9f07a258ea39820"],
  ["1000:621C", 24, "fire-1-presentation", "26c44b9b4acd2678542892036e784f5f64fbff26c6e6bec61b9402d1658f6ff2"],
  ["1000:62CE", 24, "fire-2-presentation", "b444245028fbd691f87435765d71699dc28c8dbef5f4d16273c3e9216914a8f4"],
  ["1000:63B4", 24, "fire-3-presentation", "b5037285691e6bf53ccd514093a71c8aa65e4f6bda22f106d0302e4d5e902d3c"],
  ["0000:8D18", 24, "fire-4-three-phase-presentation", "dc57832d7b1a4d84a815269cedbe372c269ad5b05f6a75794209ba3249e473a0"],
  ["0000:8E99", 24, "fire-4-repeat-four-descriptors", "7507a89d4e3915107de991dcabe0bf335d6a168cdb07b22075b26ea2607f2221"],
  ["0000:8ECD", 24, "fire-4-shifted-descriptor-repeat", "bd70257ceae105f44800cf8b05450cb16f904b2e297b9cda79331007909d7bdc"],
  ["1000:6771", 24, "ice-common-loader", "25936af587bf40a0b40234cf72e6f610eaa92b9e163896605ba5726ee70003ec"],
  ["1000:67C1", 24, "ice-expansion-cycles", "b951c4f77ad676c86ef621274b884fce387c5ce55253c27c1a7719f8faa57a36"],
  ["1000:6814", 24, "ice-range-map-maximum-minus-one", "306fc5743c59098d109f884a9cccfab268d2757c4a31f5c46c271bf9fe045850"],
  ["1000:6886", 24, "apply-ice-displacement-after-presentation", "ba5c0e3d78ba0b7f106a1341940930e12e5071d0581357529dc4b9347224d3d7"],
  ["1000:5DA4", 16, "dispatch-area-recovery-tier", "77797eace7c1e7693752d37968de44c2941ae562c8645e748923c9c7b1507c5c"],
  ["1000:6EE0", 24, "area-recovery-presentation", "5dcb944b75258970653477bc0ca4559f4fac29b5bc81fdc6bc87a8110cd4781b"],
  ["1000:6F8E", 24, "area-recovery-stage-loop", "509c81cc4bb2e5ae0e14f6385bd6e2b1b99259b9d418ec5d032b57fc4e27fd9d"],
  ["1000:6FBA", 24, "draw-recovery-stage-on-allied-cells", "ba5c0e3d78ba0b7f106a1341940930e12e5071d0581357529dc4b9347224d3d7"],
  ["1000:6FFE", 24, "apply-area-recovery-after-presentation", "ba5c0e3d78ba0b7f106a1341940930e12e5071d0581357529dc4b9347224d3d7"],
  ["1000:788A", 24, "heal-1-presentation", "39c5bb22042a576e6da19eac7d56d8f34d87ec06d47f0114f29ab97d76b14566"],
  ["1000:791E", 24, "heal-2-presentation", "39c5bb22042a576e6da19eac7d56d8f34d87ec06d47f0114f29ab97d76b14566"],
  ["1000:79A8", 24, "heal-3-presentation", "39c5bb22042a576e6da19eac7d56d8f34d87ec06d47f0114f29ab97d76b14566"],
  ["1000:5BFE", 24, "load-common-heal-finish", "914aabed229ead774d4f433a71854e20d3c167d43317baf4fb1b22a25d33671d"],
  ["1000:5C31", 24, "common-heal-five-stage-finish", "9b984c5537ca44512d443266ec94ced4e6cfe31900eccf5b15a9d8ed641382d5"],
  ["1000:5CA0", 24, "apply-single-heal-after-presentation", "2f2af81fc37b3aca9e33d478e7d68329caba1cae7fd2fce86e8f39595e3e5386"],
];

const DATA_SIGNATURES = [
  [0x17ca, 0x1806, "ice-six-descriptors", "41a2108310ef151605ee2dff2ca068e341e3c50cdc2e7bc5bbdcc0dcf65a24e0"],
  [0x608a, 0x60d4, "common-heal-table-and-descriptors", "98d4a2c714d15429f7f098e0082b6c59a3e5fb8d008bf5f8dff2ea62577e9333"],
  [0x61c8, 0x6524, "lightning-tier-descriptors", "99a367c40fbb08bd398f97e0b1379bcf0c72a91d34d775314f54cb7616afc20d"],
  [0x6548, 0x6876, "fire-descriptors", "e394d43246aeb69a024be64e0c3fd6d5c770567e9772ccc6bf5f281eba91bf1c"],
  [0x6b79, 0x6c07, "lightning-common-tables-and-descriptors", "3f858de8ea92802c823511080777ab79fa3c50399b62a7f6f86f24bbec61ea05"],
  [0x6c1d, 0x6caf, "area-recovery-table-and-descriptors", "82a3456d9cb35e426ec28fe9cd82f92c6292eea3d5073114d12b5c78bb954acd"],
  [0x7058, 0x7064, "heal-1-dynamic-descriptor", "356f9432917285eb07e180a032323814ed68688db4fe0a9e44c2a5a66b64dac5"],
  [0x7064, 0x7124, "heal-2-table-and-descriptors", "d15166d4dfcb8d450d3ac498468080f5e1da02dd70413279541e1c5e24ea8682"],
  [0x7124, 0x71da, "heal-3-tables-and-descriptors", "f12ddf7be57f7b55414470489872d4cb8daf29362670f1ffef26c8a2bb6feb29"],
];

const GRAPHIC_RECORDS = {
  MAGIC: [0, 3, 4, 6, 8, 10, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 37, 39, 40, 41, 42, 47, 48],
  UN: [61],
};

const EXPECTED_RENDERED_FRAMES = {
  "MAGIC/0": 5, "MAGIC/3": 17, "MAGIC/4": 49, "MAGIC/6": 10,
  "MAGIC/8": 56, "MAGIC/10": 6, "MAGIC/20": 10, "MAGIC/22": 7,
  "MAGIC/23": 21, "MAGIC/24": 7, "MAGIC/25": 6, "MAGIC/26": 13,
  "MAGIC/27": 51, "MAGIC/28": 48, "MAGIC/29": 21, "MAGIC/30": 21,
  "MAGIC/31": 12, "MAGIC/37": 45, "MAGIC/39": 23, "MAGIC/40": 36,
  "MAGIC/41": 36, "MAGIC/42": 30, "MAGIC/47": 30, "MAGIC/48": 24,
  "UN/61": 39,
};

const CONTACT_SHEETS = [
  "techniques/UN-0061-heal-1.png",
  "techniques/MAGIC-0020-recovery.png",
  "techniques/MAGIC-0010-ice.png",
  "techniques/MAGIC-0030-fire-4-a.png",
  "techniques/MAGIC-0028-fire-4-b.png",
  "techniques/MAGIC-0029-fire-4-c.png",
  "techniques/MAGIC-0039-lightning-4-a.png",
  "techniques/MAGIC-0040-lightning-4-b.png",
  "techniques/MAGIC-0026-lightning-4-hit.png",
  "techniques/MAGIC-0006-lightning-cleanup.png",
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

function expectPointers(buffer, dsOffset, expected, terminated = true) {
  const pointers = readPointers(buffer, dsOffset, expected.length);
  assert(pointers.join(",") === expected.join(","),
    `DS:${hex(dsOffset)}: unexpected descriptor pointer sequence`);
  if (terminated) {
    assert(readWord(buffer, dsOffset + expected.length * 2) === 0xffff,
      `DS:${hex(dsOffset)}: descriptor pointer sequence has no FFFF terminator`);
  }
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

function descriptorSequence(buffer, offsets) {
  return offsets.map((offset) => decodeDescriptor(buffer, offset));
}

function stage(buffer, resource, offsets, waitPerDrawNativeTicks, extra = {}) {
  return {
    resource,
    descriptorSequence: descriptorSequence(buffer, offsets),
    drawCount: offsets.length,
    waitPerDrawNativeTicks,
    fixedGraphicWaitNativeTicks: offsets.length * waitPerDrawNativeTicks,
    ...extra,
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
    ["E", 9, "lightning-3 second phase"],
    ["E", 36, "single heal and area recovery"],
    ["E", 41, "lightning-2 second phase and lightning-3 first phase"],
    ["E", 43, "lightning-1 and lightning-4"],
    ["E", 51, "fire-4 second phase"],
    ["E", 63, "lightning-2 first phase"],
    ["MAGIC", 83, "fire-1 through fire-4"],
    ["UN", 50, "ice expansion cycle"],
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

function buildPresentations(buffer) {
  const commonHealPointers = expectPointers(buffer, 0x608a,
    [0x6098, 0x60a2, 0x60ac, 0x60b6, 0x60c0, 0x60ca]);
  const recoveryPointers = expectPointers(buffer, 0x6c1d,
    [0x6c41, 0x6c41, 0x6c41, 0x6c4b, 0x6c55, 0x6c5f, 0x6c69, 0x6c73,
      0x6c7d, 0x6c87, 0x6c91, 0x6c9b, 0x6c41, 0x6c41, 0x6c41, 0x6ca5, 0x6ca5]);
  const heal2Pointers = expectPointers(buffer, 0x7064,
    [0x7082, 0x7096, 0x70aa, 0x70be, 0x70d2, 0x70e6, 0x70fa,
      0x7082, 0x7096, 0x70aa, 0x70be, 0x70d2, 0x70e6, 0x70fa]);
  const heal3Open = expectPointers(buffer, 0x7124,
    [0x7162, 0x7176, 0x718a, 0x719e, 0x71b2]);
  const heal3Close = expectPointers(buffer, 0x7130,
    [0x71b2, 0x719e, 0x718a, 0x7176, 0x7162]);
  const heal3Middle = expectPointers(buffer, 0x713c,
    [0x7162, 0x7176, 0x718a, 0x719e, 0x71b2, 0x71c6,
      0x7162, 0x7176, 0x718a, 0x719e, 0x71b2, 0x71c6,
      0x7162, 0x7176, 0x718a, 0x719e, 0x71b2, 0x71c6]);
  const lightning2Middle = expectPointers(buffer, 0x62e4,
    [0x6302, 0x6328, 0x6302, 0x6328, 0x6302, 0x6328, 0x6302,
      0x6328, 0x6302, 0x6328, 0x6302, 0x6328, 0x6302, 0x6328]);
  const lightningCleanupPointers = readPointers(buffer, 0x6b79, 5);
  assert(lightningCleanupPointers.join(",") === [0x6b8f, 0x6b99, 0x6ba3, 0x6bad, 0x6bb7].join(","),
    "unexpected lightning cleanup pointer table");

  const commonHealFinish = stage(buffer, "MAGIC/0", commonHealPointers.slice(0, 5), 15, {
    pointerTable: "DS:608A",
    ignoredSixthPointer: `DS:${hex(commonHealPointers[5])}`,
    originalQuirk: "the pointer table contains a sixth descriptor with tile code 6, but the native loop is hard-coded to five draws; MAGIC/0 has five rendered frames",
  });
  assert(commonHealFinish.fixedGraphicWaitNativeTicks === 75,
    "common heal finish must wait 75 native ticks");

  const heal = {
    family: "H",
    visibleName: "治療",
    settlementBoundary: "all tier-specific graphics and the shared MAGIC/0 five-stage finish complete before 1000:5CA0 mutates life",
    commonFinish: commonHealFinish,
    actions: [
      {
        code: "1H",
        entry: "1000:788A",
        audioRequests: [{ resource: "E/36", entry: "0000:0220", afterFixedWaitNativeTicks: 0 }],
        phases: [{
          resource: "UN/61",
          descriptor: decodeDescriptor(buffer, 0x7058),
          dynamicTileCodeAddress: "DS:7060",
          tileCodes: [...Array.from({ length: 39 }, (_, index) => index + 1), 0],
          drawCount: 40,
          waitPerDrawNativeTicks: 5,
          fixedGraphicWaitNativeTicks: 200,
        }, commonHealFinish],
        fixedGraphicWaitNativeTicks: 275,
        lifeMutation: "after all 275 fixed graphic ticks; percent=24, experience base=10",
      },
      {
        code: "2H",
        entry: "1000:791E",
        audioRequests: [{ resource: "E/36", entry: "0000:0220", afterFixedWaitNativeTicks: 0 }],
        phases: [stage(buffer, "MAGIC/37", heal2Pointers, 10, { pointerTable: "DS:7064" }), commonHealFinish],
        fixedGraphicWaitNativeTicks: 215,
        lifeMutation: "after all 215 fixed graphic ticks; percent=36, experience base=12",
      },
      {
        code: "3H",
        entry: "1000:79A8",
        audioRequests: [{ resource: "E/36", entry: "0000:0220", afterFixedWaitNativeTicks: 30 }],
        phases: [
          stage(buffer, "MAGIC/42", heal3Open, 6, { pointerTable: "DS:7124" }),
          stage(buffer, "MAGIC/41", heal3Middle, 5, { pointerTable: "DS:713C" }),
          stage(buffer, "MAGIC/42", heal3Close, 8, { pointerTable: "DS:7130", direction: "reverse" }),
          commonHealFinish,
        ],
        fixedGraphicWaitNativeTicks: 235,
        lifeMutation: "after all 235 fixed graphic ticks; percent=48, experience base=15",
      },
    ],
  };

  const recovery = {
    family: "I",
    visibleName: "回復",
    commonEntry: "1000:6EE0",
    dispatchEntry: "1000:5DA4",
    actionCodes: ["1I", "2I", "3I"],
    audioRequests: [{ resource: "E/36", entry: "0000:0220", afterFixedWaitNativeTicks: 0 }],
    presentation: stage(buffer, "MAGIC/20", recoveryPointers, 15, {
      pointerTable: "DS:6C1D",
      drawScope: "each descriptor is drawn without an individual wait on every occupied same-side cell, then the whole map effect is flushed and waits once",
    }),
    fixedGraphicWaitNativeTicks: 255,
    tierPresentationDifferences: false,
    settlementBoundary: "1000:6FFE scans and heals same-side cells only after all 17 presentation stages; tier changes range/heal values, not graphics, sound or timing",
  };

  const iceDescriptors = [0x17ca, 0x17d4, 0x17de, 0x17e8, 0x17f2, 0x17fc];
  const ice = {
    family: "C",
    visibleName: "冰雪",
    commonEntry: "1000:6771",
    resource: "MAGIC/10",
    audioResource: "UN/50",
    soundRequestEntry: "0000:0224",
    cycle: stage(buffer, "MAGIC/10", iceDescriptors, 10, {
      audioRequestTiming: "once at the start of every expansion cycle",
      drawScope: "each of the six descriptors is drawn on cells in the current range-map stage and then flushed/waited once",
    }),
    actions: [3, 4, 5, 6].map((effectRadius, index) => {
      const cycles = effectRadius - 1;
      return {
        code: `${index + 1}C`,
        effectRadius,
        cycles,
        soundRequests: cycles,
        drawCount: cycles * 6,
        fixedGraphicWaitNativeTicks: cycles * 60,
      };
    }),
    settlementBoundary: "1000:6886 begins enemy scanning and displacement only after every expansion cycle; no life damage is applied",
  };

  const fire1 = stage(buffer, "MAGIC/22", [0x6548, 0x6552, 0x655c, 0x6566, 0x6570, 0x657a, 0x6584], 10);
  const fire2 = stage(buffer, "MAGIC/23", [0x6598, 0x65a2, 0x65ac, 0x65b6, 0x65c2, 0x65ce,
    0x65da, 0x65e6, 0x65f2, 0x65fe, 0x660a, 0x6616], 10);
  const fire3 = stage(buffer, "MAGIC/27", [0x6622, 0x662c, 0x6638, 0x6646, 0x6654, 0x6662,
    0x6670, 0x6684, 0x6698, 0x66ac, 0x66c0, 0x66d4, 0x66e8], 15);
  const fire4aOffsets = [0x6810, 0x681a, 0x6826, 0x6834,
    ...Array.from({ length: 2 }, () => [0x6842, 0x6850, 0x685e, 0x686c]).flat()];
  const fire4bOffsets = [0x66fc, 0x670a, 0x6718, 0x672c, 0x6740, 0x6754, 0x6768, 0x6782,
    ...Array(5).fill(0x67ea)];
  const fire4cOffsets = [0x679c, 0x67b6, 0x67d0, 0x67ea];
  const fire4phases = [
    stage(buffer, "MAGIC/30", fire4aOffsets, 10, {
      sequence: "four direct descriptors, then the four-descriptor helper repeated twice",
    }),
    stage(buffer, "MAGIC/28", fire4bOffsets, 10, {
      sequence: "eight direct descriptors, then DS:67EA repeated five times while DS:5234 shifts by -50 after each draw",
    }),
    stage(buffer, "MAGIC/29", fire4cOffsets, 10),
  ];
  const fire = {
    family: "F",
    visibleName: "炎暴",
    actions: [
      { code: "1F", entry: "1000:621C", phases: [fire1], fixedGraphicWaitNativeTicks: 70,
        audioRequests: [{ resource: "MAGIC/83", entry: "0000:0224", afterFixedWaitNativeTicks: 0 }] },
      { code: "2F", entry: "1000:62CE", phases: [fire2], fixedGraphicWaitNativeTicks: 120,
        audioRequests: [{ resource: "MAGIC/83", entry: "0000:0224", afterFixedWaitNativeTicks: 0 }] },
      { code: "3F", entry: "1000:63B4", phases: [fire3], fixedGraphicWaitNativeTicks: 195,
        audioRequests: [{ resource: "MAGIC/83", entry: "0000:0224", afterFixedWaitNativeTicks: 0 }] },
      { code: "4F", entry: "0000:8D18", phases: fire4phases, fixedGraphicWaitNativeTicks: 290,
        audioRequests: [
          { resource: "MAGIC/83", entry: "0000:0224", afterFixedWaitNativeTicks: 0 },
          { resource: "E/51", entry: "0000:0224", afterFixedWaitNativeTicks: 120 },
        ] },
    ],
    settlementBoundary: "every tier finishes all graphic phases first, then sets DS:522A=1 and calls 0000:64D6 once per requested damage point; 0000:63CF removes zero-life units afterward",
  };

  const lightningCleanup = stage(buffer, "MAGIC/6", lightningCleanupPointers, 10, {
    pointerTable: "DS:6B79",
    drawScope: "each descriptor is drawn on all occupied enemy-side cells, then flushed/waited once",
  });
  const lightningCommon = (resource, effectRadius, sweepWidth, firstTileCode, secondTileCode) => {
    const rangeMapMaximumMinusOne = effectRadius - 1;
    const iterations = rangeMapMaximumMinusOne + sweepWidth;
    return {
      resource,
      rangeMapMaximumMinusOne,
      sweepWidth,
      iterations,
      descriptors: descriptorSequence(buffer, [0x6bf3, 0x6bfd]),
      runtimeTileCodes: [firstTileCode, secondTileCode],
      waitPerWaveDrawNativeTicks: 2,
      waveDrawsPerIteration: 2,
      rangeWaveFixedGraphicWaitNativeTicks: iterations * 4,
      cleanup: lightningCleanup,
      fixedGraphicWaitNativeTicks: iterations * 4 + 50,
    };
  };
  const lightning = {
    family: "L",
    visibleName: "落雷",
    actions: [
      {
        code: "1L", entry: "1000:5DB2", effectRadius: 3,
        audioRequests: [{ resource: "E/43", entry: "0000:0224", afterFixedWaitNativeTicks: 80 }],
        phases: [
          stage(buffer, "MAGIC/8", Array(8).fill(0x6248), 10, {
            anchorOffsetSequence: Array.from({ length: 8 }, (_, index) => ({
              x: 8 - index,
              y: 8 - index,
            })),
            motion: "DS:5234 starts at the selected cell +408 and shifts -51 after each draw, moving the cloud anchor from (+8,+8) through (+1,+1)",
          }),
          stage(buffer, "MAGIC/8", Array.from({ length: 4 }, () => [0x61c8, 0x61e8, 0x6228, 0x6208]).flat(), 10),
          stage(buffer, "MAGIC/8", Array(8).fill(0x6248), 10, {
            anchorOffsetSequence: Array.from({ length: 8 }, (_, index) => ({
              x: -(index + 1),
              y: -(index + 1),
            })),
            motion: "DS:5234 continues shifting -51 after the centered body, moving the cloud anchor from (-1,-1) through (-8,-8)",
          }),
        ],
        commonHit: lightningCommon("MAGIC/31", 3, 9, 5, 6),
        fixedGraphicWaitNativeTicks: 414,
      },
      {
        code: "2L", entry: "1000:5E80", effectRadius: 4,
        audioRequests: [
          { resource: "E/63", entry: "0000:0224", afterFixedWaitNativeTicks: 0 },
          { resource: "E/41", entry: "0000:0224", afterFixedWaitNativeTicks: 35 },
        ],
        phases: [
          stage(buffer, "MAGIC/47", [...Array.from({ length: 3 }, () => [0x6296, 0x62b0]).flat(), 0x62ca], 5),
          stage(buffer, "MAGIC/48", lightning2Middle, 10, { pointerTable: "DS:62E4" }),
        ],
        commonHit: lightningCommon("MAGIC/24", 4, 5, 6, 7),
        fixedGraphicWaitNativeTicks: 257,
      },
      {
        code: "3L", entry: "1000:5F62", effectRadius: 4,
        audioRequests: [
          { resource: "E/41", entry: "0000:0224", afterFixedWaitNativeTicks: 0 },
          { resource: "E/9", entry: "0000:0224", afterFixedWaitNativeTicks: 120 },
        ],
        phases: [
          stage(buffer, "MAGIC/3", Array.from({ length: 4 }, () => [0x6350, 0x6364, 0x6378]).flat(), 10, {
            anchorOffsetSequence: Array.from({ length: 12 }, (_, index) => ({
              x: 0,
              y: index < 3 ? 0 : -Math.floor(index / 3),
            })),
            motion: "DS:5234 starts at the selected cell and shifts -50 after every three-descriptor cloud cycle, raising the anchor from row 0 through row -3",
          }),
          stage(buffer, "MAGIC/4", Array.from({ length: 5 }, () => [0x638c, 0x63b8, 0x63e4]).flat(), 10,
            {
              anchorOffsetSequence: Array.from({ length: 15 }, () => ({ x: 0, y: -4 })),
              sequence: "three MAGIC/4 descriptor layouts cycle five times at the inherited DS:5234 anchor four rows above the selected cell, placing the six-row bolt's bottom on the selected cell",
            }),
        ],
        commonHit: lightningCommon("MAGIC/25", 4, 4, 5, 6),
        fixedGraphicWaitNativeTicks: 348,
      },
      {
        code: "4L", entry: "1000:6084", effectRadius: 5,
        audioRequests: [{ resource: "E/43", entry: "0000:0224", afterFixedWaitNativeTicks: 0 }],
        phases: [
          stage(buffer, "MAGIC/39", Array.from({ length: 9 }, () => [0x6428, 0x6412]).flat(), 3),
          stage(buffer, "MAGIC/39", [0x643e, 0x6454, 0x646a, 0x6480], 10),
          stage(buffer, "MAGIC/40", [0x64b2, 0x64e4, 0x6516, 0x64b2, 0x64e4, 0x6516], 10),
          stage(buffer, "MAGIC/39", [0x6480, 0x646a, 0x6454, 0x643e], 10, { direction: "reverse" }),
        ],
        commonHit: lightningCommon("MAGIC/26", 5, 11, 12, 13),
        fixedGraphicWaitNativeTicks: 304,
      },
    ],
    settlementBoundary: "the tier-specific presentation, distance-layer wave and five-stage MAGIC/6 cleanup all finish before 1000:7166 scans targets, applies defense-magic behavior and damage, then calls 0000:63CF",
  };

  assert(heal.actions.map((entry) => entry.fixedGraphicWaitNativeTicks).join(",") === "275,215,235",
    "unexpected heal fixed waits");
  assert(recovery.presentation.fixedGraphicWaitNativeTicks === 255, "unexpected recovery fixed wait");
  assert(ice.actions.map((entry) => entry.fixedGraphicWaitNativeTicks).join(",") === "120,180,240,300",
    "unexpected ice fixed waits");
  assert(fire.actions.map((entry) => entry.fixedGraphicWaitNativeTicks).join(",") === "70,120,195,290",
    "unexpected fire fixed waits");
  assert(lightning.actions.map((entry) => entry.fixedGraphicWaitNativeTicks).join(",") === "414,257,348,304",
    "unexpected lightning fixed waits");
  return { lightning, fire, ice, heal, recovery };
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
    format: "ANGEL2 non-shooting technique presentation rules",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    source: {
      path: modulePath,
      bytes: moduleBuffer.length,
      sha256: sha256(moduleBuffer),
      dataLinearBase: DATA_LINEAR_BASE,
      audioManifest: {
        path: audioManifestPath,
        bytes: audioBuffer.length,
        sha256: sha256(audioBuffer),
      },
    },
    verifiedCodeSignatures: validateCodeSignatures(moduleBuffer),
    verifiedDataSignatures: validateDataSignatures(moduleBuffer),
    renderMode: {
      fullScreenCombatDispatchUsed: false,
      rule: "these handlers directly use board/map effect descriptors and do not enter the ordinary-attack full-screen presentation chain",
    },
    sharedPrimitives: {
      prepareSelectedTargetArea: "0000:628E",
      loadResourceRecord: "0000:FD8E",
      loadGraphic: "1000:937A",
      requestLoadedVocEntries: ["0000:0220", "0000:0224"],
      clearMapEffectBuffer: "0000:6425",
      drawMapEffectWithoutWait: "0000:642B",
      drawDescriptorAndWait: "0000:64B7",
      flushMapEffectAndWait: "0000:64A1",
      finalizeAndRemoveDead: "0000:63CF",
      nativeTickBoundary: "the released nominal timer tick is 10.000151 ms; preserve integer tick counts and use a 10 ms Web logical quantum",
    },
    synchronizationRule: "for L/F/C/H/I families, the complete recovered fixed graphic timeline ends before the family-specific life, displacement, defense-magic or healing mutation begins",
    presentations,
    resourceCatalog: {
      graphicEntries: graphics,
      audioEntries: audioCatalog(audioManifest, audioManifestPath, extractedRoot),
      contactSheets,
    },
    evidenceBoundary: {
      confirmed: "18 action presentations across lightning, fire, ice, single heal and area recovery; resource records, descriptor order, sound request points, fixed native waits and the presentation-to-rule mutation boundary",
      vocRequestBoundary: "0220h submits the loaded VOC directly; 0224h first tests the saved combat-sound switch at DS:10EDh bit 0, then reaches the same low-level request",
      preservedUnknown: "the original names of low-level descriptor fields; the released nominal native timer tick is 10.000151 ms",
      implementation: "frozen until phase-1 GDD review passes",
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `extracted non-shooting technique presentations: ${result.verifiedCodeSignatures.length} code signatures, ` +
    `${result.verifiedDataSignatures.length} data signatures, 18 actions, ` +
    `${graphics.length} graphics and ${result.resourceCatalog.audioEntries.length} audio records`,
  );
  return result;
}

function usage() {
  return "usage: angel2-technique-presentations.mjs --extract MODULE29 AUDIO_MANIFEST " +
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

export { buildPresentations, decodeDescriptor, extract };
