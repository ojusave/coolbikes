const tracesRoot = document.querySelector("#traces");
const empty = document.querySelector("#empty");
const live = document.querySelector("#live");

let lastDrawn = "";
let lastCount = 0;

function clock(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function money(amount) {
  if (!amount || typeof amount.value !== "number") return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: amount.currency || "EUR" }).format(amount.value / 100);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function fieldText(span, traceId, ancestors) {
  const skip = new Set(["operation", "at", "outcome", "durationMs", "depth", "traceId", "ancestors"]);
  const parts = [];
  for (const [key, value] of Object.entries(span)) {
    if (skip.has(key) || value == null || value === "") continue;
    if (key === "reference" && value === traceId) continue;
    if (ancestors.some((parent) => sameValue(parent[key], value))) continue;
    if (key === "amount") {
      const formatted = money(value);
      if (formatted) parts.push(formatted);
      continue;
    }
    parts.push(`${key} ${typeof value === "object" ? JSON.stringify(value) : value}`);
  }
  return parts.join(" · ");
}

function renderSpan(span, window) {
  const item = document.createElement("li");
  const outcome = span.outcome || "running";
  item.dataset.outcome = outcome;
  item.style.setProperty("--depth", String(span.depth || 1));

  const row = document.createElement("div");
  row.className = "row";
  const name = document.createElement("span");
  name.className = "op";
  name.textContent = span.operation;
  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = outcome === "running" ? "running" : `${outcome} · ${span.durationMs}ms`;
  row.append(name, meta);

  const track = document.createElement("div");
  track.className = "track";
  const bar = document.createElement("div");
  bar.className = "bar";
  const start = new Date(span.at).getTime();
  const left = window.ms <= 0 ? 0 : ((start - window.start) / window.ms) * 100;
  const width = window.ms <= 0 ? 8 : Math.max(1.5, ((span.durationMs || window.ms * 0.08) / window.ms) * 100);
  bar.style.left = `${Math.min(98, Math.max(0, left))}%`;
  bar.style.width = `${Math.min(100 - left, width)}%`;
  track.append(bar);

  item.append(row, track);
  const fields = fieldText(span, span.traceId, span.ancestors ?? []);
  if (fields) {
    const detail = document.createElement("p");
    detail.className = "fields";
    detail.textContent = fields;
    item.append(detail);
  }
  return item;
}

function renderTrace(trace) {
  const section = document.createElement("section");
  section.className = "trace";
  const heading = document.createElement("h2");
  heading.textContent = trace.id;
  const when = document.createElement("p");
  when.className = "when";
  when.textContent = clock(trace.at);
  const list = document.createElement("ol");
  if (trace.spans.length === 0) {
    section.append(heading, when);
    return section;
  }
  const starts = trace.spans.map((span) => new Date(span.at).getTime());
  const ends = trace.spans.map((span, index) => starts[index] + (span.durationMs || 0));
  const window = {
    start: Math.min(...starts),
    ms: Math.max(1, Math.max(...ends) - Math.min(...starts)),
  };
  const ancestors = [];
  for (const span of trace.spans) {
    while (ancestors.length > 0 && ancestors[ancestors.length - 1].depth >= span.depth) ancestors.pop();
    list.append(renderSpan({ ...span, traceId: trace.id, ancestors: [...ancestors] }, window));
    ancestors.push(span);
  }
  section.append(heading, when, list);
  return section;
}

async function refresh() {
  try {
    const response = await fetch("/api/traces");
    if (!response.ok) return;
    const body = await response.json();
    const traces = body.traces ?? [];
    const drawn = JSON.stringify(traces);
    if (drawn === lastDrawn) return;
    lastDrawn = drawn;
    empty.hidden = traces.length > 0;
    tracesRoot.replaceChildren(...traces.map(renderTrace));
    if (traces.length !== lastCount) {
      live.textContent = traces.length === 1 ? "1 payment" : `${traces.length} payments`;
      lastCount = traces.length;
    }
  } catch {
    live.textContent = "The operations list could not be loaded.";
  }
}

refresh();
setInterval(refresh, 500);
