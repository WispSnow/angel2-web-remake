import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

interface CombatLabState {
  config: {
    attackerClass: string;
    defenderClass: string;
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
    const image = holder.querySelector("img");
    return image?.complete === true && image.naturalWidth > 0;
  });
});

test.beforeAll(() => mkdirSync("artifacts/playwright", { recursive: true }));

test("record 0 soldier passes attack, guard, hurt and death visual gates", async ({ page }) => {
  await page.goto("/combat-lab.html?attacker=soldier&defender=soldier&reaction=hurt&speed=4");

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_500));
  await expect(page.getByTestId("full-actor-sprite"))
    .toHaveAttribute("src", /left-soldier-plus50\/0[45]\.png$/);
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-00-attack.png",
    fullPage: true,
  });

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_060));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-00-hurt.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_100));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-00-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_460));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-00-death.png",
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
    .toHaveAttribute("src", /left-magic-sword-warrior-plus50\/00\.png$/);
  await expect(page.getByTestId("full-effect-G1-sprite"))
    .toHaveAttribute("src", /left-magic-sword-warrior-plus50\/03\.png$/);
  await expect(page.getByTestId("full-effect-G1-sprite")).toHaveAttribute("data-channel", "G1");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-01-attack.png",
    fullPage: true,
  });

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_760));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await expect(page.getByTestId("full-effect-G1-sprite"))
    .toHaveAttribute("src", /left-magic-sword-warrior-plus50\/07\.png$/);
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-01-hurt.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_800));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await expect(page.getByTestId("full-effect-G1-sprite"))
    .toHaveAttribute("src", /left-magic-sword-warrior-plus50\/04\.png$/);
  await expect(page.getByTestId("full-effect-G1-sprite"))
    .toHaveAttribute("data-y-offset", "-18");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-01-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_460));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await expect(page.getByTestId("full-victim-sprite"))
    .toHaveAttribute("src", /right-soldier-direct\/02\.png$/);
  await page.screenshot({
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
  const particles = page.locator(".full-combat-particles img:not([hidden])");
  await expect(particles).toHaveCount(3);
  expect(await particles.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-frame"))))
    .toEqual(["1", "3", "5"]);
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_400));
  await expect(page.getByTestId("full-actor-sprite"))
    .toHaveAttribute("src", /left-jungle-warrior-plus50\/04\.png$/);
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-02-attack.png",
    fullPage: true,
  });

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_320));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-02-hurt.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_370));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-02-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_770));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await page.screenshot({
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
    .toHaveAttribute("src", /left-magic-priest-plus50\/01\.png$/);
  await expect(page.getByTestId("full-effect-G1-sprite"))
    .toHaveAttribute("src", /left-magic-priest-plus50\/02\.png$/);
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-03-attack.png",
    fullPage: true,
  });

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_400));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-03-hurt.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_450));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-03-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_200));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await page.screenshot({
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
    .toHaveAttribute("src", /left-prayer-guide-plus50\/02\.png$/);
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-04-attack.png",
    fullPage: true,
  });

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_480));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-04-hurt.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_530));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-04-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_180));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await page.screenshot({
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
    .toHaveAttribute("src", /left-curse-master-plus50\/05\.png$/);
  await expect(page.getByTestId("full-effect-G1-sprite"))
    .toHaveAttribute("src", /left-curse-master-plus50\/06\.png$/);
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-05-attack.png",
    fullPage: true,
  });

  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_720));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await expect(page.getByTestId("full-effect-G1-sprite")).toBeHidden();
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-05-hurt.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(1_770));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-05-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate(() => window.__ANGEL2_COMBAT_LAB__?.seek(2_520));
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-05-death.png",
    fullPage: true,
  });
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
      await page.screenshot({
        path: `artifacts/playwright/combat-lab-record-${String(record).padStart(2, "0")}-attack.png`,
        fullPage: true,
      });

      await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt!);
      await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
      await waitForVisibleSpriteImages(page);
      await page.screenshot({
        path: `artifacts/playwright/combat-lab-record-${String(record).padStart(2, "0")}-hurt.png`,
        fullPage: true,
      });

      await page.getByTestId("combat-lab-reaction").selectOption("guard");
      await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! + 50);
      await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
      await waitForVisibleSpriteImages(page);
      await page.screenshot({
        path: `artifacts/playwright/combat-lab-record-${String(record).padStart(2, "0")}-guard.png`,
        fullPage: true,
      });

      await page.getByTestId("combat-lab-reaction").selectOption("hurt");
      await page.getByTestId("combat-lab-death").check();
      await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), holdAt!);
      await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
      await waitForVisibleSpriteImages(page);
      await page.screenshot({
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
    .toHaveAttribute("src", /left-archer-plus50\/05\.png$/);
  await expect(page.getByTestId("full-combat-projectile"))
    .toHaveAttribute("data-top", "91");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-20-attack.png",
    fullPage: true,
  });

  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt!);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-20-hurt.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! + 50);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-20-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), holdAt!);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await page.screenshot({
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

  await page.evaluate(
    (time) => window.__ANGEL2_COMBAT_LAB__?.seek(time),
    (throwAt! + impactAt!) / 2,
  );
  await expect(page.locator(".full-combat-lance")).toBeVisible();
  await expect(page.locator(".full-combat-lance"))
    .toHaveAttribute("src", /left-cavalry-plus50\/0[67]\.png$/);
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-22-attack.png",
    fullPage: true,
  });

  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt!);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "hurt");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-22-hurt.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("guard");
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), impactAt! + 50);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "guard");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-22-guard.png",
    fullPage: true,
  });

  await page.getByTestId("combat-lab-reaction").selectOption("hurt");
  await page.getByTestId("combat-lab-death").check();
  await page.evaluate((time) => window.__ANGEL2_COMBAT_LAB__?.seek(time), holdAt!);
  await expect(page.getByTestId("full-victim-sprite")).toHaveAttribute("data-reaction", "death");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-record-22-death.png",
    fullPage: true,
  });
});

test("combat lab directly covers warrior and archer hurt/death presentations", async ({ page }) => {
  await page.goto("/combat-lab.html?speed=4");
  await expect(page.getByRole("heading", { name: "戰鬥動畫實驗室" })).toBeVisible();
  await expect(page.getByTestId("combat-lab-screen")).toBeVisible();
  await expect(page.getByTestId("combat-lab-speed")).toHaveValue("4");

  await page.getByRole("button", { name: "戰士重傷" }).click();
  await waitForVictim(page, "warrior", "hurt", 1);
  await expect(page.getByTestId("full-victim-sprite"))
    .toHaveAttribute("src", /right-warrior-direct\/01\.png$/);
  await expect(page.getByTestId("combat-lab-phase")).toHaveText("fullImpact");
  expect((await labState(page)).config).toMatchObject({
    attackerClass: "soldier",
    defenderClass: "warrior",
    reaction: "hurt",
    death: false,
  });
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-warrior-hurt.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "戰士死亡" }).click();
  await waitForVictim(page, "warrior", "death", 2);
  await expect(page.getByTestId("full-victim-sprite"))
    .toHaveAttribute("src", /right-warrior-direct\/02\.png$/);
  await expect(page.getByTestId("combat-lab-phase")).toHaveText("fullDefenderDeath");
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-warrior-death.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "弓兵重傷" }).click();
  await waitForVictim(page, "archer", "hurt", 1);
  await expect(page.getByTestId("full-victim-sprite"))
    .toHaveAttribute("src", /right-archer-direct\/01\.png$/);
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-archer-hurt.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "弓兵死亡" }).click();
  await waitForVictim(page, "archer", "death", 2);
  await expect(page.getByTestId("full-victim-sprite"))
    .toHaveAttribute("src", /right-archer-direct\/02\.png$/);
  await expect(page).toHaveURL(/defender=archer.*reaction=hurt.*death=1/);
  await page.screenshot({
    path: "artifacts/playwright/combat-lab-archer-death.png",
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
    .toHaveAttribute("src", /left-sister-direct\/03\.png$/);

  await page.getByTestId("combat-lab-toggle").click();
  expect((await labState(page)).playing).toBe(false);
  const pausedAt = (await labState(page)).t;
  await page.getByRole("button", { name: "下一節點" }).click();
  const jumped = await labState(page);
  expect(jumped.playing).toBe(false);
  expect(jumped.t).toBeGreaterThan(pausedAt);
  await expect(page.getByTestId("combat-lab-timeline")).toHaveValue(String(Math.round(jumped.t)));
});
