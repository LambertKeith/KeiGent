# Failure and Recovery Semantics

> 目标：统一 KeiGent 的失败分类、用户表达与恢复策略，避免失败被伪装成成功。

## 1. 失败分类

| 类别 | 含义 | 示例 code | 默认恢复 |
|---|---|---|---|
| Input insufficient | 用户目标/对象不足 | missing_target | ask_user / fail gracefully |
| Routing failure | profile/mode 选择错误 | profile_mismatch | guard / eval regression |
| Skill mismatch | 没有合适 skill 或误触发 | skill_missing | divergent fallback / ask_user |
| Permission denied | policy 不允许 | permission_denied | ask approval / stop |
| Tool unavailable | 浏览器、shell、网络不可用 | tool_unavailable | doctor / retry later |
| External failure | 外部系统失败 | network_error/auth_failed | retry/backoff/escalate |
| Verification failure | 操作完成但证据不足 | checkpoint_missing/verified_failure | collect evidence / manual review |
| Budget failure | 轮次、工具、child、超时 | max_iterations/timeout | summarize partial state |
| Model noncompliance | 模型未按协议行动 | malformed_tool/final_missing | retry once / escalate |
| Internal bug | 代码异常 | executor_error/child_error | save trajectory + bug report |

## 2. 用户表达模板

失败回答必须包含：

1. 失败层级。
2. 已经完成的动作。
3. 可能产生的副作用。
4. 缺失的证据或权限。
5. 推荐下一步。
6. 是否保存了 trajectory/report。

## 3. Recovery 策略

| 策略 | 使用条件 | 禁止 |
|---|---|---|
| ask_user | 信息不足且交互可用 | non-interactive 挂起 |
| retry same profile | transient tool/model failure | 无限重试 |
| switch profile | guard 确认误分类 | 随意从 verified 降为普通成功 |
| request successDef | 需要强验证但 assertions 缺失 | 自动编造 assertions |
| escalate human | 高风险/不确定/权限不足 | 当成失败羞耻路径 |
| save diagnostic | bug/verification failure | 当成成功学习样本 |

## 4. Exit Reason 映射

| Exit reason | 用户含义 | 可学习？ |
|---|---|---|
| success | 完成且满足当前验收标准 | 可，需审查 |
| escalated | 需要人类决策 | 可作为边界学习 |
| max_iterations | 预算内未完成 | diagnostic only |
| timeout | 父级超时/取消 | diagnostic only |
| verified_failure | 缺证据或证据失败 | diagnostic only |
| child_error | 子运行异常 | diagnostic only |
| executor_error | harness/runtime 错误 | 不作为 agent 行为学习 |

## 5. 验收标准

- 每个 failure code 有 recommended next action。
- 失败 final response 不得只说“抱歉失败了”。
- 失败 run 不触发成功学习。
- timeout 后 late child success 不覆盖 parent failure。
- recovery attempts 受预算限制并记录在 trajectory。
