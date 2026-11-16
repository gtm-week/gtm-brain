// These tests read and write the root files of a layout 2 brain: setup and the lib play a plugin that writes layout 2 at most
// (lib/layout-version.mjs GTM_BRAIN_TEST_LAYOUT). Layout 3 (about-us/, config/) is covered by config-folders.test.mjs.
process.env.GTM_BRAIN_TEST_LAYOUT = "2";
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
  // literal lines the model copies: the why line right above the question, "(recommended)" on the first choice
  assert.match(out, /word for word, the why line and "\(recommended\)" included:\n\nThe brain reads pricing\.md before the work you pick, so the pick decides when it is followed\. Picking one saves it as a draft\.\nWhat work should follow this document\?\n1\. Proposals, outreach and landing pages \(recommended\)\n2\. Proposals\n3\. Outreach, calls and proposals\n/);
  // a pick is the yes: the second turn is one write, and the closing line names the saved path
  assert.match(out, /A number or a kind of work is the yes: save with one call, document create, title "Pricing"/);
  assert.match(out, /the closing line names the saved path: "Saved pricing\.md as a draft\. The brain reads it before <the work picked>\."/);
  assert.doesNotMatch(out, /Kinds of work the brain's base files already name/, "no list the model does not need");
  assert.equal((out.match(/\?\n1\./g) || []).length, 1, "one question");
  assert.doesNotMatch(out, /Other|Something else/, "the person can always answer in their own words");
  assert.equal(status(root), "", "prepare writes nothing");
  assert.ok(!existsSync(join(root, "pricing.md")));
});

test("2. drafted from what the brain knows, notes listed; nothing known means it says so and asks for the facts", () => {
  const root = brain();
  const empty = document(root, "--prepare", "--title", "Pricing");
  assert.match(empty, /The brain holds nothing about pricing \(\d+ notes? searched\)\. Say so in one line, write no draft, and ask in one question for: 1\) the plans or packages and the price of each, 2\) the billing unit/);
  assert.match(empty, /Never invent them\. End the turn there\./);
  // one question pending: with nothing known the work question waits for the draft, it is not asked in this turn too
  assert.match(empty, /The one question\. Not in this turn: once the facts are in, draft from them, show the draft in full/);
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
  // the subject's file exists: never a create (it would be refused), a section in it, with what it governs kept
  assert.match(prepared, /pricing\.md already exists \[draft\] \(proposals, outreach, landing pages\): fill or extend it, never a second file\./);
  assert.match(prepared, /\nThe brain reads pricing\.md before proposals, outreach and landing pages, so this text is followed there\.\nSave this to pricing\.md\?\n1\. Yes, save it \(recommended\)\n2\. No, change something/);
  assert.match(prepared, /On yes, one call: document update, ref pricing, append the section/);
  assert.doesNotMatch(prepared, /document create/);
});

test("4. an existing base file that covers the subject is offered first, and a section goes there without touching the rest", () => {
  const root = brain();
  const out = document(root, "--prepare", "--title", "Competitors");
  assert.match(out, /Already covered: market\.md \(Market, not filled: applies_to: competitors, battle cards; heading "Competitors"\)/);
  assert.match(out, /Where should competitors go, and what work should follow it\?\n1\. A section in market\.md \(recommended\)\n2\. A new competitors\.md for outreach, proposals and battle cards/);
  assert.match(out, /save with one call, update, ref market, append the section \(choice 1\); or document create/);
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
  // the frontmatter shown is the one adoption writes: the plugin version too, not an empty field
  const version = JSON.parse(readFileSync(`${P}/.codex-plugin/plugin.json`, "utf8")).version;
  assert.match(prepared, new RegExp(`\\ngtm-brain: ${version.replace(/\./g, "\\.")}\\n---`));
  assert.match(prepared, /What work should follow this file\?\n1\. Proposals, outreach and landing pages \(recommended\)/);
  assert.match(prepared, /Picking one adopts it as a draft; its text stays as it is\./);
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

test("8. the chat start says a dropped Markdown once, through the one process that prints the closing lines", () => {
  const root = brain();
  const start = () => execFileSync("bash", [`${P}/session/session-start.sh`], { cwd: root, encoding: "utf8", input: JSON.stringify({ session_id: "s1", cwd: root }), env: { ...env, GTM_BRAIN_NO_VERSION_CHECK: "1", GTM_BRAIN_NO_SESSION_MAINTENANCE: "1" } });
  writeFileSync(join(root, "pricing.md"), "# Pricing\n\nPer store.\n");
  const first = start();
  assert.match(first, /base files: pricing\.md is here but the brain does not use it yet/);
  assert.match(first, /^documents: /m, "the lines after the health line still print");
  assert.doesNotMatch(start(), /base files: pricing\.md/, "said once per new file");
  // the status call waited on one node per closing line; they run in one process now
  const sh = readFileSync(`${P}/session/session-start.sh`, "utf8");
  assert.match(sh, /node "\$P\/session\/start-lines\.mjs" "\$root" "\$project" "\$P\/templates"/);
  for (const fn of ["healthLine", "documentsLine", "assetsLine", "runsLine", "strayFoldersHint", "autoRefresh", "refreshReadme", "whereLine", "askSourceLine", "schemaLine", "pausedCoversHint", "unplacedHint"])
    assert.doesNotMatch(sh, new RegExp(`node -e '[^\\n]*${fn}`), `${fn} runs in start-lines.mjs, not its own node`);
});

test("9. adopting keeps the text byte for byte when the file has its own frontmatter or Windows line ends", () => {
  const root = brain();
  const own = "---\ntags: [sales]\n---\n\n# Price list\r\n\r\nPro: 49.  \r\n", crlf = "---\r\ntags: [ops]\r\n---\r\n# Notes\r\n\r\nA line.\r\n";
  writeFileSync(join(root, "price-list.md"), own); writeFileSync(join(root, "notes.md"), crlf);
  document(root, "--create", "--title", "Price list", "--applies-to", "proposals", "--file", "price-list.md");
  document(root, "--create", "--title", "Notes", "--applies-to", "planning", "--file", "notes.md");
  const a = readFileSync(join(root, "price-list.md"), "utf8"), b = readFileSync(join(root, "notes.md"), "utf8");
  assert.ok(a.endsWith("\n---\n\n# Price list\r\n\r\nPro: 49.  \r\n") && /^tags: \[sales\]$/m.test(a), a);
  assert.ok(b.endsWith("\n---\n# Notes\r\n\r\nA line.\r\n") && /^tags: \[ops\]$/m.test(b), b);
  assert.deepEqual([docs.readDocument(root, "price-list").status, docs.readDocument(root, "notes").applies_to], ["draft", ["planning"]]);
});
