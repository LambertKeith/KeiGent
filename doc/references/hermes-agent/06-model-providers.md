# 模块六：模型 Provider 系统

> 核心文件：`providers/__init__.py`、`providers/base.py`、`plugins/model-providers/<name>/__init__.py`、`agent/*_adapter.py`
> 版本：v0.14.0+

---

## 目录

1. [整体架构](#1-整体架构)
2. [ProviderProfile：Provider 描述符](#2-providerprofile-provider-描述符)
3. [Provider 发现机制（懒发现）](#3-provider-发现机制懒发现)
4. [内置 Provider 列表](#4-内置-provider-列表)
5. [API 适配器层](#5-api-适配器层)
6. [API 模式（api_mode）](#6-api-模式api_mode)
7. [Auxiliary Client（副 LLM）](#7-auxiliary-client副-llm)
8. [Credential Pool（多 Key 池）](#8-credential-pool多-key-池)
9. [Smart Model Routing](#9-smart-model-routing)
10. [添加自定义 Provider](#10-添加自定义-provider)
11. [Provider 相关配置](#11-provider-相关配置)

---

## 1. 整体架构

```
用户配置（hermes model → config.yaml）
  └─ provider: "openrouter"，model: "anthropic/claude-opus-4-5"
       │
       ▼
providers/__init__.py::get_provider_profile("openrouter")  ← 懒发现
  └─ ProviderProfile（OpenRouterProfile）
       ├─ api_mode, base_url, env_vars, auth_type
       ├─ build_extra_body() → provider routing 配置
       ├─ build_api_kwargs_extras() → reasoning config
       └─ fetch_models() → 模型列表

       ▼
run_agent.py::AIAgent._build_api_kwargs()
  ├─ 选择 transport（OpenAI SDK / Anthropic SDK / Bedrock SDK / ACP）
  ├─ 注入 provider-specific 字段
  └─ 调用 API

       ▼
agent/*_adapter.py（per-provider 响应规范化）
  ├─ anthropic_adapter: Anthropic Messages API → 标准格式
  ├─ gemini_native_adapter: Gemini API → 标准格式
  ├─ codex_responses_adapter: OpenAI Responses API → 标准格式
  └─ bedrock_adapter: Bedrock Converse API → 标准格式
```

---

## 2. ProviderProfile：Provider 描述符

`providers/base.py:39`，**纯声明式数据类**，描述 provider 的所有静态属性。不负责 client 构建、credential 轮换或 streaming。

### 2.1 核心字段

```python
@dataclass
class ProviderProfile:
    # ── 身份 ──────────────────────────────────────────────
    name:         str              # 规范名（如 "openrouter"）
    aliases:      tuple = ()       # 别名（如 ("or", "openrouter-ai")）
    api_mode:     str = "chat_completions"  # 见 §6

    # ── 显示信息 ──────────────────────────────────────────
    display_name: str = ""         # "GMI Cloud"（picker 显示）
    description:  str = ""         # 副标题
    signup_url:   str = ""         # 注册页面（setup wizard 中显示）

    # ── 认证与端点 ────────────────────────────────────────
    env_vars:     tuple = ()       # API key 的 env var 名（按优先级排列）
    base_url:     str = ""         # API 端点
    models_url:   str = ""         # 模型列表端点（空→ base_url/models）
    auth_type:    str = "api_key"  # 认证方式（见 §2.2）
    supports_health_check: bool = True

    # ── 模型目录 ──────────────────────────────────────────
    fallback_models: tuple = ()    # picker 中的后备模型列表（live fetch 失败时用）
    hostname:        str = ""      # 反向 URL→provider 映射

    # ── 请求级别配置 ──────────────────────────────────────
    default_headers:      dict = {}
    fixed_temperature:    Any = None    # None=默认，OMIT_TEMPERATURE=不发送
    default_max_tokens:   int | None = None
    default_aux_model:    str = ""      # 辅助任务用的廉价模型
```

### 2.2 认证类型（auth_type）

| auth_type | 说明 | 代表 provider |
|---|---|---|
| `api_key` | Bearer token 或 x-api-key header | 大多数 provider |
| `oauth_device_code` | OAuth Device Code flow | xAI OAuth（SuperGrok）|
| `oauth_external` | 外部 OAuth（如 Google 服务账号）| Gemini Cloud Code |
| `copilot` | GitHub Copilot token | copilot |
| `aws_sdk` | AWS 凭证（boto3）| Bedrock |

### 2.3 可覆盖的方法

| 方法 | 说明 | 默认行为 |
|---|---|---|
| `prepare_messages(messages)` | 发送前处理消息列表（codex 字段清理后、developer role 替换前） | 透传 |
| `build_extra_body(**ctx)` | 构建 `extra_body` 字段（provider routing / Pareto code 评分等）| 空 dict |
| `build_api_kwargs_extras(**ctx)` | 分别返回 `(extra_body_additions, top_level_kwargs)`（reasoning config 因 provider 不同放在不同位置）| `({}, {})` |
| `fetch_models(api_key, timeout)` | 获取模型列表（用于 `/model` picker）| GET base_url/models |

### 2.4 reasoning_config 的 provider 差异

不同 provider 的 reasoning/thinking 配置位置不同，由 `build_api_kwargs_extras()` 处理：

| Provider | reasoning config 位置 |
|---|---|
| OpenRouter | `extra_body.reasoning.effort` / `extra_body.thinking.type` |
| Kimi/Moonshot | top-level `api_kwargs.reasoning_effort` |
| Anthropic（native）| `extra_body.thinking.type` + `budget_tokens` |
| OpenAI | `extra_body.reasoning.effort` |

---

## 3. Provider 发现机制（懒发现）

`providers/__init__.py::_discover_providers()`，在首次调用 `get_provider_profile()` 或 `list_providers()` 时触发，**不走通用 PluginManager**。

### 3.1 发现顺序（后者覆盖前者）

```
1. <repo>/plugins/model-providers/<name>/    bundled provider
2. $HERMES_HOME/plugins/model-providers/<name>/  user provider（覆盖 bundled）
3. providers/<name>.py                        legacy 单文件 provider（向后兼容）
```

### 3.2 模块加载路径

| 来源 | 模块名格式 |
|---|---|
| bundled | `plugins.model_providers.<safe_name>` |
| user | `_hermes_user_provider_<safe_name>` |
| legacy | `providers.<name>` |

Bundled 用稳定的包路径确保插件内的相对 import 正常工作；User 用唯一名称避免多 profile 间命名冲突。

### 3.3 last-writer-wins

`register_provider()` 直接覆盖 `_REGISTRY[profile.name]`，user plugins 扫描在 bundled 之后，自然实现覆盖：

```python
def register_provider(profile: ProviderProfile) -> None:
    _REGISTRY[profile.name] = profile          # 覆盖同名 bundled
    for alias in profile.aliases:
        _ALIASES[alias] = profile.name
```

### 3.4 与通用 PluginManager 的关系

通用 PluginManager 扫描时会识别 `kind: model-provider` 的插件，但**不 import 它们**（会导致 `ProviderProfile` 重复实例化，破坏 last-writer-wins）。PluginManager 只记录 manifest 用于 `hermes plugins list` 展示。

---

## 4. 内置 Provider 列表

共 30 个 bundled provider（`plugins/model-providers/`）：

| Provider | api_mode | 说明 |
|---|---|---|
| **anthropic** | `anthropic_messages` | 原生 Anthropic（x-api-key，支持 cache_control） |
| **openrouter** | `chat_completions` | 聚合 200+ 模型；provider routing；Pareto Code router |
| **openai-codex** | `codex_responses` | OpenAI Responses API（含 reasoning replay） |
| **gemini** | `chat_completions` | Google Gemini（OpenAI compat 端点） |
| **bedrock** | `bedrock_converse` | AWS Bedrock Converse API |
| **azure-foundry** | `chat_completions` | Azure AI Foundry（含 EntraID 认证） |
| **copilot** | `chat_completions` | GitHub Copilot 订阅（OAuth）|
| **copilot-acp** | `codex_app_server` | GitHub Copilot via ACP（VS Code 进程）|
| **nous** | `chat_completions` | Nous Portal（订阅制，含 Tool Gateway）|
| **novita** | `chat_completions` | NovitaAI（GPU Cloud）|
| **nvidia** | `chat_completions` | NVIDIA NIM（Nemotron 等）|
| **deepseek** | `chat_completions` | DeepSeek（含 reasoning_content 字段）|
| **kimi-coding** | `chat_completions` | Kimi Coding（Moonshot，special schema）|
| **minimax** | `chat_completions` | MiniMax |
| **huggingface** | `chat_completions` | HuggingFace Inference API |
| **ollama-cloud** | `chat_completions` | Ollama 本地服务 |
| **xai** | `chat_completions` | xAI Grok（含 x_search 工具）|
| **xiaomi** | `chat_completions` | 小米 MiMo |
| **zai** | `chat_completions` | z.ai / GLM |
| **qwen-oauth** | `chat_completions` | 通义千问 OAuth |
| **alibaba** | `chat_completions` | 阿里云百炼 |
| **alibaba-coding-plan** | `chat_completions` | 阿里云 Coding Plan |
| **arcee** | `chat_completions` | Arcee AI |
| **gmi** | `chat_completions` | GMI Cloud |
| **stepfun** | `chat_completions` | 阶跃星辰 |
| **kilocode** | `chat_completions` | KiloCode |
| **opencode-zen** | `chat_completions` | OpenCode Zen |
| **custom** | `chat_completions` | 自定义端点（OpenAI-compat）|

---

## 5. API 适配器层

`agent/` 目录下的各 `*_adapter.py`，处理不同 API 格式的差异。

### 5.1 适配器职责

每个适配器实现 Transport 接口，提供：
- `validate_response(response)` — 校验响应是否有效
- `normalize_response(response)` — 将响应规范化为统一的 `NormalizedResponse` 格式
- `preflight_kwargs(api_kwargs)` — 发送前处理 kwargs

### 5.2 主要适配器

**`anthropic_adapter.py`**（api_mode: `anthropic_messages`）：
- 使用 Anthropic Python SDK（而非 OpenAI SDK）
- 处理 `cache_control` 注入（prefix caching）
- 处理 `thinking` block（extended thinking）
- 处理 `tool_choice` 差异（Anthropic tool schema 与 OpenAI 不同）
- `_is_oauth_token()` 区分 API key vs OAuth token（影响 auth header 格式）

**`gemini_native_adapter.py`** / **`gemini_cloudcode_adapter.py`**（api_mode: `gemini_native` / `gemini_cloudcode`）：
- `gemini_schema.py` 处理 Gemini Function Calling schema 差异
- `google_oauth.py` 处理 Google OAuth token 刷新
- `google_code_assist.py` 处理 Google Cloud Code Assist 特殊端点

**`codex_responses_adapter.py`** + **`codex_runtime.py`**（api_mode: `codex_responses`）：
- OpenAI Responses API（新 API，区别于 Chat Completions）
- 支持 `reasoning items` 加密重放（跨 turn 保持推理状态）
- `codex_ack_continuations`：处理 `finish_reason == "incomplete"`，最多 3 次 continuation

**`bedrock_adapter.py`**（api_mode: `bedrock_converse`）：
- AWS Bedrock Converse API（boto3，不经 OpenAI SDK）
- 处理 AWS 凭证（访问密钥 / IAM role / 实例配置）

**`azure_identity_adapter.py`**：
- Azure Entra ID（Microsoft Identity）认证
- 通过 httpx event hook 在每次请求前刷新 JWT

**其他适配器**：
- `lmstudio_reasoning.py`：LM Studio 推理输出格式处理
- `moonshot_schema.py`：Kimi/Moonshot `reasoning_content` 字段
- `think_scrubber.py`：清理 `<think>` / `<thinking>` / `<reasoning>` XML 标签

### 5.3 NormalizedResponse 格式

所有适配器最终输出统一格式：

```python
@dataclass
class NormalizedResponse:
    content:          str | None      # 主要文本内容
    tool_calls:       list            # 工具调用列表（OpenAI 格式）
    finish_reason:    str             # "stop" / "tool_calls" / "length" / "incomplete"
    reasoning:        str | None      # 推理内容（for trajectory storage）
    reasoning_content: str | None     # reasoning_content for API replay
    reasoning_details: list | None    # reasoning_details (Anthropic/OpenAI)
    usage:            UsageInfo | None
```

---

## 6. API 模式（api_mode）

`api_mode` 决定使用哪个 transport（SDK 和 API 格式）：

| api_mode | Transport | 说明 |
|---|---|---|
| `chat_completions` | OpenAI Python SDK | 默认，OpenAI-compatible API |
| `anthropic_messages` | Anthropic Python SDK | Anthropic Messages API |
| `bedrock_converse` | boto3 | AWS Bedrock Converse API |
| `codex_responses` | OpenAI SDK（Responses endpoint）| OpenAI Responses API |
| `gemini_native` | Google GenAI SDK | Gemini 原生 API |
| `gemini_cloudcode` | Google GenAI SDK | Google Cloud Code Assist |
| `codex_app_server` | ACP stdio | Copilot ACP 子进程 |

`api_mode` 影响的不仅是 SDK，还有：
- 消息格式构建（`_build_api_kwargs()`）
- 响应规范化（`normalize_response()`）
- 流式处理（`_interruptible_streaming_api_call()`）
- 错误分类（`classify_api_error()`）

---

## 7. Auxiliary Client（副 LLM）

`agent/auxiliary_client.py`，为非主对话的辅助任务提供独立的 LLM 调用入口。

### 7.1 辅助任务类型

| 任务 key | 说明 | 典型使用 |
|---|---|---|
| `curator` | Curator 技能审查 | 判断技能是否过时 |
| `vision` | 图像分析 | `vision_analyze` 工具的"native fast path" |
| `embedding` | 文本向量化 | 语义搜索 |
| `title` | 会话标题生成 | `/title` 命令 |
| `session_search` | 会话搜索摘要 | `session_search` 工具的 LLM 摘要层 |

### 7.2 配置（config.yaml 的 auxiliary: 节）

每个任务可以独立配置 provider / model / base_url / max_tokens / reasoning_effort：

```yaml
auxiliary:
  curator:
    provider: anthropic
    model: claude-haiku-4-5-20251001   # 廉价模型
    max_tokens: 2000
  vision:
    provider: ""        # 空 = auto（使用主模型的 vision 能力）
    model: ""
  title:
    provider: anthropic
    model: claude-haiku-4-5-20251001
```

### 7.3 _resolve_auto() 解析顺序

```python
def _resolve_auto(task_key: str) -> (provider, model, base_url):
    # 1. auxiliary.<task_key> 配置项
    # 2. 插件注册的 auxiliary task（ctx.register_auxiliary_task()）
    # 3. ProviderProfile.default_aux_model
    # 4. 主 provider + 主 model（降级，成本最高）
```

### 7.4 运行时主 provider 注入

```python
# conversation_loop.py 每 turn 开始时
set_runtime_main(provider, model)
# 让 vision_analyze 等工具能感知当前实际使用的 provider
# 而不是 config.yaml 中的过时默认值
```

---

## 8. Credential Pool（多 Key 池）

`agent/credential_pool.py`，支持配置多个 API key 并自动轮换，适合高频使用场景。

### 8.1 配置

```yaml
# ~/.hermes/config.yaml
model:
  credential_pool:
    - provider: anthropic
      api_key: "sk-ant-api03-key1..."
    - provider: anthropic
      api_key: "sk-ant-api03-key2..."
    - provider: openrouter
      api_key: "sk-or-v1-key1..."
```

### 8.2 轮换策略

- **Round-robin**：默认，按顺序轮换
- **Rate-limit-aware**：当某个 key 触发 429 时自动跳过，下次 tick 后重试

### 8.3 credential_sources.py

`agent/credential_sources.py`，从多个来源按优先级合并凭证：

```
1. 运行时参数（--api-key）
2. HERMES_API_KEY env var
3. ~/.hermes/.env 中的 <PROVIDER>_API_KEY
4. credential_pool 中的 key
5. ~/.hermes/auth.json（OAuth token）
```

---

## 9. Smart Model Routing

`agent/model_metadata.py`，基于模型能力的动态路由。

### 9.1 模型元数据

每个模型都有：
- `context_length`：上下文窗口大小
- `supports_tools`：是否支持 function calling
- `supports_vision`：是否支持图像输入
- `supports_reasoning`：是否支持推理 token
- `is_streaming_only`：是否只支持 streaming

### 9.2 context length 探测

当 API 返回 context overflow 错误时：

```python
parsed_limit = parse_context_limit_from_error(error_msg)
if parsed_limit:
    save_context_length(model, provider, parsed_limit)  # 持久化到 ~/.hermes/cache/
    compressor.update_model(model, context_length=parsed_limit)
```

`save_context_length()` 将探测到的实际 context length 写入本地缓存，下次启动时直接用缓存值，避免重复探测。

### 9.3 context_length probe tiers

当无法从错误消息中解析精确 context length 时，按预定义的 tier 逐步缩小：

```python
PROBE_TIERS = [200_000, 128_000, 100_000, 65_536, 32_768, 16_384, 8_192]
get_next_probe_tier(current_length)  # 返回下一个更小的 tier
```

---

## 10. 添加自定义 Provider

### 10.1 最简 Provider（OpenAI-compat 端点）

直接在 `hermes model` 中选择 "custom" provider，配置 base_url 和 api_key 即可，无需编写代码：

```bash
hermes model
# 选择 Custom endpoint
# 输入 base_url: https://my-api.example.com/v1
# 输入 API key
```

### 10.2 Plugin Provider（需要自定义行为）

创建 plugin 目录：

```
~/.hermes/plugins/model-providers/my-provider/
├── plugin.yaml
└── __init__.py
```

```yaml
# plugin.yaml
name: my-provider
kind: model-provider
version: 1.0.0
description: "My custom LLM provider"
```

```python
# __init__.py
from providers import register_provider
from providers.base import ProviderProfile


class MyProviderProfile(ProviderProfile):
    def build_extra_body(self, *, session_id=None, **ctx):
        # 特殊的 extra_body 参数
        return {"my_custom_param": "value"}

    def fetch_models(self, *, api_key=None, timeout=8.0):
        # 自定义模型列表获取
        return ["my-model-v1", "my-model-v2"]


register_provider(MyProviderProfile(
    name="my-provider",
    aliases=("myprovider", "mp"),
    api_mode="chat_completions",
    env_vars=("MY_PROVIDER_API_KEY",),
    base_url="https://api.my-provider.com/v1",
    fallback_models=("my-model-v1", "my-model-v2"),
    display_name="My Provider",
    description="My custom LLM provider",
    signup_url="https://my-provider.com/signup",
    default_aux_model="my-model-v1",
))
```

### 10.3 同名覆盖 bundled provider

由于 user plugins 在 bundled 之后扫描，同名 user plugin 自动覆盖 bundled：

```python
# ~/.hermes/plugins/model-providers/anthropic/__init__.py
# 覆盖 bundled anthropic profile，添加自定义行为

from providers import register_provider
from providers.base import ProviderProfile

class CustomAnthropicProfile(ProviderProfile):
    def prepare_messages(self, messages):
        # 自定义消息预处理
        return custom_preprocess(messages)

register_provider(CustomAnthropicProfile(
    name="anthropic",
    # ... 其他配置与 bundled 相同
))
```

---

## 11. Provider 相关配置

### 11.1 model 节

```yaml
model:
  provider: openrouter           # 当前 provider
  model: anthropic/claude-opus-4-5  # 当前模型
  base_url: ""                   # 自定义 API 端点（覆盖 provider 默认）

  # Fallback
  fallback_model: ""             # 单个 fallback（格式: provider:model）
  fallback_chain:                # 多级 fallback
    - provider: openrouter
      model: openai/gpt-4o
    - provider: anthropic
      model: claude-haiku-4-5-20251001

  # 推理配置
  reasoning_effort: ""           # auto / low / medium / high（provider 支持时）
  thinking_budget_tokens: 5000   # Anthropic extended thinking token 预算

  # OpenRouter 特有
  openrouter_min_coding_score: null  # 过滤低编码评分的 provider

  # Ollama 特有
  ollama_num_ctx: 65536          # Ollama 上下文大小

  # Credential pool
  credential_pool: []
```

### 11.2 hermes model 命令

```bash
hermes model                     # 交互式模型选择器（curses UI）
hermes model openrouter:anthropic/claude-opus-4-5  # 直接指定
/model openrouter:anthropic/claude-opus-4-5        # CLI 内切换（延迟生效）
/model anthropic/claude-opus-4-5 --provider openrouter  # 指定 provider
/model --now openrouter:gpt-4o   # 立即生效（破坏 prompt cache）
```

### 11.3 Provider 诊断

```bash
hermes doctor                    # 诊断 provider 连接（探测 /models 端点）
hermes doctor --provider anthropic  # 诊断特定 provider
```

`doctor` 使用 `ProviderProfile.supports_health_check` 决定是否探测（`False` 的 provider 跳过）。
