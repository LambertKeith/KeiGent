# KeiGent Design Documents

| 状态 | 文档 | 用途 |
|---|---|---|
| 事实源 | [00 System Overview](00-system-overview.md) | 系统总览与架构图 |
| 事实源 | [01 Architecture](01-architecture.md) | 当前 runtime 架构、模块边界、验收命令 |
| 实现说明 | [02 Conversational Fallback](02-conversational-fallback.md) | 对话兜底与分类误判修复 |
| 实现说明 | [03 Eval Harness](03-eval-harness.md) | Eval Harness、replay、orchestrator eval 验收 |
| 设计蓝图 | [04 Web Conversation Panel](04-web-conversation-panel.md) | Web 对话面板视图设计 |
| 设计蓝图 | [05 Web Dashboard](05-web-dashboard.md) | Web eval dashboard 视图设计 |
| 实现说明 | [06 CLI Config and Web Config](06-cli-config-and-web-config.md) | 配置、doctor、redaction、provider-neutral 边界 |
| 实现说明 | [07 Workflow Run Envelope](07-workflow-run-envelope.md) | Workflow parent envelope 与 child evidence |
| 事实源 | [08 Success Evidence Model](08-success-evidence-model.md) | SuccessDef、Assertion、Evidence 成功证据模型 |
| 事实源 | [09 Permission Risk Governance](09-permission-risk-governance.md) | 权限、风险、人类审批治理 |
| 产品语义 | [10 Workflow Modes Product Semantics](10-workflow-modes-product-semantics.md) | Workflow modes 的产品语义和非目标 |
| 事实源 | [11 Skill Lifecycle and Governance](11-skill-lifecycle-and-governance.md) | Skill 状态、学习、晋升与隔离 |
| 事实源 | [12 Agent Debuggability](12-agent-debuggability.md) | Trajectory、debug timeline、解释事实源 |
| 事实源 | [13 Failure Recovery Semantics](13-failure-recovery-semantics.md) | Failure code、recovery、exit semantics |
| 事实源 | [14 Worktree Isolation and Parallel Runs](14-worktree-isolation-and-parallel-runs.md) | child workspace 隔离、artifact 回收、冲突检测与 cleanup 语义 |
