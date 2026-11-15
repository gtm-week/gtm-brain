// POST /memory-edit: the Memories tab's menu on a note. Five named operations, each exactly one call of the remember
// script the MCP tool runs, never a file write of its own. Notes are append-only: nothing here edits or removes a
// line of memories.jsonl. A note changes by a newer one that replaces it, or by one that withdraws it.
//
//   correct   scripts/gtm-brain-remember/remember.mjs   one note with the new text, supersedes the old one
//   retract   scripts/gtm-brain-remember/remember.mjs   one note that retracts it, with the reason
//   move      scripts/gtm-brain-remember/remember.mjs   one call, two entries: the note withdrawn in its topic
//                                                       ("Moved to ..."), the same text and sources in the other.
//                                                       remember refuses a supersedes that points into another
//                                                       topic, so a move cannot be one superseding note.
//   set_kind  scripts/gtm-brain-remember/remember.mjs   one note with the same text and the new kind, supersedes it
//   answer    scripts/gtm-brain-remember/remember.mjs   one decision that retracts the open question (how an answer
//                                                       closes a question everywhere else in the plugin)
//
// The guard is the entity forms' (server/entity-edit.mjs), in the same order: this server's own Origin, the token
// made at each start and served only inside the page, JSON, a small body, never from a scheduled or background run.
// The author is the person on this machine (lib.currentPerson). Every note written carries that person and the
// dashboard as sources, then the sources of the note it is about.
import { execFile } from "node:child_process";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as lib from "../lib/brain.mjs";
import * as dots from "../lib/dots.mjs";
import * as checks from "../lib/note-checks.mjs";

export const MEMORY_EDIT_TEXT_MAX = 8000;            // characters in one note written from the page
export const MEMORY_EDIT_MAX = 64 * 1024;            // the request: that text as JSON at its longest escaping, plus the other fields
export const MEMORY_EDIT_OPS = ["correct", "retract", "move", "set_kind", "answer"];
const KINDS = ["note", "decision", "question"];
const ID = /^m_[0-9a-f]{6,12}$/, SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
// the fields of a plain note; one with anything else (a connection, a customer status, an attachment, a meeting
// record) is changed where that block is understood, not by a copy of its words
const PLAIN = new Set(["id", "context", "at", "authors", "via", "kind", "tools", "people", "content", "source", "actions", "supersedes", "retracts", "tags", "entities", "entity_mentions"]);
const QUESTION_TAGS = /^(brain-question|name-question|about:|name:|pick:)/;
const script = rel => fileURLToPath(new URL(`../scripts/${rel}`, import.meta.url));
class Refusal extends Error { constructor(code, note) { super(note); this.code = code; } }
const no = (code, note) => { throw new Refusal(code, note); };
const short = (s, n = 80) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 3) + "..." : t; };

export function createMemoryEdit({ root, token, json, log = () => {} }) {
  const run = argv => new Promise(done => execFile(process.execPath, [script("gtm-brain-remember/remember.mjs"), root, ...argv], { cwd: root, env: process.env, encoding: "utf8", timeout: 120000, maxBuffer: 1 << 22 },
    (error, stdout, stderr) => done({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() })));
  // what the script said, without the part written for the model
  const said = out => (out.stderr || out.stdout || "").split("\n").filter(l => l.trim() && !/^(Reply to the person|kept )/.test(l.trim())).slice(0, 2).join(" ")
    .replace(/^(#\d+ )?(not remembered yet|nothing remembered|not remembered|not kept \(\d+ of \d+\)):\s*/, "").replace(/\s+(Whatever is still unclear|No question needed|Fix these and call again|Then remember)\b[\s\S]*$/, "").trim().slice(0, 600);
  // the one remember call: the entries go in a batch file, as the MCP tool passes them
  const remember = async (by, entries) => {
    mkdirSync(join(root, "work"), { recursive: true });
    const batch = join(root, "work", `remember-${randomUUID()}.json`);
    try {
      writeFileSync(batch, JSON.stringify(entries));
      const out = await run(["--by", by, "--batch", batch]);
      return { out, ids: [...out.stdout.matchAll(/\bremembered (m_[0-9a-f]{6,12}) in ([a-z0-9-]+)/g)].map(m => ({ id: m[1], context: m[2] })) };
    } finally { try { rmSync(batch, { force: true }); } catch {} }
  };
  const one = async (by, entry) => { const { out, ids } = await remember(by, [entry]); if (out.code || ids.length !== 1) no(422, said(out) || "The note could not be saved."); return ids[0]; };
  const titleOf = c => c?.title || c?.slug || "that topic";
  // the note, where it lives, and that it is still in force
  const find = id => {
    if (typeof id !== "string" || !ID.test(id)) no(400, "Say which note.");
    const contexts = lib.listContexts(root);
    for (const c of contexts) {
      const m = (c.memories || []).find(x => x.id === id); if (!m) continue;
      if (m.retracts) no(409, "That line is a withdrawal or an answer, not a note of its own.");
      if (c.memories.some(x => x.retracts === id)) no(409, "This note was already withdrawn. Refresh the page.");
      if (c.memories.some(x => x.supersedes === id)) no(409, "This note was already replaced by a newer one. Refresh the page.");
      return { m, c, contexts };
    }
    no(404, "That note is not in the brain any more. Refresh the page.");
  };
  const plain = (m, what) => { const extra = Object.keys(m).filter(k => !PLAIN.has(k) && m[k] !== undefined && m[k] !== null); if (extra.length) no(422, `This note also records ${extra.includes("relation") ? "a connection between two entities" : extra.includes("customer") ? "a customer status" : extra.includes("asset") ? "an attachment" : "a meeting"}, which a copy of its words would lose. ${what} it in a chat${extra.some(k => k === "relation" || k === "customer") ? " or on the Entities tab" : ""}.`); };
  const text = v => {
    if (typeof v !== "string" || !v.trim()) no(400, "A note needs some text.");
    if (v.trim().length > MEMORY_EDIT_TEXT_MAX) no(413, `A note is at most ${MEMORY_EDIT_TEXT_MAX.toLocaleString("en-US")} characters. Put a longer text in a document.`);
    return v.trim();
  };
  // the person and the dashboard, then what the note itself rested on
  const sources = (by, m) => { const seen = new Set(), out = []; for (const s of [{ kind: "user", ref: by }, { kind: "dashboard", ref: "memories" }, ...(Array.isArray(m.source) ? m.source : [])]) { if (!s || typeof s.kind !== "string" || typeof s.ref !== "string") continue; const k = `${s.kind}\n${s.ref}`; if (seen.has(k)) continue; seen.add(k); out.push({ kind: s.kind, ref: s.ref, ...(s.account ? { account: s.account } : {}), ...(s.url ? { url: s.url } : {}) }); } return out; };
  // the same note again, with what it already carried
  const copy = (by, m, over = {}) => ({ context: m.context, content: m.content, kind: KINDS.includes(m.kind) ? m.kind : "note", people: m.people || [], tools: m.tools || [], tags: m.tags || [],
    actions: (m.actions || []).map(a => [a.tool, a.action, ...(a.ref ? [a.ref] : [])].join(":")), sources: sources(by, m), ...over });
  const back = (ctx, id) => { const r = lib.readMemories(root, ctx).find(x => x.id === id); if (!r) no(500, "The note was not saved."); return { id: r.id, at: r.at, kind: r.kind, context: r.context, content: r.content, authors: r.authors, people: r.people, tags: r.tags, source: r.source, supersedes: r.supersedes, retracts: r.retracts }; };

  const OPS = {
    async correct(input, by) {
      const { m } = find(input.id), content = text(input.text); plain(m, "Correct");
      if (content === String(m.content).trim()) no(400, "Nothing was changed.");
      const made = await one(by, copy(by, m, { content, supersedes: m.id }));
      return { status: "corrected", memory: made.id, record: back(made.context, made.id), note: "Corrected. The old note is kept in history." };
    },
    async retract(input, by) {
      const { m } = find(input.id);
      const reason = input.reason === undefined || input.reason === null || input.reason === "" ? null : (typeof input.reason === "string" && input.reason.trim() && !/[\r\n]/.test(input.reason) && input.reason.trim().length <= 300 ? input.reason.trim() : no(400, "The reason is one line of at most 300 characters."));
      const made = await one(by, { context: m.context, retracts: m.id, content: reason ? `Withdrawn: ${reason}` : "Withdrawn: this was wrong.", sources: sources(by, m) });
      return { status: "retracted", memory: made.id, record: back(made.context, made.id), note: "Withdrawn. The note stays in history, marked as withdrawn." };
    },
    async move(input, by) {
      const { m, c, contexts } = find(input.id); plain(m, "Move");
      if (typeof input.topic !== "string" || !SLUG.test(input.topic)) no(400, "Choose a topic.");
      const to = contexts.find(x => x.slug === input.topic);
      if (!to || (to.status && to.status !== "active")) no(404, "That topic is not in the brain any more. Refresh the page.");
      if (to.slug === c.slug) no(400, `The note is already in ${titleOf(c)}.`);
      // the two entries are written one after the other, so what would stop the second is checked before the first
      const entry = copy(by, m, { context: to.slug });
      if (dots.relativeDates(m.content).length) no(422, "This note names a day in words (like \"Thursday\" or \"next week\"). Correct it so it carries the date, then move it.");
      const speakers = (lib.readAdmin(root)?.team || []).filter(p => p && p.handle === by && p.name).map(p => p.name);
      const pool = contexts.flatMap(x => lib.effectiveMemories(x.memories || []).map(n => ({ ...n, context: n.context || x.slug }))).filter(n => n.id !== m.id && !lib.isForkCopy(n));
      const twin = checks.restatement(pool, { content: entry.content, people: entry.people, sources: entry.sources, tags: entry.tags }, { speakers });
      const other = twin && (twin.kept || twin.candidate || twin.corrects || twin.changed);
      if (other) no(409, `Another note already says much the same${other.context ? ` in ${titleOf(contexts.find(x => x.slug === other.context))}` : ""}: "${short(other.content)}". Withdraw one of the two instead, or sort them out in a chat.`);
      const { out, ids } = await remember(by, [{ context: c.slug, retracts: m.id, content: `Moved to ${titleOf(to)}.`, sources: sources(by, m) }, entry]);
      const made = ids.find(x => x.context === to.slug && x !== ids[0]) || (ids.length === 2 ? ids[1] : null);
      if (!ids.length) no(422, said(out) || "The note could not be moved.");
      if (!made) no(500, `The note was taken out of ${titleOf(c)} but not saved in ${titleOf(to)}: ${said(out) || "the save failed"} Its text is in history; ask in a chat to save it in ${titleOf(to)}.`);
      return { status: "moved", memory: made.id, record: back(made.context, made.id), note: `Moved to ${titleOf(to)}.` };
    },
    async set_kind(input, by) {
      const { m } = find(input.id); plain(m, "Change");
      if (!KINDS.includes(input.kind)) no(400, "Choose note, decision or question.");
      if ((m.kind || "note") === input.kind) no(400, `It is already a ${input.kind}.`);
      const made = await one(by, copy(by, m, { kind: input.kind, supersedes: m.id, tags: (m.tags || []).filter(t => m.kind !== "question" || !QUESTION_TAGS.test(t)) }));
      return { status: "changed", memory: made.id, record: back(made.context, made.id), note: `Now a ${input.kind}. The earlier version is kept in history.` };
    },
    async answer(input, by) {
      const { m } = find(input.id), content = text(input.text);
      if (m.kind !== "question") no(422, "Only an open question can be answered.");
      if ((m.tags || []).includes("name-question")) no(422, "This question asks who someone is. Answer it in a chat, so the name is linked to the note it is about.");
      const made = await one(by, { context: m.context, retracts: m.id, kind: "decision", content, tags: (m.tags || []).filter(t => t.startsWith("project:")), sources: sources(by, m) });
      return { status: "answered", memory: made.id, record: back(made.context, made.id), note: "Answer saved. The question is closed." };
    },
  };

  let busy = false;
  return async function memoryEdit(req, res, host) {
    const refuse = (code, note, more = {}) => { req.resume(); return json(res, code, { ok: false, note, ...more }); };
    // the same guard as the document save and the entity forms, in the same order
    if (process.env.GTM_BRAIN_RUN) return refuse(403, "A scheduled or background run does not change notes.");
    if (req.headers.origin !== `http://${host}`) return refuse(403, "Change notes from this dashboard's own page.");
    if (req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "same-origin") return refuse(403, "Change notes from this dashboard's own page.");
    if (!/^application\/json\s*(;|$)/i.test(String(req.headers["content-type"] || ""))) return refuse(415, "JSON only.");
    const given = Buffer.from(String(req.headers["x-gtm-brain-token"] || "")), expected = Buffer.from(token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return refuse(403, "This page is from an earlier start of the dashboard. Reload it, then save again.");
    if (Number(req.headers["content-length"]) > MEMORY_EDIT_MAX) return refuse(413, "That is too much for one note.");
    const chunks = []; let size = 0, over = false;
    try { for await (const chunk of req) { size += chunk.length; if (size > MEMORY_EDIT_MAX) { over = true; break; } chunks.push(chunk); } } catch { return refuse(400, "The request did not arrive whole."); }
    if (over) return refuse(413, "That is too much for one note.");
    let input; try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return refuse(400, "JSON only."); }
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.op !== "string") return refuse(400, "Say what to change.");
    if (!MEMORY_EDIT_OPS.includes(input.op) || !Object.hasOwn(OPS, input.op)) return refuse(400, "This page cannot do that. Ask in a chat.");
    const by = lib.currentPerson(root);
    if (!by) return refuse(403, "The brain does not know who is at this computer yet. Start a chat in Codex once, then try again.");
    if (busy) return refuse(409, "Another change is still being saved. Try again in a moment.");
    busy = true;
    try {
      const result = await OPS[input.op](input, by);
      log(`${input.op} from the page: ${result.note}`);
      return json(res, 200, { ok: true, ...result });
    } catch (e) {
      if (e instanceof Refusal) return json(res, e.code, { ok: false, note: e.message });
      return json(res, 500, { ok: false, note: "The change could not be saved." });
    } finally { busy = false; }
  };
}
