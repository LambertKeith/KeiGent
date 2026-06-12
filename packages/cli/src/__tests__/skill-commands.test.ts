import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runSkillCommand } from "../skill-commands.js";

function capture(): { lines: string[]; stdout: (line: string) => void } {
  const lines: string[] = [];
  return { lines, stdout: (line) => lines.push(line) };
}

async function writeSkill(root: string, dir: string, content: string): Promise<void> {
  const skillDir = join(root, dir);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), content, "utf8");
}

async function createSkillCatalogFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "keigent-cli-skills-"));
  await writeSkill(root, "web-summarize", `---
name: web-summarize
description: Summarize web pages with evidence
status: verified
required_tools: [browser.open, browser.read]
allowed_tools: [browser.open, browser.read]
non_goals: [submit forms]
dangerous_actions: [purchase items]
permissions_expected: [network.read]
source_type: human-authored
source_trajectory_id: run-verified
eval_coverage: [web-summarize-positive]
---
Verified body.
`);
  await writeSkill(root, "shell-cleanup", `---
name: shell-cleanup
description: Cleanup with shell
status: blocked
blocked_reason: deletes files without approval
eval_coverage: [shell-cleanup-negative]
---
Blocked body.
`);
  await writeSkill(root, "old-browser", `---
name: old-browser
description: Deprecated browser workflow
status: deprecated
deprecated_reason: replaced by web-summarize
---
Deprecated body.
`);
  return root;
}

describe("skill commands", () => {
  it("lists all skills as compact JSON including non-executable governance states", async () => {
    const skillsDir = await createSkillCatalogFixture();
    const output = capture();

    await runSkillCommand(["list", "--compact"], { skillsDir, stdout: output.stdout });

    const payload = JSON.parse(output.lines[0]!);
    expect(payload).toMatchObject({
      total: 3,
      skills: expect.arrayContaining([
        expect.objectContaining({
          name: "web-summarize",
          status: "verified",
          executable: true,
          evalCoverage: ["web-summarize-positive"],
        }),
        expect.objectContaining({
          name: "shell-cleanup",
          status: "blocked",
          executable: false,
          blockedReason: "deletes files without approval",
        }),
        expect.objectContaining({
          name: "old-browser",
          status: "deprecated",
          executable: false,
          deprecatedReason: "replaced by web-summarize",
        }),
      ]),
    });
    expect(output.lines[0]).not.toContain("\n");
  });

  it("filters skill list by status", async () => {
    const skillsDir = await createSkillCatalogFixture();
    const output = capture();

    await runSkillCommand(["list", "--status", "verified", "--compact"], { skillsDir, stdout: output.stdout });

    expect(JSON.parse(output.lines[0]!)).toMatchObject({
      total: 1,
      skills: [expect.objectContaining({ name: "web-summarize", status: "verified" })],
    });
  });

  it("inspects a skill with source, coverage, and safety boundaries", async () => {
    const skillsDir = await createSkillCatalogFixture();
    const output = capture();

    await runSkillCommand(["inspect", "web-summarize", "--compact"], { skillsDir, stdout: output.stdout });

    expect(JSON.parse(output.lines[0]!)).toMatchObject({
      name: "web-summarize",
      status: "verified",
      executable: true,
      description: "Summarize web pages with evidence",
      source: { type: "human-authored", trajectoryId: "run-verified" },
      evalCoverage: ["web-summarize-positive"],
      requiredTools: ["browser.open", "browser.read"],
      allowedTools: ["browser.open", "browser.read"],
      permissionsExpected: ["network.read"],
      nonGoals: ["submit forms"],
      dangerousActions: ["purchase items"],
    });
  });
});
