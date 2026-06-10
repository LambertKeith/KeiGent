import { describe, expect, it } from "vitest";
import { approvalScopeMatches, isToolAllowedByWorkflowPolicy } from "../workflow/policy.js";
import type { ToolDef } from "../tools/types.js";
import type { WorkflowPolicy } from "../workflow/types.js";

function tool(overrides: Partial<ToolDef> = {}): ToolDef {
  return {
    name: "file_read",
    description: "read",
    parameters: {},
    permission: "readonly",
    riskLevel: "R0",
    sideEffect: "none",
    reversible: true,
    async execute() {
      return { content: "ok", isError: false };
    },
    ...overrides,
  } as ToolDef;
}

describe("workflow policy helpers", () => {
  it("caps child tools by permission, risk, and external side effects", () => {
    const policy: WorkflowPolicy = {
      maxPermission: "write",
      maxRiskLevel: "R2",
      allowExternalSideEffects: false,
    };

    expect(isToolAllowedByWorkflowPolicy(tool({ permission: "readonly", riskLevel: "R0" }), policy, "worker")).toBe(true);
    expect(isToolAllowedByWorkflowPolicy(tool({ permission: "write", riskLevel: "R2" }), policy, "worker")).toBe(true);
    expect(isToolAllowedByWorkflowPolicy(tool({ permission: "execute", riskLevel: "R2" }), policy, "worker")).toBe(false);
    expect(isToolAllowedByWorkflowPolicy(tool({ permission: "write", riskLevel: "R3" }), policy, "worker")).toBe(false);
    expect(isToolAllowedByWorkflowPolicy(tool({ permission: "readonly", riskLevel: "R1", sideEffect: "external" }), policy, "worker")).toBe(false);
  });

  it("forces reviewer and legacy verifier children to readonly tools when verifierReadonly is enabled", () => {
    const policy: WorkflowPolicy = {
      maxPermission: "dangerous",
      maxRiskLevel: "R5",
      allowExternalSideEffects: true,
      verifierReadonly: true,
    };

    expect(isToolAllowedByWorkflowPolicy(tool({ permission: "readonly", sideEffect: "none" }), policy, "reviewer")).toBe(true);
    expect(isToolAllowedByWorkflowPolicy(tool({ permission: "write", sideEffect: "local" }), policy, "reviewer")).toBe(false);
    expect(isToolAllowedByWorkflowPolicy(tool({ permission: "readonly", sideEffect: "external" }), policy, "reviewer")).toBe(false);
    expect(isToolAllowedByWorkflowPolicy(tool({ permission: "readonly", sideEffect: "none" }), policy, "verifier")).toBe(true);
    expect(isToolAllowedByWorkflowPolicy(tool({ permission: "write", sideEffect: "local" }), policy, "verifier")).toBe(false);
    expect(isToolAllowedByWorkflowPolicy(tool({ permission: "readonly", sideEffect: "external" }), policy, "verifier")).toBe(false);
    expect(isToolAllowedByWorkflowPolicy(tool({ permission: "write", sideEffect: "local" }), policy, "worker")).toBe(true);
  });

  it("matches inherited approval scopes only by exact scope or descendant resource", () => {
    const scopes = ["workspace:/tmp/keigent", "https://example.com/forms/123"];

    expect(approvalScopeMatches("workspace:/tmp/keigent/report.txt", scopes)).toBe(true);
    expect(approvalScopeMatches("https://example.com/forms/123/submit", scopes)).toBe(true);
    expect(approvalScopeMatches("workspace:/tmp/other/report.txt", scopes)).toBe(false);
    expect(approvalScopeMatches("https://example.com/forms/456", scopes)).toBe(false);
  });
});
