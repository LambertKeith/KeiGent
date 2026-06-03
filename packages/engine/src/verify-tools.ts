/**
 * B3 验收：文件系统沙箱 + shell 工具。
 * 不调 LLM，直接调 registry.execute 测工具逻辑 + 沙箱安全。
 */
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { buildDefaultRegistry } from "./tools/index.js";
import { AllowAllGate, type ToolContext } from "./tools/types.js";
import type { Task } from "./types.js";

async function main() {
  const registry = buildDefaultRegistry();
  const workspace = await mkdtemp(join(tmpdir(), "keigent-test-"));
  const ctx: ToolContext = {
    workspace,
    browser: null,
    approval: new AllowAllGate(),
    task: { goal: "test" } as Task,
    headless: true,
  };

  console.log(`=== B3 工具验收（workspace=${workspace}）===\n`);
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  // 1. file_write
  const wr = await registry.execute("file_write", { path: "test.txt", content: "hello keigent\n第二行" }, ctx);
  checks.push({ name: "file_write 写入", pass: !wr.isError, detail: wr.content });

  // 2. file_read
  const rd = await registry.execute("file_read", { path: "test.txt" }, ctx);
  checks.push({ name: "file_read 读回", pass: rd.content.includes("hello keigent"), detail: rd.content.slice(0, 40) });

  // 3. 沙箱逃逸防护
  const escape = await registry.execute("file_read", { path: "../../../etc/passwd" }, ctx);
  checks.push({ name: "沙箱拒绝路径逃逸", pass: escape.isError && escape.content.includes("越界"), detail: escape.content });

  // 4. file_list
  const ls = await registry.execute("file_list", { path: "." }, ctx);
  checks.push({ name: "file_list 列出文件", pass: ls.content.includes("test.txt"), detail: ls.content });

  // 5. grep
  await registry.execute("file_write", { path: "a.txt", content: "foobar\nKEIGENT_MARKER\nbaz" }, ctx);
  const gr = await registry.execute("grep", { pattern: "KEIGENT_MARKER" }, ctx);
  checks.push({ name: "grep 搜索命中", pass: gr.content.includes("KEIGENT_MARKER"), detail: gr.content });

  // 6. shell
  const sh = await registry.execute("shell", { command: "echo keigent-shell-ok" }, ctx);
  checks.push({ name: "shell 执行命令", pass: sh.content.includes("keigent-shell-ok"), detail: sh.content.slice(0, 40) });

  // 7. shell cwd 是 workspace
  const pwd = await registry.execute("shell", { command: "pwd" }, ctx);
  checks.push({ name: "shell 工作目录是 workspace", pass: pwd.content.includes("keigent-test"), detail: pwd.content.slice(0, 60) });

  // 8. http_request
  const http = await registry.execute("http_request", { url: "https://example.com" }, ctx);
  checks.push({ name: "http_request 请求", pass: http.content.includes("HTTP 200"), detail: http.content.slice(0, 40) });

  // ── B4: memory + ask_user + computer ──────────────────────────
  // 9. memory_recall（先写一条记忆，再召回）
  const { WriteThroughMemory } = await import("./memory.js");
  const memStore = new WriteThroughMemory(workspace);
  await memStore.persist(
    { task: { goal: "测试任务 KEIGENT_MEM" }, finalResponse: "记忆内容 marker", iteration: 1, checkpointCount: 1, failed: false, messages: [], snapshots: [], toolCallCount: 0 } as never,
    [],
  );
  const ctxWithMem = { ...ctx, memoryDir: workspace };
  const recall = await registry.execute("memory_recall", { query: "KEIGENT_MEM 测试" }, ctxWithMem);
  checks.push({ name: "memory_recall 召回", pass: recall.content.includes("KEIGENT_MEM") || recall.content.includes("marker"), detail: recall.content.slice(0, 50) });

  // 10. ask_user（注入 mock askUser）
  const ctxWithAsk = { ...ctx, askUser: async (q: string) => `mock答案-${q.slice(0, 10)}` };
  const ask = await registry.execute("ask_user", { question: "需要什么？" }, ctxWithAsk);
  checks.push({ name: "ask_user 交互", pass: ask.content.includes("mock答案"), detail: ask.content.slice(0, 50) });

  // 11. computer 工具已注册（includeComputer）
  const computerReg = buildDefaultRegistry({ includeComputer: true });
  checks.push({ name: "computer 工具可注册", pass: computerReg.has("mouse") && computerReg.has("keyboard") && computerReg.has("screenshot"), detail: "mouse/keyboard/screenshot 已注册" });

  console.log("═".repeat(50));
  console.log("B3 验收结论");
  console.log("═".repeat(50));
  let allPass = true;
  for (const c of checks) {
    console.log(`${c.pass ? "✓" : "✗"} ${c.name} — ${c.detail.replace(/\n/g, " ").slice(0, 50)}`);
    if (!c.pass) allPass = false;
  }
  console.log(`\n${allPass ? "✅ B3 验收通过：文件沙箱+shell+http 工作" : "❌ B3 验收失败"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("错误:", e);
  process.exit(1);
});
