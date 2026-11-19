/**
 * 調試場景不經過開場方框，沒有那一次「進入遊戲」的手勢，所以掛上控制器時一律當作音訊
 * 未解鎖：語音層拒絕播放，直到玩家在畫面上點一下。可是從 `/debug.html` 點連結進來時，
 * 瀏覽器會把那次點擊算給同源的新頁面（Chrome 的同源導航沿用使用者啟用），AudioContext
 * 一建立就是 `running`。這裡建一個探測用的 context 問瀏覽器：允許就照已解鎖掛上，第一頁
 * 就有語音；直接貼網址開新分頁時不允許，照舊等第一次點擊。
 *
 * 只在調試入口用；正式流程的開場方框本身就是手勢。
 */
export async function debugEntryAudioAllowed(): Promise<boolean> {
  const Context = globalThis.AudioContext;
  if (typeof Context !== "function") return false;
  let probe: AudioContext;
  try {
    probe = new Context();
  } catch {
    return false;
  }
  try {
    if (probe.state !== "running") {
      // 有的瀏覽器先建成 suspended 再自己轉 running；Chrome 不允許時 resume() 會一直等，
      // 所以只等一小段。
      await Promise.race([
        probe.resume().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 150)),
      ]);
    }
    return probe.state === "running";
  } finally {
    void probe.close().catch(() => undefined);
  }
}
