// Small helpers the API files share: read a body, send JSON, or redirect.

export function send(response, status, body, type) {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(body);
}

export function sendJson(response, status, body) {
  send(response, status, JSON.stringify(body), "application/json; charset=utf-8");
}

export function redirectTo(response, location) {
  response.writeHead(302, { location });
  response.end();
}

export function readRaw(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("Body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

// Returns the parsed JSON and the exact text the caller sent.
export function readJson(request) {
  return readRaw(request).then((raw) => {
    if (!raw) return { body: {}, raw: "" };
    try {
      return { body: JSON.parse(raw), raw };
    } catch {
      throw new Error("Body must be JSON");
    }
  });
}

// A redirect from Adyen can be a query string or a form body.
export function readBody(request) {
  const type = request.headers["content-type"] || "";
  return readRaw(request).then((raw) => {
    if (!raw) return {};
    if (type.includes("application/json")) return JSON.parse(raw);
    return Object.fromEntries(new URLSearchParams(raw));
  });
}

export function originOf(request) {
  const host = request.headers.host ?? "127.0.0.1";
  const forwarded = request.headers["x-forwarded-proto"];
  const proto = typeof forwarded === "string" ? forwarded : "http";
  return `${proto}://${host}`;
}
