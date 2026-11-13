# Onboarding questions


The question policy itself (one question pending, what counts as an answer) is in the brain's AGENTS.md and in the chat's opening lines: every chat already holds it. This file holds only how to ask. Read it once before the first question.

## How to ask

GTM Brain has no question forms of its own. Ask every question one of two ways:

- Codex's own question box, `request_user_input`, when this chat has it (the chat's opening
  lines say so; Plan mode always has it). Two or three options, recommended first. It adds the
  free-text answer itself, so never add Other or Something else. It has no checkboxes: offer the
  likely combinations as options.
- Otherwise plain chat text, and end the turn: the question, one line on why it matters, and
  numbered options, recommended first. The person answers with a number or in their own words.
  Where several can apply, say they can pick several numbers.

A yes/no always offers both answers. Free text (a name, a link) names what to type.
A question never saves preferences, configures tools or applies approvals.

## Apply throughout onboarding

| Moment | Default interaction |
| --- | --- |
| Inferred company | Yes, this is my company; Different company. Then a free-text question for the website. |
| Unknown website or identity | Structured free-text question, with one example in the prompt. |
| Company profile corrections | Offer concrete sections to revise when helpful. Applying the profile still requires the APPROVE form below. |
| Connections | One numbered list of the tools; the person picks several numbers at once. No second yes per tool. |
| Existing Codex projects | Ask which projects to follow, listing the actual project names. Selection consents to future capture; reuse it when linking. If the catalog is unavailable, ask for the folder, or offer Not yet / Skip for now. Stay in the onboarding chat. |
| Claude context import | Import context; Skip. Explain what will run before asking. |
| Snapshot | Looks right; Needs corrections. Then a free-text question for the corrections. |
| Automation | Show the actual proposed work and timing first; offer the named choices and Skip. |
| Schedule | Concrete cadence, time and timezone options based on the proposal, the last one Another time; then a free-text question. |
| Changing context rules | Use proposed rule; Customize. Show the actual rule before the choice. Setup uses the starting rules without a separate interview. |
| Changing dashboard opening | Every chat (Recommended); Only when asked. Setup explains the default without asking. |
| Chrome for website work during setup | Explain login reuse, then ask `Set up your logged-in Chrome for website work?`: Set up Chrome (Recommended); Skip for now. This is personal setup, not dashboard configuration or permission to read websites. |
| Resume onboarding | Continue onboarding; Skip for now. |

Choices do not replace security approvals. Native Codex command permission prompts and
account sign-in stay native. Workplace changes still require the person's `APPROVE`
in the `approve_change` form; "Looks right", "Yes", a typed APPROVE or a recommendation must
never stand in for it. Do not add a second confirmation
where the person has already authorized an ordinary setup or connection action.
