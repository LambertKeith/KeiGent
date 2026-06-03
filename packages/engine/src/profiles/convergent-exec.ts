import type { LoopProfile } from "../types.js";
import {
  NarrowAttention,
  NoWrite,
  SelfCheck,
  SimpleRetry,
  SkillWorkflowDone,
} from "./strategies.js";

const SYSTEM_PROMPT = `你是一个精确执行任务的 AI 助手。
严格按照 skill 工作流描述的步骤执行，每完成一个步骤后调用 request_verification 工具声明完成。
每次只调用一个工具，等待结果后再继续。不要跳过步骤。`;

/**
 * 收敛执行 profile（spec §7.1 CONVERGENT_EXEC）：
 * - attention: NarrowAttention，严格匹配 1 篇 skill，每步只暴露当前步骤工具
 * - terminate: SkillWorkflowDone（skill 工作流步骤走完）
 * - verify:    SelfCheck（执行者自检，轻量；非独立裁判）
 * - recover:   SimpleRetry（简单重试）
 * - memory:    NoWrite（执行不写记忆）
 *
 * 与 convergent-verified 的区别：本 profile 用轻量自检，适合流程明确、
 * 失败代价低的执行任务；难量化、高代价任务用 convergent-verified（独立裁判）。
 */
export function makeConvergentExecProfile(requiredCheckpoints = 2): LoopProfile {
  return {
    name: "convergent-exec",
    attention: new NarrowAttention(SYSTEM_PROMPT, [
      // step 0: 执行抓取工具
      ["fetch_url", "get_current_time"],
      // step 1: 不给工具——让模型自由输出总结文本
      [],
      // step 2: 给 request_verification，让模型发 checkpoint
      ["request_verification"],
      // step 3+: 最终 checkpoint
      ["request_verification"],
    ]),
    terminate: new SkillWorkflowDone(requiredCheckpoints),
    verify: new SelfCheck(),
    recover: new SimpleRetry(3),
    memory: new NoWrite(),
  };
}
