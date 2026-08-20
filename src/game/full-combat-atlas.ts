import {
  FULL_COMBAT_ATLAS_FRAMES,
  FULL_COMBAT_ATLASES,
} from "./content/full-combat-atlases.generated";

export interface FullCombatAtlasFrame {
  readonly image: string;
  readonly atlasId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const atlasById = new Map(FULL_COMBAT_ATLASES.map((atlas) => [atlas.id, atlas]));

export function fullCombatAtlasFrame(frameName: string): FullCombatAtlasFrame {
  if (!(frameName in FULL_COMBAT_ATLAS_FRAMES)) {
    throw new Error(`Unknown full-combat atlas frame ${frameName}`);
  }
  const frame = FULL_COMBAT_ATLAS_FRAMES[
    frameName as keyof typeof FULL_COMBAT_ATLAS_FRAMES
  ];
  const atlas = atlasById.get(frame.atlas);
  if (!atlas) throw new Error(`Missing full-combat atlas ${frame.atlas}`);
  return {
    image: atlas.image,
    atlasId: atlas.id,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  };
}

export function applyFullCombatAtlasFrame(
  element: HTMLElement,
  frameName: string,
): FullCombatAtlasFrame {
  const frame = fullCombatAtlasFrame(frameName);
  element.dataset.frameSource = frameName;
  element.dataset.atlas = frame.atlasId;
  element.style.width = `${frame.width}px`;
  element.style.height = `${frame.height}px`;
  element.style.backgroundImage = `url("${frame.image}")`;
  element.style.backgroundPosition = `${-frame.x}px ${-frame.y}px`;
  return frame;
}
