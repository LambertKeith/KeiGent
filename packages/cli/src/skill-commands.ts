import { join } from "node:path";
import {
  loadSkillCatalog,
  type SkillCatalogItem,
  type SkillMeta,
  type SkillStatus,
} from "@keigent/engine";
import { KEIGENT_HOME } from "./config.js";
import { formatJson, parseJsonOutputFormat } from "./json-output.js";

export interface SkillCommandOptions {
  skillsDir?: string;
  stdout?: (line: string) => void;
}

interface SkillInventoryItem {
  name: string;
  description: string;
  status: SkillStatus;
  executable: boolean;
  tags: string[];
  bodyPath: string;
  requiredTools: string[];
  allowedTools: string[];
  permissionsExpected: string[];
  nonGoals: string[];
  dangerousActions: string[];
  evalCoverage: string[];
  source?: SkillMeta["source"];
  riskLevel?: string;
  version?: string;
  taskTypes?: string[];
  triggers?: string[];
  blockedReason?: string;
  deprecatedReason?: string;
}

const DEFAULT_SKILLS_DIR = join(KEIGENT_HOME, "skills");
const SKILL_STATUSES: SkillStatus[] = [
  "draft",
  "candidate",
  "active",
  "verified",
  "learned-note-only",
  "blocked",
  "quarantined",
  "deprecated",
  "promoted",
];

function print(options: SkillCommandOptions, line: string): void {
  (options.stdout ?? console.log)(line);
}

export async function runSkillCommand(
  args: string[] = [],
  options: SkillCommandOptions = {},
): Promise<void> {
  const [subcommand = "list", ...rest] = args;
  const skillsDir = options.skillsDir ?? DEFAULT_SKILLS_DIR;

  if (subcommand === "list") {
    const status = statusArg(rest);
    const outputArgs = outputArgsFor(rest);
    const skills = (await loadSkillCatalog(skillsDir))
      .map(skillInventoryItem)
      .filter((skill) => status === undefined || skill.status === status)
      .sort((a, b) => a.name.localeCompare(b.name));
    const payload = { total: skills.length, skills };
    if (parseJsonOutputFormat(outputArgs).json) {
      print(options, formatJson(payload, outputArgs));
      return;
    }
    if (skills.length === 0) {
      print(options, "No skills found");
      return;
    }
    for (const skill of skills) {
      const coverage = skill.evalCoverage.length;
      const executable = skill.executable ? "executable" : "not-executable";
      print(options, `${skill.name}\t${skill.status}\t${executable}\teval:${coverage}\t${skill.description}`);
    }
    return;
  }

  if (subcommand === "inspect") {
    const name = nameArg(rest, "Usage: keigent skill inspect <skill-name> [--json|--compact]");
    const outputArgs = outputArgsFor(rest);
    const skill = (await loadSkillCatalog(skillsDir))
      .map(skillInventoryItem)
      .find((item) => item.name === name);
    if (!skill) throw new Error(`skill not found: ${name}`);
    if (parseJsonOutputFormat(outputArgs).json) {
      print(options, formatJson(skill, outputArgs));
      return;
    }
    print(options, `${skill.name}\t${skill.status}\t${skill.executable ? "executable" : "not-executable"}`);
    print(options, skill.description);
    if (skill.evalCoverage.length > 0) print(options, `Eval coverage: ${skill.evalCoverage.join(", ")}`);
    if (skill.requiredTools.length > 0) print(options, `Required tools: ${skill.requiredTools.join(", ")}`);
    if (skill.allowedTools.length > 0) print(options, `Allowed tools: ${skill.allowedTools.join(", ")}`);
    if (skill.permissionsExpected.length > 0) print(options, `Permissions: ${skill.permissionsExpected.join(", ")}`);
    if (skill.nonGoals.length > 0) print(options, `Non-goals: ${skill.nonGoals.join(", ")}`);
    if (skill.dangerousActions.length > 0) print(options, `Dangerous actions: ${skill.dangerousActions.join(", ")}`);
    if (skill.blockedReason) print(options, `Blocked reason: ${skill.blockedReason}`);
    if (skill.deprecatedReason) print(options, `Deprecated reason: ${skill.deprecatedReason}`);
    return;
  }

  throw new Error("Usage: keigent skill list|inspect");
}

function skillInventoryItem(skill: SkillCatalogItem): SkillInventoryItem {
  const meta = skill.meta;
  return {
    name: meta.name,
    description: meta.description,
    status: meta.status ?? "active",
    executable: skill.executable,
    tags: meta.tags,
    bodyPath: skill.bodyPath,
    requiredTools: meta.requiredTools ?? [],
    allowedTools: meta.allowedTools ?? [],
    permissionsExpected: meta.permissionsExpected ?? [],
    nonGoals: meta.nonGoals ?? [],
    dangerousActions: meta.dangerousActions ?? [],
    evalCoverage: meta.evalCoverage ?? [],
    source: meta.source,
    riskLevel: meta.riskLevel,
    version: meta.version,
    taskTypes: meta.taskTypes,
    triggers: meta.triggers,
    blockedReason: meta.blockedReason,
    deprecatedReason: meta.deprecatedReason,
  };
}

function statusArg(args: string[]): SkillStatus | undefined {
  const index = args.indexOf("--status");
  if (index === -1) return undefined;
  const status = args[index + 1];
  if (!isSkillStatus(status)) {
    throw new Error(`Usage: keigent skill list [--status ${SKILL_STATUSES.join("|")}] [--json|--compact]`);
  }
  return status;
}

function isSkillStatus(value: string | undefined): value is SkillStatus {
  return SKILL_STATUSES.includes(value as SkillStatus);
}

function outputArgsFor(args: string[]): string[] {
  const outputArgs: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--status") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) outputArgs.push(arg);
  }
  return outputArgs;
}

function nameArg(args: string[], usage: string): string {
  const name = args.find((arg) => !arg.startsWith("--"));
  if (!name) throw new Error(usage);
  return name;
}
