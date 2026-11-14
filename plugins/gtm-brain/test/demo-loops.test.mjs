process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
// The workshop demo harness (test/live/demo-loops.mjs) without Codex: the seeded story is in the brain,
// the steps are well formed, and the per-turn checks pass a right outcome and fail a wrong one.
// Run: node --test plugins/gtm-brain/test/demo-loops.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
const { buildBrain, STEPS } = await import("./live/demo-loops.mjs");
const lib = await import("../lib/brain.mjs");
const { readDocument } = await import("../lib/documents.mjs");
const { customerOverview } = await import("../lib/customers.mjs");

test("demo brain: the story the two loops need is seeded through lib", { timeout: 120000 }, async () => {
  const { root } = await buildBrain(join(mkdtempSync(join(tmpdir(), "gtm-demo-test-")), "brain"));
  for (const slug of ["icp", "strategy", "voice"]) { const d = readDocument(root, slug); assert.ok(d.filled, `${slug} filled`); assert.equal(d.status, "approved"); }
  assert.match(readDocument(root, "voice").body, /No exclamation marks/);
  const names = lib.readNames(root);
  for (const n of ["Fernbrook Outdoor", "Heron Home", "Umber Pharma"]) assert.equal(names.find(e => e.name === n)?.kind, "organization", n);
  assert.ok(!names.some(e => e.name === "Lea Hoffmann"), "the contact is learned in the demo, not seeded");
  assert.ok(!customerOverview(root).customers.some(c => c.name === "Fernbrook Outdoor"), "Fernbrook has no status before the demo");
  const market = lib.effectiveMemories(lib.readMemories(root, "market"));
  assert.ok(market.some(m => /Zynt signal: Fernbrook Outdoor/.test(m.content) && m.source.some(s => s.kind === "zynt")));
  assert.ok(lib.listContexts(root).flatMap(c => c.memories).some(m => /drown in return tickets/.test(m.content) && m.source.some(s => s.kind === "granola")));
  assert.deepEqual(lib.readProjects(root).map(p => p.slug).filter(s => ["outbound", "website"].includes(s)).sort(), ["outbound", "website"]);
});

test("demo steps: unique ids, both loops end on a fresh chat, plain text", () => {
  assert.equal(new Set(STEPS.map(s => s.id)).size, STEPS.length);
  for (const loop of ["outreach", "content"]) {
    const steps = STEPS.filter(s => s.loop === loop);
    assert.ok(steps.length >= 4, loop);
    assert.ok(steps.at(-1).fresh && !steps.slice(0, -1).some(s => s.fresh), `${loop}: only the last turn is a new chat`);
  }
  for (const s of STEPS) { assert.ok(s.say && s.shows && typeof s.check === "function", s.id); assert.doesNotMatch(s.say + s.shows, /[\u2013\u2014]/, `${s.id}: no em or en dashes`); }
});

const evidence = (over = {}) => ({ reply: "", calls: [], commands: [], added: [], files: [], names: [], customers: [], idOf: () => "\u0000", saw: () => false, sawBrain: () => false, ...over });
const step = id => STEPS.find(s => s.id === id);

test("demo checks: the outreach draft must follow the voice and stay unsent", () => {
  const draft = text => ({ path: "projects/outbound/lea-hoffmann-first-email.md", text });
  const voice = re => re.test("## Do not\n\n- No exclamation marks.");
  const good = evidence({ saw: voice, files: [draft("Subject: Head of Returns\n\nLea, your Head of Returns post says returns are handled by hand.\n\nMarta")] });
  assert.equal(step("o3-draft").check(good), true);
  assert.match(step("o3-draft").check({ ...good, files: [draft("Hi Lea! Head of Returns. Marta")] }), /exclamation/);
  assert.equal(step("o3-draft").check({ ...good, files: [draft("Lea, your Head of Returns post says returns are handled by hand.\n\nMarta\n\n<!-- Source: Zynt signal -->")] }), true, "a source comment is not an exclamation");
  assert.match(step("o3-draft").check({ ...good, added: [{ content: "Sent to Lea.", actions: [{ tool: "gmail", action: "send" }] }] }), /send/);
  assert.match(step("o3-draft").check({ ...good, files: [] }), /no draft/);
  // naming the document is not reading it: a failed lookup of voice.md leaves no voice text in the chat
  assert.match(step("o3-draft").check({ ...good, saw: () => false, calls: [{ tool: "query", arguments: { object: "reference", search: "voice.md" } }], commands: ["cat voice.md"] }), /did not read the tone of voice/);
});

test("demo checks: the blog draft is SEO-checked from the file", () => {
  const para = "Store pickup returns are where online orders come back to a shop that cannot process them. ";
  const body = `# Store pickup returns without the backlog\n\n${para.repeat(3)}\n\n## Why it piles up\n\n${"Each store handles the return by hand, and the ticket waits. ".repeat(50)}`;
  const file = (title, description, text = body) => ({ path: "projects/website/store-pickup-returns.md", text: `---\ntitle: ${title}\ndescription: ${description}\n---\n${text}` });
  const good = evidence({ saw: re => re.test("- No exclamation marks."), added: [{ kind: "decision", content: "We decided: the first post targets store pickup returns." }], files: [file("Store pickup returns: a guide for retailers", "How retailers handle store pickup returns without a backlog.")] });
  assert.equal(step("c2-draft").check(good), true);
  assert.match(step("c2-draft").check({ ...good, files: [file("Store pickup returns: the complete and definitive guide for every retailer", "x")] }), /SEO title/);
  assert.match(step("c2-draft").check({ ...good, files: [file("Store pickup returns", "x", `${body}\n\n# A second H1\n`)] }), /2 H1/);
  assert.match(step("c2-draft").check({ ...good, added: [{ kind: "note", content: "First post: store pickup returns." }] }), /decision/);
});

test("demo checks: status and recall steps read the brain, not the reply alone", () => {
  const prospect = [{ name: "Fernbrook Outdoor", status: "prospect" }];
  const call = { added: [{ content: "Lea Hoffmann booked a pilot scoping call for 14 January 2027." }] };
  assert.equal(step("o6-status").check(evidence({ ...call, customers: prospect })), true);
  assert.match(step("o6-status").check(evidence({ ...call, customers: [] })), /absent, not prospect/);
  const reply = "Contact: Lea Hoffmann. She is mid ERP migration; pilot scoping call on 14 January. Status: prospect.";
  const thread = re => re.test("She replied: We are in the middle of an ERP migration until January.");
  assert.equal(step("o7-recall").check(evidence({ reply, sawBrain: thread })), true);
  assert.match(step("o7-recall").check(evidence({ reply, sawBrain: thread, added: [{ content: "x" }] })), /saves nothing/);
  assert.match(step("o7-recall").check(evidence({ reply, saw: thread })), /from the brain/, "the drafts in the folder are not the brain");
});

test("demo checks: reading means the seeded text arrived, a link means that person, next means a pillar still open", () => {
  // o1: the ICP context and a failed lookup of icp.md are not the ICP document
  const picked = "1. Fernbrook Outdoor: ICP fit with a Head of Returns post. 2. Heron Home. Umber Pharma is out.";
  const signals = "Zynt signal: Fernbrook Outdoor posted a Head of Returns job";
  assert.match(step("o1-pick").check(evidence({ reply: picked, saw: re => re.test(signals), calls: [{ tool: "load_context", arguments: { contexts: ["icp"] } }, { tool: "query", arguments: { object: "reference", search: "icp.md" } }] })), /did not read the ICP document/);
  assert.equal(step("o1-pick").check(evidence({ reply: picked, saw: re => re.test(`${signals}\n## Not a fit\n\nPharmacy chains (regulated returns)`) })), true);
  // o4: a note linked to the company alone is not linked to Lea
  const note = extra => ({ content: "The first email was sent on 11 November. Reply: ERP migration until January, ping after 10 January.", ...extra });
  const ids = n => ({ "Lea Hoffmann": "e_1111111111111111" })[n] || "\u0000";
  assert.match(step("o4-sent-reply").check(evidence({ idOf: ids, added: [note({ entities: [{ id: "e_2222222222222222" }] })] })), /not linked to Lea/);
  assert.equal(step("o4-sent-reply").check(evidence({ idOf: ids, added: [note({ entities: [{ id: "e_1111111111111111" }] })] })), true);
  // c5: describing the published post again is not the next post
  const results = re => re.test("1,240 visits, position 8, 3 demo requests");
  const produced = "One post so far, store pickup returns: 1,240 visits and 3 demo requests.";
  assert.match(step("c5-recall").check(evidence({ sawBrain: results, reply: `${produced} Next: how to process online returns in physical stores.` })), /two pillars still open/);
  assert.equal(step("c5-recall").check(evidence({ sawBrain: results, reply: `${produced} Next: the peak season post, on the weeks after Black Friday.` })), true);
  assert.match(step("c5-recall").check(evidence({ reply: `${produced} Next: the peak season post.` })), /from the brain/);
});

// A stand-in for codex that answers every turn with the right words and does nothing: no tool call, no
// file, no note. The runner must fail every step, exit 1, resume one session per loop and start the last turn fresh.
test("demo runner: an agent that only talks fails every step", { timeout: 180000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "gtm-demo-run-")), bin = join(dir, "bin"), log = join(dir, "argv.jsonl");
  mkdirSync(bin);
  writeFileSync(join(bin, "codex"), `#!${process.execPath}
const fs = require("node:fs"), argv = process.argv.slice(2);
let stdin = ""; process.stdin.on("data", d => { stdin += d; }); process.stdin.on("end", () => {
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ argv, stdin }) + "\\n");
  console.log(JSON.stringify({ type: "thread.started", thread_id: "thread-" + fs.readFileSync(${JSON.stringify(log)}, "utf8").split("\\n").filter(Boolean).length }));
  fs.writeFileSync(argv[argv.indexOf("-o") + 1], "Fernbrook Outdoor first, then Heron Home. Contact: Lea Hoffmann. ERP migration, call on 14 January, prospect. Posts: 'store pickup returns', 'reduce return rate retail'; customers say they drown after Black Friday. 1,240 visits, 3 demo requests. Next: peak season. Saved and drafted everything.");
});
`);
  chmodSync(join(bin, "codex"), 0o755);
  const script = fileURLToPath(new URL("./live/demo-loops.mjs", import.meta.url));
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GTM_BRAIN_EVAL_DIR: dir };
  const bad = spawnSync(process.execPath, [script, "outrech"], { env, encoding: "utf8" });
  assert.equal(bad.status, 2, "a misspelt loop is refused, not reported as 0 of 0");
  const run = spawnSync(process.execPath, [script], { env, encoding: "utf8" });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const report = JSON.parse(readFileSync(join(dir, readdirSync(dir).find(n => n.startsWith("gtm-demo-loops-")), "report.json"), "utf8"));
  assert.equal(report.results.length, STEPS.length);
  assert.deepEqual(report.results.filter(r => r.pass).map(r => r.id), [], "no step passes on the reply alone");
  const turns = readFileSync(log, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  assert.deepEqual(turns.map(t => t.argv.includes("resume")), STEPS.map((s, i) => !s.fresh && STEPS[i - 1]?.loop === s.loop), "turns of a loop resume its session; the first and the last are new chats");
  STEPS.forEach((s, i) => { if (turns[i].argv.includes("resume")) assert.ok(turns[i].argv.includes(`thread-${STEPS.findIndex(x => x.loop === s.loop) + 1}`), `${s.id} resumes the session its loop started`); assert.ok(turns[i].stdin.endsWith(s.say), s.id); });
  assert.deepEqual(report.results.filter(r => /codex/.test(r.why)).map(r => r.id), [], "every failure comes from a check, not from the stand-in");
  for (const t of turns) assert.ok(!t.argv.includes("resume") === /synthetic GTM Brain company brain/.test(t.stdin), "a new chat gets the preamble, a resumed turn only the sentence");
});

test("presenter text: GUIDE.md carries the sentences the live run checks, word for word, within a page", () => {
  const guide = readFileSync(fileURLToPath(new URL("../../../GUIDE.md", import.meta.url)), "utf8");
  const section = guide.slice(guide.indexOf("## Workshop demo: the two loops"), guide.indexOf("## Three habits"));
  const flat = section.replace(/\s+/g, " ");
  for (const s of STEPS) assert.ok(flat.includes(`*${s.say}*`), `${s.id}: the sentence in GUIDE.md differs from the one the live run types`);
  assert.ok(section.split("\n").length <= 60, `${section.split("\n").length} lines`);
  assert.doesNotMatch(section, /[\u2013\u2014]/);
});
