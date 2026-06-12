# Skill Governance Product Spec

> 状态：产品规格 / 下一阶段 P0
>
> 目的：把 skill 从“可被读取的知识文件”提升为有来源、有状态、有晋升门槛、有回滚路径的产品资产。
>
> 适用读者：产品负责人、架构师、实现者、验收人、AI 协作者。

## 1. 产品问题

KeiGent 的核心是 skill-driven execution。skill 负责“怎么做”，引擎负责“怎么验”。如果 skill 没有治理，系统会逐渐退化为：

```text
一堆来源不明、适用边界不清、没有 eval 证明、没人敢删也没人敢信的提示词文档。
```

因此，skill governance 不是知识库管理的小功能，而是 KeiGent 的产品可信度核心。

用户需要知道：

| 用户问题 | 治理需求 |
|---|---|
| 这个 skill 为什么会被注入？ | trigger conditions + match rationale |
| 它从哪里来？ | source trajectory / author / promotion record |
| 它可信到什么程度？ | lifecycle status + eval coverage |
| 它适合哪些任务？ | task taxonomy + non-goals |
| 它会带来什么风险？ | risk level + tool permission expectation |
| 它出错时如何处理？ | deprecate / block / rollback |

## 2. Skill 生命周期

建议定义以下状态：

| 状态 | 含义 | 允许注入 | 晋升条件 |
|---|---|---|---|
| `draft` | 人工编写但未验证 | 默认不注入，除非显式 include | 通过格式检查和最小 eval |
| `learned-note-only` | trajectory 产生的学习笔记 | 不注入正式执行 | 人类 review 后转 candidate |
| `candidate` | 候选 skill | 可在实验 profile 或显式任务中注入 | 通过关联 eval + reviewer approval |
| `verified` | 正式 skill | 可参与正常匹配 | 持续 eval 不退化 |
| `deprecated` | 旧 skill，不推荐新任务使用 | 默认不注入 | 无，除非恢复 |
| `blocked` | 有安全/逻辑风险 | 禁止注入 | 需要显式 unblock 审批 |

禁止规则：

- `learned-note-only` 不得自动成为 `verified`。
- 没有 eval coverage 的 skill 不得标为 `verified`。
- 被 `blocked` 的 skill 即使命中关键词也不得注入。
- skill body 不能直接覆盖引擎的 success/evidence 判断。

## 3. Skill 元数据要求

每个可治理 skill 至少需要这些元数据：

```yaml
name: web-summarize
status: verified
version: 1.2.0
task_types:
  - web.research.summary
triggers:
  - summarize url
  - extract key points
risk_level: R1
permissions_expected:
  - browser.readonly
  - http.readonly
source:
  type: human-authored | learned-note | imported
  trajectory_id: optional
coverage:
  eval_cases:
    - web-summary-basic
    - web-summary-source-attribution
non_goals:
  - do not submit forms
  - do not bypass paywalls
```

## 4. 晋升流程

### 4.1 learned note -> candidate

条件：

1. 有 source trajectory。
2. 能说明它解决的任务类型。
3. 有明确 trigger conditions。
4. 有 non-goals。
5. 没有包含 secrets、个人数据、临时路径或一次性上下文。
6. 人类或 reviewer 明确批准。

### 4.2 candidate -> verified

条件：

1. 通过 schema / frontmatter 检查。
2. 至少绑定一个 eval case。
3. eval report 中任务成功和 evidence quality 均达标。
4. 不引入更高风险工具，或风险升级已经被批准。
5. 文档中有失败边界。

### 4.3 verified -> deprecated / blocked

触发条件：

- eval 退化；
- 与当前架构事实冲突；
- 触发错误工具；
- 产生 false confidence；
- 包含过期 API / 命令；
- 被用户或 reviewer 明确判定不可信。

`deprecated` 表示不推荐；`blocked` 表示禁止。

## 5. Match Explanation 要求

每次 skill match 不能只返回 skill id，还要能解释：

| 字段 | 说明 |
|---|---|
| matchedBy | title / tag / trigger / semantic / explicit |
| confidence | 置信度或等级 |
| includedBody | 是否注入全文 |
| status | skill 当前生命周期状态 |
| blockedReason | 如果未注入，说明原因 |
| riskDelta | 注入后可能提高的风险 |

Workbench 应能展示：

```text
Skill matched: web-summarize
Reason: trigger "总结 URL" matched task goal
Status: verified
Body injected: yes
Risk: R1 readonly
Eval coverage: 2 cases passing
```

## 6. Eval 与验收

Skill eval 不应只检查“能不能匹配”，还要检查：

| 验收项 | 说明 |
|---|---|
| match accuracy | 该 skill 是否在该任务中应被选中 |
| non-match safety | 不相关任务不应误注入 |
| evidence compatibility | skill 步骤是否能产生可验证 evidence |
| permission compatibility | skill 预期工具是否符合风险等级 |
| regression | 修改后是否破坏已有 eval |
| false confidence | skill 是否诱导 agent 把文本当成功证据 |

## 7. CLI / Web 产品行为

### CLI

建议命令形态：

```bash
keigent skill list --status verified
keigent skill inspect web-summarize
keigent skill promote learned-note-123 --to candidate
keigent skill verify web-summarize
keigent skill deprecate old-skill --reason "API outdated"
keigent skill block risky-skill --reason "unsafe shell command"
```

当前实现备注（2026-06-12）：CLI 已实现只读 `skill list [--status <status>] [--json|--compact]` 与 `skill inspect <name> [--json|--compact]`，输出 status、source、eval coverage、tool / permission boundaries、non-goals、dangerous actions、blocked / deprecated reason，并包含非执行状态 skill。`promote`、`verify`、`deprecate`、`block` 等写入型治理命令仍未实现，必须等待 eval guard 与 reviewer approval 边界稳定后再进入实现。

### Web

Skill Library 第一版必须展示：

- status；
- trigger conditions；
- recent matches；
- source trajectory；
- eval coverage；
- risk/permission expectation；
- deprecated / blocked reason。

## 8. 验收用例

| 用例 | 期望 |
|---|---|
| learned note 产生 | 状态为 `learned-note-only`，不会自动注入 |
| candidate skill 匹配 | 只有显式实验任务或允许 candidate 时注入 |
| verified skill 匹配 | 正常注入，并记录 match explanation |
| deprecated skill 命中 | 默认不注入，说明 deprecated reason |
| blocked skill 命中 | 禁止注入，记录 blocking evidence |
| skill 修改 | 触发 eval，退化则不允许 verified 状态保持 |

## 9. 非目标

- 不做无限制自动学习。
- 不让 agent 自己把经验直接晋升为正式 skill。
- 不把 prompt 风格偏好当成 verified skill。
- 不在没有 eval 的情况下把 skill 标为可信。
- 不把 skill body 当成成功判定权威。

## 10. 下一步实现任务边界

第一版应优先实现：

1. Skill metadata schema 扩展。
2. `learned-note-only` 与 `verified` 的硬隔离。
3. match explanation 标准化。
4. CLI/Web view model 能展示 status、source、coverage。
5. skill promotion eval guard。
6. blocked/deprecated 注入保护。

暂不做：

- 在线 skill marketplace；
- 多用户审核流；
- 远程签名；
- 自动生成并自动启用 skill。
