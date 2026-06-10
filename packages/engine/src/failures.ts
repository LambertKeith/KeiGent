import type { ExitReason } from "./types.js";
import type { WorkflowExitReason } from "./workflow/types.js";

export type FailureLayer =
  | "input"
  | "routing"
  | "skill"
  | "permission"
  | "tool"
  | "external"
  | "verification"
  | "budget"
  | "model"
  | "internal";

export type FailureCode =
  | "missing_target"
  | "missing_user_input"
  | "profile_mismatch"
  | "skill_missing"
  | "permission_denied"
  | "tool_unavailable"
  | "network_error"
  | "auth_failed"
  | "checkpoint_missing"
  | "verified_failure"
  | "budget_exceeded"
  | "max_iterations"
  | "timeout"
  | "malformed_tool"
  | "final_missing"
  | "executor_error"
  | "child_error"
  | "human_escalation";

export interface FailureSummary {
  code: FailureCode;
  layer: FailureLayer;
  message: string;
  nextAction: string;
}

export function recommendedNextActionFor(code: FailureCode): string {
  switch (code) {
    case "missing_target":
      return "补充目标、对象或成功标准后重新运行。";
    case "missing_user_input":
      return "在 REPL 交互模式中回答澄清问题，或把缺失信息直接写进任务。";
    case "profile_mismatch":
      return "检查 routing rationale 和 fixture，必要时调整规则或增加 guard。";
    case "skill_missing":
      return "补充合适的 skill，或让任务降级为研究/澄清流程。";
    case "permission_denied":
      return "在交互模式批准该范围，或调整任务/配置避免高风险工具。";
    case "tool_unavailable":
      return "运行 doctor 检查本地工具依赖和权限。";
    case "network_error":
      return "检查网络或稍后重试；不要把外部失败当作任务成功。";
    case "auth_failed":
      return "检查 API key、登录状态或 endpoint 配置，注意不要泄露 secret。";
    case "checkpoint_missing":
      return "补充 checkpoint/verdict 证据后重新运行 verified 流程。";
    case "verified_failure":
      return "补充或检查证据，必要时人工复核操作是否实际完成。";
    case "budget_exceeded":
      return "缩小任务范围、提高预算，或检查是否存在失控的工具/模型循环。";
    case "max_iterations":
      return "提高预算、缩小任务范围，或补充更具体的 skill/successDef。";
    case "timeout":
      return "提高 timeout、缩小任务范围，或检查是否有卡住的工具/模型请求。";
    case "malformed_tool":
      return "检查模型工具调用协议，必要时重试一次或升级为人工处理。";
    case "final_missing":
      return "重试或检查模型兼容性；缺少最终输出不能视为成功。";
    case "executor_error":
      return "保存 trajectory/report 并检查运行时错误。";
    case "child_error":
      return "查看 child trajectory，定位子运行异常层级后重试。";
    case "human_escalation":
      return "需要人类决策后才能继续自动化。";
  }
}

export function failureSummaryForLoopExit(exitReason: ExitReason, finalResponse: string): FailureSummary | undefined {
  if (exitReason === "success") return undefined;
  if (exitReason === "max_iterations") return summary("max_iterations", "budget", "达到最大迭代次数，任务未在预算内完成。");
  if (exitReason === "budget_exceeded") return summary("budget_exceeded", "budget", "运行预算耗尽，任务未完成。");
  if (exitReason === "escalated") return summary("human_escalation", "input", "运行已升级为需要人类决策。");

  const text = finalResponse.toLowerCase();
  if (finalResponse.includes("未获授权") || finalResponse.includes("拒绝执行") || text.includes("permission denied")) {
    return summary("permission_denied", "permission", "权限策略拒绝执行该动作。");
  }
  if (finalResponse.includes("non_interactive_input_required")) {
    return summary("missing_user_input", "input", "任务需要用户澄清，但当前没有可用交互通道。");
  }
  if (text.includes("timed out") || text.includes("timeout") || finalResponse.includes("超时")) {
    return summary("timeout", "budget", "运行或外部请求超时。");
  }
  if (finalResponse.includes("模型无输出") || text.includes("no output")) {
    return summary("final_missing", "model", "模型没有产生可用最终输出。");
  }
  if (text.includes("aborted")) {
    return summary("timeout", "budget", "运行已取消或中止。");
  }
  return summary("executor_error", "internal", "运行时返回错误。");
}

export function failureSummaryForWorkflowExit(exitReason: WorkflowExitReason): FailureSummary | undefined {
  switch (exitReason) {
    case "success":
      return undefined;
    case "verified_failure":
      return summary("verified_failure", "verification", "子运行完成但证据不足或断言未通过。");
    case "budget_exceeded":
      return summary("budget_exceeded", "budget", "workflow 预算耗尽。");
    case "timeout":
      return summary("timeout", "budget", "workflow 父级超时。");
    case "child_error":
      return summary("child_error", "internal", "workflow child 运行异常。");
    case "child_escalated":
      return summary("human_escalation", "input", "workflow child 需要人类决策。");
    case "max_iterations":
      return summary("max_iterations", "budget", "workflow child 达到最大迭代次数。");
  }
}

function summary(code: FailureCode, layer: FailureLayer, message: string): FailureSummary {
  return { code, layer, message, nextAction: recommendedNextActionFor(code) };
}
