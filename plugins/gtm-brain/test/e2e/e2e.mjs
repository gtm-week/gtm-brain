#!/usr/bin/env node
// Deterministic end-to-end checks on a generated brain, scored against its gold ledger.
//   node test/e2e/e2e.mjs <brain> --gold <gold.json> [--json] [--keep]
// The brain is copied to a scratch folder first (the write checks append notes), then the real
// MCP server is driven over stdio, as server.test.mjs does, and a few scripts are run directly
// (compile --facts through a pipe, remember --batch). No model, no connectors, no network.
// Each check: id, section, pass or fail, ms, bytes. A check that fails because of a gap main is
// known to have is marked known_gap, so a fix shows up as a check that turns to pass.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const P = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const KiB = 1024;
// note ids anywhere in a text (Markdown escapes the underscore), and the ids of the rows query returns
// a JSON reply may end with a trailer line the server adds (the save nudge after a few reads)
const jsonOf = s => { const t = String(s), end = t.lastIndexOf("}"); try { return JSON.parse(t.slice(0, end + 1)); } catch { return null; } };
const ids = s => [...new Set(String(s).replace(/m\\_/g, "m_").match(/\bm_[0-9a-f]{6,}\b/g) || [])];
const rowIds = s => [...new Set([...String(s).matchAll(/"id":"(m_[0-9a-f]{6,})"/g)].map(m => m[1]))];
const hasAll = (s, list) => list.every(x => s.includes(x));
// entities.mjs --relations and --customers print everything with console.log and then call process.exit: read through
// the pipe of the MCP server the reply ends at 64 KiB (65,536 bytes), on main 7890c69 and on 0.35.0 alike. Small
// brains fit; at about 1,500 relations (180 KiB) and 200 customers (340 KiB) most of the list is gone, with no notice.
// entities.mjs reads its options as --name value pairs starting at --relations itself, so the option right after it is
// taken as the value of --relations and lost: search alone returns every relationship, search with filters.type only
// filters by type. The other relation checks pass because the entity is somewhere in the full list; on messy the
// works_at list is over 64 KiB and the job change falls behind the cut.
// remember ends with lib.rerender, which starts a dashboard render in the background. Up to 0.34.5 the render held the
// memory index lock (memory-index-lock.sqlite) for the whole render and a query in that window was refused after 1 s.
// Since 0.35.0 the render holds it only while the index catches up, then reads a pinned snapshot; a read waits for the
// lock instead of refusing. index.read_after_write counts any refusal that is left; it must stay at zero.

export async function runChecks({ brain: source, gold: goldPath, keep = false }) {
  const gold = JSON.parse(readFileSync(goldPath, "utf8"));
  const scratch = mkdtempSync(join(tmpdir(), "gtm-e2e-run-")), brain = join(scratch, "brain");
  cpSync(resolve(source), brain, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "gtm-e2e-profile-"));
  const env = { ...process.env, CODEX_HOME: profile, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_SESSION_START: "1", PLUGIN_ROOT: P };
  const server = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env });
  server.stderr.resume();
  const pending = new Map(); let seq = 0;
  createInterface({ input: server.stdout }).on("line", line => { let m; try { m = JSON.parse(line); } catch { return; } const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); } });
  const rpc = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "0" } });
  const call = async (name, args) => { const m = await rpc("tools/call", { name, arguments: { brain, ...args } }); if (m.error) return { text: m.error.message || "", isError: true }; return { text: (m.result.content || []).map(c => c.text).join("\n"), isError: !!m.result.isError }; };
  const script = (rel, args, input) => { const r = spawnSync(process.execPath, [join(P, rel), ...args], { cwd: brain, env, input, maxBuffer: 1 << 30, encoding: "utf8" }); return { text: r.stdout || "", err: r.stderr || "", code: r.status }; };
  const by = gold.owner.handle;

  const results = [];
  const check = async (id, section, fn, { known_gap = null } = {}) => {
    const t = Date.now(); let pass = false, bytes = 0, note = "";
    let text = ""; try { const r = await fn(); pass = !!r.pass; bytes = r.bytes ?? Buffer.byteLength(r.text || ""); note = r.note || ""; text = r.text || ""; } catch (e) { note = `threw: ${e.message}`; }
    results.push({ id, section, pass, ms: Date.now() - t, bytes, ...(note ? { note } : {}), ...(!pass && known_gap ? { known_gap } : {}), ...(!pass && process.env.E2E_DEBUG ? { text: text.slice(0, 2500) } : {}) });
  };
  // A read refused while the index is being refreshed (fixed in 0.35.0) is still retried
  // here so a write check judges the write, and counted: index.read_after_write reports the refusals as one known gap.
  let busy = 0; const busyAt = [];
  const q = async (args) => { for (let i = 0; ; i++) { const r = await call("query", args); if (!(r.isError && /Memory index is busy/.test(r.text)) || i >= 20) return r; busy++; busyAt.push(results.length); await new Promise(done => setTimeout(done, 500)); } };
  const found = (text, want, pick = rowIds) => { const got = pick(text), miss = want.filter(x => !got.includes(x)); return { pass: !miss.length && want.length > 0, text, note: miss.length ? `missing ${miss.length}/${want.length}` : "" }; };

  /* ---------- search ---------- */
  const N = gold.needles;
  await check("search.single_word", "search", async () => found((await q({ object: "memories", search: N.single.query })).text, N.single.ids));
  await check("search.multi_word", "search", async () => found((await q({ object: "memories", search: N.multi.query })).text, N.multi.ids));
  await check("search.stemmed", "search", async () => found((await q({ object: "memories", search: N.stem.query })).text, N.stem.ids));
  await check("search.typo", "search", async () => found((await q({ object: "memories", search: N.typo.query })).text, N.typo.ids));
  // one call for a question (query object answer): the notes with their ids, the named entity's card, Not found plainly, under the cap
  await check("answer.question", "search", async () => found((await q({ object: "answer", search: `What do we know about the ${N.multi.query}?` })).text, N.multi.ids, ids));
  await check("answer.stemmed_typo", "search", async () => { const a = await q({ object: "answer", search: `Who mentioned invoices?` }), b = await q({ object: "answer", search: `anything on the ${N.typo.query}` }); const x = found(a.text, N.stem.ids, ids), y = found(b.text, N.typo.ids, ids); return { pass: x.pass && y.pass && /searched "heliograph" instead/.test(b.text), text: a.text + "\n" + b.text, note: [x.note, y.note].filter(Boolean).join("; ") }; });
  await check("answer.entity_card", "search", async () => { const r = await q({ object: "answer", search: `What is going on with ${gold.busiest.name}?` }); return { pass: !r.isError && r.text.includes(gold.busiest.id) && ids(r.text).length > 0, text: r.text }; });
  await check("answer.not_found", "search", async () => { const r = await q({ object: "answer", search: "Did anyone talk about zqxjvbnonsenseword?" }); return { pass: !r.isError && /^Not found: /.test(r.text) && ids(r.text).length === 0 && Buffer.byteLength(r.text) < 1024, text: r.text }; });
  // current over superseded: a relationship that changed later brings the note that changed it, never only the old state
  if (gold.hub?.partnership?.history?.length > 1) await check("answer.current_state", "search", async () => { const p = gold.hub.partnership, last = p.history.at(-1).memory, r = await q({ object: "answer", search: `Is ${gold.hub.name} a partner of ours?` }); const got = ids(r.text); return { pass: !r.isError && got.includes(last), text: r.text, note: `latest ${p.history.at(-1).status} note ${last} at rank ${got.indexOf(last) + 1 || "none"}` }; });
  await check("answer.capped", "search", async () => { const r = await q({ object: "answer", search: gold.busiest.name }), s = await q({ object: "memories", search: gold.busiest.name }); const a = Buffer.byteLength(r.text), b = Buffer.byteLength(s.text); return { pass: !r.isError && !s.isError && a <= 13 * KiB && b <= 13 * KiB, text: r.text + "\n" + s.text, note: `answer ${a} B, memories search ${b} B` }; });
  await check("search.recall_tool", "search", async () => { const r = await call("recall", { query: N.single.query }); return { pass: !r.isError && new RegExp(`${N.single.ids.length} memor(y|ies) match`).test(r.text), text: r.text }; });
  await check("search.name", "search", async () => { const r = await q({ object: "memories", search: gold.busiest.name }); return { pass: ids(r.text).length > 0, text: r.text }; });
  if (N.alias) await check("search.alias", "search", async () => { const r = await q({ object: "memories", search: N.alias.query }); const got = ids(r.text); return { pass: N.alias.ids.some(x => got.includes(x)), text: r.text, note: `${N.alias.query} -> ${N.alias.name}` }; });
  await check("search.no_match", "search", async () => { const r = await q({ object: "memories", search: "zqxjvbnonsenseword" }); return { pass: !r.isError && ids(r.text).length === 0, text: r.text }; });
  await check("search.note_ids_on_lines", "search", async () => found((await call("recall", { query: N.single.query })).text, N.single.ids, ids), { known_gap: "recall read lines carry no note id" });
  const sup = gold.corrections.find(c => c.kind === "supersedes"), ret = gold.corrections.find(c => c.kind === "retracts");
  if (sup) await check("search.superseded_hidden", "corrections", async () => { const r = await q({ object: "memories", search: sup.token }); const got = rowIds(r.text); return { pass: got.includes(sup.new) && !got.includes(sup.old), text: r.text }; });
  if (ret) await check("search.retracted_hidden", "corrections", async () => { const r = await q({ object: "memories", search: ret.token }); return { pass: !rowIds(r.text).includes(ret.old), text: r.text }; });
  await check("search.sql_count", "search", async () => { const r = await q({ sql: "SELECT count(*) AS n FROM memories" }); const n = Number((r.text.match(/\n(\d+)\n/) || [])[1]); const eff = Object.values(gold.contexts).reduce((a, c) => a + c.effective, 0); return { pass: n > 0 && n <= eff, text: r.text, note: `sql ${n}, effective ${eff}` }; });
  await check("search.sql_kinds", "entities", async () => { const r = await q({ sql: "SELECT kind, count(*) AS n FROM entities GROUP BY kind" }); const bad = Object.entries(gold.counts.entities).filter(([k, n]) => { const m = r.text.match(new RegExp(`^${k} \\| (\\d+)$`, "m")); return !m || Number(m[1]) < n; }); return { pass: !bad.length, text: r.text, note: bad.map(b => b[0]).join(",") }; });
  await check("search.sql_subtypes", "entities", async () => { const r = await q({ sql: "SELECT subtype, count(*) AS n FROM entities WHERE kind = 'organization' GROUP BY subtype" }); const bad = Object.entries(gold.counts.subtypes).filter(([, n]) => n > 0).filter(([k, n]) => { const m = r.text.match(new RegExp(`^${k} \\| (\\d+)$`, "m")); return !m || Number(m[1]) < n; }); return { pass: !bad.length, text: r.text, note: bad.map(b => b[0]).join(",") }; });

  /* ---------- entities ---------- */
  const whoIs = async name => { const r = await q({ object: "entities", search: name }); return { r, j: jsonOf(r.text) }; };
  const resolvesTo = async (name, id) => { const { r, j } = await whoIs(name); return { pass: j?.status === "resolved" && (j.entity?.id === id || j.id === id || r.text.includes(id)), text: r.text, note: j?.status || "unparsed" }; };
  await check("entities.by_name", "entities", () => resolvesTo(gold.busiest.name, gold.busiest.id));
  await check("entities.by_id", "entities", () => resolvesTo(gold.busiest.id, gold.busiest.id));
  if (N.alias) await check("entities.by_alias", "entities", () => resolvesTo(N.alias.query, N.alias.entity));
  await check("entities.typo", "entities", async () => { const n = gold.busiest.name, typo = n.slice(0, 2) + n[3] + n[2] + n.slice(4); const { r } = await whoIs(typo); return { pass: r.text.includes(gold.busiest.id), text: r.text, note: typo }; });
  const person = gold.entities.find(e => e.kind === "person" && e.emails?.length && e.handle !== by && /@mail\.example$/.test(e.emails[0]));
  if (person) await check("entities.by_email", "entities", () => resolvesTo(person.emails[0], person.id));

  /* ---------- entity pages by kind, filters, meetings (0.35) ---------- */
  const entityIds = s => [...new Set([...String(s).matchAll(/"id":"(e_[0-9a-f]{16})"/g)].map(m => m[1]))];
  if (gold.layout) await check("entities.kind_indexes", "entities", async () => { const miss = gold.layout.indexes.filter(f => !existsSync(join(brain, f))); const flat = readdirSync(join(brain, "brain/entities")).filter(f => f.endsWith(".md")); return { pass: !miss.length && !flat.length, note: [...miss, ...flat.map(f => `flat ${f}`)].join(", ") }; });
  if (gold.filters?.customers?.length) await check("entities.filter_relation", "entities", async () => { const r = await q({ object: "entities", filters: { kind: "organization", relation_to_us: "customer" }, limit: 200 }); const got = entityIds(r.text), want = gold.filters.customers.slice(0, 20), miss = want.filter(x => !got.includes(x)), wrong = gold.filters.not_customers.filter(x => got.includes(x)); return { pass: !r.isError && !miss.length && !wrong.length, text: r.text, note: `${got.length} rows${miss.length ? `, missing ${miss.length}` : ""}${wrong.length ? `, ${wrong.length} not customers` : ""}` }; });
  if (gold.filters?.staffer) await check("entities.filter_person_at_customer", "entities", async () => { const r = await q({ object: "entities", filters: { kind: "person", relation_to_us: "customer" }, limit: 200 }); return { pass: !r.isError && entityIds(r.text).includes(gold.filters.staffer.id), text: r.text, note: gold.filters.staffer.name }; });
  if (gold.meeting_entities) await check("entities.meetings", "entities", async () => { const r = await q({ object: "entities", filters: { kind: "meeting" }, limit: 200 }); const n = entityIds(r.text).length; return { pass: !r.isError && n === Math.min(200, gold.meeting_entities.count), text: r.text, note: `${n} of ${gold.meeting_entities.count}` }; });
  if (gold.meeting_entities?.first) await check("entities.meeting_page", "entities", async () => { const m = gold.meeting_entities.first; const b = await q({ object: "brief", search: m.id }); const rel = await q({ object: "relations", search: m.id }); return { pass: !b.isError && b.text.includes(m.title) && b.text.includes(m.attendee) && ids(b.text).includes(m.outcome) && rel.text.includes(`${m.attendee} attended`), text: b.text + "\n" + rel.text }; });

  const offerings = gold.entities.filter(e => e.kind === "offering");
  if (offerings.length) await check("entities.offering", "entities", async () => { const r = await q({ object: "entities", filters: { kind: "offering" }, limit: 200 }); const got = entityIds(r.text), miss = offerings.map(e => e.id).filter(x => !got.includes(x)); const pages = existsSync(join(brain, "brain/entities/offerings")) ? readdirSync(join(brain, "brain/entities/offerings")).filter(f => /-[0-9a-f]{6}\.md$/.test(f)).length : 0; return { pass: !r.isError && !miss.length && pages >= offerings.length, text: r.text, note: `${got.length} rows, ${pages} pages` }; });
  if (gold.filters?.customers?.length) await check("entities.index_relation", "entities", async () => { const text = readFileSync(join(brain, "brain/entities/organizations/index.md"), "utf8"), c = gold.entities.find(e => e.id === gold.filters.customers[0]); const line = text.split("\n").find(l => l.includes(c.id.slice(2, 8))) || ""; return { pass: line.includes(` · customer · ${c.id.slice(2, 8)} · `), note: line.slice(0, 120) }; });

  /* ---------- briefs ---------- */
  await check("brief.facts", "brief", async () => { const r = await q({ object: "brief", search: gold.busiest.name }); return { pass: !r.isError && r.text.includes(gold.busiest.name), text: r.text }; });
  await check("brief.cited_ids", "brief", async () => { const r = await q({ object: "brief", search: gold.busiest.name }); return { pass: ids(r.text).length > 0, text: r.text, note: `${ids(r.text).length} ids` }; });
  await check("brief.size_bounded", "brief", async () => { const r = await q({ object: "brief", search: gold.busiest.name }); const b = Buffer.byteLength(r.text); return { pass: b <= 32 * KiB, text: r.text, note: `${b} bytes for ${gold.busiest.notes} notes` }; }, { known_gap: "entity briefs grow without bound" });
  await check("brief.entity_facts", "brief", async () => { const r = await call("entity_facts", { entity: gold.busiest.id }); return { pass: !r.isError && ids(r.text).length > 0, text: r.text }; });

  /* ---------- relations ---------- */
  if (gold.hub) {
    await check("relations.entity_scope", "relations", async () => { const r = await q({ object: "relations", search: gold.hub.name }); const lines = r.text.split("\n").filter(l => /^  \S/.test(l)), other = lines.filter(l => !l.includes(gold.hub.name)); return { pass: !r.isError && lines.length > 0 && !other.length, text: r.text, note: `${other.length} of ${lines.length} lines are not about ${gold.hub.name}` }; });
    await check("relations.hub", "relations", async () => { const r = await q({ object: "relations", search: gold.hub.name }); return { pass: !r.isError && r.text.includes(gold.hub.name) && /partner_of/.test(r.text), text: r.text }; });
    await check("relations.ended_partnership", "relations", async () => { const r = await q({ object: "relations", search: gold.hub.name, filters: { type: "partner_of" } }); return { pass: /ended/.test(r.text), text: r.text }; });
    await check("relations.history_dates", "relations", async () => { const r = await q({ object: "relations", search: gold.hub.name, filters: { type: "partner_of" } }); return { pass: hasAll(r.text, gold.hub.partnership.history.map(h => `${h.status} ${h.observed_at.slice(0, 10)}`)), text: r.text }; });
    await check("relations.history_ids", "relations", async () => { const r = await q({ object: "relations", search: gold.hub.name, filters: { type: "partner_of" } }); return found(r.text, gold.hub.partnership.history.map(h => h.memory), ids); }, { known_gap: "relation history lists dates without the note ids" });
  }
  const job = gold.changes.find(c => c.what === "works_at");
  if (job) await check("relations.job_change", "relations", async () => { const r = await q({ object: "relations", search: job.entity, filters: { type: "works_at" } }); const names = [job.from, job.to].map(id => gold.entities.find(e => e.id === id)?.name); return { pass: hasAll(r.text, names) && /ended/.test(r.text) && /current/.test(r.text), text: r.text, note: `${Buffer.byteLength(r.text)} bytes` }; });
  await check("relations.all", "relations", async () => { const r = await q({ object: "relations" }); const sample = gold.relations.slice(0, 20).filter(x => x.from_name); const miss = sample.filter(x => !r.text.includes(x.from_name)); return { pass: !r.isError && !miss.length, text: r.text, note: `${miss.length} of ${sample.length} sampled missing, ${Buffer.byteLength(r.text)} bytes` }; });

  /* ---------- customers ---------- */
  await check("customers.listed", "customers", async () => { const r = await q({ object: "customers" }); const sample = gold.customers.filter(c => c.status === "customer").slice(0, 10); const miss = sample.filter(c => !r.text.includes(c.name)); return { pass: !r.isError && sample.length > 0 && !miss.length, text: r.text, note: `${miss.length} of ${sample.length} missing, ${Buffer.byteLength(r.text)} bytes` }; });
  await check("customers.former", "customers", async () => { const r = await q({ object: "customers" }); const want = gold.customers.filter(c => c.status === "former_customer"); return { pass: !want.length || /former/i.test(r.text), text: r.text, note: `${want.length} former` }; });
  const demo = gold.drafts.find(d => d.why === "demo-tagged customer evidence");
  if (demo) await check("customers.demo_excluded", "customers", async () => { const r = await q({ object: "customers" }); const name = gold.entities.find(e => e.id === demo.entity)?.name; return { pass: !!name && !r.text.includes(name), text: r.text, note: name }; });

  /* ---------- meetings ---------- */
  const happened = gold.meetings.filter(m => m.occurrence === "happened"), planned = gold.meetings.filter(m => m.occurrence === "planned");
  await check("meetings.listed", "meetings", async () => { const r = await q({ object: "meetings" }); const want = happened.slice(-3).map(m => m.title); return { pass: !r.isError && hasAll(r.text, want), text: r.text }; });
  if (planned.length) await check("meetings.planned", "meetings", async () => { const r = await q({ object: "meetings", filters: { state: "planned" } }); return { pass: !r.isError && r.text.includes(planned[0].title), text: r.text }; });
  if (gold.hub) await check("meetings.by_entity", "meetings", async () => { const r = await q({ object: "meetings", filters: { entity: gold.hub.id } }); const want = happened.filter(m => m.company === gold.hub.id).map(m => m.title); return { pass: !r.isError && want.length > 0 && r.text.includes(want[0]), text: r.text }; });

  /* ---------- deal, rules, status, health ---------- */
  if (gold.hub) await check("deal.hub", "deal", async () => { const r = await q({ object: "deal", search: gold.hub.name }); return { pass: !r.isError && ids(r.text).length > 0, text: r.text }; });
  // The core rules (policies/core.md): the brain's AGENTS.md opens with them and the server's instructions carry them.
  const core = readFileSync(join(P, "policies/core.md"), "utf8").trimEnd();
  await check("rules.core_first", "rules", async () => { const t = readFileSync(join(brain, "AGENTS.md"), "utf8"); const first = t.split("\n").find(l => l.startsWith("## ")); return { pass: first === "## Core rules" && t.split(core).length === 2 && t.indexOf(core) < t.indexOf("\n## ", t.indexOf("## Core rules") + 1), text: t.slice(0, 2000) }; });
  await check("rules.core_in_instructions", "rules", async () => { const t = init.result?.instructions || ""; return { pass: t.split(core).length === 2, text: t }; });
  await check("rules.check", "rules", async () => { const r = await q({ object: "rules" }); return { pass: !r.isError && r.text.length > 0, text: r.text }; });
  // The slim rulebook (0.35.0): one line per rule in AGENTS.md, the detail a rule page query returns by topic.
  await check("rules.slim", "rules", async () => { const t = readFileSync(join(brain, "AGENTS.md"), "utf8"); const b = Buffer.byteLength(t); return { pass: b <= 16384 && /\n## Rule pages\n/.test(t), text: t.slice(0, 2000), note: `${b} bytes` }; });
  await check("rules.page", "rules", async () => { const r = await q({ object: "rules", search: "meeting transcript" }); const pages = (r.text.match(/^--- Rule page: /gm) || []).length; return { pass: !r.isError && /^--- Rule page: Meeting evidence/.test(r.text) && pages === 1, text: r.text, note: `${pages} page, ${Buffer.byteLength(r.text)} bytes` }; });
  await check("rules.no_status_first", "rules", async () => { const t = init.result?.instructions || ""; return { pass: !/start every chat with query \(object status\)|gtm-brain-use-brain\/SKILL\.md/.test(t) && /no separate status call/.test(t), text: t }; });
  await check("status.view", "status", async () => { const r = await q({ object: "status" }); return { pass: !r.isError && /icp/i.test(r.text), text: r.text }; });
  await check("status.health", "status", async () => { const r = await q({ object: "health" }); return { pass: !r.isError, text: r.text }; });
  await check("status.population", "status", async () => { const r = await q({ object: "population" }); const n = Number((r.text.match(/(\d+) notes in force/) || [])[1]); const eff = Object.values(gold.contexts).reduce((a, c) => a + c.effective, 0); return { pass: !r.isError && n > 0 && n <= eff && /Capture rate: not measured/.test(r.text) && /Noise rate: not measured/.test(r.text) && /Duplicates: \d+ exact/.test(r.text), text: r.text, note: `${n} in force, effective ${eff}` }; });
  await check("status.list_contexts", "status", async () => { const r = await call("list_contexts", {}); return { pass: !r.isError && Object.keys(gold.contexts).filter(c => c !== "company").slice(0, 3).every(c => r.text.includes(c)), text: r.text }; });

  /* ---------- compile ---------- */
  // --facts is a digest: the notes it lists plus the ones it says it leaves out must add up to the context
  const digest = (text, want) => { const part = (text.split("\n## Effective notes since the last compile")[1] || "").split("\n## ")[0], shown = (part.match(/^- m_[0-9a-f]+/gm) || []).map(l => l.slice(2)), n = re => Number((text.match(re) || [0, 0])[1]), hidden = n(/\n(\d+) more notes? newer than compiled_at/) + n(/\n(\d+) older notes? (?:is|are) not shown/); return { ok: hidden > 0 && shown.every(x => want.includes(x)) && shown.length + hidden === want.length, note: `digest: ${shown.length} shown + ${hidden} counted of ${want.length}` }; };
  await check("compile.facts_full", "compile", async () => { const r = script("scripts/gtm-brain-compile/compile.mjs", ["--facts", "icp"]); const want = gold.contexts.icp.ids, got = ids(r.text), miss = want.filter(x => !got.includes(x)); const d = digest(r.text, want); return { pass: r.code === 0 && (!miss.length || d.ok), text: r.text, note: miss.length ? `${d.note}, ${r.text.length} chars` : `${got.length} ids of ${want.length}, ${r.text.length} chars` }; }, { known_gap: "compile --facts is cut at 64 KiB" });
  await check("compile.facts_mcp", "compile", async () => { const r = await call("compile_facts", { context: "offer" }); const want = gold.contexts.offer.ids, miss = want.filter(x => !ids(r.text).includes(x)); const d = digest(r.text, want); return { pass: !r.isError && (!miss.length || d.ok), text: r.text, note: miss.length ? d.note : `${miss.length} of ${want.length} missing` }; }, { known_gap: "compile --facts is cut at 64 KiB" });
  await check("compile.stale", "compile", async () => { const r = await call("compile_facts", {}); return { pass: !r.isError, text: r.text }; });

  /* ---------- dashboard: the front page's four tabs by pillar, rendered by the real renderer ---------- */
  let dash = null, dashBytes = 0;
  await check("dashboard.render_tabs", "dashboard", async () => {
    const r = script("scripts/gtm-brain-render/render.mjs", [brain]);
    dash = JSON.parse(readFileSync(join(brain, "work", "home", "data.json"), "utf8")); dashBytes = Buffer.byteLength(readFileSync(join(brain, "work", "home", "index.html")));
    const p = dash.pillars || {};
    return { pass: r.code === 0 && !!(p.configuration && p.entities && p.memories && p.workflows), bytes: dashBytes, text: r.text + r.err, note: `page ${Math.round(dashBytes / KiB)} KiB` };
  });
  await check("dashboard.entity_kinds", "dashboard", async () => {
    const kinds = Object.fromEntries((dash?.pillars?.entities?.kinds || []).map(k => [k.kind, k.count]));
    // exactly the gold count per kind (archived and merged entities are not counted), and no kind the generator never wrote;
    // meeting entities are not in counts.entities (they come from the captured meetings), the gold keeps them apart
    const want = { ...gold.counts.entities, ...(gold.meeting_entities ? { meeting: gold.meeting_entities.count } : {}) };
    const bad = [...Object.entries(want).filter(([k, n]) => kinds[k] !== n).map(([k]) => k), ...Object.keys(kinds).filter(k => kinds[k] && !(k in want))].map(k => [k]);
    return { pass: !!dash && !bad.length, text: JSON.stringify(kinds), note: bad.map(b => b[0]).join(",") };
  });
  await check("dashboard.notes_first_page", "dashboard", async () => {
    const m = dash?.pillars?.memories; if (!m) return { pass: false };
    const all = JSON.parse(readFileSync(join(brain, "work", "home", m.file), "utf8")).notes, eff = new Set(Object.values(gold.contexts).flatMap(c => c.ids));
    // in force is exactly the gold's effective notes, less the retraction records (which are not notes of their own and are not listed)
    const inForce = all.filter(n => n.state === "in force"), exact = inForce.every(n => eff.has(n.id)) && [...eff].every(id => inForce.some(n => n.id === id) || !all.some(n => n.id === id));
    // the page carries one page of notes in force, plus the corrected ones between them, never more than three pages
    const live = m.first.filter(n => n.state === "in force").length;
    return { pass: live === Math.min(40, m.in_force) && m.first.length <= 120 && m.first.every((n, i) => n.id === all[i].id) && all.length === m.total && m.in_force > 0 && m.in_force === inForce.length && exact && all.every((n, i) => !i || all[i - 1].at >= n.at), bytes: Buffer.byteLength(JSON.stringify(all)), note: `${m.in_force} in force of ${m.total}` };
  });
  if (sup) await check("dashboard.notes_replaced", "dashboard", async () => {
    const all = dash?.pillars?.memories ? JSON.parse(readFileSync(join(brain, "work", "home", dash.pillars.memories.file), "utf8")).notes : [];
    const nu = all.find(n => n.id === sup.new), old = all.find(n => n.id === sup.old);
    return { pass: nu?.replaces?.id === sup.old && old?.replacedBy?.id === sup.new && old?.state === "replaced" };
  });
  await check("dashboard.workflows_and_files", "dashboard", async () => {
    const p = dash?.pillars; if (!p) return { pass: false };
    return { pass: p.workflows.files.every(f => f.trigger) && p.files.includes("RULES.md") && !p.files.some(f => f.endsWith(".jsonl")) && p.configuration.documents.length >= 5, note: `${p.workflows.files.length} workflow files, ${p.files.length} openable files` };
  });

  /* ---------- writes (on the scratch copy) ---------- */
  await check("remember.without_load", "remember", async () => { const r = await call("remember", { by, context: "offer", content: "E2E probe: pricing page gets a store calculator (e2eprobeone)." }); const s = await q({ object: "memories", search: "e2eprobeone" }); return { pass: !r.isError && rowIds(s.text).length > 0, text: r.text, note: r.text.slice(0, 160) }; }, { known_gap: "remember refuses without a loaded context" });
  await check("load_context.icp", "load", async () => { const r = await call("load_context", { contexts: ["icp"], mode: "only" }); return { pass: !r.isError && ids(r.text).length > 0, text: r.text }; }, { known_gap: "load_context read lines carry no note id" });
  await check("load_context.size", "load", async () => { const r = await call("load_context", { contexts: ["icp", "offer"], mode: "only" }); const b = Buffer.byteLength(r.text); return { pass: !r.isError && b <= 64 * KiB, text: r.text, note: `${b} bytes` }; });
  /* ---------- topic summaries on demand (0.35.0, lane S1) ---------- */
  // a topic behind its notes: load_context gives the digest and as_of, the chat writes it once, the next load is current
  let behind = null;
  await check("summary.load_behind", "summary", async () => { const r = await call("load_context", { contexts: ["offer"], mode: "only" }); const asOf = (r.text.match(/as_of (s_[0-9a-f]+)/) || [])[1]; const f = await call("compile_facts", { context: "offer" }); const want = (f.text.match(/^as_of: (\S+)/m) || [])[1]; const shown = ids((r.text.split("## Effective notes since the last compile")[1] || "").split("\n## ")[0]); behind = { asOf, id: shown[0] }; return { pass: !r.isError && /write it now, in this chat/.test(r.text) && !!asOf && asOf === want && shown.length > 0, text: r.text, note: `${Buffer.byteLength(r.text)} bytes, as_of ${asOf === want ? "matches" : "differs"}` }; });
  await check("summary.write_once", "summary", async () => { if (!behind?.asOf) return { pass: false, text: "no as_of from the load" }; const w = await call("compile_apply", { context: "offer", by, as_of: behind.asOf, summary: `E2E summary written on demand [${behind.id}].`, now: "" }); const again = await call("load_context", { contexts: ["offer"], mode: "only" }); return { pass: !w.isError && /\[summary up to date/.test(again.text) && !/write it now/.test(again.text), text: `${w.text}\n${again.text}` }; });
  await check("summary.no_promise", "summary", async () => { const r = await call("remember", { by, context: "offer", content: "E2E probe: no summary is promised (e2eprobenopromise)." }); const l = await call("list_contexts", {}); return { pass: !r.isError && !/shortly|update by themselves|updating/i.test(r.text + l.text), text: r.text + l.text }; });
  await check("summary.writers_offered", "summary", async () => { const t = (await rpc("tools/list")).result.tools.map(t => t.name); return { pass: ["compile_apply", "compile_facts", "compile_entity"].every(n => t.includes(n)) && !t.includes("entity_facts"), text: t.join(", ") }; });
  let single = null;
  await check("remember.single", "remember", async () => { const r = await call("remember", { by, context: "offer", content: "E2E probe: the starter tier now includes onboarding (e2eprobetwo).", sources: [`user:${by}`] }); const s = await q({ object: "memories", search: "e2eprobetwo" }); single = rowIds(s.text)[0]; return { pass: !r.isError && !!single, text: r.text, note: r.isError ? r.text.slice(0, 160) : "" }; });
  await check("remember.batch_mcp", "remember", async () => { const r = await call("remember", { by, memories: [1, 2, 3].map(i => ({ context: "offer", content: `E2E batch probe ${i} (e2ebatchmcp${i}).`, sources: [`user:${by}`] })) }); const got = [], why = []; for (const i of [1, 2, 3]) { const s = await q({ object: "memories", search: `e2ebatchmcp${i}` }); got.push(rowIds(s.text).length > 0); if (!got.at(-1)) why.push(`#${i} ${s.isError ? "read error" : "no rows"}: ${s.text.slice(0, 120)}`); } return { pass: !r.isError && got.every(Boolean), text: r.text, note: r.isError ? r.text.slice(0, 160) : [got.join(","), ...why].join(" | ") }; });
  await check("remember.batch_script", "remember", async () => { const f = join(scratch, "batch.json"); writeFileSync(f, JSON.stringify([1, 2].map(i => ({ context: "icp", content: `E2E script batch ${i} (e2ebatchscript${i}).`, sources: [`user:${by}`] })))); const r = script("scripts/gtm-brain-remember/remember.mjs", [".", "--by", by, "--batch", f]); const got = []; for (const i of [1, 2]) got.push(rowIds((await q({ object: "memories", search: `e2ebatchscript${i}` })).text).length > 0); return { pass: r.code === 0 && got.every(Boolean), text: r.text + r.err, note: r.code ? r.err.slice(0, 160) : got.join(",") }; });
  /* ---------- big files: a recording never lands in the brain; the note keeps the Drive pointer ---------- */
  await check("big_files.recording_refused", "big_files", async () => { const f = join(scratch, "kickoff-call.m4a"); writeFileSync(f, "audio"); const r = script("skills/gtm-brain-add-file/add-file.mjs", [".", "--file", f, "--entity", gold.busiest.name]); const landed = spawnSync("find", [join(brain, "brain"), "-name", "kickoff-call*"], { encoding: "utf8" }).stdout.trim(); return { pass: r.code === 1 && /recordings stay out of git/.test(r.err) && /big-files\.md/.test(r.err) && !landed, text: r.err, note: landed ? `landed: ${landed}` : "" }; });
  await check("big_files.drive_pointer_note", "big_files", async () => {
    const link = "https://drive.google.com/file/d/1E2eBigFileProbeXyZ/view";
    const p = script("skills/gtm-brain-add-file/add-file.mjs", [".", "--drive", link, "--account", "Owner@Example.com"]); let pointer = null; try { pointer = JSON.parse(p.text).pointer; } catch {}
    if (!pointer) return { pass: false, text: p.text + p.err, note: "no pointer" };
    const r = await call("remember", { by, context: "offer", content: "E2E probe: recording of the pricing kickoff call (e2ebigdrive).", sources: [pointer] });
    const s = await q({ object: "memories", search: "e2ebigdrive" });
    return { pass: !r.isError && rowIds(s.text).length === 1 && pointer.kind === "google-drive" && pointer.ref === "1E2eBigFileProbeXyZ" && pointer.account === "owner@example.com" && s.text.includes("1E2eBigFileProbeXyZ"), text: r.text + "\n" + s.text, note: JSON.stringify(pointer) };
  });
  await check("corrections.supersede", "corrections", async () => { if (!single) return { pass: false, note: "no note from remember.single" }; const r = await call("remember", { by, context: "offer", supersedes: single, content: "E2E probe: the starter tier includes onboarding only on annual plans (e2eprobetwo).", sources: [`user:${by}`] }); const s = await q({ object: "memories", search: "e2eprobetwo" }), got = rowIds(s.text); return { pass: !r.isError && got.length === 1 && got[0] !== single, text: r.text, note: got.join(",") || `read after the write: ${s.isError ? "error" : "no rows"}: ${s.text.slice(0, 140)}` }; });
  await check("corrections.retract", "corrections", async () => { const w = await call("remember", { by, context: "offer", content: "E2E probe: wrong note (e2eprobethree).", sources: [`user:${by}`] }); const id = rowIds((await q({ object: "memories", search: "e2eprobethree" })).text)[0]; if (!id) return { pass: false, text: w.text, note: "probe not written" }; const r = await call("remember", { by, context: "offer", retracts: id, content: "Withdrawn: the e2eprobethree note was wrong.", sources: [`user:${by}`] }); const after = rowIds((await q({ object: "memories", search: "e2eprobethree" })).text); return { pass: !r.isError && !after.includes(id), text: r.text }; });
  // save, then ask (0.35.0): a bare first name nobody has is saved as written and asked; the answer links it back
  let asked = null;
  await check("remember.save_then_ask", "remember", async () => { const r = await call("remember", { by, context: "offer", content: "E2E probe: Ottilie from finance approved the volume discount (e2eprobeask).", people: ["Ottilie"], sources: [`user:${by}`] }); const got = rowIds((await q({ object: "memories", search: "e2eprobeask" })).text); asked = { note: (r.text.match(/attaches it to (m_[0-9a-f]{12})/) || [])[1], question: (r.text.match(/kept as (m_[0-9a-f]{12})/) || [])[1] }; return { pass: !r.isError && /^Who is Ottilie\? Full name or company\.$/m.test(r.text) && !!asked.note && !!asked.question && got.includes(asked.note), text: r.text, note: got.join(",") }; });
  await check("remember.answer_links_back", "remember", async () => { if (!asked?.question) return { pass: false, note: "no question from remember.save_then_ask" }; const r = await call("remember", { by, context: "offer", kind: "decision", retracts: asked.question, content: "Ottilie is Ottilie Brandvik, our finance lead.", people: ["Ottilie Brandvik"], sources: [`user:${by}`] }); const got = rowIds((await q({ object: "memories", search: "e2eprobeask" })).text); return { pass: !r.isError && /linked "Ottilie"/.test(r.text) && got.length === 1 && got[0] !== asked.note && !got.includes(asked.question), text: r.text, note: got.join(",") }; });

  // saving that does not misfire (0.35.0 round three): a restated fact writes nothing, a call with no outcome is refused, outcomes of one call share one meeting
  await check("remember.restated_kept", "remember", async () => { const a = await call("remember", { by, context: "offer", content: "E2E probe: coupon E2ECODE77 gives 30% off all workshops (e2eprobekept).", sources: [`user:${by}`] }); const r = await call("remember", { context: "icp", content: "E2E probe: E2ECODE77 takes 30% off every workshop (e2eprobekept).", sources: [`user:${by}`] }); const got = rowIds((await q({ object: "memories", search: "e2eprobekept" })).text); return { pass: !a.isError && !r.isError && /already kept in /.test(r.text) && got.length === 1, text: r.text, note: got.join(",") }; });
  await check("remember.no_outcome_refused", "remember", async () => { const lib0 = await import(`${P}/lib/brain.mjs`); const meeting = ref => ({ title: "E2E call with Ottilie Brandvik", reference: { kind: "user", account: by, ref }, evidence: "recollection", occurrence: "happened", basis: "user", observed_at: "2026-11-14T10:00:00Z", occurred_at: "2026-11-14", participants: [{ name: "Ottilie Brandvik", role: "attended" }], capture: "partial" }); const r = await call("remember", { by, memories: [{ context: "offer", content: "Had a call with Ottilie Brandvik today (e2eprobeshell).", people: ["Ottilie Brandvik"], meeting: meeting("e2e-shell-1") }, { context: "offer", content: "Ottilie Brandvik approved the annual discount (e2eprobeshell).", people: ["Ottilie Brandvik"], meeting: meeting("e2e-shell-1") }, { context: "offer", content: "Ottilie Brandvik asked for the contract by 20 November 2026 (e2eprobeshell).", people: ["Ottilie Brandvik"], meeting: meeting("e2e-shell-1") }] }); const rows = lib0.readMemories(brain, "offer").filter(m => m.content.includes("e2eprobeshell")); return { pass: !r.isError && /#1 says only that a conversation happened/.test(r.text) && rows.length === 2 && new Set(rows.map(m => m.meeting_id)).size === 1, text: r.text, note: `${rows.length} notes, ${new Set(rows.map(m => m.meeting_id)).size} meeting` }; });

  await check("index.read_after_write", "remember", async () => ({ pass: busy === 0, text: "", note: `${busy} read${busy === 1 ? "" : "s"} refused with Memory index is busy and retried${busy ? ` (in check number ${[...new Set(busyAt)].map(i => i + 1).join(", ")})` : ""}` }));

  /* ---------- interact: check, act, then record ---------- */
  // A company interaction on the scratch copy, written through lib as approve does; the connector step is simulated.
  const lib = await import(`${P}/lib/brain.mjs`);
  lib.writeInteractions(brain, [...lib.readInteractions(brain).actions,
    { name: "e2e_move_deal", title: "Moving a deal", tool: "attio", operation: "Move the deal to the stage in Attio.", description: "A deal changes stage.", input_schema: { type: "object", properties: { deal: { type: "string" }, stage: { type: "string" } }, required: ["deal", "stage"], additionalProperties: false }, record: { context: "offer", kind: "note", people: [], companies: [], content: "Moved {deal} to {stage}.", action: "attio:move deal:{deal}", tags: ["deal-stage"] }, refuse_when: "the deal is already closed" },
    { name: "e2e_log", title: "Logging a result", external: false, description: "A result, recorded at once.", input_schema: { type: "object", properties: { what: { type: "string" } }, required: ["what"], additionalProperties: false }, record: { context: "offer", kind: "note", people: [], companies: [], content: "Result: {what}", tags: [] } }]);
  const written = token => lib.readMemories(brain, "offer").filter(m => m.content.includes(token));
  await check("interact.refused_writes_nothing", "interact", async () => { const r = await call("interact", { by, name: "e2e_move_deal", params: { deal: "e2einteractrefused" } }); return { pass: r.isError && /refused/.test(r.text) && !written("e2einteractrefused").length, text: r.text }; });
  await check("interact.first_call_writes_nothing", "interact", async () => { const r = await call("interact", { by, name: "e2e_move_deal", params: { deal: "e2einteractdone", stage: "proposal" } }); return { pass: !r.isError && /^checked: e2e_move_deal/.test(r.text) && /refuse when the deal is already closed/.test(r.text) && !written("e2einteractdone").length, text: r.text }; });
  await check("interact.done_records_with_pointer", "interact", async () => { const r = await call("interact", { by, name: "e2e_move_deal", params: { deal: "e2einteractdone", stage: "proposal" }, outcome: "done", refs: [{ kind: "attio", account: "acme-ws", ref: "deals/d-1" }] }); const got = written("e2einteractdone"); const s = await q({ object: "memories", search: "e2einteractdone" }); return { pass: !r.isError && got.length === 1 && got[0].source.some(x => x.kind === "attio" && x.account === "acme-ws" && x.ref === "deals/d-1") && rowIds(s.text).length === 1, text: r.text, note: JSON.stringify(got[0]?.source || []) }; });
  await check("interact.failed_records_failure", "interact", async () => { const r = await call("interact", { by, name: "e2e_move_deal", params: { deal: "e2einteractfailed", stage: "won" }, outcome: "failed", error: "403 forbidden" }); const got = written("e2einteractfailed"); return { pass: !r.isError && got.length === 1 && /^Failed in attio, not done/.test(got[0].content) && /403 forbidden/.test(got[0].content) && !(got[0].actions || []).length, text: r.text }; });
  await check("interact.pure_record_at_once", "interact", async () => { const r = await call("interact", { by, name: "e2e_log", params: { what: "e2einteractlog" } }); return { pass: !r.isError && /^ok: e2e_log/.test(r.text) && written("e2einteractlog").length === 1, text: r.text }; });

  /* ---------- the two demo loops, tool path only (the live run is test/live/demo-loops.mjs) ---------- */
  await check("loops.document_voice", "loops", async () => { const r = await call("document", { action: "show", ref: "voice" }); return { pass: !r.isError && /Tone of voice/.test(r.text), text: r.text }; });
  await check("loops.workflow_outbound", "loops", async () => { const r = await call("workflow", { action: "list" }); return { pass: !r.isError && /outbound/i.test(r.text), text: r.text }; });
  // workflows 0.35.0: the people's view, the check with its dry run on this brain (writes nothing), a skill's needs
  await check("loops.workflow_view", "loops", async () => { const r = await q({ object: "workflows" }); return { pass: !r.isError && /- outbound \[draft\], trigger: manual/.test(r.text) && /limits: 3 active runs per workflow/.test(r.text), text: r.text }; });
  await check("loops.workflow_check_dry_run", "loops", async () => { const count = () => lib.listContexts(brain).reduce((n, c) => n + c.memories.length, 0), before = count(); const r = await call("workflow", { action: "check", slug: "outbound" }); return { pass: !r.isError && /^check outbound: passes/.test(r.text) && /dry run \(nothing written\)/.test(r.text) && count() === before, text: r.text }; });
  await check("loops.skill_needs", "loops", async () => { const r = await call("workflow", { action: "needs", slug: "gtm-brain-define-icp" }); return { pass: !r.isError && /^skill gtm-brain-define-icp(: everything it needs is in SCHEMA\.md and admin\.md\.| needs \d+ things? this brain does not have yet:)/.test(r.text), text: r.text }; });   // the proposal itself, not the name echoed in a refusal or "declares no needs"
  await check("loops.sent_recorded", "loops", async () => { const w = await call("remember", { by, context: "icp", content: "E2E loop: sent the first outreach email (e2eloopsent).", actions: ["gmail:send:e2e-draft-1"], sources: [`user:${by}`] }); const s = await q({ object: "memories", search: "e2eloopsent" }); return { pass: !w.isError && rowIds(s.text).length > 0 && /gmail/.test(s.text) && /send/.test(s.text), text: w.isError ? w.text : s.text }; });
  // the step "update the customer status": a prospect the person confirms as a customer, the overview follows
  const prospect = gold.customers.find(c => c.status === "prospect");
  if (prospect) await check("loops.customer_status", "loops", async () => { const w = await call("remember", { by, context: "icp", content: `E2E loop: ${prospect.name} signed the pilot and is now a customer (e2eloopstatus).`, people: [prospect.name], companies: [prospect.name], sources: [`user:${by}`], customer: { entity: prospect.name, status: "customer", basis: "user", observed_at: "2026-11-14T09:00:00Z" } }); const r = await q({ object: "customers" }); const row = jsonOf(r.text)?.customers?.find(c => c.name === prospect.name) || null; return { pass: !w.isError && row?.status === "customer" && row?.basis === "user", text: w.isError ? w.text : r.text, note: `${prospect.name}: ${row?.status || "absent"}` }; });

  /* ---------- typed rules: RULES.md Our rules with tag lines (lib/our-rules.mjs), on the scratch copy ---------- */
  appendFileSync(join(brain, "RULES.md"), "\nNever call a company a customer before a signed contract.\n> applies to: organization · when: saving customer status · check\n\nMention the partner tier when writing to a partner.\n> applies to: link partner_of · when: drafting · guidance\n\nAsk before saving anything about pricing.\n\nAlways thank a speaker after the event.\n");
  await check("rules.typed_unfiled", "rules", async () => { const r = await q({ object: "rules" }); return { pass: !r.isError && /"Ask before saving anything about pricing\." is not filed yet[\s\S]*File it: write > applies to: general · when: saving · guidance/.test(r.text), text: r.text }; });
  await check("rules.typed_work_offer", "rules", async () => { const r = await q({ object: "rules" }); return { pass: !r.isError && /"Always thank a speaker after the event" starts work, and a rule never starts work[\s\S]*Make it a workflow: workflow create \(title "Thank a speaker"/.test(r.text), text: r.text }; });
  await check("rules.typed_scoped", "rules", async () => { const r = await q({ object: "rules", search: "organization" }); return { pass: !r.isError && /^Our rules for organization/.test(r.text) && r.text.includes("signed contract") && !r.text.includes("partner tier"), text: r.text }; });
  if (gold.hub) await check("rules.typed_link_current_only", "rules", async () => { const r = await q({ object: "rules", search: gold.hub.name, filters: { when: "drafting" } }); const current = gold.hub.partnership.history.at(-1)?.status === "current"; return { pass: !r.isError && r.text.includes("partner tier") === current, text: r.text, note: `partnership ${current ? "current" : "ended"}` }; });
  await check("rules.typed_refused", "rules", async () => { const w = await call("remember", { by, context: "icp", content: "E2E Rules Co is now a customer (e2erulesrefused).", companies: ["E2E Rules Co"], sources: [`user:${by}`] }); const s = await q({ object: "memories", search: "e2erulesrefused" }); return { pass: w.isError && /refused by Our rules "Never call a company a customer before a signed contract\."/.test(w.text) && !rowIds(s.text).length, text: w.text }; });
  if (gold.hub) await check("rules.typed_once", "rules", async () => { const a = await call("remember", { by, context: "icp", content: `E2E rules probe: ${gold.hub.name} moved its office (e2erulesonce1).`, companies: [gold.hub.name], sources: [`user:${by}`] }), b = await call("remember", { by, context: "icp", content: `E2E rules probe: ${gold.hub.name} hired (e2erulesonce2).`, companies: [gold.hub.name], sources: [`user:${by}`] }); const shown = t => /Our rules for organization[^\n]*when saving[^\n]*\n- Never call a company a customer/.test(t.text); return { pass: !a.isError && !b.isError && shown(a) && !shown(b), text: `${a.text}\n---\n${b.text}`, bytes: Buffer.byteLength(a.text) }; });

  /* ---------- the nightly chat capture: a chat in the brain's folder, a stand-in model run, remember, undo ---------- */
  {
    const real = realpathSync(brain), d = new Date(), id = "0e2e0000-0000-4000-8000-00000000ca97";
    const day = join(profile, "sessions", String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0"));
    mkdirSync(day, { recursive: true });
    const said = "We agreed the reseller tier launches on 2027-02-01 (e2ecapture).";
    writeFileSync(join(day, `rollout-${d.toISOString().slice(0, 19).replace(/:/g, "-")}-${id}.jsonl`), [{ type: "session_meta", payload: { id, cwd: real, source: "vscode", thread_source: "user" } },
      { timestamp: d.toISOString(), type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: said }] } },
      { timestamp: d.toISOString(), type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Understood." }] } }].map(l => JSON.stringify(l)).join("\n") + "\n");
    const stand = join(scratch, "capture-model.mjs");
    writeFileSync(stand, `import { readFileSync } from "node:fs"; const p = readFileSync(0, "utf8"); process.stdout.write(JSON.stringify({ notes: p.includes(${JSON.stringify(id)}) ? [{ chat: ${JSON.stringify(id)}, context: "offer", kind: "decision", content: "The reseller tier launches on 2027-02-01 (e2ecapture).", quote: ${JSON.stringify(said)} }] : [] }));`);
    const pass = () => { const r = spawnSync(process.execPath, [join(P, "scripts/gtm-brain-schedule/capture.mjs"), brain, "--run", "--by", by], { cwd: brain, env: { ...env, GTM_BRAIN_CAPTURE_MODEL: stand }, encoding: "utf8" }); return { text: `${r.stdout}${r.stderr}`, code: r.status }; };
    await check("capture.pass_saves_through_remember", "capture", async () => { const r = pass(); const s = await q({ object: "memories", search: "e2ecapture" }); const m = lib.readMemories(brain, "offer").find(x => x.content.includes("e2ecapture"));
      return { pass: r.code === 0 && rowIds(s.text).length === 1 && !!m && m.tags.includes("captured") && m.source.some(x => x.kind === "codex" && x.ref === id), text: r.text, note: r.text.trim().slice(0, 160) }; });
    await check("capture.second_pass_reads_nothing", "capture", async () => { const r = pass(); return { pass: r.code === 0 && /read 0 chats/.test(r.text), text: r.text, note: r.text.trim().slice(0, 120) }; });
    await check("capture.status_heartbeat", "capture", async () => { const r = await call("capture_chats", { mode: "status" }); return { pass: !r.isError && /chat capture: last pass .* UTC, 0 notes saved, 0 tokens/.test(r.text) && /cap 200,000 tokens per pass/.test(r.text), text: r.text }; });
    await check("capture.undo", "capture", async () => { const cap = await import(`${P}/lib/capture.mjs`); const line = cap.captureNotice(brain); const r = await call("capture_chats", { mode: "undo" }); const s = await q({ object: "memories", search: "e2ecapture" });
      return { pass: /1 note captured from your recent chats/.test(line) && !r.isError && /withdrew 1 captured note/.test(r.text) && rowIds(s.text).length === 0, text: `${line}\n${r.text}\n${s.text}`, note: r.text.trim().slice(0, 120) }; });
  }

  /* ---------- messy traps ---------- */
  const T = gold.traps || {};
  if (T.maxes) {
    await check("traps.two_maxes", "traps", async () => { const { r, j } = await whoIs("Max"); return { pass: j?.status !== "resolved" && hasAll(r.text, T.maxes.map(m => m.id)), text: r.text, note: j?.status }; });
    await check("traps.private_email", "traps", () => resolvesTo(T.private_email.email, T.private_email.entity));
    await check("traps.typo_max", "traps", async () => { const { r } = await whoIs(T.typo_mention); return { pass: r.text.includes(T.maxes[0].id), text: r.text }; });
    await check("traps.lookalike", "traps", () => resolvesTo(T.lookalike[0].name, T.lookalike[0].id));
    await check("traps.renamed_new", "traps", () => resolvesTo(T.renamed.after, T.renamed.id));
    await check("traps.renamed_old", "traps", () => resolvesTo(T.renamed.before, T.renamed.id));
    await check("traps.merged_alias", "traps", () => resolvesTo(T.merged.alias, T.merged.survivor));
    await check("traps.merged_retired_id", "traps", () => resolvesTo(T.merged.retired, T.merged.survivor));
    await check("traps.contradicting_size", "traps", async () => { const name = gold.entities.find(e => e.id === T.size.company)?.name; const r = await q({ object: "brief", search: name }); return { pass: hasAll(r.text, T.size.values.map(String)), text: r.text }; });
    if (T.contradiction) await check("traps.contradicting_job", "traps", async () => { const r = await q({ object: "relations", search: T.contradiction.person, filters: { type: "works_at" } }); return { pass: /conflict|disagree|linkedin/i.test(r.text), text: r.text }; });
  }

  /* ---------- upgrade and the layout guard (brain/layout.json), last: the guard check makes the scratch brain read-only ---------- */
  await check("upgrade.layout_recorded", "upgrade", async () => { const t = readFileSync(join(brain, "brain/layout.json"), "utf8"); return { pass: JSON.parse(t).layout === 1, text: t }; });
  await check("upgrade.repeat_changes_nothing", "upgrade", async () => { await call("upgrade_brain", {}); const r = await call("upgrade_brain", {}); return { pass: !r.isError && /already current/.test(r.text), text: r.text }; });
  await check("upgrade.newer_layout_read_only", "upgrade", async () => {
    const file = join(brain, "brain/layout.json"), notes = join(brain, "brain/contexts/offer/memories.jsonl"), before = readFileSync(notes, "utf8");
    writeFileSync(file, JSON.stringify({ layout: 2 }) + "\n");
    const w = await call("remember", { by, context: "offer", content: "E2E probe: must not land (e2elayoutprobe)." });
    const r = await q({ object: "memories", search: N.single.query });
    const pass = w.isError && /update GTM Brain/.test(w.text) && readFileSync(notes, "utf8") === before && !r.isError && /^GTM Brain: this brain was upgraded to file layout 2/.test(r.text) && rowIds(r.text).length > 0;
    return { pass, text: `${w.text}\n---\n${r.text}`, note: pass ? "write refused, read answered with the line on top" : "" };
  });

  // wait for the server to exit before removing its brain: a child it started (the index worker, a
  // background render) may still be writing into work/, and rmSync then fails with ENOTEMPTY and the
  // results of the whole run are lost. Cleanup is best effort: a leftover scratch folder is no failure.
  await new Promise(done => { server.once("exit", done); server.kill(); setTimeout(done, 5000).unref(); });
  if (!keep) for (const dir of [scratch, profile]) { try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {} }
  const summary = { shape: gold.shape, notes: gold.counts?.notes, total: results.length, pass: results.filter(r => r.pass).length, fail: results.filter(r => !r.pass && !r.known_gap).length, known_gap: results.filter(r => !r.pass && r.known_gap).length, ms: results.reduce((a, r) => a + r.ms, 0) };
  return { summary, results, ...(keep ? { scratch } : {}) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = { _: [] };
  for (let i = 0; i < a.length; i++) { if (a[i] === "--json" || a[i] === "--keep") opt[a[i].slice(2)] = true; else if (a[i].startsWith("--")) opt[a[i].slice(2)] = a[++i]; else opt._.push(a[i]); }
  const brain = opt._[0]; if (!brain || !opt.gold) { console.error("usage: e2e.mjs <brain> --gold <gold.json> [--json] [--keep]"); process.exit(2); }
  const out = await runChecks({ brain, gold: opt.gold, keep: !!opt.keep });
  if (opt.json) console.log(JSON.stringify(out, null, 1));
  else {
    for (const r of out.results) console.log(`${r.pass ? "pass" : r.known_gap ? "gap " : "FAIL"}  ${r.id.padEnd(30)} ${String(r.ms).padStart(6)} ms ${String(r.bytes).padStart(9)} B${r.note ? `  ${r.note}` : ""}${r.text ? `\n${r.text}\n` : ""}`);
    const s = out.summary; console.log(`\n${s.shape}: ${s.pass}/${s.total} pass, ${s.fail} fail, ${s.known_gap} known gap, ${s.ms} ms`);
  }
  process.exit(out.summary.fail ? 1 : 0);
}
