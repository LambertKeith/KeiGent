# 模块一：架构总览

> 项目：OpenHuman v0.53.45+
> 仓库：`tinyhumansai/openhuman`（桌面端 AI 助手，React + Tauri v2 + Rust 核心）

---

## 目录

1. [整体定位](#1-整体定位)
2. [仓库布局](#2-仓库布局)
3. [运行时边界](#3-运行时边界)
4. [核心分层](#4-核心分层)
5. [消息流与 RPC 链路](#5-消息流与-rpc-链路)
6. [关键技术约定](#6-关键技术约定)
7. [构建与开发命令](#7-构建与开发命令)

---

## 1. 整体定位

OpenHuman 是一款面向社区的桌面 AI 助手，产品形态为 **Windows / macOS / Linux 三平台桌面应用**。

技术栈分三层：

```
┌─────────────────────────────────────────────────────┐
│  React + Vite  (app/src/)                           │
│  UX、路由、状态管理、Socket 实时展示                  │
├─────────────────────────────────────────────────────┤
│  Tauri v2 Shell  (app/src-tauri/)                   │
│  窗口管理、IPC 桥接、CEF WebView、平台扫描器          │
├─────────────────────────────────────────────────────┤
│  Rust Core  (src/)                                  │
│  业务逻辑、Agent 执行、JSON-RPC、持久化、CLI          │
└─────────────────────────────────────────────────────┘
```

**核心是进程内的（in-process）**——不再是独立 sidecar。Core 以 tokio task 形式运行在 Tauri 宿主进程内，通过 `CoreProcessHandle`（`app/src-tauri/src/core_process.rs`）管理生命周期，进程退出时 Core 随之终止。

---

## 2. 仓库布局

| 路径 | 角色 |
|---|---|
| `app/` | pnpm workspace `openhuman-app`，包含 Vite+React 前端（`app/src/`）和 Tauri shell（`app/src-tauri/`） |
| `src/` | Rust lib crate `openhuman` + CLI 二进制 `openhuman-core`（`src/main.rs`） |
| `src/core/` | 传输层：Axum HTTP、JSON-RPC、CLI、event bus、auth、dispatch |
| `src/openhuman/` | 所有业务域（约 60+ 个域模块）|
| `src/rpc/` | RPC 公共类型（`StructuredRpcError` 等） |
| `src/bin/` | 辅助工具二进制：`slack-backfill`、`gmail-backfill-3d` |
| `tests/` | Rust 集成测试（`json_rpc_e2e.rs`）|
| `packages/` | monorepo 子包 |
| `e2e/` | WDIO E2E Docker 配置 |
| `docs/` | 深层内部文档（内存管道、Sentry 等）|
| `gitbooks/` | 贡献者叙事文档（架构、E2E 测试指南等）|
| `scripts/` | 构建、测试、调试脚本 |

---

## 3. 运行时边界

### 3.1 Core 进程内嵌（PR #1061 移除 sidecar）

```
Tauri 宿主进程
├─ CEF / WebKit2GTK WebView（前端 React）
├─ tokio runtime
│   ├─ CoreProcessHandle（core_process.rs）
│   │   └─ Axum HTTP server（127.0.0.1:<port>/rpc）
│   │       ├─ Bearer auth（OPENHUMAN_CORE_TOKEN，每次启动随机生成）
│   │       ├─ JSON-RPC POST /rpc
│   │       └─ SSE /events（实时推送）
│   └─ 各 tokio task（agent session、cron scheduler 等）
└─ Tauri IPC（invoke() / core_rpc_relay）
```

前端通过 `invoke('core_rpc_relay', ...)` 调用 Core（绕过 CORS preflight），而非直接 `fetch()`。

`OPENHUMAN_CORE_REUSE_EXISTING=1` 可附加到外部启动的 `openhuman-core` 进程（调试用）。

### 3.2 端口与 Token

- Port 在 `core_process.rs` 中分配（默认随机或固定配置）
- Token：`generate_rpc_token()` 生成 256-bit hex 字符串，通过 `OPENHUMAN_CORE_TOKEN` 环境变量传递给 Core
- Tauri 前端通过 `core_rpc_token` 命令获取当前 token

### 3.3 Stale-Listener 检测（issue #1130）

`CoreProcessHandle::ensure_running` 启动前先探测端口：
1. 已有监听 → 发 `GET /` 探查是否为 OpenHuman Core
2. 是 → 优雅信号 + force-kill（revalidate PID 防止 PID 复用误杀）+ 重新嵌入
3. 是其他进程 → 拒绝启动，报告冲突
4. 设置 `OPENHUMAN_CORE_REUSE_EXISTING=1` → 旧行为（直接附加）

---

## 4. 核心分层

### 4.1 传输层 `src/core/`

纯粹的消息路由，**不含业务逻辑**：

| 文件/目录 | 职责 |
|---|---|
| `jsonrpc.rs` | Axum HTTP server + JSON-RPC 2.0 dispatcher |
| `cli.rs` | CLI 入口，按方法名路由到 controller |
| `dispatch.rs` | 方法名 → handler 分发（过渡期；新代码走 `all.rs`）|
| `all.rs` | 聚合所有域的 controller 注册表 |
| `auth.rs` | Bearer token 验证中间件 |
| `event_bus/` | 全局 pub/sub + 进程内 typed request/response |
| `socketio.rs` | Socket.io 实时事件推送 |
| `types.rs` | `AppState`、`RpcRequest`、`RpcSuccess`、`RpcError` |
| `observability.rs` | Sentry 错误过滤与上报 |

### 4.2 业务域 `src/openhuman/`

每个域遵循统一的文件布局规范：

```
src/openhuman/<domain>/
├── mod.rs          # 轻量导出，re-export all_*_controller_schemas
├── ops.rs          # RPC handler 实现（也叫 rpc.rs）
├── schemas.rs      # ControllerSchema + all_registered_controllers
├── store.rs        # 数据持久化
├── types.rs        # 域内类型定义
└── bus.rs          # EventHandler 订阅实现（可选）
```

**禁止**在 `src/openhuman/` 根目录直接新增 `*.rs` 文件（`dev_paths.rs` 和 `util.rs` 是遗留）。

### 4.3 主要域一览

| 域 | 职责摘要 |
|---|---|
| `agent` | 多 Agent 编排、工具执行、会话管理（核心"大脑"）|
| `inference` | 云+本地推理 provider、Ollama/LM Studio 管理、语音 STT/TTS |
| `memory` | 语义搜索、向量存储、摄取管道、知识图谱 |
| `tools` | 工具注册表：filesystem、browser、computer、network 等 |
| `cron` | 定时任务调度（crontab 表达式 + one-off）|
| `skills` | skill metadata（QuickJS 运行时已移除，现为 metadata-only）|
| `channels` | inbound 渠道消息接收与分发 |
| `threads` | 会话线程管理 |
| `credentials` | 凭证存储与加密 |
| `context` | Prompt 构建、上下文压缩、系统提示渲染 |
| `config` | TOML Config + 环境变量覆盖加载 |
| `composio` | 第三方 SaaS 集成（Composio toolkit 连接）|
| `subconscious` | 后台自主任务 |
| `screen_intelligence` | 屏幕截图理解 |
| `webhooks` | Webhook 触发与路由 |

---

## 5. 消息流与 RPC 链路

### 5.1 前端 → Core（RPC）

```
React Component
    ↓ invoke('core_rpc_relay', { method, params })
Tauri IPC (core_rpc.rs)
    ↓ HTTP POST http://127.0.0.1:<port>/rpc
    Authorization: Bearer <OPENHUMAN_CORE_TOKEN>
Axum rpc_handler (jsonrpc.rs)
    ↓ invoke_method(state, method, params)
all.rs controller registry
    ↓ handle_<domain>_<fn>(params, state)
Domain ops.rs
    ↓ RpcOutcome<T>
返回 JSON-RPC 2.0 Response
```

RPC 方法命名约定：`openhuman.<namespace>_<function>`（如 `openhuman.memory_recall`）。

### 5.2 Core → 前端（实时事件）

```
Domain ops.rs
    ↓ publish_global(DomainEvent::...)
event_bus (bus.rs)
    ↓ broadcast
socketio.rs WebSocketSubscriber
    ↓ Socket.io emit
前端 SocketProvider (app/src/providers/SocketProvider.tsx)
    ↓ 更新 Redux store
React Component re-render
```

### 5.3 域内（进程内 Native Request/Response）

```
Domain A
    ↓ request_native_global("domain_b.verb", payload)
NativeRegistry (native_request.rs)
    ↓ oneshot 响应通道
Domain B handler（零序列化，trait object 直传）
    ↑ 返回 Result<T>
```

---

## 6. 关键技术约定

### 6.1 RPC 返回类型

所有 controller handler 返回 `RpcOutcome<T>`（`src/core/types.rs`），传输层统一序列化为 JSON-RPC 2.0。

错误通过 `StructuredRpcError`（`src/rpc/`）编码，包含：
- `message`：用户展示文本
- `data`：可选附加数据
- `expected_user_state`：为 `true` 时跳过 Sentry 上报

### 6.2 Controller 迁移清单

新域接入 controller 注册表需要：
1. `mod.rs` 中添加 `mod schemas;`，re-export `all_*_controller_schemas` 和 `all_*_registered_controllers`
2. `schemas.rs` 中定义 `all_controller_schemas`、`all_registered_controllers`、`handle_*` 委托函数
3. 在 `src/core/all.rs` 中注册
4. 移除 `src/core/dispatch.rs` 中的旧分支

### 6.3 CEF WebView 无 JS 注入规则

嵌入的第三方 WebView（Telegram、Slack、WhatsApp 等）**严禁新增 JavaScript 注入**：
- 不在 `webview_accounts/` 添加 `.js` 文件
- 不向 `build_init_script` / `RUNTIME_JS` 追加内容
- 不通过 CDP `Page.addScriptToEvaluateOnNewDocument` 注入

新行为必须通过 CEF handler 或 CDP scanner 模块（native Rust 侧）实现。

### 6.4 覆盖率门禁

合并门控：**Changed Lines ≥ 80% 覆盖率**（`.github/workflows/coverage.yml`）。

---

## 7. 构建与开发命令

```bash
# 前端开发服务器
pnpm dev             # 仅 Vite 开发服务器
pnpm dev:app         # 完整 Tauri 桌面开发（含 CEF runtime）

# 生产构建
pnpm build           # UI 生产构建

# 代码质量
pnpm typecheck       # tsc --noEmit
pnpm lint            # ESLint --cache
pnpm format          # Prettier + cargo fmt

# Rust Core
cargo build --manifest-path Cargo.toml --bin openhuman-core
cargo check --manifest-path Cargo.toml

# Tauri Shell
cargo check --manifest-path app/src-tauri/Cargo.toml
pnpm rust:check

# 测试
pnpm test            # Vitest 单元测试
pnpm test:coverage   # 覆盖率报告
pnpm test:rust       # cargo test（通过 mock API）

# 调试运行器（推荐，输出控制在 agent 上下文窗口内）
pnpm debug unit [file] [-t "test name"]
pnpm debug e2e test/e2e/specs/smoke.spec.ts
pnpm debug rust [test_name]
pnpm debug logs last
```
