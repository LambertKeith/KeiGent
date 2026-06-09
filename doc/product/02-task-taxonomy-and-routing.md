# Task Taxonomy and Routing Design

> 目标：把用户任务从“自然语言输入”转为产品可解释的 profile / workflow / risk / clarification 决策。

## 1. 路由原则

1. 产品路由优先于模型偏好。
2. 缺少成功定义的精确执行任务应澄清或降级，不应伪装成 verified success。
3. 高风险任务先判权限与审批，再考虑执行。
4. profile guard 是产品安全网，不是分类器失败的遮羞布。
5. non-interactive 模式不能默默等待用户；必须显式降级或失败。

## 2. 任务矩阵

| 类型 | 示例 | 默认 profile | Workflow mode | SuccessDef | 权限 | 交互策略 |
|---|---|---|---|---|---|---|
| 闲聊/能力询问 | 你好；你能做什么 | conversational | single-loop | 不需要 | readonly | 直接回答 |
| 澄清型请求 | 帮我处理一下这个 | conversational | single-loop | 需要补充 | readonly | ask_user |
| 开放研究 | 调研 X 的方案 | divergent-research | single-loop | 弱 | readonly/network | 给来源与边界 |
| 精确文件任务 | 创建/修改/整理文件 | convergent-exec | single-loop | 需要 | write workspace | 低风险可执行 |
| shell/系统任务 | 安装、检查端口、运行测试 | convergent-exec | single-loop | 需要 | execute | 按风险审批 |
| 浏览器操作 | 打开网页并下载报告 | convergent-exec | single/verified | 需要 | browser/write | 关键提交需确认 |
| 难验证操作 | 确认表单提交成功 | convergent-verified | verified-loop | 必须 | browser/network | checkpoint/verdict |
| 高风险外部副作用 | 删除、付款、发消息、发布 | convergent-verified | verified-loop | 必须 | dangerous | human approval |
| 多候选评审 | 两个方案分别评审再综合 | divergent + workflow | reviewed/fanout | rubric | readonly | 有预算上限 |
| 不支持/危险 | 绕过限制、窃取密钥 | reject/escalate | none | 不适用 | deny | 拒绝并解释 |

## 3. 分类信号

| 信号 | 含义 | 影响 |
|---|---|---|
| greeting/capability | 闲聊或能力询问 | conversational |
| broad verbs: 调研/比较/总结 | 开放研究 | divergent-research |
| imperative + concrete object | 精确执行 | convergent-exec |
| explicit success condition | 可进入 verified | convergent-verified / verified-loop |
| destructive verbs | 高风险 | approval / dangerous cap |
| external side effect | 需要审批/审计 | workflow policy |
| missing target/object | 信息不足 | ask_user 或 graceful fail |

## 4. Guard 规则

1. 选中 `convergent-exec` 但没有相关 skill 且没有 successDef：降级到 `divergent-research` 或澄清。
2. 选中 `conversational` 但出现明确写操作意图：重新分类为执行任务。
3. 选中 verified 但没有 assertions：要求补 successDef，不能声称强验证。
4. 需要 dangerous permission 且无审批能力：拒绝执行并说明下一步。

## 5. Fixture 验收集

最小产品路由集应包含不少于 30 个 fixture，覆盖：

- 5 个 conversational
- 5 个 divergent research
- 5 个 convergent file/shell
- 5 个 browser operation
- 5 个 verified/high-risk
- 5 个 unsupported/clarification

每个 fixture 必须声明：

```ts
{
  input: string;
  expectedProfile: string;
  expectedWorkflowMode: string;
  riskLevel: string;
  requiresClarification: boolean;
  requiresApproval: boolean;
  rationaleMustInclude: string[];
}
```

## 6. 验收标准

- profile accuracy 不低于当前 baseline，且 fixture 失败给出具体 rule/rationale。
- 高风险任务不得被归为普通 convergent-exec 自动执行。
- 信息不足任务不得制造虚假 successDef。
- non-interactive ask_user 必须有降级路径。
- routing event 必须记录 ruleId、signals、guardApplied。
