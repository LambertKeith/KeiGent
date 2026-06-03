# 核心模块速查

> openhuman 项目关键模块、文件、命名约定一览

---

## 域模块速查

| 域 | 路径 | RPC 命名空间 | 职责 |
|---|---|---|---|
| agent | `src/openhuman/agent/` | `openhuman.agent_*` | 多 Agent 编排、工具执行、会话管理 |
| inference | `src/openhuman/inference/` | `inference.*`、`local_ai.*` | 推理 Provider、本地 AI、语音 |
| memory | `src/openhuman/memory/` | `openhuman.memory_*` | 语义搜索、向量存储、摄取管道 |
| tools | `src/openhuman/tools/` | `openhuman.tools_*` | 工具注册与执行 |
| cron | `src/openhuman/cron/` | `openhuman.cron_*` | 定时任务调度 |
| skills | `src/openhuman/skills/` | `openhuman.skills_*` | Skill metadata（运行时已移除）|
| channels | `src/openhuman/channels/` | - | 渠道入站消息路由 |
| context | `src/openhuman/context/` | - | Prompt 构建、上下文压缩 |
| config | `src/openhuman/config/` | `openhuman.config_*` | TOML config + 环境变量加载 |
| credentials | `src/openhuman/credentials/` | `openhuman.credentials_*` | 凭证存储加密 |
| composio | `src/openhuman/composio/` | `openhuman.composio_*` | 第三方 SaaS 集成 |
| threads | `src/openhuman/threads/` | `openhuman.threads_*` | 会话线程管理 |
| webhooks | `src/openhuman/webhooks/` | `openhuman.webhooks_*` | Webhook 触发路由 |
| billing | `src/openhuman/billing/` | `openhuman.billing_*` | 计费与订阅 |
| people | `src/openhuman/people/` | `openhuman.people_*` | 联系人 / 人物管理 |
| about_app | `src/openhuman/about_app/` | `openhuman.about_*` | 功能目录（能力描述）|

---

## 关键文件路径

| 文件 | 职责 |
|---|---|
| `src/core/jsonrpc.rs` | Axum JSON-RPC 服务器 |
| `src/core/all.rs` | 所有 controller 聚合注册表 |
| `src/core/event_bus/bus.rs` | EventBus 单例实现 |
| `src/core/event_bus/events.rs` | DomainEvent 枚举定义 |
| `src/core/types.rs` | AppState、RpcRequest、RpcSuccess、ControllerSchema |
| `src/rpc/` | StructuredRpcError |
| `src/openhuman/agent/harness/session/turn.rs` | Agent.turn() 主入口 |
| `src/openhuman/agent/harness/tool_loop.rs` | run_tool_call_loop 内循环 |
| `src/openhuman/agent/harness/subagent_runner/ops.rs` | run_subagent 执行器 |
| `src/openhuman/agent/harness/definition.rs` | AgentDefinition 数据模型 |
| `src/openhuman/agent/agents/mod.rs` | 内建 Agent 清单 |
| `src/openhuman/inference/provider/` | Provider trait + 实现 |
| `src/openhuman/memory/store/` | UnifiedMemory 工厂 |
| `src/openhuman/memory/ingestion/` | 摄取管道 |
| `app/src-tauri/src/core_process.rs` | CoreProcessHandle 生命周期 |
| `app/src/App.tsx` | React Provider 链 |
| `app/src/AppRoutes.tsx` | 路由定义 |
| `app/src/utils/config.ts` | 前端 VITE_* 环境变量唯一入口 |
| `app/src/providers/CoreStateProvider.tsx` | Core 状态快照 |

---

## 命名约定

### RPC 方法
```
openhuman.<domain>_<action>
示例：
  openhuman.memory_recall
  openhuman.cron_add_job
  openhuman.agent_run
  inference.list_providers
  local_ai.list_models
```

### Controller 文件布局
```
src/openhuman/<domain>/
├── mod.rs      # re-export all_*_controller_schemas + all_*_registered_controllers
├── schemas.rs  # ControllerSchema 定义 + handler 委托
├── ops.rs      # 实际业务逻辑
└── types.rs    # 域类型
```

### EventHandler
```
命名：<Purpose>Subscriber
name() 返回："<domain>::<purpose>"
domains() 返回：Some(vec!["domain_name"])  // 域过滤
```

### DomainEvent 变体
```
<Domain><Action>
示例：
  AgentTurnStarted
  AgentTurnCompleted
  MemoryStored
  MemoryIngestionCompleted
  CronJobDue（推测命名）
  SubagentSpawned
```

### Agent 工具名
```
snake_case，按功能分类：
  filesystem: read_file、write_file、list_directory
  browser: browser_navigate、browser_click
  computer: computer_screenshot、computer_type
  memory: memory_store、memory_recall
  system: run_shell_command、run_javascript
  agent: spawn_subagent
  cron: schedule_cron_job
```

---

## 常见数据流

### 用户消息 → Agent 响应
```
前端用户输入
→ invoke('core_rpc_relay', { method: 'openhuman.chat_send', params })
→ Axum rpc_handler
→ channels/Agent 分发
→ Agent.turn(user_message)
→ run_tool_call_loop(provider, history, tools)
→ provider.chat(ChatRequest)
→ 工具执行（0-N 次）
→ 最终文本响应
→ Socket.io push to frontend
→ SocketProvider 更新 Redux store
→ React re-render
```

### Cron 触发 → Agent 执行
```
CronScheduler tick
→ due_jobs()
→ DomainEvent::CronJobDue
→ CronDeliverySubscriber
→ JobType::Agent → agent_turn(...)
→ 结果 push to channel
```

### 记忆存储 → 可召回
```
Agent 对话
→ archivist.spawn_session_memory_extraction()（后台）
→ Archivist Agent → 抽取 Fact
→ memory.store(key, content, MemoryCategory::Fact)
→ embedding 向量化 + SQLite 元数据写入
→ DomainEvent::MemoryStored
↓
下次 Agent.turn()
→ collect_recall_citations(query, limit=5, min_relevance=0.4)
→ memory_loader.load_context()
→ context 注入用户消息
```

---

## 测试体系

| 类型 | 位置 | 运行命令 |
|---|---|---|
| Rust 单元测试 | `src/**/*_tests.rs` / `#[cfg(test)]` | `pnpm debug rust` |
| Rust E2E（JSON-RPC）| `tests/json_rpc_e2e.rs` | `pnpm debug rust json_rpc_e2e` |
| Vitest 单元测试 | `app/src/**/*.test.ts(x)` | `pnpm debug unit` |
| WDIO E2E（桌面）| `app/test/e2e/specs/*.spec.ts` | `pnpm debug e2e <spec>` |

**Mock API Server**：`scripts/mock-api-core.mjs`（单元+Rust 测试共用）
- `GET /__admin/health`、`POST /__admin/reset`、`POST /__admin/behavior`

**覆盖率门控**：Changed Lines ≥ 80%（`diff-cover`，合并必过）

---

## 关键设计约束

1. **系统提示仅构建一次**——保护 KV cache 前缀字节稳定性
2. **动态上下文注入用户消息**——memory recall、tree context、skill 注入均走用户消息而非系统提示
3. **CEF WebView 零 JS 注入**——已迁移 provider 通过 CDP（Rust 侧）交互
4. **Core 进程内嵌**——不再有 sidecar，`pnpm core:stage` 是 no-op
5. **controller 注册表**——所有 RPC 方法通过注册表，禁止在 `dispatch.rs` 添加分支
6. **域模块目录规范**——新功能必须在独立子目录，不在 `src/openhuman/` 根目录新增 `*.rs`
7. **RPC 通过 invoke('core_rpc_relay')**——前端禁止直接 fetch Core
8. **auth token 不走 redux-persist**——存在 Core 进程内，通过 `core_rpc_token` 命令获取
