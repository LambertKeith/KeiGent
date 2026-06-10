import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadSkillContext } from "../skills.js";

async function writeSkill(root: string, dir: string, content: string): Promise<void> {
  const skillDir = join(root, dir);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), content, "utf8");
}

describe("loadSkillContext", () => {
  it("parses lifecycle metadata and only exposes executable skills for matching/injection", async () => {
    const root = await mkdtemp(join(tmpdir(), "keigent-skills-"));
    await writeSkill(root, "active", `---
name: file-write
description: Write files safely
status: active
tags: [file, write]
required_tools: [file_write]
allowed_tools: [file_read, file_write]
non_goals: [delete files]
dangerous_actions: [overwrite without approval]
examples: [create hello.txt]
eval_coverage: [file-write-success, skill-no-false-match]
---
Use file_write after checking the path.
`);
    await writeSkill(root, "promoted", `---
name: promoted-skill
description: Promoted from learning
status: promoted
tags: [promoted]
eval_coverage: [promoted-positive]
---
Promoted body.
`);
    await writeSkill(root, "verified", `---
name: verified-skill
description: Verified workflow
status: verified
version: 1.2.0
tags: [verified]
task_types: [file.write]
triggers: [create file]
risk_level: R2
permissions_expected: [file.write]
source_type: human-authored
source_trajectory_id: run-123
eval_coverage: [verified-positive]
---
Verified body.
`);
    await writeSkill(root, "verified-no-coverage", `---
name: unproven-skill
description: Claims verified but has no eval
status: verified
tags: [unproven]
---
Unproven body.
`);
    await writeSkill(root, "candidate", `---
name: candidate-skill
description: Candidate only
status: candidate
tags: [candidate]
eval_coverage: [candidate-positive]
---
Candidate body.
`);
    await writeSkill(root, "blocked", `---
name: blocked-skill
description: Blocked
status: blocked
tags: [blocked]
blocked_reason: unsafe shell command
---
Blocked body.
`);
    await writeSkill(root, "draft", `---
name: draft-skill
description: Draft only
status: draft
tags: [draft]
---
Draft body.
`);
    await writeSkill(root, "deprecated", `---
name: old-skill
description: Deprecated
status: deprecated
tags: [old]
---
Deprecated body.
`);
    await writeSkill(root, "quarantined", `---
name: risky-skill
description: Quarantined
status: quarantined
tags: [risk]
---
Risky body.
`);
    await writeSkill(root, "learning", `---
name: learned-note
description: Learning note only
status: learned-note-only
tags: [learning]
---
Learning note body.
`);

    const context = await loadSkillContext(root);

    expect(context.metas.map((meta) => meta.name).sort()).toEqual(["file-write", "promoted-skill", "verified-skill"]);
    expect(context.metas.find((meta) => meta.name === "file-write")).toMatchObject({
      status: "active",
      requiredTools: ["file_write"],
      allowedTools: ["file_read", "file_write"],
      nonGoals: ["delete files"],
      dangerousActions: ["overwrite without approval"],
      examples: ["create hello.txt"],
      evalCoverage: ["file-write-success", "skill-no-false-match"],
    });
    expect(context.metas.find((meta) => meta.name === "promoted-skill")).toMatchObject({
      status: "promoted",
      evalCoverage: ["promoted-positive"],
    });
    expect(context.metas.find((meta) => meta.name === "verified-skill")).toMatchObject({
      status: "verified",
      version: "1.2.0",
      taskTypes: ["file.write"],
      triggers: ["create file"],
      riskLevel: "R2",
      permissionsExpected: ["file.write"],
      source: { type: "human-authored", trajectoryId: "run-123" },
      evalCoverage: ["verified-positive"],
    });
    await expect(context.loadBody("file-write")).resolves.toContain("Use file_write");
    await expect(context.loadBody("verified-skill")).resolves.toContain("Verified body");
    await expect(context.loadBody("unproven-skill")).resolves.toBeNull();
    await expect(context.loadBody("candidate-skill")).resolves.toBeNull();
    await expect(context.loadBody("blocked-skill")).resolves.toBeNull();
    await expect(context.loadBody("old-skill")).resolves.toBeNull();
    await expect(context.loadBody("risky-skill")).resolves.toBeNull();
    await expect(context.loadBody("learned-note")).resolves.toBeNull();
    await expect(context.loadBody("draft-skill")).resolves.toBeNull();
  });
});
