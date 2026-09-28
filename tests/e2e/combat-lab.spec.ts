import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  FULL_COMBAT_BATTLE_BUFFER,
  FULL_COMBAT_PRESENT_WINDOW,
  FULL_COMBAT_WINDOW_FRAME,
} from "../../src/game/content/full-combat-backgrounds.generated";
import { NATIVE_GAMEPLAY_PALETTE } from "../../src/game/content/native-font.generated";
import {
  fullCombatBackdropSourcePixel,
  type FullCombatBackdropPhases,
} from "../../src/game/full-combat-backdrop";
import { decodeScreenshot } from "./screenshot-pixels";
import { captureVisualAudit } from "./visual-audit";

test("the laboratory schedules prepared full-combat sounds without media requests", async ({ page }) => {
  const wavRequests: Array<{ path: string; type: string }> = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith(".wav")) wavRequests.push({ path, type: request.resourceType() });
  });
  await page.goto("/combat-lab.html");
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-sound-effect-ready", "true");
  const preparedRequestCount = wavRequests.length;
  await page.locator('input[name="sound"]').check();

  await expect.poll(async () => Number(
    await app.getAttribute("data-sound-effect-schedule-count"),
  )).toBeGreaterThan(0);
  await expect(app).toHaveAttribute("data-sound-effect-context", "running");
  expect(wavRequests).toHaveLength(preparedRequestCount);
  expect(wavRequests.some(({ type }) => type === "media")).toBe(false);
});

interface CombatLabState {
  config: {
    attackerClass: string;
    defenderClass: string;
    attackerLife: number;
    defenderLife: number;
    reaction: "guard" | "hurt";
    death: boolean;
    side: "left" | "right";
    speed: number;
  };
  playing: boolean;
  t: number;
  duration: number;
  phase: string;
  actorFrame?: number;
  victimFrame?: number;
  victimReaction?: string;
  marks: readonly { t: number; phase: string }[];
}

const labState = (page: Page) =>
  page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.getState() as CombatLabState);

const waitForVictim = (
  page: Page,
  classId: string,
  reaction: "hurt" | "death",
  frame: number,
) => page.waitForFunction(
  ({ expectedClass, expectedReaction, expectedFrame }) => {
    const state = window.__ANGEL2_COMBAT_LAB__?.getState();
    return state?.config.defenderClass === expectedClass
      && state.victimReaction === expectedReaction
      && state.victimFrame === expectedFrame;
  },
  { expectedClass: classId, expectedReaction: reaction, expectedFrame: frame },
);

const waitForVisibleSpriteImages = (page: Page) => page.waitForFunction(() => {
  const holders = Array.from(
    document.querySelectorAll<HTMLElement>(".full-combat-sprite:not([hidden])"),
  );
  return holders.length > 0 && holders.every((holder) => {
    const frame = holder.querySelector<HTMLElement>(".full-combat-frame");
    return frame !== null
      && frame.offsetWidth > 0
      && frame.offsetHeight > 0
      && getComputedStyle(frame).backgroundImage !== "none";
  });
});

test("a soldier panorama requests bounded atlases instead of individual frame PNGs", async ({ page }) => {
  const requestedSpritePaths = new Set<string>();
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.includes("/assets/original/full-combat/")) {
      requestedSpritePaths.add(path);
    }
    if (path.includes("/assets/original/full-combat-atlases/")) {
      requestedSpritePaths.add(path);
    }
  });

  await page.goto(
    "/combat-lab.html?attacker=soldier&defender=soldier&reaction=hurt&speed=4",
  );
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_200));
  await waitForVisibleSpriteImages(page);
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_100));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");

  await expect.poll(() => [...requestedSpritePaths].sort()).toEqual([
    "/assets/original/full-combat-atlases/common-trail.png",
    "/assets/original/full-combat-atlases/left-soldier.png",
    "/assets/original/full-combat-atlases/right-soldier.png",
    "/assets/original/full-combat/backgrounds/05.png",
  ]);
});

/**
 * Renders the lab screen at 1:1 in page pixels: the lab otherwise scales the
 * logical screen fractionally and centres it on a half pixel.
 */
const pinLogicalScreen = (page: Page, extraCss = "") => page.addStyleTag({
  content: `.logical-screen { transform: none !important; position: fixed !important;
    left: 0 !important; top: 0 !important; margin: 0 !important; }${extraCss}`,
});

const hexColour = (hex: string): [number, number, number] =>
  [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];

test("REMAKE-169: the backdrop is module 29's five-layer composition inside the native window", async ({ page }) => {
  await page.goto(
    "/combat-lab.html?attacker=soldier&defender=soldier&reaction=hurt&side=left&speed=4",
  );
  // Only the backdrop is under test: hide everything the channels draw over it.
  await pinLogicalScreen(page, `.full-combat-channels, .full-combat-shadow,
    .full-combat-particles, .full-damage-number { visibility: hidden !important; }`);
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.pause());
  const { marks } = await labState(page);
  const markTime = (phase: string) => {
    const mark = marks.find((entry) => entry.phase === phase);
    if (!mark) throw new Error(`missing ${phase}`);
    return mark.t;
  };
  const record = decodeScreenshot(
    readFileSync("public/assets/original/full-combat/backgrounds/05.png"),
  );
  const present = {
    x: FULL_COMBAT_BATTLE_BUFFER.screenX + FULL_COMBAT_PRESENT_WINDOW.bufferX,
    y: FULL_COMBAT_BATTLE_BUFFER.screenY + FULL_COMBAT_PRESENT_WINDOW.bufferY,
    width: FULL_COMBAT_PRESENT_WINDOW.width,
    height: FULL_COMBAT_PRESENT_WINDOW.height,
  };

  const expectComposition = async (phases: FullCombatBackdropPhases) => {
    await expect(page.getByTestId("full-combat-backdrop")).toHaveAttribute("data-phases", phases.join(","));
    await page.waitForFunction(() => Array.from(
      document.querySelectorAll<HTMLImageElement>(".full-combat-backdrop img"),
    ).every((image) => image.complete && image.naturalWidth === 448));
    const shot = decodeScreenshot(await page.screenshot({ clip: present }));
    expect([shot.width, shot.height]).toEqual([present.width, present.height]);
    let mismatches = 0;
    for (let y = 0; y < present.height; y += 1) {
      for (let x = 0; x < present.width; x += 1) {
        const source = fullCombatBackdropSourcePixel(x + FULL_COMBAT_PRESENT_WINDOW.bufferX, y, phases);
        const expected = source && source.y < record.height
          ? [...record.pixels.subarray((source.y * record.width + source.x) * record.channels)
            .subarray(0, 3)]
          : [0, 0, 0];
        const actual = [...shot.pixels.subarray((y * shot.width + x) * shot.channels).subarray(0, 3)];
        if (actual.some((value, channel) => value !== expected[channel])) mismatches += 1;
      }
    }
    expect(mismatches, `pixels off the native composition at phases ${phases.join(",")}`).toBe(0);
  };

  // Scene start: the far layer is already 16 px into C/5, the floor is not.
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), markTime("fullWindup"));
  await expectComposition([0, 0, 0, 0, 0]);
  await captureVisualAudit(page.getByTestId("full-combat-window"), {
    path: "artifacts/playwright/combat-lab-remake-169-scene-start.png",
  });
  // The primary hold of capture frame 139: layers 1 and 3 spill a row.
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), markTime("fullHold"));
  await expectComposition([26, 52, 21, 48, 10]);
  await captureVisualAudit(page.getByTestId("full-combat-window"), {
    path: "artifacts/playwright/combat-lab-remake-169-primary-hold.png",
  });

  // The frame's outer 8 columns are the buffer columns F2CC never presents.
  const frameBox = FULL_COMBAT_WINDOW_FRAME.reduce((box, rect) => ({
    x: Math.min(box.x, rect.x),
    y: Math.min(box.y, rect.y),
    right: Math.max(box.right, rect.x + rect.width),
    bottom: Math.max(box.bottom, rect.y + rect.height),
  }), { x: Infinity, y: Infinity, right: 0, bottom: 0 });
  const frame = decodeScreenshot(await page.screenshot({
    clip: {
      x: frameBox.x,
      y: frameBox.y,
      width: frameBox.right - frameBox.x,
      height: frameBox.bottom - frameBox.y,
    },
  }));
  const frameColour = (screenX: number, screenY: number) => {
    const offset = ((screenY - frameBox.y) * frame.width + screenX - frameBox.x) * frame.channels;
    return [...frame.pixels.subarray(offset, offset + 3)];
  };
  const row = FULL_COMBAT_BATTLE_BUFFER.screenY + 50;
  const margin = (from: number) => Array.from({ length: 8 }, (_, index) => frameColour(from + index, row));
  expect(margin(FULL_COMBAT_BATTLE_BUFFER.screenX))
    .toEqual([0, 14, 2, 0, 14, 14, 14, 0].map((colour) => hexColour(NATIVE_GAMEPLAY_PALETTE[colour])));
  expect(margin(FULL_COMBAT_BATTLE_BUFFER.screenX + 440))
    .toEqual([0, 14, 14, 14, 0, 2, 14, 0].map((colour) => hexColour(NATIVE_GAMEPLAY_PALETTE[colour])));

  // A right-side strike: its first :L update leaves every layer at a full
  // row, so the four near layers read the record one row further down.
  await page.goto(
    "/combat-lab.html?attacker=soldier&defender=soldier&reaction=hurt&side=right&speed=4",
  );
  await pinLogicalScreen(page, `.full-combat-channels, .full-combat-shadow,
    .full-combat-particles, .full-damage-number { visibility: hidden !important; }`);
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.pause());
  const rightMarks = (await labState(page)).marks;
  const rightMark = (phase: string) => {
    const mark = rightMarks.find((entry) => entry.phase === phase);
    if (!mark) throw new Error(`missing ${phase}`);
    return mark.t;
  };
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), rightMark("fullCharge") + 40);
  await expectComposition([56, 56, 56, 56, 56]);
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), rightMark("fullHold"));
  await expectComposition([31, 6, 38, 12, 51]);
  await captureVisualAudit(page.getByTestId("full-combat-window"), {
    path: "artifacts/playwright/combat-lab-remake-169-right-hold.png",
  });
});

test("REMAKE-169: YD shifts only the presented buffer, never the frame or the gauges", async ({ page }) => {
  await page.goto(
    "/combat-lab.html?attacker=jungle-warrior&defender=soldier&reaction=hurt&speed=4",
  );
  await pinLogicalScreen(page);
  const windup = (await labState(page)).marks.find(({ phase }) => phase === "fullWindup")?.t;
  if (windup === undefined) throw new Error("missing fullWindup");
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), windup);
  await expect(page.getByTestId("full-combat-viewport-content")).toHaveAttribute("data-y-offset", "0");
  const boxes = () => page.evaluate(() => Object.fromEntries(
    ["full-combat-present", "full-combat-viewport-content", "full-left-life-gauge", "full-right-life-gauge"]
      .map((testId) => {
        const rect = document.querySelector(`[data-testid="${testId}"]`)!.getBoundingClientRect();
        return [testId, [rect.x, rect.y, rect.width, rect.height]];
      }),
  ));
  const still = await boxes();
  expect(still["full-combat-present"]).toEqual([
    FULL_COMBAT_BATTLE_BUFFER.screenX + FULL_COMBAT_PRESENT_WINDOW.bufferX,
    FULL_COMBAT_BATTLE_BUFFER.screenY,
    FULL_COMBAT_PRESENT_WINDOW.width,
    FULL_COMBAT_PRESENT_WINDOW.height,
  ]);
  // 9E28 draws both gauge frames at screen y=308.
  expect(still["full-left-life-gauge"]).toEqual([103, 308, 212, 7]);
  expect(still["full-right-life-gauge"]).toEqual([324, 308, 212, 7]);

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_361));
  await expect(page.getByTestId("full-combat-viewport-content")).toHaveAttribute("data-y-offset", "-4");
  const shifted = await boxes();
  expect(shifted["full-combat-viewport-content"][1]).toBe(still["full-combat-viewport-content"][1] - 4);
  expect(shifted["full-combat-present"]).toEqual(still["full-combat-present"]);
  expect(shifted["full-left-life-gauge"]).toEqual(still["full-left-life-gauge"]);
  expect(shifted["full-right-life-gauge"]).toEqual(still["full-right-life-gauge"]);
});

test("record 35 empress exposes only the original right-side soldier fallback", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(
    "/combat-lab.html?attacker=empress&defender=soldier&reaction=hurt&side=left&speed=4",
  );

  await expect(page.getByTestId("combat-lab-attacker")).toHaveValue("empress");
  await expect(page.getByTestId("combat-lab-side")).toHaveValue("right");
  await expect(page.locator('[data-testid="combat-lab-side"] option[value="left"]'))
    .toHaveAttribute("disabled", "");
  await expect(page.getByTestId("combat-lab-message"))
    .toContainText("右側資料亦直接重用士兵畫面");
  expect((await labState(page)).config.side).toBe("right");

  const impactAt = (await labState(page)).marks
    .find(({ phase }) => phase === "fullImpact")?.t;
  expect(impactAt).toBeDefined();
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! - 40);
  await expect(page.getByTestId("full-actor-sprite"))
    .toHaveAttribute("data-frame-source", /right\/empress\/plus50\/0[45]$/);
  await waitForVisibleSpriteImages(page);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-35-original-boundary.png",
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test("record 0 soldier passes attack, guard, hurt and death visual gates", async ({ page }) => {
  await page.goto(
    "/combat-lab.html?attacker=soldier&defender=soldier"
      + "&attackerLife=260&defenderLife=500&reaction=hurt&speed=4",
  );

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_500));
  await expect(page.getByTestId("full-actor-sprite"))
    .toHaveAttribute("data-frame-source", /left\/soldier\/plus50\/0[45]$/);
  await expect(page.getByTestId("combat-lab-attacker-life")).toHaveValue("260");
  await expect(page.getByTestId("combat-lab-defender-life")).toHaveValue("500");
  await expect(page.getByTestId("full-left-life-gauge")).toHaveAttribute("data-life", "260");
  await expect(page.getByTestId("full-left-life-gauge")).toHaveAttribute("data-base-color", "11");
  await expect(page.getByTestId("full-left-life-gauge")).toHaveAttribute("data-fill-width", "50");
  await expect(page.getByTestId("full-right-life-gauge")).toHaveAttribute("data-life", "500");
  await expect(page.getByTestId("full-right-life-gauge")).toHaveAttribute("data-base-color", "9");
  await expect(page.getByTestId("full-right-life-gauge")).toHaveAttribute("data-fill-width", "80");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-00-attack.png",
    fullPage: true,
  });

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_060));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await expect(page.getByTestId("full-right-life-gauge")).toHaveAttribute("data-life", "476");
  await expect(page.getByTestId("full-right-life-gauge")).toHaveAttribute("data-fill-width", "56");
  await expect(page.getByTestId("full-right-status")).toContainText("生命500");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-00-hurt.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_100));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-00-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_460));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-00-death.png",
    fullPage: true,
  });
});

test("right-side soldier dust trail mirrors the left-side attack direction", async ({ page }) => {
  await page.goto(
    "/combat-lab.html?attacker=soldier&defender=soldier&side=right&reaction=hurt&speed=4",
  );
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_200));

  const particles = page.locator(".full-combat-particles .full-combat-frame:not([hidden])");
  await expect(particles).toHaveCount(3);
  const particleXs = await particles.evaluateAll((elements) => elements.map((element) => {
    const match = element.getAttribute("style")?.match(/translate\((-?\d+)px/u);
    return Number(match?.[1]);
  }));
  expect(particleXs[1] - particleXs[0]).toBe(24);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-right-soldier-dust.png",
    fullPage: true,
  });

  const impactAt = (await labState(page)).marks
    .find(({ phase }) => phase === "fullImpact")?.t;
  expect(impactAt).toBeDefined();
  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! + 200);
  await expect(particles).toHaveCount(3);
  const guardParticleXs = await particles.evaluateAll((elements) => elements.map((element) => {
    const match = element.getAttribute("style")?.match(/translate\((-?\d+)px/u);
    return Number(match?.[1]);
  }));
  expect(guardParticleXs[1] - guardParticleXs[0]).toBe(24);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-right-soldier-guard-dust.png",
    fullPage: true,
  });
});

test("record 1 magic sword warrior keeps its body and G1 effect channels synchronized", async ({ page }) => {
  await page.goto(
    "/combat-lab.html?attacker=magic-sword-warrior&defender=soldier&reaction=hurt&speed=4",
  );
  await expect(page.getByTestId("combat-lab-attacker")).toHaveValue("magic-sword-warrior");

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(620));
  await expect(page.getByTestId("full-actor-sprite"))
    .toHaveAttribute("data-frame-source", /left\/magic-sword-warrior\/plus50\/00$/);
  await expect(page.getByTestId("full-effect-G1-sprite"))
    .toHaveAttribute("data-frame-source", /left\/magic-sword-warrior\/plus50\/03$/);
  await expect(page.getByTestId("full-effect-G1-sprite")).toHaveAttribute("data-channel", "G1");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-01-attack.png",
    fullPage: true,
  });

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_760));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await expect(page.getByTestId("full-effect-G1-sprite"))
    .toHaveAttribute("data-frame-source", /left\/magic-sword-warrior\/plus50\/07$/);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-01-hurt.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_800));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await expect(page.getByTestId("full-effect-G1-sprite"))
    .toHaveAttribute("data-frame-source", /left\/magic-sword-warrior\/plus50\/04$/);
  await expect(page.getByTestId("full-effect-G1-sprite"))
    .toHaveAttribute("data-y-offset", "-18");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-01-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_460));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await expect(page.getByTestId("full-victim-sprite"))
    .toHaveAttribute("data-frame-source", /right\/soldier\/direct\/02$/);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-01-death.png",
    fullPage: true,
  });
});

test("record 2 jungle warrior passes attack, guard, hurt and death visual gates", async ({ page }) => {
  await page.goto(
    "/combat-lab.html?attacker=jungle-warrior&defender=soldier&reaction=hurt&speed=4",
  );
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_361));
  await expect(page.getByTestId("full-combat-viewport-content"))
    .toHaveAttribute("data-y-offset", "-4");
  const particles = page.locator(".full-combat-particles .full-combat-frame:not([hidden])");
  await expect(particles).toHaveCount(3);
  expect(await particles.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-frame"))))
    .toEqual(["1", "3", "5"]);
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_400));
  await expect(page.getByTestId("full-actor-sprite"))
    .toHaveAttribute("data-frame-source", /left\/jungle-warrior\/plus50\/04$/);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-02-attack.png",
    fullPage: true,
  });

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_320));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-02-hurt.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_370));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-02-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_770));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-02-death.png",
    fullPage: true,
  });
});

test("record 3 magic priest passes body, G1, reaction and death visual gates", async ({ page }) => {
  await page.goto(
    "/combat-lab.html?attacker=magic-priest&defender=soldier&reaction=hurt&speed=4",
  );
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(800));
  await expect(page.getByTestId("full-actor-sprite"))
    .toHaveAttribute("data-frame-source", /left\/magic-priest\/plus50\/01$/);
  await expect(page.getByTestId("full-effect-G1-sprite"))
    .toHaveAttribute("data-frame-source", /left\/magic-priest\/plus50\/02$/);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-03-attack.png",
    fullPage: true,
  });

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_400));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-03-hurt.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_450));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-03-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_200));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-03-death.png",
    fullPage: true,
  });
});

test("record 4 prayer guide passes attack, guard, hurt and death visual gates", async ({ page }) => {
  await page.goto(
    "/combat-lab.html?attacker=prayer-guide&defender=soldier&reaction=hurt&speed=4",
  );
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_120));
  await expect(page.getByTestId("full-actor-sprite"))
    .toHaveAttribute("data-frame-source", /left\/prayer-guide\/plus50\/02$/);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-04-attack.png",
    fullPage: true,
  });

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_480));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-04-hurt.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_530));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-04-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_180));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-04-death.png",
    fullPage: true,
  });
});

test("record 5 curse master passes late G1, reaction and death visual gates", async ({ page }) => {
  await page.goto(
    "/combat-lab.html?attacker=curse-master&defender=soldier&reaction=hurt&speed=4",
  );
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_400));
  await expect(page.getByTestId("full-actor-sprite"))
    .toHaveAttribute("data-frame-source", /left\/curse-master\/plus50\/05$/);
  await expect(page.getByTestId("full-effect-G1-sprite"))
    .toHaveAttribute("data-frame-source", /left\/curse-master\/plus50\/06$/);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-05-attack.png",
    fullPage: true,
  });

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_720));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await expect(page.getByTestId("full-effect-G1-sprite")).toBeHidden();
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-05-hurt.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_770));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-05-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_520));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-05-death.png",
    fullPage: true,
  });
});

test("swift dragon knight guard stays grounded on both physical sides", async ({ page }) => {
  // The guard is a direct frame, so it reads the descriptor +04h defender
  // table (y offset 0); the -16 belongs to the +50 attack frame 3.
  const observed: Array<{
    side: "left" | "right";
    nativeYOffset: string | null;
    projectedYOffset: string | null;
    groundClippedRows: string | null;
  }> = [];

  for (const side of ["left", "right"] as const) {
    await page.goto(
      `/combat-lab.html?attacker=soldier&defender=swift-dragon-knight`
        + `&reaction=guard&side=${side}&speed=4`,
    );
    await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.pause());
    const state = await labState(page);
    const impactAt = state.marks.find(({ phase }) => phase === "fullImpact")?.t;
    expect(impactAt).toBeDefined();
    await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! + 50);

    const sprite = page.getByTestId("full-victim-sprite");
    await expect(sprite).toHaveAttribute("data-reaction", "guard");
    await expect(sprite).toHaveAttribute("data-frame", "3");
    await expect(sprite).toHaveAttribute("data-side", side === "left" ? "right" : "left");
    await expect(sprite).toHaveAttribute(
      "data-frame-source",
      new RegExp(`${side === "left" ? "right" : "left"}/swift-dragon-knight/direct/03$`),
    );
    await waitForVisibleSpriteImages(page);
    await captureVisualAudit(page, {
      path: `artifacts/playwright/combat-lab-swift-dragon-guard-${side}.png`,
      fullPage: true,
    });
    observed.push(await sprite.evaluate((image) => ({
      side: image.dataset.side as "left" | "right",
      nativeYOffset: image.getAttribute("data-y-offset"),
      projectedYOffset: image.getAttribute("data-projected-y-offset"),
      groundClippedRows: image.getAttribute("data-ground-clipped-rows"),
    })));
  }

  expect(observed).toEqual([
    { side: "right", nativeYOffset: "0", projectedYOffset: "0", groundClippedRows: "0" },
    { side: "left", nativeYOffset: "0", projectedYOffset: "0", groundClippedRows: "0" },
  ]);
});

test("a fallen divine sword warrior keeps the original registration, ground clip and shadow", async ({ page }) => {
  await page.goto(
    "/combat-lab.html?attacker=demon-dragon-knight&defender=divine-sword-warrior"
      + "&reaction=hurt&death=1&side=left&speed=4",
  );
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.pause());
  const deathAt = (await labState(page)).marks
    .find(({ phase }) => phase === "fullDefenderDeath")?.t;
  expect(deathAt).toBeDefined();
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), deathAt! + 1);

  const victim = page.getByTestId("full-victim-sprite");
  await expect(victim).toHaveAttribute("data-reaction", "death");
  await expect(victim).toHaveAttribute("data-frame", "2");
  await expect(victim).toHaveAttribute("data-x", "290");
  await expect(victim).toHaveAttribute("data-y-offset", "21");
  await expect(victim).toHaveAttribute("data-ground-clipped-rows", "21");
  // The surviving attacker's main channel stays active on the DS:7DAE poses,
  // but the post-hit stream left it at x=-634, entirely left of the window.
  await expect(page.getByTestId("full-actor-sprite")).toBeHidden();
  await waitForVisibleSpriteImages(page);

  const geometry = await page.evaluate(() => {
    const scene = document.querySelector<HTMLElement>(".full-combat-scene")?.getBoundingClientRect();
    if (!scene) throw new Error("full-combat scene is missing");
    const scale = scene.width / 448;
    const toScene = (box: DOMRect) => ({
      left: Math.round((box.left - scene.left) / scale),
      top: Math.round((box.top - scene.top) / scale),
      right: Math.round((box.right - scene.left) / scale),
      bottom: Math.round((box.bottom - scene.top) / scale),
    });
    const element = (selector: string) => {
      const found = document.querySelector<HTMLElement>(selector);
      if (!found) throw new Error(`${selector} is missing`);
      return found;
    };
    return {
      image: toScene(element('[data-testid="full-victim-sprite"]').getBoundingClientRect()),
      channels: toScene(element('[data-testid="full-combat-channels"]').getBoundingClientRect()),
      bands: Array.from(document.querySelectorAll<HTMLElement>('[data-testid="full-victim-shadow"] > i'))
        .map((band) => ({ ...toScene(band.getBoundingClientRect()), dither: band.dataset.dither })),
      actorBands: Array.from(document.querySelectorAll<HTMLElement>('[data-testid="full-actor-shadow"] > i'))
        .map((band) => toScene(band.getBoundingClientRect())),
    };
  });
  // The user's capture of the original shows the body from (232, 97) with no
  // row at or below the y=135 ground line; the E336 shadow sits under it.
  expect(geometry.image).toEqual({ left: 232, top: 97, right: 336, bottom: 156 });
  expect(geometry.channels).toEqual({ left: 0, top: 0, right: 448, bottom: 135 });
  expect(geometry.bands).toEqual([
    { left: 232, top: 132, right: 336, bottom: 134, dither: "11" },
    { left: 224, top: 134, right: 344, bottom: 136, dither: "11" },
    { left: 232, top: 136, right: 336, bottom: 138, dither: "11" },
  ]);
  expect(geometry.actorBands).toHaveLength(3);
  expect(geometry.actorBands.every(({ right }) => right <= 0)).toBe(true);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-divine-sword-death-registration.png",
    fullPage: true,
  });
});

test("the common dust trail is drawn over the character channels", async ({ page }) => {
  // AD70 runs B3BD after every channel, so the fallen soldier's death dust,
  // which starts 40 px inside its body, covers the body instead of hiding
  // behind it.
  await page.goto(
    "/combat-lab.html?attacker=soldier&defender=soldier&reaction=hurt&death=1&side=left&speed=4",
  );
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.pause());
  const deathAt = (await labState(page)).marks
    .find(({ phase }) => phase === "fullDefenderDeath")?.t;
  expect(deathAt).toBeDefined();
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), deathAt! + 301);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await expect(page.locator(".full-combat-particles .full-combat-frame:not([hidden])"))
    .toHaveCount(3);
  await waitForVisibleSpriteImages(page);

  const coveredParticles = await page.evaluate(() => {
    // The presentation layer ignores the pointer; let the probe hit-test it.
    const probe = document.createElement("style");
    probe.textContent = ".combat-presentation, .combat-presentation * { pointer-events: auto !important; }";
    document.head.append(probe);
    const body = document.querySelector<HTMLElement>('[data-testid="full-victim-sprite"]')
      ?.getBoundingClientRect();
    if (!body) throw new Error("fallen soldier is missing");
    const results = Array.from(document.querySelectorAll<HTMLElement>(
      ".full-combat-particles .full-combat-frame:not([hidden])",
    )).flatMap((particle) => {
      const box = particle.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      if (x < body.left || x > body.right || y < body.top || y > body.bottom) return [];
      return [document.elementFromPoint(x, y) === particle];
    });
    probe.remove();
    return results;
  });
  expect(coveredParticles.length).toBeGreaterThan(0);
  expect(coveredParticles.every(Boolean)).toBe(true);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-dust-over-fallen-body.png",
    fullPage: true,
  });
});

test("an attacker keeps its main channel through the hold and while its target falls", async ({ page }) => {
  // Nonfatal: the great dragon knight's post-hit stream leaves the channel at
  // (-140, 127). AD51 redraws it there for the remaining nine hold draws,
  // 32 ms apart, with its X4 wing cycle, then the window stands still.
  await page.goto(
    "/combat-lab.html?attacker=great-dragon-knight&defender=soldier&reaction=hurt&side=left&speed=4",
  );
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.pause());
  const holdAt = (await labState(page)).marks.find(({ phase }) => phase === "fullHold")?.t;
  expect(holdAt).toBeDefined();
  const actor = page.getByTestId("full-actor-sprite");
  for (const [offset, frame] of [[1, "1"], [33, "2"], [65, "3"], [97, "4"], [600, "1"]] as const) {
    await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), holdAt! + offset);
    await expect(actor).toHaveAttribute("data-frame", frame);
    await expect(actor).toHaveAttribute("data-x", "-140");
    await expect(actor).toHaveAttribute("data-lift", "8");
  }
  await expect(page.locator(".full-combat-particles .full-combat-frame:not([hidden])"))
    .toHaveCount(0);
  await waitForVisibleSpriteImages(page);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-great-dragon-hold.png",
    fullPage: true,
  });

  // Fatal: B683/B6BD give the surviving head the still DS:7DAE poses, so it
  // stays on frame 0 at (490, 120), with its E336 shadow, while the soldier
  // falls.
  await page.goto(
    "/combat-lab.html?attacker=head&defender=soldier&reaction=hurt&death=1&side=right&speed=4",
  );
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.pause());
  const deathAt = (await labState(page)).marks
    .find(({ phase }) => phase === "fullDefenderDeath")?.t;
  expect(deathAt).toBeDefined();
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), deathAt! + 601);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await expect(actor).toHaveAttribute("data-side", "right");
  await expect(actor).toHaveAttribute("data-frame", "0");
  await expect(actor).toHaveAttribute("data-x", "490");
  await expect(actor).toHaveAttribute("data-lift", "15");
  await waitForVisibleSpriteImages(page);
  const survivor = await page.evaluate(() => {
    const scene = document.querySelector<HTMLElement>(".full-combat-scene")?.getBoundingClientRect();
    const image = document.querySelector<HTMLElement>('[data-testid="full-actor-sprite"]')
      ?.getBoundingClientRect();
    if (!scene || !image) throw new Error("survivor or scene is missing");
    const scale = scene.width / 448;
    return {
      imageLeft: Math.round((image.left - scene.left) / scale),
      bands: Array.from(document.querySelectorAll<HTMLElement>('[data-testid="full-actor-shadow"] > i'))
        .map((band) => ({ x: Number(band.dataset.x), y: Number(band.dataset.y) })),
    };
  });
  expect(survivor.imageLeft).toBeLessThan(448);
  expect(survivor.bands).toEqual([
    { x: survivor.imageLeft, y: 132 },
    { x: survivor.imageLeft - 8, y: 134 },
    { x: survivor.imageLeft, y: 136 },
  ]);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-head-survivor.png",
    fullPage: true,
  });
});

test("the jungle warrior dives under the ground clip and strikes from below it", async ({ page }) => {
  await page.goto(
    "/combat-lab.html?attacker=jungle-warrior&defender=soldier&reaction=hurt&side=left&speed=4",
  );
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.pause());
  const state = await labState(page);
  const startAt = state.marks.find(({ phase }) => phase === "fullWindup")?.t;
  const impactAt = state.marks.find(({ phase }) => phase === "fullImpact")?.t;
  expect(startAt).toBeDefined();
  expect(impactAt).toBeDefined();
  const actor = page.getByTestId("full-actor-sprite");
  // The frame-0 dive ends 120 px under the ground line, so the burrowing
  // frame 4 starts out wholly below the clip and climbs 8 px per substep.
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), startAt! + 761);
  await expect(actor).toHaveAttribute("data-frame", "4");
  await expect(actor).toHaveAttribute("data-lift", "-120");
  const buried = await actor.evaluate((image) => ({
    height: image.offsetHeight,
    clipped: Number(image.dataset.groundClippedRows),
  }));
  expect(buried.height).toBeGreaterThan(40);
  expect(buried.clipped).toBe(Math.min(buried.height, 120));
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), startAt! + 1_161);
  await expect(actor).toHaveAttribute("data-lift", "-40");
  await expect(actor).toHaveAttribute("data-ground-clipped-rows", "40");
  await waitForVisibleSpriteImages(page);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-jungle-warrior-burrow.png",
    fullPage: true,
  });
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! + 1);
  await expect(actor).toHaveAttribute("data-lift", "-8");
  await expect(actor).toHaveAttribute("data-ground-clipped-rows", "8");
});

test.describe.serial("native records sequential visual acceptance", () => {
  const records = [
    { record: 6, classId: "magician" },
    { record: 7, classId: "great-axe-warrior" },
    { record: 8, classId: "half-dragon-warrior" },
    { record: 9, classId: "magic-armor-warrior" },
    { record: 10, classId: "magic-guide" },
    { record: 11, classId: "evil-mage" },
    { record: 12, classId: "magic-archer" },
    { record: 13, classId: "land-knight" },
    { record: 14, classId: "demon-dragon-knight" },
    { record: 15, classId: "flying-dragon-knight" },
    { record: 16, classId: "beast-knight" },
    { record: 17, classId: "bone-knight" },
    { record: 18, classId: "swift-dragon-knight" },
    { record: 19, classId: "great-dragon-knight" },
    { record: 21, classId: "crossbow" },
    { record: 23, classId: "pegasus-warrior" },
    { record: 24, classId: "sister" },
    { record: 25, classId: "monk" },
    { record: 26, classId: "water-warrior" },
    { record: 27, classId: "divine-sword-warrior" },
    { record: 28, classId: "warrior" },
    { record: 29, classId: "steel-armor-warrior" },
    { record: 30, classId: "priest" },
    { record: 31, classId: "wizard" },
    { record: 32, classId: "magic-master" },
    { record: 33, classId: "evil-sword-warrior" },
    { record: 34, classId: "engineer" },
    { record: 35, classId: "empress", side: "right" },
    // 36–38 只在 side 2 编队出现（龍：场景 20/22；頭与两只手：场景 37），原版没有
    // side 1 表现块，也没有 `M_00/86..88`。实验室锁定右侧，验收只覆盖右侧。
    { record: 36, classId: "dragon", side: "right" },
    { record: 37, classId: "head", side: "right" },
    { record: 38, classId: "hand", side: "right" },
  ] as const;

  for (const entry of records) {
    const { record, classId } = entry;
    const side = "side" in entry ? entry.side : "left";
    test(`record ${record} ${classId} attack, guard, hurt and death`, async ({ page }) => {
      await page.goto(
        `/combat-lab.html?attacker=${classId}&defender=soldier&reaction=hurt&side=${side}&speed=4`,
      );
      await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.pause());
      const state = await labState(page);
      const impactAt = state.marks.find(({ phase }) => phase === "fullImpact")?.t;
      const holdAt = state.marks.find(({ phase }) => phase === "fullHold")?.t;
      expect(impactAt).toBeDefined();
      expect(holdAt).toBeDefined();

      await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! - 40);
      await expect(page.getByTestId("combat-lab-phase")).toHaveText("fullCharge");
      await waitForVisibleSpriteImages(page);
      await captureVisualAudit(page, {
        path: `artifacts/playwright/combat-lab-record-${String(record).padStart(2, "0")}-attack.png`,
        fullPage: true,
      });

      await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt!);
      await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
      await waitForVisibleSpriteImages(page);
      await captureVisualAudit(page, {
        path: `artifacts/playwright/combat-lab-record-${String(record).padStart(2, "0")}-hurt.png`,
        fullPage: true,
      });

      await page.getByTestId("combat-lab-reaction").selectOption("guard");
      await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! + 50);
      await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
      await waitForVisibleSpriteImages(page);
      await captureVisualAudit(page, {
        path: `artifacts/playwright/combat-lab-record-${String(record).padStart(2, "0")}-guard.png`,
        fullPage: true,
      });

      await page.getByTestId("combat-lab-reaction").selectOption("hurt");
      await page.getByTestId("combat-lab-death").check();
      await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), holdAt!);
      await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
      await waitForVisibleSpriteImages(page);
      await captureVisualAudit(page, {
        path: `artifacts/playwright/combat-lab-record-${String(record).padStart(2, "0")}-death.png`,
        fullPage: true,
      });
    });
  }
});

test("record 20 archer passes release, flight, guard, hurt and death visual gates", async ({ page }) => {
  await page.goto("/combat-lab.html?attacker=archer&defender=soldier&reaction=hurt&speed=4");
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.pause());
  const state = await labState(page);
  const releaseAt = state.marks.find(({ phase }) => phase === "fullCharge")?.t;
  const impactAt = state.marks.find(({ phase }) => phase === "fullImpact")?.t;
  const holdAt = state.marks.find(({ phase }) => phase === "fullHold")?.t;
  expect(releaseAt).toBeDefined();
  expect(impactAt).toBeDefined();
  expect(holdAt).toBeDefined();

  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), releaseAt! + 40);
  await expect(page.getByTestId("full-combat-projectile")).toBeVisible();
  await expect(page.getByTestId("full-combat-projectile"))
    .toHaveAttribute("data-frame-source", /left\/archer\/plus50\/05$/);
  await expect(page.getByTestId("full-combat-projectile"))
    .toHaveAttribute("data-top", "91");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-20-attack.png",
    fullPage: true,
  });

  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt!);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-20-hurt.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! + 50);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-20-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), holdAt!);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-20-death.png",
    fullPage: true,
  });
});

test("record 22 cavalry passes throw, flight, guard, hurt and death visual gates", async ({ page }) => {
  await page.goto("/combat-lab.html?attacker=cavalry&defender=soldier&reaction=hurt&speed=4");
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.pause());
  const state = await labState(page);
  const throwAt = state.marks.find(({ phase }) => phase === "fullCharge")?.t;
  const impactAt = state.marks.find(({ phase }) => phase === "fullImpact")?.t;
  const holdAt = state.marks.find(({ phase }) => phase === "fullHold")?.t;
  expect(throwAt).toBeDefined();
  expect(impactAt).toBeDefined();
  expect(holdAt).toBeDefined();

  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), throwAt!);
  await expect(page.locator(".full-combat-lance")).toBeVisible();
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-frame", "6");
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-top", "28");

  await page.evaluate(
    (time) => window.__ANGEL2_COMBAT_LAB__?.seek(time),
    (throwAt! + impactAt!) / 2,
  );
  await expect(page.locator(".full-combat-lance")).toBeVisible();
  await expect(page.locator(".full-combat-lance"))
    .toHaveAttribute("data-frame-source", /left\/cavalry\/plus50\/0[67]$/);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-22-attack.png",
    fullPage: true,
  });

  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt!);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-x", "245");
  // Contact returns the surviving G1 channel to the up-canted frame 6 and the
  // lance deflects out of the window instead of driving frame 8 into the floor.
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-frame", "6");
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-x", "260");
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-y", "118");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-22-hurt.png",
    fullPage: true,
  });

  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! + 100);
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-frame", "6");
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-x", "320");
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-y", "86");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-22-contact-follow-through.png",
    fullPage: true,
  });

  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! + 200);
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-x", "380");
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-y", "54");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-22-deflection-exit.png",
    fullPage: true,
  });

  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! + 250);
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-x", "410");
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! + 400);
  await expect(page.locator(".full-combat-lance")).toBeHidden();
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), holdAt!);
  await expect(page.locator(".full-combat-lance")).toBeHidden();

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! + 50);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-22-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), holdAt!);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-22-death.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-death").uncheck();
  await page.getByTestId("combat-lab-side").selectOption("right");
  const mirroredImpactAt = (await labState(page)).marks
    .find(({ phase }) => phase === "fullImpact")?.t;
  expect(mirroredImpactAt).toBeDefined();
  await page.evaluate(
    (time) => window.__ANGEL2_COMBAT_LAB__?.seek(time),
    mirroredImpactAt!,
  );
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-x", "255");
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-frame", "6");
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-x", "232");
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-record-22-mirrored-contact.png",
    fullPage: true,
  });

  await page.evaluate(
    (time) => window.__ANGEL2_COMBAT_LAB__?.seek(time),
    mirroredImpactAt! + 100,
  );
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-frame", "6");
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-x", "172");
  await expect(page.locator(".full-combat-lance")).toHaveAttribute("data-y", "86");
});

for (const side of ["left", "right"] as const) {
  test(`record 21 crossbow lands its ${side} bolt on the target instead of below the floor`, async ({ page }) => {
    await page.goto(
      `/combat-lab.html?attacker=crossbow&defender=soldier&reaction=hurt&side=${side}&speed=4`,
    );
    await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.pause());
    const impactAt = (await labState(page)).marks.find(({ phase }) => phase === "fullImpact")?.t;
    expect(impactAt).toBeDefined();
    const actor = page.getByTestId("full-actor-sprite");

    // Mid-descent the giant bolt is still overhead: its bitmap bottom has not
    // reached the ground line yet.
    await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! - 200);
    await expect(actor).toHaveAttribute("data-frame", "4");
    await expect(actor).toHaveAttribute("data-lift", "115");

    // `:S` y=120 is a battle-window bottom anchor, so the last descent substep
    // sits 15 px above the y=135 ground line. The old ground-relative reading
    // buried it 120 px under the floor.
    await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! - 40);
    await expect(actor).toHaveAttribute("data-frame", "4");
    await expect(actor).toHaveAttribute("data-lift", "15");

    // Nothing rewinds the channel between streams: the landed frame 5 starts
    // from the descent's accumulator, one dy=+25 step past the last drawn
    // y=120, so the lower ten rows of its dirt splash fall under the clip.
    await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt!);
    await expect(actor).toHaveAttribute("data-frame", "5");
    await expect(actor).toHaveAttribute("data-lift", "-10");
    await expect(actor).toHaveAttribute("data-ground-clipped-rows", "10");
    await expect(actor).toHaveAttribute("data-x", side === "left" ? "266" : "216");
    await expect(page.getByTestId("full-victim-sprite"))
      .toHaveAttribute("data-x", "250");

    await waitForVisibleSpriteImages(page);
    const contact = await page.evaluate(() => {
      const box = (selector: string) => {
        const image = document.querySelector<HTMLElement>(`${selector} .full-combat-frame`);
        if (!image) throw new Error(`${selector} is not rendered`);
        return image.getBoundingClientRect();
      };
      const sceneBox = document.querySelector(".full-combat-scene")!.getBoundingClientRect();
      const bolt = box(".full-combat-sprite.slot-actor");
      const victim = box(".full-combat-sprite.slot-victim");
      const scale = sceneBox.width / 448;
      return {
        overlap: (Math.min(bolt.right, victim.right) - Math.max(bolt.left, victim.left)) / scale,
        boltBottom: (bolt.bottom - sceneBox.top) / scale,
        sceneHeight: sceneBox.height / scale,
      };
    });
    // The bolt has to be inside the window and overlapping the target bitmap.
    expect(contact.boltBottom).toBeLessThan(contact.sceneHeight);
    expect(contact.overlap).toBeGreaterThan(0);

    await captureVisualAudit(page, {
      path: `artifacts/playwright/combat-lab-record-21-${side}-grounded-impact.png`,
      fullPage: true,
    });
  });
}

test("combat lab outcome shortcuts preserve the selected classes and editable life", async ({ page }) => {
  await page.goto("/combat-lab.html?speed=4");
  await expect(page.getByRole("heading", { name: "戰鬥動畫實驗室" })).toBeVisible();
  await expect(page.getByTestId("combat-lab-screen")).toBeVisible();
  await expect(page.getByTestId("combat-lab-speed")).toHaveValue("4");
  await expect(page.getByTestId("combat-lab-attacker-life")).toHaveValue("240");
  await expect(page.getByTestId("combat-lab-defender-life")).toHaveValue("220");

  await page.getByTestId("combat-lab-defender").selectOption("warrior");
  await expect(page.getByTestId("combat-lab-defender-life")).toHaveValue("240");
  await page.getByRole("button", { name: "重傷（24）" }).click();
  await waitForVictim(page, "warrior", "hurt", 1);
  await expect(page.getByTestId("full-victim-sprite"))
    .toHaveAttribute("data-frame-source", /right\/warrior\/direct\/01$/);
  await expect(page.getByTestId("combat-lab-phase")).toHaveText("fullImpact");
  await expect(page.getByRole("button", { name: "重傷（24）" }))
    .toHaveAttribute("aria-pressed", "true");
  expect((await labState(page)).config).toMatchObject({
    attackerClass: "warrior",
    defenderClass: "warrior",
    attackerLife: 240,
    defenderLife: 240,
    reaction: "hurt",
    death: false,
  });
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-warrior-hurt.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "死亡（當前生命）" }).click();
  await waitForVictim(page, "warrior", "death", 2);
  await expect(page.getByTestId("full-victim-sprite"))
    .toHaveAttribute("data-frame-source", /right\/warrior\/direct\/02$/);
  await expect(page.getByTestId("combat-lab-phase")).toHaveText("fullDefenderDeath");
  await expect(page.getByTestId("combat-lab-reaction")).toBeDisabled();
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-warrior-death.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-defender").selectOption("archer");
  await page.getByTestId("combat-lab-defender-life").fill("420");
  await page.getByTestId("combat-lab-defender-life").press("Enter");
  await page.getByRole("button", { name: "重傷（24）" }).click();
  await waitForVictim(page, "archer", "hurt", 1);
  await expect(page.getByTestId("full-victim-sprite"))
    .toHaveAttribute("data-frame-source", /right\/archer\/direct\/01$/);
  expect((await labState(page)).config).toMatchObject({
    attackerClass: "warrior",
    defenderClass: "archer",
    defenderLife: 420,
  });
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-archer-hurt.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "死亡（當前生命）" }).click();
  await waitForVictim(page, "archer", "death", 2);
  await expect(page.getByTestId("full-victim-sprite"))
    .toHaveAttribute("data-frame-source", /right\/archer\/direct\/02$/);
  await expect(page.getByTestId("full-right-life-gauge")).toHaveAttribute("data-life", "0");
  await expect(page).toHaveURL(/defender=archer.*reaction=hurt.*death=1/);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-archer-death.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 520, height: 900 });
  await expect(page.getByTestId("combat-lab-attacker-life")).toBeVisible();
  await expect(page.getByTestId("combat-lab-defender-life")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await captureVisualAudit(page, {
    path: "artifacts/playwright/combat-lab-controls-narrow.png",
    fullPage: true,
  });
});

test("combat lab controls direction, guard branch, pause and semantic timeline jumps", async ({ page }) => {
  await page.goto("/combat-lab.html?speed=4");
  await page.getByTestId("combat-lab-defender").selectOption("sister");
  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.getByTestId("combat-lab-side").selectOption("right");

  await page.waitForFunction(() => {
    const state = window.__ANGEL2_COMBAT_LAB__?.getState();
    return state?.config.defenderClass === "sister"
      && state.config.side === "right"
      && state.victimReaction === "guard"
      && state.victimFrame === 3;
  });
  await expect(page.getByTestId("full-victim-sprite"))
    .toHaveAttribute("data-frame-source", /left\/sister\/direct\/03$/);

  await page.getByTestId("combat-lab-toggle").click();
  expect((await labState(page)).playing).toBe(false);
  const pausedAt = (await labState(page)).t;
  await page.getByRole("button", { name: "下一節點" }).click();
  const jumped = await labState(page);
  expect(jumped.playing).toBe(false);
  expect(jumped.t).toBeGreaterThan(pausedAt);
  await expect(page.getByTestId("combat-lab-timeline")).toHaveValue(String(Math.round(jumped.t)));
});
