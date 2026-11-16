// A confirmed action is one call (2026-11-15: a merge took a preview, an apply, a "confirmation" note and a read to
// verify; "no, they are different" was refused twice and the person was asked again).
//   merge_entities with confirmed: true   previews and applies in one call; a choice only the person can make comes
//                                          back as one question; without confirmed it is the preview and as_of as before
//   answer_question                        closes an open question with the answer as the note that retracts it, and
//                                          carries out "same" or "different" for two names in the same call
// The notes log only grows: every memories.jsonl is a prefix of itself after each call.
process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-home-"));   // never the real brains registry
const lib = await import(`${P}/lib/brain.mjs`);
const ENV = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_SESSION_START: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1" };

const server = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env: ENV });
const waiting = new Map(); let seq = 0;
createInterface({ input: server.stdout }).on("line", line => { const m = JSON.parse(line); const r = waiting.get(m.id); if (r) { waiting.delete(m.id); r(m); } });
const rpc = (method, params = {}) => new Promise(res => { const id = ++seq; waiting.set(id, res); server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const call = async (name, args) => { const m = await rpc("tools/call", { name, arguments: args }); return { text: m.result.content.map(c => c.text).join("\n"), isError: !!m.result.isError }; };
after(() => server.kill());

const brain = () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-one-call-")); execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@b.c>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  const log = () => lib.noteFiles(root).map(f => readFileSync(join(root, f), "utf8")).join("");   // every note, wherever this layout keeps them
  const note = fields => lib.appendMemory(root, "company", { authors: ["ann-lee"], via: "codex", kind: "note", tools: [], people: [], source: [{ kind: "user", ref: "ann-lee" }], actions: [], supersedes: null, retracts: null, tags: [], ...fields }).rec;
  const ask = (content, more = {}) => note({ kind: "question", content, tags: ["brain-question"], ...more });
  const names = () => lib.readNames(root);
  const tool = async (name, args = {}) => call(name, { brain: root, ...args });
  const json = async (name, args) => { const r = await tool(name, args); assert.ok(!r.isError, r.text); return JSON.parse(r.text.slice(r.text.indexOf("{"))); };
  const open = () => lib.effectiveMemories(lib.readMemories(root, "company")).filter(m => m.kind === "question" && !m.retracts);
  return { root, log, note, ask, names, tool, json, open };
};
// every line the log had is still there, unchanged and in place
const grew = (before, after, by) => { assert.ok(after.startsWith(before), "no earlier line was changed or removed"); assert.equal(after.slice(before.length).split("\n").filter(Boolean).length, by, `${by} line(s) added`); };

test("the catalog offers answer_question and merge_entities takes confirmed; neither sends the model to a file", async () => {
  const { result } = await rpc("tools/list");
  const answer = result.tools.find(t => t.name === "answer_question"), merge = result.tools.find(t => t.name === "merge_entities");
  assert.ok(answer, "answer_question is in tools/list"); assert.ok(lib.RESERVED_TOOLS.has("answer_question"));
  assert.deepEqual(answer.inputSchema.required, ["brain"], "without a question it lists the open ones");
  assert.deepEqual(answer.inputSchema.properties.outcome.enum, ["same", "different"]);
  assert.equal(merge.inputSchema.properties.confirmed.type, "boolean");
  assert.deepEqual(merge.inputSchema.required.sort(), ["brain", "source", "target"]);
  for (const t of [answer, merge]) { assert.doesNotMatch(t.description, /SKILL\.md|references\/|rule page|[–—]/); assert.ok(t.description.length < 1024, `${t.name}: ${t.description.length} characters`); }
});

test("merge confirmed: one call merges, says what was kept and that no note is needed", async () => {
  const b = brain();
  const source = lib.addName(b.root, "Chris", { emails: ["chris@acme.test"], references: [{ kind: "hubspot", ref: "contact/7" }] });
  const target = lib.addName(b.root, "Krzysztof Pawlak", { aliases: ["KP"], emails: ["kp@acme.test"] });
  b.note({ content: "Chris asked for the renewal terms.", people: ["Chris"] });
  b.note({ content: "Krzysztof Pawlak signed the order form.", people: ["Krzysztof Pawlak"] });
  b.note({ content: "Krzysztof Pawlak moved to Berlin.", people: ["Krzysztof Pawlak"] });
  const before = b.log();
  const r = await b.json("merge_entities", { source: source.id, target: "Krzysztof Pawlak", confirmed: true, by: "ann-lee" });
  assert.equal(r.status, "merged"); assert.match(r.merge_id, /^ec_/); assert.equal(r.target, target.id);
  assert.deepEqual(r.kept, { name: "Krzysztof Pawlak", kind: "person", aliases: ["KP", "Chris"], emails: ["kp@acme.test", "chris@acme.test"], references: ["hubspot:contact/7"], notes: 3 });
  assert.equal(r.say, 'Merged "Chris" into "Krzysztof Pawlak": also known as KP, Chris; emails kp@acme.test, chris@acme.test; 1 tool record; 3 notes now count together (2 + 1).');
  assert.match(r.recorded, /confirmed by ann-lee; do not save a note about this merge/);
  assert.doesNotMatch(JSON.stringify(r), /as_of|SKILL\.md|references\/[a-z-]+\.md/, "no token to send back, no file to read");
  assert.ok(JSON.stringify(r).length < 1200, "short enough to relay");
  assert.equal(lib.resolveEntity(b.names(), source.id).id, target.id, "the old ID resolves to the survivor");
  assert.equal(b.log(), before, "a merge writes no note");
  // the merge record is the confirmation: undo finds it by the id the reply gave
  const undo = await b.json("undo_entity_merge", { merge_id: r.merge_id }); assert.equal(undo.status, "preview"); assert.equal(undo.source, source.id);
});

test("merge confirmed: the person in this chat is the author when by is left out; a stranger is refused", async () => {
  const b = brain();
  const source = lib.addName(b.root, "Acme GmbH", { kind: "organization", subtype: "company" }), target = lib.addName(b.root, "Acme", { kind: "organization", subtype: "company" });
  const stranger = await b.tool("merge_entities", { source: source.id, target: target.id, confirmed: true, by: "nobody" });
  assert.ok(stranger.isError); assert.match(stranger.text, /by must identify a team member/); assert.equal(lib.resolveEntity(b.names(), source.id).id, source.id, "nothing merged");
  assert.ok((await b.tool("merge_entities", { source: source.id, target: target.id, confirmed: true, as_of: "ecv_x" })).isError, "confirmed and as_of do not mix");
  assert.ok((await b.tool("merge_entities", { source: source.id, target: target.id, confirmed: "yes" })).isError, "confirmed is a boolean");
  assert.equal(lib.currentPerson(b.root), "ann-lee", "setup named the person at this computer");
  const r = await b.json("merge_entities", { source: source.id, target: target.id, confirmed: true });
  assert.equal(r.status, "merged"); assert.match(r.recorded, /confirmed by ann-lee/);
});

test("merge confirmed: a person filed where a company is known merges into the company and takes its kind", async () => {
  const b = brain();
  const source = lib.addName(b.root, "Northwind Traders"), target = lib.addName(b.root, "Northwind", { kind: "organization", subtype: "company" });
  const r = await b.json("merge_entities", { source: source.id, target: target.id, confirmed: true, by: "ann-lee" });
  assert.equal(r.status, "merged"); assert.equal(r.kept.kind, "company");
  const kept = b.names().find(e => e.id === target.id); assert.equal(kept.kind, "organization"); assert.equal(kept.subtype, "company");
});

test("merge confirmed: two records in the same tool need the person's choice; nothing is merged, one question comes back", async () => {
  const b = brain();
  const source = lib.addName(b.root, "Chris", { references: [{ kind: "hubspot", ref: "contact/7" }] });
  const target = lib.addName(b.root, "Krzysztof Pawlak", { references: [{ kind: "hubspot", ref: "contact/9" }] });
  const p = await b.json("merge_entities", { source: source.id, target: target.id, confirmed: true, by: "ann-lee" });
  assert.equal(p.status, "preview"); assert.deepEqual(p.unresolved, ["references"]); assert.match(p.as_of, /^ecv_/, "the preview is the one a call without confirmed returns");
  assert.match(p.question, /Both have a hubspot record \("Chris": hubspot:contact\/7; "Krzysztof Pawlak": hubspot:contact\/9\)\. Which stays\? 1\. Both 2\. /);
  assert.match(p.next, /Ask that one question and wait\. Then merge_entities again with confirmed true and resolution \{"references":"combine"\}/);
  assert.equal(lib.resolveEntity(b.names(), source.id).id, source.id, "nothing merged");
  const r = await b.json("merge_entities", { source: source.id, target: target.id, confirmed: true, by: "ann-lee", resolution: { references: "target" } });
  assert.equal(r.status, "merged"); assert.deepEqual(r.kept.references, ["hubspot:contact/9"]);
});

test("merge confirmed: two names marked as different earlier are asked about once, then merged on the answer", async () => {
  const b = brain();
  const target = lib.addName(b.root, "Nestle", { kind: "organization" }), source = lib.addName(b.root, "Nestle Poland", { kind: "organization", not: ["Nestle"] });
  const p = await b.json("merge_entities", { source: source.id, target: target.id, confirmed: true, by: "ann-lee" });
  assert.equal(p.status, "preview"); assert.deepEqual(p.unresolved, ["allow_distinct"]);
  assert.match(p.question, /"Nestle Poland" and "Nestle" were marked as different earlier\. Merge them anyway\? 1\. Yes, merge them 2\. No, keep them separate/);
  assert.match(p.next, /resolution \{"allow_distinct":true\}/);
  const r = await b.json("merge_entities", { source: source.id, target: target.id, confirmed: true, by: "ann-lee", resolution: { allow_distinct: true } });
  assert.equal(r.status, "merged");
});

test("merge without confirmed is unchanged: a read-only preview, then apply with its as_of and by", async () => {
  const b = brain();
  const source = lib.addName(b.root, "Chris"), target = lib.addName(b.root, "Krzysztof Pawlak");
  const p = await b.json("merge_entities", { source: source.id, target: target.id });
  assert.deepEqual(Object.keys(p).sort(), ["as_of", "conflicts", "impact", "notes", "proposed", "source", "status", "target", "unresolved"]);
  assert.equal(p.status, "preview"); assert.equal(lib.resolveEntity(b.names(), source.id).id, source.id);
  assert.ok((await b.tool("merge_entities", { source: source.id, target: target.id, as_of: p.as_of })).isError, "apply needs a team author");
  assert.ok((await b.tool("merge_entities", { source: source.id, target: target.id, confirmed: false, by: "ann-lee" })).text.includes('"status": "preview"'), "confirmed false is a preview too");
  const r = await b.json("merge_entities", { source: source.id, target: target.id, as_of: p.as_of, by: "ann-lee" });
  assert.deepEqual(Object.keys(r).sort(), ["change_id", "changed", "entity", "merge_id", "note", "source", "status", "target"]);
  assert.equal(r.status, "merged");
});

test("answer_question without a question lists the open ones: id, topic, age, what each is about", async () => {
  const b = brain();
  assert.match((await b.tool("answer_question")).text, /^No open questions/);
  lib.addName(b.root, "Wanda Stach"); lib.addName(b.root, "Wanda Niemiec");
  const about = b.note({ content: "Olek wants the deck by Friday (2026-11-20).", people: [] });
  const old = b.ask("Is Wanda Stach the same person as Wanda Niemiec?", { people: ["Wanda Stach", "Wanda Niemiec"], at: new Date(Date.now() - 3 * 864e5).toISOString() });
  const name = b.ask(`Who is Olek? Full name or company. (about ${about.id}: "Olek wants the deck by Friday (2026-11-20).")`, { tags: ["brain-question", "name-question", `about:${about.id}`, "name:Olek"] });
  const done = b.ask("Do we renew the venue?"); b.note({ kind: "decision", content: "Yes, renew.", retracts: done.id });
  b.note({ kind: "question", content: "A question nobody was asked." });
  const before = b.log(), r = await b.tool("answer_question");
  assert.ok(!r.isError, r.text);
  const lines = r.text.split("\n");
  assert.equal(lines[0], "Open questions: 2");
  assert.equal(lines[1], `1. ${name.id} | Our company | today | about Olek; the note ${about.id} "Olek wants the deck by Friday (2026-11-20)." | "Who is Olek? Full name or company. (about ${about.id}: "Olek wants the deck by Friday (2026-11-20).")"`);
  assert.equal(lines[2], `2. ${old.id} | Our company | 3 days old | about Wanda Stach, Wanda Niemiec | "Is Wanda Stach the same person as Wanda Niemiec?"`);
  assert.match(lines[3], /^Next: tell the person these in plain words\. When they answer one: answer_question with question = its id/);
  assert.equal(lines.length, 4, "the answered one and the untagged one are not listed");
  assert.equal(b.log(), before, "listing writes nothing");
});

test("answer_question: a plain question is closed by one decision that retracts it", async () => {
  const b = brain();
  const q = b.ask("Do we renew the venue for 2027?", { tags: ["brain-question", "project:summit"] }), other = b.ask("Who owns the sponsor list?");
  const before = b.log();
  const r = await b.tool("answer_question", { question: q.id, answer: "yes, renew it, same terms as this year", by: "ann-lee" });
  assert.ok(!r.isError, r.text);
  const made = lib.readMemories(b.root, "company").at(-1);
  assert.equal(made.retracts, q.id); assert.equal(made.kind, "decision"); assert.equal(made.content, "yes, renew it, same terms as this year");
  assert.deepEqual(made.authors, ["ann-lee"]); assert.deepEqual(made.tags, ["project:summit"]); assert.deepEqual(made.source[0], { kind: "user", ref: "ann-lee" });
  const [first, next, ...rest] = r.text.split("\n");
  assert.match(first, new RegExp(`^answered ${q.id} in Our company: the question is closed by ${made.id}\\. Recorded \\(.*\\); do not save a note about this, and do not ask it again\\. Still open: 1 other question\\.$`));
  assert.equal(next, "Next: tell the person in one line."); assert.deepEqual(rest, []);
  assert.deepEqual(b.open().map(m => m.id), [other.id]);
  grew(before, b.log(), 1);
  // the same answer sent again: nothing written, and no reason to ask the person again
  const again = await b.tool("answer_question", { question: q.id, answer: "yes, renew it", by: "ann-lee" });
  assert.ok(!again.isError); assert.match(again.text, new RegExp(`^${q.id} was already answered \\(${made.id}: "yes, renew it, same terms as this year"\\)\\. Nothing written; do not ask the person again\\.$`));
  grew(before, b.log(), 1);
});

test("answer_question: 'no, they are different people' for two known people closes the question and keeps them apart", async () => {
  const b = brain();
  const a = lib.addName(b.root, "Wanda Stach"), c = lib.addName(b.root, "Vanda Stach");
  assert.equal(lib.suggestMerges(b.names().filter(e => [a.id, c.id].includes(e.id))).length, 1, "the pair is suggested as one before the answer");
  const q = b.ask("Is Wanda Stach the same person as Vanda Stach?", { people: ["Wanda Stach", "Vanda Stach"] });
  const before = b.log();
  const r = await b.tool("answer_question", { question: q.id, answer: "no, they are different people", outcome: "different", name: "Wanda Stach", other: c.id, by: "ann-lee" });
  assert.ok(!r.isError, r.text);
  assert.match(r.text, /^answered m_[0-9a-f]+ in Our company: the question is closed by m_[0-9a-f]+\. "Wanda Stach" and "Vanda Stach" are kept separate and will not be suggested as one again\. Recorded/);
  const made = lib.readMemories(b.root, "company").at(-1);
  assert.equal(made.retracts, q.id); assert.equal(made.content, "no, they are different people"); assert.deepEqual(made.people, ["Wanda Stach", "Vanda Stach"]);
  assert.deepEqual(b.names().find(e => e.id === a.id).not, ["Vanda Stach"]);
  assert.equal(lib.resolveEntity(b.names(), a.id).id, a.id, "still two entities");
  assert.deepEqual(lib.suggestMerges(b.names().filter(e => [a.id, c.id].includes(e.id))), [], "never suggested as one again");
  assert.deepEqual(b.open(), []);
  grew(before, b.log(), 1);
  // and a merge of the two later is the one case that asks
  const p = await b.json("merge_entities", { source: a.id, target: c.id, confirmed: true, by: "ann-lee" }); assert.deepEqual(p.unresolved, ["allow_distinct"]);
});

test("answer_question: different, and the name is new: it becomes its own entity of the other's kind, kept apart", async () => {
  const b = brain();
  const known = lib.addName(b.root, "Nestle", { kind: "organization", subtype: "company" });
  const q = b.ask('Is "Nestle Poland" the same company as Nestle?');
  const r = await b.tool("answer_question", { question: q.id, answer: "different, Poland is its own legal entity", outcome: "different", name: "Nestle Poland", other: "Nestle", by: "ann-lee" });
  assert.ok(!r.isError, r.text); assert.match(r.text, /"Nestle Poland" is now its own company\. "Nestle Poland" and "Nestle" are kept separate/);
  const added = b.names().find(e => e.name === "Nestle Poland");
  assert.equal(added.kind, "organization"); assert.equal(added.subtype, "company"); assert.deepEqual(added.not, ["Nestle"]);
  assert.equal(b.names().find(e => e.id === known.id).aliases.length, 0);
  assert.deepEqual(b.open(), []);
});

test("answer_question: same, two entities: merged in the same call, one note, no separate merge call", async () => {
  const b = brain();
  const a = lib.addName(b.root, "Chris", { emails: ["chris@acme.test"] }), c = lib.addName(b.root, "Krzysztof Pawlak");
  b.note({ content: "Chris asked for the renewal terms.", people: ["Chris"] });
  const q = b.ask("Is Chris the same person as Krzysztof Pawlak?", { people: ["Chris", "Krzysztof Pawlak"] });
  const before = b.log();
  const r = await b.tool("answer_question", { question: q.id, answer: "yes, Chris is Krzysztof", outcome: "same", name: "Chris", other: "Krzysztof Pawlak", by: "ann-lee" });
  assert.ok(!r.isError, r.text);
  assert.match(r.text, /Merged "Chris" into "Krzysztof Pawlak": also known as Chris; emails chris@acme\.test; 0 tool records; \d+ notes now count together \(\d+ \+ \d+\)\. Merge recorded as ec_[0-9a-f-]+\. Recorded \(.*\); do not save a note about this or about the merge, and do not ask it again\./);
  assert.equal(lib.resolveEntity(b.names(), a.id).id, c.id);
  const made = lib.readMemories(b.root, "company").at(-1); assert.equal(made.retracts, q.id); assert.deepEqual(made.people, ["Krzysztof Pawlak"]);
  grew(before, b.log(), 1);
});

test("answer_question: same, and the name is not an entity yet: it becomes another name of the known one", async () => {
  const b = brain();
  const known = lib.addName(b.root, "Pierre Aubert");
  const q = b.ask('Is "Pierre Obert" the Pierre Aubert we know?');
  const r = await b.tool("answer_question", { question: q.id, answer: "yes same guy, typo", outcome: "same", name: "Pierre Obert", other: known.id, by: "ann-lee" });
  assert.ok(!r.isError, r.text); assert.match(r.text, /"Pierre Obert" is now another name of "Pierre Aubert"\./);
  assert.deepEqual(b.names().find(e => e.id === known.id).aliases, ["Pierre Obert"]); assert.equal(b.names().filter(e => /Pierre/.test(e.name)).length, 1);
});

test("answer_question: same, but the merge needs a choice: nothing is written, the one question comes back, the second call finishes", async () => {
  const b = brain();
  const a = lib.addName(b.root, "Chris", { references: [{ kind: "hubspot", ref: "contact/7" }] }), c = lib.addName(b.root, "Krzysztof Pawlak", { references: [{ kind: "hubspot", ref: "contact/9" }] });
  const q = b.ask("Is Chris the same person as Krzysztof Pawlak?");
  const before = b.log(), args = { question: q.id, answer: "same person", outcome: "same", name: a.id, other: c.id, by: "ann-lee" };
  const r = await b.tool("answer_question", args);
  assert.ok(!r.isError, r.text);
  assert.match(r.text, /^Not answered yet, nothing written: the merge needs one choice first\.\nBoth have a hubspot record .* Which stays\? 1\. Both 2\. .*\nAsk that one question and wait\. Then answer_question again with the same arguments and resolution \{"references":"combine"\}/);
  assert.equal(b.log(), before); assert.equal(b.open().length, 1); assert.equal(lib.resolveEntity(b.names(), a.id).id, a.id);
  const done = await b.tool("answer_question", { ...args, resolution: { references: "combine" } });
  assert.ok(!done.isError, done.text); assert.match(done.text, /2 tool records/); assert.deepEqual(b.open(), []);
  grew(before, b.log(), 1);
});

test("answer_question: 'Who is Olek?' goes through remember once: the question is closed and the note relinked", async () => {
  const b = brain();
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1" };
  const saved = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", "--content", "Olek from finance signed off on the 10 percent discount.", "--people", "Olek", "--kind", "decision"], { cwd: b.root, env, encoding: "utf8" });
  assert.equal(saved.status, 0, saved.stderr);
  const q = b.open().find(m => m.tags.includes("name-question")); assert.ok(q, saved.stdout);
  const before = b.log();
  const r = await b.tool("answer_question", { question: q.id, answer: "Olek is Aleksander Wrona, our finance lead", people: ["Aleksander Wrona"], by: "ann-lee" });
  assert.ok(!r.isError, r.text);
  assert.match(r.text, new RegExp(`answered ${q.id}: the question is closed\\. Do not ask it again\\.`));
  assert.deepEqual(b.open(), []);
  assert.ok(b.names().some(e => e.name === "Aleksander Wrona"));
  const live = lib.effectiveMemories(lib.readMemories(b.root, "company"));
  assert.ok(live.some(m => /Aleksander Wrona \(Olek\) from finance signed off/.test(m.content) && m.people.includes("Aleksander Wrona")), "the note reads with the full name");
  assert.ok(b.log().startsWith(before), "no earlier line was changed or removed");
});

// The answer must not come back as the same question. A name left out of the registry is held as "looks like ..."
// the next time a note names it, so "different" registers whichever of the two is not an entity yet.
test("answer_question: different, and the new name was passed as other: both are entities, and a later note naming it is not held", async () => {
  const b = brain();
  const known = lib.addName(b.root, "Wanda Stach");
  const q = b.ask("Is Wanda Stach the same person as Vanda Stach?");
  const r = await b.tool("answer_question", { question: q.id, answer: "no, they are different people", outcome: "different", name: "Wanda Stach", other: "Vanda Stach", by: "ann-lee" });
  assert.ok(!r.isError, r.text); assert.match(r.text, /"Vanda Stach" is now its own person\. "Wanda Stach" and "Vanda Stach" are kept separate/);
  const added = b.names().find(e => e.name === "Vanda Stach"); assert.ok(added, "the other name is an entity too"); assert.equal(added.kind, "person");
  assert.deepEqual(added.not, ["Wanda Stach"]); assert.deepEqual(b.names().find(e => e.id === known.id).not, ["Vanda Stach"]);
  assert.deepEqual(lib.readMemories(b.root, "company").at(-1).people, ["Wanda Stach", "Vanda Stach"]);
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1" };
  const later = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", "--content", "Vanda Stach asked for the invoice of 2026-11-02.", "--people", "Vanda Stach"], { cwd: b.root, env, encoding: "utf8" });
  assert.equal(later.status, 0, `the next note about her is saved, not asked about again: ${later.stdout}${later.stderr}`);
  assert.doesNotMatch(later.stdout + later.stderr, /looks like Wanda Stach/);
});

test("answer_question: different, and neither name is an entity yet: both become one, kept apart", async () => {
  const b = brain();
  const q = b.ask("Is Acme Labs the same company as Acme Lab Supplies?");
  const r = await b.tool("answer_question", { question: q.id, answer: "no, two companies", outcome: "different", name: "Acme Labs", other: "Acme Lab Supplies", kind: "organization", subtype: "company", by: "ann-lee" });
  assert.ok(!r.isError, r.text);
  const made = b.names().filter(e => /^Acme Lab/.test(e.name)); assert.equal(made.length, 2);
  for (const e of made) { assert.equal(e.kind, "organization"); assert.equal(e.subtype, "company"); assert.equal(e.not.length, 1); }
  assert.deepEqual(b.open(), []);
});

test("answer_question: different, but the name is another name of the same entity: nothing written, the one next step", async () => {
  const b = brain();
  const known = lib.addName(b.root, "Krzysztof Pawlak", { aliases: ["Chris"] });
  const q = b.ask("Is Chris the same person as Krzysztof Pawlak?");
  const before = b.log(), args = { question: q.id, answer: "no, different people", outcome: "different", name: "Chris", other: "Krzysztof Pawlak", by: "ann-lee" };
  const r = await b.tool("answer_question", args);
  assert.ok(r.isError); assert.equal(b.log(), before);
  assert.match(r.text, new RegExp(`^"Chris" is saved as another name of "Krzysztof Pawlak" \\(${known.id}\\), so there are not two entries to keep apart\\. Nothing written\\. Next: update_entity with entity ${known.id}, by and remove \\{"aliases":\\["Chris"\\]\\}, then answer_question again with the same arguments\\.$`));
  // the step it names works, and the same call then closes the question
  await b.json("update_entity", { entity: known.id, by: "ann-lee", remove: { aliases: ["Chris"] } });
  const done = await b.tool("answer_question", args);
  assert.ok(!done.isError, done.text); assert.equal(b.names().filter(e => ["Chris", "Krzysztof Pawlak"].includes(e.name)).length, 2); assert.deepEqual(b.open(), []);
});

test("answer_question: a question that was reworded is answered through the wording in force, never reported as answered", async () => {
  const b = brain();
  const old = b.ask("Do we renew the venu?"), current = b.ask("Do we renew the venue for 2027?", { supersedes: old.id });
  const before = b.log();
  const r = await b.tool("answer_question", { question: old.id, answer: "yes, renew it", by: "ann-lee" });
  assert.ok(!r.isError, r.text); assert.doesNotMatch(r.text, /already answered/);
  assert.match(r.text, new RegExp(`^answered ${current.id} in Our company`));
  assert.equal(lib.readMemories(b.root, "company").at(-1).retracts, current.id); assert.deepEqual(b.open(), []);
  grew(before, b.log(), 1);
  assert.match((await b.tool("answer_question", { question: old.id, answer: "yes", by: "ann-lee" })).text, /was already answered .*Nothing written/);
  grew(before, b.log(), 1);
});

test("answer_question: a name answer the saving rules hold stays open, and the reply sends the next answer back here", async () => {
  const b = brain();
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1" };
  spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", "--content", "Olek from finance signed off on the 10 percent discount.", "--people", "Olek", "--kind", "decision"], { cwd: b.root, env, encoding: "utf8" });
  const q = b.open().find(m => m.tags.includes("name-question")); assert.ok(q);
  const before = b.log();
  const r = await b.tool("answer_question", { question: q.id, answer: "Olek is Olo", people: ["Olo"], by: "ann-lee" });
  assert.ok(r.isError, r.text); assert.equal(b.log(), before); assert.deepEqual(b.open().map(m => m.id), [q.id]);
  assert.ok(r.text.trimEnd().endsWith(`Not answered yet: ${q.id} is still open and nothing was written. When the person has replied, call answer_question again with question ${q.id} (not remember).`), r.text);
});

test("answer_question refuses what it cannot carry out, and writes nothing", async () => {
  const b = brain();
  const q = b.ask("Do we renew the venue?"), plain = b.note({ content: "Venue contract runs to 2027-03-01." });
  lib.addName(b.root, "Acme", { kind: "organization" }); lib.addName(b.root, "Acme Labs", { kind: "organization", aliases: ["AL"] }); lib.addName(b.root, "Alpha Lima", { aliases: [] });
  const before = b.log(), names = JSON.stringify(b.names().map(e => [e.id, e.aliases, e.not]));
  for (const [args, said] of [
    [{ question: q.id }, /answer is missing/],
    [{ answer: "yes" }, /question is missing/],
    [{ question: "m_000000000000", answer: "yes", by: "ann-lee" }, /no note m_000000000000/],
    [{ question: plain.id, answer: "yes", by: "ann-lee" }, /is a note, not a question/],
    [{ question: q.id, answer: "yes", by: "nobody" }, /by must identify a team member/],
    [{ question: q.id, answer: "yes", by: "ann-lee", outcome: "same" }, /outcome needs name and other/],
    [{ question: q.id, answer: "yes", by: "ann-lee", outcome: "maybe", name: "Acme", other: "Acme Labs" }, /outcome is same or different/],
    [{ question: q.id, answer: "yes", by: "ann-lee", outcome: "different", name: "Acme", other: "acme" }, /the same name/],
    [{ question: q.id, answer: "yes", by: "ann-lee", context: "sales" }, /unknown argument context/],
  ]) {
    const r = await b.tool("answer_question", args);
    assert.ok(r.isError, `${JSON.stringify(args)}: ${r.text}`); assert.match(r.text, said);
    assert.doesNotMatch(r.text, /^\{/, "a line, not a record");
  }
  assert.equal(b.log(), before); assert.equal(JSON.stringify(b.names().map(e => [e.id, e.aliases, e.not])), names); assert.equal(b.open().length, 1);
});

test("no reply of the two tools sends the model to a skill or rule file", async () => {
  const b = brain();
  const a = lib.addName(b.root, "Chris"), c = lib.addName(b.root, "Krzysztof Pawlak");
  const q = b.ask("Do we renew the venue?");
  const replies = [await b.tool("answer_question"), await b.tool("answer_question", { question: q.id, answer: "yes", by: "ann-lee" }), await b.tool("answer_question"),
    await b.tool("merge_entities", { source: a.id, target: c.id, confirmed: true, by: "ann-lee" })];
  for (const r of replies) { assert.ok(!r.isError, r.text); assert.doesNotMatch(r.text, /SKILL\.md|references\/[a-z-]+\.md|rule page|query \(object rules|[–—]/); }
  assert.ok(!existsSync(lib.workDir(b.root)) || !readdirSync(lib.workDir(b.root)).some(f => /^remember-.*\.json$/.test(f)), "no batch file left behind");
});
