# 模块七：前端与 Tauri Shell

> 核心文件：`app/src/`（React 前端）、`app/src-tauri/src/`（Tauri shell）

---

## 目录

1. [前端架构概览](#1-前端架构概览)
2. [Provider 链（App.tsx）](#2-provider-链apptsx)
3. [路由结构（AppRoutes.tsx）](#3-路由结构approutestsx)
4. [状态管理（Redux Toolkit）](#4-状态管理redux-toolkit)
5. [Services 单例](#5-services-单例)
6. [CoreStateProvider 与 RPC 桥接](#6-corestateprovider-与-rpc-桥接)
7. [SocketProvider 实时通信](#7-socketprovider-实时通信)
8. [AI Config 与 SOUL.md](#8-ai-config-与-soulmd)
9. [Tauri Shell 模块](#9-tauri-shell-模块)
10. [CEF WebView 与平台扫描器](#10-cef-webview-与平台扫描器)
11. [Tauri IPC 命令](#11-tauri-ipc-命令)
12. [前端编码约定](#12-前端编码约定)

---

## 1. 前端架构概览

```
app/src/
├── App.tsx             # Provider 链根组件
├── AppRoutes.tsx        # 路由定义
├── main.tsx            # 入口（挂载 React 应用）
├── SOUL.md             # Agent 身份文件（运行时读取）
├── providers/          # React Context Provider
├── services/           # 单例服务（API client、Socket、CoreRpc 等）
├── store/              # Redux Toolkit slices + persistor
├── components/         # 通用 UI 组件
├── features/           # 功能模块（meet 等）
├── pages/              # 页面组件
├── lib/                # 工具库（ai/、i18n/、mcp/、coreState/ 等）
├── hooks/              # 自定义 React Hooks
├── types/              # TypeScript 类型定义
├── utils/              # 工具函数（config.ts 等）
├── chat/               # 聊天功能
├── mascot/             # 虚拟助手形象
└── overlay/            # 叠加层 UI
```

---

## 2. Provider 链（App.tsx）

从最外层到最内层依次包裹：

```
Sentry.ErrorBoundary（错误边界）
    ↓ I18nProvider（国际化）
    ↓ ThemeProvider（主题）
    ↓ Redux Provider（store）
    ↓ PersistGate（redux-persist 水化守门，显示 PersistRehydrationScreen）
    ↓ BootCheckGate（启动自检：core 连接、版本检查等）
    ↓ CoreStateProvider（核心状态快照，fetchCoreAppSnapshot()）
    ↓ SocketProvider（Socket.io 实时连接）
    ↓ ChatRuntimeProvider（聊天运行时上下文）
    ↓ HashRouter（React Router，HashHistory）
    ↓ CommandProvider（全局命令面板）
    ↓ ServiceBlockingGate（服务阻塞门：如 core 不可用时展示错误页）
    ↓ AppShell
        ├─ AppRoutes（页面路由）
        ├─ BottomTabBar（底部导航）
        ├─ AppWalkthrough（新手引导）
        ├─ MascotFrameProducer（虚拟助手帧生成）
        ├─ AppUpdatePrompt（更新提示）
        ├─ LocalAIDownloadSnackbar（本地模型下载进度）
        └─ GlobalUpsellBanner、OpenhumanLinkModal 等全局浮层
```

**注意**：不存在 `UserProvider` / `AIProvider` / `SkillProvider`——认证和 Core 快照统一在 `CoreStateProvider` 中管理，auth token 不在 redux-persist 中（存在进程内 Core）。

---

## 3. 路由结构（AppRoutes.tsx）

使用 `HashRouter`（`HashHistory`），所有路由均以 `#/` 开头：

| 路由 | 页面 |
|---|---|
| `/` | Welcome（欢迎页）|
| `/onboarding/*` | 引导流程 |
| `/home` | 主页 |
| `/human` | Human 页面 |
| `/intelligence` | 智能助手 |
| `/skills` | 技能管理 |
| `/chat` | 聊天（统一 agent + 连接的 Web 应用，取代旧 `/conversations` + `/accounts`）|
| `/channels` | 渠道连接管理 |
| `/invites` | 邀请 |
| `/notifications` | 通知 |
| `/rewards` | 奖励 |
| `/webhooks` | 重定向到 `/settings/webhooks-triggers` |
| `/settings/*` | 设置 |
| `*` | DefaultRedirect（默认重定向）|

**不存在的路由**（已移除）：`/login`、`/mnemonic`、`/agents`、`/conversations`。

---

## 4. 状态管理（Redux Toolkit）

### 4.1 Slices

| Slice | 职责 |
|---|---|
| `accounts` | 账户列表和状态 |
| `channelConnections` | 渠道连接状态 |
| `chatRuntime` | 聊天运行时（当前会话、消息等）|
| `coreMode` | Core 模式（normal / staging / debug）|
| `deepLinkAuth` | 深度链接认证流程状态 |
| `mascot` | 虚拟助手可见性和状态 |
| `notification` | 通知列表 |
| `providerSurface` | Provider 页面状态 |
| `socket` | Socket.io 连接状态 |
| `thread` | 会话线程列表 |

### 4.2 持久化

通过 `redux-persist` 将选定 slice 持久化到本地存储。**auth token 不持久化**（存在 Core 进程内）。

**原则**：优先使用 Redux，而非 `localStorage`。例外：纯临时 UI 状态（如 upsell 已关闭标记）。

### 4.3 Store Hooks

```typescript
import { useAppSelector, useAppDispatch } from './store/hooks';

const someState = useAppSelector(state => state.thread.items);
const dispatch = useAppDispatch();
```

---

## 5. Services 单例

`services/` 目录下均为单例服务，在应用启动时初始化：

| 服务 | 职责 |
|---|---|
| `apiClient` | 后端 HTTP API 客户端（openhuman 云后端）|
| `socketService` | Socket.io 连接管理（连接 Core `/events`）|
| `coreRpcClient` | HTTP RPC 客户端（连接 Core `POST /rpc`）|
| `coreCommandClient` | 命令式 RPC 客户端（封装常用操作）|
| `chatService` | 聊天消息发送、接收封装 |
| `analytics` | 用户行为分析事件上报 |
| `notificationService` | 桌面通知管理 |
| `webviewAccountService` | CEF WebView 账户管理 |
| `daemonHealthService` | Core 健康监控 |

### 5.1 coreRpcClient 与 coreCommandClient

```typescript
// coreRpcClient：底层 HTTP+RPC 调用
const result = await coreRpcClient.call('openhuman.memory_recall', { query, limit: 5 });

// coreCommandClient：命令封装（更语义化）
const memories = await coreCommandClient.recallMemory(query);
```

### 5.2 startWebviewAccountService

在 `App.tsx` 模块加载时立即执行（非组件初始化）：

```typescript
// 在 App.tsx 顶层调用，确保 webview:event 监听在任何路由前就绪
startWebviewAccountService();
startWebviewNotificationsService();
```

---

## 6. CoreStateProvider 与 RPC 桥接

### 6.1 CoreStateProvider（`providers/CoreStateProvider.tsx`）

- 调用 `fetchCoreAppSnapshot()` 获取 Core 的完整状态快照
- 将 auth 状态、用户信息、订阅信息等注入 React context
- 通过 `useCoreState()` hook 消费

```typescript
const { user, subscription, isAuthenticated } = useCoreState();
```

### 6.2 Tauri IPC 桥接规则

**必须**使用 `invoke('core_rpc_relay', ...)` 而非直接 `fetch()`：

```typescript
import { invoke } from '@tauri-apps/api/core';

// 正确：通过 Tauri IPC，避免 CORS preflight
const result = await invoke('core_rpc_relay', {
    method: 'openhuman.memory_recall',
    params: { query: '...' }
});

// 错误：直接 fetch 会触发 CORS preflight
const result = await fetch('http://127.0.0.1:PORT/rpc', { ... });
```

**isTauri() 检查**：

```typescript
import { isTauri } from './services/webviewAccountService';

// 正确：使用封装的 isTauri() 函数
if (isTauri()) { ... }

// 错误：不要直接检查
if (window.__TAURI__) { ... }  // 模块加载时 __TAURI__ 尚未注入
```

---

## 7. SocketProvider 实时通信

`providers/SocketProvider.tsx` 管理与 Core 的 Socket.io 连接：

```
Core socketio.rs → WebSocket → SocketProvider
    ↓ 接收事件
onAgentTurn* → 更新 chatRuntime slice
onMemoryStored → 触发记忆列表刷新
onCronJobFired → 通知 UI
...
```

MCP 传输（`lib/mcp/`）：JSON-RPC over Socket.io，提供标准 MCP tool 接口给前端。

---

## 8. AI Config 与 SOUL.md

### 8.1 SOUL.md（`app/src/SOUL.md`）

Agent 的身份和性格文件，在 Rust 端通过 `build_system_prompt` 读取并注入。Tauri 打包时作为 resources 资源包含（`app/src-tauri/tauri.conf.json`）。

### 8.2 AI Config 加载（`app/src/lib/ai/`）

```typescript
// 前端 AI 配置加载器
// 支持：?raw 静态导入 + 可选远程拉取
// Tauri 命令：ai_get_config / ai_refresh_config / write_ai_config_file
```

### 8.3 config.ts（`app/src/utils/config.ts`）

**所有 `VITE_*` 环境变量的唯一入口**：

```typescript
// 正确
import { CORE_RPC_URL } from './utils/config';

// 错误：不允许在 config.ts 以外直接使用 import.meta.env
const url = import.meta.env.VITE_CORE_RPC_URL;  // ❌
```

---

## 9. Tauri Shell 模块

`app/src-tauri/src/` 的顶层模块：

| 模块 | 职责 |
|---|---|
| `core_process.rs` | Core 进程生命周期（启动、停止、重启、健康检查）|
| `core_rpc.rs` | HTTP RPC 中继（`core_rpc_relay` IPC 命令）|
| `cdp/` | CDP（Chrome DevTools Protocol）接口封装 |
| `cef_preflight.rs` | CEF 运行时可用性检查 |
| `cef_profile.rs` | CEF 用户数据目录管理 |
| `dictation_hotkeys.rs` | 语音听写热键（全局快捷键）|
| `file_logging.rs` | 文件日志写入 |
| `mascot_native_window.rs` | 虚拟助手原生窗口 |
| `native_notifications/` | 系统原生通知 |
| `notification_settings/` | 通知偏好设置 |
| `process_kill.rs` | 进程终止工具（kill_pid_term / kill_pid_force）|
| `process_recovery.rs` | Core 崩溃恢复逻辑 |
| `screen_capture/` | 屏幕截图（用于 Computer Use）|
| `window_state.rs` | 窗口位置/大小持久化 |
| `webview_accounts/` | CEF WebView 账户页面管理 |
| `webview_apis/` | WebView API 桥接 |
| `fake_camera/` | 虚拟摄像头（Google Meet 用）|
| `meet_audio/` / `meet_call/` / `meet_video/` | Meet 会议相关 |

---

## 10. CEF WebView 与平台扫描器

### 10.1 扫描器模块

每个渠道有独立的 CDP-based 扫描器：

| 模块 | 渠道 |
|---|---|
| `discord_scanner/` | Discord |
| `gmessages_scanner/` | Google Messages |
| `imessage_scanner/` | iMessage（macOS）|
| `meet_scanner/` | Google Meet |
| `slack_scanner/` | Slack |
| `telegram_scanner/` | Telegram |
| `whatsapp_scanner/` | WhatsApp |

**零 JS 注入**：已迁移的 provider（whatsapp、telegram、slack、discord）通过 CDP 在 Rust 侧抓取，CEF WebView 内不注入任何 JavaScript。

### 10.2 允许的 WebView 干预方式

```
✅ CEF handlers（on_navigation、LoadHandler::OnLoadStart 等）
✅ CDP 命令（Network.*、Emulation.*、Input.*、Page.*）
✅ Rust-side notification/IPC hooks
❌ JavaScript 注入（build_init_script、RUNTIME_JS、addScriptToEvaluateOnNewDocument）
```

### 10.3 遗留 JS 注入

`gmail`、`linkedin`、`google-meet` 仍有 `runtime.js` 遗留注入（`grandfathered`），应收缩而非增长。

---

## 11. Tauri IPC 命令

通过 `invoke(commandName, args)` 调用的 Tauri 命令：

| 命令 | 功能 |
|---|---|
| `core_rpc_relay` | 转发 JSON-RPC 请求到 Core（带 bearer auth）|
| `core_rpc_token` | 获取当前 RPC bearer token |
| `start_core_process` | 启动 Core |
| `restart_core_process` | 重启 Core（更新后）|
| `write_ai_config_file` | 写入 AI 配置文件 |
| `ai_get_config` | 读取 AI 配置 |
| `ai_refresh_config` | 刷新 AI 配置（重新加载）|
| `greet` | 健康检查 |
| `openhuman_*` | 各类 daemon 辅助命令 |
| 窗口命令 | 最大化、最小化、全屏等 |

### 11.1 tauri-plugin-opener 注意事项

`tauri-plugin-opener` 默认注入全局点击监听 JS（`init-iife.js`）。必须使用 `.open_js_links_on_click(false)` 禁用。

**新插件审计规则**：添加任何新 Tauri 插件前检查是否有 `js_init_script` 调用，若有则配置绕过。

---

## 12. 前端编码约定

### 12.1 禁止动态 import

生产代码中只允许静态 `import`：

```typescript
// ✅ 静态 import
import { Component } from './components/Component';

// ❌ 禁止（生产代码）
const comp = await import('./components/Component');
const Lazy = React.lazy(() => import('./components/Component'));
```

例外：`*.test.ts`、`__tests__/`、`test/setup.ts`、`.d.ts`、配置文件（如 `tailwind.config.js`）。

### 12.2 设计系统

- **色彩**：ocean primary `#4A83DD`，sage / amber / coral 语义色
- **字体**：Inter（正文）、Cabinet Grotesk（标题）、JetBrains Mono（代码）
- **配置**：`app/tailwind.config.js`（自定义 radii / spacing / shadows）
- **目标**：高端、沉静的视觉语言

### 12.3 双 Socket 同步规则

修改实时协议时，需同时保持 `socketService`（前端 Socket.io）和 MCP transport（`lib/mcp/`）与 Core socket 行为对齐。
