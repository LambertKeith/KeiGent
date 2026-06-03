# 模块六：Event Bus 与 RPC 系统

> 核心文件：`src/core/event_bus/`、`src/core/jsonrpc.rs`

---

## 目录

1. [Event Bus 概览](#1-event-bus-概览)
2. [全局广播（Publish/Subscribe）](#2-全局广播publishsubscribe)
3. [进程内 Native Request/Response](#3-进程内-native-requestresponse)
4. [DomainEvent 枚举](#4-domainevent-枚举)
5. [EventHandler 实现模式](#5-eventhandler-实现模式)
6. [JSON-RPC 服务器](#6-json-rpc-服务器)
7. [错误处理与 StructuredRpcError](#7-错误处理与-structuredrpcerror)
8. [SSE 实时推送](#8-sse-实时推送)
9. [Controller 注册模式](#9-controller-注册模式)

---

## 1. Event Bus 概览

OpenHuman 有两套进程内通信机制，均为单例，启动时由 `init_global` 初始化：

| 机制 | 模式 | 序列化 | 适用场景 |
|---|---|---|---|
| **EventBus**（broadcast）| 1:N fire-and-forget | 零序列化（Clone）| 跨模块事件通知 |
| **NativeRegistry**（request/response）| 1:1 typed | 零序列化（trait object）| 模块间同步请求 |

```
init_global(capacity)
├─ init_native_registry()     ← 先初始化，确保注册安全
└─ GLOBAL_BUS = EventBus::create(capacity=256)
```

---

## 2. 全局广播（Publish/Subscribe）

### 2.1 发布

```rust
// 任意地方调用（包括 async 和非 async 上下文）
publish_global(DomainEvent::AgentTurnCompleted {
    session_id: "xxx".to_string(),
    text_chars: 512,
    iterations: 3,
});

// bus 未初始化时静默丢弃（不 panic）
```

### 2.2 订阅

```rust
// EventHandler trait
#[async_trait]
pub trait EventHandler: Send + Sync {
    fn name(&self) -> &str;

    // 过滤：返回 None = 订阅所有域；返回 Some(vec) = 只订阅这些域
    fn domains(&self) -> Option<Vec<&'static str>> { None }

    async fn handle(&self, event: &DomainEvent);
}

// 注册订阅
let handle: SubscriptionHandle = subscribe_global(Arc::new(MyHandler))?;
// handle drop 时自动取消订阅（RAII）
```

### 2.3 EventBus 内部实现

```rust
pub struct EventBus {
    sender: broadcast::Sender<DomainEvent>,
}

// 基于 tokio::sync::broadcast，capacity=256
// Clone 每条事件分发给每个订阅者
// 慢速订阅者可能丢事件（broadcast 语义），用于通知而非数据传输
```

---

## 3. 进程内 Native Request/Response

### 3.1 用途

模块 A 需要同步调用模块 B，但：
- 不想序列化/反序列化（传递 Arc、channel、trait object 等）
- 不走网络（纯进程内）
- 类型安全（编译期保证）

### 3.2 API

```rust
// 注册处理器（在域初始化时调用）
register_native_global(
    "memory.recall_for_agent",
    Arc::new(|req: RecallRequest| async move {
        // ... 处理逻辑
        Ok(RecallResponse { entries })
    })
);

// 发起请求（从任意地方）
let response: RecallResponse =
    request_native_global("memory.recall_for_agent", req).await?;
```

### 3.3 NativeRegistry 内部

```rust
pub struct NativeRegistry {
    handlers: DashMap<String, Box<dyn NativeHandler>>,
}

// 方法名格式："{domain}.{verb}"
// 一个方法名只能有一个 handler（re-register 覆盖，用于测试 mock）
```

**测试隔离**：创建独立的 `NativeRegistry::new()` 实例，不影响全局。

---

## 4. DomainEvent 枚举

`DomainEvent`（`event_bus/events.rs`）是 `#[non_exhaustive]` 枚举，所有域的事件都在此定义：

### Agent 事件

| 变体 | 字段 | 触发时机 |
|---|---|---|
| `AgentTurnStarted` | `session_id`, `channel` | Agent.turn() 开始 |
| `AgentTurnCompleted` | `session_id`, `text_chars`, `iterations` | turn() 正常返回 |
| `AgentError` | `session_id`, `message`, `recoverable` | turn() 出错 |
| `SubagentSpawned` | `parent_session`, `agent_id`, `mode`, `task_id`, `prompt_chars` | spawn_subagent 工具调用 |
| `SubagentCompleted` | `parent_session`, `task_id`, `agent_id`, `elapsed_ms`, `output_chars`, `iterations` | 子 Agent 完成 |
| `SubagentFailed` | `parent_session`, `task_id`, `agent_id`, `error` | 子 Agent 失败 |

### Memory 事件

| 变体 | 字段 | 触发时机 |
|---|---|---|
| `MemoryStored` | `key`, `category`, `namespace` | memory.store() 成功 |
| `MemoryRecalled` | `query`, `hit_count` | memory.recall() 完成 |
| `MemorySyncRequested` | `channel_id` | 同步 RPC 调用 |
| `MemoryIngestionStarted` | `document_id`, `title`, `namespace`, `queue_depth` | 摄取任务开始 |
| `MemoryIngestionCompleted` | `document_id`, `namespace`, `success`, `elapsed_ms`, `queue_depth` | 摄取任务完成 |

### Channel 事件

| 变体 | 字段 | 触发时机 |
|---|---|---|
| `ChannelInboundMessage` | `event_name`, `channel`, `message`, `raw_data` | 渠道收到消息 |

（还有 Cron、Skill、Tool、Webhook、System 等域的事件变体）

---

## 5. EventHandler 实现模式

每个域在 `<domain>/bus.rs` 中实现其 `EventHandler`：

```rust
// 命名约定：<Purpose>Subscriber
pub struct CronDeliverySubscriber {
    /* 依赖注入 */
}

#[async_trait]
impl EventHandler for CronDeliverySubscriber {
    fn name(&self) -> &str {
        "cron::delivery"  // "{domain}::{purpose}" 格式
    }

    fn domains(&self) -> Option<Vec<&'static str>> {
        Some(vec!["cron"])  // 只订阅 cron 域事件
    }

    async fn handle(&self, event: &DomainEvent) {
        match event {
            DomainEvent::CronJobDue { job_id, .. } => {
                // 处理定时任务触发
            }
            _ => {}
        }
    }
}
```

启动时在 Core 初始化逻辑中注册：
```rust
subscribe_global(Arc::new(CronDeliverySubscriber::new(...)));
subscribe_global(Arc::new(WebhookRequestSubscriber::new(...)));
subscribe_global(Arc::new(ChannelInboundSubscriber::new(...)));
```

---

## 6. JSON-RPC 服务器

### 6.1 Axum 路由

```
POST /rpc                   → rpc_handler (JSON-RPC 2.0)
GET  /events                → sse_handler (SSE 实时推送)
GET  /                      → health check
GET  /schema                → 所有已注册 controller 的 schema
WS   /ws                    → WebSocket（Socket.io 兼容）
```

### 6.2 rpc_handler 流程

```rust
pub async fn rpc_handler(
    State(state): State<AppState>,
    Json(req): Json<RpcRequest>,
) -> Response {
    let result = invoke_method(state, &req.method, req.params).await;
    match result {
        Ok(value) => JSON-RPC 2.0 success response,
        Err(msg) => {
            // 解码 StructuredRpcError（域层 opt-in）
            // 按规则决定是否上报 Sentry：
            // - expected_user_state = true → info log，跳过
            // - param-validation error → info log（method + 脱敏），跳过
            // - session expired → info log，跳过
            // - transient 后端失败 → warn，跳过
            // - 其他 → Sentry 上报
        }
    }
}
```

### 6.3 AppState

```rust
pub struct AppState {
    pub db: Arc<dyn Database>,
    pub config: Arc<Config>,
    // 其他共享状态...
}
```

### 6.4 RpcRequest / RpcSuccess

```rust
pub struct RpcRequest {
    pub jsonrpc: String,       // "2.0"
    pub method: String,
    pub params: serde_json::Value,
    pub id: Option<serde_json::Value>,
}

pub struct RpcSuccess<T: Serialize> {
    pub jsonrpc: &'static str,
    pub id: Option<serde_json::Value>,
    pub result: T,
}
```

---

## 7. 错误处理与 StructuredRpcError

### 7.1 RpcOutcome

域层 handler 返回 `RpcOutcome<T>`（等价于 `Result<T, String>`），字符串错误在传输层解码。

### 7.2 StructuredRpcError（`src/rpc/`）

域层可通过序列化 `StructuredRpcError` 携带结构化元数据：

```rust
pub struct StructuredRpcError {
    pub message: String,
    pub data: Option<serde_json::Value>,
    pub expected_user_state: bool,    // true = 预期边界条件，跳过 Sentry
}
```

编码/解码：
```rust
// 域层序列化后作为 Err 字符串返回
let err = StructuredRpcError { message, data, expected_user_state: true }
    .encode();

// 传输层解码
let structured = StructuredRpcError::decode(&raw_message);
```

### 7.3 Sentry 过滤规则（observability.rs）

跳过 Sentry 上报的场景：
- `expected_user_state = true`（如 session 过期、stale thread 引用）
- param-validation 错误（`"unknown param 'x'"` 等格式）
- session expired 错误
- transient 后端失败（rate-limit / 5xx / unhealthy）

---

## 8. SSE 实时推送

`/events` 端点提供服务端推送事件：

```
DomainEvent 广播
    ↓ TracingSubscriber（内建调试订阅者）
    ↓ socketio.rs（WebSocket 推送）
前端 SocketProvider
```

前端通过 Socket.io 连接到 Core，接收实时更新（Agent 流式输出、任务进度等）。

---

## 9. Controller 注册模式

每个业务域通过统一的 controller 注册表对外暴露 RPC：

### 9.1 ControllerSchema / FieldSchema（`src/core/types.rs`）

```rust
pub struct ControllerSchema {
    pub name: String,         // "openhuman.memory_recall"
    pub description: String,
    pub params: Vec<FieldSchema>,
    pub returns: TypeSchema,
}
```

### 9.2 注册流程

```rust
// src/core/all.rs 聚合所有域的 controller
pub fn all_controller_schemas() -> Vec<ControllerSchema> {
    [
        memory::all_memory_controller_schemas(),
        agent::all_agent_controller_schemas(),
        cron::all_cron_controller_schemas(),
        inference::all_inference_controller_schemas(),
        tools::all_tools_controller_schemas(),
        // ...
    ].concat()
}

pub async fn invoke_method(
    state: AppState,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    // 按方法名前缀路由到对应域的 handle_* 函数
}
```

### 9.3 域 schemas.rs 标准结构

```rust
// src/openhuman/<domain>/schemas.rs

pub fn schemas() -> Vec<ControllerSchema> { vec![...] }

pub fn all_controller_schemas() -> Vec<ControllerSchema> { schemas() }

pub fn all_registered_controllers() -> Vec<RegisteredController> {
    schemas().into_iter().map(|s| RegisteredController {
        schema: s,
        handler: Arc::new(|params, state| Box::pin(handle_method(params, state))),
    }).collect()
}

async fn handle_method_name(
    params: Value,
    state: AppState,
) -> RpcOutcome<ReturnType> {
    domain::ops::some_fn(params, state).await
}
```
