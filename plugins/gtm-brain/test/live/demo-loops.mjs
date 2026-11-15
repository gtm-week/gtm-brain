#!/usr/bin/env node
// The workshop demo as a live check (ALL-717): the two key loops, outreach lifecycle and content
// strategy, each a sequence of real Codex turns on one seeded brain, with a file-based check after
// every turn: what was saved, what was read, what file was written. Pass or fail per step.
//   node plugins/gtm-brain/test/live/demo-loops.mjs [outreach|content] [--stub [--fail <mode>]] [--step <id>] [--effort medium] [--brain-only]
// The brain is the e2e small shape (test/e2e/generate-brain.mjs) plus the records the story needs:
// filled ICP, strategy and voice documents, Zynt signals, customer words from calls, two project
// folders for drafts. Turns run through the production MCP server behind tool-routing-proxy.mjs
// (isolated Codex config, the question form answered as the person). Turns of a loop resume one
// Codex session; the last turn of each loop is a fresh chat, so the answer can only come from the brain.
// "Read" means the text reached the model: a seeded sentence in a successful tool result or in a shell
// command's output. A call that failed, or one that only names the thing, is not a read. A resumed turn
// counts what its session read in earlier turns: it is still in its context.
// Nothing is ever sent: connector results (Clay, Surfer, Gmail, Vercel) are told to Codex in the turn.
// --stub declares stub-gtm-tools.mjs to Codex beside GTM Brain (same isolated -c configuration) and drops the
// told results: Codex must call the test doubles of Clay, Zynt and Surfer, and the checks read the stub's call
// log. --fail expired_key|empty|rate_limit makes the stub fail (only --fail-tool's calls with that option);
// each step that calls a stub tool then has a failure check: Codex says what failed and saves nothing invented.
// --step runs only the named steps; --effort sets the model's reasoning effort (default medium).
// A step that fails because of a product gap carries known_gap, the way test/e2e/e2e.mjs marks them;
// the run exits 1 only on a plain failure. The brain and every trace are kept for inspection.
// --brain-only builds the seeded brain, prints its path and stops (the presenter's starting point).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
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
const shouts = text => text.replace(/<!--[\s\S]*?-->/g, "").replace(/!\[/g, "[").includes("!");   // a source comment or an image is not an exclamation
const frontmatter = f => Object.fromEntries((f.text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] || "").split("\n").map(l => l.match(/^([\w-]+):\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const drafts = (x, dir) => x.files.filter(f => f.path.startsWith(`projects/${dir}/`) && /\.(md|txt)$/.test(f.path) && !/(^|\/)(AGENTS|CLAUDE)\.md$/.test(f.path));
const noSaves = x => need(!x.added.length, `saved ${x.added.length} note(s) on a turn that saves nothing`);
const noSend = x => need(!x.added.some(m => (m.actions || []).some(a => /send/i.test(a.action || ""))) && !x.calls.some(c => /send|gmail/i.test(c.tool)), "recorded or attempted a send on a draft-only turn");
const saved = (x, re, why) => need(x.added.some(m => re.test(JSON.stringify(m))), why);
const saw = (x, re, why) => need(x.saw(re), why);            // the text reached the model, by a tool result or a command's output
const sawBrain = (x, re, why) => need(x.sawBrain(re), why);  // it came from a GTM Brain tool result, not from a file in the folder
// one sentence per seeded source, so "read the ICP" means the ICP document and not a call that names it
const SEEN = { icp: /Pharmacy chains/, signals: /Zynt signal: Fernbrook Outdoor/, voice: /No exclamation marks/, strategy: /Returns cost: what a manual return costs/, market: /none covers returns of online orders/, calls: /drown in return tickets|nobody there can process them/ };
const words = t => (t.match(/[A-Za-z0-9][\w'’-]*/g) || []).length;

export const STEPS = [
  { loop: "outreach", id: "o1-pick", shows: "accounts picked from the ICP and the signals",
    say: "We want to start outreach this week. From our ICP and the buying signals in the brain, which two accounts should we contact first, and why? Name the person to write to if we know one. Do not save anything yet.",
    check: x => all(saw(x, SEEN.icp, "did not read the ICP document"), saw(x, SEEN.signals, "did not read the signals"), need(has(x.reply, /Fernbrook/), "Fernbrook Outdoor (ICP fit with a fresh signal) not picked"), need(!/Umber Pharma[^.\n]{0,80}(first|contact|pick)/i.test(x.reply) || /not a fit|pharmac/i.test(x.reply), "picked Umber Pharma, which the ICP rules out"), noSaves(x)) },
  { loop: "outreach", id: "o2-enrich", shows: "Clay enrichment saved, the contact registered",
    say: "I ran Clay on Fernbrook Outdoor. It returned: 85 stores in Germany and Austria, about 1,400 employees, returns handled by hand in each store. Their Head of Operations is Lea Hoffmann, lea.hoffmann@fernbrook-outdoor.example, based in Munich. Save what Clay found.",
    check: x => all(saved(x, /Lea Hoffmann/, "no note names Lea Hoffmann"), saved(x, /85/, "store count not saved"), saved(x, /clay/i, "Clay not recorded as the source"),
      need(x.names.some(n => n.name === "Lea Hoffmann" && n.kind === "person"), "Lea Hoffmann is not a person in the registry"),
      need(x.names.some(n => n.name === "Lea Hoffmann" && n.emails.includes("lea.hoffmann@fernbrook-outdoor.example")) || x.added.some(m => m.content.includes("lea.hoffmann@fernbrook-outdoor.example")), "her email is kept nowhere")) },
  { loop: "outreach", id: "o3-draft", shows: "first email drafted in the company voice, nothing sent",
    say: "Draft the first outreach email to Lea, tied to the Zynt signal, in our tone of voice. Draft only: do not send anything. Put the draft as a Markdown file in the outbound project folder.",
    check: x => { const d = drafts(x, "outbound").find(f => /Lea/.test(f.text)); return all(saw(x, SEEN.voice, "did not read the tone of voice"), need(!!d, "no draft to Lea in projects/outbound/"), d ? need(!shouts(fileText(d)), `exclamation mark in ${d.path} (voice: none)`) : true, d ? need(/Head of Returns|returns/i.test(d.text), "the draft does not use the signal") : true, d ? need(/Marta/.test(d.text), "not signed Marta (voice)") : true, noSend(x)); } },
  { loop: "outreach", id: "o4-sent-reply", shows: "what was sent and the reply recorded, follow-up date kept",
    say: "I sent that email to Lea from Gmail on 11 November. She replied on 13 November: \"Interesting timing. We are in the middle of an ERP migration until January. Ping me after 10 January.\" Record both.",
    check: x => all(saved(x, /\bsent\b|\bsend/i, "the send is not recorded"), saved(x, /migration/i, "the reply is not recorded"), saved(x, /10 Jan|January 10|10 January|2027-01-10|Jan(uary)? 10/i, "the follow-up date is not kept"), need(x.added.some(m => JSON.stringify(m).includes("Lea Hoffmann") || JSON.stringify(m).includes(x.idOf("Lea Hoffmann"))), "the notes are not linked to Lea")) },
  { loop: "outreach", id: "o5-followup", shows: "follow-up drafted from her reply",
    say: "Draft the follow-up for 11 January that picks up her reply. Draft only, same folder.",
    check: x => { const d = drafts(x, "outbound").find(f => /migration|ERP/i.test(f.text) && /Lea/.test(f.text)); return all(need(!!d, "no follow-up in projects/outbound/ that picks up the ERP migration"), d ? need(!shouts(fileText(d)), `exclamation mark in ${d.path}`) : true, noSend(x)); } },
  { loop: "outreach", id: "o6-status", shows: "the call booked and the customer status updated in the brain",
    say: "Lea booked a pilot scoping call for 14 January. Fernbrook Outdoor is now a prospect for us. Record the call and their status in the brain. Do not touch the CRM.",
    check: x => all(need(x.customers.some(c => c.name === "Fernbrook Outdoor" && c.status === "prospect"), `customer overview: Fernbrook Outdoor is ${x.customers.find(c => c.name === "Fernbrook Outdoor")?.status || "absent"}, not prospect`), saved(x, /14 Jan|January 14|14 January|2027-01-14/i, "the 14 January call is not recorded"), need(!x.calls.some(c => /^(attio|hubspot)_/.test(c.tool)), "touched the CRM")) },
  { loop: "outreach", id: "o7-recall", fresh: true, shows: "a new chat knows the whole thread from the brain",
    say: "Where do we stand with Fernbrook Outdoor? Who is our contact, what happened so far, and what is next? Do not save anything.",
    check: x => all(sawBrain(x, /ERP migration/, "did not get the thread from the brain"), need(has(x.reply, /Lea Hoffmann|Lea/), "contact not named"), need(has(x.reply, /migration|ERP/i), "her reply is missing"), need(has(x.reply, /14 Jan|January 14|14 January|2027-01-14/i), "the 14 January call is missing"), need(has(x.reply, /prospect/i), "status missing"), noSaves(x)) },

  { loop: "content", id: "c1-topics", shows: "topics proposed from strategy, market, calls and the Surfer keywords",
    say: "Plan our blog. Read our strategy, the market notes and what customers said on calls. Surfer gave us these keywords (monthly searches, difficulty): 'returns automation for retailers' 1,900 / 34; 'reduce return rate retail' 880 / 22; 'store pickup returns' 320 / 12. Propose three posts for the landing page blog, each with its keyword and the customer words it uses. Do not save anything yet.",
    check: x => all(saw(x, SEEN.strategy, "did not read the strategy"), saw(x, SEEN.market, "did not read the market notes"), saw(x, SEEN.calls, "did not read what customers said on calls"), need(["returns automation for retailers", "reduce return rate retail", "store pickup returns"].filter(k => x.reply.toLowerCase().includes(k)).length >= 2, "fewer than two Surfer keywords used"), need(has(x.reply, /drown|Black Friday|return online orders in the store/i), "no customer words from the calls"), noSaves(x)) },
  { loop: "content", id: "c2-draft", shows: "the choice saved as a decision, the post drafted and SEO-checked",
    say: "Go with 'store pickup returns' first; save that as a decision. Then draft the post in our tone of voice: about 600 words, an SEO title under 60 characters, a meta description under 155 characters, one H1, the keyword in the title and in the first paragraph. Put the draft in the website project folder as Markdown, with title and description in its front matter.",
    check: x => {
      const d = drafts(x, "website").sort((a, b) => b.text.length - a.text.length)[0], fm = d ? frontmatter(d) : {}, body = d ? fileText(d) : "";
      const h1 = (body.match(/^# .+$/gm) || []).length, first = body.split(/\n\s*\n/).map(p => p.trim()).find(p => p && !p.startsWith("#")) || "";
      return all(saved(x, /store pickup/i, "the choice is not saved"), need(x.added.some(m => m.kind === "decision"), "not saved as a decision"), saw(x, SEEN.voice, "did not read the tone of voice"), need(!!d, "no draft in projects/website/"),
        d ? need(fm.title && fm.title.length <= 60 && /store pickup returns?/i.test(fm.title), `SEO title "${fm.title || ""}" (${(fm.title || "").length} chars) misses the rule`) : true,
        d ? need(fm.description && fm.description.length <= 155, `meta description is ${(fm.description || "").length} chars`) : true,
        d ? need(h1 === 1, `${h1} H1 headings`) : true, d ? need(/store pickup return/i.test(first), "keyword not in the first paragraph") : true,
        d ? need(words(body) >= 400 && words(body) <= 900, `${words(body)} words`) : true, d ? need(!shouts(body), "exclamation mark in the post (voice: none)") : true);
    } },
  { loop: "content", id: "c3-published", shows: "publication recorded with its URL",
    say: "The post went live today at https://reflow.example/blog/store-pickup-returns, deployed with the landing page on Vercel. Remember that it was published.",
    check: x => saved(x, /reflow\.example\/blog\/store-pickup-returns/, "the published URL is not saved") },
  { loop: "content", id: "c4-results", shows: "what the post produced, linked to the account it brought in",
    say: "Two weeks of numbers for that post: 1,240 visits, position 8 for 'store pickup returns', 3 demo requests, one of them from Lumen Outdoor. Record what it produced.",
    check: x => all(saved(x, /1,?240/, "visits not saved"), saved(x, /demo/i, "demo requests not saved"), need(x.added.some(m => (m.people || []).includes("Lumen Outdoor") || JSON.stringify(m.entities || []).includes(x.idOf("Lumen Outdoor"))), "not linked to Lumen Outdoor")) },
  { loop: "content", id: "c5-recall", fresh: true, shows: "a new chat reports what content produced and picks the next post",
    say: "What has our blog produced so far, and which post should come next? Do not save anything.",
    // the plan is one post per pillar and the store pickup pillar is published: the next post is one of the other two
    check: x => all(sawBrain(x, /1,?240/, "did not get the results from the brain"), need(has(x.reply, /store pickup returns|reflow\.example\/blog/i), "the published post is missing"), need(has(x.reply, /1,?240|\b3 demo|three demo/i), "the results are missing"), need(has(x.reply, /peak season|Black Friday|returns cost|cost of (a |each |every )?(manual )?returns?|returns automation for retailers|reduce return rate/i), "the next post is not one of the two pillars still open (returns cost, peak season)"), noSaves(x)) },
];

/* ---------- stub mode: Codex calls the test doubles in stub-gtm-tools.mjs instead of being told their results ----------
   The steps that used an outside tool ask Codex to call it, and their check also asserts: the right stub tool was
   called with criteria that came from the brain; what came back was saved as notes with a source pointing at the
   tool; the brain's tools list (work/tools.json, the dashboard's Tools) shows it as used; nothing was sent. */
export const STUB_SERVER = "gtm_test_tools";
const STUB_KIND = "gtm-test-tools";
const flatKind = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const fromStub = m => (m.source || []).some(s => s && (flatKind(s.kind) === flatKind(STUB_KIND) || /test-tools\.fixture\.test/.test(`${s.ref || ""} ${s.url || ""}`)));
const stubCalls = (x, tool) => (x.stub || []).filter(c => c.tool === tool && !c.isError);
const called = (x, tool, ok, why) => need(stubCalls(x, tool).some(c => ok(c.arguments || {}, c)), (x.stub || []).some(c => c.tool === tool) ? `${tool}: ${why}` : `${tool} was not called`);
const savedFromStub = (x, re, why) => need(x.added.some(m => fromStub(m) && re.test(JSON.stringify(m))), why);
const STUB_TOOL_NAMES = /gtm.?test.?tools|company.?search|company.?enrich|buying.?signals|keyword.?research|content.?score/i;
const listedAsUsed = x => need(Object.entries(x.toolsList || {}).some(([k, s]) => s && STUB_TOOL_NAMES.test(`${k} ${s.tool || ""} ${s.plugin || ""}`) && (s.test === "ok" || !!s.used)), "the brain's tools list does not show the stub tools as used (work/tools.json)");
const sentNothing = x => all(noSend(x), need(!x.commands.some(c => /\b(curl|wget|sendmail|mailx?|nc)\b/.test(c)), "a shell command could reach the network or send mail"));
const viaStub = (x, ...checks) => all(...checks, listedAsUsed(x), sentNothing(x));
const ICP_COUNTRIES = /germany|\bde\b|austria|\bat\b|poland|\bpl\b|dach/i;
const fromIcp = a => { const countries = (a.countries || []).filter(c => ICP_COUNTRIES.test(c)).length, text = JSON.stringify(a);
  return countries >= 2 && (/outdoor|home/i.test(JSON.stringify(a.industries || [])) || (a.stores_min >= 10 && a.stores_min <= 30) || (a.stores_max >= 150 && a.stores_max <= 250)) && !/pharmac/i.test(JSON.stringify(a.industries || [])) && text.length > 0; };
const names = list => (list || []).map(s => String(s).toLowerCase());
// a failure played by the stub (--fail): Codex says what happened and saves no data the tool did not return
const FAIL_SAYS = { expired_key: /expired|api key|\bkey\b|401|unauthori[sz]ed|sign(ed)? in|reconnect/i, empty: /no (results?|data|keywords?|match|companies|signals)|nothing (came back|was returned|returned|found)|found nothing|returned (nothing|no)|empty|not found|did not return|didn't return/i, rate_limit: /rate limit|429|too many|try again|retry/i };
export const failureCheck = (mode, tool, invented) => x => all(need((x.stub || []).some(c => c.tool === tool), `${tool} was not called`),
  need(FAIL_SAYS[mode].test(x.reply), `the reply does not tell the person the tool failed (${mode})`),
  need(!x.added.some(m => invented.test(JSON.stringify(m))), "saved data the tool did not return"), sentNothing(x));

const STUB = {
  "o1-pick": { say: "Check the prospects we saved with the buying signals tool and tell me which two accounts to contact first, and why. Name the person to write to if we know one. Save the signals you used.",
    shows: "signals checked for the saved prospects, two accounts picked, the signals saved",
    check: x => viaStub(x, called(x, "buying_signals", a => names(a.companies).some(c => c.includes("fernbrook")) && names(a.companies).some(c => /heron|juniper/.test(c)) && !names(a.companies).some(c => /umber|kestrel|glade/.test(c)), "not asked for the prospects saved in the brain"),
      need(has(x.reply, /Fernbrook/), "Fernbrook Outdoor (ICP fit, ready now) not picked"), need(!/Umber Pharma[^.\n]{0,80}(first|contact|pick)/i.test(x.reply) || /not a fit|pharmac/i.test(x.reply), "picked Umber Pharma, which the ICP rules out"),
      savedFromStub(x, /Head of Returns|in-store returns|returned in all 85 stores|Reverse Logistics/i, "the signals are not saved with a source pointing at the tool")),
    fail: failureCheck("rate_limit", "buying_signals", /ready (to buy )?now|Head of Returns job|Reverse Logistics Lead/i) },
  "o2-enrich": { say: "Enrich Fernbrook Outdoor with the company enrichment tool and save what it found, including the person to write to.",
    shows: "enrichment called and saved with its source, the contact registered",
    check: x => viaStub(x, called(x, "company_enrich", a => /fernbrook/i.test(a.company || ""), "not asked for Fernbrook Outdoor"),
      savedFromStub(x, /Lea Hoffmann/, "no note from the tool names Lea Hoffmann"), saved(x, /85/, "store count not saved"),
      need(x.names.some(n => n.name === "Lea Hoffmann" && n.kind === "person"), "Lea Hoffmann is not a person in the registry"),
      need(x.names.some(n => n.name === "Lea Hoffmann" && n.emails.includes("lea.hoffmann@fernbrook-outdoor.example")) || x.added.some(m => m.content.includes("lea.hoffmann@fernbrook-outdoor.example")), "her email is kept nowhere")),
    fail: failureCheck("expired_key", "company_enrich", /Lea Hoffmann|85 stores|1,?400 employees/i) },
  "o3-draft": { say: "Draft the first outreach email to Lea, tied to her company's buying signal, in our tone of voice. Draft only: do not send anything. Put the draft as a Markdown file in the outbound project folder." },
  "c1-topics": { say: "Plan our blog. Read our strategy, the market notes and what customers said on calls. Get keyword numbers for our content pillars from the keyword research tool. Propose three posts for the landing page blog, each with its keyword and the customer words it uses. Save the keyword numbers you used as one note, with where they came from.",
    shows: "topics from strategy, market and calls, keywords from the research tool, the numbers saved with their source",
    check: x => viaStub(x, saw(x, SEEN.strategy, "did not read the strategy"), saw(x, SEEN.market, "did not read the market notes"), saw(x, SEEN.calls, "did not read what customers said on calls"),
      called(x, "keyword_research", a => /pickup|cost|peak|black friday/i.test(JSON.stringify(a.seeds || [])), "the seeds are not the content pillars from the strategy"),
      need(["returns automation for retailers", "reduce return rate retail", "store pickup returns", "buy online return in store", "black friday returns", "cost of processing returns", "retail returns process"].filter(k => x.reply.toLowerCase().includes(k)).length >= 2, "fewer than two keywords from the tool used"),
      need(has(x.reply, /drown|Black Friday|return online orders in the store/i), "no customer words from the calls"), savedFromStub(x, /\b(320|1,?900|880|1,?300|2,?400|390|720)\b/, "the keyword numbers are not saved with a source pointing at the tool")),
    fail: failureCheck("empty", "keyword_research", /\b(\d[\d,]*)\s*(monthly )?(searches|volume)|volume[^.]{0,20}\d|\b(320|1,?900|880)\b/i) },
  "c2-draft": { say: "Go with 'store pickup returns' first; save that as a decision. Then draft the post in our tone of voice: about 600 words, an SEO title under 60 characters, a meta description under 155 characters, one H1, the keyword in the title and in the first paragraph. Put the draft in the website project folder as Markdown, with title and description in its front matter. Score the draft with the content score tool, fix what it flags, and save the final score as a note with where it came from.",
    shows: "the choice saved as a decision, the post drafted, scored by the tool and the score saved",
    check: x => { const told = STEPS.find(s => s.id === "c2-draft").check(x); return viaStub(x, told,
      called(x, "content_score", a => /store pickup returns?/i.test(a.keyword || "") && String(a.content || "").length > 1500, "not asked to score the store pickup returns draft"),
      savedFromStub(x, /score/i, "the score is not saved with a source pointing at the tool")); } },
};
const SEARCH = { loop: "outreach", id: "o0-search", stub: true, shows: "companies found by the ICP criteria, the fits saved as prospects",
  say: "We want to start outreach this week. Search for companies that fit our ICP with the company search tool, using the criteria in our ICP document. Save the ones that fit as prospects, one note each, with where they came from. Do not contact anyone.",
  check: x => viaStub(x, saw(x, SEEN.icp, "did not read the ICP document"), called(x, "company_search", fromIcp, "the criteria are not the ICP's (regions, industries, store count)"),
    savedFromStub(x, /Fernbrook Outdoor/, "Fernbrook Outdoor is not saved from the search"), savedFromStub(x, /Heron Home|Juniper Haus/, "the other fits are not saved from the search"),
    need(!x.added.some(m => /Umber Pharma|Kestrel Sports|Glade Market|Larkspur Garden/.test(m.content) && !/not a fit|rule[sd]? out|excluded|too small/i.test(m.content)), "saved a company the ICP rules out as a prospect")),
  fail: failureCheck("expired_key", "company_search", /Juniper Haus|Pinewood Living/) };
// the told steps, with the stub variants and the search step in front of the outreach loop
export const STUB_STEPS = STEPS.flatMap(s => [...(s.id === "o1-pick" ? [SEARCH] : []), STUB[s.id] ? { ...s, ...STUB[s.id], stub: !!STUB[s.id].check } : s]);
export const stepsFor = stub => stub ? STUB_STEPS : STEPS;

/* ---------- running ---------- */
const readJSONL = p => existsSync(p) ? readFileSync(p, "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
function snapshot(root) {
  const out = new Map();
  const walk = dir => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name), rel = relative(root, p); if (/^(\.git|work|brain)(\/|$)/.test(rel)) continue; if (e.isDirectory()) walk(p); else if (statSync(p).size < 1 << 20) out.set(rel, createHash("sha1").update(readFileSync(p)).digest("hex")); } };
  walk(root); return out;
}

const USAGE = "usage: demo-loops.mjs [outreach|content] [--stub [--fail expired_key|empty|rate_limit [--fail-tool <tool>]]] [--step <id>[,<id>]] [--effort low|medium|high] [--brain-only]";
export function parseArgs(args) {
  const o = { loops: [], stub: false, fail: "", failTool: "", steps: [], effort: process.env.GTM_BRAIN_EVAL_EFFORT || "medium", brainOnly: false, error: "" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i], value = () => args[++i] ?? "";
    if (a === "outreach" || a === "content") o.loops.push(a);
    else if (a === "--stub") o.stub = true;
    else if (a === "--brain-only") o.brainOnly = true;
    else if (a === "--fail") o.fail = value();
    else if (a === "--fail-tool") o.failTool = value();
    else if (a === "--step") o.steps.push(...value().split(",").filter(Boolean));
    else if (a === "--effort") o.effort = value();
    else o.error = `unknown argument: ${a}`;
  }
  const ids = new Set([...STEPS, ...STUB_STEPS].map(s => s.id));
  if (!o.error && o.fail && !["expired_key", "empty", "rate_limit"].includes(o.fail)) o.error = `unknown failure: ${o.fail}`;
  if (!o.error && (o.fail || o.failTool) && !o.stub) o.error = "--fail needs --stub";
  if (!o.error && o.steps.some(id => !ids.has(id))) o.error = `unknown step: ${o.steps.filter(id => !ids.has(id)).join(", ")}`;
  if (!o.error && !["low", "medium", "high", "xhigh"].includes(o.effort)) o.error = `unknown effort: ${o.effort}`;
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.error) { console.error(`${o.error}\n${USAGE}`); process.exitCode = 2; return; }
  const lib = await import(`${P}/lib/brain.mjs`), { customerOverview } = await import(`${P}/lib/customers.mjs`);
  const base = resolve(process.env.GTM_BRAIN_EVAL_DIR || tmpdir()), artifacts = mkdtempSync(join(base, "gtm-demo-loops-"));
  // the generator gives the brain a scratch profile (never the real one); the server keeps using it, codex keeps the person's sign-in
  const { root, by } = await buildBrain(join(artifacts, "brain")), profile = process.env.CODEX_HOME;
  console.log(`Brain: ${root}\nArtifacts: ${artifacts}${o.stub ? `\nMode: stub tools${o.fail ? `, failing with ${o.fail}${o.failTool ? ` on ${o.failTool}` : ""}` : ""}` : "\nMode: told results"} · effort ${o.effort}`);
  if (o.brainOnly) return;
  // the model retypes this path in shell commands and gets a long hashed checkout path wrong: give it a short one beside the brain
  const pluginPath = join(artifacts, "plugin"); symlinkSync(P, pluginPath, "dir");
  // stub mode lets the model record that a tool returned data (mark_tool): the brain's tools list is part of the check
  const env = { ...process.env, CODEX_HOME: profile, GTM_BRAIN_EVAL_PROFILE: profile, PLUGIN_ROOT: P, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_EVAL_ALLOW: o.stub ? "workflow,mark_tool" : "workflow" };
  const agentEnv = { ...env }; delete agentEnv.CODEX_HOME; if (process.env.GTM_BRAIN_CODEX_HOME) agentEnv.CODEX_HOME = process.env.GTM_BRAIN_CODEX_HOME;
  const stubLog = join(artifacts, "stub-calls.jsonl");
  // Codex filters the environment of an MCP server it starts: what the proxy and the server must see goes in its env table
  const serverEnv = Object.entries({ GTM_BRAIN_EVAL_PROFILE: profile, GTM_BRAIN_EVAL_ALLOW: env.GTM_BRAIN_EVAL_ALLOW, GTM_BRAIN_NO_WATCH: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_OPEN: "1" }).filter(([, v]) => v)
    .flatMap(([k, v]) => ["-c", `mcp_servers.gtm_brain_eval.env.${k}=${JSON.stringify(v)}`]);
  const stubArgs = [`${P}/test/live/stub-gtm-tools.mjs`, "--log", stubLog, ...(o.fail ? ["--fail", o.fail] : []), ...(o.failTool ? ["--fail-tool", o.failTool] : [])];
  const results = [];
  const steps = stepsFor(o.stub).filter(s => !o.steps.length || o.steps.includes(s.id));
  for (const loop of ["outreach", "content"].filter(l => !o.loops.length || o.loops.includes(l))) {
    const trace = join(artifacts, `${loop}-mcp.jsonl`); let session = null, seen = [];   // seen: the texts the resumed session has read so far, still in its context
    const preamble = `This is a synthetic GTM Brain company brain at ${root}, used for a workshop demo. You work for Marta Nowak, confirmed handle ${by}. Use only this synthetic brain and the plugin's workflow instructions; do not read real account data or other company files. ${o.stub ? `Nothing is ever sent or published from this chat: Gmail and Vercel are not connected, and what they returned is told to you. The company data, buying signals and SEO tools are the ${STUB_SERVER} tools in this chat.` : "Nothing is ever sent or published from this chat: Clay, Surfer, Gmail and Vercel are not connected, and what they returned is told to you."} The plugin build under test is ${pluginPath}; use its skills/gtm-brain-use-brain/SKILL.md and the procedures it references.\n\n`;
    for (const step of steps.filter(s => s.loop === loop)) {
      const fresh = !session || step.fresh, before = { trace: readJSONL(trace).length, stub: readJSONL(stubLog).length, notes: new Set(lib.listContexts(root).flatMap(c => c.memories.map(m => m.id))), files: snapshot(root) };
      const events = join(artifacts, `${step.id}-agent.jsonl`), final = join(artifacts, `${step.id}-final.txt`);
      const mcp = ["-c", "features.apps=false", "-c", "approval_policy=\"never\"", "-c", "sandbox_mode=\"workspace-write\"",
        "-c", `mcp_servers.gtm_brain_eval.command=${JSON.stringify(process.execPath)}`,
        "-c", `mcp_servers.gtm_brain_eval.args=${JSON.stringify([`${P}/test/live/tool-routing-proxy.mjs`, root, trace, step.answer || "", "", "", P])}`,
        ...serverEnv, "-c", "mcp_servers.gtm_brain_eval.tool_timeout_sec=120", "-c", `model_reasoning_effort=${JSON.stringify(o.effort)}`,
        ...(o.stub ? ["-c", `mcp_servers.${STUB_SERVER}.command=${JSON.stringify(process.execPath)}`, "-c", `mcp_servers.${STUB_SERVER}.args=${JSON.stringify(stubArgs)}`, "-c", `mcp_servers.${STUB_SERVER}.tool_timeout_sec=30`] : [])];
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
      const done = ev.filter(e => e.type === "item.completed" && e.item?.type === "command_execution");
      const commands = done.map(e => String(e.item.command || ""));
      const records = readJSONL(trace).slice(before.trace), calls = records.filter(r => r.kind === "call"), stub = readJSONL(stubLog).slice(before.stub);
      // a save from a tool the tools list does not know starts a tools check in the background; the eval server runs
      // without committing, which skips it (remember.mjs), so the harness runs the same check before reading the list
      if (o.stub && stub.length) spawnSync(process.execPath, [`${P}/scripts/gtm-brain-connect/connect.mjs`, root, "--check"], { cwd: root, env: { ...env, CODEX_HOME: profile, GTM_BRAIN_CODEX_TIMEOUT: "20000" }, stdio: "ignore", timeout: 60000 });
      let toolsList = {}; try { toolsList = JSON.parse(readFileSync(join(root, "work", "tools.json"), "utf8")); } catch {}
      const after = snapshot(root), files = [...after].filter(([p, h]) => before.files.get(p) !== h).map(([p]) => ({ path: p, text: readFileSync(join(root, p), "utf8") }));
      const added = lib.listContexts(root).flatMap(c => c.memories).filter(m => !before.notes.has(m.id));
      const reply = existsSync(final) ? readFileSync(final, "utf8").trim() : "";
      const names = lib.readNames(root), idOf = n => names.find(e => e.name === n)?.id || "\u0000";
      const text = r => (r.result?.content || []).map(c => c.text || "").join("\n");
      const fromBrain = records.filter(r => r.kind === "result" && !r.result?.isError).map(text), fromShell = done.map(e => String(e.item.aggregated_output || ""));
      const context = step.fresh ? [...fromBrain, ...fromShell] : [...seen, ...fromBrain, ...fromShell];
      if (!step.fresh) seen = context;
      const skill = context.some(t => /^name: gtm-brain-use-brain/m.test(t));   // without it the turn ran on the tool descriptions alone
      const x = { reply, calls, stub, toolsList, commands, added, files, names, idOf, customers: customerOverview(root).customers, saw: re => context.some(t => re.test(t)), sawBrain: re => fromBrain.some(t => re.test(t)) };
      // a played failure is judged by what Codex told the person and saved, on the steps that call a stub tool
      const check = o.fail ? step.fail : step.check;
      let verdict; try { verdict = !check ? "no failure check for this step" : run.code === 0 && !run.timedOut ? check(x) : `codex ${run.timedOut ? "timed out" : `exited ${run.code}`}`; } catch (e) { verdict = `check threw: ${e.message}`; }
      const r = { loop, id: step.id, shows: step.shows, pass: verdict === true, why: verdict === true ? "" : verdict, ...(verdict !== true && step.known_gap ? { known_gap: step.known_gap } : {}), seconds: Math.round((Date.now() - started) / 1000),
        skill_read: skill, brain_calls: calls.length, stub_calls: stub.length, tools: calls.map(c => c.tool), stub_tools: stub.map(c => `${c.tool}${c.isError ? " (error)" : ""}`), saved: added.map(m => `${m.context} [${m.kind}] ${m.content.slice(0, 160)}`), files: files.map(f => f.path), reply: reply.slice(0, 1200), events, trace };
      results.push(r);
      console.log(`${r.pass ? "PASS" : r.known_gap ? "GAP " : "FAIL"}  ${step.id.padEnd(14)} ${String(r.seconds).padStart(4)}s  ${String(r.brain_calls).padStart(2)} brain ${String(r.stub_calls).padStart(2)} stub  ${step.shows}${r.why ? `\n      why: ${r.why}${r.known_gap ? ` (known gap: ${r.known_gap})` : ""}` : ""}\n      tools: ${r.tools.join(" > ") || "none"}${r.stub_tools.length ? `\n      stub: ${r.stub_tools.join(" > ")}` : ""}${commands.length ? `\n      shell: ${commands.length} command(s)` : ""}${skill ? "" : "\n      note: the workflow instructions (SKILL.md) were not read in this chat"}${r.saved.length ? `\n      saved: ${r.saved.join("\n             ")}` : ""}${r.files.length ? `\n      files: ${r.files.join(", ")}` : ""}`);
    }
  }
  writeFileSync(join(artifacts, "report.json"), JSON.stringify({ brain: root, model, effort: o.effort, mode: o.stub ? "stub" : "told", fail: o.fail || null, plugin: P, results }, null, 2) + "\n");
  const plain = results.filter(r => !r.pass && !r.known_gap).length, gaps = results.filter(r => !r.pass && r.known_gap).length;
  console.log(`\n${results.filter(r => r.pass).length} of ${results.length} steps pass, ${plain} fail, ${gaps} known gap. Brain kept: ${root}\nReport: ${join(artifacts, "report.json")}`);
  process.exitCode = plain ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
