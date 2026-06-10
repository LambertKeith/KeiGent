import { describe, expect, it } from "vitest";
import { buildSkillWorkbenchView, renderSkillWorkbench } from "../skills/workbench.js";

describe("skill workbench page", () => {
  it("summarizes skill governance queues and selects the first skill by default", () => {
    const view = buildSkillWorkbenchView({
      skills: [
        {
          name: "verified-file",
          description: "Verified file workflow",
          tags: ["file"],
          status: "verified",
          evalCoverage: ["verified-file-positive"],
        },
        {
          name: "candidate-browser",
          description: "Candidate browser workflow",
          tags: ["browser"],
          status: "candidate",
        },
        {
          name: "blocked-shell",
          description: "Unsafe shell workflow",
          tags: ["shell"],
          status: "blocked",
          blockedReason: "failed risk eval",
        },
      ],
    });

    expect(view.selected?.name).toBe("verified-file");
    expect(view.stats).toEqual({
      total: 3,
      executable: 1,
      needsReview: 1,
      blockedOrDeprecated: 1,
      withEvalCoverage: 1,
    });
  });

  it("renders skill explanations, governance metadata, and redacted text", () => {
    const view = buildSkillWorkbenchView({
      skills: [
        {
          name: "verified-file",
          description: "Use api_key=sk-secret123456 to write files",
          tags: ["file"],
          status: "verified",
          riskLevel: "R2",
          permissionsExpected: ["file.write"],
          evalCoverage: ["verified-file-positive"],
        },
        {
          name: "candidate-browser",
          description: "Candidate browser workflow",
          tags: ["browser"],
          status: "candidate",
          evalCoverage: ["candidate-browser-positive"],
        },
        {
          name: "blocked-shell",
          description: "Unsafe shell workflow",
          tags: ["shell"],
          status: "blocked",
          blockedReason: "failed risk eval",
        },
      ],
      matchExplanations: [
        {
          name: "verified-file",
          status: "verified",
          score: 12,
          signals: ["tag:file"],
          matched: true,
          injected: true,
          riskDelta: "declared R2",
          evalCoverage: ["verified-file-positive"],
        },
        {
          name: "candidate-browser",
          status: "candidate",
          score: 8,
          signals: ["tag:browser"],
          matched: true,
          injected: false,
          exclusionReason: "candidate_not_enabled",
          evalCoverage: ["candidate-browser-positive"],
        },
        {
          name: "blocked-shell",
          status: "blocked",
          score: 9,
          signals: ["tag:shell"],
          matched: true,
          injected: false,
          exclusionReason: "blocked",
          blockedReason: "failed risk eval",
        },
      ],
      learningNotes: {
        "verified-file": ["Prefer deterministic file paths."],
      },
    });
    const html = renderSkillWorkbench(view);

    expect(html).toContain("Skill list");
    expect(html).toContain("Selected skill");
    expect(html).toContain("Match explanations");
    expect(html).toContain("Governance");
    expect(html).toContain("Eval coverage");
    expect(html).toContain("Injected with eval coverage");
    expect(html).toContain("Review before enabling");
    expect(html).toContain("Do not inject");
    expect(html).toContain("#eval/verified-file-positive");
    expect(html).toContain("Prefer deterministic file paths.");
    expect(html).not.toContain("sk-secret123456");
    expect(html).toContain("[REDACTED]");
  });
});
