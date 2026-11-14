# AGENTS.md

A starter for building pages on a design system: Astro 7, Tailwind 4, static output.
The design system comes first (tokens, components, sections), then pages are
composed from it. Codex reads this file directly; Claude Code reads it through `CLAUDE.md`.

## Rules

1. **Roles only, never a value.** Colours, sizes, radii and type come from the roles in
   `src/styles/global.css`: `text-ink-2`, `bg-surface-2`, `border-line`, `heading-h3`,
   `rounded-sm`. No hex, no `text-[…]` or `bg-[…]`, no Tailwind defaults (`text-gray-500`,
   `rounded-3xl`, `sm:` do not exist and render nothing).
2. **Pages are composed from `src/sections`.** If the page needs a section that does not
   exist, add the section first, then use it.
3. **Every section is registered** in `src/sections/index.ts` and shown on
   `/design-system/sections`.
4. **Read `docs/design.md` before building anything; read `docs/seo.md` before adding a page.**
5. **No invented copy.** Copy comes from a person, a brief or the source site. Where it
   is missing, write a placeholder that looks like one ("[Customer quote]").
6. **Check 375, 768 and 1440 before saying done** (`npm run shots -- <path>`).
7. **A design change goes into `global.css` and `docs/design.md` together.**
8. **Review before it is live.** Until the site's first deploy, work on `main`: nothing is
   live yet. Once it is live, every change goes on a branch, is pushed, is looked at on its
   preview URL, and is merged to `main` only after the person approves.

## Where things live

| What | Where |
|---|---|
| Tokens: primitives, roles, type, radii, fonts | `src/styles/global.css` |
| Font files (woff2) and their licence | `src/assets/fonts/` |
| Components | `src/components/ui/` |
| The band and the column (the only outer spacing) | `src/components/layout/Section.astro`, `Container.astro` |
| Navbar and footer (site chrome, on every page) | `src/components/layout/Navbar.astro`, `Footer.astro`; their links in `src/data/navigation.ts` |
| Sections and their registry | `src/sections/`, `src/sections/index.ts` |
| Images that came with a section | `src/assets/sections/<section-name>/` |
| Logo and the app icon (`icon.svg`, the source of every favicon) | `src/assets/brand/` |
| Pages | `src/pages/` (one `.astro` file per page) |
| Head tags, canonical, JSON-LD, noindex | `src/components/Seo.astro` via `src/layouts/Base.astro` |
| Site name, URL, language, site-wide noindex | `site.config.mjs` |
| The design and SEO contracts | `docs/design.md`, `docs/seo.md` |
| The design system, rendered from the code | `/design-system`; its list of elements is `src/components/design-system/nav.ts`, each element's examples `src/components/design-system/examples/` |
| Skills (the only copy) | `.agents/skills/`; `npm i` links them into `.claude/skills/` |

The layers: tokens → components (use roles, and each other) → sections (use components)
→ pages (compose sections and pass the copy as props).

## Commands

| Command | Does |
|---|---|
| `npm i` | Installs, and links the skills for Claude Code |
| `npm run dev` | The site at http://localhost:4321 |
| `npm run build` | Type-checks (`astro check`), then builds to `dist/` |
| `npm run shots -- /path` | Screenshots at 375, 768, 1440 into `.shots/` (needs `npm run dev`); a section alone is `/design-system/preview/sections/<name>` |
| `node scripts/extract.mjs <url>` | A site's computed styles and crops into `.design-extract/`; `--section "<heading>"` for one block (the skills say when) |

`npm run icons` writes the favicon and app icons from `src/assets/brand/icon.svg`.
Chromium for `shots`, `icons` and `extract`, once: `npx playwright install chromium`.

## Before done

- Looked at the page at 375, 768 and 1440 (`npm run shots`); nothing scrolls sideways.
- Roles only: no hex, no `[…]` colours or sizes, no primitive (`--site-*`) in markup.
- Exactly one H1 per page; headings do not skip levels.
- A new section is registered and looks right on `/design-system/sections/<name>` at all three
  widths. A new component has an examples file and an entry in `nav.ts`.
- A new page has a title and description (`docs/seo.md`).
- `npm run build` passes.
