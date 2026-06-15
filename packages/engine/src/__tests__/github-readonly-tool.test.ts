import { describe, expect, it, vi, afterEach } from "vitest";
import { buildDefaultRegistry } from "../tools/index.js";
import type { ToolContext } from "../tools/types.js";

function ctx(approval = { request: vi.fn(async () => true) }): ToolContext {
  return {
    workspace: "/tmp/workspace",
    browser: null,
    approval,
    task: { goal: "Read GitHub repository metadata", profile: "auto" },
    headless: true,
  };
}

describe("github_repo_read readonly connector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads public GitHub repo metadata without approval and redacts response secrets", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      full_name: "openai/codex",
      description: "Agent with api_key=sk-github-secret-123456",
      default_branch: "main",
      private: false,
      html_url: "https://github.com/openai/codex",
      pushed_at: "2026-06-10T00:00:00Z",
    }), { status: 200, statusText: "OK", headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const approval = { request: vi.fn(async () => true) };
    const registry = buildDefaultRegistry();

    const result = await registry.execute("github_repo_read", { owner: "openai", repo: "codex" }, ctx(approval));

    expect(result.isError).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/repos/openai/codex", expect.objectContaining({ method: "GET" }));
    expect(result.content).toContain("connector=github_repo_read");
    expect(result.content).toContain("source_url=https://api.github.com/repos/openai/codex");
    expect(result.content).toContain('"full_name": "openai/codex"');
    expect(result.content).toContain("[REDACTED]");
    expect(result.content).not.toContain("sk-github-secret-123456");
    expect(result.sources).toEqual([{
      kind: "url",
      ref: "https://api.github.com/repos/openai/codex",
      connector: "github_repo_read",
    }]);
    expect(approval.request).not.toHaveBeenCalled();
    expect(registry.get("github_repo_read")).toMatchObject({
      permission: "readonly",
      riskLevel: "R0",
      sideEffect: "none",
      reversible: true,
    });
  });

  it("rejects write-like options and reports GitHub connector failures structurally", async () => {
    const registry = buildDefaultRegistry();

    await expect(registry.execute("github_repo_read", {
      owner: "openai",
      repo: "codex",
      token: "sk-token",
    }, ctx())).resolves.toMatchObject({
      isError: true,
      content: expect.stringContaining("write_unsupported=github_repo_readonly"),
    });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404, statusText: "Not Found" })));
    await expect(registry.execute("github_repo_read", { owner: "openai", repo: "missing" }, ctx())).resolves.toMatchObject({
      isError: true,
      content: expect.stringContaining("connector_failure=github_repo_read_unavailable"),
    });
  });
});
