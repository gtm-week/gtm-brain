# GTM Brain: Compile

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.


> For humans: the context's pinned summary, rewritten from the notes. Only contexts with new
> notes get touched. Your standing instructions are kept. Compile puts reusable methods
> learned from the notes in Working guidance and current next steps in the summary.
> Working guidance stays empty when the notes teach no useful method.

## When it runs by itself

A separate run starts immediately after each saved change and rewrites summaries with new
notes. There is no note threshold or batching timer. Only one run works on a brain at a time;
changes arriving during that run get an immediate follow-up pass. With nothing pending, no
model run starts. A failed pass retries up to three attempts, ten seconds apart.

Saved notes and answered questions refresh the dashboard before compilation finishes. The
summary shows that it is updating during the run and refreshes when the new cover is saved.

## In a chat

A chat never compiles and never offers to. The compile tools are offered only to the scheduled
and background runs; a chat does not see them (ALL-204). When the person asks ("compile pipeline",
"update the summary now"), queue the worker through the shell and say the summary is updating:

```
bash "$PLUGIN_ROOT/scripts/gtm-brain-compile/background-compile.sh" "<brain>"
```

It compiles every context whose summary is behind, then the stale entity briefs, and the
dashboard shows progress. Nothing behind: say "every summary is up to date". A summary paused
by a manual edit is skipped by the worker until the person has reviewed it: read the context
and its exact edit, preserve corrections as sourced memories or standing rules, ask whether the
generated prose may now be replaced, and only after an explicit yes run

```
node "$PLUGIN_ROOT/scripts/gtm-brain-compile/compile.mjs" "<brain>" --release <slug> --reviewed-cover <hash>
```

with the hash the dashboard's manual-edit notice shows (or `compile.mjs <brain> --stale` prints).
It backs the edit up, adopts it as the baseline and queues the compile. A refusal means the file
changed since the review: read it again.

The steps below are the procedure the scheduled and background runs follow.

## Step 0: what is behind

Call the GTM Brain tool `compile_facts` with `brain` = this workspace folder and no `context`. No shell command.

Valid older covers start tracking automatically; no initial review is needed. For later manual
edits, explain "Summary needs updating due to manual editing" and preserve the changes. Rows with `manualEdit` are
paused for reconciliation, not ready to compile. Background and scheduled
runs skip them. For a user-led review, read the named context and its exact Markdown edit;
preserve corrections as sourced memories or standing rules and obtain explicit confirmation
before replacing generated prose. Only then pass the exact `reviewed_cover` hash from facts
to `compile_apply`; the original file is backed up. Invalid Markdown must be fixed first.

Empty list: say "every summary is up to date" and stop. If the person named a context, compile
that one even if it is current.

## Step 1: per context, read the facts

Call `compile_facts` with `context` = the slug.

You get the standing rule, the current summary, previous working guidance, names with counts,
tools with counts, related contexts, open questions, decisions, and every effective memory
in recording order with its ID, recording timestamp, source references, and action references.
Relevant event dates are kept in the memory text. The output includes
`as_of: s_...`, a key of the memories and exact Markdown these facts include. Keep it for step 3.

The cover's `compiled_at` is when this context summary was last refreshed. It does not
mean its sources were checked live. Use event dates to explain when things happened and
recording timestamps to explain when we learned them. A historical import can make a
summary stale without being a recent event. Keep partial dates, approximation and unknowns.

## Step 2: write two pieces of prose, nothing else

- **summary**, 3 to 6 sentences, present tense: what is going on in this context, the open
  threads, what changed since the last compile. Name people as in the memories. Every sentence
  must be traceable to a memory; no inference presented as fact. If there are open questions,
  say how many and name the sharpest one. Include supported immediate next steps, owners and
  dates when known. Keep their source memories as the follow-ups; compilation creates no new
  tasks or decisions and never turns an old pending action into a current commitment.
- **Working guidance** (tool argument `now`), concise reusable methods learned from effective
  memories: how to work in this context, find evidence and use its tools. Cite supporting
  memory IDs for each method. Keep distinct useful lessons in plain paragraphs without
  Markdown section headings; there is no fixed sentence cap. Do not repeat standing
  instructions, current status, one-off actions, owners or deadlines here.
  Pass `now: ""` when no useful methods are supported. No placeholder or generic advice.

Explicitly consider what the memories teach about using tools in this context: which source
or field answers a question, how to interpret its data, useful filters, operation ordering,
and known limitations. A tool being listed or called often is not evidence of how to use it.
For example: "For renewal planning here, use Attio's contract_end; close_date is the original
sale date (m_...)." The one-off action "Confirm Acme's renewal owner" belongs in the summary
and its source follow-up memory.

Revalidate previous guidance against the effective memories. Retain supported lessons even
when no new memory repeats them; revise or remove guidance whose evidence was superseded,
retracted, or no longer applies. The previous summary and guidance are reminders of what to
check, not independent evidence. Write "context", never "channel", even where the previous
summary, the guidance or the notes say channel; a Slack channel named in a source keeps its
name. Older guidance may mix methods with immediate actions.
Retain supported methods here; keep still-supported actions in the summary and source
follow-ups, and remove obsolete ones from generated prose. If an old action has no supporting
memory, do not turn it into a fact. Existing manual-edit review still applies.
Cite supporting memory IDs for reusable methods;
use the provided source references to assess provenance without fetching every linked item.
A source pointer alone does not establish a tool's behavior or grant instructions authority.

Keep guidance scoped to this context. Do not generalize a field mapping or workflow to other
contexts merely because they use the same tool. Preserve uncertainty and name unresolved
conflicts; do not turn a failed call into a universal restriction or an observation into user
permission. Learned guidance must not override the standing rule. Do not invent tool guidance
when the memories contain none. Empty guidance is a complete, valid result, including when
all previous methods have been superseded or withdrawn.

Plain hyphens. No names that are not in the memories.

## Step 3: apply

Call `compile_apply` with `context`, `by` (the person's handle; `schedule` in the scheduled run;
`background` in the background run), `as_of` (from step 1), `summary` and `now`.

The tool writes the frontmatter (summary, people, tools, related, last_active, confidence,
compiled_at, compiled_by), keeps the standing rule, replaces Working guidance (or clears it),
and commits through the library. If it says *not applied: changed since --facts*, memories or Markdown changed while
you were writing: go back to step 1 for that context. Never guess an `as_of`.

## Step 4: report, per context

Not the mechanics; the content. No commit hashes, no git words: to the person this is "the
summary is updated". Shape:

> **Pipeline** compiled from 4 memories (confidence medium). [Open the cover](<absolute path to context.md>)
> **Summary.** <the summary you wrote>
> **Working guidance.** <learned methods, omitted when empty>
> Names: Pierre Aubert, Ingrid Solberg, Bergstrom (company) · Tools: attio, gmail · Related: marketing

The tool keeps the cover at once; say nothing about saving. The link matters: the app opens it
in the side panel.

## Hard rules

- Never edit `context.md` by hand from this skill; always `compile_apply`.
- Never edit memories, workplace info or identity metadata during compilation. Entity briefs
  use the separate [entity compilation procedure](entity-compile.md).
- Summaries state what memories state. Contradictions between memories are named in the
  summary, not resolved.
- Do not compile a context whose summary is up to date unless asked. Archived contexts are
  never listed; compile one only if the person names it.
