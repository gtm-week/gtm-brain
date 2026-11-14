/**
 * Reads a site's design from the browser: computed values, not appearances.
 * Needs Chromium (`npx playwright install chromium`, once). Writes to .design-extract/.
 *
 *   node scripts/extract.mjs <url> [<url> …]
 *     Each page at 1440, 768 and 375 (our type tiers): the :root custom properties; the computed
 *     styles of body, h1–h4, a paragraph, a link, the primary and secondary button, an input, a
 *     card and a label, each with a cropped screenshot; every band's background; the fonts and
 *     their files; the widths the CSS switches at; the header's logo. Then an inventory across
 *     the pages given (no crawling): every colour, radius, shadow, font size and weight, each
 *     with two marks: how often it is seen on the pages, and how often the stylesheets define it
 *     (hover states included, which the page never shows). The counts tell the palette from the
 *     leftovers. It lands in the first page's extract.json as `inventory`.
 *
 *   node scripts/extract.mjs <url> --section "<heading>" [--nth 2] [--up 1] [--selector "<css>"]
 *     The block that holds that heading, at 1440, 768 and 375: screenshots, its copy in
 *     order, its images (downloaded) and the computed styles of what is inside it.
 *     --nth picks a later match of the same heading, --up takes the block's parent (too
 *     little came out), --selector names the block directly.
 *
 *   node scripts/extract.mjs http://localhost:4321/design-system/components/<name> --states [--vs <dir>]
 *     Every state on one of our component pages (hover and focus are forced there with
 *     data-state), as a table. --vs .design-extract/<site> prints the source's matching
 *     element above it and writes compare.png: the source's crops beside ours.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args.splice(i, 2)[1];
};
const has = (name) => {
  const i = args.indexOf(name);
  return i !== -1 && !!args.splice(i, 1);
};
const sectionQuery = option("--section");
const nth = Number(option("--nth") ?? 1);
const selector = option("--selector");
const up = Number(option("--up") ?? 0);
const vs = option("--vs");
const states = has("--states");
const url = args[0];
const pages = args.filter((a) => /^https?:\/\//.test(a));
if (!url || !/^https?:\/\//.test(url)) {
  console.error('Give a full URL: node scripts/extract.mjs https://example.com [--section "<heading>"]');
  process.exit(1);
}

const slug = (text) =>
  text.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/:\d+/, "")
    .replace(/[^a-z0-9.]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 60) || "page";
const dirFor = (target) => join(".design-extract", slug(new URL(target).host + new URL(target).pathname));
const pageDir = dirFor(url);

const browser = await chromium.launch().catch((error) => {
  console.error("Chromium is not installed. Run once: npx playwright install chromium");
  throw error;
});

/** Opens the page at a width, lets it load, scrolls once to the bottom (sites reveal on scroll), back up. */
async function open(width, target = url) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const css = [];
  page.on("response", async (response) => {
    if (response.request().resourceType() !== "stylesheet") return;
    try { css.push({ url: response.url(), text: await response.text() }); } catch {}
  });
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  // Cookie and consent banners hide what is under them. Hidden, never clicked.
  await page.addStyleTag({
    content: `[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[id^="onetrust" i],[class*="osano" i],[id^="fides" i]{display:none!important}`,
  }).catch(() => {});
  await page.evaluate(async () => {
    const step = innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    scrollTo(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 600));
  });
  await page.evaluate(inPage);
  return { page, css, close: () => context.close() };
}

/** Helpers installed in the page as window.__ex. Self-contained: it runs in the browser. */
function inPage() {
  const PROPS = [
    "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-transform",
    "color", "background-color", "background-image", "border-top-width", "border-top-style",
    "border-top-color", "border-radius", "padding-top", "padding-right", "padding-bottom",
    "padding-left", "box-shadow", "opacity", "transition-duration", "display", "gap",
    "grid-template-columns", "max-width",
  ];
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  /** Any CSS colour (rgb, oklch, color(), a name) as hex; null when fully transparent. */
  const hex = (colour) => {
    if (!colour || colour === "transparent") return null;
    const toHex = (r, g, b, a) => {
      const out = "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
      return a < 255 ? out + Math.round(a).toString(16).padStart(2, "0") : out;
    };
    // rgb()/rgba() read as written: a canvas premultiplies alpha, so a faint colour's RGB drifts.
    const m = colour.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/);
    if (m) {
      const alpha = m[4] === undefined ? 1 : m[5] ? +m[4] / 100 : +m[4];
      return alpha === 0 ? null : toHex(+m[1], +m[2], +m[3], alpha * 255);
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return null;
    return toHex(r, g, b, a);
  };
  const rgb = (h) => (h ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null);
  const chroma = (h) => { const c = rgb(h); return c ? Math.max(...c) - Math.min(...c) : 0; };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05;
  };
  const box = (el, origin) => {
    const r = el.getBoundingClientRect();
    const o = origin?.getBoundingClientRect() ?? { x: -scrollX, y: -scrollY };
    return { x: Math.round(r.x - o.x), y: Math.round(r.y - o.y), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const text = (el) => (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
  const ownText = (el) =>
    [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").replace(/\s+/g, " ").trim();
  const bg = (el) => (el ? hex(getComputedStyle(el).backgroundColor) : null);
  /** The background an element sits on: its own, or the nearest ancestor's. */
  const backdrop = (el) => {
    for (let e = el; e; e = e.parentElement) { const b = bg(e); if (b) return b; }
    return "#ffffff";
  };
  const border = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none" ? hex(s.borderTopColor) : null;
  };
  /** In the footer, or in an overlay (a consent banner, a dialog): not the page's own design. */
  const fixedOverlay = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      if (getComputedStyle(e).position !== "fixed") continue;
      const r = e.getBoundingClientRect();
      // A bar fixed to the top is the header; low on the screen or covering it is an overlay.
      if (r.top > innerHeight / 3 || r.height > innerHeight * 0.6) return true;
    }
    return false;
  };
  const inChrome = (el) => !!el.closest("footer, [role=contentinfo], [role=dialog], [aria-modal=true]") || fixedOverlay(el);

  /** A computed-style record: the properties above, colours also as hex, the box. */
  const record = (el, origin) => {
    const s = getComputedStyle(el);
    const style = {};
    for (const p of PROPS) {
      let v = s.getPropertyValue(p);
      if (p === "background-image" && v.length > 300) v = v.slice(0, 300) + "…";
      style[p] = v;
    }
    return {
      tag: el.tagName.toLowerCase(),
      text: text(el).slice(0, 120),
      box: box(el, origin),
      hex: { color: hex(s.color), background: bg(el), border: border(el), on: backdrop(el), paint: s.backgroundImage.includes("gradient") ? "gradient" : s.backgroundImage.includes("url(") ? "image" : null },
      style,
    };
  };

  /** Marks an element so Playwright can photograph it. */
  const mark = (el, key) => { if (el) el.setAttribute("data-extract", key); return el; };

  let buttonLooks = [];
  function pickElements() {
    const all = [...document.querySelectorAll("body *")].filter(visible);
    const first = (sel, test = () => true) => [...document.querySelectorAll(sel)].find((el) => visible(el) && test(el));
    const picked = { body: document.body };
    for (const h of ["h1", "h2", "h3", "h4"]) picked[h] = first(h, (el) => text(el).length > 1);
    picked.paragraph = first("main p, p", (el) => text(el).length >= 40 && !inChrome(el) && !el.closest("nav"));
    const luminance = (h) => rgb(h).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const page = luminance(backdrop(document.body));
    // On the page itself: no fill under it, and ink that would be readable on the page's own colour.
    const onPage = (el) => backdrop(el) === backdrop(document.body) && Math.abs(luminance(hex(getComputedStyle(el).color)) - page) > 80;
    picked.link =
      first("p a", (el) => text(el).length > 1 && !inChrome(el) && onPage(el)) ??
      first("main a, a", (el) => text(el).length > 1 && !bg(el) && !border(el) && !el.closest("nav, header") && !inChrome(el));

    // Buttons: short, button-sized, filled or bordered. Primary is the most colourful fill,
    // secondary the next different fill, ghost a bordered one with no fill.
    const buttons = [...document.querySelectorAll("a, button, [role=button], input[type=submit]")].filter((el) => {
      if (!visible(el) || inChrome(el)) return false;
      const r = el.getBoundingClientRect();
      const t = text(el) || el.value || "";
      return t.length > 0 && t.length <= 40 && r.height >= 28 && r.height <= 72 && r.width < 420 && (bg(el) || border(el));
    });
    const filled = buttons.filter((el) => bg(el) && bg(el) !== backdrop(el.parentElement ?? el));
    const byChroma = [...filled].sort((a, b) => chroma(bg(b)) - chroma(bg(a)));
    picked.buttonPrimary = chroma(bg(byChroma[0])) > 40 ? byChroma[0] : filled[0];
    // The second action stands out from the page most: on a light page, the darkest fill.
    picked.buttonSecondary = filled
      .filter((el) => bg(el) !== bg(picked.buttonPrimary))
      .sort((a, b) => Math.abs(luminance(bg(b)) - page) - Math.abs(luminance(bg(a)) - page))[0];
    picked.buttonGhost = buttons.find((el) => !bg(el) && border(el));
    // Every distinct button look, for the sizes: fill, height, radius, type, padding.
    const looks = new Map();
    for (const el of buttons) {
      const s = getComputedStyle(el);
      const look = { text: text(el).slice(0, 30), fill: bg(el), ink: hex(s.color), border: border(el), height: Math.round(el.getBoundingClientRect().height), radius: s.borderRadius, font: `${s.fontSize} ${s.fontWeight}`, paddingX: s.paddingLeft };
      const key = `${look.fill}|${look.border}|${look.height}|${look.radius}`;
      if (!looks.has(key)) looks.set(key, look);
    }
    buttonLooks = [...looks.values()].slice(0, 12);

    picked.input = first("input[type=email], input[type=text], input:not([type]), input[type=search], textarea");

    // A card: a box with a radius and a border or its own fill, holding a heading or a paragraph.
    picked.card = all.find((el) => {
      if (inChrome(el) || el.closest("nav, header")) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 200 || r.width > 720 || r.height < 120 || r.height > 900) return false;
      const s = getComputedStyle(el);
      if (parseFloat(s.borderTopLeftRadius) <= 0) return false;
      const own = border(el) || (bg(el) && bg(el) !== backdrop(el.parentElement ?? el));
      return own && el.querySelector("h2, h3, h4, h5, h6, p");
    });

    // A label: small text in capitals or spaced out, not a link or a button.
    picked.label = all.find((el) => {
      const t = ownText(el);
      if (t.length < 2 || t.length > 40 || el.closest("a, button, nav, footer")) return false;
      const s = getComputedStyle(el);
      return parseFloat(s.fontSize) <= 14 && (s.textTransform === "uppercase" || parseFloat(s.letterSpacing) >= 0.5);
    });

    const out = {};
    for (const [key, el] of Object.entries(picked)) out[key] = el ? (mark(el, key), record(el)) : null;
    return { elements: out, buttons: buttonLooks };
  }

  /** Every full-width band with a background of its own, top to bottom. */
  function bands() {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.97 || r.height < 60) continue;
      const s = getComputedStyle(el);
      const image = s.backgroundImage !== "none" ? s.backgroundImage.slice(0, 160) : null;
      if (!bg(el) && !image) continue;
      const heading = el.querySelector("h1, h2, h3");
      out.push({ y: Math.round(r.y + scrollY), height: Math.round(r.height), tag: el.tagName.toLowerCase(), background: bg(el), image, heading: heading ? text(heading).slice(0, 80) : null });
    }
    // Nested elements that repeat their parent's paint add nothing.
    return out.filter((b, i) => !out.slice(0, i).some((a) => a.background === b.background && a.image === b.image && b.y >= a.y && b.y + b.height <= a.y + a.height));
  }

  /** How often each colour is used for text, fills and borders on what is visible. */
  function palette() {
    const count = { text: {}, fill: {}, border: {} };
    const add = (kind, h) => { if (h) count[kind][h] = (count[kind][h] ?? 0) + 1; };
    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el)) continue;
      if (ownText(el)) add("text", hex(getComputedStyle(el).color));
      add("fill", bg(el));
      add("border", border(el));
    }
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([colour, uses]) => ({ colour, uses }));
    return { text: top(count.text), fill: top(count.fill), border: top(count.border) };
  }

  /** Custom properties on :root: read from the computed style, which lists them in Chromium. */
  function rootVars() {
    const s = getComputedStyle(document.documentElement);
    const out = {};
    for (const name of s) {
      if (!name.startsWith("--")) continue;
      const value = s.getPropertyValue(name).trim().slice(0, 200);
      // A colour in lab(), oklch() or a name also as hex, so it can be compared.
      const asHex = CSS.supports("color", value) && !value.startsWith("#") ? hex(value) : null;
      out[name] = asHex ? `${value} (${asHex})` : value;
    }
    return out;
  }

  /** The first SVG in the header, as a file: the logo, if the site draws it inline. */
  function logo() {
    const header = document.querySelector("header, [role=banner], nav") ?? document.body;
    const svg = [...header.querySelectorAll("a svg, svg")].find((el) => visible(el) && el.getBoundingClientRect().width >= 40);
    if (!svg) {
      const img = [...header.querySelectorAll("img")].find(visible);
      return img ? { img: img.currentSrc || img.src, alt: img.alt } : null;
    }
    const copy = svg.cloneNode(true);
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    // currentColor resolves against the page; write the colour the logo is drawn in.
    return { svg: copy.outerHTML.replaceAll("currentColor", getComputedStyle(svg).color), color: hex(getComputedStyle(svg).color) };
  }

  function fontsInUse() {
    const used = new Set();
    for (const f of document.fonts) if (f.status === "loaded") used.add(`${f.family.replace(/"/g, "")} ${f.weight} ${f.style}`);
    return [...used];
  }

  const norm = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();

  /** A CSS path to an element, to find the same block again at another width. */
  const pathOf = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body; e = e.parentElement)
      parts.unshift(`${e.tagName.toLowerCase()}:nth-child(${[...e.parentElement.children].indexOf(e) + 1})`);
    return `body > ${parts.join(" > ")}`;
  };

  /**
   * The block that holds a heading. Climbs from the heading and stops at the first band:
   * as wide as the window, taller than the heading, with more in it than the heading. It
   * never climbs into a louder heading (a larger font), nor into another heading like this
   * one more than a screen away (the next section). `up` climbs that many more.
   */
  function findBlock(query, nth, selector, up = 0) {
    if (selector) {
      const el = [...document.querySelectorAll(selector)].filter(visible)[nth - 1];
      return el ? (mark(el, "section"), { found: true, heading: selector, path: pathOf(el) }) : { found: false, headings: [] };
    }
    const q = norm(query);
    const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(visible);
    let hits = headings.filter((h) => norm(text(h)) === q);
    if (!hits.length) hits = headings.filter((h) => norm(text(h)).includes(q));
    if (!hits.length)
      hits = [...document.querySelectorAll("body *")].filter(
        (el) => visible(el) && norm(text(el)).includes(q) && ![...el.children].some((c) => norm(text(c)).includes(q)),
      );
    const hit = hits[nth - 1];
    if (!hit) return { found: false, headings: headings.map((h) => `${h.tagName.toLowerCase()}: ${text(h).slice(0, 80)}`) };
    const size = (el) => parseFloat(getComputedStyle(el).fontSize);
    const top = (el) => el.getBoundingClientRect().top;
    const others = headings.filter((h) => h !== hit && !hit.contains(h) && !h.contains(hit));
    const stops = others.filter(
      (h) => size(h) > size(hit) * 1.05 ||
        (h.tagName === hit.tagName && Math.abs(size(h) - size(hit)) <= size(hit) * 0.05 && Math.abs(top(h) - top(hit)) > innerHeight),
    );
    const own = text(hit).length;
    let block = hit;
    for (let el = hit.parentElement; el && el !== document.body && el.tagName !== "MAIN"; el = el.parentElement) {
      if (stops.some((h) => el.contains(h))) break;
      block = el;
      const r = el.getBoundingClientRect();
      const more = el.querySelector("img, svg, picture, video, canvas") || text(el).length > own + 40;
      if (r.width >= innerWidth * 0.9 && r.height >= hit.getBoundingClientRect().height + 150 && more) break;
    }
    for (let i = 0; i < up && block.parentElement && block.parentElement !== document.body; i++) block = block.parentElement;
    mark(block, "section");
    return { found: true, matches: hits.length, heading: text(hit).slice(0, 80), path: pathOf(block) };
  }

  const marked = () => document.querySelector('[data-extract="section"]');

  function outline(block = marked()) {
    const out = [];
    const walk = (el) => {
      // A hidden element hides its children; a box of no size (display: contents, a
      // collapsed wrapper) may still hold visible ones.
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") return;
      if (!visible(el)) return [...el.children].forEach(walk);
      const tag = el.tagName.toLowerCase();
      if (tag === "img") return out.push({ tag, alt: el.alt, src: el.currentSrc || el.src });
      if (tag === "svg") { const r = el.getBoundingClientRect(); return out.push({ tag, size: `${Math.round(r.width)}×${Math.round(r.height)}` }); }
      if (["input", "textarea", "select"].includes(tag)) return out.push({ tag, type: el.type, placeholder: el.placeholder, value: el.value });
      const t = ownText(el);
      if (t) out.push({ tag, text: t, href: el.closest("a")?.getAttribute("href") ?? undefined });
      for (const child of el.children) walk(child);
    };
    walk(block);
    return out;
  }

  /** The block's images: <img>, <video> posters, CSS backgrounds; inline SVGs as markup. */
  function images(block = marked()) {
    const found = [];
    for (const el of [block, ...block.querySelectorAll("*")]) {
      if (!visible(el)) continue;
      const r = box(el, block);
      if (el.tagName === "IMG") found.push({ kind: "img", url: el.currentSrc || el.src, alt: el.alt, natural: `${el.naturalWidth}×${el.naturalHeight}`, box: r });
      if (el.tagName === "VIDEO") found.push({ kind: "video", url: el.currentSrc || el.src, poster: el.poster, box: r });
      const image = getComputedStyle(el).backgroundImage;
      for (const m of image.matchAll(/url\("?([^")]+)"?\)/g)) found.push({ kind: "background", url: m[1], box: r });
      if (el.tagName === "svg" && !el.parentElement.closest("svg") && (r.width >= 32 || r.height >= 32)) {
        const copy = el.cloneNode(true);
        copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        found.push({ kind: "svg", markup: copy.outerHTML.replaceAll("currentColor", getComputedStyle(el).color), box: r });
      }
    }
    return found;
  }

  /** Computed styles of what the block draws: text, boxes with their own paint, layouts. */
  function blockStyles(block = marked()) {
    const out = [record(block, block)];
    for (const el of block.querySelectorAll("*")) {
      if (!visible(el) || el.closest("svg")) continue;
      const s = getComputedStyle(el);
      const paints = bg(el) || border(el) || s.boxShadow !== "none" || parseFloat(s.borderTopLeftRadius) > 0;
      const lays = (s.display.includes("grid") || s.display.includes("flex")) && el.children.length >= 2;
      if (ownText(el) || paints || lays || el.tagName === "IMG") out.push(record(el, block));
      if (out.length >= 150) break;
    }
    return out;
  }

  /** One of our component pages: every state cell, its label and the component inside it. */
  function stateCells() {
    const cells = [...document.querySelectorAll("[data-ds-state]")].filter(visible);
    const labels = cells.map((c) => c.getAttribute("data-ds-state"));
    const repeated = new Set(labels.filter((l, i) => labels.indexOf(l) !== i));
    return cells.map((cell, i) => {
      // "hover" three times on the Button page: name it after the first cell of its row ("primary · hover").
      const row = cell.parentElement.querySelector("[data-ds-state]");
      const label = repeated.has(labels[i]) && row !== cell ? `${row.getAttribute("data-ds-state")} · ${labels[i]}` : labels[i];
      const stage = cell.firstElementChild;
      const target =
        stage.querySelector("[data-state]") ??
        stage.querySelector("input, textarea, select, button, a, summary, details, article, figure") ??
        stage.firstElementChild ?? stage;
      mark(stage, `cell-${i}`);
      return { label, ...record(target) };
    });
  }

  /** Stock of the whole page: every colour (with where it was seen), radius, shadow, size, weight. */
  function inventory() {
    const colours = {};
    const tally = { radii: {}, radiiWhere: {}, shadows: {}, sizes: {}, weights: {} };
    const count = (map, key) => { if (key) map[key] = (map[key] ?? 0) + 1; };
    const where = (el) => {
      const t = ownText(el) || el.getAttribute("aria-label") || el.getAttribute("alt") || "";
      return `${el.tagName.toLowerCase()}${t ? ` "${t.slice(0, 32)}"` : ""}`;
    };
    const add = (h, as, el) => {
      if (!h) return;
      const c = (colours[h] ??= { uses: 0, as: {}, seen: [] });
      c.uses++;
      c.as[as] = (c.as[as] ?? 0) + 1;
      if (c.seen.length < 3) c.seen.push(`${as}: ${where(el.closest("svg") ?? el)}`);
    };
    for (const el of document.querySelectorAll("body *")) {
      if (fixedOverlay(el)) continue;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (el instanceof SVGElement) {
        if (el.tagName !== "svg" && el.tagName !== "g") {
          if (s.fill !== "none") add(hex(s.fill), "svg", el);
          if (s.stroke !== "none") add(hex(s.stroke), "svg", el);
        }
        continue;
      }
      if (ownText(el)) {
        add(hex(s.color), "text", el);
        count(tally.sizes, s.fontSize);
        count(tally.weights, s.fontWeight);
      }
      add(bg(el), "fill", el);
      add(border(el), "border", el);
      if (parseFloat(s.borderTopLeftRadius) > 0 || parseFloat(s.borderTopRightRadius) > 0) {
        // A pill's radius computes to a huge number: call it what it is.
        const radius = s.borderRadius.split(" ").map((v) => (parseFloat(v) > 999 ? "full" : v)).join(" ");
        count(tally.radii, radius);
        if ((tally.radiiWhere[radius] ??= []).length < 3) tally.radiiWhere[radius].push(where(el));
      }
      // Tailwind's empty ring shadows are transparent: not a shadow anyone sees.
      const layers = s.boxShadow === "none" ? [] : s.boxShadow.split(/,(?![^(]*\))/);
      if (layers.some((l) => !/rgba\([^)]*,\s*0\)|transparent/.test(l))) count(tally.shadows, s.boxShadow);
    }
    return { colours, ...tally };
  }

  window.__ex = { inventory, pickElements, bands, palette, rootVars, logo, fontsInUse, findBlock, outline, images, blockStyles, stateCells };
}

/** @font-face rules and media-query widths, from every stylesheet the page loaded and its <style> tags. */
async function readCss(page, css) {
  const inline = await page.evaluate(() => [...document.querySelectorAll("style")].map((s) => s.textContent));
  const sheets = [...css, ...inline.map((text) => ({ url: page.url(), text }))];
  const faces = [];
  const widths = {};
  // What the stylesheets define, used or not: colour literals (and which appear in a :hover
  // rule), radii, shadows, custom properties.
  const stock = { colours: {}, hover: new Set(), radii: {}, shadows: {}, customProperties: 0 };
  const colourLiteral = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^()]*\)/gi;
  const tally = (map, key) => { map[key] = (map[key] ?? 0) + 1; };
  for (const { text } of sheets) {
    for (const [c] of text.matchAll(colourLiteral)) tally(stock.colours, c.toLowerCase());
    for (const [rule] of text.matchAll(/:hover[^{]*{[^}]*}/g)) for (const [c] of rule.matchAll(colourLiteral)) stock.hover.add(c.toLowerCase());
    for (const m of text.matchAll(/border(?:-[a-z]+)*-radius:\s*([^;}!]+)/g)) tally(stock.radii, m[1].trim());
    for (const m of text.matchAll(/(?<![-\w])box-shadow:\s*([^;}!]+)/g)) if (m[1].trim() !== "none") tally(stock.shadows, m[1].trim());
    stock.customProperties += (text.match(/(?:^|[;{\s])--[\w-]+\s*:/g) ?? []).length;
  }
  // Every literal as hex, by the browser, so `rgb(228 242 34)` and `#e4f222` are one colour.
  const literals = Object.keys(stock.colours);
  const asHex = await page.evaluate((list) => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    return list.map((c) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = c;
      if (ctx.fillStyle === "#000000" && !/^#0{3,8}$|^rgba?\(0,\s*0,\s*0/.test(c)) return null;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      if (a === 0) return null;
      const h = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
      return a < 255 ? h + a.toString(16).padStart(2, "0") : h;
    });
  }, literals);
  const colours = {};
  const hover = new Set();
  literals.forEach((c, i) => {
    if (!asHex[i]) return;
    colours[asHex[i]] = (colours[asHex[i]] ?? 0) + stock.colours[c];
    if (stock.hover.has(c)) hover.add(asHex[i]);
  });
  Object.assign(stock, { colours, hover: [...hover] });
  for (const { url: base, text } of sheets) {
    for (const [rule] of text.matchAll(/@font-face\s*{[^}]*}/g)) {
      const family = rule.match(/font-family:\s*["']?([^;"']+)/)?.[1]?.trim();
      const weight = rule.match(/font-weight:\s*([^;}]+)/)?.[1]?.trim();
      const style = rule.match(/font-style:\s*([^;}]+)/)?.[1]?.trim();
      const files = [...rule.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => {
        try { return new URL(m[1], base).href; } catch { return m[1]; }
      }).filter((f) => !f.startsWith("data:"));
      if (family) faces.push({ family, weight, style, files });
    }
    for (const m of text.matchAll(/@media[^{]*?\((?:min|max)-width:\s*([\d.]+)(px|rem|em)\)/g)) {
      const px = Math.round(m[2] === "px" ? +m[1] : +m[1] * 16);
      widths[px] = (widths[px] ?? 0) + 1;
    }
  }
  const unique = [...new Map(faces.map((f) => [`${f.family}|${f.weight}|${f.style}|${f.files[0]}`, f])).values()];
  const breakpoints = Object.entries(widths).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([px, uses]) => ({ px: +px, uses }));
  return { faces: unique, breakpoints, stock };
}

const short = (r) => {
  if (!r) return "—";
  const s = r.style;
  const family = s["font-family"].split(",")[0].replace(/"/g, "");
  const borderNote = r.hex.border ? ` border ${s["border-top-width"]} ${r.hex.border}` : "";
  return `${family} ${s["font-size"]}/${s["line-height"]} ${s["font-weight"]} · ink ${r.hex.color} · fill ${r.hex.background ?? "none"}${borderNote} · radius ${s["border-radius"]} · ${r.box.width}×${r.box.height}`;
};

async function shoot(page, key, file, { margin: around = 12 } = {}) {
  const el = page.locator(`[data-extract="${key}"]`).first();
  if (!(await el.count())) return false;
  try {
    // A sticky header scrolled over the element would be in its photo: hide what is pinned
    // and not part of it, then bring it back.
    await el.evaluate((target) => {
      for (const e of document.querySelectorAll("body *")) {
        const position = getComputedStyle(e).position;
        if ((position === "fixed" || position === "sticky") && !e.contains(target) && !target.contains(e)) {
          e.dataset.extractHidden = e.style.visibility;
          e.style.visibility = "hidden";
        }
      }
    });
    await el.scrollIntoViewIfNeeded({ timeout: 5000 });
    await page.waitForTimeout(400);
    // A small element keeps a margin of what is around it; a block is cut at its edges.
    const b = await el.boundingBox();
    const margin = b && b.height < 240 && b.width < 900 ? around : 0;
    if (margin) await page.screenshot({ path: file, animations: "disabled", clip: { x: Math.max(0, b.x - margin), y: Math.max(0, b.y - margin), width: b.width + margin * 2, height: b.height + margin * 2 } });
    else await el.screenshot({ path: file, timeout: 15_000, animations: "disabled" });
    await page.evaluate(() => {
      for (const e of document.querySelectorAll("[data-extract-hidden]")) {
        e.style.visibility = e.dataset.extractHidden;
        delete e.dataset.extractHidden;
      }
    });
    return true;
  } catch {
    return false;
  }
}

// ── The whole page ────────────────────────────────────────────────────────────

async function wholePage(target) {
  const pageDir = dirFor(target);
  const result = { url: target, read: new Date().toISOString().slice(0, 10), widths: {} };
  for (const width of [1440, 768, 375]) {
    const dir = join(pageDir, String(width));
    mkdirSync(dir, { recursive: true });
    const { page, css, close } = await open(width, target);
    const { elements, buttons } = await page.evaluate(() => window.__ex.pickElements());
    const data = {
      elements,
      buttons,
      bands: await page.evaluate(() => window.__ex.bands()),
      palette: await page.evaluate(() => window.__ex.palette()),
    };
    if (width === 1440) {
      result.title = await page.title();
      result.inventory = await page.evaluate(() => window.__ex.inventory());
      result.rootVars = await page.evaluate(() => window.__ex.rootVars());
      result.fontsLoaded = await page.evaluate(() => window.__ex.fontsInUse());
      const { stock, ...fonts } = await readCss(page, css);
      Object.assign(result, fonts);
      result.inventory.css = stock;
      const logo = await page.evaluate(() => window.__ex.logo());
      if (logo?.svg) writeFileSync(join(pageDir, "logo.svg"), logo.svg);
      result.logo = logo?.svg ? { file: join(pageDir, "logo.svg"), color: logo.color } : logo;
    }
    for (const key of Object.keys(elements)) if (elements[key] && key !== "body") await shoot(page, key, join(dir, `${key}.png`));
    await page.screenshot({ path: join(dir, "page.png"), fullPage: true });
    result.widths[width] = data;
    await close();
  }
  writeFileSync(join(pageDir, "extract.json"), JSON.stringify(result, null, 2));
  if (target !== url) return console.log(`${target} → ${pageDir}/`), result;

  const at = result.widths[1440];
  console.log(`${result.title}\n${url} → ${pageDir}/\n`);
  console.log("Elements at 1440 (768 and 375 in extract.json; crops in 1440/, 768/, 375/):");
  for (const [key, r] of Object.entries(at.elements)) console.log(`  ${key.padEnd(16)} ${short(r)}${r?.text && key !== "body" ? `  "${r.text.slice(0, 40)}"` : ""}`);
  console.log(`\nButton looks: ${at.buttons.map((b) => `${b.fill ?? "none"}${b.border ? `/border ${b.border}` : ""} ${b.height}px r${b.radius} "${b.text}"`).join(" · ")}`);
  console.log(`Bands (${at.bands.length}): ${at.bands.slice(0, 14).map((b) => b.background ?? "image").join(" · ")}`);
  console.log(`Text colours: ${at.palette.text.slice(0, 8).map((c) => `${c.colour}×${c.uses}`).join(" ")}`);
  console.log(`Fills:        ${at.palette.fill.slice(0, 8).map((c) => `${c.colour}×${c.uses}`).join(" ")}`);
  console.log(`Borders:      ${at.palette.border.slice(0, 6).map((c) => `${c.colour}×${c.uses}`).join(" ")}`);
  const families = [...new Set(result.faces.map((f) => f.family))];
  console.log(`Fonts: ${families.join(", ") || "none declared"} (loaded: ${result.fontsLoaded.slice(0, 6).join(", ")})`);
  console.log(`CSS switches at: ${result.breakpoints.map((b) => `${b.px}px×${b.uses}`).join(" ")}`);
  console.log(`:root custom properties: ${Object.keys(result.rootVars).length}`);
  console.log(`Logo: ${result.logo?.file ?? result.logo?.img ?? "none found in the header"}\n`);
  return result;
}

/** The site's stock across the pages given: what is seen on them, and what their CSS defines. */
async function wholeSite() {
  const started = Date.now();
  const read = [];
  for (const target of pages) read.push(await wholePage(target));

  // Add the pages up: counts summed, where-seen kept with the page it was on.
  const colours = {};
  const sums = { radii: {}, shadows: {}, sizes: {}, weights: {}, cssRadii: {}, cssShadows: {} };
  const radiusWhere = {};
  const add = (map, k, v) => { map[k] = (map[k] ?? 0) + v; };
  const entry = (h) => (colours[h] ??= { colour: h, seen: 0, css: 0, hover: false, as: {}, pages: [], where: [] });
  let customProperties = 0;
  for (const { url: where, inventory: inv } of read) {
    const path = new URL(where).pathname;
    for (const [h, c] of Object.entries(inv.colours)) {
      const all = entry(h);
      all.seen += c.uses;
      for (const [k, v] of Object.entries(c.as)) add(all.as, k, v);
      all.pages.push(path);
      for (const seen of c.seen) if (all.where.length < 4) all.where.push(`${path} ${seen}`);
    }
    for (const [h, n] of Object.entries(inv.css.colours)) entry(h).css += n;
    for (const h of inv.css.hover) entry(h).hover = true;
    for (const key of ["radii", "shadows", "sizes", "weights"]) for (const [k, v] of Object.entries(inv[key])) add(sums[key], k, v);
    for (const [k, list] of Object.entries(inv.radiiWhere)) for (const w of list) if ((radiusWhere[k] ??= []).length < 3) radiusWhere[k].push(`${path} ${w}`);
    for (const [k, v] of Object.entries(inv.css.radii)) add(sums.cssRadii, k, v);
    for (const [k, v] of Object.entries(inv.css.shadows)) add(sums.cssShadows, k, v);
    customProperties = Math.max(customProperties, inv.css.customProperties);
  }
  const sorted = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([value, uses]) => ({ value, uses }));
  const hue = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return Math.max(...c) - Math.min(...c) > 40; };
  const all = Object.values(colours).map((c) => ({ ...c, hue: hue(c.colour) }));
  const inventory = {
    pages: read.map((r) => r.url),
    // Seen on the pages, most used first; then what only the CSS defines (hover states, leftovers).
    colours: all.filter((c) => c.seen).sort((a, b) => b.seen - a.seen),
    coloursOnlyInCss: all.filter((c) => !c.seen).sort((a, b) => b.css - a.css).slice(0, 80),
    radii: sorted(sums.radii).map((r) => ({ ...r, where: radiusWhere[r.value] })),
    radiiInCss: sorted(sums.cssRadii).slice(0, 30),
    shadows: sorted(sums.shadows),
    shadowsInCss: sorted(sums.cssShadows).slice(0, 20),
    fontSizes: sorted(sums.sizes),
    fontWeights: sorted(sums.weights),
    customProperties,
  };
  writeFileSync(join(pageDir, "extract.json"), JSON.stringify({ ...read[0], inventory }, null, 2));

  const list = (items, n, f) => items.slice(0, n).map(f).join("  ") || "none";
  const mark = (c) => `${c.colour}×${c.seen}${c.css ? ` css${c.css}` : ""}${c.hover ? " hover" : ""}`;
  console.log(`Inventory of ${inventory.pages.length} page(s), in ${pageDir}/extract.json → inventory (×seen on the pages, css = defined in the stylesheets):`);
  console.log(`  colours seen (${inventory.colours.length}): ${list(inventory.colours, 12, mark)}`);
  console.log(`  with a hue: ${list(inventory.colours.filter((c) => c.hue), 12, (c) => `${mark(c)} (${Object.keys(c.as).join("/")})`)}`);
  console.log(`  only in CSS, with a hue: ${list(inventory.coloursOnlyInCss.filter((c) => c.hue), 10, (c) => `${c.colour} css${c.css}${c.hover ? " hover" : ""}`)}`);
  console.log(`  radii seen: ${list(inventory.radii, 10, (r) => `${r.value}×${r.uses}`)}`);
  console.log(`  radii in CSS: ${list(inventory.radiiInCss, 10, (r) => `${r.value}×${r.uses}`)}`);
  console.log(`  shadows seen: ${list(inventory.shadows, 3, (r) => `${r.value.slice(0, 50)}×${r.uses}`)}`);
  console.log(`  font sizes: ${list(inventory.fontSizes, 12, (r) => `${r.value}×${r.uses}`)}`);
  console.log(`  weights: ${list(inventory.fontWeights, 6, (r) => `${r.value}×${r.uses}`)}  · ${customProperties} custom properties in CSS`);
  console.log(`  read in ${Math.round((Date.now() - started) / 1000)}s`);
}

// ── One section ───────────────────────────────────────────────────────────────

async function oneSection() {
  const dir = join(pageDir, "sections", slug(selector ?? sectionQuery) + (nth > 1 ? `-${nth}` : ""));
  mkdirSync(dir, { recursive: true });
  const result = { url, query: sectionQuery, selector, read: new Date().toISOString().slice(0, 10), widths: {} };
  for (const width of [1440, 768, 375]) {
    const { page, close } = await open(width);
    // Found once at 1440, then the same element at the other widths (layouts change, the DOM rarely does).
    let found = await page.evaluate(([q, n, s, u]) => window.__ex.findBlock(q, n, s, u), result.path
      ? [null, 1, result.path, 0] : [sectionQuery, nth, selector, up]);
    if (!found.found && result.path) found = await page.evaluate(([q, n, s, u]) => window.__ex.findBlock(q, n, s, u), [sectionQuery, nth, selector, up]);
    if (!found.found) {
      await close();
      if (width === 1440) {
        console.error(`No block for "${selector ?? sectionQuery}" on ${url}. Headings on the page:`);
        for (const h of found.headings) console.error(`  ${h}`);
        await browser.close();
        process.exit(1);
      }
      console.error(`  not found at ${width}`);
      continue;
    }
    result.heading ??= found.heading;
    result.path ??= found.path;
    result.matches ??= found.matches;
    result.widths[width] = {
      styles: await page.evaluate(() => window.__ex.blockStyles()),
    };
    if (width === 1440) {
      result.outline = await page.evaluate(() => window.__ex.outline());
      result.images = await page.evaluate(() => window.__ex.images());
      await download(page, result.images, join(dir, "images"));
    }
    await shoot(page, "section", join(dir, `section-${width}.png`));
    const steps = await scrollSteps(page, join(dir, `section-${width}`));
    if (steps) result.steps = steps;
    await close();
  }
  writeFileSync(join(dir, "section.json"), JSON.stringify(result, null, 2));
  const lines = result.outline.map((o) =>
    o.tag === "img" ? `[img] ${o.alt || "(no alt)"}` :
    o.tag === "svg" ? `[svg ${o.size}]` :
    o.text ? `${o.tag}${o.href ? ` → ${o.href}` : ""}: ${o.text}` : `[${o.tag} ${o.type ?? ""}] ${o.placeholder ?? ""}`,
  );
  writeFileSync(join(dir, "copy.md"), `# ${result.heading}\n\n${url}\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`);

  console.log(`"${result.heading}" on ${url} → ${dir}/`);
  if (result.matches > 1) console.log(`  ${result.matches} blocks match; this is number ${nth} (--nth picks another).`);
  const top = result.widths[1440]?.styles[0];
  console.log(`  block at 1440: ${top?.box.width}×${top?.box.height}, fill ${top?.hex.background ?? "none"}, on ${top?.hex.on}`);
  const painted = result.widths[1440]?.styles.filter((r) => r.hex.paint).length;
  if (painted) console.log(`  ${painted} elements are painted with a gradient or an image (background-image in section.json)`);
  if (result.steps) console.log(`  it moves on scroll: ${result.steps} steps per width in section-<width>-step-<n>.png`);
  console.log(`  screenshots: section-1440.png, section-768.png, section-375.png`);
  console.log(`  copy (copy.md), ${lines.length} lines:`);
  for (const line of lines.slice(0, 14)) console.log(`    ${line.slice(0, 110)}`);
  if (lines.length > 14) console.log(`    … ${lines.length - 14} more`);
  const saved = result.images.filter((i) => i.file).length;
  console.log(`  images: ${result.images.length} found, ${saved} saved to images/; styles of ${result.widths[1440]?.styles.length} elements per width in section.json`);
}

/**
 * A block pinned (sticky) while the page scrolls past it usually animates through steps,
 * so one screenshot catches it halfway. Photograph it at four points of that scroll.
 */
async function scrollSteps(page, prefix) {
  const range = await page.evaluate(() => {
    const block = document.querySelector('[data-extract="section"]');
    const candidates = [block, ...block.querySelectorAll("*")];
    for (let e = block.parentElement, i = 0; e && i < 3; e = e.parentElement, i++) candidates.push(e);
    const pinned = candidates.find((e) => getComputedStyle(e).position === "sticky");
    if (!pinned) return null;
    pinned.setAttribute("data-extract-pinned", "");
    // The page closes after this, so what else is pinned (the header) is simply hidden.
    for (const e of document.querySelectorAll("body *")) {
      const position = getComputedStyle(e).position;
      if ((position === "fixed" || position === "sticky") && !e.contains(pinned) && !pinned.contains(e)) e.style.visibility = "hidden";
    }
    const track = pinned.parentElement.getBoundingClientRect();
    const start = track.top + scrollY;
    const length = track.height - pinned.getBoundingClientRect().height;
    return length > innerHeight / 2 ? { start, length } : null;
  });
  if (!range) return 0;
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    await page.evaluate((y) => scrollTo(0, y), range.start + (range.length * i) / (steps - 1));
    await page.waitForTimeout(700);
    const b = await page.locator("[data-extract-pinned]").boundingBox();
    if (b) await page.screenshot({ path: `${prefix}-step-${i + 1}.png`, clip: { x: b.x, y: Math.max(0, b.y), width: b.width, height: Math.min(b.height, 900) } });
  }
  return steps;
}

async function download(page, images, dir) {
  mkdirSync(dir, { recursive: true });
  const seen = new Map();
  let n = 0;
  for (const image of images) {
    if (image.kind === "svg") {
      image.file = join(dir, `${String(++n).padStart(2, "0")}-inline.svg`);
      writeFileSync(image.file, image.markup);
      delete image.markup;
      continue;
    }
    for (const key of ["url", "poster"]) {
      const src = image[key];
      if (!src || src.startsWith("data:")) continue;
      if (seen.has(src)) { image.file = seen.get(src); continue; }
      try {
        // Ask for modern formats: some sites send a transparent WebP only when asked for it.
        const response = await page.request.get(src, { timeout: 30_000, headers: { Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" } });
        if (!response.ok()) continue;
        const body = await response.body();
        if (body.length > 15_000_000) continue;
        const type = response.headers()["content-type"] ?? "";
        const ext = type.includes("svg") ? "svg" : type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("avif") ? "avif" : type.includes("gif") ? "gif" : type.includes("mp4") ? "mp4" : "jpg";
        const name = basename(new URL(src).pathname).replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9-]+/gi, "-").slice(0, 40) || "image";
        const file = join(dir, `${String(++n).padStart(2, "0")}-${name}.${ext}`);
        writeFileSync(file, body);
        seen.set(src, file);
        image[key === "url" ? "file" : "posterFile"] = file;
      } catch {}
    }
  }
}

// ── Our component page, every state ───────────────────────────────────────────

/** Which of the source's elements a component of ours is compared with. */
const COUNTERPARTS = {
  button: ["buttonPrimary", "buttonSecondary", "buttonGhost"],
  "arrow-button": ["buttonGhost"],
  input: ["input"], textarea: ["input"], "email-capture": ["input", "buttonPrimary"],
  card: ["card"], "quote-card": ["card"], "faq-item": ["h4"],
  link: ["link"], tagline: ["label"], chip: ["label"], badge: ["label"],
  heading: ["h1", "h2", "h3", "h4"], "section-header": ["h2", "paragraph"],
};

async function componentStates() {
  const name = new URL(url).pathname.split("/").filter(Boolean).pop();
  mkdirSync(pageDir, { recursive: true });
  const { page, close } = await open(1440);
  const cells = await page.evaluate(() => window.__ex.stateCells());
  if (!cells.length) {
    console.error("No state cells on this page. --states reads /design-system/components/<name> pages.");
    process.exit(1);
  }
  for (let i = 0; i < cells.length; i++) await shoot(page, `cell-${i}`, join(pageDir, `${i}-${slug(cells[i].label)}.png`), { margin: 0 });
  await close();
  writeFileSync(join(pageDir, "states.json"), JSON.stringify(cells, null, 2));

  const row = (label, r) => {
    const s = r.style;
    return [label, `${r.box.height}`, s["border-radius"], `${s["font-size"]} ${s["font-weight"]}`, r.hex.color, r.hex.background ?? "—", r.hex.border ?? "—", s["padding-left"], s.opacity];
  };
  const rows = [["", "height", "radius", "font", "ink", "fill", "border", "pad-x", "opacity"]];
  const crops = [];
  if (vs) {
    const source = JSON.parse(readFileSync(join(vs, "extract.json"), "utf8"));
    for (const key of COUNTERPARTS[name] ?? []) {
      const r = source.widths[1440].elements[key];
      if (!r) continue;
      rows.push(row(`source ${key}`, r));
      const crop = join(vs, "1440", `${key}.png`);
      if (existsSync(crop)) crops.push({ label: `source ${key}`, file: crop });
    }
  }
  cells.forEach((c, i) => {
    rows.push(row(`ours ${c.label}`, c));
    crops.push({ label: `ours ${c.label}`, file: join(pageDir, `${i}-${slug(c.label)}.png`) });
  });
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  console.log(`${name}: ${cells.length} states → ${pageDir}/`);
  for (const r of rows) console.log("  " + r.map((v, i) => String(v).padEnd(widths[i])).join("  "));
  // A site's buttons come in sizes: list every look it uses, to set sm, md and lg from.
  if (vs && name === "button") {
    const source = JSON.parse(readFileSync(join(vs, "extract.json"), "utf8"));
    console.log("  every button on the source page:");
    for (const b of source.widths[1440].buttons ?? [])
      console.log(`    ${String(b.height).padStart(3)}px  r ${b.radius}  ${b.font}  pad-x ${b.paddingX}  fill ${b.fill ?? "none"}${b.border ? `  border ${b.border}` : ""}  "${b.text}"`);
  }

  if (vs) {
    const tiles = crops.filter((c) => existsSync(c.file)).map((c) =>
      `<figure><img src="data:image/png;base64,${readFileSync(c.file).toString("base64")}"><figcaption>${c.label}</figcaption></figure>`).join("");
    const sheet = await browser.newPage({ viewport: { width: 1440, height: 400 } });
    await sheet.setContent(`<body style="margin:0;padding:24px;font:13px system-ui;background:#fff;display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">
      <style>figure{margin:0;display:flex;flex-direction:column;gap:6px;max-width:640px}img{max-width:640px;border:1px dashed #ccc}</style>${tiles}</body>`);
    await sheet.screenshot({ path: join(pageDir, "compare.png"), fullPage: true });
    console.log(`  side by side: ${join(pageDir, "compare.png")}`);
  }
}

try {
  if (states) await componentStates();
  else if (sectionQuery || selector) await oneSection();
  else await wholeSite();
} finally {
  await browser.close();
}
