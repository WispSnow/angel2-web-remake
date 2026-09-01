#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = path.join(root, "package.json");
const tauriConfigPath = path.join(root, "src-tauri/tauri.conf.json");
const cargoManifestPath = path.join(root, "src-tauri/Cargo.toml");
const cargoLockPath = path.join(root, "src-tauri/Cargo.lock");

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/u;

function parseVersion(raw, label) {
  const value = raw.startsWith("v") ? raw.slice(1) : raw;
  const match = value.match(SEMVER);
  if (!match) throw new Error(`${label} must use x.y.z semantic versioning: ${raw}`);
  return {
    value,
    parts: match.slice(1).map(Number),
  };
}

function nextMinorVersion(current) {
  const { parts } = parseVersion(current, "current version");
  return `${parts[0]}.${parts[1] + 1}.0`;
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left, "version").parts;
  const rightParts = parseVersion(right, "version").parts;
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function packageVersionFromToml(source, file) {
  const match = source.match(/^\[package\]\n[\s\S]*?^version = "([^"]+)"$/mu);
  if (!match) throw new Error(`${file} has no [package] version`);
  return match[1];
}

function replacePackageVersionInToml(source, nextVersion, file) {
  const replaced = source.replace(
    /(^\[package\]\n[\s\S]*?^version = ")[^"]+("$)/mu,
    `$1${nextVersion}$2`,
  );
  if (replaced === source) throw new Error(`${file} package version was not updated`);
  return replaced;
}

function packageVersionFromCargoLock(source) {
  const match = source.match(/^\[\[package\]\]\nname = "angel2-desktop"\nversion = "([^"]+)"$/mu);
  if (!match) throw new Error("src-tauri/Cargo.lock has no angel2-desktop package version");
  return match[1];
}

function replacePackageVersionInCargoLock(source, nextVersion) {
  const replaced = source.replace(
    /(^\[\[package\]\]\nname = "angel2-desktop"\nversion = ")[^"]+("$)/mu,
    `$1${nextVersion}$2`,
  );
  if (replaced === source) throw new Error("src-tauri/Cargo.lock package version was not updated");
  return replaced;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const positional = args.filter((argument) => argument !== "--dry-run");
  if (positional.length > 1) {
    throw new Error("usage: pnpm release:version [x.y.z] [--dry-run]");
  }

  const [packageSource, tauriSource, cargoManifestSource, cargoLockSource] = await Promise.all([
    readFile(packageJsonPath, "utf8"),
    readFile(tauriConfigPath, "utf8"),
    readFile(cargoManifestPath, "utf8"),
    readFile(cargoLockPath, "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);
  const tauriConfig = JSON.parse(tauriSource);
  const versions = {
    packageJson: parseVersion(String(packageJson.version), "package.json version").value,
    tauriConfig: parseVersion(String(tauriConfig.version), "tauri.conf.json version").value,
    cargoManifest: parseVersion(
      packageVersionFromToml(cargoManifestSource, "src-tauri/Cargo.toml"),
      "Cargo.toml version",
    ).value,
    cargoLock: parseVersion(packageVersionFromCargoLock(cargoLockSource), "Cargo.lock version").value,
  };
  const uniqueVersions = new Set(Object.values(versions));
  if (uniqueVersions.size !== 1) {
    throw new Error(`release versions are out of sync: ${JSON.stringify(versions)}`);
  }

  const currentVersion = versions.packageJson;
  const nextVersion = positional[0]
    ? parseVersion(positional[0], "requested version").value
    : nextMinorVersion(currentVersion);
  if (compareVersions(nextVersion, currentVersion) <= 0) {
    throw new Error(`requested version must be newer than ${currentVersion}: ${nextVersion}`);
  }

  if (dryRun) {
    console.log(`release version: ${currentVersion} -> ${nextVersion} (dry run)`);
    return;
  }

  packageJson.version = nextVersion;
  tauriConfig.version = nextVersion;
  await Promise.all([
    writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`),
    writeFile(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`),
    writeFile(
      cargoManifestPath,
      replacePackageVersionInToml(cargoManifestSource, nextVersion, "src-tauri/Cargo.toml"),
    ),
    writeFile(cargoLockPath, replacePackageVersionInCargoLock(cargoLockSource, nextVersion)),
  ]);
  console.log(`release version: ${currentVersion} -> ${nextVersion}`);
}

await main();
