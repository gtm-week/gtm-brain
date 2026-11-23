# The shipped skills

Thirty-two skills ship with GTM Brain. A skill is one sitting of work you start in a Codex chat
opened in the brain's folder: type its command, `/gtmb-<name>`, or say the sentence beside it.
For the difference from a workflow, your own skill and an interaction see
[How GTM Brain works: Skills, projects and interactions](HOW-IT-WORKS.md#skills-projects-and-interactions).
Every tool and operation behind them, with the files each writes, is in [COMMANDS.md](COMMANDS.md).

## Set up and connect

Start here. One command creates the brain; the rest connect what you already use.

| To do | Command | Or say |
| --- | --- | --- |
| Create the brain in an empty folder | `/gtmb-start` | |
| Connect your CRM, email, calendar or call recorder; change company, team or settings | `/gtmb-configure` | "connect my tools", "change our company details" |
| Connect Clay and find your target companies and people in it | `/gtmb-clay-setup` | "set up Clay for me" |
| Connect ZYNT buying signals and put the brain's companies and people on ZYNT lists | `/gtmb-zynt-setup` | "set up ZYNT for me" |
| Connect Freckle and build a first list of target companies and people | `/gtmb-freckle-setup` | "set up Freckle for me" |
| Connect Woodpecker, see how campaigns perform, draft one email sequence | `/gtmb-woodpecker-setup` | "set up Woodpecker for me" |
| Connect Surfer, get topics from your notes, brief a first article | `/gtmb-surfer-setup` | "set up Surfer for me" |
| Connect HeyReach, see how LinkedIn campaigns do, get messages to paste in | `/gtmb-heyreach-setup` | "set up HeyReach for me" |
| Update GTM Brain | `/gtmb-configure` | "update GTM Brain" |

Each tool setup connects only on your yes, never keeps a key, asks again before anything that
spends credits, and never sends, publishes or starts a campaign. Company, team and settings
changes are shown first and apply only when you click APPROVE.

## Rules and schema

The two that decide what the brain keeps, what it asks and where files go. Start here.

| Command | Use it for | Or say |
| --- | --- | --- |
| `/gtmb-rules` | Show, add, change or remove a rule: what Codex saves and asks, where files go, when it reads a live tool instead of a saved note. | "add a rule: ...", "from now on ...", "speaker graphics go in speakers/" |
| `/gtmb-schema` | Change the fields kept per kind, the kinds and subtypes, and the relationship types. | "every company must have a budget owner", "track venues" |

## Mentors

A mentor is a skill that coaches you through one piece of GTM work. It reads what the brain
already holds, so its questions and its draft are about your company and your customers, not a
template. The first five fill a base document in `configuration/about-us/`, which Codex reads
in full before every email, plan and page; the other four produce work from those documents.

| Command | Use it for | Or say | Brain file |
| --- | --- | --- | --- |
| `/gtmb-strategy` | A 10-15 minute strategic intake, then your strategy written down and kept up to date. | "run the strategic intake" | fills `strategy.md` |
| `/gtmb-icp` | Define company fit, buying roles and readiness with Chris Pawlak's interview; keep one draft ICP with segments and buying roles. | "define our ICP" | fills `icp.md`; reads your customers and their notes |
| `/gtmb-market` | Fill or update the market document: who we compete with, how buyers choose, where we win and lose; a draft shown first and saved on your yes. | "fill in the market", "who do we compete with" | fills `market.md`; keeps each competitor as an organization |
| `/gtmb-voice` | Draft a tone of voice: whose it is first (company, person or team), then from writing that fits, tested on one fresh piece. | "draft our voice" | fills `voice.md` for the company's voice |
| `/gtmb-design-system` | Build your website design system from the existing brand with Brian Woloszczak and Peakout's starter. | "build our design system" | fills `design-system.md`; creates `projects/website` |
| `/gtmb-market-research` | Assess a segment, buying pains, alternatives and evidence for fit; ends in a sourced report with a positioning map, judged against your offer. | "research this market" | reads strategy, ICP and market; writes a report document |
| `/gtmb-unit-economics` | Compare CAC, LTV, payback and retention with explicit inputs and gaps; ends in PUSH, FIX, STOP or MEASURE. | "can we spend more on growth" | reads strategy and your pricing, spend and churn notes; saves a decision note |
| `/gtmb-deepdive` | A one-page sourced brief on an account, person, deal or topic: where things stand, who is involved, what is open. | "brief me on Acme Retail", "prepare me for the call with Anna Lind" | reads the entity, its notes and your tools; saves nothing unasked |
| `/gtmb-build-landing-page` | Build a campaign page on the shared website; stops at a local preview. | "build a landing page for our event" | reads strategy, ICP, voice and design system; writes in `projects/website` |

## Everyday

| Command | Use it for | Or say |
| --- | --- | --- |
| `/gtmb-use-brain` | Recall evidence, save findings and resume everyday work. | "just got off a call with ...", "what do we know about pricing?", "add pricing as a base file" |
| `/gtmb-todo` | List what you owe: open questions, dated follow-ups, Slack replies; at most eight, one at a time. | "what is waiting on me" |
| `/gtmb-sync` | Pull what changed in connected tools and keep what matters; set up the daily sync. | "catch up", "sync every morning" |
| `/gtmb-use-zynt` | Read the news and signals on your ZYNT lists against the brain: who has a reason to hear from you now, what ZYNT knows about an account. | "signals for me", "any news on my list?" |
| `/gtmb-housekeeping` | Tidy names and gaps one question at a time: first names without a surname, names that may be the same, required fields nobody stated. | "let's do housekeeping" |
| `/gtmb-workflow` | Create a workflow (a playbook), check it, switch it on, start a run and advance through its steps and gates. | "start the outbound workflow", "make a playbook for ..." |
| `/gtmb-interaction` | Propose an action you repeat in your own tool; after APPROVE Codex does it and records it the same way every time. List or run the ones you have. | "propose an interaction for moving a deal in HubSpot" |
| `/gtmb-skill` | Turn a repeated process into your own reusable skill. | "make this a skill" |
| `/gtmb-project` | Create a project (a folder plus a tag on notes) in the brain, or link a folder where it already lives. | "create a project for the Berlin event", "link this folder" |
| `/gtmb-add-section` | Add a reusable section to the website design system. | "add a comparison table to our sections" |
| `/gtmb-publish-website` | Publish the shared website on Vercel: preview first, production on its own decision. | "publish the website" |

`/gtmb-housekeeping` is not `/gtmb-todo`. It lists what to settle (first names without a
surname, names that may be the same, required fields nobody stated) with the evidence, one
question at a time and only when you ask; nothing changes until you answer.

## The website

The website is one project at `projects/website` with its own git: `/gtmb-design-system`
creates it, `/gtmb-add-section` and `/gtmb-build-landing-page` add to it and stop at a local
preview, and `/gtmb-publish-website` needs your Vercel and GitHub connectors. The website
skills use Brian Woloszczak and Peakout's GTM Tech Week starter; GTM Brain bundles its pinned
source unchanged and plugin updates never rewrite your website project. See the
[preservation contract](../plugins/gtm-brain/starters/web-design-system/README.md).

## Older names

Until 0.36 the skills had longer names. An old name still works: Codex runs the new skill and
tells you its name. The table of old and new names is in
[Updating to 0.36](../plugins/gtm-brain/MANUAL.md#updating-to-036-short-skill-names).

## Topic and audience research

| Command | Result |
| --- | --- |
| `/gtmb-audience-loop` | Identify who fits the ICP or find relevant conversations |
| `/gtmb-topic-analyzer` | Understand the conversations the ICP is having, with sourced questions and participation evidence |

Either runs alone. See [the research workflows](TOPIC-AND-AUDIENCE.md) for evidence, review and collection boundaries.
