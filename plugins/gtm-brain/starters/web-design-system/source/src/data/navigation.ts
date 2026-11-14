/**
 * The site's navigation, in one place: the Navbar and the Footer read it, so every page
 * shows the same links. Replace the placeholders with your own.
 */
import type { NavLink } from "../components/layout/Navbar.astro";
import type { FooterColumn } from "../components/layout/Footer.astro";

export const navbar: { links: NavLink[]; action: NavLink } = {
  links: [
    { label: "Design system", href: "/design-system" },
    { label: "Sections", href: "/design-system/sections" },
  ],
  action: { label: "Get started", href: "/design-system" },
};

const placeholder = (title: string): FooterColumn => ({
  title,
  links: [
    { label: "A link", href: "#" },
    { label: "Another link", href: "#" },
    { label: "A third link", href: "#" },
  ],
});

export const footer: { statement: string; columns: FooterColumn[] } = {
  statement: "One sentence on what the company does, in its own words.",
  columns: [placeholder("Product"), placeholder("Company"), placeholder("Resources"), placeholder("Legal")],
};
