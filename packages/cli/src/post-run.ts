import {
  saveTrajectory,
  saveWorkflowTrajectory,
  formatLearningResult,
  type Learner,
  type LoopResult,
  type WorkflowResult,
} from "@keigent/engine";
import { join } from "node:path";
import type { KeigentConfig } from "./config.js";
import { printInfo, printError } from "./renderer.js";

/**
 * 任务执行后的统一收尾：持久化轨迹 +（成功且用到 skill 时）跑学习 loop。
 * repl 与 run-once 两个入口共用，避免逻辑漂移。
 */
export async function persistAndLearn(
  result: LoopResult,
  config: KeigentConfig,
  learner: Learner,
  skillBodies: Map<string, string>,
): Promise<void> {
  await saveTrajectory(result.trajectory, config.skillsDir).catch(() => {});

  if (result.exitReason === "success" && result.trajectory.skillsUsed.length > 0) {
    printInfo("（学习 loop 分析中…）");
    const learning = await learner
      .learn(result.trajectory, config.skillsDir, skillBodies)
      .catch((e) => {
        printError(`学习 loop 失败: ${e}`);
        return null;
      });
    if (learning) printInfo(formatLearningResult(learning).split("\n")[0] ?? "");
  }
}

export async function persistWorkflowAndLearn(
  result: WorkflowResult,
  config: KeigentConfig,
  learner: Learner,
  skillBodies: Map<string, string>,
): Promise<void> {
  await saveWorkflowTrajectory(result.trajectory, { dir: join(config.skillsDir, ".trajectories", "workflows") }).catch(() => {});

  if (result.exitReason !== "success") return;

  const workerResult = result.childRuns.find((child) => child.role === "worker")?.result;
  if (!workerResult) return;

  await persistAndLearn(workerResult, config, learner, skillBodies);
}
