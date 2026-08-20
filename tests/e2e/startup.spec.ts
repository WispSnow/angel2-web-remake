import { expect, test, type Page } from "@playwright/test";
import { STARTUP_FONT } from "../../src/game/content/startup.generated";
import { createStage0Units, initialEnemyExperience, statsFor } from "../../src/game/content/stage0";
import { difficultyHintFor } from "../../src/game/content/startup";
import {
  SAVE_BACKUP_FORMAT,
  SAVE_BACKUP_VERSION,
  SAVE_SLOT_COUNT,
  SAVE_VERSION,
} from "../../src/game/save";
import { INTRO_BAND } from "../../src/game/startup";
import { skipOpeningToTitle } from "./startup-controls";
import { captureVisualAudit } from "./visual-audit";

const battleSave = () => {
  const units = createStage0Units(2);
  const nia = units.find((unit) => unit.id === "1:0");
  if (!nia) throw new Error("missing Nia fixture");
  nia.x = 29;
  nia.y = 26;
  nia.experience = 399;
  nia.life = 160;
  const actedAlly = units.find((unit) => unit.id === "1:43");
  if (!actedAlly) throw new Error("missing allied fixture");
  actedAlly.acted = true;

  return {
    format: "ANGEL2-web-save",
    version: 5,
    contentVersion: "native-classes-1",
    kind: "battle",
    savedAt: "2026-07-25T12:00:00.000Z",
    saveCount: 4,
    stageId: "stage-00",
    stageLabel: "瓦爾克麗宮",
    ruleset: "stableRemake",
    difficulty: 2,
    rngState: 0x1020_3040,
    roster: units
      .filter((unit) => unit.side === 1)
      .map(({ slot, classId, experience, life }) => ({ slot, classId, experience, life })),
    battle: {
      phase: "player",
      round: 3,
      focusId: nia.id,
      units,
      cursor: { x: 29, y: 26 },
      cameraOrigin: { x: 25, y: 23 },
    },
  };
};

const completedSave = () => {
  const source = battleSave();
  return {
    format: source.format,
    version: source.version,
    contentVersion: source.contentVersion,
    kind: "completed",
    savedAt: source.savedAt,
    saveCount: source.saveCount,
    stageId: "stage-01",
    stageLabel: "下一關",
    ruleset: source.ruleset,
    difficulty: source.difficulty,
    rngState: source.rngState,
    roster: source.roster,
  };
};

const legacyBattleSave = () => {
  const source = battleSave();
  return {
    format: source.format,
    version: 2 as const,
    kind: source.kind,
    savedAt: source.savedAt,
    saveCount: source.saveCount,
    stage: 0 as const,
    stageLabel: source.stageLabel,
    ruleset: source.ruleset,
    difficulty: source.difficulty,
    rngState: source.rngState,
    roster: source.roster.map((entry) => {
      const classId = entry.classId === "cavalry" ? 22 as const : 0 as const;
      if (entry.slot === 0) return { ...entry, classId, experience: 100, life: 140 };
      if (entry.slot === 1) return { ...entry, classId, experience: 0, life: 160 };
      return { ...entry, classId };
    }),
    battle: {
      ...source.battle,
      units: source.battle.units.map(({ actionDisabled: _actionDisabled, ...unit }) => {
        const classId = unit.classId === "cavalry" ? 22 as const : 0 as const;
        if (unit.side === 2) {
          return {
            ...unit,
            classId,
            experience: 0,
            life: classId === 22 ? 200 : 160,
          };
        }
        if (unit.slot === 0) return { ...unit, classId, experience: 100, life: 140 };
        if (unit.slot === 1) return { ...unit, classId, experience: 0, life: 160 };
        return { ...unit, classId };
      }),
    },
  };
};

const writeLocalSave = (
  page: Page,
  slot: number,
  value: BattleSaveData | CompletedSaveData | ReturnType<typeof legacyBattleSave> | string,
) => page.evaluate(({ key, serialized }) => {
  localStorage.setItem(key, serialized);
}, {
  key: `angel2.save.${slot}`,
  serialized: typeof value === "string" ? value : JSON.stringify(value),
});

/**
 * Module 23 never fades the title art in: 0000:0766/0000:07FB blit it through
 * eight and sixteen nested 8x8 dither patterns, five native ticks apart, over a
 * background that was itself brought up by 64 additive DAC writes. Assert the
 * three stages land in that order and that the menu only appears afterwards.
 */
test("title artwork dissolves in over its background before the menu appears", async ({ page }) => {
  await page.goto("/?test=1");
  await skipOpeningToTitle(page);

  // The art is bright against a dark blue plate, so the mean luminance of a band
  // rises as more of the dither pattern fills in.
  const luminance = (x: number, y: number, width: number, height: number) =>
    page.getByTestId("startup-canvas").evaluate((canvas, [left, top, w, h]) => {
      const { data } = (canvas as HTMLCanvasElement).getContext("2d")!.getImageData(left, top, w, h);
      let total = 0;
      for (let index = 0; index < data.length; index += 4) {
        total += data[index] + data[index + 1] + data[index + 2];
      }
      return total / (w * h);
    }, [x, y, width, height]);

  await expect(page.getByTestId("startup-screen")).toHaveAttribute("data-startup-phase", "title-assemble");
  await expect(page.getByTestId("title-menu")).toBeHidden();
  // The BK/40 surround belongs to the menu draw, so it must not lead the art in.
  await expect(page.getByTestId("startup-title-menu-frame")).toBeHidden();
  const upperEarly = await luminance(32, 0, 472, 200);
  const logoEarly = await luminance(0, 216, 640, 123);

  await expect(page.getByTestId("startup-screen")).toHaveAttribute("data-startup-phase", "title");
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await expect(page.getByTestId("startup-title-menu-frame")).toBeVisible();
  expect(await luminance(32, 0, 472, 200)).toBeGreaterThan(upperEarly);
  expect(await luminance(0, 216, 640, 123)).toBeGreaterThan(logoEarly);

  expect(await page.getByTestId("title-screen").evaluate((element) => getComputedStyle(element).cursor))
    .toContain("command-menu-pointer.png");
  expect(await page.getByTestId("new-game").evaluate((element) => getComputedStyle(element).cursor))
    .toContain("command-menu-pointer.png");
});

/**
 * The host right button is the second mapping of the one native cancel flag, so
 * it has to back out of both sub-menus and never raise the browser context menu.
 * `REMAKE-114` dropped the MUSIC/1 loop `REMAKE-112` had inferred and
 * `REMAKE-115` keeps that single play running through a cancel: the native RIX
 * stop on cancel would cut the track off mid-bar for a move that never leaves
 * the title, and the play must not restart from the top either.
 */
test("right click cancels the startup sub-menus without restarting or cutting MUSIC/1", async ({ page }) => {
  await page.goto("/?test=1");
  await skipOpeningToTitle(page);
  const startup = page.getByTestId("startup-screen");
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await expect(startup).toHaveAttribute("data-title-music-playing", "true");
  await expect(startup).toHaveAttribute("data-title-music-loop", "false");
  await expect(startup).toHaveAttribute("data-title-music-play-count", "1");

  await page.getByTestId("new-game").click();
  await expect(page.getByTestId("difficulty-menu")).toBeVisible();
  await startup.click({ button: "right" });
  await expect(startup).toHaveAttribute("data-startup-phase", "title");
  await expect(page.getByTestId("difficulty-menu")).toBeHidden();
  await expect(page.getByTestId("title-menu")).toBeVisible();
  // A stopped transport shows the cut; a second play shows a restart from the top.
  await expect(startup).toHaveAttribute("data-title-music-playing", "true");
  await expect(startup).toHaveAttribute("data-title-music-play-count", "1");

  await page.getByTestId("continue-game").click();
  await expect(page.getByTestId("title-record-menu")).toBeVisible();
  await startup.click({ button: "right" });
  await expect(startup).toHaveAttribute("data-startup-phase", "title");
  await expect(page.getByTestId("title-record-menu")).toBeHidden();
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await expect(startup).toHaveAttribute("data-title-music-playing", "true");
  await expect(startup).toHaveAttribute("data-title-music-play-count", "1");
});

test("pointer difficulty confirmation carries audio activation into stage zero", async ({ page }) => {
  await page.goto("/?test=1");
  await skipOpeningToTitle(page, "pointer");
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await page.getByTestId("new-game").click();
  await page.getByTestId("difficulty-0").click();

  await expect(page.getByTestId("dialogue-layer")).toBeVisible();
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "MAGIC/73");
  await expect(page.locator("#app")).toHaveAttribute("data-music-playing", "true");
});

test("later-stage and debug modules stay deferred during stage-zero startup", async ({ page }) => {
  const deferredRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    const isDeferredStageOrDebug = /stage1|stage-01|debug-scenarios|debug\.css/.test(pathname);
    const isDeferredDeployment = /\/src\/game\/(?:deployment-(?:minimap|session|ui)|simulation\/deployment)\b/
      .test(pathname);
    if (isDeferredStageOrDebug || isDeferredDeployment) {
      deferredRequests.push(pathname);
    }
  });

  await page.goto("/?test=1&skipStartup");
  await expect(page.getByTestId("dialogue-layer")).toBeVisible();
  await expect(page.getByTestId("game-screen"))
    .toHaveAttribute("aria-label", "天使帝國 II 瓦爾克麗宮遊戲畫面");
  expect(deferredRequests).toEqual([]);
  expect(await page.evaluate(() => window.__ANGEL2_DEBUG__)).toBeUndefined();
});

test("BOOT-A: opening story, title and difficulty selection enter stage zero", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?test=1");
  const startup = page.getByTestId("startup-screen");
  const intro = page.getByTestId("opening-intro");
  // The Softstar logo runs first now, exactly as 0000:0CE2 does. It is too brief
  // under ?test=1 to catch by phase, so it leaves a marker behind.
  await expect(startup).toHaveAttribute("data-startup-phase", "intro");
  await expect(startup).toHaveAttribute("data-pretitle-shown", "true");
  await expect(intro).toBeVisible();
  // The scrolling rows are drawn with the A/23+A/24 bitmap font on the canvas;
  // the paragraphs keep the same text for assistive technology.
  await expect.poll(() => intro.locator("[data-intro-slot]").evaluateAll((lines) =>
    lines.some((line) => !line.hasAttribute("hidden") && (line.textContent?.trim().length ?? 0) > 0),
  )).toBe(true);
  // Rows only ever show between the two colour-0 bars 0000:11DA paints at
  // DS:07C0 and DS:07CA, shifted down as one by REMAKE-113. Both bar footprints
  // have to stay black while the rows ramp in and out, a scanline per update;
  // a clipped row can only leave ink within one glyph of either edge.
  const reach = STARTUP_FONT.glyphHeight;
  const bars = [[INTRO_BAND.top - reach, reach], [INTRO_BAND.bottom, reach]];
  const introWhite = (y: number, height: number) => page.evaluate(([top, rows]) => {
    const canvas = document.querySelector("#startup-canvas") as HTMLCanvasElement;
    const { data } = canvas.getContext("2d")!.getImageData(160, top, 400, rows);
    let white = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 200 && data[index + 1] > 200 && data[index + 2] > 200) white += 1;
    }
    return white;
  }, [y, height]);
  await expect.poll(() => introWhite(INTRO_BAND.top, INTRO_BAND.bottom - INTRO_BAND.top))
    .toBeGreaterThan(0);
  await captureVisualAudit(startup, { path: "artifacts/playwright/startup-opening-intro.png" });
  const maskedWhite = await page.evaluate(async (regions) => {
    const canvas = document.querySelector("#startup-canvas") as HTMLCanvasElement;
    const context = canvas.getContext("2d")!;
    let worst = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      for (const [top, rows] of regions) {
        const { data } = context.getImageData(160, top, 400, rows);
        let white = 0;
        for (let index = 0; index < data.length; index += 4) {
          if (data[index] > 200 && data[index + 1] > 200 && data[index + 2] > 200) white += 1;
        }
        worst = Math.max(worst, white);
      }
    }
    return worst;
  }, bars.map(([top, rows]) => [top, rows]));
  expect(maskedWhite).toBe(0);

  await skipOpeningToTitle(page);
  await expect(page.getByTestId("title-screen")).toBeVisible();
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await expect(page.getByTestId("new-game")).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("startup-title-menu-frame")).toBeVisible();
  await expect(page.getByTestId("startup-difficulty-menu-frame")).toBeHidden();
  // 0000:19F2 draws BK/40 image 0 at (480,45), in the same call as the labels.
  await expect(page.getByTestId("startup-title-menu-frame")).toHaveCSS("top", "45px");
  await expect.poll(() => page.getByTestId("title-screen").locator("img:not([hidden])").evaluateAll((images) =>
    images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);
  // 0000:1ABF paints the 50% stipple under the selected label and 0000:2CCE then
  // outlines the cell in colour 0, so the leftmost white pixel of the highlighted
  // row always has black — never stipple or artwork — immediately to its left.
  const highlightedRow = await page.evaluate(([left, top, width, height]) => {
    const canvas = document.querySelector("#startup-canvas") as HTMLCanvasElement;
    const { data } = canvas.getContext("2d")!.getImageData(left, top, width, height);
    const at = (x: number, y: number) => {
      const offset = (y * width + x) * 4;
      return [data[offset], data[offset + 1], data[offset + 2]];
    };
    for (let x = 1; x < width; x += 1) {
      for (let y = 0; y < height; y += 1) {
        const [red, green, blue] = at(x, y);
        if (red > 200 && green > 200 && blue > 200) return { found: true, left: at(x - 1, y) };
      }
    }
    return { found: false, left: [] as number[] };
  }, [500, 71, 104, 24]);
  expect(highlightedRow.found).toBe(true);
  expect(highlightedRow.left).toEqual([0, 0, 0]);
  await captureVisualAudit(startup, { path: "artifacts/playwright/startup-title-menu.png" });

  await page.keyboard.press("Enter");
  const difficultyMenu = page.getByTestId("difficulty-menu");
  await expect(difficultyMenu).toBeVisible();
  await expect(difficultyMenu.getByRole("menuitem")).toHaveCount(4);
  await expect(page.getByTestId("difficulty-0")).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("startup-title-menu-frame")).toBeHidden();
  await expect(page.getByTestId("startup-difficulty-menu-frame")).toBeVisible();
  await expect(page.getByTestId("startup-difficulty-menu-frame")).toHaveCSS("top", "21px");
  await expect.poll(() => page.getByTestId("startup-difficulty-menu-frame").evaluate((image) => {
    const element = image as HTMLImageElement;
    return element.complete && element.naturalWidth === 144 && element.naturalHeight === 150;
  })).toBe(true);
  await captureVisualAudit(startup, { path: "artifacts/playwright/startup-difficulty-menu.png" });

  // Each option carries the hint that separates the two native rungs from the
  // two REMAKE-103 ones. The pointer opens it by hovering, which is also how the
  // native menu moves its highlight.
  for (const value of [0, 1, 2, 3] as const) {
    const hint = page.getByTestId(`difficulty-hint-${value}`);
    await expect(hint).toBeHidden();
    await page.getByTestId(`difficulty-${value}`).hover();
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText(new RegExp(difficultyHintFor(value).detail.slice(0, 12)));
    await expect(hint).toHaveAttribute("data-difficulty-source", value === 1 || value === 2 ? "remake" : "native");
  }
  await captureVisualAudit(startup, { path: "artifacts/playwright/startup-difficulty-hint.png" });
  // Arrow keys never move DOM focus, so the hint follows the highlight instead.
  await page.mouse.move(16, 340);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("difficulty-0")).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("difficulty-hint-0")).toBeVisible();
  await expect(page.getByTestId("difficulty-hint-3")).toBeHidden();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("difficulty-2")).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("dialogue-layer")).toBeVisible();
  await expect(page.locator("#app")).toHaveAttribute("data-music-track", "MAGIC/73");
  await expect(page.locator("#app")).toHaveAttribute("data-music-playing", "true");
  const debugState = await page.evaluate(() => window.__ANGEL2__?.getState() as { phase: string; difficulty: number });
  expect(debugState).toMatchObject({ phase: "prebattleStory", difficulty: 2 });
  await captureVisualAudit(page.getByTestId("game-screen"), { path: "artifacts/playwright/startup-stage0-entry.png" });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("BOOT-B: persisted battle slots survive reload and migrate version 2 from the title", async ({ page }) => {
  const save = legacyBattleSave();
  await page.goto("/?test=1");
  await writeLocalSave(page, 1, save);
  await writeLocalSave(page, 2, "{");
  await writeLocalSave(page, 20, save);
  await page.reload();

  await skipOpeningToTitle(page);
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await page.getByTestId("continue-game").click();

  const recordMenu = page.getByTestId("title-record-menu");
  await expect(recordMenu).toBeVisible();
  await expect(page.getByTestId("startup-screen")).toHaveAttribute("data-startup-phase", "records");
  await expect(recordMenu.getByRole("menuitem")).toHaveCount(5);
  await expect(page.getByTestId("title-record-page")).toHaveText("第 1／4 頁");
  await expect(page.getByTestId("title-record-slot-1")).toHaveAttribute("data-slot-state", "valid");
  await expect(page.getByTestId("title-record-slot-1")).toContainText("士兵");
  await expect(page.getByTestId("title-record-slot-1")).toContainText("困難重重");
  await expect(page.getByTestId("title-record-slot-2")).toHaveAttribute("data-slot-state", "invalid");
  await expect(page.getByTestId("title-record-slot-3")).toHaveAttribute("data-slot-state", "empty");
  await captureVisualAudit(recordMenu, { path: "artifacts/playwright/startup-title-record-menu.png" });

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("title-record-detail")).toContainText("資料損壞");
  await expect(recordMenu).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("title-record-detail")).toContainText("沒有記錄");
  await expect(recordMenu).toBeVisible();

  await page.mouse.move(0, 0);
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("title-record-page")).toHaveText("第 4／4 頁");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("title-record-slot-20")).toHaveAttribute("data-slot-state", "valid");
  await expect(page.getByTestId("title-record-slot-20")).toHaveAttribute("aria-current", "true");
  await captureVisualAudit(recordMenu, {
    path: "artifacts/playwright/startup-title-record-page-4.png",
  });

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await page.getByTestId("continue-game").click();
  await page.getByTestId("title-record-slot-1").click();

  await page.waitForFunction(() => window.__ANGEL2__?.getState().phase === "player");
  const state = await page.evaluate(() => window.__ANGEL2__?.getState() as {
    phase: string;
    difficulty: number;
    round: number;
    rngState: number;
    cursor: { x: number; y: number };
    cameraOrigin: { x: number; y: number };
    units: Array<{ id: string; x: number; y: number; life: number; experience: number }>;
  });
  expect(state).toMatchObject({
    phase: "player",
    difficulty: save.difficulty,
    round: save.battle.round,
    rngState: save.rngState,
    cursor: save.battle.cursor,
    cameraOrigin: save.battle.cameraOrigin,
  });
  expect(state.units.find((unit) => unit.id === "1:0")).toMatchObject({
    x: 29,
    y: 26,
    life: 160,
    experience: 399,
  });
  // 本用例证的是「v2 存档迁移后敌方按当前难度基线重建」，不是基线数值本身——后者归
  // `enemy-scaling.test.ts` 与 `stage0-difficulty.spec.ts`。所以这里从内容层派生，
  // `REMAKE-103` 那样的成长档调整不会再把它留成过期期望。
  const hadingExperience = initialEnemyExperience("cavalry", save.difficulty);
  expect(state.units.find((unit) => unit.id === "2:15")).toMatchObject({
    life: statsFor(
      { classId: "cavalry", experience: hadingExperience, side: 2 },
      save.difficulty,
    ).maxLife,
    experience: hadingExperience,
  });
  await expect(page.locator("#status-strip")).toHaveText("已讀取記錄 1。");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: "artifacts/playwright/startup-title-record-restored-battle.png",
  });
});

test("BOOT-B backup: the title exports every readable manual slot", async ({ page }) => {
  await page.goto("/?test=1");
  await writeLocalSave(page, 1, legacyBattleSave());
  await writeLocalSave(page, 2, "{");
  await page.reload();
  await skipOpeningToTitle(page);
  await page.getByTestId("continue-game").click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-save-backup").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^angel2-records-\d{8}-\d{6}Z\.json$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    format: string;
    version: number;
    slots: Array<{ version: number } | null>;
  };
  expect(backup.format).toBe(SAVE_BACKUP_FORMAT);
  expect(backup.version).toBe(SAVE_BACKUP_VERSION);
  expect(backup.slots).toHaveLength(SAVE_SLOT_COUNT);
  expect(backup.slots[0]?.version).toBe(SAVE_VERSION);
  expect(backup.slots[1]).toBeNull();
  await expect(page.getByTestId("title-record-detail"))
    .toHaveText("已匯出 1 筆記錄；損壞的記錄 2 未包含。");
});

test("BOOT-B restore: import validates, confirms safely, and replaces all twenty slots", async ({ page }) => {
  await page.goto("/?test=1");
  await writeLocalSave(page, 1, legacyBattleSave());
  await page.reload();
  await skipOpeningToTitle(page);
  await page.getByTestId("continue-game").click();

  const fileInput = page.getByTestId("import-save-file");
  await fileInput.setInputFiles({
    name: "not-a-save.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"wrong"}'),
  });
  await expect(page.getByTestId("title-record-detail"))
    .toHaveText("匯入失敗：檔案格式、版本或記錄內容不相容。");
  expect(await page.evaluate(() => localStorage.getItem("angel2.save.1"))).not.toBeNull();

  const slots = Array.from<ReturnType<typeof completedSave> | null>(
    { length: SAVE_SLOT_COUNT },
    () => null,
  );
  slots[2] = completedSave();
  const backup = JSON.stringify({
    format: SAVE_BACKUP_FORMAT,
    version: SAVE_BACKUP_VERSION,
    exportedAt: "2026-08-20T12:34:56.000Z",
    slots,
  });
  const selectBackup = () => fileInput.setInputFiles({
    name: "angel2-records.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });

  await selectBackup();
  const confirm = page.getByTestId("import-save-confirm");
  await expect(confirm).toBeVisible();
  await expect(page.getByTestId("cancel-save-import")).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("import-save-summary"))
    .toHaveText("備份時間 2026-08-20 12:34 UTC，共 1 筆有效記錄。");
  await captureVisualAudit(confirm, {
    path: "artifacts/playwright/startup-save-import-confirm.png",
  });

  // The destructive confirmation defaults to cancel and has not touched storage.
  await page.keyboard.press("Enter");
  await expect(confirm).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("angel2.save.1"))).not.toBeNull();

  await selectBackup();
  await page.getByTestId("confirm-save-import").click();
  await expect(confirm).toBeHidden();
  await expect(page.getByTestId("title-record-detail")).toHaveText("已從備份還原 1 筆記錄。");
  expect(await page.evaluate(() => localStorage.getItem("angel2.save.1"))).toBeNull();
  const restored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("angel2.save.3") ?? "null") as { version: number; kind: string });
  expect(restored).toMatchObject({ version: SAVE_VERSION, kind: "completed" });
  await expect(page.getByTestId("title-record-slot-3")).toHaveAttribute("data-slot-state", "valid");
});

test("BOOT-C: a normal reconnect migrates a stage-0 clear into stage-1 prebattle", async ({ page }) => {
  const save = completedSave();
  await page.goto("/");
  await writeLocalSave(page, 1, save);
  await page.reload();
  expect(await page.evaluate(() => "__ANGEL2__" in window)).toBe(false);

  await skipOpeningToTitle(page);
  await expect(page.getByTestId("title-menu")).toBeVisible();
  await page.getByTestId("continue-game").click();
  await expect(page.getByTestId("title-record-detail")).toContainText("騎士城堡前");
  await page.getByTestId("title-record-slot-1").click();

  await expect(page.getByTestId("dialogue-layer")).toBeVisible();
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "4");
  await expect(page.getByTestId("game-screen"))
    .toHaveAttribute("aria-label", "天使帝國 II 騎士城堡前遊戲畫面");
  expect(await page.evaluate(() => "__ANGEL2__" in window)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("angel2.save.1"))).toBe(JSON.stringify(save));
});
