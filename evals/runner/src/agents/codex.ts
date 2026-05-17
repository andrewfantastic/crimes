import { AgentInvocationError, runProcess } from "./claude.js";
import type { AgentRunResult, InvokeClaudeOptions } from "./claude.js";

export type InvokeCodexOptions = InvokeClaudeOptions;

/**
 * Shell out to the locally-installed `codex` CLI in non-interactive
 * mode. Authenticates against the user's existing Codex subscription.
 *
 * Wire format: `codex exec --json <prompt>`. The CLI's JSON output is
 * tolerant about field shape; we extract `result` / `output` /
 * `response` and fall back to raw stdout when no envelope is detected.
 */
export async function invokeCodex(
  options: InvokeCodexOptions,
): Promise<AgentRunResult> {
  const args = ["exec", "--json", options.prompt];
  if (options.model) args.push("--model", options.model);
  const { stdout, stderr, exitCode } = await runProcess(
    "codex",
    args,
    options.timeoutMs ?? 600_000,
  );

  if (exitCode !== 0) {
    throw new AgentInvocationError(
      `codex exited ${exitCode}: ${stderr.trim() || "(no stderr)"}`,
    );
  }

  let response: string;
  try {
    const parsed = JSON.parse(stdout) as {
      result?: string;
      output?: string;
      response?: string;
    };
    response = parsed.result ?? parsed.output ?? parsed.response ?? stdout;
  } catch {
    response = stdout;
  }
  return { response, transcript: stdout, stderr, exitCode };
}
