import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildClassReference,
  csvPath as classReferenceCsvPath,
  markdownPath as classReferenceMarkdownPath,
} from "./generate-class-reference.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const allowedStates = new Set([
  "frozen",
  "specified",
  "authorized",
  "in-progress",
  "implemented",
  "verified",
  "accepted",
]);
const activeImplementationStates = new Set(["authorized", "in-progress", "implemented"]);
const errors = [];

/**
 * `reverse/` 的取证产物和 `ref/` 的原始资料都被 gitignore，干净检出（含 GitHub CI）上
 * 一定不存在。指向它们的链接和依赖它们的重建检查因此不是「仓库坏了」，而是「本机没有
 * 取证语料」——只在产物确实存在时才校验，否则记为跳过并在摘要里说明。
 * 目录清单从 reverse/.gitignore 读出，避免与实际忽略规则脱节。
 */
const evidenceRoots = [
  ...(await readFile(path.join(repositoryRoot, "reverse/.gitignore"), "utf8"))
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && line.endsWith("/"))
    .map((directory) => path.join(repositoryRoot, "reverse", directory)),
  // ref/ 只追踪 next-project/，其余原始资料同样不随仓库分发。
  path.join(repositoryRoot, "ref"),
];

function isEvidencePath(absolute) {
  return evidenceRoots.some((root) =>
    absolute === root || absolute.startsWith(`${root}${path.sep}`));
}

const trackedEvidenceExceptions = [path.join(repositoryRoot, "ref/next-project")];

function isDistributedPath(absolute) {
  if (trackedEvidenceExceptions.some((root) =>
    absolute === root || absolute.startsWith(`${root}${path.sep}`))) return true;
  return !isEvidencePath(absolute);
}

function report(message) {
  errors.push(message);
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function collectMarkdownFiles(target) {
  const targetStat = await stat(target);
  if (targetStat.isFile()) {
    return target.endsWith(".md") ? [target] : [];
  }

  const entries = await readdir(target, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => collectMarkdownFiles(path.join(target, entry.name))),
  );
  return nested.flat();
}

function extractLocalDocumentTargets(markdown) {
  const targets = [];
  const inlineLink = /!?\[[^\]]*\]\(([^)\n]+)\)/g;
  for (const match of markdown.matchAll(inlineLink)) {
    let target = match[1].trim();
    if (target.startsWith("<")) {
      const closing = target.indexOf(">");
      target = closing >= 0 ? target.slice(1, closing) : target;
    } else {
      target = target.split(/\s+["']/u, 1)[0];
    }

    if (
      target.length === 0 ||
      target.startsWith("#") ||
      /^[a-z][a-z\d+.-]*:/iu.test(target) ||
      target.includes("<") ||
      target.includes(">")
    ) {
      continue;
    }

    const withoutFragment = target.split("#", 1)[0].split("?", 1)[0];
    if (withoutFragment.length === 0) {
      continue;
    }

    let decoded;
    try {
      decoded = decodeURIComponent(withoutFragment);
    } catch {
      decoded = withoutFragment;
    }

    const extension = path.extname(decoded).toLowerCase();
    if (extension !== ".md" && extension !== "") {
      continue;
    }
    targets.push(decoded);
  }
  return targets;
}

async function checkMarkdownLinks() {
  const roots = [
    "README.md",
    "WORKFLOW.md",
    "AGENTS.md",
    "tests/README.md",
    "docs",
    "planning",
    "design/remake-gdd",
    "reverse/gdd",
    "reverse/notes",
    "ref/next-project",
  ];
  const files = (
    await Promise.all(roots.map((root) => collectMarkdownFiles(path.join(repositoryRoot, root))))
  ).flat();
  let checkedLinks = 0;
  let skippedEvidenceLinks = 0;

  for (const file of files) {
    const markdown = await readFile(file, "utf8");
    for (const target of extractLocalDocumentTargets(markdown)) {
      const resolved = target.startsWith("/")
        ? path.join(repositoryRoot, target)
        : path.resolve(path.dirname(file), target);
      if (await pathExists(resolved)) {
        checkedLinks += 1;
        continue;
      }
      if (!isDistributedPath(resolved)) {
        skippedEvidenceLinks += 1;
        continue;
      }
      checkedLinks += 1;
      report(
        `${path.relative(repositoryRoot, file)} links to missing document ${target}`,
      );
    }
  }

  return { files: files.length, links: checkedLinks, skippedEvidenceLinks };
}

function parseFirstMilestoneStates(markdown) {
  const states = new Map();
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) {
      continue;
    }
    const cells = line.split("|").map((cell) => cell.trim());
    const idMatch = cells[1]?.match(/^(M\d+(?:\.\d+)?)(?:\s|$)/u);
    if (!idMatch || states.has(idMatch[1])) {
      continue;
    }
    const stateCell = cells.find((cell) => /^`[^`]+`$/u.test(cell));
    const state = stateCell?.slice(1, -1);
    if (state && allowedStates.has(state)) {
      states.set(idMatch[1], state);
    }
  }
  return states;
}

async function checkMilestoneStates() {
  const milestoneDirectory = path.join(repositoryRoot, "planning/milestones");
  const milestoneFiles = (await readdir(milestoneDirectory))
    .filter((name) => /^M\d+(?:\.\d+)?-.*\.md$/u.test(name))
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
  const milestones = new Map();

  for (const fileName of milestoneFiles) {
    const content = await readFile(path.join(milestoneDirectory, fileName), "utf8");
    const heading = content.match(/^# (M\d+(?:\.\d+)?)：([^\n]+)/u);
    const state = content.slice(0, 500).match(/状态：`([^`]+)`/u);
    if (!heading) {
      report(`planning/milestones/${fileName} has no canonical milestone heading`);
      continue;
    }
    if (!state || !allowedStates.has(state[1])) {
      report(`planning/milestones/${fileName} has no recognized status`);
      continue;
    }
    if (!fileName.startsWith(`${heading[1]}-`)) {
      report(`planning/milestones/${fileName} does not match heading ${heading[1]}`);
    }
    if (milestones.has(heading[1])) {
      report(`duplicate milestone id ${heading[1]}`);
      continue;
    }
    milestones.set(heading[1], {
      fileName,
      state: state[1],
      title: heading[2].trim(),
    });
  }

  const planningReadme = await readFile(path.join(repositoryRoot, "planning/README.md"), "utf8");
  const roadmap = await readFile(path.join(repositoryRoot, "planning/ROADMAP.md"), "utf8");
  const status = await readFile(path.join(repositoryRoot, "planning/STATUS.md"), "utf8");
  const roadmapStates = parseFirstMilestoneStates(roadmap);
  const statusStates = parseFirstMilestoneStates(status);

  for (const [id, milestone] of milestones) {
    const link = `milestones/${milestone.fileName}`;
    if (!planningReadme.includes(link)) {
      report(`planning/README.md does not index ${link}`);
    }
    if (roadmapStates.get(id) !== milestone.state) {
      report(
        `planning/ROADMAP.md reports ${id} as ${roadmapStates.get(id) ?? "missing"}; ` +
          `milestone header is ${milestone.state}`,
      );
    }
    if (statusStates.get(id) !== milestone.state) {
      report(
        `planning/STATUS.md reports ${id} as ${statusStates.get(id) ?? "missing"}; ` +
          `milestone header is ${milestone.state}`,
      );
    }
  }

  const active = [...milestones.entries()].filter(([, milestone]) =>
    activeImplementationStates.has(milestone.state),
  );
  if (active.length > 1) {
    report(
      `multiple implementation milestones are active: ${active
        .map(([id, milestone]) => `${id} (${milestone.state})`)
        .join(", ")}`,
    );
  }

  return { milestones: milestones.size, active: active.map(([id]) => id) };
}

/**
 * The class stats reference is a generated `[OF]` baseline. Rebuilding it here
 * keeps a stale committed copy from silently outliving a change to the native
 * catalog, the map profiles or the runtime class catalog.
 */
async function checkClassReference() {
  // 重建需要 reverse/parsed/ 的取证语料。干净检出上它不存在，这时既无法重建也无从判断
  // committed 副本是否过期——报错只会把「没有取证产物」误判成「仓库坏了」。
  if (!(await pathExists(path.join(repositoryRoot, "reverse/parsed/native/unit-catalog.json")))) {
    for (const target of [classReferenceMarkdownPath, classReferenceCsvPath]) {
      if (!(await pathExists(target))) {
        report(`${path.relative(repositoryRoot, target)} is missing; run pnpm docs:classes`);
      }
    }
    return { rebuilt: false, skipped: true };
  }

  let built;
  try {
    built = await buildClassReference();
  } catch (error) {
    report(`class stats reference cannot be rebuilt: ${error.message}`);
    return { rebuilt: false };
  }

  for (const [target, expected] of [
    [classReferenceMarkdownPath, built.markdown],
    [classReferenceCsvPath, built.csv],
  ]) {
    const relative = path.relative(repositoryRoot, target);
    if (!(await pathExists(target))) {
      report(`${relative} is missing; run pnpm docs:classes`);
      continue;
    }
    if ((await readFile(target, "utf8")) !== expected) {
      report(`${relative} is stale; run pnpm docs:classes`);
    }
  }

  return { rebuilt: true, summary: built.summary };
}

const milestoneResult = await checkMilestoneStates();
const markdownResult = await checkMarkdownLinks();
const classReferenceResult = await checkClassReference();

if (errors.length > 0) {
  console.error(`Project contract check failed with ${errors.length} error(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  const active = milestoneResult.active.length > 0 ? milestoneResult.active.join(", ") : "none";
  // 跳过项必须出现在摘要里：静默跳过会让「干净检出上少校验了什么」不可见。
  const skippedLinks = markdownResult.skippedEvidenceLinks > 0
    ? `, ${markdownResult.skippedEvidenceLinks} evidence link(s) skipped (corpus absent)`
    : "";
  const classSummary = classReferenceResult.skipped
    ? "class stats reference not rebuilt (reverse/parsed/ absent)"
    : `class stats reference up to date (${classReferenceResult.summary})`;
  console.log(
    `Project contracts verified: ${milestoneResult.milestones} milestones, ` +
      `${markdownResult.files} Markdown files, ${markdownResult.links} document links` +
      `${skippedLinks}; ${classSummary}; ` +
      `active implementation milestone: ${active}.`,
  );
}
