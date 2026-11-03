import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SpanStatusCode, trace as otel } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

const traces = [];
const spanIndex = new Map();
const listeners = new Set();
const traceFile = join(dirname(fileURLToPath(import.meta.url)), "..", "trace.log");
const secretKey = /api[-_]?key|sessiondata|clientkey|hmac|password|secret|card|cvc|cvv|pan|number/i;

const processor = {
  onStart(span) {
    const record = remember(span, "start");
    print(record, "→");
    publish(record.traceId);
  },
  onEnd(span) {
    const record = remember(span, "end");
    print(record, "←");
    appendFileSync(traceFile, `${JSON.stringify({ traceId: record.traceId, ...publicSpan(record) })}\n`);
    publish(record.traceId);
  },
  shutdown() {
    return Promise.resolve();
  },
  forceFlush() {
    return Promise.resolve();
  },
};

const provider = new NodeTracerProvider({ spanProcessors: [processor] });
provider.register();
const tracer = otel.getTracer("coolbikes", "1.0.0");

export function listTraces(reference) {
  if (!reference) return traces.map(publicTrace);
  return traces.filter((item) => item.id === reference || item.spans.some((span) => span.reference === reference)).map(publicTrace);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function runTrace(fields, fn) {
  const { operation, id, ...rest } = fields;
  return span(operation, { ...rest, ...(id ? { reference: id } : {}) }, fn);
}

export function span(operation, fields, fn) {
  const attributes = attributesFrom(safe(fields));
  return tracer.startActiveSpan(operation, { attributes }, async (active) => {
    try {
      const result = await fn();
      active.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      active.setStatus({ code: SpanStatusCode.ERROR, message: String(error.message ?? error).slice(0, 200) });
      if (Number.isInteger(error.statusCode)) active.setAttribute("httpStatus", error.statusCode);
      try {
        error.traced = true;
      } catch {
        // Some errors reject added fields. The span is already stored.
      }
      throw error;
    } finally {
      active.end();
    }
  });
}

export function annotate(fields) {
  const active = otel.getActiveSpan();
  if (!active) return;
  for (const [key, value] of Object.entries(attributesFrom(safe(fields)))) {
    active.setAttribute(key, value);
  }
}

function remember(span, phase) {
  const context = span.spanContext();
  const attributes = fieldsFrom(span.attributes);
  const parentId = span.parentSpanContext?.spanId;
  const parent = parentId ? spanIndex.get(parentId) : undefined;
  const traceId = attributes.reference || parent?.traceId || context.traceId;
  let trace = traces.find((item) => item.id === traceId);
  if (!trace) {
    trace = { id: traceId, at: new Date().toISOString(), spans: [] };
    traces.unshift(trace);
    if (traces.length > 100) traces.pop();
  }
  let record = spanIndex.get(context.spanId);
  if (!record) {
    record = {
      traceId,
      spanId: context.spanId,
      parentSpanId: parentId || null,
      operation: span.name,
      at: new Date().toISOString(),
      depth: parent ? parent.depth + 1 : 1,
    };
    trace.spans.push(record);
    spanIndex.set(context.spanId, record);
  }
  Object.assign(record, attributes, { traceId });
  if (phase === "end") {
    record.durationMs = hrToMs(span.duration);
    record.outcome = span.status.code === SpanStatusCode.ERROR ? "error" : "ok";
    if (span.status.message) record.error = span.status.message;
  }
  return record;
}

function publish(traceId) {
  const trace = traces.find((item) => item.id === traceId);
  if (!trace) return;
  const message = JSON.stringify({ type: "update", trace: publicTrace(trace) });
  for (const listener of listeners) listener(message);
}

function publicTrace(trace) {
  return { id: trace.id, at: trace.at, spans: trace.spans.map(publicSpan) };
}

function publicSpan(record) {
  const { traceId, spanId, parentSpanId, ...rest } = record;
  return rest;
}

function print(record, mark) {
  const clock = (mark === "←" ? new Date().toISOString() : record.at).slice(11, 23);
  const indent = "  ".repeat(Math.max(0, record.depth - 1));
  const timing = mark === "←" ? ` ${String(record.durationMs ?? 0).padStart(4)}ms` : "";
  console.log(`${clock}  ${record.traceId}  ${indent}${mark}${timing}  ${record.operation}  ${details(record)}`);
}

function details(record) {
  const skip = new Set(["operation", "at", "outcome", "durationMs", "depth", "traceId", "spanId", "parentSpanId"]);
  const parts = [];
  for (const [key, value] of Object.entries(record)) {
    if (skip.has(key) || value == null) continue;
    parts.push(`${key}=${typeof value === "object" ? JSON.stringify(value) : value}`);
  }
  return parts.join("  ");
}

function attributesFrom(fields) {
  const attributes = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      attributes[key] = value;
      continue;
    }
    attributes[key] = JSON.stringify(value);
  }
  return attributes;
}

function fieldsFrom(attributes) {
  const fields = {};
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (typeof value === "string" && (value.startsWith("{") || value.startsWith("["))) {
      try {
        fields[key] = JSON.parse(value);
        continue;
      } catch {
        // Keep the original string when it is not JSON.
      }
    }
    fields[key] = value;
  }
  return fields;
}

function safe(fields) {
  const copy = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (secretKey.test(key)) continue;
    copy[key] = value && typeof value === "object" ? safe(value) : value;
  }
  return copy;
}

function hrToMs(time) {
  if (!time) return 0;
  return Math.round(time[0] * 1000 + time[1] / 1e6);
}
