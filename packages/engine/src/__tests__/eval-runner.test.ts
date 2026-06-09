import { describe, expect, it } from "vitest";
import { buildEvalReport, runEvalCases } from "../evals/runner.js";
import type { EvalCase, EvalExecutor } from "../evals/types.js";
import type { LoopResult, Task } from "../types.js";

const task = (goal: string): Task => ({ goal, profile: "auto" });

const baseCase = (overrides: Partial<EvalCase> = {}): EvalCase => ({
  id: "case-1",
  title: "happy path",
  category: "tool-smoke",
  task: task("create a file"),
  expectedProfile: "convergent-exec",
  acceptance: {
    exitReasons: ["success"],
    requiredTools: ["file_write"],
    forbiddenTools: ["mouse_click"],
    minCheckpoints: 1,
    finalResponseIncludes: ["done"],
  },
  ...overrides,
});

const loopResult = (overrides: Partial<LoopResult> = {}): LoopResult => ({
  exitReason: "success",
  finalResponse: "done",
  iterations: 2,
  checkpointsPassed: 1,
  totalToolCalls: 1,
  trajectory: {
    task: task("create a file"),
    profile: "convergent-exec",
    exitReason: "success",
    steps: [
      {
        iteration: 1,
        kind: "tool_call",
        toolName: "file_write",
        toolArgs: { path: "hello.txt" },
        toolResult: "ok",
        toolSucceeded: true,
      },
    ],
    finalResponse: "done",
    durationMs: 10,
    skillsUsed: [],
  },
  ...overrides,
});

const executorReturning = (result: LoopResult, selectedProfile = "convergent-exec"): EvalExecutor => ({
  async run() {
    return { selectedProfile, result };
  },
});

describe("runEvalCases", () => {
  it("marks a case passed when profile, exit reason, tools, checkpoints, and response all satisfy acceptance", async () => {
    const report = await runEvalCases([baseCase()], executorReturning(loopResult()));

    expect(report.total).toBe(1);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.profileAccuracy).toBe(1);
    expect(report.cases[0]).toMatchObject({
      id: "case-1",
      passed: true,
      selectedProfile: "convergent-exec",
      profileMatched: true,
      toolsUsed: ["file_write"],
      failures: [],
      failureCodes: [],
    });
  });

  it("requires required tools to have at least one successful call", async () => {
    const failedToolResult = loopResult({
      trajectory: {
        ...loopResult().trajectory,
        steps: [{ iteration: 1, kind: "tool_call", toolName: "file_write", toolResult: "denied", toolSucceeded: false }],
      },
    });

    const report = await runEvalCases([baseCase()], executorReturning(failedToolResult));

    expect(report.passed).toBe(0);
    expect(report.cases[0].toolsUsed).toEqual(["file_write"]);
    expect(report.cases[0].successfulToolsUsed).toEqual([]);
    expect(report.cases[0].failures).toContain("required tool file_write was not used successfully");
    expect(report.cases[0].failureCodes).toContain("tool_missing");
  });

  it("checks required approval decisions and reports permission_denied when approval is denied", async () => {
    const denied = loopResult({
      exitReason: "error",
      finalResponse: "[错误] 工具 shell 未获授权",
      trajectory: {
        ...loopResult().trajectory,
        exitReason: "error",
        steps: [
          {
            iteration: 1,
            kind: "approval",
            approval: {
              approved: false,
              decidedAt: "2026-06-09T10:00:00.000Z",
              request: {
                toolName: "shell",
                args: { command: "rm -rf dist" },
                permission: "dangerous",
                riskLevel: "R5",
                sideEffect: "local",
                reversible: false,
                action: "执行工具 shell",
                targetResource: "workspace:/tmp/workspace",
                evidenceRequired: ["command"],
                exposesSecrets: false,
              },
            },
          },
        ],
      },
    });

    const report = await runEvalCases(
      [
        baseCase({
          id: "permission-deny",
          acceptance: {
            exitReasons: ["error"],
            requiredApprovals: [{ toolName: "shell", approved: false, riskLevel: "R5" }],
          },
        }),
      ],
      executorReturning(denied),
    );

    expect(report.cases[0]).toMatchObject({
      passed: false,
      failureCodes: ["permission_denied"],
      failures: ["approval denied for shell (risk=R5)"],
    });
  });

  it("times out a single case without blocking later cases", async () => {
    const cases = [baseCase({ id: "slow", timeoutMs: 10 }), baseCase({ id: "fast" })];
    const executor: EvalExecutor = {
      async run(evalCase) {
        if (evalCase.id === "slow") await new Promise((resolve) => setTimeout(resolve, 50));
        return { selectedProfile: "convergent-exec", result: loopResult() };
      },
    };

    const report = await runEvalCases(cases, executor);

    expect(report.total).toBe(2);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.cases[0]).toMatchObject({
      id: "slow",
      passed: false,
      failures: ["executor timeout after 10ms"],
      failureCodes: ["timeout"],
    });
    expect(report.cases[1]).toMatchObject({ id: "fast", passed: true });
  });

  it("reports profile mismatch without hiding other acceptance failures", async () => {
    const badResult = loopResult({
      exitReason: "max_iterations",
      finalResponse: "not finished",
      checkpointsPassed: 0,
      trajectory: {
        ...loopResult().trajectory,
        steps: [{ iteration: 1, kind: "tool_call", toolName: "mouse_click", toolResult: "clicked", toolSucceeded: true }],
      },
    });

    const report = await runEvalCases(
      [baseCase({ expectedProfile: "convergent-verified" })],
      executorReturning(badResult, "convergent-exec"),
    );

    expect(report.passed).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.profileAccuracy).toBe(0);
    expect(report.cases[0].profileMatched).toBe(false);
    expect(report.cases[0].failures).toEqual([
      "expected profile convergent-verified, got convergent-exec",
      "exit reason max_iterations not in accepted reasons: success",
      "required tool file_write was not used successfully",
      "forbidden tool mouse_click was used",
      "expected at least 1 passed checkpoints, got 0",
      "final response missing expected text: done",
    ]);
    expect(report.cases[0].failureCodes).toEqual([
      "profile_mismatch",
      "exit_reason",
      "tool_missing",
      "tool_forbidden",
      "checkpoint_missing",
      "output_missing",
    ]);
  });

  it("continues running later cases when one executor call throws", async () => {
    const cases = [baseCase({ id: "throws" }), baseCase({ id: "passes" })];
    const executor: EvalExecutor = {
      async run(evalCase) {
        if (evalCase.id === "throws") throw new Error("boom");
        return { selectedProfile: "convergent-exec", result: loopResult() };
      },
    };

    const report = await runEvalCases(cases, executor);

    expect(report.total).toBe(2);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.cases[0]).toMatchObject({ passed: false, failures: ["executor error: boom"], failureCodes: ["executor_error"] });
    expect(report.cases[1]).toMatchObject({ passed: true, failures: [] });
  });

  it("reports product eval proof metadata and checks required evidence plus forbidden claims", async () => {
    const report = await runEvalCases(
      [
        baseCase({
          id: "product-case",
          proves: "trajectory records a successful file_write call",
          doesNotProve: "the model can solve arbitrary file editing tasks",
          requiredEvidence: ["file_write", "ok"],
          forbiddenClaims: ["uploaded to production"],
        }),
      ],
      executorReturning(loopResult()),
    );

    expect(report.cases[0]).toMatchObject({
      id: "product-case",
      passed: true,
      proves: "trajectory records a successful file_write call",
      doesNotProve: "the model can solve arbitrary file editing tasks",
      requiredEvidence: ["file_write", "ok"],
      forbiddenClaims: ["uploaded to production"],
      failures: [],
    });
  });

  it("fails product eval cases with missing required evidence or forbidden claims", async () => {
    const report = await runEvalCases(
      [
        baseCase({
          id: "overclaim",
          requiredEvidence: ["sha256:"],
          forbiddenClaims: ["done"],
        }),
      ],
      executorReturning(loopResult()),
    );

    expect(report.passed).toBe(0);
    expect(report.cases[0].failures).toEqual([
      "required evidence not found: sha256:",
      "forbidden claim appeared in output/evidence: done",
    ]);
    expect(report.cases[0].failureCodes).toEqual(["evidence_missing", "forbidden_claim"]);
  });
});

describe("buildEvalReport", () => {
  it("returns null profileAccuracy when no case declares an expected profile", () => {
    const report = buildEvalReport([
      {
        id: "no-profile",
        title: "No expected profile",
        category: "research",
        passed: true,
        profileMatched: null,
        exitReason: "success",
        iterations: 1,
        checkpointsPassed: 0,
        totalToolCalls: 0,
        toolsUsed: [],
        successfulToolsUsed: [],
        durationMs: 1,
        failures: [],
        failureCodes: [],
        finalResponse: "ok",
        requiredEvidence: [],
        forbiddenClaims: [],
      },
    ], 100, "2026-01-01T00:00:00.000Z");

    expect(report.profileAccuracy).toBeNull();
    expect(report.total).toBe(1);
    expect(report.passed).toBe(1);
  });
});
