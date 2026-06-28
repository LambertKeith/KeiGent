# Web Chat-First Final Acceptance Report

> 状态：P0 已实现验收记录
>
> 日期：2026-06-24

## 1. 验收范围

本报告验收 Web P0 重构：默认交互从审计控制台改为 Chat-first Agent Workbench，同时保留 Runs / Skills / Settings 中的审计、治理和配置入口。

不把 P0 解释为完整商业化 Web 产品；Web 内 approve/deny、大型框架迁移、完整自动化 E2E 仍属后续阶段。

## 2. 需求与评审证据

| 要求 | 证据 |
|---|---|
| 先做需求分析 | `doc/product/14-web-chat-first-workbench-requirements.md` |
| 组织 agent team 评审 | `doc/product/web-chat-first/agent-team-review-report.md` |
| 编写开发规范 | `doc/product/web-chat-first/development-spec.md` |
| 编写验收规范 | `doc/product/web-chat-first/acceptance-spec.md` |
| 编写测试用例 | `doc/product/web-chat-first/test-cases.md` |
| 前端 skill 项目内安装 | `.codex/skills/frontend-design/SKILL.md` |

## 3. 产品验收矩阵

| 验收项 | 结果 | 证据 |
|---|---|---|
| 默认入口是 Chat | 通过 | `parseHashRoute("") -> chat`，浏览器 `/` 到 `#chat` |
| 主导航是 Chat / Runs / Skills / Settings | 通过 | `packages/web/src/app/nav.ts` 与 nav tests |
| 旧链接兼容 | 通过 | `#conversation -> chat`，`#config/#dashboard/#eval/... -> settings` |
| Chat 首屏有任务输入和 Run | 通过 | `chat-workbench.test.ts` 与浏览器检查 |
| Chat 默认不暴露 raw inspector | 通过 | `chat-workbench.test.ts`，grep 检查无 `raw-inspector` |
| API 状态可信 | 通过 | `fetchHealth` 调用 `/api/health`；health 失败时 Chat/Settings 不显示 connected |
| 完成态保留 Run Detail 入口 | 通过 | `run_finished(recordId)` audit handoff tests |
| Final text 不替代 evidence | 通过 | Chat 使用 RunRecord evidence；insufficient evidence 降级为 Needs review |
| 审计能力仍可达 | 通过 | Runs detail 仍渲染 Evidence / Risk / Replay / Raw redacted record |
| 移动端基础适配 | 通过，仍需真实设备/完整 Playwright 复核 | 已补 `viewport` meta 与入口测试；应用内浏览器视口 override 未产生 390 CSS px，但当前视口无水平溢出 |

## 4. 验证命令

最终验收以以下命令为准：

```bash
corepack pnpm --filter @keigent/web check
corepack pnpm --filter @keigent/web test
corepack pnpm --filter @keigent/cli exec vitest run src/__tests__/web-api-server.test.ts src/__tests__/web-command.test.ts
corepack pnpm -r --if-present build
git diff --check
```

## 5. 后续非 P0

- Web 内 approve / deny 审批操作。
- Settings 内在线 doctor 主动触发。
- 真正持久化的 Web session/thread。
- Playwright 全自动浏览器回归。
