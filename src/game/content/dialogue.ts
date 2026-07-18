import type { DialoguePage } from "../types";

export const PREBATTLE_STORY: DialoguePage[] = [
  { slot: "lower", text: "在瓦爾克麗城內的寬廣走廊上，一位肩披深色藍袍的人，正朝著大殿快步走來。" },
  { slot: "lower", text: "而另一邊，通往大殿的厚重鐵門被推開了，一位渾身是傷的士兵跌跌撞撞的向妮雅跑去．．．" },
  { slot: "upper", portrait: 46, speaker: "妮雅", text: "「發生了什麼事？裡面為何吵吵鬧鬧的．．．」" },
  { slot: "upper", portrait: 46, speaker: "妮雅", text: "「．．啊！妳怎麼會傷成這樣．．．？」" },
  { slot: "lower", portrait: 47, speaker: "士兵", text: "「不好了．．！妮雅．．殿下！\n騎．．騎士團的軍隊，．．衝進大殿來了．．！」" },
  { slot: "upper", portrait: 46, speaker: "妮雅", text: "「騎士團．．．！他們怎麼會．．？」" },
  { slot: "upper", portrait: 46, speaker: "妮雅", text: "「那女帝呢？女帝在哪兒？」" },
  { slot: "lower", portrait: 47, speaker: "士兵", text: "「．．被．．被她們給．．擄走了！」" },
  { slot: "upper", portrait: 46, speaker: "妮雅", text: "「什．．什麼．．！？」" },
];

export const OPENING_STORY: DialoguePage[] = [
  { slot: "lower", text: "大殿內，瓦爾克麗的衛士和騎士團堡的騎兵正在激戰當中．．．" },
  { slot: "lower", portrait: 45, speaker: "希蜜", text: "「妮雅殿下！」" },
  { slot: "upper", portrait: 46, speaker: "妮雅", text: "「希蜜！？\n．．．怎麼樣了？」" },
  { slot: "lower", portrait: 45, speaker: "希蜜", text: "「女帝被她們帶走了！\n．．現在還來的及，您快趕去，這裡交給我了！」" },
  { slot: "upper", portrait: 46, speaker: "妮雅", text: "「好！這裡就麻煩妳了！」" },
];

export const ROUND2_STORY: DialoguePage[] = [
  { slot: "upper", portrait: 46, speaker: "妮雅", text: "「妳們不是騎士團的人嗎．．？\n．．．為何要綁架女帝呢？」" },
  { slot: "lower", portrait: 48, speaker: "騎士團士兵", text: "「抱歉！妮雅殿下，我也是不得已的．．」" },
  { slot: "upper", portrait: 46, speaker: "妮雅", text: "「住口！快放了女帝！」" },
  { slot: "lower", portrait: 48, speaker: "騎士團士兵", text: "「對不起，妮雅殿下．．．\n我奉命阻擋妳，既使丟掉性命也在所不惜！」" },
  { slot: "upper", portrait: 46, speaker: "妮雅", text: "「妳．．．．！」" },
];

export const VICTORY_STORY: DialoguePage[] = [
  { slot: "lower", portrait: 48, speaker: "騎士團士兵", text: "「行了！任務已經完成，我們快離開這裡！」" },
  { slot: "upper", portrait: 46, speaker: "妮雅", text: "「別想逃！」" },
  { slot: "upper", portrait: 46, speaker: "妮雅", text: "「．．糟糕！\n來不及了．．．！」" },
  { slot: "lower", portrait: 45, speaker: "希蜜", text: "「對不起，妮雅殿下！\n都是我不好，沒能好好保護女帝．．．」" },
  { slot: "upper", portrait: 46, speaker: "妮雅", text: "「算了．．！事情都已經發生了．．！\n現在最重要的就是救回女帝！」" },
  { slot: "upper", portrait: 46, speaker: "妮雅", text: "「快！希蜜，妳趕緊集合所有的高級將領，準備召開緊急會議！」" },
  { slot: "lower", portrait: 45, speaker: "希蜜", text: "「是的！殿下。」" },
];

export const STORY_BY_PHASE = {
  prebattleStory: PREBATTLE_STORY,
  openingStory: OPENING_STORY,
  round2Story: ROUND2_STORY,
  victoryStory: VICTORY_STORY,
} as const;
