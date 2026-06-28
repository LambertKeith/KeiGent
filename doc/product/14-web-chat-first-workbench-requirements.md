# Web Chat-First Workbench Requirements

> 状态：P0 需求草案
>
> 日期：2026-06-24
>
> 适用范围：`packages/web`、`packages/cli/src/web-api-server.ts` 的网页交互面，不改变 `LoopEngine` 核心不变量。

## 1. 背景

当前 Web 已具备 Workbench view model、本地 API/SSE、Live Run Console、Run Detail、Skill Workbench、Eval Dashboard 等 foundation。问题不在审计能力缺失，而在默认交互把审计控制台暴露给普通使用路径。

用户期望是：

```text
输入任务 -> KeiGent 执行 -> 返回结果/状态/下一步 -> 需要时查看证据和审计细节
```

当前页面更接近：

```text
输入任务 -> 立即暴露 timeline / inspector / raw event / debug vocabulary
```

这违背 Chat-first 使用路径。后续重构必须保留 evidence-first 内核，同时把审计复杂度改为按需展开。

## 2. 产品定位

KeiGent Web 是 **Chat-first Agent Workbench**。

- Chat 是默认入口，负责发起任务、查看结果、确认下一步。
- Runs 是审计入口，负责复盘 RunRecord、Evidence、Risk、Approval、Replay。
- Skills 和 Settings 是治理与配置入口。
- Developer 细节默认隐藏，只在高级面板或 Run Detail 中出现。

## 3. 非目标

- 不重写 `LoopEngine`、profile、workflow、ToolRegistry。
- 不删除 RunRecord、timeline、evidence、approval 或 raw redacted inspector。
- 不把 KeiGent 做成无证据的通用聊天机器人。
- 不把审计信息藏到不可达；只改变默认层级。
- 不引入大型前端框架，除非另有明确设计决策和迁移计划。

## 4. 用户与场景

| 用户 | 主要目标 | 默认入口 |
|---|---|---|
| 普通使用者 | 输入任务并拿到可执行结果 | Chat |
| Operator / Reviewer | 判断一次 run 是否可信 | Runs |
| Skill maintainer | 理解 skill 匹配、状态和治理 | Skills |
| 开发者 | 调试事件、配置、eval、raw payload | Developer / advanced panels |

## 5. 信息架构

P0 导航：

```text
Chat / Runs / Skills / Settings
```

P1 可增加：

```text
Developer
```

`Dashboard` 在 P0 不作为默认一级入口；可保留为 Developer/Eval 子入口或暂时隐藏在高级区域。

旧链接兼容：

| 旧链接 | P0 兼容目标 |
|---|---|
| `#conversation` | Chat |
| `#config` | Settings |
| `#dashboard` | Settings |
| `#eval/...` | Settings 内 Eval 子区 |

## 6. Chat 页需求

### 6.1 默认状态

首次进入 Web 必须看到：

- 页面身份：KeiGent。
- 单一主任务输入框。
- 主按钮：`Run`。
- 本地 API 状态。
- 最近 run 或空状态引导。

不得默认展示：

- raw event JSON。
- selected event inspector。
- 完整 timeline。
- 内部 protocol 名称作为主内容。

### 6.2 运行中状态

运行中必须回答：

- 当前任务是什么。
- KeiGent 正在做什么。
- 是否等待用户确认。
- 是否可进入详情。

运行中可以展示简化步骤：

```text
Preparing -> Running -> Checking -> Saving run
```

如果底层事件无法精确映射，必须显示保守状态，不得伪造成功。

### 6.3 完成状态

完成后必须展示：

- 最终结果。
- 状态：succeeded / failed / degraded / needs review。
- 下一步。
- Evidence 摘要。
- `Open Run Detail` 入口。
- `Show execution details` 折叠入口。

Evidence 摘要的事实源优先级：

1. `run_finished.recordId` 对应的 `RunRecord`，通过 `/api/runs` 读取后派生。
2. 如果 RunRecord 尚未刷新成功，则使用 live progress events 的工具、checkpoint、verdict 计数作为临时摘要，并标记为 live session summary。
3. 不得只用 final response 生成可信成功文案。

Chat 完成态最小 evidence 字段：

| 字段 | 来源 | 用途 |
|---|---|---|
| evidenceStatus | RunRecord `evidence.status` 或 live fallback | 区分 passed / failed / insufficient / not_checked |
| passed/total | RunRecord `evidence.passed/total` 或 live verdict 计数 | 展示证据覆盖 |
| trustLabel | RunRecord trust view 或保守派生 | 防止无证据成功 |
| evidenceGaps | RunRecord `proofBoundary.evidenceGaps` | 提醒未证明内容 |
| nextAction | RunRecord `nextAction` / failure nextAction / 保守 fallback | 指导下一步 |

### 6.4 失败状态

失败时必须展示：

- 失败原因。
- 可执行 next action。
- 是否缺 API key / 配置 / 权限 / evidence。
- Run Detail 入口，如果 record 已生成。

失败原因应优先使用结构化 failure summary：

- `failure.code`
- `failure.layer`
- `failure.message`
- `failure.nextAction`

如果只有字符串错误，Chat 必须以保守方式展示为未分类失败，不能把失败归因为模型能力或 agent 成功。

### 6.5 审计折叠

Chat 页可包含高级区域，但默认关闭：

- Execution timeline。
- Tool calls。
- Checkpoints。
- Approvals。
- Raw redacted event JSON。

P0 不实现 Web 内 approve/deny。遇到审批、权限阻断、`child_escalated` 或证据不足时，Chat 只展示 `needs review` / `needs user action`，并引导打开 Run Detail 或 CLI/operator 流程。

## 7. Runs 页需求

Runs 是审计主场。它必须保留并继续强化现有能力：

- Run list。
- Run summary。
- Route and skills。
- Evidence。
- Risk and approvals。
- Tools and budget。
- Replay and artifacts。
- Failures。
- Proof boundary。
- Raw redacted record。

Runs 页面允许更高信息密度，但仍必须围绕人类问题组织：

- 它做了什么？
- 它凭什么说成功？
- 有什么风险？
- 为什么失败？
- 下一步是什么？

## 8. Settings 页需求

Settings P0 可以先聚合已有 Config view 和诊断入口，至少展示：

- API connection 状态。
- model protocol / base URL / model ID 的来源。
- doctor issue 摘要。
- 安全脱敏后的配置来源。

配置编辑不是 P0 必须项。

## 9. Skills 页需求

保留现有 Skill Workbench，但文案应面向治理：

- executable / needs-review / blocked / deprecated。
- matched / injected / excluded reason。
- eval coverage。
- recent matches。
- learning notes。

## 10. 视觉与交互原则

本项目已安装开发期 skill：`.codex/skills/frontend-design/SKILL.md`。

重构 Web 前必须遵循：

- 先定义页面单一任务。
- Chat 默认简单，Audit 按需展开。
- Operational UI：安静、精确、可扫描。
- 不做营销 hero。
- 不用装饰性渐变球、卡片套卡片、过大标题。
- 移动端与桌面端文本不得溢出或重叠。

## 11. 验收要求

P0 完成必须满足：

- 默认路由进入 Chat。
- `Conversation` 命名不再作为主导航出现。
- Chat 首屏出现任务输入框与 Run 按钮。
- Chat 首屏不出现 raw event inspector。
- 没有本地 API 时，Chat 明确显示连接不可用和下一步。
- 有本地 API 时，可发起 run 并接收 SSE 更新。
- run 完成后展示自然语言结果、下一步和 evidence summary。
- 无 RunRecord 时 evidence summary 必须标记为 live summary，不得把 final text 当成功证据。
- 审批、权限阻断、child escalation、证据不足必须显示 needs review / needs user action。
- run 完成后提供 Run Detail 入口，但不自动离开 Chat。
- Runs 页面保留完整审计能力。
- 单元测试覆盖路由、导航、Chat view model、Web run handoff、折叠审计。
- `corepack pnpm --filter @keigent/web check` 和 `test` 通过。
