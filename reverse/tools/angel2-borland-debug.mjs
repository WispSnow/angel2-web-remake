#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const BORLAND_DEBUG_SIGNATURE = 0x52fb;
const BORLAND_310_VERSION = 0x0310;
const DEBUG_HEADER_BYTES = 0x50;
const SYMBOL_RECORD_BYTES = 9;

function hex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function mzDeclaredImageBytes(buffer, fileName = "executable") {
  if (buffer.length < 0x1c || buffer.toString("ascii", 0, 2) !== "MZ") {
    throw new Error(`${fileName}: not an MZ executable`);
  }
  const bytesInLastPage = buffer.readUInt16LE(2);
  const pageCount = buffer.readUInt16LE(4);
  if (pageCount === 0) {
    throw new Error(`${fileName}: invalid zero MZ page count`);
  }
  const finalPageBytes = bytesInLastPage === 0 ? 512 : bytesInLastPage;
  const declaredBytes = (pageCount - 1) * 512 + finalPageBytes;
  if (declaredBytes > buffer.length) {
    throw new Error(
      `${fileName}: declared MZ size ${declaredBytes} exceeds file size ${buffer.length}`,
    );
  }
  return declaredBytes;
}

function parseNullTerminatedNames(buffer, offset, byteLength, expectedCount, fileName) {
  const end = offset + byteLength;
  if (offset < 0 || end > buffer.length) {
    throw new Error(`${fileName}: debug name pool is out of bounds`);
  }
  const names = [];
  let cursor = offset;
  while (cursor < end) {
    const nul = buffer.indexOf(0, cursor);
    if (nul < cursor || nul >= end) {
      throw new Error(`${fileName}: unterminated name in debug name pool`);
    }
    names.push(buffer.toString("ascii", cursor, nul));
    cursor = nul + 1;
  }
  if (names.length !== expectedCount) {
    throw new Error(
      `${fileName}: parsed ${names.length} debug names, expected ${expectedCount}`,
    );
  }
  return names;
}

function parseBorlandDebug(buffer, fileName = "GO.EXE") {
  const debugOffset = mzDeclaredImageBytes(buffer, fileName);
  if (buffer.length - debugOffset < DEBUG_HEADER_BYTES) {
    throw new Error(`${fileName}: no appended Borland debug header`);
  }
  const signature = buffer.readUInt16LE(debugOffset);
  const version = buffer.readUInt16LE(debugOffset + 2);
  if (signature !== BORLAND_DEBUG_SIGNATURE) {
    throw new Error(
      `${fileName}: debug signature ${hex(signature)}h != ${hex(BORLAND_DEBUG_SIGNATURE)}h`,
    );
  }
  if (version !== BORLAND_310_VERSION) {
    throw new Error(
      `${fileName}: unsupported Borland debug version ${hex(version)}h`,
    );
  }

  const namePoolBytes = buffer.readUInt16LE(debugOffset + 4);
  const nameCount = buffer.readUInt16LE(debugOffset + 8);
  const symbolCount = buffer.readUInt16LE(debugOffset + 0x0e);
  const globalSymbolCount = buffer.readUInt16LE(debugOffset + 0x10);
  const moduleCount = buffer.readUInt16LE(debugOffset + 0x12);
  const sourceLineCount = buffer.readUInt16LE(debugOffset + 0x18);
  const symbolTableOffset = debugOffset + DEBUG_HEADER_BYTES;
  const namePoolOffset = buffer.length - namePoolBytes;
  const symbolTableEnd = symbolTableOffset + symbolCount * SYMBOL_RECORD_BYTES;
  if (symbolTableEnd > namePoolOffset) {
    throw new Error(`${fileName}: symbol table overlaps the debug name pool`);
  }
  if (globalSymbolCount > symbolCount) {
    throw new Error(`${fileName}: global-symbol count exceeds symbol count`);
  }

  const names = parseNullTerminatedNames(
    buffer,
    namePoolOffset,
    namePoolBytes,
    nameCount,
    fileName,
  );
  const symbols = [];
  for (let index = 0; index < symbolCount; index += 1) {
    const offset = symbolTableOffset + index * SYMBOL_RECORD_BYTES;
    const nameIndex = buffer.readUInt16LE(offset);
    const type = buffer.readUInt16LE(offset + 2);
    const addressOffset = buffer.readUInt16LE(offset + 4);
    const segment = buffer.readUInt16LE(offset + 6);
    const flags = buffer[offset + 8];
    if (nameIndex === 0 || nameIndex > names.length) {
      throw new Error(
        `${fileName}: symbol ${index + 1} has invalid name index ${nameIndex}`,
      );
    }
    symbols.push({
      index: index + 1,
      scope: index < globalSymbolCount ? "global" : "local",
      nameIndex,
      name: names[nameIndex - 1],
      type,
      typeHex: `${hex(type)}h`,
      segment,
      offset: addressOffset,
      address: `${hex(segment)}:${hex(addressOffset)}`,
      flags,
      flagsHex: `${hex(flags, 2)}h`,
    });
  }

  return {
    format: "Borland TLINK 3.10 appended debug information",
    sourceFile: fileName,
    sha256: sha256(buffer),
    fileBytes: buffer.length,
    mzDeclaredImageBytes: debugOffset,
    appendedDebugBytes: buffer.length - debugOffset,
    header: {
      offset: debugOffset,
      offsetHex: `${hex(debugOffset, 8)}h`,
      signature: `${hex(signature)}h`,
      version: "3.10",
      headerBytes: DEBUG_HEADER_BYTES,
      namePoolBytes,
      nameCount,
      symbolCount,
      globalSymbolCount,
      localSymbolCount: symbolCount - globalSymbolCount,
      moduleCount,
      sourceLineCount,
      unknownWord0A: buffer.readUInt16LE(debugOffset + 0x0a),
    },
    layout: {
      symbolTableOffset,
      symbolRecordBytes: SYMBOL_RECORD_BYTES,
      namePoolOffset,
    },
    names,
    symbols,
  };
}

function usage() {
  return "usage: angel2-borland-debug.mjs --extract INPUT.EXE OUTPUT.json";
}

async function main() {
  const [command, inputFile, outputFile] = process.argv.slice(2);
  if (command !== "--extract" || inputFile === undefined || outputFile === undefined) {
    throw new Error(usage());
  }
  const parsed = parseBorlandDebug(await readFile(inputFile), inputFile);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(parsed, null, 2)}\n`);
  console.log(
    `extracted ${parsed.header.symbolCount} symbols ` +
    `(${parsed.header.globalSymbolCount} global, ${parsed.header.localSymbolCount} local) ` +
    `and ${parsed.header.nameCount} names`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { mzDeclaredImageBytes, parseBorlandDebug };
