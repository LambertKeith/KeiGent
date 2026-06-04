import type { EvalCase, EvalExecutor } from "./types.js";
import type { LoopResult, Task, TrajectoryStep } from "../types.js";

const task = (goal: string, profile = "auto"): Task => ({ goal, profile });

export const DEFAULT_EVAL_CASES: EvalCase[] = [
  {
    id: "smoke-conversational-hello",
    title: "闲聊问候应走 conversational 并快速退出",
    category: "conversational",
    task: task("你好"),
    expectedProfile: "conversational",
    acceptance: {
      exitReasons: ["success"],
      forbiddenTools: ["shell", "browser_navigate", "mouse_click"],
      finalResponseIncludes: ["你好"],
    },
  },
  {
    id: "smoke-research-analysis",
    title: "开放分析任务应走 divergent-research",
    category: "research",
    task: task("分析 KeiGent 和普通 coding agent 的区别"),
    expectedProfile: "divergent-research",
    acceptance: {
      exitReasons: ["success"],
      finalResponseIncludes: ["分析"],
    },
  },
  {
    id: "smoke-verified-checkpoint",
    title: "带 successDef 的执行任务应走 verified 并产生 checkpoint",
    category: "verified-exec",
    task: {
      goal: "读取 workspace 中的 hello.txt 并确认内容",
      profile: "auto",
      successDef: {
        goal: "确认文件内容",
        assertions: [{ description: "最终回答包含 hello", signal: "text" }],
      },
    },
    expectedProfile: "convergent-verified",
    acceptance: {
      exitReasons: ["success"],
      requiredTools: ["file_read"],
      minCheckpoints: 1,
      finalResponseIncludes: ["hello"],
    },
  },
  {
    id: "smoke-tool-file-write",
    title: "工具烟测任务记录文件写入工具",
    category: "tool-smoke",
    task: task("在 workspace 创建 hello.txt"),
    expectedProfile: "convergent-exec",
    acceptance: {
      exitReasons: ["success"],
      requiredTools: ["file_write"],
      minCheckpoints: 1,
      finalResponseIncludes: ["done"],
    },
  },
];

const profileByCaseId: Record<string, string> = {
  "smoke-conversational-hello": "conversational",
  "smoke-research-analysis": "divergent-research",
  "smoke-verified-checkpoint": "convergent-verified",
  "smoke-tool-file-write": "convergent-exec",
};

const responseByCaseId: Record<string, string> = {
  "smoke-conversational-hello": "你好，我在。",
  "smoke-research-analysis": "分析：KeiGent 关注 loop/profile 切换，普通 coding agent 更依赖单一循环。",
  "smoke-verified-checkpoint": "hello 内容已确认。",
  "smoke-tool-file-write": "done: hello.txt created",
};

const toolStepsByCaseId: Record<string, TrajectoryStep[]> = {
  "smoke-verified-checkpoint": [
    { iteration: 1, kind: "tool_call", toolName: "file_read", toolArgs: { path: "hello.txt" }, toolResult: "hello", toolSucceeded: true },
    { iteration: 2, kind: "checkpoint", checkpointDesc: "file content confirmed", verdictPassed: true, verdictEvidence: "contains hello" },
  ],
  "smoke-tool-file-write": [
    { iteration: 1, kind: "tool_call", toolName: "file_write", toolArgs: { path: "hello.txt" }, toolResult: "ok", toolSucceeded: true },
    { iteration: 2, kind: "checkpoint", checkpointDesc: "file created", verdictPassed: true, verdictEvidence: "created" },
  ],
};

function smokeLoopResult(evalCase: EvalCase, selectedProfile: string): LoopResult {
  const finalResponse = responseByCaseId[evalCase.id] ?? "done";
  const steps = toolStepsByCaseId[evalCase.id] ?? [
    { iteration: 1, kind: "text_output", text: finalResponse },
  ];
  const checkpointCount = steps.filter((step) => step.kind === "checkpoint" && step.verdictPassed).length;
  const toolCount = steps.filter((step) => step.kind === "tool_call").length;

  return {
    exitReason: "success",
    finalResponse,
    iterations: Math.max(1, ...steps.map((step) => step.iteration)),
    checkpointsPassed: checkpointCount,
    totalToolCalls: toolCount,
    trajectory: {
      task: evalCase.task,
      profile: selectedProfile,
      exitReason: "success",
      steps,
      finalResponse,
      durationMs: 1,
      skillsUsed: [],
    },
  };
}

export function createSmokeEvalExecutor(): EvalExecutor {
  return {
    async run(evalCase) {
      const selectedProfile = profileByCaseId[evalCase.id] ?? evalCase.expectedProfile ?? "divergent-research";
      return { selectedProfile, result: smokeLoopResult(evalCase, selectedProfile) };
    },
  };
}
