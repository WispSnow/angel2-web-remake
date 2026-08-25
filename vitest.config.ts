import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * 少数用例在文件顶层静态 import `reverse/parsed/**.json`。缺取证语料时模块在加载阶段就
 * 失败，`it.skipIf` 根本来不及生效，只能整文件排除。
 *
 * 这里自动扫描而不是维护一份清单：新增同类用例时不会悄悄漏掉，删除时也不会留下死条目。
 * 判据只看这些文件真正 import 的 `reverse/parsed/`，与 `tests/unit/evidence.ts` 各自对应
 * 自己的依赖——那边判断的是逐条回读用的取证根目录，两者不必也不应互相耦合。
 *
 * 逐条回读的用例（`STAGE*_SOURCES`）不走这条路，它们用 `it.skipIf(!EVIDENCE_AVAILABLE)`
 * 自行跳过，这样在报告里显示为 skipped 而不是整个文件消失。
 */
const repositoryRoot = import.meta.dirname;
const parsedEvidenceAvailable = existsSync(path.join(repositoryRoot, "reverse/parsed/native"));
const unitDirectory = path.join(repositoryRoot, "tests/unit");

const evidenceOnlyFiles = parsedEvidenceAvailable
  ? []
  : readdirSync(unitDirectory)
    .filter((name) => name.endsWith(".test.ts"))
    .filter((name) => readFileSync(path.join(unitDirectory, name), "utf8")
      .includes('from "../../reverse/'))
    .map((name) => `tests/unit/${name}`)
    .sort();

if (evidenceOnlyFiles.length > 0) {
  // 静默排除会让「这次少跑了什么」不可见，因此固定打印一行。
  console.log(
    `[vitest] reverse/ 取证语料缺失，排除 ${evidenceOnlyFiles.length} 个仅限维护者本机的用例文件：\n`
    + evidenceOnlyFiles.map((file) => `  - ${file}`).join("\n"),
  );
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    exclude: [...configDefaults.exclude, ...evidenceOnlyFiles],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 80,
        lines: 77,
      },
    },
  },
});
