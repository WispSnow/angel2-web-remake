import { describe, expect, it } from "vitest";
import {
  cameraFocusForOrigin,
  cameraOriginForFocus,
  clampCameraFocus,
  clampCameraOrigin,
} from "../../src/game/camera";
import { STAGE0_DEFINITION } from "../../src/game/content/stages";
import {
  STAGE1_CAMERA_ORIGIN_BOUNDS,
  STAGE1_DEFINITION,
  STAGE1_TERRAIN_CONTENT_BOUNDS,
} from "../../src/game/content/stage1";

describe("battle camera boundaries", () => {
  it("derives the stage-1 pan range from its fully drawn terrain rectangle", () => {
    expect(STAGE1_TERRAIN_CONTENT_BOUNDS).toEqual({
      min: { x: 14, y: 13 },
      max: { x: 35, y: 37 },
    });
    expect(STAGE1_CAMERA_ORIGIN_BOUNDS).toEqual({
      min: { x: 14, y: 13 },
      max: { x: 26, y: 31 },
    });
  });

  it("clamps centering, minimap relocation and restored origins to stage 1", () => {
    expect(cameraOriginForFocus(STAGE1_DEFINITION, { x: 22, y: 36 }))
      .toEqual({ x: 18, y: 31 });
    expect(clampCameraOrigin(STAGE1_DEFINITION, { x: 40, y: 43 }))
      .toEqual({ x: 26, y: 31 });
    expect(clampCameraOrigin(STAGE1_DEFINITION, { x: 0, y: 0 }))
      .toEqual({ x: 14, y: 13 });
    expect(clampCameraFocus(STAGE1_DEFINITION, { x: 44, y: 46 }))
      .toEqual({ x: 35, y: 37 });
    expect(cameraFocusForOrigin(STAGE1_DEFINITION, { x: 40, y: 43 }))
      .toEqual({ x: 30, y: 34 });
  });

  it("keeps the already accepted stage-0 native address-space range", () => {
    expect(clampCameraOrigin(STAGE0_DEFINITION, { x: -1, y: -1 }))
      .toEqual({ x: 0, y: 0 });
    expect(clampCameraOrigin(STAGE0_DEFINITION, { x: 50, y: 50 }))
      .toEqual({ x: 40, y: 43 });
  });
});
