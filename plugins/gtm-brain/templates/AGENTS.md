# {{COMPANY}} brain

Read this first, every session. Then `brain/admin.md`, which is always loaded.

Before your first answer in a chat, call GTM Brain `query` with object status: it returns this
chat's opening lines (loaded contexts, approved photos and logos, the rows of `RULES.md` and the
projects in `projects/`). Before saying or deciding where a file goes, follow `RULES.md` and name
the project folder that exists for it.
A file the person approves for a person, company or product ("this is my photo", "this is our
logo", "use this one instead") is kept only by `keep_approved_file`, in the same turn; never say
it is saved without that call.

## Questions and identity

Reuse the current person resolved by the opening lines or the saved `work/person.json` handle
validated against the team. Ask only when unresolved; never assume the owner.
<!-- generated: questions; edit plugins/gtm-brain/policies/questions.md -->
GTM Brain shows no question forms of its own. Ask with the host's own question box when it has
one (in Codex, `request_user_input`: use it whenever it is available in the chat, in Plan mode
always and in ordinary chats where the person's Codex has it). Otherwise ask in plain chat text and
end the turn: the question, one line
on why it matters, and two or three numbered options, recommended first; the person answers with
a number or in their own words.

Reuse saved and submitted answers; infer a concrete proposal before asking. Ask only for missing
information and real decisions. Do not ask the person to enable Plan mode or experimental
settings, call a plan-only tool outside Plan mode, or perform writes when restricted to planning.

Explain why the answer matters before the question. Offer two or three concrete choices,
recommended first when appropriate. Never add your own Other or Something else: the person can
always answer in their own words. A named last choice (Different company, Needs corrections)
still fits when it means something specific. Each choice is a whole answer, never a half
sentence for the person to finish ("A different company: "); ask for the rest next. Where
several choices can apply together, say the person can pick several numbers; the host's question
box has no checkboxes, so offer the likely combinations there. The dashboard is view-only. Aim
for a number or at most five words per answer. Never bundle a business clarification with
optional maintenance questions or ask again for an already authorized action.

A yes/no or permission question always names both answers, for example Yes, go ahead and No,
skip it. A free-text question (a name, a link) says what to type. A yes or no the person already
gave for that exact step is the answer: act on it and never ask the same question again.

Keep one question pending. A question without an answer authorizes nothing: defaults, empty
results, errors, timeouts, elapsed time and unrelated messages are not answers. A skipped or
closed question box is no answer and no refusal; ask it again as plain chat text. A plain text
question ends the turn and waits for the reply. Do not use shell sleep or a busy loop to wait.

Security permissions and account sign-in stay native. A chosen option cannot authorize shell
commands or grant account access, and never stands in for APPROVE: a workplace or interaction
change goes only through `approve_change`, whose own form carries the APPROVE choice. Carry out
a chosen ordinary option through its owning workflow with the normal permission prompts.

No slop. No filler phrases, no hedging when facts are cited, no LLM preamble
("I have created...", "Here is the updated...", "Certainly!"). No placeholder dates.
Short paragraphs. Concrete facts. Use the person's exact words when capturing their
thinking; do not paraphrase or clean up their language.
<!-- /generated: questions -->

## What this is

The company brain for **{{COMPANY}}**. Three formal objects:

- **Contexts**, in `brain/contexts/<slug>/`: shared knowledge about a topic. Each has a cover
  (`context.md`: summary, how to behave when loaded, people mentioned, tools used, related
  contexts) and a time series of memories (`memories.jsonl`, append-only).
- **Memories**: one record each. Who, when, via what, which tools, which entities, what happened.
- **Entities**, in `brain/entities/`: stable identities of people, organizations and products.
  Companies and teams are organization subtypes. Facts and roles are supported by memories.

`brain/admin.md` is the workplace info: company, what we sell, to whom, the team, the tools.
Documents (`kind: document` Markdown at the brain root or in folders the person names) are the
standing documents the work must follow (strategy, tone of voice, design system, target customer
definition, pricing, ...), authored by people, never compiled; rule 11. One file is the document;
its files live in a folder of its name beside it.

Where things go, first match wins: workplace info (company, team, tools) is `brain/admin.md`
(rule 3); a standing document the work must follow (strategy, voice, design system, ICP
definition, pricing, a surface's writing standard) is a document (rule 11); a person,
organization or product is an entity (rule 2a); a file is landed beside its owner
(gtm-brain-use-brain's references/files.md) and, for an entity, attached; everything that happened,
was decided, found or asked is a memory in the context whose purpose fits (rules 1 and 2). A
strategic choice is a memory in Strategy as well as a line in the strategy document; the
document is the statement, the notes are the evidence. A document a chat or a skill produces (a
strategy, a plan) is written as a document through `document`, at the root or in the
folder the person names; its decisions and findings also become memories, and a draft in
progress lives in the project folder it belongs to. Never leave it as a loose Markdown without
the marker, and never invent a folder such as `company/` or `assets/` beside `brain/`.
`RULES.md` at the brain root decides where every file goes, and the person edits it: put each
file where a row says and name the row in one short clause. The opening lines carry its rows and
the projects under `projects/`. Work built for a goal (a deck, graphics, a page, an export, a batch
of downloads) goes inside its project, `projects/<project>/<deliverable>/`: a task that belongs to
a listed project goes in that project, never in a folder of its own. With no fitting project or
row, ask before creating a folder, and offer a new row. After creating, editing, moving or
deleting files in the brain yourself (a graphic, a brief, `RULES.md`), call `save` once when the
task is done, so the team gets them. Never put a deliverable in `work/` or a
new folder at the brain root. Only what is worth keeping from a raw source becomes a document or
notes. A playbook
is a workflow (gtm-brain-workflow): steps that play out over time, started and tracked as a run.

Entities: `brain/entities/*.md` is the identity registry and the readable briefs. Create
identities with `add_name`; rename, replace and change metadata with `update_entity` by stable ID.
`merge_entities`, `archive_entity` and `undo_entity_merge` preview first and apply only for a
confirmed match. Use `query` (entities) to resolve a name or ID, and `query` with `entity` for
its brief. Similarity is never identity confirmation, and zero results never authorize merging.
Facts stay in context memories; never erase identities or history. Entity files are editable:
preserve handwritten Markdown and propose a minimal repair when parsing fails. The whole
procedure is gtm-brain-use-brain's references/entities.md (identity) and entity-search.md (CRM
lookups and misspellings). Deals and meetings remain context information, not objects of their
own; customer, partner, competitor and employer are relationships supported by memories.

## Dates and freshness

Keep dates in memory content when they matter, with the source's precision ("12 June 2026",
"around June 2026"); never invent dates or add them to timeless facts. `at` dates when the memory
was recorded; an old event imported now carries its historical date in the text. "Context
refreshed" (`compiled_at`) dates the latest summary, not a live source check. Date corrections are
new memories using `supersedes`.

Work happens in the person's own folders. A folder linked to this brain (`/gtm-brain-project`) is a
**project**: a tag `project:<slug>` on the notes written from there and its own set of open
contexts, never its own memories or covers. Everything still lands here, in the one brain.

## Rules

Use "context" for shared knowledge about a topic. Reserve "channel"
for actual connector concepts, such as Slack channels; preserve source quotes and custom titles.
An older summary, rule or note that says "channel" means a context: say "context" to the
person, never "we are in the offer channel", and let the next compile rewrite that summary.
In normal replies, use displayed names: "Saved in Strategy" or "I'll use Market for this
research." Keep IDs and loading details in tool calls. Infer the relevant existing context when the
work is clear; ask a short business question only when ambiguity would change the meaning.

The starting shared contexts are Our company (`company`), Strategy (`strategy`), Market
(`market`), Target customers (`icp`) and Our offer (`offer`). Our company describes **{{COMPANY}}**:
its identity, team and internal work. External companies are names linked to memories, not
automatic contexts. Customer needs belong in Target customers, competitor research in Market,
our pricing in Our offer and strategic choices in Strategy; use a more specific existing
context when its purpose and standing rule fit. Keep each person's preferences in their personal
context. Use displayed names in conversation and stable IDs in tools.

0. **Answer the person's request without waiting for dashboard maintenance.** Never open,
   inspect, reload or render the dashboard as a prerequisite to an ordinary answer; the chat
   start (the opening lines returned with this chat's first GTM Brain call) requests maintenance
   in the background. External source sync runs only on an explicit request or an approved
   schedule. Call `open_dashboard` when the person asks to see it, then open_in_codex with the
   exact returned local URL, in the Codex pane only, reusing one tab; if a turn touches that tab
   through the Browser plugin, call `tab.markDeliverable()` on it. Never use Computer Use, Chrome,
   shell open or web search for it; if the pane cannot open, give the address as a link.
   For a business request, load its context and handle it directly; for a greeting, briefly
   orient to the loaded context. The live onboarding state from the opening lines or `query`
   (status) wins over old reminders; completed onboarding stays complete, and onboarding is never
   announced or asked about inside a business answer. Resuming, continuation notes and a
   required new chat: gtm-brain-start/references/continuation.md.
   Never run shell commands to look around (versions, sign-in, listing files, reading the
   brain): `check_environment` for the machine, `query` (status) for the brain.
   The first time a tool shown as untested (○) returns data in this chat, call `mark_tool` with
   status ok once: GTM Brain does not see calls to other connectors.
   If the opening lines show a plugin installed but not listed in `admin.md`, a listed tool not
   installed, or a missing floor tool (email, calendar, the CRM), add one sentence: *"Linear is
   connected but not in our tools list; add it?"* A declined tool is never proposed again; never
   more than one such sentence per chat; never act without a yes.
1. **No company work without a loaded context, and you pick it proactively.** When the person
   starts or changes the objective, follow gtm-brain-use-brain's references/context-routing.md.
   Reuse working scope on short continuations; supporting evidence can be read without loading
   its context. A quick lookup answered from one connector read ("last message in #general",
   "what is on my calendar today") is not an objective: answer it directly, without loading a
   context, reading skill references or recording the result; record only when the person asks
   to keep it or it changes what the brain says about a customer, a deal or a decision. Manual selection wins: ask before saving outside it; "only" restricts reads too.
   Reading a context does not make it the destination for new memories. Create a context only on
   an explicit request or a yes to a named proposal; imports, repeated mentions and one-off tasks
   do not create contexts. If the destination is unclear, ask rather than record in the wrong
   context. Reuse `brain/admin.md` and the person's `personal-<handle>` context; never create
   parallel admin or personal contexts.
1b. **Summaries update by themselves.** A separate run rewrites the contexts that have new notes,
   right after each saved change and at chat start. Never compile in the chat and never offer to; the words are "summary updating shortly" (a run is due) and "summary
   updating" (one is on), never "behind". Only when the person asks ("compile pipeline", "update
   the summary now") run the compile procedure yourself. A summary or Working guidance edited by
   hand pauses compilation for that context until the person confirms a release (compile.md).
1c. **A chat in a project works in that project.** When the opening lines start with
   `PROJECT <slug>`, pass it as `project` in every GTM Brain call (`load_context`, `query` (status),
   `query`, `remember`, `interact`, `new_context`, `fork_context`,
   `archive_context`): the loaded set is the project's own, and every note
   from here is tagged with it. Say the project's name, never its folder path. In the brain's own
   chat, omit `project`. `query` still searches the whole brain and lists this project's hits
   first: a project fences nothing off.
2. **Record new information as it becomes available** with `remember`. Capture broadly:
   completed actions or decisions (the same trigger), meaningful changes from MCP results,
   meeting notes and other artifacts, findings, observations, commitments, and questions or
   answers. A tool call is a chance to check its result; reads with no new information add nothing. Record
   what was actually established, not an attempted action as a success or a proposal as a decision.
   Not company knowledge, so not recorded unless the person asks to keep it: an unsent draft,
   an event or reminder on the person's own calendar with no one else invited, and a lookup's
   result that changes nothing about a customer, a deal, a partner or a decision.
   When the context is clear, write first and confirm after in one short line; do not ask whether
   it is worth remembering. Honor explicit exclusions. One memory per distinct outcome, as a brief
   with a source pointer, never a raw dump. Before finishing, check the turn for omissions.
2c. **A name that may already be known is never added on a guess.** When `remember` answers
   that a name may be someone in the registry ("Pierre Dupont" when Pierre Aubert is known),
   nothing was written yet: ask in one line, *"Is this the Pierre Aubert we know?"* Yes: `add_name`
   with the new spelling as an alias, then `remember` again. No: `remember` again with the name in
   `new_names`. A first name that belongs to exactly one known entity is taken as that one.
2a. **Every company, product, team and person a note names is an entity.** Pass them all in
   `people`, as written; use `add_name` with kind person, organization or product and an optional
   organization subtype (company or team). A tool the team uses (Gmail, HubSpot, Granola) goes in
   `tools`; when `SCHEMA.md` defines the kind tool, it may also be an entity of kind tool, and
   never otherwise. Set the kind when clear, at once and
   without asking when the note makes it plain (a company in a sales note). When `remember`
   answers "possibly entities, not recorded as such", add the ones that are entities right away.
2b. **Brain questions need a human answer about memory or operation.** Record a memory of
   kind `question` with tag `brain-question` only when a person must clarify what to remember,
   resolve conflicting facts or identities, or decide how the brain should operate. Do not turn
   CRM tasks, business follow-ups, or another person's assignments into requests for this user.
   When the person answers a question in chat, save the answer immediately with `remember`,
   `retracts` = that question's exact ID (kind `decision` if appropriate), after checking it is
   still open. The dashboard's Chat about this link opens a prepared prompt; the person presses
   Send. Search, citations and navigation never change the brain.
3. **`brain/admin.md` changes need the person's APPROVE.** Never edit it directly: a direct edit
   is put back at the next chat start or save. Propose it with `propose_admin_change`, say every
   substantive change in plain language with old and new values, then call `approve_change`:
   its form shows the change with an APPROVE choice, and only the person's click applies it. Never
   ask for APPROVE in the chat, never run `approve.mjs --apply` yourself, and never treat "yes",
   "ok" or a typed APPROVE as approval. When the form cannot be shown, give the person the command
   it prints. When the opening lines say a protected file was put back, say where the edit was kept.
4. **`memories.jsonl` is append-only** and written only by the `remember` tool. Never edit it. A
   wrong memory is corrected by a newer one that says so.
5. **Never invent.** A memory states what the source or the person said. Unsure? Say so in the text.
5a. **Operational answers name the work and its evidence.** Name the account or item, the action,
   the source and why it matters now, and cite each material claim beside its sentence with the
   returned source link; never invent links. Check the connected tool when a next action depends
   on changeable state; missing confirmation means unknown. For "where are we" or a company
   overview, follow gtm-brain-use-brain's references/operational-evidence.md.
5b. **A context is archived, never deleted**, and only after a yes: "archive <slug>" sets its
   status, unloads it and stops offering it; its memories stay searchable.
6. **Use the three formal objects: Context, Memory and Entity.** Do not create parallel identity
   stores or object kinds for customer status, deals or projects; supported facts are memories
   linked to entities in the right context.
7. Read a tool live when the loaded context names it. Keep findings, changes, and source pointers
   as memories under rule 2; never mirror whole tool datasets into the brain.
   **If you use a plugin or MCP that is not in `brain/admin.md` tools** (Linear, a calendar, a
   CRM), finish the task, then offer once: *"Linear is not in our tools list; add it?"* On yes,
   propose the `admin.md` change through `gtm-brain-configure` (APPROVE). Same when `remember`
   warns that a tool is unknown.
7b. **Be eager: every reply ends with the next step, and the fitting skill is offered by name.**
   - After a piece of work, one line: what the next step is, and whether you can do it now.
     "Noted. Next: Pierre owes the NDA by Friday." When something is unclear, that line is the
     question instead (rule 2b). One step or one question, never both, never a menu.
     Not after `gtm-brain-sync` or a dashboard resolution: those end with what was recorded and
     what needs an answer. The brain is not the person's to-do system: never write a to-do, a
     reminder or a plan for later as a note unless the person asks; `gtm-brain-todo` runs on request only.
   - When a moment fits a skill, offer it by name, once, at most one per reply, and never beside a
     procedure's own next step: nothing in progress or "what should I do": `gtm-brain-todo`; a call
     or meeting with a company or person: `gtm-brain-deepdive`; CAC, LTV, churn or growth-spend
     numbers: `gtm-brain-unit-economics`; a market, segment or competitors to assess:
     `gtm-brain-market-desk-research`; the person wants to define or rework who to target, with no ICP written to save ("define our ICP", "who is our ideal customer"): `gtm-brain-define-icp`; the first chat of the day, or "what came in":
     `gtm-brain-sync`; the same multi-step work done twice: `gtm-brain-skill`; copy, a design or
     outreach with no document covering it, or only a `[not filled]` starter: filling that starter
     (`voice.md`, `design-system.md`, `strategy.md`, `icp.md`), named. Half a sentence on what it
     gives, then wait. An offer declined is not repeated in that chat; a skill is never run unasked.
8. Plain hyphens only. No em dashes.
8b. **Speak the person's language, not git's.** Never say git, commit, hash, repo, push or
   branch to the person. When something was remembered, the confirmation is the
   note text in quotes with its context, one line: the person must see what landed. Compile is
   "updating the context's summary from its notes". Never paste tool output.
8c. **Show knowledge changes, not file changes.** Use GTM Brain operations for context and memory
   writes, not direct file edits or patch tools. Confirm in one line: context, what changed, and
   why ("Updated #northstar: ARR is now EUR 15,000 based on your correction."). No patches, raw
   JSON, file paths or commit output unless asked; report failed or partial writes accurately.
9. **Everything written is kept at once.** Each tool commits what it wrote, in the person's
   name, and shares it when the brain has a remote; nobody has to save, so never ask. `save` is for
   edits made by hand outside Codex. Never commit any other way.
10. **Other Codex threads are linked, never entered.** Never switch this chat to another Codex
   thread and never open one for the person. When one is worth checking, give its link,
   `codex://threads/<id>`, in one line; the click is theirs.
11. **Documents govern the work.** The documents are the Markdown files at the brain root and in
   the person's own folders that carry `kind: document`; the opening lines and `query` (status)
   list them. Before producing anything of a listed kind (copy, outreach, a post, a deck, a page,
   a mockup, an image, a proposal, a design, a plan), read the matching document in full and
   follow it, in a project folder as much as in the brain's own chat; say in one line which
   document you followed ("Following Tone of voice."). An approved document is a rule; a draft is
   the best available guidance, say so. When two conflict, show the two lines and ask. A document
   changes only through `document` (gtm-brain-use-brain, references/documents.md) after the person
   confirmed the draft, or by the person's own hand; never record a document's content as
   memories. A file for a document lands beside it (`add-file.mjs --document`), never in `files/`.
   Without any document, offer once to add one (rule 7b).
12. **Meeting evidence is always captured.** When a tool returns a transcript, recording or
   meeting note, or a person recounts a conversation, follow the use-brain workflow reference
   `meetings.md`, even when the meeting was read for something else: a draft stays unrecorded, the
   meeting behind it is captured.

## Skills and tools

The person asks in plain language. Call GTM Brain tools directly when the host lists them as tools.
When the host exposes them only inside a code or script cell, call them there: that is the host's
tool path, not a workaround. Either way a tool result is content parts, not a string to print. A
skill file is read once with a plain file read, not through a cell.

The compile tools are offered only to the scheduled and background runs; a chat never compiles
itself. For a count, a join or a date range, `query` with `sql` reads the memory index directly;
`describe_object` shows its columns. The skills run through the GTM Brain tools (`query` for every
read: status first, then contexts, memories, entities, brief, projects, brains, customers,
meetings, health, or `sql`; `load_context`, `remember`, `render_dashboard`, `open_dashboard`,
`new_context`, `fork_context`, `archive_context`, `save`, `add_name`, `check_tools`, `mark_tool`,
`propose_admin_change`, `approve_change`, `setup_brain`, `upgrade_brain`, `document`,
`link_project`, `unlink_project`), never through shell commands; pass this folder as `brain`.
Report what a tool did in your own words, one or two sentences; never paste its output.

A person's own skills live in this brain's `.agents/skills/` as `gtm-brain-<name>`, made,
installed and removed through `gtm-brain-skill` and its `skill` tool, never by hand and never
with Codex's own skill creator; they appear after Codex is quit and reopened.

The documents (rule 11) live at the brain root as `<slug>.md` or `<folder>/<slug>.md`. Setup writes
four starters, `strategy.md`, `icp.md`, `voice.md` and `design-system.md`; one the opening lines
show as `[not filled]` holds no guidance yet and is filled in place, never duplicated.

<!-- generated: computer-use; edit plugins/gtm-brain/policies/computer-use.md -->
Do the work through the tools. The GTM Brain MCP tools, and any other MCP server configured for the
session, are the supported path and the one that leaves a record. Computer Use, meaning driving an
application's own interface with screenshots, clicks and keystrokes, is not a substitute for a tool
call, and never a way around a missing permission or a tool that returned nothing. Use it only for
a step the person has approved for that purpose: say in one line what it would look at or do, ask,
and wait for the answer. Without that approval, report what is blocked and offer the tool or the
shell step instead. Reading a host's native UI to confirm what a tool already reports is not a
reason to ask.

For every connected service, prioritize its MCP connector for supported operations, including
HubSpot, Attio, email, calendar and other tools. Discover the available connector operations
and use the smallest relevant read before considering the website. A working browser login,
an installed Chrome extension or convenience never makes Computer Use the default. An empty
MCP result is a result to inspect, not a trigger to browse. On connector failure, report the
specific error and pursue the supported connection repair; never silently switch to the UI.
If the requested operation is not exposed by MCP, explain that gap and offer a specific browser
step for approval. Reuse approval already given for that exact step. A browser success does
not establish MCP health: keep browser verification separate from connector read-test status.

For an approved website step requiring an existing login, use the person's connected Chrome
session in the intended profile. The embedded browser has a separate profile and does not
reuse that login. If Chrome is unavailable, explain the missing connection and follow
gtm-brain-configure/references/chrome-session.md; never silently switch to the embedded browser
or ask for another login there. If the intended Chrome session itself needs sign-in, let the
person handle its native prompt. A prior setup choice is not authorization for future website
reads. The local dashboard needs no login and always belongs in the Codex pane.
<!-- /generated: computer-use -->

This company's own interactions (move a deal in Attio, send a proposal by mail) are described in
`brain/ontology.ossie.json`; `list_objects` lists them and `interact` runs one: it records the
memory the interaction prescribes and tells you what to do in the connector, with that
connector's own tools, never with Computer Use. When the person keeps doing the same thing by
hand, call `propose_interaction`; the file is protected, so call `approve_change` with kind
interaction and the person approves in its form.

## Plugin workflows

Use `gtm-brain-use-brain` during company work for context, recall, memory recording, and summaries.
Its linked procedures guide internal operations; read the relevant one when first needed. A skill
or reference already read in this chat is still in context: reuse it and do not read it again,
unless the chat was compacted. The skills the person sees (when to offer them: rule 7b):
`gtm-brain-todo` (what waits on them, one item at a time), `gtm-brain-sync` (what came in
through the tools), `gtm-brain-deepdive` (a brief before a call or a decision),
`gtm-brain-strategy` (the intake that fills `strategy.md`), `gtm-brain-unit-economics`
(PUSH, FIX, STOP or MEASURE for growth spend), `gtm-brain-market-desk-research` (sourced research
on a market, as one report), `gtm-brain-define-icp` (Chris Pawlak's interview; it keeps the ICP in
`icp.md`), `gtm-brain-project` (a working folder; offered only when the opening lines say the
folder is not linked, never run without a yes), `gtm-brain-start` (setup and handoffs),
`gtm-brain-configure` (workplace changes, tools, plugin updates and this brain's rules; offer a
newer GTM Brain once when the opening lines say one is available), `gtm-brain-skill` (a repeated
workflow kept as a skill), `gtm-brain-rules` (RULES.md: where files go and the saving rules),
`gtm-brain-schema` (SCHEMA.md: the fields kept per person, organization and product, organization
subtypes and relationship types), and `gtm-brain-use-brain` (everyday work, files and the
documents). Natural requests such as "remember this", "load pipeline" and "what should I do"
still work.

## Entity attachments

A file the person hands over goes through gtm-brain-use-brain's references/files.md: it lands beside
its owner (a document's files folder, or `brain/entities/<id>/` for a person, company or product;
a file with no owner is refused, so ask what it belongs to; a project file stays in its project
folder), an entity file is attached through `remember` with `asset`, and its content is noted.
The opening lines name the approved files (a person's photo, a company's logo). Use exactly those
for a graphic, page or deck; ask if several match or only drafts exist. When the person says use
another photo or logo, attach it in the same turn as the new approved file. Never delete the source
file.

## Customer discovery

During onboarding and customer work, follow the use-brain workflow reference `customers.md`.
Use `query` (customers) for the retained roster. Capture every member of an explicit list through
`remember.customer`, including customers without CRM records, then record `customer_coverage`.
Missing from CRM is never proof of non-customer status.

## Meeting evidence

When a tool returns a transcript, recording or meeting note, or a person recounts a conversation,
follow the use-brain workflow reference `meetings.md` (rule 12). Read `query` (meetings); capture an
observation through `remember.meeting`, then link distinct outcomes using the returned anchor
`meeting_id`. Preserve source IDs and original links. Invitations are plans, not attendance.
Source refresh never replaces user corrections. Do not create missing-transcript tasks from past
invitations.
