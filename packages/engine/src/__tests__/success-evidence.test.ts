import { describe, expect, it } from "vitest";
import { buildEvidenceBundle } from "../evidence.js";
import { evaluateAssertions } from "../assertions.js";
import type { Assertion, Trajectory } from "../types.js";

function trajectory(overrides: Partial<Trajectory> = {}): Trajectory {
  return {
    task: { goal: "Do the thing", profile: "auto" },
    profile: "convergent-exec",
    exitReason: "success",
    steps: [],
    finalResponse: "done",
    durationMs: 1,
    skillsUsed: [],
    ...overrides,
  };
}

describe("success evidence model", () => {
  it("does not treat final response or failed tool attempts as operation evidence", () => {
    const bundle = buildEvidenceBundle(trajectory({
      finalResponse: "done: file created",
      steps: [
        {
          iteration: 1,
          kind: "tool_call",
          toolName: "file_write",
          toolArgs: { path: "hello.txt" },
          toolResult: "[错误] permission denied",
          toolSucceeded: false,
        },
      ],
    }));

    const [result] = evaluateAssertions([{ kind: "toolSucceeded", toolName: "file_write" }], bundle);

    expect(result).toMatchObject({
      passed: false,
      failureCode: "evidence_missing",
    });
  });

  it("uses approved human approval decisions as high-risk evidence", () => {
    const bundle = buildEvidenceBundle(trajectory({
      steps: [
        {
          iteration: 1,
          kind: "approval",
          approval: {
            approved: true,
            decidedAt: "2026-06-09T00:00:00.000Z",
            request: {
              toolName: "shell",
              args: { command: "deploy", apiKey: "[REDACTED:...cret]" },
              permission: "dangerous",
              riskLevel: "R5",
              sideEffect: "local",
              reversible: false,
              action: "执行工具 shell",
              targetResource: "workspace:/tmp/workspace",
              evidenceRequired: ["command"],
              exposesSecrets: true,
            },
          },
        },
      ],
    }));

    const [result] = evaluateAssertions([{ kind: "humanApproved", scope: "shell" }], bundle);

    expect(result).toMatchObject({
      passed: true,
      evidence: expect.stringContaining("approved"),
    });
    expect(JSON.stringify(bundle)).not.toContain("apiKey\":\"sk-");
  });

  it("supports checkpoint and text assertions from structured evidence", () => {
    const assertions: Assertion[] = [
      { kind: "checkpointPassed", minCount: 1 },
      { kind: "textIncludes", source: "final", value: "confirmed" },
    ];
    const bundle = buildEvidenceBundle(trajectory({
      finalResponse: "confirmed",
      steps: [
        {
          iteration: 2,
          kind: "checkpoint",
          checkpointDesc: "done",
          verdictPassed: true,
          verdictEvidence: "observed",
          snapshot: { raw: {}, visibleText: "confirmed" },
        },
      ],
    }));

    const results = evaluateAssertions(assertions, bundle);

    expect(results).toEqual([
      expect.objectContaining({ passed: true }),
      expect.objectContaining({ passed: true }),
    ]);
  });
});
