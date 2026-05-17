import type {
  Baseline,
  BaselineCheckReport,
  ContextReport,
  DiffReport,
  ExplainReport,
  HotspotsReport,
  ScanReport,
  VerdictReport,
} from "@crimes/core";

export interface JsonReportOptions {
  /** Pretty-print with 2 spaces. Defaults to true. */
  pretty?: boolean;
}

export function formatJsonReport(
  report: ScanReport,
  options: JsonReportOptions = {},
): string {
  const pretty = options.pretty ?? true;
  return JSON.stringify(report, null, pretty ? 2 : 0);
}

export function formatContextJsonReport(
  report: ContextReport,
  options: JsonReportOptions = {},
): string {
  const pretty = options.pretty ?? true;
  return JSON.stringify(report, null, pretty ? 2 : 0);
}

export function formatHotspotsJsonReport(
  report: HotspotsReport,
  options: JsonReportOptions = {},
): string {
  const pretty = options.pretty ?? true;
  return JSON.stringify(report, null, pretty ? 2 : 0);
}

export function formatDiffJsonReport(
  report: DiffReport,
  options: JsonReportOptions = {},
): string {
  const pretty = options.pretty ?? true;
  return JSON.stringify(report, null, pretty ? 2 : 0);
}

export function formatBaselineJsonReport(
  baseline: Baseline,
  options: JsonReportOptions = {},
): string {
  const pretty = options.pretty ?? true;
  return JSON.stringify(baseline, null, pretty ? 2 : 0);
}

export function formatBaselineCheckJsonReport(
  report: BaselineCheckReport,
  options: JsonReportOptions = {},
): string {
  const pretty = options.pretty ?? true;
  return JSON.stringify(report, null, pretty ? 2 : 0);
}

export function formatVerdictJsonReport(
  report: VerdictReport,
  options: JsonReportOptions = {},
): string {
  const pretty = options.pretty ?? true;
  return JSON.stringify(report, null, pretty ? 2 : 0);
}

export function formatExplainJsonReport(
  report: ExplainReport,
  options: JsonReportOptions = {},
): string {
  const pretty = options.pretty ?? true;
  return JSON.stringify(report, null, pretty ? 2 : 0);
}
