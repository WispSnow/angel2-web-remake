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
// 模块 29 启动时在 `1000:03D6` 把资源容器描述表的指针写进 DS:`FB2F`；`0000:FD8E` 以 BX 为该表
// 下标取容器。下文所有 `mov bx,imm` 都经这张表解析成文件名，不手抄“8 = MUSIC”一类对照。
const CONTAINER_TABLE_POINTER_WRITE_OFFSET = 0x103d6;
// 别名试听例程：`1000:338F` 按模式字节分成两支，各自 `mov bx,imm` 选容器。
const ALIAS_PLAY_OFFSET = 0x1338f;
// 敌方阶段起始 `1000:3680` 由 `0000:4E03` 链在 `0000:4E1F` 远调用，只在 `1000:36BB` 选一次曲；
// 被调用的 `1000:36E6` 先比较当前场景，场景 37 绕过 DS:1E46 逐关表。
const ENEMY_PHASE_START_FAR_CALL_OFFSET = 0x04e1f;
const ENEMY_PHASE_START_OFFSET = 0x13680;
const ENEMY_PHASE_MUSIC_CALL_OFFSET = 0x136bb;
const ENEMY_PHASE_MUSIC_SELECT_OFFSET = 0x136e6;
const STAGE_TABLE_LOOKUP_OFFSET = 0x139a8;
const PAIR_PLAYBACK_OFFSET = 0x13796;
// `1000:3796` 曲对提交里第二次 RIX 远调用；场景 37 分支必须进同一个驱动入口。
const PAIR_PLAYBACK_DRIVER_CALL_OFFSET = 0x137df;
const RESOURCE_LOADER_FAR_CALL = [0x9a, 0x8e, 0xfd, 0x00, 0x00];

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

const hex = (value, digits = 4) => value.toString(16).toUpperCase().padStart(digits, "0");
const segmentAddress = (offset) => `${hex((offset >>> 16) * 0x1000)}:${hex(offset & 0xffff)}`;

const expectBytes = (image, offset, bytes, message) => assert(
  image.subarray(offset, offset + bytes.length).equals(Buffer.from(bytes)),
  message,
);

// 近调用目标只在调用点所在的 64 KiB 代码段内回绕。
function nearCallTarget(image, offset) {
  assert(image[offset] === 0xe8, `expected a near call at ${segmentAddress(offset)}`);
  const segmentBase = offset - (offset & 0xffff);
  return segmentBase + ((offset + 3 - segmentBase + image.readInt16LE(offset + 1)) & 0xffff);
}

// 远调用的 seg:off 拆分是任意的，只能按线性地址比较。
function farCallTarget(image, offset) {
  assert(image[offset] === 0x9a, `expected a far call at ${segmentAddress(offset)}`);
  return image.readUInt16LE(offset + 3) * 16 + image.readUInt16LE(offset + 1);
}

function callersOf(image, codeEnd, target) {
  const callers = [];
  for (let offset = 0; offset + 5 <= codeEnd; offset += 1) {
    if (image[offset] === 0xe8 && nearCallTarget(image, offset) === target) callers.push(offset);
    if (image[offset] === 0x9a && farCallTarget(image, offset) === target) callers.push(offset);
  }
  return callers;
}

/**
 * DS:`FB2F` 指向的表每项是一个描述符指针，描述符为“句柄字 + ASCIIZ 文件名”，表以 `FFFFh`
 * 结束。`0000:FD8E` 取 `[表 + BX*2]`，所以调用前 `mov bx,imm` 的立即数就是这里的下标。
 */
function parseResourceContainers(module29) {
  expectBytes(
    module29,
    CONTAINER_TABLE_POINTER_WRITE_OFFSET,
    [0xc7, 0x06, 0x2f, 0xfb],
    "expected `mov word [FB2F],imm16` at 1000:03D6",
  );
  const table = module29.readUInt16LE(CONTAINER_TABLE_POINTER_WRITE_OFFSET + 4);
  const entries = [];
  for (let index = 0; ; index += 1) {
    const pointer = module29.readUInt16LE(MODULE29_DATA_BASE + table + index * 2);
    if (pointer === 0xffff) break;
    const nameStart = MODULE29_DATA_BASE + pointer + 2;
    const fileName = module29.subarray(nameStart, module29.indexOf(0, nameStart)).toString("ascii");
    assert(/^[A-Z_0-9]+\.SWF$/u.test(fileName), `unexpected resource container ${index}: ${fileName}`);
    entries.push({ index, descriptor: `DS:${hex(pointer)}`, fileName, container: fileName.slice(0, -4) });
  }
  assert(entries.length === 14, `expected 14 module 29 resource containers, found ${entries.length}`);
  return {
    pointerWrite: segmentAddress(CONTAINER_TABLE_POINTER_WRITE_OFFSET),
    pointerVariable: "DS:FB2F",
    table: `DS:${hex(table)}`,
    loader: "0000:FD8E",
    entries,
  };
}

const containerAt = (containers, index) => {
  const entry = containers.entries[index];
  assert(entry, `resource container index ${index} is outside the module 29 table`);
  return entry.container;
};

/**
 * 别名试听 `1000:338F`：模式字节为 2 时跳到另一支。两支各以 `mov bx,imm` 选容器后调
 * `0000:FD8E`，因此模式 1 读 MUSIC.SWF、模式 2 读 MAGIC.SWF——`T01..T08.RIX` 就是模块 25
 * 的剧情曲 `MAGIC/72..79`，不是 UN.SWF（该容器只有记录 0..62）。
 */
function parseAliasModeContainers(module29, containers) {
  expectBytes(
    module29,
    ALIAS_PLAY_OFFSET,
    [0x80, 0x3e, 0xf5, 0x19, 0x02, 0x74],
    "expected `cmp byte [19F5],2` + `jz` at 1000:338F",
  );
  const branchContainer = (branch) => {
    // mov ax,[0365] ; mov es,ax ; mov di,0 ; mov cx,[19F1] ; mov bx,imm16 ; call far 0000:FD8E
    expectBytes(
      module29,
      branch,
      [0xa1, 0x65, 0x03, 0x8e, 0xc0, 0xbf, 0x00, 0x00, 0x8b, 0x0e, 0xf1, 0x19, 0xbb],
      `expected the alias record load at ${segmentAddress(branch)}`,
    );
    expectBytes(module29, branch + 15, RESOURCE_LOADER_FAR_CALL, `expected 0000:FD8E at ${segmentAddress(branch + 15)}`);
    return containerAt(containers, module29.readUInt16LE(branch + 13));
  };
  const modeOneBranch = ALIAS_PLAY_OFFSET + 7;
  const modeTwoBranch = modeOneBranch + module29.readInt8(ALIAS_PLAY_OFFSET + 6);
  return new Map([[1, branchContainer(modeOneBranch)], [2, branchContainer(modeTwoBranch)]]);
}

function parseAliases(module29, modeContainers) {
  return Array.from({ length: MUSIC_ALIAS_COUNT }, (_, index) => {
    const offset = MODULE29_DATA_BASE + MUSIC_ALIAS_TABLE_OFFSET + index * MUSIC_ALIAS_BYTES;
    const mode = module29[offset];
    const record = module29[offset + 1];
    const legacyName = module29.subarray(offset + 2, offset + MUSIC_ALIAS_BYTES)
      .toString("ascii")
      .replace(/\$/g, "")
      .trim();
    assert(modeContainers.has(mode), `unexpected music alias mode ${mode} at index ${index}`);
    assert(legacyName.endsWith(".RIX"), `invalid music alias at index ${index}`);
    return {
      index,
      tableAddress: `DS:${(MUSIC_ALIAS_TABLE_OFFSET + index * MUSIC_ALIAS_BYTES).toString(16).toUpperCase().padStart(4, "0")}`,
      resourceMode: mode,
      container: modeContainers.get(mode),
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

/**
 * 敌方阶段唯一的选曲点 `1000:36E6` 不是无条件查表：
 *
 * ```text
 * 36E6  cmp word [2E77],25h    ; 当前场景 == 37？
 * 36EB  jz  36F7
 * 36ED  mov si,1E46            ; 其余场景：查敌方逐关表
 * 36F0  call 39A8              ;   （按同一个 DS:2E77 取曲号）
 * 36F3  call 3796              ;   再提交“奇数入场→偶数循环”曲对
 * 36F6  ret
 * 36F7  mov ax,[0365] ...      ; 场景 37：不查表
 * 36FF  mov cx,30h             ;   记录 48
 * 3702  mov bx,0Dh             ;   容器下标 13 = UN.SWF
 * 3705  call far 0000:FD8E
 * 370A  push [0365] / push 0 / push 1 / push 1
 * 3714  call far <RIX>         ;   命令 1、模式 1：单曲无限循环
 * ```
 *
 * 所以 DS:1E46 里的 stage 37 项（`MUSIC/5→4`）在发布版永远读不到；本关敌方阶段是一首
 * 只在这里出现的专属曲。这里逐字节核验分支、唯一调用链与驱动入口，再从容器表解析文件名。
 */
function parseEnemyPhaseSceneOverride(module29, containers, audioManifest) {
  const at = ENEMY_PHASE_MUSIC_SELECT_OFFSET;
  expectBytes(module29, at, [0x83, 0x3e, 0x77, 0x2e], "expected `cmp word [2E77],imm8` at 1000:36E6");
  const scene = module29[at + 4];
  expectBytes(module29, at + 5, [0x74, 0x0a, 0xbe], "expected `jz 36F7` + `mov si,imm16` at 1000:36EB");
  assert(module29.readUInt16LE(at + 8) === ENEMY_PHASE_TABLE_OFFSET, "the table path must look up DS:1E46");
  assert(nearCallTarget(module29, at + 10) === STAGE_TABLE_LOOKUP_OFFSET, "the table path must call 1000:39A8");
  assert(nearCallTarget(module29, at + 13) === PAIR_PLAYBACK_OFFSET, "the table path must submit the pair via 1000:3796");
  expectBytes(module29, at + 16, [0xc3], "expected the table path to return at 1000:36F6");
  expectBytes(
    module29,
    STAGE_TABLE_LOOKUP_OFFSET,
    [0x8b, 0x16, 0x77, 0x2e],
    "the 1000:39A8 lookup must key on the same DS:2E77 scene word",
  );

  const branch = at + 17;
  expectBytes(
    module29,
    branch,
    [0xa1, 0x65, 0x03, 0x8e, 0xc0, 0xbf, 0x00, 0x00, 0xb9],
    "expected the scene override to load into the DS:0365 buffer",
  );
  const record = module29.readUInt16LE(branch + 9);
  expectBytes(module29, branch + 11, [0xbb], "expected `mov bx,container` at 1000:3702");
  const containerIndex = module29.readUInt16LE(branch + 12);
  expectBytes(module29, branch + 14, RESOURCE_LOADER_FAR_CALL, "expected 0000:FD8E at 1000:3705");
  expectBytes(
    module29,
    branch + 19,
    [0xff, 0x36, 0x65, 0x03, 0x6a, 0x00, 0x6a],
    "expected the DS:0365 buffer pushed with a zero offset",
  );
  const mode = module29[branch + 26];
  expectBytes(module29, branch + 27, [0x6a], "expected the RIX command push at 1000:3712");
  const command = module29[branch + 28];
  const driverCall = branch + 29;
  expectBytes(module29, driverCall, [0x9a], "expected the RIX far call at 1000:3714");
  assert(
    farCallTarget(module29, driverCall) === farCallTarget(module29, PAIR_PLAYBACK_DRIVER_CALL_OFFSET),
    "the scene override must enter the same RIX driver entry as 1000:3796",
  );
  expectBytes(module29, driverCall + 5, [0x83, 0xc4, 0x08, 0xc3], "expected the override to return at 1000:371C");
  assert(scene === 37 && record === 48 && command === 1 && mode === 1, "enemy-phase scene override changed");

  // 唯一入口：敌方阶段起始 1000:3680 内的 1000:36BB；1000:3680 由 0000:4E1F 远调用。
  assert(
    farCallTarget(module29, ENEMY_PHASE_START_FAR_CALL_OFFSET) === ENEMY_PHASE_START_OFFSET,
    "0000:4E1F must enter the enemy-phase start 1000:3680",
  );
  const callers = callersOf(module29, MODULE29_DATA_BASE, at);
  assert(
    callers.length === 1 && callers[0] === ENEMY_PHASE_MUSIC_CALL_OFFSET,
    `1000:36E6 must only be called from 1000:36BB, found ${callers.map(segmentAddress).join(", ")}`,
  );

  const container = containerAt(containers, containerIndex);
  const audio = audioManifest.entries.find((entry) => entry.group === container && entry.record === record);
  assert(audio?.kind === "softstar_rix" && audio.output, `${container}/${record} must be a decoded RIX record`);
  return {
    address: segmentAddress(at),
    calledFrom: `${segmentAddress(ENEMY_PHASE_MUSIC_CALL_OFFSET)}（敌方阶段起始 ${segmentAddress(ENEMY_PHASE_START_OFFSET)}，由 ${segmentAddress(ENEMY_PHASE_START_FAR_CALL_OFFSET)} 远调用）`,
    sceneVariable: "DS:2E77",
    scene,
    bypassedTable: `DS:${hex(ENEMY_PHASE_TABLE_OFFSET)}`,
    containerIndex,
    container,
    record,
    key: `${container}/${record}`,
    buffer: "DS:0365",
    command,
    mode,
    playback: "single-loop",
    meaning: "场景 37 进入敌方阶段时不查 DS:1E46，直接以驱动命令 1、模式 1 单曲无限循环本记录；没有奇数短入场，也不经过 1000:3796 的曲对提交。下一完整回合的玩家阶段仍按 DS:1D98 选曲。",
    source: audio.source,
    sourceBytes: audio.sourceBytes,
    sourceSha256: audio.sourceSha256,
    decodedOutput: audio.output,
    durationSeconds: audio.durationSeconds,
  };
}

function applySceneOverrides(entries, overrides) {
  return entries.map((entry) => {
    const override = overrides.find(({ scene }) => scene === entry.stage);
    if (!override || !entry.reachable) return entry;
    return { ...entry, reachable: false, bypassedBySceneOverride: override.address };
  });
}

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

  const containers = parseResourceContainers(module29);
  const aliases = parseAliases(module29, parseAliasModeContainers(module29, containers));
  const enemyPhaseOverrides = [parseEnemyPhaseSceneOverride(module29, containers, audioManifest)];
  const playerPhase = parseStageTable(module29, PLAYER_PHASE_TABLE_OFFSET);
  const enemyPhase = applySceneOverrides(
    parseStageTable(module29, ENEMY_PHASE_TABLE_OFFSET),
    enemyPhaseOverrides,
  );
  // 曲对提交 `1000:3796` 的两次读取都必须落在 MUSIC.SWF，逐关表的记录号才是 MUSIC 记录。
  for (const load of [PAIR_PLAYBACK_OFFSET + 15, PAIR_PLAYBACK_OFFSET + 37]) {
    expectBytes(module29, load, [0xbb], `expected \`mov bx,container\` at ${segmentAddress(load)}`);
    assert(
      containerAt(containers, module29.readUInt16LE(load + 1)) === "MUSIC",
      `${segmentAddress(load)} must load battle pairs from MUSIC.SWF`,
    );
  }
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
        selector: enemyPhaseOverrides[0].address,
        entries: enemyPhase,
        sceneOverrides: enemyPhaseOverrides,
      },
      duplicateBoundary: "两表尾部各保留一个被前项遮蔽的 stage 38 重复项；按原生首次命中规则标为 reachable=false。",
      sceneOverrideBoundary: "敌方表的 stage 37 项（MUSIC/5→4）被 1000:36E6 的场景分支整段绕过，发布版读不到，标为 reachable=false；本关敌方阶段见 enemyPhase.sceneOverrides。",
    },
    resourceContainers: containers,
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
      confirmed: "MUSIC/0、1、2..14、16..40 的功能已由原生调用/逐关表绑定；第 0 关玩家阶段顺序另有实机确认。场景 37 的敌方阶段由 1000:36E6 场景分支改播 UN/48 单曲循环，不读 DS:1E46；别名表模式 2 读 MAGIC.SWF。",
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

export {
  extract,
  parseAliases,
  parseStageTable,
  parseDeploymentScreenMusic,
  parseEnemyPhaseSceneOverride,
  parseResourceContainers,
};
