// Saving that does not misfire (0.35.0 round three, live benchmark on a real brain, 2026-11-14): a restated fact
// is kept once (s08), a changed value corrects the kept note, a note that only says a call happened is refused while
// its outcomes are written one note each (s09, s14), the speaker is never an unclear name (s07), a question held for
// one name does not block an unrelated note (s09), an answer links the person with the full name in the note (s04,
// s05), by is optional, and GTM_BRAIN_NO_COMMIT holds for save.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-home-"));   // never the real brains registry
const lib = await import(`${P}/lib/brain.mjs`);
const checks = await import(`${P}/lib/note-checks.mjs`);
const meetings = await import(`${P}/lib/meetings.mjs`);

const CHAT = "01a1db26-7e7b-7543-911b-d280d361c9cb";
const brain = () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-misfire-")); execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Week", "--one-liner", "events", "--owner", "Artur Wala <artur@week.test>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1" };
  const remember = (...a) => spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", ...(a.includes("--no-by") ? [] : ["--by", "artur-wala"]), ...a.filter(x => x !== "--no-by")], { cwd: root, env, encoding: "utf8" });
  const batch = (entries, ...a) => { const f = join(root, "work", `batch-${Math.random()}.json`); mkdirSync(join(root, "work"), { recursive: true }); writeFileSync(f, JSON.stringify(entries)); return remember("--batch", f, ...a); };
  const all = () => lib.listContexts(root).flatMap(c => c.memories);
  const live = () => lib.listContexts(root).flatMap(c => lib.effectiveMemories(c.memories));
  // the person's own message, as the host's session file holds it
  const say = text => {
    const d = new Date(), day = join(process.env.CODEX_HOME, "sessions", String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0"));
    mkdirSync(day, { recursive: true });
    writeFileSync(join(day, `rollout-2026-11-14T18-00-00-${CHAT}.jsonl`), [{ type: "session_meta", payload: { cwd: root } }, { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text }] } }].map(x => JSON.stringify(x)).join("\n") + "\n");
    lib.writeSession(root, { session_id: CHAT, cwd: root, host: "codex" });
  };
  return { root, remember, batch, all, live, say };
};
const meeting = (title, ref, who, occurred_at = "2026-11-14") => ({ title, reference: { kind: "user", account: "artur-wala", ref }, evidence: "recollection", occurrence: "happened", basis: "user", observed_at: "2026-11-14T17:42:19Z", occurred_at, participants: [{ name: "Artur Wala", role: "attended" }, { name: who, role: "attended" }], capture: "partial" });

test("a restated fact is already kept anywhere in the brain, and nothing is written (s08)", () => {
  const b = brain();
  assert.equal(b.remember("--context", "offer", "--content", "CODEUNI50 gives 50% off. Verified on 9 November 2026 as a calendar-wide coupon with unlimited remaining uses and no start or expiry restriction.", "--source", "luma:coupon-1").status, 0);
  const before = b.all().length, kept = b.live().find(m => /CODEUNI50/.test(m.content));
  // said again in other words, into another context
  const r = b.remember("--context", "company", "--content", "CODEUNI50 takes half off, works across the whole calendar, no expiry and no usage cap.", "--source", "user:artur-wala");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`already kept in Our offer, ${kept.id}`));
  assert.equal(b.all().length, before, "nothing written");
  // the same words again: kept, also nothing written
  assert.match(b.remember("--context", "offer", "--content", kept.content, "--source", "luma:coupon-1").stdout, /already kept/);
  assert.equal(b.all().length, before);
  // a new source for the same fact is new evidence: written
  assert.equal(b.remember("--context", "offer", "--content", kept.content, "--source", "gmail:msg-9").status, 0);
  assert.equal(b.all().length, before + 1);
});

test("a different value of the same fact supersedes the kept note and says so; a note from a source stays beside the new one", () => {
  const b = brain();
  assert.equal(b.remember("--context", "strategy", "--content", "Fabian Struck will do 30 minutes on the opening panel.", "--people", "Fabian Struck").status, 0);
  const old = b.live().find(m => /Fabian/.test(m.content));
  const r = b.remember("--context", "strategy", "--content", "Fabian Struck can only do 15 minutes on the opening panel, not 30.", "--people", "Fabian Struck");
  assert.equal(r.status, 0, r.stderr);
  const now = b.live().find(m => /15 minutes/.test(m.content));
  assert.equal(now.supersedes, old.id, "the correction replaces the kept note");
  assert.match(r.stdout, new RegExp(`this changes ${old.id} in Strategy .*30 minutes is now 15 minutes, so ${now.id} replaces it`));
  assert.ok(!b.live().some(m => m.id === old.id));
  // a kept note from an email is true of its moment: the new value is saved beside it, never over it
  assert.equal(b.remember("--context", "strategy", "--content", "Marta Zawadzka offered Saturday 19 December for the hackathon, 09:00-21:00, PLN 17,470.", "--people", "Marta Zawadzka", "--source", "gmail:msg-2").status, 0);
  const mail = b.live().find(m => /19 December/.test(m.content));
  const moved = b.remember("--context", "strategy", "--content", "Marta Zawadzka offered Saturday 12 December for the hackathon, 09:00-21:00, price still coming.", "--people", "Marta Zawadzka");
  assert.equal(moved.status, 0, moved.stderr);
  assert.match(moved.stdout, new RegExp(`this may change ${mail.id} .*19 December there, 12 December here`));
  assert.ok(b.live().some(m => m.id === mail.id), "the email's note stays");
  assert.ok(b.live().some(m => /12 December/.test(m.content) && !m.supersedes));
  // unrelated notes about the same person are not touched
  assert.equal(b.remember("--context", "strategy", "--content", "Marta Zawadzka will send the floor plan.", "--people", "Marta Zawadzka").status, 0);
  assert.equal(b.live().filter(m => /Marta/.test(m.content)).length, 3);
});

test("a brain dump: notes that only say a call happened are refused with the reason; the outcomes are one note each, linked to one meeting per conversation (s09, s14)", () => {
  const b = brain();
  const start = b.all().length, startLive = b.live().length;
  const dump = "ok brain dump after today's calls: Iveta Kirilova picked the reverse-engineering pipeline topic for her session, so that one's settled. Maksim Pertsev agreed to shoot the opening night for EUR 600, photos only, no reels, and he wants the run sheet by 1 December.";
  b.say(dump);
  const shells = b.batch([
    { context: "strategy", content: "Artur recounted today's session-topic call with Iveta Kirilova on 14 November 2026.", people: ["Iveta Kirilova"], meeting: meeting("Session topic call with Iveta Kirilova", "iveta-1", "Iveta Kirilova") },
    { context: "company", content: "Artur recounted today's opening-night photography call with Maksim Pertsev on 14 November 2026.", people: ["Maksim Pertsev"], meeting: meeting("Opening night photography call with Maksim Pertsev", "maksim-1", "Maksim Pertsev") }]);
  assert.equal(shells.status, 2, shells.stdout);
  assert.match(shells.stderr, /#1 says only that a conversation happened .*not what came of it: write the outcome/);
  assert.match(shells.stderr, /#2 says only that a conversation happened/);
  assert.equal(b.all().length, start, "no empty records");
  // the user source is the author: no refusal for it
  const outcomes = b.batch([
    { context: "strategy", content: "Iveta Kirilova picked the reverse-engineering pipeline topic for her session; settled.", people: ["Iveta Kirilova"], meeting: meeting("Session topic call with Iveta Kirilova", "iveta-1", "Iveta Kirilova") },
    // one statement, several clauses: one note (s14); another outcome of the same call: its own note
    { context: "company", content: "Maksim Pertsev agreed to shoot the opening night for EUR 600, photos only, no reels.", people: ["Maksim Pertsev"], meeting: meeting("Opening night photography call with Maksim Pertsev", "maksim-1", "Maksim Pertsev") },
    { context: "company", content: "Maksim Pertsev wants the run sheet by 1 December 2026.", people: ["Maksim Pertsev"], meeting: meeting("Opening night photography call with Maksim Pertsev", "maksim-1", "Maksim Pertsev") }]);
  assert.equal(outcomes.status, 0, outcomes.stderr);
  assert.match(outcomes.stdout, /kept 3 of 3/);
  const notes = b.live().filter(m => /Iveta|Maksim/.test(m.content));
  assert.equal(notes.length, 3);
  assert.equal(b.live().length, startLive + 3);
  const reg = lib.readNames(b.root), id = n => reg.find(e => e.name === n).id, iveta = notes.find(m => /Iveta/.test(m.content));
  assert.ok(iveta.entities.includes(id("Iveta Kirilova")) && !iveta.entities.includes(id("Maksim Pertsev")), "each note its own people");
  const maksim = notes.filter(m => /Maksim/.test(m.content)).sort((a, b) => a.at.localeCompare(b.at));
  assert.equal(new Set(maksim.map(m => m.meeting_id)).size, 1, "two outcomes of one conversation: one meeting");
  assert.equal(maksim[1].meeting_id, maksim[0].id);
  assert.ok(maksim[0].meeting && !maksim[1].meeting, "the first is the meeting, the second an outcome of it, not a revision");
  const view = meetings.meetingOverview(b.root, { by: "artur-wala" }).meetings?.find(x => x.id === maksim[0].id) ?? meetings.meetingOverview(b.root, { by: "artur-wala" });
  assert.match(JSON.stringify(view), new RegExp(maksim[1].id), "the meeting view lists the second outcome");
  // a meeting note with its outcome in it is not a shell, and one the person told alone ("I met Lena") is kept
  b.say("I met Lena Hoffmann at the Circuit meetup last night");
  assert.equal(b.remember("--context", "company", "--content", "Met Lena Hoffmann at the Circuit meetup on 13 November 2026.", "--people", "Lena Hoffmann").status, 0);
});

test("the speaker's own name is never unclear, and a question held for one name does not block an unrelated note (s07, s09)", () => {
  const b = brain();
  lib.addName(b.root, "Artur Fiedorowicz"); lib.addName(b.root, "Marta Zawadzka"); lib.addName(b.root, "Marta Bielecka");
  b.say("That's outdated. He told me yesterday he wants the Wednesday meetup stage, not Thursday, and he won't lead a roundtable.");
  const r = b.remember("--context", "company", "--content", "Artur reports that Mateusz Sekta wants the Wednesday meetup stage, not Thursday, and won't lead a roundtable (said 13 November 2026).", "--people", "Artur Wala, Mateusz Sekta");
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout + r.stderr, /which Artur/);
  // "Artur" alone, written by the model, is the speaker too
  assert.equal(b.remember("--context", "company", "--content", "Artur booked the venue for 2026-12-12.", "--people", "Artur").status, 0);
  assert.deepEqual(b.live().at(-1).people, ["Artur Wala"]);
  // one Marta asked about; the other notes of the same message are written
  b.say("Marta from Just Join IT offered Saturday 12 December. Iveta Kirilova picked the pipeline topic.");
  const first = b.batch([{ context: "strategy", content: "Marta Zawadzka from Just Join IT offered Saturday 12 December 2026.", people: ["Marta Zawadzka"] }]);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /did not write which Marta/);
  const other = b.batch([{ context: "strategy", content: "Iveta Kirilova picked the reverse-engineering pipeline topic for her session.", people: ["Iveta Kirilova"] }]);
  assert.equal(other.status, 0, other.stderr);
  assert.doesNotMatch(other.stdout, /has not answered/);
  // the held one, sent again before the person answered, still waits (Q3)
  const again = b.batch([{ context: "strategy", content: "Marta Bielecka from Just Join IT offered Saturday 12 December 2026.", people: ["Marta Bielecka"] }]);
  assert.equal(again.status, 2);
  assert.match(again.stderr, /the person has not answered the question yet/);
});

test("the answer to a name question: the person is linked, the note reads with the full name, two records, and a second supersede writes nothing (s04, s05)", () => {
  const b = brain();
  lib.addName(b.root, "Jakub Sadowski"); lib.addName(b.root, "SurferSEO", { kind: "company" });
  b.say("Kuba agreed to run a second SEO and AI search session for the community on 4 December.");
  assert.equal(b.remember("--context", "company", "--content", "Kuba agreed to run a second SEO and AI search session for the community on 4 December.", "--people", "Kuba").status, 0);
  const note = b.live().find(m => /^Kuba agreed/.test(m.content)), q = b.live().find(m => m.kind === "question" && /Kuba/.test(m.content));
  const before = b.all().length;
  b.say("Jakub Sadowski, from SurferSEO.");
  const r = b.remember("--context", "company", "--kind", "decision", "--retracts", q.id, "--content", "Jakub Sadowski, from SurferSEO.", "--people", "Jakub Sadowski", "--companies", "SurferSEO");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`linked "Kuba" in ${note.id} to Jakub Sadowski`));
  assert.equal(b.all().length, before + 2, "the answer and the linked note, nothing more");
  const linked = b.live().find(m => m.supersedes === note.id);
  assert.equal(linked.content, "Jakub Sadowski (Kuba) agreed to run a second SEO and AI search session for the community on 4 December.");
  assert.ok(linked.entities.includes(lib.readNames(b.root).find(e => e.name === "Jakub Sadowski").id));
  assert.equal(b.live().find(m => m.retracts === q.id).content, "Who is Kuba? Jakub Sadowski, from SurferSEO.", "the answer reads on its own");
  // the model supersedes the first note again by hand: already replaced, nothing written
  const twice = b.remember("--context", "company", "--supersedes", note.id, "--content", "Jakub Sadowski, from SurferSEO, agreed to run a second SEO and AI search session on 4 December.", "--people", "Jakub Sadowski");
  assert.equal(twice.status, 0, twice.stderr);
  assert.match(twice.stdout, new RegExp(`${note.id} was already replaced by ${linked.id}`));
  assert.equal(b.all().length, before + 2);
});

test("by is optional: the person in this chat saves; GTM_BRAIN_NO_COMMIT holds for save", () => {
  const b = brain();
  lib.selectPerson(b.root, "artur-wala");
  const r = b.remember("--no-by", "--context", "company", "--content", "Opening night starts at 18:00 on 16 November 2026.");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(b.live().at(-1).authors, ["artur-wala"]);
  const head = () => spawnSync("git", ["-C", b.root, "rev-list", "--count", "--all"], { encoding: "utf8" }).stdout.trim();
  const commits = head();
  process.env.GTM_BRAIN_NO_COMMIT = "1";
  try { const saved = lib.save(b.root, "dry run"); assert.equal(saved.ok, false); assert.match(saved.note, /GTM_BRAIN_NO_COMMIT/); }
  finally { delete process.env.GTM_BRAIN_NO_COMMIT; }
  assert.equal(head(), commits, "nothing committed");
});

test("the tool says when to split and when not, and that no read is needed first", () => {
  const onto = JSON.parse(readFileSync(`${P}/ontology/gtm-brain.ossie.json`, "utf8"));
  const r = onto.custom_extensions.find(e => e.vendor_name === "ALLETHIC").data.actions.find(a => a.tool_name === "remember");
  assert.match(r.description, /one statement about one event or one person is one note/i);
  assert.match(r.description, /split only into separate outcomes/);
  assert.match(r.description, /no reads first/);
  assert.match(r.description, /Never a note that only says a call or meeting happened/);
  assert.ok(!(r.input_schema.required || []).includes("by"), "by is optional");
});

test("the values a note states, by type", () => {
  const v = checks.noteValues("Maksim Pertsev agreed EUR 600 on 12 December, 09:00-21:00, 15 minutes, CODEUNI50 half off, PLN 17,470.");
  assert.deepEqual([...v.get("date")], ["12-12"]);
  assert.deepEqual([...v.get("time")], ["09:00", "21:00"]);
  assert.deepEqual([...v.get("amount")].sort(), ["EUR 600", "PLN 17470"]);
  assert.deepEqual([...v.get("minute")], ["15"]);
  assert.deepEqual([...v.get("code")], ["CODEUNI50"]);
  assert.deepEqual([...v.get("percent")], ["50"]);
});

test("not a restatement: a reversal, another action with the same value, another project, or another panel on the same day", () => {
  const b = brain();
  const keep = (...a) => { const r = b.remember(...a); assert.equal(r.status, 0, r.stderr); return r; };
  // a reversal is news, never "already kept"
  keep("--context", "company", "--content", "Fabian Struck won't send the speaker deck.", "--people", "Fabian Struck");
  const back = keep("--context", "company", "--content", "Fabian Struck will send the speaker deck.", "--people", "Fabian Struck");
  assert.doesNotMatch(back.stdout, /already kept/, "the opposite claim is written");
  // the same amount, another thing done with it
  keep("--context", "company", "--content", "Maksim Pertsev agreed to EUR 600 for opening night photos.", "--people", "Maksim Pertsev");
  const paid = keep("--context", "company", "--content", "Maksim Pertsev invoiced EUR 600 for opening night photos.", "--people", "Maksim Pertsev");
  assert.doesNotMatch(paid.stdout, /already kept/, "an invoice is not the agreement");
  // another panel on the same day is not a correction of the first
  keep("--context", "strategy", "--content", "Iveta Kirilova will do 30 minutes on the opening panel on 12 December 2026.", "--people", "Iveta Kirilova");
  const other = keep("--context", "strategy", "--content", "Iveta Kirilova will do 15 minutes on the closing panel on 12 December 2026.", "--people", "Iveta Kirilova");
  assert.doesNotMatch(other.stdout, /this changes/);
  assert.equal(b.live().filter(m => /Iveta/.test(m.content)).length, 2, "both panels stay");
  // the same words for another project are that project's fact
  lib.writeProjects(b.root, [{ slug: "berlin", path: b.root }, { slug: "warsaw", path: b.root }]);
  keep("--context", "company", "--project", "berlin", "--content", "The kickoff call moved to 3 December 2026.");
  const w = keep("--context", "company", "--project", "warsaw", "--content", "The kickoff call moved to 3 December 2026.");
  assert.doesNotMatch(w.stdout, /already kept/, "another project's kickoff");
  assert.match(keep("--context", "company", "--project", "warsaw", "--content", "The kickoff call moved to 3 December 2026.").stdout, /already kept/, "the same project's, said again");
});
