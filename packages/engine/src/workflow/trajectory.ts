import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { emptyAutonomySummary } from "./autonomy.js";
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
  return normalizeWorkflowTrajectory(JSON.parse(text));
}

export function replayWorkflowTrajectory(trajectory: WorkflowTrajectory): WorkflowResult {
  const normalized = normalizeWorkflowTrajectory(trajectory);
  return {
    workflowId: normalized.workflowId,
    mode: normalized.mode,
    exitReason: normalized.exitReason,
    finalResponse: normalized.finalResponse,
    childRuns: normalized.childRuns.map((child) => ({
      id: child.id,
      role: child.role,
      result: child.result,
      trajectory: child.trajectory,
    })),
    evidence: normalized.evidence,
    budget: normalized.budget,
    budgetUsage: normalized.budgetUsage,
    autonomy: normalized.autonomy,
    durationMs: normalized.durationMs,
    trajectory: normalized,
  };
}

function normalizeWorkflowTrajectory(value: unknown): WorkflowTrajectory {
  const source = value as Partial<WorkflowTrajectory>;
  if (source.autonomy) return source as WorkflowTrajectory;
  return {
    ...source,
    autonomy: source.autonomy ?? emptyAutonomySummary(),
  } as WorkflowTrajectory;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}
