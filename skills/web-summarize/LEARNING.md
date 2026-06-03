

---
<!-- trajectory: 9d4ca019-6a2c-409b-8468-465e7b9652cb | 2026-06-02T05:54:15.015Z -->

## Learned Workflow Refinements

> **理由**: 本次执行在总结通过验证后又多次重复输出相同总结，并额外声明完成。明确“只输出一次”和验证通过后的停止行为，可减少冗余迭代。

### Step 2: Summarize

Read the fetched content and produce the final answer **once** using the following structure:

- **标题**：页面标题
- **一句话概述**：不超过 30 字
- **要点**：3-5 条关键信息（每条 1-2 句）
- **原文链接**：原始 URL

After producing the summary, call `request_verification` with `checkpoint_desc="总结已完成"`. If verification passes, do not repeat the summary or add another completion message; return the already produced summary as the final output.

## Learned Guidelines

> **理由**: 轨迹显示最终前出现了多次重复总结和完成声明，虽未影响正确性，但降低输出质量并浪费步骤。增加执行规范能约束最终答案格式。

- 避免重复输出：同一份总结只应出现一次；验证通过后不要再追加“已完成”类说明或再次粘贴总结。
- 保持最终输出干净：最终答案应只包含规定的总结结构，除非需要报告错误。

## Execution Examples

> **理由**: 本次抓取和摘要内容准确，适合作为简短网页摘要的正向示例；同时示例可帮助未来保持结构化输出。

### 成功示例：example.com

输入 URL：`https://example.com`

期望输出：

- **标题**：Example Domain
- **一句话概述**：示例文档用保留域名。
- **要点**：
  - 该页面说明 example.com 是用于文档示例的域名。
  - 使用该域名无需申请许可，适合在说明文档或示例中引用。
  - 页面提醒不要将其用于实际运营场景。
  - 页面提供了“Learn more”链接以了解更多信息。
- **原文链接**：https://example.com


---
<!-- trajectory: e7216e38-f623-48d1-9ce1-15c5c0a38e26 | 2026-06-02T06:29:18.792Z -->

## Learned Workflow Refinements

> **理由**: 本次轨迹中模型把抓取后的 verification 与摘要内容混在同一次输出中，随后最终输出仅为“已完成”，导致用户没有收到结构化摘要。需要明确工具调用与最终内容的顺序及最终输出要求。

### Verification call ordering

When a checkpoint is required after producing the final summary, call `request_verification` **after** the complete summary has been emitted, not before or interleaved with it. Ensure the final user-visible response remains the structured summary itself; do not replace it with a generic completion message such as “已完成”。

## Learned Guidelines

> **理由**: 执行中出现了将 tool_call 标记直接输出在文本里、且最终答案缺失摘要的问题。增加约束可减少工具调用格式污染和最终响应不完整。

- The final answer to the user must contain the structured summary (`标题`、`一句话概述`、`要点`、`原文链接`). Avoid final-only status messages like “已完成”。
- Do not emit a `request_verification` tool call as literal markup in normal text. Use the actual tool mechanism where available, and keep verification calls separate from summary prose.

## Execution Examples

> **理由**: 这是一个抓取成功但最终输出不理想的简单案例，适合保留为期望输出示例，帮助模型学习最终答案应包含完整摘要。

### Example: summarize https://example.com

Input URL: `https://example.com`

Expected final summary:

- **标题**：Example Domain
- **一句话概述**：示例用途的保留域名。
- **要点**：
  - 该页面说明 example.com 是用于文档示例的域名。
  - 使用该域名不需要额外许可，适合在示例材料中引用。
  - 页面提醒不要将该域名用于实际业务或运营场景。
  - 页面提供 “Learn more” 链接以了解更多信息。
- **原文链接**：https://example.com
