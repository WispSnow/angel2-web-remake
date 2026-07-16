#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const READ_SITES = [
  {
    address: "0000:28B9",
    offset: 0x28b9,
    hex: "8b9f7d2ea128008e",
    consumer: "minimap terrain color",
    resultUse: "uses the descriptor offset with DS:0028, the second UN/0056 page",
  },
  {
    address: "0000:9476",
    offset: 0x9476,
    hex: "8b9f7d2e06a126008ec033",
    consumer: "ordinary-combat terrain defense",
    resultUse: "uses the logical slot with the second MAP profile",
  },
  {
    address: "0000:963E",
    offset: 0x963e,
    hex: "8b9f7d2e06a126008ec033c0268a07073d",
    consumer: "terrain-dependent attack presentation",
    resultUse: "dispatches selected logical slots to battle-presentation resource numbers",
  },
  {
    address: "1000:3ECB",
    offset: 0x13ecb,
    hex: "8bb47d2e06a126008ec033db268a1c07",
    consumer: "movement rule",
    resultUse: "uses the logical slot with the first MAP profile",
  },
  {
    address: "1000:3EE6",
    offset: 0x13ee6,
    hex: "8bb47d2e06a126008ec033db268a1c07",
    consumer: "raw-token to logical-slot helper",
    resultUse: "returns the logical slot to terrain mutation/side-dependent cell code",
  },
  {
    address: "0000:9F5A",
    offset: 0x9f5a,
    hex: "8b9f7d2e06a126008ec033c0268a07078b",
    consumer: "secondary terrain-defense lookup",
    resultUse: "uses the logical slot with the second MAP profile in another combat path",
  },
];

const TERRAIN_VOCABULARY_CANDIDATES = [
  "草", "樹", "坡", "壁", "山", "橋", "淺", "海", "澤", "深", "礁", "城", "牆",
  "磁", "階", "梯", "王座", "紅布", "屋", "木板", "井", "杉", "欄", "牌", "花",
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function audit(modulePath, glyphPath, glyphMetadataPath, outputPath) {
  const [moduleBuffer, glyphBuffer, glyphMetadata] = await Promise.all([
    readFile(modulePath),
    readFile(glyphPath),
    readFile(glyphMetadataPath, "utf8").then(JSON.parse),
  ]);
  const verifiedReadSites = READ_SITES.map((site) => {
    const expected = Buffer.from(site.hex, "hex");
    const actual = moduleBuffer.subarray(site.offset, site.offset + expected.length);
    if (!actual.equals(expected)) {
      throw new Error(`${site.address}: terrain-descriptor read signature mismatch`);
    }
    return {
      address: site.address,
      fileOffset: site.offset,
      bytes: expected.length,
      signatureSha256: sha256(actual),
      consumer: site.consumer,
      resultUse: site.resultUse,
    };
  });

  const result = {
    format: "ANGEL2 logical-terrain-slot visible-name audit",
    phase: "asset_and_gdd_reconstruction_only",
    implementationFrozen: true,
    evidenceLevel: "C for the read-site audit; U/S for visible-name candidates",
    sources: {
      module: { path: modulePath, bytes: moduleBuffer.length, sha256: sha256(moduleBuffer) },
      glyphArray: {
        path: glyphPath,
        bytes: glyphBuffer.length,
        sha256: sha256(glyphBuffer),
        metadata: glyphMetadataPath,
        glyphCount: glyphMetadata.glyphCount,
      },
      exhaustiveReferenceReport: "reverse/logs/module29-terrain-ui-references.log",
    },
    descriptorTable: {
      nativeAddress: "DS:2E7D",
      entries: 128,
      entryType: "u16 offset into each 2200-byte UN/0056 page",
      verifiedReadSiteCount: verifiedReadSites.length,
      verifiedReadSites,
    },
    conclusion: {
      visibleNameBindingFound: false,
      scope: "module29 battle runtime and every native DS:2E7D read site reported by the current Ghidra project",
      exactStatement:
        "no DS:2E7D consumer enters a glyph, string, or HUD-name renderer; the table is consumed only by rules, minimap color, terrain mutation/selection, and battle presentation",
      designConsequence:
        "logical slots remain canonical numeric IDs 0..22; a future remake may attach editor-facing descriptive labels, but those labels must be marked inferred until separately proven",
    },
    candidateVocabulary: {
      status: "unbound visual vocabulary only",
      source: "visual reading of the A/0007 raw glyph atlas; the array has no verified string delimiters or logical-slot indices",
      terms: TERRAIN_VOCABULARY_CANDIDATES,
      prohibitedInference:
        "do not assign these terms to logical slot numbers from glyph adjacency, term order, minimap color, or tile appearance alone",
    },
    uiReplayAudit: {
      date: "2026-07-14",
      environment: "DOSBox-X 2026.07.02",
      status: "inconclusive for battle HUD because that DOSBox-X replay did not reach a numbered WAR slot without risking mutation of the original saves; the later-closed Joymouse translation does not change this historical replay result",
      consequence: "does not weaken the complete native read-site audit and is not promoted to evidence of absence by itself",
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`verified ${verifiedReadSites.length} terrain-descriptor read sites`);
  console.log(`wrote ${outputPath}`);
}

const [modulePath, glyphPath, glyphMetadataPath, outputPath] = process.argv.slice(2);
if (outputPath === undefined) {
  console.error("usage: angel2-terrain-name-audit.mjs MODULE29.bin A-0007.bin A-0007.json OUTPUT.json");
  process.exitCode = 1;
} else {
  audit(modulePath, glyphPath, glyphMetadataPath, outputPath).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
