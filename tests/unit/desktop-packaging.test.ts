import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readText = (relativePath: string): string =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

const readJson = (relativePath: string): Record<string, unknown> =>
  JSON.parse(readText(relativePath)) as Record<string, unknown>;

const readBytes = (relativePath: string): Buffer =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url));

describe("desktop packaging contract", () => {
  it("wraps only the audited player release in a stable Tauri identity", () => {
    const config = readJson("src-tauri/tauri.conf.json");
    const build = config.build as Record<string, unknown>;
    const app = config.app as Record<string, unknown>;
    const bundle = config.bundle as Record<string, unknown>;
    const windows = app.windows as Array<Record<string, unknown>>;
    const icons = bundle.icon as string[];

    expect(config.productName).toBe("Angel2 Web Remake");
    expect(config.identifier).toBe("com.wispsnow.angel2-web-remake");
    expect(build.frontendDist).toBe("../release");
    expect(build.beforeBuildCommand).toBe("pnpm build:release");
    expect(icons).toEqual([
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico",
    ]);
    for (const icon of icons) {
      expect(existsSync(new URL(`../../src-tauri/${icon}`, import.meta.url))).toBe(true);
    }
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({
      label: "main",
      title: "天使帝國 II Web 復刻版",
      width: 1280,
      height: 800,
      // 桌面殼預設關掉頁面縮放熱鍵，網頁版玩家卻一直有 `Ctrl +/-`。宿主工具列與三個
      // 參考面板是固定 px 的 DOM，少了這一條，桌面版玩家在大螢幕上沒有任何放大手段。
      zoomHotkeysEnabled: true,
    });
  });

  it("uses the small Evergreen WebView2 path and blocks installer downgrades", () => {
    const config = readJson("src-tauri/tauri.windows.conf.json");
    const bundle = config.bundle as Record<string, unknown>;
    const windows = bundle.windows as Record<string, unknown>;

    expect(bundle.targets).toEqual(["nsis"]);
    expect(windows.allowDowngrades).toBe(false);
    expect(windows.webviewInstallMode).toEqual({
      type: "downloadBootstrapper",
      silent: true,
    });
    // NSIS 只在 `installerIcon`/`uninstallerIcon` 非空時才 `!define MUI_ICON`；
    // 少了這兩條，安裝與卸載程式自己會退回 NSIS 預設圖示。桌面／開始功能表捷徑
    // 不受影響：它們指向主程式，用的是 tauri-build 從同一個 .ico 嵌進執行檔的
    // 圖示資源。
    expect(windows.nsis).toEqual({
      installMode: "currentUser",
      installerIcon: "icons/icon.ico",
      uninstallerIcon: "icons/icon.ico",
    });
    expect(existsSync(new URL("../../src-tauri/icons/icon.ico", import.meta.url))).toBe(true);
  });

  it("serves the browser tab icon from the same artwork as the desktop shell", () => {
    // 圖示只有一份來源：src-tauri/icons/ 由 src-tauri/app-icon.svg 經 `tauri icon`
    // 產生。public/ 裡的兩個副本是逐位元組複製，所以斷言位元組相等而不是「看起來
    // 一樣」——否則換圖時很容易只更新桌面殼，網頁版繼續掛著舊圖。
    const mirrors = [
      { web: "public/favicon.ico", desktop: "src-tauri/icons/icon.ico" },
      { web: "public/icon-256.png", desktop: "src-tauri/icons/128x128@2x.png" },
    ];
    for (const { web, desktop } of mirrors) {
      expect(readBytes(web).equals(readBytes(desktop))).toBe(true);
    }

    // `/favicon.ico` 是瀏覽器的隱式回退，各實驗室頁面靠它拿到同一個圖示；index.html
    // 另外顯式宣告，讓高解析度分頁可以直接取 256 的 PNG。佔位圖示曾經是內嵌的
    // data URI，這裡順帶擋住它回來。
    const indexHtml = readText("index.html");
    expect(indexHtml).toContain('<link rel="icon" href="/favicon.ico" />');
    expect(indexHtml).toContain(
      '<link rel="icon" type="image/png" sizes="256x256" href="/icon-256.png" />',
    );
    expect(indexHtml).toContain('<link rel="apple-touch-icon" href="/icon-256.png" />');
    expect(indexHtml).not.toMatch(/<link[^>]*rel="(?:apple-touch-)?icon"[^>]*href="data:/u);
  });

  it("keeps Windows packaging manual and separate from Cloudflare deployment", () => {
    const workflow = readText(".github/workflows/desktop-windows.yml");
    const gitAttributes = readText(".gitattributes");
    const packageJson = readJson("package.json");
    const appTypeScriptConfig = readJson("tsconfig.app.json");
    const testTypeScriptConfig = readJson("tsconfig.tests.json");
    const capability = readJson("src-tauri/capabilities/main.json");
    const scripts = packageJson.scripts as Record<string, unknown>;

    expect(scripts["desktop:build:windows"]).toBe("tauri build --bundles nsis");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("runs-on: windows-latest");
    expect(workflow).toContain("pnpm desktop:build:windows");
    expect(workflow).toContain("actions/upload-artifact@v4");
    // 安裝包沒有代碼簽名，校驗和是玩家唯一能自證下載無誤的手段。sidecar 必須跟著
    // artifact 一起上傳，摘要裡也要留一份，否則轉發到網盤的人得先下載 artifact 才
    // 拿得到要公布的哈希。
    expect(workflow).toContain("Get-FileHash -Algorithm SHA256");
    expect(workflow).toContain("src-tauri/target/release/bundle/nsis/*-setup.exe.sha256");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    // README 是玩家側的校驗與 SmartScreen 說明落點，工作流換掉校驗方式時要一起改。
    const readme = readText("README.md");
    expect(readme).toContain("## Windows 安装包");
    expect(readme).toContain("Get-FileHash -Algorithm SHA256");
    expect(readme).toContain("SmartScreen");
    // 安裝包與素材包放在同一個網盤分享，README 兩處引用必須指向同一條連結——
    // 上一版換連結時就漏改了其中一處。
    const shareLinks = new Set(readme.match(/https:\/\/pan\.baidu\.com\/s\/[^)\s]+/gu) ?? []);
    expect(shareLinks.size).toBe(1);
    expect(workflow).not.toMatch(/cloudflare|wrangler/i);
    expect(gitAttributes).toContain("* text=auto eol=lf");
    expect(appTypeScriptConfig.include).toEqual(["src"]);
    expect(testTypeScriptConfig.include).toEqual(["src", "tests/unit"]);
    expect(scripts["typecheck:tests"]).toBe("tsc -p tsconfig.tests.json");
    expect(packageJson.dependencies).toMatchObject({ "@tauri-apps/api": "2.11.1" });
    expect(capability.windows).toEqual(["main"]);
    expect(capability.permissions).toEqual(expect.arrayContaining([
      "core:window:allow-set-size",
      "core:window:allow-set-fullscreen",
      "core:window:allow-unmaximize",
      // 「介面縮放」用的命令不在 `core:default` 裡，漏掉這一條在桌面版是執行期才報錯。
      "core:webview:allow-set-webview-zoom",
    ]));
  });
});
