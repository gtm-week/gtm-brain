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

test("a bare first name is held and asked about; a full name is kept with where it came from; who is Max names the rule", () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-names-")); execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@b.c>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1" };
  const remember = (...a) => spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", ...a], { cwd: root, env, encoding: "utf8" });

  // P3: nobody is called Max yet; nothing is written, and the reply asks for the full name once
  const held = remember("--content", "Max will run the GTM-OS demo.", "--people", "Max");
  assert.equal(held.status, 2);
  assert.match(held.stderr, /"Max" is one word and nobody known has it \(rule P3/);
  assert.match(held.stderr, /ask for the full name/);
  assert.ok(!lib.readNames(root).some(e => e.name === "Max"));
  assert.ok(!lib.readMemories(root, "company").some(m => /Max/.test(m.content)));

  // a company named in one word is not held when the note says it is a company
  const acme = remember("--content", "Acme signed.", "--companies", "Acme");
  assert.equal(acme.status, 0, acme.stderr);

  // the full name lands as a new person, with the source and project on the note
  const kept = remember("--content", "Max Kowalski will run the GTM-OS demo.", "--people", "Max Kowalski", "--source", "gmail:msg-1", "--tags", "project:gtm-os");
  assert.equal(kept.status, 0, kept.stderr);
  // P2: later, "Max" alone is the one known Max, and the note keeps that it was inferred
  const later = remember("--content", "Max moved the demo to Friday.", "--people", "Max");
  assert.equal(later.status, 0, later.stderr);
  assert.match(later.stdout, /took "Max" as Max Kowalski \(rule P2/);
  const max = lib.readNames(root).find(e => e.name === "Max Kowalski");
  const notes = lib.readMemories(root, "company").filter(m => m.entity_mentions && /Max/.test(m.content));
  assert.deepEqual(notes.map(m => m.entity_mentions), [
    [{ mention: "Max Kowalski", entity: max.id, resolution: "new", rule: "P1" }],
    [{ mention: "Max", entity: max.id, resolution: "inferred_first_name", rule: "P2" }],
  ]);

  // who is Max: the page says how each spelling matched, by which rule, from where and in which project
  const brief = execFileSync(process.execPath, [`${P}/scripts/gtm-brain-recall/recall.mjs`, ".", "--person", "Max"], { cwd: root, env, encoding: "utf8" });
  assert.match(brief, /## How this name was matched/);
  assert.match(brief, /"Max Kowalski" first saved as Max Kowalski, rule P1:[^\n]*project gtm-os[^\n]*Gmail/);
  assert.match(brief, /"Max" taken as Max Kowalski, rule P2: A first name alone means a known person only when exactly one/);

  // a second Max makes "Max" ambiguous again: held as "same as X?", never guessed
  const weber = remember("--content", "Max Weber joined.", "--people", "Max Weber");
  assert.equal(weber.status, 2);   // P4: looks like Max Kowalski, so "same as X?" first
  assert.match(weber.stderr, /"Max Weber" may be Max Kowalski/);
  assert.equal(remember("--content", "Max Weber joined.", "--people", "Max Weber", "--new", "Max Weber").status, 0);
  const two = remember("--content", "Max called.", "--people", "Max");
  assert.equal(two.status, 2);
  assert.match(two.stderr, /"Max" may be Max Kowalski or Max Weber/);

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
  assert.equal(spawnSync(process.execPath, zedArgs, { cwd: root, env, encoding: "utf8" }).status, 2);
  const ok = spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", "--content", "Zed is our designer.", "--people", "Zed", "--new", "Zed"], { cwd: root, env, encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  const zed = lib.readNames(root).find(e => e.name === "Zed");
  assert.deepEqual(lib.readMemories(root, "company").at(-1).entity_mentions, [{ mention: "Zed", entity: zed.id, resolution: "confirmed_new", rule: "P3" }]);
  assert.ok(existsSync(join(root, "README.md")));
});

test("a one-word name sent in new_names before anyone asked is still held; after the question it is the person's answer", () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-names-")); execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "X", "--one-liner", "y", "--owner", "Ann Lee <ann@b.c>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1" };
  const remember = (...a) => spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ann-lee", "--context", "company", ...a], { cwd: root, env, encoding: "utf8" });

  // Codex in new-brain, 2026-11-12: "Max will run the demo next Tuesday." went straight in with new_names ["Max"]
  const guess = remember("--content", "Max will run the demo next Tuesday.", "--people", "Max", "--new", "Max");
  assert.equal(guess.status, 2);
  assert.match(guess.stderr, /"Max" is one word and nobody known has it \(rule P3/);
  assert.ok(!lib.readNames(root).some(e => e.name === "Max"));

  // the person was asked and insists on the one word: now it is kept, and the note says P3 confirmed_new
  const insisted = remember("--content", "Max will run the demo next Tuesday.", "--people", "Max", "--new", "Max");
  assert.equal(insisted.status, 0, insisted.stderr);
  const note = lib.readMemories(root, "company").find(m => /next Tuesday/.test(m.content));
  assert.deepEqual(note.entity_mentions.map(x => [x.mention, x.resolution, x.rule]), [["Max", "confirmed_new", "P3"]]);
});
