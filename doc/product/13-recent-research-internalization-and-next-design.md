# Recent Research Internalization and Next Product Design

> 状态：调研内化汇总 / 下一步产品设计工作入口  
> 形成时间：2026-06-23  
> 依据：近期外部 Agent 项目调研、KeiGent 既有产品蓝图、Agent Operations Product Direction、Development Priority Backlog 与当前 main 文档基线。  
> 适用读者：产品负责人、设计师、架构师、验收人、AI 协作者与后续 coding agent。

---

## 1. 本轮汇总结论

近期调研已经足够支持一个明确判断：KeiGent 下一阶段不应继续扩展为“更多 agent 能力的集合”，而应继续收敛为：

```text
TypeScript-first、provider-neutral、loop-explicit、evidence-first、operator-facing 的 Agent Operations Workbench。
```

更具体地说，近期研究可内化成四个产品设计方向：

1. **从 Agent Framework 转向 Agent Operations**：核心不是“能不能跑”，而是“跑过之后能不能解释、验证、复盘、恢复、治理”。
2. **从聊天界面转向运行审计界面**：Workbench 的中心不是 chat skin，而是 run detail、timeline、evidence、failure、risk、skill、eval 的审证 surface。
3. **从 human-in-the-loop 转向 autonomy-first calibrated escalation**：默认让 agent 在边界内自主补证据、自修复；只在权限、高风险、阻塞歧义、预算耗尽或证据缺口不可修复时升级。
4. **从 demo success 转向 anti-self-deception**：任何“成功”都必须能追溯到 evidence / assertion / verdict / RunRecord，final text、fixture pass、replay pass、human acceptance packet 都不能单独证明产品健康。

这意味着下一步产品设计工作不应先画更炫的多 agent 编排，而应把已有 runtime 基线组织成一个用户能长期使用、审计、排错和演进的本地 Agent Operations 产品。

---

## 2. 近期调研中可内化的设计思考

### 2.1 原语要清晰，但不能供应商绑定

外部项目如 OpenAI Agents SDK 给出的启发是：Agent / Tool / Handoff / Guardrail / Session / Trace 这些原语需要进入框架主路径。但 KeiGent 不应复制任何供应商对象。

KeiGent 的内化方式：

| 外部启发 | KeiGent 内化对象 |
|---|---|
| Agent | `LoopEngine` + `LoopProfile` |
| Handoff | `route decision` / `workflow envelope` / `child run` |
| Guardrail | `SuccessDef` / `Assertion` / `RiskPolicy` / `FailureCode` |
| Trace | `Trajectory` / `LoopEvent` / `RunRecord` |
| Session | local run store / replay boundary |

产品原则：**对用户暴露 KeiGent 自己的 loop / evidence / run 语言，不把 OpenAI、Azure、LangChain 或第三方 relay 名词变成一等产品概念。**

---

### 2.2 TypeScript-first 不是生态标签，而是产品体验约束

Mastra 等项目说明，TypeScript-first 对现代应用开发者很重要。但 KeiGent 不应变成 AI application framework 全家桶。

KeiGent 的内化方式：

- runtime、CLI、Workbench、eval、config 使用统一 TypeScript 类型体系；
- `LoopProfile`、`WorkflowMode`、`RunRecord`、`EvidenceBundle`、`SkillMatchExplanation` 成为产品级稳定对象；
- first-run、doctor、config show、eval、replay、web API 都提供 developer-friendly 路径；
- 不额外吞下 RAG、deployment、hosted observability、memory platform 等平台责任。

产品原则：**TypeScript-first 服务于可理解、可扩展、可验收，而不是服务于“我们也有一套全家桶”。**

---

### 2.3 生产化 Agent 的关键不是 planner，而是运行事实源

Microsoft Agent Framework、AgentOps / Coze Loop / Plano 类项目共同指向：长期任务、失败恢复、观测、治理比炫技 planner 更关键。

KeiGent 的内化方式：

- `RunRecord` 必须成为所有 run 的事实源；
- workflow envelope 必须表达 parent / child、budget、timeout、artifact、replay 与 evidence；
- failed / degraded / no-op / replay 都是产品状态，不能被 final text 覆盖；
- Workbench 优先做审计、恢复、复盘，而不是聊天包装。

产品原则：**先让一次 run 成为可审计对象，再考虑 fanout / tournament / dynamic planner。**

---

### 2.4 12-Factor Agents 的真正价值是反黑盒

12-Factor Agents 的启发不是一组漂亮原则，而是把上下文、工具、控制流、错误、人工反馈都当作软件工程对象。

KeiGent 的内化方式：

- context / skill / memory 进入生命周期治理；
- 成功必须有 evidence，不能靠 final response；
- 状态必须外部化到 RunRecord / trajectory / eval report；
- failure code、blocking evidence、next action 必须结构化；
- repair / retry / escalation 必须受 budget 和 policy 限制。

产品原则：**模型可以参与判断，但产品事实必须存在于可检查的外部状态中。**

---

### 2.5 Agent UI 协议的启发：UI 不能解析 raw log

CopilotKit / AG-UI 等方向说明，Agent UI 的关键是稳定事件协议、长任务状态、工具调用、approval、checkpoint 与 streaming 的表达。

KeiGent 的内化方式：

- CLI、Live Console、Workbench、eval report、Feishu/report 从同一 `LoopEvent` / `RunRecord` 语义生成；
- UI 展示 attempted / succeeded / denied / failed / repaired / degraded 的差异；
- unknown event 不导致 UI 崩溃；
- event timeline 能映射回 RunRecord；
- inspector 默认脱敏并展示 proof boundary。

产品原则：**Workbench 不是日志浏览器，而是稳定运行语义的审计台。**

---

### 2.6 Eval 与 observability 要拆开成功、证据和风险

AgentOps 类项目提醒我们：观测不是一个总分，eval 也不是“全绿就健康”。KeiGent 尤其需要避免 false confidence。

KeiGent 的内化方式：

- route accuracy、task success、evidence quality、risk compliance、false-confidence findings 分开显示；
- replay report 必须标注 `freshExecution: false`；
- fixture pass 不等于生产健康；
- automation no-op 必须表达 scope 与 doesNotProve；
- eval case 应链接到 run detail，而不是停留在孤立 JSON。

产品原则：**不要给用户一个“100% 健康”的幻觉；给用户可追溯、可质疑、可行动的证据。**

---

### 2.7 Skill 是受治理的知识资产，不是 prompt 文件夹

KeiGent 的 skill-driven execution 是核心差异点，但如果 skill 没有状态、来源、eval coverage 和回滚路径，它会变成风险源。

KeiGent 的内化方式：

- skill 有 `draft` / `learned-note-only` / `candidate` / `verified` / `deprecated` / `blocked` 生命周期；
- skill match 必须解释 matchedBy、confidence、status、injected、blockedReason、riskDelta；
- learned note 不能自动成为 verified；
- 没有 eval coverage 的 skill 不能标为 verified；
- Workbench 要能展示 skill 的来源、覆盖度、近期命中和风险边界。

产品原则：**skill 负责怎么做，但不能绕过引擎的怎么验。**

---

## 3. 需要转化为产品设计的核心矛盾

### 3.1 用户真正要审的不是答案，而是一次执行过程

用户打开 KeiGent 不是只想看 agent 最后说了什么，而是想知道：

1. 为什么选择这个 profile？
2. 注入了哪些 skill，为什么可信？
3. 调了哪些工具，哪些只是 attempted？
4. 成功证据是什么？
5. 失败在哪里，blocking evidence 是什么？
6. 有没有风险动作和审批轨迹？
7. 是否 replay，是否 fresh execution？
8. 下一步该做什么？

因此下一步产品设计的第一主屏应是 **Run Review / Run Detail**，不是聊天框。

---

### 3.2 用户需要的是校准过的信心，而不是乐观自动化

KeiGent 必须把“不确定”产品化：

- `not_checked` 不等于失败，但也不能显示成功；
- `no-op` 不等于系统健康；
- `replay passed` 不等于 fresh execution passed；
- human accepted 不等于 evidence inspected，除非有明确审证记录；
- reviewer 说通过不能覆盖 failed assertion。

因此下一步产品设计需要把 proof boundary 做成显性组件，而不是藏在报告文字里。

---

### 3.3 人类介入不能成为默认产品中心

过去很多 human-in-the-loop 产品容易把人变成“兜底按钮”。KeiGent 更适合的设计是：

```text
bounded autonomous attempt
-> evidence collection
-> assertion check
-> bounded repair
-> re-check
-> calibrated escalation only if still blocked
```

升级原因应结构化为：

- permission required；
- high-risk side effect；
- blocking ambiguity；
- budget exhausted；
- evidence gap after retry；
- external dependency blocked；
- assertion self-repair failed。

这会让 KeiGent 的产品气质从“不断问你要不要继续”转向“在边界内尽力完成，无法证明时诚实升级”。

---

## 4. 下一步产品设计工作：Run Review Workbench v1

### 4.1 设计目标

下一步优先设计 **Run Review Workbench v1**：一个能让 operator 审计真实 run 的产品界面与信息架构。

它要解决的核心问题：

```text
用户如何在 30 秒内判断一次 agent run 是否可信、失败在哪里、下一步该做什么？
```

---

### 4.2 第一版页面结构

建议 Workbench v1 以三栏信息架构组织：

```text
Left: Run Queue / Filters
Center: Run Timeline / Evidence Story
Right: Inspector / Proof Boundary / Next Action
```

#### Left：Run Queue

目的：让用户选择要审的 run，并快速发现需要处理的状态。

必须包含：

- run id / short title；
- status：succeeded / failed / degraded / awaiting_approval / replay / no-op / unknown；
- createdAt / duration；
- selected profile / workflow mode；
- risk level；
- evidence summary；
- replay badge；
- needs-action badge。

推荐队列：

1. Needs Action；
2. Failed / Degraded；
3. Awaiting Approval；
4. Replay / Eval；
5. Recent Succeeded。

#### Center：Run Timeline

目的：把一次 run 从“黑盒输出”变成可读执行故事。

必须表达：

- route decision；
- profile selected；
- skills matched / injected / blocked；
- tool requested / succeeded / failed / denied；
- checkpoint / assertion checked；
- repair started / repair succeeded / repair failed；
- approval requested / approved / denied；
- run succeeded / failed / degraded；
- final response。

Timeline 设计原则：

- attempted 与 succeeded 必须视觉区分；
- failure / denied / degraded 不应被折叠到弱提示；
- long output 默认摘要，inspector 展示 redacted detail；
- unknown event 显示为 unknown，不崩溃、不伪装成功。

#### Right：Inspector + Proof Boundary

目的：让用户检查当前选中事件或整体 run 的证据边界。

必须包含：

- selected event detail；
- redacted payload；
- evidence links / artifact links；
- assertion verdict；
- failure code；
- proof boundary：
  - proven；
  - notProven；
  - assumptions；
  - evidenceGaps；
- next action；
- escalation reason（如有）。

---

### 4.3 五个关键组件

#### Component A：Run Trust Header

一句话回答：这次 run 当前是否可信？为什么？

建议字段：

- status；
- trust label：`evidence-backed` / `needs-review` / `insufficient-evidence` / `replay-only` / `not-checked`；
- top failure code；
- evidence count；
- risk badge；
- next action。

禁止行为：

- 不显示“100% success”；
- 不把 final response 当 trust label；
- 不把 empty evidence 显示成成功。

#### Component B：Route and Skill Explanation

回答：为什么这次这么跑？

必须展示：

- task classification；
- selected profile；
- selected workflow mode；
- matched skills；
- skill status；
- match reason；
- eval coverage；
- blocked / deprecated reason。

#### Component C：Evidence Ledger

回答：凭什么说做成了？

必须展示：

- assertion list；
- each assertion verdict；
- linked tool/file/test/screenshot evidence；
- failed assertion 的 blocking evidence；
- not checked 的原因。

#### Component D：Risk and Approval Trail

回答：是否涉及副作用、权限和审批？

必须展示：

- risk level；
- side effect type；
- reversible / irreversible；
- approval requested / approved / denied；
- approver / timestamp / redacted reason；
- denied 后 run 的终态。

#### Component E：Replay / Eval / Freshness Boundary

回答：这个结果是新执行还是回放？eval 能证明什么？

必须展示：

- freshExecution；
- replay source；
- eval case id；
- report path；
- doesProve；
- doesNotProve；
- stale schema warning。

---

## 5. 下一阶段产品设计优先级

### P0 Design：Run Review Workbench v1 信息架构

交付物：

1. Run List / Run Detail 的信息架构；
2. trust header 状态规则；
3. timeline event grouping 规则；
4. proof boundary 组件文案；
5. empty / failed / denied / replay / no-op 状态文案；
6. 7 个验收用例的页面预期。

验收用例：

- succeeded run；
- failed assertion run；
- approval denied run；
- replay run；
- insufficient evidence run；
- no-op automation run；
- parent workflow with child run。

### P1 Design：Skill Governance Surface

交付物：

1. Skill Library 信息架构；
2. Skill Detail 页；
3. skill match explanation card；
4. promotion / deprecate / block 的操作语义；
5. eval coverage 与 recent matches 的展示规则。

核心问题：用户如何判断一个 skill 是否该被信任和复用？

### P2 Design：Eval Review Dashboard

交付物：

1. eval case list；
2. run linkage；
3. false-confidence findings；
4. route / task / evidence / risk 分维度指标；
5. replay freshness boundary；
6. 不使用总健康分的替代表达。

核心问题：用户如何知道系统在哪些能力上退化，而不是看到一个虚假的总分？

### P3 Design：Calibrated Escalation Flow

交付物：

1. escalation reason taxonomy；
2. bounded repair timeline；
3. approval / permission request card；
4. degraded state 文案；
5. user decision 后如何进入 RunRecord。

核心问题：人什么时候介入，介入后如何不覆盖证据事实？

---

## 6. 对 UI 视觉和文案的设计约束

### 6.1 视觉方向

KeiGent 的产品气质应是：

```text
calm / precise / operator-grade / warm-neutral / evidence-oriented
```

建议：

- 使用温和但明亮的中性色与低饱和状态色；
- 成功色不要过度庆祝，失败色不要恐吓；
- 用 layout hierarchy 表达审计优先级，而不是用大面积渐变制造科技感；
- 对风险、证据缺口、replay boundary 使用清晰 badge；
- 避免冷紫、赛博感、AI slogan 化视觉。

### 6.2 文案方向

文案应帮助用户审证，而不是安抚用户相信系统。

推荐文案模式：

| 场景 | 推荐文案 | 避免文案 |
|---|---|---|
| 证据充分 | Evidence-backed completion | Successfully done! |
| 证据不足 | Not enough evidence to mark this run successful | Probably succeeded |
| replay | Replay result, not a fresh execution | Passed |
| no-op | No matching runs in this scope | Everything is healthy |
| approval denied | Stopped because approval was denied | Failed unexpectedly |
| blocked skill | Skill matched but blocked by governance policy | Skill unavailable |

---

## 7. 反自欺验收红线

任何下一步产品设计或实现都必须保留以下红线：

1. final text 不能单独让 run 成功；
2. tool attempted 不能显示成 tool succeeded；
3. replay 不能伪装 fresh execution；
4. empty evidence 不能显示成健康；
5. approval denied 不能被后续文本覆盖；
6. reviewer 不能写 worker workspace；
7. blocked skill 即使命中也不能注入；
8. human acceptance 不能覆盖 failed assertion，除非有 override reason；
9. no-op 必须显示 scope 与 doesNotProve；
10. provider capability 不能凭供应商品牌假设。

---

## 8. 建议的下一步执行包

### Design Package 1：Run Review Workbench v1 Spec

建议新建或更新：

- `doc/product/03-web-workbench-blueprint.md`：补充 Run Review v1 信息架构；
- `doc/design/05-web-dashboard.md` 或新文档：补充 timeline / evidence / proof boundary 的 UI 状态；
- `doc/product/12-development-priority-backlog.md`：把 P0-02 的设计验收扩展为可执行 UI checklist。

### Design Package 2：Workbench State Copy and Empty States

输出所有关键状态文案：

- unknown status；
- not checked；
- insufficient evidence；
- replay only；
- approval denied；
- blocked skill；
- no-op automation；
- degraded after repair failed。

### Design Package 3：Operator Review Acceptance Script

定义人工验收脚本：

1. 给 reviewer 一个 run detail；
2. 要求 reviewer 判断 trusted / needs review / rejected；
3. reviewer 必须引用 evidence 或 evidence gap；
4. acceptance packet 记录 inspected items；
5. 如果 override failed assertion，必须填写 override reason。

---

## 9. 本文档对后续开发的约束

后续 coding agent 在进入实现前，应先确认：

1. 要做的是哪个 design package；
2. 对应的 run 状态和 evidence 语义是否已定义；
3. 是否会增加新的成功口径；
4. 是否需要新增 eval / replay fixture；
5. 是否影响 RunRecord schema、LoopEvent 协议或 skill lifecycle；
6. 是否会让 UI 声称超过当前实现基线的能力。

如果无法回答这些问题，不应直接编码。

---

## 10. 当前建议

建议下一步先做 **Design Package 1：Run Review Workbench v1 Spec**。

理由：

- 它直接承接近期调研中最重要的趋势：可审计运行事实；
- 它是 RunRecord、LoopEvent、Skill Governance、Eval Linkage 的交汇点；
- 它能把“Agent Operations Workbench”从战略表达推进到具体产品界面；
- 它能继续压制 demo 化倾向，把后续实现约束在 evidence-first 产品逻辑里。

第一版设计完成定义：

```text
给定 7 类 run fixture，设计文档能明确说明：
用户在 Workbench 中看到什么、为什么可信/不可信、下一步如何行动、哪些内容仍未被证明。
```
