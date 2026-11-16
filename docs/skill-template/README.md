# Contributing a skill to GTM Brain

For experts and tool vendors (Zynt, Surfer, a course lecturer) adding a skill that ships with
the plugin to every brain. A skill one company keeps for itself is not this: see
[USER-SKILLS.md](../USER-SKILLS.md), no pull request needed.

`gtmb-icp` (Chris Pawlak, PR #5) is the worked example. Read it next to this page.

## What a skill is

A folder in `plugins/gtm-brain/skills/gtm-brain-<slug>/`:

```
SKILL.md              how the skill runs inside GTM Brain: what to read, what to ask, where the result goes
references/method.md  your expertise: how the work is done well, without GTM Brain tool names
agents/openai.yaml    the name, one line and the default prompt Codex shows
```

The skill never touches brain files directly. It reads with `query`, `load_context` and
`document`, asks in Codex's question box or plain chat text, and writes with `remember` or
`document`. Those tools keep the brain valid and commit every write; a direct edit of
`brain/admin.md` or a `memories.jsonl` is put back at the next chat start or save.

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
   - The skill tables in `README.md`, `docs/COMMANDS.md` and `docs/ONBOARDING.md`: one row each.
   - The skill count ("twenty") in `README.md`, `.claude/CLAUDE.md`, `.github/CONTRIBUTING.md` and
     `docs/USER-SKILLS.md`, plus the skill list in the layout blocks of `README.md` and `.github/CONTRIBUTING.md`.
   - A skill whose work overlaps another: say "Not ..." in both descriptions, as define-icp
     does about market desk research and campaign execution.
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
   cache paths in `docs/SETUP.md` and `docs/COMMANDS.md`, then run `node scripts/sync-derived.mjs`.
   Without a bump nobody is offered the skill.
7. **Open a pull request** to `main`. Run `node --test 'plugins/gtm-brain/test/*.test.mjs'`
   first. Without write access to the repository, open it from a fork; `main` needs one approval.

## A skill that reads your tool

For a vendor such as Zynt, the contract between your tool and the brain:

- **The connector is yours, the sign-in is the person's.** They add your MCP server in Codex and
  sign in there, or paste a key your app gives them. The brain never holds a key or a token: a
  pasted key is used in that chat only, never written to a file, note, commit or the dashboard.
- **MCP first, HTTP API second, never the browser.** When your MCP tools are listed in the
  chat, use them. Otherwise your HTTP API with the pasted key, called with curl, one request per
  step, no code written. Name both paths in `SKILL.md` step 2 with your own URLs.
- **GTM Brain sees your connector, but cannot install it.** A remote MCP server in the person's
  Codex `config.toml` shows on the dashboard as installed, untested, and as connected after a
  successful call. A tool used only through its HTTP API is listed once the skill records a read
  test (`mark_tool`) and a note names it in `tools`: connected through its API, or read failed
  when the key expired. Use MCP when your tools are already there; never make the person add MCP
  only to be listed. `gtmb-configure` cannot add your server for them, so put your own connect
  steps in the skill, check your tools are callable first, and when they are not, say so and
  show those steps. After connecting, the person opens a new chat: Codex lists tools at chat start.
- **The brain keeps pointers, not your data.** A signal or a news item becomes one short note in
  the context named in your `SKILL.md`, about the companies it names, with `sources` set to
  `yourtool:<url or id>`. Raw lists, exports and payloads stay with you. Never one context per
  account: the company is on the note, so its page collects every note about it.
- **The skill asks before acting in your tool.** Sending, enrolling or moving a record needs a
  yes from the person in that chat.
- **Runs happen in a chat or a scheduled run.** GTM Brain has no endpoint for webhooks; data your
  tool pushes is read the next time the skill runs.
- **Say what the brain must give you.** List the brain facts your skill reads (ICP, positioning,
  target accounts) in `SKILL.md` step 1, and what it does when one is missing: ask, or stop.

## A skill that sets up your tool from the brain

Many vendors start with setup: the person signs up, your app hands them a short prompt with a
key, and the agent fills your onboarding from what the brain knows. Ship that as its own skill
(`gtm-brain-<tool>-setup`), separate from the skill that reads your tool every day, so the setup
runs once and the daily skill stays short. The setup skill:

1. **Starts from your prompt.** Its triggers include the first line your app's "copy for my
   agent" text begins with, so a pasted prompt reaches the skill without a slash command.
2. **Reads before it asks.** Strategy, ICP, market, voice and the target companies come from
   the brain (`document`, `query`). It asks the person only for what the brain does not say, one
   question at a time, and says which brain file each answer came from.
3. **Marks guesses as guesses.** A brain line that is a hypothesis, a draft or a
   `[not filled]` starter is sent to your tool as a draft, never as a confirmed fact.
4. **Lets the person confirm in your tool.** The skill ends by naming the screen where the person
   checks the summary ("click Looks right in Zynt"); it never confirms on their behalf.
5. **Keeps one note.** When setup is done: one note with what was set up, which segment or
   list, and the date, sourced to your tool. Not the answers it sent.
6. **Offers the daily skill next**, in one line: the first question the person can ask now.
