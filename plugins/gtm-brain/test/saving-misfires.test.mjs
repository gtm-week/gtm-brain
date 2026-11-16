// Saving that does not misfire (0.35.0 round three, live benchmark on a real brain, 2026-11-14): a restated fact
// is kept once (s08), a changed value corrects the kept note, a note that only says a call happened is refused while
// its outcomes are written one note each (s09, s14), the speaker is never an unclear name (s07), a question held for
// one name does not block an unrelated note (s09), an answer links the person with the full name in the note (s04,
// s05), by is optional, and GTM_BRAIN_NO_COMMIT holds for save.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
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

test("a short outcome is an outcome: declined, agreed or signed is never refused as a call that only happened", () => {
  const b = brain();
  b.say("Calls today: Lena Hoffmann declined the keynote. Oskar Lis agreed. Nina Berg signed the sponsor contract.");
  const r = b.batch([
    { context: "company", content: "Lena Hoffmann declined the keynote.", people: ["Lena Hoffmann"], meeting: meeting("Call with Lena Hoffmann", "lena-1", "Lena Hoffmann") },
    { context: "company", content: "Oskar Lis agreed.", people: ["Oskar Lis"], meeting: meeting("Call with Oskar Lis", "oskar-1", "Oskar Lis") },
    { context: "company", content: "Nina Berg signed.", people: ["Nina Berg"], meeting: meeting("Call with Nina Berg", "nina-1", "Nina Berg") }]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /kept 3 of 3/);
  for (const t of ["Artur recounted today's call with Lena Hoffmann.", "Had a quick call with Lena Hoffmann today.", "Spoke with Lena Hoffmann this morning."])
    assert.ok(checks.statesNoOutcome({ content: t, people: ["Lena Hoffmann"], meeting: { title: "Call with Lena Hoffmann" } }, { speakers: ["Artur Wala"] }), t);
  for (const t of ["Lena Hoffmann declined the keynote.", "Lena Hoffmann agreed.", "Lena Hoffmann cancelled."])
    assert.ok(!checks.statesNoOutcome({ content: t, people: ["Lena Hoffmann"], meeting: { title: "Call with Lena Hoffmann" } }, { speakers: ["Artur Wala"] }), t);
});

test("nobody selected in this checkout: a team of one saves as that person; a larger team is told the handles so the call repeats once", () => {
  const solo = brain();
  execFileSync("git", ["-C", solo.root, "config", "user.email", "someone@users.noreply.github.com"]);   // a fresh clone: no selected person, no matching git email
  rmSync(join(solo.root, "work", "person.json"), { force: true });
  assert.equal(lib.currentPerson(solo.root), null);
  const one = solo.remember("--no-by", "--context", "company", "--content", "Doors open at 17:30 on 16 November 2026.");
  assert.equal(one.status, 0, one.stderr);
  assert.deepEqual(solo.live().at(-1).authors, ["artur-wala"]);

  const root = mkdtempSync(join(tmpdir(), "gtm-brain-misfire-team-")); execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Week", "--one-liner", "events", "--owner", "Artur Wala <artur@week.test>", "--team", "Eva Nowak <eva@week.test>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  execFileSync("git", ["-C", root, "config", "user.email", "someone@users.noreply.github.com"]);
  rmSync(join(root, "work", "person.json"), { force: true });
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1" };
  const run = (...a) => spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", ...a], { cwd: root, env, encoding: "utf8" });
  const before = lib.listContexts(root).flatMap(c => c.memories).length;
  const refused = run("--context", "company", "--content", "Doors open at 17:30 on 16 November 2026.");
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr + refused.stdout, /nothing saved yet.*Call remember again now.*by = the handle of the person speaking, one of: (artur-wala, eva-nowak|eva-nowak, artur-wala)/s);
  assert.equal(lib.listContexts(root).flatMap(c => c.memories).length, before, "the refusal wrote nothing");
  const again = run("--by", "eva-nowak", "--context", "company", "--content", "Doors open at 17:30 on 16 November 2026.");
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(lib.effectiveMemories(lib.listContexts(root).flatMap(c => c.memories)).at(-1).authors, ["eva-nowak"]);
  // that save settled who works in this checkout: the next one needs no by
  assert.equal(lib.currentPerson(root), "eva-nowak");
  const third = run("--context", "company", "--content", "The cloakroom closes at 23:00 on 16 November 2026.");
  assert.equal(third.status, 0, third.stderr);
  assert.deepEqual(lib.effectiveMemories(lib.listContexts(root).flatMap(c => c.memories)).at(-1).authors, ["eva-nowak"]);
  // the chat start says who saves, or that nobody is known yet with the handles
  const lines = r2 => spawnSync(process.execPath, [`${P}/session/start-lines.mjs`, r2, "", `${P}/templates`], { encoding: "utf8", env }).stdout;
  assert.match(lines(root), /saving as: eva-nowak \(a save needs no by\)/);
  rmSync(join(root, "work", "person.json"), { force: true });
  assert.match(lines(root), /saving as: not known in this checkout yet\. On the first save pass by = the handle of the person speaking \((artur-wala, eva-nowak|eva-nowak, artur-wala)\)/);
});

test("said in other words: shown the kept note once, saved when sent again; another source shape and an incomplete relationship do not cost the note", () => {
  const b = brain();
  assert.equal(b.remember("--context", "company", "--content", "Maksim Pertsev agreed to shoot the opening night for EUR 600, photos only.", "--people", "Maksim Pertsev").status, 0);
  const n = b.live().length;
  const again = b.remember("--context", "company", "--content", "Photos of the opening night: Maksim Pertsev does them, EUR 600 is the price we settled.", "--people", "Maksim Pertsev");
  assert.match(again.stdout + again.stderr, /not saved yet: this looks already recorded in .*, m_[0-9a-f]+: "Maksim Pertsev agreed to shoot/);
  assert.equal(b.live().length, n, "nothing written the first time");
  const sure = b.remember("--context", "company", "--content", "Photos of the opening night: Maksim Pertsev does them, EUR 600 is the price we settled.", "--people", "Maksim Pertsev");
  assert.equal(sure.status, 0, sure.stderr + sure.stdout);
  assert.equal(b.live().length, n + 1, "the same content sent again is saved");
  // a new value is news, never held
  const more = b.remember("--context", "company", "--content", "Maksim Pertsev will also shoot the closing night for EUR 400.", "--people", "Maksim Pertsev");
  assert.equal(more.status, 0, more.stderr + more.stdout);
  assert.doesNotMatch(more.stdout, /looks already recorded/);
  // a source object with keys it does not take is read, not refused
  const src = b.batch([{ context: "company", content: "The venue confirmed load-in at 14:00 on 16 November 2026.", sources: [{ kind: "gmail", ref: "msg-77", text: "load-in mail", title: "Re: load-in" }] }]);
  assert.equal(src.status, 0, src.stderr + src.stdout);
  assert.deepEqual(b.live().at(-1).source.filter(s => s.kind === "gmail").map(s => s.ref), ["msg-77"]);
  // a relationship block that is incomplete: the note is saved, the relationship is not, and the line says so
  const rel = b.batch([{ context: "company", content: "Nina Vogel joined Circuit as head of events.", people: ["Nina Vogel"], relation: { type: "works_at" } }]);
  assert.equal(rel.status, 0, rel.stderr + rel.stdout);
  assert.match(rel.stdout, /the note is saved and says it in words; its relationship block was left out/);
  assert.match(b.live().at(-1).content, /Nina Vogel joined Circuit/);
});

test("a reworded fact anchored by a code is shown as already recorded; a note worded as a correction is asked to supersede", () => {
  const b = brain();
  // s08: a code anchors the fact, no person named, other words for the same terms, another context guessed
  assert.equal(b.remember("--context", "offer", "--content", "WEEK50 gives 50% off any ticket, with unlimited uses and no expiry.").status, 0);
  const n = b.live().length;
  const again = b.remember("--content", "WEEK50 takes half off, works on every ticket, never expires and has no usage cap.");
  assert.match(again.stdout + again.stderr, /not saved yet: this looks already recorded in .*: "WEEK50 gives 50% off/);
  assert.equal(b.live().length, n, "no second copy");
  // s06: the new time with the old one beside it, no supersedes
  assert.equal(b.remember("--context", "company", "--content", "The 9x workshop on 17 November 2026 runs 10:00-14:00 in the main hall.").status, 0);
  const m = b.live().find(r => /runs 10:00-14:00/.test(r.content)), before = b.live().length;
  const fix = b.remember("--context", "company", "--content", "The 9x workshop on 17 November 2026 is 13:00-17:00, replacing 10:00-14:00. The agenda is unchanged.");
  assert.match(fix.stdout + fix.stderr, new RegExp(`not saved yet: this reads as a correction of ${m.id} in .*Send it again with supersedes: ${m.id}`));
  assert.equal(b.live().length, before, "nothing written before the model answers");
  const done = b.remember("--context", "company", "--supersedes", m.id, "--content", "The 9x workshop on 17 November 2026 is 13:00-17:00, replacing 10:00-14:00. The agenda is unchanged.");
  assert.equal(done.status, 0, done.stderr + done.stdout);
  assert.ok(!b.live().some(r => r.id === m.id), "the old time is no longer in force");
  // a second event on another day, worded plainly, is not a correction
  const other = b.remember("--context", "company", "--content", "The 9x workshop repeats on 24 November 2026, 10:00-14:00, in the main hall.");
  assert.equal(other.status, 0, other.stderr + other.stdout);
});

test("answering a held identity question saves at once: the names come from the question, not from the reply", () => {
  const b = brain();
  // two people share a first name already, and a question names one of them beside a new full name
  for (const n of ["Wojciech Niemiec", "Wojciech Ozimek"]) { const r = b.batch([{ context: "icp", content: `${n} registered for the Berlin workshop.`, people: [n], new_names: [n] }]); assert.equal(r.status, 0, r.stderr + r.stdout); }
  const q = b.batch([{ context: "icp", kind: "question", content: "Is Wojciech Stach from Shift4 the same person as Wojciech Niemiec?", people: ["Wojciech Niemiec"] }]);
  assert.equal(q.status, 0, q.stderr + q.stdout);
  const question = b.live().find(m => m.kind === "question");
  b.say("no they are different?");
  const before = b.all().length;
  const a = b.batch([{ context: "icp", kind: "decision", retracts: question.id, content: "Wojciech Stach of Shift4 and Wojciech Niemiec are different people.", people: ["Wojciech Stach", "Wojciech Niemiec"], new_names: ["Wojciech Stach"] }]);
  assert.doesNotMatch(a.stdout + a.stderr, /did not write which Wojciech|has not answered the question yet/, a.stdout + a.stderr);
  assert.equal(a.status, 0, a.stderr + a.stdout);
  assert.equal(b.all().length, before + 1, "the answer is saved in one call");
  assert.ok(!b.live().some(m => m.id === question.id), "the question is closed");
  // without a note to answer, a full name picked for a first name the person typed is still asked
  b.say("Wojciech called about the venue");
  const p = b.batch([{ context: "icp", content: "Wojciech Niemiec called about the venue.", people: ["Wojciech Niemiec"] }]);
  assert.match(p.stdout + p.stderr, /did not write which Wojciech/);
});

// One answer settles its question, and what the model got wrong on the way is the model's to repair (manual run in
// the Codex app, 2026-11-15: an answer refused twice, the same question asked again, a third prompt for a company
// listed under people).
test("a refusal the model can fix leaves no hold: the corrected resend in the same turn is saved", () => {
  const b = brain();
  assert.equal(b.batch([{ context: "icp", content: "Borys Nowicki registered for the Berlin workshop.", people: ["Borys Nowicki"] }]).status, 0);
  assert.equal(b.batch([{ context: "icp", kind: "question", content: "Is Borys Brandt the same person as Borys Nowicki?", people: ["Borys Nowicki"] }]).status, 0);
  const question = b.live().find(m => m.kind === "question");
  b.say("no they are different?");
  // the model misspells a name the question spells out: refused, and nothing the person has to answer
  const first = b.batch([{ context: "icp", kind: "decision", retracts: question.id, content: "Borys Brandt and Borys Nowickii are different people.", people: ["Borys Brandt", "Borys Nowickii"] }]);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /"Borys Nowickii" looks like Borys Nowicki \(P4\)/);
  const before = b.all().length;
  const again = b.batch([{ context: "icp", kind: "decision", retracts: question.id, content: "Borys Brandt and Borys Nowicki are different people.", people: ["Borys Brandt", "Borys Nowicki"] }]);
  assert.doesNotMatch(again.stdout + again.stderr, /has not answered the question yet/, again.stdout + again.stderr);
  assert.equal(again.status, 0, again.stderr + again.stdout);
  assert.equal(b.all().length, before + 1, "the answer is saved by the resend");
  assert.ok(!b.live().some(m => m.id === question.id), "the question is closed by the one answer");

  // a one-word name saved as written, with its question kept under this message
  b.say("Bo called about the venue");
  assert.equal(b.batch([{ context: "icp", content: "Bo called about the venue.", people: ["Bo"] }]).status, 0);
  const who = b.live().find(m => m.kind === "question" && /Who is Bo/.test(m.content));
  // the model may not answer that question for the person in the same turn (Q3 stays)
  const guess = b.batch([{ context: "icp", kind: "decision", retracts: who.id, content: "Bo Lindqvist.", people: ["Bo Lindqvist"], new_names: ["Bo Lindqvist"] }]);
  assert.equal(guess.status, 2);
  assert.match(guess.stderr, /the person has not answered the question yet/);
  // the person answers; the model lists a company under people, is refused, and files it as the company: saved
  b.say("Bo Lindqvist, the Globex one");
  const held = b.batch([{ context: "icp", kind: "decision", retracts: who.id, content: "Bo Lindqvist, the Globex one.", people: ["Bo Lindqvist", "Globex"], new_names: ["Bo Lindqvist"] }]);
  assert.equal(held.status, 2);
  assert.match(held.stderr, /"Globex" is one word and nobody known has it \(rule P3\)\. "Globex": a company, product or team goes in companies, no question/);
  const fixed = b.batch([{ context: "icp", kind: "decision", retracts: who.id, content: "Bo Lindqvist, the Globex one.", people: ["Bo Lindqvist"], companies: ["Globex"], new_names: ["Bo Lindqvist"] }]);
  assert.equal(fixed.status, 0, fixed.stderr + fixed.stdout);
  assert.equal(lib.readNames(b.root).find(n => n.name === "Globex")?.kind, "organization");
  // the check itself: a held word filed as a company is the model's repair, the same word as a person is not
  const mark = { words: ["Globex"], texts: [] };
  assert.equal(checks.relatedToHeld({ content: "Bo Lindqvist, the Globex one.", people: ["Bo Lindqvist"], companies: ["Globex"] }, mark), false);
  assert.equal(checks.relatedToHeld({ content: "Bo Lindqvist, the Globex one.", people: ["Bo Lindqvist", "Globex"] }, mark), true);
  assert.equal(checks.relatedToHeld({ content: "Bo Lindqvist, the Globex one.", people: "Bo Lindqvist", new_names: "Globex", companies: "Globex" }, mark), true);
});

test("a company listed under people is the company it is: never a new person, never a question", () => {
  // known as an organization
  const b = brain();
  lib.addName(b.root, "Volt9", { kind: "company" });
  assert.equal(b.batch([{ context: "icp", content: "Borys Nowicki registered for the Berlin workshop.", people: ["Borys Nowicki"] }]).status, 0);
  b.say("Borys Brandt from Volt9 is not Borys Nowicki, they are different people");
  const r = b.batch([{ context: "icp", content: "Borys Brandt of Volt9 and Borys Nowicki are different people.", people: ["Borys Brandt", "Volt9", "Borys Nowicki"] }]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /"Volt9" is a known organization: linked as that, not as a person\./);
  assert.doesNotMatch((r.stdout + r.stderr).split("--- The saving rules")[0], /looks like|Who is Volt9|Ask the person/);
  assert.deepEqual(b.live().at(-1).people, ["Borys Brandt", "Volt9", "Borys Nowicki"]);
  assert.equal(lib.readNames(b.root).find(n => n.name === "Volt9").kind, "organization");
  assert.equal(lib.readNames(b.root).find(n => n.name === "Borys Brandt").kind, "person", "a new full name beside a namesake needs no new_names");
  assert.ok(!b.live().some(m => m.kind === "question"), "no question is kept");

  // unknown, and it reads as a company beside full personal names: the note is saved and no person is made of it
  const c = brain();
  c.say("Borys Brandt from Volt9 is not Borys Nowicki, they are different people");
  const u = c.batch([{ context: "icp", content: "Borys Brandt of Volt9 and Borys Nowicki are different people.", people: ["Borys Brandt", "Volt9", "Borys Nowicki"] }]);
  assert.equal(u.status, 0, u.stderr + u.stdout);
  assert.match(u.stdout, /"Volt9" in people reads as a company: no person created, nothing to ask\./);
  assert.deepEqual(c.live().at(-1).people, ["Borys Brandt", "Borys Nowicki"]);
  assert.ok(!lib.readNames(c.root).some(n => n.name === "Volt9"), "no entity is guessed for it");
  assert.ok(!c.live().some(m => m.kind === "question"), "no question is kept");
  assert.doesNotMatch((u.stdout + u.stderr).split("--- The saving rules")[0], /looks like|Who is Volt9|Ask the person/);
  // also named in companies: the company, as before
  const both = c.batch([{ context: "icp", content: "Ewa Lis of Lumio asked for the agenda.", people: ["Ewa Lis", "Lumio"], companies: ["Lumio"] }]);
  assert.equal(both.status, 0, both.stderr + both.stdout);
  assert.equal(lib.readNames(c.root).find(n => n.name === "Lumio").kind, "organization");
  // a bare first name beside a full name is still a person to ask about
  assert.equal(checks.looksLikeCompany("Anna", "Ewa Lis met Anna at the venue."), false);
  for (const name of ["Volt9", "HubSpot", "IBM", "Acme Labs", "tidio.com"]) assert.equal(checks.looksLikeCompany(name), true, name);
  assert.equal(checks.looksLikeCompany("Lumio", "Jan Dorn joined Lumio as VP Product."), true);
  assert.equal(checks.looksLikeCompany("McDonald"), false);
});

test("P4: a shared first name with a clearly different surname is another person; a letter or two off, or a first name alone, is still asked", () => {
  const known = { name: "Borys Nowicki", aliases: ["Borysek"], kind: "person" };
  assert.equal(lib.otherPerson("Borys Zielony", known), true);
  for (const near of ["Borys Nowickii", "Borys Nowiki", "Borys Nowicki-Brandt", "Anna Nowicki", "Borys", "Borysek Zielony"]) assert.equal(lib.otherPerson(near, known), false, near);
  assert.equal(lib.otherPerson("Lena Dumas", { name: "Lena", aliases: [], kind: "person" }), false, "a first name alone may be her");
  assert.equal(lib.otherPerson("Acme Polska", { name: "Acme Labs", aliases: [], kind: "organization" }), false, "companies are still asked about");
  const b = brain();
  assert.equal(b.batch([{ context: "icp", content: "Borys Nowicki registered for the Berlin workshop.", people: ["Borys Nowicki"] }]).status, 0);
  const r = b.batch([{ context: "icp", content: "Borys Zielony asked for an invoice.", people: ["Borys Zielony"] }]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.doesNotMatch(r.stdout + r.stderr, /looks like/);
  assert.ok(lib.readNames(b.root).some(n => n.name === "Borys Zielony"));
  const typo = b.batch([{ context: "icp", content: "Borys Zielonyy asked for a second invoice.", people: ["Borys Zielonyy"] }]);
  assert.equal(typo.status, 2);
  assert.match(typo.stderr, /"Borys Zielonyy" looks like Borys Zielony \(P4\)/);
});

test("a relationship whose evidence is notes already in the brain is recorded from them; sponsor_of is a known type", () => {
  const b = brain();
  const run = (entries, extra = {}) => { const f = join(b.root, "work", `run-${Math.random()}.json`); writeFileSync(f, JSON.stringify(entries));
    return spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "artur-wala", "--batch", f], { cwd: b.root, env: { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1", ...extra }, encoding: "utf8" }); };
  assert.equal(b.batch([{ context: "company", content: "Voltera signed as gold sponsor of the Berlin event.", companies: ["Voltera"], sources: ["gmail:msg-501"] }]).status, 0);
  assert.equal(b.batch([{ context: "company", content: "Voltera paid the sponsorship invoice for the Berlin event.", companies: ["Voltera"], sources: ["gmail:msg-502"] }]).status, 0);
  const [n1, n2] = b.live().filter(m => /Voltera/.test(m.content)).map(m => m.id);
  const before = b.all().length;
  // a backfill run: the relation rests on the two notes, nothing outside the brain is cited
  const r = run([{ context: "company", content: "Voltera sponsors the Berlin event.", companies: ["Voltera"], relation: { from: "Voltera", type: "sponsor_of", to: "us", basis: "source" }, sources: [`memory:${n1}`, `memory:${n2}`] }], { GTM_BRAIN_RUN: "backfill" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.doesNotMatch(r.stdout, /relationship block was left out/);
  assert.match(r.stdout, new RegExp(`relationship recorded from notes ${n1}, ${n2}: say so in your one line\\.`));
  assert.equal(b.all().length, before + 1, "saved once, with its relation");
  const rec = b.live().at(-1), circuit = lib.readNames(b.root).find(n => n.name === "Voltera");
  assert.deepEqual([rec.relation.from, rec.relation.type, rec.relation.to, rec.relation.status, rec.relation.basis], [circuit.id, "sponsor_of", "us", "current", "source"]);
  // the cited notes stay as sources, and what they rest on is carried over: a released reader sees a sourced relation
  assert.deepEqual(rec.source.filter(s => s.kind === "memory").map(s => s.ref), [n1, n2]);
  assert.deepEqual(rec.source.filter(s => s.kind === "gmail").map(s => s.ref), ["msg-501", "msg-502"]);
  assert.deepEqual(lib.validateRelationEvidence(rec), []);

  // notes that rest on what a person said: the relation rests on that person's word, in a run with nobody in the chat too
  assert.equal(b.batch([{ context: "company", content: "Nina Vogel runs events at Voltera.", people: ["Nina Vogel"], companies: ["Voltera"], sources: ["user:artur-wala"] }]).status, 0);
  const said = b.live().at(-1).id;
  const w = run([{ context: "company", content: "Nina Vogel works at Voltera.", people: ["Nina Vogel"], companies: ["Voltera"], relation: { from: "Nina Vogel", type: "works_at", to: "Voltera" }, sources: [`memory:${said}`] }], { GTM_BRAIN_RUN: "backfill" });
  assert.equal(w.status, 0, w.stderr + w.stdout);
  assert.match(w.stdout, new RegExp(`relationship recorded from notes ${said}`));
  assert.equal(b.live().at(-1).relation.basis, "user");
  // a cited note that does not exist proves nothing: the note is saved, the relationship is not
  const none = run([{ context: "company", content: "Voltera backs the Warsaw event too.", companies: ["Voltera"], relation: { from: "Voltera", type: "sponsor_of", to: "us" }, sources: ["memory:m_000000"] }], { GTM_BRAIN_RUN: "backfill" });
  assert.equal(none.status, 0, none.stderr + none.stdout);
  assert.match(none.stdout, /its relationship block was left out/);
  assert.equal(b.live().at(-1).relation, undefined);
});

// Review of the above: the repairs the model may make by itself stop where the person's answer starts.
test("answering an earlier question never lets the model settle a held name itself", () => {
  const start = () => { const b = brain();
    assert.equal(b.batch([{ context: "icp", content: "Borys Nowicki registered for the Berlin workshop.", people: ["Borys Nowicki"] }]).status, 0);
    assert.equal(b.batch([{ context: "icp", kind: "question", content: "Is Borys Brandt the same person as Borys Nowicki?", people: ["Borys Nowicki"] }]).status, 0);
    return { b, q: b.live().find(m => m.kind === "question") }; };
  // a look-alike is held; the same spelling sent back as a new person is the model answering "same as X?" with no
  { const { b, q } = start(); b.say("no they are different");
    const entry = { context: "icp", kind: "decision", retracts: q.id, content: "Borys Brandt and Borys Nowickii are different people.", people: ["Borys Brandt", "Borys Nowickii"] };
    assert.match(b.batch([entry]).stderr, /"Borys Nowickii" looks like Borys Nowicki \(P4\)/);
    const self = b.batch([{ ...entry, new_names: ["Borys Nowickii"] }]);
    assert.equal(self.status, 2, self.stdout);
    assert.match(self.stderr, /the person has not answered the question yet/);
    assert.ok(!lib.readNames(b.root).some(n => n.name === "Borys Nowickii"), "no person from a spelling nobody confirmed");
    // the repair itself still goes through, also when the model lists the name the question spelled out as new
    const fixed = b.batch([{ ...entry, content: "Borys Brandt and Borys Nowicki are different people.", people: ["Borys Brandt", "Borys Nowicki"], new_names: ["Borys Brandt"] }]);
    assert.equal(fixed.status, 0, fixed.stderr + fixed.stdout); }
  // a one-word name kept as a question under this message is not confirmed through the earlier question's answer
  { const { b, q } = start(); b.say("no they are different, Bo knows both");
    const entry = { context: "icp", kind: "decision", retracts: q.id, content: "Borys Brandt and Borys Nowicki are different people; Bo knows both.", people: ["Borys Brandt", "Borys Nowicki", "Bo"] };
    const first = b.batch([entry]);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Who is Bo\?/);
    const before = b.all().length;
    for (const guess of [{ ...entry, new_names: ["Bo"] }, { ...entry, people: ["Borys Brandt", "Borys Nowicki", "Bo Lindqvist"], new_names: ["Bo Lindqvist"] }]) {
      const self = b.batch([guess]);
      assert.equal(self.status, 2, self.stdout);
      assert.match(self.stderr, /the person has not answered the question yet/);
    }
    assert.equal(b.all().length, before, "nothing written");
    assert.ok(!lib.readNames(b.root).some(n => /^Bo\b/.test(n.name)), "Bo is nobody until the person says who"); }
});

test("filing a held word as a company settles that word only: a date the person was asked about still waits", () => {
  const held = { words: ["Max", "next Tuesday"], texts: ["Max moved the call to next Tuesday."] };
  assert.equal(checks.relatedToHeld({ content: "Max moved the call to 24 November 2026.", companies: ["Max"] }, held), true, "the model picked the date");
  // another entry of the same turn, repaired the same way, is not held up by it
  const two = { words: ["Globex", "Max", "next Tuesday"], texts: ["Bo Lindqvist, the Globex one.", "Max moved the call to next Tuesday."] };
  assert.equal(checks.relatedToHeld({ content: "Bo Lindqvist, the Globex one.", people: ["Bo Lindqvist"], companies: ["Globex"] }, two), false);
  // end to end: said on that very weekday, the day has two readings and is asked about
  const b = brain(), day = new Date().toLocaleDateString("en-GB", { weekday: "long" });
  b.say(`Max moved the call to ${day}`);
  const first = b.batch([{ context: "icp", content: `Max moved the call to ${day}.`, people: ["Max"] }]);
  assert.equal(first.status, 2);
  assert.match(first.stderr, new RegExp(`"${day}" can be `));
  const self = b.batch([{ context: "icp", content: "Max moved the call to 1 December 2026.", companies: ["Max"] }]);
  assert.equal(self.status, 2, self.stdout);
  assert.match(self.stderr, /the person has not answered the question yet/);
  assert.equal(b.live().filter(m => /Max moved/.test(m.content)).length, 0);
  assert.equal(checks.looksLikeCompany("Max", "Anna Nowak works for Max now."), false, "works for Max: as often a person");
});

test("a cited note is evidence only for a relationship it names; customer status is never read from notes", () => {
  const b = brain();
  const run = entries => { const f = join(b.root, "work", `run-${Math.random()}.json`); writeFileSync(f, JSON.stringify(entries));
    return spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "artur-wala", "--batch", f], { cwd: b.root, env: { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_RUN: "backfill" }, encoding: "utf8" }); };
  assert.equal(b.batch([{ context: "company", content: "The venue has 200 seats.", sources: ["user:artur-wala"] }]).status, 0);
  const seats = b.live().at(-1).id;
  assert.equal(b.batch([{ context: "company", content: "Voltera signed as gold sponsor of the Berlin event.", companies: ["Voltera"], sources: ["gmail:msg-501"] }]).status, 0);
  const signed = b.live().at(-1).id;
  // a note about something else: nobody said Lumio is a partner, and no user source is made up for it
  const r = run([{ context: "company", content: "Lumio is a partner of ours.", companies: ["Lumio"], relation: { from: "Lumio", type: "partner_of", to: "us" }, sources: [`memory:${seats}`] }]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /its relationship block was left out/);
  assert.doesNotMatch(r.stdout, /recorded from notes/);
  assert.equal(b.live().at(-1).relation, undefined);
  assert.ok(!b.live().at(-1).source.some(s => s.kind === "user"));
  // both ends must be named: a note about Voltera alone does not say who works there
  const w = run([{ context: "company", content: "Nina Vogel works at Voltera.", people: ["Nina Vogel"], companies: ["Voltera"], relation: { from: "Nina Vogel", type: "works_at", to: "Voltera" }, sources: [`memory:${signed}`] }]);
  assert.equal(w.status, 0, w.stderr + w.stdout);
  assert.equal(b.live().at(-1).relation, undefined);
  // of two cited notes only the one that names the company is the evidence
  const s = run([{ context: "company", content: "Voltera sponsors the Berlin event.", companies: ["Voltera"], relation: { from: "Voltera", type: "sponsor_of", to: "us" }, sources: [`memory:${seats}`, `memory:${signed}`] }]);
  assert.equal(s.status, 0, s.stderr + s.stdout);
  assert.match(s.stdout, new RegExp(`relationship recorded from notes ${signed}: `));
  assert.deepEqual(b.live().at(-1).source.filter(x => x.kind === "gmail").map(x => x.ref), ["msg-501"]);
  // customer status: an outside record or the person's word, as before
  const before = b.all().length;
  const c = run([{ context: "company", content: "Voltera is a customer.", companies: ["Voltera"], customer: { entity: "Voltera", status: "customer", basis: "source", observed_at: "2026-11-14T10:00:00Z" }, sources: [`memory:${signed}`] }]);
  assert.notEqual(c.status, 0);
  assert.match(c.stderr, /customer source evidence needs an external source pointer/);
  assert.equal(b.all().length, before);
});

test("a call the person tells about is saved in one call: names as participants, a date as observed_at, a sentence as source", () => {
  const b = brain();
  // the shape Codex sent in the app (16 Nov): three refusals before, one save now
  const entry = { context: "company", content: "Kasia Nowak, Tidio's new Head of Partnerships, said she wants Tidio to sponsor the Berlin workshop. The budget is around EUR 5,000, and Tidio expects to decide by the end of November 2026.",
    people: ["Kasia Nowak"], companies: ["Tidio"], new_names: ["Kasia Nowak", "Tidio"], sources: ["User's firsthand account of the call with Kasia Nowak on 2026-11-16"],
    meeting: { basis: "user", capture: "partial", evidence: "recollection", observed_at: "2026-11-16", occurred_at: "2026-11-16", occurrence: "happened", participants: ["Kasia Nowak"], reference: { account: "user", kind: "user", ref: "2026-11-16 call with Kasia Nowak from Tidio" }, title: "Call with Kasia Nowak from Tidio" } };
  const r = b.batch([entry]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const rec = b.live().find(m => /Kasia Nowak/.test(m.content));
  assert.ok(rec, "the note is kept");
  assert.deepEqual(rec.meeting.participants, [{ name: "Kasia Nowak", role: "attended" }]);
  assert.match(rec.meeting.observed_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.ok(!rec.source.some(s => /firsthand/.test(s.ref || "")), "a sentence is not kept as a source");
  assert.ok(rec.source.some(s => s.kind === "user"), "the person's word is the source");
  // a planned call from a calendar keeps its names as invited, never attended
  const planned = b.batch([{ context: "company", content: "Planning call with Tidio on 20 November 2026 about the booth.", sources: ["google-calendar:evt-9"], meeting: { basis: "source", capture: "complete", evidence: "calendar", observed_at: "2026-11-16T09:00:00Z", occurred_at: null, scheduled_at: "2026-11-20", occurrence: "planned", participants: ["Kasia Nowak"], reference: { account: "artur@week.test", kind: "google-calendar", ref: "evt-9" }, title: "Tidio booth planning" } }]);
  assert.equal(planned.status, 0, planned.stderr + planned.stdout);
  assert.deepEqual(b.live().find(m => /Planning call with Tidio/.test(m.content)).meeting.participants, [{ name: "Kasia Nowak", role: "invited" }]);
});

test("the person corrects a call they told about: one call, the conversation's record kept", () => {
  const b = brain();
  const meeting = { basis: "user", capture: "partial", evidence: "recollection", observed_at: "2026-11-16", occurred_at: "2026-11-16", occurrence: "happened", participants: ["Kasia Nowak"], reference: { account: "user", kind: "user", ref: "2026-11-16 call with Kasia Nowak" }, title: "Call with Kasia Nowak" };
  assert.equal(b.batch([{ context: "company", content: "Kasia Nowak of Tidio said the sponsorship budget is around EUR 5,000.", people: ["Kasia Nowak"], companies: ["Tidio"], new_names: ["Kasia Nowak", "Tidio"], meeting }]).status, 0);
  const old = b.live().find(m => /5,000/.test(m.content));
  const fix = b.batch([{ context: "company", content: "Kasia Nowak of Tidio said the sponsorship budget is around EUR 8,000.", people: ["Kasia Nowak"], companies: ["Tidio"], sources: ["User's correction of the budget in this chat"], supersedes: old.id }]);
  assert.equal(fix.status, 0, fix.stderr + fix.stdout);
  const now = b.live().filter(m => /Kasia Nowak of Tidio/.test(m.content));
  assert.equal(now.length, 1); assert.match(now[0].content, /8,000/); assert.equal(now[0].meeting.title, "Call with Kasia Nowak");
});

test("a job change saved as two relationships with the context given once beside the batch is kept in that call", async () => {
  const b = brain();
  const { createFilesBackend } = await import(`${P}/server/files-backend.mjs`);
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1" };
  const run = async (cwd, file, args = []) => { const r = spawnSync(process.execPath, [`${P}/scripts/${file}`, ...args], { cwd, env, encoding: "utf8" }); return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() }; };
  const backend = createFilesBackend({ run }), call = args => backend.act("remember", { by: "artur-wala", ...args }, { brain: b.root });
  lib.addName(b.root, "Tomek Zielony"); lib.addName(b.root, "Lumio", { kind: "company" }); lib.addName(b.root, "Brightdesk", { kind: "company" });
  // their earlier notes sit in Our company, so a guess would place a note about them there
  assert.equal(b.remember("--context", "company", "--content", "Tomek Zielony of Lumio will speak at the Berlin workshop.", "--people", "Tomek Zielony", "--companies", "Lumio").status, 0);
  assert.equal(b.remember("--context", "company", "--content", "Tomek Zielony asked for the Lumio logo on the workshop page.", "--people", "Tomek Zielony", "--companies", "Lumio").status, 0);
  // the shape Codex sent headless (16 Nov): the plain note first, then the same turn as two relationships
  const sources = [{ kind: "user", ref: "User message in this chat, 2026-11-16" }];
  const first = await call({ context: "strategy", content: "Tomek Zielony left Lumio on 1 November 2026 and joined Brightdesk as VP Product.", people: ["Tomek Zielony", "Lumio", "Brightdesk"], sources });
  assert.equal(first.outcome, "ok", first.message);
  const note = b.live().find(m => /Tomek Zielony left Lumio/.test(m.content));
  assert.ok(lib.readMemories(b.root, "strategy").some(m => m.id === note.id));
  const second = await call({ context: "strategy", memories: [
    { content: "Tomek Zielony left Lumio on 1 November 2026.", people: ["Tomek Zielony", "Lumio"], supersedes: note.id, relation: { from: "Tomek Zielony", to: "Lumio", type: "works_at", status: "ended", basis: "user", observed_at: "2026-11-01" }, sources },
    { content: "Tomek Zielony joined Brightdesk as VP Product.", people: ["Tomek Zielony", "Brightdesk"], relation: { from: "Tomek Zielony", to: "Brightdesk", type: "works_at", status: "current", basis: "user", observed_at: "2026-11-16" }, sources }] });
  assert.equal(second.outcome, "ok", second.message);
  assert.match(second.result, /kept 2 of 2/);
  const strategy = lib.effectiveMemories(lib.readMemories(b.root, "strategy")).filter(m => /Tomek Zielony/.test(m.content));
  assert.deepEqual(strategy.map(m => m.relation?.status).sort(), ["current", "ended"]);
  assert.ok(!strategy.some(m => m.id === note.id), "the plain note is replaced by the one that ends the old job");
  // an entry's own context still wins over the shared one
  const own = await call({ context: "strategy", memories: [{ context: "company", content: "Brightdesk moved its office to Gdansk in November 2026.", companies: ["Brightdesk"], sources }] });
  assert.equal(own.outcome, "ok", own.message);
  assert.ok(lib.readMemories(b.root, "company").some(m => /Gdansk/.test(m.content)));
});
