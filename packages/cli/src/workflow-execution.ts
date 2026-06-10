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
  type Task,
  type WorkflowProgressCallback,
  type WorkflowResult,
} from "@keigent/engine";
import { buildModel, loadConfig, type KeigentConfig } from "./config.js";

export interface ExecuteWorkflowTaskOptions {
  goal: string;
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
    const config = await loadConfig();
    const model = buildModel(config);
    const skillContext = await loadSkillContext(config.skillsDir);
    options.onReady?.({ modelId: config.modelId, skillCount: skillContext.metas.length });

    const orchestrator = new Orchestrator({
      model,
      apiKey: config.apiKey,
      registry: makeRegistry({ model, apiKey: config.apiKey, memoryDir: config.memoryDir }),
    });
    const learner = new Learner(model, config.apiKey);
    const stateCapture = new PlaywrightStateCapture();
    const registry = buildDefaultRegistry();

    const skillBodies = new Map<string, string>();
    for (const meta of skillContext.metas) {
      const body = await skillContext.loadBody(meta.name);
      if (body) skillBodies.set(meta.name, body);
    }

    const task: Task = { goal: options.goal, profile: "auto" };
    const workflow = new WorkflowRunner(
      createEngineWorkflowChildRunner({
        orchestrator,
        registry,
        skillContext,
        stateCapture,
        createEngine(maxIterations, budget) {
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
            workspace: config.workspace,
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
        budget: {
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
        },
      }),
      options.onProgress,
    );

    return { result, config, learner, skillBodies };
  } finally {
    await closeBrowser();
  }
}
