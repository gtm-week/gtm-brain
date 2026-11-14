---
name: gtm-brain-design-system
description: |
  Build or maintain the company's web design system from its existing brand, with Brian
  Woloszczak and Peakout's starter: one shared website project with tokens, components and a
  local catalogue, and design-system.md pointing to it.
  Triggers: "/gtm-brain-design-system", "/build-design-system", "build our design system",
  "extract our brand from the website", "set up our website design system".
  Not a design-system.md draft only (gtm-brain-use-brain, references/documents.md), a single
  section (gtm-brain-add-section), a campaign page (gtm-brain-build-landing-page) or
  publishing (gtm-brain-publish-website).
metadata:
  author: Brian Woloszczak, Peakout
allowed-tools: [Bash, Read]
---

# GTM Brain: Build our design system

By Brian Woloszczak and Peakout. Read [the method](references/method.md) once and follow it:
it says where Brian's procedure lives and what it never skips. This workflow supplies the
company context and the project around it. Conduct the conversation and author brain records
in English. Preserve names, source quotes and the exact token `APPROVE`.

## 1. Reuse what the brain knows

Reuse the session's resolved person, company and offering. Use `query` (status) only if this
state is missing. Follow [the shared website project flow](references/project.md): reuse the
company's linked website, or on first use create it with `link_project` (`create: true`,
`starter: "web-design-system"`) after the capture consent it describes. Continue in this
chat; opening another chat is optional.

Read the documents the work must follow with `document` (`action: list`, then `action: show`):
`design-system.md` first, then voice and strategy where copy is involved. Reuse the known
website, logo and licensed font files (the `design-system/` folder beside `design-system.md`).
Say which documents you followed.

## 2. Run Brian's procedure in the project

From the project folder, read `docs/workflows/build-design-system/SKILL.md` in full and follow
it, including its three review checkpoints. Install dependencies and start the local preview
as [the project flow](references/project.md#dependencies-and-local-preview) says. Do not load a
newer upstream copy or substitute a summary.

## 3. Ask, one question at a time

Follow [question handling](../gtm-brain-start/references/questions.md). Brian's procedure
supplies the missing-source questions; ask only what the brain and the person have not
already answered. When a source-derived value conflicts with an approved asset, show the
conflict before changing it. No default, timeout or empty result is an answer.

## 4. Keep the result

The design system lives in the project: tokens, components, `docs/design.md`, the
`/design-system` catalogue. The brain keeps one pointer to it in `design-system.md`, as
[the project flow](references/project.md#company-context-and-one-design-document) says; never a
second design document or a copy of the token tables.

Never claim a failed write or an unverified preview succeeded. Finish in one to three
sentences: the local catalogue URL, the verification results, unresolved substitutions, and
the next step ([add a section](../gtm-brain-add-section/SKILL.md) or
[build a landing page](../gtm-brain-build-landing-page/SKILL.md)).

## Boundaries

Never pushes, creates a hosted preview or deploys: that is
[Publish the website](../gtm-brain-publish-website/SKILL.md), on its own request. Never
replaces a company's project with a fresh starter, never edits Brian's procedures in the
project, never marks a design document approved without the person's review. Never invent
brand values; mark what is missing.
