# GTM Brain: Schedule refresh and summary updates

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.


> For humans: the "dreaming" job. Once a night or once a week, Codex compiles every context that
> has new notes, rebuilds the dashboard, and saves. Monday morning the summaries are current.

## Daily source sync (recommended)

Follow [source sync setup](source-sync.md) during onboarding or when scheduling sync.
Create or update the accepted automation through the host tools, then verify it. The source
sync job follows gtm-brain-sync first, then the compilation steps below. This fetches new company
evidence; compilation-only jobs summarize what is already saved.

## If you are the scheduled run

If this task requests source sync, first follow gtm-brain-sync in unattended mode with the
confirmed person and approved sources in the task. Continue compilation after source failures.
Do not run meeting capture a second time after sync has already handled it.

Otherwise, if this task explicitly requests daily refresh and a submitted meeting policy exists, first
follow [meeting capture](../../gtm-brain-use-brain/references/meetings.md) for the confirmed person.
Capture new/updated source evidence, refresh selected calendar references, and record coverage
per source. No questions. Continue with the steps below even when a connector fails. A task
that only asks for compilation remains compilation-only.

For compilation, do exactly this:

1. Call the GTM Brain tool `compile_facts` with no `context`. For each context that is behind,
   read and follow the [compilation procedure](../../gtm-brain-use-brain/references/compile.md) with `by: schedule` (facts, then `compile_apply` with the `as_of`
   it returned). No questions; if the facts are thin, write a short summary rather than none.
2. Call `query` (memories by entity) without an entity. For every stale brief, follow the
   [entity compilation procedure](../../gtm-brain-use-brain/references/entity-compile.md), with the same by.
   Include entity briefs even when no context cover is behind.
3. Call `render_dashboard`. Each compilation kept its result already; there is nothing to save.
4. The compilation phase never remembers facts, edits identity metadata or workplace info, or creates contexts. Source capture happens only in the explicitly requested sync phase.

## When setting up a schedule with a person

Read [onboarding questions](../../gtm-brain-start/references/questions.md) once.
Use structured choices for cadence and timing only when they are still missing; include
exact times and the person's timezone. Keep async question turns alive while waiting.
A scheduled run never asks these questions; this applies only to interactive setup.

## Compilation-only maintenance in the Codex app

For a submitted summaries-only choice, configure this prompt through the host automation
tool in the local brain project:

```
Run the gtm-brain-sync skill as the scheduled run: compile every context and entity brief whose summary is behind with by: schedule, render the dashboard. Do nothing else.
```

Timing: weekly, Sunday 20:00, or nightly at 06:00. Run it **in the local project** (not a
background worktree), so it writes the real brain. The computer must be on and the app running
at that time; if it was not, the task runs when the app is next open, and the next chat start
kicks the background run for anything still waiting.

## Option B: a system scheduler (no app needed, laptop on)

[scheduled-run.sh](../../../../scripts/gtm-brain-schedule/scheduled-run.sh) runs the same thing through `codex exec`:

```
bash "${PLUGIN_ROOT}/scripts/gtm-brain-schedule/scheduled-run.sh" /path/to/brain
```

macOS `launchd` (weekly, Sunday 20:00): copy [launchd.plist.example](../../../../scripts/gtm-brain-schedule/launchd.plist.example) to
`~/Library/LaunchAgents/io.gtm-brain.compile.plist`, replace the two paths, then
`launchctl load ~/Library/LaunchAgents/io.gtm-brain.compile.plist`. Linux: a cron line
`0 20 * * 0 bash <plugin>/scripts/gtm-brain-schedule/scheduled-run.sh /path/to/brain`.

## Checking it ran

`git log --oneline | head` shows `scheduled: compile ...`; `work/hooks.log` has a
`scheduled-run` line; the dashboard's "Needs attention" is empty.

## Daily refresh and compilation in one job

After the person submits capture scopes and a daily timing, use this scheduled-task prompt:

```
Run GTM Brain daily maintenance for <confirmed handle>. Read meeting_overview and follow the
submitted meeting_policy and the use-brain meetings reference. Capture new/updated meeting
evidence, resume processing records, and refresh selected calendar references. Record
meeting_coverage separately per source after checking writes. Calendar failure does not block
capture or compilation. Then follow gtm-brain-sync's compilation steps and render. No questions.
```

For an existing system scheduler, the equivalent entry point is:

```sh
node <plugin>/scripts/gtm-brain-schedule/daily-run.mjs /path/to/brain <confirmed-handle>
```

The runner uses that host's existing Codex connector access and native permission settings.
It does not install a scheduler or connect accounts. Without a submitted policy it only
compiles saved evidence. Keep the existing scheduled-run.sh for compilation-only jobs.
