# GTM Brain workflows and operations

Ask for the outcome in plain language. The plugin exposes workflow skills; internal
operations remain available to the agent and do not need their own skill commands.
Every identifier starts with `gtm-brain-`, and every display name starts with `GTM Brain:`
to distinguish these workflows from other installed skills.

| Skill identifier | Display name | What it does |
|---|---|---|
| `gtmb-project` | GTM Brain: Projects | Create a project folder, or link an existing one to your brain; repair, unlink, list |
| `gtmb-design-system` | GTM Brain: Build our design system | Brian Woloszczak and Peakout's starter: one shared website project (`link_project` with `starter: "web-design-system"`), tokens, components and a local catalogue; `design-system.md` points to it |
| `gtmb-add-section` | GTM Brain: Add a reusable section | A section from a source page or a brief, registered once in the website project for every page |
| `gtmb-build-landing-page` | GTM Brain: Build a landing page | A campaign page on the shared website from strategy, ICP, voice and offer; stops at a local preview |
| `gtmb-publish-website` | GTM Brain: Publish the website | Vercel preview first, production only on its own decision, through the Vercel and GitHub connectors |
| `gtmb-start` | GTM Brain: Start | The first command in a project: creates the brain here, gets to know the business, connects the tools, opens the dashboard; resumes what is unfinished |
| `gtmb-sync` | GTM Brain: Sync | Pull what came in through the connected tools since the last sync, one subagent per tool, and record what matters |
| `gtmb-use-zynt` | GTM Brain: Use ZYNT | Reads the news and signals on the team's ZYNT lists from any ZYNT connection and answers in the words of ZYNT's signals workshop: signals first, each in four parts (what happened, when, why it matters, who to contact), then the news, called news. With no signals yet it says so in one sentence and shows the news. Reads them against the brain's strategy and ICP, adds companies or people to a ZYNT list only on request, keeps useful findings in Target customers. Without ZYNT's tools it gives the steps from ZYNT's site guide; it never changes settings or uses a key |
| `gtmb-todo` | GTM Brain: Todo | What should I do now: everything waiting on you, ordered, walked through one by one |
| `gtmb-housekeeping` | GTM Brain: Housekeeping | Tidy names and gaps: `query` with object `housekeeping`, then one item at a time with the person; nothing looked up on the web |
| `gtmb-interaction` | GTM Brain: Interaction | Propose one of the company's own interactions (`propose_interaction`, then the APPROVE form of `approve_change`), list them or run one with `interact` |
| `gtmb-workflow` | GTM Brain: Workflows | Start a run of a workflow document (an outbound campaign, ads then outbound), see where it stands, do the next step, skip or abandon; switch one on so a schedule or a save offers it; the brain keeps the steps, dates and milestones |
| `gtmb-deepdive` | GTM Brain: Deep dive | A one-page brief on an entity or a context, from the notes and the tools read live |
| `gtmb-icp` | GTM Brain: Define ICP | Chris Pawlak's exploratory interview: company examples, fit and exclusions, buying committee, awareness and readiness; reuses brain evidence and keeps one formal draft ICP document |
| `gtmb-unit-economics` | GTM Brain: Unit economics | Lech Kaniuk's unit economics review: CAC, LTV12 and LTV24, LTV:CAC, both paybacks and retention from the chat and the brain, then PUSH, FIX, STOP or MEASURE overall and per acquisition source or segment; offers to keep the decision as a note and the missing inputs as questions |
| `gtmb-market-research` | GTM Brain: Market desk research | Chris Pawlak's market desk research: a 5-8 minute intake, a confirmed research frame, 15-30 sourced web and community reads, an interim checkpoint, then `market-desk-research-<slug>.md` with a positioning map and, when the numbers allow, a growth chart; market attractiveness and right to win judged separately, no offering design; accepted conclusions become notes |
| `gtmb-audience-loop` | GTM Brain: Audience loop | Assess who fits the ICP or find relevant conversations; independent of topic analysis |
| `gtmb-topic-analyzer` | GTM Brain: Topic analyzer | Given the ICP, understand its conversations from sourced participation and questions; independent of audience discovery |
| `gtmb-use-brain` | GTM Brain: Use the company brain | Everyday work: remember, recall, where we are |
| `gtmb-configure` | GTM Brain: Configure GTM Brain | Workplace info, team, tools and settings through APPROVE |
| `gtmb-skill` | GTM Brain: Your skills | Turn a repeated workflow into a Codex skill kept in the brain's `.agents/skills`; install from GitHub, list, remove, share |
| `gtmb-strategy` | GTM Brain: Strategic intake | A 10-15 minute conversation with a founder or a head of sales, growth or GTM that fills `strategy.md`, the document every brain starts with, mapped silently to Playing to Win; files shared on the way land in `strategy/` |
| `gtmb-voice` | GTM Brain: Voice | Asks whose voice it is (the company's, a person's, a team's), then reads evidence that fits: pasted texts at once, for the company the website, public posts and outbound mail (never internal chat), for a person their own writing (smallest reads, connectors only). Fills `voice.md` through `document` (a person's or team's voice is its own document): rules in the structure the evidence supports, observed apart from suggested, corrections quoted; saved as a draft on the person's yes, tested on one fresh email or post, then the kinds of work it governs and the sentence to try in a new chat; re-run to revise |
| `gtmb-zynt-setup` | GTM Brain: Set up ZYNT | Reads strategy, ICP, market, voice and the target companies from the brain, asks only what is missing (usually the segment), and fills ZYNT's setup through ZYNT's tools from any ZYNT connection (its plugin, a Claude or ChatGPT connector, a server added to Codex; browser sign-in, no key), drafts sent as drafts. Puts the brain's target companies and people on two ZYNT lists after the person's yes. In Codex without ZYNT's tools, the agent connects ZYNT itself (`codex mcp add zynt --url https://app.getzynt.com/mcp`, or `codex mcp login zynt`), says "signed in" only when `codex mcp list --json` shows `o_auth`, and gives one link that opens the next chat with the prompt ready; no plugin needed. Steps for Claude Code, Claude and ChatGPT; a pasted key is never used. Shows ZYNT's summary and answers it only with the person's yes, keeps one note in Target customers, ends with what to ask ZYNT ("Signals for me"); `check_tools` finds the connection by itself |
| `gtmb-freckle-setup` | GTM Brain: Set up Freckle | Started by "Set up Freckle for me": reads the ICP, personas and target companies from the brain, adds Freckle's MCP on the person's yes (`codex mcp add freckle`, the person signs in), records a read test, shows one plan in the brain's words, builds it on a yes and runs it (credits) only on a second yes, then keeps one note in Target customers so Freckle shows in the brain's tools |
| `gtmb-clay-setup` | GTM Brain: Set up Clay | Started by "Set up Clay for me": uses Clay's MCP tools when listed, else Clay's plugin and CLI (`codex plugin marketplace add clay-run/agent-plugins` on the person's yes, the person signs in), records a read test, reads the ICP, personas and target companies from the brain, runs the free search on a yes and enrichment (credits) only on a second yes, then keeps one note in Target customers so Clay shows in the brain's tools |
| `gtmb-woodpecker-setup` | GTM Brain: Set up Woodpecker | Started by "Set up Woodpecker for me": adds Woodpecker's hosted MCP on the person's yes (`codex mcp add woodpecker`, the person signs in), records a read test, shows the campaigns and their rates, drafts one sequence from the brain's strategy, ICP and voice, saves it as a draft on a yes (never `runCampaign`, no prospects added), then keeps one note in Target customers so Woodpecker shows in the brain's tools |
| `gtmb-surfer-setup` | GTM Brain: Set up Surfer | Started by "Set up Surfer for me": adds Surfer's hosted MCP on the person's yes (`codex mcp add surfer`, the person signs in), records a read test, proposes topics from the brain's strategy, ICP, market, call notes and voice, creates one content brief on a yes and a full article (credits) only on a second yes, never publishes, then keeps one note in Market so Surfer shows in the brain's tools |
| `gtmb-heyreach-setup` | GTM Brain: Set up HeyReach | Started by "Set up HeyReach for me": the person adds their workspace's Connection URL (a secret, never pasted in the chat) with `codex mcp add heyreach`, then the skill records a read test, shows the campaigns and their rates, drafts a connection note and two follow-ups from the brain for the person to paste into HeyReach (no sends, no leads, no campaign changes), and keeps one note in Target customers so HeyReach shows in the brain's tools |

Find workflow examples from Overview or Help > Ways to work in Codex.
Each entry explains the workflow, shows an example and its command, and opens a prepared
Codex message in the brain workspace. Review it and press Send to begin. You can also type
the command in an existing project chat. The list covers shipped GTM Brain skills only.

Requests such as "remember this", "load pipeline", "what do we know about Acme?", and
"update the summaries" still work. During company work, the agent records new information
as it appears and follows the brain's existing summary-update setting. You do not need to
run a sequence of memory commands.

The sections below document the underlying operations, tools, and script paths for reference.
They are not additional discoverable skills. Tools show outcomes such as "Remembering" or
"Searching the brain" in chat. Review proposals on the dashboard (it changes nothing but a document you edit and save there). APPROVE is a choice in the form `approve_change` shows; in a chat nothing else applies it.
A question to you comes the same way: `ask_person` shows a form with the choices to click (or a field to type in) and hands your answer back to Codex. It records nothing and applies nothing. Where the host shows no form, Codex asks in its own question box, or in chat text with numbered options.
Scripts retain their paths for terminal use with
`export PLUGIN_ROOT=~/.codex/plugins/cache/gtm-brain/gtm-brain/0.38.3`.

Legend for "writes": what files the command changes. Nothing else is ever touched. The paths are
those of a brain in the four folders (file layout 4, what setup makes since 0.37); a brain not
yet upgraded keeps the same files in the older places, listed in
[MANUAL.md, Updating to 0.37](../plugins/gtm-brain/MANUAL.md#updating-to-037-the-four-folders).
Tool descriptions and quoted tool output still say `RULES.md`, `SCHEMA.md` and `admin.md` for
the rules, the schema and the settings.

## Every day

### load
*"load pipeline"*, *"load pipeline marketing"*, *"switch to gtm"*, *"clear contexts"*

Chooses the context(s) for this chat. Codex reads the cover (summary, standing rules, the
Working guidance), people and tools, and the last memories; if the context's summary is behind it lists
what is new since the last compile (the summary refreshes by itself 2 minutes after the last save). Loading adds to the loaded set;
"switch to gtm" or "only gtm" replaces it. Creating or forking a context adds to it. A new
chat re-loads what was loaded last time, so you only say `load` to change context.

"unload marketing" drops one and keeps the rest.
Tool: `load_context`. Writes: `.gtm-brain/loaded-contexts.json` (local).
`node $PLUGIN_ROOT/scripts/gtm-brain-load/load.mjs . pipeline [--last 15]`, `... gtm --only`, `... --clear`

### remember
*"remember that Pierre asked for a three-year TCO before 12.09"*, *"note this"*, *"log that we decided ..."*,
*"correct memory m_xxxxxx: ..."*, *"forget memory m_xxxxxx, it was wrong"*

The saving rules are one numbered page, `skills/gtmb-use-brain/references/saving-rules.md`, printed at
every chat start with the "Our rules" section of the brain's own [rules.md](#rulesmd) after it (its people's
rules, which win). A held note quotes the rule it broke. Codex offers a line there when a save is questioned.

Appends one record to the loaded context's time series: who (your handle), when, via codex,
kind (note, decision, question), tools used, names mentioned (normalised through `entities/`;
unknown names are added, as people unless you say otherwise), the text, sources. A correction is a new
record that `supersedes` the old; a withdrawal `retracts` it; nothing is ever edited. If the
note clearly fits another context better, Codex uses it and confirms with its displayed name. Codex also records new information during work, including findings from tool results,
completed actions or decisions, meeting artifacts, and open questions. A short brief or a
descriptive source pointer is enough; duplicate reads add nothing.

Tool: `remember`. Writes: `memories/<YYYY-MM>.jsonl` (append), `entities/` (new
people). Kept at once. `context` is optional: the single loaded context, else the active context
where the note's people or companies have their notes (most of them, when it clearly holds most);
with no unique answer it is saved under the best guess (where its people have most notes, else
Our company) and the reply says so, so the person can move it in one sentence. Each kept note
is one line: `remembered <id> in <slug> (<Context title>) · <kind> · <author> · "<the note>"`. `by` is optional too: it defaults to the person
selected in this brain (`.gtm-brain/person.json`, else the brain's git identity in the team).

`events` (flag `--events "Northfold Summit | 2026-10-08"`) names the events the note is about: a
known event links by name or alias; `{name, date}` registers a new one once (`entities/events/`),
and the date is kept as a note of its own when the note's text does not say it. A new event without
a date is not registered: the note is saved and one reply line says what is missing.

Before writing, the note is compared with the notes in force across the whole brain (same project
only). The same fact again, with no value and no source the kept note lacks, writes nothing and
replies `already kept in <Context title>, <id>`. The same fact with another date, amount, code or
count replaces the kept note (`this changes <id> ...`) when that note rests on the person's word,
and is saved beside it when it comes from a source (`this may change <id> ...`). A note that only
says a call or meeting happened is held with the reason when the person said what came of it or the
same call carries outcomes; outcomes of one conversation in one call link to one meeting. The
speaker's own name is never asked about, and a note held for a name blocks only a resend of that
note, never an unrelated one in the same message.
`node $PLUGIN_ROOT/scripts/gtm-brain-remember/remember.mjs . [--by <handle>] --kind note --content "..." [--context <slug>] [--tools "attio"] [--people "Pierre Aubert"] [--source gmail:<id>] [--action "gmail:sent email:<id>"] [--supersedes m_x] [--retracts m_x]`

### interact
*"move the Castorama deal to proposal"*, *"send the proposal to Bergstrom"*: whatever this company
described as its own interaction.

Runs one of this company's own interactions (`configuration/interactions.json`; `list_objects` lists
them). Check, act, then record, in two calls that carry everything themselves (nothing waits in
server memory between them):

1. `interact {name, params}`: the inputs are checked against the interaction's schema, and so is
   what would refuse the note later (a person not in the team, a context that is not active, a
   long dash or a bare relative date in the note); a refusal writes nothing. Otherwise the reply gives the interaction's `refuse_when` rule and exactly what
   to do in the connector, which Codex does with that connector's own tools. Nothing is written yet.
2. `interact {name, params, outcome, refs, error}` with the same name and params, after the
   connector answered. `outcome: "done"` records the memory the interaction prescribes through
   `remember` (context, kind, people, companies, the action as `tool:action:ref`), with `refs` (what
   the connector returned: a direct URL, `provider:id`, a bare id read as the interaction's tool, or
   `{kind, account, ref, url}`) as its source pointers, account included when known.
   `outcome: "failed"` records a failure note instead: `Failed in <tool>, not done: <title>
   (<inputs>), tried <date>. Error: <error>`, tagged `interaction-failed`, with no action. Long
   inputs and a long error are cut, and long dashes become hyphens, so the note is always kept.

An interaction with `external: false` in its file has no connector step and records at once on the
first call (`outcome: "failed"` still records a failure note). `list_objects` shows it as
`[record only]`. A plugin tool's name is refused: call the tool.

Tool: `interact`. Writes: nothing on the first call; `memories/<YYYY-MM>.jsonl` (via
remember) on the second, or at once for `external: false`.

### propose_interaction
*"every week I move deals in Attio by hand; make that a thing"*, including after the advisor points out an action that recurs.

Drafts one of this company's interactions from the person's words (name, tool, the operation in
words, inputs, what it records; `external: false` and no tool when nothing is done in a connector), validates it and writes `.gtm-brain/interaction.proposed.json`. The
dashboard shows it in words; Codex then calls `approve_change` with kind interaction, and
choosing APPROVE in its form applies it. `approve.mjs <root> --interaction --by <person>` is the only writer of
`configuration/interactions.json`: it appends the proposal and commits `interactions: <name>`. The
advisor only suggests one, from an action recorded three times in a month: a brain check never writes a proposal.

Tool: `propose_interaction`. Writes: `.gtm-brain/interaction.proposed.json` (local).

### deal health
*"how healthy is the Nowa Deweloper deal?"*, *"what am I missing before the call with Acme?"*

Scores one deal on MEDDPICC (metrics, economic buyer, decision criteria, decision process, paper
process, pain, champion, competition) from the memories about that company only. Each element is
confirmed, weak or missing, and every score cites the memory it rests on; the missing ones become
up to three questions for the next conversation. It reads only and saves nothing: answers are
remembered like any finding and the next read scores them. The rubric is
`skills/gtmb-use-brain/references/deal-health.md`.

Tool: `query` with object `deal` and search = the company. Off for a brain whose `configuration/settings.yaml`
front matter has `deal_scoring: off` (new brains get `deal_scoring: on`; a brain without the line
has it on). The line is workplace info, so it changes through APPROVE.

`save_nudge` in the same front matter: after three reads in a chat (`query`, `load_context`) with
nothing saved, the read's reply ends with one line asking to save what the turn established; it
comes back only after five more reads and never in a scheduled or background run. `save_nudge: off`
turns it off (a brain without the line has it on).

`big_files` in the same front matter says where a recording (audio or video, any size) or a file
over 25 MB goes, since git never keeps it: `google-drive` (new brains, and a brain without the
line) places it in one Drive folder (`big_files_drive_folder:`, else "<company> GTM Brain files")
with the Drive connector; `local` copies it to a folder on this computer outside git
(`big_files_folder:`, an absolute path, else `~/gtm-brain-files/<brain folder>`), not shared. Either
way the note that says what it is keeps a pointer (`{kind: "google-drive", account, ref, url}` or
`{kind: "file", ref: <absolute path>}`, `lib/pointers.mjs` `bigFilePointer`), never the bytes.
`save`, the chat start and `add-file.mjs` give the same instruction (`lib.bigFileAdvice`) and the
walk-through is `skills/gtmb-use-brain/references/big-files.md`: `add-file.mjs --file <path>
--big` copies and checks the file (local) or names the Drive folder, `add-file.mjs --drive <link>
[--account <a>]` prints the Drive pointer. Onboarding asks the choice once and saves the answer as
the note `Big files: google-drive.` or `Big files: local.` in `company` (`lib.bigFilesChoice`). It
changes through APPROVE.

### recall
*"what do we know about the TCO?"*, *"did we ever talk about Berlin?"*, *"tell me about Pierre Aubert"*

Searches every memory in every context, loaded or not, by keyword (names expand through
`entities/`, so "the CFO" finds Pierre if that alias exists). Hits are grouped by context and
say which are not loaded. An empty result is reported as such, never filled in. With a person's
name or `entity` ID it reads a permanent brief from `entities/`: identity, cited overview,
per-context state, open threads, relationships, recent developments and source pointers.
An optional `context` scopes the view without loading context instructions.

Tool: `recall`. Keyword search and exact memory queries reuse the derived disk index at
`.gtm-brain/memory-index.sqlite`. Source changes refresh it automatically; reading an entity brief
writes nothing. The index is local, uncommitted, and rebuildable from the brain files.
The MCP reader starts one worker when needed and releases it after 30 seconds idle. Indexing
reads one record at a time with a 4 MiB record limit; queries return at most 2 MiB, with an explicit
error asking for a narrower query if that bound would be exceeded. No partial result is reported
as complete. There are at most 32 pending indexed reads per server, with 64 KiB per query input.
`node $PLUGIN_ROOT/scripts/gtm-brain-recall/recall.mjs . "<query>"`, `... --person "<name>"`

### answer
*"what did Zak want?"*, *"how many sign-ups did the Merantix opening have?"*, *"what did we decide last week?"*

Since 0.38.0 one `query answer` call returns everything recorded that the question can need: a small brain (every
current note fits in about 40,000 characters of compact lines: date, context, kind, who, full text, id) comes back whole,
oldest to newest; a larger one brings every note about each company or person the question names, then every note any of
its other words (stems and prefixes), the period it asks about (record date or a date in the note text) or the kind matches,
under about 40 KB, with one line naming the single `query sql` read for what did not fit. Entity pages under `entities/`
(`entities/organizations/<slug>.md`, `entities/people/<slug>.md`) still end with "Everything recorded" for people reading them.

One call for a question: `query` with object `answer` and `search` set to the question as asked
(`lib/memory-search.mjs`, run in the memory worker). Names, aliases, first names and emails resolve
through the entity registry and narrow to that entity's notes; a product also brings the
organization it currently belongs to; a first name two entities share is named in the reply, not
guessed. A period (today, yesterday, tomorrow, last or next week, this month, in October, since
October, Q3, last quarter, 3 November, a date, a weekday, next Thursday; a calendar word also finds
notes that mention it, and "night" or "morning" after a weekday ranks notes with such a time
first), a kind (decisions,
questions) and `#tag` narrow too. When no narrowed note has the question's words, the period, then
the kind, then the tags are dropped and the reply says so; a name stays (its notes follow, newest
first) unless it was only taken from one word. A month word that is a known name (Jan, April) is
the person unless written as a month (in April, April 2026).
The words then rank what is left: stemmed (porter, so invoice finds invoicing and sign-ups finds
signups), a word no note has (five letters or more) tried as the spellings one letter off in the
brain's word list, ranked below exact matches and named in one line; more of the words, the
question's own phrases, words near each other, then newer first. Superseded and retracted notes
never appear. A note recording a relationship or customer status that a later note contradicts
sinks, says "no longer current" with the later note's id, and that note follows it; a
relationship word in the question (partner, works, customer) brings the named entity's notes of
that type. The reply carries each note's text, date, age, id and source, the card of each named
entity (kind, aliases, compiled overview, fields, current relationships, note count and age), and
`Not found:` plainly when nothing matches. It stays under 12 KB (the environment variable
`GTM_BRAIN_SEARCH_MAX_BYTES` changes that) and ends with how many more matched and the limit that
shows the next few. A long note is cut, with the SQL that reads the rest. An id, a tag or a source ref typed as-is comes first. `query` with object `memories` and `search`
uses the same engine and cap, as JSON rows. Reads only.

### memory_index
*"is search up to date?"*, *"finish indexing this import"*, *"rebuild the search index"*

Tool: `memory_index`, with `mode: status | refresh | rebuild`. Status shows freshness,
checkpoint progress, remaining contexts and entity links, and index/source disk size. Refresh
works in bounded batches; repeat it until `status: ready`. New chats and interrupted processes
resume saved checkpoints. Partial indexes never produce successful search results.

Rebuild safely replaces the local cache while other sessions are excluded, preserving one prior
cache for diagnosis and all source files. Use it for a requested full rebuild or a damaged cache,
then continue with refresh. No manual SQLite deletion or source commit is needed. A call's work
budget defaults to 1000 ms (100 to 5000 allowed); a source check or SQL operation can overrun it.
Normal appends use bounded local writer receipts, and manual edits fall back to source verification
or a rebuild of the affected context. Entity changes rematch candidate notes from a separate text
and reference index, including old spellings and shared aliases.

`node $PLUGIN_ROOT/scripts/gtm-brain-advisor/memory-index.mjs . --mode status`

### compile
*"compile"*, *"compile pipeline"*, *"update the summaries"*, or "yes" when Codex offers it

Rewrites the cover of a context whose summary is behind from its memories. The script computes the names mentioned (with their kinds), tools,
related contexts (shared people), confidence, timestamps; Codex writes the summary (2 to 4
sentences, each ending with the note ids it rests on, kept as `summary_sources`; absolute dates only; `compile_apply` refuses anything else) and Working guidance: reusable methods learned in this context, including tool-use lessons.
Immediate next steps belong in the summary and source follow-ups. Guidance may be empty. Compilation sees memory
IDs, source/action references, and prior guidance; it revalidates older lessons against the
effective memories and cites memory IDs for durable tool guidance. There is no fixed sentence
cap on this guidance. Your standing rule from setup is never changed. Only contexts whose summary is behind, unless you name
one. Runs unattended on the schedule.

Tools: `compile_facts`, `compile_apply`. Writes: `memories/topics/<slug>.md`; kept at once.
Since 0.35.0 on demand: `load_context` of a context whose summary is older than its newest note gives the notes since and `as_of`, and the chat writes the summary once with `compile_apply`; cached until new notes arrive. No run starts after a save or at chat start. Each chat write or refusal adds a line to `.gtm-brain/runs.jsonl`. A run started by hand or by a schedule (`background-compile.sh`, state in `.gtm-brain/compile.json`) still compiles everything behind. The chat start carries one `health:` line when there is something to say: why meetings may be missing, the last summary written and the last failure, in plain words with what to do (`.gtm-brain/runs.jsonl`, `.gtm-brain/compile.json`), the last sync per tool (`.gtm-brain/sync.json`, meeting coverage; a tool older than its window, 7 days or the checkpoint's `window_days`, is marked overdue), the count of held meetings not captured, and a `population:` part when a population number is out of range.
Model passes have a 15-minute timeout (`GTM_BRAIN_COMPILE_TIMEOUT_MS` overrides it in milliseconds).
Failed scans and timed-out runs enter the three-attempt retry path; completed compilations stay
saved. Successful passes that reduce the pending context or entity set continue without using
the failure budget. Locks verify process identity and release only their own ownership token.
`node $PLUGIN_ROOT/scripts/gtm-brain-compile/compile.mjs . --stale | --facts <slug> | --apply <slug> --by <handle> --as-of <id from --facts> --summary "..." --now "..."`
`--now ""` clears guidance when no useful methods remain. Omitting `--now` is an error.
`--apply` refuses when a memory arrived after `--facts`, so a summary never covers less than the cover claims.

### render
*"render"*, *"show me the dashboard"*, *"open the dashboard"*, *"where does this number come from"*

Builds a read-only `.gtm-brain/home/index.html` from contexts, memories, proposed changes,
brain questions and tool status. Both renderer and local server leave the brain's files unchanged.
Chat about this opens a new Codex task in the selected project folder (or the brain folder
for other views) with a short, readable prompt about the current topic.
Chat is optional even when nothing needs attention. Codex retrieves current questions and their
IDs through the tools. Review the prompt and press Send to begin. All changes happen in Codex.
The live viewer refreshes after each saved answer, preserving browsing state independently
of summary compilation. A saved HTML copy offers the same chat link without live updates.

The page stays between chats: the chat start starts the server, and the tab is marked
deliverable so it survives the turn. One tab, reloaded rather than reopened, never closed in
cleanup. The dashboard always uses the Codex pane and needs no login. Legacy
`dashboard_browser` values are ignored. Chrome setup is separate, personal to the machine,
and used for approved website work requiring existing logins; MCP remains the first choice.

Every memory ID compilation wrote into a summary or Working guidance is shown as a citation
pill with the note's date and author: hover for the note, click to jump to it in its context.
A grey pill is an ID that no longer resolves (withdrawn, or in a context this dashboard does not
hold). A sentence with no pill has no source note, so the summary itself is what is wrong.
Correcting a wrong sentence means forgetting the note behind its pill, not editing the summary.

The dashboard server answers reads only, except `POST /document`: saving a document edited on the page runs `document.mjs --update <path> --body` (the same validation, header and commit as in chat; on layout 3 a teammate's change to a base file becomes a proposal). It asks for the page's own Origin and Host, a token made at each server start and served only inside the page, JSON, a text within the 64 KB document limit, a path `lib/documents` lists, and the hash of the version that was opened (a file changed meanwhile is not overwritten); never during a scheduled run. `GET /search?q=` reads the memory index for the search box. Two of the reads belong to the Design system document: `GET /design-file?path=` serves a png, jpg, svg or webp the last render listed from the `design-system/` folder beside it, and `GET /design-visual` serves the one `design-system.html` beside it; both go out sandboxed (`Content-Security-Policy: sandbox`, nosniff), so nothing in them runs script. `POST /entity-edit` takes one of nine named operations for the Entities tab (create, update, merge, archive, set_fields, add_relation, end_relation, retract_relation, set_customer) behind the same checks; each runs the entities or remember script, so a relation or a field saved on the page is a note with its author. `POST /memory-edit` takes one of five named operations for the menu on a note in the Memories tab (correct, retract, move, set_kind, answer) behind the same checks; each is one call of the remember script and never edits or removes a line: a correction or a change of kind is a new note that supersedes the old one, "This was wrong" and an answer to an open question are notes that retract it, and a move withdraws the note in its topic and saves it again in the other, with the person at this computer as the author and the dashboard as a source beside the note's own. `GET /chat` answers which chat of this brain is newest on this computer, so a prepared message on the page opens in that chat (`codex://threads/<id>?prompt=`) and not in a new one.

Tools: `render_dashboard` (rebuild), `open_dashboard` (rebuild, start the server, open the browser). Writes: `.gtm-brain/home/` (local); `.gtm-brain/dash.json`, `.gtm-brain/session.json`
(the chat recorded at chat start).
`node $PLUGIN_ROOT/scripts/gtm-brain-render/render.mjs . && open .gtm-brain/home/index.html`

### save
*"save"*, *"commit my notes"*

Keeps changes you made by hand outside Codex (a cover edited in an editor, names fixed by hand).
Everything Codex writes is kept the moment it is written, so this is rare. Refuses while an admin
proposal waits for APPROVE. The pre-commit hook validates every memories file.

Everything Codex writes is kept at once: one commit per change, in your name, shared when the
brain has a remote. You never say save. `save` exists for edits made by hand outside Codex (a
cover changed in an editor, names fixed by hand). APPROVE commits the workplace info; the
scheduled run's compile commits its covers; setup makes the first commit; upgrade keeps the rules
it refreshed. Anything you had staged yourself stays out of these commits.

Files Codex makes with its own shell (a graphic, a brief, a project folder) are kept by `save` too,
with `placed`: for each new file or folder, its path, the rules row it followed and why. Each
becomes a `gtm-brain-why: <path>: RULES.md row 5 (...): <why>` line in that commit, so git
history is the shared log of where things went and why. *"Why is this file here?"* is `query`
with object `why` and the path: the row, the reason, who put it there and when, or, with none
recorded, when it arrived and that you should be asked. The chat start names new files that
arrived with no reason (made by shell, kept by background maintenance), once per set.

*"Check the brain against its rules"* is `query` with object `rules`: people known by a first name
only (P3), look-alike names nobody confirmed (P4), top-level folders no rules row names, files
with no recorded reason (grouped by folder), names with capitals or spaces, Ask the source rows that
cannot be read. Each finding names its
rule, the person or path, and two or three fixed choices carried out through the tools above
(`add_name`, `merge_entities`, `save` with `placed`), so each fix leaves its own reason. It reads
only and changes nothing; `query` with object `health` counts what it found.

`query` with object `rules` and a `search` word returns one rule page instead: the detail of a
rule the brain's `AGENTS.md` keeps as one line (questions, computer-use, answers, saving, contexts,
entities, files, documents, approve, meetings, customers, interactions, dashboard, projects,
skills). The pages ship with the plugin in `plugins/gtm-brain/policies/rules/` (the first two are
`policies/questions.md` and `policies/computer-use.md`). A tool also attaches its own page to the
first reply of a chat that refuses, holds or fails, once, never to one that worked (the one exception: the answers page still comes with the first
`query` memories search of a chat): `remember` the saving page, `load_context` and the other context tools the contexts page, the entity tools the
entities page, `document` the documents page, and so on. Writes: nothing.

*"Let's do housekeeping"*, *"tidy up"*, *"clean up the duplicates"* is `query` with object
`housekeeping` (`lib/housekeeping.mjs`): the rules check's list in three groups with counts (people
known by a first name only, names that may be the same person or company, other findings) and,
for the first five items of each group, the evidence to ask the person without another read: the
notes that mention a first-name person (id, date, 200 characters) with the companies and emails in
them; for a pair both cards side by side, what a merge would keep and the two tool calls with ids.
`filters.offset` returns the next items, `search` (first names, same names, other) one group. The
reply stays under 12 KB and ends with the instruction the rules check also ends with
(`ONE_AT_A_TIME` in `lib/rules-check.mjs`): one item at a time, ask the person, never the web.
Among the other findings: three or more notes name events and the brain has no event entity
(`unregisteredKinds` in `lib/population.mjs`), with up to three names and the sentence to send.
Reads only. Writes: nothing.

Several people or companies in one read: `query` with object `entities` and `filters.name` and/or
`filters.id` as lists (or names typed into `search` with commas or "and"), at most 25
(`lib/entity-cards.mjs`). One card each in the order asked: name, kind, id, relation to us, where
they work (the relation log), the compiled brief's first lines and the newest three notes cut to
200 characters. A name several entities share lists them in one line; an unknown name says so.
Same 12 KB cap whatever `limit` says: notes are dropped before entities and the last lines say
what was left out. The `sql` parameter's description names the tables and columns and gives one
worked example, so no `describe_object` call comes first. Writes: nothing.

*"Is the brain too full or too empty?"* is `query` with object `population`
(`scripts/gtm-brain-advisor/population.mjs`, numbers in `lib/population.mjs`). Deterministic, from
the files, no model: notes saved in the last 7 days and the weekly average of the 4 weeks before;
exact duplicates (same normalized text) and near duplicates (same source record, same day, same
context; chat, person and fork pointers do not count); entities no note in force mentions;
entities missing a field the schema marks required (no cited value in the compiled brief); notes no
context summary or entity brief cites, of those recorded before their context's last summary; the
share of notes without a source pointer. Our own company and the team are not counted as entities.
Each number is shown with its range (`POPULATION_RANGES`, no setting yet; shares are judged from 20
notes and 10 entities, the week from 35 days of notes); capture rate and noise rate read "not measured". `--json` gives the data.
Reads only. Writes: `.gtm-brain/population.json`, a cache keyed on the files it reads and the hour.

The source sync keeps one checkpoint per source in `.gtm-brain/sync.json`:
`{"at", "tools", "sources": {"<kind>" | "<kind>:<account>": {"at", "window_days"?}}}`, with the
kind and account of a note's source pointer. A source without its own entry reads from the
top-level `at`, which is all a brain from before 0.35.0 has.

Tool: `save`. Writes: a git commit (never `.gtm-brain/`); with only `placed`, a commit that carries the
reasons and nothing else.

### share_brain
*"push this brain to my GitHub"*, *"share the brain"*, *"put the brain on GitHub"*

Creates a private repository on the person's GitHub with `gh` (named `<company>-brain`, or the
name they give), sets it as `origin` and pushes everything; hand edits are saved first. From then
on every note and every save pushes there. A brain that already has a remote is pushed, never
re-created. It needs `gh` installed and signed in (`gh auth login`, then `gh auth setup-git`,
the person's own step in a terminal); when it is not, the reply says exactly that and nothing
changes. Codex asks once before creating the repository, since it publishes the folder.

Tool: `share_brain` (`name` optional). Writes: the git remote `origin`, a push; the repository on GitHub.
`node $PLUGIN_ROOT/scripts/gtm-brain-share/share.mjs . [--name <repository>]`

## Contexts

### contexts
*"what contexts are there?"*, *"create a context for the Berlin expansion"*, or "yes" when Codex offers one

Lists the contexts with memory counts, whether each summary is up to date or behind, and summaries; or creates one. Creating is
deliberate: reuse an existing context first. An explicit request or a clear ongoing initiative
with a distinct purpose, expected continuation, and useful separation creates and loads a context
at once, followed by a one-line confirmation. A topic shift alone does not create one. Emerging
themes and splits of accumulated material are proposed first. Admin and personal preferences
keep their canonical homes; they are not created again for each topic or session.

Tools: `list_contexts`, `new_context`. Writes: `memories/topics/<slug>.md`; kept at once.
`node $PLUGIN_ROOT/scripts/gtm-brain-contexts/contexts.mjs .`, `... --new <slug> "<Title>" "<rule>"`, `... --json`

### archive
*"archive berlin-expansion"*, *"unarchive berlin-expansion"*

Puts a finished or mistaken context away: status `archived` on its cover, unloaded, no longer
listed or offered. Its memories stay in the files and in search. Nothing is deleted; Codex
confirms first. Unarchive brings it back. Deleting a folder is your own git operation.

Tool: `archive_context`. Writes: `memories/topics/<slug>.md` (status).
`node $PLUGIN_ROOT/scripts/gtm-brain-contexts/contexts.mjs . --archive <slug>`, `... --unarchive <slug>`

### fork
*"Bergstrom is becoming its own thing; fork it out of pipeline"*

Makes a new context from an existing one: same standing rule, including purpose and boundaries, the memories that match a
keyword copied (tagged `forked:<from>`, with a source pointing at the original record),
`forked_from` set, loaded at once. The original keeps everything; search and the dashboard count
a copied memory once. Codex offers a fork when many memories in one context are about one account or
initiative.

Tool: `fork_context`. Writes: the new `memories/topics/<slug>.md` and the copied notes, in the files of their months.
`node $PLUGIN_ROOT/scripts/gtm-brain-contexts/contexts.mjs . --fork pipeline bergstrom "Bergstrom Home" --filter bergstrom`

### entities
*"who is Chris?"*, *"Chris is Krzysztof Pawlak, email chris@reflow.io"*, *"Telli is a company"*, *"what names do we have?"*

The identity registry and readable briefs: one Markdown file per entity with a stable ID,
canonical name, aliases, contacts and external references. Team members are included at setup.
Facts stay in context memories; narrative sections are compiled with citations. `remember` and `recall` resolve names through it; a one-word first name resolves
when only one person has it.

Tools: `who_is`, `add_name` (aliases, emails, kind, external references and identity sources),
`update_entity` (explicit set/add/remove by stable ID), `merge_entities` (one call with `confirmed: true` once the person has confirmed; otherwise preview then apply),
`answer_question` (closes an open question with the person's answer as the note that retracts it, and carries out same or different for two names; without a question it lists the open ones),
`archive_entity` (`undo: true` restores), `undo_entity_merge` (preview then reverse a recorded merge),
`entity_facts` and `compile_entity` (a cited brief from current evidence). Writes:
`entities/<kind>/*.md` and `entities/.history/`, through the library. Aliases cannot
merge existing records. Merge previews check conflicts and revisions; recovery records travel
with Git. Archive hides identities from active lists while direct lookup still works. Merge
reversal preserves memory history and refuses to discard subsequent identity or handwritten
edits. Permanent erasure is not implemented. Corrections to facts go into context memories.
Entity writes refresh only affected generated pages and commit before returning. Unchanged
page checkpoints avoid a second refresh during commit. Generated Markdown keeps a recent
100-record timeline plus full context-history links; source memories and user Markdown are
preserved. The dashboard refresh runs afterward in one shared worker, combines queued writes,
and retains its last valid page if refreshing fails. `render_dashboard` explicitly retries
and waits for completion. The live viewer loads older context notes and entity details on demand;
its search covers loaded notes, while `query` and `recall` search the whole brain.
Local refresh diagnostics: `.gtm-brain/entity-pages.json`, `.gtm-brain/render-state.json`, `.gtm-brain/render.log`.
These checkpoints and the paged files under `.gtm-brain/home/` are disposable, never another source
of identity or memory truth. Page/data publication is serialized across explicit and queued renders.
Legacy registry files migrate on the first write or `upgrade_brain`, with originals backed up.
`node $PLUGIN_ROOT/scripts/gtm-brain-entities/entities.mjs .`, `... --add "Name" --alias "a, b" --email x@y`, `... --who chris`

## Documents

### document
*"add our tone of voice"*, *"save the design system"*, *"add strategy.md as a document"*, *"our ICP
definition"*, *"list the documents"*, *"check this against our documents"*, *"approve the strategy"*

A document is one Markdown file, a base document in `configuration/about-us/` (`strategy.md`) or
one in a folder the person names (`brand/voice.md`), with `kind: document` in its frontmatter: a title, `applies_to` (the kinds of
work it governs: copy, outreach, posts, landing pages, design, proposals, planning), a status
(`draft` or `approved`, approved only on the person's word) and the body in the person's language.
Its files live in a folder of its name beside it (`brand/design-system/`), or around it when it is
alone in its folder. The opening lines and `query` (status) name every document in every chat with
its file count, in the brain and in each linked project, and rule 11 of the brain's rules makes
Codex read the matching one in full before that kind of work and say which it followed. Nothing
compiles or summarizes a document. Hand edits in an editor are kept by `save`; a hand-written
Markdown without the marker is not a document until adopted. See [DOCUMENTS.md](DOCUMENTS.md).

Tool: `document` (`action` prepare | create | list | show | files | update | remove; `ref` is a slug or a path,
`folder` places a new one). Writes: the document file, one commit each. `guideline` is the retired
name, hidden from the tool list, answering with the same result for one more version.
`node $PLUGIN_ROOT/scripts/gtm-brain-documents/document.mjs . --create --title "Tone of voice" --applies-to "copy, outreach, posts" --body "..." [--folder brand] [--status approved] [--by handle]`
`... --create --title "Strategy" --applies-to "strategy, planning" --file strategy.md` (a Markdown already in the brain is adopted; one from outside is copied in)
`... --list [--json]`, `... --show tone-of-voice`, `... --files design-system`, `... --update brand/tone-of-voice --status approved`, `... --remove tone-of-voice`

A base file the team adds (*"add pricing as a base file"*, *"make a competitors file"*): `action: prepare`
(`... --prepare --title Pricing`, or `--file pricing.md` for a Markdown dropped into the brain) writes nothing and
returns the base file that already covers the subject, the starter from `templates/base-files/` (pricing,
positioning, competitors, objections), the brain's notes on it and the one question with its choices. `append`
(`--append "## Section"`) adds a section to an existing one and keeps the rest; `preview` (`--preview`) shows a
write without making it. Adopting in place and a fields-only update keep the text byte for byte. The list shows
each one's state (not filled, draft, approved) and the day it last changed (`changed` in `--json`), then the
root Markdown not used yet; the health line names such a file once.

### A file for a document or an entity
*a path or a dropped file with "add this to the design system"*, *"this is the Acme logo"*

`node $PLUGIN_ROOT/skills/gtm-brain-add-file/add-file.mjs . --file <path> [--document <ref> | --entity "<name>"]`
lands the file beside its owner: the document's files folder, or the folder of the same name next to the
entity's page. With no owner named it refuses, so nothing lands in the brain unasked (the
`files/<yyyy-mm>/` fallback is gone since 0.27.0; files landed there earlier stay and their
links keep working). It prints where it landed and the owner; an
entity file is then attached through `remember` with `asset`. No skill to invoke: use-brain's
`references/files.md` is the procedure.

### keep_approved_file
*"this is my photo, use it from now on"*, *"this is our logo"*, *"use this one instead"*

One call keeps an approved file for a person, company or product: copied from outside the brain (an
attachment in Downloads) or from `.gtm-brain/`, moved when loose in `entities/`, into
the folder beside the entity's page (`entities/<kind>/<name>-<short id>/`), committed, and recorded as the approved file for its role (portrait,
primary-logo, ...). A previous approved file for the same role is replaced. Every chat's opening
lines name the approved files.

## Workflows

### workflow
*"start the outbound workflow"*, *"where is the campaign"*, *"next step"*, *"skip this step"*,
*"abandon the run"*, *"list workflows"*, *"which workflows are running"*, *"check the workflow"*,
*"switch on the workflow"*, *"pause the run"*, *"move step 2 to 2026-12-01"*

A workflow is a document in `workflows/` with `type: workflow` and a header (status draft,
active or paused; trigger; reads; writes); a run is its state as memories in one context, tagged
`workflow:<slug>` and `run:<id>`, one note per step with a `due:` tag, a `brain-question` per
reached date gate, `event:<id>` and `subject:<entity>` on the first note of a run an event
started, `milestone-reached` on a step the brain saw done. See [WORKFLOWS.md](WORKFLOWS.md).

Tool: `workflow` (`action` list | view | create | check | needs | activate | pause | resume |
start | dismiss | status | advance | skip | move | fail | pause_run | resume_run | cancel |
abandon | due). Writes: `memories/<YYYY-MM>.jsonl`, one commit per action;
`activate`, `pause` and `resume` change only the `status` and `active_since` lines of the
workflow file. `check` and `needs` write nothing. `due` is called by session maintenance and by
the scheduled run with `by` schedule or session: it marks steps whose date passed (asking their
gate question once), records a due step done when its milestone is in the brain, opens the next,
at most 5 steps a run a day, and prints the offers; it never starts a run. Writes also
`.gtm-brain/workflow-raised.json` (a step raised again, once a day). `query` object `workflows` is
the view. The chat start lists runs in progress, then one line per active workflow with events
waiting and per workflow held by a schema change. Limits are `LIMITS` in `lib/workflows.mjs`;
`workflows: off` in `configuration/settings.yaml` turns them all off.
`node $PLUGIN_ROOT/scripts/gtm-brain-workflow/workflow.mjs . --list | --view | --create "<title>" --body ... [--trigger ...] [--reads ...] [--writes ...] [--context <ctx>] --by <handle> | --check <slug> | --needs <slug or skill> | --activate <slug> | --pause <slug> | --resume <slug> --by <handle> | --start <slug> [--event <id>] [--context <ctx>] [--handle "<name>"] --settled '{"Label":"answer"}' --by <handle> | --dismiss <slug> --event <id> --reason ... --by <handle> | --status <run> | --advance <run> --step <n> [--note ...] [--answer ...] [--actions tool:action:ref,...] [--learned '{...}'] --by <handle> | --skip <run> --step <n> --reason ... | --move <run> --step <n> --to YYYY-MM-DD | --fail <run> --step <n> --reason ... | --pause-run <run> --reason ... | --resume-run <run> | --cancel <run> --reason ... (each --by <handle>) | --due [--today YYYY-MM-DD] --by <handle|schedule|session>`

## Setup and admin

### check my machine
*"check my machine"*, *"is everything installed?"*, and step 0 of setup

Node, codex and its sign-in, git, and whether the folder is empty, a brain, or something else. One card, no shell.

Tool: `check_environment`. Writes: nothing.

### setup
*"set up a new company brain in this folder"* (empty folder)

Four questions, one at a time: your full name and work email; the company, what it sells and to
whom; teammates; the tools you use (a numbered list, pick several, CRM first). Creates `configuration/settings.yaml`, the
contexts Our company (`company`), Strategy, Market, Target customers (`icp`), Our offer and your
personal context, `entities/` with the team, `AGENTS.md`, `README.md`, `configuration/rules.md`,
`configuration/schema.md`, the base documents in `configuration/about-us/`, `workflows/`, git and the pre-commit check; then checks the tools. Handles are full
names, lowercase, hyphenated (`maciej-konczal`).

Tool: `setup_brain`. Writes: everything in a new brain; the first commit.
`bash $PLUGIN_ROOT/scripts/gtm-brain-setup/setup.sh --company X --one-liner "..." --owner "Name <email>" --team "Name <email>, ..." --tools "Attio (CRM), Gmail"`

### new project / link project
During onboarding, GTM Brain asks which existing Codex projects to follow. `list_projects` with
`include_available: true` reads the host's project catalog and reports complete, partial or
unavailable coverage. Selected projects are linked with the submitted capture consent; skips
are saved for the person. Onboarding stays in its current chat. If the catalog cannot supply
a project, the person can give its existing folder path. The dashboard records Your projects
as the sixth onboarding step. Completed v1 onboarding resumes only this new choice.

*"create a project for the curriculum at ~/curriculum"*, *"link this folder"*, *"unlink this project"*, *"list projects"*

`/gtmb-project` creates `<brain-root>/projects/<project-slug>/` by default, the projects
folder [rules.md](#rulesmd) names. A project inside the brain is the team's: its files go in the brain's git, and only
its two pointer files (`AGENTS.md`, `CLAUDE.md`, which name this machine's brain path) stay out, in
`.git/info/exclude`. A folder an earlier version kept out of git whole is shared at the next chat start. It reuses the known brain and name, combines the destination and capture consent
in one question when needed, and handles relevant existing context in the background. No
context selection or matching context creation is needed. An explicit alternative location
is respected. The tool uses `create: true` to refuse occupied destinations and protects the
brain's internal storage, including paths through symlinks.
`/gtmb-project` connects an existing folder where it already lives, preserving its
files and instructions. It also repairs broken connections, unlinks projects, and lists them. The former
`/gtmb-project` workflow is now Link Project.

An external linked folder stays one working project. For several new projects, use separate
folders in the GTM Brain workspace's `projects/`. Nested or overlapping linked projects are
refused, including aliases; existing application directories and files stay intact. GTM Brain
does not scaffold another brain or move the existing project as part of this flow.

Both keep memories in the central brain, tagged with the project, and give the project its own
starting context, which may be empty. No folder or pointer is created before capture consent. After registration,
the workflow runs `codex app <absolute-project-path>` on macOS with normal shell permissions
to open the folder. Windows and unavailable launchers use the manual fallback. A launch request
does not confirm sidebar visibility, so the reply includes the exact project path and steps:
New project (or + beside Projects), select the folder, then start a New task there. In the
ChatGPT desktop app, use Projects > Create / New project and add the local folder first. On
macOS, Cmd+Shift+G in the folder picker lets you paste the exact path. A failed launch leaves
the folder linked. An existing task in the brain keeps its brain-wide scope.

Tools: `list_brains`, `link_project`, `unlink_project`, `list_projects`. Writes: the pointer
block in the project's `AGENTS.md`, plus `.gtm-brain/projects.json` and the project's loaded set
inside the brain. The underlying script path remains stable:
`node $PLUGIN_ROOT/skills/gtmb-project/project.mjs . --link <path> [--create] [--starter web-design-system] [--slug s] [--title "T"] [--contexts a,b] [--by handle]`, `... --unlink <slug>`, `... --list`

### Build and publish a company website

*"build our design system from our website"*, *"add a comparison table to our website"*,
*"build a page for our event"*, *"prepare a hosted preview of our website"*

`/gtmb-design-system` reuses the company's one website project, or creates
`<brain-root>/projects/website` through `link_project` with `create: true` and
`starter: "web-design-system"`, after capture consent. That copies Brian Woloszczak and
Peakout's pinned starter into a project with its own local git. Installing dependencies and
starting the local preview follow through the shell, in the same chat. An occupied folder is
never replaced; an interrupted starter resumes without recopying.

Brian's four procedures stay unchanged in the project's `docs/workflows/`. GTM Brain supplies
the project, the company knowledge and one "Website" section in `design-system.md` pointing to
the project. Design values stay in the project's code and manual. Later campaigns add pages
to the same component library, and plugin updates never rewrite a company's project.

`/gtmb-add-section` takes a source URL and heading or a brief, including interactive
sections. `/gtmb-build-landing-page` uses the strategy, ICP, voice and offer, then
composes registered sections. Both end at a local preview. `/gtmb-publish-website` runs
only on its own request: a Vercel preview first, production on a separate decision. See the
[preservation and packaging contract](../plugins/gtm-brain/starters/web-design-system/README.md).

### connect
*"connect my tools"*, *"is HubSpot connected?"*

Checks each tool in the settings against the live catalog of official Codex plugins (`codex plugin
list` for the install state, Codex's cached remote catalog for display names, so "Wispr Flow"
resolves to its `app-...` id): installed / available (with the install command) / no official
plugin / not available (disabled by the workspace admin), and lists installed
plugins that the settings do not mention. The check itself runs at every chat start; Codex
offers fixes unasked. Saying it runs the read tests too. GTM Brain does not see calls to other
connectors, so a tool stays installed, untested (○) until a read test: the first time one returns
data in a chat, Codex calls `mark_tool` with status ok. Installs on a yes per tool. Sign-in is
yours and lives in your Codex.

Tools: `check_tools`, `mark_tool`. Also reads remote MCP servers from Codex's `config.toml` and the ones an installed plugin from another marketplace brings in its `.mcp.json` (ZYNT's plugin); one Codex is not signed in to (`codex mcp list --json`) shows as installed, not signed in, with its `codex mcp login` step. Writes: `.gtm-brain/tools.json` (local); installs Codex plugins on request.
`node $PLUGIN_ROOT/scripts/gtm-brain-connect/connect.mjs . --check`, `... --mark <tool> ok|fail "note"`

### approve
*"change what we sell to also include UK retailers"*, then choose `APPROVE` in the form

The only way `configuration/settings.yaml` changes. Codex writes the full proposed file to
`.gtm-brain/admin.proposed.md`, explains the change, then calls `approve_change`: its form shows the
change with an APPROVE choice, and only your click applies it. Then the script writes an audit
line to `~/.gtm-brain/approvals.log`, replaces the file, commits with your handle. Only team
members can approve. APPROVE, "ok" or "yes" typed in the chat applies nothing. When the host
cannot show the form, Codex gives you the `approve.mjs` command to run in a terminal yourself,
where it asks you to type APPROVE.

Only the owner approves: anyone else's change, and any change they make under
`configuration/` (a tool write or a hand edit), is kept as a proposal in `configuration/proposals/<id>/` with a
note tagged for the owner, who sees it at their next chat start and decides with
`approve_change` kind `proposal`. Every approval, and every owner's own hand edit there, is
recorded as a decision note (who asked, who approved, which file, a summary, the commit);
`query` with object `approvals` lists them and the proposals waiting. See MANUAL.md, "Who can
change the base files". A brain from before 0.35 keeps its settings in `brain/admin.md`, has no
owner rule, and any team member approves.

Tools: `propose_admin_change` for the proposal, `approve_change` (kind `admin`, `interaction` or `proposal` with `id`, `by`) to apply it. Writes: the settings file, `~/.gtm-brain/approvals.log`, a commit, a decision note.
`node $PLUGIN_ROOT/scripts/gtm-brain-approve/approve.mjs . --diff`, `... --apply --by <handle|name|email>` (in a terminal; asks you to type APPROVE), `... --proposal <id> --diff | --apply | --drop --by <owner>`

### schedule
*"set up the weekly compile"*, *"schedule"*

The unattended run: compile every context whose summary is behind, render, save the covers. Two ways: a Scheduled task in
the Codex app (prompt in `SETUP.md` §11), or `scheduled-run.sh` from launchd or cron. The scheduled run first marks
workflow steps whose date passed as due (see [WORKFLOWS.md](WORKFLOWS.md)), then compiles.

Writes: covers and a commit `scheduled: compile ...` (covers only; anything else it touched is
left uncommitted and listed), `.gtm-brain/hooks.log`.
`bash $PLUGIN_ROOT/scripts/gtm-brain-schedule/scheduled-run.sh /path/to/brain`

### chat capture
*"undo captured"*, *"run the chat capture"*, *"turn off chat capture"*

Before it compiles, the scheduled run reads this brain's chats (brain folder and linked project folders
only) changed since the last pass and saves, through `remember`, the outcomes nobody saved, each resting on
an exact sentence of its chat (see [MANUAL.md](../plugins/gtm-brain/MANUAL.md#chat-capture)). Capped at
200,000 input tokens per pass and 50,000 per chat; what a cap leaves is read next time.

Tool: `capture_chats` (`mode` run | undo | status | off | on, optional `cap`, `chat_cap`). Writes: notes
tagged `captured` and `capture:<pass>` with the chat as source (committed; shared by the next commit in the brain), retractions on
undo (via codex, pushed at once), `.gtm-brain/capture.json` (settings, heartbeat, cursors), `.gtm-brain/capture-runs.jsonl` (one record per pass,
with its tokens), `.gtm-brain/hooks.log`.
`node $PLUGIN_ROOT/scripts/gtm-brain-schedule/capture.mjs /path/to/brain --run | --start | --undo | --status | --off | --on | --cap <tokens> | --chat-cap <tokens>`

### gtmb-configure
*"update GTM Brain"*, *"check the installed GTM Brain version"*

Runs from the Codex app, even without a brain. Checks the installed plugin or refreshes it
from its configured repository and branch. A local development install refreshes from its
checkout. It checks that the candidate connector starts before installation and verifies
the installed copy afterward. After a verified update, quit and reopen Codex, then start a
new chat in the same folder. Existing brains resume without setup.
Codex's marketplace copy is a snapshot; when git cannot fetch (no GitHub sign-in for git,
offline), "upgrade" leaves it where it was. Before installing, the update fetches the source's
own `plugin.json` and stops when Codex's copy is behind it: "Codex's copy of GTM Brain is X,
GitHub has Y", with the fix (`gh auth login`, then `gh auth setup-git`, then update again).
The GitHub connector inside Codex is a different login and does not help git.
Check mode does not fetch the remote or establish whether an update is available.
For missing tools or a missing plugin version, ask "repair the GTM Brain update". Codex checks
the installed files before choosing between a source refresh and an app restart.

An update asked for in a brain refreshes that brain's rules in the same step (`brain`): the newly
installed version's upgrader runs right after the verified install and prints its report, so
`update GTM Brain` alone is enough there. Other brains refresh unedited recent rules on their own when next opened; the rest are offered "refresh the rules".

Tool: `update_plugin` (`mode: check | update`, `brain` optional). Writes: Codex's plugin installation and
marketplace cache when updating. No brain files.
`node $PLUGIN_ROOT/scripts/gtm-brain-update-plugin/update.mjs --check`, `... --update`; `check-version.mjs <root>` asks the source whether a newer version exists (the chat start runs it daily in the background; the dashboard and the advisor read `.gtm-brain/plugin-version.json`)

### Refresh brain rules
*"upgrade the brain"*, *"refresh the rules"*

After a plugin update: refreshes `AGENTS.md`, the pre-commit hook and `.gitignore` in an
existing brain. Validates editable identities first and migrates legacy identity files with
backups when needed. Contexts, memories, workplace settings and personal preferences remain.
The chat start refreshes `AGENTS.md` on its own when it is exactly a recent shipped version with no
other upgrade step still to run, and says so in one line. Older brains, edited rules and scheduled
runs are offered "refresh the rules" instead; a refresh of edited rules pauses with a proposed file
to merge. It also refreshes `README.md`, silently, when that is exactly what a release wrote. Each
refresh commits only its own file.

The upgrade also adds `RULES.md`, `SCHEMA.md` and the starter documents (`strategy.md`, `icp.md`,
`voice.md`, `design-system.md`, `market.md`) a brain lacks, at the root or in a folder of their own
name, and never replaces a file that is there. `brain/layout.json` records the brain's file layout
(1: flat entity pages, also a missing file; 2: entity pages in a folder per kind, what setup makes)
and the starters already given, so a starter the person deleted is not brought back. A GTM Brain
that meets a newer layout than it understands reads the brain with one line on top and refuses every
write ("update GTM Brain"). An upgrade that changes the layout changes nothing until the person says
yes. For a flat brain that change is the move of its entity pages into kind folders: the run without
the yes says how many pages would move and names the teammates who saved notes in the last 14 days;
`upgrade_brain` with `confirm: true` (`--confirm`) moves them and records layout 2 in the same
commit. `update_plugin` runs the upgrade without the yes, and a scheduled or background run never
moves pages. A brain already in kind folders whose file says 1 or is missing is set to 2 by the
upgrade, the next chat start or the next save, with nothing moved. What a teammate on an older
version sees is in [MANUAL.md](../plugins/gtm-brain/MANUAL.md#saving-what-you-say-what-it-keeps).

For the owner the same question also covers layout 3 (the base files into `about-us/`, `RULES.md`,
`SCHEMA.md` and `brain/admin.md` into `config/`, in a commit of its own) and, since 0.37, layout 4:
everything into the four folders `configuration/`, `entities/`, `memories/` (one file of notes per
month, `topics/<slug>.md` per context) and `workflows/`, `work/` into `.gtm-brain/`, every note line
read back and compared before the move is kept
([MANUAL.md, Updating to 0.37](../plugins/gtm-brain/MANUAL.md#updating-to-037-the-four-folders)).
A teammate's yes moves the entity pages only. The chat start offers the upgrade in one line to whoever can say yes to a move
still waiting. The order for a team, what a 0.34 teammate sees and how to go back are in
[MANUAL.md, Updating to 0.35](../plugins/gtm-brain/MANUAL.md#updating-to-035).

Tool: `upgrade_brain` (`confirm`, `skill_names`). Writes: `AGENTS.md`, `.githooks/pre-commit`, `.gitignore`,
the rules and the schema when missing, missing starter documents, the layout file, upgrade backups,
identity files only when migration is needed, and on a confirmed move every file that moves.
`bash $PLUGIN_ROOT/scripts/gtm-brain-upgrade/upgrade.sh . [--confirm]`

With `skill_names: true` it does one thing only: in the brain's own files (the README, the rules,
workflow documents, base documents and the skills made in the brain) it rewrites the skill names
of 0.35 and earlier, `gtm-brain-<name>`, to `gtmb-<name>`, and commits. Without it, the chat start
names those files and Codex asks first. A teammate's run leaves `configuration/` to the
owner. Notes are never rewritten. See
[MANUAL.md, Updating to 0.36](../plugins/gtm-brain/MANUAL.md#updating-to-036-short-skill-names).
`node $PLUGIN_ROOT/scripts/gtm-brain-upgrade/skill-names.mjs . [--apply] [--by <handle>]`

## What runs by itself

- **Chat start** (on a chat's first GTM Brain call, again after 30 quiet minutes): pulls the repo, lists contexts with staleness, re-loads what was loaded
  last time (cover, rules and what is new; not the memories, which the tools fetch on demand), checks the tools against the installed Codex plugins,
  records which chat this is (for session context), starts the dashboard server, rebuilds
  the page. The dashboard is available inside Codex, with no Chrome launch. The chat opens with
  one line saying where you are and what is new, plus at most one tool offer. One more line
  names the documents (the base documents in `configuration/about-us/` and the other marked Markdown) with what each applies to and how
  many files each owns, in a linked project too.
- **At chat start and before every save**: a direct edit of `configuration/interactions.json`
  or of a month's notes (`memories/*.jsonl`) not committed through GTM Brain is copied
  to `.gtm-brain/manual-edits/protected/` and the committed version restored; the opening lines say
  so. A hand edit under `configuration/` by anyone but the owner is kept as a proposal and the
  file put back. The skills are the only writers.
- **Before any commit**: every staged notes file is validated line by line and must keep
  the committed records unchanged (append-only). Without the plugin on the machine the commit
  is refused (`GTM_BRAIN_SKIP_VALIDATE=1` to override once).
- **After every write**: the writer keeps what it wrote. Everything Codex writes is kept at once: one commit per change, in your name, shared when the
  brain has a remote. You never say save. `save` exists for edits made by hand outside Codex (a
  cover changed in an editor, names fixed by hand). APPROVE commits the workplace info; the
  scheduled run's compile commits its covers; setup makes the first commit; upgrade keeps the rules
  it refreshed. Anything you had staged yourself stays out of these commits.

## Where things are

```
configuration/settings.yaml          workplace info; APPROVE to change
configuration/rules.md               where things go, Ask the source, Our rules
configuration/schema.md              fields per kind, subtypes, relationship types
configuration/interactions.json      the company's own interactions; APPROVE to change
configuration/about-us/<slug>.md     the base documents (strategy.md is there from setup; gtmb-strategy fills it)
configuration/proposals/<id>/        a change waiting for the owner
entities/<kind>/<name>-<id>.md       identity and cited briefs
entities/<kind>/<name>-<id>/         an entity's files; add-file.mjs --entity
memories/<YYYY-MM>.jsonl             the notes of a month, append-only; each names its context
memories/topics/<slug>.md            the context cover
workflows/<slug>.md                  the workflows
<folder>/<slug>.md                   the other documents the work must follow (kind: document); document tool or a hand edit
<folder>/<slug>/                     a document's files; add-file.mjs --document, or dropped in by hand
layout.json                          the brain's file layout (4)
README.md                            what goes where; setup writes it, upgrade refreshes it while unedited
AGENTS.md                            the rules Codex reads every session
.gtm-brain/                          local, ignored: dashboard, loaded set, tools, logs, drafts for APPROVE
~/.gtm-brain/approvals.log           who approved what, outside every brain
```

Customer overview: `customer_overview` reads the retained relationships, source links, dates, disagreements and scoped coverage. Capture through `remember.customer`; record `remember.customer_coverage` after capture in a separate call. Internal CLI: `node scripts/gtm-brain-entities/entities.mjs <brain> --customers`.

## Meeting capture

Ask GTM Brain to capture a transcript or meeting note from a connected tool, or describe a
conversation directly. It keeps the source, actual date when known, participants and useful
findings together; a calendar or CRM match is optional. Ask to show meetings, correct an
account, skip one occurrence, or always capture a named series. These preferences apply to you.

Daily maintenance can refresh meeting sources and calendar references before compiling
summaries. Configure capture scopes and timing in chat. A failed calendar refresh does not
block meeting capture or compilation. The system-scheduler entry point is
`scripts/gtm-brain-schedule/daily-run.mjs <brain> <confirmed-handle>` under the installed plugin.

## schema.md

`configuration/schema.md` says what the brain keeps about each person, organization and
product, and how they relate. Each kind has a table of fields (`| Field | What it means | Required |`);
organizations have subtypes (`### Subtypes`) with fields of their own; `## Relationships` lists the
types (`| Type | From | To | What it means | Required | One at a time |`, `us` = our company,
`customer_of` = the customer block). One at a time `yes` means a new current link of that type from
the same entity ends the previous one; a file without the column, or an empty cell, keeps works_at
and reports_to one at a time and every other type many. Setup writes it; the chat start lists it in one digest, and reports a file that
cannot be read with a fix per line, leaving it unchanged (`lib/schema.mjs`). The kinds are fixed in
0.34.0: person, organization, product.

Field values are never stored in the schema: the background entity compile fills `fields` in each
brief from the notes, each value citing them (`compiled_fields` beside `compilation` in the entity
file), and the page shows the required ones nobody has said as Gaps with the question to ask. A
schema edit refills the briefs of that kind (at most 20 per pass), never hiding the old ones.

A relationship is a note with a `relation` block on `remember`: `{from, type, to, status: current |
ended, basis: user | source, observed_at, reference?}`, the type checked against the schema when it is
written. `{from, type, to}` is enough: the save fills status (ended when the clause of the note that
names the other end says left, no longer, churned, ended, former, previously, used to, quit, resigned
or departed, or when the note says so and does not name that end; `saysEnded` in `lib/relation-log.mjs`), observed_at (the
note's time; a date alone is that day, a month its first day, an offset is put in UTC) and basis (source
when the note cites a record outside the chat, else user, with the author as the user source); what
the caller passes is kept. "Ended" is a new note; a correction uses `supersedes` / `retracts`; a
source never replaces what the person said.

The relationship log (`lib/relation-log.mjs`): each relationship is a record with a stable id, `r_`
plus a hash of its two ends and its type, derived and never stored; every note that carries it is an
event (started, changed, ended). For a one-at-a-time type the save writes an ended note for the
previous link, dated to the new one and tagged `ended-by:<note id>`, in the same context and commit
(`lib.endPreviousRelations`); a log without that note (a teammate on 0.34 wrote it) is ended when
read, marked implied. A correction that withdraws or replaces the note which ended a link withdraws
that ended note too (`lib.withdrawEndedBy`), unless it names another current end of the same type; a
correction from the chat that cites no outside record counts as the person's word. Renames, merges, undone merges and kind changes append `{at, by, entity, change,
from, to}` to `entities/.history/events.jsonl` (`lib/entity-events.mjs`), written by the entity
writers and committed with the entity change. The memory index (version 9) fills `relations`,
`relation_events` and `entity_events` from both on every refresh; they are readable in SQL mode.
`query` object `relations` reads them: search = an entity for its relationships and its history
(relationship events and renames, merges and kind changes, newest first), filters.type for one type,
filters.at = a date for the ones current then. Each entity page has a `## History` section from the
same data when there is any. `query` object `rules` lists entities with a compiled
brief missing a required field or relationship.

Source pointers: `lib/pointers.mjs` gives each source one spelling. Kinds are lowercased and short
forms mapped (`drive`, `gdrive` mean `google-drive`; `mail` means `gmail`), a doubled prefix
(`attio:attio:people/9`) loses its repeat, and a record URL on app.hubspot.com, app.attio.com,
mail.google.com, drive.google.com or notes.granola.ai becomes one entry for the record:
`{kind, account?, ref, url?}`. `ref` is the stable id, `url` is the link exactly as given, and `account`
is read from the link when its path carries one (the HubSpot portal id, the Attio workspace slug).
`remember` also takes a source as an object (`{kind, account, ref}`) for a second mailbox, workspace
or portal. Identity is kind, account and ref; `url` is never compared, and of two sources that differ
only in `url` the first stays. A link on another host, or one without a stable id, stays
`{kind: "url", ref: <link>}`. Stored notes are never rewritten; readers normalize, so a 0.35.0 note
that holds the pointer plus a separate `url` entry for the same link reads as one record. `query`
object `reference` (search = `kind:ref`, `kind:account/ref` or a record URL) returns the entity whose
references include it and every note citing it, from the memory index's `source` members; a search
that names an account also finds what was saved without one.

`/gtmb-schema` (*"what do we keep about people"*, *"every company must have a budget owner"*,
*"investors are a subtype"*) shows the file and adds, renames or removes one row in the person's
words, then calls `save`. A relationship rename keeps the old name in `Was called`.

## rules.md

`/gtmb-rules` (*"show my rules"*, *"from now on ..."*, *"change where X goes"*) shows the file
and adds, changes or removes one row or one line in the person's words, then calls `save`. A rule
cannot switch off APPROVE, the protected files or W1.

A rule under "Our rules" can carry a tag line directly under it (0.35.0, `lib/our-rules.mjs`):

```
Never call a company a customer before a signed contract.
> applies to: organization · when: saving customer status · check
```

`applies to` is a kind or subtype from the schema, `link <type>` or `general`; `when` is saving,
drafting or reading, optionally with a field or status; then `check` or `guidance` (a hand-typed
line with hyphens, slashes, commas or full stops between the parts reads the same). The rules check
lists an untagged rule as "not filed yet" with the tag line Codex proposes, a tag line it cannot read
with its line and a fix, and an instruction that starts work ("whenever a company becomes a
customer, send the welcome pack", or a schedule: "every Monday, send the pipeline summary") with a
one-step workflow to create instead; `/gtmb-rules`
writes the line, or creates the workflow, only on the person's yes. A filed rule rides along with the
reply that needs it, once per chat: `remember` (saving, for the people and companies in the note),
`query` object `brief` (reading and drafting, by the entity's kind and current relationships), and
`query` object `rules` with search (a kind, `link <type>`, `general` or a name), filters.when and
filters.text (a draft to check). A `check` rule the brain can read refuses the save that breaks it,
quoting the rule: a quoted word in a note or a draft, a status before, without or until a fact
(the customer or relation block, or a note saying it is now a customer; another entry of the same
call counts), a note without a source (only notes on the rule's topic when it names one: "a deal
size"), a schema field always included (asked only of the kinds that have it). Any other `check`
rule is shown as guidance. Once one rule is filed, the chat start prints the general rules and one
line counting the others instead of the whole section. An older GTM Brain reads the tag line as a
quote line, prints the whole section and checks nothing.

`configuration/rules.md` is the brain's own rules, in three sections. "Our rules" holds its people's
rules for what Codex saves and asks, one line each; the chat start prints them after the shared saving
rules (R1, R2). "Where things go" is the table of where every file goes: base documents in
`configuration/about-us/`, projects in `projects/<project>/` with their deliverables inside, raw sources with their
project or owner, approved photos and logos on their entity, scratch in `.gtm-brain/scratch/`. Setup writes it,
and a brain without one gets it at the next chat start. Every chat's opening lines carry its rows
(numbered) and the projects under `projects/` with the first line of each one's `README.md`; Codex
files each thing where a row says, names the row, and asks before creating a folder when nothing
fits. The person edits it freely: an edited rules file is never overwritten, an unedited one
follows the shipped template. `save` keeps it. A brain from before 0.33.9 had `WHERE.md` for the table
and a `RULES.md` with only its own lines; the next chat start merges both into one `RULES.md` (an
unedited `WHERE.md` becomes the new template, an edited one keeps its rows) and removes `WHERE.md`.

"Ask the source" (0.35.0) is a table of `| Question about | Ask | Brain answer is good for |`: per kind of
question, the tool that knows better than a saved note (CRM, billing, events tool, calendar, email,
meeting notes, the brain, or a tool by name) and how old a note may be ("1 day", "2 weeks", "always
ask", "no limit"). `lib/ask-source.mjs` reads it, columns by header name. A row applies only while a
tool of its kind is connected (`.gtm-brain/tools.json`: installed, not declined, read test not failed); a
note matches a row by its source kind (a `hubspot:` source for the CRM row), never by its words. Then
the chat start prints one `Ask the source (RULES.md): ...` line (the output keeps the old name) naming those rows, and `query`
(memories search, brief) and `load_context` add one line per row whose newest matching note is older
than allowed (any matching note for "always ask"): *"Deal stage and amount: the newest note here from
the CRM is 9 days old (2026-11-05); RULES.md says ask HubSpot (good for 1 day). Read it there before
answering."* A rules file without the section (edited before 0.35.0, so never overwritten) uses the
shipped rows; an unedited 0.33.10 template is refreshed to include it. A row that cannot be read is
left out and listed by `query` with object `rules` with its line and a fix; when no row can be read,
the shipped rows apply.
