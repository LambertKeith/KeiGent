# 模块五：推理 Provider 体系

> 核心文件：`src/openhuman/inference/`

---

## 目录

1. [Inference 域结构](#1-inference-域结构)
2. [Provider trait](#2-provider-trait)
3. [ChatRequest / ChatResponse](#3-chatrequest--chatresponse)
4. [本地推理（Local AI）](#4-本地推理local-ai)
5. [可靠性层（Reliable Provider）](#5-可靠性层reliable-provider)
6. [模型预设与分级](#6-模型预设与分级)
7. [语音推理（Voice）](#7-语音推理voice)
8. [HTTP 兼容端点](#8-http-兼容端点)
9. [Inference RPC 接口](#9-inference-rpc-接口)

---

## 1. Inference 域结构

```
src/openhuman/inference/
├── mod.rs              # 统一导出
├── provider/           # Provider trait + 云/本地 provider 实现 + 可靠性层
├── local/              # Ollama / LM Studio 本地运行时管理
├── voice/              # STT（Whisper）/ TTS（Piper）推理
├── http/               # OpenAI-compatible /v1/chat/completions 端点
├── device.rs           # DeviceProfile（硬件能力探测）
├── model_ids.rs        # 已知模型 ID 常量
├── presets.rs          # ModelPreset + ModelTier + VisionMode
├── sentiment.rs        # 情感分析（本地轻量模型）
├── ops.rs              # RPC handlers
└── schemas.rs          # Controller 注册表
```

---

## 2. Provider trait

`provider/` 中定义推理后端的统一接口：

```rust
pub trait Provider: Send + Sync {
    /// 非流式聊天（在 reliable.rs 内部实现重试）
    async fn chat(
        &self,
        request: ChatRequest<'_>,
        model: &str,
        temperature: f64,
    ) -> Result<ChatResponse>;

    /// 是否支持 native tool use（function calling）
    fn supports_native_tools(&self) -> bool;

    /// 是否支持视觉（图像输入）
    fn supports_vision(&self) -> bool;

    /// Provider 名称（用于日志 + Sentry 标签）
    fn name(&self) -> &str;
}
```

### 2.1 支持的 Provider 类型

| Provider | 后端 | 特点 |
|---|---|---|
| Anthropic | `claude-*` 系列 | Extended thinking 支持，`reasoning_details` |
| OpenAI | `gpt-*`、`o*` 系列 | Native function calling |
| OpenRouter | 聚合路由 | 访问 100+ 模型 |
| Ollama | 本地 HTTP | 本地开源模型 |
| LM Studio | 本地 HTTP | OpenAI-compatible |
| OpenAI-Compatible | 任意 OpenAI API 格式 | 通用适配器 |

Provider 通过 `Config` 中的 `provider`、`model`、`base_url`、`api_key` 等字段选择和配置。

---

## 3. ChatRequest / ChatResponse

### 3.1 ChatRequest

```rust
pub struct ChatRequest<'a> {
    pub messages: &'a [ChatMessage],
    pub tools: Option<&'a [ToolSpec]>,     // None → 不发送 tool schema
    pub stream: Option<&'a Sender<ProviderDelta>>,  // None → 非流式
}
```

### 3.2 ChatMessage

```rust
pub enum ChatMessage {
    System { content: String },
    User { content: Vec<ContentBlock> },
    Assistant { content: String, tool_calls: Vec<NativeToolCall> },
    Tool { tool_call_id: String, name: String, content: String },
}

// ContentBlock 支持多模态
pub enum ContentBlock {
    Text(String),
    Image { url: String },   // base64 data URL 或远程 URL
}
```

### 3.3 ChatResponse

```rust
pub struct ChatResponse {
    pub text: Option<String>,
    pub tool_calls: Vec<NativeToolCall>,
    pub usage: Option<TokenUsage>,
    pub finish_reason: Option<String>,
}

pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cached_input_tokens: Option<u32>,
    pub context_window: Option<u32>,
}
```

### 3.4 ProviderDelta（流式增量）

```rust
pub enum ProviderDelta {
    TextDelta { delta: String },
    ThinkingDelta { delta: String },      // Anthropic extended thinking
    ToolCallStart { call_id: String, tool_name: String },
    ToolCallArgsDelta { call_id: String, delta: String },
}
```

---

## 4. 本地推理（Local AI）

### 4.1 local/ 模块

`local/` 管理本地推理运行时的生命周期：

```
local/
├── mod.rs
├── ollama/         # Ollama 进程管理 + API 适配
└── lmstudio/       # LM Studio 适配（OpenAI-compatible）
```

主要操作（RPC 命名空间 `local_ai.*`）：
- `local_ai.list_models`：列出已下载的本地模型
- `local_ai.download_model`：触发模型下载
- `local_ai.get_download_progress`：查询下载进度
- `local_ai.start_server`：启动 Ollama 服务器
- `local_ai.stop_server`：停止服务器
- `local_ai.get_status`：获取运行状态

### 4.2 DeviceProfile（`device.rs`）

硬件能力探测，用于推荐合适的本地模型：

```rust
pub struct DeviceProfile {
    pub ram_gb: f64,
    pub vram_gb: Option<f64>,
    pub cpu_cores: usize,
    pub gpu_vendor: Option<String>,    // "apple", "nvidia", "amd"
    pub apple_silicon: bool,
}
```

根据 DeviceProfile 决策：
- 推荐本地模型 tier（7B / 13B / 70B）
- Metal / CUDA 加速可用性

---

## 5. 可靠性层（Reliable Provider）

`provider/reliable.rs` 在 `Provider::chat` 周围包一层重试逻辑：

```
provider.chat(request, model, temperature)
    ↓ reliable.rs 包装
    ├─ 429 Rate Limit → 读 Retry-After header，指数退避
    ├─ 5xx Server Error → 指数退避重试
    ├─ 503 Upstream Unhealthy → 短暂退避
    ├─ 网络超时 → 重试
    └─ 4xx 不可重试 → 直接返回 Err
```

关键函数：

```rust
pub fn is_rate_limited(err: &anyhow::Error) -> bool
pub fn is_upstream_unhealthy(err: &anyhow::Error) -> bool
```

这两个函数也被 `tool_loop.rs` 用于区分"transient 错误（只 warn）"和"需要 Sentry 上报的真实错误"。

---

## 6. 模型预设与分级

### 6.1 ModelPreset（`presets.rs`）

内建模型预设：
- 为每个 tier 和任务类型推荐特定模型
- 包含 context window 大小、是否支持 vision、是否支持 thinking 等能力标志

### 6.2 ModelTier

```rust
pub enum ModelTier {
    Fast,      // 低延迟，低成本（如 Haiku、GPT-4o-mini）
    Balanced,  // 均衡（如 Sonnet、GPT-4o）
    Powerful,  // 最强（如 Opus、o1）
}
```

### 6.3 VisionMode

```rust
pub enum VisionMode {
    None,
    Url,        // 仅支持 URL 图像
    Base64,     // 支持 base64 内联图像
}
```

Agent 构建时通过 `multimodal_config` 使用这些信息来决定是否以及如何传递图像。

---

## 7. 语音推理（Voice）

`voice/` 实现语音输入输出：

### 7.1 STT（Speech-to-Text）

基于 Whisper 本地模型：
- `voice::transcribe(audio_data, config)` → `String`
- 使用 Local AI 中的 Whisper 实例

### 7.2 TTS（Text-to-Speech）

基于 Piper 本地模型：
- `voice::synthesize(text, voice_config)` → `Vec<u8>`（音频数据）
- Tauri shell 中的 `dictation_hotkeys.rs` 负责热键触发录音

---

## 8. HTTP 兼容端点

`inference/http/` 提供 OpenAI-compatible `/v1/chat/completions` 端点：
- 允许外部工具（如 Cursor、Continue 等）直接连接 OpenHuman Core 作为 LLM backend
- 请求格式：标准 OpenAI messages API
- 内部路由到配置的 Provider

端点由 Axum 挂载到 Core 的 HTTP server 上，与 JSON-RPC `/rpc` 端点并列。

---

## 9. Inference RPC 接口

命名空间：`inference.*` 和 `local_ai.*`

| 方法 | 功能 |
|---|---|
| `inference.list_providers` | 列出可用 provider |
| `inference.get_current_model` | 获取当前模型配置 |
| `inference.set_model` | 切换模型 |
| `inference.chat_completion` | 直接发送补全请求（绕过 Agent 循环）|
| `local_ai.list_models` | 列出本地模型 |
| `local_ai.download_model` | 下载模型 |
| `local_ai.get_download_progress` | 查询下载进度 |
| `local_ai.get_status` | 本地 AI 服务状态 |
