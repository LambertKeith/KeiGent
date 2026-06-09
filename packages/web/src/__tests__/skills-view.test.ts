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
      triggerConditions: ["tag:file", "tag:write", "requires:file_write"],
      recentMatches: [expect.objectContaining({ score: 12, injected: true })],
      learningNotes: ["Prefer deterministic file paths."],
      evalCoverageLinks: [{ id: "file-write-success", label: "file-write-success", href: "#eval/file-write-success" }],
    });
    expect(library.skills[1]?.deprecationReason).toBe("replaced by browser-ref workflow");
    expect(library.skills[2]?.quarantineReason).toBe("failed permission eval");
  });
});
