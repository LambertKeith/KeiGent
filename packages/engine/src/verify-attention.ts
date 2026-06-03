/**
 * S1 验收脚本：验证 attention 旋钮真的控制 skill body 注入篇数。
 *
 * 这是"收敛比发散更不跑偏"核心假设的物理基础——若两个 profile 注入
 * 的 body 完全相同，核心假设就无从谈起。本脚本不调 LLM，只检查注入产物。
 */
import { join } from "path";
import { fileURLToPath } from "url";
import { loadSkillContext } from "./skills.js";
import { NarrowAttention, WideAttention } from "./profiles/strategies.js";
import type { Task } from "./types.js";

async function main() {
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const skillsDir = join(__dirname, "../../../skills");

  const skillContext = await loadSkillContext(skillsDir);
  console.log(`\n[verify] 加载 skill 数: ${skillContext.metas.length}`);
  console.log(`[verify] skill 列表: ${skillContext.metas.map((m) => m.name).join(", ")}\n`);

  // 一个同时涉及"抓取/总结"和"提取数据"的任务——两个 skill 都可能命中
  const task: Task = {
    goal: "请抓取 https://example.com 并提取页面中的结构化数据，然后总结。",
    profile: "auto",
  };

  const narrow = new NarrowAttention("sys", [["fetch_url"], ["request_verification"]]);
  const wide = new WideAttention("sys");

  // 收敛匹配 + 注入
  narrow.reset();
  const narrowMatched = narrow.matchSkills(task, skillContext.metas);
  const narrowInjection = await narrow.renderInjection(narrowMatched, skillContext);
  const narrowSkillCount = (narrowInjection.match(/<skill /g) || []).length;

  console.log(`\n── 收敛（NarrowAttention）──`);
  console.log(`  matchSkills 返回: [${narrowMatched.join(", ")}]`);
  console.log(`  实际注入 body 篇数: ${narrowSkillCount}`);
  console.log(`  注入字节: ${Buffer.byteLength(narrowInjection, "utf-8")}`);

  // 发散匹配 + 注入
  wide.reset();
  const wideMatched = wide.matchSkills(task, skillContext.metas);
  const wideInjection = await wide.renderInjection(wideMatched, skillContext);
  const wideSkillCount = (wideInjection.match(/<skill /g) || []).length;

  console.log(`\n── 发散（WideAttention）──`);
  console.log(`  matchSkills 返回: [${wideMatched.join(", ")}]`);
  console.log(`  实际注入 body 篇数: ${wideSkillCount}`);
  console.log(`  注入字节: ${Buffer.byteLength(wideInjection, "utf-8")}`);

  // ── 验收断言 ──────────────────────────────────────────────────
  console.log(`\n${"═".repeat(50)}`);
  console.log("S1 验收结论");
  console.log("═".repeat(50));

  const checks: { name: string; pass: boolean; detail: string }[] = [
    {
      name: "收敛最多注入 1 篇 body",
      pass: narrowSkillCount <= 1,
      detail: `实际 ${narrowSkillCount} 篇`,
    },
    {
      name: "发散注入篇数 ≥ 收敛（多 skill 命中时严格大于）",
      pass: wideSkillCount >= narrowSkillCount,
      detail: `发散 ${wideSkillCount} vs 收敛 ${narrowSkillCount}`,
    },
    {
      name: "多 skill 场景下两者注入确实不同",
      pass: skillContext.metas.length < 2 || wideSkillCount > narrowSkillCount,
      detail: skillContext.metas.length < 2
        ? "skill 不足 2 个，无法验证差异（跳过）"
        : `发散 ${wideSkillCount} > 收敛 ${narrowSkillCount} = ${wideSkillCount > narrowSkillCount}`,
    },
  ];

  let allPass = true;
  for (const c of checks) {
    const mark = c.pass ? "✓" : "✗";
    console.log(`${mark} ${c.name} — ${c.detail}`);
    if (!c.pass) allPass = false;
  }

  console.log(`\n${allPass ? "✅ S1 验收通过：attention 旋钮真正控制注入篇数" : "❌ S1 验收失败：核心假设物理基础不成立"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("错误:", err);
  process.exit(1);
});
