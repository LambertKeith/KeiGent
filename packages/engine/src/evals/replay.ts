import { readFile } from "node:fs/promises";
import type { LoopResult, Trajectory } from "../types.js";
import type { EvalExecutor } from "./types.js";

export interface TrajectoryReplayExecutorOptions {
  trajectoriesByCaseId: Record<string, Trajectory>;
}

export interface TrajectoryReplayFileOptions {
  pathsByCaseId: Record<string, string>;
}

export function loopResultFromTrajectory(trajectory: Trajectory): LoopResult {
  const iterations = trajectory.steps.reduce((max, step) => Math.max(max, step.iteration), 0);
  const checkpointsPassed = trajectory.steps.filter((step) => step.kind === "checkpoint" && step.verdictPassed === true).length;
  const totalToolCalls = trajectory.steps.filter((step) => step.kind === "tool_call").length;

  return {
    exitReason: trajectory.exitReason,
    finalResponse: trajectory.finalResponse,
    iterations,
    checkpointsPassed,
    totalToolCalls,
    trajectory,
  };
}

export function createTrajectoryReplayExecutor(opts: TrajectoryReplayExecutorOptions): EvalExecutor {
  return {
    async run(evalCase) {
      const trajectory = opts.trajectoriesByCaseId[evalCase.id];
      if (!trajectory) throw new Error(`no replay trajectory for case ${evalCase.id}`);
      return {
        selectedProfile: trajectory.profile,
        result: loopResultFromTrajectory(trajectory),
      };
    },
  };
}

export async function createTrajectoryReplayExecutorFromFiles(opts: TrajectoryReplayFileOptions): Promise<EvalExecutor> {
  const entries = await Promise.all(
    Object.entries(opts.pathsByCaseId).map(async ([caseId, path]) => {
      const raw = await readFile(path, "utf8");
      return [caseId, JSON.parse(raw) as Trajectory] as const;
    }),
  );

  return createTrajectoryReplayExecutor({ trajectoriesByCaseId: Object.fromEntries(entries) });
}
