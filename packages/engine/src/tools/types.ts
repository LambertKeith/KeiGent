import type { TSchema } from "@earendil-works/pi-ai";
import type { Task } from "../types.js";

// ── 权限模型（借鉴 OpenHuman，从低到高）────────────────────────────────

export type PermissionLevel =
  | "readonly"    // 读操作，无副作用（file_read, web_fetch, screenshot）
  | "write"       // 写文件、改状态
  | "execute"     // 执行命令、浏览器操作
  | "dangerous";  // 不可逆/系统级（mouse, keyboard, rm -rf）

export type RiskLevel = "R0" | "R1" | "R2" | "R3" | "R4" | "R5";

export type SideEffect = "none" | "local" | "external";

export interface ApprovalRequest {
  toolName: string;
  args: Record<string, unknown>;
  permission: PermissionLevel;
  riskLevel: RiskLevel;
  sideEffect: SideEffect;
  reversible: boolean;
  action: string;
  targetResource: string;
  evidenceRequired: string[];
  exposesSecrets: boolean;
}

export interface ApprovalDecision {
  request: ApprovalRequest;
  approved: boolean;
  decidedAt: string;
}

// ── 审批门：dangerous 工具执行前需要过 ─────────────────────────────────

export interface ApprovalGate {
  /**
   * 请求执行某工具的授权。返回 true 放行，false 拒绝。
   * REPL 模式弹 [y/N]；自动模式可配置 allow/deny 策略。
   */
  request(request: ApprovalRequest): Promise<boolean>;
}

/** 默认审批门：全部放行（非交互场景）。CLI 会替换成交互式实现。 */
export class AllowAllGate implements ApprovalGate {
  async request(): Promise<boolean> {
    return true;
  }
}

export class DenyByDefaultGate implements ApprovalGate {
  async request(): Promise<boolean> {
    return false;
  }
}

// ── 浏览器会话句柄（B1 填充，B0 先占位）────────────────────────────────

export interface BrowserSession {
  // B1 实现：navigate/snapshot/click/...
  // B0 阶段只需类型存在
  [key: string]: unknown;
}

// ── 工具执行上下文 ────────────────────────────────────────────────────

export interface ToolContext {
  workspace: string;                  // file_* 沙箱根目录
  browser: BrowserSession | null;     // 共享浏览器会话（懒启动）
  approval: ApprovalGate;             // dangerous 工具审批
  task: Task;                         // 当前任务（兜底参数提取等）
  headless: boolean;                  // 浏览器可见性
  memoryDir?: string;                 // 记忆存储目录（memory_recall 用）
  askUser?: (question: string) => Promise<string>;  // 向用户提问（CLI 注入）
  signal?: AbortSignal;               // workflow 父级取消信号
  onApprovalDecision?: (decision: ApprovalDecision) => void;
}

// ── 工具结果 ──────────────────────────────────────────────────────────

export interface ToolResult {
  content: string;                    // 给 LLM 的文本结果
  isError: boolean;
  image?: { data: string; mimeType: string };  // 截图等多模态产物
  sources?: EvidenceSource[];
}

export interface EvidenceSource {
  kind: "url" | "workspace_path" | "browser_state" | "file";
  ref: string;
  connector: string;
}

export function ok(content: string, image?: ToolResult["image"], sources?: EvidenceSource[]): ToolResult {
  return { content, isError: false, ...(image ? { image } : {}), ...(sources ? { sources } : {}) };
}

export function err(message: string): ToolResult {
  return { content: `[错误] ${message}`, isError: true };
}

// ── 工具定义 ──────────────────────────────────────────────────────────

export interface ToolDef {
  name: string;
  description: string;
  parameters: TSchema;                // TypeBox schema（与 pi-ai 一致）
  permission: PermissionLevel;
  riskLevel: RiskLevel;
  sideEffect: SideEffect;
  reversible: boolean;
  concurrencySafe?: boolean;
  /** 单工具超时（ms），默认 60s。 */
  timeoutMs?: number;
  /** 结果截断上限（字符），默认 30000。 */
  maxOutputChars?: number;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
