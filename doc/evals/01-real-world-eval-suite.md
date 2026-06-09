# Real-world Eval Suite Blueprint

> 目标：让 KeiGent 的 eval 不只证明 harness 没坏，还证明路由、证据、权限、workflow 在真实任务压力下不自欺。

## 1. Eval 分层

| 层 | 名称 | 证明什么 | 不证明什么 |
|---|---|---|---|
| L0 | Harness correctness | runner/report/failure code 正确 | agent 能力 |
| L1 | Routing correctness | task -> profile/mode/risk 正确 | 任务执行成功 |
| L2 | Tool semantics | file/shell/browser/http/memory 工具边界 | 业务成功 |
| L3 | Evidence semantics | assertions/checkpoints/verdict 防假成功 | 模型质量 |
| L4 | Realistic task suites | 代表性场景端到端行为 | 所有真实网站稳定 |
| L5 | Regression benchmark | baseline vs candidate 退化 | 绝对产品质量 |

## 2. 最小规模目标

- ≥ 50 个 deterministic cases。
- ≥ 20 个 replay-based cases。
- ≥ 10 个 browser realistic cases。
- ≥ 10 个 permission/risk cases。
- ≥ 5 个 workflow evidence cases。

## 3. Case Schema

```ts
interface ProductEvalCase {
  id: string;
  category: string;
  input: string;
  expectedProfile?: string;
  expectedWorkflowMode?: string;
  riskLevel?: string;
  successDef?: unknown;
  requiredEvidence: string[];
  forbiddenClaims: string[];
  proves: string;
  doesNotProve: string;
}
```

## 4. 必测类别

1. Conversational：问候、能力询问、澄清。
2. Research：开放调研、来源要求、边界说明。
3. File：写入、读取、路径逃逸拒绝、hash evidence。
4. Shell：成功、失败、timeout、abort。
5. Browser：snapshot/ref/click、form、download、DOM evidence。
6. Config：missing key、env override、redaction、doctor offline。
7. Permission：R3/R5 approval、non-interactive deny。
8. Workflow：verified success、verified failure、child error、timeout。
9. Skill：正确匹配、误触发防回归、deprecated 不注入。
10. Dashboard model：空报告、unknown code、failure count semantics。

## 5. 质量门

核心分支合并前至少运行：

```bash
corepack pnpm --filter @keigent/engine eval:smoke
corepack pnpm --filter @keigent/engine eval:orchestrator
corepack pnpm --filter @keigent/engine test
corepack pnpm --filter @keigent/cli test
corepack pnpm -r check
```

真实浏览器 suite 可作为 nightly/local extended gate。

## 6. 验收标准

- 每个 case 说明 proves / doesNotProve。
- eval report machine-readable。
- dashboard 不对 invalid/empty report 渲染权威指标。
- baseline comparison 用 case.id，不用数组 index。
- 新增 feature 至少新增或更新相关 eval case。
