# 模块八：Cron、Skills 与 Channels

> 核心文件：`src/openhuman/cron/`、`src/openhuman/skills/`、`src/openhuman/channels/`

---

## 目录

1. [Cron 定时任务系统](#1-cron-定时任务系统)
2. [Skills 系统（元数据层）](#2-skills-系统元数据层)
3. [Channels 渠道系统](#3-channels-渠道系统)
4. [触发分类管道（Triage）](#4-触发分类管道triage)

---

## 1. Cron 定时任务系统

### 1.1 Cron 域结构

```
src/openhuman/cron/
├── mod.rs          # 导出
├── types.rs        # CronJob、Schedule、DeliveryConfig 等类型
├── store.rs        # SQLite 持久化
├── schedule.rs     # cron 表达式解析与校验
├── scheduler.rs    # 调度主循环
├── ops.rs          # RPC handlers
├── bus.rs          # CronDeliverySubscriber（EventHandler）
└── seed.rs         # 预置 cron 任务（morning briefing 等）
```

### 1.2 核心类型

```rust
pub struct CronJob {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub schedule: Schedule,
    pub job_type: JobType,
    pub delivery: DeliveryConfig,
    pub active_hours: Option<ActiveHours>,
    pub paused: bool,
    pub last_run: Option<i64>,
    pub next_run: Option<i64>,
}

pub enum Schedule {
    Cron(String),           // cron 表达式（"0 9 * * 1-5"）
    Interval(Duration),     // 固定间隔
    Once(i64),              // 一次性，Unix timestamp
}

pub enum JobType {
    Agent { session_target: SessionTarget },   // 触发 Agent 任务
    Shell { command: String },                  // 执行 shell 命令
}

pub struct DeliveryConfig {
    pub channel: Option<String>,    // 发送到哪个渠道
    pub thread_id: Option<String>,
}
```

### 1.3 Scheduler 主循环

```
scheduler.rs CronScheduler::run()
├─ 每分钟 tick
├─ due_jobs() → 获取到期任务列表
└─ 对每个到期任务：
    ├─ 发布 DomainEvent::CronJobDue（event bus）
    ├─ record_run() → 记录运行日志
    └─ reschedule_after_run() → 计算下次运行时间
```

`CronDeliverySubscriber`（`bus.rs`）订阅 `CronJobDue` 事件，执行实际的 Agent 任务或 Shell 命令。

### 1.4 SchedulerGate（`scheduler_gate/`）

独立的调度门控域，管理：
- 全局调度器的启动/停止
- Active Hours（工作时间限制，避免非工作时间触发）

```rust
pub struct ActiveHours {
    pub start_hour: u8,    // 0–23
    pub end_hour: u8,
    pub days: Vec<Weekday>,
    pub timezone: String,
}
```

### 1.5 Cron RPC 接口

| 方法 | 功能 |
|---|---|
| `openhuman.cron_add_job` | 创建定时任务 |
| `openhuman.cron_list_jobs` | 列出所有任务 |
| `openhuman.cron_get_job` | 获取单个任务详情 |
| `openhuman.cron_update_job` | 更新任务配置 |
| `openhuman.cron_remove_job` | 删除任务 |
| `openhuman.cron_pause_job` | 暂停任务 |
| `openhuman.cron_resume_job` | 恢复任务 |
| `openhuman.cron_list_runs` | 获取运行历史 |
| `openhuman.cron_add_once` | 创建一次性任务 |
| `openhuman.cron_add_once_at` | 在指定时间创建一次性任务 |

### 1.6 工具层（`tools/impl/cron/`）

Agent 可通过工具直接操作 cron：
- `schedule_cron_job`
- `list_cron_jobs`
- `delete_cron_job`

---

## 2. Skills 系统（元数据层）

### 2.1 重要背景：QuickJS 运行时已移除

`src/openhuman/skills/` 现为 **metadata-only** 域。原来基于 `rquickjs` 的技能包执行运行时已删除。模块头注释：

> "Legacy skill metadata helpers retained after QuickJS runtime removal."

### 2.2 Skills 域结构

```
src/openhuman/skills/
├── mod.rs
├── types.rs        # Skill、SkillMetadata 等类型
├── inject.rs       # SKILL.md 匹配与注入逻辑
├── ops.rs          # RPC handlers（列出、安装、解析等）
├── ops_create.rs   # 技能创建
├── ops_discover.rs # 技能发现（registry 查询）
├── ops_install.rs  # 技能安装（到 workspace）
├── ops_parse.rs    # SKILL.md 解析
├── ops_types.rs    # 操作相关类型
├── schemas.rs      # Controller 注册表
└── bus.rs          # Skill EventHandler
```

### 2.3 SKILL.md 格式

技能以 `SKILL.md` 文件形式存储在 workspace 中，包含：
- 技能名称和描述
- 触发关键词
- 技能正文（指令、模板等）

### 2.4 技能注入流程

```
Agent.turn(user_message)
    ↓
skills::inject::match_skills(installed_skills, user_message)
    → 按关键词匹配已安装技能
inject::render_injection(matches, DEFAULT_MAX_INJECTION_BYTES, read_body)
    → 读取匹配技能的 SKILL.md 正文
    → 裁剪到大小上限（DEFAULT_MAX_INJECTION_BYTES）
    → 拼接为前置注入块
enriched_message = skill_injection_block + memory_context + user_message
```

### 2.5 技能 RPC 接口

| 方法 | 功能 |
|---|---|
| `openhuman.skills_list` | 列出已安装技能 |
| `openhuman.skills_discover` | 从 registry 发现可用技能 |
| `openhuman.skills_install` | 安装技能 |
| `openhuman.skills_parse` | 解析 SKILL.md 内容 |
| `openhuman.skills_create` | 创建新技能 |

### 2.6 Skills Registry

技能包来源：`tinyhumansai/openhuman-skills`（GitHub，未 vendor 到本仓库）。技能元数据包含 name、description、tags、version、`when_to_use` 等字段，用于发现和推荐。

---

## 3. Channels 渠道系统

### 3.1 概览

Channels 处理来自外部渠道（Discord、Slack、WhatsApp 等）的入站消息，并将其路由到 Agent 进行处理。

```
外部渠道消息（Socket.io / Webhook）
    ↓ DomainEvent::ChannelInboundMessage
ChannelInboundSubscriber（channels/bus.rs）
    ↓ 解析消息内容
    ↓ 查找对应 session（或创建新 session）
    ↓ agent_turn(provider, history, tools, ...)
    ↓ 回复消息到渠道
```

### 3.2 Channels 域结构

```
src/openhuman/channels/
├── mod.rs
├── bus.rs      # ChannelInboundSubscriber
├── ops.rs      # RPC handlers
├── types.rs    # Channel 相关类型
└── schemas.rs
```

### 3.3 ChannelInboundSubscriber

订阅 `ChannelInboundMessage` 事件，执行 `agent_turn`（使用 `harness/tool_loop.rs` 的 `agent_turn` 入口函数）：

```rust
pub async fn agent_turn(
    provider: &dyn Provider,
    history: &mut Vec<ChatMessage>,
    tools_registry: &[Box<dyn Tool>],
    ...
    silent: true,  // channel 模式下静默（不输出 stdout）
) -> Result<String>
```

### 3.4 渠道消息处理特点

- **silent 模式**：`agent_turn` 的 `silent=true`，不打印中间输出到 stdout
- **无限迭代**：渠道 Agent 与交互式 Agent 共享 `DEFAULT_MAX_TOOL_ITERATIONS=10`
- **会话隔离**：每个渠道/用户组合对应独立的 conversation history

---

## 4. 触发分类管道（Triage）

### 4.1 概览

`agent/triage/` 是高性能的外部触发分类管道，用于快速判断 webhook / cron 触发是否需要完整 Agent 处理：

```
外部触发（webhook / cron）
    ↓
Triage 管道（本地小模型，低延迟）
    ├─ 分类：需要处理 / 忽略 / 路由到特定 Agent
    └─ 决策：是否启动完整 Agent turn
```

### 4.2 trigger_triage / trigger_reactor Agents

两个内建 Agent 专门处理触发场景：

- **`trigger_triage`**：初步分类，判断触发事件是否值得处理（高性能，小模型）
- **`trigger_reactor`**：对值得处理的触发事件执行响应（完整 Agent 能力）

### 4.3 与 Cron 的集成

Cron `JobType::Agent` 触发时，经过 Triage 管道判断是否直接调用 `trigger_reactor` Agent：

```
CronJobDue
    ↓ CronDeliverySubscriber
    ├─ JobType::Shell → run_shell_command
    └─ JobType::Agent → trigger_reactor Agent
         ↓ agent_turn(session_target)
         → 结果发送到 delivery channel
```
