# KeiGent Eval Documents

| 状态 | 文档 | 用途 |
|---|---|---|
| 设计蓝图 | [01 Real-world Eval Suite](01-real-world-eval-suite.md) | 真实世界 eval/benchmark 的目标、边界与准入计划 |
| 验收报告 | [02 Main Acceptance Report](02-main-acceptance-report.md) | main 分支产品、架构、工程质量验收意见 |
| Eval 路线图 | [03 Real-world Eval Roadmap](03-real-world-eval-roadmap.md) | 下一阶段 P0：L1/L2/L3 分层 eval、false confidence 防线与准入条件 |

当前本地 L2 fixture 基线入口：

```bash
corepack pnpm --filter @keigent/engine eval:real-world -- --compact
corepack pnpm --filter @keigent/cli start eval real-world --compact
```
