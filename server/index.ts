import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { Race } from "../src/sim/race.ts";
import { addresses, selectOrigin } from "./origin.ts";
import { Seats } from "./seats.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const development = process.argv.includes("--dev");
const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT debe ser un puerto TCP válido.");

const localAddresses = addresses();
const publicOrigin = selectOrigin(port, process.env.PUBLIC_ORIGIN, localAddresses);
const localOrigin = `http://127.0.0.1:${port}`;
const origins = new Set([
  publicOrigin, localOrigin, `http://localhost:${port}`,
  ...localAddresses.map((address) => `http://${address}:${port}`),
]);
const hosts = new Set([...origins].map((origin) => new URL(origin).host));
const token = randomBytes(10).toString("base64url");
const controllerPath = `/mando/${token}`;
const controllerUrl = publicOrigin + controllerPath;
const buildRoot = join(root, "dist");
const mime: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
  ".mp3": "audio/mpeg",
};

if (!development) {
  await Promise.all(["index.html", "mando.html"].map((file) => stat(join(buildRoot, file))))
    .catch(() => { throw new Error("Ejecuta npm run build antes de iniciar el juego."); });
}

const vite = development ? await (await import("vite")).createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false, allowedHosts: [new URL(publicOrigin).hostname] },
}) : undefined;

const race = new Race();
const seats = new Seats<WebSocket>();
const displays = new Set<WebSocket>();
const controllers = new Map<WebSocket, number>();
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });

function text(response: ServerResponse, code: number, value: string) {
  response.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(value);
}

async function file(response: ServerResponse, request: IncomingMessage, path: string, cache = false) {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return text(response, 404, "Archivo no encontrado.");
  const type = mime[extname(path)] ?? "application/octet-stream";
  const headers: Record<string, string | number> = {
    "Content-Type": type,
    "Content-Length": info.size,
    "Cache-Control": cache ? "public, max-age=31536000, immutable" : "no-store",
  };
  let start = 0;
  let end = info.size - 1;
  let status = 200;
  if (type === "audio/mpeg") {
    headers["Accept-Ranges"] = "bytes";
    const range = request.method === "GET" && /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
    if (range && (range[1] || range[2])) {
      start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
      if (range[1] && range[2]) end = Math.min(end, Number(range[2]));
      if (start > end) {
        response.writeHead(416, { "Accept-Ranges": "bytes", "Content-Range": `bytes */${info.size}` });
        return response.end();
      }
      headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
      headers["Content-Length"] = end - start + 1;
      status = 206;
    }
  }
  response.writeHead(status, headers);
  if (request.method === "HEAD") return response.end();
  const stream = createReadStream(path, status === 206 ? { start, end } : undefined);
  stream.on("error", () => response.destroy());
  stream.pipe(response);
}

async function serve(request: IncomingMessage, response: ServerResponse) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  if (!hosts.has(request.headers.host ?? "")) return text(response, 403, "Dirección de juego no reconocida.");
  if (request.method !== "GET" && request.method !== "HEAD") return text(response, 405, "Método no permitido.");
  const path = new URL(request.url ?? "/", localOrigin).pathname;
  if (path === "/health") {
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return response.end(JSON.stringify({ game: "micro-gp", ready: true }));
  }
  const entry = path === "/" ? "index.html" : path === controllerPath ? "mando.html" : undefined;
  if (entry) {
    if (!vite) return file(response, request, join(buildRoot, entry));
    const html = await vite.transformIndexHtml(path, await readFile(join(root, entry), "utf8"));
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return response.end(request.method === "HEAD" ? undefined : html);
  }
  if (path.startsWith("/mando/")) return text(response, 404, "Esta partida terminó. Escaneá el QR de la pantalla otra vez.");
  if (vite) return vite.middlewares(request, response, () => text(response, 404, "Archivo no encontrado."));
  if (/^\/assets\/[A-Za-z0-9_.-]+$/.test(path)) return file(response, request, join(buildRoot, path), true);
  return text(response, 404, "Archivo no encontrado.");
}

function send(peer: WebSocket, data: object) {
  if (peer.readyState === WebSocket.OPEN) peer.send(JSON.stringify(data));
}

function display(peer: WebSocket) {
  displays.add(peer);
  peer.on("close", () => displays.delete(peer));
  send(peer, { type: "hello", url: controllerUrl });
  send(peer, { type: "state", state: race.snapshot() });
}

function controller(peer: WebSocket) {
  peer.on("close", () => {
    const slot = controllers.get(peer);
    if (slot !== undefined) seats.disconnect(slot, peer, performance.now());
    controllers.delete(peer);
  });
  peer.on("message", (buffer, binary) => {
    if (binary) return;
    let value: unknown;
    try { value = JSON.parse(buffer.toString()); } catch { return; }
    if (value === null || typeof value !== "object" || Array.isArray(value)) return;
    const message = value as Record<string, unknown>;
    const now = performance.now();
    const slot = controllers.get(peer);
    if (slot !== undefined) {
      seats.receive(slot, peer, message, now);
      return;
    }
    if (message.type !== "join") return;
    const key = typeof message.key === "string" && /^[A-Za-z0-9_-]{24}$/.test(message.key)
      ? message.key : undefined;
    const assigned = seats.join(peer, key, now);
    if (!assigned) return send(peer, { type: "full" });
    if (assigned.previous) {
      controllers.delete(assigned.previous);
      assigned.previous.close(4001, "Mando reemplazado");
    }
    controllers.set(peer, assigned.slot);
    send(peer, { type: "assigned", slot: assigned.slot, key: assigned.key });
  });
}

const server = createServer((request, response) => {
  void serve(request, response).catch((error: unknown) => {
    console.error(error);
    if (response.headersSent) response.destroy();
    else text(response, 500, "No se pudo cargar el juego.");
  });
});

server.on("upgrade", (request, socket, head) => {
  const path = request.url ?? "";
  if (!hosts.has(request.headers.host ?? "") ||
      (request.headers.origin && !origins.has(request.headers.origin)) ||
      (path !== "/live" && !/^\/live\/[A-Za-z0-9_-]+$/.test(path))) {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  wss.handleUpgrade(request, socket, head, (peer) => {
    peer.on("error", () => peer.terminate());
    if (path === "/live") display(peer);
    else if (path === `/live/${token}`) controller(peer);
    else {
      send(peer, { type: "invalid" });
      peer.close(4004, "Partida anterior");
    }
  });
});

const delta = 1 / 60;
let previousTime = performance.now();
let accumulated = 0;
let ticks = 0;
const loop = setInterval(() => {
  const now = performance.now();
  accumulated += Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;
  const drivers = seats.drivers(now);
  while (accumulated >= delta) {
    race.step(delta, drivers);
    accumulated -= delta;
    ticks++;
    if (ticks % 3 === 0 && displays.size) {
      const packet = JSON.stringify({ type: "state", state: race.snapshot() });
      for (const display of displays) {
        if (display.readyState === WebSocket.OPEN && display.bufferedAmount < 64 * 1024) display.send(packet);
      }
    }
    if (ticks % 60 === 0) {
      for (const [peer, slot] of controllers) {
        if (drivers[slot]?.input != null && peer.bufferedAmount < 1024) send(peer, { type: "pulse" });
      }
    }
  }
  for (const [peer, slot] of controllers) {
    if (!seats.has(slot, peer)) {
      controllers.delete(peer);
      peer.close(4002, "Plaza vencida");
    }
  }
}, 1000 / 60);
loop.unref();

server.listen(port, process.env.HOST ?? "0.0.0.0", () => {
  console.log(`Micro GP · Taller 07\nPantalla: ${localOrigin}\nRed local: ${publicOrigin}`);
  if (process.argv.includes("--open") && process.platform === "win32") {
    const browser = spawn("cmd.exe", ["/d", "/c", "start", "", localOrigin],
      { detached: true, stdio: "ignore", windowsHide: true });
    browser.on("error", (error) => console.error(error.message));
    browser.unref();
  }
});
