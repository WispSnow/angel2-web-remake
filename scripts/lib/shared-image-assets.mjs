import { readFile, rm } from "node:fs/promises";

/**
 * Verify that a generated asset can reuse an already published runtime path.
 * The comparison is byte-for-byte so a palette, alpha, or metadata change
 * cannot be hidden behind a semantic filename alias.
 */
export async function assertIdenticalImage(left, right, label) {
  const [leftBytes, rightBytes] = await Promise.all([readFile(left), readFile(right)]);
  if (!leftBytes.equals(rightBytes)) {
    throw new Error(`${label}: shared image sources are no longer byte-identical`);
  }
}

/** Remove a legacy duplicate emitted by older generator versions. */
export async function removeDuplicateImage(target) {
  await rm(target, { force: true });
}
