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

const MODULE27_SHA256 = "498d0d9c4609317bf3177ed07985053d0b23bc5b5cbae22f553c079b8a868e60";
const MUSIC_CONTAINER_INDEX = 8;
// 模块 27 出场准备例程：交互名单门、选曲分支和 RIX 提交点。
const DEPLOYMENT_SCREEN_GATE_OFFSET = 0x0584;
const DEPLOYMENT_MUSIC_SELECT_OFFSET = 0x06a1;
const DEPLOYMENT_MUSIC_PLAY_OFFSET = 0x0591;

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

const hex = (value, digits = 4) => value.toString(16).toUpperCase().padStart(digits, "0");

/**
 * 模块 27 拥有整个出场准备界面，并在画名单前给 RIX 驱动提交自己的循环曲。
 * 这里逐字节核验三段代码，而不是靠人工标注：
 *
 * - `0000:0584` 用 DS:`0FF6`（当前空部署格）判断本关是否显示交互名单；
 * - `0000:06A1` 比较当前场景与阈值，分别把两条 `MUSIC` 记录读进 DS:`00B3` 缓冲；
 * - `0000:0591` 以驱动命令 1、模式 1（无限循环）提交该缓冲。
 */
function parseDeploymentScreenMusic(module27) {
  const gate = module27.subarray(DEPLOYMENT_SCREEN_GATE_OFFSET, DEPLOYMENT_SCREEN_GATE_OFFSET + 7);
  assert(
    gate.equals(Buffer.from([0x83, 0x3e, 0xf6, 0x0f, 0x00, 0x75, 0x03])),
    "module 27 deployment screen gate does not test DS:0FF6",
  );

  const select = module27.subarray(DEPLOYMENT_MUSIC_SELECT_OFFSET, DEPLOYMENT_MUSIC_SELECT_OFFSET + 0x2c);
  assert(select[0] === 0xa1 && select.readUInt16LE(1) === 0x02b6, "expected `mov ax,[scene]`");
  assert(select[3] === 0x3d && select[6] === 0x77, "expected `cmp ax,imm16` + `ja`");
  const threshold = select.readUInt16LE(4);
  const branches = [
    { start: 0x08, atOrBelowThreshold: true },
    { start: 0x1a, atOrBelowThreshold: false },
  ].map(({ start, atOrBelowThreshold }) => {
    const branch = select.subarray(start, start + 0x12);
    assert(branch[0] === 0xa1 && branch.readUInt16LE(1) === 0x00b3, "expected `mov ax,[musicBuffer]`");
    assert(branch[8] === 0xb9 && branch[11] === 0xbb, "expected `mov cx,record` + `mov bx,container`");
    assert(
      branch.readUInt16LE(12) === MUSIC_CONTAINER_INDEX,
      "deployment music must load from the MUSIC container",
    );
    return { record: branch.readUInt16LE(9), atOrBelowThreshold };
  });

  const play = module27.subarray(DEPLOYMENT_MUSIC_PLAY_OFFSET, DEPLOYMENT_MUSIC_PLAY_OFFSET + 0x0f);
  assert(
    play.subarray(0, 4).equals(Buffer.from([0xff, 0x36, 0xb3, 0x00])),
    "expected the music buffer segment to be pushed first",
  );
  assert(
    play.subarray(4, 10).equals(Buffer.from([0x6a, 0x00, 0x6a, 0x01, 0x6a, 0x01])),
    "expected RIX command 1 with loop mode 1 and a zero far-pointer offset",
  );
  assert(play[10] === 0x9a, "expected a far call into the RIX driver");

  return {
    gate: {
      address: `0000:${hex(DEPLOYMENT_SCREEN_GATE_OFFSET)}`,
      variable: "DS:0FF6",
      meaning: "当前空部署格为 0 的关卡不显示交互名单，也不播放这条曲子。",
    },
    select: {
      address: `0000:${hex(DEPLOYMENT_MUSIC_SELECT_OFFSET)}`,
      sceneVariable: "DS:02B6",
      threshold,
      atOrBelowThresholdRecord: branches.find((branch) => branch.atOrBelowThreshold).record,
      aboveThresholdRecord: branches.find((branch) => !branch.atOrBelowThreshold).record,
    },
    play: {
      address: `0000:${hex(DEPLOYMENT_MUSIC_PLAY_OFFSET)}`,
      command: 1,
      mode: 1,
      meaning: "单曲无限循环，不是入场/循环曲对。",
    },
  };
}

function deploymentRoles(record, deployment) {
  const { threshold, atOrBelowThresholdRecord, aboveThresholdRecord } = deployment.select;
  const isEarly = record === atOrBelowThresholdRecord;
  if (!isEarly && record !== aboveThresholdRecord) return [];
  return [{
    id: isEarly ? "deploymentScreenEarlyScenes" : "deploymentScreenLateScenes",
    function: isEarly
      ? `场景 0..${threshold} 的出场准备界面音乐`
      : `场景 ${threshold + 1} 起的出场准备界面音乐`,
    confidence: "confirmed",
    evidence: `模块 27 ${deployment.select.address} 选曲分支与 ${deployment.play.address} RIX 提交`,
    note: "以命令 1／模式 1 单曲循环，随模块 27 退出而停止；无交互名单的关卡不播放。",
  }];
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

async function extract(modulePath, module27Path, audioManifestPath, outputPath) {
  const [module29, module27, audioManifestBuffer] = await Promise.all([
    readFile(modulePath),
    readFile(module27Path),
    readFile(audioManifestPath),
  ]);
  assert(sha256(module29) === MODULE29_SHA256, "module 29 hash mismatch");
  assert(sha256(module27) === MODULE27_SHA256, "module 27 hash mismatch");
  const deployment = parseDeploymentScreenMusic(module27);
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
      ...deploymentRoles(entry.record, deployment),
    ];
    const unresolved = roles.length === 0;
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
        unknownReason: "模块 29 别名表、两张战斗逐关表和已闭合标题/密码/结局/出场准备调用均未引用此记录；原始 RIX 与 MUSIC/16 字节完全相同。",
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
      module27: {
        path: path.relative(process.cwd(), module27Path),
        sha256: sha256(module27),
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
    deploymentScreen: {
      module: 27,
      ...deployment,
      lifetime: "模块 25 在剧情结束时关闭 RIX 驱动，模块 27 重新初始化后才起这条曲；它随模块 27 退出而停止，随后由模块 29 起本关战斗曲对。",
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
      confirmed: "MUSIC/0、1、2..14、16..40 的功能已由原生调用/逐关表绑定；第 0 关玩家阶段顺序另有实机确认。",
      unknown: "MUSIC/15 未见运行时别名或场景调用。",
      caution: "模块 27 0000:00DC–00F7 的 0x1D/0x19 是写给父接口偏移 8 的下一模块号（29／25），不是 MUSIC 记录号；模块 27 真正的音乐调用在 0000:06A1 与 0000:0591。",
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`extracted MUSIC catalog: ${records.length} records, ${catalog.unresolvedRecords.length} unresolved`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [command, modulePath, module27Path, audioManifestPath, outputPath] = process.argv.slice(2);
  if (command !== "--extract" || !modulePath || !module27Path || !audioManifestPath || !outputPath) {
    console.error(
      "usage: angel2-music-catalog.mjs --extract <0029-unpacked.bin> <0027-unpacked.bin> <audio-manifest.json> <output.json>",
    );
    process.exit(1);
  }
  await extract(modulePath, module27Path, audioManifestPath, outputPath);
}

export { extract, parseAliases, parseStageTable, parseDeploymentScreenMusic };
