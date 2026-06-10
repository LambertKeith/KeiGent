import { execFile } from "node:child_process";
import { relative, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import type { ToolContext, ToolDef } from "../types.js";
import { err, ok } from "../types.js";

const GIT_TIMEOUT_MS = 10_000;
const MAX_OUTPUT = 20_000;

export const gitStatusTool: ToolDef = {
  name: "git_status",
  description: "Readonly connector: report local git status for the workspace or a workspace-relative subdirectory.",
  permission: "readonly",
  riskLevel: "R0",
  sideEffect: "none",
  reversible: true,
  concurrencySafe: true,
  timeoutMs: GIT_TIMEOUT_MS + 1_000,
  maxOutputChars: MAX_OUTPUT,
  parameters: Type.Object({
    path: Type.Optional(Type.String({ description: "Workspace-relative directory to inspect. Defaults to workspace root." })),
  }),
  async execute(args, ctx) {
    const path = String(args["path"] ?? ".");
    const cwd = resolveInWorkspace(ctx.workspace, path);
    if (!cwd) return err(`path_escape: ${path}`);
    if (ctx.signal?.aborted) return err("git_status aborted");

    return runGitStatus(cwd, ctx);
  },
};

export const gitTools: ToolDef[] = [gitStatusTool];

function resolveInWorkspace(workspace: string, path: string): string | null {
  const root = resolve(workspace);
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (rel.startsWith("..") || resolve(rel) === rel) return null;
  return target;
}

function runGitStatus(cwd: string, ctx: ToolContext): Promise<ReturnType<typeof ok> | ReturnType<typeof err>> {
  return new Promise((resolvePromise) => {
    let settled = false;
    const settle = (result: ReturnType<typeof ok> | ReturnType<typeof err>) => {
      if (settled) return;
      settled = true;
      ctx.signal?.removeEventListener("abort", onAbort);
      resolvePromise(result);
    };
    const child = execFile(
      "git",
      ["status", "--short", "--branch"],
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_OUTPUT },
      (error, stdout, stderr) => {
        const output = [stdout, stderr].filter(Boolean).join("\n").trim();
        if (error) {
          settle(err(`connector_failure=git_status_unavailable\n${output || error.message}`));
          return;
        }
        settle(ok(output || "## clean"));
      },
    );
    const onAbort = () => {
      child.kill();
      settle(err("git_status aborted"));
    };
    ctx.signal?.addEventListener("abort", onAbort, { once: true });
  });
}
