import { redactObject, redactText } from "../shared/redaction.js";

export type ExitReason = "success" | "escalated" | "max_iterations" | "error";

export interface WebTask {
  goal: string;
  profile?: string;
}

export type ProgressEvent =
  | { kind: "profile_selected"; profile: string; via: "rule" | "llm"; ruleId?: string; rationale?: string; signals?: string[] }
  | { kind: "skills_matched"; skills: string[] }
  | { kind: "iteration_start"; iteration: number }
  | { kind: "tool_call"; iteration: number; toolName: string; args: Record<string, unknown> }
  | { kind: "tool_result"; iteration: number; toolName: string; result: string; succeeded: boolean }
  | { kind: "text"; iteration: number; text: string }
  | { kind: "checkpoint"; iteration: number; desc: string }
  | { kind: "verdict"; iteration: number; passed: boolean; evidence: string }
  | { kind: "escalate"; reason: string }
  | { kind: "done"; exitReason: ExitReason; finalResponse: string }
  | { kind: "unknown"; raw: unknown };

export type RunStatus =
  | "idle"
  | "draft"
  | "running"
  | "waiting_for_user"
  | "success"
  | "escalated"
  | "max_iterations"
  | "error";

export type TimelineItem =
  | { id: string; kind: "task"; goal: string }
  | { id: string; kind: "profile"; profile: string; via: "rule" | "llm"; ruleId?: string; rationale?: string; signals: string[] }
  | { id: string; kind: "skills"; skills: string[] }
  | { id: string; kind: "iteration"; iteration: number }
  | { id: string; kind: "assistant_text"; iteration: number; text: string }
  | { id: string; kind: "tool_activity"; iteration: number; toolName: string; args: Record<string, unknown>; result?: string; state: "pending" | "succeeded" | "failed" | "incomplete" }
  | { id: string; kind: "checkpoint"; iteration: number; desc: string; verdict?: { passed: boolean; evidence: string }; state: "pending" | "passed" | "failed" | "unverified" }
  | { id: string; kind: "escalation"; reason: string }
  | { id: string; kind: "done"; exitReason: ExitReason; finalResponse: string }
  | { id: string; kind: "debug_unknown"; raw: unknown };

export interface ConversationRunView {
  id: string;
  mode: "live" | "replay";
  task: WebTask;
  status: RunStatus;
  selectedProfile?: string;
  profileVia?: "rule" | "llm";
  skills: string[];
  metrics: {
    iterations: number;
    toolCalls: number;
    successfulToolCalls: number;
    failedToolCalls: number;
    checkpoints: number;
    checkpointsPassed: number;
  };
  timeline: TimelineItem[];
  finalResponse?: string;
  exitReason?: ExitReason;
}

export interface NormalizeRunOptions {
  id: string;
  mode: "live" | "replay";
  task: WebTask;
  events: ProgressEvent[];
}

function terminalStatus(reason: ExitReason): RunStatus {
  if (reason === "success") return "success";
  if (reason === "escalated") return "escalated";
  if (reason === "max_iterations") return "max_iterations";
  return "error";
}

export function normalizeConversationRun(options: NormalizeRunOptions): ConversationRunView {
  const timeline: TimelineItem[] = [{ id: "task", kind: "task", goal: options.task.goal }];
  const skills: string[] = [];
  let selectedProfile: string | undefined;
  let profileVia: "rule" | "llm" | undefined;
  let status: RunStatus = options.events.length > 0 ? "running" : "draft";
  let finalResponse: string | undefined;
  let exitReason: ExitReason | undefined;
  const iterations = new Set<number>();

  for (const [index, event] of options.events.entries()) {
    switch (event.kind) {
      case "profile_selected":
        selectedProfile = event.profile;
        profileVia = event.via;
        timeline.push({ id: `profile-${index}`, kind: "profile", profile: event.profile, via: event.via, ruleId: event.ruleId, rationale: event.rationale, signals: event.signals ?? [] });
        break;
      case "skills_matched":
        skills.splice(0, skills.length, ...event.skills);
        timeline.push({ id: `skills-${index}`, kind: "skills", skills: [...event.skills] });
        break;
      case "iteration_start":
        iterations.add(event.iteration);
        timeline.push({ id: `iteration-${event.iteration}`, kind: "iteration", iteration: event.iteration });
        break;
      case "tool_call":
        iterations.add(event.iteration);
        timeline.push({ id: `tool-${index}`, kind: "tool_activity", iteration: event.iteration, toolName: event.toolName, args: redactObject(event.args), state: "pending" });
        break;
      case "tool_result": {
        iterations.add(event.iteration);
        const tool = [...timeline].reverse().find((item): item is Extract<TimelineItem, { kind: "tool_activity" }> => item.kind === "tool_activity" && item.iteration === event.iteration && item.toolName === event.toolName && item.state === "pending");
        if (tool) {
          tool.result = redactText(event.result);
          tool.state = event.succeeded ? "succeeded" : "failed";
        } else {
          timeline.push({ id: `tool-result-${index}`, kind: "tool_activity", iteration: event.iteration, toolName: event.toolName, args: {}, result: redactText(event.result), state: event.succeeded ? "succeeded" : "failed" });
        }
        break;
      }
      case "text":
        iterations.add(event.iteration);
        timeline.push({ id: `text-${index}`, kind: "assistant_text", iteration: event.iteration, text: redactText(event.text) });
        break;
      case "checkpoint":
        iterations.add(event.iteration);
        timeline.push({ id: `checkpoint-${index}`, kind: "checkpoint", iteration: event.iteration, desc: event.desc, state: "pending" });
        break;
      case "verdict": {
        iterations.add(event.iteration);
        const checkpoint = [...timeline].reverse().find((item): item is Extract<TimelineItem, { kind: "checkpoint" }> => item.kind === "checkpoint" && item.iteration === event.iteration && item.state === "pending");
        if (checkpoint) {
          checkpoint.verdict = { passed: event.passed, evidence: redactText(event.evidence) };
          checkpoint.state = event.passed ? "passed" : "failed";
        } else {
          timeline.push({ id: `verdict-${index}`, kind: "checkpoint", iteration: event.iteration, desc: "Unmatched verdict", verdict: { passed: event.passed, evidence: redactText(event.evidence) }, state: event.passed ? "passed" : "failed" });
        }
        break;
      }
      case "escalate":
        status = "escalated";
        timeline.push({ id: `escalation-${index}`, kind: "escalation", reason: redactText(event.reason) });
        break;
      case "done":
        exitReason = event.exitReason;
        finalResponse = redactText(event.finalResponse);
        status = terminalStatus(event.exitReason);
        timeline.push({ id: `done-${index}`, kind: "done", exitReason: event.exitReason, finalResponse });
        break;
      default:
        timeline.push({ id: `unknown-${index}`, kind: "debug_unknown", raw: redactObject(event) });
    }
  }

  if (exitReason) {
    for (const item of timeline) {
      if (item.kind === "tool_activity" && item.state === "pending") item.state = "incomplete";
      if (item.kind === "checkpoint" && item.state === "pending") item.state = "unverified";
    }
  }

  const toolItems = timeline.filter((item): item is Extract<TimelineItem, { kind: "tool_activity" }> => item.kind === "tool_activity");
  const checkpointItems = timeline.filter((item): item is Extract<TimelineItem, { kind: "checkpoint" }> => item.kind === "checkpoint");

  return {
    id: options.id,
    mode: options.mode,
    task: options.task,
    status,
    selectedProfile,
    profileVia,
    skills,
    metrics: {
      iterations: iterations.size,
      toolCalls: toolItems.length,
      successfulToolCalls: toolItems.filter((item) => item.state === "succeeded").length,
      failedToolCalls: toolItems.filter((item) => item.state === "failed").length,
      checkpoints: checkpointItems.length,
      checkpointsPassed: checkpointItems.filter((item) => item.state === "passed").length,
    },
    timeline,
    finalResponse,
    exitReason,
  };
}
