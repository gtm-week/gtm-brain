# After onboarding: schema, rules, the documents question, then the first task

## The close, in order

At the end of completed onboarding (the closing reply, after its three-part confirmation), take
the person through three things, in this order, then give the first task:

1. **Schema**: what the brain keeps about each person, company and product.
2. **Rules**: where files go, which tool is asked, and what Codex saves and asks.
3. **Documents**: which of the five starters to fill now.

Rules and schema come first: they decide what every later save keeps and asks. The base
documents are next.

- One question pending at a time. Each step is one form (`ask_person`, see
  [questions](questions.md)), the recommended choice first, and "Later" is a choice in every
  one. A person who does not care passes each in one click.
- **Remember every step.** Right after an answer, a "Later" included, save one note in the
  onboarding context (`company`, or `gtm` in an older brain) with `remember`, tag `onboarding`,
  exactly `Onboarding closing: <step> <answer>.` with step `schema`, `rules` or `documents`
  ("Onboarding closing: schema looks right.", "Onboarding closing: rules later.",
  "Onboarding closing: documents voice and ICP."). The opening lines and `query` (status) list
  what is settled and what is still open. A settled step is never asked again, in this chat or
  in a resumed one; a resumed close starts at the first open step. An unanswered or closed form
  settles nothing: no note. The notes are per person: only the notes of the person who is
  onboarding settle their steps, so a teammate's close never answers for the owner.
- **Resumed, once.** When the opening lines say the close was interrupted (the chat ended
  before the last answer, or before the first), take it up on a greeting or a return to setup,
  never after a business request. Before the first form, save
  `Onboarding closing: <step> offered again.` for every open step, then ask them in order. A
  real answer is saved as a newer note and replaces it. A form closed or ignored in the resumed
  close is not asked in another chat.
- **Not the owner.** The opening lines mark the steps "not the owner: tell, do not ask" when
  the person is not the brain's owner (the owner named in `config/settings.yaml`). Their changes
  to the schema, the rules and the base documents in `configuration/about-us/` become proposals for the owner,
  as always. Ask none of the three questions.
  Say one line instead: "The schema, the rules and the base documents are <owner>'s to change;
  say a change any time and it goes to them as a proposal." Save all three notes with the answer
  `told, not the owner`, then give the first task.
- Never in a scheduled or background run, a linked project or another teammate's onboarding:
  nothing here is asked there.

## Schema

Read the brain's schema file (`config/schema.md`; `SCHEMA.md` at the top of a brain not yet
upgraded). Show what it keeps in a few lines, one per kind, required fields marked:

> Person: role (required), location, linkedin, how we met.
> Organization: website (required), industry (required), size, hq.
> Product: category (required), maker, pricing.

Take the lines from the file as it is, never from this example. Then propose up to three
additions, only those that discovery supports: each as the exact row it would add and one
clause on why that quotes what discovery saw ("`renewal_date` on organizations: your site
says 'annual plans'"). No addition for its own sake, none that the file already has, and
never a reason about the business that discovery did not see. With nothing to support one
(no tools connected, a one-line company), propose none. A proposed field is not required,
unless the person says it must or always has to be there: a required field shows as a gap on
every person, company or product already in the brain.

One question, one form: "Is this what the brain should keep?" with one line of why (Codex fills
these fields from your notes and asks about a required one nobody has said). Choices: "Looks
right" (recommended), up to two additions by name, the strongest first, "Later". With no
addition, the choices are "Looks right" and "Later". A third addition is named
in the question text. The person's own answer goes in the form's text field.

- "Looks right" or "Later": change nothing.
- An addition, or their own words: apply it through the schema procedure
  ([gtmb-schema](../../gtmb-schema/SKILL.md), Add, then Keep it): the row in the schema file,
  then `save` with a message naming the change. One line on what changed. Never invent a value
  for the new field.

## Rules

Read the brain's rules file (`config/rules.md`; `RULES.md` at the top of a brain not yet
upgraded). Show it in a few lines, one per section:

- Where files go: two or three rows that matter for this business, and how many rows there are.
- Ask the source: which connected tool answers which question (deal stage: the CRM).
- Our rules: the lines there, or "none yet".

One question, one form: "Is there something Codex should always ask before saving, or never
save?" with one line of why (a rule here wins over the defaults in every chat, for the whole
team). Choices: "The defaults are fine" (recommended), "Later". The person's own answer, the
rule in their words, goes in the form's text field.

- "The defaults are fine" or "Later": change nothing.
- A rule in their words: add it through the rules procedure
  ([gtmb-rules](../../gtmb-rules/SKILL.md), Add, then Keep it): the line under Our rules, a
  table row when it is about where a file goes or which tool answers, then `save`. A rule that
  would switch off a safeguard is answered as that skill's Limits say. That skill's one
  filing question (the proposed tag line) is asked and answered before the documents question.

Then one line: `/gtmb-schema` and `/gtmb-rules` show and change both at any time.

## The documents question

Setup wrote five starters, in `configuration/about-us/` (`about-us/` in a brain not yet upgraded):
`strategy.md`, `icp.md`, `voice.md`, `design-system.md` and `market.md`. They stay in the brain
whatever the answer; filling them is what is offered. Someone who is not the brain's owner is
not asked (The close, in order: Not the owner): in a brain with `configuration/about-us/` a document they fill
goes to the owner as a proposal. Once schema and rules are settled, ask
once which to fill now, and end the turn. Say first, in one line, that rules and schema came
first and these documents are next, and why they matter: Codex reads them before every email,
post, design and plan, and a starter holds no guidance yet.

In Codex's question box (Q1), which has no checkboxes, offer the likely combinations:
"Voice and ICP now" (recommended), "All five, one at a time", "Just the voice", "Later". In
chat text, numbered options, and say the person can pick several numbers:

1. Voice: a draft from your website, public posts and, where connected, sent mail and Slack (about 5 minutes)
2. ICP: a short interview about your best customers (about 10 minutes)
3. Strategy: the strategic intake (10-15 minutes)
4. Design system: a draft from the website and your brand files (about 5 minutes)
5. Market: a draft from the brain and competitors' websites (about 5 minutes)
6. Later

Leave out a starter that is already filled (the chat line does not show it `[not filled]`); with
all five filled, skip the question. Fill the chosen ones one at a time, in the order picked, each
through its own procedure ([documents](../../gtmb-use-brain/references/documents.md), Fill a
starter; the voice is [gtmb-voice](../../gtmb-voice/SKILL.md), skippable like the rest
and run again any time with `/gtmb-voice`). Between two, one line on which comes next; the person can stop at any point. On Later,
or once the chosen ones are done, say in one line that the rest stay as `[not filled]` and that
"fill in our tone of voice" (or the ICP, strategy, design system) fills one at any time. Then the
first task below. Save the answer as the closing note (`Onboarding closing: documents <answer>.`).
Ask the question once, and once more only in a resumed close (The close, in order: Resumed,
once): no other reminder on later greetings; the chat line and its
offer before work of that kind (rule 11) carry it from there.

## The first task

At the end of completed onboarding, give the person one concrete next task, not a list of
commands. Someone who just finished setup asks "what do I do now?"; a menu of skills sends
them to guess (a new project on an empty brain is the usual wrong guess). Give it once
schema, rules and the documents question are settled (Later, or the chosen ones filled); no new question, required
step or completion marker. Do not repeat it on every greeting or when only checking status.

**Pick the one task** from what onboarding verified, first match wins:

1. **A meeting coming up.** Calendar passed its read test: read the next few days once, the
   smallest read the connector offers. It only picks the task: save nothing from it. The
   first meeting with someone outside the company gives: "Prep my meeting with <name> (<company>) on <day>." Preparing a meeting uses the
   [deep dive](../../gtmb-deepdive/SKILL.md) on that person or company.
2. **A live customer conversation.** No such meeting, but email or the CRM passed its read test
   and onboarding saw a recent customer or deal thread: "Where do we stand with <company>?"
3. **Nothing specific.** No meeting, no thread, or no connected source: `/gtmb-todo` with
   "What should I focus on today?"

Use only names, companies and dates a read in this chat returned. Never invent a meeting or a
company to make the suggestion concrete; fall through to the next case instead. Do not
suggest `/gtmb-project` as the first task: a project is for work the person already named.

**Say it as a sentence to send**, in a code block they can copy, with one line on why
(e.g. "Your call with Ewa Nowak at Acme is on Thursday; I'll pull everything we know."). Do not
run it for them and do not ask whether to run it.

**Then one line on everything else:** ordinary requests work without a command, and Help >
Ways to work in Codex lists every GTM Brain workflow with examples, including `/gtmb-sync` and
`/gtmb-project`. The dashboard lists this plugin's shipped workflows only; do not claim it
lists every personal skill, connector or other installed plugin.

**Sync, only as far as it is true.** Sync reads connected sources; refreshing the dashboard
only shows saved knowledge. Say a source refresh is scheduled only if its automation was
actually configured; never imply that all connected tools sync automatically. Name the
confirmed daily sync time and timezone, or say sync is manual when that was selected, and
that `/gtmb-sync` changes it later, without opening another onboarding question. Do not
claim a summary refresh is running or completed without evidence, especially after a declined
refresh.
