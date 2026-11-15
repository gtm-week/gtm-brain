// Who is Max, and why (Artur, 2026-11-11): a first name alone is never a new person (P3), a first name
// one known person has is taken as that one (P2), and every judgment is kept on the note as
// entity_mentions, so the person's page says which rule matched each spelling, when, and from where.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-home-"));   // never the real brains registry
const lib = await import(`${P}/lib/brain.mjs`);

test("a bare first name is saved as written and asked about; a full name is kept with where it came from; who is Max names the rule", () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-names-")); execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@b.c>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1" };
  const remember = (...a) => spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", ...a], { cwd: root, env, encoding: "utf8" });

  // P3: nobody is called Max yet; the note is saved with the name as written, nobody is made a person,
  // and the reply asks for the full name once (0.35.0: save, then ask; save-then-ask.test.mjs has the answer)
  const held = remember("--content", "Max will run the GTM-OS demo.", "--people", "Max");
  assert.equal(held.status, 0, held.stderr);
  assert.match(held.stdout, /"Max" is one word and nobody known has it \(rule P3\)/);
  assert.match(held.stdout, /^Who is Max\? Full name or company\.$/m);
  assert.ok(!lib.readNames(root).some(e => e.name === "Max"));
  const asked = lib.readMemories(root, "company").find(m => /Max will run/.test(m.content));
  assert.deepEqual(asked.people, []);

  // a company named in one word is not held when the note says it is a company
  const acme = remember("--content", "Acme signed.", "--companies", "Acme");
  assert.equal(acme.status, 0, acme.stderr);

  // the full name lands as a new person, with the source and project on the note
  const kept = remember("--content", "Max Kowalski will run the GTM-OS demo.", "--people", "Max Kowalski", "--source", "gmail:msg-1", "--tags", "project:gtm-os");
  assert.equal(kept.status, 0, kept.stderr);
  // P2: later, "Max" alone is the one known Max, and the note keeps that it was inferred
  const later = remember("--content", "Max moved the demo to Friday 2026-11-13.", "--people", "Max");
  assert.equal(later.status, 0, later.stderr);
  assert.match(later.stdout, /took "Max" as Max Kowalski \(rule P2/);
  const max = lib.readNames(root).find(e => e.name === "Max Kowalski");
  const notes = lib.readMemories(root, "company").filter(m => m.entity_mentions && m.kind !== "question" && /Max/.test(m.content));
  assert.deepEqual(notes.map(m => m.entity_mentions), [
    [{ mention: "Max Kowalski", entity: max.id, resolution: "new", rule: "P1" }],
    [{ mention: "Max", entity: max.id, resolution: "inferred_first_name", rule: "P2" }],
  ]);

  // who is Max: the page says how each spelling matched, by which rule, from where and in which project
  const brief = execFileSync(process.execPath, [`${P}/scripts/gtm-brain-recall/recall.mjs`, ".", "--person", "Max"], { cwd: root, env, encoding: "utf8" });
  assert.match(brief, /## How this name was matched/);
  assert.match(brief, /First in the brain: \d{4}-\d{2}-\d{2}, by ann-lee, project gtm-os: "Max Kowalski will run the GTM-OS demo\."/);   // "why did you add Max?"
  assert.match(brief, /"Max Kowalski" first saved as Max Kowalski, rule P1:[^\n]*project gtm-os[^\n]*Gmail/);
  assert.match(brief, /"Max" taken as Max Kowalski, rule P2: A first name alone means a known person only when exactly one/);

  // a look-alike is held and Codex decides by P4: a typo is asked "same as X?", a different surname goes in new_names (scenario run: Florian Kim)
  const typo = remember("--content", "Max Kowalsky joined.", "--people", "Max Kowalsky");
  assert.equal(typo.status, 2);
  assert.match(typo.stderr, /"Max Kowalsky" looks like Max Kowalski \(P4\)/);
  assert.match(typo.stderr, /"Max Kowalsky": ask "same as X\?"\. Yes: add_name with aliases \[this spelling\]\. No: resend with new_names\. Ask one question, /);
  // the same first name with a clearly different surname is someone else (P4): saved at once, no new_names and no question
  const weber = remember("--content", "Max Weber joined.", "--people", "Max Weber");
  assert.equal(weber.status, 0, weber.stderr + weber.stdout);
  assert.doesNotMatch(weber.stdout + weber.stderr, /looks like/);
  assert.match(weber.stdout, /new person in entities\/: Max Weber/);
  // a second Max makes "Max" ambiguous again: never guessed; the note is saved and the question names both (0.35.0)
  const two = remember("--content", "Max called.", "--people", "Max");
  assert.equal(two.status, 0, two.stderr);
  assert.match(two.stdout, /^Which Max: Max Kowalski or Max Weber\?$/m);
  assert.deepEqual(lib.readMemories(root, "company").find(m => m.content === "Max called.").people, []);

  // the brain's README explains the same four rules
  assert.match(readFileSync(join(root, "README.md"), "utf8"), /## How we name people[\s\S]*\*\*P3\*\* A first name alone is never saved as a new person/);
});

test("a person kept by one word on the person's word, and notes from before, say so on the page", () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-names-old-")); execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@b.c>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1" };
  // an older brain: Bo was saved before mentions were recorded
  lib.addName(root, "Bo");
  lib.appendMemory(root, "company", { authors: ["ann-lee"], content: "Met Bo in Warsaw.", people: ["Bo"] });
  const brief = execFileSync(process.execPath, [`${P}/scripts/gtm-brain-recall/recall.mjs`, ".", "--person", "Bo"], { cwd: root, env, encoding: "utf8" });
  assert.match(brief, /Known by a first name only \(rule P3\)\. Ask who this is and add the full name/);
  assert.match(brief, /Not recorded: the notes about this entity were saved before/);
  // asked first ("Zed who?"), then the person insists on the one word: saved, and the note says it was their word
  const zedArgs = [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", "--content", "Zed is our designer.", "--people", "Zed", "--new", "Zed"];
  const first = spawnSync(process.execPath, zedArgs, { cwd: root, env, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /^Who is Zed\? Full name or company\.$/m);
  assert.ok(!lib.readNames(root).some(e => e.name === "Zed"));
  const ok = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", "--content", "Zed is our designer.", "--people", "Zed", "--new", "Zed"], { cwd: root, env, encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  const zed = lib.readNames(root).find(e => e.name === "Zed");
  assert.deepEqual(lib.effectiveMemories(lib.readMemories(root, "company")).find(m => m.content === "Zed is our designer.").entity_mentions, [{ mention: "Zed", entity: zed.id, resolution: "confirmed_new", rule: "P3" }]);
  assert.ok(existsSync(join(root, "README.md")));
});

test("a one-word name sent in new_names before anyone asked is not made a person; after the question it is the person's answer", () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-names-")); execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@b.c>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1" };
  const remember = (...a) => spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", ...a], { cwd: root, env, encoding: "utf8" });

  // Codex in new-brain, 2026-11-12: "Max will run the demo next Tuesday (2026-11-17)." went straight in with new_names ["Max"]
  // the note is saved, but Max is not made a person on Codex's word: the question is asked first
  const guess = remember("--content", "Max will run the demo next Tuesday (2026-11-17).", "--people", "Max", "--new", "Max");
  assert.equal(guess.status, 0, guess.stderr);
  assert.match(guess.stdout, /"Max" is one word and nobody known has it \(rule P3\)/);
  assert.ok(!lib.readNames(root).some(e => e.name === "Max"));

  // the person was asked and insists on the one word: the note is sent again, replaces the first, and says P3 confirmed_new
  const insisted = remember("--content", "Max will run the demo next Tuesday (2026-11-17).", "--people", "Max", "--new", "Max");
  assert.equal(insisted.status, 0, insisted.stderr);
  const live = lib.effectiveMemories(lib.readMemories(root, "company"));
  const notes = live.filter(m => m.kind === "note" && /next Tuesday/.test(m.content));
  assert.equal(notes.length, 1, "one note, not two");
  assert.deepEqual(notes[0].entity_mentions.map(x => [x.mention, x.resolution, x.rule]), [["Max", "confirmed_new", "P3"]]);
  assert.ok(!live.some(m => m.kind === "question" && m.tags.includes("brain-question")), "the question is closed");
});
