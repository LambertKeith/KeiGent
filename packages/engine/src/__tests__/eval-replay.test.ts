import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { DEFAULT_EVAL_CASES } from "../evals/cases.js";
import { createTrajectoryReplayExecutor, createTrajectoryReplayExecutorFromFiles, loopResultFromTrajectory } from "../evals/replay.js";
import { runEvalCases } from "../evals/runner.js";
import type { Trajectory } from "../types.js";

const replayCase = DEFAULT_EVAL_CASES.find((c) => c.id === "smoke-tool-file-write")!;

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
});
