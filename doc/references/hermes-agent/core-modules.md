# Hermes Agent 核心模块详解

> 基于源码阅读与 AGENTS.md 分析，版本：2026-05-27（v0.14.0 后）

---

## 目录

1. [项目整体定位](#1-项目整体定位)
2. [项目目录速览](#2-项目目录速览)
3. [模块一：Agent 主循环](#3-模块一agent-主循环)
4. [模块二：工具系统](#4-模块二工具系统)
5. [模块三：技能系统](#5-模块三技能系统)
6. [模块四：记忆系统](#6-模块四记忆系统)
7. [模块五：消息网关](#7-模块五消息网关)
8. [模块六：模型 Provider 系统](#8-模块六模型-provider-系统)
9. [模块七：Cron 定时调度](#9-模块七cron-定时调度)
10. [模块八：MCP 集成](#10-模块八mcp-集成)
11. [模块九：CLI / 槽命令 / 多 Profile](#11-模块九cli--槽命令--多-profile)
12. [模块十：插件系统](#12-模块十插件系统)
13. [核心设计原则](#13-核心设计原则)
14. [文件依赖链](#14-文件依赖链)

---

## 1. 项目整体定位

**Hermes Agent** ☤ 是 Nous Research 出品的**自我学习型 AI Agent**，核心特色：

| 特性 | 说明 |
|---|---|
| 学习闭环 | 从经验创建技能、技能使用中自我改进、跨会话记忆召回、Honcho dialectic 用户建模 |
| 多模型支持 | 200+ 模型（Nous Portal / OpenRouter / NovitaAI / NVIDIA NIM / OpenAI / Anthropic 等），`hermes model` 切换 |
| 多端接入 | CLI / TUI / Telegram / Discord / Slack / WhatsApp / Signal / Email / Matrix / Feishu / WeCom / 微信 / 钉钉 / QQ / WebHook / API Server |
| 6 种终端后端 | local / docker / ssh / modal / daytona / singularity |
| 定时自动化 | 内置 cron 调度，自然语言调度格式 |
| 子 Agent 委派 | 独立上下文并行子 Agent，orchestrator 模式支持多层嵌套 |
| MCP 集成 | 既作 MCP client（接外部 server），也作 MCP server（暴露自身） |
| 部署灵活 | $5 VPS / GPU 集群 / serverless（Modal/Daytona 按需唤醒） |

**代码体量**：
- `run_agent.py` ~12k 行（AIAgent 核心）
- `cli.py` ~11k 行（CLI 主类）
- `hermes_state.py` ~140k 行（SessionDB）
- `gateway/run.py` 超大（网关 runner）
- 测试 ~17k 个，分布在 ~900 个文件

---

## 2. 项目目录速览

```
hermes-agent/
├── run_agent.py            # AIAgent 类 — 核心对话循环 (~12k LOC)
├── model_tools.py          # 工具编排：discover_builtin_tools()、handle_function_call()
├── toolsets.py             # 工具集定义：TOOLSETS 字典、_HERMES_CORE_TOOLS
├── cli.py                  # HermesCLI 类 — 交互式 CLI 编排器 (~11k LOC)
├── hermes_state.py         # SessionDB — SQLite + FTS5 会话存储
├── hermes_constants.py     # get_hermes_home()、display_hermes_home() — profile 路径
├── hermes_logging.py       # setup_logging() — agent.log / errors.log / gateway.log
├── batch_runner.py         # 并行批处理
├── mcp_serve.py            # Hermes 作为 MCP Server 暴露
├── agent/                  # Agent 内部（provider 适配、记忆、缓存、压缩等）
├── hermes_cli/             # CLI 子命令、setup wizard、plugins loader、skin 引擎
├── tools/                  # 工具实现 — 通过 tools/registry.py 自动发现
│   └── environments/       # 终端后端（local/docker/ssh/modal/daytona/singularity）
├── gateway/                # 消息网关 — run.py + session.py + platforms/
│   └── platforms/          # 平台适配器（20+ 个）
├── plugins/                # 插件系统
│   ├── memory/             # 记忆 provider 插件
│   ├── model-providers/    # 推理后端插件（30+ 个）
│   ├── context_engine/     # 上下文引擎插件
│   ├── image_gen/          # 图像生成 provider
│   └── kanban/             # 多 Agent 看板
├── skills/                 # 内置技能（默认加载）
├── optional-skills/        # 可选技能（默认不激活）
├── optional-mcps/          # 可选 MCP server（linear/n8n）
├── cron/                   # 定时调度：jobs.py + scheduler.py
├── ui-tui/                 # Ink（React）终端 UI — hermes --tui
├── tui_gateway/            # TUI 的 Python JSON-RPC 后端
├── acp_adapter/            # ACP server（VS Code / Zed / JetBrains 集成）
├── providers/              # provider 兼容层（旧路径，逐步迁移到 plugins/model-providers/）
└── tests/                  # Pytest 套件（~17k 测试）
```

**用户配置**：`~/.hermes/config.yaml`（设置），`~/.hermes/.env`（仅存 API key 等密钥）

---

## 3. 模块一：Agent 主循环

### 3.1 关键文件

| 文件 | 职责 |
|---|---|
| `run_agent.py:327` | `AIAgent` 类定义，`__init__` 转发给 `agent_init.init_agent()` |
| `agent/agent_init.py` | `init_agent()` — 实际构造逻辑（约 60 个参数） |
| `agent/conversation_loop.py:263` | `run_conversation()` — 核心同步循环 |
| `agent/prompt_builder.py` | 系统提示拼装（技能、记忆、上下文文件、环境信息等） |
| `agent/context_engine.py` | `ContextEngine` ABC — 可插拔上下文引擎 |

### 3.2 AIAgent 类

```python
class AIAgent:
    def chat(self, message: str) -> str:
        """简单接口，返回最终响应字符串"""

    def run_conversation(self,
        user_message: str,
        system_message: str = None,
        conversation_history: list = None,
        task_id: str = None
    ) -> dict:
        """完整接口，返回 {final_response, messages}"""
```

**核心初始化参数分类**：

| 分类 | 参数举例 |
|---|---|
| API 凭证 | `base_url`、`api_key`、`provider`、`api_mode` |
| 模型配置 | `model`、`max_tokens`、`reasoning_config`、`service_tier` |
| 迭代控制 | `max_iterations=90`、`iteration_budget`、`tool_delay=1.0` |
| 工具集 | `enabled_toolsets`、`disabled_toolsets` |
| 会话 | `session_id`、`platform`、`skip_context_files`、`skip_memory` |
| 回调 | `tool_progress_callback`、`thinking_callback`、`stream_delta_callback` 等 8 个回调 |
| 多租户 | `user_id`、`chat_id`、`thread_id`、`gateway_session_key` |
| 子 Agent | `credential_pool`、`parent_session_id`、`fallback_model` |
| 快照 | `checkpoints_enabled`、`checkpoint_max_snapshots`、`checkpoint_max_total_size_mb` |

### 3.3 核心循环伪代码

```python
# agent/conversation_loop.py::run_conversation()
while (api_call_count < max_iterations and budget.remaining > 0) \
        or _budget_grace_call:
    if _interrupt_requested:
        break
    response = client.chat.completions.create(
        model=model, messages=messages, tools=tool_schemas
    )
    if response.tool_calls:
        for tc in response.tool_calls:
            result = handle_function_call(tc.name, tc.args, task_id)
            messages.append(tool_result_message(result))
        api_call_count += 1
    else:
        return response.content
```

**每轮开始前的重置操作**（`conversation_loop.py`）：
- 各种 retry 计数器清零（`_invalid_tool_retries` / `_codex_incomplete_retries` 等）
- 死连接清理（防 zombie socket）
- `_tool_guardrails.reset_for_turn()`
- 恢复主 runtime（若上轮启用了 fallback model）
- 用户输入 surrogate 字符净化（处理富文本粘贴）

**消息格式**：标准 OpenAI 格式 `{"role": "system/user/assistant/tool", ...}`，推理内容在 `assistant_msg["reasoning"]`。

### 3.4 提示构建（prompt_builder.py）

`build_context_files_prompt()` 按优先级合并：
1. `SOUL.md`（个性/persona 文件）
2. `AGENTS.md` / `CLAUDE.md` / `.cursorrules`（工作目录上下文）
3. 技能清单（`build_skills_system_prompt()`）
4. 环境提示（`build_environment_hints()`）
5. Nous 订阅信息（`build_nous_subscription_prompt()`）

### 3.5 关键支持模块

| 模块 | 功能 |
|---|---|
| `agent/context_compressor.py` / `conversation_compression.py` | 上下文压缩（唯一可破坏 prompt cache 的操作） |
| `agent/trajectory_compressor.py` | 轨迹压缩（用于训练数据生成） |
| `agent/prompt_caching.py` | 提示缓存管理 |
| `agent/iteration_budget.py` | 迭代预算（父子 Agent 共享） |
| `agent/error_classifier.py` / `retry_utils.py` | 错误分类与重试策略 |
| `agent/nous_rate_guard.py` / `rate_limit_tracker.py` | Nous 速率保护与限流追踪 |
| `agent/tool_guardrails.py` | 工具调用防护（每轮重置） |

---

## 4. 模块二：工具系统

### 4.1 三层架构

```
tools/registry.py       ← 无依赖，所有工具文件首先导入
       ↑
tools/*.py              ← 每个文件 import 时调用 registry.register()
       ↑
model_tools.py          ← 导入 registry，触发工具自动发现
       ↑
run_agent.py / cli.py / batch_runner.py / environments/
```

### 4.2 关键文件与函数

**注册中心** `tools/registry.py`：

| 类/函数 | 行号 | 说明 |
|---|---|---|
| `ToolRegistry` | 151 | 核心注册类 |
| `ToolEntry` | 77 | 工具元数据条目 |
| `discover_builtin_tools()` | 57 | 扫描 `tools/*.py`，自动发现带 `register()` 的文件 |
| `tool_error()` | 563 | 标准错误响应构造 |
| `tool_result()` | 577 | 标准成功响应构造 |

**调度层** `model_tools.py`：

| 函数 | 行号 | 说明 |
|---|---|---|
| `get_tool_definitions()` | 264 | 获取当前 toolset 的 schema 列表（含动态交叉引用处理） |
| `handle_function_call()` | 741 | 工具调用分发（含参数强转、错误包装、plugin hook 调用） |
| `coerce_tool_args()` | 545 | 工具参数类型强转（应对 LLM 输出类型错误） |
| `_compute_tool_definitions()` | 329 | 实际计算 schema 列表（带缓存）|
| `get_all_tool_names()` | 901 | 列出所有已注册工具名 |
| `check_tool_availability()` | 921 | 检查工具可用性（需要的 env var 是否存在） |

**工具集** `toolsets.py`：

| 函数 | 行号 | 说明 |
|---|---|---|
| `resolve_toolset()` | 600 | 递归展开工具集继承，返回工具名列表 |
| `resolve_multiple_toolsets()` | 674 | 批量展开多个工具集 |
| `get_all_toolsets()` | 719 | 返回所有可用工具集 |
| `create_custom_toolset()` | 787 | 动态创建自定义工具集 |
| `validate_toolset()` | 767 | 验证工具集合法性 |

### 4.3 工具集列表（30 个）

`browser` / `clarify` / `code_execution` / `cronjob` / `debugging` / `delegation` / `discord` / `discord_admin` / `feishu_doc` / `feishu_drive` / `file` / `homeassistant` / `image_gen` / `kanban` / `memory` / `messaging` / `moa` / `rl` / `safe` / `search` / `session_search` / `skills` / `spotify` / `terminal` / `todo` / `tts` / `video` / `vision` / `web` / `yuanbao`

平台选择：Telegram 使用 `messaging` 作为基础工具集；`_HERMES_CORE_TOOLS` 是所有平台继承的默认捆绑包。

### 4.4 工具注册规范

```python
# tools/your_tool.py
from tools.registry import registry

registry.register(
    name="example_tool",
    toolset="example",
    schema={"name": "example_tool", "description": "...", "parameters": {...}},
    handler=lambda args, **kw: example_tool(
        param=args.get("param", ""),
        task_id=kw.get("task_id")
    ),
    check_fn=check_requirements,      # 可选：检查环境变量是否就绪
    requires_env=["EXAMPLE_API_KEY"], # 可选：声明所需 env var
)
```

注意：**所有 handler 必须返回 JSON 字符串**；schema 中的路径描述用 `display_hermes_home()` 保证 profile-aware。

### 4.5 关键工具实现

| 工具文件 | 说明 |
|---|---|
| `tools/terminal_tool.py` + `tools/environments/` | 6 种终端后端 |
| `tools/delegate_tool.py` | 子 Agent 委派（leaf / orchestrator） |
| `tools/mcp_tool.py` | MCP client，调用外部 MCP server |
| `tools/browser_tool.py` / `browser_cdp_tool.py` / `browser_camofox.py` | 浏览器工具 |
| `tools/file_tools.py` / `tools/file_operations.py` | 文件操作 |
| `tools/skill_manager_tool.py` / `tools/skills_tool.py` | 技能管理 |
| `tools/memory_tool.py` / `tools/todo_tool.py` | Agent-level 工具（在 run_agent.py 中拦截，不走 handle_function_call） |
| `tools/kanban_tools.py` | 多 Agent 看板 |
| `tools/checkpoint_manager.py` | 文件快照 |
| `tools/clarify_tool.py` / `tools/clarify_gateway.py` | 向用户澄清询问 |

### 4.6 子 Agent 委派（delegate_task）

```
role="leaf"（默认）
  ├─ 不能调用 delegate_task / clarify / memory / send_message / execute_code
  └─ 专注于具体工作

role="orchestrator"
  ├─ 可以再派生子 Agent
  ├─ 受 delegation.max_spawn_depth（默认 2）约束
  └─ 受 delegation.max_concurrent_children（默认 3）约束
```

**关键配置**（`config.yaml` 的 `delegation:` 节）：

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `max_concurrent_children` | 3 | 最大并发子 Agent 数 |
| `max_spawn_depth` | 2 | 最大嵌套层数 |
| `child_timeout_seconds` | — | 子 Agent 超时 |
| `orchestrator_enabled` | true | 是否允许 orchestrator 角色 |
| `subagent_auto_approve` | — | 子 Agent 是否自动批准命令 |
| `inherit_mcp_toolsets` | — | 是否继承 MCP 工具集 |

> 委派是**同步**的（父等子完成）。需要持久化/长时任务，用 `cronjob` 或 `terminal(background=True, notify_on_complete=True)`。

---

## 5. 模块三：技能系统

### 5.1 两个并行表面

| 位置 | 说明 |
|---|---|
| `skills/` | 内置技能，默认加载。按类别目录组织（25+ 个类别） |
| `optional-skills/` | 随仓库附带，默认**不激活**。需 `hermes skills install official/<category>/<skill>` |

### 5.2 技能目录（skills/ 的类别）

`apple` / `autonomous-ai-agents` / `creative` / `data-science` / `devops` / `diagramming` / `dogfood` / `domain` / `email` / `gaming` / `gifs` / `github` / `inference-sh` / `mcp` / `media` / `mlops` / `note-taking` / `productivity` / `red-teaming` / `research` / `smart-home` / `social-media` / `software-development` / `yuanbao`

### 5.3 技能文件格式（SKILL.md）

```markdown
---
name: skill-name
description: 一句话描述，≤ 60 字符，以句号结尾。
version: 1.0.0
author: 贡献者姓名 (@github_handle)
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [devops, automation]
    category: devops
    related_skills: [other-skill]
    config:
      some_key: "default_value"
---

# Skill Name Skill

2-3 句介绍...

## When to Use
## Prerequisites
## How to Run
## Quick Reference
## Procedure
## Pitfalls
## Verification
```

### 5.4 关键 Python 模块

**`agent/skill_commands.py`**：

| 函数 | 行号 | 说明 |
|---|---|---|
| `scan_skill_commands()` | 263 | 扫描 `~/.hermes/skills/` 注册 slash 命令 |
| `build_skill_invocation_message()` | 428 | 构建技能调用消息（注入为用户消息，保留 prompt cache） |
| `build_preloaded_skills_prompt()` | 475 | 构建预加载技能的 system 提示 |
| `get_skill_commands()` | 329 | 返回当前加载的技能命令字典 |
| `reload_skills()` | 344 | 重载技能（`/skills reload`） |

> 技能内容**作为用户消息注入**（不放系统提示），目的是保留 prompt caching 有效性。

**`agent/skill_bundles.py`**：

| 函数 | 行号 | 说明 |
|---|---|---|
| `scan_bundles()` | 168 | 扫描 `.bundle` 文件 |
| `save_bundle()` | 356 | 保存技能捆绑包 |
| `build_bundle_invocation_message()` | 253 | 构建捆绑包调用消息 |
| `reload_bundles()` | 221 | 重载捆绑包 |

**`agent/skill_preprocessing.py`**：

| 函数 | 行号 | 说明 |
|---|---|---|
| `substitute_template_vars()` | 37 | 替换 `{{VAR}}` 模板变量 |
| `expand_inline_shell()` | 101 | 展开 `{{shell: cmd}}` 内联 shell |
| `preprocess_skill_content()` | 123 | 完整预处理管道 |

### 5.5 Curator（技能生命周期管理）

**核心模块** `agent/curator.py`：

| 函数 | 行号 | 说明 |
|---|---|---|
| `apply_automatic_transitions()` | 256 | 自动状态迁移（active → stale → archived） |
| `run_curator_review()` | 1369 | LLM 审查循环（在后台 Agent 分支中运行） |
| `maybe_run_curator()` | 1763 | 判断是否到了运行时间（interval 检查） |
| `should_run_now()` | 199 | 基于配置的时间判断 |

**CLI** `hermes curator <verb>`：`status / run / pause / resume / pin / unpin / archive / restore / prune / backup / rollback`

**技能状态机**：
```
active ──(stale_after_days 无活动)──→ stale
stale  ──(archive_after_days)────────→ archived
archived ← restore ← 可手动恢复
pinned   → 免疫所有自动迁移
```

**不变量**：
- 仅处理 `created_by: "agent"` 的技能（内置 + Hub 安装的免疫）
- 最多归档，**绝不删除**
- 归档路径：`~/.hermes/skills/.archive/`
- `curator_backup.py` 在每次 run 前生成 tar.gz 快照

**配置**（`curator:` 节）：`enabled` / `interval_hours` / `min_idle_hours` / `stale_after_days` / `archive_after_days` / `backup.*`

---

## 6. 模块四：记忆系统

### 6.1 核心抽象

**`agent/memory_provider.py:42 MemoryProvider(ABC)`**，所有 provider 必须实现：

| 方法 | 说明 |
|---|---|
| `sync_turn(turn_messages)` | 每轮对话结束后同步 |
| `prefetch(query)` | 会话开始前预拉取相关记忆 |
| `shutdown()` | 资源释放 |
| `post_setup(hermes_home, config)` | 可选，供 setup wizard 集成 |

**`agent/memory_manager.py:244 MemoryManager`**：

| 函数/类 | 行号 | 说明 |
|---|---|---|
| `sanitize_context()` | 54 | 净化记忆上下文（防止注入） |
| `StreamingContextScrubber` | 62 | 流式上下文清洗器 |
| `build_memory_context_block()` | 227 | 构造注入 system prompt 的记忆块 |
| `MemoryManager` | 244 | 记忆 provider 编排器 |

### 6.2 内置 Provider（集合已锁定）

`honcho` / `mem0` / `supermemory` / `byterover` / `hindsight` / `holographic` / `openviking` / `retaindb`

> **政策（2026-05）**：内置 memory provider 集合已关闭。新后端必须作为独立 plugin 仓库发布（实现同一 `MemoryProvider` ABC），不再合入主仓。

### 6.3 会话存储与全文搜索

**`hermes_state.py:311 SessionDB`**：
- 后端：SQLite + **FTS5 全文索引**
- 路径：`~/.hermes/sessions/`
- 功能：会话历史持久化、跨会话全文搜索、LLM 摘要召回

**工具端**：`tools/session_search_tool.py` — Agent 可在对话中调用 `session_search` 工具回溯历史

**`/insights [--days N]`** — 由 `agent/insights.py:93 InsightsEngine` 驱动，输出 token 用量、估算费用、工具调用频率 bar chart。

### 6.4 配置

`config.yaml` 的 `memory:` 节：
- `provider` — 选择哪个 backend
- 各 provider 私有配置在 `memory.<provider_name>.` 下

---

## 7. 模块五：消息网关

### 7.1 整体架构

```
hermes gateway start
  └─ gateway/run.py (GatewayRunner)
       ├─ gateway/session.py (SessionStore)
       ├─ gateway/delivery.py (跨平台投递)
       ├─ gateway/mirror.py (跨平台镜像)
       └─ gateway/platforms/<adapter>.py (各平台适配器)
```

### 7.2 gateway/run.py 关键函数

| 函数 | 行号 | 说明 |
|---|---|---|
| `_load_gateway_config()` | 1396 | 加载网关配置（直接读 YAML，不走 DEFAULT_CONFIG） |
| `_build_gateway_agent_history()` | 562 | 重建对话历史 |
| `_sanitize_gateway_final_response()` | 287 | 输出净化（过滤 secrets 等） |
| `_is_fresh_gateway_interruption()` | 443 | 判断中断是否在新鲜度窗口内 |
| `_telegramize_command_mentions()` | 334 | Telegram 命令格式转换 |
| `_resolve_runtime_agent_kwargs()` | 1063 | 解析运行时 Agent 参数 |
| `_coerce_gateway_timestamp()` | 375 | 时间戳格式统一 |

### 7.3 gateway/session.py 关键类

| 类/函数 | 行号 | 说明 |
|---|---|---|
| `SessionStore` | 668 | 会话持久化存储 |
| `SessionContext` | 160 | 单次对话上下文 |
| `SessionEntry` | 425 | 会话元数据条目 |
| `SessionSource` | 71 | 来源标识 |
| `build_session_context_prompt()` | 231 | 构建会话上下文提示 |
| `build_session_key()` | 600 | 生成 `<platform>:<chat_id>:<thread_id>` 格式的 session key |
| `is_shared_multi_user_session()` | 579 | 判断是否多用户共享会话（群组等） |
| `_hash_sender_id()` / `_hash_chat_id()` | 39/44 | PII 哈希（保护用户隐私） |

### 7.4 支持的平台（20+ 个）

| 类别 | 平台 |
|---|---|
| 即时通信 | Telegram、Discord、Slack、WhatsApp、Signal、Matrix、Mattermost |
| 中国平台 | 微信（Weixin）、企业微信（WeCom）、飞书（Feishu）、钉钉（DingTalk）、QQ Bot、元宝（YuanBao） |
| 工作协作 | Microsoft Teams（msgraph_webhook）、BlueBubbles（iMessage） |
| 物联网 | Home Assistant |
| 通用接口 | WebHook、API Server、SMS、Email |

新增平台指南：`gateway/platforms/ADDING_A_PLATFORM.md`，每个 adapter 继承 `gateway/platforms/base.py`。

### 7.5 双层消息 Guard（重要）

当 Agent 正在运行时，消息经过**两层 guard**：

```
用户消息
  ↓
[Guard 1] gateway/platforms/base.py
  → 若 session_key 在 _active_sessions，进入 _pending_messages 队列
  ↓
[Guard 2] gateway/run.py
  → 拦截 /stop /new /queue /status /approve /deny，直接处理
  → 其他消息通过 running_agent.interrupt() 处理
```

> 任何需要在 Agent 运行时送达 runner 的命令（如审批响应）**必须绕过两层 guard**，不能走 `_process_message_background()`（存在 session 竞态）。

### 7.6 TUI（终端 UI）

```
hermes --tui
  └─ Node (Ink/React) ──stdio JSON-RPC──→ Python (tui_gateway/)
         │                                      └─ AIAgent + tools + sessions
         └─ 渲染对话 / 输入框 / 进度 / 提示
```

- TypeScript 控屏幕，Python 控 session / 工具 / 模型调用 / slash 命令
- Dashboard `/chat` 嵌入真实的 `hermes --tui`（PTY + xterm.js + WebSocket）
- **原则**：不要在 React 中重写聊天界面，扩展 Ink 即可

### 7.7 关键辅助文件

| 文件 | 说明 |
|---|---|
| `gateway/delivery.py` | 跨平台投递抽象 |
| `gateway/mirror.py` | 跨平台消息镜像 |
| `gateway/pairing.py` | DM 配对（安全验证） |
| `gateway/status.py` | 网关状态 + `acquire_scoped_lock()`（防止两个 profile 共用同一 token） |
| `gateway/restart.py` / `shutdown_forensics.py` | 重启管理与崩溃诊断 |
| `gateway/slash_access.py` | Slash 命令权限控制 |
| `gateway/memory_monitor.py` | 记忆使用监控 |
| `gateway/channel_directory.py` | 频道目录索引 |

---

## 8. 模块六：模型 Provider 系统

### 8.1 发现机制

`providers/__init__.py` 实现**懒发现**（不走 PluginManager，独立系统）：

| 函数 | 行号 | 说明 |
|---|---|---|
| `register_provider(profile)` | 53 | 注册 ProviderProfile，last-writer-wins |
| `get_provider_profile(name)` | 65 | 按名获取 provider profile |
| `list_providers()` | 76 | 列出所有已注册 provider |
| `_discover_providers()` | 140 | 懒发现触发点（首次调用时扫描） |

**扫描顺序**（后者覆盖前者）：
1. `<repo>/plugins/model-providers/<name>/`（捆绑 provider）
2. `$HERMES_HOME/plugins/model-providers/<name>/`（用户 provider，可覆盖同名捆绑）
3. `<repo>/providers/<name>.py`（兼容旧路径）

### 8.2 内置 Provider（30 个）

`alibaba` / `alibaba-coding-plan` / `anthropic` / `arcee` / `azure-foundry` / `bedrock` / `copilot` / `copilot-acp` / `custom` / `deepseek` / `gemini` / `gmi` / `huggingface` / `kilocode` / `kimi-coding` / `minimax` / `nous` / `novita` / `nvidia` / `ollama-cloud` / `openai-codex` / `opencode-zen` / `openrouter` / `qwen-oauth` / `stepfun` / `xai` / `xiaomi` / `zai`

### 8.3 API 适配器（agent/ 目录）

| 文件 | 适配的 API |
|---|---|
| `anthropic_adapter.py` | Anthropic Messages API |
| `bedrock_adapter.py` | AWS Bedrock |
| `codex_responses_adapter.py` + `codex_runtime.py` | OpenAI Responses API |
| `gemini_native_adapter.py` / `gemini_cloudcode_adapter.py` | Google Gemini |
| `azure_identity_adapter.py` | Azure AD 认证 |
| `lmstudio_reasoning.py` | LM Studio 推理 |
| `moonshot_schema.py` | Kimi/Moonshot 特殊 schema |
| `think_scrubber.py` | 清理推理过程中的 `<think>` 标记 |

### 8.4 辅助系统

| 文件 | 说明 |
|---|---|
| `agent/auxiliary_client.py` | 副 LLM（curator / vision / embedding / title / session_search），`_resolve_auto()` 决定每个任务的 provider/model |
| `agent/credential_pool.py` / `credential_persistence.py` / `credential_sources.py` | 多 API key 池（轮转、持久化） |
| `agent/model_metadata.py` / `models_dev.py` | 模型清单（context window、能力标记） |
| `agent/usage_pricing.py` | Token 计价（支持 `/insights` 费用估算） |
| `agent/image_routing.py` | 多模态图像路由 |
| `agent/prompt_caching.py` | 提示缓存（Anthropic cache_control 等） |

**auxiliary 任务可配置**（`config.yaml` 的 `auxiliary:` 节，每个任务可单独指定 provider/model/base_url/max_tokens/reasoning_effort）：
`curator` / `vision` / `embedding` / `title` / `session_search`

---

## 9. 模块七：Cron 定时调度

### 9.1 两个核心文件

**`cron/jobs.py`** — 任务存储（JSON）：

| 函数 | 行号 | 说明 |
|---|---|---|
| `parse_schedule()` | 209 | 解析调度表达式（5 种格式） |
| `parse_duration()` | 188 | 解析时长字符串（`30m` / `2h` / `1d`） |
| `_normalize_job_record()` | 121 | 规范化 job 记录字段 |
| `ensure_dirs()` | 176 | 确保调度目录结构存在 |

**`cron/scheduler.py`** — 调度引擎：

| 函数 | 行号 | 说明 |
|---|---|---|
| `tick()` | 1857 | 调度器心跳（检查、触发到期 job） |
| `run_job()` | 1204 | 执行单个 job |
| `_run_job_impl()` | 1211 | job 执行实现 |
| `_build_job_prompt()` | 1004 | 构建 job 的 Agent prompt |
| `_run_job_script()` | 851 | 运行预执行脚本 |
| `_resolve_delivery_targets()` | 517 | 解析多平台投递目标 |
| `_parse_wake_gate()` | 978 | 解析脚本输出中的唤醒门控信号 |
| `_scan_assembled_cron_prompt()` | 1165 | prompt 注入安全扫描 |

### 9.2 调度格式

| 格式 | 示例 |
|---|---|
| 时长 | `"30m"` / `"2h"` / `"1d"` |
| every 短语 | `"every 2h"` / `"every monday 9am"` |
| 5 字段 cron | `"0 9 * * *"`（标准 crontab） |
| ISO 时间戳（一次性） | `"2026-06-01T09:00:00Z"` |

### 9.3 Job 特性

| 字段 | 说明 |
|---|---|
| `skills` | 加载特定技能列表 |
| `model` / `provider` | 覆盖 job 使用的模型 |
| `script` | 预运行脚本，stdout 注入到 prompt；`no_agent: true` 则纯脚本不启动 Agent |
| `context_from` | 链式：将 job A 的最后输出作为 job B 的 prompt 输入 |
| `workdir` | 在指定目录运行（加载其 AGENTS.md / CLAUDE.md） |
| `deliver` | 投递目标平台（可多个） |

### 9.4 安全不变量

- **3 分钟硬中断**：防止 runaway Agent 独占调度器
- **Catchup 窗口**：周期的一半，clamp 到 120s–2h
- **Grace 窗口**：一次性 job 错过 fire time 后 120s 宽限
- **文件锁**：`~/.hermes/cron/.tick.lock` 防多进程重复 tick
- **默认 `skip_memory=True`**：cron 会话不触发记忆 provider
- **会话隔离**：cron 投递进独立 cron session，不进入主对话（保持 message-role 交替完整）

### 9.5 用户接口

```bash
hermes cron list / add / edit / pause / resume / run / remove
/cron                        # slash 命令（CLI/网关）
# Agent 工具：cronjob（在 tools/cronjob_tools.py）
```

---

## 10. 模块八：MCP 集成

### 10.1 Hermes 作为 MCP Server

**`mcp_serve.py`**：

| 函数/类 | 行号 | 说明 |
|---|---|---|
| `EventBridge` | 204 | 事件桥接（内外事件双向） |
| `QueueEvent` | 196 | 事件队列单元 |
| `create_mcp_server()` | 450 | 创建 FastMCP server 实例，暴露 sessions、chat、tools 等接口 |
| `run_mcp_server()` | 866 | 启动 MCP server（stdio 或 SSE） |

### 10.2 Hermes 作为 MCP Client

| 文件 | 说明 |
|---|---|
| `tools/mcp_tool.py` | 动态代理外部 MCP server 暴露的工具 |
| `tools/mcp_oauth.py` | MCP OAuth 2.0 认证流程 |
| `tools/mcp_oauth_manager.py` | OAuth token 生命周期管理 |

### 10.3 可选 MCP Server

| 目录 | 说明 |
|---|---|
| `optional-mcps/linear/` | Linear issue tracking MCP |
| `optional-mcps/n8n/` | n8n 工作流自动化 MCP |

---

## 11. 模块九：CLI / 槽命令 / 多 Profile

### 11.1 CLI 架构

```
hermes（启动脚本）
  └─ hermes_cli/main.py
       ├─ _apply_profile_override()   # 设置 HERMES_HOME（在任何 import 之前）
       └─ HermesCLI（cli.py）
            ├─ load_cli_config()       # 加载配置（CLI 特有合并逻辑）
            ├─ process_command()       # 分发所有 slash 命令
            └─ prompt_toolkit 输入 + Rich 输出
```

**交互组件**：
- `prompt_toolkit` — 多行输入、slash 自动补全、历史
- `Rich` — banner / panel 渲染
- `KawaiiSpinner`（`agent/display.py`）— API 等待期的动画面孔，工具结果用 `┊` 前缀

### 11.2 Slash 命令注册中心

**`hermes_cli/commands.py::COMMAND_REGISTRY`**（`CommandDef` 列表）是唯一来源，所有消费者自动派生：

| 消费者 | 用途 |
|---|---|
| CLI `process_command()` | 通过 `resolve_command()` 解析别名并分发 |
| Gateway `run.py` | `GATEWAY_KNOWN_COMMANDS` frozenset + dispatch |
| Telegram | `telegram_bot_commands()` 生成 BotCommand 菜单 |
| Slack | `slack_subcommand_map()` 生成子命令路由 |
| 补全器 | `COMMANDS` 字典 → `SlashCommandCompleter` |
| help 输出 | `COMMANDS_BY_CATEGORY` → `show_help()` |
| 网关 help | `gateway_help_lines()` 生成 `/help` 输出 |

**`CommandDef` 字段**：

| 字段 | 说明 |
|---|---|
| `name` | 规范命令名（不含斜杠） |
| `description` | 人类可读描述 |
| `category` | `Session` / `Configuration` / `Tools & Skills` / `Info` / `Exit` |
| `aliases` | 别名元组 |
| `args_hint` | 参数占位符（如 `"<prompt>"` / `"[name]"`） |
| `cli_only` | 仅 CLI 可用 |
| `gateway_only` | 仅网关可用 |
| `gateway_config_gate` | 配置 dotpath，值为 truthy 时网关也启用该命令 |

### 11.3 配置加载（三条路径）

| 加载器 | 使用场景 | 位置 |
|---|---|---|
| `load_cli_config()` | CLI 交互模式 | `cli.py` |
| `load_config()` | `hermes tools` / `hermes setup` / 大多数子命令 | `hermes_cli/config.py` |
| 直接 YAML load | 网关运行时 | `gateway/run.py` + `gateway/config.py` |

> 如果 CLI 能看到某配置但网关看不到（或反之），检查是否用了错误的加载器。

### 11.4 多 Profile 支持

```
~/.hermes/               # 默认 profile（HERMES_HOME）
~/.hermes/profiles/
  ├─ coder/              # hermes -p coder
  ├─ research/           # hermes -p research
  └─ ...
```

**规则**：
1. **所有代码**用 `get_hermes_home()` 获取路径，绝不硬编码 `~/.hermes`
2. **用户可见消息**用 `display_hermes_home()`
3. Profile 根是 `Path.home() / ".hermes" / "profiles"`（而非 `get_hermes_home() / "profiles"`），确保任意 profile 下都能 `list` 所有 profile
4. 平台 adapter 在 `connect()` 时调用 `acquire_scoped_lock()`，防止两个 profile 共用同一 bot token

### 11.5 Skin/Theme 系统

**`hermes_cli/skin_engine.py`**，纯数据驱动（增加 skin 无需改代码）：

内置 skin：`default`（金色/kawaii）/ `ares`（猩红/青铜）/ `mono`（灰度）/ `slate`（蓝色）

用户自定义：`~/.hermes/skins/<name>.yaml`，`/skin <name>` 切换。

可自定义元素：banner 颜色、spinner 面孔/动词/翅膀、tool output 前缀、每工具 emoji、agent 名称、欢迎语、prompt 符号等。

---

## 12. 模块十：插件系统

### 12.1 通用插件（PluginManager）

**发现路径**：`~/.hermes/plugins/` → `./.hermes/plugins/` → pip entry points

每个插件实现 `register(ctx)` 函数，可：

```python
def register(ctx):
    # 注册 lifecycle hook
    ctx.on("pre_tool_call", my_hook)
    ctx.on("post_tool_call", my_hook)
    ctx.on("pre_llm_call", my_hook)
    ctx.on("post_llm_call", my_hook)
    ctx.on("on_session_start", my_hook)
    ctx.on("on_session_end", my_hook)

    # 注册新工具
    ctx.register_tool(name="my_tool", schema={...}, handler=my_handler)

    # 注册 CLI 子命令（使 hermes <plugin> <subcmd> 可用）
    ctx.register_cli_command(subparser)
```

> **坑**：`discover_plugins()` 只在 `model_tools.py` import 时运行。未经此路径的代码需手动调用 `discover_plugins()`（幂等）。

### 12.2 三条独立发现路径

| 插件类型 | 发现方式 | 目录 |
|---|---|---|
| 通用插件 | `PluginManager`（启动时扫描） | `plugins/<name>/` / `~/.hermes/plugins/<name>/` |
| Memory provider | 独立发现，仅加载 active 那个 | `plugins/memory/<name>/` |
| Model provider | 懒发现（首次访问时） | `plugins/model-providers/<name>/` |

### 12.3 插件铁律（Teknium 2026-05）

> 插件**不得修改**核心文件：`run_agent.py` / `cli.py` / `gateway/run.py` / `hermes_cli/main.py` 等。
>
> 需要扩展新能力 → 扩展通用 plugin surface（新 hook / 新 ctx 方法），**绝不**在核心中硬编码插件特例。

### 12.4 其他插件目录

| 目录 | 说明 |
|---|---|
| `plugins/context_engine/` | 接 `agent/context_engine.py::ContextEngine` ABC |
| `plugins/image_gen/` | 接 `agent/image_gen_provider.py` |
| `plugins/kanban/` | 多 Agent 看板（含 dashboard web UI + systemd service） |
| `plugins/observability/` | 指标 / traces / logs |
| `plugins/hermes-achievements/` | 成就追踪系统 |
| `plugins/disk-cleanup/` | 磁盘清理 |
| `plugins/spotify/` | Spotify 集成 |
| `plugins/google_meet/` | Google Meet 集成 |

---

## 13. 核心设计原则

### 13.1 Prompt Cache 不可破坏

> **这是最重要的硬约束。**

- 会话中途**不得**修改过去 context
- 会话中途**不得**切换 toolset
- 会话中途**不得**重载记忆或重建系统提示
- **唯一例外**：上下文压缩（`/compress`）
- 修改 system-prompt 状态的 slash 命令必须**默认延迟生效**（下次会话），`--now` 参数才立即生效（参考 `/skills install --now`）

### 13.2 路径安全

```python
# 正确
from hermes_constants import get_hermes_home, display_hermes_home
config_path = get_hermes_home() / "config.yaml"         # 代码中用
print(f"已保存到 {display_hermes_home()}/config.yaml") # 用户可见消息

# 错误 ❌ 破坏 profile 隔离
config_path = Path.home() / ".hermes" / "config.yaml"
```

### 13.3 依赖封顶政策

| 来源类型 | 写法 | 示例 |
|---|---|---|
| PyPI 包 | `>=floor,<next_major` | `"httpx>=0.28.1,<1"` |
| Git URL | Commit SHA | `git+https://...@<40-char-sha>` |
| GitHub Actions | SHA + 注释 | `uses: actions/checkout@<sha> # v4` |
| CI-only pip | `==exact` | `pyyaml==6.0.2` |

> 背景：litellm 供应链攻击（PR #2796/#2810）和 Mini Shai-Hulud worm 事件（2026-05）后确立此政策。

### 13.4 测试规范

```bash
# 必须用包装脚本，不能直接用 pytest
scripts/run_tests.sh

# 等价形式
scripts/run_tests.sh tests/gateway/                   # 单目录
scripts/run_tests.sh tests/agent/test_foo.py::test_x  # 单测试
scripts/run_tests.sh -v --tb=long                     # 透传 pytest flags
```

- 每个测试在独立 Python 子进程中运行（`spawn`，非 `fork`），彻底防止状态污染
- 测试不得写入 `~/.hermes/`（`conftest.py` 的 autouse fixture 重定向到 tmp dir）
- 不写 change-detector 测试（快照型）；写行为契约测试（关系型）

### 13.5 其他已知坑

| 问题 | 说明 |
|---|---|
| `\033[K` ANSI 码 | 不能在 spinner/display 中使用，会在 prompt_toolkit 下泄漏为 `?[K` |
| `_last_resolved_tool_names` | `model_tools.py` 中的进程全局变量，子 Agent 执行期间会临时失效 |
| `simple_term_menu` | 已知有 ghost-duplication 渲染 bug，新交互菜单必须用 `hermes_cli/curses_ui.py` |
| 跨工具 schema 引用 | 工具 schema 中不能直接引用其他 toolset 的工具名（按需动态添加，参考 `get_tool_definitions()` 里的 browser_navigate 后处理） |

---

## 14. 文件依赖链

```
tools/registry.py           ← 无外部依赖
       ↑
tools/*.py                  ← import 时自动注册到 registry
       ↑
model_tools.py              ← import tools/registry + 触发 discover_builtin_tools()
  + hermes_cli/plugins.py   ← discover_plugins() 作为副作用触发
       ↑
run_agent.py                ← AIAgent 主类
cli.py                      ← HermesCLI 交互界面
batch_runner.py             ← 批量轨迹生成
tools/environments/         ← 终端后端（各自 import run_agent）
       ↑
hermes_cli/main.py          ← 程序入口，_apply_profile_override() 最先运行
gateway/run.py              ← 网关入口
```

**配置文件优先级**（高到低）：
```
命令行参数
  └─ ~/.hermes/.env（API keys）
       └─ ~/.hermes/config.yaml（用户设置）
            └─ DEFAULT_CONFIG（hermes_cli/config.py 硬编码默认值）
```

---

*文档生成时间：2026-05-27 | 对应版本：v0.14.0+*
