// win-recall: a question about a company or a person is answered by reading its page, as Codex reads any Markdown
// file. A benchmark on real Codex (2026-11-17) found one Markdown file read with grep beat the search tool on a
// 176-note history, so the page now carries every note that names the entity, in full, newest first, with a
// corrected note marked; a save refreshes it, and entities/INDEX.md lists every page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-test-home-"));
const lib = await import(`${P}/lib/brain.mjs`);
const { recordedLines } = await import(`${P}/lib/entities.mjs`);

const brain = () => {
  const root = mkdtempSync(join(tmpdir(), "gtm-brain-recall-")); execFileSync("git", ["init", "-q", root]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Acme Retail", "--one-liner", "retail software", "--owner", "Ada Example <ada@acme.test>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1" };
  const batch = entries => { const f = join(root, "work", `batch-${Math.random()}.json`); mkdirSync(join(root, "work"), { recursive: true }); writeFileSync(f, JSON.stringify(entries)); return spawnSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "ada-example", "--batch", f], { cwd: root, env, encoding: "utf8" }); };
  const entity = name => lib.readNames(root).find(n => n.name === name);
  const page = name => readFileSync(join(root, entity(name)._path), "utf8");
  return { root, batch, entity, page };
};

test("an entity page lists every note naming it in full, marks a corrected note, follows each save, and INDEX.md lists it", () => {
  const b = brain();
  const long = "Anna Lind made the intro to the Northfold buying committee on the call; she said the pilot budget is 40k and the decision is due by 2026-12-15, after their board meets.";
  let r = b.batch([
    { context: "company", content: long, people: ["Anna Lind"], companies: ["Northfold"], sources: ["user:ada-example"] },
    { context: "company", content: "Northfold runs 30 stores in the Nordics.", companies: ["Northfold"], sources: ["user:ada-example"] }]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  let text = b.page("Northfold");
  assert.match(text, /## Everything recorded/);
  assert.ok(text.includes(long), "the full note, not an excerpt, with its due date");
  assert.match(text, /Northfold runs 30 stores in the Nordics\./);
  assert.ok(b.page("Anna Lind").includes(long), "the person's page has it too");

  const stores = lib.listContexts(b.root).flatMap(c => c.memories).find(m => /30 stores/.test(m.content));
  r = b.batch([{ context: "company", content: "Northfold runs 45 stores in the Nordics.", companies: ["Northfold"], supersedes: stores.id, sources: ["user:ada-example"] }]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  text = b.page("Northfold");
  const fix = lib.listContexts(b.root).flatMap(c => c.memories).find(m => /45 stores/.test(m.content));
  assert.ok(fix, "the correction was saved");
  assert.match(text, new RegExp(`\\[replaced by ${fix.id} on \\d{4}-\\d\\d-\\d\\d\\] Northfold runs 30 stores`), "the old note is marked and points at its replacement");
  assert.match(text, new RegExp(`Northfold runs 45 stores in the Nordics\\. \\(corrects ${stores.id}\\)`));
  assert.ok(text.indexOf("45 stores") < text.indexOf("30 stores in the Nordics. ·"), "newest first");

  const index = join(b.root, lib.entitiesDir ? lib.entitiesDir(b.root) : "entities", "INDEX.md");
  const indexFile = existsSync(index) ? index : [join(b.root, "entities", "INDEX.md"), join(b.root, "brain", "entities", "INDEX.md")].find(existsSync);
  assert.ok(indexFile, "entities/INDEX.md is written");
  const listed = readFileSync(indexFile, "utf8");
  assert.ok(listed.includes(`- Northfold · organization`) && listed.includes(b.entity("Northfold")._path), listed);
  assert.ok(listed.includes(b.entity("Anna Lind")._path));
  assert.ok(!lib.readNames(b.root).some(n => /INDEX/.test(n._path || "")), "INDEX.md is not read as an entity");
});

test("the list keeps the newest 80 and says how many older notes query lists", () => {
  const notes = Array.from({ length: 85 }, (_, i) => ({ id: `m_${String(i).padStart(12, "0")}`, at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), authors: ["anna-lind"], content: `note ${i}` }));
  const lines = recordedLines(notes);
  assert.equal(lines.length, 81);
  assert.match(lines[0], /note 84 · m_/);
  assert.match(lines.at(-1), /5 older notes are not listed here; query/);
});
