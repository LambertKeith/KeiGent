# 模块四：记忆系统

> 核心文件：`agent/memory_provider.py`、`agent/memory_manager.py`、`hermes_state.py`、`agent/insights.py`、`tools/session_search_tool.py`
> 版本：v0.14.0+

---

## 目录

1. [记忆系统全景](#1-记忆系统全景)
2. [内置记忆（builtin provider）](#2-内置记忆builtin-provider)
3. [MemoryProvider ABC](#3-memoryprovider-abc)
4. [MemoryManager：编排层](#4-memorymanager编排层)
5. [外部记忆 Provider 列表](#5-外部记忆-provider-列表)
6. [记忆注入流程](#6-记忆注入流程)
7. [SessionDB：会话存储](#7-sessiondb会话存储)
8. [FTS5 全文搜索](#8-fts5-全文搜索)
9. [session_search_tool：Agent 端搜索](#9-session_search_toolagent-端搜索)
10. [Insights：用量分析](#10-insights用量分析)
11. [记忆 Nudge 机制](#11-记忆-nudge-机制)
12. [配置参考](#12-配置参考)

---

## 1. 记忆系统全景

Hermes 的记忆系统由三个相互独立但协作的子系统构成：

```
┌─────────────────────────────────────────────────────────────────────┐
│                        记忆系统三层                                  │
├──────────────────┬─────────────────────┬────────────────────────────┤
│ 内置记忆          │ 外部 Memory Provider │ 会话存储（SessionDB）       │
│ MEMORY.md        │ honcho / mem0 / ...  │ SQLite + FTS5              │
│ USER.md          │ 语义向量召回          │ 结构化历史 + 全文搜索        │
│ 键值持久化         │ 对话摘要同步          │ Token 统计 + insights      │
│ memory 工具       │ 系统提示注入          │ session_search 工具        │
└──────────────────┴─────────────────────┴────────────────────────────┘
```

**关键约束**：每个 session 只能有**一个**外部 provider 运行（防止 schema 臃肿和 provider 冲突）。通过 `memory.provider` 配置选择，builtin 永远存在。

---

## 2. 内置记忆（builtin provider）

内置记忆是最基础的持久化机制，不依赖任何外部服务。

### 2.1 文件结构

```
~/.hermes/
├── MEMORY.md      # 关键事实、偏好、知识片段（结构化或自由格式）
└── USER.md        # 用户模型（背景、沟通风格、目标）
```

这两个文件在每次 session 的系统提示中直接注入（通过 `load_soul_md()` / `build_context_files_prompt()`），是成本最低的记忆形式。

### 2.2 memory 工具操作

Agent 通过 `memory` 工具操作内置记忆：

| 操作 | 说明 |
|---|---|
| `read` | 读取 MEMORY.md / USER.md 全文 |
| `write` | 追加新内容到 MEMORY.md |
| `update` | 更新已有条目 |
| `delete` | 删除条目 |
| `read_user` | 读取 USER.md |
| `write_user` | 更新用户模型 |

**注意**：`memory` 工具是 Agent-level 工具，在 `run_agent.py` 中直接处理，不经过 `tools/registry.py::dispatch()`。

### 2.3 MEMORY.md 格式建议

虽然格式自由，但按 key-value 组织效果最好：

```markdown
# Memory

## User Preferences
- Language: 中文回复
- Code style: 4-space indent, no semicolons

## Project Context
- Working on: Hermes Agent integration
- Main codebase: /Users/lvnanbin/Projects/KeiGent

## Key Facts
- User timezone: Asia/Shanghai
```

---

## 3. MemoryProvider ABC

`agent/memory_provider.py:42`，所有外部 provider 必须实现的接口。

### 3.1 核心方法

```python
class MemoryProvider(ABC):

    @property
    @abstractmethod
    def name(self) -> str:
        """短标识符（如 'honcho'、'mem0'）"""

    @abstractmethod
    def is_available(self) -> bool:
        """检查 provider 是否就绪（不发起网络请求）"""

    @abstractmethod
    def initialize(self, session_id: str, **kwargs) -> None:
        """session 开始时初始化（建立连接、创建资源）
        
        kwargs 包含：
          hermes_home: str      # 当前 profile 的 HERMES_HOME 路径
          platform: str         # "cli" / "telegram" / "discord" / "cron" 等
          agent_context: str    # "primary" / "subagent" / "cron" / "flush"
          agent_identity: str   # profile 名（如 "coder"）
          agent_workspace: str  # 工作空间名
          parent_session_id: str
          user_id: str          # 网关平台的用户标识
        """
```

### 3.2 可选钩子方法

| 方法 | 触发时机 | 说明 |
|---|---|---|
| `system_prompt_block()` | 系统提示构建时 | 返回静态文字注入系统提示（如 provider 的使用说明） |
| `prefetch(query, session_id)` | 每轮 API 调用前 | 返回相关记忆文本，注入用户消息 |
| `queue_prefetch(query)` | 每轮结束后 | 后台预拉取下一轮内容，`prefetch()` 从缓存取 |
| `sync_turn(user, assistant, session_id)` | 每轮完成后 | 将对话持久化到 provider 后端 |
| `get_tool_schemas()` | agent 初始化时 | 返回该 provider 暴露给 LLM 的工具 schema |
| `handle_tool_call(name, args)` | 工具调用时 | 处理该 provider 的工具调用 |
| `shutdown()` | session 结束时 | 清理连接 |
| `on_turn_start(turn, message)` | 每轮开始前 | 节拍追踪（context cadence / dialectic cadence） |
| `on_session_end(messages)` | session 结束时 | 端到端提取摘要写入 provider |
| `on_session_switch(new_id)` | session ID 变化时 | 处理上下文压缩后的 session 轮换 |
| `on_pre_compress(messages)` | 上下文压缩前 | 压缩前提取关键信息存入 provider |
| `on_memory_write(action, target, content)` | 内置记忆写入时 | 镜像内置 memory 操作到外部 provider |
| `on_delegation(task, result)` | 子 Agent 完成时 | 父 Agent 观察子 Agent 的工作结果 |
| `post_setup(hermes_home, config)` | setup wizard 时 | 提供 `hermes setup` 的集成配置流程 |

### 3.3 agent_context 语义

`initialize()` 的 `agent_context` 参数很重要，provider 应据此决定是否执行写操作：

| agent_context | 含义 | 建议行为 |
|---|---|---|
| `primary` | 主对话（用户直接发起） | 正常读写 |
| `subagent` | 由 `delegate_task` 派生的子 Agent | 只读，或写入隔离空间 |
| `cron` | Cron 定时任务 | 跳过写入（cron 系统提示会污染用户画像）|
| `flush` | 显式 memory flush 操作 | 强制写入 |

---

## 4. MemoryManager：编排层

`agent/memory_manager.py:244`，管理 builtin + 最多一个外部 provider 的协调层。

### 4.1 Provider 注册规则

```python
manager.add_provider(builtin_provider)    # builtin 永远允许
manager.add_provider(honcho_provider)     # 外部 provider，只允许一个
manager.add_provider(mem0_provider)       # 被拒绝！已有外部 provider
```

### 4.2 工具路由

各 provider 的 `get_tool_schemas()` 返回的工具，在 `MemoryManager` 初始化时建立路由表：

```python
self._tool_to_provider = {
    "memory": builtin_provider,         # 内置 memory 工具
    "honcho_memory": honcho_provider,   # honcho 暴露的工具
    "recall": mem0_provider,            # mem0 暴露的工具
    ...
}
```

`handle_tool_call(name, args)` 按路由表分发，任何 provider 的失败不影响其他 provider。

### 4.3 编排方法

| 方法 | 说明 |
|---|---|
| `build_system_prompt()` | 收集所有 provider 的 `system_prompt_block()`，合并注入系统提示 |
| `prefetch_all(query, session_id)` | 并行收集所有 provider 的 `prefetch()`，合并成上下文块 |
| `queue_prefetch_all(query)` | 触发所有 provider 的后台预拉取 |
| `sync_all(user, assistant, session_id)` | 通知所有 provider 同步本轮对话 |
| `get_all_tool_schemas()` | 收集所有 provider 的工具 schema（去重）|
| `on_turn_start(turn, message)` | 广播 turn 开始事件（节拍追踪）|
| `on_session_end(messages)` | 广播 session 结束（摘要提取）|
| `on_pre_compress(messages)` | 压缩前通知（关键信息保存）|

**所有方法都是 fail-open**：任何 provider 的异常只会打日志，不会中断主流程。

---

## 5. 外部记忆 Provider 列表

集合已关闭（2026-05 政策），现有 8 个内置 provider：

| Provider | 说明 | 特性 |
|---|---|---|
| **honcho** | [Plastic Labs Honcho](https://github.com/plastic-labs/honcho) | Dialectic 用户建模，多轮对话推断用户画像 |
| **mem0** | [mem0](https://mem0.ai) | 向量语义记忆，自动提取事实存储 |
| **supermemory** | [Supermemory](https://supermemory.ai) | 结构化长期记忆 |
| **byterover** | ByteRover | 向量检索记忆 |
| **hindsight** | Hindsight | 会话回顾与摘要 |
| **holographic** | Holographic Memory | 多维向量记忆 |
| **openviking** | OpenViking | 开源记忆后端 |
| **retaindb** | RetainDB | 持久化键值记忆 |

**新 provider 发布方式**：作为独立 Python 包，实现 `MemoryProvider` ABC，通过 `~/.hermes/plugins/memory/<name>/` 安装（`kind: exclusive`），不合并到主仓库。

### 5.1 切换 Provider

```yaml
# ~/.hermes/config.yaml
memory:
  provider: honcho    # 选择活跃的外部 provider
  # 各 provider 的私有配置在 memory.<provider_name>. 下
  honcho:
    app_id: "my-app"
    environment: production
```

```bash
hermes memory setup   # 引导配置当前 provider（调用 post_setup()）
```

---

## 6. 记忆注入流程

外部 provider 的召回内容通过**用户消息注入**（而非系统提示），确保 prefix cache 不被破坏：

```python
# conversation_loop.py，api_messages 构建阶段
if idx == current_turn_user_idx and msg.get("role") == "user":
    _injections = []

    # 外部 provider 的预拉取结果
    if _ext_prefetch_cache:
        _fenced = build_memory_context_block(_ext_prefetch_cache)
        _injections.append(_fenced)

    # plugin pre_llm_call 返回的 context
    if _plugin_user_context:
        _injections.append(_plugin_user_context)

    if _injections:
        api_msg["content"] += "\n\n" + "\n\n".join(_injections)
```

### 6.1 build_memory_context_block()

`agent/memory_manager.py:227`，将 provider 返回的文本包装为标准格式：

```xml
<memory-context>
Provider recall text here...
</memory-context>
```

### 6.2 StreamingContextScrubber

`agent/memory_manager.py:62`，处理流式响应中记忆块被分割在不同 delta 的情况：

```
delta 1: "...text before <memory-"
delta 2: "context>recalled memory</memory-context> text after..."
```

普通正则无法跨 delta 边界匹配，`StreamingContextScrubber` 维护状态机，在流式输出时正确过滤掉记忆块，防止内部上下文泄露到用户界面。

### 6.3 sanitize_context()

`agent/memory_manager.py:54`，单次（非流式）文本净化：

```python
# 删除内部上下文块
_INTERNAL_CONTEXT_RE = re.compile(r'<memory-context>.*?</memory-context>', re.DOTALL)
# 删除内部注记
_INTERNAL_NOTE_RE = re.compile(r'\[System:.*?\]', re.DOTALL)
# 删除 fence 标签
_FENCE_TAG_RE = re.compile(r'</?(?:memory-context|system-note)>', re.IGNORECASE)
```

---

## 7. SessionDB：会话存储

`hermes_state.py:311`，所有 session 数据的持久化后端。

### 7.1 技术规格

| 特性 | 实现 |
|---|---|
| 存储后端 | SQLite（WAL 模式）|
| 全文搜索 | FTS5 扩展 |
| 并发模型 | 多读单写（WAL + 应用层写入重试）|
| 写入重试 | `BEGIN IMMEDIATE` + 20–150ms 随机 jitter，最多 15 次 |
| WAL checkpoint | 每 50 次成功写入触发一次 PASSIVE checkpoint |
| 路径 | `~/.hermes/sessions/state.db`（profile-aware）|

### 7.2 数据库 Schema（主要表）

```sql
-- 会话元数据
CREATE TABLE sessions (
    session_id     TEXT PRIMARY KEY,
    source         TEXT,            -- "cli" / "telegram" / "cron" 等
    title          TEXT,
    system_prompt  TEXT,            -- 用于跨 turn 复用（prefix cache）
    start_time     REAL,
    end_time       REAL,
    end_reason     TEXT,
    -- Token 统计
    input_tokens          INTEGER DEFAULT 0,
    output_tokens         INTEGER DEFAULT 0,
    cache_read_tokens     INTEGER DEFAULT 0,
    cache_write_tokens    INTEGER DEFAULT 0,
    reasoning_tokens      INTEGER DEFAULT 0,
    -- 费用估算
    estimated_cost_usd    REAL,
    cost_status           TEXT,
    -- 关联
    parent_session_id     TEXT,     -- 上下文压缩后的原 session
    compression_tip       TEXT      -- 压缩摘要指针
);

-- 消息内容
CREATE TABLE messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(session_id),
    role       TEXT,
    content    TEXT,   -- JSON 编码（支持多模态）
    timestamp  REAL
);

-- FTS5 全文索引
CREATE VIRTUAL TABLE messages_fts USING fts5(
    content,
    session_id UNINDEXED,
    tokenize="unicode61 categories 'L* N* Co'"  -- 支持 CJK 字符
);

-- 元数据 KV 存储
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
```

### 7.3 核心方法

**会话生命周期**：

| 方法 | 说明 |
|---|---|
| `create_session(session_id, source)` | 创建 session 行 |
| `ensure_session(session_id, source)` | 不存在则创建（幂等）|
| `end_session(session_id, end_reason)` | 标记 session 结束 |
| `reopen_session(session_id)` | 重新激活已结束 session |
| `get_session(session_id)` | 读取 session 元数据 |
| `resolve_session_id(prefix)` | 前缀匹配 session_id |
| `delete_session(session_id)` | 删除 session + 消息 |
| `prune_sessions(...)` | 批量清理旧 session |

**系统提示缓存**：

```python
update_system_prompt(session_id, system_prompt)
# 网关模式下每个 turn 创建新 AIAgent，这个方法让后续 turn 复用系统提示
# 确保 prefix cache 跨 turn 命中
```

**Token 统计**：

```python
update_token_counts(
    session_id,
    input_tokens=100,
    output_tokens=50,
    cache_read_tokens=80,
    cache_write_tokens=20,
    reasoning_tokens=10,
    estimated_cost_usd=0.001,
    api_call_count=1,
)
# 每次 API 调用后累加，供 /insights 命令读取
```

**消息操作**：

| 方法 | 说明 |
|---|---|
| `append_message(session_id, role, content)` | 追加消息（同时写 FTS5 索引）|
| `replace_messages(session_id, messages)` | 替换全部消息（上下文压缩后用）|
| `get_messages(session_id)` | 读取全部消息 |
| `get_messages_around(session_id, msg_id, window)` | 读取指定消息前后的上下文窗口 |
| `get_anchored_view(session_id, anchor)` | 围绕 anchor 消息的视图 |

**会话清理**：

```python
prune_empty_ghost_sessions()           # 清理无消息的空 session
finalize_orphaned_compression_sessions()  # 修复未正常结束的压缩 session
```

### 7.4 写入竞争处理

多进程场景（gateway + CLI + cron + kanban workers 同时写入）下的写入竞争策略：

```python
# BEGIN IMMEDIATE 在事务开始时立即获取写锁
# SQLite timeout=1.0s（短超时避免长时间阻塞）
# 应用层 jitter retry：20~150ms 随机等待，最多 15 次
# 比 SQLite 内置 busy handler 的确定性等待分散更好，避免 convoy 效应
```

---

## 8. FTS5 全文搜索

### 8.1 搜索功能

`hermes_state.py::SessionDB.search_messages()` 和 `search_sessions()`，支持：

- **FTS5 全文查询**：`word1 AND word2`、`"exact phrase"`、`word*`（前缀）、`NOT word`
- **CJK 支持**：使用 `unicode61` tokenizer + `categories 'L* N* Co'`，正确处理中日韩文本
- **CJK 特殊处理**：超过 50% CJK 字符的短 query（< 20 字符）自动转为 LIKE 搜索，避免 CJK 分词问题
- **时间范围过滤**：`start_time` / `end_time` 参数
- **来源过滤**：按 `source`（cli / telegram 等）过滤
- **高亮**：可返回匹配上下文片段

### 8.2 FTS5 查询净化

```python
def _sanitize_fts5_query(query: str) -> str:
    # 清理非法 FTS5 运算符
    # 处理未闭合的引号
    # 净化特殊字符，防止 FTS5 语法错误
```

### 8.3 LLM 摘要召回

`tools/session_search_tool.py` 的 `session_search` 工具支持两级搜索：

1. FTS5 关键词搜索，返回匹配的消息片段
2. 可选：对搜索结果请求 auxiliary LLM 生成摘要，提供语义层面的召回

---

## 9. session_search_tool：Agent 端搜索

`tools/session_search_tool.py`，Agent 可以在对话中搜索自己的历史会话。

### 9.1 工具参数

```python
session_search(
    query: str,           # 搜索关键词（支持 FTS5 语法）
    limit: int = 10,      # 返回条数
    session_id: str = "",  # 限定 session
    include_summary: bool = False,  # 是否生成 LLM 摘要
    start_time: float = None,
    end_time: float = None,
)
```

### 9.2 返回格式

```json
{
    "success": true,
    "query": "hermes plugin system",
    "results": [
        {
            "session_id": "sess_abc123",
            "title": "Plugin 开发讨论",
            "timestamp": 1716900000.0,
            "role": "assistant",
            "snippet": "...插件系统由四条独立发现路径构成...",
            "context_before": "...",
            "context_after": "..."
        }
    ],
    "summary": "跨 3 个会话找到 5 条相关对话，主要涵盖..."
}
```

---

## 10. Insights：用量分析

`agent/insights.py:93 InsightsEngine`，为 `/insights [--days N]` 命令提供数据。

### 10.1 分析维度

- **Token 用量**：per-session 和时间段汇总（input / output / cache_read / cache_write）
- **费用估算**：`_estimate_cost()` 按 provider 计费规则计算（含 Anthropic cache 折扣）
- **工具调用频率**：统计各工具被调用次数，横向 bar chart 输出
- **会话时长分布**：按时间段分组统计
- **模型使用分布**：哪个 model 用了多少

### 10.2 费用估算

```python
def _estimate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
    provider: str = None,
) -> float:
    # 按 provider 的计费规则（$/1M token）
    # cache_read 通常按 0.1× 计费
    # cache_write 按 1.25× 计费（Anthropic）
    # 未知 model 返回 None
```

### 10.3 输出格式

```
Sessions: 47 (last 30 days)
──────────────────────────
Token Usage:
  Input:       1,234,567   ($2.47)
  Output:        234,567   ($3.52)
  Cache Read:    987,654   ($0.19)   ← 80% cache hit
  Cache Write:    50,000   ($0.08)
  Total Est.             ≈ $6.26

Top Tools:
  terminal       ████████████████████  234
  read_file      ████████████          142
  web_search     ████████              98
  ...
```

---

## 11. 记忆 Nudge 机制

Hermes 通过"nudge"（轻推）机制让 Agent 在适当时机主动整理和更新记忆，无需用户提示。

### 11.1 Memory Nudge

```python
# conversation_loop.py，每 turn 开始时检查
if memory_nudge_interval > 0 and "memory" in valid_tool_names:
    agent._turns_since_memory += 1
    if agent._turns_since_memory >= memory_nudge_interval:
        _should_review_memory = True
        agent._turns_since_memory = 0
```

当 `_should_review_memory = True` 时，在本 turn 完成后的 `_spawn_background_review()` 中，后台 fork 一个新 Agent turn，系统提示中注入：

> "请检查最近的对话，更新 MEMORY.md 和 USER.md 中你认为值得持久化的信息。"

### 11.2 Skill Nudge

```python
# 每个工具调用循环迭代时
if "skill_manage" in valid_tool_names:
    agent._iters_since_skill += 1

# 循环结束后
if _iters_since_skill >= skill_nudge_interval:
    _should_review_skills = True
    agent._iters_since_skill = 0
```

当 `_should_review_skills = True` 时，后台注入提示：

> "你最近完成了一项复杂任务。如果你发现了值得以技能形式保留的可复用流程，请创建或更新相关技能文档。"

### 11.3 计数器恢复（网关模式）

网关每条消息创建新 `AIAgent`，counter 重置为 0，导致 nudge 永远不触发。初始化时从历史消息数恢复：

```python
prior_user_turns = sum(1 for m in history if m.get("role") == "user")
agent._user_turn_count = prior_user_turns
agent._turns_since_memory = prior_user_turns % memory_nudge_interval
```

---

## 12. 配置参考

### 12.1 memory 节

```yaml
# ~/.hermes/config.yaml
memory:
  provider: ""                  # 外部 provider 名（"honcho" / "mem0" 等），空=不使用
  nudge_interval: 10            # 每 N turn 触发一次记忆 review（0=禁用）
  enabled: true

  # 各 provider 的私有配置在 memory.<provider_name>. 下
  honcho:
    app_id: "hermes-agent"
    environment: "production"
```

### 12.2 skills 记忆配置

```yaml
skills:
  nudge_interval: 5             # 每 N 次工具迭代触发一次技能 review（0=禁用）
  config:                       # 技能私有配置
    my_skill_key: "value"
```

### 12.3 SessionDB 路径

```
~/.hermes/sessions/state.db          # 主 DB（profile-aware）
~/.hermes/sessions/<session_id>.json  # 可选 JSON 日志
```

通过 `hermes_constants.get_hermes_home()` 获取路径，永远不硬编码 `~/.hermes`。

### 12.4 会话管理命令

```bash
hermes sessions list              # 列出历史会话
hermes sessions search <query>    # 搜索历史会话
hermes sessions export <id>       # 导出 session
hermes sessions delete <id>       # 删除 session
hermes sessions prune             # 清理旧 session
/resume                           # 在 CLI 中恢复会话
/insights [--days N]              # 查看用量统计
```
