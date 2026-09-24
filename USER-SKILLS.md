# Your own skills in GTM OS

GTM OS 0.22.0. For Artur and for course participants: what a skill of your own is, how you make
one, where it shows up, and how it travels.

## The idea in one paragraph

A skill is a folder with a `SKILL.md` file that tells Codex how to do one kind of work the same
way every time (draft the weekly account update, prepare a Circle event, run the sales review).
GTM OS ships nine of them (`/gtm-os-todo`, `/gtm-os-sync`, `/gtm-os-deepdive`, ...). From
0.22.0 you can add your own. They live inside your company brain folder, they show in Codex
next to the shipped ones as `/gtm-os-<name>`, they reach everyone who shares the brain, and
no GTM OS update ever touches them.

## Before you start

- Update GTM OS to 0.22.0 or later: say `update GTM OS` in Codex, then quit and reopen Codex.
- Codex reads the skill list when the app starts. After making or installing a skill, quit
  and reopen the Codex app, then start a new chat. A new chat alone is not enough.

## Three ways a skill gets made

1. **Say it after doing it.** You just did something in a few steps (created an event in Circle,
   drafted an update from the CRM). Say `turn what we just did into a skill` or
   `make this a skill`. Codex drafts the skill from the steps it just ran.
2. **Ask for it.** Type `/gtm-os-skill` or say `add a skill`. Codex asks one question: what the
   skill does, when it applies, which connected tool it uses, and what it produces and where
   that lands. A skill that writes a document says so in its last step: decisions go to the
   brain as notes, a document the work must follow is written as a document, a draft stays in the
   project folder. A skill that only says "write strategy.md" leaves a loose file at the brain
   root that nobody else receives.
3. **The health check suggests it.** When the same action shows up on three separate days in
   the last month (three different days, not thirteen events in one afternoon), the advisor
   behind `/gtm-os-todo` and the dashboard's attention list says
   `Say: make a skill for "move deal" in attio.` Say that sentence and Codex drafts the skill
   from the notes that carry that action.

In every case Codex shows the draft first: the name (`gtm-os-<slug>`), a one-sentence
description, and the first step. You pick "Create it" or "Change something". Nothing is
written before you answer. Then quit and reopen Codex: the skill is there in your next chat.

Rules the tool enforces:

- The name is `gtm-os-` plus lowercase letters, digits and hyphens, made from the title.
  A shipped name (`gtm-os-todo` and the other eight) is refused.
- The description is English, one sentence, at most 200 characters. It is what Codex reads in
  every chat to decide when the skill applies, so it is the whole cost of the skill until it
  is used.
- The steps (the body) say what another chat should do.

Codex has its own general skill creator (`$skill-creator`). Inside a GTM OS brain the rulebook
tells Codex not to use it: it would put the skill in a personal folder outside the brain, where
teammates never see it and where GTM OS cannot list it. In a brain, `/gtm-os-skill` is the way.

## Where a skill lives

`<your brain folder>/.agents/skills/gtm-os-<name>/`

- `SKILL.md`: the name, the description, and the steps. Its first lines say it was made with
  GTM OS and lives in the brain.
- `agents/openai.yaml`: the display name Codex shows, `GTM OS: <Title>`.
- optional `references/` and `scripts/` for longer material.

The folder is committed with the brain the moment it is created, like a note. If the brain has
a git remote, it is pushed and teammates get it on their next pull. Plugin updates replace the
plugin, never the brain, so skills survive every update.

## Where a skill is visible

- **In Codex:** type `/` in the chat box and the skill is listed as `/gtm-os-<name>` next to
  the shipped GTM OS skills. `$gtm-os-<name>` mentions it inside a longer prompt. Codex also
  picks it by itself when your request matches its description.
- **In a linked project folder** (a folder you connected with `/gtm-os-project`): the skill is
  linked into that folder automatically, at link time and every time a chat starts there, so
  it is visible there too. Folders inside the brain folder see it without any link.
- **On the dashboard:** Help, then Ways to work in Codex, under the group "Your skills". Each
  card opens a prepared Codex message.
- **In the chat:** say `list my skills` for one line per skill, then the shipped ones.

A new skill needs a restart: Codex reads the skill list when the app starts, so quit and
reopen Codex after making or installing one, then open a new chat. The dashboard and
`list my skills` show it right away; only the `/` menu waits for the restart.

## Sharing

- **With teammates on the same brain:** nothing to do. The skill is in the brain's git.
- **With someone on another brain:** send them the folder, or keep the skill in a GitHub
  repository and give them the sentence to type in their brain:
  `install the skill <owner>/<repo> at <path to the skill folder>`.
  Private repositories work when their git login or a `GITHUB_TOKEN` reaches them. The
  installed skill is renamed under `gtm-os-`, gets the GTM OS header, and is validated like a
  created one.
- **With everyone (a signature skill):** that is a change to GTM OS itself. Send the folder to
  the GTM OS repo; it ships with the next version under `plugins/gtm-os/skills/`.

For the course, a curated set can live in one GitHub repository (for example a sales skill,
then a landing page skill, then a marketing skill), and each participant installs the week's
skill with one sentence.

## Managing

- `list my skills`: what this brain has, and where it is linked.
- `remove the skill gtm-os-<name>`: Codex confirms, then the folder and its links go. Notes
  stay.
- To keep a skill in the brain but hide it from your own Codex, add to `~/.codex/config.toml`:

```
[[skills.config]]
path = "<brain folder>/.agents/skills/gtm-os-<name>"
enabled = false
```

## Good to know

- Codex lists every skill in every chat inside a fixed budget (2 percent of the context window,
  or 8,000 characters). Short descriptions keep that cheap; that is why the tool caps them at
  200 characters. A skill's steps cost nothing until the skill is used.
- Skills in your personal folder (`~/.agents/skills`) are not GTM OS skills: they are yours
  alone, GTM OS does not list them, and an update does not affect them either way.
- Skills are for the doing (the steps, the inputs, the connector). Interactions (the fixed way
  an outcome is recorded in the brain) are separate and are made only when you ask for one;
  the advisor no longer proposes them.
