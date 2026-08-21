import { NATIVE_GAMEPLAY_PALETTE } from "./content/native-font.generated";
import type { Position } from "./types";

export type DeploymentMinimapMarkerKind = "ally" | "enemy" | "open" | "current";

export interface DeploymentMinimapMarker {
  position: Position;
  kind: DeploymentMinimapMarkerKind;
}

export interface DeploymentMinimapFrame {
  markers: readonly DeploymentMinimapMarker[];
}

export interface DeploymentMinimapOptions {
  /** Module-29 terrain export: one 3x3 source block for every battlefield cell. */
  source: string;
  /** Native module 27 always scans the complete battlefield map. */
  gridWidth: number;
  gridHeight: number;
}

/** The generated terrain PNG keeps module 29's 3-pixel cell representation. */
export const NATIVE_TERRAIN_MINIMAP_CELL_SIZE = 3;
/** Module 27 expands that terrain to one 4x4 block per cell at (440,125). */
export const NATIVE_DEPLOYMENT_MINIMAP_CELL_SIZE = 4;

const MARKER_COLOR: Readonly<Record<DeploymentMinimapMarkerKind, string>> = {
  ally: NATIVE_GAMEPLAY_PALETTE[9],
  enemy: NATIVE_GAMEPLAY_PALETTE[11],
  open: NATIVE_GAMEPLAY_PALETTE[15],
  current: NATIVE_GAMEPLAY_PALETTE[15],
};

const FRAME_COLOR = NATIVE_GAMEPLAY_PALETTE[0];

/**
 * Reproduces module 27 `0000:165B..17EE`. The terrain source is the already
 * generated 3-pixel module-29 minimap, resampled with nearest-neighbour into
 * the deployment module's 4-pixel grid; occupancy is then painted as a black
 * 4x4 cell with a 2x2 palette-colour core.
 *
 * Presentation only: this class never owns selection or deployment legality.
 */
export class DeploymentMinimap {
  private readonly image = new Image();
  private pendingFrame?: () => void;

  readonly cellSize = NATIVE_DEPLOYMENT_MINIMAP_CELL_SIZE;
  readonly width: number;
  readonly height: number;

  constructor(private readonly options: DeploymentMinimapOptions) {
    this.width = options.gridWidth * this.cellSize;
    this.height = options.gridHeight * this.cellSize;
    this.image.decoding = "async";
    this.image.addEventListener("load", () => {
      const frame = this.pendingFrame;
      this.pendingFrame = undefined;
      frame?.();
    });
    this.image.src = options.source;
  }

  render(canvas: HTMLCanvasElement, frame: DeploymentMinimapFrame): void {
    const paint = () => this.paint(canvas, frame);
    if (this.image.complete && this.image.naturalWidth > 0) paint();
    else this.pendingFrame = paint;
  }

  private paint(canvas: HTMLCanvasElement, { markers }: DeploymentMinimapFrame): void {
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = this.width;
    canvas.height = this.height;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, this.width, this.height);
    context.drawImage(
      this.image,
      0,
      0,
      this.options.gridWidth * NATIVE_TERRAIN_MINIMAP_CELL_SIZE,
      this.options.gridHeight * NATIVE_TERRAIN_MINIMAP_CELL_SIZE,
      0,
      0,
      this.width,
      this.height,
    );

    for (const { position, kind } of markers) {
      const left = position.x * this.cellSize;
      const top = position.y * this.cellSize;
      context.fillStyle = FRAME_COLOR;
      context.fillRect(left, top, 4, 4);
      context.fillStyle = MARKER_COLOR[kind];
      context.fillRect(left + 1, top + 1, 2, 2);
    }
  }

  /** Full 4x4 native cell used by the alternating current-FF projection. */
  cellRect(position: Position): { left: number; top: number; size: number } {
    return {
      left: position.x * this.cellSize,
      top: position.y * this.cellSize,
      size: this.cellSize,
    };
  }
}
