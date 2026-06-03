# 模块三：工具系统

> 核心文件：`src/openhuman/tools/`

---

## 目录

1. [工具域结构](#1-工具域结构)
2. [Tool trait 与核心类型](#2-tool-trait-与核心类型)
3. [工具实现分类](#3-工具实现分类)
4. [ToolSpec 与模型展示](#4-toolspec-与模型展示)
5. [工具注册与查找](#5-工具注册与查找)
6. [工具执行流程](#6-工具执行流程)
7. [per-agent 工具过滤](#7-per-agent-工具过滤)
8. [用户偏好过滤](#8-用户偏好过滤)
9. [Orchestrator 合成工具](#9-orchestrator-合成工具)

---

## 1. 工具域结构

```
src/openhuman/tools/
├── mod.rs              # 公共导出
├── traits.rs           # Tool trait + 核心类型定义
├── schema.rs           # CleaningStrategy、SchemaCleanr（schema 清理）
├── schemas.rs          # Controller 注册表
├── ops.rs              # RPC handlers（工具相关 RPC）
├── local_cli.rs        # CLI 直接调用工具的适配器
├── user_filter.rs      # 用户偏好过滤
├── orchestrator_tools.rs # delegation 合成工具
└── impl/               # 工具实现
    ├── mod.rs
    ├── agent/          # Agent 工具（spawn_subagent 等）
    ├── audio/          # 音频工具
    ├── browser/        # 浏览器自动化（CDP）
    ├── computer/       # 屏幕截图、鼠标键盘控制
    ├── cron/           # Cron 任务操作
    ├── filesystem/     # 文件读写
    ├── memory/         # 记忆读写工具
    ├── network/        # HTTP 请求、网页抓取
    ├── system/         # 系统命令执行
    └── whatsapp_data/  # WhatsApp 数据访问
```

---

## 2. Tool trait 与核心类型

### 2.1 Tool trait（`traits.rs`）

```rust
pub trait Tool: Send + Sync {
    /// 工具唯一名称（用于模型调用 + 注册表 key）
    fn name(&self) -> &str;

    /// 返回工具的 schema 描述，供模型函数调用使用
    fn spec(&self) -> ToolSpec;

    /// 执行工具调用
    async fn call(&self, args: serde_json::Value, options: ToolCallOptions) -> ToolResult;

    /// 工具分类（用于 UI 展示和过滤）
    fn category(&self) -> ToolCategory { ToolCategory::General }

    /// 权限级别（展示给用户的审批粒度）
    fn permission_level(&self) -> PermissionLevel { PermissionLevel::Standard }

    /// 工具作用域（全局注册表 or per-agent 临时工具）
    fn scope(&self) -> ToolScope { ToolScope::Global }
}
```

### 2.2 ToolSpec

```rust
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,  // JSON Schema
}
```

`ToolSpec` 是发给 LLM 的函数 schema 表示，由 `CleaningStrategy` 决定如何清理（兼容不同 provider 的 schema 要求）。

### 2.3 ToolResult / ToolContent

```rust
pub enum ToolContent {
    Text(String),
    Image { data: Vec<u8>, mime_type: String },
    // ...
}

pub struct ToolResult {
    pub content: Vec<ToolContent>,
    pub success: bool,
}
```

### 2.4 PermissionLevel

| 级别 | 含义 |
|---|---|
| `Silent` | 无需用户知悉（读取轻量数据）|
| `Standard` | 默认（正常工具操作）|
| `Sensitive` | 需要审批（写入、删除、外部 API 调用）|
| `Destructive` | 高风险（不可逆操作）|

### 2.5 ToolScope

| 值 | 含义 |
|---|---|
| `Global` | 全局注册（启动时注册，所有 Agent 可见）|
| `PerTurn` | per-turn 合成（如 delegation 工具，每次 LLM 调用前动态生成）|

---

## 3. 工具实现分类

### filesystem

| 工具名 | 功能 |
|---|---|
| `read_file` | 读取文件内容 |
| `write_file` | 写入文件 |
| `list_directory` | 列出目录 |
| `delete_file` | 删除文件 |
| `move_file` | 移动/重命名 |

### browser

基于 CDP（Chrome DevTools Protocol）驱动：

| 工具名 | 功能 |
|---|---|
| `browser_navigate` | 打开 URL |
| `browser_click` | 点击元素 |
| `browser_type` | 输入文本 |
| `browser_screenshot` | 截图 |
| `browser_get_content` | 获取页面内容 |

### computer

屏幕级操作（`screen_capture` + 输入模拟）：

| 工具名 | 功能 |
|---|---|
| `computer_screenshot` | 截全屏 |
| `computer_click` | 鼠标点击 |
| `computer_type` | 键盘输入 |
| `computer_scroll` | 滚动 |

### network

| 工具名 | 功能 |
|---|---|
| `http_request` | 通用 HTTP 请求 |
| `fetch_url` | 抓取网页文本 |
| `web_search` | 网络搜索 |

### system

| 工具名 | 功能 |
|---|---|
| `run_shell_command` | 执行 shell 命令 |
| `run_javascript` | 执行 JavaScript（Node runtime）|
| `run_python` | 执行 Python（runtime_python）|

### memory

| 工具名 | 功能 |
|---|---|
| `memory_store` | 存储记忆条目 |
| `memory_recall` | 语义搜索召回 |
| `memory_list` | 列出记忆 |
| `memory_delete` | 删除记忆 |

### agent

| 工具名 | 功能 |
|---|---|
| `spawn_subagent` | 派发任务到专用子 Agent |

### cron

| 工具名 | 功能 |
|---|---|
| `schedule_cron_job` | 创建定时任务 |
| `list_cron_jobs` | 列出定时任务 |
| `delete_cron_job` | 删除定时任务 |

---

## 4. ToolSpec 与模型展示

### 4.1 Schema 清理（SchemaCleanr）

不同 provider 对 JSON Schema 的支持程度不同，`CleaningStrategy` 处理兼容性：
- 移除不支持的关键字（如 Anthropic 不支持 `$schema`）
- 规范化枚举类型
- 处理嵌套对象引用

### 4.2 ToolCallFormat

由 `ToolDispatcher::tool_call_format()` 决定系统提示中如何渲染工具描述：

| 格式 | 用途 |
|---|---|
| `ToolCallFormat::Json` | JSON 格式工具说明（默认）|
| `ToolCallFormat::Xml` | XML 格式（XmlToolDispatcher）|

---

## 5. 工具注册与查找

所有全局工具在 Core 启动时注册到 `tools_registry`（`Vec<Box<dyn Tool>>`），由 `Agent` 持有。

子域工具（`impl/` 下各模块）通过 `pub use` 在 `impl/mod.rs` 中统一导出，再由 `tools/mod.rs` 引出。

工具 RPC（`ops.rs`）提供：
- `openhuman.tools_list`：列出所有可用工具
- `openhuman.tools_schema`：返回工具完整 schema

---

## 6. 工具执行流程

在 `run_tool_call_loop` 中，tool calls 的执行流程：

```
LLM 返回 tool_calls
    │
    ├─ 1. 可见性检查：visible_tool_names 白名单过滤
    │
    ├─ 2. 查找实现：tools_registry + extra_tools 中匹配 name
    │
    ├─ 3. 执行：tool.call(args, ToolCallOptions)
    │   └─ ToolCallOptions 包含：approval_manager、channel_name、task_id 等
    │
    ├─ 4. 格式化结果：dispatcher.format_results(results) → ConversationMessage
    │   ├─ Native: role=tool，tool_call_id 对应
    │   └─ XML: <tool_result>...</tool_result> 追加到 user 消息
    │
    └─ 5. 追加到 history，触发下一轮 LLM 调用
```

### 6.1 ApprovalManager

`approval::ApprovalManager` 插在工具执行前，对 `PermissionLevel::Sensitive/Destructive` 的工具请求用户审批：

```
tool.call(args, ToolCallOptions { approval: Some(manager) })
    ↓
ApprovalManager::request(ApprovalRequest { tool_name, args })
    ↓ 通过 RPC/WebSocket 发给前端
用户审批/拒绝
    ↓ ApprovalResponse::Approved / Denied
继续执行 / 返回拒绝错误
```

---

## 7. per-agent 工具过滤

`AgentDefinition.tool_scope` 配置 sub-agent 可见的工具：

```rust
// tool_filter.rs
pub fn filter_tools_for_agent(
    registry: &[Box<dyn Tool>],
    definition: &AgentDefinition,
) -> HashSet<String>
```

过滤逻辑：

1. `tools`（白名单）非空 → 只有列表内的工具可见
2. `disallowed_tools` → 从可见集合中减去
3. `skill_filter` → 按 skill 名称过滤（技能工具）

过滤结果作为 `visible_tool_names: Some(HashSet)` 传给 `run_tool_call_loop`。

---

## 8. 用户偏好过滤

`user_filter::filter_tools_by_user_preference(tools, config)` 根据用户配置屏蔽特定工具（如用户禁用了 computer use，则隐藏 `computer_*` 工具）。

---

## 9. Orchestrator 合成工具

`orchestrator_tools.rs` 在每个 turn 动态合成 delegation 工具：

```
fetch_connected_integrations() → Vec<ComposioIntegration>
    ↓
build_delegation_tools(integrations, agent_registry)
    ↓
Vec<Box<dyn Tool>>（如 delegate_gmail、delegate_notion）
```

这些工具通过 `extra_tools` 参数注入到 `run_tool_call_loop`（`ToolScope::PerTurn`），不在全局注册表中。

当 Composio 连接集合变化时（`last_seen_integrations_hash` 改变），`refresh_delegation_tools()` 重新生成——此时只刷新工具 schema（`tools` 字段），系统提示保持不变以保护 KV cache。
