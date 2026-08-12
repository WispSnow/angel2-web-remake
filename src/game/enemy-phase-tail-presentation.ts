import type { Position } from "./types";
import type { PreparedEnemyPhaseTail } from "./simulation/enemy-phase-tail";

export interface EnemyPhaseTailTileDescriptor {
  xOffset: number;
  yOffset: number;
  width: number;
  height: number;
  low7BitFrameIndices: readonly (number | null)[];
}

export interface EnemyPhaseTailPresentationDefinition {
  id: string;
  phase1: {
    frames: readonly string[];
    descriptors: readonly EnemyPhaseTailTileDescriptor[];
    waitPerDescriptorNativeTicks: number;
  };
  phase2: {
    frames: readonly string[];
    descriptors: readonly EnemyPhaseTailTileDescriptor[];
    waitPerDescriptorNativeTicks: number;
  };
  sweep: {
    descriptorSequence: readonly EnemyPhaseTailTileDescriptor[];
    waitPerDescriptorNativeTicks: number;
  };
}

export type EnemyPhaseTailPresentationPhase = "phase1" | "phase2" | "sweep";

export interface EnemyPhaseTailPresentationStep {
  phase: EnemyPhaseTailPresentationPhase;
  resource: "phase1" | "phase2";
  descriptor: EnemyPhaseTailTileDescriptor;
  origin: Position;
  draw: number;
  nativeTicks: number;
}

export interface EnemyPhaseTailPresentation extends EnemyPhaseTailPresentationStep {
  execution: number;
  prepared: PreparedEnemyPhaseTail;
}

export function enemyPhaseTailPresentationTimeline(
  definition: EnemyPhaseTailPresentationDefinition,
  origin: Position,
): EnemyPhaseTailPresentationStep[] {
  const timeline: EnemyPhaseTailPresentationStep[] = [];
  let draw = 0;
  for (const descriptor of definition.phase1.descriptors) {
    timeline.push({
      phase: "phase1",
      resource: "phase1",
      descriptor,
      origin: { ...origin },
      draw: draw += 1,
      nativeTicks: definition.phase1.waitPerDescriptorNativeTicks,
    });
  }
  for (const descriptor of definition.phase2.descriptors) {
    timeline.push({
      phase: "phase2",
      resource: "phase2",
      descriptor,
      origin: { ...origin },
      draw: draw += 1,
      nativeTicks: definition.phase2.waitPerDescriptorNativeTicks,
    });
  }
  definition.sweep.descriptorSequence.forEach((descriptor, index) => {
    timeline.push({
      phase: "sweep",
      resource: "phase2",
      descriptor,
      origin: { x: origin.x, y: origin.y + index },
      draw: draw += 1,
      nativeTicks: definition.sweep.waitPerDescriptorNativeTicks,
    });
  });
  return timeline;
}
