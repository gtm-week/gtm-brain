# Onboarding questions


The question policy itself (which tool asks what, one question pending, what counts as an answer) is in the brain's AGENTS.md and in the chat's opening lines: every chat already holds it. This file holds only what they do not: the tool parameters and their lifecycle. Read it once before the first question that uses a form.

## Tool parameters and lifecycle

`onboarding_question` works before a brain exists; `configuration_question` and `question`
take the same arguments and are the names to use after setup. Pass `question`, two or three
`options` in display order, and `multiple: true` only for independent selections.
Omit `options` only for free text, never for a yes/no. With `options`, leave `text_label` out unless
a note is needed: it becomes a second page. Translate it when used. An `options` array
on `request_user_input_async` accepts one choice per question, not multiple selections.
Never invent a `multiple` or `multi_select` parameter on another tool.

The question tool does not save preferences, configure tools or apply approvals. Its
24-hour call ceiling releases a lost session; it supplies no auto-resolution decision.
For async fallback, `{"accepted":true}` acknowledges creating the widget only. Wait with
an interruptible tool such as `clock.sleep` with `duration_ms: 30000`, then repeat if
no answer arrived. A submitted answer arrives as a new user message.

The inspected Desktop renderer collapses untouched async forms after 30 seconds. There
is no keep-open parameter. Turn completion separately clears pending requests, as
described in OpenAI's [app-server documentation](https://learn.chatgpt.com/docs/app-server#toolrequestuserinput).
Do not interpret panel collapse as an answer or a reason to repost.

## Apply throughout onboarding

| Moment | Default interaction |
| --- | --- |
| Inferred company | Yes, this is my company; Different company. Then a free-text question for the website. |
| Unknown website or identity | Structured free-text question, with one example in the prompt. |
| Company profile corrections | Offer concrete sections to revise when helpful. Applying the profile still requires the literal APPROVE flow below. |
| Connections | `onboarding_question` with `multiple: true`, or single-select combinations in chat. Submit once; no second yes per tool. |
| Existing Codex projects | Ask which projects to follow with native checkboxes and actual project names. Selection consents to future capture; reuse it when linking. If the catalog is unavailable, ask for the folder, or offer Not yet / Skip for now. Stay in the onboarding chat. |
| Claude context import | Import context; Skip. Explain what will run before asking. |
| Snapshot | Looks right; Needs corrections. Then a free-text question for the corrections. |
| Automation | Show the actual proposed work and timing first; offer the named choices and Skip. |
| Schedule | Concrete cadence, time and timezone options based on the proposal, the last one Another time; then a free-text question. |
| Changing context rules | Use proposed rule; Customize. Show the actual rule before the choice. Setup uses the starting rules without a separate interview. |
| Changing dashboard opening | Every chat (Recommended); Only when asked. Setup explains the default without asking. |
| Chrome for website work during setup | Explain login reuse, then ask `Set up your logged-in Chrome for website work?`: Set up Chrome (Recommended); Skip for now. This is personal setup, not dashboard configuration or permission to read websites. |
| Resume onboarding | Continue onboarding; Skip for now. |

Choices do not replace security approvals. Native Codex command permission prompts and
account sign-in stay native. Workplace changes still require the exact `APPROVE` token
in the person's own message plus the existing shell permission prompt; "Looks right",
"Yes", or a recommendation must never stand in for it. Do not add a second confirmation
where the person has already authorized an ordinary setup or connection action.
