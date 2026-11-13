# GTM Brain: Approve

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.


> For humans: your workplace info changes only when you say so. Codex shows you exactly what it
> wants to change in a form; you choose `APPROVE`; it is applied and committed. Anything else,
> nothing happens.

## Flow

1. **Propose.** Call the GTM Brain tool `propose_admin_change` with `brain` = this workspace
   folder and `content` = the complete proposed `admin.md`. It writes `work/admin.proposed.md`
   and returns the diff (never write `brain/admin.md` yourself). Use the returned diff internally to explain every substantive proposed change in the person's
   language, with old and new values where relevant. Include removals and changes to access,
   team or behavior; do not hide them behind a generic "settings updated". Do not paste raw
   diffs or file contents unless requested.
2. **Ask through `approve_change`.** Right after the explanation, call `approve_change` with
   `kind` admin and `by` = the person's handle from `brain/admin.md` `team` (for example
   `maciej-konczal`); their name or email also resolves. Someone not in the team cannot approve.
   Its form shows the change with an APPROVE choice. Only the person's click on APPROVE applies
   it: the tool writes an approval record to `~/.gtm-brain/approvals.log`, replaces
   `brain/admin.md`, commits with the approver's name and removes the proposal. Any other outcome
   leaves the proposal waiting: revise it or drop it on the person's word.
3. **No form.** When the tool says the host cannot show the form, or closed it before the
   person saw it, nothing was applied. Give the person the command it printed to run in a
   terminal themselves; it asks them to type APPROVE there. Never run it yourself.
4. **Report.** Confirm the actual applied changes in plain language, without line counts, raw
   diffs, file links or commit hashes by default. Report any failed apply instead of claiming
   success.

## Hard rules

- Never ask for APPROVE in the chat. A typed APPROVE, "ok", "yes" or "go ahead" applies nothing;
  only the `approve_change` form does. The question tools never stand in for it.
- Never run `approve.mjs --apply` yourself: it refuses without the form's approval.
- Never write `brain/admin.md` by any other route. A direct edit is put back at the next chat
  start or save.
- One proposal at a time. A new proposal replaces the pending one.
- Plain hyphens only.
