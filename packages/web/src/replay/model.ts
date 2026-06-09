import { redactObject, redactText } from "../shared/redaction.js";
import type { Trajectory, TrajectoryStep } from "@keigent/engine";

export type ReplayStatus = "ready" | "missing" | "invalid";
export type ReplayTimelineKind =
  | "skill_match"
  | "tool_call"
  | "text_output"
  | "checkpoint"
  | "approval"
  | "recovery"
  | "error"
  | "unknown";

export interface ReplayTimelineItem {
  order: number;
  iteration: number;
  kind: ReplayTimelineKind;
  raw: unknown;
  label: string;
}

export interface ReplayView {
  id: string;
  mode: "replay";
  freshExecution: false;
  status: ReplayStatus;
  path?: string;
  task?: unknown;
  profile?: string;
  exitReason?: string;
  durationMs?: number;
  skillsUsed: string[];
  finalResponse?: string;
  timeline: ReplayTimelineItem[];
  errors: string[];
  rescore: {
    available: false;
    label: string;
  };
  rawJson?: string;
}

export interface NormalizeTrajectoryReplayOptions {
  id: string;
  path?: string;
}

const KNOWN_STEP_KINDS = new Set<ReplayTimelineKind>([
  "skill_match",
  "tool_call",
  "text_output",
  "checkpoint",
  "approval",
  "recovery",
  "error",
]);

export function normalizeTrajectoryReplay(
  input: unknown,
  options: NormalizeTrajectoryReplayOptions,
): ReplayView {
  const base = baseReplay(options);
  if (input === undefined || input === null) {
    return { ...base, status: "missing", errors: ["trajectory missing"] };
  }

  const validation = validateTrajectory(input);
  if (validation.length > 0) {
    return {
      ...base,
      status: "invalid",
      errors: validation,
      rawJson: JSON.stringify(redactObject(input), null, 2),
    };
  }

  const trajectory = input as Trajectory;
  return {
    ...base,
    status: "ready",
    task: redactObject(trajectory.task),
    profile: trajectory.profile,
    exitReason: trajectory.exitReason,
    durationMs: trajectory.durationMs,
    skillsUsed: trajectory.skillsUsed.map((skill) => redactText(skill)),
    finalResponse: redactText(trajectory.finalResponse),
    timeline: trajectory.steps.map((step, order) => normalizeStep(step, order)),
    rawJson: JSON.stringify(redactObject(trajectory), null, 2),
  };
}

function baseReplay(options: NormalizeTrajectoryReplayOptions): ReplayView {
  return {
    id: options.id,
    mode: "replay",
    freshExecution: false,
    status: "missing",
    ...(options.path ? { path: options.path } : {}),
    skillsUsed: [],
    timeline: [],
    errors: [],
    rescore: {
      available: false,
      label: "Replay rescore is a placeholder and is not fresh execution.",
    },
  };
}

function validateTrajectory(input: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(input)) return ["trajectory must be an object"];
  if (!isRecord(input.task)) errors.push("trajectory.task must be an object");
  if (typeof input.profile !== "string") errors.push("trajectory.profile must be a string");
  if (typeof input.exitReason !== "string") errors.push("trajectory.exitReason must be a string");
  if (!Array.isArray(input.steps)) errors.push("trajectory.steps must be an array");
  if (typeof input.finalResponse !== "string") errors.push("trajectory.finalResponse must be a string");
  if (typeof input.durationMs !== "number") errors.push("trajectory.durationMs must be a number");
  if (!Array.isArray(input.skillsUsed)) errors.push("trajectory.skillsUsed must be an array");
  return errors;
}

function normalizeStep(step: TrajectoryStep, order: number): ReplayTimelineItem {
  const kind = KNOWN_STEP_KINDS.has(step.kind as ReplayTimelineKind)
    ? step.kind as ReplayTimelineKind
    : "unknown";
  return {
    order,
    iteration: typeof step.iteration === "number" ? step.iteration : 0,
    kind,
    raw: redactObject(step),
    label: labelForStep(step, kind),
  };
}

function labelForStep(step: TrajectoryStep, kind: ReplayTimelineKind): string {
  switch (kind) {
    case "tool_call":
      return `tool ${step.toolName ?? "(unknown)"}`;
    case "text_output":
      return "assistant text";
    case "checkpoint":
      return `checkpoint ${step.checkpointDesc ?? ""}`.trim();
    case "approval":
      return `approval ${step.approval?.request.toolName ?? "(unknown)"}`;
    case "recovery":
      return `recovery ${step.recovery?.decision ?? "(unknown)"}`;
    case "error":
      return `error ${step.errorMessage ?? ""}`.trim();
    case "skill_match":
      return "skill match";
    default:
      return `unknown step ${String(step.kind)}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
