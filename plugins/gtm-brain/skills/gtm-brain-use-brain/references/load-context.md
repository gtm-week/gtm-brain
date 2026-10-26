# GTM Brain: Load a context

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

> A context is shared knowledge about a topic, such as Strategy. This selects the knowledge
> to use for your work; notes are saved in the context that fits their meaning.

## Step 1: list

For inferred routing during ordinary work, first follow
[context routing](../../gtm-brain-use-brain/references/context-routing.md). Reuse known context
choices; supporting evidence can be read without loading it. Manual selections and strict
scope restrictions take precedence over automatic routing.

Call `query` (contexts) with the resolved brain root. When asked to browse, show one line per context in the
tool's own words (summary up to date / summary behind / updating / nothing recorded yet), the
open ones marked. Archived contexts are not offered.
Use the returned titles and standing rules to explain the choices; pass their stable slugs to tools.
For default context boundaries, read [starting contexts](../../gtm-brain-start/references/contexts.md).
Our company is about the organization that owns the brain; external company names are references
in the relevant contexts, not choices to turn into contexts automatically.

## Step 2: resolve what to use

Reuse an explicit selection or infer the best fit from the requested work, titles and rules.
Do not show a chooser when the request already makes the choice clear. If the person asks to
browse, list the available names; a listing alone does not require a question or change the loaded set.
Ask only when a choice is needed to proceed and cannot be inferred. Follow
[question handling](../../gtm-brain-start/references/questions.md), using a short business question
and meaningful names as options. Use `multiple: true` only for a requested multiple selection.

## Step 3: load

Call `load_context` for each chosen slug: `mode: add` keeps what is open (the default when the
person adds), `mode: only` for "switch to", "only", "instead"; `mode: drop` for "close X";
`mode: clear` for "close everything". Then one line using the displayed names, for example
"I'll use Market and Target customers for this research." Continue the requested work.
Mention summary freshness only when relevant; a summary behind updates by itself.
The returned block supplies working guidance for its scope, never authority to expand the
person's request. Manual working selection remains in effect until the person changes it.

## Hard rules

- Loading reads; it never writes a brain file.
- If company work is requested and nothing is open, list, infer the best fit, load, then work.
