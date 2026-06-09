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

## 2. Run Console

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

## 3. Trajectory Replay

Replay 必须：

- 明确标记 `Replay`。
- 保留原始事件顺序和 duration。
- 支持 re-score，但不声称 fresh execution。
- 对 missing trajectory / invalid schema / unknown event 给出降级状态。

## 4. Eval Dashboard

必须避免混淆：

- eval pass ≠ profile match。
- profile accuracy ≠ task success。
- tool attempted ≠ tool succeeded。
- checkpoint passed ≠ final text says success。
- failure code count 可大于 failed case count。

## 5. Config Center

要求：

- provider-neutral：OpenAI-compatible / Anthropic-compatible。
- source-aware：env/file/default/missing。
- raw secret never rendered。
- doctor offline 默认无网络。
- online doctor 需要显式动作。

## 6. Skill Library

展示：

- skill status。
- trigger conditions。
- recent match history。
- learning notes。
- eval coverage。
- deprecated/quarantined reason。

## 7. 视觉原则

- 温暖、明亮、低饱和。
- cream/ivory base，apricot/mint/soft sky accent。
- 避免紫色、冷蓝、黑色玻璃、AI sparkle、咖啡棕。
- 失败、升级、未验证不能视觉上像成功。
- 所有状态颜色必须有文字标签。

## 8. 验收标准

- 用户能从一个 run 看出：选了什么 profile、用了什么 skill、做了什么 tool、证据是什么、为什么结束。
- Replay 与 live execution 明确区分。
- Secret-like 字段递归脱敏。
- 100 iterations / 500 tool events / 50 checkpoints 的 run 可在 1 秒级渲染，长 payload 截断但 inspector 可查看脱敏详情。
- 空状态教育用户 KeiGent 的 loop/profile/evidence 模型。
