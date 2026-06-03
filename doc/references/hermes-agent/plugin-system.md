# Hermes Agent 插件系统详解

> 基于源码阅读分析，核心文件：`hermes_cli/plugins.py`（1807 行）
> 版本：2026-05-29（v0.14.0+）

---

## 目录

1. [整体架构](#1-整体架构)
2. [插件发现与加载](#2-插件发现与加载)
3. [PluginContext：插件的唯一接口](#3-plugincontext插件的唯一接口)
4. [Hook 系统](#4-hook-系统)
5. [工具注册链路](#5-工具注册链路)
6. [各类 Backend 注册](#6-各类-backend-注册)
7. [插件类型与加载策略](#7-插件类型与加载策略)
8. [三条硬边界](#8-三条硬边界)
9. [完整工作流图](#9-完整工作流图)
10. [编写一个插件](#10-编写一个插件)

---

## 1. 整体架构

插件系统由 **四条完全独立的发现路径** 构成，共用 `PluginContext` 接口，但各自独立运作：

```
┌──────────────────────────────────────────────────────────────────────┐
│                          插件系统全景                                 │
├─────────────────┬──────────────┬──────────────┬─────────────────────┤
│ 通用插件路径     │ Memory 路径  │ Model 路径   │ Platform 子路径      │
│ PluginManager   │ plugins/     │ providers/   │ plugins/platforms/   │
│ hermes_cli/     │ memory/      │ __init__.py  │（PluginManager 管理） │
│ plugins.py      │ __init__.py  │              │                      │
├─────────────────┴──────────────┴──────────────┴─────────────────────┤
│ 统一接口：PluginContext（工具/hook/命令/backend/平台/技能注册）         │
└──────────────────────────────────────────────────────────────────────┘
```

- **通用插件（PluginManager）**：处理工具、hook、slash 命令、image_gen / video_gen / web_search / browser / TTS / transcription backend、context engine、skill 等所有扩展能力
- **Memory provider**：独立发现，只激活 `memory.provider` 配置项指定的那一个，集合已关闭（8 个内置）
- **Model provider**：懒发现（首次 `get_provider_profile()` 时触发），不走 PluginManager 以避免重复实例化
- **Platform 插件**：归属 PluginManager，`plugins/platforms/` 子目录单独扫描，bundled platform 自动加载

---

## 2. 插件发现与加载

### 2.1 四个来源，后者覆盖前者

```
优先级（低 → 高）
1. bundled  ──  <repo>/plugins/<name>/           随仓库发布
2. user     ──  ~/.hermes/plugins/<name>/         用户私有
3. project  ──  ./.hermes/plugins/<name>/         项目级（需 HERMES_ENABLE_PROJECT_PLUGINS=1）
4. pip      ──  importlib.metadata entry_points   pip 安装包
```

同名插件后者覆盖前者（last-writer-wins）。用户可用自己的实现替换任意 bundled 插件，无需 fork 仓库。

**pip 插件的 entry_points 声明（pyproject.toml）**：
```toml
[project.entry-points."hermes_agent.plugins"]
my-plugin = "my_package.hermes_plugin"
```

### 2.2 目录布局（两种）

```
plugins/
├── disk-cleanup/           ← flat 布局：key = "disk-cleanup"
│   ├── plugin.yaml
│   └── __init__.py
└── image_gen/              ← category 布局：category 目录本身无 plugin.yaml
    ├── openai/             ← key = "image_gen/openai"
    │   ├── plugin.yaml
    │   └── __init__.py
    └── fal/                ← key = "image_gen/fal"
        ├── plugin.yaml
        └── __init__.py
```

Category 布局的 key 格式为 `<category>/<name>`，深度上限 2 层。

### 2.3 plugin.yaml manifest

```yaml
name: disk-cleanup           # 插件名（用于日志、config 引用）
version: 2.0.0
description: "..."
author: "..."

# kind 决定加载策略（见第 7 节）
kind: standalone             # standalone | backend | exclusive | platform | model-provider

# 声明所需 env var（用于 hermes config UI 提示用户配置）
requires_env:
  - FAL_KEY
  - name: DISCORD_BOT_TOKEN  # 富格式，提供更多元数据
    description: "Discord bot token"
    prompt: "Discord bot token"
    url: "https://discord.com/developers/applications"
    password: true

# 以下字段仅供 introspection / 文档，不影响加载行为
provides_tools:
  - spotify_playback
hooks:
  - post_tool_call
  - on_session_end
```

### 2.4 加载时序（关键坑）

```
hermes 启动
  └─ hermes_cli/main.py
       └─ import model_tools          ← 唯一触发点（副作用）
            └─ discover_plugins()     ← 幂等，实际调用 PluginManager.discover_and_load()
```

**坑**：`discover_plugins()` 只作为 `model_tools.py` import 的副作用触发一次。任何不经过 `model_tools` 的独立脚本或代码路径，必须手动调用 `discover_plugins()`（函数本身是幂等的，调用多次无害）。

### 2.5 模块隔离加载

插件以独立命名空间加载，不污染全局包：

```python
# disk-cleanup     → hermes_plugins.disk_cleanup
# image_gen/openai → hermes_plugins.image_gen__openai
```

用 `importlib.util.spec_from_file_location` + `exec_module` 实现，每个插件有独立的模块对象，相互隔离。

### 2.6 启用/禁用控制

```yaml
# ~/.hermes/config.yaml
plugins:
  enabled:               # 显式白名单（standalone 插件需要在此列出才能加载）
    - disk-cleanup
    - spotify
  disabled:              # 黑名单（覆盖 enabled，任何来源的同名插件都不加载）
    - some-plugin
```

bundled backend / platform 类插件自动加载，不受 `enabled` 列表限制。

---

## 3. PluginContext：插件的唯一接口

每个插件的 `register(ctx)` 函数接收一个 `PluginContext` 对象，这是插件能做的**所有事情的总清单**。插件不能绕过 `PluginContext` 直接访问框架内部。

```python
def register(ctx: PluginContext) -> None:
    # ── 1. Lifecycle Hook ────────────────────────────────────────
    ctx.register_hook("post_tool_call", my_callback)

    # ── 2. 工具（进入全局 ToolRegistry）────────────────────────
    ctx.register_tool(
        name="my_tool",
        toolset="my_toolset",
        schema={"name": "my_tool", "description": "...", "parameters": {...}},
        handler=lambda args, **kw: my_handler(args),
        check_fn=lambda: bool(os.getenv("MY_API_KEY")),
        requires_env=["MY_API_KEY"],
        override=True,   # 可替换同名内置工具
    )

    # ── 3. Slash 命令（/my-cmd，CLI 和网关均可用）───────────────
    ctx.register_command(
        "my-cmd",
        handler=fn,           # fn(raw_args: str) -> str | None，支持 async
        description="...",
        args_hint="<file>",
    )

    # ── 4. hermes 子命令（hermes my-cmd）────────────────────────
    ctx.register_cli_command(
        "my-cmd",
        help="...",
        setup_fn=argparse_setup_fn,    # 接收 argparse subparser
        handler_fn=dispatch_fn,
    )

    # ── 5. 上下文引擎（替换内置 context compressor，全局唯一）──
    ctx.register_context_engine(MyContextEngine())

    # ── 6. 各种可替换 Backend ──────────────────────────────────
    ctx.register_image_gen_provider(MyImageProvider())
    ctx.register_video_gen_provider(MyVideoProvider())
    ctx.register_web_search_provider(MySearchProvider())
    ctx.register_browser_provider(MyBrowserProvider())
    ctx.register_tts_provider(MyTTSProvider())
    ctx.register_transcription_provider(MyTranscriptionProvider())

    # ── 7. 消息平台 ────────────────────────────────────────────
    ctx.register_platform(name="irc", adapter_class=IRCAdapter)

    # ── 8. 技能（只读，不进 ~/.hermes/skills/）─────────────────
    ctx.register_skill("my-skill", path=Path("skills/SKILL.md"))

    # ── 9. Auxiliary Task（副 LLM 任务的配置项）────────────────
    ctx.register_auxiliary_task("my_task", display_name="My Task",
                                description="...", defaults={...})

    # ── 10. 向当前对话注入消息（仅 CLI 模式）───────────────────
    ctx.inject_message("来自插件的消息", role="user")

    # ── 11. 通过 registry 调用工具（带完整 agent 上下文）───────
    result = ctx.dispatch_tool("delegate_task", {"goal": "做某事"})

    # ── 12. 使用用户的模型（无需自己的 API key）────────────────
    response = ctx.llm.chat("你好")   # PluginLlm facade
```

### 3.1 ctx.llm — 宿主模型访问

插件可以通过 `ctx.llm` 使用用户已配置的 LLM，无需携带独立 API key。权限通过 `plugins.entries.<plugin_id>.llm.*` 配置项管控，默认 fail-closed（未配置时不可用）。

### 3.2 ctx.dispatch_tool — 工具调用

插件 slash 命令可以通过 `ctx.dispatch_tool()` 触发任意已注册工具（如 `delegate_task`），并自动绑定 parent agent 上下文（在 CLI 模式下）。网关模式下 `_cli_ref` 为 None，工具会以无 agent 上下文的模式优雅降级。

---

## 4. Hook 系统

这是理解**插件如何参与 Agent 工作流**的核心。Agent 在执行的关键节点调用 `invoke_hook(name, **kwargs)`，所有注册了该 hook 的插件回调被依次执行。每个回调被独立的 `try/except` 包裹，单个插件崩溃不影响核心循环。

### 4.1 完整 Hook 列表

| Hook | 触发位置 | 文件:行 | 主要 kwargs |
|---|---|---|---|
| `on_session_start` | 第一 turn，系统提示构建后 | `conversation_loop.py:207` | session_id, model, platform |
| `pre_llm_call` | 进入工具循环前（每 turn 一次） | `conversation_loop.py:581` | session_id, user_message, conversation_history, is_first_turn, model, platform, sender_id |
| `pre_api_request` | 每次 API 调用前 | `conversation_loop.py:1104` | task_id, session_id, model, provider, api_mode, api_call_count, request_messages, approx_input_tokens |
| `post_api_request` | API 成功，响应规范化后 | `conversation_loop.py:3187` | task_id, api_duration, finish_reason, usage, assistant_message, assistant_tool_call_count |
| `pre_tool_call` | 工具执行前 | `model_tools.py:788` | tool_name, args, task_id, session_id, tool_call_id |
| `post_tool_call` | 工具执行后 | `model_tools.py:851` | tool_name, args, result, task_id, session_id, tool_call_id, **duration_ms** |
| `transform_tool_result` | post_tool_call 之后 | `model_tools.py:872` | tool_name, args, result, duration_ms |
| `transform_terminal_output` | terminal 工具输出处理 | `tools/terminal_tool.py` | output, tool_name |
| `transform_llm_output` | 主循环结束，返回前 | `conversation_loop.py:4195` | response_text, session_id, model, platform |
| `post_llm_call` | transform_llm_output 之后 | `conversation_loop.py:4217` | session_id, user_message, assistant_response, conversation_history, model, platform |
| `on_session_end` | 每次 run_conversation 末尾 | `conversation_loop.py:4335` | session_id, completed, interrupted, model, platform |
| `on_session_finalize` | session 真正结束（CLI reset / 网关过期） | CLI / gateway | session_id |
| `on_session_reset` | /new、/reset 时 | CLI | session_id |
| `subagent_stop` | 子 Agent 停止时 | delegate_tool | task_id, session_id |
| `pre_gateway_dispatch` | 网关收消息，鉴权前 | `gateway/run.py` | event, gateway, session_store |
| `pre_approval_request` | 危险命令审批弹出前 | `tools/approval.py` | command, description, pattern_key, session_key, surface |
| `post_approval_response` | 审批完成后 | `tools/approval.py` | command, choice ("once"\|"session"\|"always"\|"deny"\|"timeout") |

### 4.2 Hook 返回值语义

不同 hook 对返回值的处理策略不同：

| Hook | 返回值 | 效果 |
|---|---|---|
| `pre_tool_call` | `{"action": "block", "message": "..."}` | **阻断工具执行**，向模型返回 error |
| `pre_llm_call` | `{"context": "..."}` 或字符串 | **注入**当前 turn 用户消息（不改系统提示）|
| `transform_tool_result` | 字符串 | **替换**工具结果（第一个 non-None string 生效）|
| `transform_llm_output` | 字符串 | **替换**最终 LLM 输出（第一个 non-empty string 生效）|
| `pre_gateway_dispatch` | `{"action": "skip", "reason": "..."}` | **丢弃**消息，不回复 |
| `pre_gateway_dispatch` | `{"action": "rewrite", "text": "..."}` | **替换**消息内容，继续处理 |
| 其余大多数 hook | 任何值 | **忽略**（observer-only）|

### 4.3 pre_llm_call 的上下文注入约束

`pre_llm_call` 注入的 context **必须进用户消息，不能修改系统提示**。原因：系统提示被整个 session 复用（从 SessionDB 恢复），改动它会破坏 Anthropic/OpenAI prefix cache，废掉 ~75% 的 token 折扣。

```python
# 正确：注入用户消息
def my_pre_llm_call(user_message, **kwargs):
    return {"context": "相关历史记忆：..."}  # 追加到用户消息

# 错误：永远不要在 hook 里改系统提示
```

### 4.4 pre_tool_call 的 thread whitelist 机制

除了 hook 拦截，还有一个线程级工具白名单：

```python
from hermes_cli.plugins import set_thread_tool_whitelist

# 在某线程中限制可用工具（用于子 Agent 角色隔离）
set_thread_tool_whitelist(
    allowed={"read_file", "search_files"},
    deny_msg_fmt="Tool '{tool_name}' denied: leaf agent cannot call this tool"
)
```

白名单检查优先于 `pre_tool_call` hook，且是线程局部的（`threading.local`），不影响其他线程。

### 4.5 实际例子：disk-cleanup 插件

disk-cleanup 演示了一个纯 hook 驱动的零侵入插件：

```python
# 每次工具执行后自动追踪新建的测试/临时文件
def _on_post_tool_call(tool_name, args, result, task_id, session_id, **_):
    if tool_name in ("write_file", "terminal"):
        path = _extract_path_from_result(result)
        if path and _looks_like_temp_file(path):
            _record_track(task_id, session_id, path)  # 静默追踪

# turn 结束后执行清理
def _on_session_end(session_id, completed, **_):
    tracked = _drain(session_id=session_id)
    if tracked:
        disk_cleanup.quick()       # 清理文件
        _write_cleanup_log(...)    # 记录日志

def register(ctx):
    ctx.register_hook("post_tool_call", _on_post_tool_call)
    ctx.register_hook("on_session_end", _on_session_end)
    ctx.register_command("disk-cleanup", handler=_handle_slash,
                         description="Track and clean up ephemeral files.")
```

**0 行核心代码修改**，完全通过 hook 订阅实现。

---

## 5. 工具注册链路

插件工具与内置工具最终进入**同一个** `ToolRegistry`，Agent 完全感知不到来源差别：

```
插件 register(ctx)
  └─ ctx.register_tool(name, toolset, schema, handler)
       └─ tools/registry.py::ToolRegistry.register(...)
            ├─ ToolEntry 存入 _tools 字典
            └─ PluginManager._plugin_tool_names.add(name)  ← 用于 introspection

工具调用时（model_tools.py::handle_function_call）
  ├─ get_pre_tool_call_block_message()   ← pre_tool_call hook（可 block）
  ├─ registry.dispatch(name, args)       ← 统一分发，无论内置还是插件
  ├─ invoke_hook("post_tool_call", ...)  ← 执行后通知
  └─ invoke_hook("transform_tool_result", ...) ← 可替换结果
```

### 5.1 override=True：替换内置工具

```python
ctx.register_tool(
    name="browser_navigate",
    toolset="browser",
    schema={...},
    handler=my_cdp_handler,
    override=True,    # 替换内置的 browser_navigate
)
```

这让插件可以完全换掉某个内置工具的实现，例如将默认浏览器工具替换为基于 Playwright 的实现。

### 5.2 工具集联动

插件工具注册时指定 `toolset`，该 toolset 会自动出现在 `hermes tools` 的 TUI 中，可以被用户按平台启用/禁用，与内置 toolset 完全相同的行为。

---

## 6. 各类 Backend 注册

除工具外，插件还可以注册各种"可替换 backend"，通过 `config.yaml` 的 provider 配置项路由：

| 注册方法 | 对应配置项 | ABC 基类 |
|---|---|---|
| `register_image_gen_provider` | `image_gen.provider` | `agent/image_gen_provider.py::ImageGenProvider` |
| `register_video_gen_provider` | `video_gen.provider` | `agent/video_gen_provider.py::VideoGenProvider` |
| `register_web_search_provider` | `web.search_backend` / `web.extract_backend` | `agent/web_search_provider.py::WebSearchProvider` |
| `register_browser_provider` | `browser.provider` | `agent/browser_provider.py::BrowserProvider` |
| `register_tts_provider` | `tts.provider` | `agent/tts_provider.py::TTSProvider` |
| `register_transcription_provider` | `stt.provider` | `agent/transcription_provider.py::TranscriptionProvider` |
| `register_context_engine` | 全局唯一，只能注册一次 | `agent/context_engine.py::ContextEngine` |

实际工具调用时，工具实现（如 `image_generation_tool.py`）读取配置项，按 name 从对应 registry 中选取 provider 实例，再调用其方法。插件 backend 与 bundled backend 完全同等地位。

---

## 7. 插件类型与加载策略

| kind | 加载策略 | 典型用途 | 示例 |
|---|---|---|---|
| `standalone` | 需在 `plugins.enabled` 中显式启用 | 工具/hook/命令扩展 | disk-cleanup, spotify, google_meet |
| `backend` | bundled 自动加载；user-installed 需 enabled | 可替换服务后端 | image_gen/openai, image_gen/fal, browser/browser-use |
| `exclusive` | 跳过（由各自 discovery 管理） | memory provider | honcho, mem0, supermemory |
| `platform` | bundled 自动加载；user-installed 需 enabled | 消息平台适配器 | platforms/discord, platforms/irc, platforms/line |
| `model-provider` | 跳过（由 providers/ 懒发现管理） | 推理后端 | model-providers/openrouter, model-providers/gemini |

**model-provider 的 kind 自动检测**：如果 `plugin.yaml` 没有声明 `kind`，但 `__init__.py` 包含 `register_provider` + `ProviderProfile` 调用，则自动识别为 `model-provider`，避免重复实例化。

---

## 8. 三条硬边界

### 8.1 核心文件铁律（Teknium, 2026-05）

插件**不得修改**以下核心文件：
- `run_agent.py`
- `cli.py`
- `gateway/run.py`
- `hermes_cli/main.py`

如需新能力，扩展 plugin surface（新 hook 或新 `ctx.*` 方法），绝不硬编码插件特例进核心。

**背景**：PR #5295 移除了 95 行硬编码的 honcho argparse 逻辑，确立此规则。

### 8.2 系统提示不可触碰

`pre_llm_call` 注入的内容必须进用户消息，禁止在任何 hook 中修改系统提示。修改系统提示会使 session 内所有后续 turn 的 prefix cache 失效，大幅增加 token 成本。

### 8.3 Memory Provider 集合已关闭

`plugins/memory/` 里的 8 个 provider（honcho / mem0 / supermemory / byterover / hindsight / holographic / openviking / retaindb）是最后一批内置的。新 memory backend 只能作为独立 repo 发布，通过 `~/.hermes/plugins/` 或 pip entry points 安装，实现同一 `MemoryProvider` ABC 即可。

---

## 9. 完整工作流图

```
hermes 启动
  └─ hermes_cli/main.py
       └─ import model_tools  ←──── 唯一发现触发点
            └─ discover_plugins()（幂等）
                 └─ PluginManager.discover_and_load()
                      ├─ 扫描 bundled / user / project / pip（后者覆盖前者）
                      ├─ 读 plugin.yaml（kind 决定是否加载）
                      └─ 调用 plugin.__init__.register(ctx)
                           ├─ ctx.register_hook(...)      → PluginManager._hooks
                           ├─ ctx.register_tool(...)      → tools/registry（全局）
                           ├─ ctx.register_command(...)   → PluginManager._plugin_commands
                           ├─ ctx.register_*_provider(...)→ 各 backend registry
                           └─ ctx.register_platform(...)  → gateway platform_registry

用户发送一条消息
  └─ run_conversation(agent, user_message)
       │
       ├─ [on_session_start] 第一 turn：系统提示首次构建后触发
       │
       ├─ [pre_llm_call] 每 turn 一次
       │    └─ 返回值注入当前 turn 用户消息（不改系统提示）
       │
       ├─ while 工具循环（最多 max_iterations 次）:
       │    │
       │    ├─ [pre_api_request] 每次 API 调用前（可观察请求）
       │    │
       │    ├─ LLM API 调用
       │    │
       │    ├─ [post_api_request] API 成功后（可观察响应、用量）
       │    │
       │    ├─ 有工具调用？
       │    │   ├─ [pre_tool_call] 工具执行前
       │    │   │    └─ 返回 {"action": "block"} → 阻断执行
       │    │   │
       │    │   ├─ registry.dispatch()（插件工具 = 内置工具）
       │    │   │
       │    │   ├─ [post_tool_call] 工具执行后（observational）
       │    │   │    duration_ms 可用于延迟监控
       │    │   │
       │    │   └─ [transform_tool_result] 可替换工具结果
       │    │        └─ 第一个 non-None string 生效
       │    │
       │    └─ 无工具调用（文本响应）→ break
       │
       ├─ [transform_llm_output] 主循环结束，可替换最终回复文本
       │    └─ 第一个 non-empty string 生效
       │
       ├─ [post_llm_call] 外部记忆同步
       │    └─ honcho / mem0 / supermemory 在此写入会话记录
       │
       └─ [on_session_end] 每轮末尾清理
            └─ disk-cleanup 在此运行文件清理

网关收到消息
  └─ [pre_gateway_dispatch] 鉴权前
       ├─ {"action": "skip"}              → 丢弃消息
       ├─ {"action": "rewrite", "text"}   → 替换消息内容
       └─ None / {"action": "allow"}      → 正常分发

危险命令审批
  ├─ [pre_approval_request]  → observer
  └─ [post_approval_response] → observer，记录用户选择
```

---

## 10. 编写一个插件

### 10.1 目录结构

```
~/.hermes/plugins/my-plugin/
├── plugin.yaml
├── __init__.py
└── core.py          # 可选的业务逻辑模块
```

### 10.2 plugin.yaml

```yaml
name: my-plugin
version: 1.0.0
description: "我的第一个 Hermes 插件，演示 hook + 工具注册。"
author: your-name
kind: standalone
requires_env:
  - MY_API_KEY
```

### 10.3 \_\_init\_\_.py

```python
"""my-plugin — 演示 hook + 工具注册。"""
from __future__ import annotations
import json
import os


# ── 工具实现 ──────────────────────────────────────────────────────
def _my_tool_handler(args: dict, **kwargs) -> str:
    query = args.get("query", "")
    # 实际业务逻辑...
    return json.dumps({"result": f"处理完毕: {query}"})


# ── Hook 回调 ─────────────────────────────────────────────────────
def _on_post_tool_call(tool_name: str, result: str, duration_ms: int, **kwargs):
    """每次工具执行后记录延迟（observer-only，不修改任何东西）。"""
    if duration_ms > 5000:
        import logging
        logging.getLogger(__name__).warning(
            "慢工具检测：%s 耗时 %dms", tool_name, duration_ms
        )


def _on_pre_llm_call(user_message: str, model: str, **kwargs):
    """每轮开始前注入额外上下文到用户消息。"""
    extra = os.getenv("MY_EXTRA_CONTEXT", "")
    if extra:
        return {"context": extra}


# ── 入口：register(ctx) ───────────────────────────────────────────
def register(ctx) -> None:
    # 注册工具
    ctx.register_tool(
        name="my_query",
        toolset="my_toolset",
        schema={
            "name": "my_query",
            "description": "使用我的插件查询数据。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "查询内容"},
                },
                "required": ["query"],
            },
        },
        handler=_my_tool_handler,
        check_fn=lambda: bool(os.getenv("MY_API_KEY")),
        requires_env=["MY_API_KEY"],
    )

    # 注册 hook
    ctx.register_hook("post_tool_call", _on_post_tool_call)
    ctx.register_hook("pre_llm_call", _on_pre_llm_call)

    # 注册 slash 命令（/my-plugin <args>）
    ctx.register_command(
        "my-plugin",
        handler=lambda args: f"my-plugin 收到参数: {args}",
        description="调用 my-plugin。",
        args_hint="<query>",
    )
```

### 10.4 启用插件

```bash
# 方式一：命令行
hermes plugins enable my-plugin

# 方式二：直接编辑 ~/.hermes/config.yaml
plugins:
  enabled:
    - my-plugin
```

### 10.5 调试

```bash
HERMES_PLUGINS_DEBUG=1 hermes      # 输出详细发现日志到 stderr
hermes plugins list                # 查看所有已发现插件及状态
```

### 10.6 注意事项

1. **所有 hook 回调参数必须接受 `**kwargs`**，框架可能随版本新增字段，不接受 kwargs 的回调会在新字段出现时报 TypeError。

2. **handler 必须返回 JSON 字符串**，工具 handler 的返回值会直接放进 `role: "tool"` 消息，必须是合法 JSON。

3. **不要在 hook 里修改系统提示**，只能通过 `pre_llm_call` 返回值注入用户消息。

4. **hook 崩溃不影响核心**，但会产生 WARNING 日志，发布前做好异常处理。

5. **路径使用 `get_hermes_home()`**，如需写入持久状态，用 `from hermes_constants import get_hermes_home` 而不是硬编码 `~/.hermes`。

---

*文档生成时间：2026-05-29 | 对应版本：v0.14.0+*
