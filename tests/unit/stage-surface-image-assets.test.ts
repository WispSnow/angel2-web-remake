import { describe, expect, test } from "vitest";
import { stageSurfaceImageUrls } from "../../src/game/stage-surface-image-assets";

describe("current stage DOM image selection", () => {
  test("predecodes bounded UI, minimap and ally figures without retaining campaign textures", () => {
    const selected = stageSurfaceImageUrls([
      "/assets/original/battle-chrome-top.png",
      "/assets/original/promotion-menu-frame.png",
      "/assets/original/native-font.png",
      "/assets/original/status-icons/06.png",
      "/assets/original/story-stage03-camp.png",
      "/assets/original/stage3-minimap.png",
      "/assets/original/unit-ally-magician.png",
      "/assets/original/technique-lab/units/ally-monk.png",
      "/assets/original/stage3-map.png",
      "/assets/original/unit-enemy-monk.png",
      "/assets/original/map-action-atlases/fire-1.png",
      "/assets/original/full-combat-atlases/left-soldier.png",
      "/assets/original/portraits/0046/base.png",
      "/assets/original/credits/000.png",
      "/assets/original/stage3-minimap.png",
    ]);

    expect(selected).toEqual([
      "/assets/original/battle-chrome-top.png",
      "/assets/original/promotion-menu-frame.png",
      "/assets/original/native-font.png",
      "/assets/original/status-icons/06.png",
      "/assets/original/story-stage03-camp.png",
      "/assets/original/stage3-minimap.png",
      "/assets/original/unit-ally-magician.png",
      "/assets/original/technique-lab/units/ally-monk.png",
    ]);
  });
});
