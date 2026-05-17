export {
  BASELINE_RELATIVE_PATH,
  BaselineNotFoundError,
  checkBaseline,
  classifyAgainstBaseline,
  loadBaseline,
  MalformedBaselineError,
  saveBaseline,
  severityAtLeast,
  toBaselineEntry,
} from "./baseline.js";
export type {
  Baseline,
  BaselineCheckReport,
  BaselineCheckSummary,
  BaselineEntry,
  CheckBaselineOptions,
  FailOn,
  SaveBaselineOptions,
  SaveBaselineResult,
} from "./baseline.js";
export {
  ConfigParseError,
  CrimesConfigSchema,
  DEFAULT_CONFIG,
  DEFAULT_SUPPRESSIONS_PATH,
  loadConfig,
  loadConfigDetailed,
  resolveSuppressionsPath,
} from "./config.js";
export type {
  ConfigIssue,
  CrimesConfig,
  LoadConfigResult,
} from "./config.js";
export {
  applySuppressionsToContext,
  context,
  findNearestPackageRoot,
} from "./context.js";
export type { ContextOptions, ContextReport, ContextRisk } from "./context.js";
export {
  findRelatedFiles,
  RELATED_FILES_CAP,
} from "./context-related-files.js";
export type {
  ContextRelatedFile,
  FindRelatedFilesOptions,
} from "./context-related-files.js";
export type { Detector, DetectorContext } from "./detector.js";
export { commentedOutCodeDetector } from "./detectors/commented-out-code.js";
export { conceptAliasDriftDetector } from "./detectors/concept-alias-drift.js";
export { directDateDetector } from "./detectors/direct-date.js";
export { docsCodeDriftDetector } from "./detectors/docs-code-drift.js";
export { duplicatedNavigationSourceDetector } from "./detectors/duplicated-navigation-source.js";
export { largeFileDetector } from "./detectors/large-file.js";
export { largeFunctionDetector } from "./detectors/large-function.js";
export { logicInCommentsDetector } from "./detectors/logic-in-comments.js";
export { magicDomainLiteralScatterDetector } from "./detectors/magic-domain-literal-scatter.js";
export { missingAgentContextDetector } from "./detectors/missing-agent-context.js";
export { nameBehaviorMismatchDetector } from "./detectors/name-behavior-mismatch.js";
export { negativeFlagMazeDetector } from "./detectors/negative-flag-maze.js";
export { optionBagJunkDrawerDetector } from "./detectors/option-bag-junk-drawer.js";
export { returnShapeRouletteDetector } from "./detectors/return-shape-roulette.js";
export { routeMetadataDriftDetector } from "./detectors/route-metadata-drift.js";
export { todoDensityDetector } from "./detectors/todo-density.js";
export { weakTestSignalDetector } from "./detectors/weak-test-signal.js";
export {
  classifyDiff,
  diff,
  InvalidDiffRangeError,
  parseDiffRange,
} from "./diff.js";
export type {
  DiffOptions,
  DiffReport,
  DiffSummary,
} from "./diff.js";
export { fingerprintFinding } from "./fingerprint.js";
export type {
  Finding,
  FindingScores,
  ScanReport,
  ScanSummary,
  Severity,
  SuggestedAction,
} from "./finding.js";
export { SCHEMA_VERSION } from "./finding.js";
export {
  DEFAULT_ALIAS_GROUPS,
  aliasToGroupId,
  buildIaIndex,
  extractPermissions,
  extractReferencedCommands,
  liftLabelSignals,
  liftNavSignals,
  normaliseTokens,
  parseMarkdown,
  readDeclaredBins,
  routeFromFilePath,
  SINGULAR_TABLE,
  splitTokens,
  stripRepoPrefix,
  STOP_WORDS,
  tokenise,
  tokenisePath,
  toPosix as iaToPosix,
} from "./ia/index.js";
export { buildPettyIndex } from "./petty/build.js";
export { extractStringLiterals } from "./petty/literals.js";
export type {
  BuildPettyIndexOptions,
} from "./petty/build.js";
export type {
  PettyIndex,
  PettyLiteralHit,
  RepoPath as PettyRepoPath,
} from "./petty/types.js";
export type {
  BuildIaIndexOptions,
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
} from "./ia/index.js";
export {
  exportRefToTempDir,
  withRefCheckout,
} from "./git/archive.js";
export {
  getChangedFiles,
  NotAGitRepoError,
  UnknownGitRefError,
} from "./git/changed-files.js";
export type { ChangedFilesOptions } from "./git/changed-files.js";
export type {
  CollectChurnOptions,
  CollectChurnResult,
  FileChurn,
} from "./git/churn.js";
export {
  collectChurn,
  isGitRepo,
  normaliseSince,
  parseGitLog,
} from "./git/churn.js";
export { computeRisk, hotspots } from "./hotspots.js";
export type {
  HighestSeverity,
  Hotspot,
  HotspotsOptions,
  HotspotsReport,
} from "./hotspots.js";
export {
  applyScanFailOn,
  applySuppressionsToScan,
  builtInDetectors,
  filterDetectors,
  resolveAliasGroups,
  scan,
  UnknownDetectorError,
} from "./scan.js";
export type { ScanOptions } from "./scan.js";
export {
  appendSuppression,
  loadSuppressions,
  loadSuppressionsForRoot,
  MalformedSuppressionsError,
  partitionFindings,
  resolveOverridePath,
  SuppressionEntrySchema,
  SuppressionsSchema,
} from "./suppressions.js";
export type {
  AppendSuppressionOptions,
  AppendSuppressionResult,
  ApplySuppressionsOptions,
  LoadSuppressionsResult,
  PartitionedFindings,
  SuppressionEntry,
  Suppressions,
} from "./suppressions.js";
export {
  judgeVerdict,
  NoDefaultBaseError,
  recommendActions,
  resolveDefaultBase,
  SEVERITY_WEIGHT,
  shouldFailVerdict,
  verdict,
} from "./verdict.js";
export type {
  Verdict,
  VerdictFailOn,
  VerdictOptions,
  VerdictReport,
  VerdictSummary,
} from "./verdict.js";
