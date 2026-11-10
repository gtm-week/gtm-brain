/**
 * The registry: every section the site's pages are built from, with example content
 * and where it came from. /design-system/sections shows each one; a page imports the
 * component and passes its own content.
 *
 * To add one: create `src/sections/<Name>.astro` with typed props, then register it
 * below. `section()` checks the example against the component's props, so a wrong or
 * missing prop fails `npm run build`, and so does a name without a component. A section
 * that can be placed more than one way (centred, on a dark band) lists those as `variants`.
 *
 *   import Hero from "./Hero.astro";
 *   …
 *     hero: section({
 *       component: Hero,
 *       example: { heading: "Time is money.", muted: "Save both." },
 *       source: "https://example.com/ (the first band)",
 *     }),
 */
import type { ComponentProps } from "astro/types";
import { ChartLine, CreditCard, Receipt, ShieldCheck, Sparkles, Zap } from "@lucide/astro";
import Hero from "./Hero.astro";
import Features from "./Features.astro";
import CtaBand from "./CtaBand.astro";

type Component = (props: any) => any;

export interface Section<C extends Component = Component> {
  component: C;
  /** How the design system names it; defaults to the name, capitalised ("cta-band" → "Cta band"). */
  title?: string;
  /** Props that render the section on its own, ideally the original content. */
  example: ComponentProps<C>;
  /** Other ways to place it, by name ("centred"): each is shown beside the example. */
  variants?: Record<string, ComponentProps<C>>;
  /** Where it came from: a URL and the block on it, or "new: <what it does>". */
  source: string;
}

/** Ties `example` to the component's own props. */
export const section = <C extends Component>(entry: Section<C>): Section<C> => entry;

/**
 * The name (kebab-case) is the address: /design-system/sections/<name>. The starter's three
 * are placeholders in the system's grey; feed it more from your site.
 */
export const sections = {
  hero: section({
    component: Hero,
    example: {
      tagline: "Tagline",
      heading: "A headline that says what you do.",
      muted: "And what it changes for your customer.",
      lead: "One or two sentences that make the headline concrete: who it is for and why now.",
      actions: [
        { label: "Primary action", href: "#" },
        { label: "Second action", href: "#" },
      ],
    },
    variants: {
      centred: {
        tagline: "Tagline",
        heading: "A headline that says what you do.",
        muted: "And what it changes for your customer.",
        lead: "One or two sentences that make the headline concrete: who it is for and why now.",
        actions: [
          { label: "Primary action", href: "#" },
          { label: "Second action", href: "#" },
        ],
        align: "center",
      },
    },
    source: "starter: a placeholder hero",
  }),
  features: section({
    component: Features,
    example: {
      tagline: "Tagline",
      heading: "What you get.",
      muted: "Three to six things, one sentence each.",
      features: [
        { icon: CreditCard, title: "A first feature", text: "One sentence on what it does and why it matters.", href: "#" },
        { icon: Receipt, title: "A second feature", text: "One sentence on what it does and why it matters.", href: "#" },
        { icon: ChartLine, title: "A third feature", text: "One sentence on what it does and why it matters.", href: "#" },
        { icon: ShieldCheck, title: "A fourth feature", text: "One sentence on what it does and why it matters." },
        { icon: Zap, title: "A fifth feature", text: "One sentence on what it does and why it matters." },
        { icon: Sparkles, title: "A sixth feature", text: "One sentence on what it does and why it matters." },
      ],
    },
    source: "starter: a placeholder features grid",
  }),
  "cta-band": section({
    component: CtaBand,
    title: "CTA band",
    example: {
      heading: "A closing line that asks for the action.",
      lead: "One sentence on what happens next.",
      actions: [{ label: "Primary action", href: "#" }],
    },
    variants: {
      light: {
        heading: "A closing line that asks for the action.",
        lead: "One sentence on what happens next.",
        actions: [{ label: "Primary action", href: "#" }],
        tone: "muted",
      },
    },
    source: "starter: a placeholder closing band",
  }),
} satisfies Record<string, Section>;

const titleOf = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).replaceAll("-", " ");

export const sectionList = Object.entries(sections as Record<string, Section>).map(
  ([name, entry]) => ({ name, ...entry, title: entry.title ?? titleOf(name) }),
);
