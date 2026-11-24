import {
  lightningFrameAtMainIndex,
  lightningWaveDistance,
  type LightningPresentationDefinition,
} from "../map-technique-presentation";

/** 高清片段這一幀畫在哪一格（戰場與技能實驗室共用）。 */
export interface MapActionHdCell {
  readonly x: number;
  readonly y: number;
  /** 逐格錯開的片段（`REMAKE-208`）：這一格自己的原版幀（未給時用控制器的幀）。 */
  readonly frame?: number;
  /**
   * 魔弓直線或 `WD` 路徑上已經播完最後一幀的一格（原版這一步寫 `82h` 清掉它）：高清在這一步播片段的餘韻，片段沒有
   * 餘韻就不畫。直線與路徑上的每一格都會給這個欄位（`false` 表示還在播自己的幀）。
   */
  readonly afterglow?: boolean;
  /** 這一格由哪段片段畫（同一階段同時畫兩段時，例如落雷的掃描與受擊標記，`REMAKE-210`）；未給時用該階段的第一段。 */
  readonly clipId?: string;
}

interface CellPosition {
  readonly x: number;
  readonly y: number;
}

/**
 * 落雷（`REMAKE-210`）每一幀的高清格子，與 `renderLightningFrame` 同一套規則：主段畫在中心加這一幀的錨點偏移
 * （雲與雷柱逐格移動）；命中波的掃描畫在掃描帶裡每一格、各自的幀是「範圍值 − 門檻 − 1」；收尾畫在每個受擊單位上。
 * `frame` 在主段是全部主段描述符的序號，在命中波與收尾是該階段的幀。受擊標記（`REMAKE-211`）比原版留得久：
 * 原版只在掃描帶經過那幾步畫兩幀交替的標記，一閃而過；高清從波到達那一步起一直留到命中波結束（片段涵蓋整段
 * 命中波、照原版兩幀交替），最後一幀的餘韻在收尾時慢慢散去。
 */
export function lightningHdCells(input: {
  readonly tier: 1 | 2 | 3 | 4;
  readonly definition: LightningPresentationDefinition;
  readonly phase: "main" | "wave" | "cleanup";
  readonly frame: number;
  readonly center: CellPosition;
  readonly effectCells: readonly { readonly position: CellPosition; readonly value: number }[];
  readonly hitPositions: readonly CellPosition[];
}): readonly MapActionHdCell[] {
  const { tier, definition, frame, center, effectCells, hitPositions } = input;
  if (input.phase === "main") {
    const main = lightningFrameAtMainIndex(definition, frame);
    if (!main) return [];
    const anchor = definition.phases[main.phaseIndex]?.anchorOffsetSequence?.[main.drawIndex] ?? { x: 0, y: 0 };
    return [{ x: center.x + anchor.x, y: center.y + anchor.y, clipId: `lightning-${tier}-main` }];
  }
  if (input.phase === "cleanup") {
    return hitPositions.map(({ x, y }) => ({ x, y, clipId: "lightning-cleanup" }));
  }
  const hit = definition.commonHit;
  const sweep = effectCells.flatMap(({ position, value }) => {
    const code = value < 1 ? 0 : lightningWaveDistance(hit, frame, value);
    return code >= 1 && code <= hit.sweepWidth
      ? [{ x: position.x, y: position.y, clipId: `lightning-${tier}-hit`, frame: code - 1 }] : [];
  });
  const rangeValueByPosition = new Map(effectCells.map(({ position, value }) => [`${position.x},${position.y}`, value]));
  const markers = hitPositions.flatMap(({ x, y }) => {
    const code = lightningWaveDistance(hit, frame, rangeValueByPosition.get(`${x},${y}`) ?? 0);
    return code >= 0 ? [{ x, y, clipId: `lightning-${tier}-marker`, frame }] : [];
  });
  return [...sweep, ...markers];
}
