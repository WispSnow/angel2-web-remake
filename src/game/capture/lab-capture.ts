import { createCaptureMode, type CaptureMode } from "./capture-mode";
import { describeCaptureParameterError } from "./options";
import { captureRequest } from "./preload";

/**
 * 實驗室頁面的錄製模式。實驗室只在開發構建裡，可以直接引用錄製模組；網址參數非法時與調試
 * 場景一樣換成錯誤頁、附「返回場景選擇」連結，並中止實驗室模組的其餘部分。
 */

export function renderCaptureLoadError(root: HTMLElement, title: string, message: string): never {
  const error = document.createElement("main");
  error.className = "debug-load-error";
  const heading = document.createElement("h1");
  heading.textContent = title;
  const detail = document.createElement("p");
  detail.textContent = message;
  const back = document.createElement("a");
  back.href = "/debug.html";
  back.textContent = "返回場景選擇";
  error.append(heading, detail, back);
  root.replaceChildren(error);
  throw new Error(`${title}：${message}`);
}

/** 建立畫面之前呼叫：表現或錄製參數非法時顯示錯誤頁並中止。 */
export function assertCaptureParameters(root: HTMLElement): void {
  const request = captureRequest();
  if (request && !request.ok) {
    renderCaptureLoadError(root, "無效錄製參數", describeCaptureParameterError(request.error));
  }
}

/**
 * `capture=1` 時建立錄製會話並立即凍結程式時鐘：實驗室在凍結中建好畫面、等資源，錄製工具
 * 起跑後才前進。其餘情況回傳 `undefined`。
 */
export function beginLabCapture(entry: string): CaptureMode | undefined {
  const request = captureRequest();
  if (!request?.ok || !request.value.capture) return undefined;
  const mode = createCaptureMode(request.value, entry);
  mode.hold();
  return mode;
}

/** 實驗室的 `autoplay`：`1` 開、`0` 關，沒寫時沿用頁面預設。 */
export function labAutoplayParameter(root: HTMLElement, parameters: URLSearchParams): boolean | undefined {
  const value = parameters.get("autoplay");
  if (value === null) return undefined;
  if (value === "1") return true;
  if (value === "0") return false;
  return renderCaptureLoadError(root, "無效實驗室參數", `autoplay=${value}：只接受 1 或 0。`);
}
