import * as fs from "node:fs";
import * as path from "node:path";

// --- JSON -----------------------------------------------------------

export function readJSON<T>(filePath: string): T {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

export function writeJSON<T>(filePath: string, data: T): void {
  const tmpPath = filePath + ".tmp";
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

// --- YAML -----------------------------------------------------------

/**
 * Minimal inline YAML parser.
 * Supports:
 *   - key: value (string / number / boolean / null)
 *   - nested objects (unlimited depth via indentation)
 *   - arrays (dash lists: `- item`)
 *   - single-line quoted strings (single or double)
 *   - # comments (full-line only)
 *   - empty / missing files return {}
 */
export function readYAML<T>(filePath: string): T {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return {} as T;
  }

  const lines = raw.split("\n");
  const root: Record<string, unknown> = {};

  // Stack of [indent, object] pairs — root is always at indent -1
  const stack: Array<{ indent: number; obj: Record<string, unknown> }> = [
    { indent: -1, obj: root },
  ];

  // Track the current array context: { obj, key, indent }
  let arrayCtx: { obj: Record<string, unknown>; key: string; indent: number } | null = null;

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // Skip empty lines and full-line comments
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;

    // --- Array item ---
    const arrayMatch = trimmed.match(/^-\s+(.*)$/);
    if (arrayMatch) {
      const value = parseYamlValue(arrayMatch[1]);

      // Pop stack to match indent
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const parent = stack[stack.length - 1].obj;

      // Find the key under which we're building an array
      if (!arrayCtx || arrayCtx.indent !== indent) {
        // Walk up to find the parent key that holds this array
        // The array key is the last key added at indent < current indent
        // Since we can't know the key name from the dash line alone,
        // we use a heuristic: find the most recent key at a shallower indent
        const key = findArrayKey(stack, root, indent);
        if (key) {
          if (!Array.isArray(parent[key])) {
            parent[key] = [];
          }
          (parent[key] as unknown[]).push(value);
          arrayCtx = { obj: parent, key, indent };
        }
      } else {
        (parent[arrayCtx.key] as unknown[]).push(value);
      }
      continue;
    }

    // --- Key-value pair ---
    const kvMatch = trimmed.match(/^([^:]+?)\s*:\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const rawValue = kvMatch[2].trim();

      // Pop stack to match indent
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const parent = stack[stack.length - 1].obj;

      if (rawValue === "") {
        // Nested object — push new level
        const child: Record<string, unknown> = {};
        parent[key] = child;
        stack.push({ indent, obj: child });
      } else {
        parent[key] = parseYamlValue(rawValue);
      }

      // Reset array context when we encounter a new key
      arrayCtx = null;
    }
  }

  return root as T;
}

function findArrayKey(
  stack: Array<{ indent: number; obj: Record<string, unknown> }>,
  root: Record<string, unknown>,
  targetIndent: number,
): string | null {
  // Walk the root object keys in order to find the most recently added key
  // that holds an array at a shallower indent
  for (let i = stack.length - 1; i >= 0; i--) {
    const { obj, indent } = stack[i];
    if (indent < targetIndent) {
      const keys = Object.keys(obj);
      // The last key in this object is the most recent
      if (keys.length > 0) {
        return keys[keys.length - 1];
      }
    }
  }
  return null;
}

function parseYamlValue(raw: string): unknown {
  // Strip surrounding quotes
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }

  // Booleans
  if (raw === "true" || raw === "True" || raw === "TRUE") return true;
  if (raw === "false" || raw === "False" || raw === "FALSE") return false;

  // Null
  if (raw === "null" || raw === "Null" || raw === "NULL" || raw === "~") return null;

  // Numbers (integer and float)
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return raw.includes(".") ? parseFloat(raw) : parseInt(raw, 10);
  }

  // Scientific notation
  if (/^-?\d+(\.\d+)?[eE][+-]?\d+$/.test(raw)) {
    return parseFloat(raw);
  }

  return raw;
}

/**
 * Writes data as YAML using atomic write (tmp + rename).
 * Auto-creates parent directories.
 */
export function writeYAML<T>(filePath: string, data: T): void {
  const tmpPath = filePath + ".tmp";
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(tmpPath, stringifyYAML(data), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function stringifyYAML(data: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);

  if (data === null || data === undefined) return "null";

  if (typeof data === "string") {
    // Quote strings that need it
    if (needsQuoting(data)) {
      return `"${data.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return data;
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return String(data);
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return "[]";
    return data
      .map((item) => {
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          const inner = stringifyYAML(item, indent + 1);
          // Remove leading indent from first line and add dash
          const lines = inner.split("\n");
          lines[0] = `- ${lines[0].trimStart()}`;
          return lines.join("\n");
        }
        return `${pad}- ${stringifyYAML(item, indent + 1).trimStart()}`;
      })
      .join("\n");
  }

  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return "{}";
    return keys
      .map((key) => {
        const value = obj[key];
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          return `${pad}${key}:\n${stringifyYAML(value, indent + 1)}`;
        }
        if (Array.isArray(value)) {
          return `${pad}${key}:\n${stringifyYAML(value, indent + 1)}`;
        }
        return `${pad}${key}: ${stringifyYAML(value, indent + 1)}`;
      })
      .join("\n");
  }

  return String(data);
}

function needsQuoting(s: string): boolean {
  if (s === "") return true;
  return (
    /[:#\{\}\[\],&*?!|>%@`]/.test(s) ||
    s.startsWith("- ") ||
    s.startsWith(" ") ||
    s.endsWith(" ") ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(s) ||
    /^\d/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) // strings that look like numbers but aren't
  );
}

// --- Directory helpers -----------------------------------------------

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}