# Add a section: the method

By Brian Woloszczak and Peakout. The full procedure ships unchanged inside the company's
website project at `docs/workflows/add-section/SKILL.md`. Read it there. This page names what
good looks like.

## 1. Compose from what exists

A new section is built from the existing components and tokens. A new component is the
exception and is documented in the catalogue.

## 2. Register it once

The section goes in the typed registry (`src/sections/index.ts`) so every page can use it.
A section that lives only inside one page is not done.

## 3. Verify it

The section is checked in the catalogue at 375, 768 and 1440 pixels, with its interactions.

## Output

- The section in the registry and the catalogue.
- The checks at the three widths.
- Missing copy and unconnected services (a form with no endpoint), named.
