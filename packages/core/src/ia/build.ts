/**
 * Build the IA signal index for a repo.
 *
 * The build is deterministic and best-effort: any file that fails to parse
 * or read is skipped silently rather than breaking the scan. The IA index
 * is an enrichment layer, not a load-bearing piece of `crimes scan`.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseFile } from "@crimes/language-js";
import type { ParsedFile } from "@crimes/language-js";
import fg from "fast-glob";
import { DEFAULT_ALIAS_GROUPS } from "./aliases.js";
import {
  extractPermissions,
  extractReferencedCommands,
  liftLabelSignals,
  liftNavSignals,
  parseMarkdown,
  readDeclaredBins,
  routeFromFilePath,
  toPosix,
} from "./extract.js";
import { tokenisePath } from "./tokenise.js";
import type {
  IaAgentInventory,
  IaConceptAliasGroup,
  IaDocSignal,
  IaFileSignals,
  IaIndex,
  IaRouteSignal,
  RepoPath,
} from "./types.js";

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const MD_EXT = /\.(md|mdx)$/i;

export interface BuildIaIndexOptions {
  /** Absolute repo root. */
  root: string;
  /**
   * Absolute paths of files already discovered by the scan. The IA index
   * reuses this list rather than walking the filesystem twice.
   */
  files: string[];
  /** Override the alias-group catalogue (mostly for tests). */
  aliasGroups?: IaConceptAliasGroup[];
}

/**
 * Build the IA index. Always returns an index; missing signals appear as
 * empty arrays rather than absent keys.
 */
export async function buildIaIndex(options: BuildIaIndexOptions): Promise<IaIndex> {
  const root = resolve(options.root);
  const aliasGroups = options.aliasGroups ?? DEFAULT_ALIAS_GROUPS;

  const fileSignals: Record<RepoPath, IaFileSignals> = {};
  const routes: IaRouteSignal[] = [];
  const navSources: IaIndex["navSources"] = [];

  // 1. Walk discovered TS/JS files.
  for (const abs of options.files) {
    const rel = toRepoRel(root, abs);
    if (!SOURCE_EXT.test(rel)) continue;

    let parsed: ParsedFile;
    let source: string;
    try {
      source = readFileSync(abs, "utf8");
      parsed = parseFile({ absolutePath: abs, source });
    } catch {
      continue;
    }

    const labels = liftLabelSignals(parsed);
    const navEntries = liftNavSignals(parsed);
    const permissions = extractPermissions(source);
    const routePath = routeFromFilePath(rel);

    const signal: IaFileSignals = {
      file: rel,
      tokens: tokenisePath(rel),
      componentName: parsed.defaultExport,
      routes: routePath ? [routePath] : [],
      labels,
      navEntries,
      permissions,
      isNavSource: navEntries.length > 0,
    };
    fileSignals[rel] = signal;

    if (routePath) {
      routes.push({
        file: rel,
        routePath,
        componentName: parsed.defaultExport,
        titles: labels
          .filter((l) =>
            l.kind === "jsx_title" ||
            l.kind === "metadata_title" ||
            l.kind === "document_title" ||
            l.kind === "use_title",
          )
          .map((l) => l.value),
        labels: labels.map((l) => l.value),
      });
    }

    if (navEntries.length > 0) {
      navSources.push({ file: rel, entries: navEntries });
    }
  }

  // 2. Walk markdown docs.
  const docs = await collectDocs(root);

  // 3. Agent context inventory.
  const agentContext = await collectAgentInventory(root, docs);

  return {
    root: toPosix(root),
    files: fileSignals,
    routes: sortRoutes(routes),
    navSources: navSources.sort((a, b) => a.file.localeCompare(b.file)),
    docs,
    agentContext,
    aliasGroups,
  };
}

function sortRoutes(routes: IaRouteSignal[]): IaRouteSignal[] {
  return [...routes].sort((a, b) => {
    if (a.routePath !== b.routePath) return a.routePath.localeCompare(b.routePath);
    return a.file.localeCompare(b.file);
  });
}

function toRepoRel(root: string, abs: string): RepoPath {
  const r = isAbsolute(abs) ? relative(root, abs) : abs;
  return toPosix(r);
}

async function collectDocs(root: string): Promise<IaDocSignal[]> {
  // Walk:
  //   - root-level *.md / *.mdx
  //   - everything under docs/
  const patterns = ["*.md", "*.mdx", "docs/**/*.md", "docs/**/*.mdx"];
  const matches = await fg(patterns, {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    dot: false,
    followSymbolicLinks: false,
    suppressErrors: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.crimes/**"],
  });

  const docs: IaDocSignal[] = [];
  for (const abs of matches) {
    const rel = toRepoRel(root, abs);
    let source: string;
    try {
      source = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const parsed = parseMarkdown(source, rel);

    // Resolve local links and mark broken ones.
    for (const link of parsed.links) {
      if (!link.isLocal) continue;
      const stripped = link.target.split("#")[0]!.split("?")[0]!;
      if (!stripped) continue; // pure anchor link
      const targetAbs = resolveDocLink(root, abs, stripped);
      if (existsSync(targetAbs)) {
        link.resolved = toRepoRel(root, targetAbs);
      } else {
        link.brokenLocal = true;
      }
    }
    docs.push(parsed);
  }
  return docs.sort((a, b) => a.file.localeCompare(b.file));
}

function resolveDocLink(root: string, fromAbsFile: string, target: string): string {
  if (target.startsWith("/")) {
    // Repo-rooted link.
    return join(root, target.slice(1));
  }
  return join(dirname(fromAbsFile), target);
}

async function collectAgentInventory(
  root: string,
  docs: IaDocSignal[],
): Promise<IaAgentInventory> {
  const agentsMdAbs = join(root, "AGENTS.md");
  const claudeMdAbs = join(root, "CLAUDE.md");
  const agentsMdPath = existsSync(agentsMdAbs) ? "AGENTS.md" : undefined;
  const claudeMdPath = existsSync(claudeMdAbs) ? "CLAUDE.md" : undefined;

  // .claude/skills/<name>/SKILL.md
  const claudeSkills = await fg([".claude/skills/*/SKILL.md"], {
    cwd: root,
    onlyFiles: true,
    dot: true,
    followSymbolicLinks: false,
    suppressErrors: true,
  });
  const claudeSkillPaths = claudeSkills
    .map((p) => toPosix(p))
    .sort();

  // package.json at repo root only -- monorepo workspace traversal can come
  // later. The Missing Agent Context detector will document this scope.
  const declaredBins = readDeclaredBins(join(root, "package.json"));

  // Referenced commands inside AGENTS.md (if present).
  let referencedCommands: string[] = [];
  if (agentsMdPath) {
    const doc = docs.find((d) => d.file === "AGENTS.md");
    if (doc) {
      try {
        const raw = readFileSync(agentsMdAbs, "utf8");
        referencedCommands = extractReferencedCommands(doc, declaredBins, raw);
      } catch {
        referencedCommands = [];
      }
    }
  }

  return {
    agentsMdPath,
    claudeMdPath,
    claudeSkills: claudeSkillPaths,
    declaredBins,
    referencedCommands,
  };
}
