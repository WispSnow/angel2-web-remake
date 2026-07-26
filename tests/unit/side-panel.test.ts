import { describe, expect, test } from "vitest";
import {
  implementedSidePanelHotspots,
  SIDE_PANEL_HOTSPOTS,
  SIDE_PANEL_TOGGLE_VISUALS,
} from "../../src/game/side-panel";

describe("native battle side-panel hotspots", () => {
  test("preserves all twelve inclusive release hitboxes", () => {
    expect(SIDE_PANEL_HOTSPOTS).toEqual([
      {
        id: "save",
        label: "儲存記錄",
        bounds: { minX: 489, maxX: 520, minY: 88, maxY: 122 },
        action: "system-save",
        testId: "save-hotspot",
      },
      {
        id: "load",
        label: "讀取記錄",
        bounds: { minX: 526, maxX: 570, minY: 110, maxY: 136 },
        action: "system-load",
        testId: "load-hotspot",
      },
      {
        id: "grid",
        label: "地圖方格",
        bounds: { minX: 602, maxX: 626, minY: 65, maxY: 84 },
        action: "toggle-grid",
        testId: "grid-hotspot",
      },
      {
        id: "sound",
        label: "音效開關",
        bounds: { minX: 587, maxX: 612, minY: 33, maxY: 53 },
        action: "open-sound-settings",
        testId: "sound-hotspot",
      },
      {
        id: "edgeScroll",
        label: "地圖捲動",
        bounds: { minX: 580, maxX: 607, minY: 107, maxY: 137 },
        action: "toggle-edge-scroll",
        testId: "edge-scroll-hotspot",
      },
      {
        id: "portraits",
        label: "人物圖像",
        bounds: { minX: 611, maxX: 627, minY: 108, maxY: 132 },
        action: "toggle-portraits",
        testId: "portraits-hotspot",
      },
      {
        id: "battleAnimation",
        label: "戰鬥動畫",
        bounds: { minX: 504, maxX: 539, minY: 8, maxY: 46 },
        action: "battle-presentation",
        testId: "battle-presentation-hotspot",
      },
      {
        id: "music",
        label: "音樂開關",
        bounds: { minX: 524, maxX: 565, minY: 77, maxY: 104 },
        action: "open-music-settings",
        testId: "music-hotspot",
      },
      {
        id: "groupCommands",
        label: "集體命令",
        bounds: { minX: 490, maxX: 513, minY: 36, maxY: 60 },
        action: "open-group-commands",
        testId: "group-command-hotspot",
      },
      {
        id: "objectives",
        label: "勝利條件",
        bounds: { minX: 571, maxX: 600, minY: 75, maxY: 86 },
        action: "objectives",
        testId: "objectives-hotspot",
      },
      {
        id: "allRest",
        label: "全部休息",
        bounds: { minX: 490, maxX: 515, minY: 61, maxY: 84 },
        action: "all-rest",
        testId: "all-rest-hotspot",
      },
      {
        id: "systemMenu",
        label: "遊戲功能",
        bounds: { minX: 545, maxX: 560, minY: 6, maxY: 42 },
        action: "open-system-menu",
        testId: "system-menu-button",
      },
    ]);
  });

  test("implements all twelve native side-panel actions", () => {
    expect(implementedSidePanelHotspots().map(({ id, action }) => ({ id, action }))).toEqual([
      { id: "save", action: "system-save" },
      { id: "load", action: "system-load" },
      { id: "grid", action: "toggle-grid" },
      { id: "sound", action: "open-sound-settings" },
      { id: "edgeScroll", action: "toggle-edge-scroll" },
      { id: "portraits", action: "toggle-portraits" },
      { id: "battleAnimation", action: "battle-presentation" },
      { id: "music", action: "open-music-settings" },
      { id: "groupCommands", action: "open-group-commands" },
      { id: "objectives", action: "objectives" },
      { id: "allRest", action: "all-rest" },
      { id: "systemMenu", action: "open-system-menu" },
    ]);
  });

  test("preserves the four native setting-driven A/0006 frame pairs", () => {
    expect(SIDE_PANEL_TOGGLE_VISUALS).toEqual([
      {
        id: "battleAnimation",
        origin: { x: 24, y: 11 },
        size: { width: 32, height: 33 },
        nativeFrames: { off: 20, on: 21 },
      },
      {
        id: "grid",
        origin: { x: 120, y: 65 },
        size: { width: 32, height: 11 },
        nativeFrames: { off: 24, on: 25 },
      },
      {
        id: "edgeScroll",
        origin: { x: 88, y: 106 },
        size: { width: 40, height: 31 },
        nativeFrames: { off: 26, on: 27 },
      },
      {
        id: "portraits",
        origin: { x: 128, y: 111 },
        size: { width: 16, height: 3 },
        nativeFrames: { off: 30, on: 31 },
      },
    ]);
  });
});
