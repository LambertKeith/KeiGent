/**
 * B1 验收脚本：验证浏览器工具的 snapshot+ref+click 真实流程。
 * 不调 LLM，直接驱动 BrowserSession 完成多步操作。
 *
 * 流程：导航 example.com → 快照（应看到 "More information" 链接）
 *       → 用 ref 点击 → 验证跳转到 iana.org
 */
import { BrowserSession, closeBrowser } from "./browser.js";

async function main() {
  const headless = !process.argv.includes("--headed");
  console.log(`=== B1 浏览器工具验收（headless=${headless}）===\n`);

  const session = new BrowserSession(headless);
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  // 1. 导航
  const navResult = await session.navigate("https://example.com");
  console.log(`[1] navigate → ${navResult}`);
  checks.push({
    name: "导航成功",
    pass: navResult.includes("example.com"),
    detail: navResult,
  });

  // 2. 快照——应看到可交互元素（example.com 有一个 "More information..." 链接）
  const snap = await session.snapshot();
  console.log(`\n[2] snapshot → ${snap.entries.length} 个可交互元素:`);
  for (const e of snap.entries) {
    console.log(`     [${e.ref}] <${e.tag}> "${e.text}" ${e.attrs}`);
  }
  const linkEntry = snap.entries.find(
    (e) => e.tag === "a" && (e.text.includes("More") || e.attrs.includes("iana")),
  );
  checks.push({
    name: "快照识别到链接元素",
    pass: !!linkEntry,
    detail: linkEntry ? `找到 ${linkEntry.ref}: "${linkEntry.text}"` : "未找到链接",
  });

  // 3. 用 ref 点击链接
  if (linkEntry) {
    const clickResult = await session.click(linkEntry.ref);
    console.log(`\n[3] click ${linkEntry.ref} → ${clickResult}`);
    // 4. 验证跳转（example.com 的链接指向 iana.org）
    const afterText = await session.getText();
    const jumped = clickResult.includes("iana") || afterText.toLowerCase().includes("iana");
    checks.push({
      name: "ref 点击触发跳转",
      pass: jumped,
      detail: jumped ? "已跳转到 IANA 页面" : `点击后内容: ${afterText.slice(0, 80)}`,
    });
  }

  // ── 验收结论 ──────────────────────────────────────────────────
  console.log(`\n${"═".repeat(50)}`);
  console.log("B1 验收结论");
  console.log("═".repeat(50));
  let allPass = true;
  for (const c of checks) {
    console.log(`${c.pass ? "✓" : "✗"} ${c.name} — ${c.detail}`);
    if (!c.pass) allPass = false;
  }
  console.log(`\n${allPass ? "✅ B1 验收通过：snapshot+ref+click 多步流程工作" : "❌ B1 验收失败"}`);

  await closeBrowser();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error("错误:", err);
  await closeBrowser();
  process.exit(1);
});
