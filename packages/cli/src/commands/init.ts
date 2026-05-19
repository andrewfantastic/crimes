import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Command } from "commander";

interface InitCommandOptions {
  agents: boolean;
  agentSkill: boolean;
  codexSkill: boolean;
  force: boolean;
}

const CONFIG_FILENAME = "crimes.config.json";
const CLAUDE_SKILL_PATH = ".claude/skills/crimes/SKILL.md";
const CODEX_SKILL_PATH = ".agents/skills/crimes/SKILL.md";

/**
 * Sensible starter `crimes.config.json` — opinionated defaults with
 * inline JSONC comments that explain the new knobs. The trailing newline
 * keeps `git diff` and POSIX text tools happy.
 *
 * The `$schema` URL is reserved against the website's eventual hosting;
 * even if it 404s today, the comment block tells the user where they
 * would get IDE validation once it lands.
 */
const STARTER_CONFIG = `{
  "$schema": "https://crimes.sh/schema/0.1.0/config.json",

  "include": ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
  "exclude": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/out/**",
    "**/coverage/**",
    "**/*.min.js",
    "**/*.generated.*",
    "**/.crimes/**"
  ],

  "thresholds": {
    "largeFileLines": 300,
    "largeFunctionLines": 60,
    "todoDensityPerKLoc": 10
  },

  "detectors": {
    "enable": [],
    "disable": []
  },

  "ia": {
    "aliasGroups": []
  },

  "suppressions": {
    "path": ".crimes/suppressions.json"
  }
}
`;

const AGENT_SKILL = `---
name: crimes-codebase-risk
description: Use when editing, reviewing, or investigating a TypeScript / JavaScript codebase that ships with the crimes CLI. Helps agents run pre-edit context checks, post-edit scans, and interpret findings before risky changes.
---

# crimes — codebase risk workflow

\`crimes\` is a deterministic CLI (no LLM) that reports change risk and agent risk. JSON output is the stable contract; prefer it when planning.

## When to run it

- Before editing an unfamiliar file: \`crimes context <file> --format json\`
- Before a broad refactor: \`crimes scan <path> --format json\`
- After edits: \`crimes scan --changed --format json\`
- Before merging a branch: \`crimes verdict --format json\`

## Decision rules

- Treat any new \`severity: "high"\` finding introduced by your edit as a blocker unless the user explicitly accepts it.
- Read \`evidence[]\` before acting; it contains deterministic facts, not LLM opinion.
- Use \`scores.agent_risk\` to decide which findings need human attention first.
- If a finding is a false positive, record feedback with \`crimes feedback <fingerprint> --verdict fp --note "<why>"\` rather than silently ignoring it.
`;

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description(
      "Write a starter crimes.config.json to the current directory.",
    )
    .option(
      "--agent-skill",
      `also write ${CLAUDE_SKILL_PATH} so Claude Code discovers crimes in this repo`,
      false,
    )
    .option(
      "--codex-skill",
      `also write ${CODEX_SKILL_PATH} so Codex discovers crimes in this repo`,
      false,
    )
    .option(
      "--agents",
      "also write Claude Code and Codex skill files for future agents",
      false,
    )
    .option(
      "--force",
      "overwrite existing generated files instead of failing",
      false,
    )
    .action((options: InitCommandOptions) => {
      const path = resolve(process.cwd(), CONFIG_FILENAME);
      const writeClaudeSkill = options.agents || options.agentSkill;
      const writeCodexSkill = options.agents || options.codexSkill;
      const writeAgentSkills = writeClaudeSkill || writeCodexSkill;
      const claudeSkillPath = resolve(process.cwd(), CLAUDE_SKILL_PATH);
      const codexSkillPath = resolve(process.cwd(), CODEX_SKILL_PATH);
      const configExists = existsSync(path);

      if (configExists && !options.force && !writeAgentSkills) {
        process.stderr.write(
          `crimes: ${CONFIG_FILENAME} already exists. ` +
            `Pass --force to overwrite.\n`,
        );
        process.exit(2);
        return;
      }
      if (writeClaudeSkill && existsSync(claudeSkillPath) && !options.force) {
        process.stderr.write(
          `crimes: ${CLAUDE_SKILL_PATH} already exists. ` +
            `Pass --force to overwrite.\n`,
        );
        process.exit(2);
        return;
      }
      if (writeCodexSkill && existsSync(codexSkillPath) && !options.force) {
        process.stderr.write(
          `crimes: ${CODEX_SKILL_PATH} already exists. ` +
            `Pass --force to overwrite.\n`,
        );
        process.exit(2);
        return;
      }

      const written: string[] = [];
      if (!configExists || options.force) {
        writeFileSync(path, STARTER_CONFIG, "utf8");
        written.push(CONFIG_FILENAME);
      }
      if (writeClaudeSkill) {
        mkdirSync(dirname(claudeSkillPath), { recursive: true });
        writeFileSync(claudeSkillPath, AGENT_SKILL, "utf8");
        written.push(CLAUDE_SKILL_PATH);
      }
      if (writeCodexSkill) {
        mkdirSync(dirname(codexSkillPath), { recursive: true });
        writeFileSync(codexSkillPath, AGENT_SKILL, "utf8");
        written.push(CODEX_SKILL_PATH);
      }

      if (written.includes(CONFIG_FILENAME)) {
        const lineCount = STARTER_CONFIG.split("\n").length - 1;
        process.stdout.write(
          `Wrote ${CONFIG_FILENAME} (${lineCount} lines). ` +
            `Tweak include/exclude/thresholds and commit.\n`,
        );
      } else if (configExists) {
        process.stdout.write(`Kept existing ${CONFIG_FILENAME}.\n`);
      }
      const agentFiles = written.filter((file) => file !== CONFIG_FILENAME);
      if (agentFiles.length > 0) {
        process.stdout.write(`Wrote ${agentFiles}. Commit them so future agents auto-discover crimes.\n`);
      }
    });
}

/**
 * Exposed for the init command's tests — keeps the file fixture in sync
 * with the writer.
 */
export const STARTER_CONFIG_TEXT = STARTER_CONFIG;
export const AGENT_SKILL_TEXT = AGENT_SKILL;
