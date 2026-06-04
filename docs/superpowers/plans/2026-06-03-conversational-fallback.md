# 对话兜底分支 + 分类误判修复 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复闲聊（如「你好」）被误判为 `convergent-exec` 导致死循环升级的问题，新增 `conversational` profile 与 `ask_user` 追问链路。

**Architecture:** 四处改动，全部复用现有五旋钮机制，不改引擎主循环结构：(A) 修 orchestrator 规则 4 复用 `scoreSkill`；(B) 加闲聊识别（规则快路径 + LLM 意图兜底）；(C) 新增 `ConversationalAttention` + `makeConversationalProfile`；(D) 接通 `ask_user` 注入链路。

**Tech Stack:** TypeScript、pnpm monorepo、vitest（新引入单测）、`@earendil-works/pi-ai`。

**Spec:** `doc/design/02-conversational-fallback.md`

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `packages/engine/package.json` | 用 vitest 替换悬空的 jest test 脚本 + devDep | 改 |
| `packages/engine/vitest.config.ts` | vitest 最小配置 | 建 |
| `packages/engine/src/profiles/strategies.ts` | 导出 `scoreSkill`；新增 `ConversationalAttention` | 改 |
| `packages/engine/src/profiles/conversational.ts` | `makeConversationalProfile` | 建 |
| `packages/engine/src/orchestrator.ts` | `isObviousChitchat` + 修规则4 + LLM 选项/注册表加 conversational | 改 |
| `packages/engine/src/engine.ts` | `EngineOptions.askUser` + `toolCtx` 填充 | 改 |
| `packages/engine/src/tool-filter.ts` | `toolsForProfile` 共享 helper（repl/run-once 共用） | 建 |
| `packages/engine/src/lib.ts` | 导出 `makeConversationalProfile`、`toolsForProfile` | 改 |
| `packages/engine/src/__tests__/orchestrator.test.ts` | `isObviousChitchat`/`classifyByRules` 单测 | 建 |
| `packages/engine/src/__tests__/conversational.test.ts` | `ConversationalAttention` 单测 | 建 |
| `packages/cli/src/repl.ts` | 传 `askUser` 回调 + 用 `toolsForProfile` | 改 |
| `packages/cli/src/run-once.ts` | 用 `toolsForProfile`（不传 askUser） | 改 |
| `packages/cli/src/commands.ts` | `/profile` 选项列表加 conversational | 改 |

---

## Task 1: 引入 vitest，替换悬空的 jest 测试脚本

**Files:**
- Modify: `packages/engine/package.json`
- Create: `packages/engine/vitest.config.ts`

- [ ] **Step 1: 安装 vitest 到 engine 包**

Run:
```bash
pnpm --filter @keigent/engine add -D vitest
```
Expected: `package.json` 的 devDependencies 出现 `vitest`，pnpm-lock 更新。

- [ ] **Step 2: 把 test 脚本从 jest 改成 vitest**

`packages/engine/package.json` 的 `scripts.test` 当前是悬空的 jest 命令（jest 未安装）。改为：

```json
    "check": "tsc --noEmit",
    "test": "vitest run"
```

（保留其它脚本不动，只替换 `test` 一行。）

- [ ] **Step 3: 创建 vitest 最小配置**

Create `packages/engine/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: 建一个占位 smoke 测试，确认 vitest 跑得起来**

Create `packages/engine/src/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm --filter @keigent/engine test`
Expected: PASS，1 个测试通过（smoke）。

- [ ] **Step 6: 删除占位测试并提交基建**

```bash
rm packages/engine/src/__tests__/smoke.test.ts
git add packages/engine/package.json packages/engine/vitest.config.ts pnpm-lock.yaml
git commit -m "test: 引入 vitest，替换悬空的 jest 测试脚本"
```

---

## Task 2: 改动 A — 导出 `scoreSkill` 并修复 orchestrator 规则 4

**Files:**
- Modify: `packages/engine/src/profiles/strategies.ts:50`（给 `scoreSkill` 加 `export`）
- Modify: `packages/engine/src/orchestrator.ts`（import `scoreSkill`，重写规则 4）
- Test: `packages/engine/src/__tests__/orchestrator.test.ts`

- [ ] **Step 1: 导出 `scoreSkill`**

`packages/engine/src/profiles/strategies.ts` 第 50 行，把：

```ts
function scoreSkill(meta: SkillMeta, goal: string): number {
```

改为：

```ts
export function scoreSkill(meta: SkillMeta, goal: string): number {
```

- [ ] **Step 2: 写失败测试 — 规则 4 不再误判闲聊**

Create `packages/engine/src/__tests__/orchestrator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyByRules } from "../orchestrator.js";
import type { SkillMeta, Task } from "../types.js";

// 复刻线上 skill 库：两个执行类 skill，描述含 fetch/extract
const METAS: SkillMeta[] = [
  { name: "web-summarize", description: "fetch a webpage and summarize its content", tags: ["web", "summarize", "fetch"] },
  { name: "data-extract", description: "extract structured data from a page", tags: ["data", "extract", "structured", "table"] },
];

const task = (goal: string, extra: Partial<Task> = {}): Task => ({ goal, profile: "auto", ...extra });

describe("classifyByRules — 规则4 误判修复", () => {
  it("闲聊「你好」在有执行 skill 的库里不再被判为 convergent-exec", () => {
    // 修复前：规则4 命中（库里有 fetch skill）→ convergent-exec
    // 修复后：scoreSkill('你好')=0 < 阈值 → 规则4 不命中
    expect(classifyByRules(task("你好"), METAS)).not.toBe("convergent-exec");
  });

  it("真正相关任务仍判为 convergent-exec", () => {
    expect(classifyByRules(task("帮我用 web-summarize 总结这个网页"), METAS)).toBe("convergent-exec");
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm --filter @keigent/engine test`
Expected: FAIL — 第一个用例当前返回 `convergent-exec`（规则 4 旧逻辑误判）。
（注：`classifyByRules` 当前未 export，Step 4 会一并 export。若此时报「not exported」也算预期失败。）

- [ ] **Step 4: 重写规则 4 并导出 `classifyByRules`**

`packages/engine/src/orchestrator.ts`：

1. 在文件顶部 import 区加入 `scoreSkill`：

```ts
import { extractToolCalls } from "./utils.js";
import { scoreSkill } from "./profiles/strategies.js";
```

2. 把 `function classifyByRules(` 改为 `export function classifyByRules(`（供单测调用）。

3. 替换规则 4 整段（原 `orchestrator.ts:92-100` 那段 `executionSkillVerbs` + `metas.find`）为：

```ts
  // 规则 4：任务对某 skill 真实相关（复用 attention 层的 scoreSkill 评分）→ 收敛执行
  // 修复：旧逻辑检查「库里有没有执行 skill」（与任务无关），导致任何输入都误判。
  const SKILL_MATCH_THRESHOLD = 2; // name 命中 +10、tags 命中 +2、description 弱命中 +1
  const bestSkillScore = metas
    .map((m) => scoreSkill(m, task.goal))
    .reduce((max, s) => Math.max(max, s), 0);
  if (bestSkillScore >= SKILL_MATCH_THRESHOLD) {
    return "convergent-exec";
  }
```

（删除原来声明的 `executionSkillVerbs` 数组和 `matchedSkill` 变量。）

- [ ] **Step 5: 运行确认通过**

Run: `pnpm --filter @keigent/engine test`
Expected: PASS — 两个用例都通过。

- [ ] **Step 6: 类型检查**

Run: `pnpm --filter @keigent/engine check`
Expected: 无类型错误。

- [ ] **Step 7: 提交**

```bash
git add packages/engine/src/profiles/strategies.ts packages/engine/src/orchestrator.ts packages/engine/src/__tests__/orchestrator.test.ts
git commit -m "fix: orchestrator 规则4 复用 scoreSkill，修复闲聊误判为 convergent-exec"
```

---

## Task 3: 改动 B — 闲聊识别（规则快路径 + LLM 意图兜底）

**Files:**
- Modify: `packages/engine/src/orchestrator.ts`（加 `isObviousChitchat`、规则 0.5、LLM 选项、注册表分支、ProfileName 类型）
- Test: `packages/engine/src/__tests__/orchestrator.test.ts`（追加用例）

- [ ] **Step 1: 追加失败测试 — 闲聊走 conversational、短任务不被误吞**

在 `packages/engine/src/__tests__/orchestrator.test.ts` 末尾追加：

```ts
describe("classifyByRules — 闲聊快路径", () => {
  it("「你好」走 conversational", () => {
    expect(classifyByRules(task("你好"), METAS)).toBe("conversational");
  });
  it("「谢谢」走 conversational", () => {
    expect(classifyByRules(task("谢谢"), METAS)).toBe("conversational");
  });
  it("短执行任务「用 web-summarize 总结网页」不被当闲聊", () => {
    expect(classifyByRules(task("用 web-summarize 总结网页"), METAS)).toBe("convergent-exec");
  });
  it("带 URL 的输入即使短也不当闲聊", () => {
    const r = classifyByRules(task("你好 https://example.com"), METAS);
    expect(r).not.toBe("conversational");
  });
  it("超 20 字的问候不进快路径（交后续规则/LLM）", () => {
    const long = "你好你好你好你好你好你好你好你好你好你好你好你好"; // 24 字
    expect(classifyByRules(task(long), METAS)).not.toBe("conversational");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @keigent/engine test`
Expected: FAIL — `conversational` 尚不是合法返回值，前两个用例失败。

- [ ] **Step 3: ProfileName 类型加 conversational**

`packages/engine/src/orchestrator.ts` 第 12 行：

```ts
export type ProfileName = "convergent-exec" | "convergent-verified" | "divergent-research" | "conversational";
```

- [ ] **Step 4: 加 `isObviousChitchat` 函数**

在 `classifyByRules` 函数定义之前插入：

```ts
/**
 * 高置信度闲聊识别（零 LLM）。只拦最高频最确定的纯问候/感谢；
 * 故意从严——漏判会落到 LLM 意图兜底，误判才是要避免的。
 */
function isObviousChitchat(task: Task): boolean {
  if (task.successDef) return false;
  const goal = task.goal.trim();
  if (/https?:\/\//.test(goal) || goal.length > 20) return false;
  return [
    /^(你好|您好|hi|hello|hey|嗨|在吗|早|晚上好)[\s!！。.~]*$/i,
    /^(谢谢|感谢|thanks|thank\s?you|好的|ok|okay|拜拜|再见|bye)[\s!！。.~]*$/i,
  ].some((p) => p.test(goal));
}
```

- [ ] **Step 5: 在 classifyByRules 里插入规则 0.5**

`classifyByRules` 内，紧接规则 0（显式 profile）之后、规则 1（successDef）之前插入：

```ts
  // 规则 0.5：高置信度闲聊 → 对话兜底（在所有任务规则之前，但尊重规则0的显式指定）
  if (isObviousChitchat(task)) {
    return "conversational";
  }
```

- [ ] **Step 6: 运行确认快路径用例通过**

Run: `pnpm --filter @keigent/engine test`
Expected: PASS — Task 3 的 5 个用例 + Task 2 的 2 个用例全通过。

- [ ] **Step 7: LLM 分类器加 conversational 选项**

`packages/engine/src/orchestrator.ts` 的 `classifyTool`，把 `profile` 的 Union 改为三选项：

```ts
    profile: Type.Union(
      [
        Type.Literal("convergent-exec"),
        Type.Literal("divergent-research"),
        Type.Literal("conversational"),
      ],
      { description: "选择的 profile" },
    ),
```

并在 `classifyByLLM` 的 systemPrompt 的「可用策略」列表里加一行：

```
- conversational：闲聊、问候、感谢、询问你的能力、或没有明确可执行目标的对话。
```

- [ ] **Step 8: 注册表支持 conversational**

`packages/engine/src/orchestrator.ts` 顶部 import 加：

```ts
import { makeConversationalProfile } from "./profiles/conversational.js";
```

（该文件在 Task 4 创建；本步骤会引入临时编译错误，Task 4 完成后消除。先写好 switch 分支。）

`makeDefaultRegistry` 的 `get(name)` switch 增加：

```ts
        case "conversational":
          return makeConversationalProfile();
```

`names()` 数组加 `"conversational"`。

- [ ] **Step 9: 提交（注：此时 conversational.ts 尚未建，check 会报错，留到 Task 4 一起验证）**

```bash
git add packages/engine/src/orchestrator.ts packages/engine/src/__tests__/orchestrator.test.ts
git commit -m "feat: orchestrator 闲聊识别（规则快路径 + LLM 意图兜底）"
```

---

## Task 4: 改动 C — `ConversationalAttention` + `makeConversationalProfile`

**Files:**
- Modify: `packages/engine/src/profiles/strategies.ts`（新增 `ConversationalAttention`）
- Create: `packages/engine/src/profiles/conversational.ts`
- Test: `packages/engine/src/__tests__/conversational.test.ts`

- [ ] **Step 1: 写失败测试 — ConversationalAttention 行为**

Create `packages/engine/src/__tests__/conversational.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Tool } from "@earendil-works/pi-ai";
import { ConversationalAttention } from "../profiles/strategies.js";
import type { LoopState, SkillContext, SkillMeta, Task } from "../types.js";

const METAS: SkillMeta[] = [
  { name: "web-summarize", description: "fetch a webpage and summarize", tags: ["web", "fetch"] },
];

const skillContext: SkillContext = {
  metas: METAS,
  matched: [],
  loadBody: async () => null,
};

const task: Task = { goal: "你好", profile: "conversational" };
const state: LoopState = {
  task, iteration: 1, messages: [], snapshots: [],
  checkpointCount: 0, toolCallCount: 0, failed: false,
};

const tools: Tool[] = [
  { name: "ask_user", description: "ask", parameters: { type: "object", properties: {} } },
  { name: "fetch_url", description: "fetch", parameters: { type: "object", properties: {} } },
];

describe("ConversationalAttention", () => {
  const att = new ConversationalAttention("你是 KeiGent。");

  it("不匹配任何 skill（不触发学习）", () => {
    expect(att.matchSkills(task, METAS)).toEqual([]);
  });

  it("不注入 skill body", async () => {
    expect(await att.renderInjection([], skillContext)).toBe("");
  });

  it("每轮都暴露全部传入工具（ask_user 不被移除）", async () => {
    const ctx = await att.buildContext(state, skillContext, tools);
    const names = (ctx.tools ?? []).map((t) => t.name);
    expect(names).toContain("ask_user");
    expect(names).toContain("fetch_url");
  });

  it("system prompt 含动态 skill 索引（能力清单）", async () => {
    const ctx = await att.buildContext(state, skillContext, tools);
    expect(ctx.systemPrompt).toContain("web-summarize");
    expect(ctx.systemPrompt).toContain("你是 KeiGent。");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @keigent/engine test`
Expected: FAIL — `ConversationalAttention` 尚未定义（import 报错）。

- [ ] **Step 3: 实现 ConversationalAttention**

在 `packages/engine/src/profiles/strategies.ts` 的 `WideAttention` 类定义之后追加：

```ts
/**
 * 对话注意力（ConversationalAttention）：专为闲聊/兜底设计。
 * - 不匹配 skill、不注入 body（skillsUsed 为空 → 不触发学习）
 * - 每轮都暴露全部传入工具，绝不移除 ask_user —— 支持多次追问
 *   （这是不能复用 WideAttention 的原因：后者会移除已用工具）
 * - system prompt 注入动态 skill 索引作为「能力清单」
 * 无实例级可变状态，reset() 空实现。
 */
export class ConversationalAttention implements AttentionStrategy {
  constructor(private readonly systemPromptBase: string) {}

  reset(): void {}

  matchSkills(_task: Task, _metas: SkillMeta[]): string[] {
    return [];
  }

  async renderInjection(_matchedNames: string[], _skillContext: SkillContext): Promise<string> {
    return "";
  }

  buildContext(state: LoopState, skillContext: SkillContext, availableTools: Tool[]): Promise<Context> {
    const index = renderSkillIndex(skillContext.metas);
    const systemPrompt = [
      this.systemPromptBase,
      index ? `## 你能帮用户做的事\n\n${index}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    return Promise.resolve({
      systemPrompt,
      messages: state.messages,
      tools: availableTools.length > 0 ? availableTools : undefined,
    });
  }
}
```

（`renderSkillIndex` 已在文件顶部从 `../skills.js` import；`Context`、`Tool` 也已 import。无需新增 import。）

- [ ] **Step 4: 创建 conversational profile**

Create `packages/engine/src/profiles/conversational.ts`:

```ts
import type { LoopProfile } from "../types.js";
import {
  ConversationalAttention,
  ModelSelfJudge,
  NoVerify,
  NoWrite,
  SimpleRetry,
} from "./strategies.js";

const SYSTEM_PROMPT = `你是 KeiGent，一个可切换策略的 AI agent，当前处于日常对话。
简洁友好地回应。如果用户意图模糊、或像是想让你做事但说得不具体，
调用 ask_user 工具反问澄清，不要空猜。下面列出了你能帮用户做的事。`;

/**
 * 对话兜底 profile：
 * - attention: ConversationalAttention（不注入 skill、不移除工具、动态能力清单）
 * - terminate: ModelSelfJudge（allowEarlyTextExit=true，有文本就退，根治死循环）
 * - verify:    NoVerify（闲聊无客观状态可验）
 * - recover:   SimpleRetry(2)（兜底，几乎不触发）
 * - memory:    NoWrite（不沉淀，防污染）
 */
export function makeConversationalProfile(): LoopProfile {
  return {
    name: "conversational",
    attention: new ConversationalAttention(SYSTEM_PROMPT),
    terminate: new ModelSelfJudge(),
    verify: new NoVerify(),
    recover: new SimpleRetry(2),
    memory: new NoWrite(),
  };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @keigent/engine test`
Expected: PASS — conversational + orchestrator 全部用例通过。

- [ ] **Step 6: 类型检查（Task 3 Step 8 引入的 import 此刻应消除）**

Run: `pnpm --filter @keigent/engine check`
Expected: 无类型错误（`orchestrator.ts` 对 `makeConversationalProfile` 的引用现在有定义了）。

- [ ] **Step 7: 提交**

```bash
git add packages/engine/src/profiles/strategies.ts packages/engine/src/profiles/conversational.ts packages/engine/src/__tests__/conversational.test.ts
git commit -m "feat: 新增 ConversationalAttention + conversational profile"
```

---

## Task 5: 改动 D（引擎侧）— `EngineOptions.askUser` + 工具过滤 helper

**Files:**
- Modify: `packages/engine/src/engine.ts`（`EngineOptions` 加 `askUser`，`toolCtx` 填充）
- Create: `packages/engine/src/tool-filter.ts`
- Modify: `packages/engine/src/lib.ts`（导出 `makeConversationalProfile`、`toolsForProfile`）

- [ ] **Step 1: `EngineOptions` 加 askUser 字段**

`packages/engine/src/engine.ts` 的 `EngineOptions` 接口（21-29 行）加一行：

```ts
  headless?: boolean;           // 浏览器可见性
  askUser?: (question: string) => Promise<string>;  // 交互提问回调（CLI 注入，单次模式不传）
```

- [ ] **Step 2: 构造函数存字段**

`engine.ts` 的私有字段区加 `private readonly askUser?: (q: string) => Promise<string>;`，构造函数体加 `this.askUser = opts.askUser;`：

```ts
  private readonly headless: boolean;
  private readonly askUser?: (question: string) => Promise<string>;
```

```ts
    this.headless = opts.headless ?? false;
    this.askUser = opts.askUser;
```

- [ ] **Step 3: toolCtx 填充 askUser**

`engine.ts` 的 `run()` 内构建 `toolCtx`（71-77 行）加一行：

```ts
    const toolCtx: ToolContext = {
      workspace: this.workspace,
      browser: null,
      approval: this.approval,
      task,
      headless: this.headless,
      askUser: this.askUser,
    };
```

- [ ] **Step 4: 创建工具过滤 helper（DRY，repl/run-once 共用）**

Create `packages/engine/src/tool-filter.ts`:

```ts
import type { Tool } from "@earendil-works/pi-ai";
import type { ToolRegistry } from "./tools/index.js";

/**
 * 按 profile 决定暴露给 LLM 的工具子集。
 * conversational：只给 ask_user + 只读工具（不含 write/execute/dangerous），
 *   既能追问澄清、又能跑安全只读动作，有副作用的操作留给任务 profile。
 * 其它 profile：全量工具。
 */
export function toolsForProfile(registry: ToolRegistry, profileName: string): Tool[] {
  if (profileName === "conversational") {
    return registry.toPiAiTools((t) => t.permission === "readonly" || t.name === "ask_user");
  }
  return registry.toPiAiTools();
}
```

- [ ] **Step 5: lib.ts 导出新 API**

`packages/engine/src/lib.ts` 追加：

```ts
export { makeConversationalProfile } from "./profiles/conversational.js";
export { toolsForProfile } from "./tool-filter.js";
```

- [ ] **Step 6: 类型检查**

Run: `pnpm --filter @keigent/engine check`
Expected: 无类型错误。

- [ ] **Step 7: 测试仍全绿**

Run: `pnpm --filter @keigent/engine test`
Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add packages/engine/src/engine.ts packages/engine/src/tool-filter.ts packages/engine/src/lib.ts
git commit -m "feat: EngineOptions.askUser 注入链路 + toolsForProfile 工具过滤 helper"
```

---

## Task 6: CLI 接线 — repl 传 askUser、run-once 过滤工具、/profile 加选项

**Files:**
- Modify: `packages/cli/src/repl.ts`（传 askUser 回调 + 用 toolsForProfile）
- Modify: `packages/cli/src/run-once.ts`（用 toolsForProfile）
- Modify: `packages/cli/src/commands.ts`（/profile 提示列表加 conversational）

- [ ] **Step 1: repl.ts import toolsForProfile**

`packages/cli/src/repl.ts` 的 `@keigent/engine` import 块加入 `toolsForProfile`：

```ts
  saveTrajectory,
  formatLearningResult,
  toolsForProfile,
  type ApprovalGate,
  type Task,
} from "@keigent/engine";
```

- [ ] **Step 2: repl.ts 把 rl 传进 TaskDeps**

`runRepl` 内调用 `runTask`（88-91 行）时把 `rl` 传入。先在 `TaskDeps` 接口（99-109 行）加字段：

```ts
  approval: ApprovalGate;
  skillBodies: Map<string, string>;
  rl: import("node:readline/promises").Interface;
}
```

调用处：

```ts
    await runTask(input, {
      config, model, replState, orchestrator, learner, stateCapture,
      registry, approval, skillBodies, rl,
    });
```

- [ ] **Step 3: repl.ts 引擎构造传 askUser + 按 profile 过滤工具**

`runTask` 内（135-145 行），从 deps 解构出 `rl`，给 `LoopEngine` 构造加 `askUser`，并把 `availableTools` 改为按 profile 过滤：

```ts
  const { config, model, replState, orchestrator, learner, stateCapture, registry, approval, skillBodies, rl } = deps;
```

```ts
  const engine = new LoopEngine({
    model,
    apiKey: config.apiKey,
    maxIterations: config.maxIterations,
    registry,
    workspace: config.workspace,
    approval,
    headless: replState.headless,
    askUser: async (q) => (await rl.question(`\n${c.yellow}? ${q}${c.reset}\n  ❯ `)).trim(),
  });

  const availableTools = toolsForProfile(registry, profileName);
```

（删除原来的 `const availableTools = registry.toPiAiTools();`。`c` 已从 renderer import；`profileName` 在该函数上文已定义。）

- [ ] **Step 4: run-once.ts 按 profile 过滤工具（不传 askUser）**

`packages/cli/src/run-once.ts`：

import 块加 `toolsForProfile`：

```ts
  saveTrajectory,
  formatLearningResult,
  AllowAllGate,
  toolsForProfile,
  type Task,
} from "@keigent/engine";
```

把 `engine.run` 调用（59-66 行）的 `registry.toPiAiTools()` 改为 `toolsForProfile(registry, selected.name)`：

```ts
    const result = await engine.run(
      task,
      skillContext,
      selected.profile,
      stateCapture,
      toolsForProfile(registry, selected.name),
      renderProgress,
    );
```

（run-once 不传 `askUser` → 单次模式 `ask_user` 走「非交互降级」分支，符合设计。）

- [ ] **Step 5: commands.ts /profile 提示加 conversational**

`packages/cli/src/commands.ts` 第 37 行的可选项提示：

```ts
        printInfo("可选: convergent-exec / convergent-verified / divergent-research / conversational / auto");
```

并在 `printHelp()` 里 `/profile` 那行的说明保持不变即可（已是通用描述）。

- [ ] **Step 6: 全仓类型检查**

Run: `pnpm check`
Expected: 所有包无类型错误。

- [ ] **Step 7: engine 测试仍全绿**

Run: `pnpm --filter @keigent/engine test`
Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add packages/cli/src/repl.ts packages/cli/src/run-once.ts packages/cli/src/commands.ts
git commit -m "feat: CLI 接通 askUser 追问 + conversational 工具过滤 + /profile 选项"
```

---

## Task 7: 端到端手动验证（需 KEIGENT_API_KEY，调真实 LLM）

单测已覆盖纯逻辑（规则分类、attention 行为）。本任务验证 LLM 在环的整体行为——`classifyByLLM` 的 conversational 分支和死循环修复，无法用零 LLM 单测覆盖。

- [ ] **Step 1: 启动 REPL**

Run: `pnpm --filter @keigent/cli start`
Expected: 进入 REPL，banner 显示 model/skills/workspace。

- [ ] **Step 2: 验证闲聊不再死循环**

输入：`你好`
Expected:
- profile 显示 `conversational (rule)`（不再是 `convergent-exec`）
- 模型输出一句问候后**直接结束**（`◆ 完成 (success)`），不再有 request_verification / 裁判失败 / 升级人类。

- [ ] **Step 3: 验证能力询问走动态清单**

输入：`你能做什么`
Expected: profile 为 `conversational`（规则快路径不拦「你能做什么」，但会落到 LLM 兜底判为 conversational，或被 scoreSkill 判 null 后 LLM 兜底）。回答中提到 web-summarize / data-extract 的能力（来自动态 skill 索引）。

- [ ] **Step 4: 验证模糊意图触发追问**

输入：`帮我弄个东西`
Expected: 模型调用 `ask_user` 反问澄清，REPL 弹出 `? <问题>` 提示符等待输入；输入答案后 loop 继续，不报「非交互模式」。

- [ ] **Step 5: 验证真任务仍正常分类**

输入：`抓取 https://example.com 并总结`
Expected: profile 为 `convergent-exec`，正常走抓取流程（回归确认未被闲聊逻辑误伤）。

- [ ] **Step 6: 验证单次模式分类修复**

Run: `pnpm --filter @keigent/cli start "你好"`
Expected: profile 为 `conversational`，输出问候后 success 退出（单次模式 ask_user 不可用，但闲聊本身不需要追问）。

- [ ] **Step 7: 退出 REPL**

输入：`/quit`

---

## 自查清单（计划作者已核对）

**Spec 覆盖**（对照 `doc/design/02-conversational-fallback.md` §9 决策记录）：

| Spec 决策 | 对应 Task |
|---|---|
| 规则 4 复用 scoreSkill | Task 2 |
| 规则快路径 + LLM 意图兜底 | Task 3 |
| makeConversationalProfile / 五旋钮 | Task 4 |
| 动态能力清单（renderSkillIndex） | Task 4 Step 3 |
| 新建 ConversationalAttention（不复用 WideAttention） | Task 4 Step 3 |
| ask_user 注入链路 | Task 5 + Task 6 |
| 工具白名单（ask_user + 只读） | Task 5 Step 4（toolsForProfile） |
| 单次模式 ask_user 非交互降级 | Task 6 Step 4（run-once 不传 askUser） |
| 手动强制 /profile conversational | Task 6 Step 5 + Task 3（注册表已支持 get("conversational")） |
| 引入 vitest | Task 1 |

**类型一致性**：`makeConversationalProfile()`（无参）、`toolsForProfile(registry, profileName)`、`ConversationalAttention(systemPromptBase)`、`scoreSkill(meta, goal)`、`classifyByRules(task, metas)` 全计划签名一致。`ProfileName` 在 Task 3 Step 3 加入 `conversational`，Task 3 Step 8 的注册表 switch、Task 5/6 的字符串比较均用同一字面量。

**注意事项**：Task 3 Step 8 引入对 `conversational.ts` 的 import，该文件 Task 4 才创建——故 Task 3 的 `check` 暂不通过是预期的，Task 4 Step 6 才做完整类型检查。执行时按顺序进行即可。
