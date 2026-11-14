// @ts-check
import { defineConfig } from "astro/config";
import { existsSync, readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import { SITE_URL } from "./site.config.mjs";

/* Astro's update check writes .astro/settings.json on a fresh clone, which restarts the
   dev server a second after it starts: a page opened in that second comes back empty. */
process.env.ASTRO_DISABLE_UPDATE_CHECK ??= "true";

const dist = new URL("./dist/", import.meta.url);

/**
 * One flag per page: a page Seo.astro marked `noindex` is left out of the sitemap.
 * The sitemap is written after the pages, so it reads the built HTML.
 * @param {string} page
 */
const isNoindex = (page) => {
  const path = new URL(page).pathname.replace(/^\/|\/$/g, "");
  const file = [`${path}/index.html`, `${path}.html`]
    .map((name) => new URL(name.replace(/^\//, ""), dist))
    .find((url) => existsSync(url));
  return !!file && readFileSync(file, "utf8").includes('<meta name="robots" content="noindex');
};

export default defineConfig({
  site: SITE_URL,
  trailingSlash: "never",
  /* Keeps the dev toolbar out of `npm run shots`. */
  devToolbar: { enabled: false },
  /* Markdown (docs/design.md on /design-system) is shown in the system's own colours, not
     a code theme's. */
  markdown: { syntaxHighlight: false },
  integrations: [sitemap({ filter: (page) => !isNoindex(page) })],
  vite: {
    plugins: [tailwindcss()],
  },
});
