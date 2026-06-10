import {
  buildRunRecordFromWorkflowResult,
  saveTrajectory,
  saveRunRecord,
  saveWorkflowTrajectory,
  formatLearningResult,
  summarizeRunRecord,
  type Learner,
  type LoopResult,
  type RunRecord,
  type RunTaskSource,
  type WorkflowResult,
} from "@keigent/engine";
import { join } from "node:path";
import { KEIGENT_HOME, type KeigentConfig } from "./config.js";
import { printInfo, printError } from "./renderer.js";

export interface PersistLearningOptions {
  silent?: boolean;
}

export interface PersistWorkflowOptions extends PersistLearningOptions {
  taskSource?: RunTaskSource;
  runsDir?: string;
}

export interface PersistWorkflowResult {
  record: RunRecord;
  recordPath?: string;
  workflowTrajectoryPath?: string;
}

/**
 * 任务执行后的统一收尾：持久化轨迹 +（成功且用到 skill 时）跑学习 loop。
 * repl 与 run-once 两个入口共用，避免逻辑漂移。
 */
export async function persistAndLearn(
  result: LoopResult,
  config: KeigentConfig,
  learner: Learner,
  skillBodies: Map<string, string>,
  options: PersistLearningOptions = {},
): Promise<void> {
  await saveTrajectory(result.trajectory, config.skillsDir).catch(() => {});

  if (result.exitReason === "success" && result.trajectory.skillsUsed.length > 0) {
    if (!options.silent) printInfo("（学习 loop 分析中…）");
    const learning = await learner
      .learn(result.trajectory, config.skillsDir, skillBodies)
      .catch((e) => {
        if (!options.silent) printError(`学习 loop 失败: ${e}`);
        return null;
      });
    if (learning && !options.silent) printInfo(formatLearningResult(learning).split("\n")[0] ?? "");
  }
}

export async function persistWorkflowAndLearn(
  result: WorkflowResult,
  config: KeigentConfig,
  learner: Learner,
  skillBodies: Map<string, string>,
  options: PersistWorkflowOptions = {},
): Promise<PersistWorkflowResult> {
  const workflowTrajectoryPath = await saveWorkflowTrajectory(result.trajectory, { dir: join(config.skillsDir, ".trajectories", "workflows") }).catch(() => undefined);
  const record = buildRunRecordFromWorkflowResult(result, {
    id: `run_${result.workflowId}`,
    taskSource: options.taskSource ?? "cli",
    workflowTrajectoryPath,
  });
  const recordPath = await saveRunRecord(record, { runsDir: options.runsDir ?? join(KEIGENT_HOME, "runs") }).catch((e) => {
    if (!options.silent) printError(`保存 run record 失败: ${e}`);
    return undefined;
  });
  if (!options.silent) printInfo(summarizeRunRecord(record));

  if (result.exitReason !== "success") return { record, recordPath, workflowTrajectoryPath };

  const workerResult = result.childRuns.find((child) => child.role === "worker")?.result;
  if (!workerResult) return { record, recordPath, workflowTrajectoryPath };

  await persistAndLearn(workerResult, config, learner, skillBodies, options);
  return { record, recordPath, workflowTrajectoryPath };
}
