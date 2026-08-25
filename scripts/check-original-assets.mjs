#!/usr/bin/env node

// 原版素材包不随仓库分发（见 README「获取原版素材」）。三个主要入口在启动前调用本脚本，
// 是因为素材缺失时它们各自的失败方式都无法让人看出「素材没装」：
//   pnpm dev          载入页只会停在可重试的资源失败提示；
//   pnpm test         1,296 条 SHA-256 断言一起失败刷屏；
//   pnpm build:release prepare-release.mjs 报的是图集数量不符。
// 这里在那之前给出确切路径和安装命令。

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = path.join(root, "public/assets/original");
const manifestPath = path.join(assetsRoot, "resource-manifest.v1.json");
const identityModule = path.join(root, "src/game/content/resource-manifest.generated.ts");

const verifyHashes = process.argv.includes("--verify-hashes");
const quiet = process.argv.includes("--quiet");

const INSTALL_HINT = [
  "",
  "  取得素材包 / Get the asset pack:",
  "    https://github.com/WispSnow/angel2-web-remake#获取原版素材",
  "",
  "  安装 / Install:",
  "    unzip -d public/assets angel2-assets-<version>.zip",
  "",
  `  期望路径 / Expected path:`,
  `    ${path.relative(root, assetsRoot)}/resource-manifest.v1.json`,
].join("\n");

function fail(headline, detail) {
  process.exitCode = 1;
  console.error(`\n✗ ${headline}`);
  if (detail) console.error(detail);
  console.error(INSTALL_HINT);
  console.error("");
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

// 代码侧的期望身份由 scripts/generate-resource-manifest.mjs 写入，随代码一起提交，
// 因此不需要额外的 lock 文件：素材包版本对不对，比对这一个哈希就够了。
async function expectedIdentity() {
  const source = await readFile(identityModule, "utf8");
  const match = source.match(/RESOURCE_MANIFEST_IDENTITY = "([0-9a-f]{64})"/u);
  if (!match) throw new Error(`${path.relative(root, identityModule)} has no readable identity`);
  return match[1];
}

if (!(await pathExists(assetsRoot))) {
  fail(
    "缺少原版素材包 / Original asset pack is missing.",
    "  仓库不分发原版素材，需要单独安装。\n"
    + "  The repository does not ship original game assets; install the pack separately.",
  );
}
else if (!(await pathExists(manifestPath))) {
  // 把包解压到 public/assets/original/ 而不是 public/assets/ 会多套一层，这是最常见的手误。
  const nested = path.join(assetsRoot, "original/resource-manifest.v1.json");
  const detail = await pathExists(nested)
    ? "  素材包多解压了一层：发现 public/assets/original/original/。\n"
      + "  Pack was extracted one level too deep. Move its contents up one directory,\n"
      + "  or re-extract with:  unzip -d public/assets angel2-assets-<version>.zip"
    : "  目录存在但没有 resource-manifest.v1.json，素材包不完整或放错了位置。\n"
      + "  The directory exists but has no manifest — the pack is incomplete or misplaced.";
  fail("原版素材包位置不正确 / Asset pack is in the wrong place.", detail);
}
else {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const expected = await expectedIdentity();

  if (manifest.identity !== expected) {
    fail(
      "素材包版本与代码不匹配 / Asset pack does not match this checkout.",
      `  代码期望 / code expects:  ${expected.slice(0, 16)}…\n`
      + `  素材包提供 / pack provides: ${String(manifest.identity).slice(0, 16)}…\n`
      + "  请改用与当前 commit 对应的素材包版本，或重跑内容生成器。\n"
      + "  Use the asset pack built for this commit, or re-run the content generators.",
    );
  }
  else {
    const missing = [];
    const wrongSize = [];
    for (const asset of manifest.assets) {
      const local = path.join(root, "public", asset.url);
      let info;
      try {
        info = await stat(local);
      } catch {
        missing.push(asset.url);
        continue;
      }
      if (info.size !== asset.bytes) wrongSize.push(asset.url);
    }

    if (missing.length > 0 || wrongSize.length > 0) {
      const sample = (list) => list.slice(0, 5).map((url) => `    ${url}`).join("\n")
        + (list.length > 5 ? `\n    …（共 ${list.length} 项 / ${list.length} total）` : "");
      const detail = [
        missing.length > 0 ? `  缺失 / missing (${missing.length}):\n${sample(missing)}` : "",
        wrongSize.length > 0 ? `  大小不符 / wrong size (${wrongSize.length}):\n${sample(wrongSize)}` : "",
        "  素材包不完整或已损坏。/ The pack is incomplete or corrupted.",
      ].filter(Boolean).join("\n");
      fail("原版素材包不完整 / Asset pack is incomplete.", detail);
    }
    else if (verifyHashes) {
      const corrupted = [];
      for (const asset of manifest.assets) {
        const body = await readFile(path.join(root, "public", asset.url));
        if (createHash("sha256").update(body).digest("hex") !== asset.sha256) {
          corrupted.push(asset.url);
        }
      }
      if (corrupted.length > 0) {
        fail(
          "原版素材内容校验失败 / Asset content failed verification.",
          `  ${corrupted.length} 个文件的 SHA-256 与清单不符 / files do not match the manifest:\n`
          + corrupted.slice(0, 5).map((url) => `    ${url}`).join("\n"),
        );
      }
      else if (!quiet) {
        console.log(`原版素材完整：${manifest.assets.length} 个资源，SHA-256 全部通过。`);
      }
    }
    else if (!quiet) {
      console.log(`原版素材完整：${manifest.assets.length} 个资源，身份 ${expected.slice(0, 12)}。`);
    }
  }
}
