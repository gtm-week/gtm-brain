# GTM Brain: Load

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.


> For humans: choosing the context. "load pipeline" and Codex reads what is going on there and
> how to behave. Several at once is fine. "clear contexts" starts over.

Call the GTM Brain tool `load_context`: `brain` is this workspace folder, `contexts` the slugs,
`mode` is `add` (default), `only`, `drop` ("unload marketing": these go, the rest stay) or
`clear`. No shell command.

Loading adds: "load marketing" after "load pipeline" leaves both loaded, which is what the person
usually wants when they drift between contexts. "switch to marketing", "only marketing",
"instead" means `mode: only`. "clear contexts" means `mode: clear`.

1. Call it. The returned block is your working context for the rest of the conversation, on top
   of `AGENTS.md` and `brain/admin.md`. Treat **When loaded** as instructions.
2. Reply in one line using displayed names, for example "I'll use Strategy for this plan."
   Mention summary freshness only when it affects the request, using the dashboard's words
   ("summary up to date", "summary behind", "summary updating"). A summary that is
   behind updates by itself in a separate run; handle the person's request from the memories
   and never offer to compile. Only when they ask for it, follow the
   [compilation procedure](compile.md).
   An explicit request to update summaries already authorizes the compilation procedure.

## Hard rules

- Loading reads. It never writes a brain file.
- If company work is requested and nothing is loaded, call `query` (contexts), infer the best fit, load, then work.
- More than three contexts at once only if asked.
