import { MAP_ACTION_ATLASES } from "./map-action-atlases.generated";
import type { BattleActionId } from "./actions";

export function mapActionAtlasIdForAction(actionId: string): string {
  if (actionId.endsWith("-shot")) return "shoot";
  if (actionId.startsWith("ice-")) return "ice-1";
  if (actionId.startsWith("recovery-")) return "recovery-1";
  if (actionId === "magic-guard") return "attack-up";
  return actionId;
}

export function mapActionAtlasAssetsForActions(
  actionIds: Iterable<BattleActionId>,
): readonly string[] {
  const atlasIds = new Set([...actionIds].map(mapActionAtlasIdForAction));
  return MAP_ACTION_ATLASES
    .filter(({ id }) => atlasIds.has(id))
    .flatMap(({ image, data }) => [image, data]);
}
