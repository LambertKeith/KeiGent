import { describe, expect, it } from "vitest";
import { normalizeTrajectoryReplay } from "../replay/model.js";
import type { Trajectory } from "@keigent/engine";

function trajectory(overrides: Partial<Trajectory> = {}): Trajectory {
  return {
    task: { goal: "Replay task", profile: "auto" },
    profile: "convergent-exec",
    exitReason: "success",
    steps: [
      { iteration: 1, kind: "text_output", text: "first" },
      { iteration: 1, kind: "unexpected_kind" as never, text: "preserve me" },
      { iteration: 2, kind: "checkpoint", checkpointDesc: "done", verdictPassed: true, verdictEvidence: "ok" },
    ],
    finalResponse: "done",
    durationMs: 42,
    skillsUsed: ["file-write"],
    ...overrides,
  };
}

describe("normalizeTrajectoryReplay", () => {
  it("normalizes a saved trajectory as replay-only while preserving order and duration", () => {
    const replay = normalizeTrajectoryReplay(trajectory(), { id: "replay-1", path: "trajectory.json" });

    expect(replay).toMatchObject({
      id: "replay-1",
      mode: "replay",
      freshExecution: false,
      status: "ready",
      profile: "convergent-exec",
      exitReason: "success",
      durationMs: 42,
      path: "trajectory.json",
    });
    expect(replay.timeline.map((item) => item.order)).toEqual([0, 1, 2]);
    expect(replay.timeline[1]).toMatchObject({ kind: "unknown", iteration: 1 });
    expect(replay.rescore).toMatchObject({ available: false });
    expect(replay.rescore.label).toContain("not fresh execution");
  });

  it("returns a missing replay state without pretending to be live execution", () => {
    const replay = normalizeTrajectoryReplay(undefined, { id: "missing" });

    expect(replay.status).toBe("missing");
    expect(replay.freshExecution).toBe(false);
    expect(replay.timeline).toEqual([]);
    expect(replay.errors).toContain("trajectory missing");
  });

  it("returns an invalid replay state for malformed trajectory schema", () => {
    const replay = normalizeTrajectoryReplay({ profile: "convergent-exec", steps: "bad" }, { id: "bad" });

    expect(replay.status).toBe("invalid");
    expect(replay.freshExecution).toBe(false);
    expect(replay.errors).toContain("trajectory.steps must be an array");
  });
});
