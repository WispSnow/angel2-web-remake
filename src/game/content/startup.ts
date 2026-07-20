import type { Difficulty } from "../types";

export const STARTUP_ASSETS = {
  introBackgrounds: [
    "/assets/original/startup/intro/41.png",
    "/assets/original/startup/intro/43.png",
    "/assets/original/startup/intro/44.png",
    "/assets/original/startup/intro/45.png",
    "/assets/original/startup/intro/46.png",
    "/assets/original/startup/intro/47.png",
    "/assets/original/startup/intro/48.png",
  ],
  title: {
    background: "/assets/original/startup/title/background.png",
    upper: "/assets/original/startup/title/upper.png",
    lower: "/assets/original/startup/title/lower.png",
    menuFrame: "/assets/original/startup/title/menu-frame.png",
  },
  audio: {
    intro: "/assets/original/startup/audio/intro.wav",
    title: "/assets/original/startup/audio/title.wav",
  },
} as const;

export const DIFFICULTY_OPTIONS: ReadonlyArray<{
  value: Difficulty;
  label: string;
  stage30Forms: number;
}> = [
  { value: 0, label: "過關斬將", stage30Forms: 8 },
  { value: 1, label: "勢均力敵", stage30Forms: 16 },
  { value: 2, label: "困難重重", stage30Forms: 24 },
  { value: 3, label: "無法無天", stage30Forms: 32 },
];

export const NATIVE_INTRO_DURATION_MS = 70_921;
export const NATIVE_INTRO_SCROLL_UPDATES = 591;

export const INTRO_BACKGROUND_CHANGES = [
  { update: 0, source: STARTUP_ASSETS.introBackgrounds[0] },
  { update: 111, source: STARTUP_ASSETS.introBackgrounds[1] },
  { update: 231, source: STARTUP_ASSETS.introBackgrounds[2] },
  { update: 291, source: STARTUP_ASSETS.introBackgrounds[3] },
  { update: 351, source: STARTUP_ASSETS.introBackgrounds[4] },
  { update: 431, source: STARTUP_ASSETS.introBackgrounds[5] },
  { update: 491, source: STARTUP_ASSETS.introBackgrounds[6] },
] as const;

export interface IntroLineAssignment {
  update: number;
  slot: 0 | 1 | 2;
  text: string;
}

/**
 * Module 23's exact three-slot assignment timeline. Blank rows are retained
 * because they determine the native spacing between visible narrative lines.
 */
export const INTRO_LINE_ASSIGNMENTS: readonly IntroLineAssignment[] = [
  { update: 11, slot: 0, text: "　　愛斯嘉，一個不可思議的神秘大陸。" },
  { update: 31, slot: 1, text: "" },
  { update: 51, slot: 2, text: "" },
  { update: 71, slot: 0, text: "　即使是地位最為崇高的水神「愛西斯」，" },
  { update: 91, slot: 1, text: "" },
  { update: 111, slot: 2, text: "" },
  { update: 131, slot: 0, text: "　　　也無法插手這塊大陸之中，" },
  { update: 151, slot: 1, text: "　「拉那洛」和「瓦爾克麗」兩族的爭戰。" },
  { update: 171, slot: 2, text: "" },
  { update: 191, slot: 0, text: "　　　　經過了無數次戰爭的蹂躪後，" },
  { update: 211, slot: 1, text: "" },
  { update: 231, slot: 2, text: "「拉那洛」和「瓦爾克麗」兩族，終於合併。" },
  { update: 251, slot: 0, text: "　　　背負人類命運的女帝「維絲塔」，" },
  { update: 271, slot: 1, text: "" },
  { update: 291, slot: 2, text: "　　帶領著眾人，創建了新的愛斯嘉王朝。" },
  { update: 311, slot: 0, text: "雖然，戰爭結束了，但野心卻無時無刻存在著！" },
  { update: 331, slot: 1, text: "" },
  { update: 351, slot: 2, text: "　深知這點的女帝，依然不忘充實軍備，" },
  { update: 371, slot: 0, text: "而提升軍力的工作，就落在妹妹妮雅身上了。" },
  { update: 391, slot: 1, text: "　　妮雅將自身經驗，盡數傳授部下，" },
  { update: 411, slot: 2, text: "" },
  { update: 431, slot: 0, text: "　只求人人能夠保家衛國，並非徒增傷亡，" },
  { update: 451, slot: 1, text: "　　部下們也都全力配合，自我鍛鍊。" },
  { update: 471, slot: 2, text: "" },
  { update: 491, slot: 0, text: "　　　　　平安的日子過去了。" },
  { update: 511, slot: 1, text: "　　　　可怕的陰謀卻緊接而來，" },
  { update: 531, slot: 2, text: "　　籠罩著這塊大陸，愛斯嘉．．．．" },
  { update: 551, slot: 0, text: "" },
  { update: 571, slot: 1, text: "" },
];
