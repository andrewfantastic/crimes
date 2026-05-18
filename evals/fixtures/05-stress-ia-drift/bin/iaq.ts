#!/usr/bin/env node
// The advertised iaq surface: two subcommands. Docs reference three more
// ("teams", "workspace", "refresh") that don't exist here —
// command_drift_docs_code_drift.
import { Command } from "commander";

const program = new Command();
program.name("iaq").description("inspect IA drift in a repo");

program
  .command("list")
  .description("list known destinations")
  .action(() => {
    process.stdout.write("[]\n");
  });

program
  .command("get")
  .description("describe one destination")
  .action(() => {
    process.stdout.write("{}\n");
  });

program.parse();
