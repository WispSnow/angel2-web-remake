import { expect, test, type Page } from "@playwright/test";
import { captureVisualAudit } from "./visual-audit";

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
  const observed: Array<{
    side: "left" | "right";
    nativeYOffset: string | null;
    correction: string | null;
    projectedYOffset: string | null;
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
      correction: image.getAttribute("data-y-offset-correction"),
      projectedYOffset: image.getAttribute("data-projected-y-offset"),
    })));
  }

  expect(observed).toEqual([
    { side: "right", nativeYOffset: "-16", correction: "16", projectedYOffset: "0" },
    { side: "left", nativeYOffset: "-16", correction: "16", projectedYOffset: "0" },
  ]);
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
    // and the landed frame 5 both sit 15 px above the y=135 ground line. The
    // old ground-relative reading buried them 120 px under the floor.
    await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! - 40);
    await expect(actor).toHaveAttribute("data-frame", "4");
    await expect(actor).toHaveAttribute("data-lift", "15");

    await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt!);
    await expect(actor).toHaveAttribute("data-frame", "5");
    await expect(actor).toHaveAttribute("data-lift", "15");
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
