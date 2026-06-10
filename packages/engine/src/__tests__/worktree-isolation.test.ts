import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  canWriteWorkspace,
  cleanupIsolatedWorkspace,
  collectWorkspaceArtifacts,
  createIsolatedWorkspace,
  detectWorkspaceConflicts,
  readWorkspaceManifest,
} from "../worktree-isolation.js";

describe("worktree isolation foundation", () => {
  it("creates an isolated child workspace with stable branch naming and manifest mapping", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "keigent-workspaces-"));

    const workspace = await createIsolatedWorkspace({
      rootDir,
      parentRunId: "run_parent",
      childRunId: "run_parent:worker-1",
      childRole: "worker",
      taskGoal: "Implement isolated work",
    });

    expect(workspace).toMatchObject({
      workspaceId: "ws_run_parent_worker_1",
      branchName: "keigent/run-parent-worker-1",
      parentRunId: "run_parent",
      childRunId: "run_parent:worker-1",
      childRole: "worker",
      status: "active",
    });
    await expect(access(workspace.workspacePath)).resolves.toBeUndefined();
    const manifest = await readWorkspaceManifest(workspace.manifestPath);
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      workspaceId: workspace.workspaceId,
      parentRunId: "run_parent",
      childRunId: "run_parent:worker-1",
      childRole: "worker",
      status: "active",
      taskGoal: "Implement isolated work",
    });
  });

  it("collects generated artifacts and detects conflicting outputs across child workspaces", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "keigent-workspace-conflicts-"));
    const first = await createIsolatedWorkspace({
      rootDir,
      parentRunId: "run_parent",
      childRunId: "run_parent:worker-1",
      childRole: "worker",
      taskGoal: "candidate A",
    });
    const second = await createIsolatedWorkspace({
      rootDir,
      parentRunId: "run_parent",
      childRunId: "run_parent:worker-2",
      childRole: "worker",
      taskGoal: "candidate B",
    });
    await mkdir(join(first.workspacePath, "src"), { recursive: true });
    await mkdir(join(second.workspacePath, "src"), { recursive: true });
    await writeFile(join(first.workspacePath, "src", "result.txt"), "A", "utf8");
    await writeFile(join(second.workspacePath, "src", "result.txt"), "B", "utf8");
    await writeFile(join(second.workspacePath, "src", "notes.md"), "notes", "utf8");

    const firstArtifacts = await collectWorkspaceArtifacts(first);
    const secondArtifacts = await collectWorkspaceArtifacts(second);
    const conflicts = detectWorkspaceConflicts([
      { workspace: first, artifacts: firstArtifacts },
      { workspace: second, artifacts: secondArtifacts },
    ]);

    expect(firstArtifacts).toEqual([
      expect.objectContaining({ relativePath: "src/result.txt", kind: "generated_file", sizeBytes: 1 }),
    ]);
    expect(secondArtifacts.map((artifact) => artifact.relativePath).sort()).toEqual(["src/notes.md", "src/result.txt"]);
    expect(conflicts).toEqual([
      {
        relativePath: "src/result.txt",
        workspaceIds: [first.workspaceId, second.workspaceId],
        childRunIds: [first.childRunId, second.childRunId],
      },
    ]);
  });

  it("marks abandoned work without deleting it and prevents reviewer writes to worker workspace", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "keigent-workspace-cleanup-"));
    const workspace = await createIsolatedWorkspace({
      rootDir,
      parentRunId: "run_parent",
      childRunId: "run_parent:worker-1",
      childRole: "worker",
      taskGoal: "worker artifact",
    });

    expect(canWriteWorkspace(workspace, "worker")).toBe(true);
    expect(canWriteWorkspace(workspace, "reviewer")).toBe(false);

    await cleanupIsolatedWorkspace(workspace, { mode: "mark_abandoned", reason: "parent timed out" });
    await expect(access(workspace.workspacePath)).resolves.toBeUndefined();
    expect(JSON.parse(await readFile(workspace.manifestPath, "utf8"))).toMatchObject({
      status: "abandoned",
      abandonedReason: "parent timed out",
    });

    await cleanupIsolatedWorkspace(workspace, { mode: "remove" });
    await expect(access(workspace.workspacePath)).rejects.toThrow();
  });
});
