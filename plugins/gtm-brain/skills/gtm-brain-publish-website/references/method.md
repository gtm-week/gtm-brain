# Publish the website: the method

By Brian Woloszczak and Peakout. The full procedure ships unchanged inside the company's
website project at `docs/workflows/deploy-vercel/SKILL.md`. Read it there. This page names
what good looks like.

## 1. A static site, one target

The site is a static Astro build with `SITE_URL` set for the target domain. One Vercel project
serves the shared site; campaigns are routes in it.

## 2. Preview, review, then production

Every change goes to a hosted preview first and is reviewed on its real URL. Production is a
separate step taken on a decision, through the branch review rules.

## 3. Check the real URL

Rendering, font delivery, phone layout, metadata, canonical URL, sitemap, indexing and the
page's interactions, on the deployed URL, not the local build.

## Output

- The preview or production URL and which it is.
- The checks run and their results; access checked or unverified.
- What stays open: unresolved copy, unconnected forms, a failed stage.
