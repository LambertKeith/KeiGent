# Web Chat-First Acceptance Spec

> 状态：P0 验收规范
>
> 日期：2026-06-24

## 1. 验收目标

证明 Web 已从审计控制台默认入口，转为 Chat-first Agent Workbench，同时保留完整审计能力。

## 2. 必须通过的检查

### A. 信息架构

- 默认路由为 Chat。
- 主导航只包含 `Chat`、`Runs`、`Skills`、`Settings`。
- 主导航不包含 `Conversation`、`Dashboard`、`Config`。
- `#conversation` 旧链接应兼容到 Chat 或显示等价 Chat 页面。
- `#dashboard`、`#config`、`#eval/...` 应兼容到 Settings 或高级 Eval 子区。

### B. Chat 默认体验

- 首屏出现任务输入框。
- 首屏出现 `Run` 按钮。
- 首屏显示 API connection 状态。
- 首屏不出现 `Selected event inspector`。
- 首屏不出现 raw JSON。
- 页面不要求用户理解 `workflow_event` 才能使用。

### C. 运行体验

- API 不可用时，输入框或 Run 操作明确不可用，并展示修复方向。
- API connection 状态必须以 `/api/health` 探活为准；仅配置 URL 不算可用。
- API 可用时，提交任务会调用 `POST /api/runs`。
- SSE 事件能更新 Chat 状态。
- run 完成后展示 final response。
- 若返回 `recordId`，展示 `Open Run Detail`。
- run 完成后展示 evidence summary。
- 如果 evidence 未检查或不足，Chat 不得显示为可信成功。
- 审批、权限阻断或 child escalation 必须显示 needs review / needs user action；P0 不要求 Web 内 approve/deny。

### D. 审计能力

- Chat 页提供 `Show execution details`。
- 展开后可查看轻量 timeline。
- Chat 页默认和折叠详情中不展示 raw inspector；完整 raw inspector 留在 Runs/Developer 审计面。
- Runs 页仍显示 Evidence、Risk、Approvals、Replay、Raw redacted record。
- Run Detail 不能把 missing evidence 显示成成功。

### E. 视觉质量

- 桌面与移动端无重叠。
- 文案面向用户任务，不以内部事件名作为主文案。
- 主任务输入区视觉权重大于审计细节。
- 高级区域默认关闭。

## 3. 验证命令

```bash
corepack pnpm --filter @keigent/web check
corepack pnpm --filter @keigent/web test
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/web-api-server.test.ts src/__tests__/web-command.test.ts
corepack pnpm -r --if-present build
```

必要时补充：

```bash
corepack pnpm -r check
corepack pnpm -r test
```

## 4. 浏览器验收

使用本地服务：

```bash
corepack pnpm --filter @keigent/cli start web --api
```

验收 URL：

- `http://127.0.0.1:5173/`
- `http://127.0.0.1:5173/#chat`
- `http://127.0.0.1:5173/#runs`
- `http://127.0.0.1:5173/#skills`
- `http://127.0.0.1:5173/#settings`

截图/人工检查项：

- Desktop 1280px：Chat 首屏清晰，审计默认折叠。
- Mobile 390px：导航、输入框、按钮、结果不重叠。
- Runs detail：审计内容仍可达。
