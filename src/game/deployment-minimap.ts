import type { Position } from "./types";
import type { CellBounds } from "./content/terrain";

export { terrainContentBounds } from "./content/terrain";
export type { CellBounds } from "./content/terrain";

export type DeploymentMinimapMarkerKind = "ally" | "enemy" | "open" | "current";

export interface DeploymentMinimapMarker {
  position: Position;
  kind: DeploymentMinimapMarkerKind;
}

export interface DeploymentMinimapFrame {
  markers: readonly DeploymentMinimapMarker[];
  zone?: CellBounds;
}

export interface DeploymentMinimapOptions {
  /** Native 3-pixel-per-cell terrain minimap render for the stage. */
  source: string;
  /** Sub-rectangle of the battlefield the preview shows, in cells. */
  viewBox: CellBounds;
  /** Longest side of the rendered canvas, in logical screen pixels. */
  maxPixels: number;
}

/**
 * `movement-terrain-rules.md`: the native terrain minimap fills one 3x3 pixel
 * block per battlefield cell, so the exported PNG is always `3 * grid` wide.
 */
export const NATIVE_MINIMAP_CELL_SIZE = 3;

/**
 * Module 29 `28DDh/2924h` draws every occupancy marker as a palette-0 frame one
 * pixel larger than the cell, plus a core one pixel smaller inset by one pixel.
 * The remake keeps those shapes at whatever cell size the preview is scaled to,
 * but `REMAKE-011` re-assigns the three cores to the requested side colours:
 * blue for our own units, red for the enemy and white for an unfilled `FFh`
 * deployment cell. All three stay inside the native 16-colour palette (indices
 * 9, 12 and 15) and avoid the terrain water blue so markers never blend in.
 */
const MARKER_COLOR: Readonly<Record<DeploymentMinimapMarkerKind, string>> = {
  ally: "#5555ff",
  enemy: "#ff5555",
  open: "#ffffff",
  current: "#ffffff",
};

/** The blink accent painted over the current landing cell by the DOM overlay. */
export const DEPLOYMENT_CURRENT_BLINK_COLOR = MARKER_COLOR.ally;

const FRAME_COLOR = "#000000";
const CURRENT_RING_COLOR = "#ffd34d";
const ZONE_COLOR = "rgba(255, 211, 77, .5)";

/**
 * Owns the decoded terrain minimap and repaints a canvas from deployment
 * markers. Presentation only: it never reads or mutates deployment rules.
 */
export class DeploymentMinimap {
  private readonly image = new Image();
  private pendingFrame?: () => void;

  readonly cellSize: number;
  readonly width: number;
  readonly height: number;

  constructor(private readonly options: DeploymentMinimapOptions) {
    const { viewBox, maxPixels } = options;
    const cells = {
      width: viewBox.max.x - viewBox.min.x + 1,
      height: viewBox.max.y - viewBox.min.y + 1,
    };
    // Integer scaling only: the source is pixel art and must not be resampled.
    this.cellSize = Math.max(
      NATIVE_MINIMAP_CELL_SIZE,
      Math.floor(maxPixels / Math.max(cells.width, cells.height)),
    );
    this.width = cells.width * this.cellSize;
    this.height = cells.height * this.cellSize;

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

  private paint(canvas: HTMLCanvasElement, { markers, zone }: DeploymentMinimapFrame): void {
    const context = canvas.getContext("2d");
    if (!context) return;
    const { viewBox } = this.options;
    canvas.width = this.width;
    canvas.height = this.height;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, this.width, this.height);
    context.drawImage(
      this.image,
      viewBox.min.x * NATIVE_MINIMAP_CELL_SIZE,
      viewBox.min.y * NATIVE_MINIMAP_CELL_SIZE,
      (this.width / this.cellSize) * NATIVE_MINIMAP_CELL_SIZE,
      (this.height / this.cellSize) * NATIVE_MINIMAP_CELL_SIZE,
      0,
      0,
      this.width,
      this.height,
    );

    if (zone) {
      const left = this.pixelX(zone.min.x);
      const top = this.pixelY(zone.min.y);
      context.strokeStyle = ZONE_COLOR;
      context.lineWidth = 1;
      context.strokeRect(
        left + .5,
        top + .5,
        (zone.max.x - zone.min.x + 1) * this.cellSize - 1,
        (zone.max.y - zone.min.y + 1) * this.cellSize - 1,
      );
    }

    const frameSize = this.cellSize + 1;
    const coreSize = this.cellSize - 1;
    for (const { position, kind } of markers) {
      const left = this.pixelX(position.x);
      const top = this.pixelY(position.y);
      if (kind === "current") {
        context.strokeStyle = CURRENT_RING_COLOR;
        context.lineWidth = 1;
        context.strokeRect(left - 2.5, top - 2.5, frameSize + 4, frameSize + 4);
      }
      context.fillStyle = FRAME_COLOR;
      context.fillRect(left, top, frameSize, frameSize);
      context.fillStyle = MARKER_COLOR[kind];
      context.fillRect(left + 1, top + 1, coreSize, coreSize);
    }
  }

  /** Canvas rectangle of one marker core, for DOM accents drawn over the map. */
  coreRect(position: Position): { left: number; top: number; size: number } {
    return {
      left: this.pixelX(position.x) + 1,
      top: this.pixelY(position.y) + 1,
      size: this.cellSize - 1,
    };
  }

  private pixelX(cellX: number): number {
    return (cellX - this.options.viewBox.min.x) * this.cellSize;
  }

  private pixelY(cellY: number): number {
    return (cellY - this.options.viewBox.min.y) * this.cellSize;
  }
}
