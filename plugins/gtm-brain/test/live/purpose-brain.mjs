// The "purpose" task set of shape-bench.mjs: the jobs a company brain is made for, not general question answering.
// Two parts:
//   install(folder)  fills a COPY of a built brain with Northfold's base documents (ICP, voice, strategy, market),
//                    the team's rules, a concrete schema and outbound playbook, and plants the gaps the housekeeping
//                    task looks for. Called by shape-bench.mjs on its own copy, before the export, so the three
//                    shapes hold exactly the same content. The source build is never written.
//   TASKS            about 14 tasks, each with a checklist written before any run.
// Every name is made up. The facts rest only on the STORY notes of versus-history.mjs (stable across seeds) and on
// what install() writes; the filler accounts are never asked about.
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const DAY = "2026-11-16";
const head = (title, applies, extra = "") => `---\nkind: document\n${extra}title: ${title}\napplies_to: [${applies}]\nstatus: approved\nby: anna-lind\nupdated: ${DAY}\n---\n`;

/* ---- the base documents ---- */
export const DOCS = {
  "configuration/about-us/icp.md": `${head("Ideal customer profile", "icp, targeting, prospecting, outreach, account research")}# Ideal customer profile

Who Northfold sells to and who it does not. Owner: Anna Lind. Last reviewed 2026-11-16.

## Best customers today

- Acme Retail: 140 stores plus web, about 22,000 returns a month. Came for refund time.
- Kestrel Outdoor: 60 stores plus 18 outlets, about 12,000 returns a month, signed after a pilot.
- Harbor & Pine: online-only furniture, about 6,000 returns a month, Business Central ERP.

## Company: industry, size, region, signals

- Mid-size retailers in fashion, sports, outdoor, home and kids, selling in stores and online.
- Size: 3,000 to 25,000 processed returns a month. Under 2,000 a month the per-return model does not pay off for them.
- Platform: Shopify Plus, or any shop with an ERP we connect to (Microsoft Dynamics 365 Business Central today).
- Region: Europe, data kept in the EU. Outbound goes only to Nordic retailers on Shopify Plus for the two quarters after 2026-06-25, so until the end of 2026 (decision of 2026-06-25).
- Signals: returns re-keyed by hand into the ERP, refunds that take more than 5 days, returns handled in two places (stores and web) with no shared view, a new warehouse opening.

## Who buys: roles, who decides, who blocks

- Champion: Head of Ecommerce, Head of Ecommerce Operations, Director of Operations or COO. They feel the refund delays.
- Decision maker: the COO or the CFO. The CFO signs and asks about volume and price.
- Blocker: IT, through the security review (EU data, SSO, data retention). Plan 2 to 5 weeks for it.

## Problems we solve for them

1. Refund time: customers wait 7 to 10 days for a refund; with Northfold it is 2 days.
2. Hand re-keying: warehouse teams type every return into the ERP; Northfold posts it to the ERP.
3. Two places: store returns and web returns sit in different systems; Northfold shows them in one queue.

In outreach, lead with the problem the notes say this prospect has. When the notes say nothing, lead with refund time.

## Not a fit

- Shops on Magento: we have no Magento connector and are not building one in 2026 (decision of 2026-06-12).
- Retailers under 2,000 returns a month.
- A former customer who left us: never a prospect again (team rule).
- A buyer who needs a SOC 2 report before signing: we have none yet (see Strategy).
- UK retailers, for outbound, until the end of 2026.
`,
  "configuration/about-us/voice.md": `${head("Tone of voice", "copy, outreach, emails, posts, landing pages")}# Tone of voice

How Northfold sounds in every email, post and page. Owner: Anna Lind.

## How we sound, in three words

Plain, specific, calm.

## Do

- Keep a first email under 120 words. Three short paragraphs at most.
- Write the subject line in lowercase, at most six words, no punctuation at the end.
- Open with something true about them from our own notes (a call, a number, a problem they named). Never open with ourselves.
- Use numbers as digits: "2 days", "14,000 returns a month".
- One ask at the end, as a question, for a 20 minute call. Offer no more than one link.
- Sign with the sender's first name only.

## Do not

- No exclamation marks.
- No "I hope this finds you well", "just checking in", "circling back", "quick question".
- No claims we cannot show: no "best", "leading", "number one".
- No price in a first email.
- Never say "AI-powered".

## Words we use, words we avoid

- Use: returns, refunds, refund time, warehouse, stores, re-keying, queue.
- Avoid: reverse logistics, synergy, leverage, seamless, revolutionize, cutting-edge, solution.

## Examples we like

> subject: refunds in 2 days, not 9
>
> Hi Jonas, when we spoke in April you said refunds took 9 days across your 140 stores. Acme Retail now pays most refunds in 2 days, without anyone re-keying returns.
>
> Worth 20 minutes next week to see how?
>
> Maya
`,
  "configuration/about-us/strategy.md": `${head("Strategy", "strategy, planning")}# Strategy

Owner: Anna Lind. Last reviewed 2026-11-16.

## What winning looks like

- 15 signed customers by the end of 2027 (6 signed so far, one of them, Quarry Lane Books, churned).
- Refund time under 2 days at every live customer.
- Net revenue retention above 110 percent: customers add warehouses and stores.

## Where we play

- Mid-size omnichannel retailers in the Nordics first, then Northern Europe (see the ICP).
- Outbound: Nordic retailers on Shopify Plus only, until the end of 2026. Karl runs it; Maya closes.

## How we win

- ERP depth: we post returns straight into the ERP, where the cheap tools stop at a returns portal.
- Refund time we can show: 2 days at Acme Retail and Kestrel Outdoor.
- We do not win on price and do not match a competitor's price. We sell the ERP depth instead.

## Offer and price

- 0.35 EUR per processed return plus a 1,800 EUR monthly platform fee, for new contracts since 2026-08-11. Existing customers keep their price until renewal.
- Annual contracts only (since 2026-06-03).
- A volume tier for large accounts is being worked out with Copperline Shoes; until it is approved there is no tier.

## What we are not doing

- No Magento connector in 2026.
- SOC 2: no report yet; the audit is planned for 2027, with no date promised.

## How we run it

- Every customer has a quarterly business review.
- Customer success (Ines Kowal) owns onboarding and promises made after signing; the account executive owns renewal.
`,
  "configuration/about-us/market.md": `${head("Market", "market, competitors, positioning, pricing, battle cards, category")}# Market

The market Northfold sells into. Owner: Anna Lind.

## Category and size

Returns automation for retailers: the returns portal, the warehouse check-in, the refund and the posting to the ERP. Our part of it is the mid-size omnichannel retailer in Europe.

## Competitors

- Backhaul Labs: cheap and fast to set up. Offered Kestrel Outdoor 0.25 EUR per return with no platform fee. Talking to Copperline Shoes and pitched Brightwater Apparel. Weak on ERP: no posting to the ERP.
- Tidewater Returns: has a native Magento connector. Won Lumen Lighting Co from us on that alone.
- Spreadsheets and the carrier portal: the status quo at most small prospects.

## How we win, how we lose

- We win where returns are re-keyed into an ERP and where refund time is a board topic.
- We lose on Magento (no connector) and on price with small or price-first buyers (Velo District, Brightwater Apparel's budget).

## Pricing in the market

Backhaul Labs prices per return only, about 0.25 EUR. We charge more and include the ERP posting; see Strategy for our price.

## Trends we watch

- Retailers charging for returns by mail and keeping store returns free.
- Peak returns in January, after the holiday wave.
`,
  "workflows/outbound.md": `---
kind: document
type: workflow
title: Outbound
applies_to: [outbound campaign]
status: draft
trigger: manual
reads: ["kind:organization", "kind:person", "tool:crm", "tool:sequencer"]
writes: ["tool:sequencer"]
by: anna-lind
updated: ${DAY}
---
# Outbound

How Northfold runs outbound to one target account: one sequence, one offer, one owner. Karl Vesper runs it; Maya Ostrom takes over when a meeting is booked.

## Before starting

- **Target account**: the company, and why it fits the ICP.
- **Why now**: the trigger behind this run, in one sentence.
- **Owner**: who replies when the prospect answers.
- **Sequencer**: which outreach tool sends the sequence.

## Steps

1. **Pick the contacts** (tool: crm). Two or three people at the account who match the ICP's buying roles, with the reason for each. Milestone: a note tagged target-list.
2. **Write the sequence** (tool: sequencer). Three touches, following the tone of voice document: the first opens with a fact from our notes, no price in it. Milestone: a note tagged sequence-written.
3. **Launch** (tool: sequencer). Load the contacts, start the sequence, note the start date. Milestone: a note tagged sequence-launched.
4. **Read replies and book** (tool: crm). Replies, meetings booked, bounces; hand a warm reply to Maya. Milestone: a note tagged replies-read. Gate: after 10 days.

## Learn

- Reply rate and meetings booked, against the last outbound run.
- Which opening fact got the reply.
`,
};

/* ---- the team's rules: one line each, in "Our rules" of rules.md ---- */
export const RULES = [
  "- A former customer who left us is never a prospect again: no outbound, no win-back emails, not on any list. (Anna, 2026-07-14)",
  "- No quote below the list price goes out in writing, and we never match a competitor's price. (Anna, 2026-09-18)",
  "- Never put a price in a first email to a prospect. (Anna, 2026-06-25)",
  "- Ask Anna before saving anything about pricing. (Anna, 2026-04-30)",
];

/* ---- the schema: the organization fields the work needs; returns volume is what the ICP turns on ---- */
function schemaEdit(text) {
  return text
    .replace("| website | Main website | yes |", "| website | Main website | no |")
    .replace("| industry | Their market, in a few words | yes |", "| industry | Their market, in a few words | no |")
    .replace(/(\| segment \|[^\n]*\n)/, "$1| returns_per_month | Processed returns a month, roughly; the ICP's size test. Every customer and prospect needs one | yes |\n| platform | Their shop platform, for example Shopify Plus or Magento 2 | no |\n");
}

/* ---- planted for housekeeping and the conflict: notes as the team wrote them, plus one duplicate person.
   Fjordline Sports, a signed customer, has no returns volume in the story notes: that gap is there already.
   The design system document is left as the shipped template: the unfilled base document. ---- */
export const PLANTED = [
  { at: "2026-10-07", kind: "question", tags: ["brain-question"], content: "Does the Harbor & Pine Gothenburg warehouse go on their current contract, or does it need an addendum with its own volumes? Asked after the 2026-10-06 note that Harbor & Pine wants Northfold running in Gothenburg; nobody has answered yet." },
  { at: "2026-11-06", content: "2026-11-06, Karl Vesper (SDR, outbound): Hanna Bergh (Head of Ecommerce, Fjordline Sports) asked for the return reasons export for their buyers. Sent her the guide.", person: "Hanna Bergh" },
  { at: "2026-11-08", content: "2026-11-08, Karl Vesper (SDR, outbound): Copperline Shoes: Felix Moreau told me he signs off on the Copperline contract himself; Greta only checks the numbers." },
  { at: "2026-11-11", content: "2026-11-11, Maya Ostrom (account executive): Copperline Shoes: Greta Lund told me she has the final say on the Copperline contract and Felix recommends. The revised proposal goes to her." },
];

/* The profile's own plugin (the version the structured shape runs), else this checkout's. */
function libFor(profile) {
  const cache = profile ? join(profile, "plugins", "cache", "gtm-brain", "gtm-brain") : "";
  const ver = cache && existsSync(cache) ? readdirSync(cache).filter(v => existsSync(join(cache, v, "lib", "brain.mjs"))).sort().pop() : null;
  return ver ? join(cache, ver, "lib") : new URL("../../lib/", import.meta.url).pathname;
}

/* Writes into folder (a copy), commits there. Returns what it did, for the manifest. */
export async function install(folder, { profile = null, env = process.env } = {}) {
  const done = [];
  for (const [path, text] of Object.entries(DOCS)) { writeFileSync(join(folder, path), text); done.push(path); }
  const rulesPath = join(folder, "configuration", "rules.md"), rules = readFileSync(rulesPath, "utf8");
  if (!rules.includes(RULES[0])) writeFileSync(rulesPath, `${rules.trimEnd()}\n\n${RULES.join("\n")}\n`);
  done.push("configuration/rules.md");
  const schemaPath = join(folder, "configuration", "schema.md"), schema = schemaEdit(readFileSync(schemaPath, "utf8"));
  if (!schema.includes("returns_per_month")) throw new Error("schema.md: the organization table was not found");
  writeFileSync(schemaPath, schema); done.push("configuration/schema.md");
  // the planted notes go through the brain's own write path (entity resolution, validation, the month file)
  const libDir = libFor(profile), lib = await import(pathToFileURL(join(libDir, "brain.mjs")).href);
  for (const p of PLANTED) {
    if (p.person && !lib.readNames(folder).some(e => e.name === p.person)) lib.addName(folder, p.person, { kind: "person" });
    const r = lib.appendMemory(folder, "company", { authors: ["anna-lind"], kind: p.kind || "note", tags: p.tags || [], content: p.content, at: `${p.at}T12:00:00.000Z`, source: [{ kind: "user", ref: "team history notes" }] });
    done.push(`memory ${r.rec.id}`);
  }
  try { const ents = await import(pathToFileURL(join(libDir, "entities.mjs")).href); ents.refreshEntityPages?.(folder); } catch {}
  // the disposable search index and pages are rebuilt from the files at the first call
  const work = join(folder, ".gtm-brain");
  for (const f of existsSync(work) ? readdirSync(work) : []) if (/^memory-index|^entity-pages|^memory-appends$|^render-state|^home$/.test(f)) rmSync(join(work, f), { recursive: true, force: true });
  execFileSync("git", ["-C", folder, "add", "-A"], { env });
  execFileSync("git", ["-C", folder, "-c", "commit.gpgsign=false", "commit", "-qm", "shape bench: Northfold base documents, rules, schema and planted notes", "--no-verify"], { env });
  return { lib: libDir, wrote: done };
}

/* ---- the tasks. turns: each in a NEW chat; the last is the one judged, the earlier ones are shown to the judge
   with what the assistant replied and what it wrote. ---- */
const P = (id, group, turns, checklist, extra = {}) => ({ id, set: "purpose", group, turns, checklist, ...extra });
export const TASKS = [
  P("p-email", "outbound", ["Write the email to Clara Voss at Acme Homeware that reopens the conversation in January. First email of the new year, ready to send."], [
    "follows the voice document's checkable traits: under 120 words, a lowercase subject of at most six words, no exclamation marks, no banned phrases or words (seamless, leverage, solution, circling back, ...), one ask for a 20 minute call, signed with a first name only",
    "opens with true facts about Acme Homeware from the notes: the 2026-10-16 demo with Clara Voss and Ben Ashby, that they liked it, no budget until 2027, that they said to come back in January; Shopify Plus or about 5,000 returns a month may be used",
    "addresses a problem the ICP names (refund time, hand re-keying, store and web returns in two places) without inventing a problem Acme Homeware never named as theirs",
    "breaks no team rule: no price at all in this first email; and no fact of Acme Retail (a different company: 140 stores, PostNord, Jonas Reed) used as if it were Acme Homeware",
  ]),
  P("p-fit-yes", "fit", ["Is Copperline Shoes a fit for us, and why?"], [
    "says yes, a fit, on the ICP's tests: about 14,000 returns a month (inside 3,000 to 25,000) across web and 48 stores (omnichannel, the best segment)",
    "names what the notes do not settle, or does not claim it: their shop platform and ERP are not in the notes",
    "names the real risks from the notes: Felix Moreau said the per-return price gets painful at their volume, they also talk to Backhaul Labs, and Greta Lund (CFO) asked for a volume tier",
    "states no rule that excludes them (none does), and invents no price tier: the revised proposal with a volume tier is promised by 20 November",
  ]),
  P("p-fit-no", "fit", ["Is Lumen Lighting Co a fit for us, and why?"], [
    "says no, not now: they run Magento 2 and we have no Magento connector and are not building one in 2026 (decision 2026-06-12; the ICP lists Magento shops as not a fit)",
    "uses the history: Victor Ames (Head of Digital) asked about Magento twice at the 2026-05-27 demo, and they went with Tidewater Returns in June because of its native Magento connector, not on price",
    "does not suggest pursuing them now on another argument, such as price",
  ]),
  P("p-brief", "brief", ["I have the Acme Retail quarterly review on Thursday. Brief me: where we stand, what we still owe them, and who is who there now. One screen."], [
    "the review is on 19 November 2026 (quarterly reviews agreed on 2026-08-26)",
    "renewal is 1 February 2027 (moved by the warehouse expansion addendum signed 2026-10-08), not 1 December 2026",
    "promises: the PostNord label integration was delivered on 2026-07-28, so it is done, not open; the August platform fee waiver Anna promised Mira Okafor after the 2026-08-06 outage is not recorded as done, so it is open or to be confirmed",
    "contacts by name and role: Jonas Reed (Head of Ecommerce Operations), Mira Okafor (CFO, signed), Theo Grant (IT, ran the security review); no one from another company",
  ]),
  P("p-brief-2", "brief", ["Brief me on Harbor & Pine before I call them about their renewal: current facts only, what is open, and who I should talk to."], [
    "renewal talks go through Rafael Duarte, the new CFO, who holds the tools budget since 2026-09-22; Tessa Brandt (COO) signed in May but no longer holds the budget; Nils Odegaard is the day to day contact (warehouse manager)",
    "open: the second warehouse in Gothenburg they want Northfold running in (asked 2026-10-06, Nils coordinating), and the open question whether it goes on the current contract or needs an addendum",
    "closed, not open: the split-shipment refund bug from 2026-10-27 was fixed and backfilled on 2026-11-04, confirmed by Tessa and Rafael; it may be named as recent history",
    "current facts only: online-only furniture, about 6,000 returns a month, Microsoft Dynamics 365 Business Central; no invented renewal date (the notes give none)",
  ]),
  P("p-workflow", "workflow", [
    "Start an outbound run for Brightwater Apparel, following our outbound playbook. Target account: Brightwater Apparel; Ola Fenn knows us from Kestrel. Why now: Backhaul Labs pitched them and their CEO wants a better price, so we lead with ERP depth. Owner: Karl. Sequencer: our usual sequencer. Get it started and record where it stands.",
    "Where are we with the outbound for Brightwater Apparel, and what is the next step?",
    "Brightwater outbound: the contacts are picked, Ola Fenn (Head of CX) and Dana Pruitt (CEO), and I have written the sequence, three touches, the first opens with Ola's time at Kestrel. Record both steps as done.",
    "Where are we with the Brightwater Apparel outbound now, and what is next?",
  ], [
    "the first chat started a run that a later chat can find (it is recorded with its start date and the target account, owner, why now and sequencer), and did not invent steps outside the playbook",
    "the second chat, in a new chat, finds the run and names the next step in the playbook's order: step 1, pick the contacts (or step 2 if the first chat already recorded the contacts)",
    "the third chat records steps 1 and 2 as done with the contacts and the sequence as told",
    "the last chat, in a new chat, says steps 1 and 2 are done and the next step is step 3, Launch, with step 4 (read replies) gated 10 days after launch",
    "no step is presented out of order, and nothing claims the sequence was launched or sent",
  ]),
  P("p-housekeeping", "housekeeping", ["What needs my attention in our records? Anything missing, unanswered or duplicated."], [
    "a base document left unfilled: the design system document is still the empty template",
    "a required field missing: Fjordline Sports, a signed customer, has no returns volume recorded, which the schema requires (listing other accounts with the same gap is fine)",
    "a question nobody answered: whether the Harbor & Pine Gothenburg warehouse goes on the current contract or needs an addendum (other open questions in the records also count)",
    "a duplicate: Hanna Berg and Hanna Bergh are the same person (Head of Ecommerce at Fjordline Sports)",
  ], { judge_note: "Score on the four planted items. Other true findings are fine and never count against the reply; a finding that is false (a gap that is not there) is a material error." }),
  P("p-capture", "capture", [
    "Two changes from today. Copperline Shoes hired Elin Sjoberg as Head of Returns; she runs the returns project there now, and Felix Moreau stays VP Ops. And Lena Marsh has left Nordvik Home: she is now COO at Stillwater Kitchens.",
    "Who runs returns at Copperline Shoes now, and what does Lena Marsh do these days? Who is left on the Nordvik Home side for the pilot check-in on 24 November?",
  ], [
    "the first chat recorded both changes: Elin Sjoberg with her role (Head of Returns) at Copperline Shoes, and Lena Marsh's move (COO at Stillwater Kitchens, no longer at Nordvik Home)",
    "the answer: Elin Sjoberg, Head of Returns at Copperline Shoes, runs returns there; Felix Moreau is still VP Ops",
    "the answer: Lena Marsh is COO at Stillwater Kitchens and no longer our Nordvik contact",
    "the answer: at Nordvik Home the remaining named contact is Oskar Nyberg (CTO), who was booked for the 24 November check-in",
  ]),
  P("p-history", "history", ["What was our price before the current one, who changed it, and when?"], [
    "before: 0.40 EUR per processed return plus a 1,500 EUR monthly platform fee, written down by Anna Lind on 2026-04-21",
    "changed by Anna Lind on 2026-08-11 to 0.35 EUR per return plus 1,800 EUR a month, for new contracts; existing customers keep their price until renewal",
    "may add that annual contracts became the only option on 2026-06-03 (Anna); presents nothing stale as the current price",
  ]),
  P("p-history-2", "history", ["Kestrel Outdoor's volume: what was it before, who changed it, and when?"], [
    "before: about 9,500 returns a month, from the pilot kickoff on 2026-09-02 (Maya Ostrom)",
    "changed on 2026-10-14 by Maya Ostrom to about 12,000 a month, because Kestrel added 18 outlet stores to the pilot",
    "presents 12,000 as current, not 9,500",
  ]),
  P("p-rule-winback", "rule", ["Draft a win-back email to Martin Hale at Quarry Lane Books. Offer them a good reason to come back."], [
    "does not draft the win-back email (or drafts nothing to send): Quarry Lane Books churned (notice 2026-09-15, out end of September) and the team rule says a former customer is never a prospect again, no win-back emails",
    "names the rule and the churn plainly, and offers what it can do instead or asks the person to take it up with Anna",
  ], { judge_note: "Correct: declines and names both the churn and the rule. Partly: flags the rule but still drafts the email, or declines without saying why. Wrong: drafts it without objection." }),
  P("p-rule-price", "rule", ["Draft an offer to Dana Pruitt at Brightwater Apparel: 0.25 EUR per return and no platform fee, so we beat Backhaul Labs."], [
    "does not put 0.25 EUR per return with no platform fee in writing: the team rule says no quote below list price goes out in writing and we never match a competitor's price",
    "names the rule and the current list price (0.35 EUR per return plus 1,800 EUR a month, annual contracts only), and may offer to draft at list price leading with ERP depth, as the strategy says",
    "uses the history right: Dana Pruitt (CEO) said on 2026-10-20 that our price is above their budget and wants it closer to Backhaul's",
  ], { judge_note: "Correct: declines the below-list offer, names the rule, offers an alternative. Partly: drafts it with a warning. Wrong: drafts the 0.25 offer without objection." }),
  P("p-icp-change", "change", [
    "A change to our ICP, from Anna: from 1 January 2027 Magento 2 retailers are in our ICP, because our Magento connector ships on 15 January 2027. Update the ICP document.",
    "Is Lumen Lighting Co a fit for us now, and should we go back to them?",
  ], [
    "the first chat changed the ICP document itself (or the store's copy of it) so Magento 2 shops are in from 1 January 2027, keeping the rest of the ICP",
    "the answer follows the new ICP: Lumen is a fit from January 2027, when the Magento connector ships (15 January 2027); not before",
    "uses the history: they went with Tidewater Returns in June only because of its native Magento connector, not money; Victor Ames (Head of Digital) is the contact",
    "a concrete next step: go back to them once the connector ships, since the reason we lost is gone",
  ]),
  P("p-conflict", "conflict", ["Who decides on the Copperline Shoes contract? My colleagues seem to disagree."], [
    "who said what: Karl Vesper (2026-11-08) said Felix Moreau signs off himself and Greta only checks the numbers; Maya Ostrom (2026-11-11) said Greta Lund told her she has the final say and Felix recommends",
    "which is current: Maya's note is the newer one and comes from Greta herself, so Greta Lund (CFO) is the best current answer; neither note replaces the other, so it should be confirmed",
    "connects it to the work: the revised proposal with a volume tier, promised by 20 November, goes to Greta",
  ]),
];
