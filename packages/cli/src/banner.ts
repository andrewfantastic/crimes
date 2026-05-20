export function welcomeBanner(version: string): string {
  return [
    `crimes ${version}`,
    "",
    "A crime scene investigator for your codebase. Built for agents, readable by humans.",
    "",
    "Pick one to get started:",
    "  crimes context <file>  pre-edit briefing for a single file",
    "  crimes scan            risk overview for the whole repo",
    "  crimes init --agents   set up config + a skill for your coding agent",
    "  crimes --help          list all commands",
    "",
    "Docs: https://crimes.sh",
    "",
  ].join("\n");
}
