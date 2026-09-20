# GTM OS: Edit a context

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

> For humans: a context has a name and standing instructions, including what belongs here
> and how Codex should work ("read Attio live, never offer a discount in writing"). This
> changes those two; the summary and working guidance are written from the notes.

## Steps

1. Call `query` (contexts) if the slug is not certain; confirm which one in one line.
2. Read the current cover with `load_context` (`mode: add`) if the current instructions
   matters for the wording; quote the line that changes.
3. Show the new text and call `edit_context` with `slug` and only the fields that change:
   `title`, `rule` (the whole standing instruction in English, including purpose and meaningful
   boundaries). Keep the instructions concise without dropping distinct requirements.
   Working guidance and the summary are kept as they are.
4. One line back: what changed, and that it is kept.

## Hard rules

- Instructions are authored in English; plain hyphens.
- Older covers may include boundary text carried into the standing rule. Preserve distinct
  requirements. If instructions conflict, show the conflicting wording and ask which to keep;
  do not silently resolve it during an unrelated edit.
- Never edit `context.md` by hand and never touch `memories.jsonl`.
- A change of purpose that is really a new stream of work is a new context, not an edit.
