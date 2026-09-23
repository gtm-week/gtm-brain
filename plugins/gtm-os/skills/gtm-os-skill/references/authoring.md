# Writing a skill body

The body is what another Codex chat reads after choosing the skill. Codex is already capable;
put in only what changes its decisions.

- Start from the steps that were actually run. Name the connector the way `check_tools`
  reports it (Attio, HubSpot, Gmail, Circle), the object it touches, and the fields that matter.
- State the outcome and the stopping condition, not a ceremony. Three to eight numbered steps
  is the usual size; a skill that needs more belongs in two skills.
- Record to the brain when the work produced a fact worth keeping: say "remember the outcome
  in the fitting context" rather than restating the remember procedure.
- A skill that produces a document says where it lands, in its last step. Decisions and
  findings are remembered in the fitting context; a standing document the work must follow
  (a strategy, a playbook, an ICP definition) is offered as a guideline through the `guideline`
  tool; a draft is written in the project folder the chat runs in. A body that only says
  "write strategy.md" leaves a loose file at the brain root that `save` never commits.
- Never restate the brain's rulebook, the question policy or the Computer Use policy: every
  chat already has them.
- Description: one English sentence, what it does and when it applies, at most 200 characters.
  It is what Codex lists in every chat, so it is the whole cost of the skill until it is used.
  A boundary belongs there only when a likely request would be misrouted without it.
- Frontmatter keys are only `name`, `description`, `metadata` (and `license`, `allowed-tools`
  when needed); the tool refuses anything else, as Codex would.
- Title in the person's language is fine; the id is derived from it, so short titles make
  short commands.
