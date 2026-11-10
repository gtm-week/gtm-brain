/** The web manifest, built from SITE_NAME: Android's home-screen name and icons. */
import type { APIRoute } from "astro";
import { SITE_NAME } from "../../site.config.mjs";

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: SITE_NAME,
      short_name: SITE_NAME,
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      display: "browser",
    }),
    { headers: { "Content-Type": "application/manifest+json" } },
  );
