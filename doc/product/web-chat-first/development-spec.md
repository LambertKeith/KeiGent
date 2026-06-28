# Web Chat-First Development Spec

> 状态：P0 开发规范
>
> 日期：2026-06-24

## 1. 边界

本阶段只改 Web 交互层和必要的 API glue：

- `packages/web/src/app/*`
- `packages/web/src/conversation/*` 或新增 `packages/web/src/chat/*`
- `packages/web/src/main.ts`
- `packages/web/src/styles.css`
- `packages/web/src/__tests__/*`

默认不改：

- `LoopEngine`
- `ToolRegistry`
- workflow runner
- migration files
- 数据库或持久化 schema

## 2. 架构原则

- View model 先行：复杂展示先经过纯函数归一化，再渲染 HTML。
- API/SSE 协议沿用现有 `createKeigentApiClient`。
- API connection 状态必须来自 `/api/health` 探活，不得把“配置了 `VITE_KEIGENT_API_URL`”等同于已连接。
- Chat 页面不得解析 raw logs，只消费 stable progress events / stream events。
- Run Detail 继续以 `RunRecord` 为事实源。
- 审计组件可复用现有 Live Console，但默认折叠。

## 3. 文件组织

推荐新增：

```text
packages/web/src/chat/
├── model.ts          # Chat view model, run state, evidence summary
├── workbench.ts      # renderChatWorkbench
└── __tests__         # 如未来拆分测试目录再移动
```

保留：

```text
packages/web/src/conversation/
```

作为 advanced live console / progress normalization 层。

## 4. 状态模型

Chat run 至少表达：

- `idle`
- `api_unavailable`
- `starting`
- `running`
- `waiting_for_approval`
- `needs_user_action`
- `succeeded`
- `failed`
- `degraded`
- `needs_review`

状态必须从已有 run/events 推导，不得以乐观文案伪造成功。

P0 状态映射：

| 输入事实 | Chat 状态 |
|---|---|
| 未配置 `VITE_KEIGENT_API_URL` | `api_unavailable` |
| 已配置 API URL 但 `/api/health` 失败 | `api_unavailable` |
| live run 有 goal 但无事件 | `starting` |
| live run 有事件但无 done | `running` |
| pending approval / approval denied | `needs_user_action` |
| done success + evidence passed | `succeeded` |
| done success + missing/insufficient evidence | `needs_review` |
| done budget_exceeded / max_iterations | `degraded` |
| done child_escalated / escalated | `needs_review` |
| done error / failure summary | `failed` |

## 5. 渲染要求

Chat 首屏：

- 主输入区稳定高度。
- Run 按钮清晰。
- API 状态清晰。
- 高级详情默认关闭。
- 错误和空状态必须给下一步。

Run 完成：

- 展示 final response。
- 如果有 `recordId`，展示 Run Detail link。
- 展示 evidence summary，不显示 raw payload。
- 优先从 RunRecord 派生 evidence summary；RunRecord 尚未刷新时，只显示 live summary，不能显示可信成功。

## 6. 样式要求

- 保持原生 CSS，除非单独批准引入 UI 框架。
- 不使用卡片套卡片。
- 不使用大面积单一紫色/蓝紫渐变、米色模板、纯黑酸色模板。
- 操作工具风格：紧凑、清晰、低装饰。
- 宽屏使用 sidebar + content；移动端 sidebar 变横向/顶部导航。
- 控件和文案在 360px 宽度下不得溢出。

## 7. 测试要求

必须新增或更新：

- route/hash tests：默认 Chat，旧 `#conversation` 兼容。
- nav tests：主导航不再展示 `Conversation`。
- chat model tests：idle/running/succeeded/failed/api unavailable。
- chat evidence tests：RunRecord evidence passed / insufficient / missing fallback。
- chat render tests：默认不出现 raw inspector，展开后可出现轻量 timeline。
- web-run tests：run_finished handoff 包含 Run Detail link。
- api client tests：`fetchHealth` 调用 `/api/health`，失败时不能启用 Chat/Settings connected 状态。

## 8. 浏览器验证

实现后必须启动本地 Web：

```bash
corepack pnpm --filter @keigent/cli start web --api
```

并用浏览器验证：

- `http://127.0.0.1:5173/` 默认进入 Chat。
- 桌面视口首屏任务输入明确。
- 移动视口无文本重叠。
- Runs 仍可打开。
- Skills / Settings 可访问。
