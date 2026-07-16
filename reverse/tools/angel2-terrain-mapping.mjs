#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const STAGE_COUNT = 44;
const CONFIG_WORDS = 128;
const GRID_BYTES = 2500;
const TEMPLATE_BYTES = 8506;
const TERRAIN_MAP_OFFSET = 256;
const TERRAIN_RESOURCE_PAGE_BYTES = 0x898;
const TERRAIN_RESOURCE_BYTES = TERRAIN_RESOURCE_PAGE_BYTES * 2;
const INVALID_DESCRIPTOR_OFFSET = 0xffff;
const B_TILE_PLANE_BYTES = 29184;
const B_ADDRESSABLE_TILE_BYTES = 128 * 220;

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function arrayEquals(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function readWords(buffer, offset, count) {
  return Array.from({ length: count }, (_, index) =>
    buffer.readUInt16LE(offset + index * 2));
}

function relativeSourcePath(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`decoded record path escapes B root: ${relativePath}`);
  }
  return resolved;
}

function slotCoverage(stages, field, logicalTerrainSlots) {
  return Array.from({ length: logicalTerrainSlots }, (_, logicalSlot) => {
    const references = stages.flatMap((stage) =>
      stage[field]
        .filter((entry) => entry.logicalSlot === logicalSlot)
        .map((entry) => ({
          stage: stage.stage,
          bRecord: stage.bRecord,
          bGraphicsRecord: stage.bGraphicsRecord,
          token: entry.token,
          descriptorOffset: entry.descriptorOffset,
        })));
    return {
      logicalSlot,
      referenceCount: references.length,
      stages: uniqueSorted(references.map((reference) => reference.stage)),
      references,
    };
  });
}

async function extract(
  battleTemplatesPath,
  decodedBRoot,
  terrainResourcePath,
  mapRulesPath,
  outputPath,
) {
  const [battleTemplatesBuffer, terrainResource, mapRulesBuffer] = await Promise.all([
    readFile(battleTemplatesPath),
    readFile(terrainResourcePath),
    readFile(mapRulesPath),
  ]);
  const battleTemplates = JSON.parse(battleTemplatesBuffer.toString("utf8"));
  const mapRules = JSON.parse(mapRulesBuffer.toString("utf8"));

  if (battleTemplates.stages?.length !== STAGE_COUNT) {
    throw new Error(`expected ${STAGE_COUNT} mapped B stages`);
  }
  if (terrainResource.length !== TERRAIN_RESOURCE_BYTES) {
    throw new Error(
      `UN/0056 terrain resource: expected ${TERRAIN_RESOURCE_BYTES} bytes, got ${terrainResource.length}`,
    );
  }
  if (!Number.isInteger(mapRules.logicalTerrainSlots) || mapRules.logicalTerrainSlots <= 0) {
    throw new Error("map-rules.json has no logical terrain slot count");
  }

  const stages = [];
  const invalidConfiguredOffsets = [];
  const unmappedBoardTokens = [];
  const outOfRangeLogicalSlots = [];

  for (const stage of battleTemplates.stages) {
    const decodedPath = relativeSourcePath(decodedBRoot, stage.decodedRecordPath);
    const decoded = await readFile(decodedPath);
    if (decoded.length !== TEMPLATE_BYTES || sha256(decoded) !== stage.sha256) {
      throw new Error(`stage ${stage.stage}: decoded B template length/hash mismatch`);
    }
    if (stage.bRecord % 2 !== 1) {
      throw new Error(`stage ${stage.stage}: expected an odd B template record`);
    }
    const graphicsRecord = (stage.bRecord - 1).toString().padStart(4, "0");
    const graphicsPlanes = await Promise.all(Array.from({ length: 4 }, (_, plane) =>
      readFile(path.join(decodedBRoot, graphicsRecord, `${plane.toString().padStart(2, "0")}.raw`))));
    if (graphicsPlanes.some((plane) => plane.length !== B_TILE_PLANE_BYTES)) {
      throw new Error(`stage ${stage.stage}: expected four 29184-byte B graphics planes`);
    }
    if (graphicsPlanes.some((plane) =>
      !plane.subarray(B_ADDRESSABLE_TILE_BYTES).every((value) => value === 0))) {
      throw new Error(`stage ${stage.stage}: B graphics tail is not zero-filled padding`);
    }
    const configWords = readWords(decoded, 0, CONFIG_WORDS);
    if (!arrayEquals(configWords, stage.scenarioConfigWords ?? [])) {
      throw new Error(`stage ${stage.stage}: scenarioConfigWords do not match decoded bytes`);
    }

    const usedTokens = uniqueSorted(decoded.subarray(
      TERRAIN_MAP_OFFSET,
      TERRAIN_MAP_OFFSET + GRID_BYTES,
    ));
    const usedTokenSet = new Set(usedTokens);
    const configuredMappings = [];

    for (let token = 0; token < CONFIG_WORDS; token += 1) {
      const descriptorOffset = configWords[token];
      if (descriptorOffset === INVALID_DESCRIPTOR_OFFSET) {
        if (usedTokenSet.has(token)) {
          unmappedBoardTokens.push({ stage: stage.stage, token });
        }
        continue;
      }
      if (descriptorOffset >= TERRAIN_RESOURCE_PAGE_BYTES) {
        invalidConfiguredOffsets.push({ stage: stage.stage, token, descriptorOffset });
        continue;
      }
      const logicalSlot = terrainResource[descriptorOffset];
      const minimapColorIndex = terrainResource[TERRAIN_RESOURCE_PAGE_BYTES + descriptorOffset];
      if (minimapColorIndex > 15) {
        throw new Error(
          `stage ${stage.stage} token ${token}: minimap color ${minimapColorIndex} exceeds VGA palette`,
        );
      }
      if (logicalSlot >= mapRules.logicalTerrainSlots) {
        outOfRangeLogicalSlots.push({
          stage: stage.stage,
          token,
          descriptorOffset,
          logicalSlot,
        });
      }
      configuredMappings.push({
        token,
        descriptorOffset,
        logicalSlot,
        minimapColorIndex,
        usedOnBoard: usedTokenSet.has(token),
        visualTileReference: {
          bGraphicsRecord: stage.bRecord - 1,
          tileToken: token,
          cropGeometry: {
            width: 40,
            height: 44,
            bytesPerPlane: 220,
            planeSourceOffset: token * 220,
          },
        },
      });
    }

    const usedMappings = configuredMappings.filter((entry) => entry.usedOnBoard);
    stages.push({
      stage: stage.stage,
      stageKind: stage.stageKind,
      bRecord: stage.bRecord,
      bGraphicsRecord: stage.bRecord - 1,
      decodedRecordPath: stage.decodedRecordPath,
      scenarioConfigSha256: stage.sectionSha256.scenarioConfig,
      terrainTokenMapSha256: stage.sectionSha256.terrainTokenMap,
      configuredTokenCount: configuredMappings.length,
      usedTokenCount: usedTokens.length,
      usedTokens,
      usedLogicalSlots: uniqueSorted(usedMappings.map((entry) => entry.logicalSlot)),
      configuredMappings,
      usedMappings,
    });
  }

  if (invalidConfiguredOffsets.length !== 0) {
    throw new Error(`found ${invalidConfiguredOffsets.length} descriptor offsets outside the first page`);
  }
  if (unmappedBoardTokens.length !== 0) {
    throw new Error(`found ${unmappedBoardTokens.length} board tokens without descriptor offsets`);
  }
  if (outOfRangeLogicalSlots.length !== 0) {
    throw new Error(`found ${outOfRangeLogicalSlots.length} logical slots outside MAP domain`);
  }

  const configuredSlotCoverage = slotCoverage(
    stages,
    "configuredMappings",
    mapRules.logicalTerrainSlots,
  );
  const usedSlotCoverage = slotCoverage(stages, "usedMappings", mapRules.logicalTerrainSlots);
  const configuredLogicalSlots = configuredSlotCoverage
    .filter((entry) => entry.referenceCount !== 0)
    .map((entry) => entry.logicalSlot);
  const usedLogicalSlots = usedSlotCoverage
    .filter((entry) => entry.referenceCount !== 0)
    .map((entry) => entry.logicalSlot);
  const uniqueConfigTables = new Set(
    battleTemplates.stages.map((stage) => stage.scenarioConfigWords.join(",")),
  ).size;
  const allUsedTokens = uniqueSorted(stages.flatMap((stage) => stage.usedTokens));

  const result = {
    format: "ANGEL2 stage terrain-token to logical-slot mapping",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    sources: {
      battleTemplates: {
        path: battleTemplatesPath,
        bytes: battleTemplatesBuffer.length,
        sha256: sha256(battleTemplatesBuffer),
      },
      decodedBRoot,
      terrainResource: {
        path: terrainResourcePath,
        source: "UN.SWF record 56, decoded stream 0",
        bytes: terrainResource.length,
        sha256: sha256(terrainResource),
      },
      mapRules: {
        path: mapRulesPath,
        bytes: mapRulesBuffer.length,
        sha256: sha256(mapRulesBuffer),
      },
    },
    nativeEvidence: {
      loader:
        "module29 0000:4D65 loads startup-resource index 13 / UN.SWF record 56, decodes 4400 bytes, and copies two 0x898-byte pages to segment pointers DS:0026 and DS:0028",
      tableLifecycle:
        "the first 256 bytes of each odd B template are 128 descriptor offsets; module27 writes them into JUST.TST, while module29 1000:55DB restores them to DS:2E7D; WAR load/save uses 1000:0FBB/8995",
      lookup:
        "module29 1000:3EC6 and 0000:946A index DS:2E7D by raw token, dereference that offset in the first UN/0056 page through segment pointer DS:0026, and use the resulting byte as the MAP logical slot",
      visualTileLookup:
        "module29 0000:7E2A passes the same raw token directly to the tile drawer; 0000:47EA multiplies it by 00DCh, and 0000:3960/427A copy 44 rows of five bytes from each of four VGA planes, proving a 40x44 tile; all 176 plane tails outside the 128-token addressable region are 1024 zero bytes",
      minimapColorPage:
        "module29 0000:285D scans all 50x50 terrain cells at three-pixel steps; 0000:28A4 skips raw token 0, resolves the matching byte from the second page into the color word of a 3x3 rectangle, and calls the VGA solid-rectangle renderer at 0000:D050",
    },
    stageCount: stages.length,
    uniqueConfigTableCount: uniqueConfigTables,
    configWordsPerStage: CONFIG_WORDS,
    terrainResourcePageBytes: TERRAIN_RESOURCE_PAGE_BYTES,
    minimap: {
      width: 150,
      height: 150,
      cellWidth: 3,
      cellHeight: 3,
      nativeTopLeft: { x: 485, y: 161 },
      rawTokenZeroBehavior: "skipped; the background color remains visible",
      colorValue: "VGA 16-color palette index from UN/0056 page 1",
    },
    logicalTerrainSlots: mapRules.logicalTerrainSlots,
    allUsedTokens,
    configuredLogicalSlots,
    usedLogicalSlots,
    configuredButUnusedLogicalSlots: configuredLogicalSlots.filter(
      (slot) => !usedLogicalSlots.includes(slot),
    ),
    logicalSlotsWithoutConfiguredReferences: Array.from(
      { length: mapRules.logicalTerrainSlots },
      (_, slot) => slot,
    ).filter((slot) => !configuredLogicalSlots.includes(slot)),
    validation: {
      all44StageTemplatesVerifiedByHash: true,
      allUsedBoardTokensMapped: true,
      allDescriptorOffsetsWithinFirstResourcePage: true,
      allResolvedSlotsWithinMapDomain: true,
      allMinimapColorsWithinVgaPalette: true,
      allBGraphicsPlaneTailsZeroFilled: true,
      bTemplateConfigMatchesStructuredWords: true,
    },
    configuredSlotCoverage,
    usedSlotCoverage,
    stages,
    unresolved: [
      "name logical terrain slots 0..22 from native UI evidence",
    ],
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `mapped ${allUsedTokens.length} board tokens across ${stages.length} stage entries ` +
      `to ${usedLogicalSlots.length}/${mapRules.logicalTerrainSlots} logical slots`,
  );
  return result;
}

function usage() {
  return (
    "usage: angel2-terrain-mapping.mjs --extract battle-templates.json " +
    "DECODED_B_ROOT UN_0056_00.raw map-rules.json OUTPUT.json"
  );
}

async function main() {
  const [command, battleTemplatesPath, decodedBRoot, terrainResourcePath, mapRulesPath, outputPath] =
    process.argv.slice(2);
  if (command !== "--extract" || outputPath === undefined) {
    throw new Error(usage());
  }
  await extract(
    battleTemplatesPath,
    decodedBRoot,
    terrainResourcePath,
    mapRulesPath,
    outputPath,
  );
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});

export { extract };
