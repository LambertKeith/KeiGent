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
} from "@keigent/engine";
import { loadConfig, buildModel } from "./config.js";
import { persistWorkflowAndLearn } from "./post-run.js";
import { renderWorkflowProgress, printResponse, printError, printInfo } from "./renderer.js";

/**
 * 单次执行模式：keigent run "任务" 或 keigent "任务"。
 * 非交互场景（脚本、CI、管道）用。需要审批的高风险工具默认拒绝。
 */
export async function runOnce(goal: string): Promise<void> {
  try {
    const config = await loadConfig();
    const model = buildModel(config);
    const skillContext = await loadSkillContext(config.skillsDir);

    printInfo(`KeiGent 单次执行 | model=${config.modelId} | skills=${skillContext.metas.length}`);

    const orchestrator = new Orchestrator({
      model,
      apiKey: config.apiKey,
      registry: makeRegistry({ model, apiKey: config.apiKey, memoryDir: config.memoryDir }),
    });
    const learner = new Learner(model, config.apiKey);
    const stateCapture = new PlaywrightStateCapture();
    const registry = buildDefaultRegistry();

    const skillBodies = new Map<string, string>();
    for (const m of skillContext.metas) {
      const body = await skillContext.loadBody(m.name);
      if (body) skillBodies.set(m.name, body);
    }

    const task: Task = { goal, profile: "auto" };
    const workflow = new WorkflowRunner(
      createEngineWorkflowChildRunner({
        orchestrator,
        registry,
        skillContext,
        stateCapture,
        createEngine(maxIterations) {
          return new LoopEngine({
            model,
            apiKey: config.apiKey,
            maxIterations: maxIterations ?? config.maxIterations,
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
          maxIterationsPerRun: config.maxIterations,
          maxAggregateIterations: config.maxIterations,
        },
      }),
      renderWorkflowProgress,
    );
    if (result.exitReason === "success") {
      printResponse(result.finalResponse);
    } else {
      printError(`workflow failed: ${result.exitReason}`);
      printResponse(result.finalResponse);
      process.exitCode = 1;
    }

    await persistWorkflowAndLearn(result, config, learner, skillBodies);
  } catch (e) {
    printError(`执行出错: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  } finally {
    await closeBrowser();
  }
}
