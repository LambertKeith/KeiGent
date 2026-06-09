# Success and Evidence Model

> 目标：定义 KeiGent 中“任务成功”的可验证语义，防止 final text、自评、工具尝试被误当成成功证据。

## 1. 四层成功模型

| 层 | 问题 | 示例证据 |
|---|---|---|
| Intent success | 用户真实意图是否满足 | 用户确认、rubric pass |
| Operation success | 目标操作是否实际发生 | tool_result success、file exists、HTTP 2xx |
| Evidence success | 是否有客观证据证明 | checkpoint/verdict、snapshot、checksum |
| Communication success | 最终回答是否如实传达 | finalResponseIncludes、failure explanation |

一个任务只有 final response 说“完成了”，不能算成功。verified 任务至少需要 operation + evidence success。

## 2. 证据类型

| Evidence | 适用任务 | 注意事项 |
|---|---|---|
| DOM snapshot | 浏览器任务 | 需记录 URL/title/selector/text |
| Screenshot | UI 难判断任务 | 需要 verifier/rubric，不应只存图 |
| File stat/content/hash | 文件任务 | hash 比“文件存在”更强 |
| Command exit code/stdout | shell 任务 | exit 0 不是业务成功的充分条件 |
| API response | 外部系统 | 需要脱敏与状态码 |
| Tool success | 操作层 | 只能证明工具成功，不证明用户意图成功 |
| Human approval | 高风险任务 | 记录 approval prompt 与 scope |
| Verifier verdict | verified-loop | 必须引用 assertion/evidence |
| Trajectory replay | 回放评估 | 只能证明历史轨迹按当前规则重评结果 |

## 3. 禁止作为成功依据

- `finalResponse` 自称完成。
- agent 自我检查文本。
- tool 被调用过但没有成功结果。
- checkpoint 数量达标但 verdict 未 pass。
- 没有错误输出。
- replay pass 被说成 fresh execution pass。
- verifier 拿到了会产生副作用的工具后“自己修好了”。

## 4. Assertion DSL 初版

```ts
type Assertion =
  | { kind: "urlContains"; value: string }
  | { kind: "textIncludes"; value: string; source?: "dom" | "stdout" | "file" | "final" }
  | { kind: "fileExists"; path: string }
  | { kind: "fileHashEquals"; path: string; sha256: string }
  | { kind: "commandExitCode"; commandId: string; code: number }
  | { kind: "toolSucceeded"; toolName: string; minCount?: number }
  | { kind: "checkpointPassed"; checkpointId?: string; minCount?: number }
  | { kind: "humanApproved"; scope: string }
  | { kind: "jsonPathEquals"; path: string; value: unknown }
  | { kind: "screenshotJudge"; rubric: string };
```

## 5. 默认 evidence policy

| 任务 | 最低证据 | 强证据 |
|---|---|---|
| 研究总结 | 来源/引用/边界说明 | 多来源交叉验证 |
| 文件写入 | fileExists + content sample | hash + diff |
| shell 执行 | commandExitCode + stdout excerpt | 后置状态检查 |
| 浏览器导航 | URL/title/textIncludes | DOM + screenshot verdict |
| 表单提交 | DOM/URL 状态变化 | server/API confirmation |
| 配置修改 | redacted config + doctor | offline + online doctor |
| 高风险操作 | humanApproved + post evidence | rollback/receipt/audit id |

## 6. 数据边界

- `SuccessDef` 是用户或上层系统给出的目标事实源。
- `Assertion` 是可检查条件。
- `Evidence` 是采集到的客观材料。
- `Verdict` 是 assertion 对 evidence 的判断。
- `finalResponse` 只能传达 verdict，不能替代 verdict。

## 7. 验收标准

- verified-loop 禁止从 final text 推断成功。
- dashboard 必须区分 operation success、evidence success、communication success。
- eval failure code 必须能指出缺失的是 output、tool、checkpoint、evidence 还是 profile。
- 高风险任务必须包含 human approval evidence。
- assertion 缺失时，系统不得显示“强验证通过”。
