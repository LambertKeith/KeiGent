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
