# 模块一：Agent 主循环

> 核心文件：`agent/conversation_loop.py`（4350 行）、`run_agent.py`（4438 行）、`agent/agent_init.py`（1644 行）
> 版本：v0.14.0+

---

## 目录

1. [概览](#1-概览)
2. [AIAgent 类](#2-aiagent-类)
3. [阶段一：预循环初始化](#3-阶段一预循环初始化)
4. [阶段二：外层工具调用循环](#4-阶段二外层工具调用循环)
5. [阶段三：后循环清理](#5-阶段三后循环清理)
6. [错误分类与恢复体系](#6-错误分类与恢复体系)
7. [空响应恢复机制](#7-空响应恢复机制)
8. [Prompt Cache 保护机制](#8-prompt-cache-保护机制)
9. [返回值结构](#9-返回值结构)
10. [完整流程图](#10-完整流程图)

---

## 1. 概览

`run_conversation()` 是驱动一次完整用户 turn 的核心函数，位于 `agent/conversation_loop.py:263`，是从原始 `run_agent.py` 中提取出的最大单块逻辑（约 3900 行）。

**整体结构**：

```
预循环初始化（行 263–675）
  ↓
外层工具调用循环（行 675–4042）
  ├─ 消息构建与净化
  ├─ 内层 API 重试循环
  ├─ 响应处理（工具调用 or 文本）
  └─ 各类异常恢复路径
  ↓
后循环清理（行 4043–4346）
```

函数是**完全同步**的，网关多用户并发靠多进程/多线程实现。

---

## 2. AIAgent 类

### 2.1 类定义

`run_agent.py:327`，`__init__` 转发给 `agent/agent_init.py::init_agent()`：

```python
class AIAgent:
    def chat(self, message: str) -> str:
        """简单接口，返回最终响应字符串。"""

    def run_conversation(
        self,
        user_message: str,
        system_message: str = None,
        conversation_history: list = None,
        task_id: str = None,
        stream_callback: callable = None,
        persist_user_message: str = None,
    ) -> dict:
        """完整接口，返回包含 final_response + messages 的字典。"""
```

### 2.2 初始化参数分类（约 60 个）

| 分类 | 参数 |
|---|---|
| API 凭证 | `base_url`、`api_key`、`provider`、`api_mode` |
| 模型配置 | `model`、`max_tokens`、`reasoning_config`、`service_tier`、`request_overrides` |
| 迭代控制 | `max_iterations=90`、`iteration_budget`、`tool_delay=1.0` |
| 工具集 | `enabled_toolsets`、`disabled_toolsets` |
| 会话 | `session_id`、`platform`、`skip_context_files`、`skip_memory`、`session_db` |
| 回调（8 个） | `tool_progress_callback`、`tool_start_callback`、`tool_complete_callback`、`thinking_callback`、`reasoning_callback`、`clarify_callback`、`step_callback`、`stream_delta_callback` |
| 多租户 | `user_id`、`user_name`、`chat_id`、`chat_name`、`thread_id`、`gateway_session_key` |
| 子 Agent | `credential_pool`、`parent_session_id`、`iteration_budget`、`fallback_model` |
| 快照 | `checkpoints_enabled`、`checkpoint_max_snapshots`、`checkpoint_max_total_size_mb`、`checkpoint_max_file_size_mb` |
| 输出控制 | `quiet_mode`、`verbose_logging`、`log_prefix`、`save_trajectories` |

### 2.3 消息格式

所有消息遵循 OpenAI 格式：

```python
{"role": "system",    "content": "..."}
{"role": "user",      "content": "..."}
{"role": "assistant", "content": "...", "tool_calls": [...], "reasoning": "..."}
{"role": "tool",      "content": "...", "tool_call_id": "...", "name": "..."}
```

`"reasoning"` 字段是 Hermes 内部轨迹存储字段，发 API 前会被转换为各 provider 对应的格式（`reasoning_content` / `reasoning_details`）再删除。

---

## 3. 阶段一：预循环初始化

### 3.1 基础设施

```python
_install_safe_stdio()           # 保护 stdio 对抗 broken pipe（systemd/headless）
agent._ensure_db_session()      # 确保 SQLite session 行存在
set_runtime_main(provider, model)  # 告知 auxiliary_client 本 turn 的 provider/model
set_session_context(session_id)    # 日志打标，hermes logs --session 过滤用
set_current_write_origin(...)      # 标记技能写来源（前台 vs 后台 review）
agent._restore_primary_runtime()   # 若上轮用了 fallback，恢复主 provider
```

### 3.2 输入净化与 task_id

```python
user_message = _sanitize_surrogates(user_message)  # 处理富文本粘贴产生的孤代理字符
effective_task_id = task_id or str(uuid.uuid4())   # VM / 文件状态注册表的隔离 key
agent._current_task_id = effective_task_id         # 必须在工具调度前设置
```

### 3.3 Per-turn 计数器重置

每轮开始时清零，防止上一轮的子 Agent 使用量污染本轮：

```python
agent._invalid_tool_retries = 0        # 非法工具名重试
agent._invalid_json_retries = 0        # JSON 解析失败重试
agent._empty_content_retries = 0       # 空响应重试
agent._incomplete_scratchpad_retries = 0
agent._codex_incomplete_retries = 0
agent._thinking_prefill_retries = 0
agent._post_tool_empty_retried = False
agent._unicode_sanitization_passes = 0
agent._vision_supported = True         # 首次拒绝 image_url 后才置 False
agent._tool_guardrails.reset_for_turn()
```

### 3.4 网关模式状态恢复

网关每条消息创建一个新的 `AIAgent` 实例，需从历史中恢复内存状态：

```python
# 恢复 todo store（从历史中最近的 tool 结果反序列化）
if conversation_history and not agent._todo_store.has_items():
    agent._hydrate_todo_store(conversation_history)

# 恢复 nudge 计数器（否则 nudge_interval 永远不会触发）
if conversation_history and agent._user_turn_count == 0:
    prior_user_turns = sum(1 for m in history if m.get("role") == "user")
    agent._user_turn_count = prior_user_turns
    agent._turns_since_memory = prior_user_turns % nudge_interval
```

### 3.5 系统提示构建与 Cache 恢复

**最关键的初始化步骤**，决定 prefix cache 是否命中：

```
_restore_or_build_system_prompt()
 ├─ conversation_history 非空 → 从 SessionDB 读取已存储的 system_prompt
 │   ├─ present  → 直接复用（字节完全一致，prefix cache 命中）
 │   ├─ null     → 警告后重建（老 session，cache miss）
 │   └─ empty    → 警告后重建（写入 bug，cache miss）
 └─ 第一 turn（无历史）→ 调用 _build_system_prompt() 重建
      → 触发 on_session_start plugin hook
      → 持久化到 SessionDB（供后续 turn 复用）
```

`_build_system_prompt()` 内部调用 `agent/prompt_builder.py`，拼接顺序：
1. `SOUL.md`（个性文件）
2. `AGENTS.md` / `CLAUDE.md` / `.cursorrules`（工作目录上下文）
3. 技能清单（`build_skills_system_prompt()`）
4. 环境提示（`build_environment_hints()`，含 OS、shell、工作目录、终端后端）
5. Nous 订阅信息（`build_nous_subscription_prompt()`）

### 3.6 预飞行上下文压缩

进入循环前检测是否已超阈值（应对切换到小 context window 模型的场景）：

```python
_preflight_tokens = estimate_request_tokens_rough(messages, system_prompt, tools)
if compressor.should_compress(_preflight_tokens):
    for _pass in range(3):   # 最多 3 轮压缩
        messages, active_system_prompt = agent._compress_context(...)
        if tokens < threshold:
            break
```

### 3.7 Plugin 钩子与记忆预拉取

```python
# pre_llm_call：插件可向用户消息追加 context（不改系统提示）
_pre_results = _invoke_hook("pre_llm_call", user_message=..., ...)
_plugin_user_context = "\n\n".join(context_parts)

# 记忆 provider 预拉取（每轮只做一次，结果缓存复用）
agent._memory_manager.on_turn_start(turn_count, user_message)
_ext_prefetch_cache = agent._memory_manager.prefetch_all(query)
```

---

## 4. 阶段二：外层工具调用循环

```python
while (api_call_count < agent.max_iterations
       and agent.iteration_budget.remaining > 0) \
      or agent._budget_grace_call:
    ...
```

### 4.1 迭代开头检查

每次迭代开始时：

```python
agent._checkpoint_mgr.new_turn()   # 重置 per-turn 快照去重

if agent._interrupt_requested:     # 用户中断（新消息 / /stop）
    interrupted = True
    break

if agent._budget_grace_call:
    agent._budget_grace_call = False   # 消耗宽限机会
elif not agent.iteration_budget.consume():
    break                              # 预算耗尽

agent.step_callback(api_call_count, prev_tools)  # 通知 gateway 的 agent:step 事件
```

**iteration_budget**：父子 Agent 共享的迭代预算对象，确保子 Agent 不会无限消耗父 Agent 的迭代次数。

### 4.2 /steer 注入

`/steer` 是用户在 Agent 思考时发送的实时引导消息：

```python
_pre_api_steer = agent._drain_pending_steer()
if _pre_api_steer:
    # 找到最近的 role="tool" 消息，追加 "User guidance: ..." 到 content
    # 如果找不到（首次迭代，无工具输出）→ 放回 pending，等下次 tool 后注入
```

### 4.3 api_messages 构建

构建发给 API 的消息副本，**不修改内部 `messages` 列表**：

| 步骤 | 操作 |
|---|---|
| 1 | 修复损坏的 tool_call arguments JSON |
| 2 | 修复 role 交替违规（`tool→user` 或 `user→user` 尾部） |
| 3 | 向当前 turn 用户消息注入 ephemeral context（记忆 + plugin context） |
| 4 | `reasoning` → `reasoning_content`（Moonshot 等 provider 需要） |
| 5 | 删除 `finish_reason`（严格 API 如 Mistral 不接受） |
| 6 | 删除 `_thinking_prefill` 等内部标记字段 |
| 7 | 拼接 system 消息（cached_prompt + ephemeral_system_prompt） |
| 8 | 注入 prefill_messages（few-shot 示例，API-call-time only） |
| 9 | 注入 Anthropic `cache_control` 断点（system + 最近 3 条消息） |
| 10 | 清理孤立 tool 结果 / thinking-only 转 / 合并相邻 user 消息 |
| 11 | 标准化空白 + tool_call JSON `sort_keys`（确保 KV cache prefix 字节稳定） |
| 12 | surrogate 字符净化（Ollama / Kimi / GLM / Qwen 模型常见） |

### 4.4 内层 API 重试循环

```python
while retry_count < max_retries:
    ...
```

#### 4.4.1 Nous Portal 速率限制守卫

```python
if provider == "nous" and nous_rate_limit_remaining() > 0:
    if _try_activate_fallback():
        continue
    return 带明确错误信息的 dict
```

#### 4.4.2 构建 kwargs + pre_api_request hook

```python
api_kwargs = agent._build_api_kwargs(api_messages)
_invoke_hook("pre_api_request", request_messages=..., approx_input_tokens=..., ...)
```

#### 4.4.3 API 调用（永远优先 streaming）

```python
if _use_streaming:
    response = agent._interruptible_streaming_api_call(api_kwargs, on_first_delta=_stop_spinner)
else:
    response = agent._interruptible_api_call(api_kwargs)
```

**为什么永远优先 streaming？** streaming 路径有 90s 过期流检测 + 60s 读超时；非 streaming 路径在 provider 保持连接但不返回数据时会无限 hang。

**禁用 streaming 的情况**：
- `_disable_streaming=True`（provider 主动信号）
- `copilot-acp`（stdio 子进程，无法 stream）
- 单元测试中的 Mock client

#### 4.4.4 响应校验（按 api_mode 分路）

| api_mode | 校验逻辑 |
|---|---|
| `chat_completions`（默认）| `response.choices` 非空 |
| `anthropic_messages` | `response.content` 是非空列表 |
| `codex_responses` | `response.output` 非空，或 `output_text` 降级 |
| `bedrock_converse` | Bedrock 专用 transport 校验 |

#### 4.4.5 成功后的统计

```python
canonical_usage = normalize_usage(response)
agent.session_estimated_cost_usd += estimate_usage_cost(...)
agent._session_db.update_token_counts(...)  # 持久化到 SQLite

# 打印 cache 命中率（对所有 provider 均适用，不仅 Anthropic）
if cached or written:
    hit_pct = cached / prompt * 100
    agent._vprint(f"Cache: {cached}/{prompt} ({hit_pct:.0f}% hit)")

clear_nous_rate_limit()  # 成功说明限制已解除，清除跨 session 的速率标记
```

### 4.5 响应规范化与 post_api_request hook

```python
normalized = transport.normalize_response(response)
assistant_message = normalized
# content 强制转 str（部分 llama-server 返回 dict / list）
_invoke_hook("post_api_request", finish_reason=..., usage=..., assistant_message=..., ...)
```

### 4.6 工具调用处理分支

若 `assistant_message.tool_calls` 非空：

**步骤 1：工具名校验与模糊修复**

```python
for tc in tool_calls:
    if tc.function.name not in valid_tool_names:
        repaired = agent._repair_tool_call(tc.function.name)  # 模糊匹配
        if repaired:
            tc.function.name = repaired

# 仍有非法名 → 向模型返回 error，最多 3 次 agent-correction
if invalid_tool_calls:
    agent._invalid_tool_retries += 1
    if retries >= 3:
        return partial_result
    messages.append(error_tool_result)
    continue
```

**步骤 2：参数 JSON 校验**

```python
for tc in tool_calls:
    args = tc.function.arguments
    # 空字符串 → {}（模型常见怪癖）
    # 非法 JSON → 向模型返回解析错误，最多 3 次
```

**步骤 3：工具执行**

```python
for tc in assistant_message.tool_calls:
    result = handle_function_call(tc.function.name, args, task_id)
    tool_results.append({"role": "tool", "tool_call_id": tc.id, "content": result})

_invoke_hook("post_tool_call", ...)
messages.append(assistant_msg)
messages.extend(tool_results)
continue   # 进入下一次迭代
```

### 4.7 最终文本响应处理

若无工具调用，按以下优先级依次尝试退出或恢复：

| 路径 | 触发条件 | 处理 |
|---|---|---|
| 不完整 `<REASONING_SCRATCHPAD>` | `has_incomplete_scratchpad(content)` | 重试 2 次，超限返回 partial |
| Codex `incomplete` | `finish_reason == "incomplete"` | 累积并 continuation，最多 3 次 |
| thinking-only 回复 | 有 reasoning 但无 content | prefill continuation，最多 2 次 |
| 工具后空响应 | prior_was_tool + 首次 | 注入 nudge 消息，continue |
| 空响应重试 | `_truly_empty` | 重试 3 次 |
| fallback 切换 | 空响应耗尽重试次数 | 切 fallback provider |
| `finish_reason == "length"` | 输出被截断 | 累积 + max_tokens 翻倍（2× → 3×，上限 32768） |
| **正常文本** | content 非空，finish_reason == "stop" | `break` |

---

## 5. 阶段三：后循环清理

### 5.1 预算耗尽摘要

```python
if final_response is None and budget_exhausted:
    # 额外一次无工具 API 调用，让模型生成摘要
    final_response = agent._handle_max_iterations(messages, api_call_count)
    # 若是 kanban worker → 自动调用 kanban_block 标记任务失败
```

### 5.2 资源清理与持久化

```python
agent._save_trajectory(messages, user_message, completed)
agent._cleanup_task_resources(effective_task_id)    # 释放 VM / 浏览器
agent._drop_trailing_empty_response_scaffolding(messages)  # 删除内部 scaffold 消息
agent._persist_session(messages, conversation_history)     # 写 SQLite + JSON log
```

### 5.3 Turn-exit 诊断日志

```python
# 包含：turn_exit_reason / model / api_calls / budget / tool_turns / last_msg_role / response_len
# 最后一条消息是 role="tool" 时升级为 WARNING → "agent 突然停止"的根因定位
```

### 5.4 文件变更验证 footer

```python
# 若有 write_file/patch 调用失败且未被后续成功写入覆盖
# 追加 advisory footer 到 final_response，防止模型虚报"已修改"
if _failed and agent._file_mutation_verifier_enabled():
    final_response += "\n\n" + footer
```

### 5.5 Plugin 钩子顺序

```
transform_llm_output  → 可变换输出文本（第一个 non-empty string 生效）
post_llm_call         → 外部记忆同步（honcho / mem0 / supermemory 在此写入）
on_session_end        → 清理（disk-cleanup 在此运行，每 turn 末尾触发）
```

### 5.6 后台记忆 / 技能 Review

```python
if _should_review_memory or _should_review_skills:
    agent._spawn_background_review(
        messages_snapshot=list(messages),
        review_memory=_should_review_memory,
        review_skills=_should_review_skills,
    )
```

在独立线程运行，**不阻塞响应返回**。

触发条件：
- `_should_review_memory`：`_turns_since_memory >= memory_nudge_interval`（每 N turn 一次）
- `_should_review_skills`：`_iters_since_skill >= skill_nudge_interval`（累积工具迭代次数）

---

## 6. 错误分类与恢复体系

`agent/error_classifier.py::classify_api_error()` 把每个异常分类为 `FailoverReason`，驱动不同恢复路径：

| 错误类型 | FailoverReason | 恢复策略 |
|---|---|---|
| HTTP 429 | `rate_limit` | 读 `Retry-After` header → jittered backoff（最大 120s）；Nous 速率特殊处理 |
| HTTP 400/413（输入太大） | `context_overflow` | 解析实际 context length → 步进缩小 → compress → 重试（最多 3 次）|
| HTTP 413（payload 太大） | `payload_too_large` | 直接 compress，最多 3 次 |
| Anthropic thinking block 签名 | `thinking_signature` | 剥离所有 `reasoning_details`，一次性重试 |
| OpenAI Responses 加密推理 | `invalid_encrypted_content` | 禁用 codex reasoning replay，剥除历史 items，一次性重试 |
| llama.cpp grammar 拒绝 | `llama_cpp_grammar_pattern` | strip `pattern`/`format` from tool schemas，一次性重试 |
| UnicodeEncodeError（代理字符）| — | 净化 messages + api_kwargs，最多 2 次 |
| UnicodeEncodeError（ASCII codec）| — | 全量 ASCII 化（含 headers / api_key），设 `_force_ascii_payload` |
| HTTP 401 | `auth` | 各 provider 专用刷新（Nous / Anthropic / Copilot / Codex / Azure EntraID），一次性 |
| 4xx 不可重试 | `non_retryable` | 尝试 fallback chain → 仍失败则返回明确错误 |
| 5xx / 网络超时 | `server_error` / `network` | jittered backoff，每 200ms 检测 interrupt |
| max_retries 耗尽 | — | transport 重建（一次）→ fallback chain → 最终失败返回 |

### 6.1 Fallback Chain

`_try_activate_fallback()` 按配置的 `fallback_chain` 依次切换：

```yaml
# config.yaml
model:
  fallback_model: openrouter:anthropic/claude-3-5-sonnet
  fallback_chain:
    - provider: openrouter
      model: openai/gpt-4o
    - provider: anthropic
      model: claude-3-5-haiku-20241022
```

fallback 激活后 `retry_count` 清零，本 turn 结束后下一 turn 自动恢复主 provider（`_restore_primary_runtime()`）。

### 6.2 上下文压缩触发路径

上下文压缩（`agent._compress_context()`）在三处触发：

1. **预飞行**：进入循环前，`_preflight_tokens >= threshold`
2. **413 响应**：`payload_too_large`，compress 后 `restart_with_compressed_messages = True`
3. **context_overflow**：`context_overflow`，步进缩小 context_length + compress

每次压缩后重置 `conversation_history = None`，确保 `_flush_messages_to_session_db` 把压缩后的消息完整写入新 session，不跳过。

---

## 7. 空响应恢复机制

空响应（`content == ""` 或 `None`）有专门的多层恢复：

```
有结构化 reasoning（thinking-only）?
  ├─ 是 → prefill continuation（最多 2 次）
  │         将 assistant msg 加入历史，下轮模型看到自己的推理后输出文本
  └─ 否 ↓

刚执行了工具且未曾 nudge?
  └─ 注入 user nudge："你刚执行了工具但返回空，请继续处理..."
      → 追加空 assistant msg（保持 role 交替）+ nudge user msg
      → continue（一次机会）

_truly_empty（strip think blocks 后仍空）?
  ├─ empty_retries < 3 → 继续重试
  └─ 有 fallback chain → 切 fallback provider
       └─ 仍空 → content = "(empty)"，标记 _empty_terminal_sentinel
```

`_empty_terminal_sentinel` 标记的消息在 `_drop_trailing_empty_response_scaffolding()` 中被清理，不持久化进 session（防止下次 continue 时重现空响应循环）。

---

## 8. Prompt Cache 保护机制

Hermes 对 prompt cache 有严格保护，贯穿整个循环设计：

### 8.1 系统提示字节稳定

- 系统提示每个 session 只构建一次，通过 SessionDB 跨 turn 复用
- 构建后立即持久化，网关模式下的新 `AIAgent` 实例从 DB 恢复而非重建
- Plugin context（`pre_llm_call`）注入用户消息，**绝不修改系统提示**

### 8.2 api_messages 构建的 KV cache 优化

```python
# 标准化 content 空白（strip）
for am in api_messages:
    if isinstance(am.get("content"), str):
        am["content"] = am["content"].strip()

# tool_call arguments JSON 确定性排序（sort_keys=True，separators=(",", ":")）
# 确保 JSON 字节在不同轮次间完全一致
```

### 8.3 Anthropic cache_control 注入

```python
if agent._use_prompt_caching:
    api_messages = apply_anthropic_cache_control(
        api_messages,
        cache_ttl=agent._cache_ttl,           # 默认 5min，可配置为 1h（beta）
        native_anthropic=agent._use_native_cache_layout,
    )
```

断点位置：system 消息 + 最近 3 条消息尾部，覆盖约 75% 的 input token 重复成本。

### 8.4 压缩是唯一的 cache 破坏点

上下文压缩会重建系统提示（`active_system_prompt = agent._compress_context(...)`），这是整个 session 内**唯一合法的 cache 破坏操作**。压缩后 `_cached_system_prompt` 被更新，后续 turn 从新值继续。

---

## 9. 返回值结构

```python
{
    "final_response":     str | None,   # 最终回复文本
    "last_reasoning":     str | None,   # 本 turn 最后一次推理内容
    "messages":           list,          # 完整消息列表（含 tool 调用记录）
    "api_calls":          int,
    "completed":          bool,
    "turn_exit_reason":   str,           # 诊断字符串，见下表
    "failed":             bool,
    "partial":            bool,          # 因非法工具名中途停止
    "interrupted":        bool,

    # 模型/provider 信息
    "model":    str,
    "provider": str,
    "base_url": str,

    # Token 统计
    "input_tokens":       int,
    "output_tokens":      int,
    "cache_read_tokens":  int,
    "cache_write_tokens": int,
    "reasoning_tokens":   int,

    # 费用估算
    "estimated_cost_usd": float | None,
    "cost_status":        str,   # "estimated" | "included" | "unknown"
    "cost_source":        str,

    "session_id":         str,

    # 可选字段
    # "guardrail":        dict   # tool_guardrail 触发时
    # "pending_steer":    str    # 未消费的 /steer 消息
    # "interrupt_message": str   # 触发中断的消息内容
}
```

**`turn_exit_reason` 常见值**：

| 值 | 含义 |
|---|---|
| `text_response(finish_reason=stop)` | 正常完成 |
| `interrupted_by_user` | 用户中断（循环入口检测） |
| `interrupted_during_api_call` | API 调用时中断 |
| `budget_exhausted` | 迭代预算耗尽 |
| `max_iterations_reached(N/M)` | 达到最大迭代次数 |
| `empty_response_exhausted` | 空响应耗尽所有重试 |
| `fallback_prior_turn_content` | 使用前轮 narration 作为最终回复 |
| `error_near_max_iterations(...)` | 接近上限时发生错误 |
| `ollama_runtime_context_too_small` | Ollama context 不足以运行工具 |

---

## 10. 完整流程图

```
run_conversation(agent, user_message)
│
├─ [Init] 安装 safe stdio / 设 session+task 上下文 / 重置所有计数器
├─ [Restore] 网关：从历史恢复 todo_store + nudge 计数器
├─ [Prompt] 从 SessionDB 复用系统提示 or 首次构建（保证 prefix cache 字节稳定）
├─ [Compress?] preflight：若 token > threshold，最多 3 次压缩
├─ [Hook] pre_llm_call → 注入 plugin context 到用户消息
├─ [Memory] memory_manager.on_turn_start() + prefetch_all()
│
├─ while budget.remaining > 0 or grace_call:           ← 外层循环
│   │
│   ├─ 检查 interrupt / 消耗 budget / 触发 step_callback
│   ├─ 处理 /steer（注入最近 tool msg）
│   ├─ 构建 api_messages（净化 / reasoning / cache_control / prefill）
│   │
│   ├─ while retry_count < max_retries:                ← 内层重试
│   │   ├─ Nous 速率守卫
│   │   ├─ build_api_kwargs + [Hook] pre_api_request
│   │   ├─ streaming API 调用（首选）
│   │   ├─ 响应校验（按 api_mode）
│   │   ├─ 错误分类 → classify_api_error()
│   │   │   ├─ rate_limit      → backoff / Retry-After
│   │   │   ├─ context_overflow → 步进 + compress
│   │   │   ├─ payload_too_large → compress
│   │   │   ├─ thinking_sig    → 剥离 reasoning_details
│   │   │   ├─ invalid_encrypted → 禁用 codex replay
│   │   │   ├─ llama_cpp       → strip pattern/format
│   │   │   ├─ Unicode/ASCII   → 净化 messages
│   │   │   ├─ 401             → token 刷新（各 provider 专用）
│   │   │   ├─ 4xx non-retry   → fallback chain
│   │   │   └─ max_retries     → transport 重建 → fallback → 返回错误
│   │   └─ 成功 → 更新 token/cost/cache-hit stats，break
│   │
│   ├─ 规范化响应 + [Hook] post_api_request
│   │
│   ├─ 有工具调用？
│   │   ├─ 名字校验 + 模糊修复（max 3 次 agent-correction）
│   │   ├─ JSON 参数校验（max 3 次）
│   │   ├─ handle_function_call() + [Hook] post_tool_call
│   │   ├─ [Hook] transform_tool_result（可替换结果）
│   │   └─ 追加结果，continue
│   │
│   └─ 无工具调用（纯文本 / 空）
│       ├─ 不完整 SCRATCHPAD → 重试 2 次
│       ├─ codex incomplete  → continuation 3 次
│       ├─ thinking-only     → prefill 2 次
│       ├─ 工具后空响应      → nudge（一次）
│       ├─ 空响应            → 重试 3 次 → fallback → "(empty)"
│       ├─ finish_reason=length → 累积 + max_tokens 翻倍
│       └─ 正常文本          → strip think blocks → break
│
├─ [Budget] 预算耗尽 → 无工具摘要调用 / kanban_block
├─ [Save] 轨迹 + 清理资源 + 清 scaffold 消息 + 持久化 session
├─ [Log] turn_exit_reason 诊断日志（最后是 tool → WARNING）
├─ [Footer] 文件变更验证（防模型虚报成功）
├─ [Hook] transform_llm_output → post_llm_call → on_session_end
├─ [Memory] 外部 memory sync
├─ [Background] spawn_background_review（记忆 + 技能，异步）
└─ return result dict
```
