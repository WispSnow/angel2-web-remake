import type { InteractiveDeploymentDefinition } from "../../content/stages";
import type { Position } from "../../types";

export type DeploymentFeedback = "empty-slot" | "full" | "fixed-unit";

export const DEPLOYMENT_FEEDBACK_TEXT: Readonly<Record<DeploymentFeedback, string>> = {
  "empty-slot": "此處沒有人.",
  full: "出場人數已滿.",
  "fixed-unit": "此人必須出場戰鬥,不可放棄.",
};

export interface DeploymentPlacement {
  slot: number;
  position: Position;
  fixed: boolean;
}

export type DeploymentFocus =
  | { kind: "roster"; index: number }
  | { kind: "page"; page: 0 | 1 | 2 }
  | { kind: "finish" }
  | { kind: "map" };

export interface DeploymentState {
  definition: InteractiveDeploymentDefinition;
  rosterSlots: readonly number[];
  placements: readonly DeploymentPlacement[];
  currentOpenCell?: Position;
  rosterPage: 0 | 1 | 2;
  focus: DeploymentFocus;
  lastRosterIndex: number;
  feedback?: DeploymentFeedback;
  submitted: boolean;
}

export type DeploymentAction =
  | { type: "move-focus"; direction: "up" | "down" | "left" | "right" }
  | { type: "focus-roster"; index: number }
  | { type: "focus-finish" }
  | { type: "focus-map" }
  | { type: "toggle-roster-slot"; slot?: number }
  | { type: "select-page"; page: 0 | 1 | 2 }
  | { type: "cycle-open-cell"; direction: "previous" | "next" }
  | { type: "select-open-cell"; position: Position }
  | { type: "finish" }
  | { type: "dismiss-feedback" };

export interface DeploymentResult {
  placements: readonly DeploymentPlacement[];
}

const positionKey = ({ x, y }: Position): string => `${x},${y}`;
const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;
const copyPosition = ({ x, y }: Position): Position => ({ x, y });

function assertUniqueNumbers(values: readonly number[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicate slots`);
  }
}

function assertValidDefinition(
  definition: InteractiveDeploymentDefinition,
  rosterSlots: readonly number[],
): void {
  assertUniqueNumbers(definition.eligibleSlots, "eligibleSlots");
  assertUniqueNumbers(definition.optionalSlots, "optionalSlots");
  assertUniqueNumbers(definition.fixedPlacements.map(({ slot }) => slot), "fixedPlacements");
  assertUniqueNumbers(rosterSlots, "rosterSlots");

  const eligible = new Set(definition.eligibleSlots);
  const fixed = new Set(definition.fixedPlacements.map(({ slot }) => slot));
  const optional = new Set(definition.optionalSlots);
  const roster = new Set(rosterSlots);

  if ([...fixed, ...optional].some((slot) => !eligible.has(slot))) {
    throw new Error("fixed and optional slots must be eligible");
  }
  if ([...fixed].some((slot) => optional.has(slot))) {
    throw new Error("fixed and optional slots must not overlap");
  }
  if (eligible.size !== fixed.size + optional.size) {
    throw new Error("every eligible slot must be fixed or optional");
  }
  if ([...roster].some((slot) => !eligible.has(slot))) {
    throw new Error("every prepared roster slot must be eligible");
  }
  if ([...optional].some((slot) => !roster.has(slot))) {
    throw new Error("every optional slot must exist in the prepared roster");
  }

  const fixedPositions = definition.fixedPlacements.map(({ position }) => positionKey(position));
  const openPositions = definition.openCells.map(positionKey);
  if (new Set([...fixedPositions, ...openPositions]).size
    !== fixedPositions.length + openPositions.length) {
    throw new Error("fixed placements and open cells must use distinct positions");
  }
  if (
    definition.maximumUnits < fixed.size
    || definition.maximumUnits > fixed.size + definition.openCells.length
    || definition.maximumUnits > eligible.size
  ) {
    throw new Error("maximumUnits is not reachable from the deployment definition");
  }
}

function remainingOpenCells(state: Pick<DeploymentState, "definition" | "placements">): Position[] {
  const occupied = new Set(state.placements.map(({ position }) => positionKey(position)));
  return state.definition.openCells
    .filter((position) => !occupied.has(positionKey(position)))
    .map(copyPosition);
}

function normalizedPlacements(
  definition: InteractiveDeploymentDefinition,
  placements: readonly DeploymentPlacement[],
): DeploymentPlacement[] {
  const fixedOrder = new Map(
    definition.fixedPlacements.map(({ slot }, index) => [slot, index]),
  );
  const openOrder = new Map(
    definition.openCells.map((position, index) => [positionKey(position), index]),
  );
  return placements
    .map((placement) => ({
      ...placement,
      position: copyPosition(placement.position),
    }))
    .sort((left, right) => {
      if (left.fixed !== right.fixed) return left.fixed ? -1 : 1;
      return left.fixed
        ? (fixedOrder.get(left.slot) ?? 0) - (fixedOrder.get(right.slot) ?? 0)
        : (openOrder.get(positionKey(left.position)) ?? 0)
          - (openOrder.get(positionKey(right.position)) ?? 0);
    });
}

export function createDeploymentState(
  definition: InteractiveDeploymentDefinition,
  preparedRosterSlots: readonly number[],
): DeploymentState {
  assertValidDefinition(definition, preparedRosterSlots);
  const normalizedDefinition: InteractiveDeploymentDefinition = {
    kind: "interactive",
    eligibleSlots: [...definition.eligibleSlots],
    fixedPlacements: definition.fixedPlacements.map(({ slot, position }) => ({
      slot,
      position: copyPosition(position),
    })),
    optionalSlots: [...definition.optionalSlots],
    openCells: definition.openCells.map(copyPosition),
    maximumUnits: definition.maximumUnits,
  };
  const placements = normalizedDefinition.fixedPlacements.map(({ slot, position }) => ({
    slot,
    position: copyPosition(position),
    fixed: true,
  }));
  return {
    definition: normalizedDefinition,
    rosterSlots: [...preparedRosterSlots],
    placements,
    currentOpenCell: normalizedDefinition.openCells[0]
      ? copyPosition(normalizedDefinition.openCells[0])
      : undefined,
    rosterPage: 0,
    focus: { kind: "roster", index: 0 },
    lastRosterIndex: 0,
    submitted: false,
  };
}

function moveFocus(state: DeploymentState, direction: "up" | "down" | "left" | "right"): DeploymentState {
  const { focus } = state;
  if (focus.kind === "roster") {
    const column = Math.floor(focus.index / 5);
    const row = focus.index % 5;
    let next: DeploymentFocus = focus;
    if (direction === "up") next = { kind: "roster", index: column * 5 + (row + 4) % 5 };
    if (direction === "down") next = { kind: "roster", index: column * 5 + (row + 1) % 5 };
    if (direction === "left" && column > 0) next = { kind: "roster", index: focus.index - 5 };
    if (direction === "right" && column < 2) next = { kind: "roster", index: focus.index + 5 };
    if (direction === "right" && column === 2) next = { kind: "page", page: state.rosterPage };
    return {
      ...state,
      focus: next,
      lastRosterIndex: next.kind === "roster" ? next.index : focus.index,
    };
  }
  if (focus.kind === "page") {
    if (direction === "left") {
      return { ...state, focus: { kind: "roster", index: state.lastRosterIndex } };
    }
    if (direction === "right") return { ...state, focus: { kind: "finish" } };
    const delta = direction === "up" ? 2 : 1;
    const page = ((focus.page + delta) % 3) as 0 | 1 | 2;
    return { ...state, rosterPage: page, focus: { kind: "page", page } };
  }
  if (focus.kind === "finish") {
    return direction === "left"
      ? { ...state, focus: { kind: "page", page: state.rosterPage } }
      : state;
  }
  return direction === "left" || direction === "right"
    ? { ...state, focus: { kind: "roster", index: state.lastRosterIndex } }
    : state;
}

function cycleOpenCell(
  state: DeploymentState,
  direction: "previous" | "next",
): DeploymentState {
  const remaining = remainingOpenCells(state);
  if (remaining.length === 0) return state;
  const currentOpenCell = state.currentOpenCell;
  const currentIndex = currentOpenCell
    ? remaining.findIndex((position) => samePosition(position, currentOpenCell))
    : -1;
  const delta = direction === "previous" ? -1 : 1;
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + delta + remaining.length) % remaining.length;
  return { ...state, currentOpenCell: copyPosition(remaining[nextIndex]) };
}

function toggleRosterSlot(state: DeploymentState, slot?: number): DeploymentState {
  if (slot === undefined || !state.rosterSlots.includes(slot) || !state.definition.eligibleSlots.includes(slot)) {
    return { ...state, feedback: "empty-slot" };
  }
  const existing = state.placements.find((placement) => placement.slot === slot);
  if (existing?.fixed) return { ...state, feedback: "fixed-unit" };
  if (existing) {
    const placements = state.placements.filter((placement) => placement.slot !== slot);
    const restored = state.definition.openCells.find((position) => samePosition(position, existing.position));
    return {
      ...state,
      placements,
      currentOpenCell: restored ? copyPosition(restored) : remainingOpenCells({ ...state, placements })[0],
    };
  }
  if (state.placements.length >= state.definition.maximumUnits) {
    return { ...state, feedback: "full" };
  }
  const remaining = remainingOpenCells(state);
  const currentOpenCell = state.currentOpenCell;
  const current = currentOpenCell
    ? remaining.find((position) => samePosition(position, currentOpenCell))
    : remaining[0];
  if (!current) return { ...state, feedback: "full" };
  const placements = [...state.placements, {
    slot,
    position: copyPosition(current),
    fixed: false,
  }];
  const remainingAfter = remainingOpenCells({ ...state, placements });
  const usedIndex = state.definition.openCells.findIndex((position) => samePosition(position, current));
  const next = state.definition.openCells
    .map((_, offset) => state.definition.openCells[(usedIndex + offset + 1) % state.definition.openCells.length])
    .find((position) => remainingAfter.some((candidate) => samePosition(position, candidate)));
  return {
    ...state,
    placements,
    currentOpenCell: next ? copyPosition(next) : undefined,
  };
}

export function reduceDeployment(
  state: DeploymentState,
  action: DeploymentAction,
): DeploymentState {
  if (state.submitted) return state;
  if (state.feedback) {
    return action.type === "dismiss-feedback"
      ? { ...state, feedback: undefined }
      : state;
  }
  if (action.type === "dismiss-feedback") return state;
  if (action.type === "move-focus") return moveFocus(state, action.direction);
  if (action.type === "focus-roster") {
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= 15) return state;
    return {
      ...state,
      focus: { kind: "roster", index: action.index },
      lastRosterIndex: action.index,
    };
  }
  if (action.type === "focus-finish") return { ...state, focus: { kind: "finish" } };
  if (action.type === "focus-map") return { ...state, focus: { kind: "map" } };
  if (action.type === "toggle-roster-slot") return toggleRosterSlot(state, action.slot);
  if (action.type === "select-page") {
    return {
      ...state,
      rosterPage: action.page,
      focus: { kind: "page", page: action.page },
    };
  }
  if (action.type === "cycle-open-cell") return cycleOpenCell(state, action.direction);
  if (action.type === "select-open-cell") {
    const selected = remainingOpenCells(state)
      .find((position) => samePosition(position, action.position));
    return selected
      ? { ...state, currentOpenCell: copyPosition(selected), focus: { kind: "map" } }
      : state;
  }
  validateDeploymentResult(state.definition, { placements: state.placements });
  return {
    ...state,
    placements: normalizedPlacements(state.definition, state.placements),
    currentOpenCell: undefined,
    focus: { kind: "finish" },
    submitted: true,
  };
}

export function finishDeployment(state: DeploymentState): DeploymentResult {
  const result = { placements: normalizedPlacements(state.definition, state.placements) };
  validateDeploymentResult(state.definition, result);
  return result;
}

export function validateDeploymentResult(
  definition: InteractiveDeploymentDefinition,
  result: DeploymentResult,
): void {
  const slots = result.placements.map(({ slot }) => slot);
  const positions = result.placements.map(({ position }) => positionKey(position));
  assertUniqueNumbers(slots, "deployment result");
  if (new Set(positions).size !== positions.length) {
    throw new Error("deployment result must not contain overlapping positions");
  }
  if (result.placements.length < definition.fixedPlacements.length
    || result.placements.length > definition.maximumUnits) {
    throw new Error("deployment result unit count is outside the allowed range");
  }
  for (const fixed of definition.fixedPlacements) {
    const placement = result.placements.find(({ slot }) => slot === fixed.slot);
    if (!placement?.fixed || !samePosition(placement.position, fixed.position)) {
      throw new Error(`fixed slot ${fixed.slot} is missing or moved`);
    }
  }
  const optional = new Set(definition.optionalSlots);
  const openCells = new Set(definition.openCells.map(positionKey));
  for (const placement of result.placements.filter(({ fixed }) => !fixed)) {
    if (!optional.has(placement.slot) || !openCells.has(positionKey(placement.position))) {
      throw new Error(`optional slot ${placement.slot} has an invalid placement`);
    }
  }
}
