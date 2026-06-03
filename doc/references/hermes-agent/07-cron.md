# 模块七：Cron 定时调度

> 核心文件：`cron/jobs.py`、`cron/scheduler.py`、`tools/cronjob_tools.py`
> 版本：v0.14.0+

---

## 目录

1. [概览](#1-概览)
2. [Job 数据结构](#2-job-数据结构)
3. [调度格式](#3-调度格式)
4. [Scheduler：调度引擎](#4-scheduler调度引擎)
5. [Prompt 构建](#5-prompt-构建)
6. [投递机制](#6-投递机制)
7. [安全与硬限制](#7-安全与硬限制)
8. [工具端接口（cronjob 工具）](#8-工具端接口cronjob-工具)
9. [CLI 与 Slash 命令](#9-cli-与-slash-命令)
10. [高级特性](#10-高级特性)
11. [文件系统布局](#11-文件系统布局)
12. [配置参考](#12-配置参考)

---

## 1. 概览

Cron 是 Hermes 的**定时自动化**系统，允许：
- 以自然语言描述调度任务（Agent 自动翻译）
- 定期生成报告、执行备份、监控状态
- 链式 job（上一个 job 的输出作为下一个的输入）
- 多平台投递（Telegram / Discord / Slack 等）
- 与技能系统集成

**系统边界**：
- Cron sessions 完全独立于主对话，不污染对话历史
- 默认 `skip_memory=True`，不触发记忆 provider
- 3 分钟硬中断，防止 runaway Agent

---

## 2. Job 数据结构

### 2.1 完整 job 字段

```json
{
    "id":               "a1b2c3d4e5f6",   // 12位小写十六进制，不可变
    "name":             "每日工作报告",
    "prompt":           "生成今日工作总结，包括完成的任务和明日计划",
    "schedule":         {"kind": "cron", "expr": "0 9 * * *", "display": "0 9 * * *"},
    "schedule_display": "0 9 * * *",       // 用户友好的展示格式
    "enabled":          true,
    "state":            "scheduled",        // scheduled / paused / running / error
    "last_run":         "2026-05-29T09:00:00Z",
    "next_run":         "2026-05-30T09:00:00Z",
    "last_result":      "success",          // success / error / interrupted / blocked
    "last_error":       null,

    // 技能
    "skill":            null,               // legacy 单技能字段
    "skills":           ["research"],       // 可选：加载特定技能

    // 可选：模型覆盖
    "model":            null,
    "provider":         null,

    // 可选：预运行脚本
    "script":           "scripts/collect_data.sh",  // 脚本路径（相对于 workdir）
    "no_agent":         false,              // true = 纯脚本，不启动 Agent

    // 可选：上下文链接
    "context_from":     ["a1b2c3d4e5f7"],   // 引用其他 job 的最新输出

    // 可选：工作目录
    "workdir":          "/path/to/project", // 加载该目录的 AGENTS.md / CLAUDE.md

    // 工具集
    "enabled_toolsets": null,              // null = 使用默认 cron 工具集

    // 投递目标
    "deliver":          "telegram",         // 平台名 / "home" / "all"

    // Pushover 特定投递
    "deliver_priority": 0,
    "deliver_sound":    null
}
```

### 2.2 不变字段

`id` 字段创建后**不可更改**（用作文件系统路径组件 `output/{id}/`）。任何非法字符（`..`、`/`、`\`、绝对路径）都会被 `_job_output_dir()` 拒绝，防止路径穿越攻击。

---

## 3. 调度格式

`cron/jobs.py::parse_schedule()` 支持 5 种格式，自动识别：

### 3.1 时长（一次性，从现在起 N 时间后）

```
"30m"    → 30 分钟后运行一次
"2h"     → 2 小时后运行一次
"1d"     → 1 天后运行一次

支持单位：m/min/mins/minute/minutes/h/hr/hrs/hour/hours/d/day/days
```

### 3.2 every 短语（循环）

```
"every 30m"           → 每 30 分钟
"every 2h"            → 每 2 小时
"every 1d"            → 每天
"every monday 9am"    → 每周一早上 9 点（由 croniter 解析）
```

### 3.3 5 字段 cron 表达式（循环）

```
"0 9 * * *"           → 每天 9:00
"0 9 * * 1"           → 每周一 9:00
"*/30 * * * *"        → 每 30 分钟
"0 9,18 * * 1-5"      → 工作日早 9 晚 6
```

依赖 `croniter` 包解析，若未安装则提示安装。

### 3.4 ISO 时间戳（一次性，特定时间）

```
"2026-06-01T09:00:00Z"         → UTC 时间运行一次
"2026-06-01T09:00:00+08:00"    → 特定时区
"2026-06-01T09:00"             → 本地时间（自动添加本地时区）
```

### 3.5 解析结果结构

```python
# 循环
{"kind": "interval", "minutes": 60, "display": "every 60m"}
{"kind": "cron", "expr": "0 9 * * *", "display": "0 9 * * *"}

# 一次性
{"kind": "once", "run_at": "2026-06-01T09:00:00+08:00", "display": "once at 2026-06-01 09:00"}
```

---

## 4. Scheduler：调度引擎

`cron/scheduler.py::tick()`，每 60 秒由网关后台线程调用。

### 4.1 tick() 执行流程

```
tick()
  ├─ 获取文件锁（~/.hermes/cron/.tick.lock）
  │   └─ 锁失败 → 另一个进程在 tick，直接返回
  │
  ├─ 加载 jobs.json
  │
  ├─ 对每个 enabled 且 due 的 job：
  │   ├─ catchup 窗口检查（超过 catchup 窗口的过期 job 跳过）
  │   ├─ mark_job_run()（更新 last_run，推进 next_run）
  │   └─ 提交到线程池异步执行 _run_job_impl(job)
  │
  └─ 等待所有 job 完成（并行执行）
```

### 4.2 Due 判断

```python
def is_job_due(job: dict) -> bool:
    now = _hermes_now()
    next_run = parse_next_run(job)

    # job 已到期
    if next_run > now:
        return False

    # one-shot grace 窗口：一次性 job 错过触发时间后 120s 内仍触发
    if job["schedule"]["kind"] == "once":
        grace = timedelta(seconds=ONESHOT_GRACE_SECONDS)  # 120s
        return now - next_run <= grace

    # 循环 job：catchup 窗口 = min(period/2, 2h)，clamped 到 [120s, 7200s]
    period_seconds = get_period_seconds(job)
    catchup = min(period_seconds / 2, 7200)
    catchup = max(catchup, 120)
    return now - next_run <= timedelta(seconds=catchup)
```

### 4.3 文件锁（跨进程互斥）

```python
# ~/.hermes/cron/.tick.lock
# Unix: fcntl.flock(fd, LOCK_EX | LOCK_NB)
# Windows: msvcrt.locking()
# 锁失败（EWOULDBLOCK）→ 另一进程在 tick，直接返回（不阻塞）
```

每次 `tick()` 进入时获取，退出时释放。防止 gateway + CLI 同时运行时重复触发。

---

## 5. Prompt 构建

`cron/scheduler.py::_build_job_prompt()` 按以下顺序构建完整 prompt：

### 5.1 构建顺序

```
1. 加载技能内容（job.skills，注入为用户消息前缀）
2. 运行预运行脚本（job.script）
   ├─ 成功 → stdout 注入为 "## Script Output" 块
   ├─ 空 stdout → 跳过 AI 调用（返回 None）
   └─ 失败 → stderr 注入为 "## Script Error" 块
3. 引用上下文（job.context_from）
   └─ 读取引用 job 的最新输出文件，注入为 "## Output from job" 块（截断到 8K 字符）
4. 注入 cron 执行指令（硬编码 hint）
5. 拼接 job.prompt
```

### 5.2 Cron 执行指令

注入到每个 cron job prompt 开头，指导 Agent 行为：

```
[IMPORTANT: 你正在作为定时 cron job 运行。
DELIVERY: 你的最终回复会自动投递给用户 — 不要使用 send_message 或自己尝试投递。
只需产生你的报告/输出作为最终回复，系统会处理其余的事情。
SILENT: 如果真的没有新内容可报告，只回复 "[SILENT]"（不包含其他内容）来抑制投递。
永远不要将 [SILENT] 与内容混合 — 要么正常报告你的发现，要么说 [SILENT] 不说其他。]
```

**`[SILENT]` 机制**：若 Agent 返回 `[SILENT]`，调度器不向用户投递任何内容，避免无意义通知。

### 5.3 注入安全扫描

`_scan_assembled_cron_prompt()` 在最终 prompt 组装后运行注入检测：

```python
def _scan_assembled_cron_prompt(assembled: str, job: dict, *, has_skills: bool = False) -> str:
    # 检测 prompt 中的注入模式（针对非交互 cron 环境的特定风险）
    # 发现注入 → 抛出 CronPromptInjectionBlocked（job 被标记 blocked）
```

这解决了 issue #3968：创建时的扫描只覆盖 `prompt` 字段，但技能内容在运行时加载，可能携带注入 payload。组装后扫描堵上了这个漏洞。

---

## 6. 投递机制

`cron/scheduler.py::_deliver_result()` 将 job 输出投递到目标平台。

### 6.1 投递目标解析

```python
_resolve_delivery_targets(job) -> List[dict]
```

`deliver` 字段支持：

| 值 | 含义 |
|---|---|
| `"home"` / `""` | 投递到默认 home channel（各平台的主 channel）|
| `"all"` | 投递到所有已配置平台的 home channel |
| `"telegram"` | 投递到 Telegram home channel |
| `"discord"` | 投递到 Discord home channel |
| `"telegram:chat_id"` | 投递到指定 Telegram chat_id |
| `["telegram", "discord"]` | 多目标投递 |

### 6.2 会话隔离

Cron 投递进入**独立的 cron session**，不合并到主对话历史：

```python
# cron session 有特殊的 header/footer 包装
final_content = f"[Cron Job: {job['name']}]\n\n{content}\n\n[End of scheduled report]"
# 投递到目标平台，source="cron"
```

**原因**：cron 结果进入主对话会破坏 `role: assistant / user` 的交替规则，导致 API 返回 400。

### 6.3 Standalone sender（网关不运行时）

若网关未运行，`standalone_sender_fn`（平台插件注册）提供独立投递能力：

```python
# 平台插件在 register_platform 时注册
ctx.register_platform(
    ...,
    standalone_sender_fn=my_async_send_fn,  # async (job, content, target) -> dict
)
```

---

## 7. 安全与硬限制

### 7.1 3 分钟硬中断

```python
CRON_HARD_INTERRUPT_MINUTES = 3

# _run_job_impl 中：
def timeout_interrupt():
    time.sleep(CRON_HARD_INTERRUPT_MINUTES * 60)
    agent.interrupt("Cron job hard interrupt: 3-minute limit reached")

threading.Thread(target=timeout_interrupt, daemon=True).start()
```

任何 cron job 都不能运行超过 3 分钟，防止 runaway Agent 占用调度器线程。

### 7.2 默认禁用的工具集

Cron Agent 永远不会获得以下工具集（`_resolve_cron_disabled_toolsets()`）：

| 工具集 | 原因 |
|---|---|
| `cronjob` | 防止 cron Agent 自己创建更多 cron job（循环创建） |
| `messaging` | 交互式工具，需要活跃 gateway session |
| `clarify` | 交互式工具，会阻塞等待用户输入 |
| `agent.disabled_toolsets` 配置的工具集 | 用户级全局禁用（#25752 fix，防止 LLM 通过 enabled_toolsets 绕过） |

### 7.3 skip_memory=True

Cron job 默认不触发记忆 provider（`skip_memory=True`），因为：
- Cron 的系统提示专为特定任务定制，与用户对话不同
- 将 cron 执行内容注入 honcho 等 provider 会污染用户画像

### 7.4 Prompt 注入防护

创建时扫描 `prompt` 字段，运行时扫描组装后的完整 prompt（含技能内容）。发现注入模式时抛出 `CronPromptInjectionBlocked`，job 状态设为 `blocked`，不执行 Agent。

---

## 8. 工具端接口（cronjob 工具）

Agent 在对话中通过 `cronjob` 工具管理定时任务：

```python
cronjob(
    action: str,          # "create" / "list" / "edit" / "pause" / "resume" / "run" / "remove"
    job_id: str = None,   # 操作特定 job 时必须
    name: str = None,
    prompt: str = None,
    schedule: str = None,   # 调度表达式（见 §3）
    skills: list = None,
    model: str = None,
    provider: str = None,
    script: str = None,
    no_agent: bool = False,
    context_from: list = None,
    workdir: str = None,
    deliver: str = None,
    enabled_toolsets: list = None,
)
```

### 8.1 create 示例

```python
cronjob(
    action="create",
    name="每日工作报告",
    prompt="分析今天的工作日志，生成包含完成事项、遇到问题和明日计划的报告",
    schedule="0 21 * * 1-5",    # 工作日晚上 9 点
    skills=["research"],
    deliver="telegram",
)
```

### 8.2 edit 注意事项

- `id` 字段不可修改（immutable）
- 修改 `schedule` 会重新计算 `next_run`
- `edit` 操作线程安全（持有 `_jobs_file_lock`）

---

## 9. CLI 与 Slash 命令

### 9.1 hermes cron 命令

```bash
hermes cron list                          # 列出所有 job（含状态、下次运行时间）
hermes cron add --name "每日报告" --prompt "..." --schedule "0 9 * * *"
hermes cron edit <job_id> --prompt "新提示词"
hermes cron pause <job_id>                # 暂停（保留，不再触发）
hermes cron resume <job_id>              # 恢复
hermes cron run <job_id>                 # 立即手动触发一次
hermes cron remove <job_id>             # 删除 job + 输出历史
hermes cron output <job_id>             # 查看最近输出
```

### 9.2 /cron slash 命令

在 CLI 或网关对话中：

```
/cron list                    → 列出 job
/cron pause <job_id>
/cron resume <job_id>
/cron run <job_id>
```

### 9.3 输出查看

```bash
hermes cron output <job_id>              # 最近一次输出
hermes cron output <job_id> --all        # 所有历史输出（最新在前）
```

输出文件路径：`~/.hermes/cron/output/<job_id>/<ISO_timestamp>.md`

---

## 10. 高级特性

### 10.1 预运行脚本（script）

在 Agent 执行前运行一个脚本，将 stdout 注入 prompt 作为数据上下文：

```json
{
    "prompt": "分析以下监控数据并报告异常",
    "schedule": "*/5 * * * *",
    "script": "scripts/collect_metrics.sh"
}
```

**wake_gate**：脚本可以在 stdout 中输出 `[SKIP]` 或 `[NO_REPORT]` 来阻止本次 Agent 调用：

```bash
#!/bin/bash
# collect_metrics.sh
ERRORS=$(check_error_count)
if [ "$ERRORS" -eq 0 ]; then
    echo "[SKIP]"   # 没有错误，跳过 Agent
    exit 0
fi
echo "Error count: $ERRORS"
echo "Top errors: ..."
```

`_parse_wake_gate()` 检测脚本输出中的 `[SKIP]` / `[NO_REPORT]`，若发现则跳过 AI 调用，不消耗 token。

### 10.2 纯脚本模式（no_agent=True）

```json
{
    "script": "scripts/daily_backup.sh",
    "no_agent": true,
    "deliver": "telegram",
    "schedule": "0 2 * * *"
}
```

`no_agent=True` 时，脚本的 stdout 直接作为投递内容，不启动 AI Agent。适合不需要 AI 处理的自动化任务。

### 10.3 上下文链接（context_from）

让 job B 使用 job A 的最新输出作为上下文：

```json
{
    "id": "b1b2c3d4e5f6",
    "name": "周报摘要",
    "prompt": "基于以下每日报告，生成本周工作总结",
    "schedule": "0 18 * * 5",     // 每周五 18:00
    "context_from": ["a1b2c3d4e5f6"]  // 引用每日报告 job 的 ID
}
```

引用 job 的最新输出文件（最大 8K 字符，超出截断）被注入为 `## Output from job` 块。

**路径安全**：`context_from` 中的 job_id 只允许 12 位小写十六进制字符（正则验证），防止路径穿越。

### 10.4 工作目录（workdir）

```json
{
    "prompt": "分析最新的 git 提交并生成变更日志",
    "schedule": "0 20 * * *",
    "workdir": "/home/user/Projects/my-project"
}
```

指定 `workdir` 后，Agent 会从该目录加载 `AGENTS.md` / `CLAUDE.md`，获取项目特定上下文，工具的 CWD 也设为该目录。

### 10.5 多平台投递

```json
{
    "deliver": ["telegram", "discord", "slack"],  // 同时投递到三个平台
    "prompt": "...",
    "schedule": "0 9 * * *"
}
```

每个平台独立投递，任何一个投递失败不影响其他平台。

---

## 11. 文件系统布局

```
~/.hermes/cron/
├── jobs.json              # 所有 job 定义（JSON array）
├── .tick.lock             # 跨进程 tick 互斥锁
└── output/
    ├── a1b2c3d4e5f6/      # job_id = 输出目录名
    │   ├── 2026-05-29T09-00-00.md   # 每次执行的输出
    │   ├── 2026-05-28T09-00-00.md
    │   └── ...
    └── b1b2c3d4e5f7/
        └── ...
```

**输出文件命名**：ISO 时间戳，`:`替换为`-`（文件系统兼容性）。  
**输出保留**：`hermes cron remove <id>` 同时删除输出目录。手动清理可直接删除 output 子目录。

---

## 12. 配置参考

### 12.1 cron 节

```yaml
cron:
  enabled: true                    # 总开关（默认 true）
  tick_interval_seconds: 60        # tick 间隔（默认 60s）
  max_parallel_jobs: 5             # 最大并行 job 数（默认 5）
  hard_interrupt_minutes: 3        # 硬中断时间（默认 3min）
  catchup_window_min_seconds: 120  # catchup 最小窗口（默认 120s）
  catchup_window_max_seconds: 7200 # catchup 最大窗口（默认 2h）
  oneshot_grace_seconds: 120       # 一次性 job grace 窗口（默认 120s）
  skip_memory: true                # cron 不触发记忆 provider（默认 true）
```

### 12.2 工具集配置（cron 平台）

```yaml
tools:
  cron:
    enabled:                       # cron Agent 额外启用的工具集
      - file
      - web
    disabled:                      # cron Agent 额外禁用的工具集
      - browser
```

Cron 平台的工具集配置遵循与其他平台相同的语法，通过 `hermes tools` TUI 可视化管理。

### 12.3 快速入门

```bash
# 创建一个简单的每日报告
hermes cron add \
    --name "每日总结" \
    --prompt "简要总结今天可能发生的技术新闻，重点关注 AI 领域" \
    --schedule "0 20 * * *" \
    --deliver telegram

# 查看是否创建成功
hermes cron list

# 立即测试运行
hermes cron run <job_id>

# 查看输出
hermes cron output <job_id>
```
