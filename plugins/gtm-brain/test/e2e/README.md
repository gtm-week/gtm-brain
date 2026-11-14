# End-to-end harness (deterministic half)

No model, no connectors, no network. A generated brain, the real MCP server over stdio and the
real scripts, scored against a gold ledger written by the generator.

```bash
node plugins/gtm-brain/test/e2e/generate-brain.mjs --shape small --out /tmp/e2e/small [--seed 1]
node plugins/gtm-brain/test/e2e/e2e.mjs /tmp/e2e/small --gold /tmp/e2e/small.gold.json [--json] [--keep]
node --test plugins/gtm-brain/test/e2e.test.mjs     # the small shape, in the suite
```

## generate-brain.mjs

`--shape small|medium|large|messy`. The brain is made by `setup.sh`; entities and notes go through
`lib` only (`writeNames`, `appendMemory`, `updateEntity`, `mergeEntities`, `prepareAsset`) with
`GTM_BRAIN_NO_COMMIT=1` and `GTM_BRAIN_NO_COMPILE=1`, then one `lib.save`. Kinds, organization
subtypes and relationship types are read from the parsed SCHEMA.md, so a kind added there later is
generated too. Same shape and seed give the same gold ledger (the suite test holds this).

- small: about 20 entities, 100 notes.
- medium: hundreds of entities per kind and subtype, 5,000 notes, projects, relationships with
  ended ones and dated changes, customers with statuses, meetings with participants, decisions,
  open questions, corrections.
- large: the same mix at 50,000 notes.
- messy: medium plus traps: two Maxes, a one-letter typo, a private and a work email for one
  person, a renamed company, merged entities, contradicting notes, relative dates, an unsent draft.

The gold ledger is written next to the brain (`<out>.gold.json`), never inside it.
`--cache <dir>` keeps a finished brain per shape, seed and source hash.

Writing through `lib` costs about 100 ms per note on main and grows with the brain, so medium
and messy take well over ten minutes and large is impractical; see `baseline.json`.

## e2e.mjs

Copies the brain to a scratch folder (the write checks append notes), starts `server/server.mjs`
and runs about 50 checks in sections: search (single and multi-word, stemmed, typo, names, aliases,
SQL), entities (name, id, alias, typo, email), briefs (facts, cited ids, size), relations and their
history, customers, meetings, deal, rules, status, compile (`--facts` read through a pipe, full
size, and over MCP), load_context, remember (single, batch over MCP, `--batch` script),
corrections (supersede, retract), and on messy the traps. Each result: `id`, `section`, `pass`,
`ms`, `bytes`, `note`. A failure caused by a gap main is known to have carries `known_gap`; the run
exits 1 only on a plain failure. `E2E_DEBUG=1` adds the reply text to failed checks.

Known gaps marked today: unstemmed search, no typo tolerance in memory search, note ids missing on
`recall` and `load_context` read lines and in relation history, unbounded entity briefs, the
64 KiB cut on `compile --facts`, and `remember` refusing without a loaded context. Some only show
on the bigger shapes.

`baseline.json` is the run on unchanged main.
