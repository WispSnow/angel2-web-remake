#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { composePlanarImage, encodeRgbaPng } from "./angel2-planar.mjs";

const MODULE23_DATA_BASE = 0x9920;
const BIG5 = new TextDecoder("big5", { fatal: true });

const CODE_SIGNATURES = [
  ["0000:0480", 0x0480, 0x059f, "title-main-loop-and-idle-rebuild", "a805f5b15df0c4d8b7ca3def7c6b3f0b16e7a092131fca4ef940b1627296d478"],
  ["0000:059F", 0x059f, 0x0611, "difficulty-loop-and-audio-stop", "dd1cc29ae02bb3a7ec7c1d1f1ed60d4d56c466f0e89bebff744589f5404da2cf"],
  ["0000:0611", 0x0611, 0x070b, "title-resource-load-reveal-and-music", "fc36e883ea4a46887e9ec542f366f5c4d52a42ad5a9322a269cbae4775b1fa35"],
  ["0000:074A", 0x074a, 0x0766, "title-skippable-hold", "cee4c5e3aa5197cb3399e1ff5f6708aa2e2e1bad82032dcdd5a129d826dfd36e"],
  ["0000:0766", 0x0766, 0x07a3, "upper-title-reveal", "42f0b0b7e44f62382d9b75cf38bcb9fdc28cd52b562a494cc5b5693dc41ad080"],
  ["0000:07A3", 0x07a3, 0x07fb, "alternating-upper-and-lower-resource-dispatch", "9369bf23c342727ca120ec02271a55868f4588572136c1bc978e8dc285fd9bbc"],
  ["0000:07FB", 0x07fb, 0x0837, "lower-title-reveal", "d4d1daac9a4526503f57a27761cab5ce42f1b8dde2d75a4f65cf33b2a91d8289"],
  ["0000:08D3", 0x08d3, 0x0934, "title-idle-animation-compositor", "8ecebf9c95f7b801b073a97e53e6b9a83177c93377ef55e4c72c27f7048b115e"],
  ["0000:0934", 0x0934, 0x0bba, "title-idle-layer-motion", "e682eedb906ea1c6e0e8a3f72fee7504e8672f5647b004827996b3d5b37a3127"],
  ["0000:0BC7", 0x0bc7, 0x0c1f, "title-variant-static-layers", "db2f03c50ee0c6f2124017c0ed497f99838161d5e17defeabb91e5e050031ef8"],
  ["0000:0CE2", 0x0ce2, 0x0d2f, "pretitle-load-fade-and-hold", "fb0a4009150444a36ade0ba8ae2c7cb2d1c42b87f988236e2aa8b36845f916db"],
  ["0000:0D2F", 0x0d2f, 0x0d55, "pretitle-skippable-300-tick-hold", "4d18aa50e8221f4d2b357b079f1dd8ee44297bd5600dd16da7076758f698e98e"],
  ["0000:0DC3", 0x0dc3, 0x0e86, "dissolve-blit-per-plane-setup", "e50ebad7ef34217e09a74d8d443f58115efba8a63a4b9fe9b9263d6cc788e854"],
  ["0000:0E86", 0x0e86, 0x0f06, "dissolve-pattern-row-dispatch", "811ab2dd734caa6457355ab65cf6e0082af5be2abd67d83b42f1ba5bb28d606e"],
  ["0000:0F0A", 0x0f0a, 0x0fac, "sixteen-8x8-dissolve-patterns", "36f0b823e1cc1763719aa6ac2983933bb42ddd86b568fa530a788fd439a5dee2"],
  ["0000:1034", 0x1034, 0x117d, "intro-loader-main-loop-and-music", "59bf7da6e376c6d9274261675e440eeb5dd18c2ad5950ad886b08988522ad889"],
  ["0000:117D", 0x117d, 0x11da, "intro-background-reload", "671487d6981c9f6e98c0c3ae444fe5ef8cd22f194e18724ffc98973d7a6f531e"],
  ["0000:11DA", 0x11da, 0x123c, "intro-three-row-scroll-update", "e6184292ee9a170090c8037b551effc0050832579dcd776a150f974b17e6b029"],
  ["0000:123C", 0x123c, 0x128d, "intro-row-reset-and-control-dispatch", "bad144c2abd8131dba4882cfc8a3d3809c762bd028ecd9093a69b4990fa49f76"],
  ["0000:128D", 0x128d, 0x1362, "intro-control-token-to-background-map", "33adc977a67e3485d8568e36ecbb3aaf03dac0c8d2038754eafcbae9c796bf21"],
  ["0000:1362", 0x1362, 0x1382, "intro-crtc-page-flip", "7c9a0b29781f6185c4d8455ae84d63334ad037e046fec328aff57edf35f40de8"],
  ["0000:1382", 0x1382, 0x13cf, "intro-palette-state-machine", "ebf0f56dd7726786783e2c99ee0ec10aa48bb7cde8ee257d49cdb68f6b246170"],
  ["0000:13CF", 0x13cf, 0x140a, "intro-15-color-palette-step", "57bc4cebe074c90b0f207d4d5613cae8e220e04cb1634698347c8d5e5c3e24fc"],
  ["0000:1455", 0x1455, 0x14a3, "continue-selector-resource-and-setup", "9daa1ccf6eb30d76db1b2c192516278719ceec62088c9705ac1dd1a82a2c213c"],
  ["0000:152F", 0x152f, 0x16c7, "continue-screen-construction", "15d749b0499cc10905d1e66cc5a92850280d42f5eb168fa408ee576c575582d8"],
  ["0000:16C7", 0x16c7, 0x17ad, "continue-five-row-render", "7456bb78168fd05b9a0d4404dabcac93a4d1070097d6749a431c2caa86ffedd4"],
  ["0000:17AD", 0x17ad, 0x1820, "continue-slot-metadata-render", "0486556b5602fca24d26c4069f0f914d3853dc5d2c1bcb6b4e7390c81f4cea9e"],
  ["0000:183D", 0x183d, 0x189e, "continue-selection-and-highlight", "99e58b54c637958b29611d519f976228c6e8db88f7fd22a9f66d6c4da986a108"],
  ["0000:19F2", 0x19f2, 0x1a47, "title-menu-init-and-draw", "832a60b0f27774170e8be6d4bc11be6e64bea06183344828f5d6ccb5d24106bf"],
  ["0000:1A91", 0x1a91, 0x1aee, "title-option-label-render", "2172b3ca8aa9d084163acf12b78337069035c1cc5b463a6a71f333fd5ef6e874"],
  ["0000:1B7E", 0x1b7e, 0x1bd3, "difficulty-menu-init", "54081fcefbfd5d1d8f9a5170060a91894fed4a1800882d446c31d7fc57b674ca"],
  ["0000:1C23", 0x1c23, 0x1c80, "difficulty-label-render", "daf68e672a82602aea4af9b257c2f6c0c241ca394d183aea94a1749a80eca3d0"],
  ["0000:31B4", 0x31b4, 0x31e0, "64-step-fade-in-and-63-step-fade-out", "f154922106e0fd2c380bb56412e816313bc92ae08796e4e4cd320ef6dbe235e5"],
  ["0000:31E0", 0x31e0, 0x3220, "16-color-dac-step", "175b5415d5158f7e696626b3c68b0e66dbc6ab4b1cd2d7663d5589482e76aaaf"],
];

const DATA_SIGNATURES = [
  ["DS:020E-0453", 0x020e, 0x0454, "title-animation-tables-and-palette", "02030b442b8db77a0f248bb737d28c5ba87e0dc3266da9a4c259bc3ed2505e30"],
  ["DS:04D4-07B5", 0x04d4, 0x07b6, "intro-scroll-state-pointer-list-and-big5-lines", "569e9a31f962fde8778b3d10e06719ab57d94b0fb60270c1456bd46fad402c51"],
  ["DS:07B6-09DC", 0x07b6, 0x09dd, "intro-draw-descriptors-and-nine-palettes", "6943ae06c7822dd794636c22c5ef1a98a2fbd30fa7b98f4f27daa6ddbbc0d369"],
  ["DS:09F5-0AB8", 0x09f5, 0x0ab9, "continue-screen-draw-descriptors", "bf5124d7bd56969a74e3b6a0794d96c1413f33639a1725096c64661c864b9144"],
  ["DS:0ABF-0D7B", 0x0abf, 0x0d7c, "continue-title-and-difficulty-menu-data", "bfe4e36b091c537b6b4158c09f7bddebeac1d9d91b641f48db5e7b9765771fff"],
];

const RENDER_SPECS = [
  { group: "UN", record: 53, indices: [0], paletteOffset: 0x03e8, role: "pretitle Softstar logo", reachable: true },
  { group: "BK", record: 40, indices: [0, 1], paletteOffset: 0x02c2, role: "title menu decoration", reachable: true },
  { group: "BK", record: 41, indices: [0], paletteOffset: 0x083d, role: "intro initial background", reachable: true },
  { group: "BK", record: 42, indices: [0], paletteOffset: 0x086d, role: "intro #2 background branch", reachable: false },
  { group: "BK", record: 43, indices: [0], paletteOffset: 0x089d, role: "intro #3 background", reachable: true },
  { group: "BK", record: 44, indices: [0], paletteOffset: 0x08cd, role: "intro #4 background", reachable: true },
  { group: "BK", record: 45, indices: [0], paletteOffset: 0x08fd, role: "intro #5 background", reachable: true },
  { group: "BK", record: 46, indices: [0], paletteOffset: 0x092d, role: "intro #6 background", reachable: true },
  { group: "BK", record: 47, indices: [0], paletteOffset: 0x095d, role: "intro #7 background", reachable: true },
  { group: "BK", record: 48, indices: [0], paletteOffset: 0x098d, role: "intro #8 background", reachable: true },
  { group: "BK", record: 51, indices: [0], paletteOffset: 0x02c2, role: "title background", reachable: true },
  { group: "BK", record: 52, indices: [0], paletteOffset: 0x02c2, role: "title upper art variant 0", reachable: true },
  { group: "BK", record: 53, indices: [0], paletteOffset: 0x02c2, role: "title lower art variant 0", reachable: true, nonMonotonicTable: true },
  { group: "BK", record: 54, indices: [0], paletteOffset: 0x02c2, role: "title upper art variant 1", reachable: true },
  { group: "BK", record: 55, indices: [0], paletteOffset: 0x02c2, role: "title lower art variant 1", reachable: true },
  { group: "BK", record: 56, indices: Array.from({ length: 70 }, (_, index) => index), paletteOffset: 0x02c2, role: "title idle animation sprites", reachable: true },
  { group: "BK", record: 57, indices: Array.from({ length: 6 }, (_, index) => index), paletteOffset: 0x02c2, role: "title static layers", reachable: true },
  { group: "A", record: 6, indices: [0, 1, 5], paletteOffset: 0x02c2, role: "continue selector construction", reachable: true },
  { group: "A", record: 25, indices: [0, 1], paletteOffset: 0x083d, role: "intro scrolling-text glyph strip", reachable: true },
];

const CONTACT_SHEETS = [
  "contact-sheets/pretitle-intro.png",
  "contact-sheets/title-art.png",
  "contact-sheets/title-ui.png",
  "contact-sheets/continue-ui.png",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function moduleData(module23, offset, bytes) {
  const start = MODULE23_DATA_BASE + offset;
  assert(start >= 0 && start + bytes <= module23.length, `DS:${offset.toString(16)} outside module`);
  return module23.subarray(start, start + bytes);
}

function dacPalette(values) {
  assert(values.length === 48, "title palette must have 16 RGB triples");
  return Array.from({ length: 16 }, (_, index) =>
    Array.from(values.subarray(index * 3, index * 3 + 3), (value) => Math.round(value * 255 / 63)));
}

/**
 * The title art is not faded in: `0000:0766`/`0000:07FB` call the planar blit at
 * `0000:0DC3` with a step number, and `0000:0EB0` uses it to index the pointer
 * table at `0000:0F0A`. Each entry is an eight-byte 8x8 dither pattern consumed
 * one row per scanline (`0000:0ED5` wraps the row counter at 8); `0000:0EF4`
 * keeps the source pixel where the bit is set and the destination pixel where it
 * is clear. Steps 0-7 and 8-15 are two nested, complementary phases, so the
 * upper art's 1,3,5,...,15 and the lower art's 0..15 both end fully covered.
 */
function parseDissolvePatterns(module23) {
  const patterns = Array.from({ length: 16 }, (_, step) => {
    const offset = module23.readUInt16LE(0x0f0a + step * 2);
    assert(offset >= 0x0f2c && offset + 8 <= 0x0fac, `dissolve pattern ${step} points outside its table`);
    const rows = Array.from(module23.subarray(offset, offset + 8));
    return {
      step,
      address: `0000:${offset.toString(16).toUpperCase().padStart(4, "0")}`,
      rows,
      setPixelsPerCell: rows.reduce((total, row) => total + row.toString(2).replaceAll("0", "").length, 0),
    };
  });
  const density = patterns.map((pattern) => pattern.setPixelsPerCell);
  assert(
    density.join(",") === "4,8,12,16,20,24,28,32,4,8,12,16,20,24,28,32",
    "dissolve pattern densities changed",
  );
  for (const phase of [0, 8]) {
    for (let step = phase; step < phase + 7; step += 1) {
      const inner = patterns[step].rows;
      const outer = patterns[step + 1].rows;
      assert(
        inner.every((row, index) => (row & outer[index]) === row),
        `dissolve step ${step} is not nested inside step ${step + 1}`,
      );
    }
  }
  assert(
    patterns[7].rows.every((row, index) => (row & patterns[15].rows[index]) === 0
      && (row | patterns[15].rows[index]) === 0xff),
    "the two dissolve phases no longer tile the full 8x8 cell",
  );
  return {
    table: "0000:0F0A",
    cellWidth: 8,
    cellHeight: 8,
    rowRule: "one byte per scanline, wrapping every 8 rows; a set bit takes the source pixel",
    patterns,
  };
}

function verifySignatures(module23) {
  const code = CODE_SIGNATURES.map(([address, start, end, role, expected]) => {
    const bytes = module23.subarray(start, end);
    const actual = sha256(bytes);
    assert(actual === expected, `${address}: title-presentation code signature mismatch`);
    return { address, fileOffset: start, bytes: bytes.length, role, sha256: actual };
  });
  const data = DATA_SIGNATURES.map(([address, start, end, role, expected]) => {
    const bytes = moduleData(module23, start, end - start);
    const actual = sha256(bytes);
    assert(actual === expected, `${address}: title-presentation data signature mismatch`);
    return { address, fileOffset: MODULE23_DATA_BASE + start, bytes: bytes.length, role, sha256: actual };
  });
  return { code, data };
}

function parseNativeBitmap(buffer, imageIndex, label) {
  assert(imageIndex * 2 + 2 <= buffer.length, `${label}: missing image pointer ${imageIndex}`);
  const offset = buffer.readUInt16LE(imageIndex * 2);
  assert(offset !== 0xffff && offset + 4 <= buffer.length, `${label}: invalid image pointer ${imageIndex}`);
  const height = buffer.readUInt16LE(offset);
  const rowBytes = buffer.readUInt16LE(offset + 2);
  const end = offset + 4 + height * rowBytes;
  assert(rowBytes > 0 && end <= buffer.length, `${label}: image ${imageIndex} exceeds plane`);
  return {
    directoryBytes: null,
    offsets: null,
    images: [{
      index: 0,
      offset,
      end,
      width: rowBytes * 8,
      height,
      rowBytes,
      pixels: buffer.subarray(offset + 4, end),
    }],
  };
}

async function renderOne(module23, decodedRoot, renderRoot, spec, imageIndex) {
  const recordDirectory = path.join(decodedRoot, spec.group, String(spec.record).padStart(4, "0"));
  const buffers = await Promise.all(Array.from({ length: 5 }, (_, plane) =>
    readFile(path.join(recordDirectory, `${String(plane).padStart(2, "0")}.raw`))));
  const colorPlanes = buffers.slice(0, 4).map((buffer, plane) =>
    parseNativeBitmap(buffer, imageIndex, `${spec.group}/${spec.record} plane ${plane}`));
  const candidateMask = parseNativeBitmap(buffers[4], imageIndex, `${spec.group}/${spec.record} mask`);
  const image = colorPlanes[0].images[0];
  const maskImage = candidateMask.images[0];
  const mask = maskImage.width === image.width && maskImage.height === image.height ? candidateMask : null;
  const palette = dacPalette(moduleData(module23, spec.paletteOffset, 48));
  const composed = composePlanarImage(colorPlanes, 0, mask, palette);
  const relative = path.join(
    "frames",
    spec.group,
    String(spec.record).padStart(4, "0"),
    `${String(imageIndex).padStart(2, "0")}.png`,
  );
  const output = path.join(renderRoot, relative);
  await mkdir(path.dirname(output), { recursive: true });
  const png = encodeRgbaPng(composed.width, composed.height, composed.pixels);
  await writeFile(output, png);
  return {
    index: imageIndex,
    width: composed.width,
    height: composed.height,
    maskUsed: mask !== null,
    output: relative,
    sha256: sha256(png),
  };
}

async function render(module23Path, decodedRoot, renderRoot) {
  const module23 = await readFile(module23Path);
  verifySignatures(module23);
  const records = [];
  for (const spec of RENDER_SPECS) {
    const images = [];
    for (const imageIndex of spec.indices) {
      images.push(await renderOne(module23, decodedRoot, renderRoot, spec, imageIndex));
    }
    records.push({
      key: `${spec.group}/${spec.record}`,
      ...spec,
      images,
    });
  }
  const manifest = {
    format: "ANGEL2 module-23 title-presentation palette-correct renders",
    module23: { path: module23Path, bytes: module23.length, sha256: sha256(module23) },
    paletteRule: "each record uses the exact 16-color VGA DAC table selected by module 23",
    nativeBitmapRule: "image offsets are native index pointers and need not be monotonic; BK/53 index 0 is therefore recoverable",
    renderedRecords: records.length,
    renderedImages: records.reduce((total, record) => total + record.images.length, 0),
    records,
  };
  await mkdir(renderRoot, { recursive: true });
  await writeFile(path.join(renderRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`rendered ${manifest.renderedImages} palette-correct title images from ${manifest.renderedRecords} records`);
  return manifest;
}

function parseIntroEntries(module23) {
  const entries = [];
  for (let index = 0; ; index++) {
    const pointer = module23.readUInt16LE(MODULE23_DATA_BASE + 0x04db + index * 2);
    if (pointer === 0xffff) break;
    let end = MODULE23_DATA_BASE + pointer;
    while (end < module23.length && module23[end] !== 0x24) end++;
    assert(end < module23.length, `intro entry ${index} lacks '$' terminator`);
    const raw = module23.subarray(MODULE23_DATA_BASE + pointer, end);
    const type = raw[0] === 0x23 ? "background-control" :
      raw.length === 1 && raw[0] === 0x20 ? "blank" : "narrative";
    entries.push({
      index,
      pointer: `DS:${pointer.toString(16).toUpperCase().padStart(4, "0")}`,
      type,
      selector: type === "background-control" ? raw[1] : null,
      backgroundRecord: type === "background-control" ? 40 + raw[1] : null,
      text: type === "background-control" ? null : BIG5.decode(raw),
      rawHex: raw.toString("hex").toUpperCase(),
    });
  }
  assert(entries.length === 35, "expected 35 shipped intro control/text entries");
  assert(entries.filter((entry) => entry.type === "background-control").length === 6, "expected six intro background controls");
  assert(entries.filter((entry) => entry.type === "narrative").length === 17, "expected 17 intro narrative lines");
  assert(entries.filter((entry) => entry.type === "blank").length === 12, "expected 12 intro blank rows");
  assert(entries.filter((entry) => entry.type === "background-control")
    .map((entry) => entry.selector).join(",") === "3,4,5,6,7,8", "unexpected intro background sequence");
  return entries;
}

function simulateIntro(entries) {
  const nextResetUpdate = [11, 31, 51];
  const assignments = [];
  let entryIndex = 0;
  let update = 0;
  let terminatedBySlot = null;
  while (terminatedBySlot === null) {
    update++;
    for (let slot = 0; slot < 3; slot++) {
      if (update !== nextResetUpdate[slot]) continue;
      while (true) {
        if (entryIndex === entries.length) {
          terminatedBySlot = slot;
          break;
        }
        const entry = entries[entryIndex++];
        if (entry.type === "background-control") continue;
        assignments.push({ update, slot, entryIndex: entry.index, type: entry.type });
        nextResetUpdate[slot] += 60;
        break;
      }
    }
  }
  const mainLoopIterations = update * 3;
  return {
    scrollUpdateCountUntilTerminator: update,
    rowAssignmentCount: assignments.length,
    terminatedBySlot,
    mainLoopIterations,
    fixedWaitNativeTicks: mainLoopIterations * 4,
    initialRowY: [267, 287, 307],
    resetY: 317,
    visibleDrawYRange: [316, 258],
    rowResetPeriodUpdates: 60,
    assignments,
  };
}

function audioEntry(audioManifest, record) {
  const entry = audioManifest.entries.find((item) => item.group === "MUSIC" && item.record === record);
  assert(entry?.kind === "softstar_rix", `missing MUSIC/${record} RIX conversion`);
  return {
    key: `MUSIC/${record}`,
    record,
    source: entry.source,
    sourceBytes: entry.sourceBytes,
    sourceSha256: entry.sourceSha256,
    decodedOutput: entry.output,
    durationSeconds: entry.durationSeconds,
    sampleRate: entry.sampleRate,
    channels: entry.channels,
  };
}

async function catalogContactSheets(renderRoot) {
  const entries = [];
  for (const relative of CONTACT_SHEETS) {
    const data = await readFile(path.join(renderRoot, relative));
    entries.push({ path: relative, bytes: data.length, sha256: sha256(data) });
  }
  return entries;
}

async function extract(module23Path, audioManifestPath, decodedRoot, renderRoot, outputPath) {
  const [module23, audioBuffer, renderBuffer] = await Promise.all([
    readFile(module23Path),
    readFile(audioManifestPath),
    readFile(path.join(renderRoot, "manifest.json")),
  ]);
  const audioManifest = JSON.parse(audioBuffer.toString("utf8"));
  const renderManifest = JSON.parse(renderBuffer.toString("utf8"));
  assert(renderManifest.renderedRecords === 19, "expected 19 title-presentation graphic records");
  assert(renderManifest.renderedImages === 97, "expected 97 palette-correct title images");
  const signatures = verifySignatures(module23);
  const introEntries = parseIntroEntries(module23);
  const introSimulation = simulateIntro(introEntries);
  assert(introSimulation.scrollUpdateCountUntilTerminator === 591, "intro scroll simulation changed");
  assert(introSimulation.mainLoopIterations === 1773, "intro loop count changed");
  assert(introSimulation.fixedWaitNativeTicks === 7092, "intro fixed wait count changed");
  const result = {
    format: "ANGEL2 module-23 title and intro presentation rules",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    sources: {
      module23: { path: module23Path, bytes: module23.length, sha256: sha256(module23) },
      audioManifest: { path: audioManifestPath, bytes: audioBuffer.length, sha256: sha256(audioBuffer) },
      decodedRoot,
      renderManifest: { path: path.join(renderRoot, "manifest.json"), bytes: renderBuffer.length, sha256: sha256(renderBuffer) },
    },
    verifiedCodeSignatures: signatures.code,
    verifiedDataSignatures: signatures.data,
    correctedResourceIndexFinding: {
      resourceIndex8: "MUSIC.SWF",
      priorIncorrectBinding: ["NUM/1", "NUM/14"],
      correctedBinding: ["MUSIC/1", "MUSIC/14"],
      evidence: "module23 loads both records with BX=8 before invoking the RIX driver; BX=9 is NUM and contains unrelated Big5 text",
    },
    pretitle: {
      entry: "0000:0CE2",
      graphic: "UN/53",
      draw: { imageIndex: 0, x: 95, y: 77 },
      audio: null,
      fadeIn: { palette: "DS:03E8", dacWrites: 64, brightnessOffsets: "-63..0" },
      hold: { iterations: 100, ticksPerIteration: 3, maximumFixedNativeTicks: 300, skippableByEitherActionFlag: true },
      fadeOut: { palette: "DS:03E8", dacWrites: 63, brightnessOffsets: "0..-62" },
      synchronization: "the logo is drawn before fade-in; the hold may end early; fade-out always follows",
    },
    intro: {
      entry: "0000:1034",
      audio: { ...audioEntry(audioManifest, 14), start: "after BK/41 is copied to both VGA pages", stop: "on natural completion or any skip input" },
      glyphGraphic: "A/25",
      initialBackground: { graphic: "BK/41", palette: "DS:083D", x: 24, y: 0, copiedToBothPages: true },
      handlerSupportedButShippedUnreferenced: { selector: 2, graphic: "BK/42", palette: "DS:086D" },
      shippedBackgroundSequence: [
        { selector: 3, graphic: "BK/43", palette: "DS:089D" },
        { selector: 4, graphic: "BK/44", palette: "DS:08CD" },
        { selector: 5, graphic: "BK/45", palette: "DS:08FD" },
        { selector: 6, graphic: "BK/46", palette: "DS:092D" },
        { selector: 7, graphic: "BK/47", palette: "DS:095D" },
        { selector: 8, graphic: "BK/48", palette: "DS:098D" },
      ],
      controlAndTextEntries: introEntries,
      counts: { totalEntries: 35, narrativeLines: 17, blankRows: 12, backgroundControls: 6 },
      scroll: introSimulation,
      loop: {
        waitNativeTicksPerIteration: 4,
        scrollUpdateEveryIterations: 3,
        crtcPageFlipEveryIteration: true,
        skipFlagsCheckedEveryIteration: 3,
      },
      backgroundTransition: {
        stateOrder: ["active", "fade-down", "load-next", "fade-up", "active"],
        loopsPerTransition: 128,
        transitionCount: 6,
        scrollContinuesDuringTransition: true,
      },
    },
    title: {
      entry: "0000:0611",
      fixedResources: ["BK/40", "BK/57", "BK/51", "MUSIC/1", "BK/56"],
      background: { graphic: "BK/51", x: 0, y: 0 },
      variant0: { condition: "idle-rebuild flag bit 0 is clear", upper: "BK/52", lower: "BK/53" },
      variant1: { condition: "idle-rebuild flag bit 0 is set", upper: "BK/54", lower: "BK/55" },
      upperReveal: { x: 32, y: 0, dissolveSteps: [1, 3, 5, 7, 9, 11, 13, 15], ticksPerStep: 5, fixedNativeTicks: 40 },
      preMusicHold: { iterations: 20, ticksPerIteration: 2, maximumFixedNativeTicks: 40, skippableByEitherActionFlag: true },
      audio: { ...audioEntry(audioManifest, 1), start: "after upper reveal and pre-music hold, before lower reveal" },
      lowerReveal: { x: 0, y: 216, dissolveSteps: Array.from({ length: 16 }, (_, index) => index), ticksPerStep: 5, fixedNativeTicks: 80 },
      palette: { table: "DS:02C2", fadeInDacWrites: 64, fadeOutDacWrites: 63 },
      menuIdle: {
        waitNativeTicksPerCycle: 8,
        unchangedCyclesBeforeReplay: 201,
        fixedNativeTicksBeforeReplay: 1608,
        pointerMovementResetsCounter: true,
        replayRule: "toggle the art-variant flag, stop MUSIC/1, fade out, replay the full scrolling intro without the pretitle logo, then rebuild the title",
      },
    },
    menus: {
      title: { options: 2, redrawsLabelsAfterHoverChange: true, archiveAudioOnNavigationOrConfirm: null },
      difficulty: {
        options: 4,
        waitNativeTicksPerCycle: 4,
        idleIntroReplay: false,
        audioRule: "both confirm and cancel issue the RIX stop operation; cancel returns to the title menu without restarting MUSIC/1",
      },
      continue: {
        graphic: "A/6",
        construction: { iterations: 45, graphicDrawsPerIteration: 3, totalGraphicDraws: 135, usedImageIndices: [0, 1, 5] },
        slotRows: 5,
        archiveAudio: null,
        explicitNativeWaitCalls: 0,
        emptySlotRule: "highlight is allowed but confirmation loops until a populated slot or cancel",
      },
    },
    dissolve: parseDissolvePatterns(module23),
    titleMenuLabels: {
      textX: 520,
      rowPitch: 24,
      /* DS:0BDE and DS:0D5E are both a 96x20 bitmap whose rows alternate AAh and
       * 55h, drawn in colour 7, so the selected row is a 50% checkerboard
       * stipple rather than a solid bar. */
      highlightBar: {
        x: 504,
        yOffset: -2,
        width: 96,
        height: 20,
        colorIndex: 7,
        pattern: "50% checkerboard; set where (x + y) is even",
      },
      /* 0000:19F2 and 0000:1B7E draw the BK/40 surround and then the labels in
       * the same call, so the box is part of the menu and appears only after the
       * title art has finished dissolving in. */
      title: {
        entry: "0000:19F2",
        firstTextY: 75,
        highlightDescriptor: "DS:0BDE",
        frame: { resource: "BK/40", imageIndex: 0, x: 480, y: 45 },
      },
      difficulty: {
        entry: "0000:1C23",
        initEntry: "0000:1B7E",
        firstTextY: 51,
        highlightDescriptor: "DS:0D5E",
        frame: { resource: "BK/40", imageIndex: 1, x: 480, y: 21 },
      },
      note: "the two title options and the four difficulty labels are drawn from the A/23+A/24 glyph pair, not from a system font",
    },
    resourceCatalog: {
      graphicRecordCount: RENDER_SPECS.length,
      audioRecordCount: 2,
      paletteCorrectRenderCount: renderManifest.renderedImages,
      graphics: renderManifest.records,
      audio: [audioEntry(audioManifest, 1), audioEntry(audioManifest, 14)],
      contactSheets: await catalogContactSheets(renderRoot),
      titleGlyphResourcesFromFlowSpec: ["A/23", "A/24"],
    },
    closure: {
      pretitleTimelineClosed: true,
      introTimelineClosed: true,
      titleTimelineClosed: true,
      titleDifficultyContinueMenuPresentationClosed: true,
      codeSignatureCount: signatures.code.length,
      dataSignatureCount: signatures.data.length,
      graphicRecordCount: RENDER_SPECS.length,
      audioRecordCount: 2,
      contactSheetCount: CONTACT_SHEETS.length,
    },
    evidenceBoundary: {
      confirmed: "resource records, palette tables, native image-index handling, draw/reveal order, RIX start/stop points, fixed waits, idle replay, intro control list, text rows and page/palette state machines",
      preservedUnknown: "VGA retrace timing, exact names of low-level drawing primitives, and host audio timing drift versus the decoded RIX duration; the released nominal native wait tick is 10.000151 ms",
      implementation: "frozen until phase-1 GDD review passes",
    },
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`extracted title presentations: ${signatures.code.length} code signatures, ${signatures.data.length} data signatures, 19 graphics, 2 RIX and 4 contact sheets`);
  return result;
}

function usage() {
  return "usage:\n" +
    "  angel2-title-presentations.mjs --render MODULE23 DECODED_ROOT RENDER_ROOT\n" +
    "  angel2-title-presentations.mjs --extract MODULE23 AUDIO_MANIFEST DECODED_ROOT RENDER_ROOT OUTPUT_JSON";
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "--render" && args.length === 3) {
    await render(...args);
    return;
  }
  if (command === "--extract" && args.length === 5) {
    await extract(...args);
    return;
  }
  throw new Error(usage());
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

export { extract, parseIntroEntries, render, simulateIntro };
