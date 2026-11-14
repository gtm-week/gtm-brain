#!/usr/bin/env node
// Deterministic end-to-end checks on a generated brain, scored against its gold ledger.
//   node test/e2e/e2e.mjs <brain> --gold <gold.json> [--json] [--keep]
// The brain is copied to a scratch folder first (the write checks append notes), then the real
// MCP server is driven over stdio, as server.test.mjs does, and a few scripts are run directly
// (compile --facts through a pipe, remember --batch). No model, no connectors, no network.
// Each check: id, section, pass or fail, ms, bytes. A check that fails because of a gap main is
// known to have is marked known_gap, so a fix shows up as a check that turns to pass.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const P = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const KiB = 1024;
// note ids anywhere in a text (Markdown escapes the underscore), and the ids of the rows query returns
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
  await check("search.stemmed", "search", async () => found((await q({ object: "memories", search: N.stem.query })).text, N.stem.ids), { known_gap: "unstemmed search: invoice does not find invoicing or invoiced" });
  await check("search.typo", "search", async () => found((await q({ object: "memories", search: N.typo.query })).text, N.typo.ids), { known_gap: "memory search has no typo tolerance" });
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
  const whoIs = async name => { const r = await q({ object: "entities", search: name }); let j = null; try { j = JSON.parse(r.text); } catch {} return { r, j }; };
  const resolvesTo = async (name, id) => { const { r, j } = await whoIs(name); return { pass: j?.status === "resolved" && (j.entity?.id === id || j.id === id || r.text.includes(id)), text: r.text, note: j?.status || "unparsed" }; };
  await check("entities.by_name", "entities", () => resolvesTo(gold.busiest.name, gold.busiest.id));
  await check("entities.by_id", "entities", () => resolvesTo(gold.busiest.id, gold.busiest.id));
  if (N.alias) await check("entities.by_alias", "entities", () => resolvesTo(N.alias.query, N.alias.entity));
  await check("entities.typo", "entities", async () => { const n = gold.busiest.name, typo = n.slice(0, 2) + n[3] + n[2] + n.slice(4); const { r } = await whoIs(typo); return { pass: r.text.includes(gold.busiest.id), text: r.text, note: typo }; });
  const person = gold.entities.find(e => e.kind === "person" && e.emails?.length && e.handle !== by && /@mail\.example$/.test(e.emails[0]));
  if (person) await check("entities.by_email", "entities", () => resolvesTo(person.emails[0], person.id));

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

  /* ---------- writes (on the scratch copy) ---------- */
  await check("remember.without_load", "remember", async () => { const r = await call("remember", { by, context: "offer", content: "E2E probe: pricing page gets a store calculator (e2eprobeone)." }); const s = await q({ object: "memories", search: "e2eprobeone" }); return { pass: !r.isError && rowIds(s.text).length > 0, text: r.text, note: r.text.slice(0, 160) }; }, { known_gap: "remember refuses without a loaded context" });
  await check("load_context.icp", "load", async () => { const r = await call("load_context", { contexts: ["icp"], mode: "only" }); return { pass: !r.isError && ids(r.text).length > 0, text: r.text }; }, { known_gap: "load_context read lines carry no note id" });
  await check("load_context.size", "load", async () => { const r = await call("load_context", { contexts: ["icp", "offer"], mode: "only" }); const b = Buffer.byteLength(r.text); return { pass: !r.isError && b <= 64 * KiB, text: r.text, note: `${b} bytes` }; });
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
  await check("loops.sent_recorded", "loops", async () => { const w = await call("remember", { by, context: "icp", content: "E2E loop: sent the first outreach email (e2eloopsent).", actions: ["gmail:send:e2e-draft-1"], sources: [`user:${by}`] }); const s = await q({ object: "memories", search: "e2eloopsent" }); return { pass: !w.isError && rowIds(s.text).length > 0 && /gmail/.test(s.text) && /send/.test(s.text), text: w.isError ? w.text : s.text }; });
  // the step "update the customer status": a prospect the person confirms as a customer, the overview follows
  const prospect = gold.customers.find(c => c.status === "prospect");
  if (prospect) await check("loops.customer_status", "loops", async () => { const w = await call("remember", { by, context: "icp", content: `E2E loop: ${prospect.name} signed the pilot and is now a customer (e2eloopstatus).`, people: [prospect.name], companies: [prospect.name], sources: [`user:${by}`], customer: { entity: prospect.name, status: "customer", basis: "user", observed_at: "2026-11-14T09:00:00Z" } }); const r = await q({ object: "customers" }); let row = null; try { row = JSON.parse(r.text).customers.find(c => c.name === prospect.name); } catch {} return { pass: !w.isError && row?.status === "customer" && row?.basis === "user", text: w.isError ? w.text : r.text, note: `${prospect.name}: ${row?.status || "absent"}` }; });

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
