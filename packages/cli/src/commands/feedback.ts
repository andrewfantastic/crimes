import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  appendSuppression,
  loadConfig,
  loadSuppressions,
  minorKey,
  removeSuppression,
  resolveFeedbackPath,
  resolveSuppressionsPath,
  writeFeedbackEntry,
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
}
