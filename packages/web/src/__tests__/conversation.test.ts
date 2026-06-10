import { describe, expect, it } from "vitest";
import { normalizeConversationRun } from "../conversation/normalize.js";
import { redactObject } from "../shared/redaction.js";

describe("normalizeConversationRun", () => {
  it("pairs tool calls/results and checkpoints/verdicts without confusing final status", () => {
    const run = normalizeConversationRun({
      id: "run-1",
      mode: "live",
      task: { goal: "Read hello.txt" },
      events: [
        { kind: "profile_selected", profile: "convergent-exec", via: "rule", ruleId: "skill_match", rationale: "matched file skill", signals: ["skill:file"] },
        { kind: "skills_matched", skills: ["file-read"] },
        { kind: "iteration_start", iteration: 1 },
        { kind: "tool_call", iteration: 1, toolName: "file_read", args: { path: "hello.txt" } },
        { kind: "tool_result", iteration: 1, toolName: "file_read", result: "hello", succeeded: true },
        { kind: "checkpoint", iteration: 1, desc: "content read" },
        { kind: "verdict", iteration: 1, passed: true, evidence: "hello found" },
        { kind: "done", exitReason: "success", finalResponse: "hello" },
      ],
    });

    expect(run.status).toBe("success");
    expect(run.selectedProfile).toBe("convergent-exec");
    expect(run.skills).toEqual(["file-read"]);
    expect(run.metrics).toMatchObject({ iterations: 1, toolCalls: 1, successfulToolCalls: 1, checkpoints: 1, checkpointsPassed: 1 });
    expect(run.timeline).toContainEqual(expect.objectContaining({ kind: "tool_activity", toolName: "file_read", state: "succeeded" }));
    expect(run.timeline).toContainEqual(expect.objectContaining({ kind: "checkpoint", state: "passed" }));
  });

  it("marks pending tool calls and checkpoints as incomplete when run ends", () => {
    const run = normalizeConversationRun({
      id: "run-2",
      mode: "live",
      task: { goal: "Do a bounded task" },
      events: [
        { kind: "iteration_start", iteration: 1 },
        { kind: "tool_call", iteration: 1, toolName: "shell", args: { command: "sleep" } },
        { kind: "checkpoint", iteration: 1, desc: "finished" },
        { kind: "done", exitReason: "max_iterations", finalResponse: "not done" },
      ],
    });

    expect(run.status).toBe("max_iterations");
    expect(run.timeline).toContainEqual(expect.objectContaining({ kind: "tool_activity", state: "incomplete" }));
    expect(run.timeline).toContainEqual(expect.objectContaining({ kind: "checkpoint", state: "unverified" }));
  });

  it("preserves terminal failure summaries with recommended next action", () => {
    const run = normalizeConversationRun({
      id: "run-failure",
      mode: "live",
      task: { goal: "Run shell" },
      events: [
        {
          kind: "done",
          exitReason: "error",
          finalResponse: "[错误] 工具 shell 未获授权",
          failure: {
            code: "permission_denied",
            layer: "permission",
            message: "permission denied",
            nextAction: "在交互模式批准该范围，或调整任务/配置避免高风险工具。",
          },
        },
      ],
    });

    expect(run.failure).toMatchObject({
      code: "permission_denied",
      nextAction: "在交互模式批准该范围，或调整任务/配置避免高风险工具。",
    });
    expect(run.timeline).toContainEqual(expect.objectContaining({ kind: "done", failure: expect.objectContaining({ code: "permission_denied" }) }));
  });

  it("normalizes recovery decisions for failed checkpoint debugging", () => {
    const run = normalizeConversationRun({
      id: "run-recovery",
      mode: "live",
      task: { goal: "Verify it" },
      events: [
        { kind: "iteration_start", iteration: 1 },
        { kind: "checkpoint", iteration: 1, desc: "verify" },
        { kind: "verdict", iteration: 1, passed: false, evidence: "missing" },
        { kind: "recovery", iteration: 1, decision: "repair", hint: "collect stronger evidence" },
      ],
    });

    expect(run.timeline).toContainEqual(
      expect.objectContaining({
        kind: "recovery",
        iteration: 1,
        decision: "repair",
        hint: "collect stronger evidence",
      }),
    );
  });

  it("preserves routing rationale and guard metadata for audit display", () => {
    const run = normalizeConversationRun({
      id: "run-routing",
      mode: "live",
      task: { goal: "Find current weather" },
      events: [
        {
          kind: "profile_selected",
          profile: "divergent-research",
          via: "llm",
          rationale: "convergent-exec had no matching skill",
          signals: ["llm:fallback"],
          guardApplied: true,
          unguardedProfile: "convergent-exec",
        } as never,
      ],
    });

    expect(run.timeline).toContainEqual(
      expect.objectContaining({
        kind: "profile",
        profile: "divergent-research",
        rationale: "convergent-exec had no matching skill",
        signals: ["llm:fallback"],
        guardApplied: true,
        unguardedProfile: "convergent-exec",
      }),
    );
  });

  it("preserves skill match explanations for the inspector", () => {
    const run = normalizeConversationRun({
      id: "run-skills",
      mode: "live",
      task: { goal: "Create a file" },
      events: [
        {
          kind: "skills_matched",
          skills: ["file-write"],
          explanations: [
            { name: "file-write", score: 12, signals: ["name"], matched: true, injected: true },
            {
              name: "weather-research",
              score: 0,
              signals: [],
              matched: false,
              injected: false,
              exclusionReason: "score_below_threshold",
            },
          ],
        },
      ],
    });

    expect(run.timeline).toContainEqual(
      expect.objectContaining({
        kind: "skills",
        skills: ["file-write"],
        explanations: [
          expect.objectContaining({ name: "file-write", injected: true }),
          expect.objectContaining({ name: "weather-research", exclusionReason: "score_below_threshold" }),
        ],
      }),
    );
  });

  it("redacts secret-like values from normalized timeline and final output", () => {
    const run = normalizeConversationRun({
      id: "run-secret",
      mode: "live",
      task: { goal: "Handle secret-bearing tool output" },
      events: [
        { kind: "tool_call", iteration: 1, toolName: "http", args: { authorization: "Bearer abcdef123456", nested: { apiKey: "relay_nested_secret" } } },
        { kind: "tool_result", iteration: 1, toolName: "http", result: "token=sk-abcdef1234567890", succeeded: true },
        { kind: "checkpoint", iteration: 1, desc: "no leak" },
        { kind: "verdict", iteration: 1, passed: true, evidence: "Bearer evidenceSecret123" },
        { kind: "done", exitReason: "success", finalResponse: "done with api_key=relay_final_secret" },
      ],
    });

    const serialized = JSON.stringify(run);
    expect(serialized).not.toContain("abcdef123456");
    expect(serialized).not.toContain("relay_nested_secret");
    expect(serialized).not.toContain("sk-abcdef1234567890");
    expect(serialized).not.toContain("evidenceSecret123");
    expect(serialized).not.toContain("api_key=relay_final_secret");
    expect(serialized).toContain("[REDACTED");
  });

  it("normalizes approval decisions with redacted request args", () => {
    const run = normalizeConversationRun({
      id: "run-approval",
      mode: "live",
      task: { goal: "Run a dangerous command" },
      events: [
        {
          kind: "approval",
          iteration: 1,
          approved: false,
          request: {
            toolName: "shell",
            args: { command: "deploy", apiKey: "sk-approval-secret" },
            permission: "dangerous",
            riskLevel: "R5",
            sideEffect: "local",
            reversible: false,
            action: "执行工具 shell",
            targetResource: "workspace:/tmp/workspace",
            evidenceRequired: ["command", "exit code"],
            exposesSecrets: true,
          },
          decidedAt: "2026-06-09T10:00:00.000Z",
        },
      ],
    });

    expect(run.timeline).toContainEqual(
      expect.objectContaining({
        kind: "approval",
        approved: false,
        request: expect.objectContaining({ toolName: "shell", riskLevel: "R5" }),
      }),
    );
    expect(JSON.stringify(run)).not.toContain("sk-approval-secret");
  });

  it("builds an inspectable run console model with success definitions and raw redaction", () => {
    const run = normalizeConversationRun({
      id: "run-console",
      mode: "live",
      task: {
        goal: "Write and verify file",
        successDef: {
          assertions: [{ kind: "toolSucceeded", toolName: "file_write" }],
        },
      },
      events: [
        { kind: "profile_selected", profile: "convergent-verified", via: "rule", rationale: "needs evidence" },
        { kind: "iteration_start", iteration: 1 },
        { kind: "tool_call", iteration: 1, toolName: "file_write", args: { path: "ok.txt", apiKey: "sk-run-console-secret" } },
        { kind: "tool_result", iteration: 1, toolName: "file_write", result: "created", succeeded: true },
        { kind: "checkpoint", iteration: 1, desc: "file exists" },
        { kind: "verdict", iteration: 1, passed: true, evidence: "file exists" },
        { kind: "done", exitReason: "success", finalResponse: "created" },
      ],
    });

    expect(run.task.successDef).toEqual({ assertions: [{ kind: "toolSucceeded", toolName: "file_write" }] });
    expect(run.verificationStatus).toBe("verified");
    expect(run.statusLabel).toBe("Verified success");
    expect(run.iterationGroups).toHaveLength(1);
    expect(run.iterationGroups[0]).toMatchObject({
      iteration: 1,
      status: "verified",
      tools: [expect.objectContaining({ toolName: "file_write", state: "succeeded" })],
      checkpoints: [expect.objectContaining({ desc: "file exists", state: "passed" })],
    });
    expect(run.rawJson).toContain('"kind": "tool_call"');
    expect(run.rawJson).not.toContain("sk-run-console-secret");
  });
});

describe("redactObject", () => {
  it("redacts nested secret-like fields before web display", () => {
    const redacted = redactObject({
      apiKey: "sk-abcdef1234",
      nested: { authorization: "Bearer xyz" },
      array: ["token=sk-array-secret-123456"],
      safe: "visible",
    });
    expect(JSON.stringify(redacted)).not.toContain("sk-abcdef1234");
    expect(JSON.stringify(redacted)).not.toContain("Bearer xyz");
    expect(JSON.stringify(redacted)).not.toContain("sk-array-secret-123456");
    expect(redacted).toMatchObject({ apiKey: "[REDACTED:...1234]", nested: { authorization: "[REDACTED:... xyz]" } });
    expect(redacted.safe).toBe("visible");
  });
});
