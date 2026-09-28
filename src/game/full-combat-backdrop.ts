// Module 29's full-screen battle backdrop (REMAKE-169). `AEC3` composes the
// chosen `C.SWF` record into the 448-pixel battle buffer in five layers, then
// `AEEF` advances one phase word per layer. The words live in the module's code
// segment and nothing clears them between battles, so a battle starts from the
// phases the previous full-screen battle left behind until module 29 is
// decompressed again. See the notes in
// `reverse/notes/ordinary-combat-presentations.md` and the decoded tables in
// `content/full-combat-backgrounds.generated.ts`.
import {
  FULL_COMBAT_BACKDROP_LAYERS,
  FULL_COMBAT_BACKDROP_WRAP,
  FULL_COMBAT_BATTLE_BUFFER,
} from "./content/full-combat-backgrounds.generated";

/** One phase per layer, in source bytes, as held by `CS:AFD9..AFE1`. */
export type FullCombatBackdropPhases = readonly [number, number, number, number, number];

/** The module image ships every phase word as 0. */
export const FULL_COMBAT_BACKDROP_INITIAL_PHASES: FullCombatBackdropPhases = [0, 0, 0, 0, 0];

const PIXELS_PER_BYTE = FULL_COMBAT_BATTLE_BUFFER.width / FULL_COMBAT_BACKDROP_WRAP.rowBytes;

/**
 * Applies `updates` calls of `AEEF` in one direction. Each crossing writes the
 * reset value outright, so the 3- and 5-byte layers lose their overshoot and a
 * layer brought down to 0 under `:L` is left at a full row.
 */
export function advanceFullCombatBackdropPhases(
  phases: FullCombatBackdropPhases,
  direction: -1 | 0 | 1,
  updates: number,
): FullCombatBackdropPhases {
  if (direction === 0 || updates <= 0) return phases;
  const next = [...phases] as [number, number, number, number, number];
  const { right, left } = FULL_COMBAT_BACKDROP_WRAP;
  for (let update = 0; update < updates; update += 1) {
    FULL_COMBAT_BACKDROP_LAYERS.forEach((layer, index) => {
      if (direction > 0) {
        const value = next[index] + layer.rightStep;
        next[index] = value >= right.limit ? right.reset : value;
      } else {
        const value = next[index] + layer.leftStep;
        next[index] = value <= left.limit ? left.reset : value;
      }
    });
  }
  return next;
}

/**
 * Pixel offset of each layer's first composed column in its source rows. The
 * row-cyclic far layer starts `seedBytes` in and wraps within the row; a linear
 * layer's offset may reach a whole row, which reads the next source row.
 */
export function fullCombatBackdropLayerOffsets(
  phases: FullCombatBackdropPhases,
): readonly number[] {
  const { rowBytes } = FULL_COMBAT_BACKDROP_WRAP;
  return FULL_COMBAT_BACKDROP_LAYERS.map((layer, index) => {
    const bytes = layer.copy === "row-cyclic"
      ? (layer.seedBytes + phases[index]) % rowBytes
      : layer.seedBytes + phases[index];
    return bytes * PIXELS_PER_BYTE;
  });
}

/**
 * The record pixel a composed buffer pixel copies, or `undefined` for buffer
 * rows the compositor never writes. Rows past the record's own come back as
 * they are; the caller decides what those undefined source rows look like.
 */
export function fullCombatBackdropSourcePixel(
  x: number,
  y: number,
  phases: FullCombatBackdropPhases,
): { x: number; y: number } | undefined {
  const index = FULL_COMBAT_BACKDROP_LAYERS.findIndex((layer) =>
    y >= layer.firstRow && y < layer.firstRow + layer.rows);
  if (index < 0) return undefined;
  const layer = FULL_COMBAT_BACKDROP_LAYERS[index];
  const offset = fullCombatBackdropLayerOffsets(phases)[index];
  const width = FULL_COMBAT_BATTLE_BUFFER.width;
  if (layer.copy === "row-cyclic") return { x: (x + offset) % width, y };
  const linear = y * width + x + offset;
  return { x: linear % width, y: Math.floor(linear / width) };
}
