import { Type } from "@earendil-works/pi-ai";
import { redactText } from "../../redaction.js";
import type { ToolDef } from "../types.js";
import { err, ok } from "../types.js";

const GITHUB_TIMEOUT_MS = 30_000;

export const githubRepoReadTool: ToolDef = {
  name: "github_repo_read",
  description: "Readonly connector: read public GitHub repository metadata by owner/repo without credentials or write-capable request options.",
  permission: "readonly",
  riskLevel: "R0",
  sideEffect: "none",
  reversible: true,
  concurrencySafe: true,
  timeoutMs: GITHUB_TIMEOUT_MS + 1_000,
  maxOutputChars: 50_000,
  parameters: Type.Object({
    owner: Type.String({ description: "GitHub repository owner" }),
    repo: Type.String({ description: "GitHub repository name" }),
  }),
  async execute(args, ctx) {
    const owner = cleanSegment(args["owner"]);
    const repo = cleanSegment(args["repo"]);
    if (!owner || !repo) return err("github_repo_read 需要 owner 和 repo 参数");
    if (hasWriteLikeOptions(args)) {
      return err("write_unsupported=github_repo_readonly: credentials, headers, method, and body are not allowed");
    }
    if (ctx.signal?.aborted) return err("github_repo_read aborted");

    const sourceUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    ctx.signal?.addEventListener("abort", abortFromParent, { once: true });
    const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
    try {
      const resp = await fetch(sourceUrl, {
        method: "GET",
        headers: { accept: "application/vnd.github+json" },
        signal: controller.signal,
      });
      const text = await resp.text();
      if (!resp.ok) {
        return err(`connector_failure=github_repo_read_unavailable\nHTTP ${resp.status} ${resp.statusText}\n${redactText(text)}`);
      }
      return ok([
        "connector=github_repo_read",
        `source_url=${sourceUrl}`,
        `HTTP ${resp.status} ${resp.statusText}`,
        "",
        redactText(formatJsonText(text)),
      ].join("\n"), undefined, [{ kind: "url", ref: sourceUrl, connector: "github_repo_read" }]);
    } catch (error) {
      return err(`connector_failure=github_repo_read_unavailable\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener("abort", abortFromParent);
    }
  },
};

export const githubTools: ToolDef[] = [githubRepoReadTool];

function cleanSegment(value: unknown): string {
  return String(value ?? "").trim().replace(/^\/+|\/+$/g, "");
}

function hasWriteLikeOptions(args: Record<string, unknown>): boolean {
  return args["token"] !== undefined
    || args["authorization"] !== undefined
    || args["headers"] !== undefined
    || args["body"] !== undefined
    || args["method"] !== undefined;
}

function formatJsonText(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
