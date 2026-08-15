// GENERATED FILE — run `pnpm content:backgrounds` after changing the
// generator or its native sources. Do not edit by hand.
//
// Module 29 picks the full-screen battle backdrop once per ordinary attack:
// 0000:95F8 reads the DS:78DC stage table, then — unless the stage is exempt —
// 0000:962E replaces the record from the logical terrain slot under the
// defender cell DS:77C1.

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

export const FULL_COMBAT_BACKGROUND_EVIDENCE = {
  "module": "module29 (0029-unpacked.bin)",
  "moduleSha256": "6e1ad6deb65fa9db48c9853f4b2564829d41954891d063ead84be027befc19c4",
  "stageTable": "DS:78DC",
  "stageTableTerminator": "DS:7984",
  "selectedRecord": "DS:77B2",
  "currentStage": "DS:2E77",
  "defenderCell": "DS:77C1",
  "graphicsContainer": "C.SWF",
  "backdropSize": [
    448,
    148
  ],
  "palette": "runtime main-module offset 9CA8h; written by routine 31E0h",
  "unreachableSwitchArms": [
    {
      "slot": 8,
      "record": 29,
      "stageOverrides": []
    }
  ],
  "renderedRecords": [
    {
      "record": 0,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "dcb142f12447f87bd3e92f01dc112576ce0ae3695d5fabf511520c480dcaf15d"
    },
    {
      "record": 5,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "5352ff8fdf2a30fa0dd6729101e30f8baf42c25ec368058c7eec841b57ee5d57"
    },
    {
      "record": 6,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "383b30c5c9dba534c91c098eedd3ef54be114c7bd1be80b714eb65e717c4617d"
    },
    {
      "record": 7,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "5809903b4f022e2471bd387240da1e6959ec197583ff5eb4a4a2f1a09ad965f1"
    },
    {
      "record": 8,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "3bd7a2d1c17a28eab8cd79a240b2757855f583992b98206af4de082c8d94b4ac"
    },
    {
      "record": 11,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "420dfa17524f2f9dcc2daa8f391f97377232e28eaa4e62b4e086e95760e144a3"
    },
    {
      "record": 12,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "4e78ada8bd4e6f42edf5ed03f5ef8f115e485811660e4cd8102ba174599d65d2"
    },
    {
      "record": 14,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "8ac085a3a13ad1c4bb07125f4622c039cef2781cbd62144aa3cb5d55bcb82bd9"
    },
    {
      "record": 15,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "33c03eaec900edc435d2eae08b86bb2acd04d79ca061eb33b2f3e198a89924c7"
    },
    {
      "record": 16,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "e8ea825db700e368247c992714072edf0444b856e101eafa6f1f772fe6a95331"
    },
    {
      "record": 17,
      "sourceRows": 149,
      "clampedRows": 148,
      "sha256": "ac2d27cce68e0babefddb96b92888f04e79e5c03f7a4a0cd2946036caa639374"
    },
    {
      "record": 18,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "eb5974ca5d678902ea2e56a3eb9aaf463623a4027dc6668e62af74e1b2d06668"
    },
    {
      "record": 19,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "e4ddebe59ccfee792514cbc9f43f7bb1d5bcd77eced21476734cd3624e267576"
    },
    {
      "record": 20,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "d704361bb223127008ab7af908cde4c4b1239e83c9676cfb4010d99a66b2c1df"
    },
    {
      "record": 21,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "716ba55998c51dff878cc29778b2590e6b945d47e54f550bd4fb7e8e63ece0ec"
    },
    {
      "record": 22,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "4b414a745cdffd5700079299df692da8d0eac463ca880286f95250d1fb5bd8e5"
    },
    {
      "record": 23,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "4261ed8bc01257c6766a844fb63f252315687c8628a4d6f80d2469351c07bc09"
    },
    {
      "record": 24,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "ec359f04c27b8ae83e4d68f33a276d5426b3c607c11eb345e3652c41dbb3d690"
    },
    {
      "record": 25,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "00ded9d63eb36f3620898b24eb2e2b41342358723031e7b6e0a206efa1e1ec3c"
    },
    {
      "record": 27,
      "sourceRows": 149,
      "clampedRows": 148,
      "sha256": "01b11de3e118982bdfa396f5d2f6e2589feae1750b62f1b5f8508f5b929daa26"
    },
    {
      "record": 28,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "2bdebb62c8edefbb8790368b34dfbdb6d3950190265e1c8c560027b3ef8f0aae"
    },
    {
      "record": 29,
      "sourceRows": 148,
      "clampedRows": 148,
      "sha256": "e4ddebe59ccfee792514cbc9f43f7bb1d5bcd77eced21476734cd3624e267576"
    },
    {
      "record": 31,
      "sourceRows": 148,
      "clampedRows": 148,
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
    }
  ]
} as const;
