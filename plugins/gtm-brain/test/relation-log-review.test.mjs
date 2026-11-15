// Review of the relationship log (ALL-711): the cases the first tests did not ask about. A note that names the old
// employer and the new one, a past job, a date with an offset, a correction that withdraws the note which ended a
// link, a resend, two teammates renaming on two branches, and what an older install reads.
// Run: node --test plugins/gtm-brain/test/relation-log-review.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const home = mkdtempSync(join(tmpdir(), "gtm-relation-review-home-"));
process.env.CODEX_HOME = home;
process.env.GTM_BRAIN_NO_COMPILE = "1"; process.env.GTM_BRAIN_NO_WATCH = "1"; process.env.GTM_BRAIN_NO_OPEN = "1";
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1" };
const lib = await import(`${P}/lib/brain.mjs`);
const log = await import(`${P}/lib/relation-log.mjs`);
const events = await import(`${P}/lib/entity-events.mjs`);
const { withMemoryIndex } = await import(`${P}/lib/memory-index.mjs`);

const made = [];
test.after(() => { for (const d of [home, ...made]) { try { rmSync(d, { recursive: true, force: true }); } catch {} } });
function brain() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gtm-relation-review-"))); made.push(root);
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Demo Co", "--one-liner", "events", "--owner", "Marta Nowak <marta@demo.co>"], { cwd: root, env, stdio: "ignore" });
  lib.addName(root, "Anna Lee"); lib.addName(root, "Northwind", { kind: "company" }); lib.addName(root, "Acme Labs", { kind: "company" }); lib.addName(root, "Globex", { kind: "company" }); lib.addName(root, "Tom Berg");
  return root;
}
const remember = (root, entries) => {
  const f = join(root, "work", "batch.json"); writeFileSync(f, JSON.stringify(entries));
  try { return execFileSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, root, "--by", "marta", "--batch", f], { env, encoding: "utf8" }); }
  catch (e) { return `${e.stdout}${e.stderr}`; }
};
const all = root => lib.readMemories(root, "company");
const idOf = (root, name) => lib.readNames(root).find(e => e.name === name).id;
const works = (root) => Object.fromEntries(lib.relationOverview(root, { entity: "Anna Lee", type: "works_at" }).relations.map(r => [r.to.name, r.status]));
const anna = (to, content, extra = {}) => ({ context: "company", content, people: ["Anna Lee"], companies: [to], relation: { from: "Anna Lee", type: "works_at", to, ...extra } });

test("the ending words count only where they are about this link: a note naming the old employer and the new one starts the new one", () => {
  const fill = (content, to, from = "Anna Lee") => log.completeRelation({ from, type: "works_at", to }, { content }).relation.status;
  assert.equal(fill("Anna Lee left Northwind and joined Acme Labs.", "Acme Labs"), "current");
  assert.equal(fill("Anna Lee left Northwind and joined Acme Labs.", "Northwind"), "ended");
  assert.equal(fill("Anna Lee joined Acme Labs after she left Northwind.", "Acme Labs"), "current");
  assert.equal(fill("Anna Lee left Northwind for Acme Labs.", "Acme Labs"), "current");
  assert.equal(fill("Anna Lee no longer works for Northwind.", "Northwind"), "ended");
  assert.equal(fill("The pilot ended in May; Anna Lee works at Northwind.", "Northwind"), "current");
  assert.equal(fill("Anna Lee, who left Globex years ago, runs sales at Northwind.", "Northwind"), "current");
  // the other end is not named in the note: the words are about the link
  assert.equal(fill("She left the company in May.", "Northwind"), "ended");
  // to us: the from end is the one named
  assert.equal(log.completeRelation({ from: "Northwind", type: "partner_of", to: "us" }, { content: "Northwind is no longer our partner." }).relation.status, "ended");
  assert.equal(log.completeRelation({ from: "Acme Labs", type: "partner_of", to: "us" }, { content: "Northwind churned; Acme Labs is our partner now." }).relation.status, "current");
  // a past job is not a current one (it would end the real employer)
  for (const text of ["Anna Lee used to work at Globex.", "Anna Lee previously worked at Globex.", "Anna Lee is a former Globex engineer.", "Anna Lee formerly ran sales at Globex.", "Anna Lee resigned from Globex."]) assert.equal(fill(text, "Globex"), "ended", text);
});

test("one note for the move: the new employer is current and the old one ended; a past job ends nobody", () => {
  const root = brain();
  remember(root, [anna("Northwind", "Anna Lee works at Northwind.", { observed_at: "2026-03-01" })]);
  const out = remember(root, [anna("Acme Labs", "Anna Lee left Northwind and joined Acme Labs as COO.")]);
  assert.match(out, /ended Anna Lee works_at Northwind/);
  assert.deepEqual(works(root), { "Acme Labs": "current", Northwind: "ended" });
  const before = all(root).length;
  remember(root, [anna("Globex", "Anna Lee used to work at Globex.")]);
  assert.equal(all(root).length, before + 1, "one note, no ended note beside it");
  assert.deepEqual(works(root), { "Acme Labs": "current", Northwind: "ended", Globex: "ended" });
});

test("the note that ends a link states no start date it does not know", () => {
  const root = brain();
  remember(root, [anna("Northwind", "Anna Lee works at Northwind.", { observed_at: "2026-03-01" })]);
  remember(root, [anna("Acme Labs", "Anna Lee joined Acme Labs as COO.")]);
  const ended = all(root).find(m => m.tags.some(t => t.startsWith("ended-by:")));
  assert.ok(ended);
  assert.doesNotMatch(ended.content, /\bsince\b/, "the observed date is when it was said, not when the job began");
  assert.match(ended.content, /Anna Lee no longer works at Northwind/);
});

test("a date with an offset or a month is taken, not a reason to drop the block", () => {
  const root = brain();
  const out = remember(root, [anna("Northwind", "Anna Lee works at Northwind.", { observed_at: "2026-09-01T10:00:00+02:00" })]);
  assert.doesNotMatch(out, /left out/);
  assert.equal(all(root).find(m => m.relation).relation.observed_at, "2026-09-01T08:00:00.000Z");
  assert.equal(log.completeRelation({ from: "a", type: "works_at", to: "b", observed_at: "2026-09" }).relation.observed_at, "2026-09-01T00:00:00Z");
  assert.equal(log.completeRelation({ from: "a", type: "works_at", to: "b", observed_at: "soon" }).relation.observed_at, "soon", "what is not a date is left for the check to refuse");
});

test("sending the move again writes nothing new", () => {
  const root = brain();
  remember(root, [anna("Northwind", "Anna Lee works at Northwind.", { observed_at: "2026-03-01" })]);
  remember(root, [anna("Acme Labs", "Anna Lee joined Acme Labs as COO.")]);
  const n = all(root).length;
  const again = remember(root, [anna("Acme Labs", "Anna Lee joined Acme Labs as COO.")]);
  assert.match(again, /already (recorded|kept)/);
  assert.equal(all(root).length, n);
});

test("withdrawing the note that ended a link withdraws the end with it; a correction to another employer keeps it", () => {
  const root = brain();
  remember(root, [anna("Northwind", "Anna Lee works at Northwind.", { observed_at: "2026-03-01" })]);
  remember(root, [anna("Acme Labs", "Anna Lee joined Acme Labs as COO.")]);
  const joined = all(root).find(m => m.content.includes("joined"));
  assert.deepEqual(works(root), { "Acme Labs": "current", Northwind: "ended" });
  const out = remember(root, [{ context: "company", content: "Withdrawn: Anna Lee did not join Acme Labs, that was another Anna.", people: ["Anna Lee"], retracts: joined.id }]);
  assert.match(out, /withdrew/);
  assert.deepEqual(works(root), { Northwind: "current" });
  withMemoryIndex(root, index => assert.deepEqual(index.relations({ entity: idOf(root, "Anna Lee") }).map(r => `${r.to} ${r.status}`), [`${idOf(root, "Northwind")} current`]));
  // corrected to another employer: the old one still ended
  const two = brain();
  remember(two, [anna("Northwind", "Anna Lee works at Northwind.", { observed_at: "2026-03-01" })]);
  remember(two, [anna("Acme Labs", "Anna Lee joined Acme Labs as COO.")]);
  const wrong = all(two).find(m => m.content.includes("joined"));
  remember(two, [{ ...anna("Globex", "Anna Lee joined Globex as COO, not Acme Labs."), supersedes: wrong.id }]);
  assert.deepEqual(works(two), { Globex: "current", Northwind: "ended" });
});

test("two teammates renaming on two branches merge without a conflict in the entity log", () => {
  const root = brain();
  assert.ok(lib.MERGE_ATTRIBUTES.includes(`${events.EVENTS_FILE} merge=union`));
  const git = (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.ok(readFileSync(join(root, ".gitattributes"), "utf8").split("\n").includes(`${events.EVENTS_FILE} merge=union`), "setup writes the rule");
  if (git("status", "--porcelain")) { git("add", "-A"); git("-c", "user.name=t", "-c", "user.email=t@t.test", "commit", "-qm", "base"); }
  const base = git("rev-parse", "--abbrev-ref", "HEAD").trim();
  lib.updateEntity(root, { entity: idOf(root, "Northwind"), by: "marta", set: { name: "Northwind Group" } });
  git("checkout", "-q", "-b", "other", "HEAD~1");
  lib.updateEntity(root, { entity: idOf(root, "Globex"), by: "marta", set: { name: "Globex Corp" } });
  git("checkout", "-q", base);
  // other generated files (a kind's index.md) may still need the usual re-render; the log itself must not conflict
  try { git("-c", "user.name=t", "-c", "user.email=t@t.test", "merge", "-q", "--no-edit", "other"); } catch {}
  assert.ok(!git("diff", "--name-only", "--diff-filter=U").split("\n").includes(events.EVENTS_FILE), "no conflict in the entity log");
  const rows = readFileSync(join(root, events.EVENTS_FILE), "utf8").trim().split("\n").map(l => JSON.parse(l));
  assert.deepEqual(rows.map(r => r.to).sort(), ["Globex Corp", "Northwind Group"]);
});

test("the entity log: one event per change, none for a legacy kind spelled the new way, and a kind change from a save is committed", () => {
  assert.deepEqual(events.identityEvents({ id: "e_0000000000000001", name: "Acme", kind: "company" }, { id: "e_0000000000000001", name: "Acme", kind: "organization", subtype: "company" }), []);
  const root = brain();
  lib.updateEntity(root, { entity: idOf(root, "Northwind"), by: "marta", set: { name: "Northwind Group" } });
  assert.equal(events.readEntityEvents(root).filter(e => e.change === "rename").length, 1);
  // Tom Berg was added as a person; a save that lists the name as a company changes the kind
  remember(root, [{ context: "company", content: "Tom Berg is a design studio we met at the fair.", companies: ["Tom Berg"] }]);
  if (events.readEntityEvents(root).some(e => e.change === "kind"))
    assert.equal(execFileSync("git", ["-C", root, "status", "--porcelain", "--", events.EVENTS_FILE], { encoding: "utf8" }), "", "the event is committed with the save");
});

test("the relations tables answer SQL, and a note with the block validates for an older install's shape", () => {
  const root = brain();
  remember(root, [anna("Northwind", "Anna Lee works at Northwind.", { observed_at: "2026-03-01" })]);
  remember(root, [anna("Acme Labs", "Anna Lee joined Acme Labs as COO.")]);
  withMemoryIndex(root, index => {
    const r = index.sql("SELECT type, status, COUNT(*) AS n FROM relations GROUP BY type, status ORDER BY status", {});
    assert.deepEqual(r.rows.map(x => Object.values(x).join(" ")), ["works_at current 1", "works_at ended 1"]);
    assert.equal(index.sql("SELECT COUNT(*) AS n FROM relation_events WHERE event='ended'", {}).rows[0].n, 1);
  });
  // 0.34 refuses a relation block with any key but these six, and a tag it cannot read
  for (const m of all(root).filter(m => m.relation)) {
    assert.deepEqual(Object.keys(m.relation).sort(), ["basis", "from", "observed_at", "status", "to", "type"]);
    for (const t of m.tags) assert.match(t, /^[a-z0-9][a-z0-9:._-]*$/i);
  }
});
