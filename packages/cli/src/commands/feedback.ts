import type { Command } from "commander";
import { registerFeedbackExportSubcommand } from "./feedback-export.js";
import { registerFeedbackListSubcommand } from "./feedback-list.js";
import { registerFeedbackRecheckSubcommand } from "./feedback-recheck.js";
import { registerFeedbackSummarySubcommand } from "./feedback-summary.js";
import { handleFeedbackWrite } from "./feedback-write.js";

/**
 * Wire the `feedback` command tree on the root `program`. The write
 * path and each read subcommand live in their own sibling module so
 * this file stays a narrow orchestration surface.
 */
export function registerFeedbackCommand(program: Command): void {
  const feedback = program
    .command("feedback")
    .description(
      "Capture per-finding verdicts (tp/fp/known) to feed the calibration loop. " +
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
    .action(handleFeedbackWrite);

  registerFeedbackListSubcommand(feedback);
  registerFeedbackRecheckSubcommand(feedback);
  registerFeedbackSummarySubcommand(feedback);
  registerFeedbackExportSubcommand(feedback);
}
