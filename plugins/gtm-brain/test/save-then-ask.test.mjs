// Save, then ask (0.35.0, lane K): "Anna from finance signed off" is saved with the name as written, the
// question "Who is Anna?" is kept as a pending brain question tied to the note, and the person's answer
// attaches the name through a superseding note, never by editing the old line (capture-decision, live).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-home-"));   // never the real brains registry
const lib = await import(`${P}/lib/brain.mjs`);

const brain = () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-ask-")); execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@b.c>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1" };
  const remember = (...a) => spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", ...a], { cwd: root, env, encoding: "utf8" });
  const all = () => lib.readMemories(root, "company");
  const live = () => lib.effectiveMemories(all());
  const pending = () => live().filter(m => m.kind === "question" && m.tags.includes("brain-question"));
  return { root, remember, all, live, pending };
};
const DECISION = "Castorama gets a 10 percent volume discount if they sign before December 1 (2026-12-01). Anna from finance signed off on it.";

test("a bare first name nobody has: saved as written, no entity, the question kept and asked", () => {
  const b = brain();
  const r = b.remember("--content", DECISION, "--people", "Anna", "--companies", "Castorama", "--kind", "decision");
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout.split("\n");
  const saved = out.findIndex(l => l.startsWith("saved in "));
  assert.ok(saved >= 0, r.stdout);
  assert.equal(out[saved + 1], "Who is Anna? Full name or company.");
  assert.ok(!lib.readNames(b.root).some(e => e.name === "Anna"), "no entity for the one word");
  const note = b.live().find(m => m.kind === "decision" && /Castorama/.test(m.content));
  assert.ok(note, "the decision is saved");
  assert.equal(note.content, DECISION, "the name as written");
  assert.deepEqual(note.people, ["Castorama"]);
  const [q] = b.pending();
  assert.ok(q, "a pending brain question");
  assert.deepEqual(q.tags.slice(0, 4), ["brain-question", "name-question", `about:${note.id}`, "name:Anna"]);
  assert.match(q.content, /^Who is Anna\? Full name or company\. \(about m_[0-9a-f]{12}: "Castorama gets/);
  assert.match(r.stdout, new RegExp(`retracts: ${q.id}, kind decision`));
});

test("the answer links back: a superseding note carries the full name, the old line is untouched, the question closes", () => {
  const b = brain();
  assert.equal(b.remember("--content", DECISION, "--people", "Anna", "--companies", "Castorama").status, 0);
  const before = b.all().map(m => JSON.stringify(m));
  const [q] = b.pending(), note = b.live().find(m => /Castorama/.test(m.content) && m.kind === "note");
  const r = b.remember("--content", "Anna is Anna Kowalska, our finance lead.", "--kind", "decision", "--retracts", q.id, "--people", "Anna Kowalska");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`linked "Anna" in ${note.id} to Anna Kowalska`));
  // append-only: every earlier line is still there byte for byte
  assert.deepEqual(b.all().slice(0, before.length).map(m => JSON.stringify(m)), before);
  assert.equal(b.pending().length, 0, "the question is answered");
  const linked = b.live().find(m => m.supersedes === note.id);
  assert.ok(linked, "a note supersedes the first one");
  assert.equal(linked.content, note.content.replace("Anna from", "Anna Kowalska from"), "the note reads with the full name");
  assert.deepEqual(linked.people, ["Castorama", "Anna Kowalska"]);
  const anna = lib.readNames(b.root).find(e => e.name === "Anna Kowalska");
  assert.ok(anna, "the full name is a person now");
  assert.ok(linked.entities.includes(anna.id));
  assert.deepEqual(linked.entity_mentions.find(x => x.mention === "Anna"), { mention: "Anna", entity: anna.id, resolution: "confirmed_new", rule: "P3" });
  assert.ok(!b.live().some(m => m.id === note.id), "the first note is replaced, not edited");
});

test("a first name several known people have: saved, the candidates named, the pick links it", () => {
  const b = brain();
  lib.addName(b.root, "Anna Kowalska"); lib.addName(b.root, "Anna Nowak");
  const r = b.remember("--content", "Anna approved the budget.", "--people", "Anna");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Which Anna: Anna Kowalska or Anna Nowak\?$/m);
  const note = b.live().find(m => /budget/.test(m.content) && m.kind === "note");
  assert.deepEqual(note.people, []);
  const [q] = b.pending();
  assert.ok(q.tags.includes("pick:Anna"));
  const a = b.remember("--content", "The second one: Anna Nowak.", "--kind", "decision", "--retracts", q.id, "--people", "Anna Nowak");
  assert.equal(a.status, 0, a.stderr);
  const linked = b.live().find(m => m.supersedes === note.id);
  assert.deepEqual(linked.people, ["Anna Nowak"]);
  const nowak = lib.readNames(b.root).find(e => e.name === "Anna Nowak");
  assert.deepEqual(linked.entity_mentions, [{ mention: "Anna", entity: nowak.id, resolution: "confirmed_new", rule: "P2" }]);
  assert.equal(b.pending().length, 0);
});

test("a first name exactly one known person has resolves as before, with no question", () => {
  const b = brain();
  lib.addName(b.root, "Anna Kowalska");
  const r = b.remember("--content", "Anna approved the budget.", "--people", "Anna");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /took "Anna" as Anna Kowalska \(rule P2/);
  assert.doesNotMatch(r.stdout, /Who is Anna|Which Anna/);
  assert.equal(b.pending().length, 0);
  assert.deepEqual(b.live().find(m => /budget/.test(m.content)).people, ["Anna Kowalska"]);
});

test("the note sent again word for word after the answer replaces it, and a hand-made supersede closes the question", () => {
  const b = brain();
  assert.equal(b.remember("--content", "Max will run the demo on 2026-11-20.", "--people", "Max").status, 0);
  const first = b.live().find(m => /demo/.test(m.content) && m.kind === "note");
  // the person insisted on the one word: the same note again with new_names, no duplicate
  const again = b.remember("--content", "Max will run the demo on 2026-11-20.", "--people", "Max", "--new", "Max");
  assert.equal(again.status, 0, again.stderr);
  assert.equal(b.live().filter(m => /demo/.test(m.content) && m.kind === "note").length, 1);
  assert.equal(b.live().find(m => /demo/.test(m.content) && m.kind === "note").supersedes, first.id);
  assert.equal(b.pending().length, 0);
  assert.match(again.stdout, /closed the name question/);
});

test("everything else that held still holds: a look-alike, a relative date, an answer that is still one word", () => {
  const b = brain();
  lib.addName(b.root, "Lena Dumas");
  const alike = b.remember("--content", "Lena Dumos called.", "--people", "Lena Dumos");
  assert.equal(alike.status, 2);
  assert.match(alike.stderr, /looks like Lena Dumas \(P4\)/);
  // a bare name and a relative date in one note: held, one question for both, as before
  const dated = b.remember("--content", "Zed will call next Thursday.", "--people", "Zed");
  assert.equal(dated.status, 2);
  assert.match(dated.stderr, /"Zed" is one word and nobody known has it \(rule P3/);
  assert.equal(b.pending().length, 0);
  // an answer must name someone: a bare word again is held
  assert.equal(b.remember("--content", "Bo signed.", "--people", "Bo").status, 0);
  const [q] = b.pending();
  const vague = b.remember("--content", "It was Bo.", "--kind", "decision", "--retracts", q.id, "--people", "Bo");
  assert.equal(vague.status, 2);
  assert.match(vague.stderr, /"Bo" is one word and nobody known has it/);
  assert.equal(b.pending().length, 1);
});

// review, 2026-11-14: what the first tests left open
test("the same unclear note sent again writes nothing new: one note, the one question still open", () => {
  const b = brain();
  assert.equal(b.remember("--content", "Anna signed off.", "--people", "Anna").status, 0);
  const lines = b.all().length, [q] = b.pending();
  const again = b.remember("--content", "Anna signed off.", "--people", "Anna");
  assert.equal(again.status, 0, again.stderr);
  assert.equal(b.all().length, lines, "no supersede, no closing decision, no second question");
  assert.deepEqual(b.pending().map(m => m.id), [q.id]);
  assert.match(again.stdout, new RegExp(`already recorded .*\\(${q.id}\\)`));
});

test("a correction that does not say who Anna is keeps the question open, now about the new note", () => {
  const b = brain();
  assert.equal(b.remember("--content", "Anna signed off on 10 percent.", "--people", "Anna").status, 0);
  const first = b.live().find(m => /10 percent/.test(m.content) && m.kind === "note");
  const fixed = b.remember("--content", "Anna signed off on 12 percent.", "--supersedes", first.id);
  assert.equal(fixed.status, 0, fixed.stderr);
  const now = b.live().find(m => /12 percent/.test(m.content) && m.kind === "note");
  const open = b.pending();
  assert.equal(open.length, 1, "still one pending question");
  assert.ok(open[0].tags.includes(`about:${now.id}`) && open[0].tags.includes("name:Anna"));
  assert.doesNotMatch(b.all().map(m => m.content).join("\n"), /Answered by/);
  // and the answer links the corrected note
  assert.equal(b.remember("--content", "Anna Kowalska.", "--kind", "decision", "--retracts", open[0].id, "--people", "Anna Kowalska").status, 0);
  assert.deepEqual(b.live().find(m => /12 percent/.test(m.content) && m.kind === "note").people, ["Anna Kowalska"]);
  assert.equal(b.pending().length, 0);
});

test("two unclear names, one answered: that one is linked and the other is still asked", () => {
  const b = brain();
  const r = b.remember("--content", "Anna and Bo signed off.", "--people", "Anna,Bo");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Who is Anna\? Who is Bo\? Full name or company\.$/m);
  const [q] = b.pending();
  const a = b.remember("--content", "Anna is Anna Kowalska.", "--kind", "decision", "--retracts", q.id, "--people", "Anna Kowalska");
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /linked "Anna" in /);
  const linked = b.live().find(m => /signed off/.test(m.content) && m.kind === "note");
  assert.deepEqual(linked.people, ["Anna Kowalska"]);
  const open = b.pending();
  assert.equal(open.length, 1, "Bo is still asked");
  assert.deepEqual(open[0].tags.filter(t => /^(about|name):/.test(t)), [`about:${linked.id}`, "name:Bo"]);
  assert.match(a.stdout, /^Who is Bo\? Full name or company\.$/m);
});

test("an answer that also names someone else attaches only the person asked about", () => {
  const b = brain();
  assert.equal(b.remember("--content", "Anna signed off.", "--people", "Anna").status, 0);
  const [q] = b.pending();
  const a = b.remember("--content", "Anna is Anna Kowalska, she reports to Piotr Nowak.", "--kind", "decision", "--retracts", q.id, "--people", "Anna Kowalska,Piotr Nowak");
  assert.equal(a.status, 0, a.stderr);
  assert.deepEqual(b.live().find(m => m.content === "Anna Kowalska signed off.").people, ["Anna Kowalska"]);
});

test("two notes in one call about the same unknown name: the person is asked once", () => {
  const b = brain();
  const f = join(b.root, "work", "two.json");
  writeFileSync(f, JSON.stringify([{ context: "company", content: "Anna signed off.", people: ["Anna"] }, { context: "company", content: "Anna will call the supplier.", people: ["Anna"] }]));
  const r = b.remember("--batch", f);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(b.pending().length, 2, "each note keeps its own question");
  assert.equal(r.stdout.match(/\d\) Who is Anna\?/g).length, 1, "one numbered part, not two");
});

test("what the feature writes stays readable by the released validator: no new stored values", () => {
  const b = brain();
  assert.equal(b.remember("--content", "Anna signed off.", "--people", "Anna").status, 0);
  const [q] = b.pending();
  assert.equal(b.remember("--content", "Anna Kowalska.", "--kind", "decision", "--retracts", q.id, "--people", "Anna Kowalska").status, 0);
  const released = ["exact", "inferred_first_name", "new", "confirmed_new"];   // lib.MENTION_RESOLUTIONS in 0.34.3; an older teammate's index refuses any other
  for (const m of b.all()) for (const x of m.entity_mentions || []) assert.ok(released.includes(x.resolution), `${m.id}: ${x.resolution}`);
});

test("a meeting note with a one-word participant: saved and asked, and the reply does not promise a relink the brain will not do", () => {
  const b = brain();
  const meeting = { title: "Budget sync", reference: { kind: "granola", account: "work", ref: "note-1" }, evidence: "transcript", occurrence: "happened", basis: "source", observed_at: "2026-11-10T10:00:00Z", occurred_at: "2026-11-10", capture: "complete", participants: [{ name: "Anna", role: "attended" }] };
  const f = join(b.root, "work", "meeting.json");
  writeFileSync(f, JSON.stringify([{ context: "company", content: "Anna said the budget is approved.", meeting, sources: ["granola:note-1"] }]));
  const r = b.remember("--batch", f);
  assert.equal(r.status, 0, r.stderr);
  const note = b.live().find(m => m.meeting);
  const [q] = b.pending();
  assert.ok(q.tags.includes(`about:${note.id}`));
  assert.doesNotMatch(r.stdout, /attaches it to .* by itself/);
  assert.match(r.stdout, new RegExp(`remember ${note.id} again with supersedes: ${note.id}`));
  // the answer closes the question and says the same; the meeting note is not rewritten
  const a = b.remember("--content", "Anna Kowalska.", "--kind", "decision", "--retracts", q.id, "--people", "Anna Kowalska");
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, new RegExp(`${note.id} is not a plain note`));
  assert.ok(b.live().some(m => m.id === note.id));
  assert.equal(b.pending().length, 0);
});
