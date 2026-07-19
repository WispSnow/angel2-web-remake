#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MODULE29_DATA_BASE = 0x1eba0;
const MODULE29_SHA256 = "6e1ad6deb65fa9db48c9853f4b2564829d41954891d063ead84be027befc19c4";
const MUSIC_ALIAS_TABLE_OFFSET = 0x19f6;
const PLAYER_PHASE_TABLE_OFFSET = 0x1d98;
const ENEMY_PHASE_TABLE_OFFSET = 0x1e46;
const MUSIC_ALIAS_COUNT = 31;
const MUSIC_ALIAS_BYTES = 11;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function parseAliases(module29) {
  return Array.from({ length: MUSIC_ALIAS_COUNT }, (_, index) => {
    const offset = MODULE29_DATA_BASE + MUSIC_ALIAS_TABLE_OFFSET + index * MUSIC_ALIAS_BYTES;
    const mode = module29[offset];
    const record = module29[offset + 1];
    const legacyName = module29.subarray(offset + 2, offset + MUSIC_ALIAS_BYTES)
      .toString("ascii")
      .replace(/\$/g, "")
      .trim();
    assert(mode === 1 || mode === 2, `unexpected music alias mode ${mode} at index ${index}`);
    assert(legacyName.endsWith(".RIX"), `invalid music alias at index ${index}`);
    return {
      index,
      tableAddress: `DS:${(MUSIC_ALIAS_TABLE_OFFSET + index * MUSIC_ALIAS_BYTES).toString(16).toUpperCase().padStart(4, "0")}`,
      resourceMode: mode,
      container: mode === 1 ? "MUSIC" : "UN",
      record,
      legacyName,
    };
  });
}

function parseStageTable(module29, offset) {
  const entries = [];
  const firstIndexByStage = new Map();
  for (let cursor = offset; ; cursor += 4) {
    const fileOffset = MODULE29_DATA_BASE + cursor;
    const stage = module29.readInt16LE(fileOffset);
    const loopRecord = module29.readUInt16LE(fileOffset + 2);
    if (stage === -1) break;
    const reachable = !firstIndexByStage.has(stage);
    if (reachable) firstIndexByStage.set(stage, entries.length);
    entries.push({
      tableIndex: entries.length,
      tableAddress: `DS:${cursor.toString(16).toUpperCase().padStart(4, "0")}`,
      stage,
      entryRecord: loopRecord + 1,
      loopRecord,
      reachable,
      ...(reachable ? {} : { shadowedByTableIndex: firstIndexByStage.get(stage) }),
    });
  }
  return entries;
}

function stageUses(entries, loopRecord) {
  return entries
    .filter((entry) => entry.reachable && entry.loopRecord === loopRecord)
    .map((entry) => entry.stage);
}

const fixedRoles = new Map([
  [0, [{
    id: "passwordGate",
    function: "一次性图册密码门背景音乐",
    confidence: "confirmed",
    evidence: "模块 21 直接读取 MUSIC/0 并提交 RIX 驱动",
  }]],
  [1, [{
    id: "title",
    function: "标题菜单音乐",
    confidence: "confirmed",
    evidence: "模块 23 0000:0611–070A",
  }]],
  [14, [{
    id: "scrollingIntro",
    function: "标题前滚动开场音乐",
    confidence: "confirmed",
    evidence: "模块 23 0000:1034–117C",
  }]],
  [40, [{
    id: "prosperousEnding",
    function: "战绩总和不大于 100 时的繁荣结局音乐",
    confidence: "confirmed",
    evidence: "模块 35 0000:0470 分支",
  }]],
]);

function battleRoles(record, playerTable, enemyTable) {
  const isEntry = record >= 3 && record <= 39 && (record & 1) === 1;
  const loopRecord = isEntry ? record - 1 : record;
  const isBattleLoop = loopRecord >= 2
    && loopRecord <= 38
    && (loopRecord & 1) === 0
    && loopRecord !== 14
    && loopRecord !== 16;
  if (!isBattleLoop) return [];

  const playerStages = stageUses(playerTable, loopRecord);
  const enemyStages = stageUses(enemyTable, loopRecord);
  assert(playerStages.length + enemyStages.length > 0, `battle pair ${loopRecord}/${loopRecord + 1} has no stage use`);
  return [{
    id: isEntry ? "battlePhaseEntry" : "battlePhaseLoop",
    function: isEntry ? "战斗阵营阶段短入场" : "战斗阵营阶段循环主体",
    confidence: "confirmed",
    evidence: "模块 29 DS:1D98/1E46 逐关表与 1000:3796、1000:36E6 播放链",
    pair: {
      entryRecord: loopRecord + 1,
      loopRecord,
      playbackOrder: [loopRecord + 1, loopRecord],
    },
    stageUse: {
      playerPhase: playerStages,
      enemyPhase: enemyStages,
    },
  }];
}

function additionalRoles(record) {
  if (record === 25) {
    return [{
      id: "stage6BridgePreload",
      function: "场景 6 返回模块 25 时的桥接预载",
      confidence: "confirmed",
      evidence: "模块 27 0000:00DC–00F7 特例",
      note: "这不替代 MUSIC/25 作为战斗曲对 24/25 的短入场用途。",
    }];
  }
  if (record === 29) {
    return [{
      id: "ordinaryBattleHandoffPreload",
      function: "普通战斗准备结束后的模块 29 交接预载",
      confidence: "confirmed",
      evidence: "模块 27 0000:00DC–00F7",
      note: "这是模块交接/准备资源，不代表第 0 关玩家阶段实际使用 MUSIC/29。",
    }];
  }
  return [];
}

async function extract(modulePath, audioManifestPath, outputPath) {
  const [module29, audioManifestBuffer] = await Promise.all([
    readFile(modulePath),
    readFile(audioManifestPath),
  ]);
  assert(sha256(module29) === MODULE29_SHA256, "module 29 hash mismatch");
  const audioManifest = JSON.parse(audioManifestBuffer);
  const musicEntries = audioManifest.entries
    .filter((entry) => entry.group === "MUSIC")
    .sort((left, right) => left.record - right.record);
  assert(musicEntries.length === 41, "expected 41 decoded MUSIC records");
  assert(musicEntries.every((entry, index) => entry.record === index), "MUSIC records must be contiguous 0..40");

  const aliases = parseAliases(module29);
  const playerPhase = parseStageTable(module29, PLAYER_PHASE_TABLE_OFFSET);
  const enemyPhase = parseStageTable(module29, ENEMY_PHASE_TABLE_OFFSET);
  const musicAliases = new Map(
    aliases.filter((alias) => alias.container === "MUSIC").map((alias) => [alias.record, alias]),
  );

  const records = musicEntries.map((entry) => {
    const roles = [
      ...(fixedRoles.get(entry.record) ?? []),
      ...battleRoles(entry.record, playerPhase, enemyPhase),
      ...additionalRoles(entry.record),
    ];
    const unresolved = roles.length === 0 || [15, 16, 17].includes(entry.record);
    if ([16, 17].includes(entry.record)) {
      roles.push({
        id: "internalMusicBrowserOnly",
        function: "仅确认存在于模块 29 内置曲目浏览/测试表",
        confidence: "confirmed",
        evidence: `模块 29 DS:19F6 别名 ${musicAliases.get(entry.record)?.legacyName}`,
        note: "尚未找到发布流程中的剧情或战斗场景调用。",
      });
    }
    return {
      record: entry.record,
      key: `MUSIC/${entry.record}`,
      legacyName: musicAliases.get(entry.record)?.legacyName ?? null,
      source: entry.source,
      sourceBytes: entry.sourceBytes,
      sourceSha256: entry.sourceSha256,
      decodedOutput: entry.output,
      durationSeconds: entry.durationSeconds,
      status: unresolved ? "unknown-needs-manual-test" : "confirmed",
      roles,
      ...(entry.record === 15 ? {
        unknownReason: "模块 29 别名表、两张战斗逐关表和已闭合标题/密码/结局调用均未引用此记录。",
      } : {}),
      ...([16, 17].includes(entry.record) ? {
        unknownReason: "有原生别名和内置曲目浏览入口，但尚未绑定发布流程中的玩家可见场景。",
      } : {}),
    };
  });

  const catalog = {
    format: "ANGEL2 native MUSIC function catalog",
    version: 1,
    source: {
      module29: {
        path: path.relative(process.cwd(), modulePath),
        sha256: sha256(module29),
        dataSegmentFileBase: `0x${MODULE29_DATA_BASE.toString(16)}`,
      },
      audioManifest: {
        path: path.relative(process.cwd(), audioManifestPath),
        sha256: sha256(audioManifestBuffer),
      },
    },
    playbackProtocol: {
      pairedRecords: "除单曲例外外，偶数 N 是循环主体，N+1 是短入场。",
      order: "RIX 驱动先提交 N+1，再以 follow/loop 参数提交 N。",
      code: ["1000:32D1–338E", "1000:3796–37E7"],
      singleRecordExceptions: [0, 1, 14, 16, 17, 40, 72, 73, 74, 75, 76, 77, 78, 79, 80],
    },
    stageTables: {
      playerPhase: {
        address: "DS:1D98",
        calledFrom: "0000:4DCD 完整回合开始链",
        entries: playerPhase,
      },
      enemyPhase: {
        address: "DS:1E46",
        calledFrom: "0000:4E03 我方自动阶段结束、敌方 AI 开始链",
        entries: enemyPhase,
      },
      duplicateBoundary: "两表尾部各保留一个被前项遮蔽的 stage 38 重复项；按原生首次命中规则标为 reachable=false。",
    },
    nativeAliases: aliases,
    records,
    unresolvedRecords: records.filter((record) => record.status !== "confirmed").map((record) => record.record),
    firstStage: {
      prebattleStory: "MAGIC/73（不属于 MUSIC.SWF）",
      playerPhase: { entry: "MUSIC/7", loop: "MUSIC/6" },
      enemyPhase: { entry: "MUSIC/5", loop: "MUSIC/4" },
      empiricalConfirmation: "用户于 2026-07-19 实机确认第 0 关进入玩家阶段先播 MUSIC/7，再循环 MUSIC/6。",
    },
    evidenceBoundary: {
      confirmed: "MUSIC/0、1、2..14、18..40 的功能已由原生调用/逐关表绑定；第 0 关玩家阶段顺序另有实机确认。",
      unknown: "MUSIC/15 未见运行时别名或场景调用；MUSIC/16、17 只确认原生别名及内置曲目浏览入口，发布流程用途待手测。",
      caution: "模块 27 的 MUSIC/29 交接预载不能替代模块 29 内部的逐关回合选曲表。",
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`extracted MUSIC catalog: ${records.length} records, ${catalog.unresolvedRecords.length} unresolved`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [command, modulePath, audioManifestPath, outputPath] = process.argv.slice(2);
  if (command !== "--extract" || !modulePath || !audioManifestPath || !outputPath) {
    console.error("usage: angel2-music-catalog.mjs --extract <0029-unpacked.bin> <audio-manifest.json> <output.json>");
    process.exit(1);
  }
  await extract(modulePath, audioManifestPath, outputPath);
}

export { extract, parseAliases, parseStageTable };
