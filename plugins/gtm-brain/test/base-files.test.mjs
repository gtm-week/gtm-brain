process.env.GTM_BRAIN_NO_WATCH = "1";
process.env.GTM_BRAIN_NO_SESSION_MAINTENANCE = "1";
process.env.GTM_BRAIN_NO_COMPILE = "1";
// ALL-714: a team adds its own base file well. One request starts it (document prepare), the brain checks what
// already covers the subject, drafts from its own notes with a starter, asks one question, and saves on a yes;
// a Markdown dropped at the root by hand is recognised and adopted without a byte of its text changing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { trackBrain } from "./helpers/dash-cleanup.mjs";
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-brain-base-home-"));
const docs = await import(`${P}/lib/documents.mjs`);
const { healthLine } = await import(`${P}/lib/health-line.mjs`);
const env = { ...process.env, PLUGIN_ROOT: P, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_VERSION_CHECK: "1" };
function brain() {
  const root = trackBrain(realpathSync(mkdtempSync(join(tmpdir(), "gtm-brain-base-brain-"))), P);
  execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  execFileSync("bash", [`${P}/scripts/gtm-brain-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>", "--dashboard", "on-demand"], { cwd: root, env, stdio: "ignore" });
  return root;
}
const document = (root, ...args) => execFileSync(process.execPath, [`${P}/scripts/gtm-brain-documents/document.mjs`, ".", ...args], { cwd: root, encoding: "utf8", env });
const remember = (root, context, content) => execFileSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", "marta", "--context", context, "--content", content], { cwd: root, encoding: "utf8", env });
const lastCommit = root => execFileSync("git", ["-C", root, "log", "-1", "--format=%s"], { encoding: "utf8" }).trim();
const status = root => execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" });

test("1. one sentence starts it: prepare asks exactly one question, what work should follow, with whole-answer choices, recommended first", () => {
  const root = brain();
  const out = document(root, "--prepare", "--title", "Pricing");
  assert.match(out, /Base file: Pricing \(pricing\.md at the brain root\)\. Nothing is saved by this read\./);
  assert.match(out, /What work should follow this document\?\n1\. Proposals, outreach and landing pages \(recommended\)\n2\. Proposals\n3\. Outreach, calls and proposals/);
  assert.equal((out.match(/\?\n1\./g) || []).length, 1, "one question");
  assert.doesNotMatch(out, /Other|Something else/, "the person can always answer in their own words");
  assert.equal(status(root), "", "prepare writes nothing");
  assert.ok(!existsSync(join(root, "pricing.md")));
});

test("2. drafted from what the brain knows, notes listed; nothing known means it says so and asks for the facts", () => {
  const root = brain();
  const empty = document(root, "--prepare", "--title", "Pricing");
  assert.match(empty, /The brain holds nothing about pricing \(\d+ notes? searched\)\. Say so in one line, write no draft, and ask in one question for: 1\) the plans or packages and the price of each, 2\) the billing unit/);
  assert.match(empty, /Never invent them\./);
  remember(root, "offer", "Pro plan is 49 EUR per seat per month, billed yearly; Starter is 19 EUR.");
  remember(root, "offer", "Discounts above 15 percent need Marta's approval.");
  remember(root, "market", "Loop Returns raised its price in October.");
  const out = document(root, "--prepare", "--title", "Pricing");
  assert.match(out, /What the brain knows \(\d+ notes? of \d+ searched\)\. Draft only from these and list the ones used under "Drawn from"/);
  assert.match(out, /- m_[0-9a-f]{12} · offer · \d{4}-\d{2}-\d{2} · Pro plan is 49 EUR per seat/);
  assert.match(out, /Discounts above 15 percent/);
  assert.doesNotMatch(out, /holds nothing/);
});

test("3. the draft is shown before saving; the yes saves it as a draft through the document write path", () => {
  const root = brain();
  const body = "## Plans and prices\n\nPro: 49 EUR per seat per month, billed yearly. Starter: 19 EUR.\n\nDrawn from: m_1 (offer).";
  const preview = document(root, "--create", "--title", "Pricing", "--applies-to", "proposals, outreach, landing pages", "--body", body, "--preview");
  assert.match(preview, /Would write pricing\.md:[\s\S]*Pro: 49 EUR per seat[\s\S]*Nothing written yet\./);
  assert.ok(!existsSync(join(root, "pricing.md")), "preview writes nothing");
  assert.match(document(root, "--create", "--title", "Pricing", "--applies-to", "proposals, outreach, landing pages", "--body", body, "--by", "marta"), /created document pricing\.md \[draft\]/);
  assert.equal(lastCommit(root), "Added document pricing.md");
  assert.match(readFileSync(join(root, "pricing.md"), "utf8"), /^status: draft$/m);
  const prepared = document(root, "--prepare", "--title", "Pricing");
  assert.match(prepared, /Save only on the person's yes, as a draft/);
  assert.match(prepared, /pricing\.md already exists: offer to fill or extend it/);
});

test("4. an existing base file that covers the subject is offered first, and a section goes there without touching the rest", () => {
  const root = brain();
  const out = document(root, "--prepare", "--title", "Competitors");
  assert.match(out, /Already covered: market\.md \(Market, not filled: applies_to: competitors, battle cards; heading "Competitors"\)/);
  assert.match(out, /Where should competitors go, and what work should follow it\?\n1\. Add it to market\.md as a section \(recommended\)\n2\. A new competitors\.md for outreach, proposals and battle cards/);
  // our own pricing is not the market's: applies_to alone is not an overlap
  assert.match(document(root, "--prepare", "--title", "Pricing"), /No existing base file covers it/);
  // by content: a filled file about the subject, with the subject in applies_to
  document(root, "--create", "--title", "Commercial terms", "--applies-to", "proposals, pricing", "--body", "Our pricing is per seat. Pricing changes go through Marta. Annual pricing gets two months free.");
  assert.match(document(root, "--prepare", "--title", "Pricing"), /Already covered: commercial-terms\.md \(Commercial terms, draft: applies_to: pricing; 3 mentions in the text\)/);
  const before = readFileSync(join(root, "market.md"), "utf8");
  assert.match(document(root, "--update", "market", "--append", "## Competitors we meet\n\nLoop Returns and Narvar."), /updated document market\.md/);
  const after = readFileSync(join(root, "market.md"), "utf8");
  assert.ok(after.includes(before.slice(before.indexOf("# Market")).trimEnd()), "everything above the new section stays as it was");
  assert.ok(after.trimEnd().endsWith("## Competitors we meet\n\nLoop Returns and Narvar."));
  assert.equal(lastCommit(root), "Updated document market.md (a section added)");
});

test("5. a Markdown dropped at the root by hand is recognised once, and adopted with only frontmatter added, shown first", () => {
  const root = brain();
  const text = "# Our pricing\n\nPro is 49 EUR per seat.   \nNo discounts in Q4!\n\n- weird  spacing kept\n";
  writeFileSync(join(root, "pricing.md"), text);
  assert.deepEqual(docs.unadoptedFiles(root), ["pricing.md"]);
  assert.match(document(root, "--list"), /Not used yet: pricing\.md is here but the brain does not use it yet\. Offer once to adopt it: ask what work it governs/);
  const first = healthLine(root, { coverage: [], meetings: [] });
  assert.match(first, /base files: pricing\.md is here but the brain does not use it yet/);
  assert.match(first, /offer to adopt it by asking what work it governs/);
  assert.doesNotMatch(healthLine(root, { coverage: [], meetings: [] }) || "", /base files/, "said once: the same set is not said again");
  const prepared = document(root, "--prepare", "--file", "pricing.md");
  assert.match(prepared, /pricing\.md is here but the brain does not use it yet\. Adopting it keeps every word of it/);
  assert.match(prepared, /---\nkind: document\ntitle: Our pricing\napplies_to: \[proposals, outreach, landing pages\]\nstatus: draft/);
  assert.match(prepared, /What work should follow this document\?\n1\. Proposals, outreach and landing pages \(recommended\)/);
  const preview = document(root, "--create", "--title", "Our pricing", "--applies-to", "proposals", "--file", "pricing.md", "--preview");
  assert.match(preview, /Adopting pricing\.md adds only this frontmatter above its text/);
  assert.equal(readFileSync(join(root, "pricing.md"), "utf8"), text, "the preview writes nothing");
  assert.match(document(root, "--create", "--title", "Our pricing", "--applies-to", "proposals", "--file", "pricing.md"), /created document pricing\.md/);
  const adopted = readFileSync(join(root, "pricing.md"), "utf8");
  assert.match(adopted, /^---\nkind: document\ntitle: Our pricing\napplies_to: \[proposals\]\nstatus: draft\n/);
  assert.equal(adopted.slice(adopted.indexOf("\n---\n") + 5), text, "the person's text, byte for byte");
  assert.deepEqual(docs.unadoptedFiles(root), []);
  document(root, "--update", "pricing", "--status", "approved");
  const approved = readFileSync(join(root, "pricing.md"), "utf8");
  assert.equal(approved.slice(approved.indexOf("\n---\n") + 5), text, "a fields-only update keeps the text too");
  assert.match(approved, /^status: approved$/m);
});

test("6. the starters for pricing, positioning, competitors and objections are short headings with one line each, and a draft starts from one", () => {
  for (const slug of docs.BASE_STARTERS) {
    const s = docs.readStarter(slug);
    const headings = s.body.match(/^## .+$/gm);
    assert.ok(headings.length >= 3 && headings.length <= 5, `${slug}: ${headings.length} headings`);
    for (const h of headings) { const after = s.body.split(h)[1].trim().split("\n\n")[0]; assert.ok(after && !after.startsWith("#") && !after.includes("\n"), `${slug} ${h}: one line of guidance`); }
    assert.ok(s.choices.length >= 2 && s.choices.length <= 3 && s.needs.length >= 2 && s.needs.length <= 3, slug);
  }
  assert.equal(docs.matchStarter("we need a positioning document").slug, "positioning");
  assert.equal(docs.matchStarter("make a competitors file").slug, "competitors");
  assert.equal(docs.matchStarter("objection handling").slug, "objections");
  assert.equal(docs.matchStarter("Q3 plan"), null);
  const root = brain();
  const out = document(root, "--prepare", "--title", "Objections");
  assert.match(out, /Starter: templates\/base-files\/objections\.md\. Keep its headings/);
  assert.match(out, /## Objections we hear\n\nEach objection in the buyer's own words/);
  // saved as the starter alone, it is a base file not filled yet
  document(root, "--create", "--title", "Objections", "--applies-to", "outreach, calls", "--body", docs.readStarter("objections").body);
  assert.equal(docs.readDocument(root, "objections").state, "not filled");
});

test("7. the list shows every base file with its state, what it applies to and when it last changed; the JSON carries the same", () => {
  const root = brain();
  document(root, "--create", "--title", "Pricing", "--applies-to", "proposals", "--body", "Pro is 49 EUR.");
  document(root, "--update", "pricing", "--status", "approved");
  const list = document(root, "--list");
  const today = new Date().toISOString().slice(0, 10);
  assert.match(list, new RegExp(`^Pricing \\[approved\\] \\(proposals\\) · pricing\\.md · changed ${today}$`, "m"));
  assert.match(list, /^Market \[not filled\] \(market, competitors, positioning, pricing, battle cards, category\) · market\.md · changed \d{4}-\d{2}-\d{2}$/m);
  for (const f of ["strategy.md", "icp.md", "voice.md", "design-system.md"]) assert.match(list, new RegExp(`\\[not filled\\] \\([^)]+\\) · ${f.replace(".", "\\.")} · changed`));
  const json = JSON.parse(document(root, "--list", "--json"));
  const pricing = json.find(d => d.slug === "pricing");
  assert.deepEqual([pricing.state, pricing.applies_to, pricing.changed], ["approved", ["proposals"], today]);
  assert.equal(json.find(d => d.slug === "market").state, "not filled");
});

test("through the MCP document tool: prepare, a previewed adoption, then append, each as the model calls it", async () => {
  const root = brain();
  const server = spawn(process.execPath, [`${P}/server/server.mjs`], { stdio: ["pipe", "pipe", "pipe"], env: { ...env, GTM_BRAIN_NO_SESSION_START: "1", GTM_BRAIN_NO_SAVE_NUDGE: "1" } });
  const pending = new Map(); let seq = 0;
  createInterface({ input: server.stdout }).on("line", line => { const m = JSON.parse(line); const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); } });
  const rpc = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const call = async args => { const m = await rpc("tools/call", { name: "document", arguments: { brain: root, ...args } }); return { text: m.result.content.map(c => c.text).join("\n"), isError: !!m.result.isError }; };
  try {
    await rpc("initialize", { capabilities: {} });
    const tool = (await rpc("tools/list")).result.tools.find(t => t.name === "document");
    assert.ok(tool.inputSchema.properties.action.enum.includes("prepare")); assert.equal(tool.inputSchema.properties.preview.type, "boolean");
    assert.match((await call({ action: "prepare", title: "Positioning" })).text, /What work should follow this document\?\n1\. Copy, landing pages and outreach \(recommended\)/);
    writeFileSync(join(root, "objections.md"), "Too expensive -> show the payback table.\n");
    const preview = await call({ action: "create", title: "Objections", applies_to: ["outreach", "calls"], file: "objections.md", preview: true });
    assert.match(preview.text, /adds only this frontmatter/); assert.equal(readFileSync(join(root, "objections.md"), "utf8"), "Too expensive -> show the payback table.\n");
    assert.equal((await call({ action: "create", title: "Objections", applies_to: ["outreach", "calls"], file: "objections.md", by: "marta" })).isError, false);
    assert.ok(readFileSync(join(root, "objections.md"), "utf8").endsWith("\n---\nToo expensive -> show the payback table.\n"));
    const added = await call({ action: "update", ref: "objections", append: "## Not now\n\nAsk what changes in Q2." });
    assert.equal(added.isError, false, added.text);
    assert.match(readFileSync(join(root, "objections.md"), "utf8"), /Too expensive -> show the payback table\.\n\n## Not now\n\nAsk what changes in Q2\.\n$/);
  } finally { server.kill(); }
});
