import {
  FULL_COMBAT_BACKGROUND_FALLBACK_RECORD,
  FULL_COMBAT_BACKGROUND_RECORDS,
  FULL_COMBAT_BACKGROUND_STAGE_TABLE,
  FULL_COMBAT_BACKGROUND_TERRAIN_EXEMPT_STAGES,
  FULL_COMBAT_BACKGROUND_TERRAIN_TABLE,
} from "./full-combat-backgrounds.generated";

/**
 * Which `C.SWF` battlefield the full-screen battle scrolls behind the fighters.
 *
 * Module 29 resolves this once per ordinary attack, before the presentation is
 * dispatched: `0000:95F8` looks the stage up in the DS:78DC table, and unless
 * the stage is exempt `0000:962E` re-reads the logical terrain slot beneath the
 * defender cell and replaces the record for the outdoor slots. Counter-attacks
 * reuse the same backdrop because the native selector never runs a second time.
 */
export function fullCombatBackgroundRecord(
  nativeStage: number,
  defenderTerrainSlot: number,
): number {
  const stageEntry = FULL_COMBAT_BACKGROUND_STAGE_TABLE.find(
    (entry) => entry.nativeStage === nativeStage,
  );
  const stageRecord = stageEntry?.record ?? FULL_COMBAT_BACKGROUND_FALLBACK_RECORD;
  if (FULL_COMBAT_BACKGROUND_TERRAIN_EXEMPT_STAGES.includes(nativeStage)) return stageRecord;
  const terrainEntry = FULL_COMBAT_BACKGROUND_TERRAIN_TABLE.find(
    (entry) => entry.terrainSlot === defenderTerrainSlot,
  );
  if (!terrainEntry) return stageRecord;
  const substitute = terrainEntry.stageOverrides.find(
    (entry) => entry.nativeStage === nativeStage,
  );
  return substitute?.record ?? terrainEntry.record;
}

export function fullCombatBackgroundAsset(record: number): string {
  if (!FULL_COMBAT_BACKGROUND_RECORDS.includes(record)) {
    throw new Error(`no full-screen battle backdrop for C/${record}`);
  }
  // C/0029 is byte-identical to C/0019; preserve the native record identity
  // while serving the single published image file.
  const assetRecord = record === 29 ? 19 : record;
  return `/assets/original/full-combat/backgrounds/${String(assetRecord).padStart(2, "0")}.png`;
}
