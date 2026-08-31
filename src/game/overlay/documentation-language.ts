import OpenCC from "opencc-js/t2cn";

/**
 * 「復刻說明」「圖鑑」「RoadMap」共用的宿主文件語言。
 *
 * 繁體內容仍是唯一策展真值；簡體在 DOM 邊界由 OpenCC 的臺灣繁體詞組表轉換，避免
 * 規則說明、角色簡介與之後新增的條目各自維護一份容易漂移的副本。這個偏好只影響
 * 三個參考視窗，不進入戰局、存檔或原版點陣字表面。
 */
export type DocumentationLanguage = "zh-Hant" | "zh-Hans";

export const DOCUMENTATION_LANGUAGE_KEY = "angel2.preferences.documentation-language.v1";
export const DEFAULT_DOCUMENTATION_LANGUAGE: DocumentationLanguage = "zh-Hant";

const toSimplifiedChinese = OpenCC.Converter({ from: "twp", to: "cn" });
const listeners = new Set<(language: DocumentationLanguage) => void>();

function isDocumentationLanguage(value: unknown): value is DocumentationLanguage {
  return value === "zh-Hant" || value === "zh-Hans";
}

function loadLanguage(): DocumentationLanguage {
  try {
    const stored = window.localStorage.getItem(DOCUMENTATION_LANGUAGE_KEY);
    return isDocumentationLanguage(stored) ? stored : DEFAULT_DOCUMENTATION_LANGUAGE;
  } catch {
    return DEFAULT_DOCUMENTATION_LANGUAGE;
  }
}

let currentLanguage: DocumentationLanguage | undefined;

export function documentationLanguage(): DocumentationLanguage {
  currentLanguage ??= loadLanguage();
  return currentLanguage;
}

export function setDocumentationLanguage(language: DocumentationLanguage): void {
  if (language === documentationLanguage()) return;
  currentLanguage = language;
  try {
    window.localStorage.setItem(DOCUMENTATION_LANGUAGE_KEY, language);
  } catch {
    // 隱私模式或被禁用的儲存不該讓語言按鈕失效；本次頁面工作階段仍然保留選擇。
  }
  for (const listener of listeners) listener(language);
}

export function subscribeDocumentationLanguage(
  listener: (language: DocumentationLanguage) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const LOCALIZED_ATTRIBUTES = ["aria-label", "alt", "placeholder", "title"] as const;

/**
 * 傳入的節點必須剛由繁體真值重繪；切回繁體時由面板先重繪，再走這個函式設定語意語系。
 */
export function localizeDocumentationElement(
  root: HTMLElement,
  language: DocumentationLanguage,
): void {
  root.lang = language;
  if (language === "zh-Hant") return;

  const convert = (value: string): string => toSimplifiedChinese(value);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    const parent = textNode.parentElement;
    if (!parent?.closest("[data-documentation-language]")) {
      textNode.nodeValue = convert(textNode.nodeValue ?? "");
    }
    textNode = walker.nextNode();
  }

  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    if (element.closest("[data-documentation-language]")) continue;
    for (const attribute of LOCALIZED_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value !== null) element.setAttribute(attribute, convert(value));
    }
  }
}
