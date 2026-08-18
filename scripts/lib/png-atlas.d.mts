export interface DecodedRgbaPng {
  readonly width: number;
  readonly height: number;
  readonly pixels: Buffer;
}

export function decodeRgbaPng(buffer: Buffer, label?: string): DecodedRgbaPng;
export function encodeRgbaPng(width: number, height: number, pixels: Buffer): Buffer;
