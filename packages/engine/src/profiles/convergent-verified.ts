import type { Api, Model } from "@earendil-works/pi-ai";
import type { LoopProfile } from "../types.js";
import {
  DiagnoseRepair,
  NarrowAttention,
  NoWrite,
  SuccessDefMatched,
} from "./strategies.js";
import { AdversarialJudge } from "./adversarial-judge.js";

const SYSTEM_PROMPT = `你是一个精确执行任务的 AI 助手。
严格按照 skill 工作流描述的步骤执行，每完成一个步骤后调用 request_verification 工具声明完成。
每次只调用一个工具，等待结果后再继续。不要跳过步骤。`;

/**
 * 验证收敛执行 profile（最高可靠性）：
 * - attention:  收敛，步骤化工具控制
 * - terminate:  2 个 checkpoint 通过才退出
 * - verify:     AdversarialJudge（真实独立裁判，多数投票）
 * - recover:    DiagnoseRepair（裁判证据驱动的修复，多次失败升级）
 * - memory:     NoWrite（执行不写记忆）
 */
export function makeConvergentVerifiedProfile(
  model: Model<Api>,
  apiKey: string,
  opts: {
    requiredCheckpoints?: number;
    voters?: number;
    threshold?: number;
  } = {},
): LoopProfile {
  const { requiredCheckpoints = 2, voters = 3, threshold = 2 } = opts;

  return {
    name: "convergent-verified",
    attention: new NarrowAttention(SYSTEM_PROMPT, [
      ["fetch_url", "get_current_time"],
      [],
      ["request_verification"],
      ["request_verification"],
    ]),
    terminate: new SuccessDefMatched(requiredCheckpoints),
    verify: new AdversarialJudge({ model, apiKey, voters, threshold }),
    recover: new DiagnoseRepair(3),
    memory: new NoWrite(),
  };
}
