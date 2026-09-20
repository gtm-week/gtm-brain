
# Create the brain (the procedure gtm-os-start follows in its Step 1)

Use the person's saved language for conversation and English for authored brain records.
Read [onboarding questions](questions.md) for structured
input. Reuse known answers. The folder must be empty apart from repository scaffolding;
never run setup over an existing brain.

## Check the environment

Call `check_environment` with `folder` before setup. It reports available tools, sign-in
and whether the folder already contains a brain or other files. Use this operation instead
of separate shell probes. Reuse an existing brain; do not run setup over it. For a nonempty
folder, choose an empty landing folder before proceeding.

## Gather only what is needed

Ask for the creator's full name and the work email they use with colleagues: never read them
from git config or GitHub (a machine's git identity is often a noreply or personal address
that would then sign every note). Confirm the company name, what it sells and to whom,
teammates if any, and the tools in use. Ask about the CRM by name, not "which tools?": the
course gives every participant HubSpot, so propose HubSpot and let them correct it ("Attio"
is the other one to expect; anything else is fine too), then mail, calendar and meeting
notes. Tell them, in one plain line, that GTM OS keeps a dashboard open with what needs them,
the contexts and the open questions. It opens inside Codex and needs no login. Do not ask
where it should open; there is no dashboard browser setting.

Explain the starting contexts together without requiring a separate rule interview for each:

- Our company (`company`): our organization's identity, mission, team, internal ways of working and onboarding.
- #strategy: priorities, growth motions, revenue goals and the plan.
- #market: trends, competitors, alternatives and research.
- Target customers (`icp`): target segments, customer needs, buying roles and evidence of fit.
- Our offer (`offer`): our products and services, positioning, packaging, pricing, proof and voice.
- #personal-<handle>: the identified person's role, language and working preferences.

Follow [starting contexts](contexts.md) when explaining the set or deciding where a finding belongs.
Our company describes the business that owns this brain. External company names are linked
to memories in the relevant context; they are not automatic contexts.

Use the default standing rules unless the person supplies a specific rule. Unknown business
facts stay unknown; creating a context does not invent its contents. #pipeline, #marketing,
customer and initiative contexts require an explicit creation request or a confirmed proposal
for sustained work with useful separation. Ordinary customer records do not create contexts. There is no
#how-we-work default. Personal scope is not privacy isolation within a shared repository.

## Create

Call `setup_brain` with `folder`, `company`, `one_liner`, `owner` (Full Name <email>),
optional `team`, `tools`, and `language`. Summaries update by themselves in the background, so say that in one line, never as a question. Optional rule overrides are `company_rule`, `strategy`,
`market`, `icp` and `offer`. Setup always creates the creator's personal context, even if
language has not yet been chosen. Only the identified person's explicit or saved language is
stored. Other teammates select their preferences when they join.

Use the MCP operation, not direct file edits. It writes and saves the initial brain.
If `setup_brain` still advertises pipeline/marketing/gtm defaults, the running plugin is stale:
refresh the plugin from the intended source and start a new chat before creating a brain.
Do not silently accept the old set or create duplicate brains.

## Connect and report

Use `check_tools` and the `gtm-os-configure` workflow. A declared tool is not a connected
tool; offer useful connections together and verify selected connections before claiming access.

Offer optional Chrome setup for website work after the connector choices. Explain that the
embedded browser has a separate login session, while connected Chrome can reuse their existing
website logins. Ask one `onboarding_question`: "Set up your logged-in Chrome for website work?"
with "Set up Chrome" (recommended) and "Skip for now". Reuse a submitted choice; if Chrome is
already connected, skip setup. This choice is personal to this machine, never a shared admin
setting or blanket browser authorization. On yes, follow
[Chrome session access](../../gtm-os-configure/references/chrome-session.md), let the person
handle native permissions, and propose one specific approved read test for a named service.
If declined or unavailable, continue onboarding with MCP; do not switch to the embedded
browser for login reuse. Preserve this choice in onboarding continuation if a new task is
needed, but verify the current host connection before claiming Chrome is available.

Confirm the company and six starting contexts in a short plain-language summary. Do not show
file diffs, file trees or commit hashes. Setup has saved the pending onboarding flag. Continue directly into `gtm-os-start` discovery using the supplied answers; do not end with a generic question about what they want to work on. Follow [continuation](continuation.md) if a new chat is required.

Plugin installation refreshes the software. It does not rename or remove an existing brain's
contexts. Existing brains require a separate, non-destructive context reorganization.
