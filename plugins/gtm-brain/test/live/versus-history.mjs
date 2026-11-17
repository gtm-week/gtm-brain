// The made-up history behind versus-bench.mjs: seven months of a revenue team's notes at Northfold,
// returns automation for retailers. Every name is invented. Two parts:
//   STORY   hand-written notes with fixed ids; the questions' gold answers rest only on these
//   filler  everyday notes drawn from templates by a seeded generator (--seed), about accounts and
//           topics no question asks about, so a different seed changes the noise, never the answers
// The filler never mentions price, a competitor, a decision, a promise, a dated next step after
// mid-October, or any company a question names.
//   node plugins/gtm-brain/test/live/versus-history.mjs [--seed 7]   prints the notes, oldest first
import { fileURLToPath } from "node:url";

export const COMPANY = "Northfold";
export const ONE_LINER = "Returns automation for retailers";
export const TEAM = [
  ["Anna Lind", "founder and CEO"], ["Maya Ostrom", "account executive"],
  ["Karl Vesper", "SDR, outbound"], ["Ines Kowal", "customer success"],
];
const A = "Anna Lind", M = "Maya Ostrom", K = "Karl Vesper", I = "Ines Kowal";

// [id, date, author, text]
export const STORY = [
  ["s01", "2026-04-21", A, "Writing our pricing down so we stop improvising on calls: 0.40 EUR per processed return plus a 1,500 EUR monthly platform fee. Annual contracts preferred, monthly still allowed for now."],
  ["s02", "2026-04-23", M, "Acme Retail rollout kickoff with Jonas Reed (Head of Ecommerce Operations). 140 stores, about 22k returns a month. Jonas wants refund time down from 9 days. They came to us through Brightside Commerce, Petra Novak made the intro."],
  ["s03", "2026-04-28", I, "Acme Retail security review finally closed. Theo Grant from their IT ran it, took 5 weeks start to finish, mostly data retention questions."],
  ["s04", "2026-04-30", A, "Standing rule for everyone, assistants included: ask before saving anything about pricing. Check with me first, every time. Prices leak too easily."],
  ["s05", "2026-05-05", M, "Acme Retail: Mira Okafor (CFO) signed the annual contract today. Renewal date is 1 December 2026."],
  ["s06", "2026-05-12", M, "Harbor & Pine signed! Tessa Brandt (COO) owns the budget and signed herself. Online-only furniture, roughly 6,000 returns a month."],
  ["s07", "2026-05-14", I, "Harbor & Pine onboarding call. Their ERP is Microsoft Dynamics 365 Business Central. The warehouse team in Boras re-keys every return by hand today. Nils Odegaard is the warehouse manager and our day to day contact."],
  ["s08", "2026-05-19", K, "Fjordline Sports intro with Hanna Berg (Head of Ecommerce). 35 stores across Norway and Sweden. She pulled Jonas from IT into the second half of the call."],
  ["s09", "2026-05-21", K, "Fjordline follow-up: Jonas Lindqvist (IT lead) handles the security questionnaire on their side. Wants SSO and data kept in the EU."],
  ["s10", "2026-05-27", M, "Lumen Lighting Co demo with Victor Ames, Head of Digital. Good energy but they run Magento 2 and we have no Magento connector. He asked about it twice."],
  ["s11", "2026-06-03", A, "Decision: annual contracts only from now on, no more monthly. Monthly customers leave before they see the value."],
  ["s12", "2026-06-09", M, "Quarry Lane Books signed a small plan. Martin Hale is the owner. Tiny, about 2,100 returns a month, right at our floor."],
  ["s13", "2026-06-12", A, "Decision: we are not building a Magento connector in 2026. Too big for the team we have. We say no to Magento shops until next year."],
  ["s14", "2026-06-16", M, "Lost Lumen Lighting Co. Victor told me they went with Tidewater Returns because Tidewater has a native Magento connector. It was the connector, not the money."],
  ["s15", "2026-06-18", M, "Fjordline Sports signed. Jonas Lindqvist did the security questionnaire, two weeks, no surprises."],
  ["s16", "2026-06-25", A, "Decision: Karl's outbound for the next two quarters goes only to Nordic retailers on Shopify Plus. No more UK lists."],
  ["s17", "2026-06-30", I, "Acme Retail asked for a PostNord label integration so stores can print return labels. I promised Jonas Reed we'd have it live by end of July."],
  ["s18", "2026-07-02", K, "Copperline Shoes first call with Felix Moreau, VP Ops. About 14,000 returns a month across web and 48 stores. Interested, but says our per-return price gets painful at their volume."],
  ["s19", "2026-07-08", M, "Acme Homeware (NOT Acme Retail, different company, kitchen and home goods): first call with Clara Voss, Ops Director. Shopify Plus, around 5k returns a month. Early, she's collecting options for next year."],
  ["s20", "2026-07-14", A, "Standing rule: a churned customer is never a prospect again. If someone left us, we don't chase them in outbound, full stop."],
  ["s21", "2026-07-21", K, "Nordvik Home intro with Lena Marsh, Head of Logistics. They want a pilot. Oskar Nyberg (CTO) joins the next call for the WMS side."],
  ["s22", "2026-07-28", I, "PostNord labels are live for Acme Retail, three days before the date we promised. Jonas happy."],
  ["s23", "2026-07-30", M, "Moss & Fern Kids signed, Lucy Tran is Head of Ops there. About 3,200 returns a month."],
  ["s24", "2026-08-06", I, "Outage this morning, 4 hours, refund queue stuck. Acme Retail hit hardest. Anna called Mira Okafor and promised to waive Acme's August platform fee."],
  ["s25", "2026-08-11", A, "Decision on pricing: for new contracts from today it is 0.35 EUR per processed return plus a 1,800 EUR monthly platform fee. Existing customers keep their current price until renewal."],
  ["s26", "2026-08-13", M, "Nordvik Home: Lena says the platform fee is the problem, she'd rather pay per return only. Price objection, logging it."],
  ["s27", "2026-08-18", M, "Nordvik Home pilot agreed. Starts 1 October, one warehouse (Oslo), 8 weeks."],
  ["s28", "2026-08-20", K, "Velo District, call with Sam Okoye (founder). Small bike brand, about 3,000 returns a month. Says we're too expensive compared with doing it in spreadsheets."],
  ["s29", "2026-08-26", I, "First Acme Retail QBR done. Agreed with Jonas and Mira that we run a quarterly business review every quarter. Next one is 19 November."],
  ["s30", "2026-08-27", K, "Pinecrest Toys: Julia Weiss says nothing before peak season, call back in January. Timing, not interest."],
  ["s31", "2026-09-02", M, "Kestrel Outdoor pilot kicked off. 60 stores, about 9,500 returns a month. Sponsor is Ola Fenn, VP Customer Experience."],
  ["s32", "2026-09-08", K, "Saltmarsh Beauty first call with Ruth Callan (Ecommerce Manager). Their blocker is IT security: they need a SOC 2 report and we don't have one yet."],
  ["s33", "2026-09-15", I, "Quarry Lane Books gave notice. Martin says the volume never got there for them. Out at end of September. Churned."],
  ["s34", "2026-09-18", M, "Kestrel: Ola says Backhaul Labs offered them 0.25 EUR per return and no platform fee. We're not matching, pitching ERP depth instead."],
  ["s35", "2026-09-22", I, "Harbor & Pine has a new CFO, Rafael Duarte. Tessa told me the budget for tools now sits with Rafael, not her, so renewal talks go through him."],
  ["s36", "2026-09-24", M, "Copperline Shoes: Felix mentioned they are also talking to Backhaul Labs. Greta Lund (CFO) joined the call and asked for a volume tier."],
  ["s37", "2026-09-29", M, "Ola Fenn is leaving Kestrel Outdoor! She moves to Brightwater Apparel as Head of CX from October. Kestrel's sponsor is now Sanna Holm, Director of Operations."],
  ["s38", "2026-09-30", K, "Nordvik Home pushed the pilot: their WMS migration slipped. New start date 3 November. Lena apologised."],
  ["s39", "2026-10-06", I, "Harbor & Pine opened a second warehouse in Gothenburg and wants Northfold running there too. Same setup, Nils is coordinating."],
  ["s40", "2026-10-08", M, "Acme Retail signed the warehouse expansion addendum. As part of it the renewal moves from 1 December to 1 February 2027."],
  ["s41", "2026-10-09", K, "Brightwater Apparel first call: Ola Fenn in her new role plus Dana Pruitt (CEO). Ola knows us from Kestrel. They were pitched by Backhaul Labs last month."],
  ["s42", "2026-10-14", M, "Kestrel added 18 outlet stores to the pilot, so volume is more like 12,000 returns a month, not 9,500."],
  ["s43", "2026-10-16", M, "Acme Homeware demo with Clara Voss and Ben Ashby (procurement). They liked it. No budget until 2027, they'll come back in January."],
  ["s44", "2026-10-20", K, "Brightwater: Dana says 0.35 plus 1,800 a month is more than they budgeted and wants us closer to Backhaul's number."],
  ["s45", "2026-10-22", M, "Kestrel: Erik Dahl, their CFO, is now in the loop. Sanna wants to turn the pilot into a contract."],
  ["s46", "2026-10-27", I, "Harbor & Pine complaint: refunds stuck for orders with split shipments. Rafael was copied on the email, not great."],
  ["s47", "2026-11-02", M, "Copperline Shoes: Greta wants a revised proposal with a volume tier. I promised it by 20 November."],
  ["s48", "2026-11-03", I, "Nordvik Home pilot is live in the Oslo warehouse as of today. Check-in with Lena and Oskar booked for 24 November."],
  ["s49", "2026-11-04", I, "Harbor & Pine split-shipment bug fixed and backfilled. Tessa and Rafael both confirmed."],
  ["s50", "2026-11-10", M, "Kestrel Outdoor signed! 12 month contract starting 1 December, on the new pricing. Sanna Holm and Erik Dahl signed."],
  ["s51", "2026-11-12", K, "Velo District: Sam says they're in a budget freeze, everything on hold."],
];

/* ---- filler ---- */
const PROSPECTS = [
  ["Orchard Street Grocers", [["Imran Shah", "COO"], ["Pia Holt", "ecommerce lead"]]],
  ["Granite Bay Jewelry", [["Noor Haddad", "Director of CX"]]],
  ["Tallow & Wick Candles", [["Abby Linden", "founder"]]],
  ["Redwing Cycles", [["Marco Ferri", "Head of Ecommerce"], ["Leon Marsh", "warehouse lead"]]],
  ["Blue Heron Pets", [["Kate Morrow", "VP Operations"]]],
  ["Larkspur Living", [["Hugo Lemaire", "COO"]]],
  ["Pinecrest Toys", [["Julia Weiss", "Ops Manager"], ["Tomas Ruiz", "IT manager"]]],
];
// only for a larger history (versus-bench.mjs --notes): no word is shared with a company, and no first name with a person, of the story
const BIG_A = ["Amber", "Birch", "Cedar", "Dune", "Elm", "Gale", "Heath", "Iris", "Juniper", "Kelp", "Maple", "Nettle", "Oak", "Pebble", "Quill", "Rowan", "Sable", "Thistle", "Umber", "Willow", "Yarrow", "Alder", "Basalt", "Clover", "Delta", "Ember", "Flint", "Garnet", "Hazel", "Indigo"];
const BIG_B = ["Goods", "Market", "Supply", "Studio", "Collective", "Works", "Trading", "Outfitters", "Provisions", "Wares"];
const BIG_FIRST = ["Aida", "Bruno", "Celine", "Dario", "Elif", "Fabian", "Gita", "Henrik", "Ilse", "Joel", "Kaia", "Lars", "Mona", "Nadia", "Otto", "Paula", "Rasmus", "Selma", "Tuva", "Ulla", "Viggo", "Wilma", "Yusuf", "Zora"];
const BIG_LAST = ["Aalto", "Carlin", "Castell", "Dufour", "Ekberg", "Falk", "Gunnar", "Hedlund", "Ivarsson", "Juhl", "Kask", "Moberg", "Norrby", "Pihl", "Rask", "Strand", "Toft", "Udd", "Wikstrom", "Varga"];
const BIG_ROLES = ["COO", "ecommerce lead", "Head of Ecommerce", "Ops Manager", "VP Operations", "Director of CX", "warehouse lead", "IT manager", "founder"];
const EVENTS = ["Nordic Commerce Days", "Retail Ops Summit in Stockholm", "Shopify Plus meetup in Oslo"];
const WMS = ["Ongoing WMS", "Consafe Logistics", "a homegrown WMS", "Microsoft Dynamics WMS"];
// {c} company, {p} person, {r} role, {p2} second person, {n} {w} numbers, {e} event, {s} wms; [template, latest month (1-12) it may be dated in]
const PROSPECT_T = [
  ["Intro call with {p} ({r}, {c}). Returns run through a shared spreadsheet and the carrier portal today. Sent the two-pager afterwards.", 11],
  ["{c}: {p} didn't show up for the call. Rebooked.", 10],
  ["quick one: {p} from {c} asked how the Shopify Plus app gets installed and who needs admin rights. answered by email, nothing blocking", 11],
  ["Demo for {c}. {p} liked the refund timeline view, less into the analytics tab. Wants to show it to the warehouse team.", 11],
  ["{p} ({c}) asked if we handle exchanges and store credit, not just refunds. We do, walked them through the exchange flow.", 11],
  ["Emailed {p} at {c} the case study. No answer yet.", 11],
  ["{c} discovery with {p}. {n} people touch returns every day across {w} warehouses. Most of the time goes into matching returns to orders.", 11],
  ["{p} says {c}'s busiest returns month is January, after the holiday wave.", 11],
  ["Second call with {c}. {p} brought {p2}. Lots of questions about data retention and where data is stored (EU, yes).", 11],
  ["{c} went quiet. Third follow-up sent to {p}, will park it if nothing comes back.", 10],
  ["Met {p} from {c} at {e}. Short chat, curious, swapped cards.", 11],
  ["{p} at {c} forwarded our deck to their CEO. Small sign but a good one.", 11],
  ["LinkedIn: {p} ({c}) liked the post about refund times and accepted the connect. Sent a short note.", 11],
  ["{c}: {p} asked whether we integrate with their WMS ({s}). Checked with engineering: yes through the API, no ready-made connector.", 11],
  ["call w/ {p} @ {c} got cut short, they had a fire drill. mostly intros, they do returns in two places and hate it", 11],
];
const CUSTOMER_T = [
  "Moss & Fern Kids monthly check-in with Lucy Tran. All calm, refund times steady around two days.",
  "Lucy (Moss & Fern) asked for a CSV export of return reasons for their buyers. Showed her the export button, she hadn't seen it.",
  "Support ticket from Moss & Fern Kids: the label printer in their returns room keeps timing out. Was their network, closed.",
  "Moss & Fern Kids added a second returns desk for the autumn collection. Nothing needed on our side.",
  "Lucy Tran said she is happy to take reference calls from other kidswear and toy brands.",
  "moss & fern: lucy wants the returns portal in their brand colours, sent her the theme settings",
];
const PARTNER_T = [
  "Call with Petra Novak (Brightside Commerce). She wants a joint webinar for their Shopify Plus clients.",
  "Brightside Commerce sent two names from their client list, both small, too early to say.",
  "Petra Novak asked for updated slides on the Shopify Plus app for their sales team. Sent.",
];
const INTERNAL_T = [
  "Shipped the return reasons dashboard to all customers today.",
  "Webinar on returns fraud: {n} signups, {w} showed up. Good questions about wardrobing.",
  "Karl's Nordic sequence this week: {w} percent reply rate, mostly polite no's.",
  "Team offsite in Copenhagen, mostly roadmap. Notes are in the drive.",
  "New support engineer started today, Aino. Ines is onboarding her this week.",
  "Engineering: exchange flow v2 is out, store credit now shows on the receipt.",
  "Monthly numbers: {k} returns processed across all customers, a record month.",
  "Rewrote the onboarding checklist, 14 steps now instead of 22.",
  "fyi the carrier sandbox was down most of the afternoon, demos used the recording",
  "Booth at {e} went fine, about {w} real conversations, nobody ready to buy.",
];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const START = Date.UTC(2026, 3, 20), END = Date.UTC(2026, 10, 13);
const iso = ms => new Date(ms).toISOString().slice(0, 10);

// set: another story and its own filler accounts (versus-holdout.mjs); without one, the story above
export const MAIN = { story: STORY, prospects: PROSPECTS, customerT: CUSTOMER_T, partnerT: PARTNER_T, internalT: INTERNAL_T };
export function history(seed = 7, filler = 125, set = MAIN) {
  const { story: STORY_SET, prospects: PROSPECTS, customerT: CUSTOMER_T, partnerT: PARTNER_T, internalT: INTERNAL_T } = { ...MAIN, ...set };
  const r = rng(seed), pick = xs => xs[Math.floor(r() * xs.length)], int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const day = (latestMonth = 11, from = START) => { const end = Math.min(END, Date.UTC(2026, latestMonth - 1, latestMonth === 11 ? 13 : 28)); return iso(from + Math.floor(r() * ((end - from) / 86400000 + 1)) * 86400000); };
  const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
  // every candidate note is a different text: a template is used once per account, and only the internal
  // notes that carry numbers (weekly stats, webinars, booths) come back, each time with other numbers
  const pool = [];
  for (const [c, people] of PROSPECTS) for (const [t, latest] of PROSPECT_T) {
    const [p, role] = pick(people), others = people.filter(x => x[0] !== p);
    if (t.includes("{p2}") && !others.length) continue;
    pool.push(() => ({ text: fill(t, { c, p, r: role, p2: others.length ? `${others[0][0]} (${others[0][1]})` : "", n: int(3, 14), w: int(1, 3), e: pick(EVENTS), s: pick(WMS) }), date: day(latest), author: pick([M, K, K]) }));
  }
  for (const t of CUSTOMER_T) pool.push(() => ({ text: t, date: day(11, Date.UTC(2026, 7, 4)), author: I }));
  for (const t of PARTNER_T) pool.push(() => ({ text: t, date: day(), author: pick([A, M]) }));
  for (const t of INTERNAL_T) for (let k = 0; k < (/\{/.test(t) ? 4 : 1); k++) pool.push(() => ({ text: fill(t, { n: int(40, 90), w: int(8, 30), k: (int(40, 75) * 1000).toLocaleString("en-US"), e: pick(EVENTS) }), date: day(), author: pick([A, I, K]) }));
  // a larger history (filler above the 125 of the standard run) adds made-up prospect accounts built from word
  // lists, with the same prospect templates; none shares a word with a company or a first name a question asks about
  if (filler > 125) {
    const extra = [];
    for (const a of BIG_A) for (const b of BIG_B) extra.push(`${a} ${b}`);
    for (let i = extra.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [extra[i], extra[j]] = [extra[j], extra[i]]; }
    const need = Math.ceil((filler - 100) / PROSPECT_T.length) + 2;
    for (const c of extra.slice(0, need)) {
      const people = [0, 1].map(() => [`${pick(BIG_FIRST)} ${pick(BIG_LAST)}`, pick(BIG_ROLES)]);
      for (const [t, latest] of PROSPECT_T) {
        const [p, role] = pick(people), others = people.filter(x => x[0] !== p);
        pool.push(() => ({ text: fill(t, { c, p, r: role, p2: others.length ? `${others[0][0]} (${others[0][1]})` : `${people[0][0]} (${people[0][1]})`, n: int(3, 14), w: int(1, 3), e: pick(EVENTS), s: pick(WMS) }), date: day(latest), author: pick([M, K, K]) }));
      }
    }
  }
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const seen = new Set(), out = [];
  for (const make of pool) { if (out.length >= filler) break; const n = make(); if (seen.has(n.text)) continue; seen.add(n.text); out.push({ id: `f${String(out.length + 1).padStart(3, "0")}`, ...n }); }
  const story = STORY_SET.map(([id, date, author, text]) => ({ id, date, author, text }));
  // on the same day a story note comes before a filler note (filler ids start with f)
  return [...story, ...out].sort((a, b) => a.date.localeCompare(b.date) || ((a.id[0] === "f") === (b.id[0] === "f") ? a.id.localeCompare(b.id) : a.id[0] === "f" ? 1 : -1));
}

export const roleOf = name => (TEAM.find(t => t[0] === name) || [])[1] || "";
export const noteLine = n => `${n.date}, ${n.author} (${roleOf(n.author)}): ${n.text}`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--seed"), j = process.argv.indexOf("--notes");
  const notes = history(i > 0 ? Number(process.argv[i + 1]) : 7, j > 0 ? Number(process.argv[j + 1]) - STORY.length : 125);
  for (const n of notes) console.log(`[${n.id}] ${noteLine(n)}`);
  console.error(`${notes.length} notes, ${notes.filter(n => n.id[0] === "s").length} story, ${notes.filter(n => n.id[0] === "f").length} filler`);
}
