import * as Phaser from "phaser";
import {
  PRAYER_PROCEDURAL_PRESENTATION,
  prayerResultText,
} from "../prayer-presentation";
import type { PrayerOutcomeKind } from "../simulation/actions/types";

const NATIVE_PALETTE: Readonly<Record<number, number>> = {
  0: 0x050509,
  5: 0xd43fd8,
  11: 0x55e6f0,
  14: 0xffea55,
};

export function renderPrayerPresentation(
  scene: Phaser.Scene,
  outcome: PrayerOutcomeKind,
  rolledAmount?: number,
): Phaser.GameObjects.GameObject[] {
  const spec = PRAYER_PROCEDURAL_PRESENTATION;
  const scaleY = scene.scale.height / spec.nativeScreen.height;
  const y = (nativeY: number): number => Math.round(nativeY * scaleY);
  const graphics = scene.add.graphics().setScrollFactor(0).setDepth(8);

  // 1000:59AA draws the whole field synchronously on the inactive VGA page.
  // These pixel primitives preserve its fixed coordinates, 16-row twin columns,
  // palette indices and four paired corner calls without inventing archive art.
  graphics.fillStyle(0x090513, .82);
  graphics.fillRoundedRect(126, y(226), 100, y(154), 4);
  graphics.lineStyle(1, NATIVE_PALETTE[5], .9);
  graphics.strokeRoundedRect(126, y(226), 100, y(154), 4);
  for (let row = 0; row < spec.fieldRows; row += 1) {
    const nativeY = spec.fieldYStart + row * spec.fieldYStep;
    for (const column of spec.fieldColumns) {
      const color = column.variant === 1 ? NATIVE_PALETTE[14] : NATIVE_PALETTE[11];
      const direction = column.variant === 1 ? 1 : -1;
      graphics.fillStyle(color, 1);
      graphics.fillRect(column.x - 2, y(nativeY) - 1, 5, 3);
      graphics.fillRect(column.x + direction * 4, y(nativeY), 7, 1);
      if (row % 2 === 0) graphics.fillRect(column.x - direction * 5, y(nativeY) - 3, 2, 7);
    }
  }
  for (const run of spec.decorationRuns) {
    run.colors.forEach((paletteIndex, index) => {
      const color = NATIVE_PALETTE[paletteIndex] ?? NATIVE_PALETTE[0];
      graphics.fillStyle(color, 1);
      const nativeY = run.start + index;
      const left = run.start < 300 ? 136 + index * 7 : 182 + index * 7;
      graphics.fillRect(left, y(nativeY), 5, 2);
    });
  }
  for (const corner of spec.cornerPairs) {
    const color = NATIVE_PALETTE[corner.color] ?? NATIVE_PALETTE[5];
    graphics.lineStyle(2, color, 1);
    graphics.strokeCircle(corner.x, y(corner.y), 5);
    graphics.lineStyle(1, NATIVE_PALETTE[14], .9);
    graphics.strokeCircle(corner.x, y(corner.y), 8);
  }

  const text = scene.add.text(
    spec.resultTextPosition.x,
    y(spec.resultTextPosition.y),
    prayerResultText(outcome, rolledAmount),
    {
      color: "#fff26a",
      fontFamily: '"Noto Serif TC", "Songti TC", serif',
      fontSize: "18px",
      stroke: "#240b30",
      strokeThickness: 3,
      padding: { x: 8, y: 5 },
      backgroundColor: "rgba(5, 2, 12, .86)",
    },
  ).setOrigin(0, .5).setScrollFactor(0).setDepth(8);
  return [graphics, text];
}
