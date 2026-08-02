import type { DialoguePage, DialogueWindowState } from "../types";
import type { StageDefinition, StageStoryId } from "./stages";

const windowState = (
  text: string,
  portrait?: DialogueWindowState["portrait"],
  speaker?: string,
): DialogueWindowState => ({ text, portrait, speaker });

const checkpoint = (
  record: DialoguePage["source"]["record"],
  wait: number,
  activeSlot: DialoguePage["activeSlot"],
  upper?: DialogueWindowState,
  lower?: DialogueWindowState,
  revealStart?: number,
): DialoguePage => ({ activeSlot, upper, lower, revealStart, source: { record, wait } });

const nia = (text: string) => windowState(text, 46, "妮雅");
const ximi = (text: string) => windowState(text, 45, "希蜜");
const palaceSoldier = (text: string) => windowState(text, 47, "士兵");
const knight = (text: string) => windowState(text, 48, "騎士團士兵");

const PREBATTLE_SOLDIER_FIRST = "「不好了．．！妮雅．．殿下！\n";
const PREBATTLE_SOLDIER_FULL = `${PREBATTLE_SOLDIER_FIRST}  騎．．騎士團的軍隊，．．衝進大殿來了．．！」`;

/** Module 25 SAY0: one entry per native KY command. */
export const PREBATTLE_STORY: DialoguePage[] = [
  checkpoint(0, 1, "lower", undefined, windowState("  在瓦爾克麗城內的寬廣走廊上，一位肩披深色藍袍\n的人，正朝著大殿快步走來。")),
  checkpoint(0, 2, "lower", undefined, windowState("  而另一邊，通往大殿的厚重鐵門被推開了，一位渾\n身是傷的士兵跌跌撞撞的向妮雅跑去．．．")),
  checkpoint(0, 3, "upper", nia("「發生了什麼事？裡面為何吵吵鬧鬧的．．．」")),
  checkpoint(0, 4, "upper", nia("「．．啊！妳怎麼會傷成這樣．．．？」")),
  checkpoint(0, 5, "lower", nia("「．．啊！妳怎麼會傷成這樣．．．？」"), palaceSoldier(PREBATTLE_SOLDIER_FIRST)),
  checkpoint(
    0,
    6,
    "lower",
    nia("「．．啊！妳怎麼會傷成這樣．．．？」"),
    palaceSoldier(PREBATTLE_SOLDIER_FULL),
    PREBATTLE_SOLDIER_FIRST.length,
  ),
  checkpoint(0, 7, "upper", nia("「騎士團．．．！他們怎麼會．．？」"), palaceSoldier(PREBATTLE_SOLDIER_FULL)),
  checkpoint(0, 8, "upper", nia("「那女帝呢？女帝在哪兒？」"), palaceSoldier(PREBATTLE_SOLDIER_FULL)),
  checkpoint(0, 9, "lower", nia("「那女帝呢？女帝在哪兒？」"), palaceSoldier("「．．被．．被她們給．．擄走了！」")),
  checkpoint(0, 10, "upper", nia("「什．．什麼．．！？」"), palaceSoldier("「．．被．．被她們給．．擄走了！」")),
];

/** Module 29 SAY1: CW is intentionally a no-op, so both windows persist. */
export const OPENING_STORY: DialoguePage[] = [
  checkpoint(1, 1, "lower", undefined, windowState("  大殿內，瓦爾克麗的衛士和騎士團堡的騎兵正在激\n戰當中．．．")),
  checkpoint(1, 2, "lower", undefined, ximi("「妮雅殿下！」")),
  checkpoint(1, 3, "upper", nia("「希蜜！？\n    ．．．怎麼樣了？」"), ximi("「妮雅殿下！」")),
  checkpoint(1, 4, "lower", nia("「希蜜！？\n    ．．．怎麼樣了？」"), ximi("「女帝被她們帶走了！\n  ．．現在還來的及，您快趕去，這裡交給我了！」")),
  checkpoint(1, 5, "upper", nia("「好！這裡就麻煩妳了！」"), ximi("「女帝被她們帶走了！\n  ．．現在還來的及，您快趕去，這裡交給我了！」")),
];

/** Module 29 SAY2. */
export const ROUND2_STORY: DialoguePage[] = [
  checkpoint(2, 1, "upper", nia("「妳們不是騎士團的人嗎．．？\n    ．．．為何要綁架女帝呢？」")),
  checkpoint(2, 2, "lower", nia("「妳們不是騎士團的人嗎．．？\n    ．．．為何要綁架女帝呢？」"), knight("「抱歉！妮雅殿下，我也是不得已的．．」")),
  checkpoint(2, 3, "upper", nia("「住口！快放了女帝！」"), knight("「抱歉！妮雅殿下，我也是不得已的．．」")),
  checkpoint(2, 4, "lower", nia("「住口！快放了女帝！」"), knight("「對不起，妮雅殿下．．．\n    我奉命阻擋妳，既使丟掉性命也在所不惜！」")),
  checkpoint(2, 5, "upper", nia("「妳．．．．！」"), knight("「對不起，妮雅殿下．．．\n    我奉命阻擋妳，既使丟掉性命也在所不惜！」")),
];

/** Module 29 SAY3, including the otherwise invisible third KY pause. */
export const VICTORY_STORY: DialoguePage[] = [
  checkpoint(3, 1, "lower", undefined, knight("「行了！任務已經完成，我們快離開這裡！」")),
  checkpoint(3, 2, "upper", nia("「別想逃！」"), knight("「行了！任務已經完成，我們快離開這裡！」")),
  checkpoint(3, 3, undefined),
  checkpoint(3, 4, "upper", nia("「．．糟糕！\n    來不及了．．．！」")),
  checkpoint(3, 5, "lower", nia("「．．糟糕！\n    來不及了．．．！」"), ximi("「對不起，妮雅殿下！\n    都是我不好，沒能好好保護女帝．．．」")),
  checkpoint(3, 6, "upper", nia("「算了．．！事情都已經發生了．．！\n      現在最重要的就是救回女帝！」"), ximi("「對不起，妮雅殿下！\n    都是我不好，沒能好好保護女帝．．．」")),
  checkpoint(3, 7, "upper", nia("「快！希蜜，妳趕緊集合所有的高級將領，準備召開\n緊急會議！」"), ximi("「對不起，妮雅殿下！\n    都是我不好，沒能好好保護女帝．．．」")),
  checkpoint(3, 8, "lower", nia("「快！希蜜，妳趕緊集合所有的高級將領，準備召開\n緊急會議！」"), ximi("「是的！殿下。」")),
];

export const STORY_BY_PHASE = {
  prebattleStory: PREBATTLE_STORY,
  openingStory: OPENING_STORY,
  round2Story: ROUND2_STORY,
  victoryStory: VICTORY_STORY,
} as const;

export type StageStoryPhase = keyof typeof STORY_BY_PHASE;

export const STORY_PAGES_BY_ID = {
  "stage-00-prebattle-story": PREBATTLE_STORY,
  "stage-00-opening-story": OPENING_STORY,
  "stage-00-round-2-story": ROUND2_STORY,
  "stage-00-victory-story": VICTORY_STORY,
} as const satisfies Partial<Record<StageStoryId, readonly DialoguePage[]>>;

const STORY_PAGE_REGISTRY: Partial<Record<StageStoryId, readonly DialoguePage[]>> =
  STORY_PAGES_BY_ID;

export function storyPagesForStagePhase(
  stage: StageDefinition,
  phase: StageStoryPhase,
): readonly DialoguePage[] {
  const storyId = phase === "prebattleStory"
    ? stage.stories.prebattle
    : phase === "openingStory"
      ? stage.stories.opening
      : phase === "round2Story"
        ? stage.stories.roundStarts.find(({ round }) => round === 2)?.storyId
        : stage.stories.victory;
  if (!storyId) return [];
  return STORY_PAGE_REGISTRY[storyId] ?? [];
}
