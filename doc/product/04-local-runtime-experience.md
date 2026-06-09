# Local Runtime Experience Blueprint

> 目标：定义 KeiGent 从 repo 工程走向本地可用产品的安装、首次运行、诊断、日常使用与失败体验。

## 1. 用户旅程

```text
install -> config init -> doctor -> first run -> inspect trajectory -> run eval -> iterate skills/config
```

## 2. 首次运行要求

用户应在 10 分钟内完成：

1. 安装 CLI。
2. 初始化 `~/.keigent/config.json`。
3. 设置 provider-neutral 模型端点。
4. 创建 workspace/skills/memory 目录。
5. 运行 `keigent doctor --offline`。
6. 完成一个 read-only smoke task。
7. 找到 trajectory 或 eval report。

## 3. CLI Surface

| 命令 | 产品用途 |
|---|---|
| `keigent` | 进入 REPL |
| `keigent "task"` | 单次执行 |
| `keigent config init/show/set/unset/path` | 配置管理 |
| `keigent doctor --offline/--online --json` | 诊断 |
| `keigent eval smoke/orchestrator/replay` | 回归验证 |
| `keigent replay <trajectory>` | 回放 |
| `keigent web` | 本地 workbench |

## 4. 失败体验

| 失败 | 必须展示 | 禁止 |
|---|---|---|
| missing key | 如何设置 `KEIGENT_API_KEY` 或 config | 原始 stack trace |
| invalid key | auth failed 与 endpoint 区分 | 泄露 key |
| browser missing | 安装/路径建议 | 说 agent 智能失败 |
| workspace unwritable | 当前路径与修复建议 | 静默改其他路径 |
| permission denied | 需要的 risk/approval | 自动降权后声称成功 |
| model incompatible | protocol/baseUrl/modelId 问题 | 品牌化 relay 入口 |

## 5. 数据位置

| 数据 | 默认位置 | 要求 |
|---|---|---|
| Config | `~/.keigent/config.json` | secret redaction、权限检查 |
| Workspace | `~/.keigent/workspace` | 防路径逃逸 |
| Skills | `~/.keigent/skills` | lifecycle 状态 |
| Memory | `~/.keigent/memory` | 执行 loop 默认不写 |
| Trajectories | workspace 或 skills/.trajectories | 可 replay |
| Reports | configurable output | machine-readable |

## 6. 验收标准

- `doctor --offline` 不做网络调用。
- 所有 secret 在 CLI/Web/log/report 中脱敏。
- install/config/browser/model 的失败不被表达为 agent 行为失败。
- 单次模式遇到 ask_user 需求时可解释降级。
- 用户能从失败消息找到下一步修复动作。
