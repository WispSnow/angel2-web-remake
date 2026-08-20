import { expect, test, type Page } from "@playwright/test";
import { stage3TerrainSlotAt } from "../../src/game/content/stage3";
import { skipStoryDialogue } from "./dialogue-controls";
import { captureVisualAudit } from "./visual-audit";

const ARTIFACT_DIR = "artifacts/playwright";

interface Stage3State {
  stageId: string;
  phase: string;
  round: number;
  focusId: string;
  actionMode: string;
  activeStoryId?: string;
  campaignRoute?: string;
  groupLeaderId?: string;
  groupCommandDialogueId?: string;
  statusMessage: string;
  cursor: { x: number; y: number };
  cameraOrigin: { x: number; y: number };
  rngCalls: number;
  movementPresentation?: {
    unitId: string;
    kind: string;
    path: Array<{ x: number; y: number }>;
  };
  audioCueLog: Array<{ group: string; record: number; reason: string }>;
  specialActionPresentation?: { phase: string; frame: number };
  lastSpecialAction?: {
    actionId: string;
    healing: number;
    experienceGained: number;
    affectedUnits: Array<{ unitId: string; healing: number; blocked: boolean }>;
  };
  units: Array<{
    id: string;
    side: number;
    slot: number;
    classId: string;
    name: string;
    x: number;
    y: number;
    life: number;
    experience: number;
    acted: boolean;
  }>;
}

interface Stage3PromotionState {
  promotionUnitIds: string[];
  promotionDialogueIndex?: number;
  promotionTargets: Array<{ id: string }>;
}

const state = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage3State,
);

const promotionState = (page: Page) => page.evaluate(
  () => window.__ANGEL2__?.getState() as Stage3PromotionState,
);

const waitForPhase = (page: Page, phase: string) => page.waitForFunction(
  (expected) => (window.__ANGEL2__?.getState() as Stage3State | undefined)?.phase === expected,
  phase,
);

/**
 * REMAKE-109 hands 愛歐里雅／黛西／蕾奇蒂特 their last experience point in a
 * stage-opening event, so stage 3 stops for three grants before the player may act.
 * Board order, and the order every stage-3 flow below has to clear.
 */
const JOINING_PROMOTION_IDS = ["1:21", "1:3", "1:20"];

/** Grants every queued promotion in board order and reports whom it promoted. */
async function grantPendingPromotions(page: Page): Promise<string[]> {
  const promoted: string[] = [];
  for (;;) {
    const current = await promotionState(page);
    const unitId = current.promotionUnitIds[0];
    if (unitId === undefined) return promoted;
    if (current.promotionDialogueIndex !== undefined) {
      // Page through the 授职 lines by state rather than by clicking the layer:
      // the layer hides the moment the last page turns, so a click can race it.
      // The player-visible path is covered by S03-P and the grantor case below.
      await page.evaluate(() => window.__ANGEL2__?.advanceDialogue());
      continue;
    }
    const target = current.promotionTargets[0];
    if (!target) throw new Error(`${unitId} reached the promotion prompt without candidates`);
    await page.getByTestId(`promotion-target-${target.id}`).click();
    promoted.push(unitId);
  }
}

/** Waits for `phase`, granting every promotion the flow stops for on the way there. */
async function waitForPhaseThroughPromotions(page: Page, phase: string): Promise<string[]> {
  const promoted: string[] = [];
  for (;;) {
    const stop = await page.waitForFunction((expected) => {
      const current = window.__ANGEL2__?.getState() as
        (Stage3State & Stage3PromotionState) | undefined;
      if (!current) return undefined;
      // A pending grant always wins: the pause leaves `phase` untouched, so
      // checking the phase first would walk past an open promotion modal.
      if (current.promotionUnitIds.length > 0) return "promotion";
      return current.phase === expected ? "phase" : undefined;
    }, phase).then((handle) => handle.jsonValue());
    if (stop === "phase") return promoted;
    promoted.push(...await grantPendingPromotions(page));
  }
}

/**
 * Opens a stage-3 debug scenario and clears the opening grants, leaving the board
 * exactly where a player reaches it: player phase, three professions chosen.
 */
async function openStage3(page: Page, query: string): Promise<string[]> {
  await page.goto(`/?debugScenario=${query}`);
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  // 只等阶段会和 `enter-player-phase` 抢跑——那一步先于发放。等经验真的发下去，
  // 授职队列才一定已经排好。
  await page.waitForFunction((ids) => {
    const current = window.__ANGEL2__?.getState() as
      { units: Array<{ id: string; classId: string; experience: number }> } | undefined;
    if (!current) return false;
    const present = current.units.filter(({ id }) => ids.includes(id));
    return present.length > 0
      && present.every(({ classId, experience }) => !(classId === "soldier" && experience === 299));
  }, JOINING_PROMOTION_IDS);
  return grantPendingPromotions(page);
}

/** Walks the cursor with the arrow keys, which is what the HUD checks exercise. */
async function moveCursorTo(page: Page, x: number, y: number): Promise<void> {
  const { cursor } = await state(page);
  for (let step = 0; step < Math.abs(y - cursor.y); step += 1) {
    await page.keyboard.press(y < cursor.y ? "ArrowUp" : "ArrowDown");
  }
  for (let step = 0; step < Math.abs(x - cursor.x); step += 1) {
    await page.keyboard.press(x < cursor.x ? "ArrowLeft" : "ArrowRight");
  }
}

async function clickUnit(page: Page, id: string): Promise<void> {
  let current = await state(page);
  const unit = current.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`missing unit ${id}`);
  // 授职会把镜头带到别处，目标可能已经在 10×7 视口之外——先用方向键把它带回来，
  // 否则按镜头换算出的点击点会落在画布外面。
  const visible = unit.x >= current.cameraOrigin.x && unit.x <= current.cameraOrigin.x + 9
    && unit.y >= current.cameraOrigin.y && unit.y <= current.cameraOrigin.y + 6;
  if (!visible) {
    await moveCursorTo(page, unit.x, unit.y);
    current = await state(page);
  }
  await page.getByTestId("battle-canvas").click({
    position: {
      x: 40 + (unit.x - current.cameraOrigin.x) * 40 + 20,
      y: 23 + (unit.y - current.cameraOrigin.y) * 44 + 22,
    },
  });
}

test("S03-A/B/C/J: stage 3 boots from evidence content with the corrected objective", async ({ page }) => {
  await page.goto("/?debugScenario=stage-03-prebattle&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await expect(page.getByTestId("game-screen"))
    .toHaveAttribute("aria-label", "天使帝國 II 救援友軍遊戲畫面");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "12");
  expect(await state(page)).toMatchObject({
    stageId: "stage-03",
    phase: "openingStory",
    activeStoryId: "stage-03-opening-story",
  });
  expect((await state(page)).units).toHaveLength(25);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage3-opening-story.png`,
  });

  await skipStoryDialogue(page);
  // REMAKE-109: 开场剧情结束后先授职，三名第四军团成员选完才交还战场。
  expect(await waitForPhaseThroughPromotions(page, "player")).toEqual(JOINING_PROMOTION_IDS);
  await page.keyboard.press("o");
  // REMAKE-051: the machine victory slot is side-2 slot 17, whose enemy actor is
  // 梅蒂. The earlier 莎 came from quoting the wrong SAY record.
  await expect(page.getByTestId("objective-panel")).toContainText("打敗敵將領「梅蒂」");
  await expect(page.getByTestId("objective-panel")).toContainText("「希蜜」或「黛西」戰敗");
  await expect(page.getByTestId("objective-panel")).not.toContainText("莎");
  await captureVisualAudit(page.getByTestId("objective-panel"), {
    path: `${ARTIFACT_DIR}/stage3-corrected-objective.png`,
  });
  await page.locator("[data-action=close-objectives]").click();

  // 愛歐里雅 `(30,15)`：授职把焦点移动过，所以按绝对坐标走，不按固定步数。
  await moveCursorTo(page, 30, 15);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("unit-control-summary")).toHaveCount(0);
  await expect(page.getByTestId("unit-tactic")).toHaveText("友軍・戰術固守防區");
  await expect(page.getByTestId("unit-force")).toHaveCount(0);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage3-auto-ally-hud.png`,
  });

  await page.keyboard.press("Escape");
  await moveCursorTo(page, 30, 13);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("unit-control-summary")).toHaveCount(0);
  await expect(page.getByTestId("unit-tactic")).toHaveText("戰術壓制第四軍團");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage3-tactical-unit-hud.png`,
  });

  await page.keyboard.press("Escape");
  await moveCursorTo(page, 33, 20);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("unit-tactic")).toHaveText("戰術阻擊救援隊");
  const [tacticLabelColor, tacticValueColor, tacticGap] = await Promise.all([
    page.getByTestId("unit-tactic-label").evaluate((element) => getComputedStyle(element).color),
    page.getByTestId("unit-tactic-value").evaluate((element) => getComputedStyle(element).color),
    page.locator(".selected-unit-tactic-pair").evaluate((element) => getComputedStyle(element).gap),
  ]);
  expect(tacticLabelColor).not.toBe(tacticValueColor);
  expect(tacticGap).toBe("6px");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage3-tactic-label-value-contrast.png`,
  });
});

test("S03-F/G: monk recovery exposes the native menu and marks only allies inside its effect diamond", async ({ page }) => {
  await openStage3(page, "stage-03-player&difficulty=0&test=1");
  await page.evaluate(() => window.__ANGEL2__?.forceClassActionSetup("monk"));
  const setup = await state(page);
  const actor = setup.units.find(({ side, classId, x, y }) =>
    side === 1 && classId === "monk" && x === 29 && y === 26);
  const target = setup.units.find(({ side, id, x, y }) =>
    side === 1 && id !== actor?.id && x === 31 && y === 26);
  if (!actor || !target) throw new Error("missing recovery fixture units");

  await clickUnit(page, actor.id);
  await page.getByTestId("unit-command-technique").click();
  await expect(page.getByTestId("technique-heal-1")).toHaveText("初級治療");
  await expect(page.getByTestId("technique-recovery-1")).toHaveText("初級回復");
  await page.getByTestId("technique-recovery-1").click();
  await clickUnit(page, target.id);

  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='battle-canvas']");
    return canvas?.dataset.mapCombatPhase === "recoveryEffect"
      && Number(canvas.dataset.mapCombatFrame) >= 3
      && Number(canvas.dataset.mapCombatEffectTileCount) === 2;
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage3-recovery-effect.png`,
  });
  await page.waitForFunction(() => {
    const current = window.__ANGEL2__?.getState() as Stage3State | undefined;
    return current?.lastSpecialAction?.actionId === "recovery-1"
      && current.specialActionPresentation === undefined;
  });
  const result = await state(page);
  expect(result.lastSpecialAction).toMatchObject({ actionId: "recovery-1" });
  expect(result.lastSpecialAction!.healing).toBeGreaterThan(0);
  expect(result.audioCueLog).toContainEqual(expect.objectContaining({
    group: "e",
    record: 36,
    reason: "recovery-1-start",
  }));
});

test("S03-D/E/H/I: Meidi's defeat plays SAY/13 once and enters stage 4", async ({ page }) => {
  await openStage3(page, "stage-03-near-victory&difficulty=0&test=1");
  const commander = (await state(page)).units.find(({ side, acted }) => side === 1 && !acted);
  if (!commander) throw new Error("missing stage-3 victory commander");
  await clickUnit(page, commander.id);
  await page.getByTestId("unit-command-attack").click();
  // The finishing blow can push Himi over a promotion threshold, and REMAKE-109
  // parks the fourth corps on one from the start. Both modals only appear after
  // the battle presentation finishes, so wait on state rather than visibility —
  // polling isVisible() right after the click raced the animation.
  await waitForPhaseThroughPromotions(page, "victoryStory");
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "13");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("由於希蜜等人的幫助");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage3-victory-story.png`,
  });

  await skipStoryDialogue(page);
  await page.getByTestId("victory-continue").click();
  await page.getByTestId("victory-continue").click();
  await page.locator("[data-action=save-no]").click();
  await waitForPhase(page, "prebattleStory");
  expect(await state(page)).toMatchObject({
    stageId: "stage-04",
    campaignRoute: "stage-04",
    activeStoryId: "stage-04-prebattle-story",
  });
  await expect(page.getByTestId("dialogue-layer")).toHaveAttribute("data-source-record", "7");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage3-to-stage4-prebattle.png`,
  });
});

test("S03-F: debug fixtures prove that either protected commander triggers defeat", async ({ page }) => {
  for (const [scenarioId, removedId, survivingId] of [
    ["stage-03-himi-defeat", "1:1", "1:3"],
    ["stage-03-daisy-defeat", "1:3", "1:1"],
  ] as const) {
    await page.goto(`/?debugScenario=${scenarioId}&difficulty=0&test=1`);
    await expect(page.getByTestId("battle-canvas")).toBeVisible();
    await waitForPhase(page, "defeat");
    const current = await state(page);
    expect(current.units.some(({ id }) => id === removedId)).toBe(false);
    expect(current.units.some(({ id }) => id === survivingId)).toBe(true);
    await expect(page.locator("#status-strip")).toHaveText("「希蜜」或「黛西」戰敗");
    await expect(page.getByTestId("feedback-text")).toContainText("竟然失敗了");
  }
});

test("stage 3 group commands use Himi as the fixed commander while Nia is absent", async ({ page }) => {
  await openStage3(page, "stage-03-player&difficulty=0&test=1");
  await page.keyboard.press("g");
  await expect(page.getByTestId("group-command-followLeader")).toBeEnabled();
  expect((await state(page)).groupLeaderId).toBe("1:1");
  await page.getByTestId("group-command-allRest").click();
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("希蜜");
  await expect(page.getByTestId("dialogue-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "45");
  await expect(page.getByTestId("dialogue-layer"))
    .toHaveAttribute("data-source-address", "DS:86E4");
});

test("S03-N/O: free action hands off player units first and round two still follows Himi", async ({ page }) => {
  await openStage3(page, "stage-03-player&difficulty=0&test=1");
  await page.evaluate(() => {
    const traceHost = window as typeof window & {
      __stage3HandoffTimer?: number;
      __stage3HandoffTrace?: Array<{ unitId?: string; statusMessage: string }>;
    };
    traceHost.__stage3HandoffTrace = [];
    traceHost.__stage3HandoffTimer = window.setInterval(() => {
      const current = window.__ANGEL2__?.getState() as Stage3State | undefined;
      if (!current) return;
      const sample = {
        unitId: current.movementPresentation?.unitId,
        statusMessage: current.statusMessage,
      };
      const prior = traceHost.__stage3HandoffTrace?.at(-1);
      if (prior?.unitId === sample.unitId && prior.statusMessage === sample.statusMessage) return;
      traceHost.__stage3HandoffTrace?.push(sample);
    }, 20);
  });
  await page.keyboard.press("F3");
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("希蜜");
  await page.getByTestId("dialogue-layer").click();
  await page.waitForFunction(() => {
    const playerUnitIds = new Set(["1:40", "1:41", "1:42", "1:43", "1:1", "1:4"]);
    const traceHost = window as typeof window & {
      __stage3HandoffTrace?: Array<{ unitId?: string; statusMessage: string }>;
    };
    return traceHost.__stage3HandoffTrace?.some(({ unitId }) => playerUnitIds.has(unitId ?? ""));
  });
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage3-player-group-handoff.png`,
  });

  await waitForPhaseThroughPromotions(page, "enemy");
  // E/14 is also the full-combat charge cue, so walk cues are identified by the
  // "movement" reason that routes them to the 移動 category, not by record alone.
  const walkCuesBeforeEnemyPhase = (await state(page)).audioCueLog
    .filter(({ record, reason }) => record === 14 && reason.includes("movement"));
  const handoffTrace = await page.evaluate(() => {
    const traceHost = window as typeof window & {
      __stage3HandoffTimer?: number;
      __stage3HandoffTrace?: Array<{ unitId?: string; statusMessage: string }>;
    };
    if (traceHost.__stage3HandoffTimer !== undefined) {
      window.clearInterval(traceHost.__stage3HandoffTimer);
    }
    return traceHost.__stage3HandoffTrace ?? [];
  });
  const playerHandoffIndex = handoffTrace.findIndex(({ unitId }) =>
    ["1:40", "1:41", "1:42", "1:43", "1:1", "1:4"].includes(unitId ?? ""));
  const independentNpcIndex = handoffTrace.findIndex(({ statusMessage }) =>
    statusMessage.includes("友軍 NPC 軍團") && statusMessage.includes("獨立行動"));
  expect(playerHandoffIndex).toBeGreaterThanOrEqual(0);
  expect(independentNpcIndex).toBeGreaterThan(playerHandoffIndex);
  await waitForPhaseThroughPromotions(page, "player");
  const afterEnemyPhase = await state(page);
  expect(afterEnemyPhase.round).toBe(2);
  // The allied automatic phase that just ran proves walk cues are reachable
  // here, so the enemy-phase assertion below cannot pass vacuously.
  expect(walkCuesBeforeEnemyPhase.filter(({ reason }) => reason === "ally-auto-movement").length)
    .toBeGreaterThan(0);
  // REMAKE-106: side 2 walks share the native playback function with the player
  // command and do request E/14 in the original, but the remake keeps the enemy
  // phase silent so the walk sound only marks the player's own side.
  expect(afterEnemyPhase.audioCueLog.filter(
    ({ record, reason }) => record === 14 && reason.includes("movement"),
  )).toEqual(walkCuesBeforeEnemyPhase);
  await page.keyboard.press("g");
  await expect(page.getByTestId("group-command-followLeader")).toBeEnabled();
  expect((await state(page)).groupLeaderId).toBe("1:1");
  await page.getByTestId("group-command-followLeader").click();
  await expect(page.getByTestId("dialogue-window-upper")).toContainText("希蜜");
  await expect(page.getByTestId("dialogue-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "45");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage3-round2-himi-group-commander.png`,
  });
});

test("S03-C/L: hard-mode automatic allies finish their first phase inside the defense area", async ({ page }) => {
  await openStage3(page, "stage-03-player&difficulty=3&test=1");
  await page.keyboard.press("g");
  await page.getByTestId("group-command-allRest").click();
  await page.getByTestId("dialogue-layer").click();
  await waitForPhaseThroughPromotions(page, "enemy");

  const current = await state(page);
  const automaticIds = new Set(["1:21", "1:46", "1:45", "1:47", "1:3", "1:20", "1:50"]);
  const automaticAllies = current.units.filter(({ id }) => automaticIds.has(id));
  expect(automaticAllies).toHaveLength(7);
  for (const unit of automaticAllies) {
    expect([3, 5], `${unit.id} should remain in forest or mountain`)
      .toContain(stage3TerrainSlotAt(unit));
  }
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage3-defensive-allies-hard.png`,
  });
});

test("S03-P: the rescued fourth corps promotes before round one opens", async ({ page }) => {
  await page.goto("/?debugScenario=stage-03-prebattle&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  const opening = await state(page);
  // 三人以未转职士兵登场，只差 1 点经验，跟原版名单基线一致。
  for (const id of JOINING_PROMOTION_IDS) {
    expect(opening.units.find((unit) => unit.id === id)?.classId, `${id} enters as a soldier`)
      .toBe("soldier");
  }

  await skipStoryDialogue(page);
  // REMAKE-109：开场剧情之后、玩家第一次行动之前就发放那 1 点经验并弹出授职。
  await expect(page.getByTestId("dialogue-layer"))
    .toHaveAttribute("data-source-record", "promotion");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("愛歐里雅");
  expect((await state(page)).round).toBe(1);
  // 自动友军同样走「队友请求 → 主将授职」分支，妮雅缺席时由希蜜授职。
  await page.evaluate(() => window.__ANGEL2__?.advanceDialogue());
  await expect(page.locator("#dialogue-speaker-upper")).toHaveText("希蜜");
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage3-fourth-corps-opening-promotion.png`,
  });

  // 队列按棋盘顺序排，三人全部授职后战场才交还玩家。
  expect(await waitForPhaseThroughPromotions(page, "player")).toEqual(JOINING_PROMOTION_IDS);
  const promoted = await state(page);
  for (const id of JOINING_PROMOTION_IDS) {
    expect(promoted.units.find((unit) => unit.id === id)?.classId, `${id} took its new profession`)
      .toBe("cavalry");
  }
  // 希蜜与拉朵那属于救援队，不在特例内。
  for (const id of ["1:1", "1:4"]) {
    expect(promoted.units.find((unit) => unit.id === id)?.classId).toBe("soldier");
  }
  expect(promoted.units.filter(({ side }) => side === 1)).toHaveLength(13);
});

test("stage 3 promotions use Himi as the on-field grantor while Nia is absent", async ({ page }) => {
  await openStage3(page, "stage-03-player&difficulty=0&test=1");
  await page.evaluate(() => window.__ANGEL2__?.forcePromotionSetup());
  await clickUnit(page, "1:4");
  await page.getByTestId("unit-command-attack").click();
  await expect(page.getByTestId("dialogue-layer"))
    .toHaveAttribute("data-source-record", "promotion");
  await expect(page.getByTestId("dialogue-window-lower")).toContainText("拉朵那");
  await page.evaluate(() => window.__ANGEL2__?.advanceDialogue());
  expect(await page.locator("#dialogue-speaker-upper").textContent()).toBe("希蜜");
  await page.waitForTimeout(120);
  await captureVisualAudit(page.getByTestId("game-screen"), {
    path: `${ARTIFACT_DIR}/stage3-promotion-himi-grantor.png`,
  });
  await expect(page.getByTestId("dialogue-portrait-composite"))
    .toHaveAttribute("data-portrait-record", "45");
});
