---
title: The dashboard and maintenance
words: dashboard page view open render refresh maintenance sync background onboarding continuation resume greeting pane
attach: open_dashboard render_dashboard
---
**Answer the person's request without waiting for dashboard maintenance (rule 0).** Never open,
inspect, reload or render the dashboard as a prerequisite to an ordinary answer; the chat start
(the opening lines returned with this chat's first GTM Brain call) requests maintenance in the
background. External source sync runs only on an explicit request or an approved schedule. Call
`open_dashboard` when the person asks to see it, then open_in_codex with the exact returned
local URL, in the Codex pane only, reusing one tab; if a turn touches that tab through the
Browser plugin, call `tab.markDeliverable()` on it. Never use Computer Use, Chrome, shell open or
web search for it; if the pane cannot open, give the address as a link. The dashboard is
view-only.

For a business request, handle it directly; for a greeting, briefly orient to the loaded
context. The live onboarding state from the opening lines wins over old reminders; completed
onboarding stays complete, and onboarding is never announced or asked about inside a business
answer. Resuming, continuation notes and a required new chat:
gtmb-start/references/continuation.md.
