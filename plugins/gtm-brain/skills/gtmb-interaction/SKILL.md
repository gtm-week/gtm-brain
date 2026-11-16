---
name: gtmb-interaction
description: |
  An action you repeat in your own tool, done and recorded the same way every time: propose one
  of this company's own interactions from the person's words, show it in the APPROVE form, list
  the ones the brain has, or run one. Triggers: "/gtmb-interaction", "propose an interaction for
  moving a deal in HubSpot", "make this an interaction", "our interactions", "what interactions
  do we have". Not a process with several steps (gtmb-workflow) and not a reusable piece of
  work in chat (gtmb-skill).
allowed-tools: [Bash, Read]
---

# GTM Brain: Interaction

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

> For humans: say what you keep doing by hand in a tool ("move the deal to Negotiation and note
> why"). Codex writes it down once; after your APPROVE it does it the same way each time and
> saves a note only when the tool confirms.

An interaction is one approved action in one tool. It lives in the brain's interactions file,
which is protected: nothing here edits it, and only the person's click in the `approve_change`
form adds one.

## Propose one

1. Call `list_objects` to see the interactions this brain already has. If one covers the
   request, say its name and offer to run it instead.
2. From the person's words settle the name, the tool, the operation in words, the inputs and
   what the note records (context, kind, content). Ask one question only for what is missing
   and matters, with two or three concrete choices.
3. Call `propose_interaction` with the interaction. A refusal names what to fix: fix it and
   call again; never work around it.
4. Call `approve_change` with kind `interaction`. Its form shows the person what will be added
   and carries the APPROVE choice. Typing APPROVE, "ok" or "yes" in chat changes nothing, and a
   closed form is no answer.
5. One line back: the interaction's name and how to run it ("move the Acme Retail deal to
   Negotiation").

## List or run one

- "our interactions": `list_objects`, then the names with one line each.
- To run one: `interact` with its name and inputs. The first call says what to do in the
  connector; do that through the tool's own connector, then call `interact` again with the
  outcome and the connector's refs. A failed write is saved as a failure, never as done.

## Hard rules

- One interaction is one action. Several steps with gates are a workflow: offer `/gtmb-workflow`.
- Never record a write the tool did not confirm, and never use the tool's website in place of
  its connector.
