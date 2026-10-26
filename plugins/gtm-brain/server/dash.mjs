#!/usr/bin/env node
// Read-only dashboard: local files and notifications after a completed render.
// --start / --open / --open-chrome / --url / --stop manage the viewer's local server.
// Chat about this is a codex:// link; this server never runs brain actions or Codex jobs.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, statSync, watch, createReadStream, fstatSync, closeSync, constants } from "node:fs";
import { join, resolve, normalize, extname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveAssetFile, assetMime } from '../lib/assets.mjs';
import { dashboardRefreshState } from '../lib/dashboard-refresh.mjs';
const lib = await import(new URL("../lib/brain.mjs", import.meta.url));

const args = process.argv.slice(2);
const root = resolve(args.find(a => !a.startsWith("--")) || ".");
const flag = args.find(a => a.startsWith("--")) || "";
// A project belongs to this opening URL, never to shared dashboard state.
const project = args.find(a => a.startsWith("--project="))?.slice(10) || "";
if (project && !lib.readProjects(root).some(p => p.slug === project)) { console.error(`Unknown dashboard project: ${project}`); process.exit(1); }
const viewingUrl = url => project ? `${url}#view=home&project=${encodeURIComponent(project)}` : url;
const work = join(root, "work"), stateFile = join(work, "dash.json"), home = join(work, "home");
if (!existsSync(join(root, "brain", "admin.md"))) { console.error(`not a brain: ${root}`); process.exit(1); }
mkdirSync(work, { recursive: true });

const readState = () => { try { return JSON.parse(readFileSync(stateFile, "utf8")); } catch { return null; } };
const alive = s => { if (!s || !s.pid) return false; try { process.kill(s.pid, 0); return true; } catch { return false; } };
const log = line => lib.logActivity(root, "dashboard", line);
// The state file outlives the server: without a pid it only remembers the port, so the address,
// the browser's theme setting and any bookmark stay the same across restarts.
const remember = s => { try { writeFileSync(stateFile, JSON.stringify(s, null, 1)); } catch {} };

if (flag === "--url") { const s = readState(); if (alive(s)) console.log(viewingUrl(s.url)); process.exit(0); }
if (flag === "--stop") { lib.stopBrainWatcher(root); const s = readState(); if (alive(s)) { try { process.kill(s.pid); } catch {} } remember({ port: s && s.port }); process.exit(0); }
// Legacy --open and --open-chrome are URL-only aliases; the host opens the Codex pane.
if (flag === "--start" || flag === "--open" || flag === "--open-chrome") {
  lib.startBrainWatcher(root);
  const s = readState();
  if (alive(s) && s.protocol === 3) { console.log(viewingUrl(s.url)); process.exit(0); }
  if (alive(s)) { try { process.kill(s.pid); } catch {} } // retire older action-capable servers
  const out = openSync(join(work, "dash.log"), "a");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), root], { detached: true, stdio: ["ignore", out, out], env: process.env });
  child.unref();
  const t0 = Date.now();
  const wait = () => { const n = readState(); if (n && n.pid === child.pid && alive(n)) { console.log(viewingUrl(n.url)); process.exit(0); } if (Date.now() - t0 > 4000) { console.error("dashboard server did not start; see work/dash.log"); process.exit(1); } setTimeout(wait, 100); };
  wait();
} else {
  serve();
}

function serve() {
  const MIME = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".md": "text/plain; charset=utf-8" };
  const HDR = { "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:" };
  const json = (res, code, body) => { res.writeHead(code, { ...HDR, "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  let lastSeen = 0;
  // The renderer publishes data.json last, using an atomic rename. Notify only complete renders.
  mkdirSync(home, { recursive: true });
  const clients = new Set();
  const revision = () => { try { return JSON.parse(readFileSync(join(home, "data.json"), "utf8")).generatedAt || null; } catch { return null; } };
  const sendRevision = res => res.write(`event: revision\ndata: ${JSON.stringify({ generatedAt: revision() })}\n\n`);
  const watcher = watch(home, (_event, file) => { if (String(file) === "data.json") for (const res of clients) sendRevision(res); });
  const heartbeat = setInterval(() => { if (clients.size) lastSeen = Date.now(); for (const res of clients) res.write(": live\n\n"); }, 10000);
  heartbeat.unref();

  let port;
  const server = createServer(async (req, res) => {
    // Only the addresses we listen on: a page on another site rebound to this port gets nothing.
    const host = String(req.headers.host || "").toLowerCase();
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return json(res, 403, { ok: false, note: "not this host" });
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === 'GET' && url.pathname === '/refresh.json') return json(res, 200, dashboardRefreshState(root));
    if (req.method === "GET" && url.pathname === "/entity") {
      try {
        const view = lib.entityBrief(root, url.searchParams.get("id"), { context: url.searchParams.get("context") || undefined, absoluteLinks: true });
        res.writeHead(200, { ...HDR, "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${view.entity.id}.md"` });
        return res.end(view.markdown);
      } catch (e) { return json(res, 404, { ok: false, note: e.message }); }
    }
    if (req.method === "GET" && url.pathname === "/status") return json(res, 200, { open: Date.now() - lastSeen < 15000, lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null });
    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, { ...HDR, "content-type": "text/event-stream", connection: "keep-alive" });
      clients.add(res); lastSeen = Date.now(); sendRevision(res);
      res.on("close", () => clients.delete(res));
      return;
    }
    if (req.method === "GET" && url.pathname === "/data.json") lastSeen = Date.now();
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { ok: false, note: "GET only" });
    if (url.pathname.startsWith('/assets/')) {
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { ok: false, note: 'Open this attachment from its dashboard.' });
      // No caller-supplied filesystem paths. Resolve one recorded relationship, then recheck
      // its file on every request (a symlink or project pointer may have changed since render).
      const match = url.pathname.match(/^\/assets\/([a-z0-9-]+)\/(m_[0-9a-f]{6,12})$/);
      let fd;
      try {
        if (!match) throw new Error('Unknown attachment');
        const m = lib.readMemories(root, match[1]).find(m => m.id === match[2]);
        if (!m?.asset) throw new Error('Unknown attachment');
        const path = resolveAssetFile(root, m.asset);
        fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const stat = fstatSync(fd); if (!stat.isFile()) throw new Error('Not a file');
        const preview = url.searchParams.get('preview') === '1', mime = preview && assetMime(path);
        res.writeHead(200, { ...HDR, 'content-type': mime || 'application/octet-stream', 'content-length': stat.size,
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'cross-origin-resource-policy': 'same-origin',
          'content-disposition': `${mime ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(path.split('/').pop()).replace(/'/g, '%27')}` });
        if (req.method === 'HEAD') { closeSync(fd); fd = undefined; res.end(); }
        else { const stream = createReadStream(path, { fd, autoClose: true }); fd = undefined; stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res); }
      } catch { if (fd !== undefined) closeSync(fd); return json(res, 404, { ok: false, note: 'Attachment unavailable. Locate the file or repair its project connection in Codex.' }); }
      return;
    }
    let file = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
    const path = join(home, file);
    if (!path.startsWith(home + "/") && path !== home) return json(res, 404, { ok: false, note: "not here" });
    try {
      if (!statSync(path).isFile()) throw new Error("dir");
      res.writeHead(200, { ...HDR, "content-type": MIME[extname(path)] || "application/octet-stream" });
      res.end(req.method === "HEAD" ? undefined : readFileSync(path));
    } catch { json(res, 404, { ok: false, note: `not rendered yet: ${file}` }); }
  });

  const prev = readState();
  port = (prev && Number.isInteger(prev.port) && prev.port > 1024) ? prev.port : 40000 + (Array.from(root).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 20000); let tries = 0;
  server.on("error", e => { if (e.code === "EADDRINUSE" && tries++ < 20) { port++; server.listen(port, "127.0.0.1"); } else { console.error(e.message); process.exit(1); } });
  server.on("listening", () => {
    const url = `http://127.0.0.1:${port}/`;
    writeFileSync(stateFile, JSON.stringify({ port, pid: process.pid, protocol: 3, url, startedAt: new Date().toISOString() }, null, 1));
    log(`serving ${url}`);
    console.log(url);
  });
  server.listen(port, "127.0.0.1");
  // Leave when the brain is gone or a newer server took over.
  setInterval(() => { const s = readState(); if (!existsSync(join(root, "brain", "admin.md")) || (s && s.pid && s.pid !== process.pid && alive(s))) process.exit(0); }, 60000).unref();
  const bye = () => { watcher.close(); clearInterval(heartbeat); for (const res of clients) res.end(); const s = readState(); if (s && s.pid === process.pid) remember({ port }); process.exit(0); };
  process.on("SIGTERM", bye); process.on("SIGINT", bye);
}
