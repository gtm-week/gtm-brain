// This file plays the plugin from before layout 4 (GTM_BRAIN_TEST_LAYOUT=3: about-us/, config/, brain/ and work/). Layout 4
// (configuration/, entities/, memories/) is covered by layout-four.test.mjs and the files that run on both layouts.
process.env.GTM_BRAIN_TEST_LAYOUT = "3";
// The population of a brain (lib/population.mjs, query population) and the per-source sync checkpoints
// (lib/health-line.mjs): every number on a small fixture brain with a fixed clock, the health-line part
// only when a number is out of range, the old global checkpoint and the new per-source one, and the time
// on 50,000 notes.
// Run: node --test plugins/gtm-brain/test/population.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-pop-home-"));
process.env.GTM_BRAIN_NO_COMPILE = "1"; process.env.GTM_BRAIN_NO_COMMIT = "1"; process.env.GTM_BRAIN_NO_WATCH = "1"; process.env.GTM_BRAIN_NO_OPEN = "1";
const NOW = "2026-11-14T12:00:00Z", now = Date.parse(NOW), DAY = 864e5;
process.env.GTM_BRAIN_NOW = NOW;
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1" };
delete env.GTM_BRAIN_RUN;
const lib = await import(`${P}/lib/brain.mjs`);
const pop = await import(`${P}/lib/population.mjs`);
const health = await import(`${P}/lib/health-line.mjs`);
const { housekeepingText } = await import(`${P}/lib/housekeeping.mjs`);

function brain(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-pop-")));
  t.after(() => { try { rmSync(root, { recursive: true, force: true }); } catch {} });
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Demo Co", "--one-liner", "events", "--owner", "Marta Nowak <marta@demo.co>"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const ago = d => new Date(now - d * DAY).toISOString();
let n = 0;
const id = () => "m_" + createHash("sha1").update(String(n++)).digest("hex").slice(0, 12);
const rec = (context, at, content, extra = {}) => ({ id: id(), context, at, authors: ["marta-nowak"], via: "codex", kind: "note", tools: [], people: [], content, source: [], actions: [], supersedes: null, retracts: null, tags: [], ...extra });
const write = (root, slug, rows) => appendFileSync(join(root, "brain/contexts", slug, "memories.jsonl"), rows.map(r => JSON.stringify(r)).join("\n") + "\n");
const setFields = (root, name, fields) => {
  const e = lib.readNames(root).find(x => x.name === name), path = join(root, e._path);
  const { fm, body } = lib.parseFrontmatter(readFileSync(path, "utf8"));
  writeFileSync(path, lib.renderFrontmatter({ ...fm, compiled_fields: JSON.stringify(fields) }) + body);
};

/* The fixture: two contexts, alpha summarised 5 days ago and beta never; three entities. */
function fixture(t) {
  const root = brain(t);
  const before = pop.computePopulation(root, { now });
  lib.writeContext(root, "alpha", { title: "Alpha", compiled_at: ago(5), summary: "placeholder", rule: "Alpha work." });
  lib.writeContext(root, "beta", { title: "Beta", rule: "Beta work." });
  lib.writeNames(root, [...lib.readNames(root), { name: "Acme Corp", kind: "organization", subtype: "company" }, { name: "Jan Kowalski", kind: "person" }, { name: "Zed Ltd", kind: "organization", subtype: "company" }]);
  const old = [];   // 20 notes 10..29 days ago, each from its own email thread; the first two name Acme Corp and Jan Kowalski
  for (let i = 0; i < 20; i++) old.push(rec("alpha", ago(10 + i), `${i === 0 ? "Acme Corp" : i === 1 ? "Jan Kowalski" : "Someone"} raised point number ${i} about pricing.`, { source: [{ kind: "gmail", ref: `t${i}` }] }));
  const exact = rec("alpha", ago(8), "SOMEONE raised point number 3, about pricing!", { source: [{ kind: "gmail", ref: "t-other" }] });
  const near = rec("alpha", new Date(Date.parse(old[5].at) + 3600e3).toISOString(), "A different thing from the same thread.", { source: [{ kind: "Gmail", ref: "t5" }] });
  const chat1 = rec("alpha", ago(2), "First thing said in a chat.", { source: [{ kind: "codex", ref: "thread-1" }] });
  const chat2 = rec("alpha", ago(2), "Second thing said in the same chat.", { source: [{ kind: "codex", ref: "thread-1" }] });
  const bare1 = rec("alpha", ago(1), "A note with no source at all.");
  const wrong = rec("alpha", ago(3), "A note later retracted.", { source: [{ kind: "attio", ref: "people/1" }] });
  const retract = rec("alpha", ago(1), "Retracting the wrong note.", { retracts: wrong.id, source: [{ kind: "user", ref: "marta-nowak" }] });
  const first = rec("alpha", ago(4), "Version one of a fact.", { source: [{ kind: "hubspot", ref: "deal/1" }] });
  const second = rec("alpha", ago(1), "Version two of a fact.", { supersedes: first.id, source: [{ kind: "hubspot", ref: "deal/2" }] });
  write(root, "alpha", [...old, exact, near, chat1, chat2, bare1, wrong, retract, first, second]);
  write(root, "beta", [rec("beta", ago(0.5), "A beta note without a source.")]);
  // alpha's summary cites three of its notes, Jan's brief one more
  lib.writeContext(root, "alpha", { title: "Alpha", compiled_at: ago(5), summary: `Pricing came up [${old[0].id}, ${old[1].id}].`, rule: "Alpha work.", now: `Watch pricing [${old[2].id}].` });
  setFields(root, "Jan Kowalski", [{ field: "role", text: "Buyer", memories: [old[3].id] }]);
  return { root, before, old, exact, near, bare1, second };
}

test("every number on a fixture brain with a fixed clock", t => {
  const { root, before, old } = fixture(t);
  const p = pop.computePopulation(root, { now });
  const base = before.notes;   // whatever setup itself saved
  // in force: 20 old + exact + near + 2 chat + bare + second + beta = 27; wrong and first are hidden, the retraction is no note
  assert.equal(p.notes, base + 27);
  // saved this week: chat1, chat2, bare1, wrong, first, second, beta = 7 (the retraction is not a save); the four weeks before: 20 old + exact + near = 22
  assert.deepEqual(p.saved, { last_7_days: before.saved.last_7_days + 7, average_4_weeks_before: 5.5, history_days: 29 });
  assert.equal(p.duplicates.exact, 1, "same normalized content");
  assert.equal(p.duplicates.near, 1, "same record, same day; two notes of one chat are not duplicates");
  assert.deepEqual(p.duplicates.examples.map(x => x.why), ["same source, same day", "same content"], "oldest first");
  assert.equal(p.entities.total, 3, "our company and the team are not counted");
  assert.equal(p.entities.without_notes, 1); assert.deepEqual(p.entities.without_notes_examples, ["Zed Ltd"]);
  assert.equal(p.entities.missing_required, 2, "Acme Corp and Zed Ltd lack website and industry; Jan has his role");
  assert.deepEqual(p.entities.missing_required_fields, { website: 2, industry: 2 });
  // alpha's notes recorded before its summary (5 days ago): 20 old + exact + near = 22, of which 4 are cited; waiting: chat1, chat2, bare1, second and the beta note
  assert.deepEqual(p.citations, { uncited: 18, waiting_for_summary: before.citations.waiting_for_summary + 5, judged: before.citations.judged + 22, uncited_share: Math.round(18 / (before.citations.judged + 22) * 1000) / 1000 });
  assert.equal(p.sources.without, before.sources.without + 2, "bare1 and the beta note");
  assert.equal(p.capture_rate, "not measured"); assert.equal(p.noise_rate, "not measured");
  assert.ok(old.length === 20);

  const out = pop.outOfRange(p);
  // notes no summary cites are counted but no longer reported: summaries are on demand since 0.35.0
  assert.ok(!out.some(o => /cited nowhere/.test(o)), out.join("; ")); assert.ok(p.citations.uncited > 0);
  // near duplicates (the same source record on the same day) do not flag a brain; exact copies do
  assert.ok(!out.some(o => /duplicates/.test(o)), out.join("; "));
  assert.ok(!out.some(o => /too empty|too full/.test(o)), "7 against 5.5 is in range");
  const text = pop.populationText(p);
  assert.match(text, /Capture rate: not measured/); assert.match(text, /Noise rate: not measured/);
  assert.match(text, /Duplicates: 1 exact \(same content\), 1 near/);
  assert.doesNotMatch(text, /[\u2013\u2014]/);
});

test("the ranges: too empty, too full, and nothing judged on a tiny brain", () => {
  const p = { notes: 100, saved: { last_7_days: 1, average_4_weeks_before: 10, history_days: 90 }, duplicates: { exact: 0, near: 0, share: 0 }, sources: { without_share: 0 }, citations: { judged: 0, uncited_share: 0 }, entities: { total: 0 } };
  assert.match(pop.outOfRange(p).join(), /too empty: 1 note saved in the last 7 days against 10 a week before/);
  assert.match(pop.outOfRange({ ...p, saved: { last_7_days: 31, average_4_weeks_before: 10, history_days: 90 } }).join(), /too full: 31 notes/);
  assert.deepEqual(pop.outOfRange({ ...p, saved: { last_7_days: 0, average_4_weeks_before: 3, history_days: 90 } }), [], "an average under 4 a week is not compared");
  assert.deepEqual(pop.outOfRange({ ...p, saved: { last_7_days: 31, average_4_weeks_before: 10, history_days: 34 } }), [], "under 35 days of notes the week is not compared");
  assert.deepEqual(pop.outOfRange({ ...p, notes: 5, duplicates: { exact: 5, near: 0, share: 1 }, sources: { without_share: 1 } , saved: { last_7_days: 5, average_4_weeks_before: 5, history_days: 90 } }), [], "under 20 notes no share is judged");
  assert.match(pop.outOfRange({ ...p, saved: { last_7_days: 10, average_4_weeks_before: 10, history_days: 90 }, duplicates: { exact: 6, near: 2, share: 0.08, exact_share: 0.06 } }).join(), /6% duplicates \(6 notes with the same content as another\)/);
  assert.deepEqual(pop.outOfRange({ ...p, saved: { last_7_days: 10, average_4_weeks_before: 10, history_days: 90 }, duplicates: { exact: 0, near: 30, share: 0.3, exact_share: 0 } }), [], "near duplicates alone are in range");
  const ents = { total: 40, without_notes_share: 0, missing_required: 40, missing_required_share: 1 }, steady = { last_7_days: 10, average_4_weeks_before: 10, history_days: 90 };
  assert.match(pop.outOfRange({ ...p, saved: steady, entities: ents }).join(), /40 of 40 entities missing a required field/);
  assert.deepEqual(pop.outOfRange({ ...p, saved: steady, entities: { ...ents, schema_untouched: true } }), [], "not against a SCHEMA.md the team never changed");
});

test("the health line carries the population only when a number is out of range, and the view answers over query", async t => {
  const { root } = fixture(t);
  assert.doesNotMatch(health.healthLine(root, { coverage: [], policies: [], meetings: [] }), /population:/, "in range: nothing about the population");
  write(root, "beta", Array.from({ length: 12 }, (_, i) => rec("beta", ago(0.2 + i / 100), "The same sentence saved again.")));
  const line = health.healthLine(root, { coverage: [], policies: [], meetings: [] });
  // things to tidy are never counted at the chat start: a count there was taken as a job and worked through unasked
  assert.doesNotMatch(line, /population:|duplicates|\d+ notes with the same content/);
  assert.match(line, /housekeeping: there are things to tidy, when asked for/);
  assert.match(line, /Housekeeping starts only when the person asks for it: query \(object housekeeping\) for the names and files to settle, query \(object population\) for the numbers, then one item at a time with them; never start on it or count it out unasked\./);
  // the hint comes from the population numbers (copies here), which the housekeeping view does not list: the
  // line names the read that has them, so "there are things to tidy" is never answered with "nothing to settle"
  assert.match(housekeepingText(root), /Housekeeping: nothing to settle/);
  assert.match(pop.outOfRange(pop.population(root, { now })).join(), /duplicates \(\d+ notes with the same content as another\)/, "the number stays in the view");
  // the cache: same stamp and hour gives the cached numbers; a new note recomputes
  const cached = JSON.parse(readFileSync(join(root, "work/population.json"), "utf8"));
  assert.equal(cached.population.notes, pop.population(root, { now }).notes);
  write(root, "beta", [rec("beta", ago(0.1), "One more.")]);
  assert.equal(pop.population(root, { now }).notes, cached.population.notes + 1);
  const r = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-advisor/population.mjs`, "--json"], { cwd: root, env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.capture_rate, "not measured"); assert.ok(j.ranges.duplicates_max > 0); assert.ok(Array.isArray(j.out_of_range));

  const fresh = brain(t);
  assert.doesNotMatch(health.healthLine(fresh, { coverage: [], policies: [], meetings: [] }) || "", /population:/, "a new brain is in range");

  // over MCP: query object population, and describe_object
  const out = await mcp(root, [{ name: "query", arguments: { brain: root, object: "population" } }, { name: "describe_object", arguments: { brain: root, name: "population" } }]);
  assert.match(out[0], /^Population of the brain/); assert.match(out[0], /Capture rate: not measured/);
  assert.match(out[1], /population: a derived read/);
});

/* A bare MCP session: initialize, then each call in turn. */
async function mcp(root, calls) {
  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, [`${P}/server/server.mjs`], { cwd: root, env: { ...env, GTM_BRAIN_NO_SESSION_START: "1" }, stdio: ["pipe", "pipe", "ignore"] });
  let buf = ""; const waiting = new Map();
  child.stdout.on("data", d => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(line); waiting.get(m.id)?.(m); } catch {} } });
  let seq = 0; const ask = (method, params) => new Promise(res => { const k = ++seq; waiting.set(k, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: k, method, params }) + "\n"); });
  await ask("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  const out = [];
  for (const c of calls) out.push((await ask("tools/call", c)).result.content[0].text);
  child.kill(); return out;
}

test("sync checkpoints: per source kind and account, the old global one still read, overdue tools marked", t => {
  const root = brain(t);
  // a brain from before 0.35.0: only the global checkpoint
  writeFileSync(join(root, "work/sync.json"), JSON.stringify({ at: "2026-11-12T06:00:00Z", tools: ["Gmail", "HubSpot (CRM)"] }));
  assert.deepEqual(health.syncCheckpoints(root), [{ kind: "gmail", account: null, at: "2026-11-12T06:00:00Z", legacy: true }, { kind: "hubspot", account: null, at: "2026-11-12T06:00:00Z", legacy: true }]);
  assert.equal(health.syncCheckpoint(root, "gmail"), "2026-11-12T06:00:00Z");
  assert.equal(health.syncCheckpoint(root, "attio"), "2026-11-12T06:00:00Z", "a source without its own reads from the global one");
  assert.deepEqual(health.overdueSyncs(root, null, now), []);
  assert.deepEqual(health.overdueSyncs(root, null, now + 10 * DAY).map(o => o.tool), ["gmail", "hubspot"], "older than the 7-day default");

  // the new state: one checkpoint per kind and account; the global at stays for older plugins
  writeFileSync(join(root, "work/sync.json"), JSON.stringify({ at: "2026-11-01T06:00:00Z", tools: ["gmail", "hubspot"], sources: {
    gmail: { at: "2026-11-14T06:00:00Z", window_days: 2 }, "gmail:ann@demo.co": { at: "2026-11-10T06:00:00Z", window_days: 2 }, "HubSpot:12345": { at: "2026-11-13T06:00:00Z" } } }));
  assert.equal(health.syncCheckpoint(root, "gmail"), "2026-11-14T06:00:00Z");
  assert.equal(health.syncCheckpoint(root, "gmail", "Ann@demo.co"), "2026-11-10T06:00:00Z");
  assert.equal(health.syncCheckpoint(root, "gmail", "other@demo.co"), "2026-11-14T06:00:00Z", "an unknown account reads from the kind's own");
  assert.equal(health.syncCheckpoint(root, "hubspot", "12345"), "2026-11-13T06:00:00Z");
  assert.equal(health.syncCheckpoint(root, "hubspot"), "2026-11-01T06:00:00Z", "no account-less hubspot entry: the global one");
  assert.equal(health.syncCheckpoint(root, "attio"), "2026-11-01T06:00:00Z");
  // a kind with a checkpoint of its own is no longer listed at the old global time
  assert.deepEqual(health.lastSyncs(root, null), { gmail: "2026-11-14T06:00:00Z", "gmail (ann@demo.co)": "2026-11-10T06:00:00Z", "hubspot (12345)": "2026-11-13T06:00:00Z" });
  assert.deepEqual(health.overdueSyncs(root, null, now).map(o => `${o.tool} ${o.window_days}`), ["gmail (ann@demo.co) 2"]);
  const line = health.healthLine(root, { coverage: [], policies: [], meetings: [] });
  assert.match(line, /gmail \(ann@demo\.co\) 2026-11-10 06:00 UTC \(overdue: older than 2 days\)/);
  assert.match(line, /gmail 2026-11-14 06:00 UTC,/);
  assert.match(line, /hubspot \(12345\) 2026-11-13 06:00 UTC(,|\.| \|)/);
  // a legacy tool next to new ones: still listed at the global time, and judged by the default window
  writeFileSync(join(root, "work/sync.json"), JSON.stringify({ at: "2026-11-01T06:00:00Z", tools: ["gmail", "attio"], sources: { gmail: { at: "2026-11-14T06:00:00Z" } } }));
  assert.match(health.healthLine(root, { coverage: [], policies: [], meetings: [] }), /attio 2026-11-01 06:00 UTC \(overdue: older than 7 days\)/);
  assert.doesNotMatch(line, /[\u2013\u2014]/);

  rmSync(join(root, "work/sync.json"));
  assert.equal(health.syncCheckpoint(root, "gmail"), null, "no file: the skill reads the last 7 days");
});

test("timing: 50,000 notes", t => {
  const root = brain(t);
  lib.writeContext(root, "bulk", { title: "Bulk", compiled_at: ago(3), summary: "Bulk.", rule: "Bulk." });
  lib.writeNames(root, [...lib.readNames(root), ...Array.from({ length: 300 }, (_, i) => ({ name: `Company Number${i}`, kind: "organization", subtype: "company" }))]);
  const words = "pilot pricing renewal security review budget champion procurement timeline integration onboarding demo".split(" ");
  const rows = [];
  for (let i = 0; i < 50000; i++) rows.push(rec("bulk", new Date(now - (i % 60) * DAY - i * 1000).toISOString(), `Note ${i}: ${words[i % 12]} ${words[(i * 7) % 12]} with Company Number${i % 300} in detail.`, { source: i % 3 ? [{ kind: "gmail", ref: "t" + i }] : [] }));
  write(root, "bulk", rows);
  const t0 = Date.now(), p = pop.population(root, { now }), ms = Date.now() - t0;
  const t1 = Date.now(); pop.population(root, { now }); const cachedMs = Date.now() - t1;
  t.diagnostic(`50,000 notes, 300 entities: computed in ${ms} ms, from the cache in ${cachedMs} ms`);
  assert.ok(p.notes >= 50000); assert.equal(p.entities.without_notes, 0);
  assert.ok(ms < 30000, `computed in ${ms} ms`); assert.ok(cachedMs < 2000, `cached in ${cachedMs} ms`);
});

/* Review: the cases the first tests did not try. */
test("a brain younger than five weeks is not called too full or too empty", t => {
  const root = brain(t);
  lib.writeContext(root, "young", { title: "Young", rule: "Young." });
  // onboarding 9 days ago saved 200 notes at once; 10 more this week. Four weeks of history do not exist yet.
  const rows = [];
  for (let i = 0; i < 200; i++) rows.push(rec("young", ago(9), `Imported fact number ${i}.`, { source: [{ kind: "gmail", ref: `i${i}` }] }));
  for (let i = 0; i < 10; i++) rows.push(rec("young", ago(1), `Fresh fact number ${i}.`, { source: [{ kind: "gmail", ref: `f${i}` }] }));
  write(root, "young", rows);
  const p = pop.computePopulation(root, { now });
  assert.equal(p.saved.history_days, 9);
  assert.ok(!pop.outOfRange(p).some(o => /too empty|too full/.test(o)), pop.outOfRange(p).join("; "));
  assert.match(pop.populationText(p), /not judged yet: the oldest note is 9 days old/);
  // the same counts with five weeks behind them are judged
  assert.match(pop.outOfRange({ ...p, saved: { ...p.saved, history_days: 35 } }).join(), /too empty: 10 notes/);
});

test("sync checkpoints: one tool under two spellings is one entry, and a damaged file never throws", t => {
  const root = brain(t);
  // the checkpoint names the calendar by its pointer kind, the meeting coverage by the tool's display name
  writeFileSync(join(root, "work/sync.json"), JSON.stringify({ at: "2026-11-01T06:00:00Z", tools: ["Google Calendar"], sources: { "google-calendar": { at: "2026-11-14T06:00:00Z" } } }));
  const overview = { coverage: [{ tool: "Google Calendar", status: "complete", checked_at: "2026-11-02T06:00:00Z" }], policies: [], meetings: [] };
  assert.deepEqual(health.lastSyncs(root, overview), { "google-calendar": "2026-11-14T06:00:00Z" });
  assert.deepEqual(health.overdueSyncs(root, overview, now), [], "the fresh checkpoint is the tool's last sync; the older coverage read does not mark it overdue");
  for (const bad of ["[]", "\"x\"", "null", "{\"sources\":[{\"at\":\"2026-11-14T06:00:00Z\"}]}", "{\"sources\":{\"gmail\":null,\"\":{\"at\":\"2026-11-14T06:00:00Z\"},\":x\":{\"at\":\"2026-11-14T06:00:00Z\"}},\"at\":\"never\",\"tools\":\"gmail\"}", "{not json"]) {
    writeFileSync(join(root, "work/sync.json"), bad);
    assert.deepEqual(health.syncCheckpoints(root), [], bad);
    assert.equal(health.syncCheckpoint(root, "gmail"), null, bad);
    assert.doesNotMatch(health.healthLine(root, { coverage: [], policies: [], meetings: [] }) || "", /last sync/, bad);
  }
});

test("the cache does not outlive the code that wrote it, and the view never writes under brain/", t => {
  const { root } = fixture(t);
  const tree = () => execFileSync("git", ["status", "--porcelain", "--", "brain", "SCHEMA.md"], { cwd: root, encoding: "utf8" });
  const beforeGit = tree();
  pop.population(root, { now });
  const file = join(root, "work/population.json"), c = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(file, JSON.stringify({ key: c.key, population: { notes: -1 } }));   // right key, wrong shape (an older version's cache): recomputed, never a crash in the health line
  assert.ok(pop.population(root, { now }).notes > 0);
  assert.doesNotMatch(health.healthLine(root, { coverage: [], policies: [], meetings: [] }), /undefined|NaN/);
  assert.equal(tree(), beforeGit, "nothing under brain/ changed");
});
