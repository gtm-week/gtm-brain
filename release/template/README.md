# GTM OS release graphics

One look for every release post. Copy `release.html`, change the words, render, check it.

    cp release/template/release.html release/template/gtm-os-0.29.0.html
    bash release/template/render.sh release/template/gtm-os-0.29.0.html release/template/gtm-os-0.29.0.png

`gtm-os-0.28.1.png` is the reference: the first graphic in this style.

## The style

- Canvas 1600x900, rendered at 2x. Warm off-white background `#f6f5f1`, ink `#0b0b0c`, muted
  `#6b6b70`, hairlines `#e7e6e1`, white cards with a 1px hairline and 22px corners.
- The logo (`logo.png`, the GTM Tech Week foil mark) top left, 64px, beside "GTM OS" in heavy
  type and the version in a black monospace pill. Top right: the one command to run.
- The foil gradient (pink, yellow, green, cyan, violet) is an accent only: the 10px strip on
  top, the second line of the headline, the small square before each card label, one bar.
  Never a background, never on body text.
- Type: the system sans (SF Pro on a Mac), headline 68px weight 850 with tight tracking, card
  titles 28px weight 800, body 17px; monospace for commands, file paths and tool tags.
- Headline: two short lines, the first in ink, the second in foil. Three cards at most, each
  a label, a title and one concrete picture of the feature (a list, steps, a number).
- Footer: one privacy or trust line left, "Built from daily use on our own company" right.

## Rules

- Made-up names and messages only (Anna K., Tom M.); never a real colleague, customer or DM.
- No third-party logos: name Slack, HubSpot and the rest in words.
- Numbers only when measured; say where they came from in the post if they are from a test.
- No em or en dashes anywhere: plain hyphens and commas.
- Check the PNG before posting: nothing overflows a card, no line wraps into a stub.
