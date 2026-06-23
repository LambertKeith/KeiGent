# P2-02 L3 Operator Scenario Eval Audit Design

## Backlog Item

- 编号：P2-02
- 开发包：L3 Operator Scenario Eval
- 目标：让 KeiGent 具备可复盘的 operator journey 验收 fixture、human acceptance packet 和 sign-off validation，同时不把 fixture 或自动校验伪装成真人审证。
- 非目标：不引入自动 judge 替代人类 reviewer；不宣称生产健康；不把 packet 生成等同于人工接受；不扩大外部写能力。

## Current Baseline

当前实现已经包含 P2-02 的核心能力：

- `DEFAULT_OPERATOR_L3_CASES` 覆盖七个 operator journey：
  - repo acceptance
  - failure triage
  - skill promotion review
  - Workbench review
  - governed execution
  - automation no-op review
  - connector readonly review
- `runOperatorScenarioEvalCases` 生成 L3 fixture report，包含 `accepted` / `deferred` / `rejected`、confidence、false-confidence risks、blocking issues、next actions、evidence links 和 proof boundary。
- `formatOperatorAcceptancePacket` 输出人工 reviewer packet，包含 proof boundary、manual sign-off checklist、evidence inspected、override reason、next actions 与 false-confidence risk checklist。
- `buildOperatorAcceptanceRecord` 校验 human sign-off JSON，输出 `operator-human-acceptance` 结构化记录。
- sign-off validation 在缺少 evidence inspected、false-confidence risk acceptance、override reason 或 case sign-off 时不得 accepted。
- CLI 暴露：
  - `eval operator --compact`
  - `eval operator --packet`
  - `eval operator --acceptance <signoff.json> --compact`

## Requirements

1. L3 fixture 必须覆盖七个 backlog 指定 operator journey。
2. fixture report 必须输出：
   - `level: "L3"`
   - `datasetId: "operator-scenario-v1"`
   - decisions counts
   - average confidence
   - false-confidence risk count
   - findings
   - per-case evidence links
   - proof boundary
3. fixture report 的 `healthClaim` 必须说明它不是 autonomous product certification。
4. packet 输出必须明确 fixture results are not human acceptance。
5. packet 必须包含 manual sign-off checklist，并显式要求 evidence inspected、override reason、next actions 和 false-confidence risk acceptance。
6. sign-off validation 必须输出 `operator-human-acceptance` record。
7. sign-off validation 必须阻止以下 false acceptance：
   - missing reviewer
   - invalid reviewedAt
   - missing case sign-off
   - evidence not inspected
   - false-confidence risk not accepted or mitigated
   - human decision overrides fixture/expected decision without override reason
   - human blocking issue present
8. P2-02 验收必须明确未证明内容：真实人工审证、生产健康、live operator readiness、code-owner approval。

## Proof Boundary

本包证明：

- 当前 L3 fixture 覆盖 backlog 指定七个 operator journey。
- fixture report、packet 和 sign-off validation 的边界可审计。
- CLI 可以输出 operator fixture report、human packet 和 structured acceptance record。
- 缺少关键人工审证字段时不会 accepted。

本包不证明：

- 真人已经审查 evidence。
- 生产环境健康。
- 外部系统当前状态。
- 完整 Workbench 已达到真人可接受成熟度。
- code owner 已批准分支。

## Tests

- `packages/engine/src/__tests__/operator-scenario-eval.test.ts`
- `packages/cli/src/__tests__/eval-commands.test.ts`
- `corepack pnpm --filter @keigent/engine eval:operator -- --compact`
- `corepack pnpm --filter @keigent/cli start eval operator --compact`
- `corepack pnpm --filter @keigent/cli start eval operator --packet`

