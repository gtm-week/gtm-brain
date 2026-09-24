---
name: gtm-os-configure
description: |
  Change GTM OS workplace info, team, declared tools, dashboard-opening behavior or summary
  automation. Use for these settings requests and APPROVE after a workplace proposal.
  Plugin installation updates belong to gtm-os-update; connection tests to gtm-os-configure.
  Also "connect my tools", "is HubSpot connected", "connect" (tools and their read tests),
  "update GTM OS", "check for updates", "refresh the rules" (the plugin and the brain's rules),
  and "push this brain to my GitHub", "share the brain", "put the brain on GitHub".
allowed-tools: [Bash, Read, Write]
---

# GTM OS: Configure GTM OS

For interactive onboarding questions, read [onboarding questions](../gtm-os-start/references/questions.md) once.
Use structured choices by default and keep async questions alive until answered.

Route the requested change to the procedure below. Read only the one needed.

- **Workplace info or behavior:** read [workplace changes](references/approve.md). This
  covers company info, team, declared tools, `dashboard: always | on-demand`, and nothing else (summaries always update by
  themselves). Propose with `propose_admin_change`, summarize every substantive change in plain language, and preserve
  the literal APPROVE step and shell permission prompt before applying it.
- **APPROVE after a proposal:** read the same workplace-change procedure and apply only
  the pending proposal authorized in this conversation.

Write authored brain records in English. Never edit `brain/admin.md` directly. Connection setup follows `gtm-os-configure`; plugin updates follow `gtm-os-configure`.

## Connect my tools

For "connect my tools", "is HubSpot connected", "connect", "skip HubSpot": read
[connect tools](references/connect-tools.md).

## Update the plugin, refresh the rules

For "update GTM OS", "check for GTM OS updates", "upgrade the brain", "refresh the rules": read
[update plugin](references/update-plugin.md).

## Push this brain to my GitHub

For "push this brain to my GitHub", "share the brain", "put the brain on GitHub": one
`configuration_question` first, because this publishes the whole folder to a repository the
person owns: "Create a private repository <company>-brain on your GitHub and push this brain
there? From then on every note goes there too." with "Yes, create and push" first, "Use a
different name" second (then ask the name as free text), "No, keep it local" last. On a yes,
call `share_brain` (with `name` when they gave one) and repeat its one-line answer: the URL,
that it is private, and that teammates run `gh auth login` once, clone it and open the folder
in Codex. When the tool answers that gh is missing or signed out, pass its instruction on in
one line (`gh auth login`, then `gh auth setup-git`, in a terminal; the GitHub connector in
Codex does not sign git in) and stop; do not run those commands. A brain that already has a
remote is pushed, and the answer says where; no question needed for that.
