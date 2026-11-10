---
name: gtm-brain-design-system
description: Use when asked to build or maintain a company's web design system from its existing website, extract its brand, fill the design foundations, /build-design-system or /gtm-brain-design-system.
allowed-tools: [Bash, Read]
---

# GTM Brain: Build our design system

Use Brian Woloszczak and Peakout's starter and original procedure. This skill supplies the
company context and project setup around it. The company's existing brand is the starting point.

1. Follow [the shared website project flow](references/project.md). Reuse the company's
   linked website. On first use, obtain project-capture consent, then call `link_project`
   with `create: true`, `starter: "web-design-system"` and the proposed absolute path.
   Continue the requested work in this chat; opening another chat is optional.
2. Read applicable company design documents and approved assets. Reuse its known website,
   logo and licensed font files. Brian's procedure supplies the missing-source questions;
   ask only what saved context and the person have not already answered.
3. From the resolved project directory, read `docs/workflows/build-design-system/SKILL.md`
   in full. Follow it, including its three review checkpoints, observed/derived distinctions,
   token constraints, contrast checks and three viewport sizes. Do not substitute a summary
   of the method or load a newer upstream copy. Keep approved assets; if a source-derived
   transformation conflicts with an approved asset, show the conflict before changing it.
4. Complete or update the brain's project guide as described in the shared flow. It points
   to this implementation; its existence does not approve unfinished brand decisions.
5. Return the local catalogue URL, verification results and unresolved substitutions.
   Stop before pushing, hosted previews or deployment. Publishing is the separate
   [Publish website](../gtm-brain-publish-website/SKILL.md) workflow.

For a missing reusable section use [Add section](../gtm-brain-add-section/SKILL.md).
For a campaign use [Build landing page](../gtm-brain-build-landing-page/SKILL.md).
