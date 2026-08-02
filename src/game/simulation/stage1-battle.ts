import {
  activateStage1Content,
  STAGE1_DEFINITION,
  STAGE1_DEPLOYMENT_PREVIEW_ROSTER,
  STAGE1_SEMANTIC_CLASS_OVERRIDES,
  STAGE1_SEMANTIC_ENEMY_UNITS,
  stage1TerrainSlotAt,
} from "../content/stage1";
import { className } from "../content/classes";
import { completeCampaignRoster, initialEnemyExperience, statsFor } from "../content/stage0";
import type {
  BattleUnit,
  CampaignState,
  Difficulty,
  SaveRosterEntry,
} from "../types";
import type { DeploymentRosterUnit } from "../deployment-session";
import { validateDeploymentResult, type DeploymentResult } from "./deployment";
import { DeterministicRng } from "./rng";
import { emptyUnitStatuses } from "./status";
import { Stage0Battle, type BattleScenario } from "./battle";

const STAGE1_AI_CLASS_PRIORITY = {
  cavalry: 16,
  sister: 35,
  soldier: 36,
} as const;

function preparedRosterEntry(
  slot: number,
  campaignRoster: readonly SaveRosterEntry[],
): BattleUnit | undefined {
  const preview = STAGE1_DEPLOYMENT_PREVIEW_ROSTER.find((unit) => unit.slot === slot);
  if (!preview) return undefined;
  const inherited = campaignRoster.find((unit) => unit.slot === slot);
  const override = STAGE1_SEMANTIC_CLASS_OVERRIDES.find((unit) => unit.slot === slot);
  const classId = override?.classId ?? inherited?.classId ?? preview.classId;
  const untouchedNamedBaseline = inherited?.classId === "soldier"
    && inherited.experience === 0
    && preview.experience > 0;
  const experience = untouchedNamedBaseline
    ? preview.experience
    : inherited?.experience ?? preview.experience;
  return {
    id: `1:${slot}`,
    side: 1,
    slot,
    classId,
    className: className(classId),
    name: preview.name,
    portrait: preview.portrait,
    x: 0,
    y: 0,
    life: untouchedNamedBaseline ? preview.life : inherited?.life ?? preview.life,
    experience,
    acted: false,
    statuses: emptyUnitStatuses(),
  };
}

export function createStage1DeploymentRoster(
  campaignRoster: readonly SaveRosterEntry[],
): DeploymentRosterUnit[] {
  return STAGE1_DEFINITION.deployment.eligibleSlots.map((slot) => {
    const unit = preparedRosterEntry(slot, campaignRoster);
    if (!unit) throw new Error(`stage 1 roster is missing eligible slot ${slot}`);
    return {
      slot: unit.slot,
      name: unit.name,
      portrait: unit.portrait,
      classId: unit.classId,
      className: unit.className,
      experience: unit.experience,
      life: unit.life,
    };
  });
}

export function createStage1Units(
  difficulty: Difficulty,
  campaignRoster: readonly SaveRosterEntry[],
  deployment: DeploymentResult,
): BattleUnit[] {
  const allies = deployment.placements.map(({ slot, position }) => {
    const unit = preparedRosterEntry(slot, campaignRoster);
    if (!unit) throw new Error(`stage 1 deployment references missing roster slot ${slot}`);
    return { ...unit, x: position.x, y: position.y };
  });
  const enemies = STAGE1_SEMANTIC_ENEMY_UNITS.map((definition): BattleUnit => {
    const experience = initialEnemyExperience(definition.classId, difficulty);
    const unit: BattleUnit = {
      id: `2:${definition.slot}`,
      side: 2,
      slot: definition.slot,
      classId: definition.classId,
      className: className(definition.classId),
      name: definition.slot === 16
        ? "芳"
        : definition.classId === "sister"
          ? "騎士團修女"
          : "騎士團士兵",
      portrait: 48,
      x: definition.position.x,
      y: definition.position.y,
      life: 0,
      experience,
      acted: false,
      statuses: emptyUnitStatuses(),
    };
    unit.life = statsFor(unit, difficulty).maxLife;
    return unit;
  });
  return [...allies, ...enemies];
}

export class Stage1Battle extends Stage0Battle {
  constructor(
    campaign: Pick<CampaignState, "difficulty" | "roster" | "rngState" | "rngCalls">,
    deployment: DeploymentResult,
    rng = new DeterministicRng(campaign.rngState, campaign.rngCalls),
  ) {
    activateStage1Content();
    validateDeploymentResult(STAGE1_DEFINITION.deployment, deployment);
    const scenario: BattleScenario = {
      stage: STAGE1_DEFINITION,
      width: STAGE1_DEFINITION.width,
      height: STAGE1_DEFINITION.height,
      terrainSlotAt: stage1TerrainSlotAt,
      createUnits: (difficulty) => createStage1Units(difficulty, campaign.roster, deployment),
      createCampaignRoster: () => completeCampaignRoster(campaign.roster),
      enemyClassPriority: STAGE1_AI_CLASS_PRIORITY,
      enemyBehaviorById: new Map(
        STAGE1_SEMANTIC_ENEMY_UNITS.map(({ slot, aiBehavior }) => [`2:${slot}`, aiBehavior]),
      ),
    };
    super(campaign.difficulty, rng, scenario);
  }
}
