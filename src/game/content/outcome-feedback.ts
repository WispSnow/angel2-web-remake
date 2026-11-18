/**
 * 妮雅's lines in the native feedback window (portrait 2Eh beside an A/18 text
 * panel): the defeat and victory cards and the two system confirmations. They
 * live here rather than inline in ui.ts so the REMAKE-189 voice script reads the
 * very strings the screen types. Original punctuation and typos are kept
 * (「低辜」「必竟」); the voice script reads them as intended.
 */
export const OUTCOME_FEEDBACK_PORTRAIT = 46;

export const OUTCOME_FEEDBACK_TEXT = {
  defeat: "啊！．．．竟然失敗了？\n我太低辜敵人的實力，再給我一次機會吧！",
  victory: "哦！．．\n這次的戰役結束了，是否要記錄下來．",
  quit: "唉啊！．．．要休息了嗎？\n請再考慮一下吧！",
  retreat: "哦！．．．要撤退嗎？\n必竟是沒辦法的事，雙方的實力差太多了．",
} as const;

export type OutcomeFeedbackId = keyof typeof OUTCOME_FEEDBACK_TEXT;

/** HTML attribute form of a feedback line (newlines survive as `&#10;`). */
export function outcomeFeedbackAttribute(id: OutcomeFeedbackId): string {
  return OUTCOME_FEEDBACK_TEXT[id]
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("\n", "&#10;");
}
