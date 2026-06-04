# KeiGent Eval Harness 开发文档与验收标准

> 状态：v0.1，下一阶段开发基线  
> 目标：把 KeiGent 从“架构闭环 demo”推进到“可度量、可回归、可解释的 agent loop 框架”。

---

## 1. 背景

KeiGent 的核心命题不是“再写一个 agent”，而是验证：

> 同一个 LoopEngine 通过不同 LoopProfile 消费 skill，会在调研、执行、验证执行等场景下表现出可控差异。

当前项目已经具备：

- Orchestrator：规则分类 + LLM 分类兜底；
- LoopEngine：统一循环骨架；
- 多 profile：`conversational` / `divergent-research` / `convergent-exec` / `convergent-verified`；
- ToolRegistry：浏览器、文件、shell、http、memory、ask_user、computer 工具；
- Trajectory：记录工具调用、文本、checkpoint、verdict；
- CLI：对话式 REPL 和单次执行。

下一步必须补上“工程化验收层”：稳定回答以下问题：

1. 这个任务为什么选这个 profile？
2. 是否选对？
3. 做没做成？
4. 验证证据是什么？
5. 失败发生在分类、工具、checkpoint、裁判，还是输出质量？

---

## 2. 设计原则

### 2.1 Eval Harness 是测试层，不是新 loop

Eval Harness 不新增 agent 行为，不绕开 Orchestrator，也不改变 LoopEngine。它只负责：

- 定义任务集；
- 运行任务；
- 收集事件与 trajectory；
- 根据验收规则评分；
- 输出报告。

### 2.2 首先支持无 LLM 的确定性 smoke eval

真实 LLM/browser eval 成本高、慢、偶发不稳定。因此第一版必须支持注入 executor，先验证 runner/report 本身：

- 不调 LLM；
- 不打开真实浏览器；
- 用 fake executor 返回固定 LoopResult；
- 单元测试覆盖汇总、失败分类、profile accuracy、工具/checkpoint 统计。

### 2.3 再接真实 Orchestrator + LoopEngine

在 runner 自身可测后，再提供真实执行入口：

- Orchestrator 自动选 profile；
- LoopEngine 执行；
- ProgressEvent 收集工具调用、checkpoint、verdict；
- 输出 JSON 报告。

### 2.4 报告必须机器可读

后续可以把 eval 纳入 CI 或人工比较不同 profile 变更，因此报告应稳定：

```ts
interface EvalReport {
  startedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  profileAccuracy: number | null;
  failuresByCode: Partial<Record<EvalFailureCode, number>>;
  cases: EvalCaseResult[];
}
```

---

## 3. 第一版范围

### 3.1 文件位置

```text
packages/engine/src/evals/types.ts
packages/engine/src/evals/cases.ts
packages/engine/src/evals/runner.ts
packages/engine/src/evals/engine-executor.ts
packages/engine/src/evals/replay.ts
packages/engine/src/evals/cli-options.ts
packages/engine/src/evals/orchestrator-eval.ts
packages/engine/src/evals/orchestrator-cli.ts
packages/engine/src/evals/cli.ts
packages/engine/src/evals/index.ts
packages/engine/src/__tests__/eval-runner.test.ts
packages/engine/src/__tests__/engine-eval-executor.test.ts
packages/engine/src/__tests__/eval-replay.test.ts
packages/engine/src/__tests__/eval-cli-options.test.ts
doc/design/03-eval-harness.md
```

### 3.2 EvalCase

```ts
interface EvalCase {
  id: string;
  title: string;
  category: "conversational" | "research" | "verified-exec" | "tool-smoke";
  task: Task;
  expectedProfile?: ProfileName;
  acceptance: {
    exitReasons?: ExitReason[];
    minCheckpoints?: number;
    requiredTools?: string[];
    forbiddenTools?: string[];
    finalResponseIncludes?: string[];
  };
  timeoutMs?: number;
}
```

### 3.3 EvalCaseResult

```ts
interface EvalCaseResult {
  id: string;
  title: string;
  category: EvalCase["category"];
  passed: boolean;
  selectedProfile?: ProfileName;
  expectedProfile?: ProfileName;
  profileMatched: boolean | null;
  exitReason: ExitReason;
  iterations: number;
  checkpointsPassed: number;
  totalToolCalls: number;
  toolsUsed: string[];
  successfulToolsUsed: string[];
  durationMs: number;
  failures: string[];
  failureCodes: EvalFailureCode[];
  finalResponse: string;
}
```

---

## 4. 验收标准

### P0：Runner 单元测试

必须满足：

1. 能用 fake executor 跑多个 EvalCase；
2. 能正确统计 `total/passed/failed`；
3. 能计算 `profileAccuracy`；
4. 能根据 `requiredTools` / `forbiddenTools` 判定失败，其中 `requiredTools` 必须至少有一次成功调用；
5. 能根据 `minCheckpoints` 判定失败；
6. 能根据 `finalResponseIncludes` 判定失败；
7. 单个 case 失败不影响后续 case 执行；
8. `timeoutMs` 必须被执行，单个超时 case 不得阻塞后续 case；
9. 失败必须包含机器可读 `failureCodes`，报告汇总 `failuresByCode`。

### P0：公共 API

`@keigent/engine` 必须导出：

- `runEvalCases`
- `buildEvalReport`
- `DEFAULT_EVAL_CASES`
- 相关类型

### P0：CLI Smoke

必须新增脚本：

```bash
corepack pnpm --filter @keigent/engine eval:smoke
```

验收：

- 不需要真实 LLM API key；
- 输出 JSON 报告；
- 默认 smoke cases 全部通过。

### P1：真实执行入口预留

第一版可以不在 CI 中跑真实 LLM，但类型和接口要为真实 executor 留好位置：

```ts
createEngineEvalExecutor(...): EvalExecutor
```

验收：编译通过，且不会影响 smoke eval。

### P1：Trajectory Replay

为了让已保存 trajectory 能被离线复评，必须提供 replay executor 和 CLI 模式：

```bash
corepack pnpm --filter @keigent/engine eval:replay -- --trajectory smoke-tool-file-write=/path/to/trajectory.json
```

验收：

- 能从内存 trajectory 派生 `LoopResult`；
- 能从 JSON 文件加载 trajectory；
- 能统计成功工具、checkpoint、iterations；
- 缺失 case mapping 时作为单 case executor failure 进入报告；
- CLI replay 模式只运行有 mapping 的 case，避免默认套件中未提供 trajectory 的 case 干扰验证。

### P1：Orchestrator Eval Matrix

Profile 选择是 KeiGent 的核心产品行为，必须有独立于 LLM/LoopEngine 的零成本回归套件：

```bash
corepack pnpm --filter @keigent/engine eval:orchestrator
```

验收：

- 至少 12 个默认 fixture 覆盖中英文闲聊、successDef、研究词、URL 执行、显式 profile、skill match；
- 报告包含 `selectedProfile`、`unguardedProfile`、`ruleId`、`rationale`、`signals`、`guardApplied`；
- 规则分类能解释为什么选择该 profile；
- guard correction 在报告里可见；
- 默认矩阵必须 100% 通过，避免 profile 选择规则静默退化。

---

## 5. 实施计划

### Task 1：写 failing tests

新增 `eval-runner.test.ts`，先测试：

- 成功 case 汇总；
- profile mismatch；
- missing required tool；
- forbidden tool used；
- missing checkpoint；
- response missing expected text。

### Task 2：实现类型与报告构建

新增 `evals/types.ts` 和 `evals/runner.ts`，只实现 fake executor 所需的纯函数。

### Task 3：新增默认 smoke cases

新增 `evals/cases.ts`，覆盖：

- conversational；
- divergent research；
- verified exec；
- tool smoke。

### Task 4：新增 CLI smoke runner

新增 `evals/cli.ts`，输出 JSON。

### Task 5：导出 API 与 package script

修改：

- `src/lib.ts`
- `package.json`

### Task 6：自我验收

运行：

```bash
corepack pnpm --filter @keigent/engine exec vitest run src/__tests__/eval-runner.test.ts
corepack pnpm --filter @keigent/engine exec tsc --noEmit
corepack pnpm --filter @keigent/engine exec vitest run
corepack pnpm --filter @keigent/engine eval:smoke
```

---

## 6. 非目标

第一版不做：

- GUI dashboard；
- 大规模 benchmark；
- 对真实网页结果的稳定性承诺；
- 新增 profile；
- 修改 LoopEngine 核心循环。

这些应在 Eval Harness 自身稳定后再做。
