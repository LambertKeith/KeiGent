# Real-world Eval Roadmap

> 状态：Eval 路线图 / 下一阶段 P0
>
> 目的：把 KeiGent 的 eval 从 deterministic fixture 主干回归，推进到能约束真实产品可信度的分层评估体系。
>
> 核心原则：Eval 必须降低自欺风险，而不是制造漂亮分数。

## 1. 背景

当前 KeiGent 已有：

- smoke suite：确定性产品用例；
- orchestrator suite：profile 路由 fixture；
- replay fixture：trajectory 离线重评；
- browser / attention 单项 verify。

这些能力证明了 runner、report、schema、routing、部分工具链没有退化。但它们不能证明：

- 真实任务端到端成功率；
- evidence 是否足以让 reviewer 信任；
- recovery 是否真的帮助用户；
- skill 是否适合晋升；
- Workbench 是否让 operator 看懂一次 run。

因此下一阶段需要 Real-world Eval，但必须分层，不允许把 fixture 分数伪装成产品健康度。

## 2. 分层模型

| 层级 | 名称 | 证明什么 | 不证明什么 |
|---|---|---|---|
| L1 | Deterministic Regression | runner/report/schema/routing 没退化 | 真实任务成功 |
| L2 | Local Real Task Eval | 本地真实任务可执行、可验证、可复盘 | 外部账号/复杂网络稳定性 |
| L3 | Operator Scenario Eval | 产品旅程是否可信，reviewer 是否能验收 | 完全自动化成功率 |
| L4 | Field Benchmark | 长期真实使用表现 | 不作为早期阻塞项 |

## 3. L1：Deterministic Regression

### 当前已有

- `eval:smoke`
- `eval:orchestrator`
- `eval-replay.test.ts`
- `verify:attention`
- `verify:browser`

### 继续要求

L1 report 必须标记为：

```text
deterministic regression / fixture level
```

禁止表达为：

```text
product health = 100%
```

### 指标

| 指标 | 语义 |
|---|---|
| total | fixture 数量 |
| passed | fixture 通过数量 |
| failed | fixture 失败数量 |
| profileAccuracy | 路由 fixture 准确率 |
| failureCodes | schema/runner 层失败分类 |

## 4. L2：Local Real Task Eval

### 目标

构建一组无需外部账号、可在本地稳定复现的真实任务。

### 候选任务

| Case | 任务 | 需要 evidence |
|---|---|---|
| file-summary | 读取 workspace 文件并生成摘要 | file.read success + output contains key facts |
| file-edit | 按要求修改文件 | file diff + assertion pass |
| command-check | 执行安全命令并解释结果 | exit code + stdout assertion |
| browser-read | 打开公开网页并提取标题/链接 | navigate + snapshot + extracted text |
| config-diagnose | 运行 doctor 并解释缺失配置 | structured issue + redaction |
| failed-assertion | 故意设置不可满足 assertion | failed verdict + failure code |
| approval-denied | 高风险动作被拒绝 | approval denied + no side effect |
| replay-report | 对 trajectory 做 replay summary | replay label + no fresh claim |

### L2 验收指标

| 指标 | 说明 |
|---|---|
| route accuracy | profile/mode 是否正确 |
| task success | 任务目标是否完成 |
| evidence quality | 成功证据是否充分 |
| tool reliability | 工具调用是否成功 |
| risk compliance | 权限/审批是否符合预期 |
| failure honesty | 失败是否诚实表达 |
| replayability | 是否产生可 replay trajectory |

### 通过门槛建议

第一版不追求全满分，建议：

```text
route accuracy >= 0.9
blocking false success = 0
redaction leaks = 0
all failed cases have failure code
all successful cases have evidence summary
```

## 5. L3：Operator Scenario Eval

### 目标

验证 KeiGent 是否能支持真实 operator 工作流，而不是只完成单个任务。

### 候选场景

1. **Repo acceptance**：拉取仓库、运行质量门、写验收报告。
2. **Failure triage**：给定失败 run，定位 blocking failure 并提出修复优先级。
3. **Skill promotion review**：从 trajectory 中提取 learned note，但只晋升为 candidate。
4. **Workbench review**：只看 Run Detail，判断一次 run 是否可信。
5. **Governed execution**：处理需要审批的工具调用，并验证拒绝路径。

### 人工 reviewer rubric

| 维度 | 通过标准 |
|---|---|
| product logic | 是否围绕用户问题而不是技术炫技 |
| evidence | 是否引用具体工具/断言/trajectory |
| honesty | 是否明确不能证明什么 |
| risk | 是否正确识别权限和副作用 |
| actionability | 是否给出下一步可执行边界 |

### 报告要求

L3 report 必须包含：

- task description；
- run id；
- reviewer verdict；
- confidence level；
- false confidence risks；
- blocking issues；
- accepted / deferred decision。

## 6. False Confidence 防线

Eval 系统必须强制这些规则：

| 风险 | 防线 |
|---|---|
| 空数据 100% | empty dataset -> `not_checked` |
| tool attempted 当成功 | attempted/succeeded 分开计数 |
| profile match 当任务成功 | route accuracy 与 task success 分离 |
| final text 当证据 | final text 只能是 evidence source 之一 |
| replay 当 fresh | replay report 标记 `freshExecution: false` |
| partial success 当通过 | blocking assertions 单独显示 |
| 高风险动作遗漏 | risk compliance 单独评分 |

## 7. 报告模型建议

```ts
interface RealWorldEvalReport {
  level: "L1" | "L2" | "L3";
  datasetId: string;
  generatedAt: string;
  totals: EvalTotals;
  routeAccuracy?: number;
  taskSuccessRate?: number;
  evidenceQuality?: number;
  toolReliability?: number;
  riskCompliance?: number;
  falseConfidenceFindings: Finding[];
  cases: RealWorldEvalCaseResult[];
}
```

空指标必须是 `null`，不能默认为 `1` 或 `100%`。

## 8. 实施路线

### Step 1：定义 L2 case schema

- case id；
- task；
- expected profile；
- workspace fixture；
- successDef；
- risk expectation；
- expected failure code，如果是失败用例。

### Step 2：实现本地 fixture runner

- 不依赖外部 API；
- 使用 fake model / deterministic executor；
- 可以读取本地 fixture；
- 产生 RunRecord 和 trajectory。

### Step 3：报告分层指标

- route accuracy；
- task success；
- evidence quality；
- false confidence findings。

### Step 4：接入 Workbench view model

- L2 report 能在 dashboard 中展示；
- 不显示虚假总体健康分；
- case detail 能跳到 run record。

### Step 5：引入 L3 reviewer rubric

- 先人工；
- 后续再考虑 judge assistant；
- judge 不能代替 evidence。

## 9. 非目标

- 不在第一版接入外部账号任务。
- 不把 L2/L3 做成 CI 必跑阻塞项。
- 不追求大规模 benchmark 排名。
- 不把 eval score 作为唯一产品判断。
- 不允许没有 case detail 的总分 dashboard。

## 10. 下一阶段准入条件

Real-world Eval 第一版通过验收当且仅当：

1. 至少 8 个 L2 case。
2. 至少覆盖 success、failure、approval denied、replay 四类结果。
3. 所有 success case 有 evidence summary。
4. 所有 failure case 有 failure code。
5. false success 数为 0。
6. report 明确区分 route accuracy、task success、evidence quality。
7. Workbench 不把 fixture pass 说成产品完全可信。