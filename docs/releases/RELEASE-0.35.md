# GTM Brain 0.35.0

Released from `main`. For a team already on 0.34: update the plugin, restart Codex, then let the
owner say "upgrade this brain". The steps, what a teammate on the old version sees and how to go
back are in [MANUAL.md, Updating to 0.35](../../plugins/gtm-brain/MANUAL.md#updating-to-035).

## What is new

**Asking**

- One search answers a question. Codex gets the best notes with date, age and source, and the card
  of the person or company the question names, in one call. Words match by stem, one typo is
  tolerated, and a name typed without accents finds the person.
- Stored facts carry their age. A table in the rules ("Ask the source") says which tool owns which
  question and how long a saved answer stays good.
- Smaller replies: a brief on a real 950-note brain went from 285 KB to 23 KB.

**Saving**

- A save does not stop to ask which context: the best guess is used and named.
- A restated fact is kept once. A note worded as a correction replaces the old one and says so.
- An unknown first name is saved first and asked about after.
- One-line confirmations.

**People, companies and what connects them**

- Entity pages live in a folder per kind: people, organizations, products, offerings, events,
  tools, meetings. A brain can add kinds of its own in its schema.
- A meeting is an entity; meetings captured before get a page.
- Relationships have history: who works where, who is a customer, since when and until when. A
  rename or a merge is part of that history.

**Configuration**

- Base documents (strategy, ICP, market, voice, design system, and any the team adds) live in
  `about-us/`. Rules, schema and settings live in `config/`. Only the owner changes those two
  folders; a teammate's change waits as a proposal and every approval is recorded.
- The rulebook opens with six core rules and is a third of its old size; the detail of each rule
  arrives when it matters.
- A rule of your own can be tagged so it is shown only where it applies, or checked on every save.

**Summaries, workflows, capture**

- A context's summary is written when the context is loaded. The background summary run is retired.
- A workflow can start on a schedule or on a save, with milestones and a check before it is active.
- A nightly pass captures what chats established, with a token cap.

**Dashboard**

- Four tabs: Configuration, Entities, Memories, Workflows.
- Documents can be edited on the page. Entities can be added, renamed, merged and archived. Notes
  can be corrected, withdrawn, moved and answered.
- The Design system document is shown as a design system, with a Visual tab for
  `design-system.html`.

**Upgrading and sharing**

- `brain/layout.json` records how a brain's files are arranged. A move asks first and changes
  nothing without a yes.
- A failed push is reported, and diverged teammates are merged.

## What changes on disk

Nothing changes when the plugin updates. After a yes to "upgrade this brain":

| Before (0.34) | After |
|---|---|
| `brain/entities/max-jendral.md` | `brain/entities/people/max-jendral-3f9a2c.md` (same id) |
| `strategy.md`, `icp.md`, `voice.md`, `design-system.md`, `market.md` at the top | `about-us/` |
| `RULES.md`, `SCHEMA.md` | `config/rules.md`, `config/schema.md` |
| `brain/admin.md` | `config/settings.yaml` (the same settings; the prose as notes) |
| no `brain/layout.json` | `brain/layout.json` |

Notes stay in `brain/contexts/<context>/memories.jsonl`, byte for byte. Workflows, projects and
documents in the team's own folders stay where they are.

The first move (entity pages) can be agreed by anyone on the team. The second (`about-us/`,
`config/`) is asked of the owner only. The owner gets one question for both.

## Updating

Follow [Updating to 0.35](../../plugins/gtm-brain/MANUAL.md#updating-to-035). The one rule that
matters: everyone updates the plugin before the owner says yes.

Rehearsed for this release against 0.34.5: a brain built with the 0.34.5 scripts and a copy of a
real brain (950 notes, 324 entity pages). Every note line and every entity id was the same
afterwards; the upgrade took 4 seconds on the real brain.

## Known limits

- **A teammate still on 0.34 is not stopped or warned by their plugin.** After the first move their
  notes still save, but their GTM Brain does not find the entity pages and writes flat ones again
  (folded back in by the next save from 0.35). After the second move their GTM Brain says the
  folder is not a brain and neither reads nor saves. No 0.34 update with a guard has shipped.
- **Going back from the first move is clean only on the day.** `git revert` of the layout 2 commit
  conflicts once entity pages have changed again. Reverting the second move works later too.
- **The backup folder is not a full backup.** `work/upgrades/before-<id>/` holds the replaced rules
  only. Moved pages and documents are recovered from git.
- **Notes still live in topic folders** under `brain/contexts/`, one file per context.
- **A merge of two names in chat can still take several tool calls** (find both, preview, apply).
- **Owner-only is enforced by GTM Brain, not by git.** A teammate with push access can still change
  `about-us/` and `config/` with git directly; who "the owner" is on a machine is the checkout's
  git email, not a sign-in.
- **Relationships are not backfilled** from notes saved before 0.35.
- **Saving still misses some cases:** a bare day number without a month, a first name plus a
  company that is not resolved, a snapshot without a date.
- **The rulebook still says summaries update by themselves** (rule 1b), and a status reply still
  counts notes waiting for summaries.
- **The dashboard render queue is shared by the whole machine** and never expires old requests; a
  render can wait behind others. In the rehearsal one render failed after 57 seconds and passed
  on the next try.
- **Measured before the last round of changes.** The recall and saving benchmark on real Codex
  (16 of 16 recall cases at 21.6 s and one call; saving 10 pass, 4 partial, 0 fail of 14) predates
  the `about-us/` and `config/` work and was not rerun. One recall rerun measured 29.8 s; the
  cause was not found.
- **Not tried on real Codex:** renames, merges and corrected relationships; the owner approval
  form and a teammate's proposal in the Codex app; the two demo loops with the real tools (they
  are proven on stand-ins only).
- **One test failed once** on one CI machine (`relation-to-us.test.mjs`, ubuntu, Node 24) and
  passed on the other three. The cause was not found.
