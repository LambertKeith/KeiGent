import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { applyPatches } from "../skill-patch.js";
import type { SkillPatch, Trajectory } from "../types.js";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
}));

vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-ai")>();
  return {
    ...actual,
    complete: mocks.complete,
  };
});

const { Learner } = await import("../learner.js");

async function skillRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "keigent-skill-lifecycle-"));
  await mkdir(join(root, "file-write"), { recursive: true });
  return root;
}

function patch(overrides: Partial<SkillPatch> = {}): SkillPatch {
  return {
    skillName: "file-write",
    section: "guidelines",
    action: "append",
    content: "Prefer deterministic file paths.",
    rationale: "Observed repeated ambiguity.",
    ...overrides,
  };
}

function trajectory(overrides: Partial<Trajectory> = {}): Trajectory {
  return {
    task: { goal: "write file", profile: "convergent-exec" },
    profile: "convergent-exec",
    exitReason: "success",
    steps: [],
    finalResponse: "done",
    durationMs: 1,
    skillsUsed: ["file-write"],
    ...overrides,
  };
}

describe("skill lifecycle and promotion guard", () => {
  it("labels automatic learning output as learned-note-only", async () => {
    const root = await skillRoot();

    const [learningPath] = await applyPatches([patch()], root, "traj-1");
    const content = await readFile(learningPath!, "utf8");

    expect(content).toContain("status: learned-note-only");
    expect(content).toContain("Prefer deterministic file paths.");
  });

  it("rejects promotion patches without eval coverage", async () => {
    const root = await skillRoot();

    await expect(applyPatches([patch({ promoteToActive: true })], root, "traj-2")).rejects.toThrow(
      "promotion requires eval coverage",
    );
    await expect(
      applyPatches([patch({ promoteToActive: true, evalCoverage: ["file-write-success"] })], root, "traj-3"),
    ).resolves.toHaveLength(1);
  });

  it("does not learn active skill patches from failed trajectories", async () => {
    const root = await skillRoot();
    const learner = new Learner({ api: "openai-completions", provider: "test", id: "test" } as never, "test-key");

    const result = await learner.learn(trajectory({ exitReason: "error", finalResponse: "[错误] child_error" }), root, new Map());

    expect(mocks.complete).not.toHaveBeenCalled();
    expect(result.patches).toEqual([]);
    expect(result.writtenTo).toEqual([]);
    expect(result.summary).toContain("diagnostic");
  });
});
