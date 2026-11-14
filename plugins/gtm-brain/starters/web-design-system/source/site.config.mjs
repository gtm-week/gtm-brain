/**
 * The site's identity, in one place. Seo.astro, the sitemap and robots.txt read it.
 */

/**
 * The production address, no trailing slash. Set `SITE_URL` in Vercel's settings once
 * you know it; until then a Vercel build uses its production URL and a local one localhost.
 */
export const SITE_URL = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:4321")
).replace(/\/$/, "");

/** The brand, as titles, og:site_name and the JSON-LD say it. */
export const SITE_NAME = "Site name";

/** `<html lang>`. */
export const SITE_LANG = "en";

/**
 * `true` hides the whole site from search engines: every page gets `noindex` and the
 * sitemap is empty. Use it for a demo, a test, or a page only people with the link should see.
 */
export const NOINDEX = false;
