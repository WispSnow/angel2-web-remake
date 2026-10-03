import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  NATIVE_DEBUG_CELL_READOUT,
  NATIVE_DEBUG_SIDE_LIFE_MENUS,
  NATIVE_MUSIC_BOX,
} from "../../src/game/content/debug-mode.generated";
import {
  MUSIC_BOX_TRACKS,
  musicBoxProgram,
  nativeMusicBoxLine,
} from "../../src/game/content/music-box";
import { createDebugScenarioController } from "../../src/game/debug-scenarios";
import type { DebugScenarioId } from "../../src/game/debug-scenario-catalog";
import {
  originalDebugHotkey,
  setOriginalDebugModeEnabled,
  type DebugKeyEvent,
} from "../../src/game/original-debug-mode";
import {
  DEBUG_PREFERENCES_KEY,
  loadDebugPreferences,
  saveDebugPreferences,
} from "../../src/game/preferences";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const storage = new MemoryStorage();

beforeAll(() => {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("location", { search: "" });
  // The line-22h window waits on the program clock, which schedules through `window`.
  vi.stubGlobal("window", {
    localStorage: storage,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  setOriginalDebugModeEnabled(false);
  storage.clear();
});

const openScenario = (id: DebugScenarioId) => createDebugScenarioController(id, {
  difficulty: 0,
  rosterSource: { kind: "profile", id: "representative-growth" },
  storage,
});

const keyEvent = (
  code: string,
  key: string,
  options: { capsLock?: boolean; ctrlKey?: boolean } = {},
): DebugKeyEvent => ({
  code,
  key,
  ctrlKey: options.ctrlKey ?? false,
  getModifierState: (modifier) => modifier === "CapsLock" && (options.capsLock ?? true),
});

describe("REMAKE-174 original debug hotkeys", () => {
  it("only answers while Caps Lock is on, like the native 0000:B78C gate", () => {
    expect(originalDebugHotkey(keyEvent("F3", "F3", { capsLock: false }))).toBeUndefined();
    expect(originalDebugHotkey(keyEvent("F3", "F3"))).toBe("enemyLifeMenu");
    expect(originalDebugHotkey(keyEvent("F3", "F3", { ctrlKey: true }))).toBeUndefined();
  });

  it("maps every native dispatcher key the remake reproduces", () => {
    const mapped = Object.fromEntries([
      ["F4", "F4"], ["F10", "F10"], ["KeyU", "U"], ["KeyD", "D"], ["NumpadSubtract", "-"],
      ["Minus", "-"], ["KeyS", "S"], ["Digit2", "2"], ["KeyJ", "J"], ["NumpadMultiply", "*"],
      ["KeyM", "M"], ["F1", "F1"], ["F2", "F2"], ["F5", "F5"], ["F6", "F6"], ["Digit1", "1"],
    ].map(([code, key]) => [code, originalDebugHotkey(keyEvent(code, key))]));
    expect(mapped).toEqual({
      F4: "allyLifeMenu",
      F10: "refreshAllies",
      KeyU: "experienceUp",
      KeyD: "experienceDown",
      NumpadSubtract: "lifeDown",
      Minus: "lifeDown",
      KeyS: "headacheLine",
      Digit2: "cellReadout",
      KeyJ: "instantVictory",
      NumpadMultiply: "skipToEnding",
      KeyM: "musicBox",
      F1: "behaviourEditor",
      F2: "editMenu",
      F5: "techniqueAttack",
      F6: "techniqueSupport",
      Digit1: "rangeReadout",
    });
    // Keyboards without a keypad reach the native keypad * through Shift+8.
    expect(originalDebugHotkey(keyEvent("Digit8", "*"))).toBe("skipToEnding");
  });

  it("persists the host switch outside every save payload", () => {
    const memory = new MemoryStorage();
    expect(loadDebugPreferences(memory)).toEqual({ originalDebugMode: false });
    saveDebugPreferences(memory, { originalDebugMode: true });
    expect(memory.getItem(DEBUG_PREFERENCES_KEY)).toBe("{\"originalDebugMode\":true}");
    expect(loadDebugPreferences(memory)).toEqual({ originalDebugMode: true });
    memory.setItem(DEBUG_PREFERENCES_KEY, "{broken");
    expect(loadDebugPreferences(memory)).toEqual({ originalDebugMode: false });
  });
});

describe("REMAKE-174 native debug content", () => {
  it("keeps the original F3/F4 strings and their verified effects", () => {
    expect(NATIVE_DEBUG_SIDE_LIFE_MENUS.enemy).toMatchObject({ key: "F3", side: 2, descriptor: "DS:4156" });
    expect(NATIVE_DEBUG_SIDE_LIFE_MENUS.enemy.items.map(({ code, label, effect }) => [code, label, effect]))
      .toEqual([["1Y", "敵全滿  ", "full"], ["2Y", "敵全滅  ", "remove"], ["3Y", "敵  1   ", "one"]]);
    expect(NATIVE_DEBUG_SIDE_LIFE_MENUS.ally.items.map(({ code, label, effect }) => [code, label, effect]))
      .toEqual([["1M", "我全滿  ", "full"], ["2M", "我全滅  ", "remove"], ["3M", "我  1   ", "one"]]);
    expect(NATIVE_DEBUG_CELL_READOUT.fields.map(({ id, text }) => [id, text]))
      .toEqual([["cursorCell", { x: 40, y: 30 }], ["difficulty", { x: 120, y: 30 }]]);
  });

  it("lists the 31 selectable entries in native order, then everything the original left out", () => {
    expect(NATIVE_MUSIC_BOX.entries).toHaveLength(32);
    const native = MUSIC_BOX_TRACKS.filter(({ group }) => group === "native");
    expect(native).toHaveLength(31);
    expect(native.map(({ nativeIndex }) => nativeIndex)).toEqual(Array.from({ length: 31 }, (_, index) => index));
    expect(native[26]).toMatchObject({ legacyName: "T04.RIX", container: "MAGIC", record: 75, kind: "loop" });
    expect(nativeMusicBoxLine(native[26])).toBe("MUSIC-   26-T04.RIX");
    expect(native[26].usage).toContain("正常流程聽不到");
    expect(MUSIC_BOX_TRACKS.filter(({ group }) => group === "extra")
      .map(({ legacyName, container, record }) => legacyName ?? `${container}/${record}`))
      .toEqual(["TALK.RIX", "UN/48", "UN/6", "UN/49", "UN/55"]);
    expect(MUSIC_BOX_TRACKS.find(({ container, record }) => container === "UN" && record === 48)?.usage)
      .toBe("敵方回合：究極女神專屬曲");
  });

  it("plays single records as loops and battle records as entry-then-loop pairs", () => {
    const a06 = MUSIC_BOX_TRACKS.find(({ legacyName }) => legacyName === "A06.RIX");
    const a02 = MUSIC_BOX_TRACKS.find(({ legacyName }) => legacyName === "A02.RIX");
    if (!a06 || !a02) throw new Error("missing native music box entries");
    expect(musicBoxProgram(a06)).toMatchObject({
      kind: "intro-loop",
      entryTrack: "MUSIC/3",
      loopTrack: "MUSIC/2",
      entry: "/assets/original/music/MUSIC/0003.ogg",
      seamlessLoop: "/assets/original/music/MUSIC/0002.ogg",
    });
    expect(a06.usage).toMatch(/^我方回合：/u);
    expect(musicBoxProgram(a02)).toMatchObject({
      kind: "loop",
      track: "MUSIC/0",
      source: "/assets/original/music/MUSIC/0000.ogg",
    });
  });
});

describe("REMAKE-174 debug commands on a real battle", () => {
  it("stays inert while the switch is off", async () => {
    const controller = await openScenario("stage-00-player");
    expect(controller.originalDebugActive).toBe(false);
    expect(controller.runOriginalDebugHotkey("instantVictory")).toBe(false);
    expect(controller.battle.outcome()).toBe("ongoing");
  });

  it("sets a whole side's life without consuming the battle PRNG", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-00-player");
    const rng = { state: controller.battle.rng.state, calls: controller.battle.rng.calls };
    expect(controller.runOriginalDebugHotkey("enemyLifeMenu")).toBe(true);
    expect(controller.debugMenu).toEqual({ kind: "life", side: 2, index: 0 });
    expect(controller.debugMenuItems.map(({ label }) => label)).toEqual(["敵全滿  ", "敵全滅  ", "敵  1   "]);
    controller.selectDebugMenuItem(2);
    controller.activateDebugMenuSelection();
    expect(controller.battle.units.filter(({ side }) => side === 2).map(({ life }) => life))
      .toEqual(controller.battle.units.filter(({ side }) => side === 2).map(() => 1));

    controller.runOriginalDebugHotkey("enemyLifeMenu");
    controller.activateDebugMenuSelection();
    for (const unit of controller.battle.units.filter(({ side }) => side === 2)) {
      expect(unit.life).toBe(controller.battle.statsFor(unit).maxLife);
    }
    expect({ state: controller.battle.rng.state, calls: controller.battle.rng.calls }).toEqual(rng);

    controller.runOriginalDebugHotkey("enemyLifeMenu");
    controller.selectDebugMenuItem(1);
    controller.activateDebugMenuSelection();
    expect(controller.battle.units.some(({ side }) => side === 2)).toBe(false);
    expect(controller.phase).not.toBe("player");
  });

  it("forces the stage's own victory flow on Caps Lock+J", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-00-player");
    const enemies = controller.battle.units.filter(({ side }) => side === 2).length;
    expect(enemies).toBeGreaterThan(0);
    expect(controller.runOriginalDebugHotkey("instantVictory")).toBe(true);
    expect(controller.battle.outcome()).toBe("victory");
    expect(controller.battle.units.filter(({ side }) => side === 2)).toHaveLength(enemies);
    expect(["victoryStory", "victoryFeedback"]).toContain(controller.phase);
  });

  it("moves experience by 50, floors the decrease and runs the promotion scan", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-00-player");
    const nia = controller.battle.unit("1:0");
    if (!nia) throw new Error("missing Nia");
    controller.cursor = { x: nia.x, y: nia.y };
    expect(nia.experience).toBe(299);
    controller.runOriginalDebugHotkey("experienceDown");
    expect(nia.experience).toBe(249);
    controller.runOriginalDebugHotkey("experienceUp");
    controller.runOriginalDebugHotkey("experienceUp");
    expect(nia.experience).toBe(349);
    // 299 → 349 crosses the fourth-row threshold the native idle loop scans for.
    expect(controller.promotionUnitIds).toEqual(["1:0"]);
  });

  it("refuses to leave a zero-life unit on the board and to edit an empty cell", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-00-player");
    const nia = controller.battle.unit("1:0");
    if (!nia) throw new Error("missing Nia");
    controller.cursor = { x: nia.x, y: nia.y };
    nia.life = 25;
    controller.runOriginalDebugHotkey("lifeDown");
    expect(nia.life).toBe(15);
    controller.runOriginalDebugHotkey("lifeDown");
    expect(nia.life).toBe(5);
    controller.runOriginalDebugHotkey("lifeDown");
    expect(nia.life).toBe(5);

    controller.cursor = { x: 0, y: 0 };
    expect(controller.battle.unitAt(controller.cursor)).toBeUndefined();
    controller.runOriginalDebugHotkey("experienceUp");
    expect(controller.statusMessage).toBe("原版Debug：游標下沒有單位。");
  });

  it("re-arms every acted ally on F10 and speaks line 22h with the cursor unit's portrait", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-00-player");
    for (const unit of controller.battle.units.filter(({ side }) => side === 1)) unit.acted = true;
    controller.runOriginalDebugHotkey("refreshAllies");
    expect(controller.battle.units.filter(({ side }) => side === 1).every(({ acted }) => !acted)).toBe(true);

    const nia = controller.battle.unit("1:0");
    if (!nia) throw new Error("missing Nia");
    controller.cursor = { x: nia.x, y: nia.y };
    controller.runOriginalDebugHotkey("headacheLine");
    expect(controller.contextualLineDialogue?.line).toBe("headache");
    expect(controller.contextualLineDialogue?.page.upper)
      .toEqual({ portrait: nia.portrait, speaker: nia.name, text: "我．．．我好難過．．．\n頭好痛啊！" });
  });

  it("shows the native cell index until the cursor moves", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-00-player");
    controller.cursor = { x: 29, y: 26 };
    controller.runOriginalDebugHotkey("cellReadout");
    expect(controller.visibleDebugCellReadout).toEqual({ cell: 1329, difficulty: 0 });
    controller.cursor = { x: 28, y: 26 };
    expect(controller.visibleDebugCellReadout).toBeUndefined();
  });

  it("opens the stage 49 ending at the record cards from the stage-entry roster", async () => {
    setOriginalDebugModeEnabled(true);
    const controller = await openScenario("stage-00-player");
    controller.runOriginalDebugHotkey("skipToEnding");
    expect(controller.phase).toBe("ending");
    expect(controller.stage49Ending?.section).toBe("roster");
    expect(controller.stage49Ending?.rosterCard?.actor.name).toBe("妮雅");
  });

  it("keeps the music box reachable from the music panel without the switch", async () => {
    const controller = await openScenario("stage-00-player");
    controller.openMusicSettings();
    controller.openMusicBox("musicSettings");
    expect(controller.musicBoxOpen).toBe(true);
    controller.selectMusicBoxTrack(26);
    controller.playMusicBoxSelection();
    expect(controller.musicBoxPlayback).toMatchObject({ trackId: "native-26", sequence: 1 });
    expect(controller.musicBoxPlayback?.program).toMatchObject({ kind: "loop", track: "MAGIC/75" });
    controller.closeMusicBox();
    expect(controller.musicSettingsOpen).toBe(true);
    controller.restoreGameMusic();
    expect(controller.musicBoxPlayback).toBeUndefined();
  });
});
