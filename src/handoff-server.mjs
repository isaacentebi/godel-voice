import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secret = fs.readFileSync(path.join(projectDir, ".godel-voice-secret"), "utf8").trim();
const port = 17841;
const queue = [];

function authorized(request, url) {
  return request.headers.authorization === `Bearer ${secret}` || url.searchParams.get("token") === secret;
}

function cors(response) {
  response.setHeader("Access-Control-Allow-Origin", "https://app.godelterminal.com");
  response.setHeader("Vary", "Origin");
}

function respond(response, status, body = "") {
  cors(response);
  response.statusCode = status;
  if (body) response.setHeader("Content-Type", "application/json");
  response.end(body);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (!authorized(request, url)) return respond(response, 403, JSON.stringify({ error: "forbidden" }));

  if (request.method === "GET" && url.pathname === "/health") {
    return respond(response, 200, JSON.stringify({ ok: true }));
  }
  if (request.method === "GET" && url.pathname === "/next") {
    if (!queue.length) return respond(response, 204);
    return respond(response, 200, JSON.stringify({ marker: queue.shift() }));
  }
  if (request.method === "POST" && url.pathname === "/plan") {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 64_000) request.destroy();
    });
    request.on("end", () => {
      const marker = body.trim();
      if (!marker.startsWith("GV1:")) return respond(response, 400, JSON.stringify({ error: "invalid marker" }));
      try { JSON.parse(marker.slice(4)); }
      catch { return respond(response, 400, JSON.stringify({ error: "invalid JSON" })); }
      queue.push(marker);
      while (queue.length > 5) queue.shift();
      respond(response, 202, JSON.stringify({ queued: true }));
    });
    return;
  }
  respond(response, 404, JSON.stringify({ error: "not found" }));
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Godel Voice handoff listening on 127.0.0.1:${port}\n`);
});
