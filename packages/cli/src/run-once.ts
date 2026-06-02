import {
  LoopEngine,
  Orchestrator,
  Learner,
  PlaywrightStateCapture,
  closeBrowser,
  loadSkillContext,
  makeRegistry,
  buildDefaultRegistry,
  saveTrajectory,
  formatLearningResult,
  AllowAllGate,
  toolsForProfile,
  type Task,
} from "@keigent/engine";
import { loadConfig, buildModel } from "./config.js";
import { renderProgress, printResponse, printError, printInfo } from "./renderer.js";

/**
 * 单次执行模式：keigent run "任务" 或 keigent "任务"。
 * 非交互场景（脚本、CI、管道）用。dangerous 工具自动放行（AllowAllGate）。
 */
export async function runOnce(goal: string): Promise<void> {
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
  const selected = await orchestrator.selectProfile(task, skillContext.metas);
  renderProgress({ kind: "profile_selected", profile: selected.name, via: selected.method });

  const engine = new LoopEngine({
    model,
    apiKey: config.apiKey,
    maxIterations: config.maxIterations,
    registry,
    workspace: config.workspace,
    approval: new AllowAllGate(),
    headless: config.headless,
  });

  try {
    const result = await engine.run(
      task,
      skillContext,
      selected.profile,
      stateCapture,
      toolsForProfile(registry, selected.name),
      renderProgress,
    );
    printResponse(result.finalResponse);

    await saveTrajectory(result.trajectory, config.skillsDir).catch(() => {});
    if (result.exitReason === "success" && result.trajectory.skillsUsed.length > 0) {
      printInfo("（学习 loop 分析中…）");
      const learning = await learner.learn(result.trajectory, config.skillsDir, skillBodies).catch(() => null);
      if (learning) printInfo(formatLearningResult(learning).split("\n")[0] ?? "");
    }
  } catch (e) {
    printError(`执行出错: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await closeBrowser();
  }
}
