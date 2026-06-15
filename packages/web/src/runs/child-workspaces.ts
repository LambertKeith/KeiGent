import type { RunRecord } from "@keigent/engine";
import { redactText } from "../shared/redaction.js";

export interface RunChildRunPanel {
  id: string;
  role: string;
  profile?: string;
  exitReason: string;
  iterations: number;
  toolCalls: number;
  checkpointsPassed: number;
  workspace?: RunChildWorkspacePanel;
}

export interface RunChildWorkspacePanel {
  workspaceId: string;
  branchName?: string;
  workspacePath?: string;
  manifestPath?: string;
  status: string;
  cleanupMode?: string;
  abandonedReason?: string;
  artifacts: Array<{
    kind: string;
    path: string;
    relativePath: string;
    sizeBytes: number;
  }>;
  conflicts: Array<{
    relativePath: string;
    workspaceIds: string[];
    childRunIds: string[];
  }>;
}

export function childRunsFor(record: RunRecord): RunChildRunPanel[] {
  return (record.childRuns ?? []).map((child) => ({
    id: redactText(child.id),
    role: child.role,
    ...(child.profile ? { profile: redactText(child.profile) } : {}),
    exitReason: redactText(child.exitReason),
    iterations: numberValue(child.iterations),
    toolCalls: numberValue(child.toolCalls),
    checkpointsPassed: numberValue(child.checkpointsPassed),
    ...(child.workspace ? { workspace: childWorkspaceFor(child.workspace) } : {}),
  }));
}

function childWorkspaceFor(workspace: NonNullable<NonNullable<RunRecord["childRuns"]>[number]["workspace"]>): RunChildWorkspacePanel {
  return {
    workspaceId: redactText(workspace.workspaceId),
    ...(workspace.branchName ? { branchName: redactText(workspace.branchName) } : {}),
    ...(workspace.workspacePath ? { workspacePath: redactText(workspace.workspacePath) } : {}),
    ...(workspace.manifestPath ? { manifestPath: redactText(workspace.manifestPath) } : {}),
    status: workspace.status,
    ...(workspace.cleanupMode ? { cleanupMode: workspace.cleanupMode } : {}),
    ...(workspace.abandonedReason ? { abandonedReason: redactText(workspace.abandonedReason) } : {}),
    artifacts: workspace.artifacts.map((artifact) => ({
      kind: artifact.kind,
      path: redactText(artifact.path),
      relativePath: redactText(artifact.relativePath),
      sizeBytes: numberValue(artifact.sizeBytes),
    })),
    conflicts: workspace.conflicts.map((conflict) => ({
      relativePath: redactText(conflict.relativePath),
      workspaceIds: conflict.workspaceIds.map(redactText),
      childRunIds: conflict.childRunIds.map(redactText),
    })),
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
