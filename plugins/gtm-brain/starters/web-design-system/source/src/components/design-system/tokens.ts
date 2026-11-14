/**
 * The foundations, read from global.css at build time so /design-system cannot drift
 * from them: primitives, colour roles (with their comments), heading tiers, radii.
 */
import css from "../../styles/global.css?raw";

const block = (selector: string, from = 0) => {
  const start = css.indexOf(`${selector} {`, from);
  if (start < 0) throw new Error(`global.css has no "${selector} {" block`);
  return css.slice(start, css.indexOf("\n}", start));
};

export const primitives = [...block(":root").matchAll(/--site-([\w-]+):\s*([^;]+);/g)].map(
  ([, name, value]) => ({ name, value: value.trim() }),
);
const values = new Map(primitives.map((p) => [p.name, p.value]));

const roleLine = /--color-((?:ink|surface|line|danger)[\w-]*):\s*var\(--site-([\w-]+)\);(?:[ \t]*\/\*\s*(.*?)\s*\*\/)?/g;
const inverted = new Map(
  [...block('[data-tone="inverted"]').matchAll(roleLine)].map(([, name, primitive]) => [name, primitive]),
);

export const roles = [...block("@theme static").matchAll(roleLine)].map(
  ([, name, primitive, comment]) => ({
    name,
    family: (name.includes("accent") ? "accent" : name.split("-")[0]) as "ink" | "surface" | "line" | "danger" | "accent",
    primitive,
    value: values.get(primitive) ?? "",
    comment: comment ?? "",
    inverted: inverted.get(name),
  }),
);

/** A hex value whose red, green and blue are equal (or nearly) is a grey. */
export const isGrey = (hex: string) => {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16));
  return Math.max(r, g, b) - Math.min(r, g, b) <= 12;
};

/** Heading sizes per tier, in px: mobile, md (768), lg (1024). */
const sizesIn = (text: string) =>
  Object.fromEntries(
    [...text.matchAll(/--text-(h\d):\s*([\d.]+)rem;/g)].map(([, h, rem]) => [h, Number(rem) * 16]),
  );
const tier = (marker: string) => {
  const start = css.indexOf(marker);
  return sizesIn(css.slice(start, css.indexOf("\n}", start)));
};
const base = tier("--text-h1:");
const md = tier("@media (min-width: 48rem) {");
const lg = tier("@media (min-width: 64rem) {");
export const headings = ["h1", "h2", "h3", "h4", "h5", "h6"].map((h) => ({
  name: `heading-${h}`,
  sizes: [base[h], md[h] ?? base[h], lg[h] ?? md[h] ?? base[h]],
}));

export const radii = [...block("@theme static").matchAll(/--radius-([\w-]+):\s*([^;]+);(?:[ \t]*\/\*\s*(.*?)\s*\*\/)?/g)].map(
  ([, name, value, comment]) => ({ name: `rounded-${name}`, token: `--radius-${name}`, value: value.trim(), comment: comment ?? "" }),
);

export const fonts = [...block("@theme static").matchAll(/--font-(sans|heading):\s*([^;]+);/g)].map(
  ([, name, value]) => ({ name: `font-${name}`, family: value.split(",")[0].replace(/"/g, "") }),
);

/** The two breakpoints, in px, from @theme. */
export const breakpoints = [...block("@theme static").matchAll(/--breakpoint-(\w+):\s*([\d.]+)rem;/g)].map(
  ([, name, rem]) => ({ name, px: Number(rem) * 16 }),
);

/** The column's widest width, in px. */
export const frameWidth =
  Number(block("@theme static").match(/--container-frame:\s*([\d.]+)rem;/)?.[1] ?? 0) * 16;

/* The gutter and the band's padding, read from Container.astro's classes: px-4 md:px-8 → 16, 32, 32. */
import container from "../layout/Container.astro?raw";
const tiers = (classes: string, prefix: string) => {
  const step = (tier: string) =>
    classes.match(new RegExp(`(?:^|\\s)${tier}${prefix}-(\\d+)(?:\\s|$)`))?.[1];
  const base = Number(step("") ?? 0) * 4;
  const md = step("md:") ? Number(step("md:")) * 4 : base;
  const lg = step("lg:") ? Number(step("lg:")) * 4 : md;
  return [base, md, lg];
};
const gutterClasses = container.match(/<div class="(px-[^"]+)">/)?.[1] ?? "";
const paddingClasses = container.match(/both:\s*"([^"]+)"/)?.[1] ?? "";
export const gutter = tiers(gutterClasses, "px");
export const bandPadding = tiers(paddingClasses, "py");
