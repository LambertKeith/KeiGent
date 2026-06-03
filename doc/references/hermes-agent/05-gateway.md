# 模块五：消息网关

> 核心文件：`gateway/run.py`（18000+ 行）、`gateway/session.py`、`gateway/platforms/base.py`、`gateway/platforms/<platform>.py`
> 版本：v0.14.0+

---

## 目录

1. [整体架构](#1-整体架构)
2. [GatewayRunner：核心 Runner](#2-gatewayrunner核心-runner)
3. [消息处理流程](#3-消息处理流程)
4. [双层消息 Guard](#4-双层消息-guard)
5. [BasePlatformAdapter：平台适配器接口](#5-baseplatformadapter平台适配器接口)
6. [Session 管理](#6-session-管理)
7. [Slash 命令处理](#7-slash-命令处理)
8. [平台列表与特性](#8-平台列表与特性)
9. [TUI 与 Dashboard](#9-tui-与-dashboard)
10. [跨平台消息投递](#10-跨平台消息投递)
11. [安全机制](#11-安全机制)
12. [添加新平台](#12-添加新平台)
13. [配置参考](#13-配置参考)

---

## 1. 整体架构

```
hermes gateway start
  └─ GatewayRunner（gateway/run.py:1646）
       ├─ 加载配置（直接读 YAML，不走 DEFAULT_CONFIG）
       ├─ 初始化 SessionStore（gateway/session.py）
       ├─ 发现并连接所有已配置的平台适配器
       ├─ 启动 Kanban dispatcher（可选）
       └─ 事件循环：
            ├─ 平台适配器 → MessageEvent → _process_message_background()
            ├─ Slash 命令分发
            ├─ Agent 运行（每 session 独立任务）
            └─ 跨平台消息投递
```

**关键设计原则**：
- 每条用户消息触发一次 `AIAgent.run_conversation()`
- 每个 session（`platform:chat_id[:thread_id]`）有独立的对话历史
- 网关是**长期运行进程**，平台适配器在整个进程生命周期保持连接
- 配置变更通过 `_reload_runtime_env_preserving_config_authority()` 热重载

---

## 2. GatewayRunner：核心 Runner

`gateway/run.py:1646`，整个网关的核心编排器。

### 2.1 初始化

```python
class GatewayRunner:
    def __init__(self, config: Optional[GatewayConfig] = None):
        # 加载 config（直接读 YAML raw，不经 DEFAULT_CONFIG merge）
        # 初始化 SessionStore
        # 注册所有已配置平台的适配器
        # 设置 message_handler 回调
```

### 2.2 配置加载（三条路径之一）

```python
# 网关使用独立的配置加载路径：直接读 YAML，不走 CLI 的 DEFAULT_CONFIG
config = _load_gateway_config()         # 全量加载
config = _load_gateway_runtime_config() # 运行时部分重载
```

若某个配置项 CLI 能看到但网关看不到（或反之），原因通常是使用了错误的加载器。

### 2.3 关键内部状态

| 属性 | 说明 |
|---|---|
| `_adapters` | `{platform_name: BasePlatformAdapter}` 所有连接的平台 |
| `_session_store` | `SessionStore` 实例，管理所有活跃 session |
| `_active_sessions` | `{session_key: asyncio.Task}` 正在运行的 Agent 任务 |
| `_pending_messages` | `{session_key: [MessageEvent]}` 等待处理的消息队列 |
| `_kanban_dispatcher` | 可选的 Kanban 任务分发器 |

### 2.4 核心方法

| 方法 | 说明 |
|---|---|
| `start()` | 启动所有平台适配器，进入事件循环 |
| `stop()` | 优雅关闭（等待正在运行的 Agent 完成）|
| `_process_message_background(event)` | 异步处理一条消息（主入口）|
| `_run_agent(event, session)` | 创建 AIAgent，调用 run_conversation() |
| `_run_agent_via_proxy(event, session)` | 通过 proxy 进程运行 Agent（隔离模式）|
| `_resolve_runtime_agent_kwargs()` | 解析运行时 Agent 初始化参数 |
| `_build_gateway_agent_history(session)` | 从 session transcript 重建对话历史 |

---

## 3. 消息处理流程

```
用户在 Telegram / Discord 等平台发送消息
  │
  ▼
平台 SDK（telegram-bot-api / discord.py 等）
  │
  ▼
BasePlatformAdapter.message_handler(event: MessageEvent)
  │
  ▼
GatewayRunner._process_message_background(event)
  │
  ├─ [Hook] pre_gateway_dispatch → 可 skip / rewrite 消息
  │
  ├─ 鉴权检查（allowed_users / pairing）
  │
  ├─ 内部事件检测（/status、/platforms 等元命令）
  │
  ├─ Slash 命令分发？
  │   ├─ 是 → _handle_command(event)（不启动 Agent）
  │   └─ 否 → 进入 Agent 路径
  │
  ├─ 检查 _active_sessions：当前 session 有正在运行的 Agent？
  │   ├─ 有 →
  │   │   ├─ 是控制命令（/stop, /new, /approve, /deny）→ 直接处理（不入队）
  │   │   └─ 其他消息 → 放入 _pending_messages 队列（Guard 1）
  │   └─ 没有 → 直接运行
  │
  ├─ SessionStore.get_or_create_session(source) → SessionEntry
  │   ├─ 新 session → 创建空白 transcript
  │   └─ 已有 session → 加载历史 transcript
  │
  ├─ 媒体处理（语音转文字、图片描述）
  │
  ├─ _build_gateway_agent_history(session) → conversation_history
  │
  ├─ _resolve_runtime_agent_kwargs() → agent_kwargs
  │
  ├─ AIAgent(**agent_kwargs)
  │
  ├─ agent.run_conversation(message, conversation_history=history)
  │
  ├─ 响应格式化 + 媒体投递
  │   ├─ Markdown 渲染适配（Telegram HTML / Discord MD / 等）
  │   ├─ 长消息分割
  │   ├─ 图片 / 音频 / 视频文件附件发送
  │   └─ TTS 语音生成并发送
  │
  ├─ session transcript 更新（append_to_transcript）
  │
  └─ 处理 _pending_messages 中的等待消息（若有）
```

### 3.1 MessageEvent 结构

```python
@dataclass
class MessageEvent:
    text: str                     # 消息文本
    platform: Platform            # 平台枚举
    chat_id: str                  # 聊天/频道 ID
    user_id: str                  # 发送者 ID（PII hash）
    user_name: str                # 发送者显示名
    chat_type: str                # "private" / "group" / "channel" / "dm"
    thread_id: Optional[str]      # 线程 ID（用于 Discord thread / Telegram forum）
    message_id: Optional[str]     # 原始消息 ID（用于 reply anchor）
    attachments: list             # 媒体附件
    source: SessionSource         # 会话来源信息
    timestamp: float
```

---

## 4. 双层消息 Guard

这是网关最重要的安全机制，防止用户新消息打乱正在运行的 Agent。

### 4.1 Guard 层次

```
用户消息
  ↓
[Guard 1] BasePlatformAdapter（gateway/platforms/base.py）
  条件：session_key in _active_sessions
  行为：放入 _pending_messages[session_key] 队列

  ↓（仅控制命令绕过）

[Guard 2] GatewayRunner（gateway/run.py）
  条件：Agent 正在运行
  行为：拦截 /stop / /new / /queue / /status / /approve / /deny
        → 直接处理（不走 _process_message_background）
  其他：调用 running_agent.interrupt()
```

### 4.2 必须绕过双层的场景

某些命令在 Agent 运行时必须立即到达 runner（如审批响应）：

```
approval.request 触发 → 等待 /approve 或 /deny
  ↓
用户发送 /approve
  ↓
必须绕过 Guard 1（否则进队列，Agent 已在等待审批，永远不会处理队列）
  ↓
必须绕过 Guard 2（否则触发 interrupt，Agent 被杀死而非继续执行）
  ↓
通过 _inline_dispatch()（不走 _process_message_background）直接投递
```

这就是 AGENTS.md 中"gateway 有 TWO message guards"警告的来源。新增需要 Agent 运行时到达的命令，必须显式地绕过两层 guard。

### 4.3 /steer：不中断的引导

`/steer <text>` 是特殊命令，允许用户在 Agent 思考时追加引导而不中断当前执行：

```python
agent._pending_steer = text   # 存入 agent 属性
# conversation_loop.py 在每次 API 调用前检查并注入到最近的 tool 消息中
```

---

## 5. BasePlatformAdapter：平台适配器接口

`gateway/platforms/base.py:1504`，所有平台适配器的抽象基类。

### 5.1 必须实现的方法

```python
class BasePlatformAdapter(ABC):

    @abstractmethod
    async def connect(self) -> bool:
        """连接到平台，启动监听器。返回 True 表示成功。
        多 profile 时应调用 _acquire_platform_lock()。"""

    @abstractmethod
    async def disconnect(self) -> None:
        """断开连接，清理资源。"""

    @abstractmethod
    async def send(
        self,
        text: str,
        chat_id: str,
        metadata: Optional[dict] = None,
        **kwargs,
    ) -> dict:
        """发送消息到指定 chat。
        返回 {"message_id": "...", ...}。"""
```

### 5.2 内置能力（基类提供）

| 方法 | 说明 |
|---|---|
| `send_typing(chat_id)` | 发送"正在输入"状态 |
| `send_multiple_images(chat_id, images)` | 批量发送图片 |
| `send_image(chat_id, path/url)` | 发送单张图片 |
| `send_voice(chat_id, audio_path)` | 发送语音消息 |
| `send_video(chat_id, video_path)` | 发送视频 |
| `send_document(chat_id, file_path)` | 发送文件 |
| `send_clarify(chat_id, question, options)` | 发送多选项澄清问题 |
| `send_slash_confirm(chat_id, command)` | 发送命令审批请求 |
| `play_tts(chat_id, text)` | TTS 转语音并发送 |
| `create_handoff_thread(chat_id, title)` | 创建独立线程（Discord / Slack）|
| `edit_message(chat_id, msg_id, text)` | 编辑已发送消息 |
| `delete_message(chat_id, msg_id)` | 删除消息 |

### 5.3 profile 多实例 token 锁

防止两个 profile 使用同一个 bot token：

```python
def connect(self):
    if not self._acquire_platform_lock(scope="telegram", identity=self.token, ...):
        raise RuntimeError("Token already in use by another profile")
    ...

def disconnect(self):
    self._release_platform_lock()
```

`gateway/status.py::acquire_scoped_lock()` 实现，基于文件锁（`~/.hermes/gateway/.locks/`）。

### 5.4 streaming 消息更新（draft streaming）

部分平台（Telegram / Discord / Slack）支持在 Agent 流式生成时实时更新已发送消息：

```python
@property
def supports_draft_streaming(self) -> bool:
    return True  # 覆盖以声明支持

async def send_draft(self, text: str, chat_id: str, *, draft_id: Optional[str] = None) -> dict:
    # 第一次调用（draft_id=None）→ 发送占位消息，返回 message_id
    # 后续调用（draft_id=message_id）→ 编辑已发送消息
```

### 5.5 线程路由（thread metadata）

```python
# thread_id 的路由规则：
# - Telegram forum/supergroup topic → metadata["thread_id"]
# - Telegram DM private topic → reply_to_message_id
# - Discord thread → metadata["thread_id"]
# - Feishu → reply_to_message_id
```

---

## 6. Session 管理

### 6.1 Session Key 格式

```python
build_session_key(source: SessionSource) -> str
# 格式：<platform>:<hashed_chat_id>[:<hashed_thread_id>]
# 例如：telegram:a1b2c3d4
#       discord:e5f6g7h8:i9j0k1l2
```

Chat ID 和 Thread ID 都经过 SHA256 hash，避免存储 PII：

```python
_hash_chat_id = lambda v: hashlib.sha256(v.encode()).hexdigest()[:16]
```

### 6.2 SessionStore（gateway/session.py:668）

| 方法 | 说明 |
|---|---|
| `get_or_create_session(source)` | 获取或创建 session，处理过期和强制重置 |
| `update_session(key, **kwargs)` | 更新 session 状态 |
| `suspend_session(key)` | 暂停 session（保留历史，清理内存） |
| `reset_session(key)` | 重置为新 session（`/new` 触发）|
| `switch_session(key, target_id)` | 切换到历史 session（`/resume` 触发）|
| `append_to_transcript(session_id, message)` | 追加消息到 transcript |
| `rewrite_transcript(session_id, messages)` | 替换全部 transcript（上下文压缩后）|
| `load_transcript(session_id)` | 加载 transcript 为消息列表 |
| `list_sessions(active_minutes)` | 列出活跃 session |

### 6.3 SessionEntry 数据结构

```python
@dataclass
class SessionEntry:
    session_key:      str             # platform:chat_id[:thread_id]
    session_id:       str             # UUID，对应 SQLite SessionDB 记录
    source:           SessionSource   # 来源元数据
    created_at:       float
    last_activity:    float
    message_count:    int
    is_active:        bool
    resume_pending:   bool            # /resume 命令触发，等待下条消息时生效
    compression_tip:  Optional[str]   # 上下文压缩后的摘要指针
```

### 6.4 Session 过期策略

```python
def _is_session_expired(self, entry: SessionEntry) -> bool:
    # 读取 gateway.session_timeout（默认 1h）
    # 超时 → is_active=False，但 transcript 保留
    # 用户重新发消息 → reopen（继续历史）

def _should_reset(self, entry, source) -> Optional[str]:
    # 检查强制重置条件：
    # - 平台切换（同 chat_id 但 platform 不同）
    # - 用户 ID 变化（防止会话劫持）
    # - 手动 /new 命令
```

---

## 7. Slash 命令处理

### 7.1 命令注册中心

所有命令从 `hermes_cli/commands.py::COMMAND_REGISTRY` 派生，网关自动获得所有命令的一致视图。

详见[核心模块总览中的 CLI 架构章节](./core-modules.md#11-模块九cli--槽命令--多-profile)。

### 7.2 网关特有命令

| 命令 | 说明 |
|---|---|
| `/status` | 显示 Agent 状态、平台连接情况 |
| `/sethome` | 设置当前 chat 为默认投递目标（`/home`）|
| `/stop` | 中断当前正在运行的 Agent |
| `/approve` / `/deny` | 响应命令审批请求 |
| `/queue` | 查看等待队列 |
| `/platforms` | 列出已连接平台 |

### 7.3 命令访问控制

`gateway/slash_access.py`，基于 `gateway.command_access` 配置控制哪些用户可以使用哪些命令：

```yaml
gateway:
  command_access:
    admin_users: ["user_id_1", "user_id_2"]
    restricted_commands:
      - command: "tools"
        require_admin: true
```

---

## 8. 平台列表与特性

### 8.1 内置平台（plugins/platforms/）

| 平台 | 文件/目录 | 特殊特性 |
|---|---|---|
| **Telegram** | `telegram.py` | 语音转文字、文件共享、forum topic 支持、Bot Command 菜单、DM topic lane |
| **Discord** | `platforms/discord/` | Thread 支持、Slash Commands、语音频道、role-based 鉴权 |
| **Slack** | `slack.py` | Socket Mode、`/hermes` 子命令、Thread 回复 |
| **WhatsApp** | `whatsapp.py` | 媒体消息、24h 会话窗口 |
| **Signal** | `signal.py` | E2E 加密、联系人验证 |
| **Matrix** | `matrix.py` | 联邦化协议 |
| **Mattermost** | `mattermost.py` | 私有部署 |
| **Email** | `email.py` | IMAP 收件 + SMTP 发件 |
| **SMS** | `sms.py` | Twilio 集成 |
| **Home Assistant** | `homeassistant.py` | 智能家居通知 |
| **飞书 (Feishu)** | `feishu.py` | 飞书消息 + 文档评论 |
| **企业微信 (WeCom)** | `wecom.py` | 企业内部通讯 |
| **微信 (Weixin)** | `weixin.py` | 微信消息 |
| **钉钉 (DingTalk)** | `dingtalk.py` | 企业通讯 |
| **QQ Bot** | `qqbot/` | QQ 机器人 |
| **元宝 (YuanBao)** | `yuanbao.py` | 腾讯元宝平台 |
| **BlueBubbles** | `bluebubbles.py` | iMessage（macOS）|
| **Microsoft Teams** | `msgraph_webhook.py` | Teams + Graph API |
| **WebHook** | `webhook.py` | 通用 WebHook 接收 |
| **API Server** | `api_server.py` | OpenAI-compatible HTTP API |

### 8.2 插件平台（plugins/platforms/）

| 平台 | 说明 |
|---|---|
| **IRC** | 经典 IRC 协议（stdlib asyncio）|
| **Google Chat** | Pub/Sub + REST API |
| **ntfy** | ntfy.sh push 通知 |
| **SimpleX Chat** | 去中心化隐私通讯 |
| **LINE** | LINE Messaging API（含 60s reply token 处理）|
| **Google Meet** | 视频会议转录 + TTS 发言 |

### 8.3 平台选择建议

| 场景 | 推荐平台 |
|---|---|
| 个人日常使用 | Telegram（功能最完整）|
| 团队协作 | Slack / Discord |
| 企业内部 | 企业微信 / 飞书 / 钉钉 |
| 自动化/无 UI | API Server / WebHook |
| 隐私优先 | Signal / SimpleX / Matrix |

---

## 9. TUI 与 Dashboard

### 9.1 TUI（hermes --tui）

```
hermes --tui
  └─ Node (Ink/React) ──stdio JSON-RPC──→ Python (tui_gateway/)
         │                                      └─ AIAgent + tools + sessions
         └─ 渲染对话 / 输入框 / 进度指示 / 审批提示
```

TypeScript 负责屏幕渲染，Python 负责 session / 工具 / 模型调用 / slash 命令逻辑。

**JSON-RPC 方法（Python → Node 事件）**：

| 事件 | 说明 |
|---|---|
| `message.delta` | 流式文本增量 |
| `message.complete` | 完整响应 |
| `tool.start/progress/complete` | 工具执行状态 |
| `approval.request` | 命令审批请求 |
| `clarify.request` | 澄清询问 |
| `session.list` | 历史 session 列表 |

**JSON-RPC 方法（Node → Python 请求）**：

| 方法 | 说明 |
|---|---|
| `prompt.submit` | 用户提交消息 |
| `approval.respond` | 响应审批（allow/deny）|
| `clarify.respond` | 响应澄清问题 |
| `session.resume` | 恢复历史 session |
| `slash.exec` | 执行 slash 命令 |

### 9.2 Dashboard（hermes dashboard）

Dashboard 嵌入真实的 `hermes --tui` 进程，通过 PTY + WebSocket 桥接到浏览器的 xterm.js：

```
浏览器 (xterm.js)
  ↕ WebSocket /api/pty
hermes_cli/web_server.py（aiohttp）
  ↕ PTY（ptyprocess）
hermes --tui 进程
```

**规则**：不要在 React 中重写聊天界面。所有新功能应扩展 Ink（自动出现在 dashboard），Dashboard 的 React 只做侧边栏小部件（Session 列表、模型选择、工具状态等辅助视图）。

---

## 10. 跨平台消息投递

### 10.1 send_message 工具

Agent 在对话中可以向任意平台发送消息：

```python
send_message(
    message: str,
    platform: str = "home",      # "telegram" / "discord" / "home"（默认投递目标）
    chat_id: str = None,         # 目标 chat（None = home channel）
    thread_id: str = None,
)
```

### 10.2 gateway/delivery.py

跨平台消息投递的抽象层，处理：
- 多平台并行发送
- 失败重试
- 消息格式适配（Markdown → 平台 HTML 等）

### 10.3 gateway/mirror.py

跨平台消息镜像：将一个平台收到的消息同步到另一个平台的指定 channel，实现多平台间的消息广播。

### 10.4 Cron 任务投递

Cron job 完成后通过 `deliver` 字段指定投递目标：

```yaml
# ~/.hermes/cron/jobs.yaml
- id: daily-report
  schedule: "0 9 * * *"
  prompt: "生成今日工作报告"
  deliver: telegram   # 投递到 Telegram home channel
```

**注意**：Cron 投递进独立的 cron session，**不进入**主对话历史，避免破坏 message-role 交替。

---

## 11. 安全机制

### 11.1 用户鉴权

```yaml
# ~/.hermes/config.yaml
gateway:
  telegram:
    allowed_users: ["telegram_user_id_1", "telegram_user_id_2"]
  discord:
    allowed_roles: ["admin", "hermes-user"]
  allow_all_users: false    # 开发时才设为 true
```

### 11.2 DM Pairing（gateway/pairing.py）

防止陌生人通过 DM 使用 bot。需要先通过 `hermes gateway pair` 在 CLI 配对身份：

```bash
hermes gateway pair telegram   # 生成一次性配对码
# 在 Telegram 中发送该配对码 → 身份绑定
```

### 11.3 命令审批（tools/approval.py）

危险命令执行前请求用户审批：

```
Agent 准备执行 rm -rf /path
  ↓
approval.py 检查是否需要审批
  ↓
通过网关发送审批消息：
  "⚠️ Agent 请求执行: rm -rf /path
   [✅ 允许此次] [✅ 本次会话允许] [✅ 永久允许] [❌ 拒绝]"
  ↓
用户点击 → /approve once / session / always / deny
  ↓
直接绕过两层 Guard，inline 送达 runner
```

### 11.4 消息安全过滤

```python
_redact_gateway_user_facing_secrets(text)   # 过滤 API key、token 等
_sanitize_gateway_final_response(text)       # 净化最终回复（防泄露）
_looks_like_gateway_provider_error(text)     # 检测 provider 错误信息
_telegramize_command_mentions(text, platform) # Telegram @命令格式转换
```

---

## 12. 添加新平台

### 12.1 推荐方式：插件路径

```
~/.hermes/plugins/my-platform/   (或 plugins/platforms/my-platform/)
├── plugin.yaml                  (kind: platform)
└── __init__.py                  (register(ctx))
```

```python
# __init__.py
from gateway.platforms.base import BasePlatformAdapter

class MyPlatformAdapter(BasePlatformAdapter):
    async def connect(self) -> bool:
        # 连接逻辑
        self._mark_connected()
        return True

    async def disconnect(self) -> None:
        self._mark_disconnected()

    async def send(self, text: str, chat_id: str, **kwargs) -> dict:
        # 发送逻辑
        return {"message_id": "..."}

def register(ctx):
    ctx.register_platform(
        name="my-platform",
        adapter_class=MyPlatformAdapter,
    )
```

**零改动核心代码**，系统自动处理：adapter 创建、config 解析、用户鉴权、cron 投递、send_message 路由、hermes gateway status 显示。

### 12.2 插件 hooks（optional）

```python
ctx.register_platform(
    name="my-platform",
    adapter_class=MyPlatformAdapter,

    # 从 env var 读取初始配置（在 adapter 构造前运行）
    env_enablement_fn=lambda: {
        "token": os.getenv("MY_PLATFORM_TOKEN", ""),
        "home_channel": {"chat_id": os.getenv("MY_PLATFORM_HOME", "")},
    },

    # 从 config.yaml 读取配置，转为 env var
    apply_yaml_config_fn=lambda yaml_cfg, platform_cfg: {
        # 返回 dict merge 到 PlatformConfig.extra
    },

    # cron deliver=<name> 支持
    cron_deliver_env_var="MY_PLATFORM_HOME_CHANNEL",

    # standalone 投递（cron 与 gateway 分离时）
    standalone_sender_fn=my_standalone_send,
)
```

### 12.3 完整示例参考

- `plugins/platforms/irc/` — 最简单的完整示例
- `plugins/platforms/google_chat/` — Pub/Sub + OAuth 复杂示例
- `plugins/platforms/line/` — 时间窗口约束处理的完整示例

---

## 13. 配置参考

### 13.1 gateway 节

```yaml
gateway:
  # Session 超时（秒，默认 3600）
  session_timeout: 3600

  # 命令访问控制
  command_access: {}

  # Kanban dispatcher
  kanban:
    dispatch_in_gateway: true      # 默认 true：dispatcher 在 gateway 进程内运行

  # 后台进程通知
  display:
    background_process_notifications: all  # all / result / error / off

  # 各平台配置（在各平台子节中）
  telegram:
    allowed_users: []
  discord:
    allowed_roles: []
```

### 13.2 启动命令

```bash
hermes gateway start          # 前台启动
hermes gateway start --daemon # 守护进程
hermes gateway stop           # 停止
hermes gateway status         # 查看状态（已连接平台、活跃 session 等）
hermes gateway setup          # 配置向导
hermes gateway pair <platform> # 身份配对
hermes gateway logs           # 查看网关日志（~/.hermes/logs/gateway.log）
```

### 13.3 环境变量

| 变量 | 说明 |
|---|---|
| `HERMES_PLATFORM` | 当前会话平台（覆盖自动检测）|
| `HERMES_SESSION_PLATFORM` | 网关会话平台（由 gateway 设置）|
| `TERMINAL_CWD` | 终端命令的工作目录（对应 `terminal.cwd` 配置项）|
| `HERMES_BACKGROUND_NOTIFICATIONS` | 后台进程通知级别（all/result/error/off）|
