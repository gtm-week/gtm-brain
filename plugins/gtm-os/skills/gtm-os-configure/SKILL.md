---
name: gtm-os-configure
description: |
  Change GTM OS workplace info, team, declared tools, dashboard-opening behavior or summary
  automation. Use for these settings requests and APPROVE after a workplace proposal.
  Plugin installation updates belong to gtm-os-update; connection tests to gtm-os-configure.
  Also "connect my tools", "is HubSpot connected", "connect" (tools and their read tests) and
  "update GTM OS", "check for updates", "refresh the rules" (the plugin and the brain's rules).
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
