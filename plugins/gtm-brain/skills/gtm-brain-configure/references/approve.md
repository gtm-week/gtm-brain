# GTM Brain: Approve

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.


> For humans: your workplace info changes only when you say so. Codex shows you exactly what it
> wants to change; you type `APPROVE`; it is applied and committed. Anything else, nothing happens.

## Flow

1. **Propose.** Call the GTM Brain tool `propose_admin_change` with `brain` = this workspace
   folder and `content` = the complete proposed `admin.md`. It writes `work/admin.proposed.md`
   and returns the diff (never write `brain/admin.md` yourself). Use the returned diff internally to explain every substantive proposed change in the person's
   language, with old and new values where relevant. Include removals and changes to access,
   team or behavior; do not hide them behind a generic "settings updated". Do not paste raw
   diffs or file contents unless requested. Say: *"Type APPROVE to apply this, or tell me what to change."*
   Then stop.
2. **Wait.** Do nothing until the person's next message. Only the literal word `APPROVE`
   (alone, or as the first word) counts. "ok", "yes", "sure", "go ahead" do not; ask them to
   type APPROVE. Any other reply: revise the proposal or drop it.
3. **Apply.** Only after that message, and only as this shell command (there is no tool for
   it, on purpose: the permission prompt is the second factor):
   ```
   node "${PLUGIN_ROOT}/scripts/gtm-brain-approve/approve.mjs" . --apply --by <handle>
   ```
   `<handle>` is the person's handle from `brain/admin.md` `team` (for example
   `maciej-konczal`); their name or email also resolves. Someone not in the team cannot approve.
   The script first writes an approval record to `~/.gtm-brain/approvals.log`, outside the project.
   Inside the sandbox that is blocked and the script exits with code 3 without changing anything:
   **retry the same command with escalated permissions** so Codex asks the person to allow it.
   Never work around this (no copying the file another way). Once allowed, the script replaces
   `brain/admin.md`, commits with the approver's name, and removes the proposal. Confirm the actual applied changes in plain language, without line counts, raw diffs,
   file links or commit hashes by default. Report any failed apply instead of claiming success.

## Hard rules

- Never run `--apply` without the literal APPROVE in the person's own message in this
  conversation. Never infer it. Never type it yourself.
- Never write `brain/admin.md` by any other route. The hook denies it anyway.
- One proposal at a time. A new proposal replaces the pending one.
- Plain hyphens only.
