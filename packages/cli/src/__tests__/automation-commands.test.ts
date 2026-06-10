import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildNoOpRunRecord, readRunStore, saveRunRecord, type RunRecord } from "@keigent/engine";
import { parseCliArgs } from "../args.js";
import { runAutomationCommand } from "../automation-commands.js";

function capture(): { lines: string[]; stdout: (line: string) => void } {
  const lines: string[] = [];
  return { lines, stdout: (line) => lines.push(line) };
}

function record(id: string, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    ...buildNoOpRunRecord({
      id,
      goal: "Source run",
      trigger: "manual",
      scope: "test",
      noOpReason: "seed",
      doesNotProve: [],
    }),
    status: "succeeded",
    evidence: { status: "passed", total: 1, passed: 1, failed: 0, sources: ["assertion"], blocking: [] },
    ...overrides,
  };
}

describe("automation commands", () => {
  it("routes automation commands before task handling", () => {
    expect(parseCliArgs(["automation", "triage", "local", "--compact"])).toEqual({
      kind: "automation",
      args: ["triage", "local", "--compact"],
    });
  });

  it("saves a no-op run record when local triage finds no candidates", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-automation-noop-"));
    await saveRunRecord(record("run_ok"), { runsDir });
    const output = capture();

    await runAutomationCommand(["triage", "local", "--compact"], { runsDir, stdout: output.stdout });

    const payload = JSON.parse(output.lines[0]!);
    expect(payload).toMatchObject({
      kind: "local-run-triage",
      status: "no_op",
      scope: "last 20 runs",
      totalScanned: 1,
      totalCandidates: 0,
      candidates: [],
      automationRecord: {
        status: "no_op",
        noOpReason: "No triage candidates found.",
        doesNotProve: ["No hidden failures outside this scope."],
      },
    });
    const store = await readRunStore({ runsDir });
    expect(store.records).toContainEqual(expect.objectContaining({
      id: payload.automationRecord.id,
      status: "no_op",
      automation: expect.objectContaining({ scope: "last 20 runs" }),
    }));
  });

  it("reports failed, degraded, unknown, and missing-evidence runs with source ids", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "keigent-automation-candidates-"));
    await saveRunRecord(record("run_failed", {
      status: "failed",
      evidence: { status: "failed", total: 1, passed: 0, failed: 1, sources: ["assertion"], blocking: ["missing output"] },
      nextAction: "Inspect the failed assertion.",
    }), { runsDir });
    await saveRunRecord(record("run_degraded", {
      status: "degraded",
      evidence: { status: "passed", total: 1, passed: 1, failed: 0, sources: ["tool"], blocking: [] },
    }), { runsDir });
    await saveRunRecord(record("run_missing_evidence", {
      status: "succeeded",
      evidence: { status: "not_checked", total: 0, passed: 0, failed: 0, sources: [], blocking: [] },
    }), { runsDir });
    await saveRunRecord(record("run_unknown", {
      status: "unknown",
      evidence: { status: "not_checked", total: 0, passed: 0, failed: 0, sources: [], blocking: [] },
    }), { runsDir });
    const output = capture();

    await runAutomationCommand(["triage", "local", "--compact"], { runsDir, stdout: output.stdout });

    const payload = JSON.parse(output.lines[0]!);
    expect(payload).toMatchObject({
      status: "attention_required",
      totalScanned: 4,
      totalCandidates: 4,
    });
    expect(payload.automationRecord).toBeUndefined();
    expect(payload.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        runId: "run_failed",
        reason: "blocking_failure",
        blocking: ["missing output"],
        nextAction: "Inspect the failed assertion.",
      }),
      expect.objectContaining({ runId: "run_degraded", reason: "review_needed" }),
      expect.objectContaining({ runId: "run_missing_evidence", reason: "missing_evidence" }),
      expect.objectContaining({ runId: "run_unknown", reason: "stale_schema" }),
    ]));
  });
});
