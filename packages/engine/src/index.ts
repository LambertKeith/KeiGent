import { join } from "path";
import { fileURLToPath } from "url";
import { type Api, type Model } from "@earendil-works/pi-ai";
import { LoopEngine } from "./engine.js";
import { loadSkillContext } from "./skills.js";
import { Orchestrator, makeRegistry } from "./orchestrator.js";
import { PlaywrightStateCapture, closeBrowser } from "./browser.js";
import { Learner } from "./learner.js";
import { saveTrajectory } from "./trajectory.js";
import { formatLearningResult } from "./skill-patch.js";
import { buildDefaultRegistry } from "./tools/index.js";
import { setVerbose } from "./logger.js";
import type { Task } from "./types.js";

// demo 模式开启内部日志（看完整执行过程）
setVerbose(true);

// ── Model（protocol-compatible demo config）──────────────────────────────
type DemoProtocol = "openai" | "anthropic";

function demoProtocol(): DemoProtocol {
  return process.env["KEIGENT_API_PROTOCOL"] === "anthropic" ? "anthropic" : "openai";
}

const protocol = demoProtocol();
const model: Model<Api> = {
  id: process.env["KEIGENT_MODEL_ID"] ?? (protocol === "anthropic" ? "claude-3-5-sonnet-latest" : "gpt-4o-mini"),
  name: "KeiGent demo model",
  api: protocol === "anthropic" ? "anthropic-messages" : "openai-completions",
  provider: protocol === "anthropic" ? "anthropic-compatible" : "openai-compatible",
  baseUrl: process.env["KEIGENT_BASE_URL"] ?? (protocol === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1"),
  reasoning: false,
  input: ["text", "image"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 16384,
};

function requireApiKey(): string {
  const apiKey = process.env["KEIGENT_API_KEY"];
  if (!apiKey) {
    throw new Error("KEIGENT_API_KEY is required to run the engine demo entrypoint");
  }
  return apiKey;
}

const API_KEY = requireApiKey();

// ── 工具注册表（B0：工具与引擎解耦）────────────────────────────────────

const registry = buildDefaultRegistry();
// availableTools 发给 LLM 的 schema 从 registry 派生
const TOOLS = registry.toPiAiTools();

// ── 测试任务集（覆盖不同性质，验证 Orchestrator 分类准确性）─────────────

const TEST_TASKS: Task[] = [
  {
    // 执行型：有 URL + 具体操作动词 → 应分类为 convergent-exec
    goal: "请抓取 https://example.com 的页面内容，并用 web-summarize skill 的方式总结。",
    profile: "auto",   // 不再手动指定，由 Orchestrator 决定
    successDef: {
      goal: "成功抓取 https://example.com 并产出结构化总结",
      assertions: [
        // 这两条断言基于 StateSnapshot 可验证：
        // 1. 页面已被成功访问（URL 正确）
        { description: "当前页面 URL 是 https://example.com/ 或 https://example.com", signal: "url" },
        // 2. 页面有可见内容（说明抓取成功）
        { description: "页面可见文本包含 Example Domain 或类似内容", signal: "text" },
      ],
    },
  },
  {
    // 发散型：含"了解/分析"开放词，无具体 URL → 应分类为 divergent-research
    goal: "请分析和了解 Agent Skill 的设计理念，以及它和传统 function calling 的本质区别。",
    profile: "auto",
  },
  {
    // 规则边界型：有 URL 但无执行动词，无 successDef → 规则无法判断，升级 LLM 分类
    goal: "https://example.com 这个页面是做什么的？",
    profile: "auto",
  },
];

// ── 单任务完整闭环 ────────────────────────────────────────────────────

async function runTaskWithOrchestration(
  task: Task,
  engine: LoopEngine,
  orchestrator: Orchestrator,
  learner: Learner,
  stateCapture: PlaywrightStateCapture,
  skillsDir: string,
  skillBodies: Map<string, string>,
  taskIndex: number,
): Promise<void> {
  const skillContext = await loadSkillContext(skillsDir);

  console.log(`\n${"━".repeat(50)}`);
  console.log(`任务 ${taskIndex + 1}：${task.goal.slice(0, 60)}...`);
  console.log(`${"━".repeat(50)}`);

  // Orchestrator 自动选 profile
  const { profile, name: profileName, method } = await orchestrator.selectProfile(
    task,
    skillContext.metas,
  );
  console.log(`[orchestrator] 选定 profile=${profileName} via=${method}\n`);

  // 执行 loop
  const result = await engine.run(task, skillContext, profile, stateCapture, TOOLS);

  console.log(`\n退出原因: ${result.exitReason} | 迭代: ${result.iterations} | 工具: ${result.totalToolCalls} | Checkpoint: ${result.checkpointsPassed}`);
  console.log(`最终输出:\n${result.finalResponse.slice(0, 300)}${result.finalResponse.length > 300 ? "\n..." : ""}`);

  // 保存轨迹
  await saveTrajectory(result.trajectory, skillsDir);

  // 学习 loop（仅 convergent-exec 的成功轨迹触发，发散轨迹价值较低）
  if (result.exitReason === "success" && result.trajectory.skillsUsed.length > 0) {
    const learningResult = await learner.learn(result.trajectory, skillsDir, skillBodies);
    console.log(formatLearningResult(learningResult));
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────

async function main() {
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const skillsDir = join(__dirname, "../../../skills");

  console.log("=== KeiGent Engine：Orchestrator 自动调度全量闭环 ===\n");

  // 加载 skill 库
  const skillContext0 = await loadSkillContext(skillsDir);
  console.log(`[init] 加载了 ${skillContext0.metas.length} 个 skill`);

  // 预加载 skill bodies
  const skillBodies = new Map<string, string>();
  for (const meta of skillContext0.metas) {
    const body = await skillContext0.loadBody(meta.name);
    if (body) skillBodies.set(meta.name, body);
  }

  const memoryDir = join(skillsDir, ".keigent", "memory");
  const engine = new LoopEngine({ model, apiKey: API_KEY, maxIterations: 8, registry });
  const orchestrator = new Orchestrator({
    model,
    apiKey: API_KEY,
    registry: makeRegistry({ model, apiKey: API_KEY, memoryDir }),
  });
  const learner = new Learner(model, API_KEY);
  const stateCapture = new PlaywrightStateCapture();

  // 先演示 Orchestrator 对三个任务的分类决策（不实际执行，快速验证分类准确性）
  console.log("\n【Orchestrator 分类预览】\n");
  for (const [i, task] of TEST_TASKS.entries()) {
    const { name, method } = await orchestrator.selectProfile(task, skillContext0.metas);
    console.log(`任务 ${i + 1}: profile=${name} (${method})`);
    console.log(`  目标: ${task.goal.slice(0, 70)}`);
    console.log(`  依据: successDef=${!!task.successDef} url=${/https?:\/\//.test(task.goal)} openWords=${/调研|分析|了解|探索|研究/.test(task.goal)}\n`);
  }

  // 执行第一个任务（执行型，完整闭环演示）
  console.log("\n【完整执行闭环：任务 1（执行型）】");
  await runTaskWithOrchestration(
    TEST_TASKS[0]!,
    engine,
    orchestrator,
    learner,
    stateCapture,
    skillsDir,
    skillBodies,
    0,
  );
}

main()
  .catch((err) => {
    console.error("错误:", err);
  })
  .finally(() => {
    closeBrowser().then(() => process.exit(0));
  });
