/**
 * Information Architecture signal index — public surface.
 *
 * The IA module extracts deterministic, evidence-only signals from a repo
 * (path tokens, route paths, nav entries, label literals, permission
 * strings, doc headings, agent-context files). The index is consumed by
 * IA detectors built on top — it does not itself produce findings.
 */

export { DEFAULT_ALIAS_GROUPS, aliasToGroupId } from "./aliases.js";
export type { BuildIaIndexOptions } from "./build.js";
export { buildIaIndex } from "./build.js";
export {
  extractPermissions,
  extractReferencedCommands,
  liftLabelSignals,
  liftNavSignals,
  parseMarkdown,
  readDeclaredBins,
  routeFromFilePath,
  toPosix,
} from "./extract.js";
export {
  SINGULAR_TABLE,
  STOP_WORDS,
  normaliseTokens,
  splitTokens,
  stripRepoPrefix,
  tokenise,
  tokenisePath,
} from "./tokenise.js";
export type {
  IaAgentInventory,
  IaConceptAliasGroup,
  IaDocFencedCommand,
  IaDocHeading,
  IaDocLink,
  IaDocSignal,
  IaFileSignals,
  IaIndex,
  IaLabelSignal,
  IaNavEntry,
  IaNavSignal,
  IaPermissionSignal,
  IaRouteSignal,
  RepoPath,
} from "./types.js";
