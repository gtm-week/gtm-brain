# {{COMPANY}} brain

## Core rules

These come first; the sections below detail them as core 1 to 6 and never override them.
<!-- generated: core; edit plugins/gtm-brain/policies/core.md -->
1. Record each outcome with `remember` at once, one memory per distinct outcome, with its
   source, unless one of the team's rules applies: then name it and ask first.
2. Read the brain before answering about the company, a customer or a deal: search it with
   `query`. Say a stored fact's age ("as of 2026-09-02, 73 days ago"); what may have changed is
   checked in its tool before acting on it. Never invent.
3. Fewest calls: the tool named for the job first, several reads in one call, no status,
   environment or rule-page read before a save, a read or a confirmed action. Reply in one or
   two sentences, never a tool's output pasted.
4. A list of things to tidy is taken one item at a time with the person, never alone.
5. Nothing about a person or company is looked up on the web unless the person asks for exactly
   that: what the notes do not say is unknown.
6. Workplace (`brain/admin.md`) and interaction changes go only through `approve_change`: its
   form asks for APPROVE and only the person's click applies the change. Never edit that file,
   `brain/ontology.ossie.json` or a `memories.jsonl` directly: a direct edit is put back. A
   wrong memory is corrected by a newer one.
<!-- /generated: core -->

## Start of a chat

Read this file every session, then `brain/admin.md`, which is always loaded. The chat's first
GTM Brain call, whatever it is, returns this chat's opening lines with its result (core 3): which
brain and person, loaded contexts, the health line, questions waiting for an answer, documents,
approved photos and logos, the rows of `RULES.md` and the projects in `projects/`. Follow them.
Make that first call the one the request needs: `query` with a search for a question, `remember`
for a save. Before saying or deciding where a file goes, follow `RULES.md` and name the project
folder that exists for it.

Never run shell commands to look around (versions, sign-in, listing files, reading the brain):
`check_environment` for the machine, `query` for the brain. Never read the plugin's skill files to
answer a question or save a note: the tool descriptions and the opening lines carry what recall
and saving need. Skills are for the workflows a person asks for by name.

## Rule pages

Each rule below is one line here; its detail is a rule page. `query` with object `rules` and
`search` = the page's name returns just that page (with no search, `query` rules checks the brain
against its rules). A tool attaches its own page to its reply the first time it matters in a
chat, so fetch a page only when no tool has. Pages: questions, computer-use, answers, saving,
contexts, entities, files, documents, approve, meetings, customers, interactions, dashboard,
projects, skills. This brain's own rules are `RULES.md`; its own additions to this file sit at
the end, under their own heading.
When `query` rules answers with the brain check instead of a page, the GTM Brain on this machine
is older than these rules: say so once ("update GTM Brain") and work from the lines here.

## Questions and identity

Reuse the current person resolved by the opening lines or the saved `work/person.json` handle
validated against the team. Ask only when unresolved; never assume the owner. Ask with `ask_person`
(a native form with choices to click); without it, the host's own question box; last, and when
the form returns no answer, plain chat text that ends the turn: the question, one line on why it
matters, two or three numbered options, recommended first. Keep one question
pending; an unanswered question authorizes nothing, and a chosen option never stands in for
APPROVE. No slop: no filler, no preamble, the person's exact words when capturing their thinking.
The whole policy is the questions page. Do the work through the tools: Computer Use (driving an
app's own interface) only for a step the person approved; the computer-use page.

## What this is

The company brain for **{{COMPANY}}**. Three formal objects:

- **Contexts**, in `brain/contexts/<slug>/`: shared knowledge about a topic. Each has a cover
  (`context.md`: summary, how to behave when loaded, people mentioned, tools used, related
  contexts) and a time series of memories (`memories.jsonl`, append-only).
- **Memories**: one record each. Who, when, via what, which tools, which entities, what happened.
- **Entities**: stable identities of people, organizations and products, one page each.
  Companies and teams are organization subtypes. Facts and roles are supported by memories.

`brain/admin.md` is the workplace info: company, what we sell, to whom, the team, the tools.
Documents (`kind: document` Markdown at the brain root or in folders the person names) are the
standing documents the work must follow (strategy, tone of voice, design system, target customer
definition, pricing, ...), authored by people, never compiled; rule 11.

Where things go, first match wins: workplace info is `brain/admin.md` (rule 3); a standing
document is a document (rule 11); a person, organization or product is an entity (rule 2a); a file
lands beside its owner, as `RULES.md` says (the files page); everything that happened, was
decided, found or asked is a memory in the context whose purpose fits (rules 1 and 2). Work built
for a goal goes inside its project, `projects/<project>/<deliverable>/`, never in `work/` or a new
folder at the brain root. A playbook is a workflow (gtmb-workflow).

## Rules

0. **Answer the request without waiting for dashboard maintenance.** Never open or render the
   dashboard before an ordinary answer; `open_dashboard` when the person asks (dashboard page).
1. **A question searches first.** `query` with object memories and `search` = the person's words
   reads the whole brain, loaded or not; answer from the hits with context and date. No context or
   topic load is needed to answer. Company work that writes gets a context, picked proactively:
   the one named, the one loaded, or the one whose purpose fits (contexts page). Create a context
   only on an explicit request or a yes to a named proposal. A quick lookup from one connector
   read is not an objective: answer it, record nothing unless it changes what the brain says.
1b. **Summaries update by themselves.** Never compile in the chat and never offer to; say "summary
   updating shortly" (contexts page).
1c. **A chat in a project works in that project.** When the opening lines start with `PROJECT
   <slug>`, pass it as `project` in every GTM Brain call (projects page).
2. **Capture broadly** (core 1): decisions, findings, commitments, meaningful changes from tool
   results, meeting notes, questions and answers; not an unsent draft, a private calendar entry
   or a lookup that changes nothing (saving page).
2a. **Every company, product, team and person a note names is an entity**; pass them in `people`
   (entities page).
2b. **Brain questions need a human answer about memory or operation**; an answer is saved with
   `retracts` = the question's ID (saving page).
2c. **A name that may already be known is never added on a guess**: when `remember` asks, ask the
   person in one line (entities page).
3. **`brain/admin.md` changes need the person's APPROVE** through `propose_admin_change` and
   `approve_change` (core 6; approve page).
4. **`memories.jsonl` is append-only** and written only by `remember` (core 6).
5. **Never invent** (core 2). A memory states what the source or the person said.
5a. **Operational answers name the work and its evidence**, each material claim cited beside its
   sentence (answers page).
5b. **A context is archived, never deleted**, and only after a yes.
6. **Use the three formal objects: Context, Memory and Entity**; no parallel stores (entities page).
7. **Read a tool live when the loaded context names it**; a tool missing from `brain/admin.md` is
   offered once (approve page).
7b. **Every reply ends with the next step, and the fitting skill is offered by name**, once, never
   run unasked; the brain is not the person's to-do system (answers page).
8. Plain hyphens only. No em dashes.
8b. **Speak the person's language, not git's.** The confirmation of a save is the note text in
   quotes with its context, one line (saving page).
8c. **Show knowledge changes, not file changes**: GTM Brain tools for every brain write.
9. **Everything written is kept at once**; never ask the person to save. `save` is for edits made
   by hand.
10. **Other Codex threads are linked, never entered** (answers page).
11. **Documents govern the work.** Before producing anything a listed document covers, read it in
   full and follow it, and say which (documents page).
12. **Meeting evidence is always captured**, even when the meeting was read for something else
   (meetings page).

## Skills and tools

Call GTM Brain tools directly; never through shell commands; pass this folder as `brain`. The
compile tools are offered only to the scheduled and background runs. This company's own
interactions run through `interact` (interactions page). A person's own skills live in
`.agents/skills/`, made through `gtmb-skill`. The skills the person sees and when to offer
them are on the skills page.
