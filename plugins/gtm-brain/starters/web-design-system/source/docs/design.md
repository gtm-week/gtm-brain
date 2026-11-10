# Design — the contract

The contract for this site's design: how to use what `src/styles/global.css` holds.
The CSS holds the values; this file says what each one is for and the rules around it.
If the two disagree, the CSS is right and this file has a bug.

**Status: neutral.** Every value is a grey placeholder until the foundations are filled
from your site. Lines marked `[fill: …]` are filled by the `build-design-system` skill,
or by hand. This file also works outside the repo: paste it with `global.css` into a chat
to get a one-pager or a deck in the same style.

## 1. The one rule

**A component names a role, never a value.** `text-ink-2`, not `text-[#3f3f46]` and not
`text-gray-700`.

Two layers. **Primitives** (`--site-*` in `:root`) are the paint in the tin: raw values,
outside `@theme`, so no utility exists for them. **Roles** (`@theme`) say what a value is
*for*. A rebrand changes primitives and pointers, a few lines; components never change.

Tailwind's default scales are reset: `text-gray-500`, `text-3xl`, `rounded-3xl`,
`shadow-lg`, `font-bold`, `sm:`, `xl:` do not exist. A class outside the system renders
nothing, so drift shows. Spacing (`p-4`, `gap-8`) stays: a ladder, not a brand decision.

## 2. Source

- Site: [fill: URL]
- Pages read: [fill: the homepage and one or two that show more, e.g. pricing, a form]
- Read on: [fill: date]
- Observed: [fill: what was measured on the site]
- Derived: [fill: what the site does not have and was derived, e.g. "no checkbox on the
  site: derived from Input"]
- Not checked: [fill: what could not be read, e.g. hover states behind a login]

## 3. Colour roles

One family per CSS property: `ink` for text and icons, `surface` for backgrounds, `line`
for borders. Never cross them (`bg-ink-1` compiles, but is wrong). Numbered from the
loudest ink and from the page outwards.

| Role | For | This brand |
|---|---|---|
| `ink-1` | headings, links | [fill] |
| `ink-2` | body copy | [fill] |
| `ink-3` | captions, labels, the grey half of a two-tone heading | [fill] |
| `ink-4` | placeholder, a logo at rest | [fill] |
| `ink-inverted` | text on `surface-inverted-1` | [fill] |
| `ink-brand` | the brand colour as text | [fill] |
| `ink-on-brand` | text on `surface-brand` | [fill] |
| `surface-1` | the page | [fill] |
| `surface-2` | a muted band, a card | [fill] |
| `surface-3` | a card on a muted band, an icon tile | [fill] |
| `surface-inverted-1` | a dark band, the black button | [fill] |
| `surface-brand` | the main action | [fill: e.g. "only on the main action, one per view"] |
| `line` | every hairline | [fill] |
| `line-2` | an input, a frame, the scrollbar | [fill] |
| `line-brand` | the border of whatever has focus | [fill] |
| `danger` | a field's error (text and border) | [fill] |
| `ink-accent` | the second colour as text or an icon (optional) | [fill: or "none: the site has one colour"] |
| `ink-on-accent` | text on `surface-accent` | [fill] |
| `surface-accent` | a bar, a tag, a highlight | [fill] |
| `surface-accent-subtle` | its track or tint | [fill] |

**Accent: the one way the palette grows.** A brand with a second colour (chart bars, tags)
gets it through the four accent roles, never the main action. The hue's raw values become
their own primitives (`--site-blue-500`, `--site-blue-200`) and the roles point at them.
Every other colour seen on the site that no role carries is listed below with what was
decided: mapped to an existing role, left out as decoration, or a question. A role is added
only this way, in `global.css` and this file together, after the person agrees.
[fill: colours seen on the site with no role, and what was decided for each]

**Text is a hierarchy, not shades.** Headings and links `ink-1`, explanation `ink-2`,
captions and labels `ink-3`. That contrast is most of what makes a page look designed.

**Dark bands.** `<Section tone="inverted">` re-points the roles inside it (the
`[data-tone="inverted"]` block in `global.css`), so every component works on it unchanged.
A dark panel inside a light band works the same way: `data-tone="inverted"` on the panel, with
`bg-surface-1 text-ink-1` (the roles re-point on the panel itself, so `surface-1` is the dark
fill there; `bg-surface-inverted-1` would turn white).

**Contrast.** Every text-on-surface pair used is checked against WCAG AA (4.5:1 for body,
3:1 for large text). [fill: pairs checked, and any that fail and why they stay]

**Focus.** Focus changes a border to `line-brand`, never a thick ring: every component carries
`focus-visible:border-line-brand focus-visible:outline-none`. Anything without a border of its
own falls back to a 1px `line-brand` outline from the base layer, so nothing loses its focus.

**Motion.** Hovers and state changes ease over `--default-transition-duration` (300 ms) in
`global.css`. A component writes `transition-colors`, never its own duration.

## 4. Typography

Fonts are files in `src/assets/fonts/` with an `@font-face` in `global.css`, never a CDN.

- Body (`font-sans`): [fill: font; the original's name if this is a stand-in] (starter: Inter, OFL)
- Headings (`font-heading`): [fill] (starter: Inter)
- Weights: two, `font-normal` 400 and `font-medium` 500. A third weight is a change to
  `global.css` and this file first.

**Headings.** One class carries every tier. **Tag is not style**: the tag comes from the
outline (one `h1`, sections start at `h2`), the class from how loud it should look.
`<h2 class="heading-h3">` is normal; `Heading` takes `level` and `size` separately.

```
              mobile · 768 · 1024   (px)
heading-h1    40 · 56 · 64
heading-h2    32 · 40 · 48
heading-h3    28 · 32 · 36
heading-h4    22 · 24 · 28
heading-h5    18 · 20 · 20
heading-h6    16 · 18 · 18
```

**Body.** `text-small` 14 · `text-regular` 16 (the default, a plain `<p>` needs no class) ·
`text-medium` 16 → 18 from 768 · `text-large` 18 → 20 from 768. Size and weight are
separate classes.

**Tagline.** `tagline`: the small uppercase label above a heading. Write it in normal case;
the capitals are style.

**The two-tone heading.** `Heading muted="…"`: the first clause in `ink-1`, the rest in
`ink-3`. [fill: when this brand uses it, e.g. "every section heading" or "heroes only"]

## 5. Space and layout

**Breakpoints: two.** Mobile first; `md` 768 and `lg` 1024. Pages are checked at 375, 768
and 1440. These are fixed: a source site's breakpoints are snapped to them, never copied.

**Three spacing layers that never mix:**
1. **Section**: the gutter (`px-4 md:px-8`), the column (`max-w-frame`, 1376) and the
   band's vertical padding live only in `Container`. A section never writes its own.
2. **Block**: inside a section, header to content (`gap-10 md:gap-12` as a start).
3. **Cell**: inside a card, `p-6` and `gap-4`.

`Section` is the band (its background, edge to edge); `Container` goes inside it. Reading
widths: `max-w-measure-sm` (card copy), `-md` (a lead beside a heading), `-lg` (a centred
lead). [fill: section rhythm, default alignment (left or centre)]

## 6. Radius, borders, shadows

A closed set, taken from the corners the site really uses (the extract's radius inventory):
the names stay where they fit, and one is added (`rounded-md`) or dropped when the site's
set differs, with every component's class following. A new value is a new token in
`global.css` and a line here.

- `rounded-sm` [fill] the whole UI: buttons, cards, inputs
- `rounded-lg` [fill] a large panel
- `rounded-full` pills, avatars, the arrow button
- [fill: any other corner the site uses, and where]
- Borders: [fill: e.g. "hairlines in `line`; cards are flat with a border, no shadow"]
- Shadows: none. [fill: add one only if the site has one]
- Scrollbars: one for the whole site, thin, its thumb in `line-2` and no track (the base
  layer of `global.css`). Never the browser's default, never styled per component. [fill:
  the brand's colour here, if the site uses one]

## 7. Icons and images

- **Icons:** Lucide (`@lucide/astro`), through `Icon`: sizes sm 16 · md 20 · lg 24, one
  stroke width (`STROKE` in `Icon.astro`), colour from the text around it. Choose by
  meaning, not by the heading's words. An icon that came with a fed section stays in that
  section's folder.
- **Icon tile:** `IconTile`, an icon on `surface-3`. [fill: shape and size on this site]
- **App icons:** one source, `src/assets/brand/icon.svg`; `npm run icons` writes the favicon,
  the Apple touch icon and the two Android sizes into `public/`.
- **Images:** a section's images live in `src/assets/sections/<section-name>/` and render
  through `astro:assets` (`<Image>`), with alt text, width and height.
- [fill: what carries the look: photos, illustrations, or type and colour alone]

## 8. Components

**Components** (`src/components/ui/`, 22): ArrowButton, Avatar, Badge, Button, Card,
Carousel, Checkbox, Chip, EmailCapture, FaqItem, Heading, Icon,
IconTile, Input, Link, LogoTile, Photo, QuoteCard, SectionHeader, Stat, Tagline, Textarea.
Body copy is not a component: a `<p>` with a size and an ink class (`text-large text-ink-2`).
A component uses roles and other components. **Site chrome** (`src/components/layout/`):
Navbar and Footer, around every page's sections.

- **Photo:** every photo goes through it, at a ratio from the closed set, with `alt` and
  `sizes`. [fill: radius and any treatment this brand gives photos]
- **Carousel:** a row that scrolls and snaps, two arrows beside the header slot (a phone
  swipes). It runs past the column to the band's edges instead of being cut at the column.

- **Buttons:** `primary` (`surface-brand`) for the main action, one per view; `secondary`
  (`surface-inverted-1`) for the second; `ghost` for the quiet one. [fill: height, padding,
  radius, weight as measured]
- **Card:** with `href` the whole card is one link (the heading's link stretches over it)
  and shows the ArrowButton. Never nest a link or a button inside a linked card.
- **SectionHeader** starts every section, so section tops stay consistent.
- **States:** every interactive component has default, hover, focus-visible and disabled;
  fields also have error. Each has its own page, `/design-system/components/<name>`, with
  every state. A new component ships its states.
- **FAQ:** one answer open at a time among its siblings; it slides open and shut.
- [fill: anything this brand does differently, e.g. QuoteCard with a logo]

## 9. Sections

Each section is one `.astro` file in `src/sections/` with typed props, registered in
`src/sections/index.ts` with example content and where it came from.

| Section | For | Source |
|---|---|---|
| `hero` | the first band: the page's H1, a lead, up to two buttons; left or centred | starter |
| `features` | a section header and three to six cards with icon tiles | starter |
| `cta-band` | the closing band: centred heading and a button, dark or light | starter |
| [fill: the sections fed from your site] | | |

## 10. Do / Don't

Rules observed on the source site, not borrowed from elsewhere.

**Do**
- [fill: e.g. "one yellow button per view"]
- [fill]

**Don't**
- [fill: e.g. "never two brand buttons side by side"]
- [fill: e.g. "uppercase only in taglines"]
- No primitive (`--site-*`) in a component; no hex anywhere but `global.css`.
- No new weight, radius, breakpoint or colour without changing `global.css` and this file.
