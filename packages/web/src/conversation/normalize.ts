import { redactObject, redactText } from "../shared/redaction.js";

export type ExitReason =
  | "success"
  | "escalated"
  | "max_iterations"
  | "budget_exceeded"
  | "verified_failure"
  | "timeout"
  | "child_error"
  | "child_escalated"
  | "error";

export interface FailureSummaryView {
  code: string;
  layer: string;
  message: string;
  nextAction: string;
}

export interface WebTask {
  goal: string;
  profile?: string;
  successDef?: unknown;
}

export interface SkillMatchExplanationView {
  name: string;
  status?: string;
  score: number;
  signals: string[];
  matched: boolean;
  injected: boolean;
  exclusionReason?: string;
  evalCoverage?: string[];
}

export type LoopEventTypeView =
  | "run_created"
  | "route_decided"
  | "skill_matched"
  | "iteration_started"
  | "tool_requested"
  | "tool_completed"
  | "evidence_collected"
  | "assertion_checked"
  | "repair_started"
  | "escalation_decided"
  | "run_succeeded"
  | "run_failed"
  | "run_degraded"
  | "unknown";

export interface LoopEventView {
  type: LoopEventTypeView;
  iteration?: number;
  toolName?: string;
  status?: "requested" | "succeeded" | "failed" | "pending" | "approved" | "denied";
  escalationReason?: string;
  approvalStatus?: "approved" | "denied";
  rawKind?: string;
  message?: string;
  payload?: Record<string, unknown>;
}

export type ProgressEvent =
  | {
      kind: "profile_selected";
      profile: string;
      via: "rule" | "llm";
      ruleId?: string;
      rationale?: string;
      signals?: string[];
      guardApplied?: boolean;
      unguardedProfile?: string;
    }
  | { kind: "skills_matched"; skills: string[]; explanations?: SkillMatchExplanationView[] }
  | { kind: "iteration_start"; iteration: number }
  | { kind: "tool_call"; iteration: number; toolName: string; args: Record<string, unknown> }
  | { kind: "tool_result"; iteration: number; toolName: string; result: string; succeeded: boolean }
  | { kind: "approval_request"; iteration: number; request: ApprovalRequestView }
  | { kind: "approval"; iteration: number; request: ApprovalRequestView; approved: boolean; decidedAt: string }
  | { kind: "text"; iteration: number; text: string }
  | { kind: "checkpoint"; iteration: number; desc: string }
  | { kind: "verdict"; iteration: number; passed: boolean; evidence: string }
  | { kind: "recovery"; iteration: number; decision: "retry" | "repair" | "escalate"; hint?: string; reason?: string }
  | { kind: "escalate"; reason: string }
  | { kind: "done"; exitReason: ExitReason; finalResponse: string; failure?: FailureSummaryView }
  | { kind: "loop_event"; event: LoopEventView }
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

export type VerificationStatus = "verified" | "failed" | "unverified";

export type TimelineItem =
  | { id: string; kind: "task"; goal: string; successDef?: unknown }
  | {
      id: string;
      kind: "profile";
      profile: string;
      via: "rule" | "llm";
      ruleId?: string;
      rationale?: string;
      signals: string[];
      guardApplied?: boolean;
      unguardedProfile?: string;
    }
  | { id: string; kind: "skills"; skills: string[]; explanations?: SkillMatchExplanationView[] }
  | { id: string; kind: "iteration"; iteration: number }
  | { id: string; kind: "assistant_text"; iteration: number; text: string }
  | { id: string; kind: "tool_activity"; iteration: number; toolName: string; args: Record<string, unknown>; result?: string; state: "pending" | "succeeded" | "failed" | "incomplete" }
  | { id: string; kind: "approval"; iteration: number; request: ApprovalRequestView; state: "pending" | "approved" | "denied"; approved?: boolean; decidedAt?: string }
  | { id: string; kind: "checkpoint"; iteration: number; desc: string; verdict?: { passed: boolean; evidence: string }; state: "pending" | "passed" | "failed" | "unverified" }
  | { id: string; kind: "recovery"; iteration: number; decision: "retry" | "repair" | "escalate"; hint?: string; reason?: string }
  | { id: string; kind: "escalation"; reason: string }
  | { id: string; kind: "done"; exitReason: ExitReason; finalResponse: string; failure?: FailureSummaryView }
  | { id: string; kind: "debug_unknown"; raw: unknown };

export interface IterationGroupView {
  iteration: number;
  status: VerificationStatus;
  items: TimelineItem[];
  tools: Array<Pick<Extract<TimelineItem, { kind: "tool_activity" }>, "toolName" | "state">>;
  checkpoints: Array<Pick<Extract<TimelineItem, { kind: "checkpoint" }>, "desc" | "state">>;
}

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
  verificationStatus: VerificationStatus;
  statusLabel: string;
  iterationGroups: IterationGroupView[];
  rawJson: string;
  timeline: TimelineItem[];
  finalResponse?: string;
  exitReason?: ExitReason;
  failure?: FailureSummaryView;
}

export interface ApprovalRequestView {
  toolName: string;
  args: Record<string, unknown>;
  permission: string;
  riskLevel: string;
  sideEffect: string;
  reversible: boolean;
  action: string;
  targetResource: string;
  evidenceRequired: string[];
  exposesSecrets: boolean;
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

function normalizeSkillExplanations(explanations: SkillMatchExplanationView[]): SkillMatchExplanationView[] {
  return explanations.map((explanation) => ({
    ...explanation,
    name: redactText(explanation.name),
    signals: explanation.signals.map((signal) => redactText(signal)),
    ...(explanation.exclusionReason ? { exclusionReason: redactText(explanation.exclusionReason) } : {}),
    ...(explanation.evalCoverage ? { evalCoverage: explanation.evalCoverage.map((item) => redactText(item)) } : {}),
  }));
}

export function normalizeConversationRun(options: NormalizeRunOptions): ConversationRunView {
  const timeline: TimelineItem[] = [{
    id: "task",
    kind: "task",
    goal: options.task.goal,
    ...(options.task.successDef ? { successDef: redactObject(options.task.successDef) } : {}),
  }];
  const skills: string[] = [];
  let selectedProfile: string | undefined;
  let profileVia: "rule" | "llm" | undefined;
  let status: RunStatus = options.events.length > 0 ? "running" : "draft";
  let finalResponse: string | undefined;
  let exitReason: ExitReason | undefined;
  let failure: FailureSummaryView | undefined;
  const iterations = new Set<number>();

  for (const [index, event] of options.events.entries()) {
    switch (event.kind) {
      case "profile_selected":
        selectedProfile = event.profile;
        profileVia = event.via;
        timeline.push({
          id: `profile-${index}`,
          kind: "profile",
          profile: event.profile,
          via: event.via,
          ruleId: event.ruleId,
          rationale: event.rationale,
          signals: event.signals ?? [],
          ...(event.guardApplied !== undefined ? { guardApplied: event.guardApplied } : {}),
          ...(event.unguardedProfile ? { unguardedProfile: event.unguardedProfile } : {}),
        });
        break;
      case "skills_matched":
        skills.splice(0, skills.length, ...event.skills);
        timeline.push({
          id: `skills-${index}`,
          kind: "skills",
          skills: [...event.skills],
          ...(event.explanations ? { explanations: normalizeSkillExplanations(event.explanations) } : {}),
        });
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
      case "approval_request":
        iterations.add(event.iteration);
        timeline.push({
          id: `approval-${index}`,
          kind: "approval",
          iteration: event.iteration,
          request: { ...event.request, args: redactObject(event.request.args) },
          state: "pending",
        });
        break;
      case "approval":
        iterations.add(event.iteration);
        timeline.push({
          id: `approval-${index}`,
          kind: "approval",
          iteration: event.iteration,
          request: { ...event.request, args: redactObject(event.request.args) },
          state: event.approved ? "approved" : "denied",
          approved: event.approved,
          decidedAt: event.decidedAt,
        });
        break;
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
      case "recovery":
        iterations.add(event.iteration);
        timeline.push({
          id: `recovery-${index}`,
          kind: "recovery",
          iteration: event.iteration,
          decision: event.decision,
          ...(event.hint ? { hint: redactText(event.hint) } : {}),
          ...(event.reason ? { reason: redactText(event.reason) } : {}),
        });
        break;
      case "escalate":
        status = "escalated";
        timeline.push({ id: `escalation-${index}`, kind: "escalation", reason: redactText(event.reason) });
        break;
      case "done":
        exitReason = event.exitReason;
        finalResponse = redactText(event.finalResponse);
        failure = event.failure ? redactFailure(event.failure) : undefined;
        status = terminalStatus(event.exitReason);
        timeline.push({ id: `done-${index}`, kind: "done", exitReason: event.exitReason, finalResponse, ...(failure ? { failure } : {}) });
        break;
      case "loop_event": {
        const protocol = event.event;
        const iteration = protocol.iteration ?? 0;
        switch (protocol.type) {
          case "run_created":
            if (protocol.message) {
              timeline.push({ id: `protocol-run-${index}`, kind: "debug_unknown", raw: redactObject(protocol) });
            }
            break;
          case "route_decided":
            selectedProfile = typeof protocol.payload?.profile === "string" ? protocol.payload.profile : selectedProfile;
            profileVia = protocol.payload?.via === "llm" ? "llm" : protocol.payload?.via === "rule" ? "rule" : profileVia;
            timeline.push({
              id: `protocol-route-${index}`,
              kind: "profile",
              profile: selectedProfile ?? "unknown",
              via: profileVia ?? "rule",
              rationale: protocol.message,
              signals: Array.isArray(protocol.payload?.signals) ? protocol.payload.signals.map(String) : [],
            });
            break;
          case "skill_matched": {
            const matchedSkills = Array.isArray(protocol.payload?.skills) ? protocol.payload.skills.map(String) : [];
            skills.splice(0, skills.length, ...matchedSkills);
            timeline.push({ id: `protocol-skills-${index}`, kind: "skills", skills: matchedSkills });
            break;
          }
          case "iteration_started":
            if (protocol.iteration !== undefined) iterations.add(protocol.iteration);
            timeline.push({ id: `protocol-iteration-${iteration}`, kind: "iteration", iteration });
            break;
          case "tool_requested":
            if (protocol.iteration !== undefined) iterations.add(protocol.iteration);
            timeline.push({
              id: `protocol-tool-${index}`,
              kind: "tool_activity",
              iteration,
              toolName: protocol.toolName ?? "unknown",
              args: redactObject(protocol.payload ?? {}),
              state: "pending",
            });
            break;
          case "tool_completed": {
            if (protocol.iteration !== undefined) iterations.add(protocol.iteration);
            const toolName = protocol.toolName ?? "unknown";
            const tool = [...timeline].reverse().find((item): item is Extract<TimelineItem, { kind: "tool_activity" }> => item.kind === "tool_activity" && item.iteration === iteration && item.toolName === toolName && item.state === "pending");
            const state = protocol.status === "succeeded" || protocol.status === "approved" ? "succeeded" : "failed";
            if (tool) {
              tool.result = redactText(protocol.message ?? "");
              tool.state = state;
            } else {
              timeline.push({ id: `protocol-tool-result-${index}`, kind: "tool_activity", iteration, toolName, args: {}, result: redactText(protocol.message ?? ""), state });
            }
            break;
          }
          case "evidence_collected":
            if (protocol.iteration !== undefined) iterations.add(protocol.iteration);
            timeline.push({ id: `protocol-evidence-${index}`, kind: "checkpoint", iteration, desc: protocol.message ?? "Evidence collected", state: protocol.status === "succeeded" ? "passed" : "pending" });
            break;
          case "assertion_checked": {
            if (protocol.iteration !== undefined) iterations.add(protocol.iteration);
            const passed = protocol.status === "succeeded";
            timeline.push({ id: `protocol-assertion-${index}`, kind: "checkpoint", iteration, desc: "Assertion checked", verdict: { passed, evidence: redactText(protocol.message ?? "") }, state: passed ? "passed" : "failed" });
            break;
          }
          case "repair_started":
            if (protocol.iteration !== undefined) iterations.add(protocol.iteration);
            timeline.push({ id: `protocol-repair-${index}`, kind: "recovery", iteration, decision: "repair", hint: protocol.message });
            break;
          case "escalation_decided":
            status = "escalated";
            timeline.push({ id: `protocol-escalation-${index}`, kind: "escalation", reason: redactText(protocol.message ?? protocol.escalationReason ?? "escalation") });
            break;
          case "run_succeeded":
            exitReason = "success";
            finalResponse = redactText(protocol.message ?? "");
            status = terminalStatus(exitReason);
            timeline.push({ id: `protocol-done-${index}`, kind: "done", exitReason, finalResponse });
            break;
          case "run_degraded":
            exitReason = "budget_exceeded";
            finalResponse = redactText(protocol.message ?? "");
            status = terminalStatus(exitReason);
            timeline.push({ id: `protocol-done-${index}`, kind: "done", exitReason, finalResponse });
            break;
          case "run_failed":
            exitReason = "error";
            finalResponse = redactText(protocol.message ?? "");
            status = terminalStatus(exitReason);
            timeline.push({ id: `protocol-done-${index}`, kind: "done", exitReason, finalResponse });
            break;
          case "unknown":
            timeline.push({ id: `protocol-unknown-${index}`, kind: "debug_unknown", raw: redactObject(protocol) });
            break;
        }
        break;
      }
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
  const verificationStatus = deriveVerificationStatus(toolItems, checkpointItems, exitReason);

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
    verificationStatus,
    statusLabel: statusLabel(status, verificationStatus),
    iterationGroups: buildIterationGroups(timeline),
    rawJson: JSON.stringify(redactObject({ task: options.task, events: options.events }), null, 2),
    timeline,
    finalResponse,
    exitReason,
    failure,
  };
}

function deriveVerificationStatus(
  tools: Array<Extract<TimelineItem, { kind: "tool_activity" }>>,
  checkpoints: Array<Extract<TimelineItem, { kind: "checkpoint" }>>,
  exitReason: ExitReason | undefined,
): VerificationStatus {
  if (tools.some((tool) => tool.state === "failed") || checkpoints.some((checkpoint) => checkpoint.state === "failed")) {
    return "failed";
  }
  if (exitReason && exitReason !== "success") return "failed";
  if (checkpoints.some((checkpoint) => checkpoint.state === "passed")) return "verified";
  return "unverified";
}

function statusLabel(status: RunStatus, verificationStatus: VerificationStatus): string {
  if (verificationStatus === "verified" && status === "success") return "Verified success";
  if (verificationStatus === "verified") return "Verified";
  if (verificationStatus === "failed") return "Failed";
  if (status === "running") return "Running, unverified";
  return "Unverified";
}

function buildIterationGroups(timeline: TimelineItem[]): IterationGroupView[] {
  const groups = new Map<number, TimelineItem[]>();
  for (const item of timeline) {
    if (!("iteration" in item)) continue;
    const items = groups.get(item.iteration) ?? [];
    items.push(item);
    groups.set(item.iteration, items);
  }

  return [...groups.entries()].map(([iteration, items]) => {
    const tools = items
      .filter((item): item is Extract<TimelineItem, { kind: "tool_activity" }> => item.kind === "tool_activity")
      .map((item) => ({ toolName: item.toolName, state: item.state }));
    const checkpoints = items
      .filter((item): item is Extract<TimelineItem, { kind: "checkpoint" }> => item.kind === "checkpoint")
      .map((item) => ({ desc: item.desc, state: item.state }));
    return {
      iteration,
      status: deriveVerificationStatus(
        items.filter((item): item is Extract<TimelineItem, { kind: "tool_activity" }> => item.kind === "tool_activity"),
        items.filter((item): item is Extract<TimelineItem, { kind: "checkpoint" }> => item.kind === "checkpoint"),
        undefined,
      ),
      items,
      tools,
      checkpoints,
    };
  });
}

function redactFailure(failure: FailureSummaryView): FailureSummaryView {
  return {
    code: failure.code,
    layer: failure.layer,
    message: redactText(failure.message),
    nextAction: redactText(failure.nextAction),
  };
}
