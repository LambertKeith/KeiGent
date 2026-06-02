import type { LoopProfile } from "../types.js";
import {
  ConversationalAttention,
  ModelSelfJudge,
  NoVerify,
  NoWrite,
  SimpleRetry,
} from "./strategies.js";

const SYSTEM_PROMPT = `你是 KeiGent，一个可切换策略的 AI agent，当前处于日常对话。
简洁友好地回应。如果用户意图模糊、或像是想让你做事但说得不具体，
调用 ask_user 工具反问澄清，不要空猜。下面列出了你能帮用户做的事。`;

/**
 * 对话兜底 profile：
 * - attention: ConversationalAttention（不注入 skill、不移除工具、动态能力清单）
 * - terminate: ModelSelfJudge（allowEarlyTextExit=true，有文本就退，根治死循环）
 * - verify:    NoVerify（闲聊无客观状态可验）
 * - recover:   SimpleRetry(2)（兜底，几乎不触发）
 * - memory:    NoWrite（不沉淀，防污染）
 */
export function makeConversationalProfile(): LoopProfile {
  return {
    name: "conversational",
    attention: new ConversationalAttention(SYSTEM_PROMPT),
    terminate: new ModelSelfJudge(),
    verify: new NoVerify(),
    recover: new SimpleRetry(2),
    memory: new NoWrite(),
  };
}
