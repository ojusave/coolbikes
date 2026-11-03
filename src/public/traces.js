// Live view. EventSource stays open. The server pushes a span the moment it starts.

const tracesRoot = document.querySelector("#traces");
const empty = document.querySelector("#empty");
const live = document.querySelector("#live");
const traces = new Map();
const openKeys = new Set();

function clock(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function pretty(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function statusText(span) {
  if (!span.outcome || span.outcome === "running") return "running";
  if (span.httpStatus) return `${span.httpStatus} · ${span.durationMs}ms`;
  return `${span.outcome} · ${span.durationMs}ms`;
}

function bodyBlock(label, value) {
  const block = document.createElement("div");
  const title = document.createElement("p");
  title.className = "body-label";
  title.textContent = label;
  const code = document.createElement("pre");
  code.textContent = pretty(value);
  block.append(title, code);
  return block;
}

function renderBodies(span) {
  const wrap = document.createElement("div");
  wrap.className = "bodies";
  if (span.request !== undefined) wrap.append(bodyBlock("Request", span.request));
  if (span.response !== undefined) wrap.append(bodyBlock("Response", span.response));
  else if (span.error) wrap.append(bodyBlock("Response", span.error));
  return wrap;
}

function renderSpan(span, traceId) {
  const outcome = span.outcome || "running";
  const expandable = span.request !== undefined || span.response !== undefined || Boolean(span.error);
  const item = document.createElement("li");
  item.dataset.outcome = outcome;
  const row = document.createElement(expandable ? "summary" : "div");
  row.className = "row";
  const name = document.createElement("span");
  name.className = "op";
  name.textContent = span.operation;
  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = statusText(span);
  row.append(name, meta);
  if (!expandable) {
    item.append(row);
    return item;
  }
  const key = `${traceId}:${span.operation}:${span.at}`;
  const details = document.createElement("details");
  details.className = "call";
  details.dataset.key = key;
  details.open = openKeys.has(key);
  details.addEventListener("toggle", () => {
    if (details.open) openKeys.add(key);
    else openKeys.delete(key);
  });
  details.append(row, renderBodies(span));
  item.append(details);
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
  section.append(heading, when);
  if (trace.spans.length === 0) return section;
  const list = document.createElement("ol");
  for (const span of trace.spans) list.append(renderSpan(span, trace.id));
  section.append(list);
  return section;
}

// The server records every step. This view keeps the HTTP calls only.
function apiTrace(trace) {
  const spans = trace.spans
    .filter((span) => /^(GET|POST|PUT|PATCH|DELETE) \//.test(span.operation || ""))
    .map((span) => ({ ...span, depth: 1 }));
  return { ...trace, spans };
}

function paint() {
  // Newest payment first, so the call that just started stays in view.
  const ordered = [...traces.values()]
    .map(apiTrace)
    .filter((trace) => trace.spans.length > 0)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const calls = ordered.reduce((count, trace) => count + trace.spans.length, 0);
  empty.hidden = ordered.length > 0;
  const panel = tracesRoot.closest(".live-panel");
  const scroll = panel ? panel.scrollTop : 0;
  tracesRoot.replaceChildren(...ordered.map(renderTrace));
  if (panel) panel.scrollTop = scroll;
  live.textContent = calls === 1 ? "1 API call, live" : `${calls} API calls, live`;
}

function apply(message) {
  // Ignore any saved list. Only a call that starts after this page opened belongs here.
  if (message.type !== "update" || !message.trace) return;
  traces.set(message.trace.id, message.trace);
  paint();
}

const source = new EventSource("/api/traces/stream");
window.coolbikesTracesReady = new Promise((resolve) => {
  source.onopen = () => resolve();
  setTimeout(resolve, 1500);
});
source.onmessage = (event) => apply(JSON.parse(event.data));
source.onerror = () => {
  live.textContent = "The live trace stream disconnected.";
};
