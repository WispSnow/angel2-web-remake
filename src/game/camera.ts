import type { StageDefinition } from "./content/stages";
import type { Position } from "./types";

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

export function cameraCenterOffset(stage: StageDefinition): Position {
  return {
    x: Math.floor((stage.viewport.width - 1) / 2),
    y: Math.floor((stage.viewport.height - 1) / 2),
  };
}

/** Keeps presentation-only camera state inside the stage's authored pan range. */
export function clampCameraOrigin(stage: StageDefinition, origin: Position): Position {
  const { originBounds } = stage.viewport;
  return {
    x: clamp(origin.x, originBounds.min.x, originBounds.max.x),
    y: clamp(origin.y, originBounds.min.y, originBounds.max.y),
  };
}

/** Keeps the logical battlefield focus inside cells reachable by the camera. */
export function clampCameraFocus(stage: StageDefinition, focus: Position): Position {
  const { originBounds, width, height } = stage.viewport;
  return {
    x: clamp(focus.x, originBounds.min.x, originBounds.max.x + width - 1),
    y: clamp(focus.y, originBounds.min.y, originBounds.max.y + height - 1),
  };
}

export function cameraOriginForFocus(stage: StageDefinition, focus: Position): Position {
  const center = cameraCenterOffset(stage);
  const clampedFocus = clampCameraFocus(stage, focus);
  return clampCameraOrigin(stage, {
    x: clampedFocus.x - center.x,
    y: clampedFocus.y - center.y,
  });
}

/** Whether a battlefield cell is inside the viewport drawn from `origin`. */
export function cameraContains(
  stage: StageDefinition,
  origin: Position,
  position: Position,
): boolean {
  const { width, height } = stage.viewport;
  return position.x >= origin.x
    && position.x < origin.x + width
    && position.y >= origin.y
    && position.y < origin.y + height;
}

export function cameraFocusForOrigin(stage: StageDefinition, origin: Position): Position {
  const center = cameraCenterOffset(stage);
  const clamped = clampCameraOrigin(stage, origin);
  return {
    x: clamped.x + center.x,
    y: clamped.y + center.y,
  };
}
