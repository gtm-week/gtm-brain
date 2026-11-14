#!/usr/bin/env node
// The workshop demo as a live check (ALL-717): the two key loops, outreach lifecycle and content
// strategy, each a sequence of real Codex turns on one seeded brain, with a file-based check after
// every turn: what was saved, what was read, what file was written. Pass or fail per step.
//   node plugins/gtm-brain/test/live/demo-loops.mjs [outreach|content] [--brain-only]
// The brain is the e2e small shape (test/e2e/generate-brain.mjs) plus the records the story needs:
// filled ICP, strategy and voice documents, Zynt signals, customer words from calls, two project
// folders for drafts. Turns run through the production MCP server behind tool-routing-proxy.mjs
// (isolated Codex config, the question form answered as the person). Turns of a loop resume one
// Codex session; the last turn of each loop is a fresh chat, so the answer can only come from the brain.
// "Read" in a resumed turn counts what that session read in its earlier turns: it is still in its context.
// Nothing is ever sent: connector results (Clay, Surfer, Gmail, Vercel) are told to Codex in the turn.
// A step that fails because of a product gap carries known_gap, the way test/e2e/e2e.mjs marks them;
// the run exits 1 only on a plain failure. The brain and every trace are kept for inspection.
// --brain-only builds the seeded brain, prints its path and stops (the presenter's starting point).
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const P = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const model = process.env.GTM_BRAIN_EVAL_MODEL || "gpt-5.6-luna";
const TURN_TIMEOUT = Number(process.env.GTM_BRAIN_DEMO_TURN_MS || 420000);

/* ---------- the story the brain must hold ---------- */
const ICP = `## Best customers today

Outdoor and home retailers with 20 to 200 stores, where online orders come back through the stores.

## Company: industry, size, region, signals

- Outdoor equipment and home goods retail, Germany, Austria and Poland.
- 20 to 200 stores, 300 to 5,000 employees.
- Signals: hiring for returns or reverse logistics, launching store pickup or in-store returns, opening stores.

## Who buys: roles, who decides, who blocks

Head of Operations decides; the CFO signs above 50,000 EUR; IT blocks when the ERP is mid-migration.

## Problems we solve for them

Returns handled by hand in every store, return tickets piling up after peak season, no view of the return rate per store.

## Not a fit

Pharmacy chains (regulated returns) and marketplaces without stores.`;
const STRATEGY = `## Where we play

Mid-market outdoor and home retailers in Germany, Austria and Poland.

## This half

1. Outbound on buying signals: write only when a signal gives a reason to write now.
2. Inbound content as the second channel: three posts on the landing page blog by year end, one per pillar.

## Content pillars

- Returns cost: what a manual return costs a store.
- Store pickup returns: online orders returned in the store.
- Peak season: the weeks after Black Friday.`;
const VOICE = `## How we sound, in three words

Plain, specific, calm.

## Do

- Short sentences.
- Name the customer's problem before our product.
- One number per paragraph, with its source.
- Sign emails "Marta".

## Do not

- No exclamation marks.
- No "revolutionary", "seamless" or "game-changer".
- No first-name greetings with a comma splice ("Hi Lea, hope you're well, ...").`;

export async function buildBrain(out) {
  const { generate } = await import(`${P}/test/e2e/generate-brain.mjs`);
  await generate({ shape: "small", out, quiet: true });
  const lib = await import(`${P}/lib/brain.mjs`), docs = await import(`${P}/lib/documents.mjs`);
  const root = resolve(out), by = lib.readAdmin(root).team[0].handle, at = d => new Date(Date.UTC(2026, 10, d, 9)).toISOString();
  for (const [slug, body] of [["icp", ICP], ["strategy", STRATEGY], ["voice", VOICE]]) {
    const d = docs.readDocument(root, slug);
    docs.writeDocument(root, { path: d.path, title: d.title, applies_to: d.applies_to, status: "approved", by, updated: "2026-11-02", version: d.version || "", body });
  }
  lib.addName(root, "Fernbrook Outdoor", { kind: "organization", subtype: "company", references: [{ kind: "website", ref: "https://fernbrook-outdoor.example" }] });
  lib.addName(root, "Heron Home", { kind: "organization", subtype: "company", references: [{ kind: "website", ref: "https://heron-home.example" }] });
  lib.addName(root, "Umber Pharma", { kind: "organization", subtype: "company" });
  const M = (ctx, d, content, extra = {}) => lib.appendMemory(root, ctx, { authors: [by], content, kind: "note", tools: [], people: [], at: at(d), ...extra });
  const zynt = (ref) => ({ tools: ["zynt"], source: [{ kind: "zynt", ref: `https://app.zynt.fixture.test/signals/${ref}` }] });
  const call = (ref) => ({ tools: ["granola"], source: [{ kind: "granola", ref: `https://meetings.fixture.test/recordings/${ref}?account=work` }] });
  M("market", 10, "Zynt signal: Fernbrook Outdoor posted a Head of Returns job on 10 November; the post says returns are handled by hand in each store.", { people: ["Fernbrook Outdoor"], ...zynt("fernbrook-1") });
  M("market", 6, "Zynt signal: Heron Home opened 12 new stores in Poland in October.", { people: ["Heron Home"], ...zynt("heron-1") });
  M("market", 4, "Zynt signal: Umber Pharma, a pharmacy chain with 900 stores, is hiring a returns analyst.", { people: ["Umber Pharma"], ...zynt("umber-1") });
  M("market", 3, "Competitors publish weekly posts on return policies; none covers returns of online orders in the store.", { tools: ["web"] });
  M("offer", 5, "Pilot review call with Raven Living: Rosa Brandt said \"after Black Friday we drown in return tickets\".", { people: ["Rosa Brandt", "Raven Living"], ...call("demo-1") });
  M("icp", 7, "Discovery call with Quarry Foods: Ursula Holm said \"our customers want to return online orders in the store, and nobody there can process them\".", { people: ["Ursula Holm", "Quarry Foods"], ...call("demo-2") });
  M("icp", 8, "Fernbrook Outdoor fits the ICP on paper: outdoor retail in Germany and Austria, store count unknown.", { people: ["Fernbrook Outdoor"], source: [{ kind: "user", ref: by }] });
  M("strategy", 2, "We decided: three blog posts on the landing page by year end, one per content pillar.", { kind: "decision", source: [{ kind: "user", ref: by }] });
  const env = { ...process.env, GTM_BRAIN_NO_COMMIT: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_RUN: "demo" };
  for (const [slug, title] of [["outbound", "Outbound"], ["website", "Website"]]) {
    mkdirSync(join(root, "projects", slug), { recursive: true });
    execFileSync(process.execPath, [`${P}/skills/gtm-brain-project/project.mjs`, root, "--link", join(root, "projects", slug), "--slug", slug, "--title", title, "--by", by], { cwd: root, env, stdio: "ignore" });
  }
  lib.save(root, "demo: the workshop story");
  return { root, by };
}

/* ---------- checks: each gets the turn's evidence and returns true or the reason it failed ---------- */
const all = (...checks) => { for (const c of checks) if (c !== true) return c; return true; };
const need = (ok, why) => ok ? true : why;
const has = (text, re) => re.test(String(text || ""));
const fileText = f => f.text.replace(/^---\n[\s\S]*?\n---\n/, "");
const frontmatter = f => Object.fromEntries((f.text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] || "").split("\n").map(l => l.match(/^([\w-]+):\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const drafts = (x, dir) => x.files.filter(f => f.path.startsWith(`projects/${dir}/`) && /\.(md|txt)$/.test(f.path) && !/(^|\/)(AGENTS|CLAUDE)\.md$/.test(f.path));
const noSaves = x => need(!x.added.length, `saved ${x.added.length} note(s) on a turn that saves nothing`);
const noSend = x => need(!x.added.some(m => (m.actions || []).some(a => /send/i.test(a.action || ""))) && !x.calls.some(c => /send|gmail/i.test(c.tool)), "recorded or attempted a send on a draft-only turn");
const saved = (x, re, why) => need(x.added.some(m => re.test(JSON.stringify(m))), why);
const read = (x, re, why) => need(x.read(re), why);
const words = t => (t.match(/[A-Za-z0-9][\w'’-]*/g) || []).length;

export const STEPS = [
  { loop: "outreach", id: "o1-pick", shows: "accounts picked from the ICP and the signals",
    say: "We want to start outreach this week. From our ICP and the buying signals in the brain, which two accounts should we contact first, and why? Name the person to write to if we know one. Do not save anything yet.",
    check: x => all(read(x, /icp/i, "did not read the ICP"), read(x, /market|signal|zynt|fernbrook/i, "did not read the signals"), need(has(x.reply, /Fernbrook/), "Fernbrook Outdoor (ICP fit with a fresh signal) not picked"), need(!/Umber Pharma[^.\n]{0,80}(first|contact|pick)/i.test(x.reply) || /not a fit|pharmac/i.test(x.reply), "picked Umber Pharma, which the ICP rules out"), noSaves(x)) },
  { loop: "outreach", id: "o2-enrich", shows: "Clay enrichment saved, the contact registered",
    say: "I ran Clay on Fernbrook Outdoor. It returned: 85 stores in Germany and Austria, about 1,400 employees, returns handled by hand in each store. Their Head of Operations is Lea Hoffmann, lea.hoffmann@fernbrook-outdoor.example, based in Munich. Save what Clay found.",
    check: x => all(saved(x, /Lea Hoffmann/, "no note names Lea Hoffmann"), saved(x, /85/, "store count not saved"), saved(x, /clay/i, "Clay not recorded as the source"),
      need(x.names.some(n => n.name === "Lea Hoffmann" && n.kind === "person"), "Lea Hoffmann is not a person in the registry"),
      need(x.names.some(n => n.name === "Lea Hoffmann" && n.emails.includes("lea.hoffmann@fernbrook-outdoor.example")) || x.added.some(m => m.content.includes("lea.hoffmann@fernbrook-outdoor.example")), "her email is kept nowhere")) },
  { loop: "outreach", id: "o3-draft", shows: "first email drafted in the company voice, nothing sent",
    say: "Draft the first outreach email to Lea, tied to the Zynt signal, in our tone of voice. Draft only: do not send anything. Put the draft as a Markdown file in the outbound project folder.",
    check: x => { const d = drafts(x, "outbound").find(f => /Lea/.test(f.text)); return all(read(x, /voice/i, "did not read the tone of voice"), need(!!d, "no draft to Lea in projects/outbound/"), d ? need(!fileText(d).includes("!"), `exclamation mark in ${d.path} (voice: none)`) : true, d ? need(/Head of Returns|returns/i.test(d.text), "the draft does not use the signal") : true, d ? need(/Marta/.test(d.text), "not signed Marta (voice)") : true, noSend(x)); } },
  { loop: "outreach", id: "o4-sent-reply", shows: "what was sent and the reply recorded, follow-up date kept",
    say: "I sent that email to Lea from Gmail on 11 November. She replied on 13 November: \"Interesting timing. We are in the middle of an ERP migration until January. Ping me after 10 January.\" Record both.",
    check: x => all(saved(x, /\bsent\b|\bsend/i, "the send is not recorded"), saved(x, /migration/i, "the reply is not recorded"), saved(x, /10 Jan|January 10|10 January|2027-01-10|Jan(uary)? 10/i, "the follow-up date is not kept"), saved(x, /Lea Hoffmann|e_[0-9a-f]{16}/, "the notes are not linked to Lea")) },
  { loop: "outreach", id: "o5-followup", shows: "follow-up drafted from her reply",
    say: "Draft the follow-up for 11 January that picks up her reply. Draft only, same folder.",
    check: x => { const d = drafts(x, "outbound").find(f => /migration|ERP/i.test(f.text) && /Lea/.test(f.text)); return all(need(!!d, "no follow-up in projects/outbound/ that picks up the ERP migration"), d ? need(!fileText(d).includes("!"), `exclamation mark in ${d.path}`) : true, noSend(x)); } },
  { loop: "outreach", id: "o6-status", shows: "the call booked and the customer status updated in the brain",
    say: "Lea booked a pilot scoping call for 14 January. Fernbrook Outdoor is now a prospect for us. Record the call and their status in the brain. Do not touch the CRM.",
    check: x => all(need(x.customers.some(c => c.name === "Fernbrook Outdoor" && c.status === "prospect"), `customer overview: Fernbrook Outdoor is ${x.customers.find(c => c.name === "Fernbrook Outdoor")?.status || "absent"}, not prospect`), saved(x, /14 Jan|January 14|14 January|2027-01-14/i, "the 14 January call is not recorded"), need(!x.calls.some(c => /^(attio|hubspot)_/.test(c.tool)), "touched the CRM")) },
  { loop: "outreach", id: "o7-recall", fresh: true, shows: "a new chat knows the whole thread from the brain",
    say: "Where do we stand with Fernbrook Outdoor? Who is our contact, what happened so far, and what is next? Do not save anything.",
    check: x => all(read(x, /Fernbrook/i, "did not look Fernbrook up"), need(has(x.reply, /Lea Hoffmann|Lea/), "contact not named"), need(has(x.reply, /migration|ERP/i), "her reply is missing"), need(has(x.reply, /14 Jan|January 14|14 January|2027-01-14/i), "the 14 January call is missing"), need(has(x.reply, /prospect/i), "status missing"), noSaves(x)) },

  { loop: "content", id: "c1-topics", shows: "topics proposed from strategy, market, calls and the Surfer keywords",
    say: "Plan our blog. Read our strategy, the market notes and what customers said on calls. Surfer gave us these keywords (monthly searches, difficulty): 'returns automation for retailers' 1,900 / 34; 'reduce return rate retail' 880 / 22; 'store pickup returns' 320 / 12. Propose three posts for the landing page blog, each with its keyword and the customer words it uses. Do not save anything yet.",
    check: x => all(read(x, /strategy/i, "did not read the strategy"), read(x, /market/i, "did not read the market notes"), need(["returns automation for retailers", "reduce return rate retail", "store pickup returns"].filter(k => x.reply.toLowerCase().includes(k)).length >= 2, "fewer than two Surfer keywords used"), need(has(x.reply, /drown|Black Friday|return online orders in the store/i), "no customer words from the calls"), noSaves(x)) },
  { loop: "content", id: "c2-draft", shows: "the choice saved as a decision, the post drafted and SEO-checked",
    say: "Go with 'store pickup returns' first; save that as a decision. Then draft the post in our tone of voice: about 600 words, an SEO title under 60 characters, a meta description under 155 characters, one H1, the keyword in the title and in the first paragraph. Put the draft in the website project folder as Markdown, with title and description in its front matter.",
    check: x => {
      const d = drafts(x, "website").sort((a, b) => b.text.length - a.text.length)[0], fm = d ? frontmatter(d) : {}, body = d ? fileText(d) : "";
      const h1 = (body.match(/^# .+$/gm) || []).length, first = body.split(/\n\s*\n/).map(p => p.trim()).find(p => p && !p.startsWith("#")) || "";
      return all(saved(x, /store pickup/i, "the choice is not saved"), need(x.added.some(m => m.kind === "decision"), "not saved as a decision"), read(x, /voice/i, "did not read the tone of voice"), need(!!d, "no draft in projects/website/"),
        d ? need(fm.title && fm.title.length <= 60 && /store pickup returns?/i.test(fm.title), `SEO title "${fm.title || ""}" (${(fm.title || "").length} chars) misses the rule`) : true,
        d ? need(fm.description && fm.description.length <= 155, `meta description is ${(fm.description || "").length} chars`) : true,
        d ? need(h1 === 1, `${h1} H1 headings`) : true, d ? need(/store pickup return/i.test(first), "keyword not in the first paragraph") : true,
        d ? need(words(body) >= 400 && words(body) <= 900, `${words(body)} words`) : true, d ? need(!body.includes("!"), "exclamation mark in the post (voice: none)") : true);
    } },
  { loop: "content", id: "c3-published", shows: "publication recorded with its URL",
    say: "The post went live today at https://reflow.example/blog/store-pickup-returns, deployed with the landing page on Vercel. Remember that it was published.",
    check: x => saved(x, /reflow\.example\/blog\/store-pickup-returns/, "the published URL is not saved") },
  { loop: "content", id: "c4-results", shows: "what the post produced, linked to the account it brought in",
    say: "Two weeks of numbers for that post: 1,240 visits, position 8 for 'store pickup returns', 3 demo requests, one of them from Lumen Outdoor. Record what it produced.",
    check: x => all(saved(x, /1,?240/, "visits not saved"), saved(x, /demo/i, "demo requests not saved"), need(x.added.some(m => (m.people || []).includes("Lumen Outdoor") || JSON.stringify(m.entities || []).includes(x.idOf("Lumen Outdoor"))), "not linked to Lumen Outdoor")) },
  { loop: "content", id: "c5-recall", fresh: true, shows: "a new chat reports what content produced and picks the next post",
    say: "What has our blog produced so far, and which post should come next? Do not save anything.",
    check: x => all(need(has(x.reply, /store pickup returns|reflow\.example\/blog/i), "the published post is missing"), need(has(x.reply, /1,?240|\b3 demo|three demo/i), "the results are missing"), need(has(x.reply, /returns automation for retailers|reduce return rate|peak season|Black Friday|returns cost|online (orders|returns)[^.\n]{0,60}(store|shop)/i), "no next post from the plan"), noSaves(x)) },
];

/* ---------- running ---------- */
const readJSONL = p => existsSync(p) ? readFileSync(p, "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
function snapshot(root) {
  const out = new Map();
  const walk = dir => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name), rel = relative(root, p); if (/^(\.git|work|brain)(\/|$)/.test(rel)) continue; if (e.isDirectory()) walk(p); else if (statSync(p).size < 1 << 20) out.set(rel, createHash("sha1").update(readFileSync(p)).digest("hex")); } };
  walk(root); return out;
}

async function main() {
  const args = process.argv.slice(2), only = args.filter(a => !a.startsWith("--"));
  const lib = await import(`${P}/lib/brain.mjs`), { customerOverview } = await import(`${P}/lib/customers.mjs`);
  const base = resolve(process.env.GTM_BRAIN_EVAL_DIR || tmpdir()), artifacts = mkdtempSync(join(base, "gtm-demo-loops-"));
  // the generator gives the brain a scratch profile (never the real one); the server keeps using it, codex keeps the person's sign-in
  const { root, by } = await buildBrain(join(artifacts, "brain")), profile = process.env.CODEX_HOME;
  console.log(`Brain: ${root}\nArtifacts: ${artifacts}`);
  if (args.includes("--brain-only")) return;
  const env = { ...process.env, CODEX_HOME: profile, GTM_BRAIN_EVAL_PROFILE: profile, PLUGIN_ROOT: P, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_EVAL_ALLOW: "workflow" };
  const agentEnv = { ...env }; delete agentEnv.CODEX_HOME; if (process.env.GTM_BRAIN_CODEX_HOME) agentEnv.CODEX_HOME = process.env.GTM_BRAIN_CODEX_HOME;
  const results = [];
  for (const loop of ["outreach", "content"].filter(l => !only.length || only.includes(l))) {
    const trace = join(artifacts, `${loop}-mcp.jsonl`); let session = null, seen = [];   // seen: what the resumed session has read so far, still in its context
    const preamble = `This is a synthetic GTM Brain company brain at ${root}, used for a workshop demo. You work for Marta Nowak, confirmed handle ${by}. Use only this synthetic brain and the plugin's workflow instructions; do not read real account data or other company files. Nothing is ever sent or published from this chat: Clay, Surfer, Gmail and Vercel are not connected, and what they returned is told to you. The plugin build under test is ${P}; use its skills/gtm-brain-use-brain/SKILL.md and the procedures it references.\n\n`;
    for (const step of STEPS.filter(s => s.loop === loop)) {
      const fresh = !session || step.fresh, before = { trace: readJSONL(trace).length, notes: new Set(lib.listContexts(root).flatMap(c => c.memories.map(m => m.id))), files: snapshot(root) };
      const events = join(artifacts, `${step.id}-agent.jsonl`), final = join(artifacts, `${step.id}-final.txt`);
      const mcp = ["-c", "features.apps=false", "-c", "approval_policy=\"never\"", "-c", "sandbox_mode=\"workspace-write\"",
        "-c", `mcp_servers.gtm_brain_eval.command=${JSON.stringify(process.execPath)}`,
        "-c", `mcp_servers.gtm_brain_eval.args=${JSON.stringify([`${P}/test/live/tool-routing-proxy.mjs`, root, trace, step.answer || "", "", "", P])}`,
        "-c", "mcp_servers.gtm_brain_eval.tool_timeout_sec=120"];
      const argv = fresh ? ["exec", "--ignore-user-config", "--json", "--skip-git-repo-check", "-C", root, "-m", model, ...mcp, "-o", final, "-"]
        : ["exec", "resume", "--ignore-user-config", "--json", "--skip-git-repo-check", "-m", model, ...mcp, "-o", final, session, "-"];
      const started = Date.now();
      const run = await new Promise(res => {
        const child = spawn("codex", argv, { cwd: root, env: agentEnv, stdio: ["pipe", "pipe", "pipe"] });
        let out = "", err = "", timedOut = false;
        const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, TURN_TIMEOUT);
        child.stdout.on("data", d => { out += d; }); child.stderr.on("data", d => { err += d; });
        child.on("close", code => { clearTimeout(timer); writeFileSync(events, out); writeFileSync(join(artifacts, `${step.id}-stderr.log`), err); res({ code, timedOut, out }); });
        child.stdin.end(fresh ? preamble + step.say : step.say);
      });
      const ev = run.out.split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const thread = ev.find(e => e.type === "thread.started")?.thread_id; if (!session && !step.fresh && thread) session = thread;   // a fresh last turn never becomes the session
      const commands = ev.filter(e => e.item?.type === "command_execution").map(e => String(e.item.command || ""));
      const records = readJSONL(trace).slice(before.trace), calls = records.filter(r => r.kind === "call");
      const after = snapshot(root), files = [...after].filter(([p, h]) => before.files.get(p) !== h).map(([p]) => ({ path: p, text: readFileSync(join(root, p), "utf8") }));
      const added = lib.listContexts(root).flatMap(c => c.memories).filter(m => !before.notes.has(m.id));
      const reply = existsSync(final) ? readFileSync(final, "utf8").trim() : "";
      const names = lib.readNames(root), idOf = n => names.find(e => e.name === n)?.id || "\u0000";
      const reads = [...calls.map(c => `${c.tool} ${JSON.stringify(c.arguments)}`), ...commands], context = step.fresh ? reads : [...seen, ...reads];
      if (!step.fresh) seen = context;
      const x = { reply, calls, commands, added, files, names, idOf, customers: customerOverview(root).customers, read: re => context.some(r => re.test(r)) };
      let verdict; try { verdict = run.code === 0 && !run.timedOut ? step.check(x) : `codex ${run.timedOut ? "timed out" : `exited ${run.code}`}`; } catch (e) { verdict = `check threw: ${e.message}`; }
      const r = { loop, id: step.id, shows: step.shows, pass: verdict === true, why: verdict === true ? "" : verdict, ...(verdict !== true && step.known_gap ? { known_gap: step.known_gap } : {}), seconds: Math.round((Date.now() - started) / 1000),
        tools: calls.map(c => c.tool), saved: added.map(m => `${m.context} [${m.kind}] ${m.content.slice(0, 160)}`), files: files.map(f => f.path), reply: reply.slice(0, 1200), events, trace };
      results.push(r);
      console.log(`${r.pass ? "PASS" : r.known_gap ? "GAP " : "FAIL"}  ${step.id.padEnd(14)} ${String(r.seconds).padStart(4)}s  ${step.shows}${r.why ? `\n      why: ${r.why}${r.known_gap ? ` (known gap: ${r.known_gap})` : ""}` : ""}\n      tools: ${r.tools.join(" > ") || "none"}${commands.length ? `\n      shell: ${commands.length} command(s)` : ""}${r.saved.length ? `\n      saved: ${r.saved.join("\n             ")}` : ""}${r.files.length ? `\n      files: ${r.files.join(", ")}` : ""}`);
    }
  }
  writeFileSync(join(artifacts, "report.json"), JSON.stringify({ brain: root, model, plugin: P, results }, null, 2) + "\n");
  const plain = results.filter(r => !r.pass && !r.known_gap).length, gaps = results.filter(r => !r.pass && r.known_gap).length;
  console.log(`\n${results.filter(r => r.pass).length} of ${results.length} steps pass, ${plain} fail, ${gaps} known gap. Brain kept: ${root}\nReport: ${join(artifacts, "report.json")}`);
  process.exitCode = plain ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
