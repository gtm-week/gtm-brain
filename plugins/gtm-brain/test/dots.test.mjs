// Connecting the dots (new-brain test, 2026-11-12): six plain sentences, each checked for what the brain
// settles itself (a date with one reading, the one project a known person is in) and what it asks, in one
// question (a date with two readings, a new company's website, several projects). Nothing is guessed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-home-"));   // never the real brains registry
const lib = await import(`${P}/lib/brain.mjs`);
const dots = await import(`${P}/lib/dots.mjs`);

const THU = new Date(2026, 10, 12);   // Thursday 2026-11-12, the day of the test

test("relative dates: one reading is written in, two readings are asked, habits and dated notes are left alone", () => {
  const means = s => dots.relativeDates(s, THU).map(d => [d.word, d.means[0], d.ask]);
  assert.deepEqual(means("Ola will send the deck on Friday."), [["Friday", "Fri 2026-11-13", false]]);
  assert.deepEqual(means("The speaker dinner moved to Thursday."), [["Thursday", "Thu 2026-11-12", true]]);   // today, or a week from today
  assert.deepEqual(dots.relativeDates("The speaker dinner moved to Thursday.", THU)[0].means, ["Thu 2026-11-12", "Thu 2026-11-19"]);   // never last week's
  assert.deepEqual(means("Max will run the demo next Tuesday."), [["next Tuesday", "Tue 2026-11-17", false]]);
  assert.deepEqual(means("Call me next Friday."), [["next Friday", "Fri 2026-11-13", true]]);   // tomorrow, or the week after
  assert.deepEqual(means("We met last Monday and agree tomorrow."), [["last Monday", "Mon 2026-11-09", false], ["tomorrow", "Fri 2026-11-13", false]]);
  assert.deepEqual(means("Ship it next week."), [["next week", "the week of Mon 2026-11-16", false]]);
  assert.deepEqual(means("The team meets on Mondays and every Friday."), []);
  assert.deepEqual(means("Ola will send the deck on Friday (13 November 2026)."), []);
  assert.deepEqual(means("Due Friday 2026-11-13."), []);
});

test("remember: a bare date is held with what it means; a known speaker's note lands in their project; a new company is asked for its website", () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-dots-")); execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@b.c>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NOW: "2026-11-12T09:00:00" };
  const remember = (...a) => spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", ...a], { cwd: root, env, encoding: "utf8" });
  const event = mkdtempSync(join(tmpdir(), "gtm-brain-dots-event-"));
  execFileSync(process.execPath, [`${P}/skills/gtm-brain-project/project.mjs`, ".", "--link", event, "--slug", "berlin-event-2026", "--title", "Berlin event"], { cwd: root, env });
  execFileSync(process.execPath, [`${P}/skills/gtm-brain-project/project.mjs`, ".", "--link", mkdtempSync(join(tmpdir(), "gtm-brain-dots-web-")), "--slug", "website", "--title", "Website"], { cwd: root, env });
  assert.equal(remember("--content", "Florian Weber is our keynote speaker.", "--people", "Florian Weber", "--project", "berlin-event-2026").status, 0);

  // "Thursday" said on a Thursday: two readings, so held and asked; nothing written
  const dinner = remember("--content", "The speaker dinner moved to Thursday.");
  assert.equal(dinner.status, 2);
  assert.match(dinner.stderr, /"Thursday" can be Thu 2026-11-12 or Thu 2026-11-19: ask which/);
  assert.match(dinner.stderr, /Ask the person once, everything in one question, as plain chat text with numbered parts, then end the turn/);
  // the person turned Codex's question box on: the question goes there (new-brain rerun: plain text although it was on)
  writeFileSync(join(process.env.CODEX_HOME, "config.toml"), "[features]\ndefault_mode_request_user_input = true\n");
  assert.match(remember("--content", "The speaker dinner moved to Thursday.").stderr, /in Codex's question box \(request_user_input\)/);
  writeFileSync(join(process.env.CODEX_HOME, "config.toml"), "");
  // "Friday": one reading, so no question, the model writes it in and sends again
  const deck = remember("--content", "Ola Nowak will send the deck on Friday.", "--people", "Ola Nowak");
  assert.equal(deck.status, 2);
  assert.match(deck.stderr, /"Friday" is Fri 2026-11-13 \(or Fri 2026-11-06 if it already happened; take it from the person's words/);
  assert.match(deck.stderr, /No question needed: write the dates into the note/);
  assert.equal(remember("--content", "Ola Nowak will send the deck on Friday (2026-11-13).", "--people", "Ola Nowak").status, 0);
  // from an email: counted from the email's date, not today
  assert.match(remember("--content", "Acme will sign next week.", "--source", "gmail:msg-1").stderr, /counted from the source's own date/);

  // "Florian asked for the slides": Florian's notes are all in the Berlin event, so this one is too, said in one line
  const slides = remember("--content", "Florian asked for the slides.", "--people", "Florian");
  assert.equal(slides.status, 0, slides.stderr);
  assert.match(slides.stdout, /took "Florian" as Florian Weber \(rule P2/);
  assert.match(slides.stdout, /tagged project:berlin-event-2026: Florian Weber's notes are all in that project/);
  assert.ok(lib.readMemories(root, "company").at(-1).tags.includes("project:berlin-event-2026"));
  // Codex sends the full name although the person typed "Florian": the brain reads the person's own message
  // in the chat's rollout file and keeps "Florian" taken by P2 (new-brain rerun, 2026-11-12)
  const id = "01a1cf17-1df8-7f92-a5d1-28a9db950b99", d = new Date(), day = join(process.env.CODEX_HOME, "sessions", String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0"));
  mkdirSync(day, { recursive: true });
  writeFileSync(join(day, `rollout-2026-11-12T10-18-48-${id}.jsonl`), [{ type: "session_meta", payload: { cwd: root } }, { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Florian asked for the slides" }] } }].map(x => JSON.stringify(x)).join("\n") + "\n");
  lib.writeSession(root, { session_id: id, cwd: root, host: "codex" });
  const reworded = remember("--content", "Florian Weber asked for the slides.", "--people", "Florian Weber");
  assert.equal(reworded.status, 0, reworded.stderr);
  assert.deepEqual(lib.readMemories(root, "company").at(-1).entity_mentions.map(x => [x.mention, x.rule]), [["Florian", "P2"]]);
  // the model may not answer a held question for the person: "Thursday" sent back as the 19th with no reply
  const say = text => writeFileSync(join(day, `rollout-2026-11-12T10-18-48-${id}.jsonl`), [{ type: "session_meta", payload: { cwd: root } }, { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text }] } }].map(x => JSON.stringify(x)).join("\n") + "\n");
  say("The speaker dinner moved to Thursday.");
  assert.equal(remember("--content", "The speaker dinner moved to Thursday.").status, 2);
  const guessed = remember("--content", "The speaker dinner moved to Thursday 2026-11-19.");
  assert.equal(guessed.status, 2);
  assert.match(guessed.stderr, /the person has not answered the question yet .* never pick the answer yourself/);
  say("the 19th");
  assert.equal(remember("--content", "The speaker dinner moved to Thursday 2026-11-19.").status, 0);
  writeFileSync(join(day, `rollout-2026-11-12T10-18-48-${id}.jsonl`), "");   // no message to read: as sent
  lib.writeSession(root, { session_id: null, cwd: root });
  // in two projects: asked, not tagged
  assert.equal(remember("--content", "Florian Weber reviews the website copy.", "--people", "Florian Weber", "--project", "website").status, 0);
  const both = remember("--content", "Florian Weber sent his bio.", "--people", "Florian Weber");
  assert.match(both.stdout, /which project is "Florian Weber sent his bio\." about: berlin-event-2026 or website, or none\?/);
  assert.ok(!lib.readMemories(root, "company").at(-1).tags.some(t => t.startsWith("project:")));

  // Codex tagged the project's slug without "project:": it is the project all the same
  assert.equal(remember("--content", "Booth plan drafted.", "--tags", "berlin-event-2026,booth").status, 0);
  assert.deepEqual(lib.readMemories(root, "company").at(-1).tags, ["project:berlin-event-2026", "booth"]);
  // a new company: saved as a company under C1, and its website asked in the one question
  const acme = remember("--content", "Acme wants a booth at the Berlin event.", "--companies", "Acme", "--project", "berlin-event-2026");
  assert.equal(acme.status, 0, acme.stderr);
  assert.match(acme.stdout, /Ask the person once, as plain chat text with numbered parts, then end the turn, after quoting the note, one numbered part each: 1\) Acme's website, so the brain knows which Acme this is/);
  assert.deepEqual(lib.readMemories(root, "company").at(-1).entity_mentions.map(x => [x.mention, x.rule]), [["Acme", "C1"]]);
  // Codex adds the company first and saves the note second (new-brain rerun, 2026-11-12): still asked, once
  lib.addName(root, "Initech", { kind: "company" });
  assert.match(remember("--content", "Initech wants a booth.", "--companies", "Initech").stdout, /1\) Initech's website/);
  assert.doesNotMatch(remember("--content", "Initech confirmed the booth.", "--companies", "Initech").stdout, /website/);   // asked already
  assert.doesNotMatch(remember("--content", "X hired two people.", "--companies", "X").stdout, /website/);   // our own company
  // known with a website: never asked again
  lib.addName(root, "Globex", { kind: "company", references: [{ kind: "website", ref: "https://globex.com" }] });
  assert.doesNotMatch(remember("--content", "Globex renewed.", "--companies", "Globex").stdout, /website/);
});

test("the chat start tells Codex to look for a named file before asking, and to ask once", async () => {
  const where = await import(`${P}/lib/where.mjs`);
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-dots-where-")); execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@b.c>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  mkdirSync(join(root, "projects", "berlin-event-2026"), { recursive: true }); writeFileSync(join(root, "projects", "berlin-event-2026", "README.md"), "The Berlin event\n");
  assert.match(where.whereLine(root), /names a file you do not have \("use the new flyer"\), look in the project's folder first, then ask once/);
});

test("after saving, remember hands Codex facts to judge: the open question it may answer and what the brain last said", () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-dots-facts-")); execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@b.c>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NOW: "2026-11-12T09:00:00" };
  const remember = (...a) => spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", ...a], { cwd: root, env, encoding: "utf8" });
  assert.equal(remember("--content", "We still need to decide the Berlin ticket price.", "--kind", "question").status, 0);
  const q = lib.readMemories(root, "company").at(-1);
  // row 7 of the new-brain test: the answer comes back with the question it closes
  const price = remember("--content", "Berlin tickets will be 99 EUR.");
  assert.equal(price.status, 0, price.stderr);
  assert.match(price.stdout, new RegExp(`open questions this note may answer: "We still need to decide the Berlin ticket price\\." \\(${q.id}, in company\\)\\. If it answers one, remember the answer`));
  assert.doesNotMatch(remember("--content", "Coffee machine is fixed.").stdout, /open questions/);   // nothing in common: nothing said

  // what the brain last said about a person, so Codex can say what changed
  assert.equal(remember("--content", "Florian Weber will send the slides by Friday 2026-11-13.", "--people", "Florian Weber", "--new", "Florian Weber").status, 0);
  const moved = remember("--content", "Florian Weber moved the slides to Monday 2026-11-16.", "--people", "Florian Weber");
  assert.match(moved.stdout, /the brain last said about Florian Weber: "Florian Weber will send the slides by Friday 2026-11-13\." \(2026-11-1\d\)\. If this note changes one of these, say what changed in one line/);
});

test("meetings around now with the people in a note are listed; far ones are not", () => {
  const meetings = [
    { id: "m1", title: "Berlin speaker call", scheduled_at: "2026-11-19T10:00:00Z", entities: ["e_1"] },
    { id: "m2", title: "Old kickoff", occurred_at: "2026-08-01T10:00:00Z", entities: ["e_1"] },
    { id: "m3", title: "Someone else", scheduled_at: "2026-11-13T10:00:00Z", entities: ["e_2"] },
  ];
  assert.deepEqual(dots.nearbyMeetings(meetings, ["e_1"], THU).map(m => m.id), ["m1"]);
});

