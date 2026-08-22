import * as Phaser from "phaser";
import { nativeTextCanvas } from "../native-dom-text";
import { loadNativeFont } from "../native-text";
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

  // The result line is the original's own two-line template drawn with the
  // original font, so it goes through the shared bitmap drawer rather than a
  // host face. Phaser gets it as a canvas texture, which keeps the glyphs at
  // native scale under the scene's own nearest-neighbour filtering.
  const canvas = nativeTextCanvas(prayerResultText(outcome, rolledAmount), { mode: "story" });
  const key = `prayer-result-${scene.scene.key}`;
  scene.textures.remove(key);
  const texture = scene.textures.addCanvas(key, canvas);
  // The lab and the battlefield both scale their canvas up; without this the
  // 16x15 cells arrive bilinear-filtered and stop looking like the original.
  texture?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  const text = scene.add.image(spec.resultTextPosition.x, y(spec.resultTextPosition.y), key)
    .setOrigin(0, .5)
    .setScrollFactor(0)
    .setDepth(8);
  text.once(Phaser.GameObjects.Events.DESTROY, () => scene.textures.remove(key));
  // The atlas is normally long decoded by the time anyone prays, but a canvas
  // built before it resolves paints itself later, and the GPU copy has to be
  // told. Re-upload once the font is in, unless this object is already gone.
  void loadNativeFont().then(() => {
    if (texture && scene.textures.exists(key)) texture.refresh();
  }).catch(() => undefined);
  return [graphics, text];
}
