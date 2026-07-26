export type SidePanelHotspotId =
  | "save"
  | "load"
  | "grid"
  | "sound"
  | "edgeScroll"
  | "portraits"
  | "battleAnimation"
  | "music"
  | "groupCommands"
  | "objectives"
  | "allRest"
  | "systemMenu";

export type ImplementedSidePanelAction =
  | "open-system-menu"
  | "open-group-commands"
  | "all-rest"
  | "objectives"
  | "battle-presentation"
  | "system-save"
  | "system-load"
  | "open-sound-settings"
  | "open-music-settings"
  | "toggle-grid"
  | "toggle-edge-scroll"
  | "toggle-portraits";

export interface SidePanelHotspot {
  id: SidePanelHotspotId;
  label: string;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  action?: ImplementedSidePanelAction;
  testId?: string;
}

export type SidePanelToggleVisualId = "battleAnimation" | "grid" | "edgeScroll" | "portraits";

export interface SidePanelToggleVisual {
  id: SidePanelToggleVisualId;
  origin: { x: number; y: number };
  size: { width: number; height: number };
  nativeFrames: { off: number; on: number };
}

// Module 29 0000:B7C6 draws A/0006/19 at global (480,0), then replaces
// these opaque local rectangles from the same record using the live setting
// bytes. Origins are panel-local so the DOM projection does not own native
// screen coordinates or infer them from the clickable bounds.
export const SIDE_PANEL_TOGGLE_VISUALS: readonly SidePanelToggleVisual[] = [
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
];

export const SIDE_PANEL_HOTSPOTS: readonly SidePanelHotspot[] = [
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
];

export const implementedSidePanelHotspots = (): readonly SidePanelHotspot[] =>
  SIDE_PANEL_HOTSPOTS.filter((hotspot) => hotspot.action !== undefined);
