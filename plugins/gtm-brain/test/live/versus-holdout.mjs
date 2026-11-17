// The held-out question set for versus-bench.mjs (--questions holdout, seed 11 by default): a second story at
// Northfold with its own accounts, people, facts, corrections, dated items, standing rules and wordings, and 27
// questions in the same eight categories and proportions as versus-questions.json. It exists so that a fix found on
// the first set can be checked on questions it was not found with: do not tune the plugin to this file, and do not
// read it while working on a fix. Every name is invented. The filler accounts are this set's own, so the noise is
// different too; the filler never mentions price, a competitor, a decision, a promise, a dated next step after
// mid-October, or any company a question names.
//   node plugins/gtm-brain/test/live/versus-holdout.mjs [--seed 11]   prints the notes, oldest first
import { fileURLToPath } from "node:url";
import { history, noteLine, TEAM } from "./versus-history.mjs";

const [A, M, K, I] = TEAM.map(t => t[0]);

// [id, date, author, text]
export const STORY = [
  ["h01", "2026-04-22", A, "Our rates for this year, so nobody improvises on a call: 0.45 EUR for every return we handle, 1,200 EUR a month for the platform, and a one-off onboarding fee of 3,000 EUR."],
  ["h02", "2026-04-24", M, "Bellhaven Outfitters kickoff. Ravi Menon runs retail operations there: 85 stores in Denmark and Germany, around 17k returns per month, everything ships with DHL Express. A refund takes them 12 days today. They came via Fieldstone Digital, Yusra Amin set up the first call."],
  ["h03", "2026-04-29", I, "Bellhaven DPA finally signed after three rounds with Liv Sandqvist, their legal counsel. What held it up was our sub-processors outside the EU."],
  ["h04", "2026-05-04", A, "Something for all of us, and for any AI helper we use: personal phone numbers of contacts never go into our notes or tools. Work email and office lines only. GDPR, and people hate it."],
  ["h05", "2026-05-07", M, "Bellhaven contract countersigned by Oona Pike, their finance director. Two year term, go-live set for 15 June."],
  ["h06", "2026-05-13", K, "Cold call that actually landed: Tarn & Tide Swimwear, spoke with Elsa Granqvist (ecommerce manager). Almost all online, 4,000 returns a month, peak in August."],
  ["h07", "2026-05-15", M, "Halden Workwear first meeting with Per Aasen, logistics manager. Their stores run on Sitoo and the warehouse on Astro WMS. Roughly 2,500 returns a month, very seasonal."],
  ["h08", "2026-05-20", I, "Corvid Coffee Roasters is on board, small plan. Mattias Rehn is the founder. Mostly webshop subscriptions, about 1,300 returns a month."],
  ["h09", "2026-05-26", K, "Tarn & Tide follow-up. Elsa brought in her boss, Jakob Fell (Head of Digital). He's the one who signs off on tools."],
  ["h10", "2026-06-02", A, "We're done giving pilots away. Every pilot from today is paid, 2,000 EUR flat, credited against year one if they sign."],
  ["h11", "2026-06-08", M, "Bellhaven go-live is slipping: their DHL integration testing ran long. New go-live date is 6 July."],
  ["h12", "2026-06-10", M, "Pellucid Eyewear demo with Ada Kraus, VP Customer Care. They're on Salesforce Commerce Cloud and we have no connector for it. She asked twice when we'd have one."],
  ["h13", "2026-06-17", A, "Out of the board call: no Salesforce Commerce Cloud connector this year. If a shop runs SFCC we tell them honestly it's 2027 at the earliest."],
  ["h14", "2026-06-23", A, "Outbound focus changes as of today: Karl drops the Benelux list and works only German-speaking fashion brands until the end of the year."],
  ["h15", "2026-06-29", M, "Pellucid Eyewear went with Loopwise. Ada said Loopwise already plugs into Commerce Cloud and they couldn't wait a year for us."],
  ["h16", "2026-07-01", I, "Bellhaven wants the return reasons in German in their customer portal. I told Ravi we'd ship the German translation by 31 July."],
  ["h17", "2026-07-06", I, "Bellhaven is live as of this morning, all 85 stores. Smooth start."],
  ["h18", "2026-07-09", K, "Talked to Brynja Holt at Vinter Sko (shoes, Iceland and Norway, about 7,500 returns a month). Liked the demo, but she says the per-return fee adds up fast at their size."],
  ["h19", "2026-07-15", A, "Going forward we don't take on shops doing under 1,000 returns a month. Below that, onboarding costs us more than they'll ever pay. Don't put them in the pipeline."],
  ["h20", "2026-07-20", K, "Inbound from the website: Little Wren Ceramics. Owner is Nell Achebe. They handle maybe 600 returns a month."],
  ["h21", "2026-07-24", I, "German return reasons are out for Bellhaven, a week ahead of what I told Ravi. He sent a thank-you."],
  ["h22", "2026-07-28", M, "Halden Workwear: Per says 1,200 a month for the platform is hard to justify for a seasonal business that's quiet half the year."],
  ["h23", "2026-07-30", M, "Driftwood Kids signed, Esme Pollard is head of ops there. About 2,800 returns a month."],
  ["h24", "2026-08-04", I, "Our DHL webhook broke for most of the day, Bellhaven returns weren't registering. I promised Ravi a written incident report by Friday and a credit of one month's platform fee on the next invoice."],
  ["h25", "2026-08-10", A, "New rates for new deals signed from 1 September: 0.38 EUR per return and 1,500 EUR a month for the platform, onboarding stays at 3,000. Current customers stay on their rate until their term ends."],
  ["h26", "2026-08-14", K, "Tarn & Tide: Jakob asked to start with a paid pilot over their August peak. Agreed in principle."],
  ["h27", "2026-08-19", M, "Orla Beauty, skincare, about 5,000 returns a month. Call with Fiona Kelleher, Head of Operations. She'd compared us with Loopwise and said Loopwise came in about a third cheaper."],
  ["h28", "2026-08-25", I, "Bellhaven review with Ravi and Oona. They'd rather meet every six months than every quarter. Next one set for 26 November."],
  ["h29", "2026-09-01", M, "Tarn & Tide paid pilot started today, webshop only, 10 weeks."],
  ["h30", "2026-09-07", K, "Vinter Sko: Brynja mentioned Loopwise gave them a demo too."],
  ["h31", "2026-09-10", M, "Corvid Coffee Roasters is leaving us. Mattias says subscriptions don't produce enough returns to be worth it. Last day 30 September."],
  ["h32", "2026-09-16", M, "Ravi Menon is leaving Bellhaven Outfitters, he starts as COO at Kova Home on 1 October. Our contact at Bellhaven from now on is Marit Solberg, their new head of retail ops."],
  ["h33", "2026-09-21", M, "I had Halden Workwear's volume wrong in May. It's closer to 3,800 returns a month, Per sent over the real export."],
  ["h34", "2026-09-24", M, "Kova Home, first call with Ravi Menon in his new job. Kova sells furniture online, about 6,500 returns a month. He wants what he had at Bellhaven."],
  ["h35", "2026-10-01", K, "Vinter Sko second call. Brynja brought Marit Solheim, their CFO. Marit asked for references from other footwear brands."],
  ["h36", "2026-10-05", M, "Tarn & Tide pilot numbers are in: refund time down from 11 days to 3. Jakob wants to move to a full contract."],
  ["h37", "2026-10-07", M, "Halden Workwear asked for a quote with a seasonal platform fee. I told Per I'd get it to him by 18 November."],
  ["h38", "2026-10-12", I, "Bellhaven added their two outlet stores in Hamburg. Volume is now about 19,000 returns a month."],
  ["h39", "2026-10-15", K, "Orla Beauty: Fiona says they're going with Loopwise. We lost it on price."],
  ["h40", "2026-10-19", M, "Tarn & Tide signed a one-year contract starting 1 November, on the new rates. Jakob Fell signed."],
  ["h41", "2026-10-21", I, "Marit Solberg asked to move the Bellhaven half-year review from 26 November to 3 December, she's at a trade fair that week."],
  ["h42", "2026-10-26", K, "Kova Home: Ravi wants the onboarding fee dropped, says 3,000 EUR up front is a hard sell with his CEO."],
  ["h43", "2026-10-28", M, "Kova Home demo for their CEO, Ingrid Vale, booked for 25 November."],
  ["h44", "2026-11-02", I, "Tarn & Tide is live on the full contract, webshop first. Stores come next year."],
  ["h45", "2026-11-05", K, "Vinter Sko: Marit Solheim wants the reference calls done before their budget meeting on 27 November. Need two footwear brands lined up."],
  ["h46", "2026-11-09", M, "Halden Workwear hired a new head of logistics, Sigrid Nyhus. She takes the project over from Per Aasen."],
  ["h47", "2026-11-11", I, "Bellhaven monthly check-in with Marit Solberg: refunds now take 4 days, down from 12 when we started."],
];

/* ---- this set's own filler: other accounts, other people, same templates as the first set ---- */
const PROSPECTS = [
  ["Copper Kettle Teas", [["Ruben Oaks", "COO"], ["Lina Ferro", "ecommerce lead"]]],
  ["Wildmere Garden Supply", [["Dora Finch", "Director of CX"]]],
  ["Saltcrest Surf", [["Ivo Marr", "founder"]]],
  ["Fernway Pharmacy", [["Clea Dunmore", "VP Operations"], ["Bo Hartley", "IT manager"]]],
  ["Quayside Prints", [["Mila Strout", "Head of Ecommerce"], ["Aron Vey", "warehouse lead"]]],
  ["Ashgrove Pet Supply", [["Yara Quint", "Ops Manager"]]],
  ["Brasswork Lamps", [["Kit Ambrose", "COO"], ["Noel Varden", "IT manager"]]],
];
const CUSTOMER_T = [
  "Driftwood Kids monthly check-in with Esme Pollard. All calm, refund times steady around two days.",
  "Esme (Driftwood Kids) asked for a CSV export of return reasons for their buyers. Showed her the export button, she hadn't seen it.",
  "Support ticket from Driftwood Kids: the label printer in their returns room keeps timing out. Was their network, closed.",
  "Driftwood Kids added a second returns desk for the autumn collection. Nothing needed on our side.",
  "Esme Pollard said she is happy to take reference calls from other kidswear brands.",
  "driftwood: esme wants the returns portal in their brand colours, sent her the theme settings",
];
const PARTNER_T = [
  "Call with Yusra Amin (Fieldstone Digital). She wants a joint webinar for their Shopify Plus clients.",
  "Fieldstone Digital sent two names from their client list, both small, too early to say.",
  "Yusra Amin asked for updated slides on the Shopify Plus app for their sales team. Sent.",
];
const INTERNAL_T = [
  "Shipped the return reasons dashboard to all customers today.",
  "Webinar on returns fraud: {n} signups, {w} showed up. Good questions about wardrobing.",
  "Karl's outbound sequence this week: {w} percent reply rate, mostly polite no's.",
  "Team offsite in Copenhagen, mostly roadmap. Notes are in the drive.",
  "New support engineer started today, Aino. Ines is onboarding her this week.",
  "Engineering: exchange flow v2 is out, store credit now shows on the receipt.",
  "Monthly numbers: {k} returns processed across all customers, a record month.",
  "Rewrote the onboarding checklist, 14 steps now instead of 22.",
  "fyi the carrier sandbox was down most of the afternoon, demos used the recording",
  "Booth at {e} went fine, about {w} real conversations, nobody ready to buy.",
];
export const SET = { story: STORY, prospects: PROSPECTS, customerT: CUSTOMER_T, partnerT: PARTNER_T, internalT: INTERNAL_T };
export const SEED = 11;
export const NOTES = 176;   // as many notes as the first set: the story plus filler

export const QUESTIONS = {
  about: "Held-out questions for versus-bench.mjs (--questions holdout), written before any arm ran and never shown to an arm. support lists the note ids (STORY above) the gold answer rests on; stale lists values that were true once and have since been replaced. Save questions have two turns, each in a new chat: say, then ask. Today in the benchmark is 2026-11-17.",
  categories: {
    recall: "Plain recall: a fact stated once",
    corrected: "Corrected facts: the current value after a later note replaced an earlier one",
    who: "Who and where now: job changes and look-alike names",
    across: "Across many notes",
    time: "Time: what changed, what is due",
    unknown: "Not in the notes: the right answer is that it is not known",
    save: "Save then recall: told in one chat, asked in a new one",
    rule: "Standing rule: the request collides with a rule the team stated",
  },
  questions: [
    { id: "h-recall-1", category: "recall", ask: "Which carrier does Bellhaven use for shipping?",
      gold: "DHL Express.", support: ["h02"] },
    { id: "h-recall-2", category: "recall", ask: "Why did we lose Pellucid Eyewear?",
      gold: "They chose Loopwise because Loopwise already integrates with Salesforce Commerce Cloud, their platform, and they could not wait for us to have a connector (we decided on 2026-06-17 not to build one in 2026).", support: ["h12", "h15"],
      judge_note: "Correct names Loopwise and the missing Commerce Cloud connector. Saying it was price is wrong." },
    { id: "h-recall-3", category: "recall", ask: "What did Bellhaven's lawyers get stuck on before they'd sign off?",
      gold: "Our sub-processors outside the EU. The data processing agreement took three rounds with Liv Sandqvist, their legal counsel, and was signed on 2026-04-29.", support: ["h03"] },
    { id: "h-recall-4", category: "recall", ask: "What warehouse software is Halden Workwear running?",
      gold: "Astro WMS in the warehouse (their stores run on Sitoo).", support: ["h07"] },

    { id: "h-corrected-1", category: "corrected", ask: "When did Bellhaven actually go live with us?",
      gold: "6 July 2026, all 85 stores. The go-live was first set for 15 June and slipped because their DHL integration testing ran long.", support: ["h05", "h11", "h17"],
      stale: ["15 June 2026 as the go-live date"] },
    { id: "h-corrected-2", category: "corrected", ask: "What do we charge a new customer these days?",
      gold: "0.38 EUR per return, 1,500 EUR a month for the platform and a one-off 3,000 EUR onboarding fee, for new deals signed from 1 September 2026 (set on 2026-08-10). Existing customers keep their rate until their term ends. Pilots are paid, 2,000 EUR flat, credited against year one.", support: ["h01", "h25", "h10"],
      stale: ["0.45 EUR per return", "1,200 EUR a month platform fee"],
      judge_note: "Correct gives 0.38 EUR, 1,500 EUR a month and the 3,000 EUR onboarding fee; the pilot fee is optional." },
    { id: "h-corrected-3", category: "corrected", ask: "Roughly how many returns does Halden Workwear do in a month?",
      gold: "About 3,800 a month (corrected on 2026-09-21 from Per Aasen's export; the 2,500 noted in May was wrong). Very seasonal.", support: ["h07", "h33"],
      stale: ["2,500 a month"] },
    { id: "h-corrected-4", category: "corrected", ask: "When's our next review meeting with Bellhaven?",
      gold: "3 December 2026. It was set for 26 November and Marit Solberg asked on 2026-10-21 to move it because she is at a trade fair that week. The reviews are every six months.", support: ["h28", "h41"],
      stale: ["26 November 2026 as the date", "quarterly reviews"] },

    { id: "h-who-1", category: "who", ask: "Where's Ravi Menon working these days?",
      gold: "Kova Home, as COO since 1 October 2026. He left Bellhaven Outfitters, where he ran retail operations; Kova Home is now a prospect of ours.", support: ["h32", "h34"],
      stale: ["Bellhaven Outfitters as his current employer"] },
    { id: "h-who-2", category: "who", ask: "Who should I be talking to at Halden Workwear now?",
      gold: "Sigrid Nyhus, their new head of logistics, who took the project over from Per Aasen (noted 2026-11-09).", support: ["h07", "h46"],
      stale: ["Per Aasen as the current contact"] },
    { id: "h-who-3", category: "who", ask: "Who is Marit Solheim?",
      gold: "The CFO of Vinter Sko, a prospect (shoes, Iceland and Norway). She joined the second call on 2026-10-01, asked for references from other footwear brands and wants the reference calls done before their budget meeting on 27 November.", support: ["h35", "h45"],
      judge_note: "Marit Solberg is a different person, the head of retail ops at Bellhaven Outfitters. Mixing the two (calling Marit Solheim Bellhaven's contact, or giving Bellhaven facts) is wrong." },

    { id: "h-across-1", category: "across", ask: "Who's pushed back on what we charge?",
      gold: "Four: Vinter Sko (the per-return fee adds up fast at their size), Halden Workwear (1,200 a month for the platform is hard to justify for a seasonal business), Orla Beauty (Loopwise came in about a third cheaper; they later went with Loopwise, lost on price), Kova Home (wants the 3,000 EUR onboarding fee dropped).", support: ["h18", "h22", "h27", "h39", "h42"],
      judge_note: "Correct names all four and no account that did not push back on price. Partly: two or three of them, or all four plus a wrong one. Pellucid Eyewear (connector), Little Wren Ceramics (too small), Corvid Coffee Roasters (not enough returns) and Tarn & Tide did not push back on price." },
    { id: "h-across-2", category: "across", ask: "What have we committed to for Bellhaven?",
      gold: "The German translation of the return reasons in their customer portal by 31 July (shipped 2026-07-24, a week early); after the 2026-08-04 DHL webhook outage, a written incident report by that Friday and a credit of one month's platform fee on the next invoice. They also agreed to review every six months; the next review is on 3 December.", support: ["h16", "h21", "h24", "h28", "h41"],
      judge_note: "Correct names the German translation, the incident report and the platform fee credit. Partly: one or two of these. The review cadence may be named too, it is not required." },
    { id: "h-across-3", category: "across", ask: "Quick rundown on Tarn & Tide Swimwear before I call them?",
      gold: "Swimwear, almost all online, about 4,000 returns a month, peak in August. First contact Elsa Granqvist (ecommerce manager); the decision maker is Jakob Fell (Head of Digital). Paid pilot from 1 September, webshop only, 10 weeks: refund time down from 11 days to 3. Signed a one-year contract on 2026-10-19, starting 1 November, on the new rates; live on the webshop since 2026-11-02, stores next year.", support: ["h06", "h09", "h26", "h29", "h36", "h40", "h44"],
      stale: ["still a pilot or a prospect (they signed)"],
      judge_note: "Correct: covers the signed contract, Jakob Fell as the decision maker and the pilot result, with nothing invented. Partly: misses one of those three or most of the history." },
    { id: "h-across-4", category: "across", ask: "Which deals has Loopwise come up in?",
      gold: "Three: Pellucid Eyewear (chose Loopwise for its Commerce Cloud integration), Orla Beauty (Loopwise about a third cheaper; Orla went with Loopwise), Vinter Sko (Loopwise gave them a demo too).", support: ["h15", "h27", "h30", "h39"],
      judge_note: "Correct names all three and no other. Partly: two of three." },

    { id: "h-time-1", category: "time", ask: "What have we got coming up for the rest of this month?",
      gold: "The seasonal-fee quote for Halden Workwear, promised to Per by 18 November; the Kova Home demo for their CEO Ingrid Vale on 25 November; the Vinter Sko reference calls, two footwear brands, before their budget meeting on 27 November.", support: ["h37", "h43", "h45"],
      judge_note: "Today is 2026-11-17, so this month is November 2026. Correct names all three. Partly: two of three. The Bellhaven review is no longer in November (moved to 3 December); naming it as due on 26 November is a material error." },
    { id: "h-time-2", category: "time", ask: "What policy changes did we make back in June?",
      gold: "Three: pilots are paid from now on, 2,000 EUR flat, credited against year one (2026-06-02); no Salesforce Commerce Cloud connector in 2026 (2026-06-17); outbound only to German-speaking fashion brands until the end of the year, Benelux list dropped (2026-06-23).", support: ["h10", "h13", "h14"],
      judge_note: "Correct names all three. Partly: two of three." },
    { id: "h-time-3", category: "time", ask: "Catch me up on Bellhaven since September.",
      gold: "Ravi Menon left for Kova Home, Marit Solberg (new head of retail ops) is the contact (2026-09-16); they added two Hamburg outlet stores, about 19,000 returns a month (2026-10-12); the half-year review moved from 26 November to 3 December (2026-10-21); refunds now take 4 days, down from 12 (2026-11-11).", support: ["h32", "h38", "h41", "h47"],
      judge_note: "Correct names the contact change, the volume increase and at least one of the review move and the refund time. Partly: two of these. Facts from before September (go-live, translation, outage) presented as changes count against it." },

    { id: "h-unknown-1", category: "unknown", ask: "How many people work at Bellhaven?",
      gold: "Not in our notes. They have 85 stores (plus two outlets in Hamburg) and about 19,000 returns a month, but no headcount was ever recorded.", support: ["h02", "h38"],
      judge_note: "Correct says it is not known. Any headcount is invented." },
    { id: "h-unknown-2", category: "unknown", ask: "Who's the CFO over at Tarn & Tide?",
      gold: "Not in our notes. Known contacts there are Elsa Granqvist (ecommerce manager) and Jakob Fell (Head of Digital).", support: ["h06", "h09"],
      judge_note: "Correct says it is not known. Naming anyone as Tarn & Tide's CFO is invented (Marit Solheim is Vinter Sko's CFO, Oona Pike is Bellhaven's finance director)." },
    { id: "h-unknown-3", category: "unknown", ask: "When does Kova Home's contract with us start?",
      gold: "There is no contract in our notes: Kova Home is a prospect. Ravi Menon wants the onboarding fee dropped, and a demo for their CEO Ingrid Vale is booked for 25 November.", support: ["h34", "h42", "h43"],
      judge_note: "Correct says there is no signed contract or start date. Any start date is invented." },

    { id: "h-save-1", category: "save", say: "Heads up, Vinter Sko just told me their returns are up to about 9,000 a month since they opened in Finland.",
      ask: "How many returns is Vinter Sko doing a month?",
      gold: "About 9,000 a month since they opened in Finland (told on 2026-11-17); earlier it was about 7,500.", support: ["h18"],
      stale: ["7,500 a month"] },
    { id: "h-save-2", category: "save", say: "Kova Home pushed the demo for their CEO to 2 December.",
      ask: "When are we demoing for Kova's CEO?",
      gold: "2 December 2026 (moved on 2026-11-17; it was booked for 25 November). The CEO is Ingrid Vale.", support: ["h43"],
      stale: ["25 November 2026"] },
    { id: "h-save-3", category: "save", say: "Pellucid Eyewear has a new VP Customer Care, Arvid Kloss. Ada Kraus left.",
      ask: "Who heads customer care at Pellucid Eyewear now?",
      gold: "Arvid Kloss, their new VP Customer Care (from 2026-11-17); Ada Kraus left.", support: ["h12"],
      stale: ["Ada Kraus as the current VP Customer Care"] },
    { id: "h-save-4", category: "save", say: "Worth remembering: Orla Beauty's Loopwise contract comes up for renewal in June 2027, we should try them again then.",
      ask: "When's a good time to go back to Orla Beauty?",
      gold: "June 2027, when their Loopwise contract comes up for renewal.", support: ["h39"] },

    { id: "h-rule-1", category: "rule", ask: "Save Marit Solberg's personal cell for the team: +45 21 34 56 78.",
      gold: "The team rule (2026-05-04) says personal phone numbers of contacts never go into our notes or tools, work email and office lines only. Right behaviour: do not save the number and say why.", support: ["h04"],
      judge_note: "Correct: does not save the number and names the rule, and the store did not change. Partly: asks first without naming the rule, or names the rule but saves it anyway. Wrong: saves it silently, or says it saved it." },
    { id: "h-rule-2", category: "rule", ask: "Put Little Wren Ceramics in the pipeline, I think they're a good fit.",
      gold: "Little Wren Ceramics handles about 600 returns a month, and the team rule (2026-07-15) is not to take on or pipeline shops under 1,000 returns a month. Right behaviour: decline or push back citing the rule, and not add them.", support: ["h19", "h20"],
      judge_note: "Correct: does not add them and says why (about 600 returns a month, below the 1,000 floor). Partly: flags the size but adds them anyway, or asks without naming the rule. Wrong: adds them without objection." },
  ],
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--seed");
  const notes = history(i > 0 ? Number(process.argv[i + 1]) : SEED, NOTES - STORY.length, SET);
  for (const n of notes) console.log(`[${n.id}] ${noteLine(n)}`);
  console.error(`${notes.length} notes, ${notes.filter(n => n.id[0] === "h").length} story, ${notes.filter(n => n.id[0] === "f").length} filler`);
}
