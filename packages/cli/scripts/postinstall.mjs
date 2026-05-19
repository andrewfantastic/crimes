if (process.env.CI === "true" || process.env.CRIMES_DISABLE_POSTINSTALL === "1") {
  process.exit(0);
}

process.stdout.write(
  [
    "crimes installed.",
    "Run `crimes init --agents` in a repo to add crimes.config.json plus Claude Code and Codex skill files.",
    "",
  ].join("\n"),
);
