// Where the installed GTM Brain came from, and which version that source holds now. A Git source is
// fetched shallowly into a bare cache under CODEX_HOME (one ref, a few seconds, 20 s cap); a local
// checkout is read from disk. check-version.mjs asks it daily for the dashboard and the hook;
// update.mjs asks it to make sure Codex's marketplace copy is not behind the source before installing.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const run = (cmd, args, ms = 20000) => execFileSync(cmd, args, { encoding: "utf8", timeout: ms, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 4 * 1024 * 1024 });
const versionOf = json => { try { return JSON.parse(json).version || null; } catch { return null; } };

/* gtm-week/onboarding shipped GTM Brain until 0.26.0 and its context-v0 branch stays frozen there.
   An install from it is pointed at the repository that ships: check-version reads the latest
   release from there, update.mjs moves the configured source. */
export const SHIPPING_SOURCE = "gtm-week/gtm-brain";
export const retiredSource = src => /(^|github\.com[/:])gtm-week\/onboarding(\.git)?\/?$/.test(src || "");

/* owner/repo is GitHub; anything else is a URL or a path git can fetch from. */
export const sourceUrl = src => /^[\w.-]+\/[\w.-]+$/.test(src) ? `https://github.com/${src}` : src;

/* The plugin version at the source: { version } or { error }. A Git fetch that fails (no credentials, offline)
   is reported, never thrown, so a caller can say what it could not check. */
export function sourceVersion({ type, source, ref = null, codexHome }) {
  try {
    if (!source) return { error: "the marketplace source has no location" };
    if (type === "local") {
      const v = versionOf(readFileSync(join(source, "plugins", "gtm-brain", ".codex-plugin", "plugin.json"), "utf8"));
      return v ? { version: v } : { error: "the checkout has no readable plugin.json" };
    }
    const cache = join(codexHome, "gtm-brain", "source.git"); mkdirSync(cache, { recursive: true });
    if (!existsSync(join(cache, "HEAD"))) run("git", ["init", "-q", "--bare", cache]);
    run("git", ["-C", cache, "fetch", "-q", "--depth", "1", sourceUrl(source), ref || "HEAD"], 20000);
    const v = versionOf(run("git", ["-C", cache, "cat-file", "-p", "FETCH_HEAD:plugins/gtm-brain/.codex-plugin/plugin.json"]));
    return v ? { version: v } : { error: "the source has no readable plugin.json" };
  } catch (e) {
    return { error: String(e && e.message || e).split("\n")[0].slice(0, 160) };
  }
}
