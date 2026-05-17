import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  appendSuppression,
  appendToGlobalRollup,
  buildFeedbackSummary,
  latestPerFingerprint,
  loadConfig,
  loadSuppressions,
  loadSuppressionsForRoot,
  minorKey,
  readFeedback,
  removeSuppression,
  resolveFeedbackPath,
  resolveGlobalRollupPath,
  resolveSuppressionsPath,
  resurfacedSuppressions,
  writeFeedbackEntry,
} from "@crimes/core";
import type {
  FeedbackEntry,
  FeedbackSummary,
  ResurfacedSuppression,
} from "@crimes/core";
import type { Command } from "commander";
import { fatalUserError, isUserSetupError } from "../runtime-errors.js";

// Injected at build time by tsup from this package's package.json (same
// pattern as ignore.ts / baseline.ts).
declare const __CRIMES_VERSION__: string;

interface FeedbackCommandOptions {
  verdict?: string;
  note?: string;
  file?: string;
}

const ID_PATTERN = /^crime_\d+$/;
const FINGERPRINT_PATTERN = /^[a-z0-9_]+::[^:]*::[^:]*$/i;
const VALID_VERDICTS = new Set(["tp", "fp", "known"] as const);
type Verdict = "tp" | "fp" | "known";

function isVerdict(value: string): value is Verdict {
  return VALID_VERDICTS.has(value as Verdict);
}

export function registerFeedbackCommand(program: Command): void {
  const feedback = program
    .command("feedback")
    .description(
      "Capture per-finding verdicts (tp/fp/known) to feed the 0.7.0 calibration loop. " +
        "Writes .crimes/feedback.jsonl and, on `fp`, an auto-suppression that " +
        "resurfaces for re-confirmation on the next minor crimes bump.",
    )
    .argument(
      "[fingerprint-or-id]",
      "stable fingerprint (<type>::<file>::<symbol>) or per-scan id (crime_NNNNN — requires --file)",
    )
    .option(
      "--verdict <verdict>",
      "tp (true positive) | fp (false positive — also writes a suppression) | known (record only)",
    )
    .option(
      "--note <text>",
      "one-sentence reason — required when --verdict is fp (it becomes the suppression reason)",
    )
    .option(
      "--file <scan.json>",
      "scan JSON to resolve crime_NNNNN ids and populate scan_hash on the entry",
    )
    .action(
      async (
        idOrFingerprint: string | undefined,
        options: FeedbackCommandOptions,
      ) => {
        if (idOrFingerprint === undefined) {
          process.stderr.write(
            "crimes: feedback requires <fingerprint-or-id>. " +
              "Use a subcommand for read paths: list, summary, export, recheck.\n",
          );
          process.exit(2);
          return;
        }

        if (options.verdict === undefined || !isVerdict(options.verdict)) {
          process.stderr.write(
            'crimes: --verdict is required and must be one of "tp", "fp", "known".\n',
          );
          process.exit(2);
          return;
        }
        const verdict: Verdict = options.verdict;

        if (verdict === "fp") {
          if (options.note === undefined || options.note.trim().length === 0) {
            process.stderr.write(
              "crimes: --note is required when --verdict is fp " +
                "(the note becomes the suppression reason).\n",
            );
            process.exit(2);
            return;
          }
        }

        if (
          !ID_PATTERN.test(idOrFingerprint) &&
          !FINGERPRINT_PATTERN.test(idOrFingerprint)
        ) {
          process.stderr.write(
            `crimes: "${idOrFingerprint}" is neither a per-scan id (crime_00001) ` +
              `nor a stable fingerprint (<type>::<file>::<symbol>).\n`,
          );
          process.exit(2);
          return;
        }

        const root = resolve(process.cwd());

        let fingerprint: string;
        let findingType: string;
        let file: string | undefined;
        let symbol: string | undefined;
        let scanHash: string | null = null;

        if (ID_PATTERN.test(idOrFingerprint)) {
          if (options.file === undefined) {
            process.stderr.write(
              "crimes: --file <scan.json> is required when passing a crime_NNNNN id " +
                "(per-scan ids are ephemeral — only fingerprints work without --file).\n",
            );
            process.exit(2);
            return;
          }
          let raw: string;
          try {
            raw = await readFile(options.file, "utf8");
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            process.stderr.write(
              `crimes: unable to read --file ${options.file} — ${message}\n`,
            );
            process.exit(2);
            return;
          }
          scanHash = "sha256:" + createHash("sha256").update(raw).digest("hex");
          let scanJson: { findings?: Array<{ id: string; type: string; file: string; symbol?: string }> };
          try {
            scanJson = JSON.parse(raw);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            process.stderr.write(
              `crimes: --file ${options.file} is not valid JSON — ${message}\n`,
            );
            process.exit(2);
            return;
          }
          const match = scanJson.findings?.find((f) => f.id === idOrFingerprint);
          if (!match) {
            process.stderr.write(
              `crimes: no finding with id "${idOrFingerprint}" in ${options.file}. ` +
                "Pass the fingerprint directly to avoid needing --file.\n",
            );
            process.exit(2);
            return;
          }
          fingerprint = `${match.type}::${match.file}::${match.symbol ?? ""}`;
          findingType = match.type;
          file = match.file;
          if (match.symbol) symbol = match.symbol;
        } else {
          fingerprint = idOrFingerprint;
          const [typePart, filePart, symbolPart] = fingerprint.split("::");
          findingType = typePart!;
          if (filePart) file = filePart;
          if (symbolPart) symbol = symbolPart;
          if (options.file !== undefined) {
            try {
              const raw = await readFile(options.file, "utf8");
              scanHash = "sha256:" + createHash("sha256").update(raw).digest("hex");
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              process.stderr.write(
                `crimes: unable to read --file ${options.file} — ${message}\n`,
              );
              process.exit(2);
              return;
            }
          }
        }

        let config;
        try {
          config = loadConfig(root);
        } catch (error) {
          if (isUserSetupError(error)) {
            fatalUserError(error);
            return;
          }
          throw error;
        }

        const suppressionsPath = resolveSuppressionsPath(root, config);
        const existingSuppressions = loadSuppressions(suppressionsPath);
        const priorEntry = existingSuppressions.entries.find(
          (e) => e.fingerprint === fingerprint,
        );

        // resurfaced_from is set when we're re-confirming or resolving
        // a feedback `fp` from a different minor than the current one.
        let resurfacedFrom: string | null = null;
        if (
          priorEntry &&
          priorEntry.source === "feedback" &&
          priorEntry.crimes_version_pinned !== undefined
        ) {
          const priorMinor = minorKey(priorEntry.crimes_version_pinned);
          const currentMinor = minorKey(__CRIMES_VERSION__);
          if (priorMinor !== currentMinor) resurfacedFrom = priorMinor;
        }

        const feedbackPath = resolveFeedbackPath(root);
        const entryBody = {
          crimes_version: __CRIMES_VERSION__,
          fingerprint,
          finding_type: findingType,
          verdict,
          note: verdict === "fp" ? options.note!.trim() : (options.note?.trim() ?? null),
          scan_hash: scanHash,
          resurfaced_from: resurfacedFrom,
        };
        const writeResult = await writeFeedbackEntry(feedbackPath, entryBody);

        // Suppression side-effects per verdict (§4.1 / §4.3).
        if (verdict === "fp") {
          const reason = options.note!.trim();
          await appendSuppression(
            suppressionsPath,
            {
              fingerprint,
              type: findingType,
              ...(file !== undefined ? { file } : {}),
              ...(symbol !== undefined ? { symbol } : {}),
              reason,
              source: "feedback",
              crimes_version_pinned: minorKey(__CRIMES_VERSION__),
            },
            { crimesVersion: __CRIMES_VERSION__ },
          );
        } else if (verdict === "tp") {
          // Delete any feedback-sourced suppression. Manual ones survive
          // (a separate `crimes unignore` would remove those).
          if (priorEntry && priorEntry.source === "feedback") {
            await removeSuppression(suppressionsPath, fingerprint, {
              crimesVersion: __CRIMES_VERSION__,
            });
          }
        }
        // "known": neither writes nor deletes a suppression.

        const verbCopy =
          verdict === "fp"
            ? "Recorded fp + wrote suppression"
            : verdict === "tp"
              ? priorEntry && priorEntry.source === "feedback"
                ? "Recorded tp + removed prior feedback suppression"
                : "Recorded tp"
              : "Recorded known";

        process.stdout.write(
          `${verbCopy} for ${fingerprint}\n` +
            `  feedback:     ${writeResult.path}\n` +
            (verdict === "fp"
              ? `  suppression:  ${suppressionsPath} (pinned to ${minorKey(__CRIMES_VERSION__)})\n`
              : ""),
        );
      },
    );

  registerFeedbackListSubcommand(feedback);
  registerFeedbackRecheckSubcommand(feedback);
  registerFeedbackSummarySubcommand(feedback);
  registerFeedbackExportSubcommand(feedback);
}

// ---------- `crimes feedback list` ---------------------------------------

interface FeedbackListOptions {
  format: "human" | "json";
  global: boolean;
  since?: string;
  verdict?: string;
}

function registerFeedbackListSubcommand(parent: Command): void {
  parent
    .command("list")
    .description(
      "List captured feedback entries (latest verdict per fingerprint).",
    )
    .option("--format <format>", "output format: human | json", "human")
    .option(
      "--global",
      "read from the cross-project rollup at ~/.crimes/feedback-rollup.jsonl",
      false,
    )
    .option(
      "--since <duration>",
      "only show entries within the last duration (e.g. 30d, 2w, 6h)",
    )
    .option(
      "--verdict <verdict>",
      "filter to fingerprints whose current verdict is one of: tp, fp, known",
    )
    .action(async function (this: Command, _options: FeedbackListOptions) {
      // Commander parses parent-level options (--verdict, --note, --file)
      // onto the parent command even when the subcommand redeclares them,
      // so we read merged opts to pick up `--verdict fp` after the
      // subcommand name. See feedback.test.ts for the failing case.
      const options = this.optsWithGlobals() as FeedbackListOptions;
      if (options.format !== "human" && options.format !== "json") {
        process.stderr.write(
          `crimes: unknown --format "${String(options.format)}". Expected "human" or "json".\n`,
        );
        process.exit(2);
        return;
      }
      if (
        options.verdict !== undefined &&
        !isVerdict(options.verdict)
      ) {
        process.stderr.write(
          'crimes: --verdict must be one of "tp", "fp", "known".\n',
        );
        process.exit(2);
        return;
      }

      const path = options.global
        ? resolveGlobalRollupPath()
        : resolveFeedbackPath(resolve(process.cwd()));
      const read = await readFeedback(path);

      const sinceCutoff = options.since
        ? parseSinceDuration(options.since)
        : undefined;
      if (options.since !== undefined && sinceCutoff === undefined) {
        process.stderr.write(
          `crimes: --since "${options.since}" not understood. Use e.g. 30d, 2w, 6h, 90m.\n`,
        );
        process.exit(2);
        return;
      }

      const latest = latestPerFingerprint(read.entries);
      const sorted = Array.from(latest.values()).sort((a, b) =>
        a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
      );

      const filtered = sorted.filter((e) => {
        if (sinceCutoff && new Date(e.timestamp).getTime() < sinceCutoff) {
          return false;
        }
        if (options.verdict && e.verdict !== options.verdict) return false;
        return true;
      });

      if (options.format === "json") {
        process.stdout.write(
          JSON.stringify(
            {
              schema_version: "0.1.0",
              report_type: "feedback",
              scope: options.global ? "global" : "repo",
              source_file: path,
              entries: filtered,
            },
            null,
            2,
          ) + "\n",
        );
        return;
      }

      process.stdout.write(formatFeedbackList(filtered, path, read.loaded));
    });
}

function formatFeedbackList(
  entries: FeedbackEntry[],
  path: string,
  loaded: boolean,
): string {
  if (!loaded) {
    return `No feedback recorded yet (${path} does not exist).\n`;
  }
  if (entries.length === 0) {
    return `No matching feedback entries in ${path}.\n`;
  }
  const lines: string[] = [
    `${entries.length} feedback ${entries.length === 1 ? "entry" : "entries"} (latest verdict per fingerprint) — ${path}`,
    "",
  ];
  for (const e of entries) {
    const note = e.note ? ` "${e.note}"` : "";
    const resurfaced =
      e.resurfaced_from !== null
        ? ` [resurfaced from ${e.resurfaced_from}]`
        : "";
    lines.push(
      `  [${e.verdict.padEnd(5)}] ${e.timestamp}  ${e.fingerprint}${resurfaced}${note}`,
    );
  }
  return lines.join("\n") + "\n";
}

function parseSinceDuration(input: string): number | undefined {
  const match = input.trim().match(/^(\d+)([dwhms])$/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const ms =
    unit === "d"
      ? value * 86_400_000
      : unit === "w"
        ? value * 7 * 86_400_000
        : unit === "h"
          ? value * 3_600_000
          : unit === "m"
            ? value * 60_000
            : unit === "s"
              ? value * 1000
              : undefined;
  if (ms === undefined) return undefined;
  return Date.now() - ms;
}

// ---------- `crimes feedback recheck` -----------------------------------

interface FeedbackRecheckOptions {
  format: "human" | "json";
  detector?: string;
}

function registerFeedbackRecheckSubcommand(parent: Command): void {
  parent
    .command("recheck")
    .description(
      "Walk feedback-sourced suppressions whose pinned minor differs from the " +
        "current crimes minor — the per-release review surface.",
    )
    .option("--format <format>", "output format: human | json", "human")
    .option(
      "--detector <type>",
      "only show resurfaced suppressions of this detector type (e.g. large_function)",
    )
    .action(async function (this: Command, _options: FeedbackRecheckOptions) {
      // Same parent-options bleed-through as the list subcommand —
      // merge global opts so `--detector` after the subcommand name
      // is honoured.
      const options = this.optsWithGlobals() as FeedbackRecheckOptions;
      if (options.format !== "human" && options.format !== "json") {
        process.stderr.write(
          `crimes: unknown --format "${String(options.format)}". Expected "human" or "json".\n`,
        );
        process.exit(2);
        return;
      }

      const root = resolve(process.cwd());
      let config;
      try {
        config = loadConfig(root);
      } catch (error) {
        if (isUserSetupError(error)) {
          fatalUserError(error);
          return;
        }
        throw error;
      }
      const suppressions = loadSuppressionsForRoot(root, config);
      const resurfaced = resurfacedSuppressions(
        suppressions.entries,
        __CRIMES_VERSION__,
        options.detector ? { detector: options.detector } : {},
      );

      const currentMinor = minorKey(__CRIMES_VERSION__);

      if (options.format === "json") {
        process.stdout.write(
          JSON.stringify(
            {
              schema_version: "0.1.0",
              report_type: "feedback_recheck",
              current_version: __CRIMES_VERSION__,
              current_minor: currentMinor,
              resurfaced: resurfaced.map((r) => ({
                ...r,
                commands: {
                  reconfirm_fp: `crimes feedback ${r.fingerprint} --verdict fp`,
                  mark_resolved: `crimes feedback ${r.fingerprint} --verdict tp`,
                },
              })),
            },
            null,
            2,
          ) + "\n",
        );
        return;
      }

      process.stdout.write(formatRecheck(resurfaced, currentMinor));
    });
}

function formatRecheck(
  resurfaced: ResurfacedSuppression[],
  currentMinor: string,
): string {
  if (resurfaced.length === 0) {
    return "No resurfaced feedback suppressions. Either every prior `fp` was confirmed on this minor, or none have been recorded yet.\n";
  }
  const lines: string[] = [
    `${resurfaced.length} ${resurfaced.length === 1 ? "finding" : "findings"} previously marked fp (resurface for crimes ${currentMinor}):`,
    "",
  ];
  resurfaced.forEach((r, i) => {
    const location =
      r.file !== undefined
        ? r.symbol
          ? `${r.file}:${r.symbol}`
          : r.file
        : r.fingerprint;
    lines.push(
      `[${i + 1}/${resurfaced.length}] ${r.type} — ${location}`,
      `      Marked fp in ${r.crimes_version_pinned}: "${r.reason}"`,
      `      In ${currentMinor}: ${r.hint}`,
      `        Re-confirm fp: crimes feedback ${r.fingerprint} --verdict fp --note '<reason>'`,
      `        Mark resolved: crimes feedback ${r.fingerprint} --verdict tp`,
      "",
    );
  });
  return lines.join("\n");
}

// ---------- `crimes feedback summary` -----------------------------------

interface FeedbackSummaryOptions {
  format: "human" | "json";
  global: boolean;
}

function registerFeedbackSummarySubcommand(parent: Command): void {
  parent
    .command("summary")
    .description(
      "Aggregate feedback into a quick-read table (by verdict, detector, version, repo).",
    )
    .option("--format <format>", "output format: human | json", "human")
    .option(
      "--global",
      "read from ~/.crimes/feedback-rollup.jsonl instead of the local repo",
      false,
    )
    .action(async function (this: Command, _options: FeedbackSummaryOptions) {
      const options = this.optsWithGlobals() as FeedbackSummaryOptions;
      if (options.format !== "human" && options.format !== "json") {
        process.stderr.write(
          `crimes: unknown --format "${String(options.format)}". Expected "human" or "json".\n`,
        );
        process.exit(2);
        return;
      }

      const path = options.global
        ? resolveGlobalRollupPath()
        : resolveFeedbackPath(resolve(process.cwd()));
      const read = await readFeedback(path);
      const summary = buildFeedbackSummary(read.entries);

      if (options.format === "json") {
        process.stdout.write(
          JSON.stringify(
            {
              schema_version: "0.1.0",
              report_type: "feedback",
              scope: options.global ? "global" : "repo",
              source_file: path,
              entries: read.entries,
              summary,
            },
            null,
            2,
          ) + "\n",
        );
        return;
      }

      process.stdout.write(
        formatFeedbackSummary(summary, path, read.loaded, options.global),
      );
    });
}

function formatFeedbackSummary(
  summary: FeedbackSummary,
  path: string,
  loaded: boolean,
  isGlobal: boolean,
): string {
  if (!loaded) {
    return `No feedback recorded yet (${path} does not exist).\n`;
  }
  const lines: string[] = [];
  const scope = isGlobal ? "Global rollup" : "Local repo";
  lines.push(
    `${scope}: ${path}  (${summary.total} ${summary.total === 1 ? "entry" : "entries"} after latest-per-fingerprint)`,
    "",
    "By verdict:",
  );
  const totalForPct = summary.total === 0 ? 1 : summary.total;
  for (const v of ["tp", "fp", "known"] as const) {
    const n = summary.by_verdict[v];
    const pct = Math.round((n / totalForPct) * 100);
    lines.push(`  ${v.padEnd(5)} ${String(n).padStart(4)} (${pct}%)`);
  }

  const byDetectorByFp = Object.entries(summary.by_detector)
    .map(([type, counts]) => ({ type, fp: counts.fp, total: counts.tp + counts.fp + counts.known }))
    .filter((d) => d.fp > 0)
    .sort((a, b) => b.fp - a.fp)
    .slice(0, 5);
  if (byDetectorByFp.length > 0) {
    lines.push("", "By detector (top 5 by fp count):");
    for (const d of byDetectorByFp) {
      lines.push(`  ${d.type.padEnd(28)} ${String(d.fp).padStart(3)} fp`);
    }
  }

  const versionEntries = Object.entries(summary.by_version).sort(
    ([a], [b]) => (a < b ? 1 : a > b ? -1 : 0),
  );
  if (versionEntries.length > 0) {
    lines.push("", "By crimes_version:");
    for (const [v, n] of versionEntries) {
      lines.push(`  ${v.padEnd(8)} ${String(n).padStart(4)}`);
    }
  }

  if (summary.by_repo) {
    const repoEntries = Object.entries(summary.by_repo).sort(
      ([, a], [, b]) => b - a,
    );
    if (repoEntries.length > 0) {
      lines.push("", "By repo:");
      for (const [r, n] of repoEntries) {
        lines.push(`  ${r.padEnd(40)} ${String(n).padStart(4)}`);
      }
    }
  }
  return lines.join("\n") + "\n";
}

// ---------- `crimes feedback export` -----------------------------------

interface FeedbackExportOptions {
  format: "jsonl" | "md" | "json";
  appendGlobal: boolean;
}

function registerFeedbackExportSubcommand(parent: Command): void {
  parent
    .command("export")
    .description(
      "Print the local feedback JSONL or append it to the global rollup.",
    )
    .option(
      "--format <format>",
      "output format: jsonl (default, one entry per line) | md (Markdown report) | json (FeedbackReport)",
      "jsonl",
    )
    .option(
      "--append-global",
      "append local entries to ~/.crimes/feedback-rollup.jsonl (deduplicated; safe to run repeatedly)",
      false,
    )
    .action(async function (this: Command, _options: FeedbackExportOptions) {
      const options = this.optsWithGlobals() as FeedbackExportOptions;
      if (
        options.format !== "jsonl" &&
        options.format !== "md" &&
        options.format !== "json"
      ) {
        process.stderr.write(
          `crimes: unknown --format "${String(options.format)}". Expected "jsonl", "md", or "json".\n`,
        );
        process.exit(2);
        return;
      }

      const root = resolve(process.cwd());
      const localPath = resolveFeedbackPath(root);

      if (options.appendGlobal) {
        const globalPath = resolveGlobalRollupPath();
        const result = await appendToGlobalRollup({
          localPath,
          globalPath,
          repo: root,
        });
        process.stdout.write(
          `Appended ${result.appended} new ${result.appended === 1 ? "entry" : "entries"} from ${localPath}\n` +
            `  → ${globalPath}\n` +
            `  (${result.skipped} ${result.skipped === 1 ? "entry was" : "entries were"} already present and skipped)\n`,
        );
        return;
      }

      const read = await readFeedback(localPath);
      if (options.format === "jsonl") {
        for (const e of read.entries) {
          process.stdout.write(JSON.stringify(e) + "\n");
        }
        return;
      }
      if (options.format === "json") {
        process.stdout.write(
          JSON.stringify(
            {
              schema_version: "0.1.0",
              report_type: "feedback",
              scope: "repo",
              source_file: localPath,
              entries: read.entries,
              summary: buildFeedbackSummary(read.entries),
            },
            null,
            2,
          ) + "\n",
        );
        return;
      }
      // md
      process.stdout.write(
        formatFeedbackMarkdown(read.entries, localPath, read.loaded),
      );
    });
}

function formatFeedbackMarkdown(
  entries: FeedbackEntry[],
  path: string,
  loaded: boolean,
): string {
  if (!loaded || entries.length === 0) {
    return `# crimes feedback\n\nNo entries recorded (${path}).\n`;
  }
  const latest = latestPerFingerprint(entries);
  const byDetector = new Map<string, FeedbackEntry[]>();
  for (const e of latest.values()) {
    const list = byDetector.get(e.finding_type) ?? [];
    list.push(e);
    byDetector.set(e.finding_type, list);
  }
  const sortedDetectors = Array.from(byDetector.keys()).sort();
  const lines: string[] = [
    "# crimes feedback",
    "",
    `Source: \`${path}\``,
    `Entries (latest per fingerprint): ${latest.size}`,
    "",
  ];
  for (const detector of sortedDetectors) {
    const list = byDetector.get(detector)!;
    lines.push(`## ${detector} (${list.length})`, "");
    for (const e of list) {
      const note = e.note ? ` — "${e.note}"` : "";
      lines.push(`- **[${e.verdict}]** \`${e.fingerprint}\`${note}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
