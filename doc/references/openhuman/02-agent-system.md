# 模块二：Agent 系统

> 核心文件：`src/openhuman/agent/`
> 主入口：`harness/session/turn.rs`、`harness/tool_loop.rs`

---

## 目录

1. [Agent 域结构](#1-agent-域结构)
2. [Agent / AgentBuilder](#2-agent--agentbuilder)
3. [Turn 生命周期](#3-turn-生命周期)
4. [工具调用循环 run_tool_call_loop](#4-工具调用循环-run_tool_call_loop)
5. [系统提示构建与 KV Cache 保护](#5-系统提示构建与-kv-cache-保护)
6. [内存上下文注入](#6-内存上下文注入)
7. [Dispatcher：工具调用格式策略](#7-dispatcher工具调用格式策略)
8. [Sub-Agent 体系](#8-sub-agent-体系)
9. [内建 Agent 清单](#9-内建-agent-清单)
10. [AgentDefinition 数据模型](#10-agentdefinition-数据模型)
11. [AgentProgress 进度事件](#11-agentprogress-进度事件)
12. [Stop Hooks](#12-stop-hooks)

---

## 1. Agent 域结构

```
src/openhuman/agent/
├── mod.rs                  # 导出 Agent、AgentBuilder；re-export schemas
├── harness/
│   ├── mod.rs              # 多 Agent 编排基础设施
│   ├── session/            # Agent struct + 主循环
│   │   ├── types.rs        # Agent 和 AgentBuilder 结构体（纯数据）
│   │   ├── builder.rs      # AgentBuilder fluent API + Agent::from_config
│   │   ├── turn.rs         # turn() 生命周期（热路径）
│   │   ├── runtime.rs      # 公开访问器、run_single / run_interactive
│   │   └── transcript.rs   # 会话转录（KV cache 恢复用）
│   ├── tool_loop.rs        # run_tool_call_loop（内循环）
│   ├── subagent_runner/    # 子 Agent 执行器
│   │   ├── ops.rs          # run_subagent（typed + fork 两种模式）
│   │   ├── types.rs        # SubagentRunOptions/Outcome/Error
│   │   ├── tool_prep.rs    # 工具过滤 + 系统提示加载
│   │   ├── handoff.rs      # 超大工具结果缓存
│   │   └── extract_tool.rs # 直接 provider 抽取工具
│   ├── definition.rs       # AgentDefinition + AgentDefinitionRegistry
│   ├── definition_loader.rs# TOML 目录扫描 + 内建定义加载
│   ├── fork_context.rs     # ParentExecutionContext task-local
│   ├── interrupt.rs        # InterruptFence + 优雅取消
│   ├── tool_filter.rs      # per-agent 工具白名单过滤
│   └── archivist.rs        # 后台记忆提取 archivist 分叉
├── agents/                 # 内建专用 Agent（每个子目录含 agent.toml + prompt.rs）
├── dispatcher.rs           # ToolDispatcher trait + XML/JSON/Native 实现
├── prompts/                # SystemPromptBuilder + 各节区构建器
├── triage/                 # 高性能外部触发分类管道
├── cost.rs                 # TurnCost（token / USD 统计）
├── progress.rs             # AgentProgress 枚举（进度事件）
├── stop_hooks.rs           # StopHook trait + TurnState
├── memory_loader.rs        # 记忆上下文收集（recall citations）
├── tree_loader.rs          # 记忆树定期预取
└── schemas.rs              # controller 注册表
```

---

## 2. Agent / AgentBuilder

### 2.1 类型定义（`session/types.rs`）

`Agent` 持有一个完整对话所需的全部状态：

| 字段分类 | 关键字段 |
|---|---|
| 推理 | `provider`（`Arc<dyn Provider>`）、`model`、`temperature` |
| 历史 | `history`（`Vec<ConversationMessage>`）、`cached_transcript_messages` |
| 工具 | `tools_registry`（`Vec<Box<dyn Tool>>`）、`extra_tools`（delegation tools）|
| 记忆 | `memory`（`MemoryClientRef`）、`memory_loader`、`last_memory_context` |
| 技能 | `skills`（已安装的 SKILL.md 清单）|
| Composio | `connected_integrations`、`last_seen_integrations_hash` |
| 配置 | `config`（`AgentConfig`，含 `max_tool_iterations`）|
| 状态 | `auto_save`、`omit_profile`、`omit_memory_md` |
| 缓存 | `last_tree_prefetch_at`、`last_turn_citations` |

### 2.2 AgentBuilder fluent API

```rust
let agent = AgentBuilder::new()
    .provider(provider)
    .model("claude-3-5-sonnet-20241022")
    .memory(memory_client)
    .max_tool_iterations(10)
    .tools(tool_registry)
    .build()?;
```

`Agent::from_config(config)` 是用于 RPC / channel 场景的工厂方法，从全局 `Config` 中读取 provider、model、token budget 等配置。

---

## 3. Turn 生命周期

`Agent::turn(user_message)` 是主入口（`session/turn.rs`）：

```
turn(user_message)
│
├─ [1] emit TurnStarted progress 事件
│
├─ [2] 系统提示初始化（仅首次 turn，history 为空）
│   ├─ try_load_session_transcript()     ← KV cache 恢复
│   ├─ fetch_connected_integrations()    ← 获取 Composio 连接
│   ├─ refresh_delegation_tools()        ← 注入 delegate_<toolkit> 工具
│   ├─ fetch_learned_context()           ← 读取 learned context
│   └─ build_system_prompt(learned)      ← 渲染系统提示（含 PROFILE.md / MEMORY.md）
│
├─ [3] 后续 turn：复用系统提示（KV cache 保护）
│   └─ 若 Composio 连接集合哈希变化 → 仅刷新 tool schema（系统提示不变）
│
├─ [4] auto_save：保存用户消息到 memory
│
├─ [5] Memory 上下文收集
│   ├─ collect_recall_citations()        ← 语义召回（top-5，相关度≥0.4）
│   └─ memory_loader.load_context()      ← 拼装 memory 注入块
│
├─ [6] 记忆树定期预取（every 30min，REFRESH_INTERVAL）
│   └─ tree_loader::TreeContextLoader::load()
│
├─ [7] 组装 enriched_message
│   ├─ context + user_message 拼接
│   └─ skills::inject::match_skills()    ← SKILL.md 按关键词匹配注入
│
├─ [8] 执行工具调用循环
│   └─ run_tool_call_loop(...)           ← 见第 4 节
│
├─ [9] 后台任务（fire-and-forget）
│   ├─ spawn_session_memory_extraction() ← archivist 记忆提取分叉
│   └─ publish_global(AgentTurnCompleted)
│
└─ return final_response
```

---

## 4. 工具调用循环 run_tool_call_loop

核心循环（`harness/tool_loop.rs`，875 行）：

### 4.1 入口与工具可见性

```rust
pub(crate) async fn run_tool_call_loop(
    provider: &dyn Provider,
    history: &mut Vec<ChatMessage>,
    tools_registry: &[Box<dyn Tool>],
    ...
    visible_tool_names: Option<&HashSet<String>>,   // per-agent 工具白名单
    extra_tools: &[Box<dyn Tool>],                  // per-turn 合成工具（delegation）
    on_progress: Option<Sender<AgentProgress>>,
) -> Result<String>
```

工具可见性规则：
- `None` → 所有工具可见（legacy / CLI 行为）
- `Some(set)` → 仅 set 内的工具对模型可见；模型若调用白名单外的工具会被拒绝

### 4.2 主循环结构

```
for iteration in 0..max_iterations:
    │
    ├─ Stop hooks 检查（TurnState）
    ├─ Context guard 检查（context window 利用率）
    ├─ Multimodal 图像标记计数（vision 能力校验）
    ├─ prepare_messages_for_provider（multimodal 预处理）
    │
    ├─ [进度] 启动 ProviderDelta → AgentProgress forwarder task
    │
    ├─ provider.chat(ChatRequest { messages, tools, stream })
    │   ├─ 成功：更新 TurnCost，emit TurnCostUpdated
    │   └─ 错误：transient（rate-limit/5xx）→ warn；其他 → Sentry + return Err
    │
    ├─ 解析响应
    │   ├─ parse_structured_tool_calls()    ← native tool calls（优先）
    │   └─ parse_tool_calls()              ← XML fallback（模型未用 native 时）
    │
    ├─ tool_calls 为空？
    │   ├─ 有 on_delta → 按 STREAM_CHUNK_MIN_CHARS(80) 分块发送
    │   ├─ history.push(ChatMessage::assistant(...))
    │   ├─ emit TurnCompleted
    │   └─ return response_text          ← 正常退出
    │
    └─ tool_calls 非空：
        ├─ 执行每个工具调用
        ├─ history.push(assistant_msg with tool_calls)
        ├─ history.extend(tool_results)
        └─ continue 下一轮迭代
│
max_iterations 耗尽 → return Err("max tool iterations reached")
```

### 4.3 迭代预算与默认值

```rust
pub(crate) const DEFAULT_MAX_TOOL_ITERATIONS: usize = 10;
// max_tool_iterations == 0 时使用默认值
```

---

## 5. 系统提示构建与 KV Cache 保护

### 5.1 构建时机

- **仅在第一个 turn（history 为空）时构建**
- 后续 turn 复用已存储的系统提示，不重建
- 目的：确保 inference backend 的 KV-cache prefix 字节稳定

### 5.2 构建内容（SystemPromptBuilder，`agent/prompts/`）

拼接顺序：
1. 身份/性格块（可被 sub-agent `omit_identity` 剥除）
2. 安全前言（可 `omit_safety_preamble`）
3. 记忆上下文（可 `omit_memory_context`）
4. PROFILE.md（可 `omit_profile`，默认 sub-agent 剥除）
5. MEMORY.md（可 `omit_memory_md`，默认 sub-agent 剥除）
6. SKILL.md 技能目录（可 `omit_skills_catalog`）
7. 工具调用指令（`build_tool_instructions_filtered`）
8. Connected Integrations 列表

### 5.3 KV Cache 保护机制

```
┌─ 系统提示只构建一次（首个 turn）
├─ 持久化为 session transcript → 下次启动通过 try_load_session_transcript() 恢复
├─ 动态上下文（memory recall）注入用户消息，而非系统提示
└─ Composio 变更：只刷新 function-calling schema（tools 字段），系统提示不变
```

---

## 6. 内存上下文注入

### 6.1 Memory Recall Citations

每个 turn 开始时：
```
collect_recall_citations(memory, user_message, limit=5, min_relevance=0.4)
→ Vec<RecallCitation>（语义相似度 top-5）
```

### 6.2 MemoryLoader

```
memory_loader.load_context(memory, user_message)
→ String（格式化的记忆块，前置于用户消息）
```

### 6.3 记忆树定期预取（#710）

- 每 `REFRESH_INTERVAL`（30 分钟）触发一次
- `TreeContextLoader::load()` → 跨命名空间记忆摘要
- 注入位置：用户消息前（系统提示不动，KV cache 保护）
- 失败 non-fatal，降级为不注入

### 6.4 SKILL.md 注入

```
skills::inject::match_skills(skills, user_message)
→ 匹配的 Skill 列表

inject::render_injection(matches, DEFAULT_MAX_INJECTION_BYTES, read_body)
→ 注入内容（有大小上限，防止撑爆上下文窗口）
```

---

## 7. Dispatcher：工具调用格式策略

`ToolDispatcher` trait（`agent/dispatcher.rs`）抽象了不同模型的工具调用"方言"：

| 实现 | 格式 | 适用场景 |
|---|---|---|
| `XmlToolDispatcher` | `<tool_call>` + JSON body | 不支持 native 工具调用的模型（XML fallback）|
| `NativeToolDispatcher` | OpenAI / Anthropic native tool_calls | 支持 native tool use 的 provider |
| `PFormatDispatcher` | P-Format（自定义结构）| 特殊场景 |

工具调用解析优先级：
1. 先尝试 `parse_structured_tool_calls`（native tool_calls 字段）
2. native 为空 → fallback `parse_tool_calls`（XML 解析）

---

## 8. Sub-Agent 体系

### 8.1 调度机制

父 Agent 通过 `spawn_subagent` 工具委派任务：

```
父 Agent → [spawn_subagent 工具调用]
    ↓
AgentDefinitionRegistry.get(agent_id)
    ↓
run_subagent(definition, options)
    ↓ 独立工具循环（结果不回流父 Agent 历史）
    ↓ 返回单条文本结果作为工具结果
父 Agent 继续
```

### 8.2 两种派发模式

| 模式 | 特点 |
|---|---|
| `Typed` | 按 AgentDefinition 过滤工具、精简系统提示；token 高效 |
| `Fork` | 完整继承父 Agent 的工具集和系统提示；适合深度委派 |

### 8.3 run_subagent 执行流程

```
run_subagent(definition, options)
├─ 读取 ParentExecutionContext（fork_context task-local）
├─ 解析模型（inherit / hint / exact）
├─ 过滤工具（tools whitelist / disallowed_tools / skill_filter）
├─ 构建精简系统提示（omit_* 标志剥除对应节区）
├─ 执行内层工具调用循环
├─ 结果不写入父 Agent history（仅返回文本）
└─ 发布 DomainEvent::SubagentCompleted / SubagentFailed
```

### 8.4 ParentExecutionContext（fork_context.rs）

基于 tokio `task_local!`，在 sub-agent 的 task 范围内可读取父 Agent 的执行上下文，无需参数传递。

---

## 9. 内建 Agent 清单

每个内建 Agent 位于 `agents/<name>/`，包含 `agent.toml`（元数据）、`prompt.md`（系统提示参考）和 `prompt.rs`（动态构建函数）：

| Agent ID | 用途 |
|---|---|
| `orchestrator` | 核心入口协调 Agent，路由用户请求到专用 Agent |
| `researcher` | 联网研究与信息收集 |
| `planner` | 任务规划与分解 |
| `code_executor` | 代码执行与调试 |
| `critic` | 审查与评估 |
| `summarizer` | 内容总结 |
| `archivist` | 记忆提取与整理（后台 fire-and-forget）|
| `tool_maker` | 工具创建 |
| `skill_creator` | Skill 包创建 |
| `tools_agent` | 通用工具调用 |
| `integrations_agent` | Composio 集成操作 |
| `trigger_reactor` | 外部触发响应（cron / webhook）|
| `trigger_triage` | 外部触发分类（高性能，小模型）|
| `morning_briefing` | 早报生成 |
| `crypto_agent` | 加密货币相关操作 |
| `help` | 帮助引导 |
| `welcome` | 新用户欢迎（第一次启动流程）|

还有一个合成的 `fork` agent（由 `builtin_definitions.rs` 动态注入，无 agent.toml）。

---

## 10. AgentDefinition 数据模型

```toml
# agent.toml 结构示例
id = "researcher"
when_to_use = "当需要联网搜索或收集外部信息时使用"
display_name = "Researcher"
system_prompt = { inline = "..." }   # 或 { file = "prompt.md" } 或 { dynamic = true }

omit_identity = true          # 剥除父 Agent 身份节区
omit_memory_context = true    # 剥除记忆上下文
omit_safety_preamble = true   # 剥除安全前言
omit_skills_catalog = true    # 剥除技能目录
omit_profile = true           # 剥除 PROFILE.md
omit_memory_md = true         # 剥除 MEMORY.md

[model]
# inherit / hint / exact
spec = { inherit = {} }       # 继承父 Agent 的模型

[tool_scope]
tools = ["web_search", "fetch_url"]   # 工具白名单
disallowed_tools = []

sandbox_mode = "none"
max_tool_iterations = 5
```

**用户自定义 Agent 定义**可放置于：
- `$OPENHUMAN_WORKSPACE/agents/*.toml`（项目级）
- `~/.openhuman/agents/*.toml`（用户全局）

id 冲突时用户定义覆盖内建。

---

## 11. AgentProgress 进度事件

`AgentProgress` 枚举（`agent/progress.rs`）通过 `mpsc::Sender` 流式传递给上层：

| 事件 | 时机 |
|---|---|
| `TurnStarted` | turn() 开始时 |
| `IterationStarted { iteration, max_iterations }` | 每次 LLM 调用前 |
| `TextDelta { delta, iteration }` | 流式文本增量 |
| `ThinkingDelta { delta, iteration }` | 思考内容增量（Anthropic extended thinking）|
| `ToolCallArgsDelta { call_id, tool_name, delta, iteration }` | 工具参数流式增量 |
| `TurnCostUpdated { model, iteration, input/output_tokens, total_usd }` | 每次 LLM 响应后 |
| `TurnCompleted { iterations }` | turn 正常结束 |

---

## 12. Stop Hooks

`StopHook` trait（`agent/stop_hooks.rs`）在每次 LLM 调用前执行策略检查：

```rust
pub trait StopHook: Send + Sync {
    fn name(&self) -> &str;
    async fn check(&self, state: &TurnState) -> StopDecision;
}

pub enum StopDecision {
    Continue,
    Stop { reason: String },
}
```

`TurnState` 包含当前迭代数、最大迭代数、`TurnCost`（token/USD）、模型名。

`current_stop_hooks()` 从 task-local 获取当前注册的 hooks 列表，可在测试或高级编排中注入自定义策略（如 cost budget 限制）。
