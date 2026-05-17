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
  explain,
  UnknownDetectorTypeError,
  UnknownFindingError,
} from "./explain.js";
export type { ExplainOptions, ExplainReport } from "./explain.js";
export {
  findRelatedFiles,
  RELATED_FILES_CAP,
} from "./context-related-files.js";
export type {
  ContextRelatedFile,
  FindRelatedFilesOptions,
} from "./context-related-files.js";
export type { Detector, DetectorContext } from "./detector.js";
export { accessibleInteractionRiskDetector } from "./detectors/accessible-interaction-risk.js";
export { actionLabelDriftDetector } from "./detectors/action-label-drift.js";
export { circularDependencyDetector } from "./detectors/circular-dependency.js";
export { commandDriftDocsCodeDriftDetector } from "./detectors/command-drift-docs-code-drift.js";
export { commentedOutCodeDetector } from "./detectors/commented-out-code.js";
export { conceptAliasDriftDetector } from "./detectors/concept-alias-drift.js";
export { copyIaDriftDetector } from "./detectors/copy-ia-drift.js";
export { deepImportDetector } from "./detectors/deep-import.js";
export { designTokenEscapeDetector } from "./detectors/design-token-escape.js";
export { directDateDetector } from "./detectors/direct-date.js";
export { docsCodeDriftDetector } from "./detectors/docs-code-drift.js";
export { duplicateComponentShapeDetector } from "./detectors/duplicate-component-shape.js";
export { duplicatedNavigationSourceDetector } from "./detectors/duplicated-navigation-source.js";
export { highFanInFanOutDetector } from "./detectors/high-fan-in-fan-out.js";
export { largeFileDetector } from "./detectors/large-file.js";
export { largeFunctionDetector } from "./detectors/large-function.js";
export { layerViolationDetector } from "./detectors/layer-violation.js";
export { logicInCommentsDetector } from "./detectors/logic-in-comments.js";
export { magicDomainLiteralScatterDetector } from "./detectors/magic-domain-literal-scatter.js";
export { missingAgentContextDetector } from "./detectors/missing-agent-context.js";
export { nameBehaviorMismatchDetector } from "./detectors/name-behavior-mismatch.js";
export { negativeFlagMazeDetector } from "./detectors/negative-flag-maze.js";
export { optionBagJunkDrawerDetector } from "./detectors/option-bag-junk-drawer.js";
export { orphanedDestinationDetector } from "./detectors/orphaned-destination.js";
export { parallelDestinationDetector } from "./detectors/parallel-destination.js";
export { permissionIaDriftDetector } from "./detectors/permission-ia-drift.js";
export { responsiveFragilityDetector } from "./detectors/responsive-fragility.js";
export { returnShapeRouletteDetector } from "./detectors/return-shape-roulette.js";
export { routeMetadataDriftDetector } from "./detectors/route-metadata-drift.js";
export { todoDensityDetector } from "./detectors/todo-density.js";
export { visualRegressionReviewHintDetector } from "./detectors/visual-regression-review-hint.js";
export { weakTestSignalDetector } from "./detectors/weak-test-signal.js";
export {
  applyDiffFailOn,
  classifyDiff,
  diff,
  InvalidDiffRangeError,
  parseDiffRange,
} from "./diff.js";
export type {
  DiffFailOn,
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
export {
  buildImportGraph,
  extractImportSpecifiers,
} from "./imports/build.js";
export type { BuildImportGraphOptions } from "./imports/build.js";
export type { ImportEdge, ImportGraph } from "./imports/types.js";
export { buildJsxShapeIndex } from "./jsx/shape-index.js";
export type { JsxShapeHit, JsxShapeIndex } from "./jsx/shape-index.js";
export { findJsxElements, walkJsx } from "./jsx/walk.js";
export type {
  JsxAttributeValue,
  JsxElementInfo,
  JsxNode,
} from "./jsx/walk.js";
export {
  hashFunction,
  hashJsxSubtree,
  hashSlice,
} from "./ast-hash/hash.js";
export type { AstHash } from "./ast-hash/hash.js";
export {
  buildScoringContext,
  computeAgentRisk,
  finaliseFindingScores,
  hasNotableScores,
} from "./scoring/build.js";
export type {
  BlastRadiusIndex,
  BuildScoringContextOptions,
  ChurnIndex,
  ScoringContext,
  TestGapIndex,
} from "./scoring/build.js";
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
  removeSuppression,
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
  RemoveSuppressionOptions,
  RemoveSuppressionResult,
  SuppressionEntry,
  Suppressions,
} from "./suppressions.js";
export {
  auditSuppressions,
  SUPPRESSION_MIN_REASON_LENGTH,
  SUPPRESSION_STALE_AGE_DAYS,
} from "./audit-suppressions.js";
export type {
  AuditConcern,
  AuditSuppressionEntry,
  AuditSuppressionsOptions,
  AuditSuppressionsReport,
} from "./audit-suppressions.js";
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
