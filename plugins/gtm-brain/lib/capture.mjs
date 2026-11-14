/* The nightly capture pass: outcomes that were said in a chat and never saved.
   Once a night (scripts/gtm-brain-schedule/scheduled-run.sh, daily-run.mjs, or capture_chats mode run when the
   chat start offers a late pass) it reads the host's chats in this brain's folder and its linked project
   folders that changed since the last pass, keeps the person's and the assistant's words only, and hands them
   to one bounded model run with no tools whose only job is to list the outcomes nobody saved. Each candidate
   names the chat and the exact sentence it rests on; a sentence that is not in the chat is dropped. What is
   left goes through the remember script like any note (tags captured and capture:<pass>, the chat as source),
   so every rule and check applies, and the next chat start lists it in one line with 'undo captured'.

   Machine-local, in work/ (gitignored): work/capture.json holds the settings, the heartbeat, the cursor per
   chat and the chats a cap left for next time; work/capture-runs.jsonl one record per pass, with its tokens.
   The chats go nowhere but the model run the pass starts. The notes are committed without a push of their
   own; the next commit in the brain shares them with the team like any note, and that is usually the summary
   run right after the pass, so before the person has seen the line. Host specifics live in lib/host.mjs. */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync, mkdtempSync, rmSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { host } from "./host.mjs";
import { readProjects, resolveBrain, listContexts, effectiveMemories, currentPerson, readAdmin, logActivity } from "./brain.mjs";
import { acquireProcessLock, releaseProcessLock } from "./process-lock.mjs";

export const CAP = 200000, CHAT_CAP = 50000, LATE_HOURS = 36;
const FIRST_LOOKBACK_MS = 864e5;          // a first pass reads the last day
const OFFER_EVERY_MS = 864e5;             // the late offer is said at most once a day
const TIMEOUT_MS = () => Number(process.env.GTM_BRAIN_CAPTURE_TIMEOUT_MS) || 10 * 60 * 1000;
const PERSON_MAX = 3000, ASSISTANT_MAX = 1500, EARLIER = 2, MIN_QUOTE = 12;
const REMEMBER = fileURLToPath(new URL("../scripts/gtm-brain-remember/remember.mjs", import.meta.url));

const file = root => join(root, "work", "capture.json");
const runsFile = root => join(root, "work", "capture-runs.jsonl");
const nowMs = () => process.env.GTM_BRAIN_NOW ? Date.parse(process.env.GTM_BRAIN_NOW) : Date.now();
const real = p => { try { return realpathSync(p); } catch { return p; } };
const posInt = v => Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
export const tokens = s => Math.ceil(String(s || "").length / 4);
const when = at => { const t = Date.parse(at); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never"; };
const fold = s => String(s || "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();
const figureOf = x => x.replace(/[.,]$/, "").replace(/[,.](?=\d{3}\b)/g, "").replace(/^0+(?=\d)/, "");   // 40,000 is 40000, 01 is 1
const thousands = n => Number(n || 0).toLocaleString("en-US");

export function readCapture(root) { try { return JSON.parse(readFileSync(file(root), "utf8")) || {}; } catch { return {}; } }
function writeCapture(root, state) {
  mkdirSync(join(root, "work"), { recursive: true });
  const tmp = `${file(root)}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(state, null, 1) + "\n"); renameSync(tmp, file(root));
}
const update = (root, fn) => { const s = readCapture(root); const next = fn(s) || s; writeCapture(root, next); return next; };

/* ---------- settings: on or off, and the two caps; this machine's, like the pass ---------- */
export function captureSettings(root) {
  const s = readCapture(root).settings || {};
  const off = s.on === false || /^(off|0|false|no)$/i.test(process.env.GTM_BRAIN_CAPTURE || "");
  return { on: !off, cap: posInt(s.cap) || CAP, chat_cap: posInt(s.chat_cap) || CHAT_CAP };
}
export function setCapture(root, { on, cap, chat_cap } = {}) {
  for (const [k, v] of [["cap", cap], ["chat_cap", chat_cap]]) if (v !== undefined && v !== null && !posInt(v)) throw new Error(`${k} must be a whole number of tokens above 0`);
  update(root, s => ({ ...s, settings: { ...(s.settings || {}), ...(on !== undefined ? { on: !!on } : {}), ...(posInt(cap) ? { cap: posInt(cap) } : {}), ...(posInt(chat_cap) ? { chat_cap: posInt(chat_cap) } : {}) } }));
  return captureSettings(root);
}

/* ---------- which chats are this brain's ---------- */
export function captureFolders(root) {
  return [{ path: real(root), project: null }, ...readProjects(root).filter(p => p?.path && p.slug).map(p => ({ path: real(p.path), project: p.slug }))];
}
/* A chat belongs to this brain when its folder is the brain, a folder inside it, or a linked project folder
   (or inside one), and the folder itself resolves to this brain: a nested folder of another brain, or a
   folder whose pointer names another brain, is never read. */
export function chatHome(root, cwd, folders = captureFolders(root)) {
  const c = real(cwd);
  const hit = folders.filter(f => c === f.path || c.startsWith(f.path + sep)).sort((a, b) => b.path.length - a.path.length)[0];
  if (!hit) return null;
  const where = resolveBrain(c);
  if (!where || where.missing || real(where.root) !== real(root)) return null;
  return { project: where.project || hit.project || null };
}

/* ---------- a chat, compactly: words only, code and pasted dumps cut ---------- */
export function compactText(text, role) {
  let s = String(text || "").replace(/```[^\n]*\n[\s\S]*?```/g, m => { const n = m.split("\n").length - 2; return n > 6 ? `[code, ${n} lines]` : m; });
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const max = role === "person" ? PERSON_MAX : ASSISTANT_MAX;
  if (s.length > max) s = `${s.slice(0, Math.floor(max * 2 / 3))} [...] ${s.slice(-Math.floor(max / 3))}`;
  return s;
}
const turnLine = t => `${t.role === "person" ? "P" : "A"}${t.at ? ` [${String(t.at).slice(0, 10)}]` : ""}: ${t.text}`;

/* ---------- the plan: what this pass reads, within the caps ---------- */
export function planPass(root, { now = nowMs(), settings = captureSettings(root) } = {}) {
  const h = host().capture, state = readCapture(root), cursors = state.chats || {};
  const since = Number.isFinite(Date.parse(state.through)) ? Date.parse(state.through) : now - FIRST_LOOKBACK_MS;
  const folders = captureFolders(root);
  const found = new Map();
  for (const c of h.chats(since)) found.set(c.file, c);
  // chats a cap left for later are read again whatever their time
  const waiting = (state.pending || []).filter(p => p?.file && !found.has(p.file) && existsSync(p.file)).map(p => p.file);
  if (waiting.length) for (const c of h.chats(0)) if (waiting.includes(c.file)) found.set(c.file, c);   // one listing, however many wait
  const list = [...found.values()].sort((a, b) => a.mtime - b.mtime);
  const saved = list.length ? savedFrom(root, list.map(c => c.id)) : new Map();
  const header = promptHeader(root, []);
  let used = tokens(header);
  const chats = [], skipped = [], covered = [], elsewhere = [];
  let stopped = false;
  for (const c of list) {
    const home = chatHome(root, c.cwd, folders);
    if (!home) { elsewhere.push(c.id); continue; }
    const all = h.turns(c.file).map(t => ({ ...t, text: compactText(t.text, t.role) })).filter(t => t.text);
    const prior = cursors[c.id] || {};
    const from = prior.size && c.size < prior.size ? 0 : Math.min(prior.turns || 0, all.length);
    const fresh = all.slice(from);
    if (!fresh.length) { covered.push(c.id); continue; }
    if (stopped) { skipped.push({ chat: c.id, file: c.file, why: "pass cap", turns: fresh.length, tokens: tokens(fresh.map(turnLine).join("\n")) }); continue; }
    const budget = Math.min(settings.chat_cap, settings.cap - used);
    const earlier = all.slice(Math.max(0, from - EARLIER), from).map(t => ({ ...t, text: t.text.slice(0, 600) }));
    let size = tokens(`=== chat ${c.id}\n`) + tokens(savedBlock(saved, c.id).join("\n")) + tokens(earlier.map(turnLine).join("\n")), take = 0;
    for (const t of fresh) { const n = tokens(turnLine(t) + "\n"); if (size + n > budget) break; size += n; take++; }
    // A pass always moves forward: a cap smaller than one turn (or than the instructions) would otherwise leave the
    // same chat waiting for ever while every pass reports itself partial and the heartbeat stays fine.
    if (!take && (!chats.length || settings.cap - used >= settings.chat_cap)) { size += tokens(turnLine(fresh[0]) + "\n"); take = 1; }
    if (!take) { stopped = true; skipped.push({ chat: c.id, file: c.file, why: "pass cap", turns: fresh.length, tokens: tokens(fresh.map(turnLine).join("\n")) }); continue; }
    chats.push({ id: c.id, kind: c.kind, file: c.file, size: c.size, project: home.project, earlier, turns: fresh.slice(0, take), through: from + take, tokens: size });
    used += size;
    if (take < fresh.length) {
      const left = fresh.slice(take), why = budget < settings.chat_cap ? "pass cap" : "chat cap";
      skipped.push({ chat: c.id, file: c.file, why, turns: left.length, tokens: tokens(left.map(turnLine).join("\n")) });
      if (why === "pass cap") stopped = true;
    }
  }
  return { since: new Date(since).toISOString(), listedAt: new Date(now).toISOString(), chats, skipped, covered, elsewhere: elsewhere.length, tokens: used, settings, saved };
}

/* ---------- the prompt ---------- */
function promptHeader(root, chats) {
  const admin = readAdmin(root) || {};
  const contexts = listContexts(root, { includeMemories: false }).filter(c => c.status === "active").slice(0, 80).map(c => `${c.slug}: ${c.title || c.slug}`).join("\n");
  return [
    `You read work chats of ${admin.company || "a company"}'s team and list the outcomes that were established in them and never saved in the company brain. Use no tools and read no files: everything you need is below. Answer with JSON only.`,
    "An outcome is a decision that was made, a change (of a plan, an owner, a date, a price, a status), a commitment with a date, or a correction of something said or saved earlier. Not: open questions, ideas still being weighed, suggestions the person did not take up, the assistant's own plans, anything about the brain, the plugin or code, and nothing listed under \"saved from this chat\".",
    'Answer {"notes": [...]}, each {"chat": "<chat id>", "context": "<a slug from Contexts>", "kind": "decision" or "note", "content": "<one sentence in English, in the person\'s own words where possible, dates as YYYY-MM-DD, names as written in the chat>", "quote": "<the exact sentence from the chat the note rests on, copied character for character>", "people": ["<full names as written>"], "companies": ["<companies named>"]}. Answer {"notes": []} when nothing qualifies. Never invent an outcome, a date or a name. Lines marked earlier are context already read; take outcomes only from the lines after them.',
    `Contexts:\n${contexts || "(none)"}`,
    "Chats (P is the person, A is the assistant):",
  ].join("\n\n") + "\n";
}
function savedFrom(root, ids) {
  const want = new Set(ids), out = new Map();
  for (const c of listContexts(root)) for (const m of effectiveMemories(c.memories || [])) {
    if (m.retracts) continue;
    for (const s of m.source || []) if (want.has(s.ref)) { if (!out.has(s.ref)) out.set(s.ref, []); out.get(s.ref).push(String(m.content).replace(/\s+/g, " ").slice(0, 200)); }
  }
  return out;
}
function savedBlock(saved, id) { return saved.get(id)?.length ? [`saved from this chat:\n${saved.get(id).slice(0, 40).map(s => `- ${s}`).join("\n")}`] : []; }
export function buildPrompt(root, plan) {
  const saved = plan.saved || savedFrom(root, plan.chats.map(c => c.id));
  return promptHeader(root, plan.chats) + plan.chats.map(c => [
    `=== chat ${c.id}${c.project ? ` (project ${c.project})` : ""}`,
    ...savedBlock(saved, c.id),
    ...c.earlier.map(t => `earlier ${turnLine(t)}`),
    ...c.turns.map(turnLine),
  ].join("\n")).join("\n\n") + "\n";
}

/* ---------- the model run: one, bounded, with no tools ---------- */
function reasonOf(kind, detail, name) {
  const d = String(detail || "").replace(/\s+/g, " ").trim().slice(0, 160);
  if (kind === "missing") return `${name} could not be started: it is not installed where the background run looks (not on its PATH)`;
  if (kind === "timeout") return `the capture run took longer than ${Math.round(TIMEOUT_MS() / 60000)} minutes and was stopped`;
  if (/readonly database|read-only database|attempt to write a readonly|read-only file system/i.test(d)) return `${name} cannot write its own state database on this machine (it is read-only), so no run can start: check the permissions of ${name}'s home folder`;
  if (/not logged in|log ?in|sign(ed)? ?in|unauthori[sz]ed|\b401\b|auth(entication)? (required|failed)|api key/i.test(d)) return `${name} is not signed in on this machine: open ${name} and sign in`;
  if (kind === "output") return `the model's answer was not a list of notes${d ? ` (${d.slice(0, 80)})` : ""}`;
  return `${name} stopped with an error${d ? `: ${d}` : ""}`;
}
export function runModel(prompt, { timeout = TIMEOUT_MS() } = {}) {
  const h = host().capture, stand = process.env.GTM_BRAIN_CAPTURE_MODEL;
  const { cmd, args } = stand ? { cmd: /\.m?js$/.test(stand) ? process.execPath : stand, args: /\.m?js$/.test(stand) ? [stand] : [] } : h.command();
  const cwd = mkdtempSync(join(tmpdir(), "gtm-brain-capture-"));   // an empty folder: no rulebook, no files to read
  return new Promise(done => {
    let out = "", err = "", timedOut = false, settled = false;
    const finish = r => { if (settled) return; settled = true; clearTimeout(timer); try { rmSync(cwd, { recursive: true, force: true }); } catch {} done(r); };
    const grouped = process.platform !== "win32";
    const child = spawn(cmd, args, { cwd, detached: grouped, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, GTM_BRAIN_RUN: "capture" } });
    const kill = sig => { try { grouped ? process.kill(-child.pid, sig) : child.kill(sig); } catch {} };
    const timer = setTimeout(() => { timedOut = true; kill("SIGTERM"); setTimeout(() => kill("SIGKILL"), 1000).unref(); }, timeout);
    child.stdout.on("data", d => { out += d; }); child.stderr.on("data", d => { err += d; });
    child.stdin.on("error", () => {}); child.stdin.end(prompt);
    child.on("error", e => finish({ fail: reasonOf(e.code === "ENOENT" ? "missing" : "error", e.message, h.name) }));
    child.on("close", code => {
      if (timedOut) return finish({ fail: reasonOf("timeout", "", h.name) });
      const parsed = stand ? { text: out, usage: null, error: code ? err : "" } : h.parse(out);
      if (code !== 0 || parsed.error) return finish({ fail: reasonOf("error", [parsed.error, err.split("\n").filter(Boolean).slice(-3).join(" ")].filter(Boolean).join(" "), h.name), usage: parsed.usage });
      finish({ text: parsed.text, usage: parsed.usage });
    });
  });
}

/* ---------- the candidates: only what the chat says, word for word ---------- */
export function readCandidates(text, plan, root) {
  let raw = String(text || "").replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  let parsed; try { parsed = JSON.parse(a >= 0 && b > a ? raw.slice(a, b + 1) : raw); } catch { return null; }
  const notes = Array.isArray(parsed) ? parsed : parsed?.notes;
  if (!Array.isArray(notes)) return null;
  const byId = new Map(plan.chats.map(c => [c.id, c]));
  const active = new Set(listContexts(root, { includeMemories: false }).filter(c => c.status === "active").map(c => c.slug));
  const have = new Set(listContexts(root).flatMap(c => effectiveMemories(c.memories || []).filter(m => !m.retracts).map(m => fold(m.content))));
  const kept = [], dropped = [];
  for (const n of notes) {
    const chat = byId.get(n?.chat), content = String(n?.content || "").replace(/[\u2013\u2014\u2015\u2212]/g, "-").replace(/\s+/g, " ").trim(), quote = String(n?.quote || "").trim();
    if (!chat) { dropped.push({ why: "names no chat that was read", content }); continue; }
    if (!content || !quote) { dropped.push({ chat: chat.id, why: "no content or no quote", content }); continue; }
    const said = fold(chat.turns.map(t => t.text).join("\n"));
    // a word or two is in every chat: the quote has to be enough of a sentence to rest a note on
    if (fold(quote).length < MIN_QUOTE || fold(quote).split(" ").length < 3) { dropped.push({ chat: chat.id, why: "the quote is too short to rest a note on", content }); continue; }
    if (!said.includes(fold(quote))) { dropped.push({ chat: chat.id, why: "the quote is not in the chat", content }); continue; }
    // never an invented name or number: each person and company named, and each figure in the note that is not
    // a date (dates are rewritten as YYYY-MM-DD), has to be in what the chat said
    const people = (Array.isArray(n.people) ? n.people : []).map(String).filter(Boolean), companies = (Array.isArray(n.companies) ? n.companies : []).map(String).filter(Boolean);
    const words = new Set(said.split(/[^\p{L}\p{N}]+/u)), figures = new Set((said.match(/\d[\d.,]*\d|\d/g) || []).map(figureOf));
    const unsaid = [...people, ...companies].find(x => !fold(x).split(/[^\p{L}\p{N}]+/u).some(w => w.length > 1 && words.has(w)));
    if (unsaid) { dropped.push({ chat: chat.id, why: `names ${unsaid}, who is not in the chat`, content }); continue; }
    const figure = (content.replace(/\b\d{4}-\d\d-\d\d\b/g, " ").match(/\d[\d.,]*\d|\d/g) || []).find(x => !figures.has(figureOf(x)));
    if (figure) { dropped.push({ chat: chat.id, why: `the figure ${figure} is not in the chat`, content }); continue; }
    if (!active.has(n.context)) { dropped.push({ chat: chat.id, why: `no active context ${n.context || "(none)"}`, content }); continue; }
    if (have.has(fold(content))) { dropped.push({ chat: chat.id, why: "already saved", content }); continue; }
    have.add(fold(content));
    kept.push({ chat: chat.id, kind: chat.kind, project: chat.project, context: n.context, type: n.kind === "decision" ? "decision" : "note", content, quote,
      people, companies });
  }
  return { kept, dropped };
}

/* ---------- saving and withdrawing: the remember script, as for any note ---------- */
/* The pass saves as the schedule and leaves sharing to the next ordinary commit; the person's undo is their own
   save from a chat (via codex, pushed at once, the summaries recompiled), so a withdrawal never waits on this
   laptop while the notes it withdraws are already with the team. */
function remember(root, by, entries, { person = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "gtm-brain-capture-batch-")), batch = join(dir, "batch.json");
  try {
    writeFileSync(batch, JSON.stringify(entries));
    const { GTM_BRAIN_NO_PUSH, ...env } = process.env;
    const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", REMEMBER, root, "--by", by, "--batch", batch, "--via", person ? "codex" : "schedule"],
      { cwd: root, encoding: "utf8", timeout: 120000, env: person ? env : { ...env, GTM_BRAIN_RUN: "schedule", GTM_BRAIN_NO_PUSH: "1" } });
    return { ok: r.status === 0, out: `${r.stdout || ""}${r.stderr || ""}`.trim() };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const tagged = (root, tag) => listContexts(root).flatMap(c => effectiveMemories(c.memories || []).filter(m => !m.retracts && (m.tags || []).includes(tag)));

/* ---------- one pass ---------- */
export async function runPass(root, { now = nowMs(), by } = {}) {
  const settings = captureSettings(root);
  if (!settings.on) return { result: "off", text: "chat capture is off on this machine (capture_chats mode on turns it on)" };
  mkdirSync(join(root, "work"), { recursive: true });
  const lock = join(root, "work", "capture.lock"), token = acquireProcessLock(lock);
  if (!token) return { result: "busy", text: "a capture pass is already running" };
  const id = `c_${new Date(now).toISOString().replace(/[-:]/g, "").slice(0, 15)}`, at = new Date(now).toISOString(), name = host().capture.name;
  const record = { id, at, result: "failed", tokens: { estimated: 0, input: 0, cached: 0, output: 0 }, chats: 0, covered: 0, skipped: [], candidates: 0, saved: [], dropped: [], held: 0 };
  const fail = reason => { record.reason = reason; return finishPass(root, record, null); };
  try {
    // the chats first: a night with nothing new costs nothing, not even the sign-in check
    let plan; try { plan = planPass(root, { now, settings }); } catch (e) { return fail(`the chat history could not be read: ${e.message}`); }
    Object.assign(record, { since: plan.since, chats: plan.chats.length, covered: plan.covered.length, skipped: plan.skipped.map(({ file, ...s }) => s), tokens: { ...record.tokens, estimated: plan.tokens } });
    const advance = (s, extra = {}) => ({ ...s, ...extra, through: plan.listedAt,
      chats: { ...(s.chats || {}), ...Object.fromEntries(plan.chats.map(c => [c.id, { turns: c.through, size: c.size, at }])) },
      pending: plan.skipped.map(x => ({ chat: x.chat, file: x.file })) });
    if (!plan.chats.length) { record.result = "ok"; record.tokens.estimated = 0; return finishPass(root, record, advance); }
    const person = currentPerson(root, by);
    if (!person) return fail("this checkout has no confirmed person to save notes as (work/person.json or a git email in admin.md team)");
    if (!process.env.GTM_BRAIN_CAPTURE_MODEL) { const pre = host().capture.preflight(); if (pre) return fail(reasonOf(pre.missing ? "missing" : "error", pre.detail, name)); }
    const reply = await runModel(buildPrompt(root, plan));
    if (reply.usage) Object.assign(record.tokens, reply.usage);
    if (reply.fail) return fail(reply.fail);
    const found = readCandidates(reply.text, plan, root);
    if (!found) return fail(reasonOf("output", String(reply.text).slice(0, 80), name));
    record.candidates = found.kept.length; record.dropped = found.dropped.map(d => ({ chat: d.chat, why: d.why }));
    if (found.kept.length) {
      const saved = remember(root, person, found.kept.map(k => ({ content: k.content, kind: k.type, context: k.context, people: k.people, companies: k.companies,
        sources: [{ kind: k.kind, ref: k.chat }], tags: ["captured", `capture:${id}`, ...(k.project ? [`project:${k.project}`] : [])] })));
      const mine = tagged(root, `capture:${id}`);
      record.saved = mine.map(m => m.id); record.held = found.kept.length - mine.length;
      if (record.held) record.remember = saved.out.split("\n").filter(l => /held|not kept|not remembered|ask/i.test(l)).slice(0, 5).map(l => l.slice(0, 200));
      // nothing kept because the saving rules held every candidate is a pass that ran: the chat start names them
      if (!saved.ok && !mine.length && !/^not (kept|remembered yet)\b/m.test(saved.out)) return fail(`the notes could not be saved: ${saved.out.split("\n")[0].slice(0, 160)}`);
      record.notes = mine.map(m => ({ id: m.id, context: m.context, content: m.content }));
      // held by the saving rules (an unclear name, a relative date): never dropped silently, the chat start names them
      const kept = new Set(mine.map(m => fold(m.content)));
      record.heldNotes = found.kept.filter(k => !kept.has(fold(k.content))).map(k => ({ chat: k.chat, context: k.context, content: k.content }));
    }
    record.result = plan.skipped.length ? "partial" : "ok";
    return finishPass(root, record, advance);
  } catch (e) { return fail(`the pass stopped: ${e.message}`); }
  finally { releaseProcessLock(lock, token); }
}
function finishPass(root, record, advance) {
  const ok = record.result !== "failed";
  update(root, s => {
    const base = ok && advance ? advance(s) : s;
    const notes = [...(base.announce?.notes || []), ...(record.notes || [])], held = [...(base.announce?.held || []), ...(record.heldNotes || [])];
    return { ...base, last: { id: record.id, at: record.at, result: record.result, tokens: record.tokens.input || record.tokens.estimated, saved: record.saved.length, ...(record.reason ? { reason: record.reason } : {}), ...(record.skipped.length ? { skipped: record.skipped.length } : {}) },
      ...(ok ? { lastOk: record.at } : {}),
      ...(notes.length || held.length ? { announce: { since: base.announce?.since || record.since || record.at, notes, ...(held.length ? { held } : {}) } } : {}) };
  });
  try { appendFileSync(runsFile(root), JSON.stringify(record) + "\n"); } catch {}
  logActivity(root, "capture", `${record.result}: ${record.saved.length} saved from ${record.chats} chats, ${thousands(record.tokens.input || record.tokens.estimated)} tokens${record.skipped.length ? `, ${record.skipped.length} left for the next pass` : ""}${record.reason ? `; ${record.reason}` : ""}`);
  return { result: record.result, record, text: passText(record) };
}
export function passText(r) {
  if (r.result === "failed") return `chat capture failed: ${r.reason}`;
  const left = r.skipped.length ? `; ${r.skipped.length} chat${r.skipped.length === 1 ? "" : "s"} left for the next pass at the ${r.skipped.some(s => s.why === "pass cap") ? "pass" : "chat"} cap (${r.skipped.map(s => `${s.chat} ${thousands(s.tokens)} tokens`).join(", ")})` : "";
  return `chat capture: read ${r.chats} chat${r.chats === 1 ? "" : "s"} (${thousands(r.tokens.input || r.tokens.estimated)} tokens), saved ${r.saved.length} note${r.saved.length === 1 ? "" : "s"}${r.held ? `, ${r.held} held by the saving rules` : ""}${r.dropped.length ? `, ${r.dropped.length} dropped` : ""}${left}`;
}

/* ---------- undo: the captured notes not yet withdrawn, withdrawn together ---------- */
export function undoCaptured(root, { by, pass } = {}) {
  const person = currentPerson(root, by);
  if (!person) throw new Error("no confirmed person in this checkout to withdraw the notes as");
  const state = readCapture(root);
  // what the person was shown (undo, set when the chat start listed them); before any listing, what waits to be listed
  const ids = pass ? null : new Set(((state.undo?.notes?.length ? state.undo : state.announce)?.notes || []).map(n => n.id));
  const targets = (pass ? tagged(root, `capture:${pass}`) : tagged(root, "captured").filter(m => ids.has(m.id)));
  if (!targets.length) return { withdrawn: 0, text: "no captured notes to withdraw" };
  const r = remember(root, person, targets.map(m => ({ context: m.context, retracts: m.id, content: `Withdrawn: a note the chat capture saved from a chat; the person said undo captured.` })), { person: true });
  const left = new Set(tagged(root, "captured").map(m => m.id)), gone = targets.filter(m => !left.has(m.id));
  // only what was withdrawn leaves the lists: a later pass's unseen notes are still listed, a failed undo can be said again
  const out = new Set(gone.map(m => m.id)), keep = list => (list || []).filter(x => !out.has(x.id));
  update(root, s => {
    const { announce, undo, ...rest } = s, a = keep(announce?.notes), u = keep(undo?.notes);
    return { ...rest, ...(a.length || announce?.held?.length ? { announce: { ...announce, notes: a } } : {}), ...(u.length ? { undo: { notes: u } } : {}) };
  });
  return { withdrawn: gone.length, text: gone.length ? `withdrew ${gone.length} captured note${gone.length === 1 ? "" : "s"}: ${gone.map(m => m.id).join(", ")}` : `nothing withdrawn: ${r.out.split("\n")[0]}` };
}

/* ---------- the heartbeat: one part of the health line, and the chat start's one line ---------- */
export function captureHealth(root, now = nowMs()) {
  const settings = captureSettings(root), s = readCapture(root), last = s.last;
  if (!settings.on) return { state: "off", text: "chat capture: off on this machine" };
  if (!last) return { state: "never", text: "chat capture: no pass yet on this machine" };
  const lateBy = s.lastOk ? now - Date.parse(s.lastOk) : Infinity;
  if (last.result === "failed") return { state: "failed", text: `chat capture: the last pass failed ${when(last.at)}: ${last.reason}${s.lastOk ? `; last good pass ${when(s.lastOk)}` : "; no good pass yet"}` };
  if (lateBy > LATE_HOURS * 3600e3) return { state: "late", text: `chat capture: late, the last good pass was ${when(s.lastOk)} (more than ${LATE_HOURS} hours ago)` };
  return { state: "fine", text: `chat capture: last pass ${when(last.at)}, ${last.saved || 0} note${last.saved === 1 ? "" : "s"} saved, ${thousands(last.tokens)} tokens${last.skipped ? `, ${last.skipped} chat${last.skipped === 1 ? "" : "s"} left for the next pass` : ""}` };
}
/* At most two things at a chat start, each one line: the notes the last passes saved (once), and the offer to
   run a late or failed pass now (at most once a day). Never runs the pass itself. */
export function captureNotice(root, { now = nowMs(), mark = true } = {}) {
  if (process.env.GTM_BRAIN_RUN) return "";
  const settings = captureSettings(root); if (!settings.on) return "";
  const s = readCapture(root), out = [];
  const live = s.announce?.notes?.length ? new Set(tagged(root, "captured").map(m => m.id)) : new Set();
  const notes = (s.announce?.notes || []).filter(n => live.has(n.id));
  if (notes.length) {
    const day = String(s.announce.since || "").slice(0, 10);
    const shown = notes.slice(0, 5).map(n => `"${String(n.content).replace(/\s+/g, " ").slice(0, 90)}${String(n.content).length > 90 ? "..." : ""}"`).join("; ");
    out.push(`CAPTURED: ${notes.length} note${notes.length === 1 ? "" : "s"} captured from chats since ${day}: ${shown}${notes.length > 5 ? ` and ${notes.length - 5} more` : ""}. Tell the person in one line, in these words, after answering their request: "${notes.length} note${notes.length === 1 ? "" : "s"} captured from your recent chats: ${shown}. Say 'undo captured' to withdraw them." On undo captured: capture_chats mode undo, once.`);
  }
  const held = s.announce?.held || [];
  if (held.length) out.push(`CAPTURED, HELD: ${held.length} outcome${held.length === 1 ? "" : "s"} from recent chats the saving rules held (an unclear name or date): ${held.slice(0, 3).map(x => `"${String(x.content).slice(0, 90)}" (${x.context})`).join("; ")}. Mention ${held.length === 1 ? "it" : "them"} in the same line and offer to save ${held.length === 1 ? "it" : "them"} with remember once the person settles the name or date; nothing is saved without that.`);
  const h = captureHealth(root, now);
  const offerDue = ["late", "failed", "never"].includes(h.state) && !(Number.isFinite(Date.parse(s.offered)) && now - Date.parse(s.offered) < OFFER_EVERY_MS);
  if (offerDue) {
    const why = h.state === "failed" ? `the last pass failed: ${s.last.reason}` : h.state === "never" ? "it has not run on this machine yet" : `the last good pass was ${when(s.lastOk)}`;
    out.push(`CAPTURE LATE: the nightly chat capture (outcomes said in chats and never saved) is behind: ${why}. After answering, offer once, in one line: "The nightly chat capture is behind (${why}). Run it now in the background? Yes, run it now / No, skip it." On yes: capture_chats mode run (it returns at once). ${h.state === "failed" ? "If the reason needs the person (sign-in, permissions), say what to fix instead of offering the run. " : ""}Never run it without a yes; turning it off is capture_chats mode off.`);
  }
  if (mark && (notes.length || held.length || offerDue)) update(root, x => {
    const { announce, ...rest } = x;
    return { ...rest, ...(offerDue ? { offered: new Date(now).toISOString() } : {}), ...(notes.length ? { undo: { notes } } : {}) };
  });
  return out.join("\n");
}

/* ---------- starting a pass from a chat: detached, so the person's turn never waits on it ---------- */
export function startPass(root) {
  if (!captureSettings(root).on) return "chat capture is off on this machine; capture_chats mode on turns it on";
  const script = fileURLToPath(new URL("../scripts/gtm-brain-schedule/capture.mjs", import.meta.url));
  mkdirSync(join(root, "work"), { recursive: true });
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", script, root, "--run"], { cwd: root, detached: true, stdio: "ignore", env: process.env });
  child.unref();
  return "chat capture started in the background; what it saves is listed at the next chat start (capture_chats mode status shows the result)";
}

export const statusText = root => {
  const st = captureSettings(root), h = captureHealth(root);
  return `${h.text}. Settings on this machine: ${st.on ? "on" : "off"}, cap ${thousands(st.cap)} tokens per pass, ${thousands(st.chat_cap)} per chat.`;
};
