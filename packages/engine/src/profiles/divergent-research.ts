import type { LoopProfile } from "../types.js";
import {
  ModelSelfJudge,
  NoVerify,
  SimpleRetry,
  WideAttention,
  WriteThrough,
} from "./strategies.js";

const SYSTEM_PROMPT = `你是一个擅长调研和知识沉淀的 AI 助手。
自由地探索任务，综合多个角度，给出全面的分析和总结。
使用所有可用工具来收集信息，不需要逐步验证。`;

/**
 * 发散研究 profile：
 * - attention: 宽松匹配所有 skill，暴露所有工具
 * - terminate: 模型自判（stopReason=stop 时退出）
 * - verify: NoVerify（调研不需要强验证）
 * - recover: SimpleRetry（简单重试）
 * - memory: WriteThrough（沉淀知识到 memory.jsonl）
 */
export function makeDivergentResearchProfile(
  memoryDir = ".keigent/memory",
  skillsUsed: string[] = [],
): LoopProfile {
  return {
    name: "divergent-research",
    attention: new WideAttention(SYSTEM_PROMPT),
    terminate: new ModelSelfJudge(),
    verify: new NoVerify(),
    recover: new SimpleRetry(2),
    memory: new WriteThrough(memoryDir, skillsUsed),
  };
}
