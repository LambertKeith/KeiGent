# 模块四：记忆系统

> 核心文件：`src/openhuman/memory/`

---

## 目录

1. [记忆域结构](#1-记忆域结构)
2. [核心抽象与 trait](#2-核心抽象与-trait)
3. [Memory 存储后端](#3-memory-存储后端)
4. [摄取管道（Ingestion Pipeline）](#4-摄取管道ingestion-pipeline)
5. [记忆召回与检索](#5-记忆召回与检索)
6. [记忆树（Memory Tree）](#6-记忆树memory-tree)
7. [ToolMemory（工具记忆规则）](#7-toolmemory工具记忆规则)
8. [安全过滤（Safety）](#8-安全过滤safety)
9. [会话记忆与 Archivist](#9-会话记忆与-archivist)
10. [记忆 RPC 接口](#10-记忆-rpc-接口)

---

## 1. 记忆域结构

```
src/openhuman/memory/
├── mod.rs              # 统一导出
├── traits.rs           # Memory trait + MemoryEntry + MemoryCategory
├── store/              # UnifiedMemory + 存储后端工厂
├── ops/                # RPC handlers（记忆操作）
├── ingestion/          # 摄取管道（LLM 抽取 + 向量化）
├── chunker.rs          # 文档分块器
├── conversations/      # 会话记忆（per-session 摘要）
├── global.rs           # 全局记忆实例管理
├── tree/               # 记忆树（跨命名空间摘要索引）
├── tool_memory/        # 工具记忆规则（TOOL_MEMORY_HEADING）
├── safety/             # 记忆安全过滤
├── sync_status/        # 同步状态跟踪
└── schemas/            # Controller 注册表
```

---

## 2. 核心抽象与 trait

### 2.1 Memory trait（`traits.rs`）

```rust
pub trait Memory: Send + Sync {
    /// 存储记忆条目
    async fn store(
        &self,
        id: &str,
        key: &str,
        content: &str,
        category: MemoryCategory,
        namespace: Option<&str>,
    ) -> Result<()>;

    /// 语义搜索召回
    async fn recall(&self, query: &str, opts: RecallOpts) -> Result<Vec<MemoryEntry>>;

    /// 列出记忆（按 namespace / category 过滤）
    async fn list(&self, namespace: Option<&str>) -> Result<Vec<MemoryEntry>>;

    /// 删除记忆
    async fn delete(&self, id: &str) -> Result<()>;

    /// 返回命名空间摘要
    async fn namespaces(&self) -> Result<Vec<NamespaceSummary>>;
}
```

### 2.2 MemoryEntry

```rust
pub struct MemoryEntry {
    pub id: String,
    pub key: String,
    pub content: String,
    pub category: MemoryCategory,
    pub namespace: String,
    pub created_at: i64,      // Unix timestamp
    pub updated_at: i64,
    pub score: Option<f64>,   // recall 时填入相似度分数
}
```

### 2.3 MemoryCategory

| 类别 | 用途 |
|---|---|
| `Conversation` | 对话片段，auto_save 时存入 |
| `Fact` | 从对话中提取的事实（archivist 写入）|
| `Document` | 用户主动存入的文档 |
| `Skill` | Skill 相关记忆 |
| `Tool` | ToolMemory 规则捕获 |
| `System` | 系统级记忆（配置、状态等）|

### 2.4 RecallOpts

```rust
pub struct RecallOpts {
    pub limit: usize,
    pub min_relevance: f64,      // 0.0–1.0
    pub namespace: Option<String>,
    pub categories: Vec<MemoryCategory>,
}
```

---

## 3. Memory 存储后端

### 3.1 UnifiedMemory（`store/`）

`UnifiedMemory` 是上层使用的统一接口，内部组合：
- **向量存储**（embeddings）：语义搜索
- **关键字搜索**：精确匹配
- **关系存储**（SQLite）：元数据、时序索引

工厂函数：

```rust
// 完整初始化（含 Local AI embedding model）
create_memory(config: &Config) -> Result<MemoryClientRef>

// 测试用（可注入 mock backend）
create_memory_with_storage(storage, routes) -> Result<MemoryClientRef>

// 查询当前生效的 embedding 配置
effective_embedding_settings(config) -> EmbeddingSettings
```

`MemoryClientRef` = `Arc<dyn Memory>` 的类型别名，在 Agent、工具、记忆工具中共享引用。

### 3.2 命名空间（Namespace）

记忆按命名空间隔离。默认命名空间对应一个渠道（channel）或用户 ID。

`NamespaceDocumentInput`：摄取文档时的输入类型，包含 `namespace`、`title`、`content`、`metadata`。

---

## 4. 摄取管道（Ingestion Pipeline）

### 4.1 概览

摄取将原始文本（对话、文档、网页内容等）转化为可召回的结构化记忆：

```
原始文本
    ↓ chunker（文档分块）
Vec<TextChunk>
    ↓ LLM 抽取（本地小模型，DEFAULT_MEMORY_EXTRACTION_MODEL）
    │  ├─ ExtractedEntity（实体：人名、地点、概念等）
    │  └─ ExtractedRelation（关系三元组）
    ↓ embedding（向量化）
向量数据库写入 + SQLite 元数据写入
```

### 4.2 核心类型

```rust
pub struct IngestionJob {
    pub document_id: String,
    pub title: String,
    pub namespace: String,
    pub content: String,
    pub mode: ExtractionMode,
}

pub enum ExtractionMode {
    Full,      // 完整实体+关系抽取
    Summary,   // 仅摘要
    Verbatim,  // 不抽取，直接向量化
}
```

### 4.3 IngestionQueue

```rust
pub struct IngestionQueue { ... }

impl IngestionQueue {
    /// 提交任务到摄取队列（异步，非阻塞）
    pub async fn enqueue(&self, job: IngestionJob) -> Result<()>;

    /// 获取当前队列快照
    pub async fn status(&self) -> IngestionStatusSnapshot;
}
```

**单例语义**：同一时刻只有一个摄取任务运行（串行队列），防止 LLM 并发过载。

事件：
- `DomainEvent::MemoryIngestionStarted`：任务开始
- `DomainEvent::MemoryIngestionCompleted`：任务完成（含 `success`、`elapsed_ms`）

### 4.4 Chunker（`chunker.rs`）

将长文档切成合适大小的语义块，供 LLM 分批处理和 embedding 向量化。分块策略考虑：
- 句子边界
- 段落边界
- 最大 token 上限（防止单块超出 LLM context）

---

## 5. 记忆召回与检索

### 5.1 collect_recall_citations（`memory_loader.rs`）

在每个 turn 的早期执行，为 Agent 提供相关记忆线索：

```rust
pub async fn collect_recall_citations(
    memory: &dyn Memory,
    query: &str,
    limit: usize,         // 默认 5
    min_relevance: f64,   // 默认 0.4
) -> Result<Vec<RecallCitation>>
```

### 5.2 MemoryLoader（`memory_loader.rs`）

将 citations 渲染为可注入用户消息的文本块：

```rust
pub struct MemoryLoader { ... }

impl MemoryLoader {
    pub async fn load_context(
        &self,
        memory: &dyn Memory,
        user_message: &str,
    ) -> Result<String>
}
```

输出格式类似：
```
[相关记忆]
- {key}: {content}
- {key}: {content}
...

```

该文本块前置于用户消息，让模型在回复前看到相关历史记忆。

### 5.3 检索评分（RetrievalScoreBreakdown）

`NamespaceQueryResult` 包含每条结果的评分明细：
- 向量相似度（embedding cosine similarity）
- 关键词命中分（BM25 / 全文搜索）
- 最终合并分（加权）

---

## 6. 记忆树（Memory Tree）

### 6.1 用途

`tree/` 提供跨命名空间的记忆树索引，用于生成跨源摘要，支持 Agent 在不访问所有记忆的情况下获得全局视野。

### 6.2 TreeContextLoader（`agent/tree_loader.rs`）

```rust
pub struct TreeContextLoader;

impl TreeContextLoader {
    pub async fn load(config: &Config) -> Result<String>
    // 返回格式化的跨源摘要字符串
}

pub const REFRESH_INTERVAL: Duration = Duration::from_secs(30 * 60); // 30 分钟

pub fn should_prefetch(
    last_prefetch: Option<Instant>,
    now: Instant,
    interval: Duration,
) -> bool
```

注入位置：用户消息（非系统提示），KV cache 不受影响。

---

## 7. ToolMemory（工具记忆规则）

`tool_memory/` 提供一套"工具记忆规则"机制，允许工具在执行时自动捕获特定上下文到记忆中。

```rust
pub struct ToolMemoryRule {
    pub source: ToolMemorySource,    // 触发来源（工具名）
    pub priority: ToolMemoryPriority,
    pub capture_hook: Arc<dyn ToolMemoryCaptureHook>,
}
```

`render_tool_memory_rules` 将规则渲染为注入系统提示的说明块（`TOOL_MEMORY_HEADING` 节区），告知模型何时应主动存储记忆。

`TOOL_MEMORY_PROMPT_CAP`：规则说明的最大注入字符数，防止撑爆上下文。

---

## 8. 安全过滤（Safety）

`safety/` 在记忆存入和召回时提供内容安全过滤：
- 屏蔽敏感 PII（联系方式、支付信息等）
- 防止 prompt injection 通过记忆渠道注入

---

## 9. 会话记忆与 Archivist

### 9.1 Conversations（`conversations/`）

管理 per-session 的会话历史记忆，与全局语义记忆分离存储，保留对话的时序结构。

### 9.2 Archivist（`agent/harness/archivist.rs`）

在每个 turn 结束后异步触发（fire-and-forget），由 `spawn_session_memory_extraction()` 启动：

```
turn 结束
    ↓ 后台 tokio spawn
Archivist sub-agent（ARCHIVIST_EXTRACTION_PROMPT）
    ↓ 分析当前 turn 的对话内容
    ↓ 抽取值得长期保留的事实 / 偏好 / 知识
    ↓ memory.store(..., MemoryCategory::Fact, ...)
```

触发条件（来自 `context/`）：
```rust
pub const ARCHIVIST_EXTRACTION_PROMPT: &str = "...";
```

**不阻塞主流程**，用户拿到响应后 archivist 在后台运行。

---

## 10. 记忆 RPC 接口

命名空间：`openhuman.memory_*`

| 方法 | 功能 |
|---|---|
| `openhuman.memory_recall` | 语义搜索召回 |
| `openhuman.memory_store` | 手动存储记忆 |
| `openhuman.memory_list` | 列出记忆 |
| `openhuman.memory_delete` | 删除指定记忆 |
| `openhuman.memory_namespaces` | 列出命名空间及摘要 |
| `openhuman.memory_sync_channel` | 同步特定渠道到记忆 |
| `openhuman.memory_sync_all` | 同步所有渠道 |
| `openhuman.memory_ingestion_status` | 摄取队列状态 |

记忆树相关（`tree/`）：
| 方法 | 功能 |
|---|---|
| `openhuman.memory_tree_*` | 记忆树操作 |
| `openhuman.retrieval_*` | 高级检索接口 |

同步状态（`sync_status/`）：
| 方法 | 功能 |
|---|---|
| `openhuman.memory_sync_status_*` | 查询各渠道同步新鲜度（`FreshnessLabel`）|
