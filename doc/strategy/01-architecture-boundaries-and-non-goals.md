# Architecture Boundaries and Non-goals

> 目标：防止 KeiGent 被技术诱惑拉散，明确现在做、以后做、坚决不做的系统边界。

## 1. 必须守住的原则

1. **一个 LoopEngine**：行为差异来自 profile，不复制多个 loop。
2. **Skill 决定怎么做**：skill 是自然语言工作流知识。
3. **Engine 决定怎么验**：successDef/checkpoint/verdict 是成功事实源。
4. **Final text 不是成功证据**。
5. **Workflow 不替代 LoopEngine**：它是 parent envelope。
6. **Eval 不新增 agent 行为**：只运行、收集、评分、报告。
7. **Verifier 默认无副作用权限**。
8. **Protocol-first model config**：不内置 relay 品牌入口。
9. **执行中间状态不污染正式知识库**。
10. **高风险副作用需要人类审批和证据**。

## 2. 短期不做

| 方向 | 为什么不做 |
|---|---|
| 自由 JS workflow 脚本 | 会绕过 policy/evidence，扩大 attack surface |
| 任意 fanout swarm | 还没有 child isolation 与 judge rubric |
| dynamic LLM planner | 容易绕过边界，先要 workflow policy |
| remote multi-user SaaS | 当前定位是本地 runtime/workbench |
| plugin marketplace | skill/tool governance 未成熟 |
| 自动晋升正式 skill | 会污染知识库 |
| 无审批危险操作 | 与 evidence-first/governance 冲突 |
| 品牌化 relay 配置 | 破坏 provider-neutral |

## 3. 什么时候可以做复杂能力

一个复杂能力进入主线前必须具备：

- 明确用户场景。
- 明确非目标。
- policy enforcement。
- success/evidence model。
- eval fixtures。
- dashboard/replay 可观测性。
- failure semantics。
- rollback 或人工接管路径。

## 4. 提案分流规则

任何新提案必须分类为：

1. **Now**：修正核心闭环、证据、权限、回归的缺口。
2. **Next**：已有设计，等待 eval/policy/UI 支撑。
3. **Later**：产品价值可能存在，但当前会带来架构发散。
4. **No**：违背核心原则或安全边界。

## 5. 验收标准

- 新设计文档必须声明其所属 maturity layer。
- 新功能必须能说明对应用户问题和验收证据。
- 不允许以“技术上可行/很酷”为主线理由。
- 与本文件冲突的实现必须先更新边界文档并说明理由。
