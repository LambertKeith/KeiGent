import { persistWorkflowAndLearn } from "./post-run.js";
import { renderWorkflowProgress, printResponse, printError, printInfo } from "./renderer.js";
import { executeWorkflowTask } from "./workflow-execution.js";

/**
 * 单次执行模式：keigent run "任务" 或 keigent "任务"。
 * 非交互场景（脚本、CI、管道）用。需要审批的高风险工具默认拒绝。
 */
export async function runOnce(goal: string): Promise<void> {
  try {
    const { result, config, learner, skillBodies } = await executeWorkflowTask({
      goal,
      onProgress: renderWorkflowProgress,
      onReady(summary) {
        printInfo(`KeiGent 单次执行 | model=${summary.modelId} | skills=${summary.skillCount}`);
      },
    });
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
  }
}
