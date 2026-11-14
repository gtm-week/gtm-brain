---
name: build-landing-page
description: Build a landing page from a brief using only the registered sections of this design system — map the brief to sections, name what is missing, compose the page between Navbar and Footer with the brief's copy as props, check it at 375, 768 and 1440, follow docs/seo.md including noindex. Use when asked to "build the landing page", "/build-landing-page", "make a page from this brief", or "compose a page from the sections".
---

# Build a landing page from a brief

A page is `src/pages/<slug>.astro` (a site that is only this page, as the brief's URL says:
`src/pages/index.astro`, replacing the starter's placeholder): `Base` (the head), `Navbar`, the sections in order inside
`<main>`, `Footer`. Every section comes from `src/sections/` and gets its copy as props. Read
`docs/design.md` and `docs/seo.md` first, and the registry, `src/sections/index.ts`: its examples
show what each section takes.

## 0. Live already?

`git remote -v` shows a remote and the repo has a Vercel project (`.vercel/`, or the person says
so; ask when unsure). If the site is live, build on a branch named after the page
(`git switch -c page/<slug>`), never on `main` (`AGENTS.md`, rule 8). Not live yet: `main`.

## 1. Map the brief, then stop

A table, one row per part of the brief:

| Brief | Section (variant) | Copy from |
|---|---|---|
| Hero: two-tone H1, email + CTA | `hero` | brief §"The page" 3 |
| Calculator | **missing** | brief §"Calculator" |

- A part no section can carry is **missing**. Say so and offer `add-section` for it (from a URL
  or from a description), one at a time. Never write one-off markup in the page instead.
- A prop the brief does not fill keeps the section's example only when that copy still fits the
  page; a link in an example that points at the source site's own path (`/mobile-app`) becomes the
  full URL on that site. Say which in the table's last column.
- A section that nearly fits is used as it is; changing a section changes every page that uses
  it, so that is a question, not a quiet edit.

Show the table. Build when the person agrees and nothing is missing.

## 2. Compose the page

```astro
---
import Base from "../layouts/Base.astro";
import Navbar from "../components/layout/Navbar.astro";
import Footer from "../components/layout/Footer.astro";
import Hero from "../sections/Hero.astro";
---
<Base title="…" description="…" noindex>
  <Navbar links={[…]} action={{ label: "…", href: "#offer" }} />
  <main>
    <Hero heading="…" muted="…" />
    …
  </main>
  <Footer statement="…" columns={[…]} />
</Base>
```

- **Copy comes from the brief, word for word.** Numbers, names, quotes and offers are never
  invented or "improved". Where the brief has nothing, a placeholder that looks like one:
  `[Customer quote]`, `[Logo]`. Images the brief does not supply stay the section's placeholder.
- **One H1:** the first section takes the page's heading; every other section starts at H2.
- **One main action per view** (`docs/design.md`); a button that leads to a form on the page links
  to its `id` (`#offer`).

## 3. SEO (`docs/seo.md`)

- `title` ≤ 60 characters with the ` | Site name` suffix (`Seo.astro` adds it unless the title
  already names the site; never type it),
  `description` ≤ 165, one sentence answering "why click".
- **noindex** when the brief says so: `noindex` on `Base` for this page, or `NOINDEX = true` in
  `site.config.mjs` when the whole site is a demo. Either drops the page from the sitemap too.
- An FAQ on the page adds FAQPage JSON-LD through `jsonLd`, with the same questions it shows.
- At least one internal link to or from the page.

## 4. Check it

```bash
npm run shots -- /<slug>
```

Look at all three widths (375, 768, 1440): nothing scrolls sideways (the script warns), sections
stack cleanly, every button and field is reachable on the phone. Then `npm run build`.

## 5. Preview, then merge (a live site)

Offer it as the default next step: "Push this branch for a preview link?" On yes, commit and
`git push -u origin page/<slug>`; Vercel builds it in a minute. Give the preview URL (the pull
request's Vercel comment, the project's dashboard, or `npx vercel ls`). Merge to `main` only when
the person approves what they saw there; the merge deploys production.

## Report

The URL (local, and the preview URL once pushed), the brief-to-section table, the shots, and
**every placeholder still on the page** with what it needs (a quote, a logo, a photo, a form tool
behind the email field).
