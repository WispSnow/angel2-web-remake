import type { PortraitRecord, UnitClassId } from "../types";
import { presentationActionIdsForClass, type BattleActionId } from "./actions";
import { classFallbackPortraitFor, promotionReachableClassIds } from "./classes";
import { FULL_COMBAT_ATLASES } from "./full-combat-atlases.generated";
import { allyMapUnitAssetsForClasses } from "./map-unit-assets";
import { mapActionAtlasAssetsForActions } from "./map-action-assets";
import { fullCombatBackgroundAssetsForStage } from "./full-combat-backgrounds";
import { portraitAssetUrlsForRecords } from "./portrait-assets";

export interface StageClassPresentationRequirements {
  /**
   * Player roster classes. Every legal in-stage promotion descendant is
   * included, for its map figure, actions and side-1 generic portrait alike.
   */
  allyClassIds: readonly UnitClassId[];
  /** Every class known to the stage, including fixed and enemy figures. */
  encounterClassIds: readonly UnitClassId[];
  /** Native scenario number used to bound the possible panorama backdrops. */
  nativeStage?: number;
  /**
   * Current board, deployment and story portraits; never the full campaign.
   * Generic portraits the allies can promote into are added from
   * `allyClassIds`, so callers do not repeat the promotion closure here.
   */
  portraitRecords?: readonly PortraitRecord[];
  /**
   * The stage module's own `unitSprites` values, verbatim. A stage may build
   * those URLs instead of writing them out — stage 30 derives one per boss form —
   * and the manifest generator only sees literal strings, so such a stage would
   * otherwise have figures in no pack at all and Phaser would pull the raw URL
   * after the loading page had already gone.
   */
  unitSpriteUrls?: readonly string[];
}

const fullCombatAtlasById = new Map<string, (typeof FULL_COMBAT_ATLASES)[number]>(
  FULL_COMBAT_ATLASES.map((atlas) => [atlas.id, atlas]),
);

export function classPresentationAssetUrls(
  requirements: StageClassPresentationRequirements,
): readonly string[] {
  const allyClasses = new Set<UnitClassId>(
    promotionReachableClassIds(requirements.allyClassIds),
  );
  const encounterClasses = new Set<UnitClassId>([
    ...requirements.encounterClassIds,
    ...allyClasses,
  ]);
  const urls = new Set<string>(allyMapUnitAssetsForClasses(requirements.allyClassIds).values());
  for (const url of requirements.unitSpriteUrls ?? []) urls.add(url);
  // 通用单位（士兵A 等）按当前职业显示通用肖像，转职当场就换成新职业那张。肖像是 DOM
  // 图片，没进资源门时会绕过租约直接请求原始 URL，所以和棋子一样按我方转职闭包备好。
  // 敌方从不转职，不需要 side 2 的那一套。
  const portraitRecords = new Set<PortraitRecord>(requirements.portraitRecords ?? []);
  for (const classId of allyClasses) {
    const portrait = classFallbackPortraitFor(classId, 1);
    if (portrait !== undefined) portraitRecords.add(portrait);
  }
  for (const url of portraitAssetUrlsForRecords([...portraitRecords])) urls.add(url);
  if (requirements.nativeStage !== undefined) {
    for (const url of fullCombatBackgroundAssetsForStage(requirements.nativeStage)) urls.add(url);
  }
  const commonTrail = fullCombatAtlasById.get("common-trail");
  if (encounterClasses.size > 0 && commonTrail) urls.add(commonTrail.image);

  const actionIds = new Set<BattleActionId>();
  for (const classId of encounterClasses) {
    let fullCombatSideCount = 0;
    for (const physicalSide of ["left", "right"] as const) {
      const atlas = fullCombatAtlasById.get(`${physicalSide}-${classId}`);
      if (!atlas) continue;
      urls.add(atlas.image);
      fullCombatSideCount += 1;
    }
    if (fullCombatSideCount === 0) {
      throw new Error(`missing full-combat atlas for class ${classId}`);
    }
    for (const side of [1, 2] as const) {
      for (const actionId of presentationActionIdsForClass(classId, side)) {
        actionIds.add(actionId);
      }
    }
  }
  for (const url of mapActionAtlasAssetsForActions(actionIds)) urls.add(url);
  return [...urls].sort();
}
