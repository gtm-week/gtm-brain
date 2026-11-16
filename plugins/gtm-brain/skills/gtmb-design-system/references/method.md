# Build a design system: the method

By Brian Woloszczak and Peakout. The full procedure ships unchanged inside every company's
website project at `docs/workflows/build-design-system/SKILL.md`, with the design manual in
`docs/design.md`. Read it there, from the project, so it matches that project's starter
revision. This page names what good looks like, so a run that skips it is easy to spot.

## 1. Start from the brand that exists

The company's live website, logo and licensed fonts are the source. Extract before inventing:
every value is either observed on the source or derived from an observed one, and the
procedure says which.

## 2. Tokens before components

Colours, type, spacing and radii become tokens in `src/styles/global.css` within the starter's
token architecture (`--site-*`, `--color-ink`, `--color-surface`). Components use tokens only.
Text and background pairs pass contrast checks.

## 3. Three review checkpoints

The procedure stops for the person's review three times. A checkpoint is a real stop, not a
line in the summary.

## 4. Three widths

Every page and component is checked at 375, 768 and 1440 pixels on the running preview.

## Output

- The local `/design-system` catalogue, running.
- The verification results at the three widths, with contrast.
- Unresolved substitutions (a missing font, a guessed colour), named.
