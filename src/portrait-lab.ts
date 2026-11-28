import "./capture-preload";
import "./styles.css";
import "./portrait-lab.css";
import {
  isPortraitRecord,
  PORTRAIT_CATALOG,
  PORTRAIT_RECORDS,
  type PortraitAnimationAssets,
  type PortraitRecord,
} from "./game/content/portrait-catalog.generated";
import {
  animatedPortraitMarkup,
  configureAnimatedPortrait,
  nativeMouthFrameAfterGlyph,
  refreshAnimatedPortraits,
  startPortraitAnimations,
} from "./game/portrait";
import { PORTRAIT_HD_AVAILABLE } from "./game/content/portrait-hd";
import { onPortraitPresentationChange, portraitStyle, setPortraitStyle } from "./game/portrait-style";
import {
  assertCaptureParameters,
  beginLabCapture,
  renderCaptureLoadError,
} from "./game/capture/lab-capture";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app not found");
assertCaptureParameters(root);
const capture = beginLabCapture("portrait-lab");

/**
 * 網址可以設定頁面上的每個選項（錄製用，也方便直接分享某個檢查狀態）：`filter`、`eyes`、
 * `mouth`、`redEye`、`scrollTo`。風格用通用的 `art`（或沿用頁面叫法的 `style`），只對這一頁生效。
 */
interface PortraitLabUrlOptions {
  readonly filter?: "current" | "all";
  readonly blink?: "auto" | "2" | "3";
  readonly mouth?: "auto" | "1" | "2" | "3";
  readonly redEyes?: boolean;
  readonly scrollTo?: PortraitRecord;
}

function portraitLabUrlOptions(page: HTMLElement, parameters: URLSearchParams): PortraitLabUrlOptions {
  const fail = (name: string, value: string, accepted: string): never =>
    renderCaptureLoadError(page, "無效實驗室參數", `${name}=${value}：只接受 ${accepted}。`);
  const pick = <T extends string>(name: string, aliases: Readonly<Record<string, T>>): T | undefined => {
    const value = parameters.get(name);
    if (value === null) return undefined;
    return aliases[value] ?? fail(name, value, Object.keys(aliases).join("、"));
  };
  const scrollTo = parameters.get("scrollTo");
  const record = scrollTo === null ? undefined : Number(scrollTo);
  if (scrollTo !== null && !isPortraitRecord(record)) fail("scrollTo", scrollTo, "0–67 的肖像記錄號");
  const redEye = pick("redEye", { normal: "normal", controlled: "controlled" });
  return {
    filter: pick("filter", { current: "current", all: "all" }),
    blink: pick("eyes", { auto: "auto", half: "2", closed: "3", 2: "2", 3: "3" }),
    mouth: pick("mouth", { talk: "auto", auto: "auto", closed: "1", small: "2", full: "3", 1: "1", 2: "2", 3: "3" }),
    ...(redEye ? { redEyes: redEye === "controlled" } : {}),
    ...(isPortraitRecord(record) ? { scrollTo: record } : {}),
  };
}
const urlOptions = portraitLabUrlOptions(root, new URLSearchParams(location.search));

const CURRENT_STAGE_RECORDS = new Set<PortraitRecord>([0, 15, 42, 43, 44, 45, 46, 47, 48]);
const displayName = (record: PortraitRecord): string =>
  PORTRAIT_CATALOG[record].battleDisplayName?.replaceAll(" ", "") || `未命名記錄 ${record}`;
/** Module 25's prebattle table still names D/51 with the leftover 「史萊姆」. */
const prebattleNameNote = (record: PortraitRecord): string => {
  const prebattle = PORTRAIT_CATALOG[record].displayName?.replaceAll(" ", "");
  return prebattle && prebattle !== displayName(record) ? ` · 關前名牌「${prebattle}」` : "";
};

root.innerHTML = `
  <main class="portrait-lab-shell">
    <header class="portrait-lab-header">
      <div>
        <p class="portrait-lab-kicker">D.SWF · 0–67</p>
        <h1>肖像動畫實驗室</h1>
        <p>一次檢查全戰役肖像的原版眼部、口部覆蓋片與元資料落點。眨眼使用正式時鐘；說話測試按 Big5 雙字節字形在閉嘴／小幅張嘴間切換。</p>
      </div>
      <nav aria-label="返回入口"><a href="/debug.html">戰役調試中心</a><a href="/">普通遊戲</a></nav>
    </header>
    <section class="portrait-lab-controls" aria-label="肖像動畫控制">
      <label>顯示
        <select data-portrait-filter>
          <option value="current">第 0–1 關角色</option>
          <option value="all">全部 68 筆記錄</option>
        </select>
      </label>
      <fieldset data-control-group="blink">
        <legend>眼睛</legend>
        <button type="button" data-blink="auto" aria-pressed="true">自動眨眼</button>
        <button type="button" data-blink="2" aria-pressed="false">半閉</button>
        <button type="button" data-blink="3" aria-pressed="false">閉眼</button>
      </fieldset>
      <fieldset data-control-group="mouth">
        <legend>嘴部</legend>
        <button type="button" data-mouth="auto" aria-pressed="true">逐字說話</button>
        <button type="button" data-mouth="1" aria-pressed="false">閉嘴</button>
        <button type="button" data-mouth="2" aria-pressed="false">小幅張嘴</button>
        <button type="button" data-mouth="3" aria-pressed="false">完整素材</button>
      </fieldset>
      ${PORTRAIT_HD_AVAILABLE ? `<fieldset data-control-group="style">
        <legend>風格（REMAKE-192）</legend>
        <button type="button" data-portrait-style="original" data-testid="portrait-lab-style-original"
          aria-pressed="${portraitStyle() === "original"}">原版</button>
        <button type="button" data-portrait-style="hd" data-testid="portrait-lab-style-hd"
          aria-pressed="${portraitStyle() === "hd"}">高清</button>
      </fieldset>` : ""}
      <fieldset data-control-group="red-eyes">
        <legend>紅眼（frame 7）</legend>
        <button type="button" data-red-eyes="false" data-testid="portrait-lab-red-eyes-off" aria-pressed="true">一般</button>
        <button type="button" data-red-eyes="true" data-testid="portrait-lab-red-eyes-on" aria-pressed="false">被操控</button>
      </fieldset>
    </section>
    <p class="portrait-lab-summary" data-testid="portrait-lab-summary">68 筆主肖像 · 67 筆具完整眨眼與口型 · D/63 原版無覆蓋幀及布局</p>
    <section class="portrait-grid" data-testid="portrait-lab" data-filter="current" data-capture-target
      aria-label="角色肖像目錄">
      ${PORTRAIT_RECORDS.map((record) => {
        const entry = PORTRAIT_CATALOG[record];
        const animation: PortraitAnimationAssets | null = entry.animation;
        return `<article class="portrait-card${CURRENT_STAGE_RECORDS.has(record) ? " is-current" : ""}"
          data-portrait-card data-record="${record}" data-animation-available="${Boolean(animation)}"
          data-testid="portrait-record-${record}">
          ${animatedPortraitMarkup(record, {
            alt: `${displayName(record)}肖像`,
            channel: `portrait-lab-${record}`,
            className: "portrait-lab-composite",
          })}
          <div class="portrait-card-copy">
            <h2>${displayName(record)}</h2>
            <p>D/${String(record).padStart(4, "0")}${prebattleNameNote(record)}</p>
            ${animation
              ? `<small>眼 ${animation.eyeOrigin.x},${animation.eyeOrigin.y} · 口 ${animation.mouthOrigin.x},${animation.mouthOrigin.y}${animation.metadataSourceRecord === record ? "" : ` · 布局沿用 D/${animation.metadataSourceRecord}`}${animation.originCorrection ? ` · ${animation.originCorrection.ruleId} 修正原版眼位 ${animation.originCorrection.nativeOrigin.x},${animation.originCorrection.nativeOrigin.y}` : ""}</small>`
              : "<small class=\"is-static\">原版無動畫元資料／覆蓋幀</small>"}
          </div>
        </article>`;
      }).join("")}
    </section>
  </main>`;

const gallery = root.querySelector<HTMLElement>("[data-testid=portrait-lab]");
const filter = root.querySelector<HTMLSelectElement>("[data-portrait-filter]");
if (!gallery || !filter) throw new Error("portrait lab controls are missing");

const animatedPortraits = () => Array.from(
  root.querySelectorAll<HTMLElement>("[data-portrait-card][data-animation-available=true] .animated-portrait"),
);
const setPressed = (group: string, selected: HTMLButtonElement) => {
  root.querySelectorAll<HTMLButtonElement>(`[data-control-group=${group}] button`).forEach((button) => {
    button.setAttribute("aria-pressed", String(button === selected));
  });
};

filter.addEventListener("change", () => {
  gallery.dataset.filter = filter.value;
});

root.querySelectorAll<HTMLButtonElement>("[data-blink]").forEach((button) => {
  button.addEventListener("click", () => {
    setPressed("blink", button);
    for (const portrait of animatedPortraits()) {
      if (button.dataset.blink === "auto") portrait.removeAttribute("data-force-blink-frame");
      else portrait.dataset.forceBlinkFrame = button.dataset.blink;
    }
  });
});

// 與遊戲共用同一個宿主偏好：在這裡切換，回到遊戲也是同一套。
root.querySelectorAll<HTMLButtonElement>("[data-portrait-style]").forEach((button) => {
  button.addEventListener("click", () => {
    setPressed("style", button);
    setPortraitStyle(button.dataset.portraitStyle === "hd" ? "hd" : "original");
  });
});
const stopPresentationRefresh = onPortraitPresentationChange(() => refreshAnimatedPortraits(root));

// 模組 29 對 `D/0、2、3、41` 在被操控期間以 frame 7 取代每一個眨眼幀；高清風格換成 `REMAKE-195` 的紅眼版。
root.querySelectorAll<HTMLButtonElement>("button[data-red-eyes]").forEach((button) => {
  button.addEventListener("click", () => {
    setPressed("red-eyes", button);
    for (const portrait of animatedPortraits()) {
      const record = Number(portrait.dataset.portraitRecord);
      if (!isPortraitRecord(record)) continue;
      const animation: PortraitAnimationAssets | null = PORTRAIT_CATALOG[record].animation;
      if (!animation?.redEyes) continue;
      const base = portrait.querySelector<HTMLImageElement>(".portrait-base");
      configureAnimatedPortrait(portrait, record, base?.alt ?? "", portrait.dataset.portraitChannel ?? "", undefined,
        button.dataset.redEyes === "true");
    }
  });
});

let automaticSpeech = true;
root.querySelectorAll<HTMLButtonElement>("[data-mouth]").forEach((button) => {
  button.addEventListener("click", () => {
    setPressed("mouth", button);
    automaticSpeech = button.dataset.mouth === "auto";
    for (const portrait of animatedPortraits()) {
      portrait.dataset.speaking = String(automaticSpeech);
      if (automaticSpeech) portrait.removeAttribute("data-force-mouth-frame");
      else {
        portrait.dataset.mouthFrame = button.dataset.mouth ?? "1";
        portrait.dataset.forceMouthFrame = button.dataset.mouth ?? "1";
      }
    }
  });
});

for (const portrait of animatedPortraits()) portrait.dataset.speaking = "true";
const stopBlinking = startPortraitAnimations(root, true);
const speechTimer = window.setInterval(() => {
  if (!automaticSpeech) return;
  for (const portrait of animatedPortraits()) {
    portrait.dataset.mouthFrame = nativeMouthFrameAfterGlyph(portrait.dataset.mouthFrame, "妮");
    portrait.dataset.talkCount = String(Number(portrait.dataset.talkCount ?? "0") + 1);
  }
}, 180);

// 網址選項照「按下對應按鈕」套用，與手動操作走同一段程式。
if (urlOptions.filter) {
  filter.value = urlOptions.filter;
  filter.dispatchEvent(new Event("change"));
}
const press = (selector: string) => root.querySelector<HTMLButtonElement>(selector)?.click();
if (urlOptions.blink) press(`[data-blink="${urlOptions.blink}"]`);
if (urlOptions.mouth) press(`[data-mouth="${urlOptions.mouth}"]`);
if (urlOptions.redEyes !== undefined) press(`button[data-red-eyes="${urlOptions.redEyes}"]`);
if (urlOptions.scrollTo !== undefined) {
  root.querySelector(`[data-testid=portrait-record-${urlOptions.scrollTo}]`)?.scrollIntoView({ block: "start" });
}
if (capture) void capture.becomeReady();

window.addEventListener("pagehide", () => {
  stopBlinking();
  stopPresentationRefresh();
  window.clearInterval(speechTimer);
}, { once: true });
