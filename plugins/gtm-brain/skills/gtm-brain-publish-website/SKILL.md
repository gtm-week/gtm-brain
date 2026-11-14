---
name: gtm-brain-publish-website
description: |
  Publish the company's shared website on Vercel when explicitly asked: a hosted preview
  first, production only on its own decision, with Brian Woloszczak and Peakout's deploy
  procedure. Reads and acts through the Vercel and GitHub connectors.
  Triggers: "/gtm-brain-publish-website", "/deploy-vercel", "publish the website",
  "prepare a hosted preview", "release the landing page", "why did the Vercel deploy fail".
  Not building pages or sections (gtm-brain-build-landing-page, gtm-brain-add-section).
metadata:
  author: Brian Woloszczak, Peakout
allowed-tools: [Bash, Read]
---

# GTM Brain: Publish the website

By Brian Woloszczak and Peakout. Read [the method](references/method.md) once and follow it.
Publishing is its own request: a request to build a page or the design system never invokes
it. Conduct the conversation and author brain records in English. Preserve names, source
quotes and the exact token `APPROVE`.

## 1. Reuse what the brain knows

Reuse the session's resolved person and company. Resolve the shared website through
[the project flow](../gtm-brain-design-system/references/project.md). Inspect its branch,
remote, Vercel project and latest local verification. Reuse the existing remote and
deployment target, and any publishing choice already given (domain, access, indexing). Say
which routes and shared components the release affects: this publishes the shared site, not
one campaign folder.

## 2. Read and act through the connected tools

From the project folder, read `docs/workflows/deploy-vercel/SKILL.md` in full and follow its
static Astro deployment, `SITE_URL` configuration, release checks and branch review rules.

Use the Vercel and GitHub MCP connectors for what they support, never their websites. An
empty result is a result: say so. On an error, report the exact error and stop; connecting a
tool is [gtm-brain-configure](../gtm-brain-configure/SKILL.md)'s job. Supported CLI steps run
through the shell with its normal permissions. Computer Use follows the brain's approval rule.

Preview before production, the first release included. Brian's initial import-and-Deploy and
a push to a branch already connected to production are production actions: defer them. For
first setup, create or link the Vercel project without production auto-deploy, then use the
connector's preview target or `npx vercel deploy --environment=preview`
([CLI environment option](https://vercel.com/docs/cli/deploy#environment)). If the available
operation cannot separate preview from production, say so before taking it.

Check the real URL as the procedure says: rendering, fonts, phone layout, metadata, canonical,
sitemap, intended indexing and the page's interactions. For a private preview, check that a
signed-out request cannot reach the page and the review path works; if either check is not
possible, report access as unverified. Never turn protection off to make checking easier.

## 3. Ask, one question at a time

Follow [question handling](../gtm-brain-start/references/questions.md). Before creating a
remote resource or changing its settings, settle the missing account, repository name and
visibility, domain, indexing and preview access. Private previews stay private; `noindex` is
a search instruction, not access protection. The lesson's public repository and protection
changes are not company defaults.

An approved preview plus a request for production authorises that release; do not ask again.
Otherwise ask for the production decision before a merge, promotion or production deploy.

## 4. Keep the result

The release lives in Vercel and the repository. Keep one note in the loaded context through
the [remember procedure](../gtm-brain-use-brain/references/remember.md): what was published,
where, with `sources` set to the URL the connector returned.

Verify the production URL afterwards; a successful build or preview is not a release. On
failure, name the failed stage and keep the working code. Finish in one to three sentences.

## Boundaries

Never deploys to production without that decision. Never replaces Brian's architecture or
dependencies to force a deploy. Never connects forms to a CRM here: that is separate work.
Keeps unresolved copy and unconnected forms visible in the review.
