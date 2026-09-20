process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
// Unit tests for lib/brain.mjs, the format module. Run: node --test plugins/gtm-os/test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
const lib = await import(new URL("../lib/brain.mjs", import.meta.url));

/* a minimal brain on disk: admin.md with a two-person team, no contexts yet */
function brain({ git = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "gtm-os-test-"));
  mkdirSync(join(root, "brain"), { recursive: true });
  writeFileSync(join(root, "brain", "admin.md"), lib.renderFrontmatter({
    company: "Reflow", owner: "marta-nowak", tools: ["Attio (CRM)", "Gmail"],
    team: [{ name: "Marta Nowak", email: "marta@reflow.io", handle: "marta-nowak" }, { name: "Tomek Zielinski", email: "tomek@reflow.io", handle: "tomek-zielinski" }],
  }) + "\n# Reflow\n");
  if (git) {
    const g = (...a) => execFileSync("git", ["-C", root, ...a], { stdio: "pipe" });
    g("init", "-q"); g("config", "user.name", "Test"); g("config", "user.email", "t@example.com"); g("config", "commit.gpgsign", "false");
  }
  return root;
}
const mem = (over = {}) => ({ id: "m_0123456789ab", context: "pipeline", at: "2026-09-03T10:00Z", authors: ["marta-nowak"], via: "codex", kind: "note", tools: [], people: [], content: "x", source: [], actions: [], supersedes: null, retracts: null, tags: [], ...over });

test("frontmatter round-trips scalars, inline lists, quoted strings and block lists of maps", () => {
  const fm = { title: 'Berlin: "the" expansion', slug: "berlin", compiled_at: null, people: ["Pierre Aubert", "Ingrid Solberg"], tools: ["Attio (CRM)"], team: [{ name: "Marta Nowak", email: "marta@reflow.io", handle: "marta-nowak" }] };
  const back = lib.parseFrontmatter(lib.renderFrontmatter(fm) + "\nbody\n");
  assert.deepEqual(back.fm, fm);
  assert.equal(back.body.trim(), "body");
});

test("handles are full names, ascii, lowercase, hyphenated", () => {
  assert.equal(lib.handleFor("Maciej Kończal"), "maciej-konczal");
  assert.equal(lib.handleFor("Łukasz Jakubowski"), "lukasz-jakubowski");
  assert.equal(lib.handleFor("  Anna  Kowal-Nowak "), "anna-kowal-nowak");
});

test("teamHandle resolves handle, name, email and an unambiguous first name", () => {
  const root = brain();
  assert.equal(lib.teamHandle(root, "marta-nowak"), "marta-nowak");
  assert.equal(lib.teamHandle(root, "Marta Nowak"), "marta-nowak");
  assert.equal(lib.teamHandle(root, "TOMEK@reflow.io"), "tomek-zielinski");
  assert.equal(lib.teamHandle(root, "tomek"), "tomek-zielinski");
  assert.equal(lib.teamHandle(root, "nobody"), null);
});

test("validateMemory accepts a good record and names every problem in a bad one", () => {
  assert.deepEqual(lib.validateMemory(mem()), []);
  assert.deepEqual(lib.validateMemory(mem({ id: "m_abc123" })), [], "6 hex ids from before v0.3 still validate");
  const errs = lib.validateMemory(mem({ id: "x", kind: "idea", content: "a \u2014 b", extra: 1, supersedes: "nope" }));
  for (const w of ["unknown field: extra", "id must be", "kind must be", "long dash", "supersedes must be"]) assert.ok(errs.some(e => e.includes(w)), w);
});

test("effectiveMemories hides retracted and superseded records", () => {
  const list = [mem({ id: "m_000000000001" }), mem({ id: "m_000000000002" }), mem({ id: "m_000000000003", supersedes: "m_000000000001" }), mem({ id: "m_000000000004", retracts: "m_000000000002", content: "wrong" })];
  assert.deepEqual(lib.effectiveMemories(list).map(m => m.id), ["m_000000000003", "m_000000000004"], "the correction and the retraction stay; what they replace or withdraw goes");
});

test("hideForkCopies counts a forked memory once, and the copy in the fork wins", () => {
  const origin = mem({ id: "m_000000000001", context: "pipeline" });
  const copy = mem({ id: "m_000000000009", context: "bergstrom", tags: ["forked:pipeline"], source: [{ kind: "memory", ref: "m_000000000001" }] });
  assert.deepEqual(lib.hideForkCopies([origin, copy]).map(m => m.id), ["m_000000000009"]);
  assert.deepEqual(lib.hideForkCopies([origin]).map(m => m.id), ["m_000000000001"], "the origin stands alone when the copy is not in view");
  assert.deepEqual(lib.hideForkCopies([copy]).map(m => m.id), ["m_000000000009"], "the copy stands alone when the origin is not in view");
});

test("writeContext and readContext round-trip a cover, and stale follows the memories", () => {
  const root = brain();
  lib.writeContext(root, "berlin", { title: 'Berlin: "the" expansion', rule: "Everything about Berlin. Office, hiring. Not sales.", tools: ["Gmail"] });
  let c = lib.readContext(root, "berlin");
  assert.equal(c.title, 'Berlin: "the" expansion'); assert.equal(c.whenLoaded, "Everything about Berlin. Office, hiring. Not sales."); assert.equal(Object.hasOwn(c, "scope"), false); assert.deepEqual(c.tools, ["Gmail"]);
  assert.equal(c.stale, false, "no memories, not stale");
  assert.throws(() => lib.writeContext(root, "Bad Slug", {}), /bad slug/);
  const { rec } = lib.appendMemory(root, "berlin", { authors: ["marta-nowak"], content: "Lease signed." });
  assert.match(rec.id, /^m_[0-9a-f]{12}$/);
  c = lib.readContext(root, "berlin"); assert.equal(c.stale, true, "a memory newer than compiled_at makes it stale");
  lib.writeContext(root, "berlin", { ...c.fm, compiled_at: "2099-01-01T00:00Z", rule: c.whenLoaded, now: "Wait." });
  c = lib.readContext(root, "berlin"); assert.equal(c.stale, false); assert.match(c.whenLoaded, /Working guidance: Wait\./);
});

test("appendMemory validates, refuses a missing context, and warns on tools admin does not list", () => {
  const root = brain(); lib.writeContext(root, "pipeline", { title: "Pipeline" });
  assert.throws(() => lib.appendMemory(root, "nope", { authors: ["a"], content: "x" }), /no such context/);
  assert.throws(() => lib.appendMemory(root, "pipeline", { authors: ["a"], content: "a \u2013 b" }), /long dash/);
  const { rec, warnings } = lib.appendMemory(root, "pipeline", { authors: ["marta-nowak"], content: "Call done.", tools: ["attio", "linear"] });
  assert.deepEqual(warnings, ['tool "linear" is not listed in admin.md']);
  assert.equal(lib.readMemories(root, "pipeline").length, 1);
  assert.equal(readFileSync(join(root, "brain", "contexts", "pipeline", "memories.jsonl"), "utf8").trim(), JSON.stringify(rec));
});

test("names: team members are always known; aliases, emails and first names resolve", () => {
  const root = brain();
  assert.equal(lib.canonicalName(lib.readNames(root), "marta"), "Marta Nowak");
  lib.addName(root, "Krzysztof Pawlak", { aliases: ["Chris"], emails: ["kp@example.com"] });
  const names = lib.readNames(root);
  assert.equal(lib.canonicalName(names, "chris"), "Krzysztof Pawlak");
  assert.equal(lib.canonicalName(names, "KP@example.com"), "Krzysztof Pawlak");
  assert.equal(lib.canonicalName(names, "unknown person"), null);
  lib.addName(root, "Telli", { kind: "company" });
  assert.equal(lib.readNames(root).find(n => n.name === "Telli").kind, "organization", "kind round-trips through names.md");
  assert.equal(lib.readNames(root).find(n => n.name === "Krzysztof Pawlak").kind, "person", "person is the default");
  assert.throws(() => lib.addName(root, "X", { kind: "planet" }), /kind must be one of/);
  const r = lib.normalisePeople(root, ["chris", "Pierre Aubert"]);
  assert.deepEqual(r.people, ["Krzysztof Pawlak", "Pierre Aubert"]); assert.deepEqual(r.added, ["Pierre Aubert"]); assert.deepEqual(r.similar, []);
});

test("a noreply address in the brain's git identity never identifies anyone; a real one matching a teammate does", () => {
  const root = brain(); execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "142623144+marta-nowak@users.noreply.github.com"]);
  assert.equal(lib.currentPerson(root), null);
  execFileSync("git", ["-C", root, "config", "user.email", "marta@reflow.io"]);
  assert.equal(lib.currentPerson(root), "marta-nowak");
});

test("entities: both registry files are merged on read and folded into entities.md on write", () => {
  const root = brain();
  lib.addName(root, "Pierre Aubert", { emails: ["pa@x.io"] });
  writeFileSync(join(root, "brain", "names.md"), "# Names\n\n- Old Contact | emails: old@x.io\n- Pierre Aubert | aliases: Pierre A\n- Telli | kind: company\n");
  const names = lib.readNames(root);
  assert.ok(names.some(n => n.name === "Old Contact"), "the older file's contact is read");
  assert.deepEqual(names.find(n => n.name === "Pierre Aubert").aliases, ["Pierre A"], "the same entity in both files is one, aliases merged");
  lib.addName(root, "New One");
  assert.ok(!existsSync(join(root, "brain", "names.md")), "retired after the merge was written");
  const after = lib.readNames(root);
  for (const n of ["Old Contact", "Pierre Aubert", "Telli", "New One"]) assert.ok(after.some(x => x.name === n), n);
  assert.equal(after.find(n => n.name === "Telli").kind, "organization");
});

test("entities: 'Chris is Krzysztof Pawlak' folds the Chris entry into Krzysztof and his notes count there", () => {
  const root = brain();
  lib.writeContext(root, "pipeline", { title: "Pipeline", rule: "Deals." });
  lib.normalisePeople(root, ["Chris"]);   // a note named Chris before anyone said who he is
  lib.appendMemory(root, "pipeline", { authors: ["marta-nowak"], content: "Chris called.", people: ["Chris"] });
  const target = lib.addName(root, "Krzysztof Pawlak", { emails: ["kp@x.io"] });
  const args = { source: lib.resolveEntity(lib.readNames(root), "Chris").id, target: target.id };
  const e = lib.mergeEntities(root, { ...args, by: "marta-nowak", as_of: lib.mergeEntities(root, args).as_of });
  assert.equal(e.status, "merged");
  const names = lib.readNames(root);
  assert.ok(!names.some(n => n.name === "Chris"), "no separate Chris entry"); assert.deepEqual(names.find(n => n.name === "Krzysztof Pawlak").aliases, ["Chris"]);
  assert.deepEqual(lib.resolvePeople(names, ["Chris", "chris", "Krzysztof Pawlak"]), ["Krzysztof Pawlak"], "the old record's name maps to him, once");
  const f = lib.addName(root, "Krzysztof Pawlak", { aliases: ["KP"] }); assert.deepEqual(f.merged, [], "an alias nobody had merges nothing");
});

test("entities: look-alikes of one kind are suggested as merges; 'is not' is remembered; people only by surname", () => {
  const root = brain();
  lib.addName(root, "Nestle", { kind: "company" }); lib.addName(root, "Nestle Poland", { kind: "company" }); lib.addName(root, "Open AI", { kind: "company" }); lib.addName(root, "OpenAI", { kind: "company" });
  lib.addName(root, "Pierre Aubert"); lib.addName(root, "Pierre Dupont"); lib.addName(root, "Anna Dupont"); lib.addName(root, "Telli", { kind: "company" }); lib.addName(root, "Telli Team", { kind: "team" });
  const pairs = lib.suggestMerges(lib.readNames(root)).map(m => [m.a, m.b].sort().join("|")).sort();
  assert.deepEqual(pairs, ["Anna Dupont|Pierre Dupont", "Nestle|Nestle Poland", "Open AI|OpenAI"], "shared word for companies, surname for people, same letters; never across kinds, never a shared first name");
  lib.addName(root, "Nestle Poland", { not: ["nestle"] });
  assert.deepEqual(lib.readNames(root).find(n => n.name === "Nestle Poland").not, ["Nestle"], "stored with the canonical spelling");
  assert.ok(!lib.suggestMerges(lib.readNames(root)).some(m => m.b === "Nestle Poland" || m.a === "Nestle Poland"), "not suggested again");
  assert.deepEqual(lib.resolveEntity(lib.readNames(root), "Nestle Poland").not, ["Nestle"]);
  const args = { source: lib.resolveEntity(lib.readNames(root), "Nestle Poland").id, target: lib.resolveEntity(lib.readNames(root), "Nestle").id, resolution: { allow_distinct: true } };
  assert.equal(lib.mergeEntities(root, { ...args, by: "marta-nowak", as_of: lib.mergeEntities(root, args).as_of }).status, "merged");
});

test("entities: mentions count from the text once a name is known; candidates the note left out are named", () => {
  const root = brain();
  lib.addName(root, "Castorama", { kind: "company" }); lib.addName(root, "Pierre Dupont"); lib.addName(root, "Maciej Konczal", { aliases: ["maciej"] });
  const names = lib.readNames(root);
  const m = { people: ["Pierre Dupont"], content: "Castorama wants a call next Saturday, 12 September. Maciej will confirm with Pierre. ByteDance support is confirmed by Proclaim Studio." };
  assert.deepEqual(lib.mentionsIn(names, m), ["Pierre Dupont", "Castorama", "Maciej Konczal"], "the people field, then names found in the text (alias maciej too)");
  assert.deepEqual(lib.candidateEntities(m.content, m.people, names), ["ByteDance", "Proclaim Studio"], "left out: capitalised names that are neither known nor everyday words");
  assert.deepEqual(lib.candidateEntities("Noted. Next step is agreeing a time with Castorama for Saturday, 12 September.", [], names), [], "sentence starts, days and months are not entities");
  assert.deepEqual(lib.candidateEntities("Met Pierre Dupont from Nestle Poland in Warsaw.", ["Pierre Dupont"], names), ["Nestle Poland", "Warsaw"], "a verb before a known name is not a name; places are left for the model to skip");
  assert.deepEqual(lib.candidateEntities("Nestle Poland is interested.", [], names), ["Nestle Poland"], "a two-word name at the start stays whole");
});

test("entities: the full name is the canonical one, whichever way it was said or stored", () => {
  const root = brain();
  const said = lib.addName(root, "Chris", { aliases: ["Krzysztof Pawlak"] });   // the alias given the other way round
  assert.equal(said.name, "Krzysztof Pawlak"); assert.deepEqual(said.aliases, ["Chris"]);
  writeFileSync(join(root, "brain", "entities.md"), "# Entities\n\n- Chris | aliases: Krzysztof Pawlak\n- Krzysztof Pawlak | aliases: Chris | emails: kp@x.io\n- Telli | aliases: Telli GmbH | kind: company\n");
  const names = lib.readNames(root);
  assert.equal(names.filter(n => /Pawlak|Chris/.test(n.name + n.aliases)).length, 1, "two lines for one person read as one");
  const kp = names.find(n => n.name === "Krzysztof Pawlak"); assert.deepEqual(kp.aliases, ["Chris"]); assert.deepEqual(kp.emails, ["kp@x.io"]);
  assert.equal(names.find(n => n.kind === "organization").name, "Telli", "companies keep their name as given");
  lib.addName(root, "Ann Lee"); assert.equal(lib.resolveEntity(lib.readNames(root), "Chris").name, "Krzysztof Pawlak", "the next write stores the corrected identity file");
});

test("names: a first name is taken as the one known entity and said so; a confirmed new name is new even then", () => {
  const root = brain();
  lib.addName(root, "Maciej Konczal");
  const r = lib.normalisePeople(root, ["Maciej"]);
  assert.deepEqual(r.people, ["Maciej Konczal"]); assert.deepEqual(r.inferred, [{ mention: "Maciej", name: "Maciej Konczal" }]); assert.deepEqual(r.added, []);
  const n = lib.normalisePeople(root, ["Maciej"], { confirmedNew: ["Maciej"] });
  assert.deepEqual(n.people, ["Maciej"]); assert.deepEqual(n.added, ["Maciej"]); assert.deepEqual(n.inferred, []);
  assert.equal(lib.exactName(lib.readNames(root), "maciej"), "Maciej", "from now on the short name is its own entity");
  assert.equal(lib.canonicalName(lib.readNames(root), "Maciej Konczal"), "Maciej Konczal");
});

test("names: a mention that looks like a known name is not added; confirmed new, it is", () => {
  const root = brain();
  lib.addName(root, "Pierre Aubert"); lib.addName(root, "OpenAI", { kind: "company" }); lib.addName(root, "Maciej Kończal");
  const names = lib.readNames(root);
  assert.deepEqual(lib.similarNames(names, "Pierre Dupont"), [{ name: "Pierre Aubert", kind: "person" }], "shared first name");
  assert.deepEqual(lib.similarNames(names, "OpenAI Deployment"), [{ name: "OpenAI", kind: "organization" }], "shared word");
  assert.deepEqual(lib.similarNames(names, "Open AI"), [{ name: "OpenAI", kind: "organization" }], "same letters spelled apart");
  assert.deepEqual(lib.similarNames(names, "Konczal"), [{ name: "Maciej Kończal", kind: "person" }], "accents ignored");
  assert.deepEqual(lib.similarNames(names, "Ingrid Solberg"), []);
  assert.deepEqual(lib.similarNames(names, "The Group"), [], "stop words never match");
  const held = lib.normalisePeople(root, ["Pierre Dupont", "Ingrid Solberg"]);
  assert.deepEqual(held.people, []); assert.deepEqual(held.added, []); assert.equal(held.similar.length, 1); assert.equal(held.similar[0].mention, "Pierre Dupont");
  assert.ok(!lib.readNames(root).some(n => n.name === "Ingrid Solberg"), "nothing is added while a question is open");
  const ok = lib.normalisePeople(root, ["Pierre Dupont", "Ingrid Solberg"], { confirmedNew: ["pierre dupont"] });
  assert.deepEqual(ok.people, ["Pierre Dupont", "Ingrid Solberg"]); assert.deepEqual(ok.added, ["Pierre Dupont", "Ingrid Solberg"]);
  assert.equal(lib.canonicalName(lib.readNames(root), "Pierre"), null, "two Pierres: a first name alone is ambiguous");
  assert.equal(lib.normalisePeople(root, ["Pierre"]).similar[0].matches.length, 2, "and both are named");
});

test("the loaded set is deduplicated and survives a round trip", () => {
  const root = brain();
  assert.deepEqual(lib.readLoaded(root), []);
  lib.writeLoaded(root, ["pipeline", "gtm", "pipeline"]);
  assert.deepEqual(lib.readLoaded(root), ["pipeline", "gtm"]);
});

test("defaultChannelsFor places tools by kind", () => {
  assert.deepEqual(lib.defaultChannelsFor("Attio (CRM)"), ["icp", "strategy"]);
  assert.deepEqual(lib.defaultChannelsFor("PostHog"), ["market", "strategy"]);
  assert.deepEqual(lib.defaultChannelsFor("Notion"), ["company", "strategy", "market", "icp", "offer"]);
  assert.deepEqual(lib.defaultChannelsFor("Some Unknown Tool"), []);
});

test("commit: commits named paths in a repo, says nothing to commit, and says NOT committed without git", () => {
  const root = brain({ git: true });
  writeFileSync(join(root, "unrelated.txt"), "theirs"); execFileSync("git", ["-C", root, "add", "unrelated.txt"]);
  const r1 = lib.commit(root, ["brain/admin.md"], "first");
  assert.equal(r1.note, "kept");
  assert.equal(execFileSync("git", ["-C", root, "diff", "--cached", "--name-only"], { encoding: "utf8" }).trim(), "unrelated.txt", "what the person had staged stays staged, out of the plugin's commit");
  execFileSync("git", ["-C", root, "reset", "-q", "unrelated.txt"]);
  assert.equal(lib.commit(root, ["brain/admin.md"], "again").note, "nothing to commit");
  const log = execFileSync("git", ["-C", root, "log", "--oneline"], { encoding: "utf8" });
  assert.equal(log.trim().split("\n").length, 1);
  const r2 = lib.commit(brain(), ["brain/admin.md"], "x");
  assert.equal(r2.ok, false); assert.equal(r2.note, lib.NOT_COMMITTED);
});

test("readOnboarding reads the marker and step outcomes from the gtm channel", () => {
  const root = brain();
  assert.equal(lib.readOnboarding(root).status, null, "no gtm context, no marker: discovery never ran");
  assert.equal(lib.readOnboarding(root).required, false, "missing historical bookkeeping is not an onboarding request");
  assert.equal(lib.readOnboarding(root).next, null);
  mkdirSync(join(root, "brain", "contexts", "gtm"), { recursive: true });
  const gtm = join(root, "brain", "contexts", "gtm", "memories.jsonl");
  const lines = [
    mem({ id: "m_aaaaaaaaaaaa", context: "gtm", at: "2026-09-03T10:00Z", content: "Onboarding: pending v1 since 2026-09-03." }),
    mem({ id: "m_bbbbbbbbbbbb", context: "gtm", at: "2026-09-03T11:00Z", content: "Onboarding step 1 (Who you are): confirmed Marta Nowak, reflow.io." }),
    mem({ id: "m_dddddddddddd", context: "gtm", at: "2026-09-03T11:30Z", content: "an unrelated note stays out of the card" }),
  ];
  writeFileSync(gtm, lines.map(l => JSON.stringify(l)).join("\n") + "\n");
  let o = lib.readOnboarding(root);
  assert.equal(o.status, "pending"); assert.equal(o.version, 1);
  assert.deepEqual(o.steps, [{ n: 1, title: "Who you are", outcome: "confirmed Marta Nowak, reflow.io.", at: "2026-09-03T11:00Z" }]);
  const closed = mem({ id: "m_cccccccccccc", context: "gtm", at: "2026-09-03T12:00Z", content: "Onboarding: completed v1 on 2026-09-03.", supersedes: "m_aaaaaaaaaaaa" });
  writeFileSync(gtm, [...lines, closed].map(l => JSON.stringify(l)).join("\n") + "\n");
  o = lib.readOnboarding(root);
  assert.equal(o.status, "completed", "completed supersedes pending; the card is gone");
  assert.equal(o.required, false, "old completions survive new workflow versions");
  assert.equal(o.steps.length, 1, "step outcomes survive the close");
});

test('ambiguous company capture leaves the names registry unchanged', () => {
  const root = brain();
  lib.addName(root, 'Nestle', { kind: 'company' });
  const before = lib.readNames(root);
  const r = lib.normalisePeople(root, ['New Client', 'Nestle Poland'], { companies: ['New Client', 'Nestle Poland'] });
  assert.ok(r.similar.length);
  assert.deepEqual(lib.readNames(root), before);
});

test("compilePlan starts immediately for one or many pending notes, and does nothing with no changes", () => {
  const root = brain();
  lib.writeContext(root, "pipeline", { title: "Pipeline", rule: "Deals." });
  lib.writeContext(root, "market", { title: "Market", rule: "Market." });
  const NOW = Date.parse("2026-09-06T12:00:00Z");
  const ago = mins => new Date(NOW - mins * 60000).toISOString();
  const note = (slug, mins, content) => lib.appendMemory(root, slug, { authors: ["marta-nowak"], content, at: ago(mins) });

  assert.deepEqual(lib.compilePlan(root, { now: NOW }), { pending: 0, contexts: [], oldest: null, wait: null },
    "no memories: nothing pending, nothing scheduled");

  note("pipeline", 3, "One.");
  let p = lib.compilePlan(root, { now: NOW });
  assert.equal(p.pending, 1); assert.deepEqual(p.contexts, ["pipeline"]);
  assert.equal(p.wait, 0, "one saved note starts immediately");

  note("market", 9, "Older, in another channel.");
  p = lib.compilePlan(root, { now: NOW });
  assert.equal(p.pending, 2); assert.deepEqual(p.contexts.sort(), ["market", "pipeline"]);
  assert.equal(p.oldest, ago(9));
  assert.equal(p.wait, 0, "all affected channels are eligible immediately");

  note("pipeline", 30, "Older than the window.");
  assert.equal(lib.compilePlan(root, { now: NOW }).wait, 0, "a note that already waited out the window goes now");

  const fresh = brain();
  lib.writeContext(fresh, "pipeline", { title: "Pipeline", rule: "Deals." });
  for (let i = 0; i < 9; i++) lib.appendMemory(fresh, "pipeline", { authors: ["marta-nowak"], content: `Note ${i}.`, at: ago(1) });
  assert.equal(lib.compilePlan(fresh, { now: NOW }).wait, 0, "fresh notes do not wait for a batch");
  lib.appendMemory(fresh, "pipeline", { authors: ["marta-nowak"], content: "Note 9.", at: ago(1) });
  const full = lib.compilePlan(fresh, { now: NOW });
  assert.equal(full.pending, 10); assert.equal(full.wait, 0, "the tenth pending note runs the summary at once");
});

test("compilePlan counts only what is not compiled yet, and ignores retracted and archived notes", () => {
  const root = brain();
  lib.writeContext(root, "pipeline", { title: "Pipeline", rule: "Deals." });
  const NOW = Date.parse("2026-09-06T12:00:00Z");
  const { rec: first } = lib.appendMemory(root, "pipeline", { authors: ["marta-nowak"], content: "Old.", at: "2026-09-06T10:00:00Z" });
  const c = lib.readContext(root, "pipeline");
  lib.writeContext(root, "pipeline", { ...c.fm, compiled_at: "2026-09-06T11:00:00Z", rule: c.rule });
  assert.equal(lib.compilePlan(root, { now: NOW }).pending, 0, "a note older than the last compile is not pending");

  lib.appendMemory(root, "pipeline", { authors: ["marta-nowak"], content: "Wrong, withdrawn.", at: "2026-09-06T11:30:00Z", retracts: first.id });
  assert.equal(lib.compilePlan(root, { now: NOW }).pending, 1, "the retraction itself is new information and counts");

  lib.writeContext(root, "old", { title: "Old", rule: "Old.", status: "archived" });
  lib.appendMemory(root, "old", { authors: ["marta-nowak"], content: "Archived note.", at: "2026-09-06T11:45:00Z" });
  assert.equal(lib.compilePlan(root, { now: NOW }).pending, 1, "archived channels are never compiled, so their notes are not pending");
});

/* Codex thread sources: a memory points at the chat it came from as codex:<id>; the id resolves
   to a link, the thread's name and its project from the local Codex home, never from the brain */
function codexHome(threads) {
  const home = mkdtempSync(join(tmpdir(), "gtm-os-codex-home-"));
  writeFileSync(join(home, "session_index.jsonl"), threads.filter(t => t.name).map(t => JSON.stringify({ id: t.id, thread_name: t.name, updated_at: "2026-09-09T08:00:00Z" })).join("\n") + "\n");
  for (const t of threads.filter(t => t.cwd)) {
    const dir = join(home, "sessions", "2026", "09", "09"); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `rollout-2026-09-09T08-00-00-${t.id}.jsonl`), JSON.stringify({ timestamp: "2026-09-09T08:00:00Z", type: "session_meta", payload: { id: t.id, cwd: t.cwd, originator: t.originator || "codex_app" } }) + "\n" + JSON.stringify({ type: "event_msg", payload: {} }) + "\n");
  }
  return home;
}
test("resolveThread: a codex thread id becomes a deep link with its name and project", () => {
  const root = brain();
  const home = codexHome([{ id: "01a0-here", name: "Pricing call prep", cwd: root }, { id: "01a0-else", name: "Other project", cwd: join(root, "..", "elsewhere"), originator: "codex_exec" }]);
  const here = lib.resolveThread("01a0-here", root, { codexHome: home });
  assert.equal(here.url, "codex://threads/01a0-here"); assert.equal(here.name, "Pricing call prep"); assert.equal(here.foreign, false); assert.equal(here.originator, "codex_app");
  const elsewhere = lib.resolveThread("01a0-else", root, { codexHome: home });
  assert.equal(elsewhere.foreign, true, "another project's thread is marked"); assert.equal(elsewhere.originator, "codex_exec");
});
test("resolveThread: an unknown id or a missing Codex home still gives the link", () => {
  const root = brain();
  const bare = lib.resolveThread("01a0-gone", root, { codexHome: codexHome([]) });
  assert.deepEqual(bare, { id: "01a0-gone", url: "codex://threads/01a0-gone", name: null, cwd: null, originator: null, foreign: null });
  assert.equal(lib.resolveThread("01a0-gone", root, { codexHome: join(tmpdir(), "no-such-codex-home") }).url, "codex://threads/01a0-gone");
  assert.equal(lib.resolveThread("bad/../id", root, { codexHome: codexHome([]) }), null, "an id that is not a thread id resolves to nothing");
});
test("resolveThread reads CODEX_HOME by default", () => {
  const root = brain(); const home = codexHome([{ id: "01a0-env", name: "From env" }]);
  const prev = process.env.CODEX_HOME; process.env.CODEX_HOME = home;
  try { assert.equal(lib.resolveThread("01a0-env", root).name, "From env"); } finally { if (prev === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prev; }
});
