#!/usr/bin/env node
// The dashboard's local server: files and notifications after a completed render, read-only, with one exception.
// --start / --open / --open-chrome / --url / --stop manage the viewer's local server.
// Chat about this is a codex:// link; this server never runs brain actions or Codex jobs.
// The one write: POST /document saves the text of a document the person edited on the page, through the
// document script (scripts/gtm-brain-documents/document.mjs --update), never a file write of its own. It asks for
// this server's own Origin, a token made at each start and served only inside the page, JSON, a body within the
// document limit, a path lib/documents lists, and the hash of the file as the person opened it (saveDocument).
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, statSync, watch, createReadStream, fstatSync, closeSync, constants, realpathSync } from "node:fs";
import { join, resolve, normalize, extname } from "node:path";
import { spawn, execFile } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolveAssetFile, assetMime } from '../lib/assets.mjs';
import { dashboardRefreshState } from '../lib/dashboard-refresh.mjs';
import { listDocuments, BODY_MAX } from '../lib/documents.mjs';
import { DESIGN_IMAGES } from '../lib/dashboard-pillars.mjs';
import { createMemoryReader } from './memory-reader.mjs';
import { createEntityEdit } from './entity-edit.mjs';   // POST /entity-edit: the Entities tab's forms
import { createMemoryEdit } from './memory-edit.mjs';   // POST /memory-edit: the Memories tab's menu on a note
import { workDir } from '../lib/brain-paths.mjs';
const lib = await import(new URL("../lib/brain.mjs", import.meta.url));

const args = process.argv.slice(2);
const root = resolve(args.find(a => !a.startsWith("--")) || ".");
// The command is the first --flag without a value; --port= and --project= are options, in any order.
const flag = args.find(a => a.startsWith("--") && !a.includes("=")) || "";
const portOption = args.find(a => a.startsWith("--port="))?.slice("--port=".length);
const configuredPort = portOption ?? process.env.GTM_BRAIN_DASH_PORT;
if (configuredPort !== undefined && (!/^\d+$/.test(configuredPort) || Number(configuredPort) <= 1024 || Number(configuredPort) > 65535)) {
  console.error("dashboard port must be an integer between 1025 and 65535"); process.exit(1);
}
const requestedPort = configuredPort === undefined ? undefined : Number(configuredPort);
// A project belongs to this opening URL, never to shared dashboard state.
const project = args.find(a => a.startsWith("--project="))?.slice(10) || "";
if (project && !lib.readProjects(root).some(p => p.slug === project)) { console.error(`Unknown dashboard project: ${project}`); process.exit(1); }
const viewingUrl = url => project ? `${url}#view=home&project=${encodeURIComponent(project)}` : url;
// A second write, for the Entities tab's forms: POST /entity-edit (server/entity-edit.mjs), a fixed list of named
// operations, each one call of the entity or remember script, behind the same guard and token. 6 added it.
// A third, for the Memories tab's menu on a note: POST /memory-edit (server/memory-edit.mjs), five named operations,
// each one call of the remember script, behind the same guard and token. 7 added it.
// The server's protocol: a start replaces a running server of another one. 4 added /file, so a server an
// older plugin left running (no /file) is retired on the first start after an upgrade. 5 added POST /document.
const PROTOCOL = 7;
// The plugin version that started this server: after an update an old server would go on serving the old
// code from a cache folder Codex replaced, so --start retires a server from another version.
const VERSION = (() => { try { return JSON.parse(readFileSync(new URL("../.codex-plugin/plugin.json", import.meta.url), "utf8")).version || null; } catch { return null; } })();
const work = workDir(root), stateFile = join(work, "dash.json"), home = join(work, "home");
if (!lib.isBrain(root)) { console.error(`not a brain: ${root}`); process.exit(1); }
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
  if (alive(s) && s.protocol === PROTOCOL && s.version === VERSION && (requestedPort === undefined || s.port === requestedPort)) { console.log(viewingUrl(s.url)); process.exit(0); }
  if (alive(s)) { try { process.kill(s.pid); } catch {} } // retire older action-capable servers and servers from another plugin version
  const out = openSync(join(work, "dash.log"), "a");
  const childArgs = [fileURLToPath(import.meta.url), root, ...(requestedPort === undefined ? [] : [`--port=${requestedPort}`])];
  const child = spawn(process.execPath, childArgs, { detached: true, stdio: ["ignore", out, out], env: process.env });
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
  // Saving a document from the page. The token is made here, lives only in this process and is served only inside
  // the page itself, which another site cannot read; a request without it is not from the page.
  const EDIT_TOKEN = randomBytes(32).toString("hex"), EDIT_META = '<meta name="gtm-brain-edit" content="">';
  const REQUEST_MAX = BODY_MAX * 6 + 4096;   // the 64 KB body as JSON at its longest escaping, plus the other fields
  const sha = buffer => createHash("sha256").update(buffer).digest("hex");
  const editable = () => listDocuments(root).filter(d => d.extra?.type !== "workflow");
  const readNoFollow = rel => { let fd; try { const path = join(root, rel); if (!realpathSync(path).startsWith(realpathSync(root) + '/')) return null; fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); return fstatSync(fd).isFile() ? readFileSync(fd) : null; } catch { return null; } finally { if (fd !== undefined) closeSync(fd); } };
  const runDocument = argv => new Promise(done => execFile(process.execPath, [fileURLToPath(new URL("../scripts/gtm-brain-documents/document.mjs", import.meta.url)), root, ...argv], { cwd: root, env: process.env, encoding: "utf8", timeout: 120000, maxBuffer: 1 << 22 },
    (error, stdout, stderr) => done({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() })));
  // The search box's notes: the memory index's own ranked search (stemmed words, one letter off), run in the
  // reader's worker so a large brain never holds up the page. A read: the query and the count are capped.
  const memoryReader = createMemoryReader({ idleMs: 30000, timeoutMs: 15000, maxPending: 8 });
  const SEARCH_MAX = 200, SEARCH_NOTES = 50;
  async function searchNotes(req, res, url) {
    if (req.headers["sec-fetch-site"] === "cross-site") return json(res, 403, { ok: false, note: "Search from this dashboard's own page." });
    const q = String(url.searchParams.get("q") || "").replace(/\s+/g, " ").trim();
    if (!q) return json(res, 400, { ok: false, note: "Type something to search for." });
    if (q.length > SEARCH_MAX) return json(res, 400, { ok: false, note: `A search is at most ${SEARCH_MAX} characters.` });
    const limit = Math.max(1, Math.min(SEARCH_NOTES, Number.parseInt(url.searchParams.get("limit"), 10) || 6));
    try {
      const text = String(await memoryReader.read(root, "search", { search: q, limit }));
      const notes = [];
      for (const line of text.split("\n")) { if (!line.startsWith("{")) continue; try { const m = JSON.parse(line); if (m && typeof m.id === "string" && typeof m.content === "string") notes.push({ id: m.id, at: m.at, kind: m.kind || "note", context: m.context, authors: (m.authors || []).slice(0, 3), content: m.content.length > 1200 ? m.content.slice(0, 1200) + "…" : m.content, people: (m.people || []).slice(0, 12), tags: (m.tags || []).slice(0, 12), source: (Array.isArray(m.source) ? m.source : []).slice(0, 3) }); } catch {} }
      return json(res, 200, { ok: true, query: q, notes: notes.slice(0, limit), more: Number(text.match(/^(\d+) more match/m)?.[1] || 0) });
    } catch (e) { return json(res, 503, { ok: false, note: "The notes could not be searched just now. Try again in a moment." }); }
  }
  let saving = false;
  async function saveDocument(req, res, host) {
    const refuse = (code, note, more = {}) => { req.resume(); return json(res, code, { ok: false, note, ...more }); };
    if (process.env.GTM_BRAIN_RUN) return refuse(403, "A scheduled or background run does not save documents.");
    if (req.headers.origin !== `http://${host}`) return refuse(403, "Save documents from this dashboard's own page.");
    if (req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "same-origin") return refuse(403, "Save documents from this dashboard's own page.");
    if (!/^application\/json\s*(;|$)/i.test(String(req.headers["content-type"] || ""))) return refuse(415, "JSON only.");
    const given = Buffer.from(String(req.headers["x-gtm-brain-token"] || "")), expected = Buffer.from(EDIT_TOKEN);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return refuse(403, "This page is from an earlier start of the dashboard. Reload it, then save again.");
    if (Number(req.headers["content-length"]) > REQUEST_MAX) return refuse(413, `A document is at most ${BODY_MAX / 1024} KB.`);
    const chunks = []; let size = 0, over = false;
    try { for await (const chunk of req) { size += chunk.length; if (size > REQUEST_MAX) { over = true; break; } chunks.push(chunk); } } catch { return refuse(400, "The request did not arrive whole."); }
    if (over) return refuse(413, `A document is at most ${BODY_MAX / 1024} KB.`);
    let input; try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return refuse(400, "JSON only."); }
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.path !== "string" || typeof input.body !== "string" || typeof input.hash !== "string" || !/^[a-f0-9]{64}$/.test(input.hash)) return refuse(400, "A save needs the document's path, its text and the hash of the version that was opened.");
    if (Buffer.byteLength(input.body, "utf8") > BODY_MAX) return refuse(413, `The text is over ${BODY_MAX / 1024} KB. A document is read in full before the work: keep it shorter or split it.`);
    if (!input.body.trim()) return refuse(422, "A document needs some text.");
    // only a document lib/documents lists, by its exact path: never brain/, the settings, the rules, a workflow or a path of the caller's making
    let doc = null; try { doc = editable().find(d => d.path === input.path) || null; } catch {}
    if (!doc) return refuse(404, "This is not a document of this brain. It may have moved since the dashboard was refreshed.");
    if (saving) return refuse(409, "Another save is still being written. Try again in a moment.");
    saving = true;
    try {
      const now = readNoFollow(doc.path); if (!now) return refuse(404, "The document cannot be read.");
      // the file changed since the person opened it (Codex, a teammate's pull, an edit by hand): nothing is overwritten
      if (sha(now) !== input.hash) { const fresh = editable().find(d => d.path === doc.path); return refuse(409, "The document changed since you opened it. Nothing was saved.", { status: "stale", hash: sha(now), body: fresh ? fresh.body : "" }); }
      const by = lib.currentPerson(root);
      // the script reads a value that starts with -- as the next flag; the writer trims the text, so a line break in front changes nothing
      const out = await runDocument(["--update", doc.path, "--body", input.body.startsWith("--") ? "\n" + input.body : input.body, ...(by ? ["--by", by] : [])]);
      if (out.code) return refuse(out.code === 2 ? 422 : 500, out.stderr || out.stdout || "The document could not be saved.");
      const after = readNoFollow(doc.path), fresh = editable().find(d => d.path === doc.path);
      // layout 3, someone other than the owner: the script says only that the change went to the owner, and the file is as it was
      const proposal = !/^updated document /.test(out.stdout);
      log(`${proposal ? "proposed a change to" : "saved"} ${doc.path} from the page`);
      return json(res, 200, { ok: true, status: proposal ? "proposal" : "saved", note: out.stdout, hash: after ? sha(after) : null, body: fresh ? fresh.body : null });
    } finally { saving = false; }
  }
  // ---------- Entities tab forms: POST /entity-edit (server/entity-edit.mjs), behind the document save's guard and token ----------
  const entityEdit = createEntityEdit({ root, token: EDIT_TOKEN, json, log });
  // ---------- end of the Entities tab forms ----------
  // ---------- Memories tab menu: POST /memory-edit (server/memory-edit.mjs), behind the same guard and token ----------
  const memoryEdit = createMemoryEdit({ root, token: EDIT_TOKEN, json, log });
  // ---------- end of the Memories tab menu ----------
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
    if (req.method === "POST" && url.pathname === "/document") return saveDocument(req, res, host);
    if (req.method === "POST" && url.pathname === "/entity-edit") return entityEdit(req, res, host);
    if (req.method === "POST" && url.pathname === "/memory-edit") return memoryEdit(req, res, host);
    if (req.method === "GET" && url.pathname === "/search") return searchNotes(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { ok: false, note: "GET only" });
    if (url.pathname === '/file') {
      // Open a brain file the front page links to, as text. Only a path the last render listed
      // (data.json pillars.files: documents, RULES.md, SCHEMA.md, admin.md, workflows, entity pages).
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { ok: false, note: 'Open this file from its dashboard.' });
      let fd;
      try {
        const rel = String(url.searchParams.get('path') || '');
        let listed = []; try { listed = JSON.parse(readFileSync(join(home, 'data.json'), 'utf8')).pillars?.files || []; } catch {}
        if (!rel || rel.includes('\0') || rel.split('/').includes('..') || rel.startsWith('/') || !listed.includes(rel)) throw new Error('Unknown file');
        const path = join(root, rel);
        if (!path.startsWith(root + '/') || !realpathSync(path).startsWith(realpathSync(root) + '/')) throw new Error('Unknown file');
        fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const stat = fstatSync(fd); if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error('Not a file');
        const body = readFileSync(fd); closeSync(fd); fd = undefined;
        res.writeHead(200, { ...HDR, 'content-type': 'text/plain; charset=utf-8', 'content-security-policy': "default-src 'none'; sandbox", 'cross-origin-resource-policy': 'same-origin', 'x-gtm-brain-hash': sha(body) });
        return res.end(req.method === 'HEAD' ? undefined : body);
      } catch { if (fd !== undefined) closeSync(fd); return json(res, 404, { ok: false, note: 'File unavailable. It may have moved since this dashboard was refreshed.' }); }
    }
    if (url.pathname === '/design-file' || url.pathname === '/design-visual') {
      // The Design system document's pictures and its one HTML version, read-only. Only what the last render listed
      // (data.json pillars.design): /design-file a png, jpg, svg or webp from the design-system folder, by its exact
      // listed path; /design-visual takes no path and serves the one listed design-system.html. Both go out
      // sandboxed with nosniff, so nothing in an SVG or in the HTML runs script or reads this origin; the page shows
      // an image through <img> and the HTML in an <iframe sandbox>.
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { ok: false, note: 'Open this file from its dashboard.' });
      let fd;
      try {
        let design = null; try { design = JSON.parse(readFileSync(join(home, 'data.json'), 'utf8')).pillars?.design || null; } catch {}
        const visual = url.pathname === '/design-visual';
        const rel = visual ? String(design?.visual || '') : String(url.searchParams.get('path') || '');
        const type = visual ? (/(^|\/)design-system\.html$/.test(rel) ? 'text/html; charset=utf-8' : null) : DESIGN_IMAGES[extname(rel).toLowerCase()];
        const listed = visual ? !!rel : (design?.files || []).some(f => f && f.image && f.path === rel);
        if (!rel || !type || !listed || rel.includes('\0') || rel.split('/').includes('..') || rel.startsWith('/')) throw new Error('Unknown file');
        const path = join(root, rel);
        if (!path.startsWith(root + '/') || realpathSync(path) !== join(realpathSync(root), rel)) throw new Error('Unknown file');
        fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const stat = fstatSync(fd); if (!stat.isFile() || stat.size > (visual ? 2 : 8) * 1024 * 1024) throw new Error('Not a file');
        const body = readFileSync(fd); closeSync(fd); fd = undefined;
        res.writeHead(200, { ...HDR, 'content-type': type, 'cross-origin-resource-policy': 'same-origin',
          'content-security-policy': visual ? "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:" : "sandbox; default-src 'none'; style-src 'unsafe-inline'" });
        return res.end(req.method === 'HEAD' ? undefined : body);
      } catch { if (fd !== undefined) closeSync(fd); return json(res, 404, { ok: false, note: 'File unavailable. It may have moved since this dashboard was refreshed.' }); }
    }
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
      // the page alone carries the token that lets it save a document; a copy opened from disk has none
      if (path === join(home, "index.html") && req.method !== "HEAD") return res.end(readFileSync(path, "utf8").replace(EDIT_META, EDIT_META.replace('content=""', `content="${EDIT_TOKEN}"`)));
      res.end(req.method === "HEAD" ? undefined : readFileSync(path));
    } catch { json(res, 404, { ok: false, note: `not rendered yet: ${file}` }); }
  });

  const prev = readState();
  port = requestedPort ?? ((prev && Number.isInteger(prev.port) && prev.port > 1024) ? prev.port : 40000 + (Array.from(root).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 20000)); let tries = 0;
  server.on("error", e => { if (e.code === "EADDRINUSE" && requestedPort === undefined && tries++ < 20) { port++; server.listen(port, "127.0.0.1"); } else { console.error(e.message); process.exit(1); } });
  server.on("listening", () => {
    const url = `http://127.0.0.1:${port}/`;
    writeFileSync(stateFile, JSON.stringify({ port, pid: process.pid, protocol: PROTOCOL, version: VERSION, url, startedAt: new Date().toISOString() }, null, 1));
    log(`serving ${url}`);
    console.log(url);
  });
  server.listen(port, "127.0.0.1");
  // Leave when the brain is gone or a newer server took over.
  setInterval(() => { const s = readState(); if (!lib.isBrain(root) || (s && s.pid && s.pid !== process.pid && alive(s))) process.exit(0); }, 60000).unref();
  const bye = () => { try { Promise.resolve(memoryReader.close()).catch(() => {}); } catch {} watcher.close(); clearInterval(heartbeat); for (const res of clients) res.end(); const s = readState(); if (s && s.pid === process.pid) remember({ port }); process.exit(0); };
  process.on("SIGTERM", bye); process.on("SIGINT", bye);
}
