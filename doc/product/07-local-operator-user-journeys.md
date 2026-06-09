# Local Operator User Journeys

> 状态：产品旅程 / 下一阶段 P1
>
> 目的：用真实用户旅程约束 CLI、RunRecord、Workbench、Skill Governance 和 Eval 的产品边界，避免只按模块堆功能。

## 1. 设计原则

KeiGent 的下一阶段产品开发应围绕 operator 的连续工作流，而不是单点能力。

每条旅程都必须回答：

1. 用户要完成什么工作？
2. 系统默认选择什么 profile / workflow？
3. 需要哪些权限和风险提示？
4. 成功证据是什么？
5. 失败如何表达？
6. Workbench 如何复盘？
7. 是否进入 eval / skill governance？

## 2. Journey A：首次安装与配置

### 用户目标

用户希望在本地完成安装、配置模型、确认运行环境健康。

### 入口

```bash
corepack pnpm install
corepack pnpm --filter @keigent/cli start config init
corepack pnpm --filter @keigent/cli start doctor --json
```

### 成功体验

- doctor 清楚区分 env / file / default / missing。
- API key 永远脱敏。
- Node/pnpm/Playwright 等前置条件明确。
- 离线 doctor 不发起网络请求。
- 缺少 key 时给出修复路径，而不是堆栈。

### 验收标准

| 检查 | 期望 |
|---|---|
| 无 config | doctor 返回 structured issue |
| 有 env key | config source 显示 env，key 脱敏 |
| Node 版本不符 | warning，不和测试失败混淆 |
| Playwright 缺失 | browser verify 给出前置条件 |
| `--json` | 输出可解析 JSON object |

### 非目标

- 不在 doctor 默认流程中修改用户配置。
- 不在线测试模型，除非用户显式选择 online check。

## 3. Journey B：执行一次低风险任务

### 用户目标

用户希望完成一次低风险任务，例如总结网页、读取本地文件、生成小报告。

### 预期系统行为

- Orchestrator 选择 `divergent-research` 或 `convergent-exec`。
- 只暴露低风险工具。
- 如果有匹配 skill，记录 match explanation。
- run 完成后生成 RunRecord。

### CLI Summary 示例

```text
Status: succeeded
Profile: divergent-research
Risk: R1 readonly
Skills: web-summarize
Evidence: 2 checked / 0 failed
Trajectory: ~/.keigent/runs/run_x/trajectory.json
```

### Workbench 复盘

Run Detail 应展示：

- 路由理由；
- skill 匹配；
- 网页/文件读取工具调用；
- 输出摘要；
- evidence 或未验证标记。

### 验收标准

| 检查 | 期望 |
|---|---|
| profile | 与任务类型匹配 |
| tools | 无高风险工具 |
| evidence | 没有 evidence 时不能显示 verified success |
| run record | 可保存、可复盘 |

## 4. Journey C：执行一次需要审批的任务

### 用户目标

用户要求执行可能产生副作用的任务，例如写文件、执行 shell、访问外部 API。

### 预期系统行为

- ToolRegistry 标记 permission/risk/sideEffect。
- R3-R5 或 dangerous 操作触发审批。
- 审批请求进入 progress event 和 trajectory。
- 用户拒绝时，任务不能假装成功。

### 状态流

```text
created -> routed -> running -> awaiting_approval -> running -> verifying -> succeeded
```

或：

```text
created -> routed -> running -> awaiting_approval -> failed/degraded
```

### 验收标准

| 检查 | 期望 |
|---|---|
| approval request | 显示工具名、风险、side effect、可逆性 |
| approval denied | 记录拒绝，阻断危险动作 |
| approval approved | scope 和时间进入 trajectory |
| Web | Risk Panel 可见审批链 |

### 非目标

- 不绕过 ToolRegistry。
- 不把用户沉默当批准。
- 不在审批失败后继续执行等价危险动作。

## 5. Journey D：复盘一次失败 run

### 用户目标

用户希望知道失败发生在哪里，以及下次如何改进。

### 预期系统行为

失败 run 必须有结构化 failure：

- failure code；
- failed assertion；
- tool failure；
- recovery attempt；
- blocking evidence；
- next action。

### Workbench 复盘

Run Detail 应优先显示：

1. terminal status；
2. blocking failure；
3. failed step；
4. related tool/checkpoint；
5. recovery decision；
6. 是否可 replay。

### 验收标准

| 检查 | 期望 |
|---|---|
| final text | 不覆盖 failed status |
| checkpoint passed | 不覆盖 parent timeout/budget failure |
| failed assertion | 能定位 evidence source |
| replay | 明确是 replay，不是 fresh retry |

## 6. Journey E：将经验晋升为 candidate skill

### 用户目标

用户发现一次 run 中的经验可复用，希望沉淀为 skill，但不希望污染正式技能库。

### 预期系统行为

- learner 只能产生 `learned-note-only`。
- 用户或 reviewer 可以把 learned note 标为 candidate。
- candidate 必须绑定 source trajectory。
- 晋升 verified 前必须通过 eval。

### 验收标准

| 检查 | 期望 |
|---|---|
| learned note | 不自动注入正式执行 |
| promotion | 需要 source、task type、non-goals |
| eval guard | 无 eval 不能 verified |
| rollback | 可 deprecated / blocked |

## 7. Journey F：运行真实世界 Eval

### 用户目标

产品负责人或验收人希望知道当前系统是否比上一版退化。

### 预期系统行为

Eval report 必须分层：

- route accuracy；
- task success；
- evidence quality；
- tool reliability；
- recovery quality；
- false confidence risk。

### 验收标准

| 检查 | 期望 |
|---|---|
| empty dataset | 不显示 100% 健康 |
| fixture pass | 标记为 fixture/schema 级别 |
| real task | 明确 fresh execution |
| replay | 不冒充 fresh execution |

## 8. 旅程优先级

| 优先级 | 旅程 | 理由 |
|---|---|---|
| P0 | Run Record 支撑 B/C/D | 没有 run 产品对象，Workbench 和 eval 都缺事实源 |
| P0 | Skill Governance 支撑 E | 避免知识污染和 false confidence |
| P1 | Workbench Run Detail 支撑 B/C/D | 让 reviewer 能看懂 run |
| P1 | Real-world Eval 支撑 F | 从 fixture 进入真实产品验收 |
| P2 | 安装体验精修支撑 A | 提升新用户体验，但不应压过事实源建设 |

## 9. 非目标

- 不把旅程文档变成 UI 需求堆砌。
- 不在没有 RunRecord 的情况下做完整 dashboard。
- 不做多租户 SaaS 旅程。
- 不把真实世界 eval 包装成自动健康分。
- 不把 skill 晋升做成无审核自动化。