# Capture conversations from source evidence

Use this procedure whenever a connected tool returns a new or changed meeting transcript,
recording or note, when a person describes a conversation, during onboarding backfill and
during sync. Meeting evidence is ordinary context memories, with existing entity identities.
Do not create meeting entities or contexts per meeting. General company observations can
remain ordinary memories without an invented conversation.

## Read and select

1. Read `query` (meetings) with the confirmed person's `by`. It returns existing anchors,
   capture decisions, submitted policies, source coverage/retry cursors and suggestions from
   installed, tested connectors. It never calls those connectors itself.
2. Use their submitted policy when available. For a directly requested capture, the request
   supplies the scope. For broader recurring ingestion, propose source/account scopes and
   relevant conversations through `configuration_question`; store the submitted choice using
   `remember.meeting_policy` in the person's existing `personal-<handle>` context. Setup's
   language preference establishes that context. Do not use a company-wide language or policy.
   Policy records need `sources: ["user:<handle>"]`. They do not install a scheduler or grant access.
3. Read actual new/updated source records, not just a notification or listing title. Resume
   incomplete scopes and records still processing. Page through the whole requested range;
   the ordinary 20-item activity limit does not apply. Calendar or CRM lookup is optional.
4. Capture customer, prospect and partner conversations and relevant internal work. Missing
   CRM membership, unknown people or a missing historical calendar never exclude a meeting.
   Personal material is skipped. A user's occurrence override precedes their series rule,
   which precedes source inference. Save uncertain relevance as `review`, with the reason;
   scheduled work leaves unresolved choices for the next interactive session.

## Save the observation, then the outcomes

Call `remember` with `kind: note`, a concise identifying account in `content`, the exact
connector-provided direct links in `sources`, and `meeting`:

- `title`; `reference: {kind, account, ref}` using a stable provider, connected account or
  workspace, and source record ID. Include calendar identity in account for calendar records.
  Never use the title as the ID. Direct source URLs remain in `sources`, even with opaque IDs.
- `evidence`: transcript, recording, notes, summary, recollection, calendar or pending.
- `occurrence`: happened, planned, unknown or cancelled. A substantive transcript, explicit
  recorder session or person's account can establish occurrence. A pre-meeting brief, empty
  note, scheduled recorder or invitation cannot. Calendar/pending evidence cannot be happened.
- `basis`: source or user. A recollection uses user and a user source. A direct user correction
  also uses user; do not disguise it as a provider refresh.
- `observed_at`: source observation/update time in ISO UTC with seconds; preserve it on retry.
  `occurred_at`: actual date at source precision (UTC timestamp, YYYY-MM-DD, or null if unknown).
  Non-happened records have null actual date. `scheduled_at` optionally holds the planned date.
  Do not substitute the source's creation time or memory recording time for the event date.
- `participants`: `{name, role}` entries, with role attended, invited or mentioned. A calendar
  response is not actual attendance. Anonymous speaker labels are not known identities.
  Include named organizations/products in `people` and companies in `companies` as usual.
- `capture`: complete, partial, pending or unavailable, for this artifact. A recording with
  content still processing may be happened/pending. No transcript is required for a useful note.
  A future agenda or scheduled recorder is planned, not processing: retain available agenda
  notes as complete/partial, or skip them. Never use pending/unavailable for a planned event
  just because its future transcript does not exist. Pending needs evidence of source processing.
- Optional `revision`: source revision/fingerprint; `series`: a stable provider/account/calendar/
  series reference only when actually known, for recurring capture preferences.

The first successful write returns the anchor's memory ID. Same source identity reuses that
anchor on refresh, and identical content does not append again. Read the returned ID through
`query` (meetings) if a revision write returned an observation ID rather than the original anchor.
For a different source about the same conversation, supply the known original `meeting_id`.
Require a shared source reference or confirmed match: similar titles/times, reused conference
links and overlapping attendees alone do not authorize merging. Hold uncertain matches.

Only after the anchor is saved, batch distinct findings, decisions, commitments and questions
through `remember`, each with `meeting_id`, evidence sources, and its fitting existing context.
Use ordinary kinds note/decision/question. Preserve speaker, owner and due-date uncertainty;
never turn a suggestion into a commitment. A bare meeting_id connects evidence across contexts
without copying the transcript. A transcript update adds or corrects changed findings; unchanged
outcomes are not re-extracted with new wording just to write them again. Correct outcomes in
their original context with supersedes. Source refresh never supersedes user corrections.

Save a per-person relevance decision separately using `meeting_capture` with by, scope
(meeting or series), target (original meeting_id or exact meeting.series), status
(include/skip/review), basis and reason. Explicit user decisions need a user source.
"Skip this one" does not authorize a series rule. One person's choice never withdraws another
teammate's evidence. Relevance decisions affect the view for the selected person, not global truth.

## Coverage, retries and source hooks

After checking kept, held and failed results, record `meeting_coverage` in a separate call.
Specify by, tool, account, exact searched scope/window, checked_at, status, scanned, captured,
skipped, unresolved, remaining and optional cursor. The three outcome counts sum to scanned.
Complete requires no unresolved records, remaining pages or cursor. A handled duplicate counts
as captured. A missing transcript may be captured as an explicit processing record; it remains
visible for retry independently of list enumeration. Never mark a held entry captured.

For example, after handling two records, send a separate `remember` call with the existing
destination context and confirmed author, using JSON values with their actual types:

```json
{
  "content": "Checked two work-note records: one conversation captured, one future agenda skipped.",
  "sources": ["granola:<exact returned source URL or scope ID>"],
  "meeting_coverage": {
    "by": "<confirmed handle>",
    "tool": "granola",
    "account": "<connected account>",
    "scope": "<actual searched date range>",
    "checked_at": "2026-09-13T10:00:00Z",
    "status": "complete",
    "scanned": 2,
    "captured": 1,
    "skipped": 1,
    "unresolved": 0,
    "remaining": false
  }
}
```

Replace every example value with the observed scope, current check time and returned counts.
`remaining` is a boolean, counts are numbers, and `sources` contains provider-prefixed strings,
not objects. The provider in a meeting's `reference.kind` must match its `sources` prefix.

These source-specific coverage memories preserve retry checkpoints across sessions. Read them
before each run, resume failed/pending work and preserve each source's last successful result.
A failed calendar refresh must not block recording notes or compiling available evidence.

Use source reads when the person works, bounded polling during sync, and provider event hooks
only where the actual connector/host supports them. A notification queues a fetch of the record;
it is not evidence of the conversation. Do not invent MCP notifications, install a webhook
listener, or run connector fetches from every Codex tool-use hook.

## Calendar enrichment and daily maintenance

Refresh selected calendars once per daily run, or on an explicit request. Inspect current
and upcoming events, preserving returned event links and recurrence references. Match older
calendar events only when useful to source evidence. The calendar does not gate backfill.
Use only fields and pagination the connector actually exposes. A missing event or read failure
does not establish cancellation. Rescheduling does not create a second occurrence when a stable
instance reference is available; consecutive recurring occurrences remain distinct.

Calendar-only records are planned references. Merely passing their end time never creates a
missing-transcript task or proves the meeting happened. Explicit cancellation never erases
independent evidence of an actual conversation. Don't copy excluded personal appointments.

The daily schedule can run this procedure, refresh calendar references, then compile and
render in one job. Compilation itself reads saved evidence. Refresh failures are reported
per source and do not prevent compilation. Ask no questions inside scheduled work.

Finish by reading `query` (meetings) again. Report conversations captured, meaningful findings,
source links and genuine processing or relevance gaps. A successful listing is not proof of
complete transcription coverage or company-wide meeting knowledge.
