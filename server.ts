import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "node:fs";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { exportToComfyApiPrompt } from "./src/lib/comfyFormat";

dotenv.config();

const execFileAsync = promisify(execFile);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Created on first use — the Gemini SDK warns at construction when no key is set. */
let ai: GoogleGenAI | null = null;

/**
 * Gemini client. A key entered in Settings takes precedence over the server's
 * GEMINI_API_KEY; the default (env) client is cached.
 */
function gemini(key?: string): GoogleGenAI {
  const options = {
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  };
  if (!key) {
    if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, ...options });
    return ai;
  }
  return new GoogleGenAI({ apiKey: key, ...options });
}

/** Chat message accepted by OpenAI-compatible endpoints. */
interface ChatMessage {
  role: string;
  content: string;
}

/**
 * Calls an OpenAI-compatible /chat/completions endpoint.
 * The portal AI bridge serves both /chat/completions and /v1/chat/completions,
 * so we try the plain path first and only retry on 404/405 (a missing route),
 * never on 401/403 — those mean the key was rejected, not that the URL is wrong.
 */
async function chatCompletions(opts: {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  jsonMode?: boolean;
}): Promise<string> {
  const base = opts.endpoint.replace(/\/+$/, '');
  const urls = [`${base}/chat/completions`];
  if (!/\/v\d+$/.test(base)) urls.push(`${base}/v1/chat/completions`);

  let lastError = '';
  for (const url of urls) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: 0.7,
        ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    lastError = `${res.status} - ${await res.text()}`;
    if (res.status !== 404 && res.status !== 405) break;
  }

  throw new Error(`OpenAI-compatible endpoint error: ${lastError}`);
}

/* ------------------------------------------------- local interpreters (SQL / code) */

let pythonBinPromise: Promise<string | null> | null = null;

/** Finds a working Python interpreter (`python3`, `python` or `py`). */
function detectPython(): Promise<string | null> {
  if (!pythonBinPromise) {
    pythonBinPromise = (async () => {
      for (const bin of ["python3", "python", "py"]) {
        try {
          const { stdout } = await execFileAsync(bin, ["--version"], { timeout: 5000 });
          if (/Python \d/i.test(stdout)) return bin;
        } catch {
          // missing binary or a Windows Store stub — try the next candidate
        }
      }
      return null;
    })();
  }
  return pythonBinPromise;
}

/** Runs a single SQL statement against a scratch SQLite file. */
async function runSqlite(query: string, dbBuffer?: Buffer): Promise<Record<string, unknown>> {
  const bin = await detectPython();
  if (!bin) throw new Error("No Python interpreter on the server — SQL execution is unavailable.");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comfyforge-sql-"));
  const dbPath = path.join(dir, "work.db");
  const queryPath = path.join(dir, "query.sql");
  const scriptPath = path.join(dir, "runner.py");

  const runner = `
import json, sqlite3, sys

db_path, query_path = sys.argv[1], sys.argv[2]
with open(query_path, "r", encoding="utf-8") as fh:
    query = fh.read()

con = sqlite3.connect("file:" + db_path + "?mode=rw", uri=True)
con.text_factory = str
cur = con.cursor()
cur.execute(query)
if cur.description:
    columns = [d[0] for d in cur.description]
    rows = cur.fetchmany(200)
    more = cur.fetchone() is not None
    print(json.dumps({"columns": columns, "rows": [list(r) for r in rows], "truncated": more}, default=str))
else:
    con.commit()
    print(json.dumps({"columns": [], "rows": [], "changes": max(cur.rowcount, 0)}))
con.close()
`;

  try {
    fs.writeFileSync(dbPath, dbBuffer ?? Buffer.alloc(0));
    fs.writeFileSync(queryPath, query, "utf8");
    fs.writeFileSync(scriptPath, runner, "utf8");
    const { stdout } = await execFileAsync(bin, [scriptPath, dbPath, queryPath], { timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
    const parsed = JSON.parse(stdout.trim() || "{}");
    // Hand the resulting database back so the client keeps DDL/DML between runs.
    parsed.sqliteBase64 = fs.readFileSync(dbPath).toString("base64");
    return parsed;
  } catch (err: any) {
    // Keep only SQLite's own verdict — never the temp paths or the command line.
    const stderr = String(err?.stderr || err?.message || "").trim();
    const lines = stderr.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
    const verdict = [...lines].reverse().find((l: string) => /error|exception/i.test(l)) || lines[lines.length - 1] || "SQL execution failed.";
    throw new Error(verdict);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup of the scratch dir
    }
  }
}

/** Rejects statements that could touch files outside the scratch database. */
function assertSafeSql(query: string): void {
  const stripped = query.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  const first = (stripped.split(/[\s;(]+/)[0] || "").toUpperCase();
  const allowed = new Set(["SELECT", "WITH", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "PRAGMA", "EXPLAIN", "BEGIN", "COMMIT", "ROLLBACK", "REINDEX", "ANALYZE"]);
  const forbidden = /\b(ATTACH|DETACH|VACUUM|LOAD_EXTENSION)\b/i;
  if (!allowed.has(first)) throw new Error(`Only read/write statements on the scratch database are allowed (got "${first || "empty"}").`);
  if (forbidden.test(stripped)) throw new Error("ATTACH/DETACH/VACUUM/LOAD_EXTENSION are not allowed.");
}

/* ------------------------------------------------------------- ComfyUI client */

function comfyBaseUrl(raw?: string): string {
  const url = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!url) throw new Error("No ComfyUI server URL configured — set it in Settings & AI Provider.");
  if (!/^https?:\/\//i.test(url)) throw new Error(`ComfyUI URL must start with http:// or https:// (got "${url}").`);
  return url;
}

async function comfyFetch(base: string, pathQuery: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${base}${pathQuery}`, init);
  } catch (err: any) {
    throw new Error(`ComfyUI unreachable at ${base}: ${err?.message || err}`);
  }
}

/** Turns ComfyUI's per-node validation errors into readable one-liners. */
function formatNodeErrors(nodeErrors: Record<string, any>, prompt: Record<string, any>): string[] {
  return Object.entries(nodeErrors).map(([id, entry]: [string, any]) => {
    const messages = Array.isArray(entry?.errors)
      ? entry.errors.map((e: any) => e?.message || JSON.stringify(e)).join("; ")
      : JSON.stringify(entry);
    const title = entry?.class_info?.title || prompt[id]?.class_type || id;
    return `${title} (${id}): ${messages}`;
  });
}

/** Extracts a human readable verdict from any ComfyUI error body shape. */
function formatSubmitError(body: any, prompt: Record<string, any>): string {
  if (body?.node_errors && Object.keys(body.node_errors).length) {
    return formatNodeErrors(body.node_errors, prompt).join(" | ");
  }
  const candidates = [body?.error, body?.detail, body?.message, body?.type];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.slice(0, 600);
    if (candidate && typeof candidate === 'object') {
      const text = String(candidate.message || candidate.type || JSON.stringify(candidate));
      const extra = candidate.details ? ` — ${candidate.details}` : '';
      return `${text}${extra}`.slice(0, 600);
    }
  }
  return JSON.stringify(body || {}).slice(0, 600);
}

/** Node classes installed on a ComfyUI server (cached for 10 minutes). */
let classCache: { at: number; base: string; names: Set<string> } | null = null;

async function knownClassTypes(base: string): Promise<Set<string> | null> {
  if (classCache && classCache.base === base && Date.now() - classCache.at < 10 * 60_000) return classCache.names;
  try {
    const res = await comfyFetch(base, "/object_info");
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const names = new Set(Object.keys(data));
    classCache = { at: Date.now(), base, names };
    return names;
  } catch {
    return null; // server unreachable — the submit itself will report that
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  // AI Copilot Chat Endpoint (Supports Gemini or OpenAI-Compatible Endpoint)
  app.post("/api/copilot/chat", async (req, res) => {
    try {
      const { message, workflowContext, providerConfig, history } = req.body;

      const systemInstruction = `You are ComfyForge AI Copilot, an expert AI assistant embedded inside a 100% ComfyUI-compatible development environment supporting multi-format nodes (sql, .mdf/.ndf/.ldf, sqlite, db, dbm, bat, sh, py, ps1, cmd, text, md, json, csv).
You have full context of the user's active workflow, nodes, connections, and execution state.
Be concise, technical, and precise.`;

      const promptContext = `
Active Workflow State:
${JSON.stringify(workflowContext, null, 2)}

User Request: ${message}
`;

      if (providerConfig && providerConfig.provider === 'openai_compatible') {
        const endpoint = providerConfig.endpoint || 'https://api.openai.com/v1';
        const apiKey = providerConfig.apiKey || process.env.OPENAI_API_KEY || '';
        const model = providerConfig.llmModel || 'gpt-4o';
        if (!apiKey) {
          throw new Error('No API key for the OpenAI-compatible endpoint — open "Settings & AI Provider" and save your key.');
        }

        const past: ChatMessage[] = Array.isArray(history)
          ? history
              .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
              .map((m: any) => ({ role: m.role, content: m.content }))
          : [];

        const reply =
          (await chatCompletions({
            endpoint,
            apiKey,
            model,
            messages: [
              { role: 'system', content: systemInstruction },
              ...past,
              { role: 'user', content: promptContext },
            ],
          })) || 'No response from OpenAI compatible endpoint.';
        return res.json({ success: true, reply });
      }

      const geminiKey = providerConfig?.apiKey || process.env.GEMINI_API_KEY || '';
      if (!geminiKey) {
        throw new Error('No Gemini API key — enter one in "Settings & AI Provider" or set GEMINI_API_KEY on the server.');
      }

      // Default to Gemini
      const response = await gemini(geminiKey).models.generateContent({
        model: providerConfig?.llmModel || "gemini-3.8-flash",
        contents: promptContext,
        config: { systemInstruction },
      });

      res.json({
        success: true,
        reply: response.text || "I've analyzed your workflow graph.",
      });
    } catch (error: any) {
      console.error("Copilot Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to generate copilot response.",
      });
    }
  });

  app.post("/api/copilot/generate-node", async (req, res) => {
    try {
      const { prompt, providerConfig } = req.body;

      const promptText = `Create a 100% ComfyUI-compatible custom node specification in JSON format supporting multi-format files (sql, .mdf/.ndf/.ldf, sqlite, db, dbm, bat, sh, py, ps1, cmd, text, md, json, csv) based on this prompt: "${prompt}".
Return a JSON object with:
{
  "name": "Node Name",
  "category": "category name",
  "description": "node description",
  "inputs": [{"name": "input_name", "type": "STRING|INT|FLOAT|MODEL|LATENT|IMAGE|SQL|DATA", "default": "value"}],
  "outputs": [{"name": "output_name", "type": "MODEL|LATENT|IMAGE|SQL|DATA"}],
  "pythonCode": "class MyCustomNode:\\n    @classmethod\\n    def INPUT_TYPES(s):\\n        return {...}\\n    RETURN_TYPES = (...)\\n    FUNCTION = \\"execute\\"\\n    def execute(self, ...):\\n        return (...)"
}`;

      if (providerConfig && providerConfig.provider === 'openai_compatible') {
        const endpoint = providerConfig.endpoint || 'https://api.openai.com/v1';
        const apiKey = providerConfig.apiKey || process.env.OPENAI_API_KEY || '';
        const model = providerConfig.llmModel || 'gpt-4o';
        if (!apiKey) {
          throw new Error('No API key for the OpenAI-compatible endpoint — open "Settings & AI Provider" and save your key.');
        }

        const content = await chatCompletions({
          endpoint,
          apiKey,
          model,
          jsonMode: true,
          messages: [
            { role: 'system', content: 'You are an expert ComfyUI custom node developer. Output strictly valid JSON.' },
            { role: 'user', content: promptText },
          ],
        });

        const nodeSpec = JSON.parse(content || '{}');
        return res.json({ success: true, node: nodeSpec });
      }

      const geminiKey = providerConfig?.apiKey || process.env.GEMINI_API_KEY || '';
      if (!geminiKey) {
        throw new Error('No Gemini API key — enter one in "Settings & AI Provider" or set GEMINI_API_KEY on the server.');
      }

      const response = await gemini(geminiKey).models.generateContent({
        model: providerConfig?.llmModel || "gemini-3.8-flash",
        contents: promptText,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "You are an expert ComfyUI custom node developer. Output strictly valid JSON.",
        },
      });

      const nodeSpec = JSON.parse(response.text || "{}");
      res.json({ success: true, node: nodeSpec });
    } catch (error: any) {
      console.error("Generate Node Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Queues the workflow on a real ComfyUI server.
   *
   * Without a configured server URL the response is explicitly flagged
   * `simulation: true` — the UI shows that as a simulation, never as a run.
   */
  app.post("/api/workflow/execute", async (req, res) => {
    const executionId = "exec_" + Math.random().toString(36).substring(2, 9);
    const startedAt = Date.now();
    const steps: { progress: number; message: string }[] = [];

    try {
      const { workflow, comfyui } = req.body || {};
      if (!Array.isArray(workflow?.nodes) || workflow.nodes.length === 0) {
        throw new Error("Workflow has no nodes — add some before queueing a prompt.");
      }

      const prompt = exportToComfyApiPrompt(workflow);
      steps.push({ progress: 15, message: `Built ComfyUI API prompt from ${Object.keys(prompt).length} node(s).` });

      let baseUrl: string;
      const requestedUrl = String(comfyui?.baseUrl ?? process.env.COMFYUI_URL ?? "").trim();
      if (!requestedUrl) {
        steps.push({ progress: 100, message: "Simulation only — no ComfyUI server URL configured in Settings." });
        return res.json({
          success: true,
          simulation: true,
          executionId,
          steps,
          durationMs: Date.now() - startedAt,
        });
      }
      baseUrl = comfyBaseUrl(requestedUrl);

      // Fail fast (and completely) on node types this ComfyUI does not know.
      const known = await knownClassTypes(baseUrl);
      if (known) {
        const missing = Object.values(prompt)
          .filter((entry) => entry.class_type && !known.has(entry.class_type))
          .map((entry) => `${entry._meta?.title || entry.class_type} [${entry.class_type}]`);
        if (missing.length > 0) {
          throw new Error(
            `Not available on ${baseUrl}: ${[...new Set(missing)].join(", ")}. Remove those nodes from the workflow or install the matching custom nodes on ComfyUI.`
          );
        }
      }

      const submitRes = await comfyFetch(baseUrl, "/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const submitData: any = await submitRes.json().catch(() => ({}));

      const nodeErrors =
        submitData.node_errors && Object.keys(submitData.node_errors).length ? submitData.node_errors : null;

      if (!submitRes.ok) {
        throw new Error(
          `ComfyUI rejected the prompt (HTTP ${submitRes.status}) — ${formatSubmitError(submitData, prompt)}`
        );
      }

      if (nodeErrors) {
        throw new Error(`ComfyUI reported node errors — ${formatNodeErrors(nodeErrors, prompt).join(" | ")}`);
      }

      const promptId = submitData.prompt_id;
      if (!promptId) throw new Error("ComfyUI did not return a prompt_id.");
      steps.push({ progress: 40, message: `Submitted to ${baseUrl} — prompt ${promptId}.` });

      // Poll history. 90s cap: Cloudflare's own edge timeout is 100s.
      const deadline = Date.now() + 90_000;
      let record: any = null;
      while (Date.now() < deadline) {
        const histRes = await comfyFetch(baseUrl, `/history/${encodeURIComponent(promptId)}`);
        if (histRes.ok) {
          const hist = await histRes.json().catch(() => ({}));
          record = hist?.[promptId];
          const status = record?.status;
          if (record && (status?.completed === true || (status?.status_str && status.status_str !== "running"))) break;
        }
        await sleep(500);
      }
      if (!record) throw new Error(`ComfyUI did not finish prompt ${promptId} within 90s.`);

      const status = record.status || {};
      if (status.status_str === "error") {
        const messages: string[] = Array.isArray(status.messages)
          ? status.messages
              .filter((m: any) => Array.isArray(m) && m[1]?.exception_type)
              .map((m: any) => `${m[1].exception_type}: ${m[1].exception_message}`)
          : [];
        throw new Error(`Execution failed on ComfyUI — ${messages.join(" | ") || "see the ComfyUI console for details."}`);
      }
      steps.push({ progress: 75, message: `ComfyUI finished with status "${status.status_str || "success"}".` });

      const outputs: string[] = [];
      Object.values(record.outputs || {}).forEach((out: any) => {
        (out?.images || []).forEach((img: any) => {
          const query = new URLSearchParams({
            filename: img.filename || "",
            subfolder: img.subfolder || "",
            type: img.type || "output",
            baseUrl,
          });
          outputs.push(`/api/comfy/view?${query.toString()}`);
        });
      });

      const durationMs = Date.now() - startedAt;
      steps.push({ progress: 100, message: `Execution completed: ${outputs.length} output image(s) in ${(durationMs / 1000).toFixed(1)}s.` });

      res.json({ success: true, executionId, promptId, steps, outputs, previewUrl: outputs[0] || null, durationMs });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        executionId,
        steps,
        error: error.message || "Execution failed.",
        durationMs: Date.now() - startedAt,
      });
    }
  });

  /** Streams an output image back from ComfyUI (keeps the ComfyUI URL server-side). */
  app.get("/api/comfy/view", async (req, res) => {
    try {
      const { filename, subfolder, type, baseUrl } = req.query as Record<string, string>;
      if (!filename) throw new Error("filename is required.");
      const base = comfyBaseUrl(baseUrl);
      const query = new URLSearchParams({ filename, subfolder: subfolder || "", type: type || "output" });
      const upstream = await comfyFetch(base, `/view?${query.toString()}`);
      if (!upstream.ok) throw new Error(`ComfyUI /view failed with HTTP ${upstream.status}.`);
      const contentType = upstream.headers.get("content-type") || "image/png";
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.set("Content-Type", contentType).set("Cache-Control", "private, max-age=3600").send(buffer);
    } catch (error: any) {
      res.status(502).json({ success: false, error: error.message });
    }
  });

  /** Real syntax check: `py_compile` / `node --check` (parse only — code is never executed). */
  app.post("/api/code/validate", async (req, res) => {
    try {
      const { language, code } = req.body || {};
      if (typeof code !== "string" || !code.trim()) throw new Error("There is no code to check.");
      if (language !== "python" && language !== "javascript") throw new Error("Language must be 'python' or 'javascript'.");

      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comfyforge-code-"));
      try {
        if (language === "python") {
          const bin = await detectPython();
          if (!bin) throw new Error("No Python interpreter on the server — syntax check is unavailable.");
          const file = path.join(dir, "snippet.py");
          fs.writeFileSync(file, code, "utf8");
          try {
            await execFileAsync(bin, ["-m", "py_compile", file], { timeout: 15000 });
            res.json({ success: true, language, message: "Python syntax OK — compiled without errors." });
          } catch (err: any) {
            const detail = String(err.stderr || err.stdout || err.message || "Compilation failed.")
              .split(file)
              .join("snippet.py")
              .trim();
            res.json({ success: false, language, message: detail });
          }
        } else {
          const file = path.join(dir, "snippet.mjs");
          fs.writeFileSync(file, code, "utf8");
          try {
            await execFileAsync(process.execPath, ["--check", file], { timeout: 15000 });
            res.json({ success: true, language, message: "JavaScript syntax OK — parsed without errors." });
          } catch (err: any) {
            const detail = String(err.stderr || err.stdout || err.message || "Parse failed.")
              .split(file)
              .join("snippet.mjs")
              .trim();
            res.json({ success: false, language, message: detail });
          }
        }
      } finally {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // best-effort cleanup
        }
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /** Runs one statement against a scratch SQLite database (uploaded file or empty). */
  app.post("/api/sql/query", async (req, res) => {
    try {
      const { query, sqliteBase64 } = req.body || {};
      if (typeof query !== "string" || !query.trim()) throw new Error("Write a SQL statement first.");
      assertSafeSql(query);

      let buffer: Buffer | undefined;
      if (typeof sqliteBase64 === "string" && sqliteBase64) {
        buffer = Buffer.from(sqliteBase64.replace(/^data:[^,]*;base64,/, ""), "base64");
        if (buffer.length === 0) throw new Error("The uploaded database file could not be decoded.");
      }

      const started = Date.now();
      const result = await runSqlite(query, buffer);
      res.json({ success: true, durationMs: Date.now() - started, ...result });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  /** Tables/columns of the scratch database — used by the schema graph. */
  app.post("/api/sql/schema", async (req, res) => {
    try {
      const { sqliteBase64 } = req.body || {};
      const bin = await detectPython();
      if (!bin) throw new Error("No Python interpreter on the server — schema inspection is unavailable.");

      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comfyforge-schema-"));
      const dbPath = path.join(dir, "work.db");
      const scriptPath = path.join(dir, "schema.py");
      try {
        const buffer =
          typeof sqliteBase64 === "string" && sqliteBase64
            ? Buffer.from(sqliteBase64.replace(/^data:[^,]*;base64,/, ""), "base64")
            : Buffer.alloc(0);
        fs.writeFileSync(dbPath, buffer);

        const runner = `
import json, sqlite3, sys

con = sqlite3.connect("file:" + sys.argv[1] + "?mode=rw", uri=True)
cur = con.cursor()
cur.execute("SELECT name, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
tables = []
for name, ddl in cur.fetchall():
    cols = []
    for col in con.execute("PRAGMA table_info(%s)" % json.dumps(name)):
        cols.append({"name": col[1], "type": col[2] or "TEXT", "pk": bool(col[5])})
    tables.append({"name": name, "columns": cols, "ddl": ddl})
con.close()
print(json.dumps({"tables": tables}))
`;
        fs.writeFileSync(scriptPath, runner, "utf8");
        const { stdout } = await execFileAsync(bin, [scriptPath, dbPath], { timeout: 15000 });
        const parsed = JSON.parse(stdout.trim() || '{"tables":[]}');
        res.json({ success: true, ...parsed });
      } finally {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // best-effort cleanup
        }
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ------------------------------------------- AI provider: models & test */

  /** Reads any known /models response shape into a plain, deduped list. */
  function extractModelNames(payload: unknown): string[] {
    const names: string[] = [];
    const push = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) {
        names.push(value.trim());
      } else if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const candidate = record.id ?? record.name ?? record.model;
        if (typeof candidate === 'string' && candidate.trim()) names.push(candidate.trim());
      }
    };
    const body = payload as Record<string, unknown> | null;
    if (Array.isArray(payload)) payload.forEach(push);
    else if (body && Array.isArray(body.data)) (body.data as unknown[]).forEach(push);
    else if (body && Array.isArray(body.models)) (body.models as unknown[]).forEach(push);
    else if (body && Array.isArray(body.results)) (body.results as unknown[]).forEach(push);
    return [...new Set(names)];
  }

  /** Fetch with a timeout that turns network failures into readable messages. */
  async function providerFetch(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch (err: any) {
      const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      const cause = err?.cause?.code || err?.cause?.message || err?.message || String(err);
      throw new Error(timeout ? `Timed out after 10s reaching ${url}` : `Cannot reach ${url} (${cause}).`);
    }
  }

  function providerError(status: number, text: string): string {
    if (status === 401 || status === 403) return `The endpoint rejected the key (HTTP ${status}) — check the API key.`;
    if (status === 404) return 'No /models endpoint at this address (HTTP 404).';
    // Prefer the provider's own message (Google/OpenAI both nest one under error.message).
    try {
      const parsed = JSON.parse(text);
      const message = parsed?.error?.message || parsed?.message;
      if (typeof message === 'string' && message.trim()) return `${message.trim()} (HTTP ${status})`;
    } catch {
      // not JSON — fall through to the raw snippet
    }
    return `Model list request failed (HTTP ${status}): ${text.slice(0, 300)}`;
  }

  /**
   * Model catalogue for the Settings dropdown. Server-side on purpose: no CORS
   * problems and the key travels server → provider instead of browser → provider.
   */
  app.post('/api/ai/models', async (req, res) => {
    try {
      const { provider, endpoint, apiKey } = req.body || {};
      const key = String(apiKey || '').trim();

      if (provider === 'gemini') {
        if (!key) throw new Error('Enter your Gemini API key first.');
        const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
        url.searchParams.set('key', key);
        url.searchParams.set('pageSize', '200');
        const upstream = await providerFetch(url.toString(), { method: 'GET' });
        if (!upstream.ok) throw new Error(providerError(upstream.status, await upstream.text().catch(() => '')));
        const payload = await upstream.json().catch(() => null);
        const models = extractModelNames(payload)
          .map((name) => name.replace(/^models\//, ''))
          .sort();
        if (!models.length) throw new Error('The Gemini endpoint returned no models.');
        return res.json({ success: true, models, source: 'generativelanguage.googleapis.com/v1beta/models' });
      }

      const base = String(endpoint || '').trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(base)) throw new Error('Endpoint must start with http:// or https://.');
      const urls = /\/v\d+$/.test(base) ? [`${base}/models`] : [`${base}/models`, `${base}/v1/models`];

      let lastNote = '';
      for (const url of urls) {
        const upstream = await providerFetch(url, {
          method: 'GET',
          headers: key ? { Authorization: `Bearer ${key}` } : {},
        });
        if (upstream.ok) {
          const payload = await upstream.json().catch(() => null);
          const models = extractModelNames(payload);
          if (models.length) return res.json({ success: true, models: models.sort(), source: url });
          lastNote = `${url} responded but contained no models`;
          continue;
        }
        if (upstream.status === 404 || upstream.status === 405) {
          lastNote = `${url} → HTTP ${upstream.status}`;
          continue;
        }
        throw new Error(providerError(upstream.status, await upstream.text().catch(() => '')));
      }
      throw new Error(lastNote || 'No /models endpoint found.');
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /** Proves provider + key + model work: one tiny completion, latency measured. */
  app.post('/api/ai/test', async (req, res) => {
    const startedAt = Date.now();
    try {
      const { provider, endpoint, apiKey, llmModel } = req.body || {};
      const model = String(llmModel || '').trim();
      const key = String(apiKey || '').trim();
      if (!model) throw new Error('Enter a model name first.');

      if (provider === 'gemini') {
        if (!key && !process.env.GEMINI_API_KEY) {
          throw new Error('Enter a Gemini API key (or set GEMINI_API_KEY on the server).');
        }
        const response = await gemini(key || undefined).models.generateContent({
          model,
          contents: 'Reply with the single word: pong',
          config: { systemInstruction: 'You reply with exactly one word.', maxOutputTokens: 8 },
        });
        return res.json({ success: true, latencyMs: Date.now() - startedAt, reply: (response.text || '').slice(0, 80) });
      }

      const base = String(endpoint || '').trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(base)) throw new Error('Endpoint must start with http:// or https://.');
      if (!key) throw new Error('Enter your API key first.');

      const reply = await chatCompletions({
        endpoint: base,
        apiKey: key,
        model,
        messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
      });
      return res.json({
        success: true,
        latencyMs: Date.now() - startedAt,
        reply: reply.slice(0, 80) || '(empty reply — the endpoint accepted the request)',
      });
    } catch (error: any) {
      res.status(500).json({ success: false, latencyMs: Date.now() - startedAt, error: error.message });
    }
  });

  /**
   * A malformed JSON body must still answer JSON — API clients (and the
   * console in the UI) parse responses, not HTML error pages.
   */
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
      res.status(400).json({ success: false, error: 'Invalid JSON body.' });
      return;
    }
    next(err);
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`ComfyForge AI IDE server running on port ${PORT}`);
  });
}

startServer();
