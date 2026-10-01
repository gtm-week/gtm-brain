# Schedule source sync during onboarding

This is the default recommendation in Running for you, not an optional example that can be
omitted in favor of call preparation. Read existing personal preferences, onboarding outcomes
and matching automations first. Reuse a submitted choice, including an explicit skip. Do not
restart completed onboarding solely to offer this feature.

Explain before the native question:

> The first snapshot gets older as email, deals and meeting notes change. Daily sync brings
> new evidence into the brain and refreshes its summaries, so answers rely less on stale
> assumptions. It can find evidence for open questions; anything the sources do not answer
> stays an open question. Refreshing the dashboard alone does not fetch new company data.

Propose a concrete daily time, normally 09:00 in the person's known local timezone, and name
only the connected, tested tools in scope. Reuse known timing. If timezone or source scope is
unknown, resolve it before creating the automation; do not infer the timezone.
Use `configuration_question` with these choices; ask a free-text follow-up only for another time:

- Daily sync at 09:00 (Recommended), with the actual proposed timezone and tools in the prompt.
- Sync manually for now.
- Summaries only, with the same proposed daily timing and no source reads.

When no sources are connected, explain the gap and offer Connect tools (Recommended) or
Sync manually for now. Do not claim source sync is configured when no source can be read.
Record a submitted manual choice as the step outcome and continue onboarding. No response,
a cancelled form or an elapsed timeout is not a skip or permission to create a schedule.

Once daily sync is submitted, carry it through now using the host's automation tool. Do not
merely give a prompt to paste or ask the same permission again. Use a standalone scheduled
job in the real local brain folder, because it maintains the company independently of this
onboarding conversation. Select the matching saved project when the host requires one.
Reuse an existing task only when company, confirmed person, folder and purpose match; update
its timing and prompt rather than creating a duplicate. Keep unrelated and compilation-only
jobs unchanged unless the person selected changing them. Inspect existing automations through
the host's supported interface. Native sign-in and security prompts remain native.

The saved prompt must name the absolute brain folder, company, confirmed handle, approved
source list and timezone. Use this body with those concrete values:

    Run scheduled GTM OS source sync in <brain folder> for <company>, as <handle>.
    Approved sources: <tools>. Follow gtm-os-sync in unattended mode, limiting reads to
    these sources and saved scopes. Reuse saved meeting policies and customer scopes.
    Do not expand access, ask questions, send messages, or write to external tools.
    Record sourced changes through GTM OS tools. Keep unanswered questions explicit.
    Preserve failed-source checkpoints and continue with available sources.
    Then follow gtm-os-sync's compilation steps and render the dashboard.
    Stay quiet if nothing actionable changed. Notify on meaningful changes, failed or
    incomplete refreshes, or required user action. Never claim a failed source was synced.

When Slack is connected and the person's saved Slack scope allows a scan, add these lines to
the same job by default, and name Slack in the confirmation. When the person wants the queue
more often than the sync (twice a day, every two hours on weekdays), make it its own job with
only these lines, and save that cadence in the same preference memory:

    Then list the Slack messages waiting on <handle>'s reply, following <slack-replies.md>
    with the saved scope and reply style. Read only: never send, react or mark read, and save
    nothing from the messages. Put the list first in the report; an empty list is one line.

`<slack-replies.md>` is the absolute path of `gtm-os-todo/references/slack-replies.md` in the
installed plugin.

Set the recurrence in the submitted timezone, and verify the returned task ID, active status,
timing and target. Only confirmed creation/update means scheduled. If the host cannot configure
it, persist the accepted choice and blocker as onboarding continuation; report pending setup,
not success. Resume that accepted choice without re-asking after the blocker is resolved.

Save a preference memory in the person's personal context with the source scope, cadence,
timezone, task ID, company and folder. Record the company onboarding outcome only after the
host confirms success, for example:

    Onboarding step 5 (Running for you): Daily source sync configured at 09:00 Europe/Warsaw
    for alex-example; sources Gmail and Attio; task <id>; company <name>; folder <path>.

For manual mode, record the explicit choice. For summaries only, follow the compilation-only
prompt in SKILL.md and label it that way. The closing reply reports the confirmed mode and
local timing, with /gtm-os-sync as the way to refresh immediately. Never claim a schedule has
already run; the first run's result is separate from successful configuration.
