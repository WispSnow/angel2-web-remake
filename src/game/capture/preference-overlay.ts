import {
  DEFAULT_SOUND_PREFERENCES,
  DISPLAY_PREFERENCES_KEY,
  loadDisplayPreferences,
  loadMusicPreferences,
  loadSoundPreferences,
  loadVoicePreferences,
  MUSIC_PREFERENCES_KEY,
  SOUND_PREFERENCES_KEY,
  VOICE_PREFERENCES_KEY,
  withVoiceVolume,
} from "../preferences";
import type { PresentationOverrides } from "./options";

/** 所有設備偏好共用的鍵前綴（含參考面板的文件語言）。 */
const PREFERENCE_KEY_PREFIX = "angel2.preferences.";

/**
 * 網址表現設定的落點：一個包住 `localStorage` 的 `Storage`。
 *
 * 遊戲各處都直接以 `localStorage` 讀寫設備偏好，與其每個讀取點各自加覆寫，不如在最前面換掉
 * 這一頁看到的儲存：被覆寫的偏好鍵從記憶體讀（網址值疊在原本的偏好上），這一頁對它們的寫入
 * 也只留在記憶體，關掉頁面就消失——錄製時在遊戲內切換「美術風格」照樣有效，卻不會改掉玩家
 * 自己的設定。其餘鍵（存檔、備份）原封不動交給底層。
 *
 * `sandboxAll`（`capture=1`）把全部偏好鍵都隔離，錄製工具在畫面上做的任何選擇都不寫回。
 */
export class PreferenceOverlayStorage implements Storage {
  private readonly memory = new Map<string, string | null>();

  constructor(
    private readonly base: Storage,
    overrides: PresentationOverrides,
    private readonly sandboxAll: boolean,
  ) {
    for (const [key, value] of overriddenEntries(base, overrides)) this.memory.set(key, value);
  }

  get length(): number {
    return this.base.length;
  }

  key(index: number): string | null {
    return this.base.key(index);
  }

  getItem(key: string): string | null {
    if (this.memory.has(key)) return this.memory.get(key) ?? null;
    return this.base.getItem(key);
  }

  setItem(key: string, value: string): void {
    if (this.isSandboxed(key)) this.memory.set(key, String(value));
    else this.base.setItem(key, value);
  }

  removeItem(key: string): void {
    if (this.isSandboxed(key)) this.memory.set(key, null);
    else this.base.removeItem(key);
  }

  clear(): void {
    this.base.clear();
  }

  private isSandboxed(key: string): boolean {
    return this.memory.has(key) || (this.sandboxAll && key.startsWith(PREFERENCE_KEY_PREFIX));
  }
}

/** 每個被覆寫的偏好鍵：底層原值疊上網址值後的完整記錄。 */
function overriddenEntries(base: Storage, overrides: PresentationOverrides): [string, string][] {
  const entries: [string, string][] = [];
  if (overrides.portraitStyle !== undefined || overrides.imageScaling !== undefined) {
    entries.push([DISPLAY_PREFERENCES_KEY, JSON.stringify({
      ...loadDisplayPreferences(base),
      ...(overrides.portraitStyle !== undefined ? { portraitStyle: overrides.portraitStyle } : {}),
      ...(overrides.imageScaling !== undefined ? { imageScaling: overrides.imageScaling } : {}),
    })]);
  }
  if (overrides.voiceVolume !== undefined || overrides.autoAdvance !== undefined) {
    const current = loadVoicePreferences(base);
    // 與遊戲內相同：語音從「關」打開時改回自動翻頁；網址另外指定 `autoPage` 時以它為準。
    const voice = overrides.voiceVolume !== undefined ? withVoiceVolume(current, overrides.voiceVolume) : current;
    entries.push([VOICE_PREFERENCES_KEY, JSON.stringify({
      ...voice,
      ...(overrides.autoAdvance !== undefined ? { autoAdvance: overrides.autoAdvance } : {}),
    })]);
  }
  if (overrides.musicStyle !== undefined) {
    entries.push([MUSIC_PREFERENCES_KEY, JSON.stringify({
      ...loadMusicPreferences(base),
      musicStyle: overrides.musicStyle,
    })]);
  }
  if (overrides.soundEnabled !== undefined) {
    const current = loadSoundPreferences(base);
    const soundEffectVolume = overrides.soundEnabled
      ? current.soundEffectVolume > 0 ? current.soundEffectVolume : DEFAULT_SOUND_PREFERENCES.soundEffectVolume
      : 0;
    entries.push([SOUND_PREFERENCES_KEY, JSON.stringify({ ...current, soundEffectVolume })]);
  }
  return entries;
}

/**
 * 把這一頁的 `localStorage` 換成覆寫層。必須在任何模組第一次讀偏好之前呼叫（見
 * `src/capture-preload.ts`）；`portrait-style.ts` 與 `display-settings.ts` 會快取第一次讀到的值。
 */
export function installPreferenceOverlay(storage: Storage, target: Window = window): void {
  Object.defineProperty(target, "localStorage", {
    configurable: true,
    enumerable: true,
    get: () => storage,
  });
}
