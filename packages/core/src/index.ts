export { DEFAULT_CONFIG, loadConfig } from "./config.js";
export type { CrimesConfig } from "./config.js";
export { context } from "./context.js";
export type { ContextOptions, ContextReport, ContextRisk } from "./context.js";
export type { Detector, DetectorContext } from "./detector.js";
export { directDateDetector } from "./detectors/direct-date.js";
export { largeFileDetector } from "./detectors/large-file.js";
export { largeFunctionDetector } from "./detectors/large-function.js";
export { todoDensityDetector } from "./detectors/todo-density.js";
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
export { builtInDetectors, scan } from "./scan.js";
export type { ScanOptions } from "./scan.js";
