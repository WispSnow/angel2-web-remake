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
  | "battle-presentation";

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

export const SIDE_PANEL_HOTSPOTS: readonly SidePanelHotspot[] = [
  { id: "save", label: "儲存記錄", bounds: { minX: 489, maxX: 520, minY: 88, maxY: 122 } },
  { id: "load", label: "讀取記錄", bounds: { minX: 526, maxX: 570, minY: 110, maxY: 136 } },
  { id: "grid", label: "地圖方格", bounds: { minX: 602, maxX: 626, minY: 65, maxY: 84 } },
  { id: "sound", label: "音效開關", bounds: { minX: 587, maxX: 612, minY: 33, maxY: 53 } },
  { id: "edgeScroll", label: "地圖捲動", bounds: { minX: 580, maxX: 607, minY: 107, maxY: 137 } },
  { id: "portraits", label: "人物圖像", bounds: { minX: 611, maxX: 627, minY: 108, maxY: 132 } },
  {
    id: "battleAnimation",
    label: "戰鬥動畫",
    bounds: { minX: 504, maxX: 539, minY: 8, maxY: 46 },
    action: "battle-presentation",
    testId: "battle-presentation-hotspot",
  },
  { id: "music", label: "音樂開關", bounds: { minX: 524, maxX: 565, minY: 77, maxY: 104 } },
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
