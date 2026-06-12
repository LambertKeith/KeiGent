import { redactText } from "../shared/redaction.js";
import type { SkillMatchExplanation } from "@keigent/engine";

export type SkillStatus =
  | "draft"
  | "candidate"
  | "active"
  | "verified"
  | "learned-note-only"
  | "blocked"
  | "quarantined"
  | "deprecated"
  | "promoted";

export interface SkillLibraryInput {
  skills: SkillInput[];
  matchExplanations?: SkillMatchExplanation[];
  recentMatches?: SkillRecentMatchInput[];
  learningNotes?: Record<string, string[]>;
}

export interface SkillInput {
  name: string;
  description: string;
  tags: string[];
  status?: SkillStatus;
  requiredTools?: string[];
  allowedTools?: string[];
  nonGoals?: string[];
  dangerousActions?: string[];
  examples?: string[];
  version?: string;
  taskTypes?: string[];
  triggers?: string[];
  riskLevel?: string;
  permissionsExpected?: string[];
  source?: {
    type?: string;
    trajectoryId?: string;
  };
  blockedReason?: string;
  evalCoverage?: string[];
  quarantineReason?: string;
  deprecationReason?: string;
  deprecatedReason?: string;
}

export interface SkillRecentMatchInput {
  skillName: string;
  score: number;
  injected: boolean;
  matched: boolean;
  reason?: string;
}

export interface SkillEvalCoverageLink {
  id: string;
  label: string;
  href: string;
}

export interface SkillMatchExplanationView {
  name: string;
  status?: SkillStatus;
  score: number;
  signals: string[];
  reason: string;
  matched: boolean;
  injected: boolean;
  operatorMessage: string;
  exclusionReason?: SkillMatchExplanation["exclusionReason"];
  confidence?: SkillMatchExplanation["confidence"];
  includedBody?: boolean;
  blockedReason?: string;
  riskDelta?: string;
  evalCoverageLinks: SkillEvalCoverageLink[];
}

export interface SkillView {
  name: string;
  description: string;
  status: SkillStatus;
  statusLabel: string;
  executable: boolean;
  recommendedAction: string;
  triggerConditions: string[];
  matchExplanations: SkillMatchExplanationView[];
  recentMatches: SkillRecentMatchInput[];
  learningNotes: string[];
  evalCoverageLinks: SkillEvalCoverageLink[];
  governance: {
    version?: string;
    riskLevel?: string;
    requiredTools: string[];
    allowedTools: string[];
    permissionsExpected: string[];
    nonGoals: string[];
    dangerousActions: string[];
    sourceType?: string;
    sourceTrajectoryId?: string;
    evalCoverageCount: number;
  };
  blockedReason?: string;
  quarantineReason?: string;
  deprecationReason?: string;
}

export interface SkillLibraryView {
  empty: boolean;
  emptyMessage?: string;
  skills: SkillView[];
}

export function normalizeSkillLibrary(input: SkillLibraryInput): SkillLibraryView {
  if (input.skills.length === 0) {
    return { empty: true, emptyMessage: "No skills loaded", skills: [] };
  }

  return {
    empty: false,
    skills: input.skills.map((skill) => normalizeSkill(skill, input)),
  };
}

function normalizeSkill(skill: SkillInput, input: SkillLibraryInput): SkillView {
  const status = skill.status ?? "active";
  const matchExplanations = matchExplanationsFor(skill, input.matchExplanations ?? []);
  return {
    name: redactText(skill.name),
    description: redactText(skill.description),
    status,
    statusLabel: statusLabel(status),
    executable: isExecutable(skill),
    recommendedAction: recommendedAction(skill, matchExplanations),
    triggerConditions: triggerConditions(skill),
    matchExplanations,
    recentMatches: (input.recentMatches ?? [])
      .filter((match) => match.skillName === skill.name)
      .map((match) => ({
        ...match,
        skillName: redactText(match.skillName),
        ...(match.reason ? { reason: redactText(match.reason) } : {}),
      })),
      learningNotes: (input.learningNotes?.[skill.name] ?? []).map((note) => redactText(note)),
    evalCoverageLinks: evalCoverageLinks(skill.evalCoverage ?? []),
    governance: {
      ...(skill.version ? { version: redactText(skill.version) } : {}),
      ...(skill.riskLevel ? { riskLevel: redactText(skill.riskLevel) } : {}),
      requiredTools: (skill.requiredTools ?? []).map((tool) => redactText(tool)),
      allowedTools: (skill.allowedTools ?? []).map((tool) => redactText(tool)),
      permissionsExpected: (skill.permissionsExpected ?? []).map((permission) => redactText(permission)),
      nonGoals: (skill.nonGoals ?? []).map((nonGoal) => redactText(nonGoal)),
      dangerousActions: (skill.dangerousActions ?? []).map((action) => redactText(action)),
      ...(skill.source?.type ? { sourceType: redactText(skill.source.type) } : {}),
      ...(skill.source?.trajectoryId ? { sourceTrajectoryId: redactText(skill.source.trajectoryId) } : {}),
      evalCoverageCount: (skill.evalCoverage ?? []).length,
    },
    ...(skill.blockedReason ? { blockedReason: redactText(skill.blockedReason) } : {}),
    ...(skill.quarantineReason ? { quarantineReason: redactText(skill.quarantineReason) } : {}),
    ...(deprecationReason(skill) ? { deprecationReason: redactText(deprecationReason(skill)!) } : {}),
  };
}

function isExecutable(skill: SkillInput): boolean {
  const status = skill.status ?? "active";
  if (status === "verified") return (skill.evalCoverage ?? []).length > 0;
  return status === "active" || status === "promoted";
}

function statusLabel(status: SkillStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "verified":
      return "Verified";
    case "promoted":
      return "Promoted";
    case "candidate":
      return "Candidate";
    case "blocked":
      return "Blocked";
    case "draft":
      return "Draft";
    case "learned-note-only":
      return "Learned note only";
    case "quarantined":
      return "Quarantined";
    case "deprecated":
      return "Deprecated";
  }
}

function triggerConditions(skill: SkillInput): string[] {
  return [
    ...skill.tags.map((tag) => `tag:${redactText(tag)}`),
    ...(skill.taskTypes ?? []).map((taskType) => `task:${redactText(taskType)}`),
    ...(skill.triggers ?? []).map((trigger) => `trigger:${redactText(trigger)}`),
  ];
}

function deprecationReason(skill: SkillInput): string | undefined {
  return skill.deprecationReason ?? skill.deprecatedReason;
}

function matchExplanationsFor(skill: SkillInput, explanations: SkillMatchExplanation[]): SkillMatchExplanationView[] {
  return explanations
    .filter((explanation) => explanation.name === skill.name)
    .map((explanation) => {
      const reason = explanation.matchedBy?.join(", ") || explanation.signals.join(", ") || "matched";
      return {
        name: redactText(explanation.name),
        ...(explanation.status ? { status: explanation.status } : {}),
        score: explanation.score,
        signals: explanation.signals.map((signal) => redactText(signal)),
        reason: redactText(reason),
        matched: explanation.matched,
        injected: explanation.injected,
        operatorMessage: operatorMessageFor(explanation),
        ...(explanation.exclusionReason ? { exclusionReason: explanation.exclusionReason } : {}),
        ...(explanation.confidence ? { confidence: explanation.confidence } : {}),
        ...(typeof explanation.includedBody === "boolean" ? { includedBody: explanation.includedBody } : {}),
        ...(explanation.blockedReason ? { blockedReason: redactText(explanation.blockedReason) } : {}),
        ...(explanation.riskDelta ? { riskDelta: redactText(explanation.riskDelta) } : {}),
        evalCoverageLinks: evalCoverageLinks(explanation.evalCoverage ?? []),
      };
    });
}

function evalCoverageLinks(evalCoverage: string[]): SkillEvalCoverageLink[] {
  return evalCoverage.map((id) => ({
    id: redactText(id),
    label: redactText(id),
    href: `#eval/${encodeURIComponent(id)}`,
  }));
}

function recommendedAction(skill: SkillInput, explanations: SkillMatchExplanationView[]): string {
  if (explanations.some((explanation) => explanation.injected && explanation.evalCoverageLinks.length > 0)) {
    return "Injected with eval coverage";
  }
  if (explanations.some((explanation) => explanation.injected)) return "Injected without eval coverage";
  if (skill.status === "blocked" || explanations.some((explanation) => explanation.exclusionReason === "blocked")) {
    return "Do not inject";
  }
  if (skill.status === "candidate" || explanations.some((explanation) => explanation.exclusionReason === "candidate_not_enabled")) {
    return "Review before enabling";
  }
  if (skill.status === "learned-note-only") return "Promote to candidate only after review";
  if (skill.status === "deprecated") return "Replace deprecated skill";
  if (skill.status === "verified" && (skill.evalCoverage ?? []).length === 0) return "Add eval coverage before trust";
  return isExecutable(skill) ? "Available for matching" : "Not executable";
}

function operatorMessageFor(explanation: SkillMatchExplanation): string {
  if (explanation.injected) return "Skill body was injected for this run.";
  switch (explanation.exclusionReason) {
    case "blocked":
      return "Blocked skill matched and must remain disabled.";
    case "candidate_not_enabled":
      return "Candidate skill matched but was not injected.";
    case "missing_eval_coverage":
      return "Verified skill lacks eval coverage and was not injected.";
    case "status_not_executable":
      return "Skill status is not executable.";
    case "body_not_injected":
      return "Matched skill body was not injected.";
    case "lower_ranked":
      return "Skill matched but ranked below injected skills.";
    case "score_below_threshold":
      return "Skill did not meet the match threshold.";
    default:
      return explanation.matched ? "Skill matched but was not injected." : "Skill did not match this run.";
  }
}
