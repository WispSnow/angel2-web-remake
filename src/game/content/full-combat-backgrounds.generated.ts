// GENERATED FILE — run `pnpm content:backgrounds` after changing the
// generator or its native sources. Do not edit by hand.
//
// Module 29 picks the full-screen battle backdrop once per ordinary attack:
// 0000:95F8 reads the DS:78DC stage table, then — unless the stage is exempt —
// 0000:962E replaces the record from the logical terrain slot under the
// defender cell DS:77C1. Every substep, 0000:AEC3 composes that record
// into the battle buffer in five layers and 0000:AEEF advances their phase words;
// 0000:F2CC presents part of the buffer inside the frame drawn at 0000:9B73.

export interface FullCombatBackgroundStageEntry {
  readonly nativeStage: number;
  readonly record: number;
}

export interface FullCombatBackgroundTerrainEntry {
  readonly terrainSlot: number;
  readonly record: number;
  /** Stages whose own record replaces the shared one for this slot. */
  readonly stageOverrides: readonly FullCombatBackgroundStageEntry[];
}

export const FULL_COMBAT_BACKGROUND_STAGE_TABLE: readonly FullCombatBackgroundStageEntry[] = [
  { nativeStage: 0, record: 5 },
  { nativeStage: 1, record: 8 },
  { nativeStage: 2, record: 8 },
  { nativeStage: 3, record: 16 },
  { nativeStage: 4, record: 7 },
  { nativeStage: 5, record: 7 },
  { nativeStage: 6, record: 22 },
  { nativeStage: 7, record: 24 },
  { nativeStage: 8, record: 24 },
  { nativeStage: 9, record: 16 },
  { nativeStage: 10, record: 27 },
  { nativeStage: 11, record: 17 },
  { nativeStage: 12, record: 29 },
  { nativeStage: 13, record: 17 },
  { nativeStage: 14, record: 14 },
  { nativeStage: 15, record: 14 },
  { nativeStage: 16, record: 14 },
  { nativeStage: 17, record: 14 },
  { nativeStage: 18, record: 14 },
  { nativeStage: 19, record: 14 },
  { nativeStage: 20, record: 14 },
  { nativeStage: 21, record: 23 },
  { nativeStage: 22, record: 25 },
  { nativeStage: 23, record: 31 },
  { nativeStage: 24, record: 31 },
  { nativeStage: 25, record: 0 },
  { nativeStage: 26, record: 7 },
  { nativeStage: 27, record: 6 },
  { nativeStage: 28, record: 6 },
  { nativeStage: 29, record: 8 },
  { nativeStage: 30, record: 5 },
  { nativeStage: 31, record: 19 },
  { nativeStage: 32, record: 19 },
  { nativeStage: 33, record: 12 },
  { nativeStage: 34, record: 11 },
  { nativeStage: 35, record: 11 },
  { nativeStage: 36, record: 15 },
  { nativeStage: 37, record: 15 },
  { nativeStage: 38, record: 0 },
  { nativeStage: 42, record: 5 },
  { nativeStage: 43, record: 16 },
  { nativeStage: 49, record: 0 },
];

/** 95F8 restarts its cursor at the table head, so unlisted stages land here. */
export const FULL_COMBAT_BACKGROUND_FALLBACK_RECORD = 5;

/** Stages that keep their table record no matter what the defender stands on. */
export const FULL_COMBAT_BACKGROUND_TERRAIN_EXEMPT_STAGES: readonly number[] = [23, 24, 6];

export const FULL_COMBAT_BACKGROUND_TERRAIN_TABLE: readonly FullCombatBackgroundTerrainEntry[] = [
  { terrainSlot: 1, record: 18, stageOverrides: [] },
  { terrainSlot: 2, record: 16, stageOverrides: [] },
  { terrainSlot: 3, record: 17, stageOverrides: [] },
  { terrainSlot: 7, record: 19, stageOverrides: [{ nativeStage: 10, record: 28 }] },
  { terrainSlot: 12, record: 19, stageOverrides: [{ nativeStage: 10, record: 28 }] },
  { terrainSlot: 8, record: 19, stageOverrides: [{ nativeStage: 10, record: 28 }] },
  { terrainSlot: 5, record: 20, stageOverrides: [] },
  { terrainSlot: 6, record: 21, stageOverrides: [] },
  { terrainSlot: 9, record: 29, stageOverrides: [] },
];

export const FULL_COMBAT_BACKGROUND_RECORDS: readonly number[] = [0, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 31];

export interface FullCombatBackdropLayer {
  readonly layer: number;
  readonly firstRow: number;
  readonly rows: number;
  /**
   * `row-cyclic` rows wrap within themselves; a `linear` layer is one byte
   * run, so the part of a row past its phase continues into the next source row.
   */
  readonly copy: "row-cyclic" | "linear";
  /** Source bytes added before the phase; the row-cyclic start is taken modulo one row. */
  readonly seedBytes: number;
  /** Code-segment word holding the layer's phase, in source bytes. */
  readonly phaseWord: string;
  /** Bytes added to the phase for every composed substep under `:R` / `:L`. */
  readonly rightStep: number;
  readonly leftStep: number;
}

/** 0000:AF8A composes buffer rows 0..149 from these five layers. */
export const FULL_COMBAT_BACKDROP_LAYERS: readonly FullCombatBackdropLayer[] = [
  { layer: 0, firstRow: 0, rows: 112, copy: "row-cyclic", seedBytes: 58, phaseWord: "CS:AFD9", rightStep: 1, leftStep: -1 },
  { layer: 1, firstRow: 112, rows: 8, copy: "linear", seedBytes: 0, phaseWord: "CS:AFDB", rightStep: 2, leftStep: -2 },
  { layer: 2, firstRow: 120, rows: 8, copy: "linear", seedBytes: 0, phaseWord: "CS:AFDD", rightStep: 3, leftStep: -3 },
  { layer: 3, firstRow: 128, rows: 8, copy: "linear", seedBytes: 0, phaseWord: "CS:AFDF", rightStep: 4, leftStep: -4 },
  { layer: 4, firstRow: 136, rows: 14, copy: "linear", seedBytes: 0, phaseWord: "CS:AFE1", rightStep: 5, leftStep: -5 },
];

/**
 * The wrap routines write the reset value outright once a phase crosses the
 * limit, so a step that overshoots loses its remainder instead of wrapping.
 */
export const FULL_COMBAT_BACKDROP_WRAP = {
  rowBytes: 56,
  right: { resetWhen: "atOrAbove", limit: 56, reset: 0 },
  left: { resetWhen: "atOrBelow", limit: 0, reset: 56 },
} as const;

/** The planar battle buffer; its x = 0 column sits at this screen position. */
export const FULL_COMBAT_BATTLE_BUFFER = { width: 448, rows: 192, composedRows: 150, screenX: 96, screenY: 158 } as const;

/**
 * The only part of the buffer 0000:F2CC copies to the screen; under `YD`
 * every other present shows it `displacedBufferY` rows further down.
 */
export const FULL_COMBAT_PRESENT_WINDOW = { bufferX: 8, bufferY: 0, width: 432, height: 147, displacedBufferY: 4 } as const;

export interface FullCombatWindowFrameRect {
  readonly descriptor: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Gameplay palette index. */
  readonly color: number;
}

/** 0000:9B73 fills these screen rectangles in order before 0000:9E28 draws the gauges. */
export const FULL_COMBAT_WINDOW_FRAME: readonly FullCombatWindowFrameRect[] = [
  { descriptor: "DS:7DEA", x: 96, y: 151, width: 448, height: 8, color: 0 },
  { descriptor: "DS:7DF4", x: 96, y: 306, width: 446, height: 12, color: 0 },
  { descriptor: "DS:7DFE", x: 96, y: 151, width: 8, height: 165, color: 0 },
  { descriptor: "DS:7E08", x: 536, y: 151, width: 8, height: 165, color: 0 },
  { descriptor: "DS:7E12", x: 97, y: 152, width: 446, height: 6, color: 14 },
  { descriptor: "DS:7E1C", x: 97, y: 306, width: 446, height: 11, color: 14 },
  { descriptor: "DS:7E26", x: 97, y: 152, width: 6, height: 165, color: 14 },
  { descriptor: "DS:7E30", x: 537, y: 152, width: 6, height: 165, color: 14 },
  { descriptor: "DS:7E3A", x: 99, y: 155, width: 442, height: 1, color: 2 },
  { descriptor: "DS:7E44", x: 541, y: 154, width: 1, height: 160, color: 2 },
  { descriptor: "DS:7E4E", x: 98, y: 154, width: 1, height: 160, color: 2 },
  { descriptor: "DS:7E58", x: 99, y: 154, width: 442, height: 1, color: 0 },
  { descriptor: "DS:7E62", x: 540, y: 154, width: 1, height: 160, color: 0 },
  { descriptor: "DS:7E6C", x: 99, y: 154, width: 1, height: 160, color: 0 },
];

/** The screen box the frame rectangles span. */
export const FULL_COMBAT_WINDOW_BOX = { x: 96, y: 151, width: 448, height: 167 } as const;

export const FULL_COMBAT_BACKGROUND_EVIDENCE = {
  "module": "module29 (0029-unpacked.bin)",
  "moduleSha256": "6e1ad6deb65fa9db48c9853f4b2564829d41954891d063ead84be027befc19c4",
  "stageTable": "DS:78DC",
  "stageTableTerminator": "DS:7984",
  "selectedRecord": "DS:77B2",
  "currentStage": "DS:2E77",
  "defenderCell": "DS:77C1",
  "graphicsContainer": "C.SWF",
  "backdropWidth": 448,
  "backdropRows": [
    148,
    149
  ],
  "palette": "runtime main-module offset 9CA8h; written by routine 31E0h",
  "unreachableSwitchArms": [
    {
      "slot": 8,
      "record": 29,
      "stageOverrides": []
    }
  ],
  "compositor": {
    "substep": "0000:AEC3",
    "composer": "0000:AF8A",
    "phaseUpdate": "0000:AEEF",
    "directionWord": "DS:7D31",
    "directionStops": [
      {
        "address": "0000:9859",
        "token": ":J"
      },
      {
        "address": "0000:A22B",
        "token": ":J"
      }
    ],
    "phaseWordReferences": [
      "0000:AF63",
      "0000:AF68",
      "0000:AF70",
      "0000:AF78",
      "0000:AF7D",
      "0000:AF85",
      "0000:AF95",
      "0000:AFA9",
      "0000:AFB6",
      "0000:AFC3",
      "0000:AFD0"
    ],
    "bufferPlaneTable": [
      "DS:02B9",
      "DS:02BD",
      "DS:02C1",
      "DS:02C5"
    ],
    "sourcePlaneTable": [
      "DS:02C9",
      "DS:02CD",
      "DS:02D1",
      "DS:02D5"
    ],
    "planeAllocator": "1000:0360",
    "bufferPlaneOrigin": "DS:F880",
    "sourcePlaneOrigin": "DS:0219",
    "planeBytes": 10752
  },
  "present": {
    "routine": "0000:F2CC",
    "substepCaller": "0000:ADCE",
    "holdCaller": "0000:AD51",
    "pixelOffset": 8,
    "ydModeWord": "DS:79F2",
    "ydMode": "DY",
    "ydToggleWord": "CS:AE0C",
    "ydToggle": 32,
    "ydPixelOffset": 1800,
    "screenOffset": "A000:316D",
    "mapMasks": [
      8,
      4,
      2,
      1
    ]
  },
  "windowFrame": {
    "routine": "0000:9B73",
    "fill": "0000:D050",
    "gauges": "0000:9E28",
    "box": {
      "x": 96,
      "y": 151,
      "right": 544,
      "bottom": 318
    }
  },
  "inBattleLoad": "0000:B9A4 -> 1000:0DD0",
  "renderedRecords": [
    {
      "record": 0,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "dcb142f12447f87bd3e92f01dc112576ce0ae3695d5fabf511520c480dcaf15d"
    },
    {
      "record": 5,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "5352ff8fdf2a30fa0dd6729101e30f8baf42c25ec368058c7eec841b57ee5d57"
    },
    {
      "record": 6,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "383b30c5c9dba534c91c098eedd3ef54be114c7bd1be80b714eb65e717c4617d"
    },
    {
      "record": 7,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "5809903b4f022e2471bd387240da1e6959ec197583ff5eb4a4a2f1a09ad965f1"
    },
    {
      "record": 8,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "3bd7a2d1c17a28eab8cd79a240b2757855f583992b98206af4de082c8d94b4ac"
    },
    {
      "record": 11,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "420dfa17524f2f9dcc2daa8f391f97377232e28eaa4e62b4e086e95760e144a3"
    },
    {
      "record": 12,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "4e78ada8bd4e6f42edf5ed03f5ef8f115e485811660e4cd8102ba174599d65d2"
    },
    {
      "record": 14,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "8ac085a3a13ad1c4bb07125f4622c039cef2781cbd62144aa3cb5d55bcb82bd9"
    },
    {
      "record": 15,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "33c03eaec900edc435d2eae08b86bb2acd04d79ca061eb33b2f3e198a89924c7"
    },
    {
      "record": 16,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "e8ea825db700e368247c992714072edf0444b856e101eafa6f1f772fe6a95331"
    },
    {
      "record": 17,
      "sourceRows": 149,
      "publishedRows": 148,
      "sha256": "ac2d27cce68e0babefddb96b92888f04e79e5c03f7a4a0cd2946036caa639374"
    },
    {
      "record": 18,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "eb5974ca5d678902ea2e56a3eb9aaf463623a4027dc6668e62af74e1b2d06668"
    },
    {
      "record": 19,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "e4ddebe59ccfee792514cbc9f43f7bb1d5bcd77eced21476734cd3624e267576"
    },
    {
      "record": 20,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "d704361bb223127008ab7af908cde4c4b1239e83c9676cfb4010d99a66b2c1df"
    },
    {
      "record": 21,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "716ba55998c51dff878cc29778b2590e6b945d47e54f550bd4fb7e8e63ece0ec"
    },
    {
      "record": 22,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "4b414a745cdffd5700079299df692da8d0eac463ca880286f95250d1fb5bd8e5"
    },
    {
      "record": 23,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "4261ed8bc01257c6766a844fb63f252315687c8628a4d6f80d2469351c07bc09"
    },
    {
      "record": 24,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "ec359f04c27b8ae83e4d68f33a276d5426b3c607c11eb345e3652c41dbb3d690"
    },
    {
      "record": 25,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "00ded9d63eb36f3620898b24eb2e2b41342358723031e7b6e0a206efa1e1ec3c"
    },
    {
      "record": 27,
      "sourceRows": 149,
      "publishedRows": 148,
      "sha256": "01b11de3e118982bdfa396f5d2f6e2589feae1750b62f1b5f8508f5b929daa26"
    },
    {
      "record": 28,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "2bdebb62c8edefbb8790368b34dfbdb6d3950190265e1c8c560027b3ef8f0aae"
    },
    {
      "record": 29,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "e4ddebe59ccfee792514cbc9f43f7bb1d5bcd77eced21476734cd3624e267576"
    },
    {
      "record": 31,
      "sourceRows": 148,
      "publishedRows": 148,
      "sha256": "10d0f940c02c84523738e9012951bd744267cc8845e509e42fea4f96010fb24e"
    }
  ],
  "verifiedCodeSignatures": [
    {
      "address": "0000:90D8",
      "role": "select-background-before-attack-dispatch",
      "bytes": 36,
      "sha256": "194aa0b47b3b07c68f60b56c34b8588190aa84f8eacf2f9f7e035d2018387eb5"
    },
    {
      "address": "0000:95F8",
      "role": "select-full-screen-battle-background",
      "bytes": 25,
      "sha256": "44de47145f2a8c3c9e7dd601e795b0fd960f2d49eeccc5d08a66b6daab1e26e8"
    },
    {
      "address": "0000:962E",
      "role": "override-background-by-defender-terrain",
      "bytes": 24,
      "sha256": "caae643d441c875c28680c10b0e326fe13dda80de3b9269305d6a4f4a6df0a90"
    },
    {
      "address": "1000:0360",
      "role": "allocate-battle-buffer-and-background-source-planes",
      "bytes": 52,
      "sha256": "a011062e2cb3ad40c936cd41f65d8ad68f1b60b3e4d03e7aabc66804ae53492a"
    },
    {
      "address": "0000:9859",
      "role": "full-screen-entry-stops-the-backdrop",
      "bytes": 6,
      "sha256": "7e7cee186764f6fe1460553e3890791dd0b4d9195d33d619520a97eb1e191280"
    },
    {
      "address": "0000:9B73",
      "role": "draw-battle-window-frame",
      "bytes": 88,
      "sha256": "c61f6b6638e35a5462cd866a15f14891b6ba790dc5aecc2c386f6fb0ca9dac41"
    },
    {
      "address": "0000:A22B",
      "role": "post-hit-stream-stops-the-backdrop",
      "bytes": 6,
      "sha256": "7e7cee186764f6fe1460553e3890791dd0b4d9195d33d619520a97eb1e191280"
    },
    {
      "address": "0000:AD51",
      "role": "hold-redraw-presents-without-yd",
      "bytes": 31,
      "sha256": "ce55dcc61606c5fb87d2215bc9071cc878bb9eecc7e010e50c56371088ecea49"
    },
    {
      "address": "0000:ADCE",
      "role": "substep-present-with-yd-toggle",
      "bytes": 62,
      "sha256": "93795b6ab52993359c18618cb17447f3d8822246ac8b91a77cd542803d4c30f8"
    },
    {
      "address": "0000:AEC3",
      "role": "compose-backdrop-then-advance-phases",
      "bytes": 44,
      "sha256": "6c351400f8543f6e754bc99482edae985b3c092bba28036a286717a4938a7a56"
    },
    {
      "address": "0000:AEEF",
      "role": "advance-five-backdrop-phases",
      "bytes": 155,
      "sha256": "ce974b1257795fd7a183fd373eea07f071f343f7eabe2d1bbed899b4a0a2bd0e"
    },
    {
      "address": "0000:AF8A",
      "role": "compose-five-backdrop-layers",
      "bytes": 79,
      "sha256": "65d288a487bfaabe824edfaa61289d6ddf32d6d545eb0c665cbf1a3b7dc3b415"
    },
    {
      "address": "0000:AFE3",
      "role": "wrap-far-layer-within-each-row",
      "bytes": 103,
      "sha256": "0fbd3f531e8a2155b1d16f1f1c564a26115a3ce351ccd21461fdaeb172496af2"
    },
    {
      "address": "0000:B98E",
      "role": "in-battle-load-stays-inside-module-29",
      "bytes": 27,
      "sha256": "664a74a1ddfa8ba2e118c20213b101cf0ca857ac357a3410f34f52ec5dc0accd"
    },
    {
      "address": "0000:F2CC",
      "role": "present-432x147-of-the-battle-buffer",
      "bytes": 239,
      "sha256": "325a80407d5c4c20d29395ae603190ac2430349d4b5f88481ea2a559571ee740"
    }
  ]
} as const;
