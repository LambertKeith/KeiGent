# Permission, Risk, and Human Approval Governance

> 目标：定义 KeiGent 执行能力的权限、风险、人类审批与 workflow 隔离规则。

## 1. 风险等级

| 等级 | 名称 | 示例 | 默认策略 |
|---|---|---|---|
| R0 | Read-only | read file、snapshot、memory recall | allow |
| R1 | Workspace write | 写入 workspace 内文件 | allow/notify |
| R2 | Local execute | shell、package manager、test | ask once 或 policy allow |
| R3 | Network side effect | HTTP POST、上传、发请求 | ask per scope |
| R4 | Credential/Auth | 修改 key、登录、token | explicit approval |
| R5 | Destructive/External irreversible | 删除、支付、发布、发消息 | explicit human approval，non-interactive deny |

## 2. Tool 权限映射

每个 tool 必须声明：

```ts
{
  permission: "readonly" | "write" | "execute" | "dangerous";
  riskLevel: "R0" | "R1" | "R2" | "R3" | "R4" | "R5";
  sideEffect: "none" | "local" | "external";
  reversible: boolean;
}
```

## 3. 审批 Prompt 要求

审批提示必须包含：

1. 将执行的动作。
2. 目标资源。
3. 风险等级。
4. 是否可回滚。
5. 需要的证据。
6. 是否会暴露 secret。
7. 允许范围与次数。

禁止只问“是否允许 tool_call”。

## 4. Non-interactive 模式

- R0 可自动执行。
- R1 可在 workspace policy 允许时执行。
- R2 需要显式 CLI/config policy。
- R3-R5 默认拒绝，除非调用方提供预授权 policy。
- `ask_user` 不可用时，必须返回 structured degradation，而不是挂起。

## 5. Workflow Policy

| 规则 | 要求 |
|---|---|
| Parent cap | child 权限不能超过 parent maxPermission |
| Verifier cap | verifier 默认 readonly |
| Untrusted input | 读取外部网页/文档的 child 不得持有 dangerous tools |
| Approval inheritance | parent approval 只能继承到同 scope，不可泛化 |
| Evidence | 每次 approval 进入 workflow trajectory |

## 6. Quarantine 原则

处理不可信输入的 agent：

- 可读网页/文件内容。
- 可生成总结/建议。
- 不可直接写入敏感配置。
- 不可发送消息、发布内容、执行 destructive shell。
- 如需副作用，必须把建议交给受信执行 child，并重新做 policy check。

## 7. 验收标准

- 每个工具都有 permission + riskLevel。
- R3-R5 没有审批不能执行。
- non-interactive 不会执行需要人类确认的危险动作。
- verifier 默认无写权限和外部副作用权限。
- trajectory 记录 approval prompt、decision、scope、time。
- redaction 覆盖 approval、tool args、inspector JSON。
