#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const big5Decoder = new TextDecoder("big5", { fatal: true });

function validateCrLf(buffer, fileName) {
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 0x0d && buffer[index + 1] !== 0x0a) {
      throw new Error(`${fileName}: lone CR at byte ${index}`);
    }
    if (buffer[index] === 0x0a && buffer[index - 1] !== 0x0d) {
      throw new Error(`${fileName}: lone LF at byte ${index}`);
    }
  }
}

function parseCommand(line, lineNumber) {
  const commentIndex = line.indexOf(";;");
  const commandPart = (commentIndex === -1 ? line : line.slice(0, commentIndex))
    .slice(1)
    .trim();
  const comment =
    commentIndex === -1 ? null : line.slice(commentIndex + 2).trim();
  const match = /^(\S+)(?:\s+(.*))?$/.exec(commandPart);
  if (match === null) {
    throw new Error(`empty command on line ${lineNumber}`);
  }
  const argumentText = match[2]?.trim() ?? "";
  return {
    type: "command",
    line: lineNumber,
    command: match[1],
    args: argumentText === "" ? [] : argumentText.split(/\s+/),
    comment,
  };
}

function parseSayRecord(buffer, fileName = "SAY record") {
  if (buffer.length === 0 || buffer.at(-1) !== 0x1a) {
    throw new Error(`${fileName}: missing DOS EOF byte 1Ah`);
  }
  const content = buffer.subarray(0, -1);
  validateCrLf(content, fileName);
  const decoded = big5Decoder.decode(content);
  const lines = decoded.split("\r\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }

  const events = lines.map((line, index) => {
    const lineNumber = index + 1;
    if (line.startsWith("^")) {
      return parseCommand(line, lineNumber);
    }
    if (line === "$") {
      return { type: "marker", line: lineNumber, marker: "$" };
    }
    return { type: line === "" ? "blank" : "text", line: lineNumber, text: line };
  });

  return {
    format: "ANGEL2 Big5 SAY script",
    encoding: "Big5",
    lineEnding: "CRLF",
    dosEof: true,
    events,
  };
}

async function listRecordNames(directory) {
  return (await readdir(directory))
    .filter((name) => /^\d{4}\.bin$/.test(name))
    .sort();
}

async function inspectDirectory(directory) {
  const names = await listRecordNames(directory);
  const commands = new Map();
  let eventCount = 0;
  let textLines = 0;
  let blankLines = 0;
  let dollarMarkers = 0;
  let edRecords = 0;

  for (const name of names) {
    const parsed = parseSayRecord(
      await readFile(path.join(directory, name)),
      `${directory}/${name}`,
    );
    eventCount += parsed.events.length;
    let hasEd = false;
    for (const event of parsed.events) {
      if (event.type === "text") {
        textLines += 1;
      }
      else if (event.type === "blank") {
        blankLines += 1;
      }
      else if (event.type === "marker" && event.marker === "$") {
        dollarMarkers += 1;
      }
      else if (event.type === "command") {
        if (event.command === "ED") {
          hasEd = true;
        }
        const stats = commands.get(event.command) ?? {
          command: event.command,
          count: 0,
          argumentArities: new Set(),
          samples: [],
        };
        stats.count += 1;
        stats.argumentArities.add(event.args.length);
        const sample = [event.args.join(" "), event.comment]
          .filter((value) => value !== null && value !== "")
          .join(" ;; ");
        if (sample !== "" && !stats.samples.includes(sample) && stats.samples.length < 6) {
          stats.samples.push(sample);
        }
        commands.set(event.command, stats);
      }
    }
    if (hasEd) {
      edRecords += 1;
    }
  }

  const commandStats = [...commands.values()]
    .sort((left, right) => left.command.localeCompare(right.command))
    .map((stats) => ({
      command: stats.command,
      count: stats.count,
      argumentArities: [...stats.argumentArities].sort((a, b) => a - b),
      samples: stats.samples,
    }));

  console.log(
    JSON.stringify(
      {
        records: names.length,
        eventCount,
        textLines,
        blankLines,
        dollarMarkers,
        recordsWithEdCommand: edRecords,
        commands: commandStats,
      },
      null,
      2,
    ),
  );
}

async function parseOne(inputFile, outputFile) {
  const parsed = parseSayRecord(await readFile(inputFile), inputFile);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(parsed, null, 2)}\n`);
  console.log(`parsed ${parsed.events.length} events to ${outputFile}`);
}

async function parseAll(inputDirectory, outputDirectory) {
  const names = await listRecordNames(inputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  for (const name of names) {
    await parseOne(
      path.join(inputDirectory, name),
      path.join(outputDirectory, name.replace(/\.bin$/, ".json")),
    );
  }
}

function usage() {
  return [
    "usage:",
    "  angel2-say.mjs --inspect SAY_DIR",
    "  angel2-say.mjs --parse INPUT.bin OUTPUT.json",
    "  angel2-say.mjs --parse-all SAY_DIR OUTPUT_DIR",
  ].join("\n");
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "--inspect" && args.length === 1) {
    await inspectDirectory(args[0]);
    return;
  }
  if (command === "--parse" && args.length === 2) {
    await parseOne(args[0], args[1]);
    return;
  }
  if (command === "--parse-all" && args.length === 2) {
    await parseAll(args[0], args[1]);
    return;
  }
  throw new Error(usage());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { parseSayRecord };
