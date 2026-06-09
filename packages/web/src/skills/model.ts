import { redactText } from "../shared/redaction.js";

export type SkillStatus =
  | "draft"
  | "active"
  | "learned-note-only"
  | "quarantined"
  | "deprecated"
  | "promoted";

export interface SkillLibraryInput {
  skills: SkillInput[];
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
  evalCoverage?: string[];
  quarantineReason?: string;
  deprecationReason?: string;
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

export interface SkillView {
  name: string;
  description: string;
  status: SkillStatus;
  statusLabel: string;
  executable: boolean;
  triggerConditions: string[];
  recentMatches: SkillRecentMatchInput[];
  learningNotes: string[];
  evalCoverageLinks: SkillEvalCoverageLink[];
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
  return {
    name: redactText(skill.name),
    description: redactText(skill.description),
    status,
    statusLabel: statusLabel(status),
    executable: isExecutable(status),
    triggerConditions: triggerConditions(skill),
    recentMatches: (input.recentMatches ?? [])
      .filter((match) => match.skillName === skill.name)
      .map((match) => ({
        ...match,
        skillName: redactText(match.skillName),
        ...(match.reason ? { reason: redactText(match.reason) } : {}),
      })),
    learningNotes: (input.learningNotes?.[skill.name] ?? []).map((note) => redactText(note)),
    evalCoverageLinks: (skill.evalCoverage ?? []).map((id) => ({
      id: redactText(id),
      label: redactText(id),
      href: `#eval/${encodeURIComponent(id)}`,
    })),
    ...(skill.quarantineReason ? { quarantineReason: redactText(skill.quarantineReason) } : {}),
    ...(skill.deprecationReason ? { deprecationReason: redactText(skill.deprecationReason) } : {}),
  };
}

function isExecutable(status: SkillStatus): boolean {
  return status === "active" || status === "promoted";
}

function statusLabel(status: SkillStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "promoted":
      return "Promoted";
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
    ...(skill.requiredTools ?? []).map((tool) => `requires:${redactText(tool)}`),
    ...(skill.allowedTools ?? []).map((tool) => `allows:${redactText(tool)}`),
    ...(skill.nonGoals ?? []).map((nonGoal) => `not:${redactText(nonGoal)}`),
  ];
}
