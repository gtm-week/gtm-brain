---
name: gtm-brain-publish-website
description: Use when explicitly asked to publish the company website, prepare a hosted preview, release an approved landing page or diagnose its Vercel deployment; also /deploy-vercel or /gtm-brain-publish-website.
allowed-tools: [Bash, Read]
---

# GTM Brain: Publish the website

Publishing is a separate requested workflow. A request to build a page or design system
does not invoke it. Reuse an explicit publishing decision or approved preview already given.

1. Resolve the shared website through
   [the project flow](../gtm-brain-design-system/references/project.md). Inspect its branch,
   remote, current Vercel project, relevant company documents and latest local verification.
   Reuse the existing remote and deployment target. State which routes and shared components
   the release affects; this publishes the shared site, not an isolated campaign folder.
2. Read the project's `docs/workflows/deploy-vercel/SKILL.md` in full. Follow Brian's static
   Astro deployment method, SITE_URL configuration, release checks and branch review rules.
   Discover and use the Vercel and GitHub connectors for supported operations; the original
   procedure already supports Vercel MCP. Use supported CLI steps with native permissions
   where needed. Computer Use follows the brain's explicit approval policy.
3. Resolve missing account, repository name/visibility, domain, indexing and preview-access
   choices before creating remote resources or changing their settings. Reuse saved choices.
   Keep private previews private. `noindex` is a search instruction, not access protection.
   The lesson's public repository and protection changes are not company defaults.
4. Prepare a hosted preview and review it before production, including the first release.
   Brian's initial import-and-Deploy action and pushes to an already connected production
   branch are production actions: defer them. For first setup, create/link the Vercel
   project without enabling production auto-deploy, then use the connector's preview target
   or `npx vercel deploy --environment=preview` through the shell
   ([CLI environment option](https://vercel.com/docs/cli/deploy#environment)). If the available
   operation cannot separate preview from production, report that limit before taking it.
   Follow the retained procedure's checks against the actual URL: rendering, font delivery,
   phone layout, metadata, canonical, sitemap, intended indexing and relevant interactions.
   For a private preview, verify that an unauthenticated request cannot reach the page and
   that the authorised review path works. Report access as unverified if either check is
   unavailable; never disable protection to make verification easier.
   Keep unresolved copy and unconnected forms visible in the review; CRM/form integration
   is separately requested work.
5. An approved preview and a request for production authorise that release; do not ask again
   for the same decision. Otherwise obtain the production decision before a merge, promotion
   or production deploy. Verify the actual production URL afterwards and distinguish its
   state from a successful build or preview. On failure, report the failed stage and preserve
   the working code; do not replace Brian's architecture or dependencies to force a deploy.
