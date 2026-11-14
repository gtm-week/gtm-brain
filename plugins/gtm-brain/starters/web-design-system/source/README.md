# GTM Tech Week design-system starter

A workshop starter for the [GTM Tech Week](https://www.gtm-week.com/) community, by [Peakout](https://peakout.studio). Take a
website you're happy with, let an agent build a design system from it, feed it the sections you
like, add your own, and ship a landing page on Vercel.

**This is an exercise.** It is the minimum that shows the way of working: a design system first,
then pages built on it, by an agent, live on the web. It is not the best design system you could
have, and not the most autonomous repo you could build. Those are different projects.

**See it first:** the grey design system, live at
[gtm-week-design-system.vercel.app/design-system](https://gtm-week-design-system.vercel.app/design-system).
Click "Use this template" above to make your own copy.

One assumption: you already have a website whose design you are happy with. You take what you
have; you do not design a brand here.

## What you need

- Node 22.12 or newer, and Chromium for the scripts once: `npx playwright install chromium`
- A coding agent: Claude Code or Codex (both read this repo's rules and skills)
- A website you like, and about an hour of agent time

## The exercise in five steps

1. **Start.** Use this template, then `npm i` and `npm run dev`. Open
   http://localhost:4321/design-system: a complete design system, every component in every
   state and three starter sections, all in grey on purpose. `/` is a page built from it.
2. **Build the foundations** from your site: `/build-design-system https://your-site.com`.
   Colours and type, then the components with their states, each compared with your
   site before the next.
3. **Feed it more sections:** `/add-section` with a page URL and a section's heading, one
   at a time. Each appears on `/design-system/sections` at desktop, tablet and mobile width.
4. **Add two of your own** from a description (`/add-section`, "a calculator: four inputs,
   two results, a note"), then build a page from the sections: `/build-landing-page` with
   your brief.
5. **Go live:** push to GitHub, import it at vercel.com/new (no settings needed), and every
   push to `main` deploys. `/deploy-vercel` walks through it. From then on a change goes on a
   branch first: its preview link is reviewed, then it is merged to `main`.

## The skills

| Skill | Does |
|---|---|
| `build-design-system` | Reads your site and lays its colours, type, radii and components over the grey system, stopping for you at each layer |
| `add-section` | Adds one section: rebuilt from a block on your site, or new from a description |
| `build-landing-page` | Maps your brief to the sections and composes the page |
| `deploy-vercel` | Puts the site live, with a preview link for every change after that |

They live in `.agents/skills/`. Codex reads them there; `npm i` links them into
`.claude/skills/` for Claude Code. The first two read your site with
`node scripts/extract.mjs <url>` (computed styles and crops, into `.design-extract/`).

To run all four steps from one conversation, use the lesson's orchestrator kickoff: one session
plans, and each step runs in its own session.

## What is in it

```
AGENTS.md              the rules for any agent (CLAUDE.md points to it)
docs/design.md         the design contract: how to use the tokens, filled with your brand
docs/seo.md            what every page owes search engines and AI assistants
site.config.mjs        site name, URL, language, site-wide noindex
.agents/skills/        the skills (linked into .claude/skills/ by npm i)
scripts/               extract.mjs (reads a site's design), npm run shots, npm run icons, the skills link
public/                favicon and app icons, the share card
src/
  styles/global.css    the tokens: primitives, roles, type, radii, the font
  assets/              fonts, the brand icon, images that came with sections
  components/ui/       22 components, every state
  components/layout/   Section, Container, Navbar, Footer
  data/navigation.ts   the navbar's and the footer's links
  sections/            Hero, Features, CtaBand to start; index.ts is the registry
  pages/               index.astro, 404, and /design-system, rendered from the code
```

Tokens come in two layers: primitives (`--site-*`, raw values nobody uses directly) and
roles (`ink`, `surface`, `line`, and an optional `accent` for a second colour) that every component uses. Tailwind's default colours,
sizes and breakpoints are switched off, so a class outside the system renders nothing.
`docs/design.md` explains the rest.

## Commands

| Command | Does |
|---|---|
| `npm i` | Installs, and links the skills for Claude Code |
| `npm run dev` | The site at http://localhost:4321 |
| `npm run build` | Type-checks, then builds the static site to `dist/` |
| `npm run icons` | Writes the favicon and app icons from `src/assets/brand/icon.svg` |
| `npm run shots -- /path` | Screenshots at 375, 768, 1440 into `.shots/` (with `npm run dev` running; once: `npx playwright install chromium`) |
| `node scripts/extract.mjs <url>` | A site's computed styles and crops into `.design-extract/`; `--section "<heading>"` for one block |

## Where this goes next

A start, not a finish: check the rules automatically on every build, analytics you can
ask questions, leads straight to your CRM, one page per event from the same sections, a
CMS when the team needs one. Each is one more file or one connection.

## Licence

MIT, see `LICENSE`. Inter is licensed under the SIL Open Font License
(`src/assets/fonts/OFL.txt`). Icons by Lucide (ISC).

Made by [Peakout](https://peakout.studio), a go-to-market website studio for B2B.
