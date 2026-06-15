import {
  LoopEngine,
  Orchestrator,
  Learner,
  PlaywrightStateCapture,
  closeBrowser,
  loadSkillContext,
  makeRegistry,
  buildDefaultRegistry,
  DenyByDefaultGate,
  WorkflowRunner,
  createEngineWorkflowChildRunner,
  createWorkflowSpec,
  type FailureSummary,
  type Task,
  type WorkflowBudget,
  type WorkflowBudgetUsage,
  type WorkflowProgressCallback,
  type WorkflowResult,
} from "@keigent/engine";
import { buildModel, loadConfig, type KeigentConfig } from "./config.js";

export interface ExecuteWorkflowTaskOptions {
  goal: string;
  config?: KeigentConfig;
  onProgress?: WorkflowProgressCallback;
  onReady?: (summary: { modelId: string; skillCount: number }) => void;
}

export interface ExecuteWorkflowTaskResult {
  result: WorkflowResult;
  config: KeigentConfig;
  learner: Learner;
  skillBodies: Map<string, string>;
}

export async function executeWorkflowTask(options: ExecuteWorkflowTaskOptions): Promise<ExecuteWorkflowTaskResult> {
  try {
    const config = options.config ?? await loadConfig();
    const model = buildModel(config);
    const skillContext = await loadSkillContext(config.skillsDir);
    options.onReady?.({ modelId: config.modelId, skillCount: skillContext.metas.length });
    const task: Task = { goal: options.goal, profile: "auto" };
    const learner = new Learner(model, config.apiKey);

    const skillBodies = new Map<string, string>();
    for (const meta of skillContext.metas) {
      const body = await skillContext.loadBody(meta.name);
      if (body) skillBodies.set(meta.name, body);
    }

    if (!config.modelCapabilities.toolCalling && toolDependentGoal(options.goal)) {
      return {
        result: providerCapabilityLimitationResult(task, config),
        config,
        learner,
        skillBodies,
      };
    }

    const orchestrator = new Orchestrator({
      model,
      apiKey: config.apiKey,
      registry: makeRegistry({ model, apiKey: config.apiKey, memoryDir: config.memoryDir }),
    });
    const stateCapture = new PlaywrightStateCapture();
    const registry = buildDefaultRegistry();

    const workflow = new WorkflowRunner(
      createEngineWorkflowChildRunner({
        orchestrator,
        registry,
        skillContext,
        stateCapture,
        createEngine(maxIterations, budget, workspacePath) {
          return new LoopEngine({
            model,
            apiKey: config.apiKey,
            maxIterations: maxIterations ?? config.maxIterations,
            maxToolCalls: budget?.maxToolCalls ?? config.maxToolCalls,
            maxTokenEstimate: budget?.maxTokenEstimate ?? config.maxTokenEstimate,
            maxProviderCostUsd: budget?.maxProviderCostUsd ?? config.maxProviderCostUsd ?? undefined,
            maxWallTimeMs: budget?.maxWallTimeMs ?? config.maxWallTimeMs,
            maxRecoveryAttempts: budget?.maxRecoveryAttempts ?? config.maxRecoveryAttempts,
            registry,
            workspace: workspacePath ?? config.workspace,
            approval: new DenyByDefaultGate(),
            headless: config.headless,
          });
        },
      }),
    );

    const result = await workflow.run(
      createWorkflowSpec({
        id: `cli-${Date.now()}`,
        task,
        budget: workflowBudgetForConfig(config),
      }),
      options.onProgress,
    );

    return { result, config, learner, skillBodies };
  } finally {
    await closeBrowser();
  }
}

function workflowBudgetForConfig(config: KeigentConfig): WorkflowBudget {
  return {
    maxChildRuns: config.maxChildRuns,
    maxIterationsPerRun: config.maxIterations,
    maxAggregateIterations: config.maxIterations * config.maxChildRuns,
    maxToolCallsPerRun: config.maxToolCalls,
    maxAggregateToolCalls: config.maxToolCalls * config.maxChildRuns,
    maxTokenEstimatePerRun: config.maxTokenEstimate,
    maxAggregateTokenEstimate: config.maxTokenEstimate * config.maxChildRuns,
    ...(config.maxProviderCostUsd !== null
      ? {
          maxProviderCostUsdPerRun: config.maxProviderCostUsd,
          maxAggregateProviderCostUsd: config.maxProviderCostUsd * config.maxChildRuns,
        }
      : {}),
    maxRecoveryAttemptsPerRun: config.maxRecoveryAttempts,
    timeoutMs: config.maxWallTimeMs,
  };
}

function providerCapabilityLimitationResult(task: Task, config: KeigentConfig): WorkflowResult {
  const workflowId = `cli-provider-capability-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const message = "Provider capability prevented tool execution; choose a tool-capable model or a non-tool workflow.";
  const budget = workflowBudgetForConfig(config);
  const budgetUsage: WorkflowBudgetUsage = {
    childRuns: 0,
    iterations: 0,
    toolCalls: 0,
    tokenEstimate: 0,
    recoveryAttempts: 0,
    checkpointsPassed: 0,
    durationMs: 0,
  };
  const failure: FailureSummary = {
    code: "tool_unavailable",
    layer: "model",
    message,
    nextAction: "Choose a tool-capable model or rewrite the task so it does not require tools.",
  };
  const autonomy = {
    outcome: "escalated" as const,
    repairAttempts: [],
    escalations: [{ reason: "external_dependency_blocked" as const, message }],
  };
  const evidence = [{ kind: "policy" as const, passed: false, message }];
  const trajectory = {
    schemaVersion: 1 as const,
    workflowId,
    mode: "verified-loop" as const,
    goal: task.goal,
    rootTask: task,
    startedAt,
    durationMs: 0,
    exitReason: "verified_failure" as const,
    finalResponse: message,
    budget,
    budgetUsage,
    autonomy,
    evidence,
    failure,
    events: [
      { kind: "workflow_start" as const, workflowId, mode: "verified-loop" as const, goal: task.goal },
      { kind: "workflow_verdict" as const, workflowId, passed: false, evidence },
      { kind: "workflow_done" as const, workflowId, exitReason: "verified_failure" as const, failure },
    ],
    childRuns: [],
  };
  return {
    workflowId,
    mode: "verified-loop",
    exitReason: "verified_failure",
    finalResponse: message,
    childRuns: [],
    evidence,
    budget,
    budgetUsage,
    autonomy,
    durationMs: 0,
    trajectory,
    failure,
  };
}

function toolDependentGoal(goal: string): boolean {
  return /\b(read|write|edit|create|open|browse|browser|file|command|shell|http|url|run|execute|config|doctor|workspace)\b/i.test(goal)
    || /(读取|写入|编辑|创建|打开|浏览器|文件|命令|运行|执行|配置|工作区)/.test(goal);
}
