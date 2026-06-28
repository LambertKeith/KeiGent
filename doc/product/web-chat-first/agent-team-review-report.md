# Web Chat-First Agent Team Review Report

> 日期：2026-06-24
>
> 范围：需求文档、开发规范、验收规范、测试用例、第一阶段 Chat-first Web 实现。

## 1. 评审组织

本轮按用户要求组织了多角色 agent team 评审：

| 角色 | 评审重点 |
|---|---|
| 产品需求评审 | Chat-first 是否准确回应“使用入口与审计入口分离” |
| 前端架构评审 | Web 最小改造路径、路由/nav/main/SSE 风险 |
| 测试验收评审 | 单元测试、规范性验证、浏览器验收缺口 |
| 实现审阅 | 当前 patch 是否破坏 Runs 审计能力或产生交互回归 |

## 2. 关键意见与处理

### 2.1 Chat 不应暴露 raw inspector

意见：默认 Chat HTML 里不应包含 `Selected event inspector` 或 `raw-inspector`。

处理：Chat 不再直接渲染完整 `LiveConsole`，改为轻量 timeline disclosure；完整 raw inspector 保留在 Runs/审计面。

验证：

- `packages/web/src/__tests__/chat-workbench.test.ts`
- `corepack pnpm --filter @keigent/web test`

### 2.2 完成后不应自动跳离 Chat

意见：`run_finished` 后自动跳转 `#runs/:id` 会破坏 Chat-first；用户应留在 Chat，通过 `Open Run Detail` 主动进入审计。

处理：去掉自动 hash 跳转。SSE 更新按当前 hash 重渲染，用户在 Runs/Settings/Skills 时不会被强制拉回 Chat。

验证：

- `packages/web/src/main.ts`
- `packages/web/src/__tests__/chat-workbench.test.ts`

### 2.3 Chat 初始态不应使用 demo 成功 run

意见：首次打开 Chat 不能显示 `hello.txt created` 这类 demo replay 完成态。

处理：Chat 初始 run 改为空 draft/live 输入态；demo RunRecords 仅用于 Runs fallback。

验证：

- `packages/web/src/main.ts`
- `packages/web/src/__tests__/chat-workbench.test.ts`

### 2.4 Chat 需要显式状态模型

意见：字符串驱动的 `statusLabel` 不足以覆盖 `starting`、`running`、`failed`、`degraded`、审批和 needs review。

处理：新增 `packages/web/src/chat/model.ts`，显式定义 Chat 状态，并覆盖 approval、budget、escalation、RunRecord evidence。

验证：

- `packages/web/src/__tests__/chat-workbench.test.ts`

### 2.5 Evidence summary 不能只靠 final text

意见：Chat 完成态若只展示 final response，会冲突于“Final text 不是成功证据”。

处理：需求/开发/验收文档明确 evidence summary 事实源优先级：RunRecord 优先，live event 计数仅作为临时 summary；实现接入 `runRecord` 时使用 RunRecord evidence/trust/proof boundary 派生摘要。

验证：

- `doc/product/14-web-chat-first-workbench-requirements.md`
- `doc/product/web-chat-first/development-spec.md`
- `doc/product/web-chat-first/acceptance-spec.md`
- `packages/web/src/__tests__/chat-workbench.test.ts`

### 2.6 Dashboard/Config 不能继续做一级入口

意见：P0 主导航必须只保留 `Chat / Runs / Skills / Settings`。

处理：主导航改为四项；旧 `#conversation` 兼容到 Chat，旧 `#config`、`#dashboard`、`#eval/...` 兼容到 Settings。

验证：

- `packages/web/src/__tests__/hash-route.test.ts`
- `packages/web/src/__tests__/nav.test.ts`

## 3. 未进入 P0 的事项

- Web 内 approve/deny 审批操作：P0 只展示需要人工处理，不实现审批动作。
- 完整 Developer 一级导航：P0 只保留 Settings 内高级 Eval 子区和 Runs 审计面。
- 大型前端框架迁移：当前保持 Vite + TypeScript + HTML string renderer。
- 全量浏览器自动化 E2E：P0 以单元测试、类型检查、build、手动/浏览器截图验收为主。

## 4. 当前验收命令

```bash
corepack pnpm --filter @keigent/web check
corepack pnpm --filter @keigent/web test
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/web-api-server.test.ts src/__tests__/web-command.test.ts
corepack pnpm -r --if-present build
```

## 5. 复核补充

- API connection 状态必须来自 `/api/health`，不得仅凭 `VITE_KEIGENT_API_URL` 判断 connected。
- Chat 与 Settings 共享同一连接状态；health 失败时 Chat 禁用 Run，Settings 显示 Local API not connected。
