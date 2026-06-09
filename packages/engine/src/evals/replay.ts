import { readFile } from "node:fs/promises";
import { DEFAULT_EVAL_CASES } from "./cases.js";
import type { ExitReason, LoopResult, Task, Trajectory, TrajectoryStep } from "../types.js";
import type { EvalCase, EvalExecutor } from "./types.js";

export interface TrajectoryReplayExecutorOptions {
  trajectoriesByCaseId: Record<string, Trajectory>;
  errorsByCaseId?: Record<string, string>;
}

export interface TrajectoryReplayFileOptions {
  pathsByCaseId: Record<string, string>;
}

export interface ReplayFixtureSet {
  cases: EvalCase[];
  executor: EvalExecutor;
  trajectoriesByCaseId: Record<string, Trajectory>;
}

interface ReplayFixtureFile {
  fixtures: ReplayFixtureEntry[];
}

interface ReplayFixtureEntry {
  caseId: string;
  profile?: string;
  exitReason?: ExitReason;
  finalResponse: string;
  steps?: TrajectoryStep[];
  durationMs?: number;
  skillsUsed?: string[];
  proves?: string;
  doesNotProve?: string;
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
    failure: trajectory.failure,
  };
}

export function createTrajectoryReplayExecutor(opts: TrajectoryReplayExecutorOptions): EvalExecutor {
  return {
    executionMode: "replay",
    async run(evalCase) {
      const error = opts.errorsByCaseId?.[evalCase.id];
      if (error) throw new Error(error);

      const trajectory = opts.trajectoriesByCaseId[evalCase.id];
      if (!trajectory) throw new Error(`no replay trajectory for case ${evalCase.id}`);
      return {
        selectedProfile: trajectory.profile,
        executionMode: "replay",
        result: loopResultFromTrajectory(trajectory),
      };
    },
  };
}

export async function createTrajectoryReplayExecutorFromFiles(opts: TrajectoryReplayFileOptions): Promise<EvalExecutor> {
  const trajectoriesByCaseId: Record<string, Trajectory> = {};
  const errorsByCaseId: Record<string, string> = {};

  await Promise.all(
    Object.entries(opts.pathsByCaseId).map(async ([caseId, path]) => {
      try {
      const raw = await readFile(path, "utf8");
        trajectoriesByCaseId[caseId] = parseTrajectory(raw, caseId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errorsByCaseId[caseId] = `invalid replay trajectory for case ${caseId}: ${message}`;
      }
    }),
  );

  return createTrajectoryReplayExecutor({ trajectoriesByCaseId, errorsByCaseId });
}

export async function loadReplayFixtureSet(
  fixtureUrl: URL = new URL("./fixtures/replay-suite.json", import.meta.url),
): Promise<ReplayFixtureSet> {
  const raw = await readFile(fixtureUrl, "utf8");
  const file = parseReplayFixtureFile(raw);
  const casesById = new Map(DEFAULT_EVAL_CASES.map((evalCase) => [evalCase.id, evalCase]));
  const trajectoriesByCaseId: Record<string, Trajectory> = {};
  const cases: EvalCase[] = [];

  for (const entry of file.fixtures) {
    const baseCase = casesById.get(entry.caseId);
    if (!baseCase) throw new Error(`replay fixture references unknown eval case ${entry.caseId}`);

    const trajectory = trajectoryFromFixture(baseCase.task, entry, baseCase.expectedProfile ?? "divergent-research");
    trajectoriesByCaseId[entry.caseId] = trajectory;
    cases.push({
      ...baseCase,
      proves: entry.proves ?? `replay trajectory preserves ${baseCase.id} historical semantics`,
      doesNotProve: entry.doesNotProve ?? `live execution freshness for ${baseCase.id}`,
    });
  }

  return {
    cases,
    trajectoriesByCaseId,
    executor: createTrajectoryReplayExecutor({ trajectoriesByCaseId }),
  };
}

function parseTrajectory(raw: string, caseId: string): Trajectory {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) throw new Error("trajectory must be an object");
  if (!Array.isArray(parsed.steps)) throw new Error("trajectory.steps must be an array");
  if (typeof parsed.finalResponse !== "string") throw new Error("trajectory.finalResponse must be a string");
  if (typeof parsed.exitReason !== "string") throw new Error("trajectory.exitReason must be a string");
  if (typeof parsed.profile !== "string") throw new Error("trajectory.profile must be a string");
  if (!isRecord(parsed.task)) throw new Error(`trajectory.task missing for ${caseId}`);
  return parsed as unknown as Trajectory;
}

function parseReplayFixtureFile(raw: string): ReplayFixtureFile {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.fixtures)) {
    throw new Error("replay fixture file must contain a fixtures array");
  }
  return parsed as unknown as ReplayFixtureFile;
}

function trajectoryFromFixture(task: Task, entry: ReplayFixtureEntry, fallbackProfile: string): Trajectory {
  return {
    task,
    profile: entry.profile ?? fallbackProfile,
    exitReason: entry.exitReason ?? "success",
    steps: entry.steps ?? [{ iteration: 1, kind: "text_output", text: entry.finalResponse }],
    finalResponse: entry.finalResponse,
    durationMs: entry.durationMs ?? 1,
    skillsUsed: entry.skillsUsed ?? [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
