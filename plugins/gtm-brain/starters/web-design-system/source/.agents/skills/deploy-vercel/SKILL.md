---
name: deploy-vercel
description: Put this static Astro site live on Vercel — GitHub repo, import at vercel.com/new with no settings, SITE_URL, then check the live page (loads, fonts, a phone width, title/description/OG, sitemap, noindex). Covers preview URLs per branch and the vercel CLI as a fallback. Use when asked to "deploy", "/deploy-vercel", "put it live", "publish on Vercel" or "why does the Vercel build fail".
---

# Deploy to Vercel

The site is **static Astro with no adapter**: `npm run build` writes plain files to `dist/`, and
Vercel serves them. Nothing to configure. Do not add `@astrojs/vercel`, and do not copy
`@astrojs/vercel/static` or `output: 'hybrid'` from Vercel's Astro docs page: both are outdated
and would break a static build.

**The free Hobby plan** is for non-commercial, personal use: trying this exercise is fine, a
company's real landing page needs Pro. On Hobby, a private repository owned by a GitHub
organization cannot be deployed (a public one, or one on a personal account, can), and the commit
author must be the Vercel account's owner. Preview URLs per branch work on Hobby too.

Creating a repository and pushing publish the code. Ask first: which GitHub account, the
repository's name, public or private.

## 1. GitHub

```bash
gh repo create <name> --private --source . --remote origin --push
```

Or create an empty repository on github.com/new and push to it. `.gitignore` already keeps
`dist/`, `node_modules/`, `.env`, `.shots/` and `.design-extract/` out.

## 2. Import at vercel.com/new

Pick the repository → Vercel detects **Astro** (build `npm run build`, output `dist`) → leave
every setting as it is → **Deploy**. The first build takes a minute; the site is at
`https://<project>.vercel.app`. The project name sets that address: rename it in the import
screen if the default is not the one you want.

## 3. SITE_URL, then push

The canonical, the share card URLs, the sitemap and `robots.txt` are built from `SITE_URL`
(`site.config.mjs`). Without it a Vercel build uses the project's production URL, so the first
deploy is already right; set it once the address is final, and again when a custom domain arrives:

Project → Settings → Environment Variables → `SITE_URL` = `https://<project>.vercel.app` (no
trailing slash), environment **Production**. Then push any commit to `main`: every push to `main`
deploys production.

## 4. Check the live site

```bash
URL=https://<project>.vercel.app
curl -sI $URL/ | head -1                                    # HTTP/2 200
curl -s $URL/ | grep -Eo '<title>[^<]*|name="description" content="[^"]*|property="og:(title|image|url)" content="[^"]*|rel="canonical" href="[^"]*|name="robots" content="[^"]*'
curl -sI $URL$(curl -s $URL/ | grep -Eo '/_astro/[^"]+\.woff2' | head -1) | head -1   # the font file: 200
curl -s $URL/sitemap-index.xml | head -5
curl -s $URL/robots.txt
SHOTS_URL=$URL npm run shots -- /                           # 375, 768, 1440 of the live page
```

- **Loads:** 200, and the shots look like localhost.
- **Fonts render:** the woff2 answers 200 from the site's own domain, and the shots use the
  brand's font, not a system fallback.
- **One phone width:** the 375 shot; nothing scrolls sideways.
- **Title, description, OG:** present, the canonical on the real domain, not `localhost`.
- **Sitemap:** `/sitemap-index.xml` lists the indexable pages and none marked `noindex`. With
  `NOINDEX = true` in `site.config.mjs` it lists nothing; that is right for a demo.
- **noindex where intended:** `<meta name="robots" content="noindex, nofollow">` on those pages
  (and on every page of a `NOINDEX` site), absent elsewhere.

## 5. Review on a preview link, then merge

From now on a change goes on a branch, never straight to `main` (`AGENTS.md`, rule 8). Every
pushed branch gets its own preview URL:

```bash
git switch -c <what-changes> && git push -u origin <what-changes>
```

- **Where the link is:** Vercel's comment on the branch's pull request, the project's dashboard
  (Deployments), or `npx vercel ls`.
- **Who can open it:** new projects ask for a Vercel login on previews. Ask, and propose by
  default, to switch that off (Settings → Deployment Protection → Vercel Authentication off), so
  the link opens for anyone it is sent to, a manager without a Vercel account included. Previews
  stay out of search either way, and a `NOINDEX` site is hidden anyway.
- **Merge** the branch to `main` only after the person approves the preview; that deploys
  production.

## A Vercel MCP server, if your agent has one

If a Vercel MCP server is connected, the agent can create the project and deploy through it
instead of the dashboard. Everything else stays the same: `SITE_URL`, the checks in step 4, and
previews per branch.

## The CLI, when the dashboard is not an option

```bash
npx vercel login
npx vercel link                                # creates or picks the project
npx vercel env add SITE_URL production
npx vercel --prod                              # builds and deploys production
```

## When the build fails

Read the build log from the top. `astro check` errors fail it on purpose (a wrong section prop):
run `npm run build` locally and fix the same error. A Node version error: Settings → Build →
Node.js Version 22 or newer (`engines` in `package.json` asks for 22.12+). A font or image 404
live but not locally: the path's letter case differs from the file's.
