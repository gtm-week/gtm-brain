---
title: Skills and tools
words: skill skills workflow workflows tool tools plugin cell script shell own sql compile
attach: skill workflow
---
The person asks in plain language. Call GTM Brain tools directly when the host lists them as
tools. When the host exposes them only inside a code or script cell, call them there: that is
the host's tool path, not a workaround. Either way a tool result is content parts, not a string
to print. A skill file is read once with a plain file read, not through a cell, and only for a
workflow the person asks for or accepts; ordinary questions and saving need none.

The compile tools are offered only to the scheduled and background runs; a chat never compiles
itself. For a count, a join or a date range, `query` with `sql` reads the memory index directly;
`describe_object` shows its columns. The skills run through the GTM Brain tools (`query` for
every read: memories, contexts, entities, brief, projects, brains, customers, meetings, health,
status or `sql`; `load_context`, `remember`, `render_dashboard`, `open_dashboard`, `new_context`,
`fork_context`, `archive_context`, `save`, `add_name`, `check_tools`, `mark_tool`,
`propose_admin_change`, `approve_change`, `setup_brain`, `upgrade_brain`, `document`,
`link_project`, `unlink_project`), never through shell commands; pass the brain folder as
`brain`.

A person's own skills live in the brain's `.agents/skills/` as `gtm-brain-<name>`, made,
installed and removed through `gtmb-skill` and its `skill` tool, never by hand and never
with Codex's own skill creator; they appear after Codex is quit and reopened.

The skills the person sees (when to offer them: rule 7b, the answers page): `gtmb-todo` (what
waits on them, one item at a time), `gtmb-sync` (what came in through the tools),
`gtmb-deepdive` (a brief before a call or a decision), `gtmb-strategy` (the intake
that fills `strategy.md`), `gtmb-unit-economics` (PUSH, FIX, STOP or MEASURE for growth
spend), `gtmb-market-research` (sourced research on a market, as one report),
`gtmb-icp` (Chris Pawlak's interview; it keeps the ICP in `icp.md`),
`gtmb-project` (a working folder; offered only when the opening lines say the folder is not
linked, never run without a yes), `gtmb-start` (setup and handoffs), `gtmb-configure`
(workplace changes, tools, plugin updates and this brain's rules; offer a newer GTM Brain once
when the opening lines say one is available), `gtmb-skill` (a repeated workflow kept as a
skill), `gtmb-rules` (RULES.md: where files go and the saving rules), `gtmb-schema`
(SCHEMA.md: the fields kept per person, organization and product, organization subtypes and
relationship types). `gtmb-use-brain` holds the procedures behind the tools (compile,
dashboard resolution, imports, documents, files); read one of its references only for that
work. Natural requests such as "remember this", "load pipeline" and "what should I do" still
work.
