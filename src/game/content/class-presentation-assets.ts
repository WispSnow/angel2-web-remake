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

/**
 * 這一關的畫面可能出現的全部肖像記錄：在場、部署與劇情的臉，加上我方轉職閉包裡每個職業的 side 1 通用肖像。
 * 通用單位（士兵A 等）按當前職業顯示通用肖像，轉職當場就換成新職業那張；肖像是 DOM 圖片，沒進資源門時會繞過
 * 租約直接請求原始 URL，所以和棋子一樣按我方轉職閉包備好。敵方從不轉職，不需要 side 2 的那一套。
 * 原版主圖與 `REMAKE-192` 高清檔案都按這份清單進資源門（`REMAKE-219`：高清以前只帶在場的臉，轉職後的通用肖像
 * 在高清模式下退回原版）。
 */
export function stagePortraitRecords(
  requirements: Pick<StageClassPresentationRequirements, "allyClassIds" | "portraitRecords">,
): readonly PortraitRecord[] {
  const portraitRecords = new Set<PortraitRecord>(requirements.portraitRecords ?? []);
  for (const classId of promotionReachableClassIds(requirements.allyClassIds)) {
    const portrait = classFallbackPortraitFor(classId, 1);
    if (portrait !== undefined) portraitRecords.add(portrait);
  }
  return [...portraitRecords];
}

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
  for (const url of portraitAssetUrlsForRecords(stagePortraitRecords(requirements))) urls.add(url);
  if (requirements.nativeStage !== undefined) {
    for (const url of fullCombatBackgroundAssetsForStage(requirements.nativeStage)) urls.add(url);
  }
  const commonTrail = fullCombatAtlasById.get("common-trail");
  if (encounterClasses.size > 0 && commonTrail) urls.add(commonTrail.image);

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
  }
  for (const url of mapActionAtlasAssetsForActions(stagePresentationActionIds(requirements))) urls.add(url);
  return [...urls].sort();
}

/**
 * 本關會出現的職業（含我方轉職閉包）在兩邊可能用到的地圖動作。地圖動作圖集與 `REMAKE-203` 的高清技術特效
 * 都按這份清單進資源門。
 */
export function stagePresentationActionIds(
  requirements: StageClassPresentationRequirements,
): ReadonlySet<BattleActionId> {
  const encounterClasses = new Set<UnitClassId>([
    ...requirements.encounterClassIds,
    ...promotionReachableClassIds(requirements.allyClassIds),
  ]);
  const actionIds = new Set<BattleActionId>();
  for (const classId of encounterClasses) {
    for (const side of [1, 2] as const) {
      for (const actionId of presentationActionIdsForClass(classId, side)) actionIds.add(actionId);
    }
  }
  return actionIds;
}
