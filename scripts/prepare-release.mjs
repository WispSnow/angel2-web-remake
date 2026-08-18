import { access, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(root, "release");
const developmentOnlyFiles = new Set([
  "arena.html",
  "class-showdown.html",
  "promotion-lab.html",
  "debug.html",
  "portrait-lab.html",
  "combat-lab.html",
  "deployment-lab.html",
  "technique-lab.html",
]);

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(target));
    else files.push(target);
  }
  return files;
}

if (!(await pathExists(releaseDirectory))) {
  throw new Error("release directory was not produced by the release build");
}

for (const file of developmentOnlyFiles) {
  const target = path.join(releaseDirectory, file);
  if (await pathExists(target)) {
    throw new Error(`release build unexpectedly contains ${file}`);
  }
}

// The only public assets used by the player build are under original/.
// Lab-only maps would otherwise be copied by Vite's public directory pass.
await rm(path.join(releaseDirectory, "assets", "labs"), { recursive: true, force: true });

const files = await collectFiles(releaseDirectory);
const forbidden = files.filter((file) => {
  const name = path.basename(file);
  if (/^deployment-lab-.*\.css$/u.test(name)) return false;
  return /debug-scenarios|debug-roster|(?:^|-)lab(?:-|\.)/u.test(name);
});
if (forbidden.length > 0) {
  throw new Error(`release build contains development-only bundles: ${forbidden.map((file) => path.relative(releaseDirectory, file)).join(", ")}`);
}

const indexPath = path.join(releaseDirectory, "index.html");
if (!(await pathExists(indexPath))) throw new Error("release build is missing index.html");

const stats = await Promise.all(files.map(async (file) => (await stat(file)).size));
const bytes = stats.reduce((sum, size) => sum + size, 0);
console.log(`release ready: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MiB`);
