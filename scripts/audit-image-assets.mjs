#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "public/assets/original");
const files = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(target);
    else if (/\.(?:png|webp|jpg|jpeg|gif|bmp)$/iu.test(entry.name)) files.push(target);
  }
}

await collect(root);

const groups = new Map();
let totalBytes = 0;
for (const file of files) {
  const bytes = await readFile(file);
  totalBytes += bytes.length;
  const hash = createHash("sha256").update(bytes).digest("hex");
  const group = groups.get(hash) ?? [];
  group.push({ file, bytes: bytes.length });
  groups.set(hash, group);
}

const duplicates = [...groups.values()]
  .filter((group) => group.length > 1)
  .map((group) => ({
    files: group,
    reclaimableBytes: group.slice(1).reduce((sum, entry) => sum + entry.bytes, 0),
  }))
  .sort((left, right) => right.reclaimableBytes - left.reclaimableBytes);
const reclaimableBytes = duplicates.reduce((sum, group) => sum + group.reclaimableBytes, 0);

console.log(`image audit: ${path.relative(process.cwd(), root) || "."}`);
console.log(`  files: ${files.length}`);
console.log(`  bytes: ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`);
console.log(`  unique contents: ${groups.size}`);
console.log(`  duplicate groups: ${duplicates.length}`);
console.log(`  reclaimable by exact deduplication: ${(reclaimableBytes / 1024 / 1024).toFixed(2)} MiB`);

for (const group of duplicates.slice(0, 12)) {
  const [canonical, ...aliases] = group.files;
  console.log(`  ${path.relative(process.cwd(), canonical.file)} (${canonical.bytes} bytes)`);
  for (const alias of aliases) console.log(`    = ${path.relative(process.cwd(), alias.file)}`);
}
