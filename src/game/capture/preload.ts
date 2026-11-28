import {
  hasPresentationOverrides,
  parseCaptureRequest,
  type CaptureParseResult,
} from "./options";
import { installPreferenceOverlay, PreferenceOverlayStorage } from "./preference-overlay";

let request: CaptureParseResult | undefined;

/**
 * 解析網址的錄製與表現參數，必要時立刻換上偏好覆寫層。由 `src/capture-preload.ts` 在每個
 * 入口的第一個 import 呼叫，早於任何讀偏好的模組；解析錯誤留給入口顯示。
 */
export function installCapturePreferences(search: string): CaptureParseResult {
  request = parseCaptureRequest(search);
  if (!request.ok) return request;
  const { capture, presentation } = request.value;
  if (capture || hasPresentationOverrides(presentation)) {
    let base: Storage | undefined;
    try {
      base = window.localStorage;
    } catch {
      base = undefined;
    }
    if (base) installPreferenceOverlay(new PreferenceOverlayStorage(base, presentation, capture));
  }
  if (capture) document.documentElement.dataset.capture = "true";
  return request;
}

/** 這一頁的解析結果；`capture-preload` 沒跑過（發布構建）時為 `undefined`。 */
export const captureRequest = (): CaptureParseResult | undefined => request;
