#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const HEADER_BYTES = 0x32;
const KEY_OFFSET = 0x02;
const KEY_BYTES = 0x10;
const NATIVE_SUFFIX_BYTES = 0x12;
const EXPECTED_DECOMPRESSED_BYTES = {
  "JUST.TST": 8358,
  "WAR0.TST": 11972,
  "WAR1.TST": 11972,
  "WAR2.TST": 11972,
  "WAR3.TST": 11972,
  "WAR4.TST": 11972,
};
const NATIVE_RLE_TARGET_BYTES = {
  JUST: 0x20a6,
  WAR: 0x237c + 0x05a0 + 0x05a0,
};

const CODE_SIGNATURES = [
  { module: 23, id: "scanFiveHeaders", address: "0000:3C70", start: 0x03c70, end: 0x03c9c, sha256: "ca5e15b1a154129965a134784a6ea3057aa0825f4c4a16e9ea8aca41a607df96" },
  { module: 23, id: "storeHeaderMetadata", address: "0000:3C9C", start: 0x03c9c, end: 0x03ce2, sha256: "cb9620d07a641d7683554692a05d6c45cb792534a0d02444ff557d119c5a1c92" },
  { module: 23, id: "read50ByteHeader", address: "0000:3CE2", start: 0x03ce2, end: 0x03d20, sha256: "ac989d9dca64424e60e0d66220d92f4a0873ea44ca4bf06a0820025d0499a8a0" },
  { module: 27, id: "writeJust", address: "0000:0FF8", start: 0x00ff8, end: 0x01058, sha256: "016dbc6b06b09ea43f1cdd229537d6e6e0c76a545b8664714db5b53ab5fd85ac" },
  { module: 27, id: "obfuscateJust", address: "0000:1144", start: 0x01144, end: 0x01192, sha256: "1013cdd4ddc32d3dcf9bb17abbeb5a2224b90480375c8b67864768762a96e1e8" },
  { module: 27, id: "compressJust", address: "0000:1192", start: 0x01192, end: 0x01227, sha256: "2aa22704a4b95b279efc177a9b6a76fcd3c9fc6b1f6eaaeb680b4a398bc2950f" },
  { module: 27, id: "nextJustKeyByte", address: "0000:122E", start: 0x0122e, end: 0x01249, sha256: "db1ae4771952732f55d155591af29da082add0ab297e6f91dc5a7a7502b0ae97" },
  { module: 29, id: "loadWar", address: "1000:0DD0", start: 0x10dd0, end: 0x10ed1, sha256: "97b3cea97149f87bab57a643a3f9da80338ca7c6e185a73d5725b20a25ab1698" },
  { module: 29, id: "deobfuscateWar", address: "1000:108F", start: 0x1108f, end: 0x110c1, sha256: "ce82f2458b1b12768100953bfaee5cc0662c9fdf17e5a6ff74c0430de6161fc3" },
  { module: 29, id: "decompressWar", address: "1000:10C1", start: 0x110c1, end: 0x11105, sha256: "c0f222236ae4c0410e74cc5370eda578d70c6600b22de2cd23d8648b9d897adf" },
  { module: 29, id: "loadJust", address: "1000:5386", start: 0x15386, end: 0x153e6, sha256: "40c464bf85bf88a50babfb0909318eafee32f221174cb6ea813009d43ffd897b" },
  { module: 29, id: "deobfuscateJust", address: "1000:560B", start: 0x1560b, end: 0x1563d, sha256: "ce82f2458b1b12768100953bfaee5cc0662c9fdf17e5a6ff74c0430de6161fc3" },
  { module: 29, id: "decompressJust", address: "1000:563D", start: 0x1563d, end: 0x15678, sha256: "33d719f8841a0fc283cfd9b782f17721a90c61656cc37f9742cc667263ca0afd" },
  { module: 29, id: "writeWar", address: "1000:87F2", start: 0x187f2, end: 0x18882, sha256: "741c854b74a5ef2fde091712be9b9bf9ad65c370eca913bbaedaa7be9e3a522f" },
  { module: 29, id: "obfuscateWar", address: "1000:8A54", start: 0x18a54, end: 0x18aa2, sha256: "3968fe2eb002d140fc218f144f46bfb907fa4298bc1b018676b44893b80444f1" },
  { module: 29, id: "compressWar", address: "1000:8AA2", start: 0x18aa2, end: 0x18b37, sha256: "92ed02f33a9e262087a9db7e2c4ec6c3c7475808e1ddb8ab7593197e7a7119f8" },
  { module: 29, id: "nextWarKeyByte", address: "1000:8B3E", start: 0x18b3e, end: 0x18b5d, sha256: "056f87ea6eb5c8001beac2b84ea1637ce23245178958edd1e4bf20ab2dc35254" },
  { module: 29, id: "ordinaryDamagePit", address: "0000:95D2", start: 0x095d2, end: 0x095db, sha256: "ac836afdde6ac6fcdca87528f1d54f397e556e759f29fb25ce4afcc8988a5faa" },
  { module: 29, id: "aiPit", address: "1000:2016", start: 0x12016, end: 0x12031, sha256: "fc9cf3aa22512dff67d91e35db5cca4ba1b28eb87a900c38f3a448ca789096c8" },
  { module: 29, id: "prayerPit", address: "1000:5BE6", start: 0x15be6, end: 0x15bfe, sha256: "ca0edf24512d7196d265ca05ffef5477153243455731e723c280e9d241232859" },
  { module: 29, id: "stompPit", address: "1000:7460", start: 0x17460, end: 0x1747b, sha256: "df7e6de57aca98b9636ba71cb40552a0920c2ab89afc5060602fed8d0c56d819" },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function verifySignatures(modules) {
  return CODE_SIGNATURES.map((signature) => {
    const bytes = modules.get(signature.module).subarray(signature.start, signature.end);
    const actualSha256 = sha256(bytes);
    if (bytes.length !== signature.end - signature.start || actualSha256 !== signature.sha256) {
      throw new Error(`module ${signature.module} signature mismatch: ${signature.id}`);
    }
    return {
      ...signature,
      bytes: bytes.length,
      verified: true,
    };
  });
}

function decryptPayload(buffer, fileName) {
  if (buffer.length < HEADER_BYTES) {
    fail("HEADER_TOO_SHORT", `${fileName}: file is shorter than the 50-byte header`);
  }
  const compressedEnd = buffer.readUInt16LE(0);
  if (compressedEnd < HEADER_BYTES) {
    fail("END_BEFORE_PAYLOAD", `${fileName}: compressed end precedes offset 0x32`);
  }
  if (compressedEnd > buffer.length) {
    fail("END_AFTER_FILE", `${fileName}: compressed end exceeds the file length`);
  }
  const stream = Buffer.from(buffer.subarray(HEADER_BYTES, compressedEnd));
  for (let index = 0; index < stream.length; index += 1) {
    stream[index] ^= buffer[KEY_OFFSET + (index % KEY_BYTES)];
  }
  return { compressedEnd, stream };
}

function decodeRleStrict(stream, expectedBytes, fileName) {
  const output = Buffer.alloc(expectedBytes);
  let source = 0;
  let destination = 0;
  let commands = 0;
  while (source < stream.length) {
    const markerOffset = source;
    const marker = stream[source];
    source += 1;
    let count = 1;
    let value = marker;
    if ((marker & 0xc0) === 0xc0) {
      count = marker & 0x3f;
      if (count === 0) {
        fail("ZERO_LENGTH_RUN", `${fileName}: C0 encodes a zero-length run at stream offset ${markerOffset}`);
      }
      if (source >= stream.length) {
        fail("TRUNCATED_RUN", `${fileName}: RLE marker has no value byte at stream offset ${markerOffset}`);
      }
      value = stream[source];
      source += 1;
    }
    if (destination + count > expectedBytes) {
      fail("OUTPUT_OVERSHOOT", `${fileName}: RLE output exceeds ${expectedBytes} bytes`);
    }
    output.fill(value, destination, destination + count);
    destination += count;
    commands += 1;
  }
  if (destination !== expectedBytes) {
    fail("OUTPUT_UNDERSHOOT", `${fileName}: RLE output is ${destination} bytes, expected ${expectedBytes}`);
  }
  return { output, commands };
}

function decodeNativeFileStrict(buffer, fileName, expectedBytes) {
  const { compressedEnd, stream } = decryptPayload(buffer, fileName);
  const decoded = decodeRleStrict(stream, expectedBytes, fileName);
  return {
    ...decoded,
    stream,
    compressedEnd,
    suffixBytes: buffer.length - compressedEnd,
    canonicalWriterSuffix: buffer.length - compressedEnd === NATIVE_SUFFIX_BYTES,
  };
}

function simulateNativeRleStop(stream, targetBytes) {
  let source = 0;
  let output = 0;
  let commands = 0;
  while (output < targetBytes) {
    if (source >= stream.length) {
      fail("NATIVE_SOURCE_EXHAUSTED", "valid sample exhausted before the native RLE target");
    }
    const marker = stream[source];
    source += 1;
    let count = 1;
    if ((marker & 0xc0) === 0xc0) {
      count = marker & 0x3f;
      if (source >= stream.length) {
        fail("NATIVE_TRUNCATED_RUN", "valid sample ended in an RLE marker");
      }
      source += 1;
    }
    output += count;
    commands += 1;
  }
  return {
    targetBytes,
    outputBytesActuallyWritten: output,
    targetOvershootBytes: output - targetBytes,
    compressedPayloadBytesConsumed: source,
    compressedPayloadBytesIgnored: stream.length - source,
    commandsConsumed: commands,
  };
}

function buildSyntheticFile(stream, suffixBytes = NATIVE_SUFFIX_BYTES) {
  const compressedEnd = HEADER_BYTES + stream.length;
  const buffer = Buffer.alloc(compressedEnd + suffixBytes);
  buffer.writeUInt16LE(compressedEnd, 0);
  stream.copy(buffer, HEADER_BYTES);
  return buffer;
}

function mutationResult(id, buffer, expectedBytes, expectedAccepted, expectedCode = null) {
  let accepted = false;
  let code = null;
  let suffixBytes = null;
  try {
    suffixBytes = decodeNativeFileStrict(buffer, id, expectedBytes).suffixBytes;
    accepted = true;
  } catch (error) {
    code = error.code ?? "UNEXPECTED_ERROR";
  }
  if (accepted !== expectedAccepted || code !== expectedCode) {
    throw new Error(`${id}: expected accepted=${expectedAccepted}, code=${expectedCode}; got accepted=${accepted}, code=${code}`);
  }
  return { id, expectedBytes, accepted, rejectionCode: code, suffixBytes };
}

function buildMutationCorpus() {
  const tooShort = Buffer.alloc(HEADER_BYTES - 1);
  const endBefore = Buffer.alloc(HEADER_BYTES);
  endBefore.writeUInt16LE(HEADER_BYTES - 1, 0);
  const endAfter = Buffer.alloc(HEADER_BYTES + 1);
  endAfter.writeUInt16LE(HEADER_BYTES + 2, 0);
  return [
    mutationResult("valid-literal", buildSyntheticFile(Buffer.from([0x41])), 1, true),
    mutationResult("valid-run", buildSyntheticFile(Buffer.from([0xc3, 0x41])), 3, true),
    mutationResult("missing-writer-suffix", buildSyntheticFile(Buffer.from([0x41]), 0), 1, true),
    mutationResult("extra-writer-suffix", buildSyntheticFile(Buffer.from([0x41]), 19), 1, true),
    mutationResult("header-too-short", tooShort, 1, false, "HEADER_TOO_SHORT"),
    mutationResult("end-before-payload", endBefore, 1, false, "END_BEFORE_PAYLOAD"),
    mutationResult("end-after-file", endAfter, 1, false, "END_AFTER_FILE"),
    mutationResult("truncated-run", buildSyntheticFile(Buffer.from([0xc1])), 1, false, "TRUNCATED_RUN"),
    mutationResult("zero-length-run", buildSyntheticFile(Buffer.from([0xc0, 0x41])), 1, false, "ZERO_LENGTH_RUN"),
    mutationResult("output-undershoot", buildSyntheticFile(Buffer.from([0x41])), 2, false, "OUTPUT_UNDERSHOOT"),
    mutationResult("output-overshoot", buildSyntheticFile(Buffer.from([0xc2, 0x41])), 1, false, "OUTPUT_OVERSHOOT"),
    mutationResult("command-after-exact-output", buildSyntheticFile(Buffer.from([0x41, 0x42])), 1, false, "OUTPUT_OVERSHOOT"),
  ];
}

function semanticSummary(decoded, fileName, original) {
  const isWar = fileName.startsWith("WAR");
  const unitMapOffset = isWar ? 8 : 0;
  const sideMapOffset = isWar ? 2508 : 2500;
  const unitMap = decoded.subarray(unitMapOffset, unitMapOffset + 2500);
  const sideMap = decoded.subarray(sideMapOffset, sideMapOffset + 2500);
  let occupied = 0;
  let occupiedSlotsAtOrAbove60 = 0;
  let invalidSideValues = 0;
  for (let cell = 0; cell < 2500; cell += 1) {
    const side = sideMap[cell];
    const occupiedSide = side === 1 || side === 2;
    if (occupiedSide) {
      occupied += 1;
      if ((unitMap[cell] & 0x7f) >= 60) occupiedSlotsAtOrAbove60 += 1;
    } else if (side !== 0 && !(fileName === "JUST.TST" && side === 0xff)) {
      invalidSideValues += 1;
    }
  }
  return {
    occupiedCells: occupied,
    occupiedSlotsAtOrAbove60,
    invalidSideValues,
    difficulty: isWar ? original.readUInt16LE(0x1e) : null,
    difficultyInNativeRange: isWar ? original.readUInt16LE(0x1e) <= 3 : null,
    stage: isWar ? original.readUInt16LE(0x1a) : decoded.readUInt16LE(5450),
    stageInKnownTemplateRange: (isWar ? original.readUInt16LE(0x1a) : decoded.readUInt16LE(5450)) <= 43,
    policy: "structural failures are fatal; semantic impossibilities are rejected before entering the simulation, while unusual but memory-safe values remain explicit warnings so mods are not silently rewritten",
  };
}

async function main() {
  const [module23Path, module27Path, module29Path, saveDirectory, outputPath] = process.argv.slice(2);
  if (outputPath === undefined || process.argv.length !== 7) {
    throw new Error("usage: angel2-save-robustness.mjs MODULE23.bin MODULE27.bin MODULE29.bin ANGEL2_DIR OUTPUT.json");
  }
  const modules = new Map([
    [23, await readFile(module23Path)],
    [27, await readFile(module27Path)],
    [29, await readFile(module29Path)],
  ]);
  const signatures = verifySignatures(modules);
  const samples = [];
  for (const [fileName, expectedBytes] of Object.entries(EXPECTED_DECOMPRESSED_BYTES)) {
    const original = await readFile(path.join(saveDirectory, fileName));
    const strict = decodeNativeFileStrict(original, fileName, expectedBytes);
    const kind = fileName === "JUST.TST" ? "JUST" : "WAR";
    const nativeStop = simulateNativeRleStop(strict.stream, NATIVE_RLE_TARGET_BYTES[kind]);
    samples.push({
      fileName,
      sha256: sha256(original),
      fileBytes: original.length,
      compressedEnd: strict.compressedEnd,
      encryptedPayloadBytes: strict.stream.length,
      suffixBytes: strict.suffixBytes,
      canonicalWriterSuffix: strict.canonicalWriterSuffix,
      xorKeyHex: original.subarray(KEY_OFFSET, KEY_OFFSET + KEY_BYTES).toString("hex"),
      generatedKeyBytes: 15,
      untouchedSixteenthKeyByte: original[KEY_OFFSET + 15],
      fullCanonicalRleOutputBytes: strict.output.length,
      fullCanonicalRleCommands: strict.commands,
      nativeRleStop: {
        ...nativeStop,
        canonicalOutputBytesNotMaterialized: strict.output.length - nativeStop.outputBytesActuallyWritten,
      },
      semanticSummary: semanticSummary(strict.output, fileName, original),
    });
  }

  const output = {
    format: "ANGEL2 native save robustness and replay-boundary audit",
    signatures,
    formatIdentity: {
      explicitVersionField: false,
      magic: false,
      checksum: false,
      authenticatedLength: false,
      onlyKnownFingerprint: "role-specific decompressed length plus the shipped writer convention fileBytes == compressedEnd + 18; the native loader does not validate either",
      oldVersionDetection: "impossible from a declared version because no version exists; importers can identify only structural/layout fingerprints",
    },
    nativeBehavior: {
      titleSlotScan: {
        openFailure: "INT 21h open carry maps the slot metadata to XX",
        shortReadOrReadFailure: "unchecked; the scanner still reads metadata from the 50-byte destination buffer",
      },
      warLoad: "prefill the 64 KiB work buffer with word 0002h, then perform unchecked open and 65535-byte read, consume header metadata, XOR/RLE, restore fourteen blocks, and unchecked close",
      justLoad: "perform unchecked open and 65535-byte read, XOR/RLE, restore eight blocks, and unchecked close",
      writer: "create/truncate, serialize, compress, obfuscate, write, and close without checking carry or the returned byte count",
      xorCountBug: "both readers and writers treat compressedEnd as an XOR byte count beginning at offset 0x32, so they touch 50 bytes beyond compressedEnd; the writer persists only the first 18 of those bytes and a reader touches 32 bytes beyond EOF",
      rleSafety: "no compressed-source boundary, zero-run, exact-target, or output-overshoot check; malformed data can read or write outside the intended state",
      corruptionOutcome: "undefined buffer/memory behavior, not a recoverable compatibility path",
    },
    xorKeyGeneration: {
      keyBytesUsedByReader: 16,
      bytesWrittenByWriter: 15,
      sixteenthByte: "left untouched in the reused file buffer; shipped samples prove that it is not always zero",
      firstFifteenBytes: "returned by a cursor over code-segment bytes 0101h..0700h; the wrap branch resets the cursor without assigning AL, so the first byte after wrap can inherit the caller's AL",
      entropySource: "none; neither key-byte helper reads PIT port 40h or another random source",
      securityMeaning: "obfuscation only; key generation is deterministic/stale-buffer-dependent and unrelated to battle randomness",
    },
    safeImporterPolicy: {
      structuralFatalChecks: [
        "file has at least 50 bytes",
        "compressedEnd is within [0x32,fileBytes]",
        "every RLE marker has its value byte",
        "C0 zero-length runs are rejected",
        "the entire declared compressed stream expands to exactly the role-specific canonical length without overshoot",
      ],
      suffixPolicy: "zero or extra trailing bytes are safe to ignore after compressedEnd; exactly 18 is recorded as the shipped-writer fingerprint, not required for memory-safe import",
      semanticPolicy: "reject values that would create impossible array references; warn rather than silently repair unusual but memory-safe values, and preserve the original blob/unknown fields",
      modernEnvelope: "new Web-native saves should add schemaVersion, content/mod hashes, payload length and checksum outside the legacy payload; this is an explicit extension, not a field invented inside TST",
    },
    mutationCorpus: buildMutationCorpus(),
    samples,
    deterministicReplay: {
      nativeSaveContainsRandomSeed: false,
      nativeSaveContainsPitPhaseOrTimerCounter: false,
      nativeSaveContainsInputEventLog: false,
      deterministicContinuationFromTstAlone: false,
      proof: [
        "ordinary damage calls 0000:95D2, which directly samples PIT channel 0 and retains no serialized seed",
        "AI random selection at 1000:2016 samples PIT and uses CS:0BC1, outside all WAR serializer blocks",
        "prayer at 1000:5BE6 samples PIT and accumulates DS:6024, outside all WAR serializer blocks",
        "stomp at 1000:7460 samples PIT and uses CS:00CB, outside all WAR serializer blocks",
        "additional PIT-dependent choices include shooting evasion, AI deferral/movement, path tie ordering and victory portrait selection",
      ],
      consequence: "TST restores a stable gameplay snapshot but not the future random stream; repeating the same player choices after load need not reproduce damage, AI choices, routes, or presentation variants",
      futureWebReplayRequirements: [
        "a deterministic PRNG algorithm and serialized state/call index",
        "a semantic action log recorded only at stable simulation decision boundaries",
        "initial checkpoint/save hash, ruleset version, and ordered mod/content hashes",
        "separate presentation timing from simulation RNG so frame rate and audio completion cannot perturb outcomes",
      ],
      fidelityRule: "legacy-import fidelity may emulate the proven PIT-derived domains and branches, but exact future replay is impossible unless the Web version starts recording its own deterministic extension state",
    },
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`verified ${signatures.length} code signatures, ${samples.length} saves, and ${output.mutationCorpus.length} corruption cases`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
