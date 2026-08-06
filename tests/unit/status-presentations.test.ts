import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  activeUnitStatusPresentations,
  UNIT_STATUS_PRESENTATIONS,
} from "../../src/game/content/status-presentations";
import { emptyUnitStatuses } from "../../src/game/simulation/status";

const EXPECTED_PNG_HASHES = [
  "716a8d77e873b8f2045c5d74ea536a0d463ace1cc1cb07ebc2a13fe9ec7ad867",
  "d6e7a9a4669260bde1e7392af3a2978825bdf63a4d57355eb6314a8a7d586905",
  "39764ba836c330d42755733c0db58aedf03f94c765feaed7651d2e43de120249",
  "db30152672419684406ceb8da5d782e1592001348ba79a1c440c00d0b649723b",
  "c47605edb26e738e7588ac857c710240961d47050448c6399832262c29cd5feb",
  "1f35c1adf5f235976b3d7a0faf4bd84fb626e058e568aa4c98c7fcc423c4a468",
  "af451a6d3ed0991f6966c531652617095979909c6a59ef1881da025377b63aa3",
  "9c0a12d10dcf6778a831faf0923f286fc1c3d896ec51e13b4e3263c0ae05193f",
] as const;

describe("unit status presentations", () => {
  it("keeps the native A/17 slot order and packs only active semantic states", () => {
    expect(UNIT_STATUS_PRESENTATIONS.map(({ key, nativeFrame }) => [key, nativeFrame])).toEqual([
      ["attackUp", 0],
      ["defenseUp", 1],
      ["magicGuard", 2],
      ["confusion", 3],
      ["attackDown", 4],
      ["defenseDown", 5],
      ["poison", 6],
      ["techniqueSeal", 7],
    ]);

    const statuses = emptyUnitStatuses();
    statuses.magicGuard = 1;
    statuses.attackDown = 3;
    statuses.techniqueSeal = 2;
    expect(activeUnitStatusPresentations(statuses).map(({ key, remainingRounds }) => [
      key,
      remainingRounds,
    ])).toEqual([
      ["magicGuard", 1],
      ["attackDown", 3],
      ["techniqueSeal", 2],
    ]);
  });

  it("publishes the eight evidence-rendered icons byte for byte", async () => {
    await Promise.all(UNIT_STATUS_PRESENTATIONS.map(async ({ source, nativeFrame }) => {
      const bytes = await readFile(path.resolve("public", source.replace(/^\//u, "")));
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      expect(sha256).toBe(EXPECTED_PNG_HASHES[nativeFrame]);
    }));
  });
});
