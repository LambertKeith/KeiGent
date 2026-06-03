# 模块二：工具系统

> 核心文件：`tools/registry.py`、`model_tools.py`、`toolsets.py`
> 版本：v0.14.0+

---

## 目录

1. [三层架构概览](#1-三层架构概览)
2. [第一层：ToolRegistry（注册中心）](#2-第一层toolregistry注册中心)
3. [第二层：model_tools（调度层）](#3-第二层model_tools调度层)
4. [第三层：toolsets（工具集）](#4-第三层toolsets工具集)
5. [工具定义与自动发现](#5-工具定义与自动发现)
6. [工具集列表](#6-工具集列表)
7. [工具调用完整链路](#7-工具调用完整链路)
8. [特殊工具说明](#8-特殊工具说明)
9. [子 Agent 委派（delegate_task）](#9-子-agent-委派delegate_task)
10. [添加新工具](#10-添加新工具)

---

## 1. 三层架构概览

```
tools/registry.py          ← 无外部依赖，所有工具文件在 import 时注册
       ↑
tools/*.py                 ← 每个文件 import 时调用 registry.register()
       ↑
model_tools.py             ← 导入 registry，触发工具自动发现；提供调度入口
  + hermes_cli/plugins.py  ← discover_plugins() 作为副作用同时触发
       ↑
run_agent.py / cli.py / batch_runner.py / environments/
```

**依赖链规则**：`tools/registry.py` 故意没有任何非标准库依赖，确保所有工具文件都能安全 import 它而不产生循环依赖。

---

## 2. 第一层：ToolRegistry（注册中心）

`tools/registry.py:151`，进程内单例（`registry = ToolRegistry()`），所有工具的元数据和 handler 都存放于此。

### 2.1 ToolEntry 数据结构

```python
class ToolEntry:
    name:                    str       # 工具名，即 LLM 调用的 function name
    toolset:                 str       # 所属工具集
    schema:                  dict      # OpenAI function schema
    handler:                 Callable  # 实际执行函数
    check_fn:                Callable  # 可选：检查工具是否可用（env var、依赖等）
    requires_env:            list      # 声明所需 env var（供 hermes config UI 提示）
    is_async:                bool      # handler 是否为 async
    description:             str       # 工具描述
    emoji:                   str       # 显示用 emoji
    max_result_size_chars:   int|None  # 结果截断上限
    dynamic_schema_overrides: Callable # 运行时动态 schema 覆盖（零参，返回 dict）
```

**dynamic_schema_overrides**：用于 schema 依赖运行时配置的场景。例如 `delegate_task` 的 description 需要体现当前的 `delegation.max_concurrent_children` 和 `max_spawn_depth` 配置值，每次 `get_definitions()` 时动态计算并覆盖静态 schema。

### 2.2 check_fn 与 TTL 缓存

`check_fn` 用于在运行时判断工具是否可用，典型用途：

| 工具 | check_fn 检查内容 |
|---|---|
| `terminal` | Docker daemon / Modal SDK / SSH 连接是否就绪 |
| `browser_*` | Playwright 是否已安装 |
| `send_message` | Gateway 是否正在运行 |
| `ha_*` | `HASS_TOKEN` env var 是否存在 |
| `computer_use` | cua-driver 是否已安装（macOS only）|
| `kanban_*` | `HERMES_KANBAN_TASK` 是否设置 |

`check_fn` 结果被 TTL 缓存 30 秒（`_check_fn_cached()`），避免每次 `get_definitions()` 都探测外部状态（Docker / playwright / Modal 等探测有显著延迟）。调用 `invalidate_check_fn_cache()` 可手动清除缓存（`hermes tools enable` 后立即生效）。

### 2.3 register() 的冲突保护

```python
registry.register(
    name="my_tool",
    toolset="my_toolset",
    schema={...},
    handler=my_handler,
    override=False,   # 默认 False：不允许覆盖不同 toolset 的同名工具
)
```

冲突处理逻辑：

| 场景 | 行为 |
|---|---|
| 同 toolset 重复注册 | 覆盖（常见于 MCP server refresh） |
| MCP → MCP 跨 toolset 覆盖 | 允许（MCP server 间 tool 名冲突合法） |
| 不同 toolset 覆盖，`override=False` | **REJECTED**，打 ERROR 日志 |
| 不同 toolset 覆盖，`override=True` | 允许，打 INFO 日志（可审计） |

### 2.4 generation 计数器

每次 `register()` / `deregister()` / `register_toolset_alias()` 都会 `_generation += 1`。`model_tools.get_tool_definitions()` 将 `_generation` 纳入缓存 key，确保工具集变化后自动失效。

### 2.5 主要方法

| 方法 | 说明 |
|---|---|
| `register(...)` | 注册工具 |
| `deregister(name)` | 注销工具（MCP tool list 变化时用） |
| `get_entry(name)` | 按名获取 ToolEntry |
| `get_definitions(tool_names)` | 返回 OpenAI format schema 列表（含 check_fn 过滤） |
| `dispatch(name, args, **kwargs)` | 执行工具，自动桥接 async handler |
| `get_registered_toolset_names()` | 列出所有已注册 toolset 名 |
| `register_toolset_alias(alias, toolset)` | 注册 toolset 别名 |

---

## 3. 第二层：model_tools（调度层）

`model_tools.py`，连接 registry 与 Agent 循环的桥梁。

### 3.1 get_tool_definitions()

`model_tools.py:264`，在每次 API 调用前由 `run_agent.py` 调用，返回最终发给 LLM 的工具 schema 列表。

**缓存机制**（`quiet_mode=True` 时生效）：

```python
cache_key = (
    frozenset(enabled_toolsets),    # 启用的工具集
    frozenset(disabled_toolsets),   # 禁用的工具集
    registry._generation,           # 工具注册状态
    (config_mtime_ns, config_size), # config.yaml 文件指纹（感知动态 schema 变化）
    bool(HERMES_KANBAN_TASK),       # kanban worker 标志
)
```

缓存结果返回**浅拷贝**（`list(cached)`），避免调用方的 append 操作污染缓存。这修复了网关场景下长时间运行进程中工具名重复累积导致 DeepSeek / Xiaomi MiMo / Kimi 报 HTTP 400 的问题（issue #17335）。

**kanban worker 注入**：若 `HERMES_KANBAN_TASK` 环境变量存在（dispatcher 派生的 worker），强制在 `enabled_toolsets` 中追加 `"kanban"`，确保 worker 始终能调用 `kanban_complete` / `kanban_block` 等生命周期工具。

**工具集展开逻辑（_compute_tool_definitions）**：

```
enabled_toolsets 指定？
  ├─ 是 → 逐一 resolve_toolset() 展开（递归处理 includes），取并集
  └─ 否 → 从所有 toolset 展开

disabled_toolsets → 从结果中减去（difference_update）
最后调用 registry.get_definitions(tools_to_include) → check_fn 过滤 → schema 列表
```

**注意**：disabled_toolsets 是**最后一步减法**，确保即使某个复合 toolset（如 `hermes-cli`）包含了被禁工具，也能被正确剔除（issue #17309）。

### 3.2 handle_function_call()

`model_tools.py:741`，工具调用的统一分发入口。

```python
def handle_function_call(
    function_name: str,
    function_args: dict,
    task_id: str = None,
    session_id: str = None,
    tool_call_id: str = None,
    user_task: str = None,
    skip_pre_tool_call_hook: bool = False,
    enabled_tools: list = None,
) -> str:  # 返回 JSON 字符串
```

执行顺序：

```
1. 拦截 Agent-level 工具（todo / memory），不走 registry
2. Plugin pre_tool_call hook（可 block）
3. ACP edit approval（VS Code / Zed 编辑审批）
4. read-loop tracker 通知（非读/搜工具时重置连续计数）
5. 计时开始（_dispatch_start = time.monotonic()）
6. registry.dispatch(name, args, task_id, ...)
7. duration_ms 计算
8. Plugin post_tool_call hook（observer）
9. Plugin transform_tool_result hook（可替换结果）
10. 返回结果 JSON 字符串
```

### 3.3 coerce_tool_args()

`model_tools.py:545`，在 `handle_function_call` 调用前对 LLM 传入的参数进行类型强转：

- 字符串 `"true"` / `"false"` → bool
- 字符串 `"123"` → int / float
- JSON 字符串 `'{"key": "val"}'` → dict / list
- `None` 值在 schema 允许 null 时保留，否则使用默认值

这是为了应对 LLM 把所有参数当字符串输出的常见问题。

### 3.4 _AGENT_LOOP_TOOLS

部分工具被 Agent 循环在分发前拦截，不经过 `registry.dispatch()`：

```python
_AGENT_LOOP_TOOLS = {"todo", "memory"}
```

这些工具需要访问 agent 实例内部状态（`_todo_store`、`_memory_store`），因此在 `run_agent.py` 中直接处理。

---

## 4. 第三层：toolsets（工具集）

`toolsets.py`，定义工具的分组与平台适配逻辑。

### 4.1 核心数据结构

```python
TOOLSETS = {
    "web": {
        "description": "Web research and content extraction tools",
        "tools": ["web_search", "web_extract"],
        "includes": []           # 可引用其他 toolset name，实现继承
    },
    "debugging": {
        "description": "Debugging and troubleshooting toolkit",
        "tools": ["terminal", "process"],
        "includes": ["web", "file"]   # 继承 web + file 的所有工具
    },
    ...
}
```

### 4.2 resolve_toolset()

`toolsets.py:600`，递归展开一个 toolset（处理 `includes` 继承），返回去重后的工具名列表：

```python
def resolve_toolset(name: str, visited: Set[str] = None) -> List[str]:
    # 防循环引用
    # 展开 tools[] + 递归展开 includes[] 中的每个 toolset
    # 返回去重列表
```

### 4.3 _HERMES_CORE_TOOLS

所有平台（CLI / 网关各平台）共用的默认工具捆绑包，修改一处即同步所有平台：

```python
_HERMES_CORE_TOOLS = [
    "web_search", "web_extract",                          # Web
    "terminal", "process",                                # 终端
    "read_file", "write_file", "patch", "search_files",  # 文件
    "vision_analyze", "image_generate",                   # 视觉/图像
    "skills_list", "skill_view", "skill_manage",          # 技能
    "browser_navigate", "browser_snapshot", ...,          # 浏览器
    "text_to_speech",                                     # TTS
    "todo", "memory",                                     # 规划/记忆
    "session_search",                                     # 历史搜索
    "clarify",                                            # 澄清询问
    "execute_code", "delegate_task",                      # 代码执行/子 Agent
    "cronjob",                                            # 定时任务
    "send_message",                                       # 跨平台消息
    "ha_*",                                               # Home Assistant（check_fn 守卫）
    "kanban_*",                                           # 看板（check_fn 守卫）
    "computer_use",                                       # 桌面控制（check_fn 守卫）
]
```

**check_fn 守卫**：`send_message` / `ha_*` / `kanban_*` / `computer_use` 虽然在 core tools 列表中，但各自有 `check_fn` 检查运行时条件，条件不满足时不出现在 LLM 的工具 schema 中。

### 4.4 _HERMES_WEBHOOK_SAFE_TOOLS

Webhook 触发的 Agent 使用受限工具集，防止不可信第三方内容（PR 标题 / issue 注释等）触发本地文件/系统操作：

```python
_HERMES_WEBHOOK_SAFE_TOOLS = ["web_search", "web_extract", "vision_analyze", "clarify"]
```

---

## 5. 工具定义与自动发现

### 5.1 自动发现机制

`tools/registry.py::discover_builtin_tools()` 在 `model_tools.py` 被 import 时触发：

```python
def discover_builtin_tools(tools_dir=None):
    # 扫描 tools/*.py
    # 跳过 __init__.py / registry.py / mcp_tool.py
    # 检查文件内是否含有顶层 registry.register() 调用
    # import 每个含有注册调用的文件
```

**无需维护 import 列表**：任何 `tools/*.py` 文件，只要包含顶层 `registry.register()` 调用，就会被自动发现和导入。

### 5.2 工具文件标准结构

```python
# tools/example_tool.py
import json, os
from tools.registry import registry

def check_requirements() -> bool:
    """可选：检查工具运行所需条件。"""
    return bool(os.getenv("EXAMPLE_API_KEY"))

def example_tool(param: str, task_id: str = None) -> str:
    """工具实现，必须返回 JSON 字符串。"""
    result = do_something(param)
    return json.dumps({"success": True, "data": result})

registry.register(
    name="example_tool",
    toolset="example",
    schema={
        "name": "example_tool",
        "description": "简短描述，告诉模型什么时候用这个工具。",
        "parameters": {
            "type": "object",
            "properties": {
                "param": {"type": "string", "description": "参数描述"},
            },
            "required": ["param"],
        },
    },
    handler=lambda args, **kw: example_tool(
        param=args.get("param", ""),
        task_id=kw.get("task_id"),
    ),
    check_fn=check_requirements,
    requires_env=["EXAMPLE_API_KEY"],
)
```

### 5.3 路径与状态文件规范

- **schema 中的路径描述**：使用 `display_hermes_home()` 保证 profile-aware（schema 在 import 时生成，此时 `_apply_profile_override()` 已执行）
- **持久化状态**：使用 `get_hermes_home()` 作为基础路径，绝不使用 `Path.home() / ".hermes"`

---

## 6. 工具集列表

### 6.1 原子工具集（单一功能）

| 工具集 | 工具 | 说明 |
|---|---|---|
| `web` | `web_search`, `web_extract` | Web 研究与内容抓取 |
| `search` | `web_search` | 仅搜索（无抓取）|
| `x_search` | `x_search` | X(Twitter) 搜索（需 xAI 凭证）|
| `vision` | `vision_analyze` | 图像分析 |
| `video` | `video_analyze` | 视频分析（opt-in）|
| `image_gen` | `image_generate` | 图像生成 |
| `video_gen` | `video_generate` | 视频生成 |
| `computer_use` | `computer_use` | macOS 桌面控制 |
| `terminal` | `terminal`, `process` | 终端执行 + 进程管理 |
| `file` | `read_file`, `write_file`, `patch`, `search_files` | 文件操作 |
| `browser` | 14 个 browser_* 工具 + web_search | 浏览器自动化 |
| `skills` | `skills_list`, `skill_view`, `skill_manage` | 技能管理 |
| `tts` | `text_to_speech` | 文字转语音 |
| `todo` | `todo` | 任务规划追踪 |
| `memory` | `memory` | 跨会话记忆 |
| `session_search` | `session_search` | 历史对话搜索 |
| `clarify` | `clarify` | 向用户询问澄清 |
| `code_execution` | `execute_code` | Python 脚本工具调用 |
| `delegation` | `delegate_task` | 子 Agent 派生 |
| `cronjob` | `cronjob` | 定时任务管理 |
| `messaging` | `send_message` | 跨平台消息发送 |
| `homeassistant` | 4 个 ha_* 工具 | 智能家居控制 |
| `moa` | `mixture_of_agents` | 多模型聚合推理 |

### 6.2 平台/场景工具集

| 工具集 | 说明 |
|---|---|
| `kanban` | 多 Agent 看板（kanban worker 专用）|
| `discord` | Discord 读取与参与 |
| `discord_admin` | Discord 服务器管理 |
| `yuanbao` | 元宝平台工具 |
| `feishu_doc` | 飞书文档读取 |
| `feishu_drive` | 飞书评论操作 |
| `spotify` | Spotify 播放控制 |
| `homeassistant` | Home Assistant 智能家居 |

### 6.3 场景组合工具集

| 工具集 | 说明 |
|---|---|
| `debugging` | `terminal` + `process` + web + file |
| `safe` | web + vision + image_gen（无终端）|
| `rl` | 强化学习工具集 |

### 6.4 平台完整工具集

| 工具集 | 使用平台 |
|---|---|
| `hermes-cli` | 交互式 CLI（= `_HERMES_CORE_TOOLS`）|
| `hermes-cron` | Cron 定时任务（`skip_memory=True`）|
| `hermes-acp` | VS Code / Zed / JetBrains 编辑器集成 |
| `hermes-api-server` | OpenAI-compatible API server |
| `hermes-webhook-safe` | Webhook 触发的受限工具集 |

---

## 7. 工具调用完整链路

```
LLM 返回 tool_calls
  │
  ▼
run_agent.py（conversation_loop.py）
  ├─ 工具名校验 + 模糊修复（_repair_tool_call）
  ├─ 参数 JSON 校验
  └─ handle_function_call(name, args, task_id)
       │
       ├─ 1. 拦截 Agent-level 工具（todo / memory）
       │
       ├─ 2. get_pre_tool_call_block_message()
       │      └─ invoke_hook("pre_tool_call") → 可 block
       │
       ├─ 3. ACP edit approval（编辑器审批）
       │
       ├─ 4. read-loop tracker 通知
       │
       ├─ 5. _dispatch_start = time.monotonic()
       │
       ├─ 6. registry.dispatch(name, args)
       │      └─ ToolEntry.handler(args, task_id=..., user_task=...)
       │           └─ 工具实现返回 JSON 字符串
       │
       ├─ 7. duration_ms = int((monotonic() - start) * 1000)
       │
       ├─ 8. invoke_hook("post_tool_call", ..., duration_ms=duration_ms)
       │
       ├─ 9. invoke_hook("transform_tool_result")
       │      └─ 第一个 non-None 字符串替换结果
       │
       └─ 10. 返回 JSON 字符串 → 追加 role="tool" 消息
```

### 7.1 工具结果大小控制

`ToolEntry.max_result_size_chars` 限制结果字符数，超限时截断。同时 `tools/tool_output_limits.py` 提供全局输出限制配置，防止大结果（如 `ls` 超大目录）撑爆 context window。

### 7.2 工具结果持久化

`tools/tool_result_storage.py` 在工具结果超过阈值时自动将结果存储到磁盘，仅在消息中保留摘要和文件引用，避免 context 膨胀。

---

## 8. 特殊工具说明

### 8.1 terminal（终端后端）

`tools/terminal_tool.py` + `tools/environments/`，支持 6 种后端：

| 后端 | 文件 | 说明 |
|---|---|---|
| `local` | `environments/local_env.py` | 本地 shell，默认 |
| `docker` | `environments/docker_env.py` | Docker 容器隔离 |
| `ssh` | `environments/ssh_env.py` | SSH 远程执行 |
| `modal` | `environments/modal_env.py` | Modal serverless |
| `daytona` | `environments/daytona_env.py` | Daytona 云工作区 |
| `singularity` | `environments/singularity_env.py` | HPC 容器 |

后端通过 `terminal.environment` 配置项选择。`check_fn` 会探测所选后端的依赖是否满足。

`background=True` 参数使命令在后台运行，`notify_on_complete=True` 在完成时通过网关通知用户。

### 8.2 execute_code（Python 工具调用）

`tools/code_execution_tool.py`，允许 Agent 编写 Python 脚本，在脚本内通过 RPC 调用 Hermes 工具，将多步工具调用折叠为零 context 成本的单次执行。

```python
# Agent 可以写这样的脚本：
import hermes_tools
result = hermes_tools.read_file(path="/path/to/file.txt")
data = hermes_tools.web_search(query="...")
```

**沙箱工具白名单**：`execute_code` 执行期间，传入 `enabled_tools`（当前 agent 的工具列表）作为白名单，脚本内只能调用 agent 已有的工具，防止权限提升。

### 8.3 mcp_tool（MCP client）

`tools/mcp_tool.py`，动态代理外部 MCP server 暴露的工具。MCP server 的工具在发现时通过 `registry.register()` 注册（toolset 名格式为 `mcp-<server_name>`），工具名变化时通过 `deregister()` + `register()` 动态刷新。

`tools/mcp_oauth.py` + `tools/mcp_oauth_manager.py` 处理 MCP OAuth 2.0 认证流程。

### 8.4 checkpoint_manager（文件快照）

`tools/checkpoint_manager.py`，在破坏性文件操作（write_file / patch）前自动保存文件快照。每个 iteration 只保存一次（per-turn 去重），通过 `/checkpoint` 命令可恢复到任意快照。

---

## 9. 子 Agent 委派（delegate_task）

`tools/delegate_tool.py`，派生独立上下文的子 Agent。

### 9.1 两种调用形式

```python
# 单任务
delegate_task(goal="分析这个文件并给出建议", context="文件路径: /path/to/file")

# 并行批处理
delegate_task(tasks=[
    {"goal": "检查模块 A"},
    {"goal": "检查模块 B"},
    {"goal": "检查模块 C"},
])
```

并发数上限由 `delegation.max_concurrent_children`（默认 3）控制。

### 9.2 角色模型

| 角色 | 可调用工具 | 配置 |
|---|---|---|
| `leaf`（默认）| 不能调用 `delegate_task` / `clarify` / `memory` / `send_message` / `execute_code` | 专注具体工作 |
| `orchestrator` | 保留 `delegate_task`，可派生子 Agent | 需 `delegation.orchestrator_enabled=true`（默认）|

### 9.3 同步语义

`delegate_task` 是**同步**的：父 Agent 等待子 Agent 完成后才继续自己的循环。父 Agent 被中断时子 Agent 随之取消。

需要持久化 / 长时任务：用 `cronjob` 或 `terminal(background=True, notify_on_complete=True)`。

### 9.4 配置项（config.yaml 的 delegation: 节）

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `max_concurrent_children` | 3 | 最大并发子 Agent 数 |
| `max_spawn_depth` | 2 | 最大嵌套层数 |
| `child_timeout_seconds` | — | 子 Agent 超时 |
| `orchestrator_enabled` | true | 是否允许 orchestrator 角色 |
| `subagent_auto_approve` | — | 子 Agent 命令是否自动批准 |
| `inherit_mcp_toolsets` | — | 是否继承 MCP 工具集 |
| `max_iterations` | 90 | 子 Agent 最大迭代次数 |

---

## 10. 添加新工具

### 10.1 核心工具（贡献到仓库）

需要修改 **2 个文件**：

**步骤 1：创建 `tools/your_tool.py`**

```python
import json, os
from tools.registry import registry

def check_requirements() -> bool:
    return bool(os.getenv("EXAMPLE_API_KEY"))

def your_tool(query: str, task_id: str = None) -> str:
    # 实现工具逻辑
    return json.dumps({"result": "..."})

registry.register(
    name="your_tool",
    toolset="your_toolset",        # 所属工具集（需在步骤 2 中添加）
    schema={
        "name": "your_tool",
        "description": "...",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "..."},
            },
            "required": ["query"],
        },
    },
    handler=lambda args, **kw: your_tool(
        query=args.get("query", ""),
        task_id=kw.get("task_id"),
    ),
    check_fn=check_requirements,
    requires_env=["EXAMPLE_API_KEY"],
)
```

**步骤 2：在 `toolsets.py` 中添加工具集**

```python
TOOLSETS = {
    ...,
    "your_toolset": {
        "description": "工具集描述",
        "tools": ["your_tool"],
        "includes": [],
    },
    ...
}
```

自动发现机制会在 `model_tools.py` import 时扫描并 import `tools/your_tool.py`，无需手动维护 import 列表。但**必须手动在 `toolsets.py` 中声明**，工具才会暴露给 Agent。

### 10.2 私有工具（不修改仓库）

使用插件路径：

```
~/.hermes/plugins/my-tools/
├── plugin.yaml
└── __init__.py
```

```python
# __init__.py
def register(ctx):
    ctx.register_tool(
        name="my_private_tool",
        toolset="my_tools",
        schema={...},
        handler=my_handler,
    )
```

插件工具与内置工具完全同等地位，无需任何代码修改。

### 10.3 注意事项

1. **handler 必须返回 JSON 字符串**，使用 `tools/registry.py::tool_result()` / `tool_error()` 辅助函数
2. **禁止跨 toolset 工具引用**：schema description 不能 mention 其他 toolset 的工具名（该工具可能未启用，导致模型幻觉调用）；需要动态交叉引用时，在 `get_tool_definitions()` 的后处理块中添加
3. **路径使用 `get_hermes_home()` / `display_hermes_home()`**，不要硬编码 `~/.hermes`
4. **状态文件放在 `get_hermes_home()` 下**，确保 profile 隔离
