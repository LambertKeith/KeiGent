# P2-01 Readonly Connector Baseline Audit Design

## Backlog Item

- 编号：P2-01
- 开发包：Readonly Connector Baseline
- 目标：确认 readonly connector 通过 `ToolRegistry` 执行，记录结构化 source evidence，失败具备稳定 failure code，写路径明确 unsupported。
- 非目标：不新增写型 connector；不实现 OAuth/token 账号 connector；不把 connector 返回文本直接当作业务成功证据；不扩大浏览器或 shell 权限。

## Current Baseline

当前实现已经包含 P2-01 的基础能力：

- `git_status`：local git readonly connector，只执行 `git status --short --branch`，source 记录为 workspace path。
- `http_get`：HTTP readonly connector，只允许 GET，不接受 headers/body/method override，source 记录为 response URL。
- `github_repo_read`：GitHub public repo readonly connector，不接受 token/header/body/method，source 记录为 GitHub API URL。
- `web_fetch`、`file_read`、`file_list`、`grep`、`browser_snapshot`、`browser_get_text`、`browser_screenshot` 已返回结构化 `sources`。
- `sourceCollected` assertion 可把 connector source 纳入 deterministic evidence。
- connector 失败使用 `connector_failure=*`，写型参数使用 `write_unsupported=*`，并映射到稳定 failure summary。

## Requirements

1. readonly connector 必须通过 `ToolRegistry` 注册和执行。
2. readonly connector 元数据必须保持：
   - `permission: "readonly"`
   - `riskLevel: "R0"`
   - `sideEffect: "none"`
   - `reversible: true`
   - timeout / output limit 对外可审计
3. readonly connector 执行不得请求 approval。
4. connector 读取成功时必须返回结构化 `sources`。
5. HTTP / GitHub 响应中的 secret 必须先脱敏再进入 tool output。
6. failed connector 必须返回 `connector_failure=*`，不能把失败当空成功。
7. write-like 参数必须返回 `write_unsupported=*`，不能静默降级为 GET 或只读读取。
8. `sourceCollected` assertion 必须能让 verified workflow 把外部 source 作为 evidence。
9. P2-01 验收必须明确未证明内容：外部 source 真实性、长期网络可用性、认证 connector、写型 connector。

## Proof Boundary

本包证明：

- P2-01 当前 readonly connector baseline 仍满足 ToolRegistry、权限、source、redaction、failure code 和 evidence 要求。
- 目标测试覆盖 local git、HTTP、GitHub、file、browser、web readonly source。
- verified workflow 可通过 `sourceCollected` assertion 接受 connector source evidence。

本包不证明：

- 外部系统长期可用。
- 外部 source 内容真实或未过期。
- GitHub/HTTP 认证场景可用。
- 任何外部写操作可执行。
- connector 文本本身等同于用户任务成功。

## Tests

- `packages/engine/src/__tests__/git-tool.test.ts`
- `packages/engine/src/__tests__/http-readonly-tool.test.ts`
- `packages/engine/src/__tests__/github-readonly-tool.test.ts`
- `packages/engine/src/__tests__/readonly-connector-sources.test.ts`
- `packages/engine/src/__tests__/success-evidence.test.ts`
- `packages/engine/src/__tests__/workflow-runner.test.ts`
- `packages/engine/src/__tests__/failures.test.ts`
- `packages/engine/src/__tests__/public-api.test.ts`

