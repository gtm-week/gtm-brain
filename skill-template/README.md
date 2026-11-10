# Contributing a skill to GTM Brain

For experts and tool vendors (Zynt, Surfer, a course lecturer) adding a skill that ships with
the plugin to every brain. A skill one company keeps for itself is not this: see
[USER-SKILLS.md](../USER-SKILLS.md), no pull request needed.

`gtm-brain-define-icp` (Chris Pawlak, PR #5) is the worked example. Read it next to this page.

## What a skill is

A folder in `plugins/gtm-brain/skills/gtm-brain-<slug>/`:

```
SKILL.md              how the skill runs inside GTM Brain: what to read, what to ask, where the result goes
references/method.md  your expertise: how the work is done well, without GTM Brain tool names
agents/openai.yaml    the name, one line and the default prompt Codex shows
```

The skill never touches brain files directly. It reads with `query`, `load_context` and
`document`, asks with `question`, and writes with `remember` or `document`. Those tools keep the
brain valid and commit every write; the hooks refuse a direct edit of `brain/admin.md` or a
`memories.jsonl`.

## Steps

1. **Copy the template.** Copy [gtm-brain-example/](gtm-brain-example/) to
   `plugins/gtm-brain/skills/gtm-brain-<slug>/`. Replace `gtm-brain-example` everywhere with
   your folder name (frontmatter `name`, `openai.yaml`, the triggers) and `Your Name` with yours.
2. **Write it.** The method in `references/method.md`, the run in `SKILL.md`. Keep the four
   steps: reuse what the brain knows, read the tool, ask one question at a time, keep the result
   in one named place. English only, plain hyphens only (no long dashes).
3. **Register it.** Every one of these, in the same pull request:
   - `plugins/gtm-brain/scripts/gtm-brain-render/skill-catalog.json`: an entry with `id`,
     `group` (`daily`, `knowledge`, `projects` or `setup`), `featured: false`, `title`,
     `description`, `example`. The dashboard lists skills from here, group by group, so put the
     entry after the last one of its group, not at the end of the file.
   - `plugins/gtm-brain/test/skill-catalog.test.mjs`: add the id to the list of shipped skills
     in "the person can ask for ... shipped workflows". The test compares a sorted list, so put the id in
     alphabetical order.
   - The skill tables in `README.md`, `COMMANDS.md` and `ONBOARDING.md`: one row each.
   - The skill count ("fourteen") in `README.md`, `CLAUDE.md`, `CONTRIBUTING.md` and
     `USER-SKILLS.md`, plus the skill list in the layout blocks of `README.md` and `CONTRIBUTING.md`.
   - A skill whose work overlaps another: say "Not ..." in both descriptions, as define-icp and
     gtm-brain-document do.
4. **Routing, only if needed.** A slash command (`/gtm-brain-<slug>`) always works. For plain
   requests ("define our ICP") to reach the skill, add a line to `plugins/gtm-brain/templates/AGENTS.md`.
   That file is in every brain, so it needs a snapshot of the outgoing file in
   `templates/legacy/AGENTS-<old version>.md`, its entry in `templates/legacy/manifest.json` and
   a one-line reason in `templates/legacy/why.json`. Skip this step unless plain requests matter.
5. **Test it.** Add `plugins/gtm-brain/test/<slug>.test.mjs`: every link in the skill resolves,
   the rules that matter are in the text. The suite also checks every skill on its own:
   frontmatter `name` matches the folder, a description, links resolve, scripts named exist,
   plain hyphens, a catalog entry. A live case (`test/live/<slug>-cases.mjs`, listed in
   `test/live/skill-cases.mjs`) runs the skill through real Codex; it is optional and run by hand.
6. **Bump the version.** Raise `plugins/gtm-brain/.codex-plugin/plugin.json`, the same number in the
   cache paths in `SETUP.md` and `COMMANDS.md`, then run `node scripts/sync-derived.mjs`.
   Without a bump nobody is offered the skill.
7. **Open a pull request** to `main`. Run `node --test 'plugins/gtm-brain/test/*.test.mjs'`
   first. Without write access to the repository, open it from a fork; `main` needs one approval.

## A skill that reads your tool

For a vendor such as Zynt, the contract between your tool and the brain:

- **The connector is yours, the sign-in is the person's.** They add your MCP server in Codex and
  sign in there. The brain never holds a key or a token.
- **GTM Brain sees your connector, but cannot install it.** A remote MCP server in the person's
  Codex `config.toml` shows on the dashboard as installed, untested, and as connected after a
  successful call. `gtm-brain-configure` cannot add it for them, so put your own connect steps
  in the skill, check your tools are callable first, and when they are not, say so and show
  those steps. After connecting, the person opens a new chat: Codex lists tools at chat start.
- **The brain keeps pointers, not your data.** A signal or a news item becomes one short note in
  the right context, with `sources` set to `yourtool:<url or id>`. Raw lists, exports and payloads
  stay with you.
- **The skill asks before acting in your tool.** Sending, enrolling or moving a record needs a
  yes from the person in that chat.
- **Runs happen in a chat or a scheduled run.** GTM Brain has no endpoint for webhooks; data your
  tool pushes is read the next time the skill runs.
- **Say what the brain must give you.** List the brain facts your skill reads (ICP, positioning,
  target accounts) in `SKILL.md` step 1, and what it does when one is missing: ask, or stop.
