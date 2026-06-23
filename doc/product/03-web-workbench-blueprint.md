# Web Workbench Blueprint

> 目标：定义 KeiGent Web 不是普通聊天界面，而是 Agent Operations Workbench：执行、验证、审计、配置、回归、skill 治理的本地工作台。

## 1. 信息架构

| 区域 | 用户问题 | 核心状态 |
|---|---|---|
| Run Console | 当前任务在做什么？是否可信？ | live/replay、profile、skills、tools、checkpoints |
| Trajectory Replay | 历史 run 为什么成功/失败？ | ordered events、evidence、rescore |
| Eval Dashboard | 系统有没有退化？ | smoke/orchestrator/replay reports |
| Config Center | 当前配置为什么生效？安全吗？ | source-aware config、doctor、redaction |
| Skill Library | 哪些 skill 会影响执行？ | active/draft/learning/eval coverage |

## 2. V1 产品闭环

Workbench V1 的验收目标不是“完整工作台”，而是：

```text
reviewer 不看 CLI 日志，只看 Web，也能判断一次 run 是否可信。
```

因此 V1 信息架构应围绕真实 `RunRecord` 展开：

| 页面 | V1 必须回答的问题 | 依赖事实源 |
|---|---|---|
| Run List | 最近有哪些 run？状态、风险、profile 是什么？ | `RunRecord.status`、route、risk |
| Run Detail | 这次 run 为什么这样执行？ | route、timeline、skill matches |
| Evidence Panel | 凭什么说成功/失败？ | assertions、evidence、verdict |
| Risk Panel | 是否发生危险动作？谁批准？ | permission、risk、approval trail |
| Replay Panel | 是否能复盘？这是 replay 还是 fresh execution？ | trajectory、replay capability |

V1 明确不做：

- 在线启动复杂 workflow；
- 完整配置编辑器；
- 多用户协作；
- SaaS dashboard；
- 没有 case detail 的总健康分。

## 3. Run Console

必须展示：

- Task goal 与 successDef。
- Selected profile / mode / routing rationale。
- Matched skills。
- Iteration groups。
- Tool call/result pairing。
- Checkpoint/verdict pairing。
- Approval prompts。
- Final response 与 exit reason 分离。

不能把它做成只有气泡的聊天 UI。

当前实现备注（2026-06-15）：已实现前端内存事件流 Live Run Console view/render 层，支持 live/replay 标签、event timeline、pending tool/checkpoint/approval 统计和 selected event inspector。已新增 Web Run Launcher 与本地 Web API/SSE foundation：`keigent web --api` 启动 API，`POST /api/runs` 以 `task.source=web` 发起 run，`GET /api/runs/:id/events` 推送 workflow progress events，`GET /api/evals/real-world/:datasetId/latest` 提供 latest real-world eval report，前端可通过 `VITE_KEIGENT_API_URL` 读取 run store、读取 eval report、提交 task goal、订阅 run session events 并在 run 完成后跳转 Run Detail handoff。Run Workbench 已展示 Run list 审计字段、Timeline、proof boundary、autonomy、schema compatibility 摘要，并标出 legacy / unsupported / normalized RunRecord；当前仍未提供完整交互式 Workbench。

## 3. Run Review Workbench V1

最新设计入口见 [`../../docs/superpowers/specs/2026-06-23-run-review-workbench-v1-design.md`](../../docs/superpowers/specs/2026-06-23-run-review-workbench-v1-design.md)。Run Review Workbench V1 的核心问题是：

```text
Can I decide within 30 seconds whether this run is trustworthy, why it failed, and what to do next?
```

### 3.1 三栏信息架构

逻辑信息架构为：

```text
Left: Run Queue / Filters
Center: Run Timeline / Evidence Story
Right: Inspector / Proof Boundary / Next Action
```

当前静态 Workbench 可以继续使用响应式 stacked panels，但 view model 和文案必须保留这三个逻辑区域。

### 3.2 Trust Header

Run Detail 顶部必须用 trust label 回答“这次 run 当前是否可信”。

| Trust label | 规则 | 显示文案 |
|---|---|---|
| `evidence-backed` | fresh succeeded run，有通过证据且无 evidence gap | Evidence-backed completion |
| `needs-review` | failed / degraded / cancelled / awaiting approval / next action required | Needs review |
| `insufficient-evidence` | evidence 为 `not_checked` 或 `insufficient_evidence` | Not enough evidence to mark this run successful |
| `replay-only` | `freshExecution=false` | Replay result, not a fresh execution |
| `not-checked` | 没有证据且没有更强失败状态 | Not checked |

规则：

- trust label 不能来自 `finalResponse`。
- empty evidence 不能显示成成功。
- replay-only 不能伪装 fresh execution。
- failure、approval denied、budget exhausted、schema warning 有 next action 时必须优先显示 needs-review。

### 3.3 Run Queue Buckets

Run Queue 必须至少分出：

1. Needs Action；
2. Failed / Degraded；
3. Awaiting Approval；
4. Replay / Eval；
5. Recent Succeeded。

每个 run row 至少展示 run id、short title、status、createdAt / duration、profile / workflow、risk、evidence summary、replay badge、needs-action badge 和 trust label。

### 3.4 七类页面预期

| Fixture | 页面预期 |
|---|---|
| succeeded run | 显示 `evidence-backed`，保留 proof boundary，不能宣称 production health |
| failed assertion run | 显示 `needs-review`、failure code、blocking evidence、next action |
| approval denied run | 显示 approval requested / denied，工具 denied 不得显示 succeeded |
| replay run | 显示 `replay-only`、`freshExecution=false`、replay source / latest report |
| insufficient evidence run | 显示 `insufficient-evidence`，不得把 final text 当完成证据 |
| no-op automation run | 显示 scope 与 `doesNotProve`，不得显示系统健康 |
| parent workflow with child run | parent exit reason 优先，child success 不覆盖 parent failure |

## 4. Trajectory Replay

Replay 必须：

- 明确标记 `Replay`。
- 保留原始事件顺序和 duration。
- 支持 re-score，但不声称 fresh execution。
- 对 missing trajectory / invalid schema / unknown event 给出降级状态。

## 5. Eval Dashboard

必须避免混淆：

- eval pass ≠ profile match。
- profile accuracy ≠ task success。
- tool attempted ≠ tool succeeded。
- checkpoint passed ≠ final text says success。
- failure code count 可大于 failed case count。

## 6. Config Center

要求：

- provider-neutral：OpenAI-compatible / Anthropic-compatible。
- source-aware：env/file/default/missing。
- raw secret never rendered。
- doctor offline 默认无网络。
- online doctor 需要显式动作。

## 7. Skill Library

展示：

- skill status。
- trigger conditions。
- recent match history。
- learning notes。
- eval coverage。
- deprecated/quarantined reason。

## 8. 视觉原则

- 明亮、克制、信息密度优先。
- neutral base，blue / green / amber / red 分别用于导航、成功、等待/预算、失败/风险。
- 避免紫色、黑色玻璃、AI sparkle、装饰性渐变背景和单一暖色主题。
- 失败、升级、未验证不能视觉上像成功。
- 所有状态颜色必须有文字标签。

## 9. 验收标准

- 用户能从一个 run 看出：选了什么 profile、用了什么 skill、做了什么 tool、证据是什么、为什么结束。
- Replay 与 live execution 明确区分。
- Secret-like 字段递归脱敏。
- 100 iterations / 500 tool events / 50 checkpoints 的 run 可在 1 秒级渲染，长 payload 截断但 inspector 可查看脱敏详情。
- 空状态教育用户 KeiGent 的 loop/profile/evidence 模型。
