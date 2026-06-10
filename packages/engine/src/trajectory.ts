import { vlog, vwarn } from "./logger.js";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { ApprovalDecision } from "./tools/types.js";
import type { FailureSummary } from "./failures.js";
import type {
  ExitReason,
  ProviderUsageSummary,
  SkillMatchExplanation,
  StateSnapshot,
  Task,
  Trajectory,
  TrajectoryStep,
} from "./types.js";

// ── 收集器（引擎在运行时向它追加步骤）────────────────────────────────

export class TrajectoryCollector {
  private steps: TrajectoryStep[] = [];
  private startMs = Date.now();
  readonly id = randomUUID();

  addSkillMatches(skillMatches: SkillMatchExplanation[]): void {
    this.steps.push({ iteration: 0, kind: "skill_match", skillMatches });
  }

  addToolCall(opts: {
    iteration: number;
    toolName: string;
    toolArgs: Record<string, unknown>;
    toolResult: string;
    succeeded: boolean;
  }): void {
    this.steps.push({
      iteration: opts.iteration,
      kind: "tool_call",
      toolName: opts.toolName,
      toolArgs: opts.toolArgs,
      toolResult: opts.toolResult,
      toolSucceeded: opts.succeeded,
    });
  }

  addTextOutput(iteration: number, text: string): void {
    this.steps.push({ iteration, kind: "text_output", text });
  }

  addCheckpoint(opts: {
    iteration: number;
    desc: string;
    snapshot: StateSnapshot;
    verdictPassed: boolean;
    verdictEvidence: string;
  }): void {
    this.steps.push({
      iteration: opts.iteration,
      kind: "checkpoint",
      checkpointDesc: opts.desc,
      snapshot: opts.snapshot,
      verdictPassed: opts.verdictPassed,
      verdictEvidence: opts.verdictEvidence,
    });
  }

  addApproval(iteration: number, approval: ApprovalDecision): void {
    this.steps.push({ iteration, kind: "approval", approval });
  }

  addRecovery(iteration: number, recovery: TrajectoryStep["recovery"]): void {
    this.steps.push({ iteration, kind: "recovery", recovery });
  }

  addError(iteration: number, message: string): void {
    this.steps.push({ iteration, kind: "error", errorMessage: message });
  }

  finalize(opts: {
    task: Task;
    profile: string;
    exitReason: ExitReason;
    finalResponse: string;
    skillsUsed: string[];
    estimatedTokens?: number;
    providerUsage?: ProviderUsageSummary;
    failure?: FailureSummary;
  }): Trajectory {
    return {
      ...opts,
      steps: this.steps,
      durationMs: Date.now() - this.startMs,
    };
  }
}

// ── 轨迹持久化（写到 .trajectories/ 目录供审计和学习 loop 读取）───────

export async function saveTrajectory(
  trajectory: Trajectory,
  baseDir: string,
): Promise<string> {
  const dir = join(baseDir, ".trajectories");
  await mkdir(dir, { recursive: true });

  const filename = `${Date.now()}-${trajectory.profile}-${trajectory.exitReason}.json`;
  const path = join(dir, filename);
  await writeFile(path, JSON.stringify(trajectory, null, 2), "utf-8");
  vlog(`[trajectory] 已保存: ${path}`);
  return path;
}

// ── 轨迹渲染（供学习 loop 的 LLM 阅读）──────────────────────────────

export function renderTrajectoryForLLM(t: Trajectory): string {
  const lines: string[] = [
    `# 执行轨迹`,
    ``,
    `## 任务`,
    `目标: ${t.task.goal}`,
    `Profile: ${t.profile}`,
    `退出原因: ${t.exitReason}`,
    `耗时: ${t.durationMs}ms`,
    `使用的 Skill: ${t.skillsUsed.join(", ") || "无"}`,
    ``,
    `## 执行步骤`,
  ];

  for (const step of t.steps) {
    switch (step.kind) {
      case "skill_match":
        lines.push(
          `[迭代 ${step.iteration}] Skill 匹配:`,
          ...((step.skillMatches ?? []).map((skill) =>
            `  - ${skill.name}: score=${skill.score}, injected=${skill.injected}, signals=${skill.signals.join("|") || "none"}${skill.exclusionReason ? `, excluded=${skill.exclusionReason}` : ""}`,
          )),
        );
        break;
      case "tool_call":
        lines.push(
          `[迭代 ${step.iteration}] 工具调用: ${step.toolName}`,
          `  参数: ${JSON.stringify(step.toolArgs)}`,
          `  结果: ${(step.toolResult ?? "").slice(0, 200)}${(step.toolResult?.length ?? 0) > 200 ? "..." : ""}`,
          `  状态: ${step.toolSucceeded ? "✓ 成功" : "✗ 失败"}`,
        );
        break;
      case "text_output":
        lines.push(
          `[迭代 ${step.iteration}] 模型输出:`,
          `  ${(step.text ?? "").slice(0, 300)}${(step.text?.length ?? 0) > 300 ? "..." : ""}`,
        );
        break;
      case "checkpoint":
        lines.push(
          `[迭代 ${step.iteration}] Checkpoint: "${step.checkpointDesc}"`,
          `  验证: ${step.verdictPassed ? "✓ 通过" : "✗ 失败"} — ${step.verdictEvidence}`,
          `  状态快照: url=${step.snapshot?.url ?? "n/a"}`,
        );
        break;
      case "approval":
        lines.push(
          `[迭代 ${step.iteration}] 审批: ${step.approval?.approved ? "允许" : "拒绝"}`,
          `  工具: ${step.approval?.request.toolName ?? "unknown"}`,
          `  风险: ${step.approval?.request.riskLevel ?? "unknown"} / ${step.approval?.request.permission ?? "unknown"}`,
          `  目标: ${step.approval?.request.targetResource ?? "unknown"}`,
        );
        break;
      case "recovery":
        lines.push(
          `[迭代 ${step.iteration}] 恢复策略: ${step.recovery?.decision ?? "unknown"}`,
          step.recovery?.hint ? `  修复提示: ${step.recovery.hint}` : "",
          step.recovery?.reason ? `  原因: ${step.recovery.reason}` : "",
        );
        break;
      case "error":
        lines.push(`[迭代 ${step.iteration}] ✗ 错误: ${step.errorMessage}`);
        break;
    }
    lines.push("");
  }

  lines.push(
    `## 最终输出`,
    t.finalResponse || "(无输出)",
  );

  return lines.join("\n");
}
