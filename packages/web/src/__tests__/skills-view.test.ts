import { describe, expect, it } from "vitest";
import { normalizeSkillLibrary } from "../skills/model.js";

describe("skill library view model", () => {
  it("returns a clear empty state when no skills are loaded", () => {
    const library = normalizeSkillLibrary({ skills: [] });

    expect(library).toMatchObject({
      empty: true,
      emptyMessage: "No skills loaded",
      skills: [],
    });
  });

  it("distinguishes active, deprecated, and quarantined skill states", () => {
    const library = normalizeSkillLibrary({
      skills: [
        {
          name: "file-write",
          description: "Write files safely",
          tags: ["file", "write"],
          status: "active",
          requiredTools: ["file_write"],
          evalCoverage: ["file-write-success"],
        },
        {
          name: "legacy-browser",
          description: "Old browser flow",
          tags: ["browser"],
          status: "deprecated",
          deprecationReason: "replaced by browser-ref workflow",
        },
        {
          name: "risky-shell",
          description: "Shell automation",
          tags: ["shell"],
          status: "quarantined",
          quarantineReason: "failed permission eval",
        },
      ],
      recentMatches: [
        { skillName: "file-write", score: 12, injected: true, matched: true, reason: "tag:file" },
      ],
      learningNotes: {
        "file-write": ["Prefer deterministic file paths."],
      },
    });

    expect(library.empty).toBe(false);
    expect(library.skills.map((skill) => [skill.name, skill.statusLabel, skill.executable])).toEqual([
      ["file-write", "Active", true],
      ["legacy-browser", "Deprecated", false],
      ["risky-shell", "Quarantined", false],
    ]);
    expect(library.skills[0]).toMatchObject({
      triggerConditions: ["tag:file", "tag:write"],
      governance: {
        requiredTools: ["file_write"],
      },
      recentMatches: [expect.objectContaining({ score: 12, injected: true })],
      learningNotes: ["Prefer deterministic file paths."],
      evalCoverageLinks: [{ id: "file-write-success", label: "file-write-success", href: "#eval/file-write-success" }],
    });
    expect(library.skills[1]?.deprecationReason).toBe("replaced by browser-ref workflow");
    expect(library.skills[2]?.quarantineReason).toBe("failed permission eval");
  });

  it("surfaces candidate, verified, and blocked governance metadata", () => {
    const library = normalizeSkillLibrary({
      skills: [
        {
          name: "verified-file",
          description: "Verified file workflow",
          tags: ["file"],
          status: "verified",
          version: "1.2.0",
          taskTypes: ["file.write"],
          triggers: ["create file"],
          riskLevel: "R2",
          permissionsExpected: ["file.write"],
          source: { type: "human-authored", trajectoryId: "run-123" },
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
    });

    expect(library.skills.map((skill) => [skill.name, skill.statusLabel, skill.executable])).toEqual([
      ["verified-file", "Verified", true],
      ["candidate-browser", "Candidate", false],
      ["blocked-shell", "Blocked", false],
    ]);
    expect(library.skills[0]).toMatchObject({
      triggerConditions: ["tag:file", "task:file.write", "trigger:create file"],
      governance: {
        version: "1.2.0",
        riskLevel: "R2",
        permissionsExpected: ["file.write"],
        sourceType: "human-authored",
        sourceTrajectoryId: "run-123",
        evalCoverageCount: 1,
      },
    });
    expect(library.skills[2]?.blockedReason).toBe("failed risk eval");
  });

  it("separates governance boundaries from trigger conditions", () => {
    const library = normalizeSkillLibrary({
      skills: [
        {
          name: "web-summarize",
          description: "Summarize web pages without submitting forms.",
          tags: ["web", "summary"],
          status: "verified",
          requiredTools: ["browser_read"],
          allowedTools: ["http_request"],
          nonGoals: ["do not submit forms"],
          dangerousActions: ["form_submit"],
          permissionsExpected: ["browser.readonly", "http.readonly"],
          evalCoverage: ["web-summary-basic"],
        },
      ],
    });

    expect(library.skills[0]).toMatchObject({
      triggerConditions: ["tag:web", "tag:summary"],
      governance: {
        requiredTools: ["browser_read"],
        allowedTools: ["http_request"],
        permissionsExpected: ["browser.readonly", "http.readonly"],
        nonGoals: ["do not submit forms"],
        dangerousActions: ["form_submit"],
      },
    });
  });

  it("accepts engine deprecatedReason metadata when rendering deprecated skills", () => {
    const library = normalizeSkillLibrary({
      skills: [
        {
          name: "old-shell",
          description: "Old shell flow",
          tags: ["shell"],
          status: "deprecated",
          deprecatedReason: "replaced by governed shell workflow",
        },
      ],
    });

    expect(library.skills[0]).toMatchObject({
      name: "old-shell",
      statusLabel: "Deprecated",
      executable: false,
      deprecationReason: "replaced by governed shell workflow",
    });
  });

  it("normalizes engine skill match explanations into operator actions", () => {
    const library = normalizeSkillLibrary({
      skills: [
        {
          name: "file-write",
          description: "Write files safely",
          tags: ["file"],
          status: "verified",
          riskLevel: "R2",
          evalCoverage: ["file-write-positive"],
        },
        {
          name: "candidate-browser",
          description: "Candidate browser flow",
          tags: ["browser"],
          status: "candidate",
          evalCoverage: ["candidate-browser-positive"],
        },
        {
          name: "blocked-shell",
          description: "Unsafe shell flow",
          tags: ["shell"],
          status: "blocked",
          blockedReason: "unsafe command",
        },
      ],
      matchExplanations: [
        {
          name: "file-write",
          status: "verified",
          score: 12,
          signals: ["tag:file"],
          matched: true,
          injected: true,
          riskDelta: "declared R2",
          evalCoverage: ["file-write-positive"],
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
          blockedReason: "unsafe command",
        },
      ],
    });

    expect(library.skills.map((skill) => [skill.name, skill.recommendedAction])).toEqual([
      ["file-write", "Injected with eval coverage"],
      ["candidate-browser", "Review before enabling"],
      ["blocked-shell", "Do not inject"],
    ]);
    expect(library.skills[0]?.matchExplanations).toEqual([
      expect.objectContaining({
        reason: "tag:file",
        injected: true,
        riskDelta: "declared R2",
        evalCoverageLinks: [{ id: "file-write-positive", label: "file-write-positive", href: "#eval/file-write-positive" }],
      }),
    ]);
    expect(library.skills[1]?.matchExplanations[0]).toMatchObject({
      exclusionReason: "candidate_not_enabled",
      operatorMessage: "Candidate skill matched but was not injected.",
    });
    expect(library.skills[2]?.matchExplanations[0]).toMatchObject({
      exclusionReason: "blocked",
      operatorMessage: "Blocked skill matched and must remain disabled.",
      blockedReason: "unsafe command",
    });
  });
});
