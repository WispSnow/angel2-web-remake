import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve("src");

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".generated.ts")
      ? [path.normalize(target)]
      : [];
  });
}

function sourceGraph(): ReadonlyMap<string, readonly string[]> {
  const files = sourceFiles(sourceRoot);
  const known = new Set(files);
  return new Map(files.map((file) => {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const targets = source.statements.flatMap((statement) => {
      if ((!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement))
        || !statement.moduleSpecifier
        || !ts.isStringLiteral(statement.moduleSpecifier)
        || !statement.moduleSpecifier.text.startsWith(".")) return [];
      const base = path.resolve(path.dirname(file), statement.moduleSpecifier.text);
      return [`${base}.ts`, path.join(base, "index.ts")]
        .map(path.normalize)
        .filter((candidate) => known.has(candidate));
    });
    return [file, targets] as const;
  }));
}

function dependencyCycles(graph: ReadonlyMap<string, readonly string[]>): string[][] {
  let nextIndex = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const cycles: string[][] = [];

  const visit = (node: string): void => {
    indices.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const target of graph.get(node) ?? []) {
      if (!indices.has(target)) {
        visit(target);
        lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(target)!));
      } else if (onStack.has(target)) {
        lowLinks.set(node, Math.min(lowLinks.get(node)!, indices.get(target)!));
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) return;
    const component: string[] = [];
    let item: string;
    do {
      item = stack.pop()!;
      onStack.delete(item);
      component.push(item);
    } while (item !== node);
    if (component.length > 1 || (graph.get(node) ?? []).includes(node)) cycles.push(component);
  };

  for (const node of graph.keys()) if (!indices.has(node)) visit(node);
  return cycles;
}

describe("source architecture", () => {
  it("keeps simulation independent from Phaser and DOM orchestration", () => {
    const graph = sourceGraph();
    const violations = [...graph.entries()].flatMap(([source, targets]) => {
      if (!source.includes(`${path.sep}game${path.sep}simulation${path.sep}`)) return [];
      return targets.filter((target) => target.includes(`${path.sep}game${path.sep}phaser${path.sep}`)
        || target.endsWith(`${path.sep}game${path.sep}ui.ts`)
        || target.endsWith(`${path.sep}game${path.sep}controller.ts`));
    });
    expect(violations).toEqual([]);
  });

  it("has no static TypeScript source dependency cycles", () => {
    const graph = sourceGraph();
    const cycles = dependencyCycles(graph).map((component) =>
      component.map((file) => path.relative(sourceRoot, file)));
    expect(cycles).toEqual([]);
  });

  it("keeps current save and shared action orchestration stage-neutral", () => {
    const currentSaveSchema = fs.readFileSync(
      path.resolve("src/game/save/current-schema.ts"),
      "utf8",
    );
    const sharedActions = fs.readFileSync(path.resolve("src/game/content/actions.ts"), "utf8");
    const battleScene = fs.readFileSync(path.resolve("src/game/phaser/BattleScene.ts"), "utf8");

    expect(currentSaveSchema).not.toMatch(/stageId\s*===\s*["']stage-/);
    expect(sharedActions).not.toMatch(/export function \w*Stage1/);
    expect(battleScene).not.toMatch(/stage\.id\s*!==\s*["']stage-00["']/);
  });
});
