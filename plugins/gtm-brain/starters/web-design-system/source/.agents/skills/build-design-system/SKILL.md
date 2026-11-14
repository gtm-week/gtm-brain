---
name: build-design-system
description: Lay a live website's brand over the GTM Week design-system starter — colours, type, radii, fonts, logo, then the components and their states, each compared with the site before the next layer builds on it. Use when asked to "build the design system from <url>", "/build-design-system", "make it look like our site", "extract our brand" or "fill the foundations".
---

# Build the design system from a website

This works on the **GTM Week design-system starter** (github.com/peakout/gtm-week-design-system)
or a repo made from it: Astro, Tailwind 4, tokens in `src/styles/global.css`, 22 components in
`src/components/ui/`, a `/design-system` site that renders them. If the repo has no
`src/styles/global.css` with `--site-*` primitives and `ink` / `surface` / `line` roles, stop and
point the person to the starter: this skill fills that skeleton, it does not build one.

**It swaps values; the structure stays.** It never renames a role, adds a component or a variant,
brings back a Tailwind default (`text-gray-500`, `rounded-3xl`, `sm:`), or writes an arbitrary value
(`h-[52px]`). Breakpoints stay `md` 768 and `lg` 1024. Two things may grow, each only through the
path below, in `global.css` and `docs/design.md` together, after the person agrees: the **accent**
roles for a second brand colour, and the **radius** set. Styles only: no sections, no images
(that is `add-section`). On a site that is already live, work on a branch (`AGENTS.md`, rule 8).

## 0. Ask once, three questions

In one message, each with its default, so "skip" works:

1. **The site:** the homepage URL plus one or two pages that show more (pricing with an FAQ, a
   page with a form). Default: the homepage alone.
2. **The logo as an SVG?** Default: the one in the site's header, if it is drawn inline.
3. **Licensed font files?** (woff2, if the brand's font is paid.) Default: the font itself if it
   is free, otherwise the closest free one, named as a stand-in.

Everything else is observed, not asked: colours, type, radii, dark bands, density.

## 1. Read the site

```bash
npx playwright install chromium                 # once
node scripts/extract.mjs https://site.com https://site.com/pricing    # every page from question 1
```

Each page gets `.design-extract/<page>/`: `extract.json` (computed styles at 1440, 768 and
375, every button look, bands, fonts and their files, the widths the CSS switches at, `:root`
custom properties), crops of each element in `1440/`, `768/`, `375/`, a full-page `page.png`,
and `logo.svg` if the header draws one. Then the **inventory** of the pages given (no crawling)
goes into the first page's `extract.json`, and its summary to the console: every colour, radius,
shadow, font size and weight with two marks, how often it is **seen** on the pages (as text,
fill, border or SVG, and where) and how often the stylesheets **define** it (`css`, with
`hover` for colours only a hover rule uses, which the page never shows). Seen often is the
palette; defined but never seen is usually a leftover (a framework's default scale). The header's and footer's links:
`node scripts/extract.mjs https://site.com --selector header` (and `footer`), then `copy.md`.
The script picks elements by heuristics: **look at the crops** and say when one is wrong (a
cookie banner's button, a link on a dark card); another page often has the better example.

**Read computed values, never a screenshot.** A colour is the hex the browser resolved, a size is
the px it measured. Then turn what was measured into roles:

- **Colours by job, not by hex.** The page, a muted band, a card; headings, body, captions; the
  main action; hairlines and field borders. Two greys doing different jobs are two roles; one grey
  used twice is one primitive. Two roles may point at one primitive when the site really uses one
  colour for both jobs (body copy and captions in the same grey): say so in `docs/design.md`.
  Map by job even when the order flips: if the site's field border is lighter than its hairline,
  `line-2` is lighter than `line`. `ink-brand` is text: when the brand colour fails as text on
  the page (a yellow), point it at `ink-1` and say so.
- **Primitives are opaque hex.** A colour with alpha (`#0c0a0899`) is blended onto the surface it
  sits on and stored opaque: the foundations page and the contrast check need real colours.
- **Type tiers:** the 375 values are the mobile tier, 768 is `md`, 1440 is `lg` (1024 and up).
  Read each tier from the page where that heading level is used for a section, not a one-off.
- **Breakpoints:** the site's own (992, 1280…) only tell you where its type and layout change;
  snap each change to `md` or `lg`.
- **Account for every colour in the inventory.** Each one seen more than a couple of times either
  maps to a role or goes on a list: the colour, where it was seen, and a proposal. A second brand
  colour (chart bars, tags, a highlight) → the accent roles. A one-off status colour (an orange
  "blocked" chip) → an existing role (`danger`), or left out as decoration. Show the list at the
  stop and record the decisions in `docs/design.md` §3.
- **Radii as the site uses them.** From the inventory's radii seen (and `radiiInCss` for what
  the pages read did not show): the values used often are the set.
  Keep the names where they fit (`sm` for the UI, `lg` for panels, `full` for pills); add one
  (`--radius-md`) or drop one when the site's set differs, and move every component's class with
  it (`grep -rn rounded-lg src/components`). A value seen once is noise.

## 2. Foundations, then stop

All in `src/styles/global.css`, keeping its shape (`src/components/design-system/tokens.ts`
parses it):

- **Primitives** in the first `:root`, six-digit hex: the `--site-neutral-*` ramp in the brand's
  greys (warm or cool as measured), `--site-brand`, `--site-white`, `--site-red`. Add a primitive
  only when a role needs a value none has (a dark band between two steps is `--site-neutral-850`).
  Steps the site does not show are derived between measured ones and listed as derived.
- **Roles** in `@theme static`: re-point each `--color-*` to a primitive, one `var(--site-…)` per
  line, comments kept. `surface-brand` is the main action's fill; `ink-on-brand` the text on it.
  There is no hover role: a button's hover stays an opacity of its own fill (`/80`), as close to
  the site's hover as it gets; name the site's real hover colour in `docs/design.md`.
- **Accent**, only if the site has a second colour and the person agrees: its steps become
  primitives named by hue (`--site-blue-500`, `--site-blue-200`), `ink-accent`,
  `ink-on-accent`, `surface-accent` and `surface-accent-subtle` point at them, and the starter's
  grey `--site-accent*` placeholders go. No second colour: the accent stays grey and unused. One
  accent family only; a third hue is mapped to an existing role or left out.
- **The dark band**, the `[data-tone="inverted"]` block: the same roles re-pointed for the site's
  dark bands (the footer, a numbers band).
- **Type:** `--font-sans` and `--font-heading`; the two weights (`--font-weight-normal`,
  `--font-weight-medium`) as measured (a site set in one weight gets the same number twice); heading sizes in rem in the second `:root` and its two
  `@media` blocks; line height and tracking in the `heading-h*` utilities; `text-*` and `tagline`.
- **Radii:** the set from the inventory, smallest first, each with its comment (what it is for);
  `/design-system/foundations/radius` draws whatever is there.
- **Fonts are files**, never a CDN: woff2 in `src/assets/fonts/` with its licence, an
  `@font-face` per file, and the preload in `src/layouts/Base.astro` pointed at the main file. A
  The starter ships Inter: if Inter is the font or the stand-in, keep its files and only say so. A
  free font comes from Fontsource (`https://cdn.jsdelivr.net/fontsource/fonts/<id>@latest/latin-wght-normal.woff2`,
  OFL). A paid one: the person's licensed files, or a free stand-in until then. Update the README's
  licence line.
- **Logo and icons:** the logo SVG to `src/assets/brand/logo.svg` with `fill="currentColor"`, so
  it takes the ink of wherever it sits (the extract writes the colour it was drawn in). A square
  mark to `src/assets/brand/icon.svg`: the logo's symbol on a tile in the brand colour, or the
  site's own SVG favicon; then `npm run icons`. `SITE_NAME` in `site.config.mjs`.

**Check contrast now** (WCAG AA: 4.5:1 for body text, 3:1 for large text), with the WCAG
relative-luminance formula in a few lines of `node -e`, never by eye: every text role on every
surface the site pairs it with, `ink-on-brand` on `surface-brand`, and the same on the dark band.
Write a short table; a failing pair the site really uses is said out loud, not hidden.

**Stop.** Start the site (`npm run dev`; use the port it prints, and `SHOTS_URL=http://localhost:<port>`
before `npm run shots` if it is not 4321), then
`npm run shots -- /design-system/foundations/colours /design-system/foundations/typography /design-system/foundations/radius`.
Show them beside the source crops (`.design-extract/<site>/1440/h1.png`, `buttonPrimary.png`…)
with the contrast table and the list of colours no role carries. The "Still neutral" badge on Colours must be gone. The person confirms or
corrects; a corrected value is changed in `global.css`, never patched in a component.

## 3. Basic components, then stop

Button, Link, Input, Textarea, Checkbox, Badge, Chip, Tagline, ArrowButton, IconTile. Set what is
brand-specific in `src/components/ui/<Name>.astro`, inside the existing class strings: heights and
padding on the spacing ladder (52px is `h-13`, half steps such as `h-8.5` are fine), which radius role, which weight, the hover
treatment. Every state stays: default, hover, focus (a border turning `line-brand`), disabled, and
error for fields.

Compare each with the site:

```bash
node scripts/extract.mjs http://localhost:4321/design-system/components/button --states --vs .design-extract/<site>
```

It prints the source's element above every state of ours (height, radius, font, ink, fill, border,
padding, opacity) and writes `compare.png` with the crops side by side; for Button it also lists
every button look on the source page, which is where sm, md and lg come from. `--vs` takes the
folder of whichever page has the best example. A component the site does not have (often the
checkbox) is derived from the others and marked **derived**.

**Stop.** Show the tables and the `compare.png` files. Fix what the person points at.

## 4. Composed components and the chrome, then stop

- **SectionHeader, Card, QuoteCard, FaqItem:** check each against one real block on the site
  (`node scripts/extract.mjs <url> --section "<a heading>"` gives its crops and styles): the card's
  border or fill, the quote's size, the FAQ's divider and icon.
- **Navbar and Footer:** the logo in place of the text name (`import Logo from
  "../../assets/brand/logo.svg"`, then `<Logo class="h-5 w-auto" />` inside the home link, which
  keeps `aria-label={SITE_NAME}`), the links in `src/data/navigation.ts` from the site's header and
  footer, and the footer's `tone` if the site's footer is dark. A page can still pass its own.

**Stop.** `npm run shots -- /design-system/components/card /design-system/chrome/navbar /design-system/chrome/footer`, beside the source.

## 5. Write the contract

Fill every `[fill: …]` line in `docs/design.md` with this brand (except the sections row in
§9: `add-section` replaces it with the first section it feeds)
(`/design-system/foundations/design-md` shows what is still a grey chip): the source (URL, pages read,
date, what was observed, what was derived, what was not checked), each role's meaning ("yellow,
only on the main action, one per view"), the contrast pairs, fonts and stand-ins, the type table
(it is the one place values are repeated: it must match the CSS), radii, and a Do / Don't list
observed on the site. A design change always goes into `global.css` and `docs/design.md` together.

## Done

`npm run build` passes; the foundations and component pages look like the site at 375, 768 and
1440; the report lists what was derived, what was not checked (hover states behind a login,
pages not read) and any contrast pair that fails.
