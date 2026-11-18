// REMAKE-188 story voice-over: the runtime SAY dialogue pages, read from the same
// TypeScript modules the game registers, so the voice catalog is checked against
// what the player actually sees rather than against reverse/ evidence.
//
// A clip key is `(SAY record, KY wait)` = `DialoguePage.source.{record, wait}`.
// A page is voiceable when it starts typing: it has an active window with text.
// An appended page (`revealStart > 0`) only types, and so only speaks, the new part.

import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { runnerImport } from "vite";

/** Records the remake reads as story dialogue; the generator rejects anything else. */
export const VOICE_PAGE_MODULES = Object.freeze({
  dialogue: "src/game/content/dialogue.ts",
  stage49: "src/game/content/stage49-ending.generated.ts",
});

const STAGE_RUNTIME_PATTERN = /^stage(\d+)-runtime\.generated\.ts$/u;

export const clipKey = (record, wait) => `${record}:${wait}`;

/** SHA-256 of the text the player sees typed on this page (the new part of an appended page). */
export const displayTextHash = (text) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

function isDialoguePage(value) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && typeof value.source === "object"
    && value.source !== null
    && "record" in value.source
    && typeof value.source.wait === "number";
}

export async function importModule(root, relative) {
  const { module } = await runnerImport(path.join(root, relative), {
    configFile: false,
    root,
    logLevel: "error",
  });
  return module;
}

/**
 * The stage (resource gate) a story belongs to, from its id. A runtime module
 * can carry another stage's stories: stage 5's module holds the stage 42
 * portal interlude. The ending story belongs to the `ending` route.
 */
export function stageForStory(storyId) {
  if (storyId === "stage-49-ending-story") return "ending";
  const match = /^(stage-\d{2}(?:-portal)?)-/u.exec(storyId);
  if (!match) throw new Error(`cannot tell the stage of story ${storyId}`);
  return match[1];
}

function* storyEntries(stories) {
  for (const [storyId, pages] of Object.entries(stories)) {
    const stageId = stageForStory(storyId);
    for (const [index, page] of pages.entries()) {
      if (!isDialoguePage(page)) throw new Error(`${storyId}[${index}] is not a dialogue page`);
      yield { stageId, storyId, index, page };
    }
  }
}

/**
 * Every runtime story page, in stage then story order. Stage 0 comes from the
 * hand-written `dialogue.ts`, stages 1–38 from their generated runtime modules,
 * and the ending (SAY/0070) from `stage49-ending.generated.ts`. Each entry
 * names its resource gate: a `StageId`, or `ending`.
 */
export async function loadStoryPages(root) {
  const entries = [];
  const dialogue = await importModule(root, VOICE_PAGE_MODULES.dialogue);
  entries.push(...storyEntries(dialogue.STORY_PAGES_BY_ID));

  const contentDir = path.join(root, "src/game/content");
  const stageFiles = (await readdir(contentDir))
    .map((name) => ({ name, match: STAGE_RUNTIME_PATTERN.exec(name) }))
    .filter(({ match }) => match && Number(match[1]) > 0)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]));
  for (const { name, match } of stageFiles) {
    const stageNumber = Number(match[1]);
    const exportName = `STAGE${stageNumber}_STORY_PAGES`;
    const module = await importModule(root, `src/game/content/${name}`);
    if (!module[exportName]) throw new Error(`${name} has no ${exportName}`);
    entries.push(...storyEntries(module[exportName]));
  }

  const ending = await importModule(root, VOICE_PAGE_MODULES.stage49);
  entries.push(...storyEntries({ "stage-49-ending-story": ending.STAGE49_STORY_PAGES }));
  return entries;
}

/** The window that types on this page, and what it types; undefined when nothing types. */
export function typedPart(page) {
  const slot = page.activeSlot;
  const state = slot ? page[slot] : undefined;
  if (!slot || state?.text === undefined) return undefined;
  const start = page.revealStart ?? 0;
  return { slot, state, text: state.text.slice(start), revealStart: start };
}

/**
 * Collapse story entries to one record per SAY page. A SAY record shown in two
 * stories must show the same page in both; the clip lists every stage using it.
 */
export function sayPages(entries) {
  const pages = new Map();
  for (const entry of entries) {
    const { record, wait } = entry.page.source;
    if (typeof record !== "number") continue;
    const key = clipKey(record, wait);
    const typed = typedPart(entry.page);
    const signature = JSON.stringify(typed ? [typed.slot, typed.text, typed.state.portrait ?? null] : null);
    const existing = pages.get(key);
    if (existing) {
      if (existing.signature !== signature) {
        throw new Error(`SAY page ${key} differs between ${existing.stories[0]} and ${entry.storyId}`);
      }
      if (!existing.stages.includes(entry.stageId)) existing.stages.push(entry.stageId);
      if (!existing.stories.includes(entry.storyId)) existing.stories.push(entry.storyId);
      continue;
    }
    pages.set(key, {
      key,
      record,
      wait,
      stages: [entry.stageId],
      stories: [entry.storyId],
      page: entry.page,
      typed,
      signature,
    });
  }
  return [...pages.values()].sort((a, b) => a.record - b.record || a.wait - b.wait);
}
