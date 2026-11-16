// A save carries the events it names (rule E1). A real brain had 23 notes naming events the company ran or
// attended and no event entity (Codex session, 2026-11-16): remember had people, companies and tools, nothing for
// an event. Now `events` links a known event by name or alias, registers a new one once when the save gives its
// date, and otherwise saves the note and says in one line what is missing. Housekeeping names the gap on a brain
// whose notes name events it never registered, and the answer to "what events did we run" lists the events.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-home-"));   // never the real brains registry
const lib = await import(`${P}/lib/brain.mjs`);
const { housekeepingText } = await import(`${P}/lib/housekeeping.mjs`);
const { unregisteredKinds } = await import(`${P}/lib/population.mjs`);
const { answer } = await import(`${P}/lib/memory-search.mjs`);

const brain = () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-events-")); execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Acme", "--one-liner", "events", "--owner", "Ada Example <ada@acme.test>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1" };
  const remember = (...a) => spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ada-example", ...a], { cwd: root, env, encoding: "utf8" });
  const batch = (entries, ...a) => { const f = join(root, "work", `batch-${Math.random()}.json`); mkdirSync(join(root, "work"), { recursive: true }); writeFileSync(f, JSON.stringify(entries)); return remember("--batch", f, ...a); };
  const live = () => lib.listContexts(root).flatMap(c => lib.effectiveMemories(c.memories));
  const events = () => lib.readNames(root).filter(n => n.kind === "event");
  return { root, remember, batch, live, events };
};

test("a save with a new event and its date registers the event and links the note; the next note links to the same one", () => {
  const b = brain();
  const r = b.batch([{ context: "company", content: "We ran Northfold Summit for 140 founders; the venue was full by noon.", events: [{ name: "Northfold Summit", date: "2026-10-08" }], sources: ["user:ada-example"] }]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.deepEqual(b.events().map(e => e.name), ["Northfold Summit"]);
  assert.match(r.stdout, /new event in entities\/: Northfold Summit \(2026-10-08, kept as m_[0-9a-f]{12}\)\. Registered once: later notes name it in events and link to it\./);
  const note = b.live().find(m => /140 founders/.test(m.content));
  assert.ok(note.people.includes("Northfold Summit"), "the note links to the event");
  // the date the call gave is evidence too: the entity's Date field is cited from notes
  const dated = b.live().find(m => m.content === "Northfold Summit: date 2026-10-08.");
  assert.ok(dated && dated.people.includes("Northfold Summit") && dated.tags.includes("event-date"));
  assert.doesNotMatch(r.stdout, /words in this note not linked/);

  const again = b.batch([{ context: "company", content: "Northfold Summit brought 12 qualified leads.", events: ["Northfold Summit"], sources: ["user:ada-example"] }]);
  assert.equal(again.status, 0, again.stderr + again.stdout);
  assert.equal(b.events().length, 1, "no second event");
  assert.doesNotMatch(again.stdout, /new event/);
  assert.ok(b.live().find(m => /12 qualified leads/.test(m.content)).people.includes("Northfold Summit"));
});

test("a date the note's own text says is not written a second time", () => {
  const b = brain();
  const r = b.batch([{ context: "company", content: "We host Acme Founders Dinner on 20 November 2026 for thirty guests.", events: [{ name: "Acme Founders Dinner", date: "2026-11-20" }], sources: ["user:ada-example"] }]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /new event in entities\/: Acme Founders Dinner \(2026-11-20\)\./);
  assert.equal(b.live().filter(m => (m.tags || []).includes("event-date")).length, 0);
});

test("an alias resolves to the event, and an event also sent under people is never a new person", () => {
  const b = brain();
  lib.addName(b.root, "Northfold Summit", { kind: "event", aliases: ["NFS"] });
  const r = b.batch([{ context: "company", content: "NFS moved its keynote to the afternoon slot.", people: ["NFS"], events: ["NFS"], sources: ["user:ada-example"] }]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const reg = lib.readNames(b.root);
  assert.equal(reg.filter(n => n.kind === "event").length, 1);
  assert.ok(!reg.some(n => n.kind === "person" && /nfs|northfold/i.test(n.name)), "no person made of the event");
  assert.ok(b.live().find(m => /keynote/.test(m.content)).people.includes("Northfold Summit"));
});

test("a new event without a date: the note is saved, nothing is registered, and one line says what is missing", () => {
  const b = brain();
  const r = b.batch([{ context: "company", content: "Dana Okafor wants a booth at Harbor Growth Meetup.", people: ["Dana Okafor"], events: ["Harbor Growth Meetup"], sources: ["user:ada-example"] }]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(b.live().some(m => /booth at Harbor Growth Meetup/.test(m.content)), "the note is saved");
  assert.equal(b.events().length, 0);
  const said = r.stdout.split("\n").filter(l => /Harbor Growth Meetup/.test(l) && /not registered/.test(l));
  assert.equal(said.length, 1, r.stdout);
  assert.match(said[0], /event "Harbor Growth Meetup" not registered: its date is missing\. The note is saved/);
  // people named with an event are not its attendees: no relationship is written
  assert.ok(!b.live().some(m => m.relation));
  // a date that is not one is said the same way
  const bad = b.batch([{ context: "company", content: "Harbor Growth Meetup is some time in spring.", events: [{ name: "Harbor Growth Meetup", date: "spring" }], sources: ["user:ada-example"] }]);
  assert.equal(bad.status, 0, bad.stderr + bad.stdout);
  assert.match(bad.stdout, /event "Harbor Growth Meetup" not registered: "spring" is not a date \(YYYY-MM-DD\)/);
  assert.equal(b.events().length, 0);
});

test("a batch: each entry links or registers its own events, and the single-note flags take them too", () => {
  const b = brain();
  const r = b.batch([
    { context: "company", content: "Northfold Summit sold out its 200 seats.", events: [{ name: "Northfold Summit", date: "2026-10-08" }], sources: ["user:ada-example"] },
    { context: "company", content: "Sponsors of Northfold Summit asked for a recap deck.", events: ["Northfold Summit"], sources: ["user:ada-example"] },
    { context: "company", content: "Acme Builders Workshop needs a second trainer.", events: ["Acme Builders Workshop"], sources: ["user:ada-example"] }]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /^kept 3 of 3/);
  assert.deepEqual(b.events().map(e => e.name), ["Northfold Summit"]);
  assert.equal(b.live().filter(m => m.people.includes("Northfold Summit") && !(m.tags || []).includes("event-date")).length, 2);
  assert.match(r.stdout, /#3 event "Acme Builders Workshop" not registered/);
  const one = b.remember("--context", "company", "--content", "Acme Builders Workshop has 18 sign-ups so far.", "--events", "Acme Builders Workshop | 2026-12-03", "--source", "user:ada-example");
  assert.equal(one.status, 0, one.stderr + one.stdout);
  assert.deepEqual(b.events().map(e => e.name).sort(), ["Acme Builders Workshop", "Northfold Summit"]);
});

const NOTES = [
  "We ran Northfold Summit on 8 October 2026 for 140 founders.",
  "Lisbon Growth Meetup had 60 people in the room and four demo slots.",
  "Dana Okafor will speak at Harbor Builders Conference about pricing.",
  "The Acme Founders Dinner (2026-11-20) is capped at thirty guests.",
  "Feedback from Northfold Summit: the afternoon track ran long."];

test("housekeeping names the gap: notes name events and the brain has no event entity; never on a fresh brain", () => {
  const fresh = brain();
  assert.deepEqual(unregisteredKinds(fresh.root), []);
  assert.doesNotMatch(housekeepingText(fresh.root), /registered as an event|no event/i);
  // two notes are too few to say anything
  const small = brain();
  assert.equal(small.batch(NOTES.slice(0, 2).map(content => ({ context: "company", content, sources: ["user:ada-example"] }))).status, 0);
  assert.deepEqual(unregisteredKinds(small.root), []);

  const b = brain();
  const r = b.batch(NOTES.map(content => ({ context: "company", content, people: /Dana/.test(content) ? ["Dana Okafor"] : [], companies: /Dana/.test(content) ? ["Brightwell Labs"] : [], sources: ["user:ada-example"] })));
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const [gap] = unregisteredKinds(b.root);
  assert.equal(gap.kind, "event");
  assert.equal(gap.notes, 5);
  assert.equal(gap.examples.length, 3);
  for (const x of gap.examples) assert.ok(["Northfold Summit", "Lisbon Growth Meetup", "Harbor Builders Conference", "Acme Founders Dinner"].includes(x), x);
  const text = housekeepingText(b.root);
  assert.match(text, /5 notes name events \(Northfold Summit, .+\) and the brain has no event/);
  assert.match(text, /Say: "Register the events our notes name, each with its date\."/);
  assert.doesNotMatch(text.split("\n").find(l => /notes name events/.test(l)), /Dana Okafor|Brightwell Labs/);
  // once an event is registered the item is gone
  lib.addName(b.root, "Northfold Summit", { kind: "event" });
  assert.deepEqual(unregisteredKinds(b.root), []);
  assert.doesNotMatch(housekeepingText(b.root), /notes name events/);
});

test("\"what events did we run?\" answers with the event entities first, in one call", () => {
  const b = brain();
  const r = b.batch([
    { context: "company", content: "We ran Northfold Summit for 140 founders.", events: [{ name: "Northfold Summit", date: "2026-10-08" }], sources: ["user:ada-example"] },
    { context: "company", content: "Lisbon Growth Meetup had 60 people in the room.", events: [{ name: "Lisbon Growth Meetup", date: "2026-09-17" }], sources: ["user:ada-example"] },
    { context: "company", content: "Dana Okafor asked about annual pricing.", people: ["Dana Okafor"], sources: ["user:ada-example"] }]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const question of ["what events did we run?", "what events did we organize?", "which events did we attend"]) {
    const text = answer(b.root, question), lines = text.split("\n");
    const at = lines.findIndex(l => /^Events in the brain \(2\)/.test(l));
    assert.ok(at > 0 && at <= 2, `${question}\n${text}`);
    const end = lines.findIndex((l, i) => i > at && /^Answer from this list/.test(l)), block = lines.slice(at + 1, end);
    const listed = block.filter(l => l.startsWith("- "));
    assert.deepEqual(listed.map(l => l.split(" · ")[0]).sort(), ["- Lisbon Growth Meetup", "- Northfold Summit"]);
    assert.match(listed[0], / · e_[0-9a-z_-]+ · \d+ notes?/i, listed[0]);
    // each event carries its newest notes, so its date and what happened need no second call
    assert.match(block.join("\n"), /Northfold Summit: date 2026-10-08\./);
    assert.match(block.join("\n"), /We ran Northfold Summit for 140 founders\./);
    const firstNote = lines.findIndex(l => /^1\. /.test(l));
    assert.ok(firstNote < 0 || firstNote > end, "the events come before the notes");
    assert.doesNotMatch(block.join("\n"), /Dana Okafor/);
    assert.doesNotMatch(text, /^Not found/);
  }
  // a question about one named event is its card, not the list of all of them; a brain without events has no list
  assert.doesNotMatch(answer(b.root, "how many founders came to Northfold Summit?"), /Events in the brain \(/);
  const none = brain();
  assert.equal(none.batch([{ context: "company", content: "Dana Okafor asked about annual pricing for events.", people: ["Dana Okafor"], sources: ["user:ada-example"] }]).status, 0);
  assert.doesNotMatch(answer(none.root, "what events did we run?"), /Events in the brain/);
});

test("a long list of events stays inside the reply's cap and says how many are left", () => {
  const b = brain();
  const r = b.batch(Array.from({ length: 30 }, (_, i) => ({ context: "company", content: `Northfold Summit ${2000 + i} gathered ${100 + i} founders in the old harbor hall, and the feedback forms praised the afternoon track on pricing most of all.`, events: [{ name: `Northfold Summit ${2000 + i}`, date: `2026-${String(1 + (i % 12)).padStart(2, "0")}-10` }], sources: ["user:ada-example"] })));
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(b.events().length, 30);
  const text = answer(b.root, "what events did we organize?");
  assert.match(text, /^Events in the brain \(30\)/m);
  assert.match(text, /^\d+ more: query object entities with filters\.kind event\.$/m);
  assert.ok(Buffer.byteLength(text) < 12 * 1024, `the reply is ${Buffer.byteLength(text)} bytes`);
});
