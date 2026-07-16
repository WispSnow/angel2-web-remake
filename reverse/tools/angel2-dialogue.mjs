#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { parseSayRecord } from "./angel2-say.mjs";

const COMMAND_SEMANTICS = Object.freeze({
  "\\\\": {
    operation: "line_break",
    confidence: "confirmed",
    evidence: "Script layout and live rendering both show continued text on a new line.",
  },
  BK: {
    operation: "backup_framebuffer",
    confidence: "confirmed",
    nativeInterpreters: [25, 29],
    evidence: "Both native dispatchers snapshot the current VGA page state; module 25 copies the active page to its XOR-0800h companion, while module 29 preserves the battle viewport planes.",
  },
  CD: {
    operation: "close_window",
    slot: "lower",
    confidence: "confirmed",
    nativeInterpreters: [25, 29],
    evidence: "The native lower-window routine runs the twelve-step close animation and clears the lower-open flag.",
  },
  CU: {
    operation: "close_window",
    slot: "upper",
    confidence: "confirmed",
    nativeInterpreters: [25, 29],
    evidence: "The native upper-window routine runs the twelve-step close animation and clears the upper-open flag.",
  },
  CW: {
    operation: "native_noop",
    confidence: "confirmed",
    nativeInterpreters: [],
    evidence: "Neither module-25 nor module-29 command dispatcher compares against CW. The shipped interpreter consumes the two letters and returns without a side effect.",
  },
  DL: {
    operation: "wait_native_ticks",
    confidence: "confirmed",
    nativeInterpreters: [29],
    evidence: "Module 29 parses the decimal argument and passes it directly as CX to ANGEL2_WAIT_NATIVE_TIMER_TICKS. Module 25 has no DL branch.",
  },
  ED: {
    operation: "end",
    confidence: "confirmed",
    nativeInterpreters: [25, 29],
    evidence: "Both native dispatchers clear their interpreter-active flag; module 29 additionally restores the battle map, minimap, overlays, and HUD.",
  },
  HD: {
    operation: "show_portrait",
    slot: "lower",
    confidence: "confirmed",
    nativeInterpreters: [25, 29],
    evidence: "Both native dispatchers parse the id, load D/<id>, and draw the lower/right portrait assembly.",
  },
  HU: {
    operation: "show_portrait",
    slot: "upper",
    confidence: "confirmed",
    nativeInterpreters: [25, 29],
    evidence: "Both native dispatchers parse the id, load D/<id>, and draw the upper/left portrait assembly.",
  },
  KY: {
    operation: "wait_for_input",
    confidence: "confirmed",
    nativeInterpreters: [25, 29],
    evidence: "Module 25 waits for input; module 29 waits indefinitely in battle-SAY mode and has a 21-tick auto-return only in its alternate non-battle mode.",
  },
  ME: {
    operation: "store_portrait_id",
    confidence: "confirmed",
    nativeInterpreters: [25, 29],
    evidence: "Both dispatchers only parse and store the decimal argument. Resource loading and drawing occur later in HU or HD.",
  },
  PD: {
    operation: "hide_portrait",
    slot: "lower",
    confidence: "confirmed",
    nativeInterpreters: [25, 29],
    evidence: "The native routine clears the lower portrait region with A/20 pieces and clears both lower portrait/window-display flags.",
  },
  PP: {
    operation: "set_background",
    confidence: "confirmed",
    nativeInterpreters: [25, 29],
    evidence: "Both native routines parse the id, load BK/<id>, and draw its 320x200 image at native coordinate (160,80).",
  },
  PU: {
    operation: "hide_portrait",
    slot: "upper",
    confidence: "confirmed",
    nativeInterpreters: [25, 29],
    evidence: "The native routine clears the upper portrait region with A/20 pieces and clears both upper portrait/window-display flags.",
  },
  "W-": {
    operation: "load_window_graphics",
    confidence: "confirmed",
    nativeInterpreters: [25, 29],
    resource: "A/18",
    evidence: "Both dispatchers load A/18 into the five-plane graphics buffer used by the story-window drawing and animation routines. It does not alter the active-window flag.",
  },
  WD: {
    operation: "open_window",
    slot: "lower",
    confidence: "confirmed",
    nativeInterpreters: [25, 29],
    evidence: "The native routine selects the lower text origin and opens it with an eleven-step animation on first use.",
  },
  WU: {
    operation: "open_window",
    slot: "upper",
    confidence: "confirmed",
    nativeInterpreters: [25, 29],
    evidence: "The native routine selects the upper text origin and opens it with an eleven-step animation on first use.",
  },
});

function numericArgument(event) {
  if (event.args.length !== 1 || !/^\d+$/.test(event.args[0])) {
    throw new Error(
      `line ${event.line}: ^${event.command} expects one decimal argument`,
    );
  }
  return Number.parseInt(event.args[0], 10);
}

function actionFromCommand(event, state) {
  const semantic = COMMAND_SEMANTICS[event.command];
  if (semantic === undefined) {
    return {
      op: "unknown_command",
      command: event.command,
      args: event.args,
      confidence: "unknown",
    };
  }

  const action = {
    op: semantic.operation,
    confidence: semantic.confidence,
  };
  if (semantic.slot !== undefined) {
    action.slot = semantic.slot;
  }
  if (semantic.resource !== undefined) {
    action.resource = semantic.resource;
  }
  action.nativeInterpreters = semantic.nativeInterpreters ?? [25, 29];

  switch (event.command) {
    case "PP":
      action.backgroundId = numericArgument(event);
      state.backgroundId = action.backgroundId;
      break;
    case "ME":
      action.portraitId = numericArgument(event);
      state.preparedPortraitId = action.portraitId;
      break;
    case "HU":
    case "HD": {
      action.portraitId = numericArgument(event);
      const key = event.command === "HU" ? "upperPortraitId" : "lowerPortraitId";
      state[key] = action.portraitId;
      break;
    }
    case "DL":
      action.nativeTicks = numericArgument(event);
      break;
    case "WU":
    case "WD":
      action.replaceText = true;
      state.activeWindow = semantic.slot;
      state[`${semantic.slot}WindowOpen`] = true;
      break;
    case "CU":
    case "CD":
      state[`${semantic.slot}WindowOpen`] = false;
      if (state.activeWindow === semantic.slot) {
        state.activeWindow = null;
      }
      break;
    case "PU":
      state.upperPortraitId = null;
      break;
    case "PD":
      state.lowerPortraitId = null;
      break;
    case "W-":
      state.windowGraphicsLoaded = true;
      break;
    case "ED":
      state.ended = true;
      break;
  }

  return action;
}

function compileDialogue(parsed, source = null) {
  const state = {
    backgroundId: null,
    preparedPortraitId: null,
    upperPortraitId: null,
    lowerPortraitId: null,
    upperWindowOpen: false,
    lowerWindowOpen: false,
    activeWindow: null,
    windowGraphicsLoaded: false,
    ended: false,
  };
  const actions = [];

  for (const event of parsed.events) {
    let action;
    if (event.type === "command") {
      action = actionFromCommand(event, state);
      action.command = event.command;
      if (event.args.length > 0) {
        action.rawArgs = event.args;
      }
      if (event.comment !== null) {
        action.comment = event.comment;
      }
    }
    else if (event.type === "text" || event.type === "blank") {
      action = {
        op: event.type === "blank" ? "blank_line" : "text",
        slot: state.activeWindow,
        text: event.text,
        confidence: state.activeWindow === null ? "tentative" : "confirmed",
      };
    }
    else if (event.type === "marker") {
      action = {
        op: "marker",
        marker: event.marker,
        confidence: "unknown",
      };
    }
    else {
      throw new Error(`line ${event.line}: unsupported SAY event ${event.type}`);
    }
    actions.push({ line: event.line, ...action });
  }

  return {
    format: "ANGEL2 dialogue actions",
    semanticVersion: 2,
    source,
    actions,
    finalState: { ...state },
  };
}

async function listRecordNames(directory) {
  return (await readdir(directory))
    .filter((name) => /^\d{4}\.bin$/.test(name))
    .sort();
}

async function compileOne(inputFile, outputFile) {
  const parsed = parseSayRecord(await readFile(inputFile), inputFile);
  const compiled = compileDialogue(parsed, path.basename(inputFile));
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(compiled, null, 2)}\n`);
  return compiled;
}

async function compileAll(inputDirectory, outputDirectory) {
  const names = await listRecordNames(inputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  let actionCount = 0;
  for (const name of names) {
    const compiled = await compileOne(
      path.join(inputDirectory, name),
      path.join(outputDirectory, name.replace(/\.bin$/, ".json")),
    );
    actionCount += compiled.actions.length;
  }
  console.log(`compiled ${actionCount} actions from ${names.length} SAY records`);
}

async function selfTest(inputDirectory) {
  const names = await listRecordNames(inputDirectory);
  assert.equal(names.length, 176, "expected all 176 SAY records");

  const allCommands = new Set();
  for (const name of names) {
    const parsed = parseSayRecord(
      await readFile(path.join(inputDirectory, name)),
      name,
    );
    for (const event of parsed.events) {
      if (event.type === "command") {
        allCommands.add(event.command);
      }
    }
    const compiled = compileDialogue(parsed, name);
    assert.equal(
      compiled.actions.some((action) => action.op === "unknown_command"),
      false,
      `${name} contains an unmapped command`,
    );
  }
  assert.deepEqual(
    [...allCommands].sort(),
    Object.keys(COMMAND_SEMANTICS).sort(),
    "semantic table must cover the exact command inventory",
  );

  const record0 = compileDialogue(
    parseSayRecord(await readFile(path.join(inputDirectory, "0000.bin")), "0000.bin"),
    "0000.bin",
  );
  assert(record0.actions.some(
    (action) => action.op === "set_background" && action.backgroundId === 1,
  ));
  assert(record0.actions.some(
    (action) => action.op === "show_portrait" &&
      action.slot === "upper" && action.portraitId === 46,
  ));
  assert(record0.actions.some(
    (action) => action.op === "show_portrait" &&
      action.slot === "lower" && action.portraitId === 47,
  ));
  assert(record0.actions.some(
    (action) => action.op === "text" &&
      action.slot === "upper" && action.text.includes("發生了什麼事"),
  ));
  assert(record0.actions.some(
    (action) => action.op === "text" &&
      action.slot === "lower" && action.text.includes("不好了"),
  ));
  assert.equal(record0.actions.at(-1).op, "end");
  console.log("dialogue self-test passed: 176 records, 17 commands, record 0000 slots");
}

function usage() {
  return [
    "usage:",
    "  angel2-dialogue.mjs --compile INPUT.bin OUTPUT.json",
    "  angel2-dialogue.mjs --compile-all SAY_DIR OUTPUT_DIR",
    "  angel2-dialogue.mjs --self-test SAY_DIR",
  ].join("\n");
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "--compile" && args.length === 2) {
    await compileOne(args[0], args[1]);
    console.log(`compiled ${args[0]} to ${args[1]}`);
    return;
  }
  if (command === "--compile-all" && args.length === 2) {
    await compileAll(args[0], args[1]);
    return;
  }
  if (command === "--self-test" && args.length === 1) {
    await selfTest(args[0]);
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

export { COMMAND_SEMANTICS, compileDialogue };
