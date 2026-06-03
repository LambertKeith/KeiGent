import { vlog, vwarn } from "./logger.js";
import type { ToolCall } from "@earendil-works/pi-ai";

/**
 * 修复 pi-ai 流式解析 gpt-5.5 并发工具调用时的 bug。
 *
 * bug 固定模式：一次工具调用被拆成两个互补的 ToolCall block：
 *   - block A: id=正常, name=正常, arguments={}        ← 元数据正确，内容为空
 *   - block B: id="",   name="",   arguments={有内容}  ← 元数据为空，内容正确
 *
 * 修复策略（合并，非简单过滤）：
 *   - 把 block B 的 arguments 补到 block A 的空 args 上（取 A 的 id/name + B 的 args）
 *   - 丢弃合并后多余的 id="" 幽灵块（它们若写入历史会触发 API 的 call_id 校验错误）
 *   - 无幽灵时（withoutId 为空）原样返回
 *
 * 对 engine（需要 id 正常 + args 正确）和 learner（按 args 字段识别工具）都正确。
 */
export function deduplicateToolCalls<T extends { type: string }>(
  content: T[],
): T[] {
  const toolCalls = content.filter((c) => c.type === "toolCall") as unknown as ToolCall[];
  const nonToolCalls = content.filter((c) => c.type !== "toolCall");

  if (toolCalls.length === 0) return content;

  // gpt-5.5 + pi-ai 的并发 toolCall bug 固定模式：
  //   block A: id=正常, name=正常,  arguments={}       ← 元数据正确，内容为空
  //   block B: id="",   name="",    arguments={有内容} ← 元数据为空，内容正确
  //
  // 修复策略：当检测到 "有 id 但 args 为空" + "没有 id 但 args 有内容" 的配对时，
  // 合并成一个 ToolCall：取 block A 的 id/name，取 block B 的 arguments。
  // 无法配对时保留所有有 id 的 block，丢弃 id="" 的 block。

  // 分为两组
  const withId = toolCalls.filter((tc) => tc.id !== "");
  const withoutId = toolCalls.filter((tc) => tc.id === "");

  if (withoutId.length === 0) {
    // 无幽灵，直接返回（正常情况）
    return content;
  }

  // 合并：把 withoutId 里的 args 补充到 withId 里对应的空 args 上
  // 配对原则：withId 里 args 为空（{}）的，对应一个 withoutId 里 args 有内容的
  let withoutIdIdx = 0;
  const merged: ToolCall[] = withId.map((tc) => {
    const args = tc.arguments as Record<string, unknown>;
    const isEmpty = Object.keys(args).length === 0;
    if (isEmpty && withoutIdIdx < withoutId.length) {
      const donor = withoutId[withoutIdIdx++]!;
      const donorArgs = donor.arguments as Record<string, unknown>;
      if (Object.keys(donorArgs).length > 0) {
        vwarn(`[utils] 合并幽灵 ToolCall：id="${tc.id}" name="${tc.name}" ← args from ghost (${Object.keys(donorArgs).join(",")})`);
        return { ...tc, arguments: donorArgs };
      }
    }
    return tc;
  });

  const ghostCount = toolCalls.length - merged.length;
  if (ghostCount > 0 || withoutId.length > 0) {
    vwarn(`[utils] 处理了 ${withoutId.length} 个幽灵 ToolCall（pi-ai gpt-5.5 bug）`);
  }

  return [
    ...nonToolCalls,
    ...merged as unknown as T[],
  ];
}

/**
 * 从 content 块里提取所有有效工具调用。
 * "有效" = deduplicateToolCalls 过滤后剩余的 toolCall 块。
 *
 * 注意：结果中可能包含 name="" 但 args 有内容的块（learner 场景）。
 * 调用方按需用 name 或 args 里的字段来识别工具。
 */
export function extractToolCalls(
  content: { type: string }[],
): ToolCall[] {
  const deduped = deduplicateToolCalls(content);
  return deduped.filter((c): c is ToolCall => c.type === "toolCall");
}

/**
 * 剥离模型输出里的思考块（<think>...</think>）。
 * gpt-5.5 等模型有时把 reasoning 内容用 <think> 标签包裹混入正文，
 * 这些是内部思考，不该作为最终回复展示给用户。
 */
export function stripThinkBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    // 未闭合的 <think>（流式截断）——丢弃从 <think> 到结尾
    .replace(/<think>[\s\S]*$/i, "")
    .trim();
}
