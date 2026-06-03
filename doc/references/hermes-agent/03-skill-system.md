# 模块三：技能系统

> 核心文件：`agent/skill_commands.py`、`agent/skill_bundles.py`、`agent/skill_preprocessing.py`、`tools/skill_manager_tool.py`、`tools/skills_hub.py`、`agent/curator.py`
> 版本：v0.14.0+

---

## 目录

1. [概念模型](#1-概念模型)
2. [技能目录结构](#2-技能目录结构)
3. [SKILL.md 格式规范](#3-skillmd-格式规范)
4. [技能加载与注入机制](#4-技能加载与注入机制)
5. [skill_commands：Slash 命令层](#5-skill_commandsslash-命令层)
6. [skill_bundles：捆绑包系统](#6-skill_bundles捆绑包系统)
7. [skill_preprocessing：预处理管道](#7-skill_preprocessing预处理管道)
8. [Agent 端工具（skill_manage）](#8-agent-端工具skill_manage)
9. [Skills Hub（agentskills.io）](#9-skills-hubagentskillsio)
10. [Curator：技能生命周期管理](#10-curator技能生命周期管理)
11. [技能安全与来源追踪](#11-技能安全与来源追踪)
12. [技能编写规范](#12-技能编写规范)

---

## 1. 概念模型

技能（Skill）是 Hermes 的**程序性记忆**单元，本质是一个 Markdown 文档（`SKILL.md`），描述一套完成特定任务的流程、工具使用方式和注意事项。

**技能的两个核心作用**：

1. **Slash 命令入口**：用户输入 `/skill-name [args]` 时，技能内容以**用户消息**形式注入对话，指导 Agent 完成特定工作流
2. **Agent 自我学习**：Agent 可以通过 `skill_manage` 工具创建、更新、删除自己的技能，形成经验积累闭环

**两个并行表面**：

| 位置 | 说明 | 激活方式 |
|---|---|---|
| `skills/` | 内置技能，随仓库发布，默认可用 | 自动扫描 |
| `optional-skills/` | 重量级 / 小众技能，随仓库发布但默认不激活 | `hermes skills install official/<category>/<skill>` |
| `~/.hermes/skills/` | 用户自定义 + Agent 创建的技能 | 自动扫描 |
| `plugins/<name>:skills/` | 插件提供的只读技能 | 插件注册 |

---

## 2. 技能目录结构

### 2.1 内置技能分类（skills/）

```
skills/
├── apple/                    # macOS / Apple 生态
├── autonomous-ai-agents/     # AI Agent 协作
├── creative/                 # 创意写作
├── data-science/             # 数据分析
├── devops/                   # DevOps / CI/CD
├── diagramming/              # 图表生成
├── dogfood/                  # Hermes 自身 QA
├── domain/                   # 领域专家技能
├── email/                    # 邮件处理
├── gaming/                   # 游戏相关
├── gifs/                     # GIF 生成
├── github/                   # GitHub 工作流
├── inference-sh/             # inference.sh 集成
├── mcp/                      # MCP server 相关
├── media/                    # 媒体处理
├── mlops/                    # MLOps 工作流
├── note-taking/              # 笔记管理
├── productivity/             # 效率工具
├── red-teaming/              # 安全测试
├── research/                 # 研究工作流
├── smart-home/               # 智能家居
├── social-media/             # 社交媒体
├── software-development/     # 软件开发
└── yuanbao/                  # 元宝平台
```

### 2.2 可选技能分类（optional-skills/）

```
optional-skills/
├── autonomous-ai-agents/     # 自主 AI Agent
├── blockchain/               # 区块链
├── communication/            # 沟通协作
├── creative/                 # 创意（重量级）
├── devops/                   # DevOps（重量级）
├── email/                    # 邮件（重量级）
├── finance/                  # 金融分析
├── health/                   # 健康相关
├── mcp/                      # MCP（重量级）
├── migration/                # 迁移工具
├── mlops/                    # MLOps（重量级）
├── productivity/             # 效率（重量级）
├── research/                 # 研究（重量级）
├── security/                 # 安全
├── software-development/     # 软件开发（重量级）
└── web-development/          # Web 开发
```

### 2.3 单个技能的目录布局

```
skills/apple/apple-reminders/
├── SKILL.md          # 必须：技能主文档（含 YAML frontmatter）
├── scripts/          # 可选：辅助脚本（shell / Python）
├── references/       # 可选：参考文档、规范
└── templates/        # 可选：模板文件
```

---

## 3. SKILL.md 格式规范

### 3.1 完整 frontmatter

```yaml
---
name: apple-reminders                    # 必须：技能名（连字符分隔）
description: "Apple Reminders via remindctl: add, list, complete."
                                         # 必须：≤ 60 字符，一句话，句号结尾
version: 1.0.0
author: Hermes Agent                     # 格式：贡献者真实姓名 + GitHub handle，非工具名
license: MIT
platforms: [macos]                       # 支持平台：[linux]、[macos]、[windows]、或组合
metadata:
  hermes:
    tags: [Reminders, tasks, todo, macOS, Apple]
    category: apple
    related_skills: [other-skill-name]
    config:                              # 可选：技能需要的配置项（存储在 skills.config.<key>）
      api_key: ""
prerequisites:
  commands: [remindctl]                  # 可选：依赖的命令行工具
---
```

### 3.2 正文结构（推荐顺序）

```markdown
# <Skill Name> Skill

2-3 句介绍：此技能做什么，不做什么。

## When to Use
何时触发此技能（触发词、场景）。

## Prerequisites
运行前提条件（工具安装、权限配置、API key）。

## How to Run
基本调用方式。

## Quick Reference
关键操作速查表。

## Procedure
分步骤的详细操作流程。

## Pitfalls
常见错误和避坑指南。

## Verification
如何验证技能执行成功。
```

**字数指导**：复杂技能约 200 行，简单技能约 100 行。避免重复 prerequisites 中已说明的内容。

### 3.3 description 硬性约束

- ≤ 60 字符
- 一句话
- 以句号结尾
- 不重复技能名
- 不含营销词汇（"powerful", "comprehensive", "seamless", "advanced"）

违反这些约束的 PR 会被拒绝。

---

## 4. 技能加载与注入机制

### 4.1 关键设计决策：注入用户消息而非系统提示

技能内容**作为用户消息注入**，而不是追加到系统提示。原因：

- 系统提示在整个 session 内保持不变（prompt cache 要求）
- 技能内容可能每 turn 不同（用户在 session 中随时调用不同技能）
- 用户消息注入不破坏已有的 prefix cache

```python
# skill_commands.py::build_skill_invocation_message()
{
    "role": "user",
    "content": "<skill_content_here>\n\n<user_original_message>"
}
```

### 4.2 技能系统提示（预加载模式）

部分技能可以配置为预加载，在 session 开始时注入系统提示末尾（而非每次 slash 命令时）：

```python
# agent/prompt_builder.py::build_skills_system_prompt()
# 扫描 ~/.hermes/skills/ 中标记为 preload=true 的技能
# 将其摘要/触发词列表注入到 <available_skills> XML 块
```

这让 Agent 在系统提示阶段就知道有哪些技能可用，可以主动推荐用户使用，但具体内容仍在调用时才注入。

### 4.3 技能快照缓存（snapshot）

```python
# agent/prompt_builder.py
_skills_prompt_snapshot_path()  # ~/.hermes/skills/.prompt-snapshot.json

# 快照包含：技能名、mtime、内容摘要
# 条件：技能目录内容未变化时复用快照，避免每次启动重新扫描
# 失效：任何技能文件变化触发重建（mtime 比较）
```

---

## 5. skill_commands：Slash 命令层

`agent/skill_commands.py`，处理技能的 slash 命令入口。

### 5.1 扫描与注册

```python
scan_skill_commands() -> Dict[str, Dict[str, Any]]
```

扫描路径（按优先级）：

1. `~/.hermes/skills/<name>/SKILL.md`（用户技能 / Agent 创建技能）
2. `<repo>/skills/<category>/<name>/SKILL.md`（内置技能）
3. Plugin 注册的技能（`plugin_name:skill_name` 格式）

对每个技能，提取：
- `name` → slash 命令名（slugify 处理：小写、连字符、去特殊字符）
- `description` → help 文字
- `platforms` → OS 过滤
- `metadata.hermes.config` → 所需配置项

### 5.2 平台过滤

```python
def _resolve_skill_commands_platform() -> Optional[str]:
    # 读取 HERMES_PLATFORM env var 或 HERMES_SESSION_PLATFORM（网关会话）
    # 返回当前平台名，用于 skills.platform_disabled 过滤
```

在 Telegram / Discord 等平台上，可通过 `skills.platform_disabled` 配置禁用某些技能，防止不适合该平台的技能出现在 `/help` 列表中。

### 5.3 技能调用消息构建

```python
build_skill_invocation_message(
    skill_identifier: str,
    args: list[str],
    task_id: str = None,
) -> dict | None
```

返回注入用户消息的完整结构：

```python
{
    "role": "user",
    "content": "<preprocessed_skill_content>\n\nUser args: <args>"
}
```

内容经过 `preprocess_skill_content()` 处理（模板变量替换 + 内联 shell 展开）。

### 5.4 配置注入

技能 frontmatter 中 `metadata.hermes.config` 声明的配置项，会从 `~/.hermes/config.yaml` 的 `skills.config.<key>` 路径读取，并在调用时注入到 skill content 的对应占位符：

```markdown
<!-- SKILL.md 中使用配置值 -->
API Endpoint: {{config.api_key}}
```

### 5.5 关键函数

| 函数 | 行号 | 说明 |
|---|---|---|
| `scan_skill_commands()` | 263 | 全量扫描，返回技能命令字典 |
| `get_skill_commands()` | 329 | 返回缓存（惰性初始化） |
| `reload_skills()` | 344 | 重载（`/skills reload`）|
| `resolve_skill_command_key()` | 409 | 技能名 → 标准化 key |
| `build_skill_invocation_message()` | 428 | 构建注入消息 |
| `build_preloaded_skills_prompt()` | 475 | 构建系统提示中的技能摘要块 |

---

## 6. skill_bundles：捆绑包系统

`agent/skill_bundles.py`，管理多个技能打包在一起的 `.bundle` 文件。

### 6.1 捆绑包格式

```json
{
    "name": "my-workflow-bundle",
    "description": "...",
    "skills": ["skill-a", "skill-b", "skill-c"],
    "version": "1.0.0"
}
```

存储位置：`~/.hermes/skills/.bundles/<name>.bundle.json`

### 6.2 用途

捆绑包用于将一组相关技能组合为一个 slash 命令，Agent 可以通过单次调用加载整套工作流：

```
/my-workflow-bundle → 同时注入 skill-a + skill-b + skill-c 的内容
```

### 6.3 关键函数

| 函数 | 行号 | 说明 |
|---|---|---|
| `scan_bundles()` | 168 | 扫描 .bundles/ 目录 |
| `get_skill_bundles()` | 195 | 返回缓存 |
| `save_bundle()` | 356 | 保存/更新捆绑包 |
| `delete_bundle()` | 394 | 删除捆绑包 |
| `build_bundle_invocation_message()` | 253 | 构建调用消息（拼接所有技能内容）|
| `reload_bundles()` | 221 | 重载 |

---

## 7. skill_preprocessing：预处理管道

`agent/skill_preprocessing.py`，在技能内容注入用户消息前进行预处理。

### 7.1 模板变量替换

```python
substitute_template_vars(content: str, args: list[str], config: dict) -> str
```

支持的变量格式：

```markdown
{{args[0]}}          # 第一个命令行参数
{{args[1]}}          # 第二个参数
{{config.api_key}}   # skills.config.api_key 的值
{{env.HOME}}         # 环境变量
```

### 7.2 内联 Shell 展开

```python
expand_inline_shell(content: str, cwd: Path, timeout: int = 10) -> str
```

```markdown
<!-- SKILL.md 中嵌入动态信息 -->
Current git branch: {{shell: git branch --show-current}}
Today's date: {{shell: date +%Y-%m-%d}}
```

语法：`` {{shell: <command>}} ``，命令在 skill 目录下执行，stdout 替换占位符。

### 7.3 完整预处理

```python
preprocess_skill_content(content: str, args: list[str], skill_dir: Path, config: dict) -> str
```

执行顺序：
1. `substitute_template_vars()`
2. `expand_inline_shell()`

---

## 8. Agent 端工具（skill_manage）

`tools/skill_manager_tool.py`，Agent 可以通过工具调用直接管理技能，实现自我学习闭环。

### 8.1 skill_manage 操作

```python
skill_manage(
    action: str,      # 操作类型
    name: str,        # 技能名
    content: str,     # SKILL.md 内容（create/edit 时需要）
    category: str,    # 技能分类
    absorbed_into: str,  # delete 时说明被哪个技能吸收
    file_path: str,   # write_file/patch/remove_file 时的相对路径
    file_content: str,   # write_file 时的文件内容
    patch_content: str,  # patch 时的 diff 内容
)
```

| action | 说明 |
|---|---|
| `create` | 创建新技能（写入 `~/.hermes/skills/<category>/<name>/SKILL.md`）|
| `edit` | 完整替换 SKILL.md 内容 |
| `patch` | 对 SKILL.md 打 diff patch |
| `delete` | 删除技能（需提供 `absorbed_into` 说明归宿）|
| `write_file` | 在技能目录内写入额外文件（scripts / templates 等）|
| `remove_file` | 删除技能目录内的文件 |

### 8.2 安全防护

**Pinned 保护**：

```python
def _pinned_guard(name: str) -> Optional[str]:
    # 读取 ~/.hermes/skills/.usage.json 中的 pinned 字段
    # pinned 技能只允许 patch/edit/write_file/remove_file（改进），
    # 拒绝 delete（销毁）
```

**名称验证**：

- 只允许 `[a-z0-9-]` 字符
- 不允许路径穿越
- 长度限制

**内容验证**：

- frontmatter YAML 格式校验
- 描述字段长度（≤ 60 字符）
- 文件大小上限

**来源标记**：
`skill_manage create` 创建的技能自动在 frontmatter 中添加 `created_by: agent`，与人工创建的技能区分。Curator 只对 `agent` 来源的技能进行自动生命周期管理。

### 8.3 安全扫描

```python
def _security_scan_skill(skill_dir: Path) -> Optional[str]:
    # 扫描技能目录内的可执行脚本
    # 检查危险模式（远程代码执行、权限提升、credential 读取等）
    # 返回发现的安全问题描述（若有）
```

### 8.4 skill_view（只读查看）

`tools/skills_tool.py::skill_view()`：

```python
skill_view(
    name: str,        # 技能名或相对路径
    task_id: str = None,
    preprocess: bool = True,  # 是否运行预处理管道
) -> str    # JSON 字符串
```

返回：

```json
{
    "success": true,
    "name": "apple-reminders",
    "content": "<SKILL.md 内容>",
    "path": "/path/to/SKILL.md",
    "frontmatter": {...}
}
```

---

## 9. Skills Hub（agentskills.io）

`tools/skills_hub.py`，与 [agentskills.io](https://agentskills.io) 开放标准兼容的远程技能仓库适配器。

### 9.1 来源类型

| 来源 | 适配器类 | 说明 |
|---|---|---|
| agentskills.io | `AgentSkillsSource` | 官方技能仓库 |
| GitHub repo | `GitHubSource` | 任意 GitHub 仓库 |
| optional-skills/ | `OptionalSkillSource` | 本仓库的可选技能 |
| Local path | `LocalSource` | 本地目录 |

### 9.2 技能安装

```bash
# 从 agentskills.io 安装
hermes skills install <skill-name>

# 从可选技能安装
hermes skills install official/devops/kubernetes

# 从 GitHub 安装
hermes skills install github:owner/repo/path/to/skill
```

安装过程：
1. 拉取技能目录（包含 SKILL.md + scripts/ + references/ 等）
2. 安全扫描脚本内容
3. 写入 `~/.hermes/skills/<name>/`
4. 更新 `~/.hermes/skills/.lock.json`（锁定版本）

### 9.3 锁文件

`~/.hermes/skills/.lock.json`，记录每个已安装技能的来源、版本、安装路径：

```json
{
    "kubernetes": {
        "source": "official/devops/kubernetes",
        "version": "1.2.0",
        "installed_at": "2026-05-01T00:00:00Z",
        "path": "~/.hermes/skills/kubernetes/"
    }
}
```

### 9.4 Hub 认证

`_HubAuth` 类，按优先级依次尝试：
1. `HERMES_SKILLS_HUB_TOKEN` env var
2. `~/.hermes/.env` 中的 token
3. GitHub CLI（`gh auth token`）
4. GitHub App token（若配置）

---

## 10. Curator：技能生命周期管理

`agent/curator.py`，后台自动维护 Agent 创建的技能，防止技能目录无限膨胀。

### 10.1 技能状态机

```
active ──(stale_after_days 无活动)──────────→ stale
stale  ──(archive_after_days 仍无活动)───→ archived
archived ←─────────────────── restore ← 可手动恢复
pinned   ──────────────────── 免疫所有自动迁移
```

**活动信号**（由 `tools/skill_usage.py` 追踪）：
- `use_count`：技能被 slash 命令调用次数
- `view_count`：技能被 `skill_view` 查看次数
- `patch_count`：技能被 `skill_manage patch` 修改次数
- `last_activity_at`：最后活动时间戳

### 10.2 Curator 运行机制

```python
# 在每轮对话结束后（_spawn_background_review 中）检查是否到运行时间
maybe_run_curator(last_response_time)  # → should_run_now()

# 满足条件时在独立线程运行
run_curator_review()
  ├─ apply_automatic_transitions()    # 按时间阈值自动迁移状态
  └─ _run_llm_review()                # LLM 审查（可选，更智能的判断）
```

### 10.3 不变量

| 约束 | 说明 |
|---|---|
| 仅处理 `created_by: agent` | 内置技能 + Hub 安装的技能**绝不**被 curator 触碰 |
| 最多归档，不删除 | 归档路径：`~/.hermes/skills/.archive/<name>/` |
| Pinned 完全免疫 | `skill_manage delete` 也拒绝 pinned 技能 |
| 归档前备份 | `curator_backup.py` 生成 tar.gz 快照到 `~/.hermes/skills/.backups/` |

### 10.4 CLI 命令

```bash
hermes curator status              # 查看技能状态概览
hermes curator run                 # 手动触发一次审查
hermes curator pause / resume      # 暂停/恢复自动运行
hermes curator pin <name>          # 固定技能（免疫自动迁移）
hermes curator unpin <name>
hermes curator archive <name>      # 手动归档
hermes curator restore <name>      # 从归档恢复
hermes curator prune               # 清理无法恢复的归档
hermes curator backup              # 手动生成备份
hermes curator rollback            # 恢复到最近备份
```

### 10.5 配置项（config.yaml 的 curator: 节）

```yaml
curator:
  enabled: true
  interval_hours: 24             # 审查间隔
  min_idle_hours: 4              # 最近 N 小时内有活动则跳过
  stale_after_days: 14           # 无活动 N 天后进入 stale
  archive_after_days: 30         # stale 再 N 天后归档
  backup:
    enabled: true
    keep_last: 5                 # 保留最近 N 个备份
```

---

## 11. 技能安全与来源追踪

### 11.1 skill_provenance（来源 ContextVar）

`tools/skill_provenance.py`，通过 Python `ContextVar` 跟踪每次技能写操作的来源：

```python
set_current_write_origin("assistant_tool")  # 前台用户发起的工具调用
set_current_write_origin("background_review")  # 后台 review fork
```

`skill_manage create` 时读取当前 origin，写入 frontmatter：

```yaml
created_by: agent                  # origin = assistant_tool
created_by: agent-background       # origin = background_review
```

这确保前台用户发起的技能创建与后台自动改进能被区分追踪。

### 11.2 skill_usage（使用频次追踪）

`tools/skill_usage.py`，维护 `~/.hermes/skills/.usage.json`：

```json
{
    "my-skill": {
        "use_count": 12,
        "view_count": 3,
        "patch_count": 2,
        "last_activity_at": "2026-05-28T10:00:00Z",
        "state": "active",
        "pinned": false
    }
}
```

每次技能被调用、查看、修改时更新对应计数器。

### 11.3 skills_ast_audit + skills_guard

`tools/skills_ast_audit.py`：对技能关联的 Python 脚本进行 AST 静态分析，检测恶意代码模式。

`tools/skills_guard.py`：运行时防护，限制技能脚本的能力边界。

---

## 12. 技能编写规范

以下规范来自 AGENTS.md，违反者 PR 会被拒绝。

### 12.1 七项硬性规范

1. **description ≤ 60 字符**，一句话，句号结尾，不含营销词汇

2. **工具引用使用内置工具名**（反引号格式）：
   - `grep` → `` `search_files` ``
   - `cat`/`head`/`tail` → `` `read_file` ``
   - `sed`/`awk` → `` `patch` ``
   - `find`/`ls` → `` `search_files target='files'` ``

3. **platforms 声明要准确**：使用 POSIX-only 原语（`fcntl`、`/proc`、`osascript`、`apt`、`systemctl` 等）必须声明平台限制；先尝试跨平台方案（`pathlib`、`psutil`、`tempfile`）

4. **author 字段写真实贡献者**：外部贡献者姓名 + GitHub handle 放第一位，"Hermes Agent" 作为次要协作者；若贡献者用 Hermes 起草技能，也要写真实人名

5. **正文结构顺序**：按 §3.2 中规定的章节顺序（When to Use → Prerequisites → How to Run → Quick Reference → Procedure → Pitfalls → Verification）

6. **脚本放 scripts/，模板放 templates/，参考文档放 references/**

7. **测试文件放 `tests/skills/test_<skill>_skill.py`**，只用 stdlib + pytest + unittest.mock，无网络调用

### 12.2 正确的工具引用示例

```markdown
<!-- 正确 -->
Use `read_file` to inspect the configuration.
Run `search_files` to find all Python files matching the pattern.
Apply `patch` to update the relevant section.

<!-- 错误 -->
Run grep to find the pattern.           # 应该用 search_files
Use cat to read the file.               # 应该用 read_file
Apply sed to replace the string.        # 应该用 patch
```

### 12.3 技能文档的 .env.example 更新规范

如果技能需要新的 env var，在 `.env.example` 中只添加明确分隔的块，不触碰文件其他部分：

```bash
# ── my-skill ──────────────────────────
MY_SKILL_API_KEY=
MY_SKILL_ENDPOINT=https://api.example.com
# ──────────────────────────────────────
```
