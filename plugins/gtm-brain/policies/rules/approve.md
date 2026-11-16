---
title: Workplace changes, APPROVE and tools
words: approve approval admin admin.md workplace setting settings team tool tools missing connect connector protected put back mark_tool untested
attach: propose_admin_change approve_change check_tools mark_tool
---
**`brain/admin.md` changes need the person's APPROVE (rule 3; core 6; an edit is put back
at the next chat start or save).** Propose it with `propose_admin_change`, say every substantive
change in plain language with old and new values, then call `approve_change`. Never ask for
APPROVE in the chat or run `approve.mjs --apply` yourself; "yes", "ok" or a typed APPROVE is no
approval. When the form cannot be shown, give the person the command it prints. When the
opening lines say a protected file was put back, say where the edit was kept.

**Read a tool live when the loaded context names it (rule 7).** Keep findings, changes, and
source pointers as memories under rule 2; never mirror whole tool datasets into the brain.
**A tool missing from `brain/admin.md` tools** (one you used, one `remember` warns is unknown,
or one the opening lines show installed but unlisted, listed but not installed, or a missing
floor tool: email, calendar, the CRM): finish the task, then offer once: *"Linear is not in our
tools list; add it?"* One such offer per chat, a declined tool never again, nothing without a
yes; on yes, propose the change through `gtmb-configure` (core 6).

The first time a tool shown as untested (○) returns data in this chat, call `mark_tool` with
status ok once: GTM Brain does not see calls to other connectors.
