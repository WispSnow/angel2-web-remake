import type { Page } from "@playwright/test";

type ArenaDebugWindow = Window & {
  __ANGEL2_ARENA__?: { getState: () => object };
};

export const ARTIFACT_DIR = "artifacts/playwright";

export interface ArenaBattleDebugState {
  round: number;
  phase: string;
  actionMode: string;
  cameraOrigin: { x: number; y: number };
  rngState: number;
  rngCalls: number;
  terrainOverrides: Array<{ x: number; y: number; kind: "iron-plate" | "obstacle" }>;
  lastConstruction?: {
    actionId: "iron-plate" | "obstacle";
    actorId: string;
    actorPositionBefore: { x: number; y: number };
    actorPositionAfter: { x: number; y: number };
    path: Array<{ x: number; y: number }>;
    terrainMutations: Array<{
      x: number;
      y: number;
      kind: "iron-plate" | "obstacle";
      slotBefore: number;
      slotAfter: number;
      changed: boolean;
    }>;
  };
  lastSpecialAction?: {
    actionId: string;
    actorId: string;
    target: { x: number; y: number };
    damage: number;
    healing: number;
    blocked: boolean;
    blockReason?: "magicGuard" | "frozen" | "classImmune";
    experienceGained: number;
    affectedUnits: Array<{
      unitId: string;
      positionAfter: { x: number; y: number };
      lifeAfter: number;
      experienceAfter: number;
      actionDisabledAfter: boolean;
      moved: boolean;
      damage: number;
      healing: number;
      statusesAfter: Record<string, number>;
      prayerOutcome?: "healing" | "experience" | "attackUp" | "defenseUp";
      prayerRolledAmount?: number;
    }>;
  };
  lastCombat?: {
    attackerId: string;
    defenderId: string;
    defenderDied: boolean;
  };
  combatPresentation?: { phase: string };
  specialActionPresentation?: { phase: string; frame: number; lifeChangeUnitId?: string };
  specialActionPresentationTrace: Array<{
    phase: string;
    frame: number;
    nativeTicks: number;
    lifeChangeUnitId?: string;
  }>;
  audioCueLog: Array<{ group: string; record: number; reason: string }>;
  units: Array<{
    id: string;
    classId: string;
    x: number;
    y: number;
    life: number;
    experience: number;
    acted: boolean;
    actionDisabled: boolean;
    statuses: Record<string, number>;
  }>;
}

export const arenaBattleState = (page: Page) => page.evaluate(() =>
  ((window as ArenaDebugWindow).__ANGEL2_ARENA__?.getState() as {
    battle?: ArenaBattleDebugState;
  }).battle);

export async function clickArenaWorldCell(page: Page, x: number, y: number): Promise<void> {
  const canvas = page.getByTestId("battle-canvas");
  const [battle, box, dimensions] = await Promise.all([
    arenaBattleState(page),
    canvas.boundingBox(),
    canvas.evaluate((element) => {
      const surface = element as HTMLCanvasElement;
      return { width: surface.width, height: surface.height };
    }),
  ]);
  if (!battle || !box) throw new Error("arena battle canvas is not ready");
  const logicalX = 40 + (x - battle.cameraOrigin.x + .5) * 40;
  const logicalY = 23 + (y - battle.cameraOrigin.y + .5) * 44;
  await canvas.click({
    position: {
      x: logicalX * box.width / dimensions.width,
      y: logicalY * box.height / dimensions.height,
    },
  });
}
