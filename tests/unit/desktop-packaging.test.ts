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
    const packageJson = readJson("package.json");
    const scripts = packageJson.scripts as Record<string, unknown>;

    expect(scripts["desktop:build:windows"]).toBe("tauri build --bundles nsis");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("runs-on: windows-latest");
    expect(workflow).toContain("pnpm desktop:build:windows");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).not.toMatch(/cloudflare|wrangler/i);
  });
});
