import { PORTRAIT_HD_AVAILABLE } from "./content/portrait-hd";
import {
  DISPLAY_PREFERENCES_KEY,
  isMusicStyle,
  isPortraitStyle,
  isVoiceVolume,
  loadDisplayPreferences,
  loadMusicPreferences,
  loadVoicePreferences,
  MUSIC_PREFERENCES_KEY,
  saveDisplayPreferences,
  saveMusicPreferences,
  saveVoicePreferences,
  VOICE_PREFERENCES_KEY,
  VOICE_VOLUME_LABELS,
  withVoiceVolume,
  type PreferenceStorage,
} from "./preferences";

/**
 * 調試中心的「表現設定」：直接改寫遊戲開場時讀的同一份設備偏好（美術風格、劇情語音、自動翻頁、
 * 音樂風格），不必先進場景再開選單。調試場景與普通 `/` 讀的是同一組鍵，所以兩邊都會生效；這些
 * 只是宿主表現偏好，不進模擬狀態、PRNG、規則身份或存檔，與「調試會話不改寫正式記錄」不衝突。
 */

const WATCHED_KEYS = new Set([DISPLAY_PREFERENCES_KEY, VOICE_PREFERENCES_KEY, MUSIC_PREFERENCES_KEY]);

export function debugPresentationSettingsMarkup(): string {
  const portrait = PORTRAIT_HD_AVAILABLE
    ? `<div class="debug-preference">
        <label for="debug-portrait-style">美術風格</label>
        <select id="debug-portrait-style" data-testid="debug-portrait-style" data-debug-preference="portrait-style">
          <option value="original">原版</option>
          <option value="hd">高清</option>
        </select>
      </div>`
    : "";
  return `
    <section class="debug-options debug-presentation-settings" data-testid="debug-presentation-settings"
      aria-labelledby="debug-presentation-title">
      <h2 class="debug-options-title" id="debug-presentation-title">表現設定</h2>
      ${portrait}
      <div class="debug-preference">
        <label for="debug-voice-volume">劇情語音</label>
        <select id="debug-voice-volume" data-testid="debug-voice-volume" data-debug-preference="voice-volume">
          ${Object.entries(VOICE_VOLUME_LABELS).map(([level, label]) =>
            `<option value="${level}">${label}</option>`).join("")}
        </select>
      </div>
      <div class="debug-preference">
        <label for="debug-voice-auto-advance">自動翻頁</label>
        <select id="debug-voice-auto-advance" data-testid="debug-voice-auto-advance"
          data-debug-preference="voice-auto-advance">
          <option value="true">開</option>
          <option value="false">關</option>
        </select>
      </div>
      <div class="debug-preference">
        <label for="debug-music-style">音樂風格</label>
        <select id="debug-music-style" data-testid="debug-music-style" data-debug-preference="music-style">
          <option value="original">原版</option>
          <option value="orchestral">交響</option>
        </select>
      </div>
      <span>與普通遊戲共用同一份設備偏好，選了立即儲存，進入場景時生效；遊戲內改過的值回到這頁也會顯示。</span>
      <output data-testid="debug-presentation-status" data-debug-presentation-status aria-live="polite"></output>
    </section>`;
}

/** 把下拉選單綁到偏好上；回傳的函式解除全部監聽。 */
export function bindDebugPresentationSettings(section: HTMLElement, storage: PreferenceStorage): () => void {
  const select = (name: string) =>
    section.querySelector<HTMLSelectElement>(`[data-debug-preference="${name}"]`) ?? undefined;
  const portrait = select("portrait-style");
  const voiceVolume = select("voice-volume");
  const autoAdvance = select("voice-auto-advance");
  const musicStyle = select("music-style");
  const status = section.querySelector<HTMLOutputElement>("[data-debug-presentation-status]");
  if (!voiceVolume || !autoAdvance || !musicStyle || !status) {
    throw new Error("debug presentation settings not found");
  }

  const render = () => {
    if (portrait) portrait.value = loadDisplayPreferences(storage).portraitStyle;
    const voice = loadVoicePreferences(storage);
    voiceVolume.value = String(voice.voiceVolume);
    autoAdvance.value = String(voice.autoAdvance);
    // 與遊戲內相同：語音為「關」時自動翻頁沒有作用，置灰但保留偏好。
    autoAdvance.disabled = voice.voiceVolume === 0;
    musicStyle.value = loadMusicPreferences(storage).musicStyle;
  };

  const report = (control: HTMLSelectElement) => {
    const label = section.querySelector(`label[for="${control.id}"]`)?.textContent ?? "";
    const value = control.selectedOptions[0]?.textContent ?? control.value;
    status.textContent = `已儲存：${label} ${value}`;
  };

  const events = new AbortController();
  const { signal } = events;
  portrait?.addEventListener("change", () => {
    if (!isPortraitStyle(portrait.value)) return;
    saveDisplayPreferences(storage, { ...loadDisplayPreferences(storage), portraitStyle: portrait.value });
    render();
    report(portrait);
  }, { signal });
  voiceVolume.addEventListener("change", () => {
    const level = Number(voiceVolume.value);
    if (!isVoiceVolume(level)) return;
    saveVoicePreferences(storage, withVoiceVolume(loadVoicePreferences(storage), level));
    render();
    report(voiceVolume);
  }, { signal });
  autoAdvance.addEventListener("change", () => {
    saveVoicePreferences(storage, { ...loadVoicePreferences(storage), autoAdvance: autoAdvance.value === "true" });
    render();
    report(autoAdvance);
  }, { signal });
  musicStyle.addEventListener("change", () => {
    if (!isMusicStyle(musicStyle.value)) return;
    saveMusicPreferences(storage, { ...loadMusicPreferences(storage), musicStyle: musicStyle.value });
    render();
    report(musicStyle);
  }, { signal });
  // 另一個分頁的遊戲改了設定，或從場景按「上一頁」回到快取裡的這一頁：重讀一次。
  window.addEventListener("storage", (event) => {
    if (event.key === null || WATCHED_KEYS.has(event.key)) render();
  }, { signal });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) render();
  }, { signal });

  render();
  return () => events.abort();
}
