import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readText = (relativePath: string): string =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

const readJson = (relativePath: string): Record<string, unknown> =>
  JSON.parse(readText(relativePath)) as Record<string, unknown>;

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
    expect(windows.nsis).toEqual({ installMode: "currentUser" });
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
