# P1-05 CLI Runs Replay Handoff Design

## Backlog Item

- 编号：P1-05
- 开发包：CLI Operator Ergonomics
- 目标：让本地 operator 不必理解 run store 内部结构，也能安全地从 `runs replay` 拿到可复制命令和 replay proof boundary。
- 非目标：不执行 replay、不启动 Workbench、不实现交互式 TUI、不改变 run store 默认位置。

## Current Baseline

当前 CLI 已有：

- `runs list`：human 默认输出和 `--json|--compact`。
- `runs show <run-id>`：human 默认输出 failure code、blocking evidence、next action、Workbench link。
- `runs open <run-id>`：输出 Workbench Run Detail URL。
- `runs replay <run-id>`：读取 RunRecord replay metadata 并输出 replay command。
- `runs triage` 与 `runs debug-bundle`。
- `packages/cli/bin/keigent.mjs` 正式 bin shim。

## Gap

`runs replay <run-id>` 默认 human 输出目前只打印一条 replay command。它缺少 operator 复盘时必须看到的边界：

- replay 是 historical replay，不是 fresh execution；
- replay handoff 不证明当前外部系统状态或原始任务成功；
- 带空格的 trajectory path 需要可直接复制执行的 shell-safe command；
- `--compact` 输出需要把 proof boundary 字段结构化带出。

## Requirements

1. human 默认输出必须包含：
   - `Run: <id>`
   - `Replay command: <command>`
   - `Trajectory: <path>`
   - `Fresh execution: false`
   - `Does not prove: Historical replay does not prove fresh execution.`
   - `Next action: Run the replay command, then inspect the replay report before accepting the result.`
2. `--json|--compact` 输出必须包含：
   - `runId`
   - `trajectoryPath`
   - `command`
   - `freshExecution: false`
   - `doesNotProve`
   - `nextAction`
3. replay command 必须 shell-safe quote trajectory path，路径含空格或单引号时仍可复制。
4. 不改变 `runs replay` 的行为边界：本命令只打印 handoff，不执行 replay。
5. replay 不支持时继续明确失败，不生成伪命令。

## Tests

- `packages/cli/src/__tests__/runs-commands.test.ts`
  - human `runs replay <run-id>` 输出 replay command、trajectory、fresh boundary、does-not-prove 和 next action。
  - `runs replay <run-id> --compact` 输出结构化 proof boundary。
  - trajectory path 含空格时 command 使用 shell-safe quoting。

## Proof Boundary

本包证明：

- operator 可以从 `runs replay` 默认输出直接复制 replay command。
- CLI 明确表达 replay 不是 fresh execution。
- machine-readable 输出带出相同边界。

本包不证明：

- replay command 已被执行。
- replay 结果通过。
- 当前外部系统状态与历史 run 一致。
