import type { ToolDef } from "../tools/types.js";
import type { PermissionLevel, RiskLevel } from "../tools/types.js";
import type { WorkflowChildRole, WorkflowPolicy } from "./types.js";

const PERMISSION_ORDER: Record<PermissionLevel, number> = {
  readonly: 0,
  write: 1,
  execute: 2,
  dangerous: 3,
};

const RISK_ORDER: Record<RiskLevel, number> = {
  R0: 0,
  R1: 1,
  R2: 2,
  R3: 3,
  R4: 4,
  R5: 5,
};

export function isToolAllowedByWorkflowPolicy(tool: ToolDef, policy: WorkflowPolicy | undefined, role: WorkflowChildRole): boolean {
  if (!policy) return true;

  if (policy.verifierReadonly === true && role === "verifier") {
    if (tool.permission !== "readonly") return false;
    if (tool.sideEffect !== "none") return false;
  }

  if (policy.maxPermission && PERMISSION_ORDER[tool.permission] > PERMISSION_ORDER[policy.maxPermission]) {
    return false;
  }

  if (policy.maxRiskLevel && RISK_ORDER[tool.riskLevel] > RISK_ORDER[policy.maxRiskLevel]) {
    return false;
  }

  if (policy.allowExternalSideEffects === false && tool.sideEffect === "external") {
    return false;
  }

  return true;
}

export function approvalScopeMatches(targetResource: string, scopes: string[] | undefined): boolean {
  if (!scopes || scopes.length === 0) return false;
  return scopes.some((scope) => targetResource === scope || targetResource.startsWith(`${scope}/`));
}
