import type { InteractiveDeploymentDefinition } from "./content/stages";
import type { PortraitRecord, UnitClassId } from "./types";
import {
  createDeploymentState,
  reduceDeployment,
  type DeploymentAction,
  type DeploymentState,
} from "./simulation/deployment";

export interface DeploymentRosterUnit {
  slot: number;
  name: string;
  portrait: PortraitRecord;
  classId: UnitClassId;
  className: string;
  experience: number;
  life: number;
}

type DeploymentListener = (state: DeploymentState) => void;

/**
 * Semantic input adapter shared by DOM, Phaser, keyboard, pointer and gamepad.
 * It owns no deployment rules; every transition still goes through the pure reducer.
 */
export class DeploymentSession {
  private currentState: DeploymentState;
  private readonly listeners = new Set<DeploymentListener>();
  readonly roster: readonly DeploymentRosterUnit[];

  constructor(
    definition: InteractiveDeploymentDefinition,
    roster: readonly DeploymentRosterUnit[],
  ) {
    this.roster = roster.map((unit) => ({ ...unit }));
    this.currentState = createDeploymentState(definition, roster.map(({ slot }) => slot));
  }

  get state(): DeploymentState {
    return this.currentState;
  }

  onChange(listener: DeploymentListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  rosterSlotAt(index: number, page = this.currentState.rosterPage): number | undefined {
    return this.currentState.definition.eligibleSlots[page * 15 + index];
  }

  rosterUnitFor(slot: number | undefined): DeploymentRosterUnit | undefined {
    return slot === undefined ? undefined : this.roster.find((unit) => unit.slot === slot);
  }

  moveFocus(direction: "up" | "down" | "left" | "right"): void {
    this.commit({ type: "move-focus", direction });
  }

  focusMap(): void {
    this.commit({ type: "focus-map" });
  }

  leaveMap(): void {
    this.commit({ type: "move-focus", direction: "left" });
  }

  primary(): void {
    if (this.dismissFeedbackOnPrimary()) return;
    const { focus } = this.currentState;
    if (focus.kind === "roster") {
      this.commit({ type: "toggle-roster-slot", slot: this.rosterSlotAt(focus.index) });
      return;
    }
    if (focus.kind === "page") {
      this.commit({ type: "select-page", page: focus.page });
      return;
    }
    if (focus.kind === "finish") {
      this.commit({ type: "finish" });
      return;
    }
    this.commit({ type: "cycle-open-cell", direction: "previous" });
  }

  secondary(): void {
    if (this.currentState.focus.kind === "map") {
      this.commit({ type: "cycle-open-cell", direction: "next" });
    }
  }

  activateRoster(index: number): void {
    if (this.dismissFeedbackOnPrimary()) return;
    this.commit(
      { type: "focus-roster", index },
      { type: "toggle-roster-slot", slot: this.rosterSlotAt(index) },
    );
  }

  activatePage(page: 0 | 1 | 2): void {
    if (this.dismissFeedbackOnPrimary()) return;
    this.commit({ type: "select-page", page });
  }

  activateFinish(): void {
    if (this.dismissFeedbackOnPrimary()) return;
    this.commit({ type: "focus-finish" }, { type: "finish" });
  }

  activateOpenCell(position: { x: number; y: number }): void {
    if (this.dismissFeedbackOnPrimary()) return;
    this.commit({ type: "select-open-cell", position });
  }

  private dismissFeedbackOnPrimary(): boolean {
    if (!this.currentState.feedback) return false;
    this.commit({ type: "dismiss-feedback" });
    return true;
  }

  private commit(...actions: readonly DeploymentAction[]): void {
    let next = this.currentState;
    for (const action of actions) next = reduceDeployment(next, action);
    if (next === this.currentState) return;
    this.currentState = next;
    for (const listener of this.listeners) listener(next);
  }
}
