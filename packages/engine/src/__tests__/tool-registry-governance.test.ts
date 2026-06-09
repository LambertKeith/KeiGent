import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import { DenyByDefaultGate, type ApprovalDecision, type ApprovalRequest, type ToolContext, type ToolDef } from "../tools/types.js";

function ctx(
  approval: ToolContext["approval"] = { request: vi.fn(async () => true) },
  onApprovalDecision?: (decision: ApprovalDecision) => void,
): ToolContext {
  return {
    workspace: "/tmp/workspace",
    browser: null,
    approval,
    task: { goal: "Run a command", profile: "auto" },
    headless: true,
    onApprovalDecision,
  };
}

function tool(overrides: Partial<ToolDef>): ToolDef {
  return {
    name: "test_tool",
    description: "test",
    parameters: {},
    permission: "readonly",
    riskLevel: "R0",
    sideEffect: "none",
    reversible: true,
    execute: vi.fn(async () => ({ content: "ok", isError: false })),
    ...overrides,
  };
}

describe("ToolRegistry permission governance", () => {
  it("sends structured approval context for approval-required tools", async () => {
    const approval = { request: vi.fn(async (_request: ApprovalRequest) => true) };
    const registry = new ToolRegistry().register(
      tool({
        name: "shell",
        permission: "dangerous",
        riskLevel: "R5",
        sideEffect: "local",
        reversible: false,
      }),
    );

    const result = await registry.execute("shell", { command: "rm -rf dist" }, ctx(approval));

    expect(result.isError).toBe(false);
    expect(approval.request).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "shell",
        args: { command: "rm -rf dist" },
        permission: "dangerous",
        riskLevel: "R5",
        sideEffect: "local",
        reversible: false,
        action: "执行工具 shell",
        targetResource: "workspace:/tmp/workspace",
      }),
    );
  });

  it("DenyByDefaultGate rejects high-risk tools in non-interactive execution", async () => {
    const registry = new ToolRegistry().register(
      tool({
        name: "keyboard",
        permission: "dangerous",
        riskLevel: "R5",
        sideEffect: "external",
        reversible: false,
      }),
    );

    const result = await registry.execute("keyboard", { action: "type", text: "secret" }, ctx(new DenyByDefaultGate()));

    expect(result.isError).toBe(true);
    expect(result.content).toContain("未获授权");
    expect(result.content).toContain("R5");
  });

  it("reports approval decisions for audit trail persistence", async () => {
    const decisions: ApprovalDecision[] = [];
    const registry = new ToolRegistry().register(
      tool({
        name: "shell",
        permission: "dangerous",
        riskLevel: "R5",
        sideEffect: "local",
        reversible: false,
      }),
    );

    const result = await registry.execute(
      "shell",
      { command: "deploy", apiKey: "sk-test-secret" },
      ctx(new DenyByDefaultGate(), (decision) => decisions.push(decision)),
    );

    expect(result.isError).toBe(true);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      approved: false,
      request: expect.objectContaining({
        toolName: "shell",
        permission: "dangerous",
        riskLevel: "R5",
        exposesSecrets: true,
      }),
    });
    expect(JSON.stringify(decisions[0])).not.toContain("sk-test-secret");
    expect(decisions[0].request.args.apiKey).toContain("[REDACTED");
    expect(decisions[0].decidedAt).toEqual(expect.any(String));
  });

  it("does not ask approval for readonly R0 tools", async () => {
    const approval = { request: vi.fn(async () => true) };
    const registry = new ToolRegistry().register(tool({ name: "file_read" }));

    const result = await registry.execute("file_read", { path: "a.txt" }, ctx(approval));

    expect(result.isError).toBe(false);
    expect(approval.request).not.toHaveBeenCalled();
  });
});
