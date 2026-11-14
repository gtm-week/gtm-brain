/**
 * Everything /design-system lists: the sidebar, the search, the overviews and the
 * component pages are all built from this. To add a component: the component in
 * src/components/ui/, its examples in ./examples/<Name>.astro, and one entry below.
 * Sections join by being registered in src/sections/index.ts.
 */
import { sectionList } from "../../sections";
import FoundationThumb from "./FoundationThumb.astro";
import FrameThumb from "./FrameThumb.astro";

// Each examples file renders the element's page, or with `thumb` a small preview.
const examples = import.meta.glob<{ default: Thumb }>("./examples/*.astro", { eager: true });

type Thumb = (props: any) => any;

export interface Item {
  name: string;
  href: string;
  /** One line: what it is for. */
  lead: string;
  Thumb: Thumb;
  thumbProps: Record<string, unknown>;
}

export interface Element extends Item {
  slug: string;
  /** The component's path under src, for the props table. */
  source: string;
}

const element = (name: string, lead: string): Element => {
  const slug = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  const file = examples[`./examples/${name}.astro`];
  if (!file) throw new Error(`Add src/components/design-system/examples/${name}.astro for ${name}.`);
  return {
    name,
    slug,
    lead,
    href: `/design-system/components/${slug}`,
    source: `components/ui/${name}`,
    Thumb: file.default,
    thumbProps: { thumb: true },
  };
};

/** Alphabetical: a list to look things up in. */
export const components = [
  element("ArrowButton", "The round arrow in a card's corner."),
  element("Avatar", "A person's photo, or their initials."),
  element("Badge", "A short status or category."),
  element("Button", "The site's actions: primary for the main one, secondary, ghost."),
  element("Card", "Icon, heading and a sentence; the whole card can be a link."),
  element("Carousel", "A row that scrolls and snaps, with arrows; it runs past the column."),
  element("Checkbox", "A checkbox with its label."),
  element("Chip", "A small tag in capitals: a category, a filter."),
  element("EmailCapture", "An email field joined to a button."),
  element("FaqItem", "A question that opens to its answer, one at a time."),
  element("Heading", "Every heading, with the two-tone muted tail."),
  element("Icon", "One Lucide icon, in the colour of the text."),
  element("IconTile", "An icon on a square tile."),
  element("Input", "A text field with its label, hint and error."),
  element("Link", "A link in a sentence, or one that stands alone with an arrow."),
  element("LogoTile", "A customer's logo, quiet until hovered."),
  element("Photo", "A photo at a fixed ratio, cropped to fill it."),
  element("QuoteCard", "A customer's words, name and role."),
  element("SectionHeader", "The top of every section: tagline, heading, lead, actions."),
  element("Stat", "One number and what it counts."),
  element("Tagline", "The small label above a heading."),
  element("Textarea", "A multi-line field."),
];

const foundation = (name: string, slug: string, lead: string): Item => ({
  name,
  href: `/design-system/foundations/${slug}`,
  lead,
  Thumb: FoundationThumb,
  thumbProps: { kind: slug },
});

export const foundations = [
  foundation("Colours", "colours", "Ink, surface and line: the roles every component uses."),
  foundation("Typography", "typography", "Two families, two weights, a heading scale per width."),
  foundation("Breakpoints", "breakpoints", "Mobile first, md 768 and lg 1024, and what switches at each."),
  foundation("Frame", "frame", "The band and the column: gutter, width and padding, in one place."),
  foundation("Radius", "radius", "The closed set of corners."),
  foundation("App icons", "app-icons", "One source icon and every file browsers and phones ask for."),
  foundation("design.md", "design-md", "The contract an agent reads before it builds, rendered from docs/design.md."),
];

export const sections: Item[] = sectionList.map((entry) => ({
  name: entry.title,
  href: `/design-system/sections/${entry.name}`,
  lead: entry.source,
  Thumb: FrameThumb,
  thumbProps: { src: `/design-system/preview/sections/${entry.name}`, title: `${entry.title} section` },
}));

const chromePart = (name: string, slug: string, lead: string, source: string) => ({
  name,
  slug,
  lead,
  source,
  href: `/design-system/chrome/${slug}`,
  Thumb: FrameThumb,
  thumbProps: { src: `/design-system/preview/chrome/${slug}`, title: name },
});

/** The navbar and the footer: on every page, around the sections. */
export const chrome = [
  chromePart("Navbar", "navbar", "The logo, a few links and the main action; a menu below 1024.", "components/layout/Navbar"),
  chromePart("Footer", "footer", "One statement, columns of links, the logo and the © line.", "components/layout/Footer"),
];

export const groups = [
  { key: "foundations", label: "Foundations", href: "/design-system/foundations", items: foundations, unit: "topics", all: false },
  { key: "components", label: "Components", href: "/design-system/components", items: components, unit: "components", all: true },
  { key: "chrome", label: "Site chrome", href: "/design-system/chrome", items: chrome, unit: "parts", all: false },
  { key: "sections", label: "Sections", href: "/design-system/sections", items: sections, unit: "sections", all: true },
] as const;

/** The group a page belongs to, for the eyebrow and which sidebar group starts open. */
export const groupOf = (path: string) => groups.find((g) => path === g.href || path.startsWith(`${g.href}/`));
