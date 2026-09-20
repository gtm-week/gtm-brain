# Keep onboarding moving

Setup or an explicit request is the start of onboarding. These continuation instructions
apply only while the live state says `required: true` for this person's pending request.
After every saved outcome, move straight to the next
unfinished step in discovery. Narrate the next useful action in one sentence, then do it
or ask its one necessary question. Do not finish a turn with "let me know when to continue",
"anything else?", or an offer to do an already accepted next step. Finish only at completion,
an explicit stop, a required human action, or an unavailable capability that blocks progress.
Keep native questions pending according to questions.md; never end a turn with an async form open.

## Resume from evidence

`setup_brain` saves `Onboarding: pending v2 ...` in the initial commit. The hook,
`check_environment` and `query` (status) expose the same memory-derived flag, outcomes and
next step. Use these even when a new chat has none of the previous conversation.
Use the returned `context` when superseding `marker_id`. An older marker can still live in
`gtm` after `company` was added; corrections must stay in the original memory's context.

For a pending workflow started by the current person, a greeting or "I'm back"
is enough: say "Your profile is saved. Next I'll check the tools you chose"
and proceed. Do not ask whether to continue. Reuse their language, identity, submitted
choices and explicit skips. Never repeat setup, overwrite a pending proposal, or treat
an offered automation or an untested connector as completed work. If all six outcomes
exist but the marker is pending, the live state recognizes completion from the outcomes.
Finish the closing bookkeeping in this onboarding chat without another question or restart;
a later ordinary chat does not reopen it. Version 1 had five outcomes and does not need the
newer project step. Before any optional closing offer, read the saved import outcome; never
re-offer a handoff that was already imported or declined.

A business request or a general status question takes priority. Answer it without an
onboarding question or resuming onboarding afterward. A linked project, unattended run or
different teammate must not launch or offer company onboarding.
Completed and dismissed workflows stay closed across software updates. A missing marker
in an existing brain supplies no request to start onboarding. Do not offer newer steps as
onboarding. The live state overrides stale reminders in summaries and previous chats.
Use that state internally. Do not announce that onboarding is completed, missing or inactive
in an ordinary greeting or business answer; discuss it only when the person asks about it.
Only an explicit new request writes pending again, superseding the current closing marker.
Incomplete markers from an older workflow also stay inactive until the person explicitly
asks to resume. Preserve their outcomes; record a current pending marker superseding the
old marker, then read the next step. Do not quietly convert old pending markers on update.

If the person says "I already finished onboarding", accept it. Use `remember` to record
`Onboarding: completed v2 on YYYY-MM-DD.`, citing their statement and superseding `marker_id`
when present, then continue their work. Do not ask which steps they finished, require six
outcome records, reconnect tools or demand a second confirmation to fix the flag. This
records their onboarding status; it does not claim that an untested tool works.

Skipping one question or one optional connection does not dismiss onboarding. Record the
explicit skip in that step's outcome and proceed. "Stop onboarding" or "skip onboarding
for now" dismisses the whole workflow. An unanswered or cancelled form supplies no choice;
do not record a skip or completion on its behalf.

## Before a required new chat

Stay in this chat while the needed tools work. Installing a connection alone is not proof
that a restart is needed. Test the available tool first. If the refreshed GTM OS connector
needs activation, follow the update workflow's verified restart requirement.

1. Save accepted choices immediately with `remember` in the onboarding context (`company`,
   or `gtm` in an older brain). Before updating or leaving the chat, save a note exactly
   `Onboarding continuation v2 step N: <accepted choices; what is done; why blocked; the next action>.`
   Use the next step number from the tool. Supersede its previous continuation note when
   updating it. Keep the pending marker until the workflow actually finishes. A checkpoint
   is progress evidence, never permission, credentials or a replacement for APPROVE.
2. Confirm the save succeeded. Then give one sentence saying what is saved and what happens
   next, followed by at most two numbered actions. For a verified restart:
   - "Quit Codex completely, then reopen it."
   - "Open [Resume setup](the prepared resume link), then press Send."
   For a new-chat-only handoff, omit the restart action. The link must use
   `codex://threads/new?path=<encoded absolute folder>&prompt=<encoded prompt>`.
   `query` (status) supplies the prepared link for pending onboarding. The person opens it;
   never open another thread yourself. Do not require typing "continue onboarding".
3. Give manual fallback steps only if the link fails: select the named project, open a new
   chat, then send the supplied short prompt. Explain only that next action, not a second
   full checklist. Do not promise work happens before the person presses Send.

Before a brain exists, or if the old connector is already unavailable, a save may be
impossible. Say so accurately. Put the minimum confirmed answers and next action in a
prepared prompt for the same folder, for the person to review and send; omit credentials
and sensitive source content. Do not claim a durable flag exists before successful setup.
Never ask for already supplied answers merely because tools need a new chat.

## After a new chat opens

Read the saved progress through `check_environment` or `query` (status), inspect the relevant
memories or existing proposal if needed, and act on the next step. Verify a previously
blocked connection once. If it still fails, describe the actual blocker and offer a useful
alternative or explicit skip; do not send the person through another identical restart.
If setup was already accepted in the prepared prompt and the folder is empty, start it.
