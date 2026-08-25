import { existsSync } from "node:fs";
import path from "node:path";

/**
 * `reverse/` 下的取证语料被 gitignore，不随仓库分发，干净检出（含 GitHub CI）上一定不存在。
 *
 * 各关的 `STAGE*_SOURCES` 表记录了生成器消费的证据来源（path + sha256 + bytes），对应的
 * 「byte-identical」用例会逐条回读这些路径校验哈希——那是维护者本机专属的检查，缺语料时
 * 它只会报 `ENOENT`，看起来像仓库坏了。用 `it.skipIf(!EVIDENCE_AVAILABLE)` 明确跳过，
 * 让干净检出上显示为 skipped 而不是 failed，也不会伪装成 passed。
 *
 * 这些用例在本机始终照常运行，因此不会因为长期跳过而悄悄失效。
 */
const workspace = path.resolve(import.meta.dirname, "../..");

// `STAGE*_SOURCES` 实际引用、且被 reverse/.gitignore 排除的全部取证根目录。
// 少列一个的后果是：本机缺那一个时用例仍会以 ENOENT 失败，而不是干净地跳过。
// （SOURCES 也引用 reverse/notes/，但它随仓库分发，不影响判断。）
const EVIDENCE_ROOTS = [
  "reverse/converted",
  "reverse/decoded",
  "reverse/dumps",
  "reverse/extracted",
  "reverse/parsed/native",
  "reverse/renders",
  "reverse/unpacked",
];

export const EVIDENCE_AVAILABLE = EVIDENCE_ROOTS
  .every((relative) => existsSync(path.join(workspace, relative)));
