# Skill Lifecycle and Governance

> 目标：定义 KeiGent 如何安全地创建、匹配、学习、晋升、废弃 skill，避免知识库污染。

## 1. Skill 角色

Skill 是“怎么做”的知识层，不是代码模块，不是成功证据，不拥有权限豁免。引擎仍然负责“怎么验”，ToolRegistry/Policy 仍然负责“能不能做”。

## 2. Skill 状态

| 状态 | 含义 | 可用于执行 | 可被学习更新 |
|---|---|---|---|
| draft | 草稿 | 否/手动 | 否 |
| active | 当前可匹配 | 是 | 需审查 |
| learned-note-only | LEARNING.md 经验 | 否，除非 skill body 明确读取 | 可人工晋升 |
| quarantined | 有风险/冲突 | 否 | 否 |
| deprecated | 已替代 | 否/警告 | 否 |
| promoted | 从学习笔记晋升 | 是 | 需 eval 覆盖 |

## 3. Skill 必备字段

每个正式 skill 应包含：

1. Trigger conditions。
2. Non-goals。
3. Required/allowed tools。
4. Forbidden/dangerous actions。
5. Step sequence。
6. Verification hints，但不能替代 SuccessDef。
7. Common failure modes。
8. Example tasks。
9. Eval coverage references。

## 4. 学习沉淀流程

```text
Trajectory
  -> Learner proposes learning note
  -> LEARNING.md stores observation
  -> Reviewer checks repeatability/risk
  -> Skill patch proposal
  -> Eval case added/updated
  -> Skill promoted/updated
```

失败 run 默认不进入 skill promotion，除非明确标记为 diagnostic learning。

## 5. 匹配治理

匹配结果必须记录：

- skill name
- score/signals
- injected body or metadata only
- excluded skill 与原因
- conflict/override reason

多 skill 冲突时：

1. task successDef 优先于 skill。
2. permission policy 优先于 skill。
3. active skill 优先于 learned-note。
4. 更具体 trigger 优先于泛化 trigger。

## 6. Skill 与 Eval 绑定

新增或重大修改 skill 必须至少新增：

- 一个正向 eval case。
- 一个误触发防回归 case。
- 一个 failure/edge case。

## 7. 验收标准

- LEARNING.md 不自动等于正式 skill。
- skill patch 不得绕过 permission policy。
- skill 匹配原因可在 trajectory/dashboard 中查看。
- deprecated/quarantined skill 不被自动注入。
- 每个 active skill 有 eval coverage 标记。
