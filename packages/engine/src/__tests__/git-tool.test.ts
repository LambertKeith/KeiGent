import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { buildDefaultRegistry } from "../tools/index.js";
import type { ToolContext } from "../tools/types.js";

const execFileAsync = promisify(execFile);

function ctx(workspace: string, approval = { request: vi.fn(async () => true) }): ToolContext {
  return {
    workspace,
    browser: null,
    approval,
    task: { goal: "Check git status", profile: "auto" },
    headless: true,
  };
}

describe("git_status readonly connector", () => {
  it("reports local git status through ToolRegistry without approval", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "keigent-git-tool-"));
    await execFileAsync("git", ["init"], { cwd: workspace });
    await writeFile(join(workspace, "README.md"), "hello", "utf8");
    const approval = { request: vi.fn(async () => true) };
    const registry = buildDefaultRegistry();

    const result = await registry.execute("git_status", {}, ctx(workspace, approval));

    expect(result.isError).toBe(false);
    expect(result.content).toContain("##");
    expect(result.content).toContain("?? README.md");
    expect(approval.request).not.toHaveBeenCalled();
    expect(registry.get("git_status")).toMatchObject({
      permission: "readonly",
      riskLevel: "R0",
      sideEffect: "none",
      reversible: true,
    });
  });

  it("rejects path escape and reports connector failure for non-git directories", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "keigent-git-tool-nonrepo-"));
    const nested = join(workspace, "nested");
    await mkdir(nested);
    const registry = buildDefaultRegistry();

    await expect(registry.execute("git_status", { path: ".." }, ctx(workspace))).resolves.toMatchObject({
      isError: true,
      content: expect.stringContaining("path_escape"),
    });
    await expect(registry.execute("git_status", { path: "nested" }, ctx(workspace))).resolves.toMatchObject({
      isError: true,
      content: expect.stringContaining("connector_failure=git_status_unavailable"),
    });
  });
});
