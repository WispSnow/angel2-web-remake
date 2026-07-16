#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PIT_INPUT_HZ = 1_193_182;
const DRIVER_SEGMENT_FILE_BASE = 0x1ced0;
const RELEASED_RUNTIME_MODULES = Object.freeze([21, 23, 25, 27, 29, 33, 35, 44, 46]);

const SIGNATURES = Object.freeze([
  ["0000:003D", 0x003d, 0x0054, "install input/timer hooks, then request embedded driver operation FFh", "7fbc37f998d3fb419bceee90429be24c5a55a9ef1b360f207e8b2d6cf82e9662"],
  ["0000:0109", 0x0109, 0x011f, "shut down the embedded driver, restore hooks, then restore the default PIT divisor", "6e82620ee0e8db877d57a8a9bb4ed35c4209ede474eff3e9ee52f9cfed5ab1ab"],
  ["0000:0205", 0x0205, 0x0220, "program PIT0 mode 3 with divisor zero, the 65536-count DOS default", "aea5229361f167d2b528777a7c22ee96e862f0e942c2615afc92f11f458330c3"],
  ["0000:1145", 0x1145, 0x1160, "install keyboard and timer callbacks during module initialization", "c0dd0e3383b1587deb795d56adaf57739b861468a1a713e56d6f89f80d05cfd3"],
  ["0000:D1B7", 0xd1b7, 0xd1cd, "patch the game timer callback and install its INT 08h wrapper", "777beb533196f13cccfbd1baf5912145fd89e4d26ad5f0ed268637be7894a9bc"],
  ["0000:D25E", 0xd25e, 0xd2e0, "save the prior INT 08h vector, install 0000:D281, chain the prior vector, and increment DS:F5B3", "1bd525a6679f5caa69b1e27de755f00b85059000f28d784b138ecb856e714e69"],
  ["0000:D3B6", 0xd3b6, 0xd3d1, "wait until DS:F5B3 reaches CX, then reset the counter", "0e3f83b1b0bd7be88e0ed1aafc745f5a0ac46eaae645bfe6cf0bc6b8f1b37c3d"],
  ["1CED:05A0", 0x1d470, 0x1d48e, "embedded-driver timer counters, four-step service quanta, PIT divisor, and chain quantum", "f207df8ba165b3fe6618236c1bea59df8c6d29df5ac8c95f32f9333497b43664"],
  ["1CED:069D", 0x1d56d, 0x1d5dd, "save the old INT 08h vector, derive the chain countdown, program PIT0, and install the driver ISR", "6a3385bbddc12a3f92040d61bb0c8405ad5db90f53b86fdd86ef26946c7c8c08"],
  ["1CED:1445", 0x1e315, 0x1e47b, "embedded-driver IRQ0 handler and countdown-gated chain to the prior INT 08h vector", "293a7f992072daa9b8360169f1653554dbf2caf69bcf6a15edb3e0d2acb43a34"],
]);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function verifySignatures(buffer) {
  return SIGNATURES.map(([address, start, end, role, expected]) => {
    const bytes = buffer.subarray(start, end);
    assert.equal(bytes.length, end - start, `${address}: truncated signature`);
    assert.equal(sha256(bytes), expected, `${address}: signature mismatch`);
    return { address, fileOffset: start, bytes: bytes.length, role, sha256: expected };
  });
}

function offsetsOf(buffer, sequence) {
  const offsets = [];
  for (let cursor = 0; cursor < buffer.length;) {
    const offset = buffer.indexOf(sequence, cursor);
    if (offset < 0) break;
    offsets.push(offset);
    cursor = offset + 1;
  }
  return offsets;
}

function maskedOffsets(buffer, pattern, significant) {
  const offsets = [];
  outer: for (let offset = 0; offset + pattern.length <= buffer.length; offset += 1) {
    for (let index = 0; index < pattern.length; index += 1) {
      if (significant[index] && buffer[offset + index] !== pattern[index]) continue outer;
    }
    offsets.push(offset);
  }
  return offsets;
}

function directNearCallers(buffer, target, end = Math.min(buffer.length, 0x10000)) {
  const callers = [];
  for (let offset = 0; offset + 2 < end; offset += 1) {
    if (buffer[offset] !== 0xe8) continue;
    if (((offset + 3 + buffer.readInt16LE(offset + 1)) & 0xffff) === target) callers.push(offset);
  }
  return callers;
}

function auditRuntimeModuleTimer(buffer, module) {
  const driverRequests = offsetsOf(buffer.subarray(0, Math.min(0x80, buffer.length)),
    Buffer.from([0x68, 0xff, 0x00, 0x9a]));
  assert.equal(driverRequests.length, 1, `module ${module}: expected one startup driver operation FFh request`);
  const driverRequest = driverRequests[0];
  const driverEntryOffset = buffer.readUInt16LE(driverRequest + 4);
  const driverEntrySegment = buffer.readUInt16LE(driverRequest + 6);
  const driverEntryFileOffset = driverEntrySegment * 16 + driverEntryOffset;
  const timerConstantsOffset = driverEntryFileOffset - 0x84;
  assert.equal(buffer.readUInt16LE(timerConstantsOffset), 11_932, `module ${module}: PIT divisor changed`);
  assert.equal(buffer.readUInt16LE(timerConstantsOffset + 2), 11_932,
    `module ${module}: prior-handler timer quantum changed`);
  assert.deepEqual(offsetsOf(buffer, Buffer.from([0x9c, 0x2e, 0x9c, 0x2e])), [timerConstantsOffset],
    `module ${module}: timer constants are no longer unique`);

  const pitProgram = timerConstantsOffset + 0x138;
  assert.deepEqual([...buffer.subarray(pitProgram, pitProgram + 12)], [
    0xb0, 0x36, 0xe6, 0x43,
    0x8a, 0xc3, 0xe6, 0x40,
    0x8a, 0xc7, 0xe6, 0x40,
  ], `module ${module}: PIT0 programming sequence changed`);

  const chain = timerConstantsOffset + 0xfc9;
  const countdownAddress = buffer.readUInt16LE(chain + 3);
  assert.deepEqual([...buffer.subarray(chain, chain + 10)], [
    0x2e, 0xff, 0x0e, countdownAddress & 0xff, countdownAddress >> 8,
    0x75, 0x11, 0x90, 0x90, 0x90,
  ], `module ${module}: driver chain countdown changed`);
  assert.equal(buffer.readUInt16LE(chain + 16), countdownAddress,
    `module ${module}: driver chain countdown reload target changed`);
  assert.equal(buffer[chain + 18], 0x9c, `module ${module}: prior INT 08h chain lost PUSHF`);
  assert.deepEqual([...buffer.subarray(chain + 19, chain + 22)], [0x2e, 0xff, 0x1e],
    `module ${module}: prior INT 08h far call changed`);

  const installerPattern = [
    0xb0, 0x08, 0xb4, 0x35, 0xcd, 0x21, 0x8c, 0xc1,
    0x89, 0x1e, 0, 0, 0x89, 0x0e, 0, 0, 0xba, 0, 0,
    0x8c, 0xc8, 0x8e, 0xd8, 0xb0, 0x08, 0xb4, 0x25, 0xcd, 0x21,
  ];
  const installerSignificant = installerPattern.map((_, index) =>
    ![10, 11, 14, 15, 17, 18].includes(index));
  const installers = maskedOffsets(buffer.subarray(0, Math.min(buffer.length, 0x10000)),
    installerPattern, installerSignificant);
  assert.equal(installers.length, 1, `module ${module}: game INT 08h installer count changed`);
  const installer = installers[0];
  const gameHandler = buffer.readUInt16LE(installer + 17);

  const producerPattern = [0x3e, 0xff, 0x1e, 0, 0, 0xb8, 0, 0, 0x8e, 0xd8, 0xff, 0x06, 0, 0];
  const producerSignificant = producerPattern.map((_, index) => ![3, 4, 6, 7, 12, 13].includes(index));
  const producers = maskedOffsets(buffer.subarray(0, Math.min(buffer.length, 0x10000)),
    producerPattern, producerSignificant);
  assert.equal(producers.length, 1, `module ${module}: game timer producer count changed`);
  const producer = producers[0];
  const gameCounterAddress = buffer.readUInt16LE(producer + 12);
  assert.equal(producer, gameHandler + 0x15, `module ${module}: game handler/counter layout changed`);

  const waitPattern = [0x39, 0x0e, 0, 0, 0x72, 0xfa, 0xc7, 0x06, 0, 0, 0x00, 0x00];
  const waitSignificant = waitPattern.map((_, index) => ![2, 3, 8, 9].includes(index));
  const waits = maskedOffsets(buffer.subarray(0, Math.min(buffer.length, 0x10000)), waitPattern, waitSignificant);
  assert.equal(waits.length, 1, `module ${module}: native wait consumer count changed`);
  const wait = waits[0];
  assert.equal(buffer.readUInt16LE(wait + 2), gameCounterAddress,
    `module ${module}: wait reads a different timer counter`);
  assert.equal(buffer.readUInt16LE(wait + 8), gameCounterAddress,
    `module ${module}: wait resets a different timer counter`);

  const installerCallers = directNearCallers(buffer, installer);
  assert.equal(installerCallers.length, 1, `module ${module}: installer caller count changed`);
  const timerWrapper = installerCallers[0] - 0x12;
  assert.deepEqual([...buffer.subarray(timerWrapper, timerWrapper + 4)], [0xb0, 0x9a, 0x2e, 0xa2],
    `module ${module}: timer wrapper patch prologue changed`);
  const wrapperCallers = directNearCallers(buffer, timerWrapper);
  assert.equal(wrapperCallers.length, 1, `module ${module}: timer-wrapper caller count changed`);
  const startupCalls = [];
  for (let offset = 0; offset + 2 < driverRequest; offset += 1) {
    if (buffer[offset] !== 0xe8) continue;
    startupCalls.push({ offset, target: (offset + 3 + buffer.readInt16LE(offset + 1)) & 0xffff });
  }
  const initializationRoute = startupCalls.find(({ target }) =>
    target <= wrapperCallers[0] && wrapperCallers[0] - target <= 0x20);
  assert(initializationRoute !== undefined, `module ${module}: timer installer no longer precedes driver FFh startup`);

  return {
    module,
    bytes: buffer.length,
    sha256: sha256(buffer),
    startup: {
      gameTimerInitializationCall: hexOffset(initializationRoute.offset),
      gameTimerInitializationTarget: hexOffset(initializationRoute.target),
      driverOperationFfRequest: hexOffset(driverRequest),
      installPrecedesDriverRequest: initializationRoute.offset < driverRequest,
    },
    driver: {
      entry: `${driverEntrySegment.toString(16).toUpperCase().padStart(4, "0")}:${driverEntryOffset.toString(16).toUpperCase().padStart(4, "0")}`,
      entryFileOffset: driverEntryFileOffset,
      timerConstantsFileOffset: timerConstantsOffset,
      pitProgramFileOffset: pitProgram,
      chainFileOffset: chain,
      pitDivisor: 11_932,
      priorTimerQuantum: 11_932,
      priorHandlerChainCountdown: 1,
    },
    gameTimer: {
      int08Installer: hexOffset(installer),
      handler: hexOffset(gameHandler),
      counterProducer: hexOffset(producer),
      counterAddress: `DS:${gameCounterAddress.toString(16).toUpperCase().padStart(4, "0")}`,
      waitConsumer: hexOffset(wait),
    },
  };
}

function hexOffset(offset) {
  return `0x${offset.toString(16).toUpperCase()}`;
}

function auditNativeTiming(buffer) {
  assert(buffer.length >= 0x1e47b, "module 29 runtime image is too short");

  const startupDriverCalls = [];
  for (let offset = 0; offset + 4 < buffer.length; offset += 1) {
    if (
      buffer[offset] === 0x9a &&
      buffer.readUInt16LE(offset + 1) === 0x063e &&
      buffer.readUInt16LE(offset + 3) === 0x1ced
    ) startupDriverCalls.push(offset);
  }
  assert(startupDriverCalls.includes(0x004c), "production startup lacks the embedded-driver FFh request");
  assert.deepEqual([...buffer.subarray(0x0043, 0x004c)], [0x6a, 0x00, 0x6a, 0x00, 0x6a, 0x00, 0x68, 0xff, 0x00]);

  const timerWordReferences = offsetsOf(buffer, Buffer.from([0xb3, 0xf5]));
  assert.deepEqual(timerWordReferences, [0xd2a2, 0xd3c5, 0xd3cb]);
  assert.deepEqual([...buffer.subarray(0xd296, 0xd2a4)], [
    0x3e, 0xff, 0x1e, 0xdc, 0xf5,
    0xb8, 0xba, 0x1e, 0x8e, 0xd8,
    0xff, 0x06, 0xb3, 0xf5,
  ]);
  assert.deepEqual([...buffer.subarray(0xd3c3, 0xd3cf)], [
    0x39, 0x0e, 0xb3, 0xf5, 0x72, 0xfa,
    0xc7, 0x06, 0xb3, 0xf5, 0x00, 0x00,
  ]);

  const divisorOffset = DRIVER_SEGMENT_FILE_BASE + 0x05ba;
  const chainQuantumOffset = DRIVER_SEGMENT_FILE_BASE + 0x05bc;
  const pitDivisor = buffer.readUInt16LE(divisorOffset);
  const priorTimerQuantum = buffer.readUInt16LE(chainQuantumOffset);
  assert.equal(pitDivisor, 11_932);
  assert.equal(priorTimerQuantum, 11_932);

  assert.deepEqual([...buffer.subarray(0x1d5c2, 0x1d5ce)], [
    0xb0, 0x36, 0xe6, 0x43,
    0x8a, 0xc3, 0xe6, 0x40,
    0x8a, 0xc7, 0xe6, 0x40,
  ]);
  assert.deepEqual([...buffer.subarray(0x1d5d0, 0x1d5dc)], [
    0x26, 0xc7, 0x06, 0x20, 0x00, 0x45, 0x14,
    0x26, 0x8c, 0x0e, 0x22, 0x00,
  ]);

  const handlerFileOffset = DRIVER_SEGMENT_FILE_BASE + 0x1445;
  assert.equal(handlerFileOffset, 0x1e315);
  const chainCountdownRefs = offsetsOf(
    buffer.subarray(handlerFileOffset, 0x1e47b),
    Buffer.from([0xa2, 0x05]),
  ).map((offset) => handlerFileOffset + offset);
  assert.deepEqual(chainCountdownRefs, [0x1e456, 0x1e463]);
  assert.deepEqual([...buffer.subarray(0x1e453, 0x1e46b)], [
    0x2e, 0xff, 0x0e, 0xa2, 0x05,
    0x75, 0x11,
    0x90, 0x90, 0x90,
    0x2e, 0xa1, 0xa0, 0x05,
    0x2e, 0xa3, 0xa2, 0x05,
    0x9c,
    0x2e, 0xff, 0x1e, 0xa4, 0x05,
  ]);

  const chainCountdown = Math.ceil(priorTimerQuantum / pitDivisor);
  assert.equal(chainCountdown, 1, "released constants should chain the prior INT 08h handler every IRQ0");
  const nominalTickHz = PIT_INPUT_HZ / pitDivisor;
  const nominalTickMilliseconds = 1000 / nominalTickHz;

  return {
    pit: {
      nominalInputHz: PIT_INPUT_HZ,
      channel: 0,
      controlWord: "0x36",
      mode: 3,
      divisor: pitDivisor,
      nominalIrqHz: nominalTickHz,
      nominalIrqMilliseconds: nominalTickMilliseconds,
      shutdownRestoreDivisor: 65_536,
    },
    installOrder: [
      "0000:003D calls 0000:1145 before the embedded-driver request",
      "0000:1145 -> 0000:D1B7 -> 0000:D25E installs 0000:D281 on INT 08h",
      "0000:0043..0053 unconditionally requests embedded-driver operation FFh and ignores the return value",
      "1CED:069D..070C saves the current INT 08h vector, programs PIT0, and installs 1CED:1445",
      "1CED:1583..159A decrements the chain countdown and calls the prior INT 08h vector when it reaches zero",
    ],
    gameCounter: {
      address: "DS:F5B3",
      references: timerWordReferences.map(hexOffset),
      increment: "0000:D281 chains the vector saved at DS:F5DC first, then 0000:D2A0 increments DS:F5B3 once",
      wait: "0000:D3B6 spins until unsigned DS:F5B3 >= CX and then resets DS:F5B3 to zero",
    },
    embeddedDriver: {
      fileSegmentBase: hexOffset(DRIVER_SEGMENT_FILE_BASE),
      handler: { address: "1CED:1445", fileOffset: handlerFileOffset },
      pitDivisor: { address: "1CED:05BA", fileOffset: divisorOffset, value: pitDivisor },
      priorTimerQuantum: { address: "1CED:05BC", fileOffset: chainQuantumOffset, value: priorTimerQuantum },
      priorHandlerChainCountdown: chainCountdown,
      priorHandlerChainCadence: "every programmed IRQ0 in the released image",
    },
    fidelityContract: {
      nativeTick: "one increment of DS:F5B3",
      releasedNominalMilliseconds: nominalTickMilliseconds,
      webLogicalTickMilliseconds: 10,
      rule: "preserve integer native-tick counts and use a 10 ms logical quantum; render/audio scheduling may accumulate fractional host time without changing rule or presentation step counts",
      calibrationBoundary: "physical oscillator tolerance, emulator scheduling jitter, VGA retrace duration, and audio-device drift remain host observations; the released nominal timer divisor is no longer unknown",
    },
    closure: {
      pitDivisorClosed: true,
      irqInstallAndChainClosed: true,
      gameCounterProducerClosed: true,
      waitConsumerClosed: true,
      releasedNominalTickDurationClosed: true,
    },
  };
}

export async function extract(modulePath, outputPath) {
  const module29 = await readFile(modulePath);
  const signatures = verifySignatures(module29);
  const timing = auditNativeTiming(module29);
  const output = {
    format: "ANGEL2 native timer and PIT audit",
    source: path.relative(process.cwd(), modulePath),
    signatures,
    ...timing,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  return output;
}

export async function extractAll(rawDirectory, outputPath) {
  const modules = [];
  let module29;
  for (const module of RELEASED_RUNTIME_MODULES) {
    const modulePath = path.join(rawDirectory, `${String(module).padStart(4, "0")}-unpacked.bin`);
    const buffer = await readFile(modulePath);
    modules.push(auditRuntimeModuleTimer(buffer, module));
    if (module === 29) module29 = { path: modulePath, buffer };
  }
  assert(module29 !== undefined);
  const signatures = verifySignatures(module29.buffer);
  const timing = auditNativeTiming(module29.buffer);
  const output = {
    format: "ANGEL2 native timer and PIT audit",
    source: path.relative(process.cwd(), module29.path),
    sourceDirectory: path.relative(process.cwd(), rawDirectory),
    signatures,
    moduleCoverage: {
      releasedRuntimeModules: [...RELEASED_RUNTIME_MODULES],
      auditedModules: modules,
      allReleasedModulesUseSameNominalDivisorAndChainCadence: modules.every((entry) =>
        entry.driver.pitDivisor === 11_932 && entry.driver.priorHandlerChainCountdown === 1),
    },
    ...timing,
    fidelityContract: {
      ...timing.fidelityContract,
      nativeTick: "one increment of the module-local game timer counter listed in moduleCoverage; module 29 uses DS:F5B3",
    },
    closure: {
      ...timing.closure,
      allReleasedRuntimeModulesAudited: true,
      allReleasedRuntimeModulesUseSameNominalTick: true,
    },
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  return output;
}

function usage() {
  return "usage: angel2-native-timing.mjs (--extract MODULE29_RAW | --extract-all RAW_DIRECTORY) OUTPUT_JSON";
}

async function main(argv) {
  if (argv.length !== 5 || !["--extract", "--extract-all"].includes(argv[2])) throw new Error(usage());
  const output = argv[2] === "--extract"
    ? await extract(argv[3], argv[4])
    : await extractAll(argv[3], argv[4]);
  console.log(`wrote ${argv[4]} (${output.signatures.length} signatures, ${output.pit.nominalIrqHz.toFixed(6)} Hz)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
