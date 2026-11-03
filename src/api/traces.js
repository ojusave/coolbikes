// GET /api/traces/stream
// The shop page keeps this open. Each API call is pushed as it starts and as it finishes.

import { subscribe } from "../trace.js";

export async function handle({ request, response, url }) {
  if (request.method !== "GET" || url.pathname !== "/api/traces/stream") return false;

  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  // No snapshot. A page should see a call only when that call happens.
  const write = (message) => response.write(`data: ${message}\n\n`);
  const unsubscribe = subscribe(write);
  const beat = setInterval(() => response.write(": keepalive\n\n"), 15000);
  request.on("close", () => {
    clearInterval(beat);
    unsubscribe();
  });
  return true;
}
