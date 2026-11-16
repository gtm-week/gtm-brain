// The upgrade a 0.34 team runs on release day, in the suite: a brain as 0.34 kept it (flat entity pages, base files
// and RULES.md, SCHEMA.md, brain/admin.md at the root) with notes, a correction, an entity with an alias and a
// filled base document goes to layout 3 through the upgrade with yes answers. Every note line, every entity id and
// alias, the base document's text and what a search returns are the same before and after; the chat start offers
// the upgrade before it and not after; a teammate's yes moves the entity pages only. The rehearsal against the real
// 0.34.5 scripts (a 0.34 teammate's clone, a real 950-note brain) was run by hand for the release; MANUAL.md,
// "Updating to 0.35", carries what it measured.
// Run: node --test plugins/gtm-brain/test/upgrade-from-034.test.mjs
process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as lib from "../lib/brain.mjs";
import { readLayout } from "../lib/layout-version.mjs";
import { diskLayout } from "../lib/layout.mjs";
import { layoutOffer } from "../lib/upgrade-files.mjs";
import { search } from "../lib/memory-search.mjs";
import { makeBrain, actAs, toLayout2, toLayout1, exists } from "./helpers/layouts.mjs";

const STRATEGY = "We win shops with 20 to 200 locations by making returns self-serve. Wedge: the Northwind Traders pilot.";
const NOTES = [
  ["Łukasz Kowalski from Northwind Traders wants a pilot of the returns portal in January 2027.", "Łukasz Kowalski", "Northwind Traders"],
  ["Marta Zawadzka is the head of operations at Northwind Traders and signs the contract.", "Marta Zawadzka", "Northwind Traders"],
  ["Pierre Aubert of Globex asked for a price for 200 seats.", "Pierre Aubert", "Globex"],
  ["Ingrid Solberg at Fjord Retail wants the Shopify integration before signing.", "Ingrid Solberg", "Fjord Retail"],
  ["Stark Logistics asked for a demo of the returns portal.", "", "Stark Logistics"],
];

/* Every note line by id, read from the files themselves, wherever a layout keeps them. */
const noteLines = root => Object.fromEntries(readdirSync(join(root, "brain/contexts"), { recursive: true }).filter(f => String(f).endsWith("memories.jsonl"))
  .flatMap(f => readFileSync(join(root, "brain/contexts", String(f)), "utf8").split("\n").filter(Boolean)).map(line => [JSON.parse(line).id, line]));
/* Every entity by id: name, kind and aliases, as the lib reads them in this layout. */
const identities = root => Object.fromEntries(lib.readNames(root).map(e => [e.id, { name: e.name, kind: e.kind, aliases: [...(e.aliases || [])].sort() }]).sort());
/* What a search returns: the note ids, in order. */
const hits = (root, text) => (search(root, text).match(/\bm_[0-9a-f]{12}\b/g) || []);
const QUESTIONS = ["Lukasz", "What do we know about Marta Zawadzka?", "how many seats did Pierre ask for", "Stark", "Shopify integration"];

/* A brain as 0.34 left it, with a team's work in it. Returns what must survive the upgrade. */
function brain034(t) {
  const b = makeBrain(t, { prefix: "gtm-from-034-" });
  const remember = (...a) => b.run("scripts/gtm-brain-remember/remember.mjs", ["--by", "ann-lee", "--context", "company", ...a]);
  for (const [content, people, companies] of NOTES) {
    const r = remember("--content", content, ...(people ? ["--people", people] : []), "--companies", companies);
    assert.equal(r.status, 0, r.stderr || r.stdout);
  }
  const old = lib.readMemories(b.root, "company").find(m => /200 seats/.test(m.content));
  const fix = remember("--content", "Pierre Aubert of Globex asked for a price for 250 seats, not 200.", "--people", "Pierre Aubert", "--companies", "Globex", "--supersedes", old.id);
  assert.equal(fix.status, 0, fix.stderr || fix.stdout);
  const alias = b.run("scripts/gtm-brain-entities/entities.mjs", ["--add", "Stark Logistics", "--alias", "Stark, SL", "--kind", "organization", "--subtype", "company"]);
  assert.equal(alias.status, 0, alias.stderr || alias.stdout);
  const doc = b.run("scripts/gtm-brain-documents/document.mjs", ["--update", "strategy", "--body", STRATEGY, "--by", "ann-lee"]);
  assert.equal(doc.status, 0, doc.stderr || doc.stdout);
  toLayout2(b.root, b.git); toLayout1(b.root, b.git);
  assert.equal(diskLayout(b.root), 1); assert.ok(exists(b.root, "brain/admin.md")); assert.ok(exists(b.root, "strategy.md"));
  const stark = lib.readNames(b.root).find(e => e.name === "Stark Logistics");
  assert.deepEqual([...stark.aliases].sort(), ["SL", "Stark"]);
  return { ...b, corrected: old.id, before: { notes: noteLines(b.root), identities: identities(b.root), strategy: readFileSync(join(b.root, "strategy.md"), "utf8"), hits: Object.fromEntries(QUESTIONS.map(q => [q, hits(b.root, q)])) } };
}

test("a 0.34 brain goes to layout 3 on the owner's yes: every note, id, alias, document and search result is the same", t => {
  const { root, git, upgrade, before, corrected } = brain034(t);
  assert.ok(Object.keys(before.notes).length >= NOTES.length + 1);
  assert.ok(before.hits.Lukasz.length >= 1, "a name typed without its accent finds the note");
  assert.ok(before.hits.Stark.length >= 1, "an alias finds the note");
  assert.ok(before.hits["how many seats did Pierre ask for"].length && before.hits["how many seats did Pierre ask for"][0] !== corrected, "the correction answers, not the note it replaced");

  // the chat start says the brain needs an upgrade, that Codex offers it and asks first, and which tool does it
  const offer = layoutOffer(root);
  assert.match(offer, /^GTM Brain: this brain needs an upgrade\./);
  assert.match(offer, /entity pages into a folder per kind, and the base documents into about-us\//);
  assert.match(offer, /Nothing has moved/);
  assert.match(offer, /never start it unasked/);
  assert.match(offer, /upgrade_brain[^\n]*only on their yes call upgrade_brain again with confirm: true/);

  // the question: one for both moves, in words a person can answer, and nothing changed by asking
  const head = git("rev-parse", "HEAD");
  const ask = upgrade();
  assert.equal(ask.status, 0, ask.stderr);
  assert.match(ask.stdout, /^not upgraded yet: This upgrade changes the brain's file layout from 1 to 3\./);
  assert.match(ask.stdout, /A teammate still on GTM Brain 0\.34 gets no warning: their notes keep saving/);
  assert.match(ask.stdout, /No note is lost\./);
  assert.match(ask.stdout, /strategy\.md[^\n]* into about-us\//);
  assert.match(ask.stdout, /no longer finds the brain at all/);
  assert.match(ask.stdout, /Say in plain words what moves and who must update GTM Brain first/);
  assert.match(ask.stdout, /Yes, upgrade the layout \/ No, not now/);
  assert.match(ask.stdout, /Nothing was changed\.\n$/);
  assert.equal(git("rev-parse", "HEAD"), head, "asking commits nothing");
  assert.deepEqual(noteLines(root), before.notes);

  // yes
  const yes = upgrade("--confirm");
  assert.equal(yes.status, 0, yes.stderr);
  assert.match(yes.stdout, /moved \d+ entity pages into a folder per kind/);
  assert.match(yes.stdout, /a teammate still on GTM Brain 0\.34 keeps saving notes but does not find these pages until they update/);
  assert.match(yes.stdout, /moved strategy\.md -> about-us\/strategy\.md/);
  assert.match(yes.stdout, /moved brain\/admin\.md -> config\/settings\.yaml/);
  assert.match(yes.stdout, /changed the brain's file layout to 3/);
  assert.doesNotMatch(yes.stdout, /One more move is waiting/, "the owner's yes covered both moves");

  // where the files are
  assert.equal(readLayout(root).layout, 3); assert.equal(diskLayout(root), 3); assert.equal(lib.entityLayout(root), "kinds");
  for (const f of ["about-us/strategy.md", "config/rules.md", "config/schema.md", "config/settings.yaml"]) assert.ok(exists(root, f), f);
  for (const f of ["brain/admin.md", "RULES.md", "SCHEMA.md", "strategy.md"]) assert.ok(!exists(root, f), `${f} is gone`);
  assert.deepEqual(readdirSync(join(root, "brain/entities")).filter(f => f.endsWith(".md")), [], "no flat entity page is left");

  // nothing lost, nothing renumbered, nothing reworded
  assert.deepEqual(noteLines(root), before.notes, "every note line is byte for byte the same");
  assert.deepEqual(identities(root), before.identities, "every entity keeps its id, name, kind and aliases");
  assert.equal(readFileSync(join(root, "about-us/strategy.md"), "utf8"), before.strategy);
  assert.ok(before.strategy.includes(STRATEGY));
  for (const q of QUESTIONS) assert.deepEqual(hits(root, q), before.hits[q], `the same notes answer "${q}"`);

  // the two moves are two commits a person can find and revert, as renames
  const log = git("log", "--format=%s", "-4");
  assert.match(log, /^layout 2: \d+ entity pages into a folder per kind \(upgrade\)$/m);
  assert.match(log, /^layout 3: base files in about-us\/, rules, schema and settings in config\/$/m);
  const layout2 = git("log", "--format=%H", "--grep=^layout 2: ", "-1").trim();
  assert.ok(git("show", "--name-status", "-M", "--format=", layout2).split("\n").filter(l => /^R\d+\tbrain\/entities\/[^/]+\.md\tbrain\/entities\/[^/]+\/[^/]+-[0-9a-f]{6}\.md$/.test(l)).length >= Object.keys(before.identities).length, "every page moved as a rename");
  assert.equal(git("status", "--porcelain", "--", ".", ":!profile").trim(), "");

  // done: no offer, and a second run has nothing to do
  assert.equal(layoutOffer(root), "");
  assert.match(upgrade("--confirm").stdout, /already current/);
});

test("a teammate's yes moves the entity pages only; the second move is offered to the owner, not to them", t => {
  const { root, upgrade, before } = brain034(t);
  actAs(root, "bo-chen");
  assert.match(layoutOffer(root), /can move the entity pages into a folder per kind\. Nothing has moved/);
  const ask = upgrade();
  assert.match(ask.stdout, /^not upgraded yet: This upgrade changes the brain's file layout from 1 to 2\./);
  assert.doesNotMatch(ask.stdout, /about-us\//);
  assert.match(ask.stdout, /1 teammate saved here in the last 14 days \(Ann Lee, last \d{4}-\d\d-\d\d\); they should update GTM Brain before you say yes: until they do, their GTM Brain keeps saving notes but does not find the entity pages\./);
  const yes = upgrade("--confirm");
  assert.equal(yes.status, 0, yes.stderr);
  assert.match(yes.stdout, /changed the brain's file layout to 2/);
  assert.match(yes.stdout, /One more move is waiting: the base documents into about-us\/ and the rules, schema and settings into config\/\. It is the owner's \(Ann Lee\) to say yes to/);
  assert.equal(readLayout(root).layout, 2); assert.ok(existsSync(join(root, "brain/admin.md"))); assert.ok(existsSync(join(root, "strategy.md")));
  assert.deepEqual(noteLines(root), before.notes); assert.deepEqual(identities(root), before.identities);
  assert.equal(layoutOffer(root), "", "nothing is theirs to say yes to any more");
  actAs(root, null);
  assert.match(layoutOffer(root), /can move the base documents into about-us\/ and the rules, schema and settings into config\/\. Nothing has moved/);
});
