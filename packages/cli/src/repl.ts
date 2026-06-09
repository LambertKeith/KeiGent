import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  LoopEngine,
  Orchestrator,
  Learner,
  PlaywrightStateCapture,
  closeBrowser,
  loadSkillContext,
  makeRegistry,
  buildDefaultRegistry,
  createWorkflowSpec,
  WorkflowRunner,
  createEngineWorkflowChildRunner,
  type ApprovalRequest,
  type ApprovalGate,
  type Task,
} from "@keigent/engine";
import { loadConfig, buildModel, type KeigentConfig } from "./config.js";
import { handleCommand, type ReplState } from "./commands.js";
import { persistWorkflowAndLearn } from "./post-run.js";
import { renderWorkflowProgress, printBanner, printResponse, printError, printInfo, colors as c } from "./renderer.js";

// ── 交互式审批门：dangerous 工具弹 [y/N] ──────────────────────────────

class InteractiveApprovalGate implements ApprovalGate {
  constructor(private readonly rl: readline.Interface) {}

  async request(request: ApprovalRequest): Promise<boolean> {
    const argStr = JSON.stringify(request.args).slice(0, 120);
    const answer = await this.rl.question(
      `${c.yellow}⚠ ${request.action}${c.reset}\n` +
      `  target: ${request.targetResource}\n` +
      `  risk: ${request.riskLevel} permission=${request.permission} sideEffect=${request.sideEffect} reversible=${request.reversible}\n` +
      `  evidence: ${request.evidenceRequired.join(", ") || "none"}\n` +
      `  exposesSecrets: ${request.exposesSecrets}\n` +
      `  args: ${c.dim}${argStr}${c.reset}\n` +
      `  允许执行? [y/N] `,
    );
    return answer.trim().toLowerCase() === "y";
  }
}

export async function runRepl(): Promise<void> {
  const config = await loadConfig();
  const model = buildModel(config);
  const rl = readline.createInterface({ input: stdin, output: stdout });

  const skillContext = await loadSkillContext(config.skillsDir);
  printBanner();
  printInfo(`model=${config.modelId} | skills=${skillContext.metas.length} | workspace=${config.workspace}`);
  printInfo(`浏览器: ${config.headless ? "headless" : "headed"}\n`);

  const approval = new InteractiveApprovalGate(rl);
  const profileRegistry = makeRegistry({ model, apiKey: config.apiKey, memoryDir: config.memoryDir });

  const replState: ReplState = {
    forcedProfile: null,
    headless: config.headless,
    skillContext,
    profileNames: profileRegistry.names(),
  };

  const orchestrator = new Orchestrator({
    model,
    apiKey: config.apiKey,
    registry: profileRegistry,
  });
  const learner = new Learner(model, config.apiKey);
  const stateCapture = new PlaywrightStateCapture();
  const registry = buildDefaultRegistry();

  // skill body 预加载（学习 loop 用）
  const skillBodies = new Map<string, string>();
  for (const m of skillContext.metas) {
    const body = await skillContext.loadBody(m.name);
    if (body) skillBodies.set(m.name, body);
  }

  // ── REPL 主循环 ──────────────────────────────────────────────────
  let running = true;
  while (running) {
    let input: string;
    try {
      input = (await rl.question(`${c.bold}${c.cyan}❯ ${c.reset}`)).trim();
    } catch {
      // readline 关闭（EOF / Ctrl+D / 管道结束）→ 优雅退出
      break;
    }
    if (!input) continue;

    // 斜杠命令
    const cmdResult = handleCommand(input, replState);
    if (cmdResult.handled) {
      if (cmdResult.shouldQuit) running = false;
      continue;
    }

    // 作为任务执行
    await runTask(input, {
      config, model, replState, orchestrator, learner, stateCapture,
      registry, profileRegistry, approval, skillBodies, rl,
    });
  }

  rl.close();
  await closeBrowser();
  printInfo("再见。");
}

interface TaskDeps {
  config: KeigentConfig;
  model: ReturnType<typeof buildModel>;
  replState: ReplState;
  orchestrator: Orchestrator;
  learner: Learner;
  stateCapture: PlaywrightStateCapture;
  registry: ReturnType<typeof buildDefaultRegistry>;
  profileRegistry: ReturnType<typeof makeRegistry>;
  approval: ApprovalGate;
  skillBodies: Map<string, string>;
  rl: import("node:readline/promises").Interface;
}

async function runTask(goal: string, deps: TaskDeps): Promise<void> {
  const { config, model, replState, orchestrator, learner, stateCapture, registry, profileRegistry, approval, skillBodies, rl } = deps;

  const task: Task = {
    goal,
    profile: replState.forcedProfile ?? "auto",
  };

  const profileSelectingOrchestrator = replState.forcedProfile
    ? {
        async selectProfile() {
          return {
            name: replState.forcedProfile!,
            profile: profileRegistry.get(replState.forcedProfile!),
            method: "rule" as const,
          };
        },
      }
    : orchestrator;

  try {
    const workflow = new WorkflowRunner(
      createEngineWorkflowChildRunner({
        orchestrator: profileSelectingOrchestrator,
        registry,
        skillContext: replState.skillContext,
        stateCapture,
        createEngine(maxIterations) {
          return new LoopEngine({
            model,
            apiKey: config.apiKey,
            maxIterations: maxIterations ?? config.maxIterations,
            registry,
            workspace: config.workspace,
            approval,
            headless: replState.headless,
            askUser: async (q) => (await rl.question(`\n${c.yellow}? ${q}${c.reset}\n  ❯ `)).trim(),
          });
        },
      }),
    );

    const result = await workflow.run(
      createWorkflowSpec({
        id: `repl-${Date.now()}`,
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
    }

    await persistWorkflowAndLearn(result, config, learner, skillBodies);
  } catch (e) {
    printError(`执行出错: ${e instanceof Error ? e.message : String(e)}`);
  }
}
