# Web Chat-First Test Cases

> 状态：P0 测试用例
>
> 日期：2026-06-24

## 1. Unit Tests

### Route

- `parseHashRoute("")` -> `{ section: "chat" }`
- `parseHashRoute("#chat")` -> `{ section: "chat" }`
- `parseHashRoute("#conversation")` -> `{ section: "chat" }`
- `parseHashRoute("#runs/run_123")` -> `{ section: "runs", selectedRunId: "run_123" }`
- `hashForSection("chat")` -> `#chat`

### Navigation

- 主导航包含 `Chat`。
- 主导航不包含 `Conversation`。
- `Chat` 描述面向任务输入，不提 raw event inspector。

### Chat Model

- idle：无事件，展示 composer 和空状态。
- api unavailable：Run disabled 或状态提示明确。
- starting：live run 已提交但无事件时显示 Starting，不显示 Ready。
- running：收到 tool/checkpoint/progress event 后展示 running summary。
- succeeded：`done(success)` 展示 final response。
- failed：`done(error)` 展示 failure reason 和 next action。
- degraded：`done(budget_exceeded|max_iterations)` 不得显示可信成功。
- needs review：`child_escalated|escalated` 或 evidence insufficient 时显示 needs review。
- audit handoff：`recordId` 生成 `#runs/<recordId>` link。
- evidence summary：有 RunRecord 时使用 RunRecord evidence；无 RunRecord 时显示 live summary。

### Chat Render

- 默认 HTML 包含 `Task`/任务输入与 `Run`。
- 默认 HTML 不包含 `Selected event inspector`。
- 默认 HTML 不包含 raw JSON `<pre class="raw-inspector">`。
- 展开 advanced details 后包含轻量 timeline，但不包含 raw inspector。
- API unavailable 显示 `Local API not connected` 或等价修复提示。

### Web Run Stream

- `run_started` 不生成 done。
- `workflow_event(child_event)` 生成 progress event。
- `run_finished(recordId)` 生成 done + audit handoff。
- `run_error` 生成 failed done。

## 2. Integration Tests

### API Client

- `fetchHealth` 读取 `/api/health`，只有返回 `status: "ok"` 时连接状态为 connected。
- `/api/health` 失败时，Chat 与 Settings 均不得显示 connected。
- `fetchRunStore` 仍读取 `/api/runs`。
- `startRun` 仍 POST `/api/runs`。
- `openRunEvents` URL 不回退到错误 host。

### Main Shell

- 无 hash 时默认进入 Chat。
- `#conversation` 兼容进入 Chat。
- 点击导航切换 Chat/Runs/Skills/Settings。

## 3. Browser Acceptance Cases

### Case 1: First Open

1. 打开 `/`。
2. 期望看到 Chat composer。
3. 期望不看到 raw event inspector。

### Case 2: API Unavailable

1. 只启动 Vite，不启动 API。
2. 打开 Chat。
3. 期望明确显示 API unavailable 和下一步。

### Case 3: API Available

1. 启动 `web --api`。
2. 输入任务并 Run。
3. 期望状态进入 running。
4. 完成后期望出现结果和 Run Detail 入口。

### Case 4: Audit Handoff

1. 从 Chat 完成态点击 Run Detail。
2. 期望进入 `#runs/<recordId>`。
3. 期望看到 Evidence / Risk / Replay。

### Case 5: Mobile Layout

1. 390x844 视口打开 Chat。
2. 期望输入框、按钮、状态、导航无重叠。
