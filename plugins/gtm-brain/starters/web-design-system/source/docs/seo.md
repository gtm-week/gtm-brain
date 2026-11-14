# SEO — the fundamentals

What every page owes search engines and AI assistants, and where the code does it. The
fundamentals only: most of it is already handled by `Seo.astro`; the rest is what a person
(or an agent) decides when adding a page.

## 1. Project values

All in `site.config.mjs`:

| Value | What | Default |
|---|---|---|
| `SITE_URL` | the production address, no trailing slash | env `SITE_URL`, else Vercel's production URL, else localhost |
| `SITE_NAME` | the brand, added to every title as ` \| {SITE_NAME}` | "Site name" |
| `SITE_LANG` | `<html lang>` | `en` |
| `NOINDEX` | `true` hides the whole site from search | `false` |

## 2. Every indexable page

- **Title:** unique, **≤ 60 characters** including the ` | Brand` suffix (`Seo.astro` adds
  it; never type it). The topic first, written the way a person would search.
- **Description:** unique, **≤ 165 characters**. One sentence that answers "why click
  this?". It does not repeat the title.
- **Headings:** exactly **one H1**; H2 to H6 without skipping a level. The tag is the
  outline, the class is the size (`<h2 class="heading-h3">` is fine).
- **Canonical:** absolute and self-referencing, **no trailing slash** (`/pricing`; the home
  page is `/`). Built by `Seo.astro` from `SITE_URL`.
- **Share card:** `og:*` and `twitter:*` tags with a 1200×630 image. Default
  `public/og.png`; a page with its own hero can pass `image`.
- **Language:** `<html lang>` from `SITE_LANG`.

Pass them through the layout: `<Base title="…" description="…">`.

## 3. Images

- Every image has `alt`: what it shows, or `alt=""` when it is decoration.
- Width and height are set, so the page does not jump while loading (`<Image>` from
  `astro:assets` does both and serves WebP).
- Images live in `src/assets/`, not `public/`, so they are optimised.

## 4. Sitemap and robots.txt

- `@astrojs/sitemap` writes `/sitemap-index.xml` on every build. Nothing to maintain.
- `robots.txt` is built from `SITE_URL` (`src/pages/robots.txt.ts`): every crawler may read
  everything, AI crawlers named and allowed, plus the `Sitemap:` line.
- To keep a page out of search, use `noindex` (below), never `Disallow`: a crawler that is
  blocked never sees the noindex.

## 5. Structured data

- **Organization** and **WebSite** JSON-LD are on every page (`Seo.astro`).
- A page with an FAQ adds **FAQPage**, with the same questions the page shows:

  ```astro
  <Base title="…" description="…" jsonLd={[{
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question", name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  }]}>
  ```

## 6. noindex

One flag per page, `noindex` on `Base`, drives two things together: the
`<meta name="robots" content="noindex, nofollow">` tag and leaving the page out of the
sitemap (`astro.config.mjs` reads the built page). Already on `/404` and every
`/design-system` page. `NOINDEX = true` in `site.config.mjs` does it for the whole site:
use it for a demo, a test, or a page only people with the link should see.

## 7. What a new page owes

1. A title and a description (section 2), written for this page, not copied.
2. Exactly one H1.
3. At least one internal link to it or from it, so it is not an orphan.
4. A share card of its own if it has its own hero; otherwise the default is fine.
5. FAQPage JSON-LD if it shows an FAQ.

Later, these rules can be checked automatically on every build: one H1, title length, a
description present. Until then, this list is the check.
