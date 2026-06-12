import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import {
  readRunStore,
  type RunStoreReadResult,
  type RunTaskSource,
  type RealWorldEvalReport,
  type WorkflowEvent,
  type WorkflowResult,
} from "@keigent/engine";
import { KEIGENT_HOME } from "./config.js";
import { persistWorkflowAndLearn } from "./post-run.js";
import { executeWorkflowTask } from "./workflow-execution.js";

export interface WebRunExecutionRequest {
  id: string;
  goal: string;
  taskSource: RunTaskSource;
  onProgress: (event: WorkflowEvent) => void;
}

export interface WebRunExecutionResult {
  result: WorkflowResult;
  recordId?: string;
  recordPath?: string;
}

export interface WebApiServerOptions {
  runsDir?: string;
  evalReportsDir?: string;
  executeRun?: (request: WebRunExecutionRequest) => Promise<WebRunExecutionResult>;
  readRunStore?: (options: { runsDir: string }) => Promise<RunStoreReadResult>;
  readRealWorldEvalReport?: (options: { evalReportsDir: string; datasetId: string }) => Promise<RealWorldEvalReport | undefined>;
}

export interface StartWebApiServerOptions extends WebApiServerOptions {
  host?: string;
  port?: number;
}

export interface StartedWebApiServer {
  server: Server;
  url: string;
  close(): Promise<void>;
}

type SessionStatus = "running" | "succeeded" | "failed";

type StreamEvent =
  | { kind: "run_started"; runId: string; goal: string }
  | { kind: "workflow_event"; runId: string; event: WorkflowEvent }
  | { kind: "run_finished"; runId: string; workflowId: string; exitReason: WorkflowResult["exitReason"]; finalResponse: string; recordId?: string; recordPath?: string }
  | { kind: "run_error"; runId: string; message: string };

interface WebRunSession {
  id: string;
  goal: string;
  status: SessionStatus;
  events: StreamEvent[];
  clients: Set<ServerResponse>;
}

const DEFAULT_RUNS_DIR = join(KEIGENT_HOME, "runs");
const DEFAULT_EVAL_REPORTS_DIR = join(KEIGENT_HOME, "evals");
const DEFAULT_API_HOST = "127.0.0.1";
const DEFAULT_API_PORT = 5174;
const MAX_BODY_CHARS = 64_000;

export function createWebApiServer(options: WebApiServerOptions = {}): Server {
  const runsDir = options.runsDir ?? DEFAULT_RUNS_DIR;
  const evalReportsDir = options.evalReportsDir ?? evalReportsDirForRunsDir(runsDir);
  const readStore = options.readRunStore ?? readRunStore;
  const readEvalReport = options.readRealWorldEvalReport ?? readLatestRealWorldEvalReport;
  const executeRun = options.executeRun ?? defaultExecuteRun;
  const sessions = new Map<string, WebRunSession>();

  return createServer(async (request, response) => {
    setCorsHeaders(request, response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        writeJson(response, 200, { status: "ok", service: "keigent-web-api" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/runs") {
        writeJson(response, 200, await readStore({ runsDir }));
        return;
      }

      const evalReportMatch = /^\/api\/evals\/real-world\/([^/]+)\/latest$/.exec(url.pathname);
      if (request.method === "GET" && evalReportMatch) {
        const datasetId = decodeURIComponent(evalReportMatch[1]!);
        const report = await readEvalReport({ evalReportsDir, datasetId });
        if (!report) {
          writeJson(response, 404, { error: "eval report not found", datasetId });
          return;
        }
        writeJson(response, 200, report);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/runs") {
        await handleStartRun(request, response, sessions, executeRun);
        return;
      }

      const eventsMatch = /^\/api\/runs\/([^/]+)\/events$/.exec(url.pathname);
      if (request.method === "GET" && eventsMatch) {
        handleRunEvents(request, response, sessions, decodeURIComponent(eventsMatch[1]!));
        return;
      }

      writeJson(response, 404, { error: "not found" });
    } catch (error) {
      writeJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

async function readLatestRealWorldEvalReport(options: { evalReportsDir: string; datasetId: string }): Promise<RealWorldEvalReport | undefined> {
  const path = join(options.evalReportsDir, "real-world", options.datasetId, "latest.json");
  try {
    return JSON.parse(await readFile(path, "utf8")) as RealWorldEvalReport;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

function evalReportsDirForRunsDir(runsDir: string): string {
  return runsDir === DEFAULT_RUNS_DIR ? DEFAULT_EVAL_REPORTS_DIR : join(runsDir, "..", "evals");
}

export async function startWebApiServer(options: StartWebApiServerOptions = {}): Promise<StartedWebApiServer> {
  const host = options.host ?? DEFAULT_API_HOST;
  const port = options.port ?? DEFAULT_API_PORT;
  const server = createWebApiServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const url = `http://${displayHost(host)}:${port}`;
  return {
    server,
    url,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function defaultExecuteRun(request: WebRunExecutionRequest): Promise<WebRunExecutionResult> {
  const execution = await executeWorkflowTask({
    goal: request.goal,
    onProgress: request.onProgress,
  });
  const persisted = await persistWorkflowAndLearn(
    execution.result,
    execution.config,
    execution.learner,
    execution.skillBodies,
    { taskSource: "web", silent: true },
  );
  return {
    result: execution.result,
    recordId: persisted.record.id,
    recordPath: persisted.recordPath,
  };
}

async function handleStartRun(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, WebRunSession>,
  executeRun: (request: WebRunExecutionRequest) => Promise<WebRunExecutionResult>,
): Promise<void> {
  const payload = await readJsonBody(request);
  const goal = typeof payload.goal === "string" ? payload.goal.trim() : "";
  if (!goal) {
    writeJson(response, 400, { error: "goal is required" });
    return;
  }

  const id = `web_${randomUUID()}`;
  const session: WebRunSession = { id, goal, status: "running", events: [], clients: new Set() };
  sessions.set(id, session);
  publish(session, { kind: "run_started", runId: id, goal });

  void executeRun({
    id,
    goal,
    taskSource: "web",
    onProgress: (event) => publish(session, { kind: "workflow_event", runId: id, event }),
  }).then((output) => {
    session.status = output.result.exitReason === "success" ? "succeeded" : "failed";
    publish(session, {
      kind: "run_finished",
      runId: id,
      workflowId: output.result.workflowId,
      exitReason: output.result.exitReason,
      finalResponse: output.result.finalResponse,
      ...(output.recordId ? { recordId: output.recordId } : {}),
      ...(output.recordPath ? { recordPath: output.recordPath } : {}),
    });
    endClients(session);
  }).catch((error) => {
    session.status = "failed";
    publish(session, { kind: "run_error", runId: id, message: error instanceof Error ? error.message : String(error) });
    endClients(session);
  });

  writeJson(response, 202, {
    id,
    status: "running",
    eventsHref: `/api/runs/${encodeURIComponent(id)}/events`,
  });
}

function handleRunEvents(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, WebRunSession>,
  id: string,
): void {
  const session = sessions.get(id);
  if (!session) {
    writeJson(response, 404, { error: "run session not found" });
    return;
  }

  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  session.clients.add(response);
  for (const event of session.events) writeSse(response, event);

  if (session.status !== "running") {
    response.end();
    session.clients.delete(response);
    return;
  }

  request.once("close", () => {
    session.clients.delete(response);
  });
}

function publish(session: WebRunSession, event: StreamEvent): void {
  session.events.push(event);
  for (const client of session.clients) writeSse(client, event);
}

function writeSse(response: ServerResponse, event: StreamEvent): void {
  response.write(`event: ${event.kind}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function endClients(session: WebRunSession): void {
  for (const client of session.clients) client.end();
  session.clients.clear();
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of request) {
    raw += String(chunk);
    if (raw.length > MAX_BODY_CHARS) throw new Error("request body too large");
  }
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function setCorsHeaders(request: IncomingMessage, response: ServerResponse): void {
  const origin = Array.isArray(request.headers.origin) ? request.headers.origin[0] : request.headers.origin;
  if (origin && isLocalOrigin(origin)) response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  } catch {
    return false;
  }
}

function displayHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
