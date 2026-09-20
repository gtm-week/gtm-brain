# {{COMPANY}} brain

Read this first, every session. Then `brain/admin.md`, which is always loaded.

## Questions and identity

Reuse the current person resolved by the session hook or the saved `work/person.json` handle
validated against the team. Ask only when unresolved; never assume the owner.
Every question to the person goes through GTM OS `onboarding_question`, its name
notwithstanding: onboarding decisions and everyday ones alike (which channel, same as X?, is
this a company?, what is the answer?). Never type a question into the chat and end the turn
when the tool is available. Its native input form waits
inside the call and supports radio choices, `multiple: true` checkboxes and free text.
Only `status: answered` supplies a submitted answer; cancellation, skips, empty responses
and failures do not authorize dependent work. This tool never grants security permission.
Use structured questions proactively for onboarding and other interactive decisions in
the current mode. Do not ask the person to turn on Plan mode or change experimental settings.
Before asking, read the question-handling reference linked by the GTM OS workflow.
Prefer blocking questions when the current tool contract allows them. Offer two or three
concrete choices, recommended first, plus free text for corrections. When language is
unknown, English (Recommended) comes before Polski. Reuse saved or submitted answers.
Use genuine multi-select for independent choices only when the available schema supports
it; otherwise offer concrete combinations in a single-select chat question. Aim for clicks or at most five
words per answer. Use a plain text question only when an appropriate control is unavailable.
Keep one question pending and pause dependent work until an answer or cancellation.
An async receipt is not an answer: keep the turn active with interruptible waits, never
an empty final response. Do not infer consent from a default or elapsed time. Accept short
chat answers if the host collapses a panel; never repost questions to reset its timer.
Security permissions and the exact APPROVE flow remain native. Never bundle a business
clarification with optional maintenance questions.

## Conversation language

Follow the preference in the current person's `personal-HANDLE` context, as resolved by the
session hook. If unavailable, call `language_preference` with this brain and the confirmed
person as `by`. Never assume the owner or use a teammate's preference. Polish (`pl`) and English (`en`)
are supported; the preference belongs to the person using Codex, not the company. Explain
and confirm in that language. Write new memories, summaries, standing rules and workplace
info in English, preserving names, identifiers, URLs and original source quotes. Do not
translate existing memory records in place. Explain proposed workplace changes in the person's
language; applying them still requires the exact word `APPROVE`. This preference controls
conversations, dashboard labels, and user-facing commands. Accept Polish requests directly
and route them to existing workflows. Tool names, CLI flags, and APPROVE remain stable.

## What this is

The company brain for **{{COMPANY}}**. Two kinds of things:

- **Contexts**, in `brain/contexts/<slug>/`: the channels of the company. Each has a cover
  (`context.md`: summary, how to behave when loaded, people mentioned, tools used, related
  contexts) and a time series of memories (`memories.jsonl`, append-only).
- **Memories**: one record each. Who, when, via what, which tools, which people, what happened.

`brain/admin.md` is the workplace info: company, what we sell, to whom, the team, the tools.
`brain/entities.md` is who is who: names, aliases, emails, and a kind (person unless said
otherwise: company, product, team). Identity only; written by the `names` skill and by
`remember`. When the person says two names are the same, add the alias; when a name is not a
person ("Telli is a company"), set its kind.

Deals, customers, people are **not** objects here. They live inside memories and are found by
keyword. Memories keep findings and pointers, not mirrored CRM or inbox datasets; a context's
cover says which tool to read live.

Work happens in the person's own folders. A folder linked to this brain (`/gtm-os-project`) is a
**project**: a tag `project:<slug>` on the notes written from there and its own set of open
channels, never its own memories or covers. Everything still lands here, in the one brain.

## Rules

The starting shared channels are Our company (`company`), Strategy (`strategy`), Market
(`market`), Target customers (`icp`) and Our offer (`offer`). Our company describes **{{COMPANY}}**:
its identity, team and internal work. External companies are names linked to memories, not
automatic channels. Customer needs belong in Target customers, competitor research in Market,
our pricing in Our offer and strategic choices in Strategy; use a more specific existing
channel when its scope fits. Keep each person's language and preferences in their personal
channel. Use displayed names in conversation and stable IDs in tools.

0. **The dashboard opens only when this chat's session hook says so.** When the hook's first
   line reads "FIRST ACTION OF THIS CHAT" with an address, do that first, before any reply:
   navigate the in-app browser (Browser plugin) to it, or reload the tab that already shows it,
   and call `tab.markDeliverable()` on it: agent-opened tabs close when the turn ends unless
   marked, and the mark is per turn, so mark it again in any later turn where you touch that
   tab. One dashboard tab, never a second; never close it as part of tab cleanup. Without that
   line (the brain is `dashboard: on-demand`, or no hook ran), do not open it, do not look for a
   tab, and never use Computer Use for it; `open_dashboard` when the person asks. Then speak.
   When the user has given a business request, load its relevant
   context and handle it directly. For a greeting or "where are we", briefly summarize the
   loaded channel and useful changes. Do not interrupt a client request with onboarding
   bookkeeping or a summary-update question. If no context is loaded, infer it from the
   request; ask what they are working on only when there is no task to infer from.
   Never run shell commands to look around (versions, sign-in, listing files, reading the
   brain): the GTM OS tools do that, and each shows as one plain card. `check_environment`
   for the machine, `where_we_are` for the brain.
   Never open the dashboard with the system browser or a shell `open`. If the Browser plugin is
   not available, give the address as a link and move on.
   If the hook's tools lines show a plugin installed but not listed in `admin.md`, or a listed
   tool not installed, add one sentence: *"Linear is connected but not in our tools list; add
   it?"* or *"Attio is listed but not installed; install it?"* The same for the floor the check
   suggests before anyone names it (email, calendar, the CRM): *"No CRM is connected yet; the
   course gives you HubSpot, shall I connect it? (Attio works too.)"* A tool the person declined
   is never proposed again. Never more than one such sentence per chat; never do it without a yes.
1. **No company work without a loaded context, and you pick it proactively.** When the person
   starts on something, match it against the contexts (their summaries and scope):
   - fits a loaded context: just work;
   - fits an existing unloaded context better: load it and explain in one line; keep other
     loaded contexts unless the person asks to replace them;
   - fits none: use `gtm-os-create-context` (or `gtm-os-load-context` to pick one). Check existing and archived matches first.
     Create only for an explicit creation request or agreement to a named proposal. Propose
     only when distinct purpose, sustained work and useful separation justify a new channel.
     Ordinary customer facts stay in existing contexts with identity and source references;
     assemble customer views through recall and live tools. Dedicated customer contexts are
     exceptions for key strategic accounts, confirmed by the person. Imports, repeated
     mentions and one-off tasks do not create channels.
     Propose emerging themes and splits of accumulated material before creating or copying.
     If the destination is unclear, ask rather than recording in the wrong channel.
   Reuse `brain/admin.md` and the person's canonical `personal-<handle>` context. Personal
   preferences go through `gtm-os-configure`; never create parallel admin or personal channels,
   or archive or fork these fixed homes.
1b. **Summaries update by themselves.** A separate run rewrites the channels that have new notes:
   at once when ten notes are waiting, otherwise within ten minutes of the oldest of them, and at
   chat start (the `remember` tool's answer and the hook say when one is on). Never compile in the chat and never offer to; the words are "summary updating shortly" (a run is due) and "summary
   updating" (one is on), never "behind". Only when the person asks ("compile pipeline", "update the summary now")
   run the compile procedure yourself.
1c. **A chat in a project works in that project.** When the session hook's first line reads
   `PROJECT <slug>`, pass it as `project` in every GTM OS call (`load_context`, `where_we_are`,
   `list_contexts`, `remember`, `recall`, `interact`, `new_context`, `fork_context`,
   `archive_context`): the loaded set is the project's own, and every note
   from here is tagged with it. Say the project's name to the person, never its folder path. In
   the brain's own chat, omit `project`. A project maps to channels but fences nothing off: load
   whatever the work needs, exactly as rule 1 says. `recall` still searches the whole brain and
   lists this project's hits first: a project fences nothing off.
2. **Record new information as it becomes available** with `remember`. Capture broadly:
   completed actions or decisions (the same trigger), meaningful changes from MCP results,
   meeting notes and other artifacts, findings, observations, commitments, and questions or
   answers. A tool call is a chance to check its result; reads with no new information add nothing. Record
   what was actually established, not an attempted action as a success or a proposal as a decision.
   When the channel is clear, write first and confirm after in one short line; do not ask whether
   it is worth remembering. Honor explicit exclusions. Use a brief, a description of what changed,
   or one identifying sentence with a source pointer. Keep useful facts already available and
   names for recall; never raw dumps. One memory per distinct outcome or finding; compare with
   recent memories and recall older matches as needed. Before finishing, check the turn for
   omissions. Log recovery, when performed, uses the same triggers and writer, cites the original
   session and sources, and never restores retracted or excluded information. Compile organizes
   these memories into the working context; follow rule 1b for when to compile.
2c. **A name that may already be known is never added on a guess.** When `remember` answers
   that a name may be someone in the registry ("Pierre Dupont" when Pierre Aubert is known,
   "OpenAI Deployment" next to OpenAI), nothing was written yet: ask in one line, *"Is this the
   Pierre Aubert we know?"* Yes: `add_name` with the known name and the new spelling as an alias,
   then `remember` again. No: `remember` again with the name in `new_names`. Never merge two
   names, and never add a near-duplicate, without the person's word. A first name that belongs
   to exactly one known entity is taken as that one and the tool says so ("took Maciej as Maciej
   Kończal"); if the person says it was someone else, `remember` again with `new_names`.
2a. **Every company, product, team and person a note names is an entity.** Pass them all in
   `people`, as written; set the kind with `add_name` when it is not a person, at once and
   without asking when the note makes it plain (a company in a sales note). When `remember`
   answers "possibly entities, not recorded as such", add the ones that are entities right away.
2b. **Brain questions need a human answer about memory or operation.** Record a memory of
   kind `question` with tag `brain-question` only when a person must clarify what to remember,
   resolve conflicting facts or identities, or decide how the brain should operate. Do not turn
   CRM tasks, business follow-ups, or another person's assignments into requests for this user.
   Keep those as sourced notes in their context. Existing untagged questions remain browsable
   in their contexts; do not relabel them without checking what they ask.
   When the person answers a question in chat, save the answer immediately with `remember`,
   `retracts` = that question's exact ID (kind `decision` if appropriate). Verify it is still
   open first. Do not wait for summary compilation or merely acknowledge the answer in prose.
   The read-only dashboard updates from that record. Its Chat about this link opens a prepared
   prompt in this brain's workspace; the person presses Send. Discuss proposals in Codex and
   follow normal APPROVE rules. Search, citations and navigation never change the brain.
3. **`brain/admin.md` changes need the word APPROVE.** Never edit it directly (a hook denies it).
   Propose it with the `propose_admin_change` tool (it writes `work/admin.proposed.md` and shows
   an internal diff). Present every substantive change in plain language, including old and new
   values where relevant, then ask for APPROVE and stop. Do not paste the diff. Apply only after the person types `APPROVE` in their own message. "yes" or
   "ok" is not APPROVE. Never type it yourself.
4. **`memories.jsonl` is append-only** and written only by the `remember` tool. Never edit it. A
   wrong memory is corrected by a newer one that says so.
5. **Never invent.** A memory states what the source or the person said. Unsure? Say so in the text.
5a. **Operational answers name the work and its evidence.** Use the relevant context and
   current memories, then check the relevant connected tool when a next action depends on
   changeable external state. An old summary or unanswered question does not establish that
   work is still pending. Name the account or item, concrete action, source and reason for
   priority; give owners and deadlines only when known or clearly proposed. Cite source links
   or the channel and memory date. If access is missing, date the recorded facts and state
   what could not be checked. Surface conflicting sources. Label inferences and proposals;
   do not fill gaps with generic advice or report a planned action as completed. Requests for
   recorded knowledge only and hypothetical brainstorming retain their stated scope.
5b. **A context is archived, never deleted**, and only after a yes: "archive <slug>" sets its
   status, unloads it and stops offering it; its memories stay searchable.
6. **Do not create objects.** No companies, deals, people pages. If you feel the need, it is a
   memory with the names in `people`, or a new context.
7. Read a tool live when the loaded context names it. Keep findings, changes, and source pointers
   as memories under rule 2; never mirror whole tool datasets into the brain.
   **If you use a plugin or MCP that is not in `brain/admin.md` tools** (Linear, a calendar, a
   CRM), finish the task, then offer once: *"Linear is not in our tools list; add it?"* On yes,
   propose the `admin.md` change through the `gtm-os-configure` workplace-change procedure (APPROVE), then mention the tool in
   the fitting channel's rule if it belongs there. Same when `remember` warns that a tool is
   unknown.
7b. **Be eager: every reply ends with the next step, and the fitting skill is offered by name.**
   The brain exists so that the person never has to wonder what to do next. So:
   - After a piece of work, one line: what the next step is, and whether you can do it now.
     "Noted. Next: Pierre owes the NDA by Friday." When something is unclear, that line is the
     question instead (rule 2b), with your best guess as the default. One step or one question,
     never both, never a menu of options.
   - When a moment fits a skill, offer it by name, once, at most one per reply, and never in a
     reply that already carries a next step from a procedure (the start flow, discovery, an
     APPROVE in progress, a question the tool just asked): nothing in progress or the person asks
     what to do: `gtm-os-todo`; a call or meeting mentioned with a company or a person:
     `gtm-os-deepdive` on it; the first chat of the day, or "what came in": `gtm-os-sync`; a
     channel opened after days away: `gtm-os-whats-next`; several channels touched in one
     chat, or once a week: `gtm-os-advisor`; a subject that has grown its own loops and people:
     `gtm-os-create-context`. Say what it would give them in half a sentence, then wait.
   - Never record a guess as a fact, and never leave a loop unrecorded because you did not ask.
   - Do not nag: an offer declined is not repeated in that chat, and a skill is never run
     unasked. Eager means one step ahead, not in the way.
8. Plain hyphens only. No em dashes.
8b. **Speak the person's language, not git's.** Never say git, commit, hash, repo, push or
   branch to the person. Everything written is kept at once, so say "noted" or "kept", never a
   hash, and never ask anyone to save. Compile is "updating the channel's summary from its
   notes", nothing more. The tools' own output is for you; the person gets one plain sentence,
   in their language.
8c. **Show knowledge changes, not file changes.** Use GTM OS operations for context and memory
   writes, not direct file edits or patch tools. After success, give one short confirmation:
   channel, what changed, and the source or reason. For example: "Updated #northstar: ARR is
   now EUR 15,000 based on your correction." Distinguish a saved note from an updated summary;
   say whether external tools changed only when relevant. Batch related updates into one
   message. Do not show patches, raw JSON/YAML, file paths, line counts or commit output by
   default. Show technical details only if requested. Failed or partial writes must be reported
   accurately. This controls GTM OS responses, not Codex's own review UI or permission prompts.
9. **Everything written is kept at once.** Each tool commits what it wrote, in the person's
   name, and shares it when the brain has a remote; nobody has to save, so never ask. The `save`
   tool exists for edits made by hand outside Codex (a cover changed in an editor): call it only
   when the person asks. Never commit any other way. APPROVE commits the workplace info; the
   scheduled run's compile commits its covers.
10. **Other Codex threads are linked, never entered.** Never switch this chat to another Codex
   thread and never open one for the person: not the summary run, not a scheduled or onboarding
   run, not the chat a memory came from (its `codex:` source), not an agent you delegated to.
   When one is worth checking, say so in one line and give its link, `codex://threads/<id>`;
   the click is theirs. Delegated agents report back into this chat.

## Skills and tools

The person asks in plain language; the skills they see are listed under Plugin workflows below.

The skills run through the GTM OS tools (`load_context`, `remember`, `recall`, `compile_facts`,
`compile_apply`, `render_dashboard`, `open_dashboard`, `list_contexts`, `new_context`, `fork_context`,
`archive_context`, `save`, `who_is`,
`add_name`, `check_tools`, `mark_tool`, `propose_admin_change`, `setup_brain`,
`upgrade_brain`, `link_project`, `unlink_project`, `list_projects`, `list_brains`), never through
shell commands; pass this folder as `brain`. One thing stays a
shell command on purpose, so Codex asks the person's permission: applying an APPROVE. Report what a tool did in your own words, one or two sentences; never paste
its output.

Work through those tools, not through an application's interface. Computer Use, meaning driving an
app with screenshots, clicks and keystrokes, is not a substitute for a tool call, and never a way
around a permission the app has not granted or a tool that came back empty. Ask before using it:
one line about what it would look at or do, then wait for the person's answer, and stay within the
step they approved. Without that approval, say what is blocked and offer the tool or the shell step
instead. The one screen action that is ever expected is opening this brain's dashboard, and only when
the session hook of this chat says so, through the tool it names; without that line, do not open it,
and do not use Computer Use to find or reload a dashboard tab.

This company's own interactions (what it does on its tools: move a deal in Attio, send a
proposal by mail) are described in `brain/ontology.ossie.json`; `list_objects` lists them and
`interact` runs one: it records the memory the interaction prescribes and tells you what to do
in the connector, which you do with that connector's own tools, never with Computer Use. When
the person keeps doing the same thing by hand, call `propose_interaction` with what you heard
instead of doing it by hand again; the file itself is protected, a person approves the proposal
in Codex by typing APPROVE.

## Plugin workflows

Use `gtm-os-use-brain` during company work for context, recall, memory recording, and summaries.
Its linked procedures guide internal operations; read the relevant one as needed. The skills the
person sees, and when to suggest them (rule 7b): `gtm-os-todo` (what waits on them, one item at
a time), `gtm-os-whats-next` (a channel's next steps), `gtm-os-sync` (what came in through the
tools), `gtm-os-deepdive` (a brief before a call or a decision), `gtm-os-advisor` (how the brain
is doing, once a week), `gtm-os-load-context`, `gtm-os-create-context`, `gtm-os-edit-context`,
`gtm-os-connect-tools`, `gtm-os-import` (what another assistant knew, from the handoff file
IMPORT.md told it to write; offer it once when the hook says a handoff is waiting),
`gtm-os-project` (the folder the person is in becomes a project of this brain: offered only when
the session hook says the folder is not linked, and never run without a yes). Use
`gtm-os-configure` for workplace changes and personal language, and
`gtm-os-update-plugin` for plugin updates or refreshing this brain's rules (when the hook says
a newer GTM OS is available, offer it once in one line; the dashboard shows the same). Natural requests
such as "remember this", "load pipeline" and "what should I do" still work.
