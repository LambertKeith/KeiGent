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
});

describe("redactObject", () => {
  it("redacts nested secret-like fields before web display", () => {
    const redacted = redactObject({ apiKey: "sk-abcdef1234", nested: { authorization: "Bearer xyz" }, safe: "visible" });
    expect(JSON.stringify(redacted)).not.toContain("sk-abcdef1234");
    expect(JSON.stringify(redacted)).not.toContain("Bearer xyz");
    expect(redacted).toMatchObject({ apiKey: "[REDACTED:...1234]", nested: { authorization: "[REDACTED:... xyz]" } });
    expect(redacted.safe).toBe("visible");
  });
});
