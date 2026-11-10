/**
 * robots.txt, built from SITE_URL so its Sitemap line is always the real address.
 * Every crawler may read everything, AI crawlers included (docs/seo.md). To keep a page out
 * of search results use `noindex` on the page, not a Disallow here: a blocked crawler
 * never sees the noindex. A site-wide NOINDEX has no sitemap, so no Sitemap line either.
 */
import type { APIRoute } from "astro";
import { NOINDEX, SITE_URL } from "../../site.config.mjs";

const aiCrawlers = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

export const GET: APIRoute = () =>
  new Response(
    [
      "User-agent: *",
      "Allow: /",
      "",
      "# AI crawlers, named so the decision is visible.",
      ...aiCrawlers.map((bot) => `User-agent: ${bot}`),
      "Allow: /",
      ...(NOINDEX ? [] : ["", `Sitemap: ${SITE_URL}/sitemap-index.xml`]),
      "",
    ].join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
