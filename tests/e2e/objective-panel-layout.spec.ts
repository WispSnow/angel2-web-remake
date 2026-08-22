import { expect, test, type Page } from "@playwright/test";
import { settleMenuAnimation } from "./menu-controls";
import { captureVisualAudit } from "./visual-audit";
import {
  NATIVE_OBJECTIVE_PANEL,
  NATIVE_OBJECTIVE_PANEL_TEXT,
} from "../../src/game/content/objective-panel.generated";

const ARTIFACT_DIR = "artifacts/playwright";

interface FrameBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ObjectivePanelLayout {
  panel: { left: number; top: number; width: number; height: number };
  background: string;
  boxShadow: string;
  textOffset: { x: number; y: number };
  canvas: { width: number; height: number };
  accessibleText: string;
  bevels: Array<{ side: string; left: number; width: number }>;
  edges: Array<FrameBox & { side: string; repeat: string; size: string; source: string }>;
  corners: Array<FrameBox & { source: string }>;
  paintOrder: string[];
}

async function objectivePanelLayout(page: Page): Promise<ObjectivePanelLayout> {
  return page.getByTestId("objective-panel").evaluate((panel) => {
    const screen = panel.closest<HTMLElement>("#logical-screen");
    const text = panel.querySelector<HTMLElement>(".objective-panel-text");
    const canvas = text?.querySelector<HTMLCanvasElement>("canvas.native-text");
    if (!screen || !text || !canvas) throw new Error("objective panel layout is incomplete");
    const screenBounds = screen.getBoundingClientRect();
    const panelBounds = panel.getBoundingClientRect();
    const textBounds = text.getBoundingClientRect();
    const style = getComputedStyle(panel);
    return {
      panel: {
        left: panelBounds.left - screenBounds.left,
        top: panelBounds.top - screenBounds.top,
        width: panelBounds.width,
        height: panelBounds.height,
      },
      background: style.backgroundColor,
      boxShadow: style.boxShadow,
      textOffset: { x: textBounds.left - panelBounds.left, y: textBounds.top - panelBounds.top },
      canvas: { width: canvas.width, height: canvas.height },
      accessibleText: text.querySelector(".visually-hidden")?.textContent ?? "",
      bevels: [...panel.querySelectorAll<HTMLElement>(".objective-panel-bevel")].map((bevel) => ({
        side: bevel.classList.contains("left") ? "left" : "right",
        left: bevel.getBoundingClientRect().left - panelBounds.left,
        width: bevel.getBoundingClientRect().width,
      })),
      edges: [...panel.querySelectorAll<HTMLElement>(".objective-panel-edge")].map((edge) => {
        const bounds = edge.getBoundingClientRect();
        const side = edge.classList.contains("top") ? "top" : "bottom";
        return {
          side,
          left: bounds.left - panelBounds.left,
          top: bounds.top - panelBounds.top,
          width: bounds.width,
          height: bounds.height,
          repeat: getComputedStyle(edge).backgroundRepeat,
          size: getComputedStyle(edge).backgroundSize,
          source: getComputedStyle(edge).getPropertyValue(`--native-objective-edge-${side}-source`),
        };
      }),
      corners: [...panel.querySelectorAll<HTMLElement>(".objective-panel-corner")].map((corner) => {
        const bounds = corner.getBoundingClientRect();
        return {
          left: bounds.left - panelBounds.left,
          top: bounds.top - panelBounds.top,
          width: bounds.width,
          height: bounds.height,
          source: getComputedStyle(corner).getPropertyValue("--native-objective-corner-source"),
        };
      }),
      // `12E7:00D1` paints bands, then bevels, then ornaments, so each layer
      // covers the one before it; in the DOM that is plain document order.
      paintOrder: [...panel.children].map((child) => child.className.split(" ")[0] ?? ""),
    };
  });
}

/**
 * `12E7:0008` draws the stage's own SAY record inside a fixed frame and waits
 * for either primary or secondary. Nothing about the panel is derived from the
 * remake's own objective wording, so these cases check the native geometry and
 * the verbatim record rather than a reflowing card.
 */
const representativeStages = [
  { scenario: "stage-09-player", nativeStage: 9, artifact: "stage9-objective-layout.png" },
  { scenario: "stage-27-player", nativeStage: 27, artifact: "stage27-objective-layout.png" },
  { scenario: "stage-31-player", nativeStage: 31, artifact: "stage31-objective-layout.png" },
] as const;

for (const { scenario, nativeStage, artifact } of representativeStages) {
  test(`${scenario}: the victory-condition panel draws its native record at the native geometry`, async ({ page }) => {
    await page.goto(`/?debugScenario=${scenario}&difficulty=0&test=1`);
    await expect(page.getByTestId("battle-canvas")).toBeVisible();
    await page.keyboard.press("o");
    await expect(page.getByTestId("objective-panel")).toBeVisible();
    await settleMenuAnimation(page.getByTestId("objective-panel"));

    const layout = await objectivePanelLayout(page);
    const {
      body, shadow, textOrigin, leftBevel, rightBevel, topEdge, bottomEdge, corner,
    } = NATIVE_OBJECTIVE_PANEL;
    expect(layout.panel).toEqual({
      left: body.x,
      top: body.y,
      width: body.width,
      height: body.height,
    });
    // DS:1236 is palette index 1 and DS:122C the same rectangle offset by 16 in
    // palette index 0, which is what the drop shadow reproduces.
    expect(layout.background).toBe("rgb(93, 65, 49)");
    expect(layout.boxShadow).toBe(
      `rgb(0, 0, 0) ${shadow.x - body.x}px ${shadow.y - body.y}px 0px 0px`,
    );
    expect(layout.textOffset).toEqual({ x: textOrigin.x - body.x, y: textOrigin.y - body.y });
    expect(layout.bevels).toEqual([
      { side: "left", left: leftBevel.startX - body.x, width: leftBevel.colors.length },
      { side: "right", left: rightBevel.startX - body.x, width: rightBevel.colors.length },
    ]);

    // `12E7:00E1` tiles one 8-pixel A/0006 cell across the body width at the
    // body's own top row and again one body height lower, so the bottom band
    // hangs below the frame and eats the first rows of the drop shadow.
    const bandWidth = NATIVE_OBJECTIVE_PANEL.edgeCells * NATIVE_OBJECTIVE_PANEL.edgeStep;
    expect(bandWidth).toBe(body.width);
    expect(layout.edges).toEqual([
      {
        side: "top",
        left: NATIVE_OBJECTIVE_PANEL.edgeStartX - body.x,
        top: topEdge.y - body.y,
        width: bandWidth,
        height: topEdge.height,
        repeat: "repeat-x",
        size: `${topEdge.width}px ${topEdge.height}px`,
        source: expect.stringContaining("objective-panel-edge-top.png"),
      },
      {
        side: "bottom",
        left: NATIVE_OBJECTIVE_PANEL.edgeStartX - body.x,
        top: bottomEdge.y - body.y,
        width: bandWidth,
        height: bottomEdge.height,
        repeat: "repeat-x",
        size: `${bottomEdge.width}px ${bottomEdge.height}px`,
        source: expect.stringContaining("objective-panel-edge-bottom.png"),
      },
    ]);

    // One ornament per corner, all four the same masked 8x7 bank image.
    expect(layout.corners).toEqual(corner.placements.map((placement) => ({
      left: placement.x - body.x,
      top: placement.y - body.y,
      width: corner.width,
      height: corner.height,
      source: expect.stringContaining("objective-panel-corner.png"),
    })));

    expect(layout.paintOrder).toEqual([
      "objective-panel-edge",
      "objective-panel-edge",
      "objective-panel-bevel",
      "objective-panel-bevel",
      ...corner.placements.map(() => "objective-panel-corner"),
      "objective-panel-text",
      "objective-panel-dismiss",
    ]);

    // The clipped copy is the record verbatim, one newline per drawn line.
    const lines = NATIVE_OBJECTIVE_PANEL_TEXT[nativeStage];
    expect(layout.accessibleText).toBe(lines.join("\n"));

    // Every line the original wrote has to fit the frame it wrote it into.
    expect(layout.canvas.width).toBeLessThanOrEqual(body.width - (textOrigin.x - body.x) * 2);
    expect(layout.canvas.height).toBeLessThanOrEqual(body.height - (textOrigin.y - body.y) * 2);

    await captureVisualAudit(page.getByTestId("game-screen"), {
      path: `${ARTIFACT_DIR}/${artifact}`,
    });
  });
}

test("every recorded victory-condition panel fits the frame the original drew it in", () => {
  const { body, textOrigin, lineAdvance } = NATIVE_OBJECTIVE_PANEL;
  const inset = { x: textOrigin.x - body.x, y: textOrigin.y - body.y };
  for (const [stage, lines] of Object.entries(NATIVE_OBJECTIVE_PANEL_TEXT)) {
    // The SAY cursor steps 16 per Big5 cell and 8 per ASCII one.
    const widest = Math.max(...lines.map((line) =>
      [...line].reduce((total, character) =>
        total + (character.codePointAt(0)! < 0x80 ? 8 : 16), 0)));
    expect(widest, `stage ${stage} overflows the panel width`)
      .toBeLessThanOrEqual(body.width - inset.x);
    expect((lines.length - 1) * lineAdvance, `stage ${stage} overflows the panel height`)
      .toBeLessThanOrEqual(body.height - inset.y);
  }
});

test("the panel closes on a pointer press, as the original does on primary or secondary", async ({ page }) => {
  await page.goto("/?debugScenario=stage-09-player&difficulty=0&test=1");
  await expect(page.getByTestId("battle-canvas")).toBeVisible();
  await page.keyboard.press("o");
  const panel = page.getByTestId("objective-panel");
  await expect(panel).toBeVisible();
  await settleMenuAnimation(panel);

  await panel.locator(".objective-panel-dismiss").click();
  await expect(panel).toBeHidden();

  await page.keyboard.press("o");
  await expect(panel).toBeVisible();
  await settleMenuAnimation(panel);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});
