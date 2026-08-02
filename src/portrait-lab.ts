import "./styles.css";
import "./portrait-lab.css";
import {
  PORTRAIT_CATALOG,
  PORTRAIT_RECORDS,
  type PortraitAnimationAssets,
  type PortraitRecord,
} from "./game/content/portrait-catalog.generated";
import {
  animatedPortraitMarkup,
  nativeMouthFrameAfterGlyph,
  startPortraitAnimations,
} from "./game/portrait";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app not found");

const CURRENT_STAGE_RECORDS = new Set<PortraitRecord>([0, 15, 42, 43, 44, 45, 46, 47, 48]);
const displayName = (record: PortraitRecord): string =>
  PORTRAIT_CATALOG[record].displayName?.replaceAll(" ", "") || `未命名記錄 ${record}`;

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
    </section>
    <p class="portrait-lab-summary" data-testid="portrait-lab-summary">68 筆主肖像 · 67 筆具完整眨眼與口型 · D/63 原版無覆蓋幀及布局</p>
    <section class="portrait-grid" data-testid="portrait-lab" data-filter="current" aria-label="角色肖像目錄">
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
            <p>D/${String(record).padStart(4, "0")}</p>
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

window.addEventListener("pagehide", () => {
  stopBlinking();
  window.clearInterval(speechTimer);
}, { once: true });
