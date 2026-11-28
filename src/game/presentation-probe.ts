/**
 * 表現層的觀察點：開發構建的錄製模式（`capture=1`）靠它知道「語音開口了」「曲子開始了」
 * 「這段解碼還沒完成」。沒有訂閱者時什麼都不做；發布構建裡每個函式開頭的模式檢查折疊成
 * 直接返回，呼叫點只剩空函式。這裡只轉述已經發生的表現，不得反過來影響結算順序或時序。
 *
 * 模式檢查寫在函式裡而不是模組頂層：Playwright 在 Node 裡收集用例時也會載入這個模組，
 * 那裡沒有 `import.meta.env`。
 */

export interface PresentationProbeEvent {
  readonly type: string;
  readonly [detail: string]: unknown;
}

type ProbeListener = (event: PresentationProbeEvent) => void;

const listeners = new Set<ProbeListener>();
const pendingWork = new Set<Promise<unknown>>();
let trackingWork = false;

/** 回報一個表現事件（語音、曲目、插圖、標題……）。 */
export function probePresentation(type: string, detail: Readonly<Record<string, unknown>> = {}): void {
  if (import.meta.env.MODE === "release" || listeners.size === 0) return;
  const event: PresentationProbeEvent = { ...detail, type };
  for (const listener of listeners) listener(event);
}

export function onPresentationProbe(listener: ProbeListener): () => void {
  if (import.meta.env.MODE === "release") return () => undefined;
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 登記一段「畫面開始前必須完成」的背景工作（音樂解碼、Phaser 第一幀）。只在錄製的準備門
 * 打開追蹤時記錄；失敗與成功同樣算完成。
 */
export function trackPresentationWork(work: Promise<unknown>): void {
  if (import.meta.env.MODE === "release" || !trackingWork) return;
  pendingWork.add(work);
  const settle = () => pendingWork.delete(work);
  work.then(settle, settle);
}

export function setPresentationWorkTracking(enabled: boolean): void {
  if (import.meta.env.MODE === "release") return;
  trackingWork = enabled;
  if (!enabled) pendingWork.clear();
}

export const pendingPresentationWork = (): readonly Promise<unknown>[] => [...pendingWork];
