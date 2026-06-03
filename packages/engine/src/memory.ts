import { vlog, vwarn } from "./logger.js";
import { appendFile, readFile, mkdir } from "fs/promises";
import { join } from "path";
import type { LoopState } from "./types.js";

// ── 记忆条目结构 ──────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  timestamp: string;
  profile: string;
  goal: string;
  skillsUsed: string[];
  finalResponse: string;
  exitReason: string;
  checkpointsPassed: number;
  iterations: number;
  // 关键词索引（从 goal + finalResponse 提取，用于召回）
  keywords: string[];
}

// ── JSONL 记忆存储 ────────────────────────────────────────────────────

export class MemoryStore {
  private readonly filePath: string;

  constructor(baseDir: string) {
    this.filePath = join(baseDir, "memory.jsonl");
  }

  async write(entry: MemoryEntry): Promise<void> {
    const dir = join(this.filePath, "..");
    await mkdir(dir, { recursive: true });
    await appendFile(this.filePath, JSON.stringify(entry) + "\n", "utf-8");
    vlog(`[memory] 写入条目: goal="${entry.goal.slice(0, 40)}" exit=${entry.exitReason}`);
  }

  async recall(query: string, limit = 5): Promise<MemoryEntry[]> {
    let content = "";
    try {
      content = await readFile(this.filePath, "utf-8");
    } catch {
      return [];
    }

    const entries: MemoryEntry[] = content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try { return JSON.parse(line) as MemoryEntry; }
        catch { return null; }
      })
      .filter((e): e is MemoryEntry => e !== null);

    if (entries.length === 0) return [];

    // 关键词匹配召回（无向量，简单但有效）
    const queryWords = tokenize(query);
    const scored = entries.map((e) => ({
      entry: e,
      score: scoreEntry(e, queryWords),
    }));

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.entry);
  }
}

// ── 关键词提取和评分 ──────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^一-龥a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function scoreEntry(entry: MemoryEntry, queryWords: string[]): number {
  const entryText = [entry.goal, entry.finalResponse, ...entry.keywords].join(" ").toLowerCase();
  let score = 0;
  for (const word of queryWords) {
    if (entryText.includes(word)) score += 1;
  }
  // 成功的执行权重更高
  if (entry.exitReason === "success") score *= 1.5;
  return score;
}

// ── WriteThrough 策略实现 ─────────────────────────────────────────────

export class WriteThroughMemory {
  private readonly store: MemoryStore;

  constructor(memoryDir: string) {
    this.store = new MemoryStore(memoryDir);
  }

  async persist(state: LoopState, skillsUsed: string[]): Promise<void> {
    if (!state.finalResponse) return;

    const entry: MemoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      profile: state.task.profile,
      goal: state.task.goal,
      skillsUsed,
      finalResponse: state.finalResponse.slice(0, 500),
      exitReason: state.failed ? "error" : "success",
      checkpointsPassed: state.checkpointCount,
      iterations: state.iteration,
      keywords: extractKeywords(state.task.goal + " " + state.finalResponse),
    };

    await this.store.write(entry);
  }

  async recall(query: string, limit = 3): Promise<string> {
    const entries = await this.store.recall(query, limit);
    if (entries.length === 0) return "";

    return entries
      .map((e, i) => `[记忆 ${i + 1}] ${e.goal}\n结果: ${e.finalResponse.slice(0, 150)}`)
      .join("\n\n");
  }
}

function extractKeywords(text: string): string[] {
  const words = tokenize(text);
  // 去重，过滤停用词，取前 20 个
  const stopWords = new Set(["的", "了", "是", "在", "和", "或", "这", "那", "请", "用", "不", "to", "the", "a", "an", "is", "are", "and", "or"]);
  return [...new Set(words)]
    .filter((w) => !stopWords.has(w) && w.length > 1)
    .slice(0, 20);
}
