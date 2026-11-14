process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
// The workshop demo harness (test/live/demo-loops.mjs) without Codex: the seeded story is in the brain,
// the steps are well formed, and the per-turn checks pass a right outcome and fail a wrong one.
// Run: node --test plugins/gtm-brain/test/demo-loops.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
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

const evidence = (over = {}) => ({ reply: "", calls: [], commands: [], added: [], files: [], names: [], customers: [], idOf: () => "\u0000", read: () => false, ...over });
const step = id => STEPS.find(s => s.id === id);

test("demo checks: the outreach draft must follow the voice and stay unsent", () => {
  const draft = text => ({ path: "projects/outbound/lea-hoffmann-first-email.md", text });
  const good = evidence({ read: re => re.test("voice.md"), files: [draft("Subject: Head of Returns\n\nLea, your Head of Returns post says returns are handled by hand.\n\nMarta")] });
  assert.equal(step("o3-draft").check(good), true);
  assert.match(step("o3-draft").check({ ...good, files: [draft("Hi Lea! Head of Returns. Marta")] }), /exclamation/);
  assert.match(step("o3-draft").check({ ...good, added: [{ content: "Sent to Lea.", actions: [{ tool: "gmail", action: "send" }] }] }), /send/);
  assert.match(step("o3-draft").check({ ...good, files: [] }), /no draft/);
});

test("demo checks: the blog draft is SEO-checked from the file", () => {
  const para = "Store pickup returns are where online orders come back to a shop that cannot process them. ";
  const body = `# Store pickup returns without the backlog\n\n${para.repeat(3)}\n\n## Why it piles up\n\n${"Each store handles the return by hand, and the ticket waits. ".repeat(50)}`;
  const file = (title, description, text = body) => ({ path: "projects/website/store-pickup-returns.md", text: `---\ntitle: ${title}\ndescription: ${description}\n---\n${text}` });
  const good = evidence({ read: re => re.test("voice"), added: [{ kind: "decision", content: "We decided: the first post targets store pickup returns." }], files: [file("Store pickup returns: a guide for retailers", "How retailers handle store pickup returns without a backlog.")] });
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
  assert.equal(step("o7-recall").check(evidence({ reply, read: re => re.test("Fernbrook") })), true);
  assert.match(step("o7-recall").check(evidence({ reply, read: re => re.test("Fernbrook"), added: [{ content: "x" }] })), /saves nothing/);
});
