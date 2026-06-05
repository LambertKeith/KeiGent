import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { WorkflowResult, WorkflowTrajectory } from "./types.js";

export async function saveWorkflowTrajectory(
  trajectory: WorkflowTrajectory,
  options?: { dir?: string },
): Promise<string> {
  const dir = options?.dir ?? join(process.cwd(), ".trajectories", "workflows");
  await mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${safeName(trajectory.workflowId)}-${trajectory.exitReason}.json`;
  const path = join(dir, filename);
  await writeFile(path, JSON.stringify(trajectory, null, 2), "utf-8");
  return path;
}

export async function loadWorkflowTrajectory(path: string): Promise<WorkflowTrajectory> {
  const text = await readFile(path, "utf-8");
  return JSON.parse(text) as WorkflowTrajectory;
}

export function replayWorkflowTrajectory(trajectory: WorkflowTrajectory): WorkflowResult {
  return {
    workflowId: trajectory.workflowId,
    mode: trajectory.mode,
    exitReason: trajectory.exitReason,
    finalResponse: trajectory.finalResponse,
    childRuns: trajectory.childRuns.map((child) => ({
      id: child.id,
      role: child.role,
      result: child.result,
      trajectory: child.trajectory,
    })),
    evidence: trajectory.evidence,
    budget: trajectory.budget,
    budgetUsage: trajectory.budgetUsage,
    durationMs: trajectory.durationMs,
    trajectory,
  };
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}
