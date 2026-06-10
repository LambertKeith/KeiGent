import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { WorkflowChildRole } from "./workflow/types.js";

export type WorkspaceStatus = "active" | "abandoned";
export type WorkspaceArtifactKind = "generated_file" | "diff" | "log_excerpt";
export type WorkspaceCleanupMode = "remove" | "mark_abandoned";

export interface CreateIsolatedWorkspaceOptions {
  rootDir: string;
  parentRunId: string;
  childRunId: string;
  childRole: WorkflowChildRole;
  taskGoal?: string;
  createdAt?: string;
}

export interface IsolatedWorkspace {
  schemaVersion: 1;
  workspaceId: string;
  branchName: string;
  rootDir: string;
  workspacePath: string;
  manifestPath: string;
  parentRunId: string;
  childRunId: string;
  childRole: WorkflowChildRole;
  status: WorkspaceStatus;
  taskGoal?: string;
  createdAt: string;
  updatedAt: string;
  artifacts: WorkspaceArtifact[];
  abandonedReason?: string;
}

export interface WorkspaceArtifact {
  kind: WorkspaceArtifactKind;
  path: string;
  relativePath: string;
  sizeBytes: number;
}

export interface WorkspaceArtifactSet {
  workspace: IsolatedWorkspace;
  artifacts: WorkspaceArtifact[];
}

export interface WorkspaceConflict {
  relativePath: string;
  workspaceIds: string[];
  childRunIds: string[];
}

export interface CleanupIsolatedWorkspaceOptions {
  mode: WorkspaceCleanupMode;
  reason?: string;
}

const MANIFEST_FILE = ".keigent-workspace.json";
const SKIP_DIRS = new Set([".git", "node_modules"]);

export async function createIsolatedWorkspace(options: CreateIsolatedWorkspaceOptions): Promise<IsolatedWorkspace> {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const workspaceId = workspaceIdFor(options.childRunId);
  const workspacePath = join(options.rootDir, workspaceId);
  const manifestPath = join(workspacePath, MANIFEST_FILE);
  const workspace: IsolatedWorkspace = {
    schemaVersion: 1,
    workspaceId,
    branchName: branchNameFor(options.childRunId),
    rootDir: options.rootDir,
    workspacePath,
    manifestPath,
    parentRunId: options.parentRunId,
    childRunId: options.childRunId,
    childRole: options.childRole,
    status: "active",
    ...(options.taskGoal ? { taskGoal: options.taskGoal } : {}),
    createdAt,
    updatedAt: createdAt,
    artifacts: [],
  };

  await mkdir(workspacePath, { recursive: true });
  await writeWorkspaceManifest(workspace);
  return workspace;
}

export async function readWorkspaceManifest(manifestPath: string): Promise<IsolatedWorkspace> {
  return JSON.parse(await readFile(manifestPath, "utf8")) as IsolatedWorkspace;
}

export async function collectWorkspaceArtifacts(workspace: IsolatedWorkspace): Promise<WorkspaceArtifact[]> {
  const artifacts = await collectFiles(workspace.workspacePath, workspace.workspacePath);
  artifacts.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return artifacts;
}

export function detectWorkspaceConflicts(sets: WorkspaceArtifactSet[]): WorkspaceConflict[] {
  const byRelativePath = new Map<string, Array<{ workspace: IsolatedWorkspace }>>();
  for (const set of sets) {
    for (const artifact of set.artifacts) {
      const existing = byRelativePath.get(artifact.relativePath) ?? [];
      existing.push({ workspace: set.workspace });
      byRelativePath.set(artifact.relativePath, existing);
    }
  }

  const conflicts: WorkspaceConflict[] = [];
  for (const [relativePath, owners] of byRelativePath) {
    if (owners.length < 2) continue;
    conflicts.push({
      relativePath,
      workspaceIds: owners.map((owner) => owner.workspace.workspaceId),
      childRunIds: owners.map((owner) => owner.workspace.childRunId),
    });
  }

  conflicts.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return conflicts;
}

export async function cleanupIsolatedWorkspace(
  workspace: IsolatedWorkspace,
  options: CleanupIsolatedWorkspaceOptions,
): Promise<void> {
  if (options.mode === "remove") {
    await rm(workspace.workspacePath, { recursive: true, force: true });
    return;
  }

  const updatedAt = new Date().toISOString();
  const abandoned: IsolatedWorkspace = {
    ...workspace,
    status: "abandoned",
    updatedAt,
    ...(options.reason ? { abandonedReason: options.reason } : {}),
  };
  await writeWorkspaceManifest(abandoned);
}

export function canWriteWorkspace(workspace: IsolatedWorkspace, actorRole: WorkflowChildRole): boolean {
  return workspace.status === "active" && workspace.childRole === "worker" && actorRole === "worker";
}

async function writeWorkspaceManifest(workspace: IsolatedWorkspace): Promise<void> {
  await writeFile(workspace.manifestPath, `${JSON.stringify(workspace, null, 2)}\n`, "utf8");
}

async function collectFiles(root: string, current: string): Promise<WorkspaceArtifact[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const artifacts: WorkspaceArtifact[] = [];
  for (const entry of entries) {
    if (entry.name === MANIFEST_FILE) continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;

    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      artifacts.push(...await collectFiles(root, path));
      continue;
    }
    if (!entry.isFile()) continue;

    const fileStat = await stat(path);
    const relativePath = normalizeRelativePath(relative(root, path));
    artifacts.push({
      kind: artifactKindFor(relativePath),
      path,
      relativePath,
      sizeBytes: fileStat.size,
    });
  }
  return artifacts;
}

function workspaceIdFor(childRunId: string): string {
  return `ws_${slugUnderscore(childRunId)}`;
}

function branchNameFor(childRunId: string): string {
  return `keigent/${slugDash(childRunId)}`;
}

function artifactKindFor(relativePath: string): WorkspaceArtifactKind {
  if (relativePath.endsWith(".diff") || relativePath.endsWith(".patch")) return "diff";
  if (relativePath.endsWith(".log")) return "log_excerpt";
  return "generated_file";
}

function normalizeRelativePath(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

function slugDash(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "workspace";
}

function slugUnderscore(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "workspace";
}
