import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { DEFAULT_EVAL_CASES } from "../evals/cases.js";
import {
  createTrajectoryReplayExecutor,
  createTrajectoryReplayExecutorFromFiles,
  loadReplayFixtureSet,
  loopResultFromTrajectory,
} from "../evals/replay.js";
import { runEvalCases } from "../evals/runner.js";
import type { Trajectory } from "../types.js";

const replayCase = DEFAULT_EVAL_CASES.find((c) => c.id === "file-write-success")!;

const trajectory = (overrides: Partial<Trajectory> = {}): Trajectory => ({
  task: replayCase.task,
  profile: "convergent-exec",
  exitReason: "success",
  steps: [
    { iteration: 1, kind: "tool_call", toolName: "file_write", toolArgs: { path: "hello.txt" }, toolResult: "ok", toolSucceeded: true },
    { iteration: 2, kind: "checkpoint", checkpointDesc: "file exists", verdictPassed: true, verdictEvidence: "created" },
  ],
  finalResponse: "done: hello.txt created",
  durationMs: 10,
  skillsUsed: [],
  ...overrides,
});

describe("trajectory replay eval executor", () => {
  it("replays an in-memory trajectory as an eval execution", async () => {
    const executor = createTrajectoryReplayExecutor({ trajectoriesByCaseId: { [replayCase.id]: trajectory() } });

    const report = await runEvalCases([replayCase], executor);

    expect(report.passed).toBe(1);
    expect(report.cases[0]).toMatchObject({
      selectedProfile: "convergent-exec",
      toolsUsed: ["file_write"],
      successfulToolsUsed: ["file_write"],
      checkpointsPassed: 1,
      totalToolCalls: 1,
      failures: [],
    });
  });

  it("derives LoopResult metrics from trajectory steps", () => {
    const result = loopResultFromTrajectory(trajectory({
      steps: [
        { iteration: 1, kind: "tool_call", toolName: "file_read", toolResult: "a", toolSucceeded: true },
        { iteration: 3, kind: "tool_call", toolName: "file_write", toolResult: "b", toolSucceeded: false },
        { iteration: 4, kind: "checkpoint", verdictPassed: true, verdictEvidence: "ok" },
        { iteration: 5, kind: "checkpoint", verdictPassed: false, verdictEvidence: "bad" },
      ],
    }));

    expect(result.iterations).toBe(5);
    expect(result.totalToolCalls).toBe(2);
    expect(result.checkpointsPassed).toBe(1);
    expect(result.finalResponse).toBe("done: hello.txt created");
  });

  it("missing replay mapping becomes executor failure in runner", async () => {
    const report = await runEvalCases([replayCase], createTrajectoryReplayExecutor({ trajectoriesByCaseId: {} }));

    expect(report.passed).toBe(0);
    expect(report.cases[0]).toMatchObject({
      failures: [`executor error: no replay trajectory for case ${replayCase.id}`],
      failureCodes: ["executor_error"],
    });
  });

  it("loads a trajectory JSON from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keigent-replay-"));
    const path = join(dir, "trajectory.json");
    await writeFile(path, JSON.stringify(trajectory()), "utf8");

    const executor = await createTrajectoryReplayExecutorFromFiles({ pathsByCaseId: { [replayCase.id]: path } });
    const report = await runEvalCases([replayCase], executor);

    expect(report.passed).toBe(1);
    expect(report.cases[0].selectedProfile).toBe("convergent-exec");
  });

  it("loads the checked-in replay fixture set and marks report cases as replay mode", async () => {
    const fixtureSet = await loadReplayFixtureSet();
    const report = await runEvalCases(fixtureSet.cases, fixtureSet.executor);

    expect(fixtureSet.cases.length).toBeGreaterThanOrEqual(20);
    expect(report.total).toBeGreaterThanOrEqual(20);
    expect(report.passed).toBe(report.total);
    expect(report.executionModes).toEqual({ replay: report.total });
    expect(report.cases.every((evalCase) => evalCase.executionMode === "replay")).toBe(true);

    for (const evalCase of fixtureSet.cases) {
      expect(evalCase.proves, `${evalCase.id} must state replay proves`).toBeTruthy();
      expect(evalCase.doesNotProve, `${evalCase.id} must state replay doesNotProve`).toContain("live");
    }
  });

  it("invalid replay JSON becomes an executor failure instead of aborting fixture loading", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keigent-replay-invalid-"));
    const path = join(dir, "trajectory.json");
    await writeFile(path, "{not-json", "utf8");

    const executor = await createTrajectoryReplayExecutorFromFiles({ pathsByCaseId: { [replayCase.id]: path } });
    const report = await runEvalCases([replayCase], executor);

    expect(report.passed).toBe(0);
    expect(report.cases[0].executionMode).toBe("replay");
    expect(report.cases[0].failureCodes).toEqual(["executor_error"]);
    expect(report.cases[0].failures[0]).toContain("invalid replay trajectory");
  });
});
