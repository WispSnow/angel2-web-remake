#!/usr/bin/env node

// Optional HD map-technique effects (REMAKE-203 fire, REMAKE-204 heal and rest, REMAKE-205 single-target status
// techniques, REMAKE-206 recovery and ice, REMAKE-207 the map-combat strike and death, REMAKE-208 shooting and WD,
// REMAKE-209 the stomp's leg and shadow stills, REMAKE-210 lightning, REMAKE-213 the frozen units' ice shell still). The asset pack's map-actions/hd/hd-manifest.json is the source of truth; this script turns it into
// src/game/content/map-action-hd.generated.ts after checking every file:
//
// - every entry is a clip with an original graphics timeline here (TECHNIQUE_LAB_FIRE for 1F-4F, the parsed 1H
//   presentation for heal-1, TECHNIQUE_LAB_HEAL for 2H/3H and the shared MAGIC/0 finish, which rest repeats, the
//   status techniques' TECHNIQUE_LAB_* tables, AA's for the clip FM shares, the parsed map-combat and shooting
//   presentations, WD's growth table, 1L-4L's main phases, wave pace and shared MAGIC/6 finish), and no clip appears
//   twice;
// - the original atlas (map-action-atlases/<atlas>.png + .json) each clip was made from still hashes the same, so a
//   later change to the original frames forces the HD version to be reviewed;
// - the timing contract: durationTicks equals the original timeline, frameStartTicks are the original frames' start
//   ticks, and the video holds exactly one frame per native tick (100 fps) for the original timeline plus the clip's
//   afterglow (REMAKE-204: the effect may fade out past the original's last frame instead of vanishing);
// - every MP4 matches its hash, holds one video track and no audio, has moov before mdat, and its size fits the
//   stacked layout (colour at 0,0 and 1 - alpha at alphaX,alphaY, not overlapping); no stray file ships under
//   map-actions/hd/;
// - a still (REMAKE-209: 1D-3D's leg and shadow, which the battle moves by code; REMAKE-213: the shell the battle keeps
//   on a frozen unit) is one stacked RGB PNG with no timeline: 0 ticks, one frame start at 0, no afterglow, and its
//   origin at the original picture's top-left.
//
// `--import <workbench export>` first copies the files from the git-ignored workbench (tmp/fx-hd/export-pack, made by
// its tools/export_hd.py) into the asset pack and rewrites the manifest. The workbench never ships.

import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(root, "public/assets/original");
const hdRoot = path.join(assetRoot, "map-actions/hd");
const manifestPath = path.join(hdRoot, "hd-manifest.json");
const generatedModule = path.join(root, "src/game/content/map-action-hd.generated.ts");
const FORMAT = "ANGEL2 HD map actions";
const VERSION = 3;
const FPS = 100;
const SCALE = 4;
/** Longest afterglow a clip may carry past the original timeline (native ticks). */
const MAX_AFTERGLOW = 100;
/** How far (native px) a clip's target point may lie outside its picture: 4L's pillar stops one tile above the struck
 * unit, so its target sits below the frame; more than one map tile means a wrong origin. */
const MAX_ORIGIN_OUTSIDE = 44;
/** Clips drawn from another action's atlas (the shared healing finish lives in the 1H atlas). */
const ATLAS = {
  "heal-tail": "heal-1", recovery: "recovery-1", ice: "ice-1",
  // REMAKE-213: the frozen units' shell is MAGIC/10's last frame, from the ice atlas
  "ice-shell": "ice-1",
  // REMAKE-210: the shared MAGIC/6 finish is exported from 1L's atlas
  "lightning-cleanup": "lightning-1",
  // the map-combat strike and death are battle sprites, not technique atlases
  hit: "../battle-sprite-atlases/map-combat", death: "../battle-sprite-atlases/map-combat",
};

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const fail = (message) => {
  throw new Error(`map action HD catalog: ${message}`);
};

const load = async (file) => (await runnerImport(path.join(root, file), { root, logLevel: "silent" })).module;
const lab = await load("src/game/content/technique-lab.generated.ts");
const { TECHNIQUE_LAB_FIRE, TECHNIQUE_LAB_HEAL } = lab;
/** `REMAKE-205`: single-target status techniques, by clip (each clip is its atlas; FM replays AA's presentation). */
const STATUS = {
  "attack-up": lab.TECHNIQUE_LAB_ATTACK_UP, "defense-up": lab.TECHNIQUE_LAB_DEFENSE_UP,
  "attack-down": lab.TECHNIQUE_LAB_ATTACK_DOWN, "defense-down": lab.TECHNIQUE_LAB_DEFENSE_DOWN,
  confusion: lab.TECHNIQUE_LAB_CONFUSION, "spell-seal": lab.TECHNIQUE_LAB_SPELL_SEAL, poison: lab.TECHNIQUE_LAB_POISON,
};
const { STAGE0_ACTION_PRESENTATION_ASSETS, STAGE0_REST_PRESENTATION } = await load("src/game/content/stage0-actions.generated.ts");
const { STAGE1_ACTION_PRESENTATION } = await load("src/game/content/stage1-actions.generated.ts");
const techniqueEvidence = JSON.parse(await readFile(path.join(root, "reverse/parsed/native/technique-presentations.json"), "utf8"));
const combatEvidence = JSON.parse(await readFile(path.join(root, "reverse/parsed/native/combat-presentations.json"), "utf8"));
const shootingEvidence = JSON.parse(await readFile(path.join(root, "reverse/parsed/native/shooting-presentations.json"), "utf8"));

/** Draw counts and waits of each clip's original phases, in the order the controller emits them. */
function originalPhases(clipId) {
  const fire = { "fire-1": "1F", "fire-2": "2F", "fire-3": "3F", "fire-4": "4F" }[clipId];
  if (fire) {
    return TECHNIQUE_LAB_FIRE[fire].phases.map((phase) => ({ draws: phase.descriptorSequence.length, wait: phase.waitPerDrawNativeTicks }));
  }
  if (clipId === "heal-1") {
    // `UN/61` tile codes 1..39 and a blank tile 0, one draw every 5 ticks; the controller draws the 39 atlas frames
    // and then its blank cleanup frame
    const primary = techniqueEvidence.presentations.heal.actions.find(({ code }) => code === "1H").phases[0];
    if (primary.drawCount !== STAGE0_ACTION_PRESENTATION_ASSETS.heal1.primary.length + 1) fail("1H draw count disagrees with its atlas");
    return [{ draws: primary.drawCount, wait: primary.waitPerDrawNativeTicks }];
  }
  if (clipId === "heal-tail") {
    // the MAGIC/0 finish every heal ends with; rest (`DS:60E0`) draws the same five descriptors at the same pace
    const finish = TECHNIQUE_LAB_HEAL["2H"].phases.at(-1);
    if (finish.resource !== "MAGIC/0" || STAGE0_REST_PRESENTATION.frameCount !== finish.drawCount
      || STAGE0_REST_PRESENTATION.waitPerFrameNativeTicks !== finish.waitPerDrawNativeTicks) {
      fail("the healing finish and rest no longer share one timeline");
    }
    return [{ draws: finish.drawCount, wait: finish.waitPerDrawNativeTicks }];
  }
  const heal = { "heal-2": "2H", "heal-3": "3H" }[clipId];
  if (heal) {
    return TECHNIQUE_LAB_HEAL[heal].phases.slice(0, -1).map((phase) => ({ draws: phase.drawCount, wait: phase.waitPerDrawNativeTicks }));
  }
  if (clipId === "attack-up" && JSON.stringify(lab.TECHNIQUE_LAB_MAGIC_GUARD.phases) !== JSON.stringify(STATUS["attack-up"].phases)) {
    fail("FM no longer replays AA's presentation, so it cannot share the attack-up clip");
  }
  if (Object.hasOwn(STATUS, clipId)) {
    return STATUS[clipId].phases.map((phase) => ({ draws: phase.drawCount, wait: phase.waitPerDrawNativeTicks }));
  }
  if (clipId === "recovery") {
    // REMAKE-206: 1I-3I draw the same MAGIC/20 presentation (the tiers differ only in range and amount)
    const [one, two, three] = [1, 2, 3].map((tier) => STAGE1_ACTION_PRESENTATION[`recovery${tier}`].presentation);
    if (JSON.stringify(one) !== JSON.stringify(two) || JSON.stringify(one) !== JSON.stringify(three)) {
      fail("1I-3I no longer share one presentation");
    }
    return [{ draws: one.descriptorSequence.length, wait: one.waitPerDrawNativeTicks }];
  }
  if (clipId === "ice") {
    // REMAKE-206: one MAGIC/10 cycle, which every ice tier replays once per ring
    const cycles = ["1C", "2C", "3C", "4C"].map((code) => lab.TECHNIQUE_LAB_ICE[code].cycle);
    if (cycles.some((cycle) => JSON.stringify(cycle) !== JSON.stringify(cycles[0]))) fail("1C-4C no longer share one cycle");
    return [{ draws: cycles[0].descriptorSequence.length, wait: cycles[0].waitPerDrawNativeTicks }];
  }
  if (clipId === "dispel") {
    // UN/57's runtime tile states: the five streams entering (phase 1), then the landing burst (phase 2)
    const { phase1, phase2 } = lab.TECHNIQUE_LAB_DISPEL.dynamicPresentation;
    return [phase1, phase2].map((phase) => ({ draws: phase.drawCount, wait: phase.waitPerDrawNativeTicks }));
  }
  if (clipId === "hit") {
    // REMAKE-207: UN/62 draws tile codes 0..7 and then 0 again, 10 ticks each, for the strike and the counter alike
    const { hit } = combatEvidence.mapPresentation;
    const waits = hit.frameTimeline.flatMap((step) => step.eachWaitNativeTicks === undefined ? [] : [step.eachWaitNativeTicks]);
    if (waits.length === 0 || waits.some((wait) => wait !== waits[0])
      || hit.totalGraphicFrames * waits[0] !== hit.fixedGraphicWaitNativeTicks) {
      fail("UN/62 no longer draws its frames at one pace");
    }
    return [{ draws: hit.totalGraphicFrames, wait: waits[0] }];
  }
  if (clipId === "death") {
    // REMAKE-207: MAGIC/12's descriptors at 10 ticks, once per dying unit (map combat and a technique's kill alike)
    const { death } = combatEvidence.mapPresentation;
    if (death.descriptorCount * death.waitPerDescriptorNativeTicks !== death.fixedWaitNativeTicks) fail("MAGIC/12 timing disagrees");
    return [{ draws: death.descriptorCount, wait: death.waitPerDescriptorNativeTicks }];
  }
  if (clipId === "shoot") {
    // REMAKE-208: UN/60's eight frames between the blank draws that open and close the archer's hit; 3V's line grows
    // the same frames a cell at a time (each cell from its own step), which the HD clock stretches to 20 ticks
    const { commonImpact, lineEffect } = shootingEvidence;
    const codes = commonImpact.timeline.tileCodes;
    if (codes[0] !== 0 || codes.at(-1) !== 0 || lineEffect.graphicResource !== commonImpact.graphicResource) {
      fail("the archer's hit and 3V's line no longer share UN/60's frames");
    }
    return [{ draws: codes.length - 2, wait: commonImpact.timeline.waitPerDrawNativeTicks }];
  }
  if (clipId === "wd") {
    // REMAKE-208: WD's ten frames at its growth and finish pace, each path cell playing them from its own step
    const { wd } = STAGE1_ACTION_PRESENTATION;
    return [{ draws: wd.finishSteps, wait: wd.waitPerGrowthOrFinishStepNativeTicks }];
  }
  const lightning = /^lightning-([1234])-(main|hit|marker)$/u.exec(clipId);
  if (lightning) {
    // REMAKE-210: the main part is every main-phase descriptor in order; the sweep frames (codes 1..sweepWidth) run at the
    // wave pace. REMAKE-211: the struck units' marker covers every wave draw (its two frames alternating), so in HD a
    // unit keeps it from the draw the wave reaches it to the end of the wave
    const definition = STAGE1_ACTION_PRESENTATION[`lightning${lightning[1]}`];
    if (lightning[2] === "main") {
      return definition.phases.map((phase) => ({ draws: phase.descriptorSequence.length, wait: phase.waitPerDrawNativeTicks }));
    }
    const hit = definition.commonHit;
    const draws = lightning[2] === "hit" ? hit.sweepWidth : hit.iterations * hit.waveDrawsPerIteration;
    return [{ draws, wait: hit.waitPerWaveDrawNativeTicks }];
  }
  if (clipId === "lightning-cleanup") {
    // REMAKE-210: MAGIC/6's five draws on every struck unit, the same for all four tiers
    const cleanups = [1, 2, 3, 4].map((tier) => JSON.stringify(STAGE1_ACTION_PRESENTATION[`lightning${tier}`].commonHit.cleanup));
    if (cleanups.some((cleanup) => cleanup !== cleanups[0])) fail("1L-4L no longer share one MAGIC/6 finish");
    const { cleanup } = STAGE1_ACTION_PRESENTATION.lightning1.commonHit;
    return [{ draws: cleanup.descriptorSequence.length, wait: cleanup.waitPerDrawNativeTicks }];
  }
  return fail(`${clipId} has no original timeline to check`);
}

/** Start tick of every original frame, in the order the controller emits them, and the timeline's total. */
function originalTimeline(clipId) {
  const starts = [];
  let tick = 0;
  for (const { draws, wait } of originalPhases(clipId)) {
    for (let index = 0; index < draws; index += 1) {
      starts.push(tick);
      tick += wait;
    }
  }
  return { starts, duration: tick };
}

/** The original atlas a clip was made from (a stomp still comes from its tier's atlas). */
function atlasFor(clipId) {
  return ATLAS[clipId] ?? /^(stomp-[123])-side[12]-(?:leg|shadow)$/u.exec(clipId)?.[1]
    ?? /^(lightning-[1234])-(?:main|hit|marker)$/u.exec(clipId)?.[1] ?? clipId;
}

/**
 * `REMAKE-209`: the stomp's leg and shadow are stills the battle moves, one per tier, target side and part;
 * `REMAKE-213`: the shell a frozen unit keeps until the freeze ends.
 */
const isStill = (clipId) => clipId === "ice-shell" || /^stomp-[123]-side[12]-(?:leg|shadow)$/u.test(clipId);

/** Width, height and colour type of a PNG (the IHDR chunk right after the signature). */
function pngHeader(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(signature) || buffer.toString("latin1", 12, 16) !== "IHDR") return undefined;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), colourType: buffer[25] };
}

async function originalAtlasSha256(clipId) {
  const base = path.join(assetRoot, "map-action-atlases", atlasFor(clipId));
  return sha256(Buffer.concat([await readFile(`${base}.png`), await readFile(`${base}.json`)]));
}

/** ISO BMFF boxes directly inside `buffer[start, end)`. */
function* boxes(buffer, start = 0, end = buffer.length) {
  let offset = start;
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      size = Number(buffer.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) size = end - offset;
    if (size < header || offset + size > end) fail(`malformed MP4 box ${type} at ${offset}`);
    yield { type, start: offset + header, end: offset + size };
    offset += size;
  }
}

const child = (buffer, parent, type) => (parent ? [...boxes(buffer, parent.start, parent.end)] : [])
  .find((box) => box.type === type);

/** Each track's handler, display size and sample (frame) count. */
function mp4Tracks(buffer) {
  const top = [...boxes(buffer)];
  if (top[0]?.type !== "ftyp") fail("MP4 does not start with ftyp");
  const moov = top.find((box) => box.type === "moov");
  if (!moov) fail("MP4 has no moov box");
  if (top.findIndex((box) => box.type === "moov") > top.findIndex((box) => box.type === "mdat")) {
    fail("MP4 moov box is not before mdat (encode with -movflags +faststart)");
  }
  return [...boxes(buffer, moov.start, moov.end)].filter((box) => box.type === "trak").map((trak) => {
    const tkhd = child(buffer, trak, "tkhd");
    const mdia = child(buffer, trak, "mdia");
    const hdlr = child(buffer, mdia, "hdlr");
    const stsz = child(buffer, child(buffer, child(buffer, mdia, "minf"), "stbl"), "stsz");
    if (!tkhd || !hdlr || !stsz) fail("trak without tkhd, hdlr or stsz");
    return {
      handler: buffer.toString("latin1", hdlr.start + 8, hdlr.start + 12),
      // tkhd ends with width and height as 16.16 fixed point; stsz: version/flags, sample size, sample count.
      width: buffer.readUInt32BE(tkhd.end - 8) / 65536,
      height: buffer.readUInt32BE(tkhd.end - 4) / 65536,
      samples: buffer.readUInt32BE(stsz.start + 8),
    };
  });
}

async function importWorkbench(workbench) {
  const exported = JSON.parse(await readFile(path.join(workbench, "manifest.json"), "utf8"));
  if (exported.format !== "angel2-map-action-hd-export" || exported.version !== 3) fail("unexpected workbench export format");
  await rm(hdRoot, { recursive: true, force: true });
  const clips = [];
  for (const entry of exported.clips) {
    await mkdir(path.join(hdRoot, entry.clipId), { recursive: true });
    const file = entry.still ? "hd.png" : "hd.mp4";
    await copyFile(path.join(workbench, entry.file), path.join(hdRoot, entry.clipId, file));
    clips.push({
      clipId: entry.clipId,
      ...(entry.still ? { still: true } : {}),
      output: `map-actions/hd/${entry.clipId}/${file}`,
      bytes: entry.bytes,
      sha256: entry.sha256,
      width: entry.width,
      height: entry.height,
      frames: entry.frames,
      fps: entry.fps,
      scale: entry.scale,
      frameWidth: entry.frameWidth,
      frameHeight: entry.frameHeight,
      originX: entry.originX,
      originY: entry.originY,
      alphaX: entry.alphaX,
      alphaY: entry.alphaY,
      durationTicks: entry.durationTicks,
      afterglowTicks: entry.afterglowTicks,
      frameStartTicks: entry.frameStartTicks,
      originalAtlasSha256: await originalAtlasSha256(entry.clipId),
    });
  }
  const manifest = {
    format: FORMAT,
    version: VERSION,
    decisions: [
      "REMAKE-203", "REMAKE-204", "REMAKE-205", "REMAKE-206", "REMAKE-207", "REMAKE-208", "REMAKE-209", "REMAKE-210",
      "REMAKE-211", "REMAKE-212", "REMAKE-213",
    ],
    video: "H.264 yuv420p CRF 14, 100 fps (one frame per native tick, the original timeline plus the afterglow), "
      + "faststart, no audio; stacked colour x alpha and 1 - alpha halves with an 8 px gap, side by side when the frame "
      + "is taller than wide",
    still: "RGB PNG in the same stacked layout, one picture the battle places by code (REMAKE-209 stomp, REMAKE-213 ice shell)",
    clips,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function validate(manifest) {
  if (manifest.format !== FORMAT || manifest.version !== VERSION) fail("unexpected manifest format");
  const seen = new Set();
  const expectedFiles = new Set(["hd-manifest.json"]);
  for (const entry of manifest.clips) {
    const label = entry.clipId;
    if (seen.has(label)) fail(`${label} appears twice`);
    seen.add(label);
    if (Boolean(entry.still) !== isStill(label)) fail(`${label} must ${isStill(label) ? "" : "not "}be a still`);
    const timeline = entry.still ? { duration: 0, starts: [0] } : originalTimeline(label);
    if (entry.originalAtlasSha256 !== await originalAtlasSha256(label)) {
      fail(`${label} was made from different original frames; review the HD version before shipping it`);
    }
    if (entry.durationTicks !== timeline.duration) fail(`${label} lasts ${entry.durationTicks} ticks, the original ${timeline.duration}`);
    if (JSON.stringify(entry.frameStartTicks) !== JSON.stringify(timeline.starts)) {
      fail(`${label} frame start ticks differ from the original timeline`);
    }
    if (!Number.isInteger(entry.afterglowTicks) || entry.afterglowTicks < 0 || entry.afterglowTicks > MAX_AFTERGLOW) {
      fail(`${label} afterglow must be 0..${MAX_AFTERGLOW} native ticks`);
    }
    if (entry.still ? entry.frames !== 1 || entry.afterglowTicks !== 0
      : entry.fps !== FPS || entry.frames !== entry.durationTicks + entry.afterglowTicks) {
      fail(entry.still ? `${label} must be one picture without an afterglow`
        : `${label} must hold one frame per native tick at ${FPS} fps for its timeline and afterglow`);
    }
    if (entry.scale !== SCALE) fail(`${label} scale must be ${SCALE}`);
    const outside = MAX_ORIGIN_OUTSIDE * SCALE;
    if (entry.originX < -outside || entry.originX > entry.frameWidth + outside
      || entry.originY < -outside || entry.originY > entry.frameHeight + outside) {
      fail(`${label} target origin lies more than one tile outside the frame`);
    }
    const sideBySide = entry.alphaX > 0;
    if (sideBySide ? entry.alphaY !== 0 || entry.alphaX < entry.frameWidth : entry.alphaX !== 0 || entry.alphaY < entry.frameHeight) {
      fail(`${label} colour and alpha halves overlap`);
    }
    if (entry.alphaX + entry.frameWidth > entry.width || entry.alphaY + entry.frameHeight > entry.height
      || entry.width % 2 || entry.height % 2) {
      fail(`${label} ${entry.width}x${entry.height} video does not fit its stacked layout`);
    }
    const video = await readFile(path.join(assetRoot, entry.output));
    if (sha256(video) !== entry.sha256 || video.length !== entry.bytes) fail(`${entry.output} does not match the manifest`);
    if (entry.still) {
      const png = pngHeader(video);
      if (!png || png.colourType !== 2) fail(`${entry.output} must be an RGB PNG (the stacked halves carry the alpha)`);
      if (png.width !== entry.width || png.height !== entry.height) {
        fail(`${entry.output} is ${png.width}x${png.height}, manifest says ${entry.width}x${entry.height}`);
      }
      expectedFiles.add(path.relative("map-actions/hd", entry.output));
      continue;
    }
    const tracks = mp4Tracks(video);
    if (tracks.length !== 1 || tracks[0].handler !== "vide") fail(`${entry.output} must hold exactly one video track and no audio`);
    if (tracks[0].width !== entry.width || tracks[0].height !== entry.height) {
      fail(`${entry.output} is ${tracks[0].width}x${tracks[0].height}, manifest says ${entry.width}x${entry.height}`);
    }
    if (tracks[0].samples !== entry.frames) fail(`${entry.output} holds ${tracks[0].samples} frames, manifest says ${entry.frames}`);
    expectedFiles.add(path.relative("map-actions/hd", entry.output));
  }
  const shippedFiles = [];
  for (const entry of await readdir(hdRoot, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) shippedFiles.push(path.relative(hdRoot, path.join(entry.parentPath, entry.name)));
  }
  const stray = shippedFiles.filter((file) => !expectedFiles.has(file));
  if (stray.length > 0) fail(`stray files under map-actions/hd/: ${stray.join(", ")}`);
}

const importIndex = process.argv.indexOf("--import");
const manifest = importIndex >= 0
  ? await importWorkbench(path.resolve(process.argv[importIndex + 1] ?? ""))
  : JSON.parse(await readFile(manifestPath, "utf8"));
await validate(manifest);

const clips = [...manifest.clips].sort((a, b) => a.clipId.localeCompare(b.clipId));
const entries = clips.map((entry) => [
  `  ${JSON.stringify(entry.clipId)}: {`,
  `    clipId: ${JSON.stringify(entry.clipId)},${entry.still ? " still: true," : ""}`,
  `    video: { source: ${JSON.stringify(`/assets/original/${entry.output}`)}, width: ${entry.width}, height: ${entry.height}, frames: ${entry.frames}, fps: ${entry.fps} },`,
  `    scale: ${entry.scale}, frameWidth: ${entry.frameWidth}, frameHeight: ${entry.frameHeight},`,
  `    originX: ${entry.originX}, originY: ${entry.originY}, alphaX: ${entry.alphaX}, alphaY: ${entry.alphaY},`,
  `    durationTicks: ${entry.durationTicks}, afterglowTicks: ${entry.afterglowTicks},`,
  `    frameStartTicks: ${JSON.stringify(entry.frameStartTicks)},`,
  "  },",
].join("\n"));
await writeFile(generatedModule, [
  "// Generated by scripts/generate-map-action-hd.mjs from map-actions/hd/hd-manifest.json; do not edit by hand.",
  "import type { MapActionHdClip } from \"./map-action-hd\";",
  "",
  "export const MAP_ACTION_HD_CLIPS: Readonly<Record<string, MapActionHdClip>> = {",
  ...entries,
  "};",
  "",
].join("\n"));
const bytes = clips.reduce((sum, entry) => sum + entry.bytes, 0);
console.log(`map action HD catalog: ${clips.length} clips, ${(bytes / 1024 / 1024).toFixed(1)} MiB -> ${path.relative(root, generatedModule)}`);
