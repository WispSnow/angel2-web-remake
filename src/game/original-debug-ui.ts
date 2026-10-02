import type { GameController } from "./controller";
import { musicBoxSourceLabel, nativeMusicBoxLine } from "./content/music-box";
import { NATIVE_DEBUG_CELL_READOUT } from "./content/debug-mode.generated";
import { setMenuOpen } from "./menu-animation";
import { paintNativeDomText } from "./native-dom-text";

/**
 * `REMAKE-174` 原版除錯模式與音樂盒的戰場 DOM 表面。
 *
 * F3／F4 生命選單照原版原文（含字串裡的半形空格）以原版點陣字繪製；格號讀數照
 * `0000:326A` 的兩個 48×16 黑框與五位數字。音樂盒是複刻自己的清單介面：原版只有一行
 * `MUSIC-  NN-名稱.RIX` 加 `PLAY`，這裡把每首的原版那一行和用途說明列在一起，屬於複刻
 * 自撰文字，使用現代字體。
 */
export const ORIGINAL_DEBUG_UI_MARKUP = `
  <section class="debug-life-menu action-menu native-command-menu" id="debug-life-menu"
    data-testid="debug-life-menu" role="menu" aria-label="原版除錯：全體生命" hidden></section>
  <section class="music-box-panel modal-panel" id="music-box" data-testid="music-box"
    role="dialog" aria-label="音樂盒" hidden>
    <span class="panel-kicker">MUSIC BOX</span><h2>音樂盒</h2>
    <div class="music-box-list" role="listbox" aria-label="曲目" data-testid="music-box-list"></div>
    <p class="music-box-detail" data-testid="music-box-detail"></p>
    <div class="music-box-actions">
      <button type="button" data-debug-action="music-box-play" data-testid="music-box-play">播放</button>
      <button type="button" data-debug-action="music-box-restore" data-testid="music-box-restore">恢復原曲</button>
      <button type="button" data-debug-action="close-music-box" data-testid="close-music-box">返回</button>
    </div>
  </section>
  <div class="debug-cell-readout" data-testid="debug-cell-readout" hidden>
    ${NATIVE_DEBUG_CELL_READOUT.fields.map(({ id, clear }) => `<span class="debug-cell-readout-field"
      data-field="${id}" data-testid="debug-cell-readout-${id}"
      style="left:${clear.x}px;top:${clear.y}px;width:${clear.width}px;height:${clear.height}px"></span>`).join("")}
  </div>`;

/** 原版 `0000:EF56`：五位、前導零換成空白，全為零時保留最後一個 0。 */
const nativeFiveDigits = (value: number): string =>
  String(Math.max(0, Math.trunc(value)) % 100_000).padStart(NATIVE_DEBUG_CELL_READOUT.digits, " ");

const escapeHtml = (text: string): string => text
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("\"", "&quot;");

export function mountOriginalDebugUi(
  root: HTMLElement,
  controller: GameController,
  signal: AbortSignal,
): () => void {
  const lifeMenu = root.querySelector<HTMLElement>("#debug-life-menu");
  const musicBox = root.querySelector<HTMLElement>("#music-box");
  const musicList = musicBox?.querySelector<HTMLElement>(".music-box-list");
  const musicDetail = musicBox?.querySelector<HTMLElement>(".music-box-detail");
  const restoreButton = musicBox?.querySelector<HTMLButtonElement>("[data-debug-action=music-box-restore]");
  const readout = root.querySelector<HTMLElement>(".debug-cell-readout");
  if (!lifeMenu || !musicBox || !musicList || !musicDetail || !restoreButton || !readout) {
    throw new Error("missing original debug UI surface");
  }

  musicList.innerHTML = controller.musicBoxTracks.map((track, index) => {
    const nativeLine = nativeMusicBoxLine(track) ?? musicBoxSourceLabel(track);
    const groupHeading = index === 0
      ? `<span class="music-box-heading" role="presentation">原版名單</span>`
      : track.group === "extra" && controller.musicBoxTracks[index - 1]?.group !== "extra"
        ? `<span class="music-box-heading" role="presentation">原版未收錄</span>`
        : "";
    return `${groupHeading}<button type="button" role="option" class="music-box-track"
      data-music-box-index="${index}" data-testid="music-box-track-${track.id}" data-track-group="${track.group}">
      <span class="music-box-native">${escapeHtml(nativeLine)}</span>
      <span class="music-box-usage">${escapeHtml(track.usage)}</span>
    </button>`;
  }).join("");
  const trackButtons = [...musicList.querySelectorAll<HTMLButtonElement>("[data-music-box-index]")];

  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    const lifeItem = target.closest<HTMLElement>("[data-debug-life-index]");
    if (lifeItem) {
      controller.selectDebugLifeMenuItem(Number(lifeItem.dataset.debugLifeIndex));
      controller.activateDebugLifeMenuSelection();
      return;
    }
    const track = target.closest<HTMLElement>("[data-music-box-index]");
    if (track) {
      controller.selectMusicBoxTrack(Number(track.dataset.musicBoxIndex));
      return;
    }
    const action = target.closest<HTMLElement>("[data-debug-action]")?.dataset.debugAction;
    if (action === "open-music-box") controller.openMusicBox("musicSettings");
    else if (action === "close-music-box") controller.closeMusicBox();
    else if (action === "music-box-play") controller.playMusicBoxSelection();
    else if (action === "music-box-restore") controller.restoreGameMusic();
  }, { signal });
  root.addEventListener("dblclick", (event) => {
    const track = (event.target as Element).closest<HTMLElement>("[data-music-box-index]");
    if (!track) return;
    controller.selectMusicBoxTrack(Number(track.dataset.musicBoxIndex));
    controller.playMusicBoxSelection();
  }, { signal });
  root.addEventListener("pointermove", (event) => {
    const lifeItem = (event.target as Element).closest<HTMLElement>("[data-debug-life-index]");
    if (lifeItem) controller.selectDebugLifeMenuItem(Number(lifeItem.dataset.debugLifeIndex));
  }, { signal });

  let previousMusicIndex = -1;
  return () => {
    const menu = controller.debugLifeMenu;
    if (setMenuOpen(lifeMenu, menu !== undefined) && menu) {
      lifeMenu.dataset.side = String(menu.side);
      lifeMenu.innerHTML = controller.debugLifeMenuItems.map((item, index) => {
        const selected = index === menu.index;
        return `<button type="button" role="menuitem" data-debug-life-index="${index}"
          data-testid="debug-life-${item.effect}" class="${selected ? "is-selected" : ""}"
          aria-current="${selected}"><span class="native-command-label">${escapeHtml(item.label)}</span></button>`;
      }).join("");
      for (const label of lifeMenu.querySelectorAll<HTMLElement>(".native-command-label")) {
        const text = label.textContent ?? "";
        // 原版字串自帶半形空格（`敵  1   `），照原樣畫，讀屏只讀去掉空格的文字。
        paintNativeDomText(label, text, {}, text.replace(/\s+/gu, " ").trim());
      }
    }

    musicBox.hidden = !controller.musicBoxOpen;
    if (controller.musicBoxOpen) {
      const playingId = controller.musicBoxPlayback?.trackId;
      trackButtons.forEach((button, index) => {
        const selected = index === controller.musicBoxIndex;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-selected", String(selected));
        button.dataset.playing = String(controller.musicBoxTracks[index]?.id === playingId);
      });
      if (previousMusicIndex !== controller.musicBoxIndex) {
        trackButtons[controller.musicBoxIndex]?.scrollIntoView({ block: "nearest" });
        previousMusicIndex = controller.musicBoxIndex;
      }
      const selectedTrack = controller.musicBoxTracks[controller.musicBoxIndex];
      const playingTrack = controller.musicBoxTracks.find(({ id }) => id === playingId);
      musicDetail.textContent = playingTrack
        ? `試聽中：${playingTrack.legacyName ?? musicBoxSourceLabel(playingTrack)}（${musicBoxSourceLabel(playingTrack)}）。關閉後繼續播放，直到遊戲下一次換曲。`
        : selectedTrack
          ? `${musicBoxSourceLabel(selectedTrack)}・${selectedTrack.kind === "loop" ? "單曲循環" : "入場段接循環段"}`
          : "";
      restoreButton.disabled = playingId === undefined;
    } else {
      previousMusicIndex = -1;
    }

    const cellReadout = controller.visibleDebugCellReadout;
    readout.hidden = cellReadout === undefined;
    if (cellReadout) {
      for (const field of readout.querySelectorAll<HTMLElement>("[data-field]")) {
        const value = field.dataset.field === "difficulty" ? cellReadout.difficulty : cellReadout.cell;
        paintNativeDomText(field, nativeFiveDigits(value), { mode: "normal" }, String(value));
      }
    }
  };
}
