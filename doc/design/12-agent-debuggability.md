# Agent Debuggability Design

> 目标：让每次 KeiGent run 都能回答“为什么这么做”，并且解释来自结构化事实，而不是模型事后编故事。

## 1. 调试层级

| 层 | 要回答的问题 | 事实源 |
|---|---|---|
| Routing | 为什么选这个 profile/mode？ | ruleId、signals、guardApplied |
| Attention | 为什么注入这些 skill/context？ | skill scores、attention strategy |
| Action | 为什么调用这个 tool？ | iteration event、tool args、permission decision |
| Verification | 为什么判成功/失败？ | checkpoint、captured evidence、verdict |
| Recovery | 为什么重试/升级/停止？ | recover strategy event、failure code |
| Learning | 为什么学习或不学习？ | trajectory label、learner proposal、policy |

## 2. 必需事件字段

Routing event：

```ts
{
  selectedProfile: string;
  via: "rule" | "llm" | "guard";
  ruleId?: string;
  signals: string[];
  guardApplied?: boolean;
  rationale: string;
}
```

Skill match event：

```ts
{
  matched: Array<{ name: string; score: number; signals: string[]; injected: boolean }>;
  excluded: Array<{ name: string; reason: string }>;
}
```

Verification event：

```ts
{
  checkpointId: string;
  assertions: string[];
  evidenceRefs: string[];
  verdict: "passed" | "failed" | "unverified";
  rationale: string;
}
```

## 3. UI 展示要求

- 默认展示人类可读摘要。
- Inspector 展示 redacted raw JSON。
- 缺失解释显示 `not recorded`，不能生成猜测。
- rationale/signals 原样保存，UI 不改写含义。

## 4. Anti-fiction 规则

禁止：

- run 结束后让 LLM 总结“它为什么这么做”作为事实。
- 将 tool args 中的 secret 展示出来。
- 把没有记录的 guard/rule 推断出来。
- 因为 final answer 合理就补写成功 evidence。

## 5. 验收标准

- 每个 run 至少可追踪 routing、skills、tool、terminal result。
- verified run 可追踪 checkpoint/verdict/evidence。
- workflow run 可追踪 parent/child event 映射。
- failed run 能指出失败层级与 next action。
- dashboard 能筛选 guardApplied、profile mismatch、tool failure、verification failure。

## 6. Debug Bundle

Debug bundle 是可交付给开发者的本地目录，不是自动健康证明。

当前 CLI 入口：

```bash
corepack pnpm --filter @keigent/cli start runs debug-bundle <run-id>
corepack pnpm --filter @keigent/cli start runs debug-bundle <run-id> --out /tmp/keigent-debug --compact
```

当前 bundle 内容：

| 文件 | 来源 | 说明 |
|---|---|---|
| `record.json` | RunRecord | redacted run 产品事实源 |
| `trajectory.json` | `trajectory` artifact | 存在时复制并 redaction |
| `workflow-trajectory.json` | `workflow_trajectory` artifact | 存在时复制并 redaction |
| `eval-report.json` | `eval_report` artifact | 存在时复制并 redaction |
| `replay-report.json` | `replay_report` artifact | 存在时复制并 redaction |
| `redacted-config.json` | 显式传入 config | 默认 `{}`，禁止 raw secret |
| `tool-summary.json` | RunRecord execution/tools/approvals | 工具调用与审批摘要 |
| `observability-summary.json` | RunRecord execution/workflow/failures | timeline、budget、provider usage/cost、recovery、timeout/abort、latency 记录状态与 failure taxonomy |
| `failure-summary.md` | RunRecord evidence/failures/nextAction | 人类可读失败摘要 |

Redaction 规则：

- 所有写入 bundle 的 JSON 和文本必须经过 `redaction.ts`。
- secret-like 字符串数组也必须被 redacted。
- artifact 缺失时进入 `missingArtifacts`，不得让整个导出失败。
- `observability-summary.json` 对缺失的 tool/model latency 明确写 `not_recorded`，不得推测耗时。
- provider usage/cost 只展示供应商响应中已报告的 token 和 cost；自定义 endpoint 可通过本地 `modelPricing` 让 pi-ai 产生成本；`pricing_not_configured` 不得被展示成免费或成本为零的健康信号。

当前不提供：

- zip/tar 打包；
- 自动上传；
- 自动复现；
- 自动 judge 结论。
