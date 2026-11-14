# GTM Brain workflows and operations

Ask for the outcome in plain language. The plugin exposes workflow skills; internal
operations remain available to the agent and do not need their own skill commands.
Every identifier starts with `gtm-brain-`, and every display name starts with `GTM Brain:`
to distinguish these workflows from other installed skills.

| Skill identifier | Display name | What it does |
|---|---|---|
| `gtm-brain-project` | GTM Brain: Projects | Create a project folder, or link an existing one to your brain; repair, unlink, list |
| `gtm-brain-start` | GTM Brain: Start | The first command in a project: creates the brain here, gets to know the business, connects the tools, opens the dashboard; resumes what is unfinished |
| `gtm-brain-sync` | GTM Brain: Sync | Pull what came in through the connected tools since the last sync, one subagent per tool, and record what matters |
| `gtm-brain-todo` | GTM Brain: Todo | What should I do now: everything waiting on you, ordered, walked through one by one |
| `gtm-brain-workflow` | GTM Brain: Workflows | Start a run of a workflow document (an outbound campaign, ads then outbound), see where it stands, do the next step, skip or abandon; the brain keeps the steps and dates |
| `gtm-brain-deepdive` | GTM Brain: Deep dive | A one-page brief on an entity or a context, from the notes and the tools read live |
| `gtm-brain-define-icp` | GTM Brain: Define ICP | Chris Pawlak's exploratory interview: company examples, fit and exclusions, buying committee, awareness and readiness; reuses brain evidence and keeps one formal draft ICP document |
| `gtm-brain-unit-economics` | GTM Brain: Unit economics | Lech Kaniuk's unit economics review: CAC, LTV12 and LTV24, LTV:CAC, both paybacks and retention from the chat and the brain, then PUSH, FIX, STOP or MEASURE overall and per acquisition source or segment; offers to keep the decision as a note and the missing inputs as questions |
| `gtm-brain-market-desk-research` | GTM Brain: Market desk research | Chris Pawlak's market desk research: a 5-8 minute intake, a confirmed research frame, 15-30 sourced web and community reads, an interim checkpoint, then `market-desk-research-<slug>.md` with a positioning map and, when the numbers allow, a growth chart; market attractiveness and right to win judged separately, no offering design; accepted conclusions become notes |
| `gtm-brain-use-brain` | GTM Brain: Use the company brain | Everyday work: remember, recall, where we are |
| `gtm-brain-configure` | GTM Brain: Configure GTM Brain | Workplace info, team, tools and settings through APPROVE |
| `gtm-brain-skill` | GTM Brain: Your skills | Turn a repeated workflow into a Codex skill kept in the brain's `.agents/skills`; install from GitHub, list, remove, share |
| `gtm-brain-strategy` | GTM Brain: Strategic intake | A 10-15 minute conversation with a founder or a head of sales, growth or GTM that fills `strategy.md`, the document every brain starts with, mapped silently to Playing to Win; files shared on the way land in `strategy/` |

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
"Searching the brain" in chat. Review proposals on the read-only dashboard. APPROVE is a choice in the form `approve_change` shows; in a chat nothing else applies it.
Scripts retain their paths for terminal use with
`export PLUGIN_ROOT=~/.codex/plugins/cache/gtm-brain/gtm-brain/0.35.0`.

Legend for "writes": what files the command changes. Nothing else is ever touched.

## Every day

### load
*"load pipeline"*, *"load pipeline marketing"*, *"switch to gtm"*, *"clear contexts"*

Chooses the context(s) for this chat. Codex reads the cover (summary, standing rules, the
Working guidance), people and tools, and the last memories; if the context's summary is behind it lists
what is new since the last compile (the summary refreshes by itself 2 minutes after the last save). Loading adds to the loaded set;
"switch to gtm" or "only gtm" replaces it. Creating or forking a context adds to it. A new
chat re-loads what was loaded last time, so you only say `load` to change context.

"unload marketing" drops one and keeps the rest.
Tool: `load_context`. Writes: `work/loaded-contexts.json` (local).
`node $PLUGIN_ROOT/scripts/gtm-brain-load/load.mjs . pipeline [--last 15]`, `... gtm --only`, `... --clear`

### remember
*"remember that Pierre asked for a three-year TCO before 12.09"*, *"note this"*, *"log that we decided ..."*,
*"correct memory m_xxxxxx: ..."*, *"forget memory m_xxxxxx, it was wrong"*

The saving rules are one numbered page, `skills/gtm-brain-use-brain/references/saving-rules.md`, printed at
every chat start with the "Our rules" section of the brain's own [RULES.md](#rulesmd) after it (its people's
rules, which win). A held note quotes the rule it broke. Codex offers a line there when a save is questioned.

Appends one record to the loaded context's time series: who (your handle), when, via codex,
kind (note, decision, question), tools used, names mentioned (normalised through `brain/entities/`;
unknown names are added, as people unless you say otherwise), the text, sources. A correction is a new
record that `supersedes` the old; a withdrawal `retracts` it; nothing is ever edited. If the
note clearly fits another context better, Codex uses it and confirms with its displayed name. Codex also records new information during work, including findings from tool results,
completed actions or decisions, meeting artifacts, and open questions. A short brief or a
descriptive source pointer is enough; duplicate reads add nothing.

Tool: `remember`. Writes: `brain/contexts/<slug>/memories.jsonl` (append), `brain/entities/` (new
people). Kept at once. `context` is optional: the single loaded context, else the one active
context where the note's people or companies already have notes; with no unique answer the entry is
held with the candidate contexts in one line. Each kept note starts with `saved in <Context title>: ...`.
`node $PLUGIN_ROOT/scripts/gtm-brain-remember/remember.mjs . --by <handle> --kind note --content "..." [--context <slug>] [--tools "attio"] [--people "Pierre Aubert"] [--source gmail:<id>] [--action "gmail:sent email:<id>"] [--supersedes m_x] [--retracts m_x]`

### interact
*"move the Castorama deal to proposal"*, *"send the proposal to Bergstrom"*: whatever this company
described as its own interaction.

Runs one of this company's own interactions (`brain/ontology.ossie.json`; `list_objects` lists
them): the inputs are checked against the interaction's schema, the memory it prescribes is
recorded through `remember` (context, kind, people, companies, the action as `tool:action:ref`),
and the reply says exactly what to do in the connector, which Codex does with that connector's
own tools. A plugin tool's name is refused: call the tool.

Tool: `interact`. Writes: `brain/contexts/<slug>/memories.jsonl` (via remember). Kept at once.

### propose_interaction
*"every week I move deals in Attio by hand; make that a thing"*, including after the advisor points out an action that recurs.

Drafts one of this company's interactions from the person's words (name, tool, the operation in
words, inputs, what it records), validates it and writes `work/interaction.proposed.json`. The
dashboard shows it in words; Codex then calls `approve_change` with kind interaction, and
choosing APPROVE in its form applies it. `approve.mjs <root> --interaction --by <person>` is the only writer of
`brain/ontology.ossie.json`: it appends the proposal and commits `interactions: <name>`. The
advisor only suggests one, from an action recorded three times in a month: a brain check never writes a proposal.

Tool: `propose_interaction`. Writes: `work/interaction.proposed.json` (local).

### deal health
*"how healthy is the Nowa Deweloper deal?"*, *"what am I missing before the call with Acme?"*

Scores one deal on MEDDPICC (metrics, economic buyer, decision criteria, decision process, paper
process, pain, champion, competition) from the memories about that company only. Each element is
confirmed, weak or missing, and every score cites the memory it rests on; the missing ones become
up to three questions for the next conversation. It reads only and saves nothing: answers are
remembered like any finding and the next read scores them. The rubric is
`skills/gtm-brain-use-brain/references/deal-health.md`.

Tool: `query` with object `deal` and search = the company. Off for a brain whose `brain/admin.md`
front matter has `deal_scoring: off` (new brains get `deal_scoring: on`; a brain without the line
has it on). The line is workplace info, so it changes through APPROVE.

`save_nudge` in the same front matter: after three reads in a chat (`query`, `load_context`) with
nothing saved, the read's reply ends with one line asking to save what the turn established; it
comes back only after five more reads and never in a scheduled or background run. `save_nudge: off`
turns it off (a brain without the line has it on).

`big_files` in the same front matter says where a file over 25 MB goes, since git never keeps it:
`google-drive` (new brains, and a brain without the line) moves it to the shared drive and links it
from the project's `README.md`; `local` keeps it in a folder on this computer outside git
(`big_files_folder:`, an absolute path, else `~/gtm-brain-files/<brain folder>`), not shared, linked
as a `file:` path. `save`, the chat start and `add-file.mjs` give the same instruction
(`lib.bigFileAdvice`). It changes through APPROVE.

### recall
*"what do we know about the TCO?"*, *"did we ever talk about Berlin?"*, *"tell me about Pierre Aubert"*

Searches every memory in every context, loaded or not, by keyword (names expand through
`brain/entities/`, so "the CFO" finds Pierre if that alias exists). Hits are grouped by context and
say which are not loaded. An empty result is reported as such, never filled in. With a person's
name or `entity` ID it reads a permanent brief from `brain/entities/`: identity, cited overview,
per-context state, open threads, relationships, recent developments and source pointers.
An optional `context` scopes the view without loading context instructions.

Tool: `recall`. Keyword search and exact memory queries reuse the derived disk index at
`work/memory-index.sqlite`. Source changes refresh it automatically; reading an entity brief
writes nothing. The index is local, uncommitted, and rebuildable from the brain files.
The MCP reader starts one worker when needed and releases it after 30 seconds idle. Indexing
reads one record at a time with a 4 MiB record limit; queries return at most 2 MiB, with an explicit
error asking for a narrower query if that bound would be exceeded. No partial result is reported
as complete. There are at most 32 pending indexed reads per server, with 64 KiB per query input.
`node $PLUGIN_ROOT/scripts/gtm-brain-recall/recall.mjs . "<query>"`, `... --person "<name>"`

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

Tools: `compile_facts`, `compile_apply`. Writes: `brain/contexts/<slug>/context.md`; kept at once.
A separate run does it by itself (`background-compile.sh`, state in `work/compile.json`): after each saved change, once no note has been saved for 2 minutes (`GTM_BRAIN_COMPILE_DELAY`), and at chat start; changes during a run get a follow-up pass; the chat only compiles when asked. The chat start carries one `health:` line when there is something to say: why meetings may be missing, the last good summary run and the last error (`work/runs.jsonl`, `work/compile.json`), the last sync per tool (`work/sync.json`, meeting coverage) and the count of held meetings not captured.
Model passes have a 15-minute timeout (`GTM_BRAIN_COMPILE_TIMEOUT_MS` overrides it in milliseconds).
Failed scans and timed-out runs enter the three-attempt retry path; completed compilations stay
saved. Successful passes that reduce the pending context or entity set continue without using
the failure budget. Locks verify process identity and release only their own ownership token.
`node $PLUGIN_ROOT/scripts/gtm-brain-compile/compile.mjs . --stale | --facts <slug> | --apply <slug> --by <handle> --as-of <id from --facts> --summary "..." --now "..."`
`--now ""` clears guidance when no useful methods remain. Omitting `--now` is an error.
`--apply` refuses when a memory arrived after `--facts`, so a summary never covers less than the cover claims.

### render
*"render"*, *"show me the dashboard"*, *"open the dashboard"*, *"where does this number come from"*

Builds a read-only `work/home/index.html` from contexts, memories, proposed changes,
brain questions and tool status. Both renderer and local server leave `brain/` unchanged.
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

Tools: `render_dashboard` (rebuild), `open_dashboard` (rebuild, start the server, open the browser). Writes: `work/home/` (local); `work/dash.json`, `work/session.json`
(the chat recorded at chat start).
`node $PLUGIN_ROOT/scripts/gtm-brain-render/render.mjs . && open work/home/index.html`

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
with `placed`: for each new file or folder, its path, the RULES.md row it followed and why. Each
becomes a `gtm-brain-why: <path>: RULES.md row 5 (...): <why>` line in that commit, so git
history is the shared log of where things went and why. *"Why is this file here?"* is `query`
with object `why` and the path: the row, the reason, who put it there and when, or, with none
recorded, when it arrived and that you should be asked. The chat start names new files that
arrived with no reason (made by shell, kept by background maintenance), once per set.

*"Check the brain against its rules"* is `query` with object `rules`: people known by a first name
only (P3), look-alike names nobody confirmed (P4), top-level folders no RULES.md row names, files
with no recorded reason (grouped by folder), names with capitals or spaces. Each finding names its
rule, the person or path, and two or three fixed choices carried out through the tools above
(`add_name`, `merge_entities`, `save` with `placed`), so each fix leaves its own reason. It reads
only and changes nothing; `query` with object `health` counts what it found.

Tool: `save`. Writes: a git commit (never `work/`); with only `placed`, a commit that carries the
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

Tools: `list_contexts`, `new_context`. Writes: `brain/contexts/<slug>/context.md` and an empty `memories.jsonl`; kept at once.
`node $PLUGIN_ROOT/scripts/gtm-brain-contexts/contexts.mjs .`, `... --new <slug> "<Title>" "<rule>"`, `... --json`

### archive
*"archive berlin-expansion"*, *"unarchive berlin-expansion"*

Puts a finished or mistaken context away: status `archived` on its cover, unloaded, no longer
listed or offered. Its memories stay in the files and in search. Nothing is deleted; Codex
confirms first. Unarchive brings it back. Deleting a folder is your own git operation.

Tool: `archive_context`. Writes: `brain/contexts/<slug>/context.md` (status).
`node $PLUGIN_ROOT/scripts/gtm-brain-contexts/contexts.mjs . --archive <slug>`, `... --unarchive <slug>`

### fork
*"Bergstrom is becoming its own thing; fork it out of pipeline"*

Makes a new context from an existing one: same standing rule, including purpose and boundaries, the memories that match a
keyword copied (tagged `forked:<from>`, with a source pointing at the original record),
`forked_from` set, loaded at once. The original keeps everything; search and the dashboard count
a copied memory once. Codex offers a fork when many memories in one context are about one account or
initiative.

Tool: `fork_context`. Writes: the new `brain/contexts/<slug>/`.
`node $PLUGIN_ROOT/scripts/gtm-brain-contexts/contexts.mjs . --fork pipeline bergstrom "Bergstrom Home" --filter bergstrom`

### entities
*"who is Chris?"*, *"Chris is Krzysztof Pawlak, email chris@reflow.io"*, *"Telli is a company"*, *"what names do we have?"*

The identity registry and readable briefs: one Markdown file per entity with a stable ID,
canonical name, aliases, contacts and external references. Team members are included at setup.
Facts stay in context memories; narrative sections are compiled with citations. `remember` and `recall` resolve names through it; a one-word first name resolves
when only one person has it.

Tools: `who_is`, `add_name` (aliases, emails, kind, external references and identity sources),
`update_entity` (explicit set/add/remove by stable ID), `merge_entities` (preview then apply),
`archive_entity` (`undo: true` restores), `undo_entity_merge` (preview then reverse a recorded merge),
`entity_facts` and `compile_entity` (a cited brief from current evidence). Writes:
`brain/entities/*.md` and `brain/entities/.history/`, through the library. Aliases cannot
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
Local refresh diagnostics: `work/entity-pages.json`, `work/render-state.json`, `work/render.log`.
These checkpoints and the paged files under `work/home/` are disposable, never another source
of identity or memory truth. Page/data publication is serialized across explicit and queued renders.
Legacy registry files migrate on the first write or `upgrade_brain`, with originals backed up.
`node $PLUGIN_ROOT/scripts/gtm-brain-entities/entities.mjs .`, `... --add "Name" --alias "a, b" --email x@y`, `... --who chris`

## Documents

### document
*"add our tone of voice"*, *"save the design system"*, *"add strategy.md as a document"*, *"our ICP
definition"*, *"list the documents"*, *"check this against our documents"*, *"approve the strategy"*

A document is one Markdown file at the brain root (`strategy.md`) or in a folder the person names
(`brand/voice.md`) with `kind: document` in its frontmatter: a title, `applies_to` (the kinds of
work it governs: copy, outreach, posts, landing pages, design, proposals, planning), a status
(`draft` or `approved`, approved only on the person's word) and the body in the person's language.
Its files live in a folder of its name beside it (`brand/design-system/`), or around it when it is
alone in its folder. The opening lines and `query` (status) name every document in every chat with
its file count, in the brain and in each linked project, and rule 11 of the brain's rules makes
Codex read the matching one in full before that kind of work and say which it followed. Nothing
compiles or summarizes a document. Hand edits in an editor are kept by `save`; a hand-written
Markdown without the marker is not a document until adopted. See [DOCUMENTS.md](DOCUMENTS.md).

Tool: `document` (`action` create | list | show | files | update | remove; `ref` is a slug or a path,
`folder` places a new one). Writes: the document file, one commit each. `guideline` is the retired
name, hidden from the tool list, answering with the same result for one more version.
`node $PLUGIN_ROOT/scripts/gtm-brain-documents/document.mjs . --create --title "Tone of voice" --applies-to "copy, outreach, posts" --body "..." [--folder brand] [--status approved] [--by handle]`
`... --create --title "Strategy" --applies-to "strategy, planning" --file strategy.md` (a Markdown already at the root is adopted in place; one from outside is copied in)
`... --list [--json]`, `... --show tone-of-voice`, `... --files design-system`, `... --update brand/tone-of-voice --status approved`, `... --remove tone-of-voice`

### A file for a document or an entity
*a path or a dropped file with "add this to the design system"*, *"this is the Acme logo"*

`node $PLUGIN_ROOT/skills/gtm-brain-add-file/add-file.mjs . --file <path> [--document <ref> | --entity "<name>"]`
lands the file beside its owner: the document's files folder, or `brain/entities/<id>/` next to the
entity file. With no owner named it refuses, so nothing lands in the brain unasked (the
`files/<yyyy-mm>/` fallback is gone since 0.27.0; files landed there earlier stay and their
links keep working). It prints where it landed and the owner; an
entity file is then attached through `remember` with `asset`. No skill to invoke: use-brain's
`references/files.md` is the procedure.

### keep_approved_file
*"this is my photo, use it from now on"*, *"this is our logo"*, *"use this one instead"*

One call keeps an approved file for a person, company or product: copied from outside the brain (an
attachment in Downloads) or from `work/`, moved when loose in `brain/entities/`, into
`brain/entities/<name>/`, committed, and recorded as the approved file for its role (portrait,
primary-logo, ...). A previous approved file for the same role is replaced. Every chat's opening
lines name the approved files.

## Workflows

### workflow
*"start the outbound workflow"*, *"where is the campaign"*, *"next step"*, *"skip this step"*,
*"abandon the run"*, *"list workflows"*

A workflow is a document in `workflows/` with `type: workflow`; a run is its state as memories
in one context, tagged `workflow:<slug>` and `run:<id>`, one note per step with a `due:` tag,
a `brain-question` per reached gate. See [WORKFLOWS.md](WORKFLOWS.md).

Tool: `workflow` (`action` list | start | status | advance | skip | abandon | due). Writes:
`brain/contexts/<context>/memories.jsonl`, one commit per action. `due` is called by session
maintenance and by the scheduled run with `by` schedule or session; it writes only for a step
whose date passed and asks its gate question once.
`node $PLUGIN_ROOT/scripts/gtm-brain-workflow/workflow.mjs . --list | --start <slug> --context <ctx> --handle "<name>" --settled '{"Label":"answer"}' --by <handle> | --status <run> | --advance <run> --step <n> [--note ...] [--answer ...] [--actions tool:action:ref,...] [--learned '{...}'] --by <handle> | --skip <run> --step <n> --reason ... --by <handle> | --abandon <run> --reason ... --by <handle> | --due [--today YYYY-MM-DD] --by <handle|schedule|session>`

## Setup and admin

### check my machine
*"check my machine"*, *"is everything installed?"*, and step 0 of setup

Node, codex and its sign-in, git, and whether the folder is empty, a brain, or something else. One card, no shell.

Tool: `check_environment`. Writes: nothing.

### setup
*"set up a new company brain in this folder"* (empty folder)

Four questions, one at a time: your full name and work email; the company, what it sells and to
whom; teammates; the tools you use (a numbered list, pick several, CRM first). Creates `brain/admin.md`, the
contexts Our company (`company`), Strategy, Market, Target customers (`icp`), Our offer and your
personal context, `brain/entities/` with the team, `AGENTS.md`, `README.md`, `RULES.md`,
`strategy.md`, `workflows/`, git and the pre-commit check; then checks the tools. Handles are full
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

`/gtm-brain-project` creates `<brain-root>/projects/<project-slug>/` by default, the projects
folder [RULES.md](#rulesmd) names. A project inside the brain is the team's: its files go in the brain's git, and only
its two pointer files (`AGENTS.md`, `CLAUDE.md`, which name this machine's brain path) stay out, in
`.git/info/exclude`. A folder an earlier version kept out of git whole is shared at the next chat start. It reuses the known brain and name, combines the destination and capture consent
in one question when needed, and handles relevant existing context in the background. No
context selection or matching context creation is needed. An explicit alternative location
is respected. The tool uses `create: true` to refuse occupied destinations and protects the
brain's internal storage, including paths through symlinks.
`/gtm-brain-project` connects an existing folder where it already lives, preserving its
files and instructions. It also repairs broken connections, unlinks projects, and lists them. The former
`/gtm-brain-project` workflow is now Link Project.

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
block in the project's `AGENTS.md`, plus `work/projects.json` and the project's loaded set
inside the brain. The underlying script path remains stable:
`node $PLUGIN_ROOT/skills/gtm-brain-project/project.mjs . --link <path> [--create] [--slug s] [--title "T"] [--contexts a,b] [--by handle]`, `... --unlink <slug>`, `... --list`

### connect
*"connect my tools"*, *"is HubSpot connected?"*

Checks each tool in `admin.md` against the live catalog of official Codex plugins (`codex plugin
list` for the install state, Codex's cached remote catalog for display names, so "Wispr Flow"
resolves to its `app-...` id): installed / available (with the install command) / no official
plugin / not available (disabled by the workspace admin), and lists installed
plugins that `admin.md` does not mention. The check itself runs at every chat start; Codex
offers fixes unasked. Saying it runs the read tests too. GTM Brain does not see calls to other
connectors, so a tool stays installed, untested (○) until a read test: the first time one returns
data in a chat, Codex calls `mark_tool` with status ok. Installs on a yes per tool. Sign-in is
yours and lives in your Codex.

Tools: `check_tools`, `mark_tool`. Also reads remote MCP servers from Codex's `config.toml`. Writes: `work/tools.json` (local); installs Codex plugins on request.
`node $PLUGIN_ROOT/scripts/gtm-brain-connect/connect.mjs . --check`, `... --mark <tool> ok|fail "note"`

### approve
*"change what we sell to also include UK retailers"*, then choose `APPROVE` in the form

The only way `brain/admin.md` changes. Codex writes the full proposed file to
`work/admin.proposed.md`, explains the change, then calls `approve_change`: its form shows the
change with an APPROVE choice, and only your click applies it. Then the script writes an audit
line to `~/.gtm-brain/approvals.log`, replaces the file, commits with your handle. Only team
members can approve. APPROVE, "ok" or "yes" typed in the chat applies nothing. When the host
cannot show the form, Codex gives you the `approve.mjs` command to run in a terminal yourself,
where it asks you to type APPROVE.

Tools: `propose_admin_change` for the proposal, `approve_change` (kind `admin` or `interaction`, `by`) to apply it. Writes: `brain/admin.md`, `~/.gtm-brain/approvals.log`, a commit.
`node $PLUGIN_ROOT/scripts/gtm-brain-approve/approve.mjs . --diff`, `... --apply --by <handle|name|email>` (in a terminal; asks you to type APPROVE)

### schedule
*"set up the weekly compile"*, *"schedule"*

The unattended run: compile every context whose summary is behind, render, save the covers. Two ways: a Scheduled task in
the Codex app (prompt in `SETUP.md` §11), or `scheduled-run.sh` from launchd or cron. The scheduled run first marks
workflow steps whose date passed as due (see [WORKFLOWS.md](WORKFLOWS.md)), then compiles.

Writes: covers and a commit `scheduled: compile ...` (covers only; anything else it touched is
left uncommitted and listed), `work/hooks.log`.
`bash $PLUGIN_ROOT/scripts/gtm-brain-schedule/scheduled-run.sh /path/to/brain`

### gtm-brain-configure
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
`node $PLUGIN_ROOT/scripts/gtm-brain-update-plugin/update.mjs --check`, `... --update`; `check-version.mjs <root>` asks the source whether a newer version exists (the chat start runs it daily in the background; the dashboard and the advisor read `work/plugin-version.json`)

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

Tool: `upgrade_brain`. Writes: `AGENTS.md`, `.githooks/pre-commit`, `.gitignore`, upgrade
backups, and identity files only when migration is needed.
`bash $PLUGIN_ROOT/scripts/gtm-brain-upgrade/upgrade.sh .`

## What runs by itself

- **Chat start** (on a chat's first GTM Brain call, again after 30 quiet minutes): pulls the repo, lists contexts with staleness, re-loads what was loaded
  last time (cover, rules and what is new; not the memories, which the tools fetch on demand), checks the tools against the installed Codex plugins,
  records which chat this is (for session context), starts the dashboard server, rebuilds
  the page. The dashboard is available inside Codex, with no Chrome launch. The chat opens with
  one line saying where you are and what is new, plus at most one tool offer. One more line
  names the documents (the marked Markdown at the brain root) with what each applies to and how
  many files each owns, in a linked project too.
- **At chat start and before every save**: a direct edit of `brain/admin.md`,
  `brain/ontology.ossie.json` or any `memories.jsonl` not committed through GTM Brain is copied
  to `work/manual-edits/protected/` and the committed version restored; the opening lines say
  so. The skills are the only writers.
- **Before any commit**: every staged `memories.jsonl` is validated line by line and must keep
  the committed records unchanged (append-only). Without the plugin on the machine the commit
  is refused (`GTM_BRAIN_SKIP_VALIDATE=1` to override once).
- **After every write**: the writer keeps what it wrote. Everything Codex writes is kept at once: one commit per change, in your name, shared when the
  brain has a remote. You never say save. `save` exists for edits made by hand outside Codex (a
  cover changed in an editor, names fixed by hand). APPROVE commits the workplace info; the
  scheduled run's compile commits its covers; setup makes the first commit; upgrade keeps the rules
  it refreshed. Anything you had staged yourself stays out of these commits.

## Where things are

```
brain/admin.md                       workplace info; APPROVE to change
brain/entities/*.md                     identity and cited briefs
brain/contexts/<slug>/context.md     the context cover
brain/contexts/<slug>/memories.jsonl the context's time series, append-only
strategy.md                          the strategy document, there from setup; gtm-brain-strategy fills it
<slug>.md, <folder>/<slug>.md        the documents the work must follow (kind: document); document tool or a hand edit
<folder>/<slug>/                     a document's files; add-file.mjs --document, or dropped in by hand
brain/entities/<id>/                 an entity's files; add-file.mjs --entity
README.md                            what goes where; setup writes it, upgrade refreshes it while unedited
AGENTS.md                            the rules Codex reads every session
work/                                local, ignored: dashboard, loaded set, tools, logs, proposals
~/.gtm-brain/approvals.log              who approved what, outside every brain
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

## SCHEMA.md

`SCHEMA.md` at the brain root says what the brain keeps about each person, organization and
product, and how they relate. Each kind has a table of fields (`| Field | What it means | Required |`);
organizations have subtypes (`### Subtypes`) with fields of their own; `## Relationships` lists the
types (`| Type | From | To | What it means | Required |`, `us` = our company, `customer_of` = the
customer block). Setup writes it; the chat start lists it in one digest, and reports a file that
cannot be read with a fix per line, leaving it unchanged (`lib/schema.mjs`). The kinds are fixed in
0.34.0: person, organization, product.

Field values are never stored in SCHEMA.md: the background entity compile fills `fields` in each
brief from the notes, each value citing them (`compiled_fields` beside `compilation` in the entity
file), and the page shows the required ones nobody has said as Gaps with the question to ask. A
SCHEMA.md edit refills the briefs of that kind (at most 20 per pass), never hiding the old ones.

A relationship is a note with a `relation` block on `remember`: `{from, type, to, status: current |
ended, basis: user | source, observed_at, reference?}`, the type checked against SCHEMA.md when it is
written. "Ended" is a new note; a correction uses `supersedes` / `retracts`; a source never replaces
what the person said. `query` object `relations` (search = an entity, filters.type) shows each one's
current state, history and disagreeing sources. `query` object `rules` lists entities with a compiled
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

`/gtm-brain-schema` (*"what do we keep about people"*, *"every company must have a budget owner"*,
*"investors are a subtype"*) shows the file and adds, renames or removes one row in the person's
words, then calls `save`. A relationship rename keeps the old name in `Was called`.

## RULES.md

`/gtm-brain-rules` (*"show my rules"*, *"from now on ..."*, *"change where X goes"*) shows the file
and adds, changes or removes one row or one line in the person's words, then calls `save`. A rule
cannot switch off APPROVE, the protected files or W1.

`RULES.md` at the brain root is the brain's own rules, in two sections. "Our rules" holds its people's
rules for what Codex saves and asks, one line each; the chat start prints them after the shared saving
rules (R1, R2). "Where things go" is the table of where every file goes: rules at the root, brand in
`brand/`, projects in `projects/<project>/` with their deliverables inside, raw sources with their
project or owner, approved photos and logos on their entity, scratch in `work/`. Setup writes it,
and a brain without one gets it at the next chat start. Every chat's opening lines carry its rows
(numbered) and the projects under `projects/` with the first line of each one's `README.md`; Codex
files each thing where a row says, names the row, and asks before creating a folder when nothing
fits. The person edits it freely: an edited `RULES.md` is never overwritten, an unedited one
follows the shipped template. `save` keeps it. A brain from before 0.33.9 had `WHERE.md` for the table
and a `RULES.md` with only its own lines; the next chat start merges both into one `RULES.md` (an
unedited `WHERE.md` becomes the new template, an edited one keeps its rows) and removes `WHERE.md`.
