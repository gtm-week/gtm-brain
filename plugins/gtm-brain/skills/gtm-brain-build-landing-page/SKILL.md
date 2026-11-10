---
name: gtm-brain-build-landing-page
description: |
  Build a campaign, event or offer page on the company's shared website from the brain's
  strategy, ICP, voice and offer, with Brian Woloszczak and Peakout's procedure. Ends at a
  local preview.
  Triggers: "/gtm-brain-build-landing-page", "/build-landing-page", "build a landing page",
  "make a page for our event", "campaign page for".
  Not a single reusable section (gtm-brain-add-section) or publishing (gtm-brain-publish-website).
metadata:
  author: Brian Woloszczak, Peakout
allowed-tools: [Bash, Read]
---

# GTM Brain: Build a landing page

By Brian Woloszczak and Peakout. Read [the method](references/method.md) once and follow it.
Conduct the conversation and author brain records in English. Preserve names, source quotes
and the exact token `APPROVE`.

## 1. Reuse what the brain knows

Reuse the session's resolved person, company and offering. Follow
[context routing](../gtm-brain-use-brain/references/context-routing.md): load the context the
campaign belongs to (`load_context`, `mode: add`). Resolve the shared website through
[the project flow](../gtm-brain-design-system/references/project.md). A new campaign is a page
there, never a new starter or a copied component library.

Read `strategy.md`, `icp.md`, `voice.md` and `design-system.md` with `document`
(`action: list`, then `action: show`), and the relevant notes with `query`. A `[not filled]`
document holds no guidance: say so. Form the brief around audience, campaign, offer, call to
action, route and approved copy. Reuse a brief the person already gave exactly. The lesson's
Ramp offer in the starter is an example, never company evidence.

## 2. Run Brian's procedure in the project

From the project folder, read `docs/workflows/build-landing-page/SKILL.md` in full and follow
its section mapping, brief review, composition, SEO and verification. When a section is
missing, run [Add section](../gtm-brain-add-section/SKILL.md) before using it.

## 3. Ask, one question at a time

Follow [question handling](../gtm-brain-start/references/questions.md). Ask only for missing
decisions. Mark missing claims, quotes and content in the page; never fill them in.

## 4. Keep the result

The page lives in the project. A campaign decision the person states (the offer, the date, the
audience) goes into the loaded context through the
[remember procedure](../gtm-brain-use-brain/references/remember.md), with their exact words.

Finish in one to three sentences: the local page URL, the checks at 375, 768 and 1440, and
unresolved placeholders or unconnected forms. When shared sections changed, say which existing
pages you rechecked.

## Boundaries

Stops at the local preview, even where Brian's procedure offers a pushed preview for a live
site. Publishing is [Publish the website](../gtm-brain-publish-website/SKILL.md), on its own
request. Never invents customer claims, quotes, logos or results.
