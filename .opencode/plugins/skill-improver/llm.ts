import * as https from "node:https";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import type { LLMConfig } from "./types.js";

import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


function debugLog(msg: string): void {
  try {
    const fs = require("node:fs");
    const path = require("node:path");
    const p = path.resolve(process.cwd(), "data", "debug.log");
    fs.appendFileSync(p, `[${new Date().toISOString()}] [LLM] ${msg}\n`, "utf-8");
  } catch {}
}
// ── Config ──────────────────────────────────────────────────────────────────

function loadConfig(): LLMConfig | null {
  try {
    const configPath = path.resolve(__dirname, "..", "..", "..", "config", "llm.json");
    const raw = fs.readFileSync(configPath, "utf-8");
    debugLog(`Config loaded from: ${configPath}`);
    return JSON.parse(raw) as LLMConfig;
  } catch (e) {
    debugLog(`Config load FAILED: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

interface HTTPResult {
  status: number;
  body: string;
}

function httpRequest(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number
): Promise<HTTPResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;

    const reqOptions: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      timeout: timeoutMs,
    };

    const req = transport.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf-8"),
        });
      });
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Provider request builders ───────────────────────────────────────────────

function buildOpenAIRequest(
  prompt: string,
  model: string,
  schema?: object
): Record<string, unknown> {
  const req: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 4096,
  };

  if (schema) {
    req.response_format = {
      type: "json_schema",
      json_schema: { name: "response", schema },
    };
  }

  return req;
}

function buildAnthropicRequest(
  prompt: string,
  model: string,
  schema?: object
): Record<string, unknown> {
  const req: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  };

  if (schema) {
    req.tools = [
      {
        name: "respond_with_json",
        description: "Respond with structured JSON output",
        input_schema: schema,
      },
    ];
    req.tool_choice = { type: "tool", name: "respond_with_json" };
  }

  return req;
}

function buildOpenAIStructuredRequest(
  prompt: string,
  model: string,
  schema: object
): Record<string, unknown> {
  return {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 4096,
    response_format: {
      type: "json_schema",
      json_schema: { name: "response", schema },
    },
  };
}

function buildAnthropicStructuredRequest(
  prompt: string,
  model: string,
  schema: object
): Record<string, unknown> {
  return {
    model,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        name: "respond_with_json",
        description: "Respond with structured JSON output",
        input_schema: schema,
      },
    ],
    tool_choice: { type: "tool", name: "respond_with_json" },
  };
}

// ── Response parsers ────────────────────────────────────────────────────────

function parseOpenAIResponse(body: string): string | null {
  try {
    const data = JSON.parse(body);
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}

function parseAnthropicResponse(body: string): string | null {
  try {
    const data = JSON.parse(body);
    const blocks = data?.content;
    if (!Array.isArray(blocks)) return null;

    // Look for tool_use first (structured output)
    for (const block of blocks) {
      if (block.type === "tool_use" && block.input) {
        return JSON.stringify(block.input);
      }
    }

    // Fall back to text content
    for (const block of blocks) {
      if (block.type === "text" && typeof block.text === "string") {
        return block.text;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function parseStructuredResponse<T>(raw: string, schema: object): T | null {
  try {
    const parsed = JSON.parse(raw);
    // Basic validation: check required fields from schema
    if (schema && typeof schema === "object" && "required" in schema) {
      const required = (schema as Record<string, unknown>).required;
      if (Array.isArray(required)) {
        for (const field of required) {
          if (!(field in parsed)) {
            return null;
          }
        }
      }
    }
    return parsed as T;
  } catch {
    return null;
  }
}

// ── Provider request execution ──────────────────────────────────────────────

interface ProviderResult {
  ok: boolean;
  content: string | null;
  error?: string;
}

async function callProvider(
  config: LLMConfig,
  prompt: string,
  schema?: object,
  structured: boolean = false
): Promise<ProviderResult> {
  const url = getEndpoint(config);
  debugLog(`Calling: ${url}`);
  const headers = getHeaders(config);

  let body: Record<string, unknown>;
  if (structured && schema) {
    body =
      config.provider === "openai"
        ? buildOpenAIStructuredRequest(prompt, config.model, schema)
        : buildAnthropicStructuredRequest(prompt, config.model, schema);
  } else {
    body =
      config.provider === "openai"
        ? buildOpenAIRequest(prompt, config.model, schema)
        : buildAnthropicRequest(prompt, config.model, schema);
  }

  try {
    const result = await httpRequest(url, headers, body, 30_000);
    debugLog(`Response: status=${result.status}, body=${result.body.substring(0, 200)}`);

    if (result.status >= 200 && result.status < 300) {
      const content =
        config.provider === "openai"
          ? parseOpenAIResponse(result.body)
          : parseAnthropicResponse(result.body);

      return { ok: content !== null, content };
    }

    return {
      ok: false,
      content: null,
      error: `HTTP ${result.status}: ${result.body.slice(0, 200)}`,
    };
  } catch (err) {
    return {
      ok: false,
      content: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function getEndpoint(config: LLMConfig): string {
  if (config.baseUrl) {
    const base = config.baseUrl.replace(/\/$/, "");
    // 如果 baseUrl 已经包含完整路径，直接返回
    if (base.endsWith("/chat/completions") || base.endsWith("/messages")) {
      return base;
    }
    // 否则根据 provider 添加端点
    return config.provider === "anthropic"
      ? `${base}/messages`
      : `${base}/chat/completions`;
  }
  return config.provider === "openai"
    ? "https://api.openai.com/v1/chat/completions"
    : "https://api.anthropic.com/v1/messages";
}

function getHeaders(config: LLMConfig): Record<string, string> {
  if (config.provider === "anthropic") {
    return {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    };
  }
  return {
    Authorization: `Bearer ${config.apiKey}`,
  };
}

// ── Retry + fallback wrapper ────────────────────────────────────────────────

async function callWithRetry(
  config: LLMConfig,
  prompt: string,
  schema?: object,
  structured: boolean = false
): Promise<string | null> {
  // First attempt
  const first = await callProvider(config, prompt, schema, structured);
  if (first.ok) return first.content;

  // Retry once
  const retry = await callProvider(config, prompt, schema, structured);
  if (retry.ok) return retry.content;

  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Call an external LLM API with optional schema for structured output.
 * Returns parsed response content, or null if all attempts fail.
 */
export async function callLLM(
  prompt: string,
  schema?: object
): Promise<unknown> {
  const config = loadConfig();
  debugLog(`callLLM config: ${JSON.stringify(config)}`);
  if (!config) {
    debugLog("callLLM: config is null");
    return null;
  }

  // Try primary provider (with 1 retry)
  const primary = await callWithRetry(config, prompt, schema, false);
  if (primary !== null) {
    if (schema) {
      try {
        return JSON.parse(primary);
      } catch {
        return primary;
      }
    }
    return primary;
  }

  // Fallback provider
  if (config.fallback) {
    const fallbackResult = await callWithRetry(
      config.fallback,
      prompt,
      schema,
      false
    );
    if (fallbackResult !== null) {
      if (schema) {
        try {
          return JSON.parse(fallbackResult);
        } catch {
          return fallbackResult;
        }
      }
      return fallbackResult;
    }
  }

  return null;
}

/**
 * Call an external LLM with structured output (JSON Schema).
 * Returns typed result, or null if all attempts fail.
 */
export async function callLLMStructured<T>(
  prompt: string,
  schema: object
): Promise<T | null> {
  const config = loadConfig();
  if (!config) return null;

  // Try primary provider (with 1 retry)
  const primary = await callWithRetry(config, prompt, schema, true);
  if (primary !== null) {
    const parsed = parseStructuredResponse<T>(primary, schema);
    if (parsed !== null) return parsed;
  }

  // Fallback provider
  if (config.fallback) {
    const fallbackResult = await callWithRetry(
      config.fallback,
      prompt,
      schema,
      true
    );
    if (fallbackResult !== null) {
      const parsed = parseStructuredResponse<T>(fallbackResult, schema);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}
