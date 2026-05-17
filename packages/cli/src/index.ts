import { Command } from "commander";
import { registerAuditSuppressionsCommand } from "./commands/audit-suppressions.js";
import { registerBaselineCommand } from "./commands/baseline.js";
import { registerContextCommand } from "./commands/context.js";
import { registerDiffCommand } from "./commands/diff.js";
import { registerExplainCommand } from "./commands/explain.js";
import { registerHotspotsCommand } from "./commands/hotspots.js";
import { registerIgnoreCommand } from "./commands/ignore.js";
import { registerInitCommand } from "./commands/init.js";
import { registerScanCommand } from "./commands/scan.js";
import { registerUnignoreCommand } from "./commands/unignore.js";
import { registerVerdictCommand } from "./commands/verdict.js";

// Injected at build time by tsup from this package's package.json.
declare const __CRIMES_VERSION__: string;

const program = new Command();

program
  .name("crimes")
  .description(
    "A crime scene investigator for your codebase. Built for agents, readable by humans.",
  )
  .version(__CRIMES_VERSION__);

registerInitCommand(program);
registerIgnoreCommand(program);
registerUnignoreCommand(program);
registerAuditSuppressionsCommand(program);
registerExplainCommand(program);
registerScanCommand(program);
registerContextCommand(program);
registerHotspotsCommand(program);
registerDiffCommand(program);
registerBaselineCommand(program);
registerVerdictCommand(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`crimes: ${message}\n`);
  process.exit(1);
});
