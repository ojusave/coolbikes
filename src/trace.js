import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const store = new AsyncLocalStorage();
const traces = [];
const traceFile = join(dirname(fileURLToPath(import.meta.url)), "..", "trace.log");
const secretKey = /api[-_]?key|sessiondata|clientkey|hmac|password|secret|card|cvc|cvv|pan|number/i;

export function listTraces(reference) {
  if (!reference) return traces;
  return traces.filter(
    (trace) => trace.id === reference || trace.spans.some((span) => span.reference === reference),
  );
}

export async function runTrace(fields, fn) {
  const id = fields.id || `trace-${Date.now()}`;
  let trace = traces.find((item) => item.id === id);
  if (!trace) {
    trace = { id, at: new Date().toISOString(), spans: [] };
    traces.unshift(trace);
    if (traces.length > 100) traces.pop();
  }
  const { operation, ...rest } = fields;
  delete rest.id;
  return store.run({ trace, depth: 0, span: null }, () => span(operation, rest, fn));
}

export async function span(operation, fields, fn) {
  const parent = store.getStore();
  const record = {
    operation,
    at: new Date().toISOString(),
    depth: parent ? parent.depth + 1 : 1,
    ...safe(fields),
  };
  parent?.trace.spans.push(record);
  const ctx = {
    trace: parent?.trace ?? { id: "-", spans: [] },
    depth: parent ? parent.depth + 1 : 0,
    span: record,
  };

  const started = performance.now();
  print(ctx, record, "→");
  return store.run(ctx, async () => {
    try {
      const result = await fn();
      record.durationMs = elapsed(started);
      record.outcome = "ok";
      print(ctx, record, "←");
      return result;
    } catch (error) {
      record.durationMs = elapsed(started);
      record.outcome = "error";
      record.error = String(error.message ?? error).slice(0, 200);
      if (Number.isInteger(error.statusCode)) record.httpStatus = error.statusCode;
      try {
        error.traced = true;
      } catch {
        // Some errors reject added fields. The span is already stored.
      }
      print(ctx, record, "←");
      throw error;
    }
  });
}

export function annotate(fields) {
  const current = store.getStore()?.span;
  if (!current) return;
  Object.assign(current, safe(fields));
}

function print(ctx, record, mark) {
  const clock = (mark === "←" ? new Date().toISOString() : record.at).slice(11, 23);
  const indent = "  ".repeat(Math.max(0, ctx.depth - 1));
  const timing = mark === "←" ? ` ${String(record.durationMs).padStart(4)}ms` : "";
  const line = `${clock}  ${ctx.trace.id}  ${indent}${mark}${timing}  ${record.operation}  ${details(record)}`;
  console.log(line);
  if (mark === "←") {
    appendFileSync(traceFile, `${JSON.stringify({ traceId: ctx.trace.id, ...record })}\n`);
  }
}

function details(record) {
  const skip = new Set(["operation", "at", "outcome", "durationMs", "depth"]);
  const parts = [];
  for (const [key, value] of Object.entries(record)) {
    if (skip.has(key) || value == null) continue;
    parts.push(`${key}=${typeof value === "object" ? JSON.stringify(value) : value}`);
  }
  return parts.join("  ");
}

function safe(fields) {
  const copy = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (secretKey.test(key)) continue;
    if (value && typeof value === "object") {
      copy[key] = safe(value);
      continue;
    }
    copy[key] = value;
  }
  return copy;
}

function elapsed(started) {
  return Math.round(performance.now() - started);
}
