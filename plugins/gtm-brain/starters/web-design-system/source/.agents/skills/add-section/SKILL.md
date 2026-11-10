---
name: add-section
description: Feed the design system one section — rebuilt from a block on a live site (a URL and its heading) or new from a description — on the existing components, registered and shown on /design-system/sections at three widths. Use when asked to "add a section", "/add-section", "feed it this section", "take this block from our site", or to build a new block such as a calculator or an offer card.
---

# Add a section

A section is one `.astro` file in `src/sections/` with typed props, built only from the
components in `src/components/ui/` and the frame (`Section` + `Container`), registered in
`src/sections/index.ts`. Read `docs/design.md` first. Roles only (`AGENTS.md`). On a site that is
already live, work on a branch and review its preview before merging (`AGENTS.md`, rule 8).

Two ways in, one result.

## From a site: a URL and the section's heading

```bash
node scripts/extract.mjs https://site.com/page --section "The section's heading"
```

It writes `.design-extract/<page>/sections/<heading>/`: `section-1440.png`, `-768.png`,
`-375.png`, `copy.md` (every piece of text in DOM order, links and images in place),
`section.json` (the computed styles of what is inside, per width, gradients under
`background-image`) and `images/` (downloaded). **Look at the screenshots first.** Too little
came out: `--up 1` takes the parent. The heading is used twice on the page: `--nth 2`. The block
has no heading: `--selector "<css>"`. **The heading given is an h3** (the first line of `copy.md`
says `h3:`) inside a block with its own h2: it is one step of something bigger. Say so, and
take the block by its h2, so the section gets its real heading and every step.

A block pinned while the page scrolls (a scroll-driven animation) also gets
`section-<width>-step-1…4.png`: the steps it moves through. Rebuild it as a static layout that
shows every step's content, not as an animation and not frame by frame: the block's heading on
top (`SectionHeader`), then one column per step from `lg` (its visual above its heading and
text), stacked on a phone. The frames' own arrangement (a row of cards, a centred text, a lone
card) is the animation, not the layout.

Then rebuild it, never copy it: their markup and class names stay on their site.

- **What is text in their HTML becomes code.** Cards, amounts, bars, chips, a fake UI drawn in
  HTML: rebuilt with our components and roles, not pasted as a picture.
- **What the extract missed is still yours to take** from the same page: a logo drawn as a CSS
  `mask-image`, a `<canvas>` or a video (the extract saves a video's poster at best). Fetch the
  file from the site, or screenshot the element alone at 2×, into the section's folder, and say
  so in the report. Content that rotates (logos, a featured tile) is built static with its first
  set.
- **A link inside a sentence** stays part of that copy only when the sentence reads without it;
  a bare "See here" is dropped and listed in the report.
- **What is an image is an image.** Copy the ones the section needs from `images/` to
  `src/assets/sections/<name>/` with names that say what they show, import them, and show each
  through `Photo` at the ratio of its closed set (16/9, 3/2, 4/3, 1/1, 3/4) nearest the
  image's own (`natural` in `section.json`). `Photo` crops to fill: an image that must show whole
  (a product UI) gets room around it in the section, never a change to `Photo`. Keep the source's
  `alt` when it is right; when it is wrong, write what the image shows (alt describes, it is not
  copy) and list it in the report. An icon that came with the section stays in that folder.
- **Measure, don't guess:** sizes, gaps and radii come from `section.json`, snapped to our
  type tiers, the spacing ladder and the radius roles. A colour the system has no role for (a
  blue bar, an orange chip) is never a new value: use the nearest role and list it in the report
  as a question for the person.
- **A fed header or footer is not a section.** It restyles `src/components/layout/Navbar.astro`
  or `Footer.astro` and their links in `src/data/navigation.ts`; there is only ever one navbar.
  Keep every prop a page already passes working (add, never rename), update the element's line
  in `src/components/design-system/nav.ts`, and its bullet in `docs/design.md` §8.
- **A dark panel inside a light band:** `data-tone="inverted"` on the panel plus
  `bg-surface-1 text-ink-1` (`docs/design.md` §3).

## New: from a description

"A calculator: four inputs, two results, a note." The same components, the same frame, the same
registration. Every input, label, default and line of copy is a prop. An interactive part is a
small vanilla `<script>` in the section (no framework): it reads `data-*` attributes, writes
results into the page, and works for every copy of the section on a page. Show the result the
defaults give before any interaction, so the section reads right without JavaScript.

## Build it

- **Name** it by what it is, kebab-case (`virtual-cards`, `two-panels`, `spend-calculator`), not
  by its heading: the copy will change, the section stays.
- `src/sections/<Name>.astro`: `Section` (pick its `tone`) → `Container` (the only outer
  spacing) → `SectionHeader` if one heading leads the block → components. Steps or panels that
  each carry their own heading use `Heading`: level 2 when nothing leads them, level 3 under a
  section heading. Only a page's first section is an H1.
- **Every piece of copy is a prop** with a type and a JSDoc line, and the component holds none of
  it: the original copy goes into the registry as the example, so a page can swap it.
- **Only what the source shows.** No speculative props or variants. If it is near-identical to a
  section that exists, say so; the person decides whether to merge them.

## Register it and check it

In `src/sections/index.ts`:

```ts
"virtual-cards": section({
  component: VirtualCards,
  example: { /* the original copy, word for word */ },
  source: "https://site.com/page (Heading of the block)",   // or "new: what it does"
}),
```

`variants` only for a second placement the site really shows (centred, on a dark band). A name
whose capitalised form reads wrong gets a `title` (`faq` → `title: "FAQ"`). Then:

```bash
npm run shots -- /design-system/preview/sections/<name>   # SHOTS_URL=http://localhost:<port> if not 4321
```

Put each of the three `.shots/` files beside the matching source screenshot and compare elements,
not bands: heading size and line count, card sizes, gaps, image crops, what stacks on the phone.
Nothing may scroll sideways. Add the section's row to `docs/design.md` §9 (replacing its `[fill: …]` row the first time) and run
`npm run build` (a wrong example prop fails it).

## Report

The section's name and file, the preview URL (`/design-system/sections/<name>`), the shots beside
the source, what differs on purpose, and any colour or size the system could not express.
