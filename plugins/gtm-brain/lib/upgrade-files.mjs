// Protect locally edited instructions before refreshing plugin-owned files.
import { existsSync, readFileSync, readdirSync, mkdirSync, copyFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { readAdmin, readNames, commit } from "./brain.mjs";

// Shared with the upgrade matrix tests. Aliases point to the same immutable snapshot.
export const legacyTemplates = JSON.parse(readFileSync(new URL("../templates/legacy/manifest.json", import.meta.url), "utf8"));

/* Why the rules changed, one line per release that changed them (the version that shipped the
   change). Every template change adds a line here: an offer to refresh says what it fixes. */
export const rulesWhy = JSON.parse(readFileSync(new URL("../templates/legacy/why.json", import.meta.url), "utf8"));
const versionParts = v => String(v).split(/[^0-9]+/).filter(Boolean).map(Number);
const newer = (a, b) => { const x = versionParts(a), y = versionParts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
/* Every step upgrade.sh runs besides the rules existed by this version, so rules this new mean those
   steps have already run. A new migration step in upgrade.sh raises this number. */
const MIGRATIONS_THROUGH = "0.31.0";
const shippedMatches = (templates, company, current) => {
  const render = file => readFileSync(join(templates, "legacy", file), "utf8").replaceAll("{{COMPANY}}", company);
  return Object.entries(legacyTemplates).filter(([, file]) => render(file) === current).map(([v]) => v);
};
/* The newest shipped version whose rules the brain's AGENTS.md matches (null when current, custom
   or missing) and the reasons for every rule change since then, oldest first. */
export function rulesReasons(root, templates) {
  const company = readAdmin(root)?.company; const path = join(root, "AGENTS.md");
  if (!company || !existsSync(path)) return { from: null, reasons: [] };
  const current = readFileSync(path, "utf8");
  if (current === readFileSync(join(templates, "AGENTS.md"), "utf8").replaceAll("{{COMPANY}}", company)) return { from: null, reasons: [] };
  const matches = shippedMatches(templates, company, current);
  if (!matches.length) return { from: null, reasons: [] };
  const from = matches.reduce((a, b) => (newer(b, a) ? b : a));
  const reasons = Object.entries(rulesWhy).filter(([v]) => newer(v, from)).sort(([a], [b]) => (newer(a, b) ? 1 : -1)).map(([, why]) => why);
  return { from, reasons };
}
/* The session hook's one-line offer for a legacy brain, with its reasons; "" for any other state. */
export function rulesOffer(root, templates) {
  if (rulesState(root, templates) !== "legacy") return "";
  const { from, reasons } = rulesReasons(root, templates);
  const why = reasons.length ? reasons.join("; ") : "they name tools and habits the plugin has moved on from";
  return `GTM Brain: this brain's rules (AGENTS.md) are from GTM Brain ${from}. What the newer rules change: ${why}. Offer once, in one line, to refresh the rules (upgrade_brain, gtm-brain-configure), and say why in plain words from that list, the reason that matters most for this person first; it backs the old file up and keeps local edits.`;
}

/* Session start: rules that are exactly an older shipped version are refreshed here ("why i have to
   do it? it should be automatic", Maciej, 2026-11-07). Only AGENTS.md: moving or adding the person's
   files needs their yes, so a brain with migrations still to run keeps the offer, as does a run with
   nobody present. The old file is backed up. */
export function autoRefresh(root, templates) {
  if (rulesState(root, templates) !== "legacy") return "";
  const { from, reasons } = rulesReasons(root, templates);
  if (process.env.GTM_BRAIN_RUN || newer(MIGRATIONS_THROUGH, from)) return rulesOffer(root, templates);
  let backup;
  try {
    const prepared = prepareUpgrade(root, templates);
    if (!prepared.ready) return rulesOffer(root, templates);
    backup = prepared.backup;
    writeFileSync(join(root, "AGENTS.md"), readFileSync(join(templates, "AGENTS.md"), "utf8").replaceAll("{{COMPANY}}", readAdmin(root).company));
  } catch { return rulesOffer(root, templates); }
  commit(root, ["AGENTS.md"], "upgrade: rules refreshed");
  const why = reasons.length ? reasons.join("; ") : "they name tools and habits the plugin has moved on from";
  return `GTM Brain refreshed this brain's rules (AGENTS.md) from GTM Brain ${from} on its own: they were exactly the shipped text.${backup ? ` The old file is kept in ${backup}.` : ""} What the newer rules change: ${why}. Say so in one line, in plain words, the change that matters most for this person first; do not ask, it is done.`;
}

/* The README refreshed at chat start, like the rules: only when it is exactly what a release wrote,
   and committing nothing else. Scheduled runs leave it for the next chat. */
export function refreshReadme(root, templates) {
  const company = readAdmin(root)?.company, path = join(root, "README.md");
  if (process.env.GTM_BRAIN_RUN || !company || !existsSync(path)) return false;
  const render = file => readFileSync(file, "utf8").replaceAll("{{COMPANY}}", company);
  const current = readFileSync(path, "utf8"), next = render(join(templates, "README.md")), shipped = join(templates, "legacy", "readme");
  if (current === next || !readdirSync(shipped).some(f => f.endsWith(".md") && render(join(shipped, f)) === current)) return false;
  writeFileSync(path, next);
  commit(root, ["README.md"], "upgrade: README refreshed");
  return true;
}

/* Where a brain's rules stand against the plugin: current, a shipped older version (legacy),
   edited by hand (custom), or missing. The session hook says so; nothing is changed here. */
export function rulesState(root, templates) {
  const company = readAdmin(root)?.company; if (!company) return "missing";
  const path = join(root, "AGENTS.md"); if (!existsSync(path)) return "missing";
  const render = file => readFileSync(file, "utf8").replaceAll("{{COMPANY}}", company);
  const current = readFileSync(path, "utf8");
  if (current === render(join(templates, "AGENTS.md"))) return "current";
  return [...new Set(Object.values(legacyTemplates))].some(file => current === render(join(templates, "legacy", file))) ? "legacy" : "custom";
}
export function prepareUpgrade(root, templates) {
  const company = readAdmin(root)?.company;
  if (!company) throw new Error("Cannot refresh rules without a configured company.");
  // Validate user-editable identities before changing any instructions or hooks. A file
  // requiring repair must not leave a brain halfway through the predictable upgrade steps.
  readNames(root);
  const render = file => readFileSync(file, "utf8").replaceAll("{{COMPANY}}", company);
  const target = render(join(templates, "AGENTS.md"));
  const current = existsSync(join(root, "AGENTS.md")) ? readFileSync(join(root, "AGENTS.md"), "utf8") : null;
  const previous = [...new Set(Object.values(legacyTemplates))].map(file => render(join(templates, "legacy", file)));
  const files = ["AGENTS.md", ".githooks/pre-commit", ".gitignore"];
  const needsChange = current !== target || files.slice(1).some(file => {
    if (!existsSync(join(root, file))) return true;
    const existing = readFileSync(join(root, file), "utf8");
    const expected = readFileSync(join(templates, file === ".gitignore" ? "gitignore" : "githooks/pre-commit"), "utf8");
    return file === ".gitignore"
      ? expected.trimEnd().split("\n").some(line => !existing.split("\n").includes(line))
      : existing !== expected;
  });
  const folder = join(root, "work", "upgrades");
  let backup;
  if (needsChange) {
    mkdirSync(folder, { recursive: true });
    backup = mkdtempSync(join(folder, "before-"));
    for (const file of files) if (existsSync(join(root, file))) {
      const dest = join(backup, file);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(root, file), dest);
    }
  }
  if (current !== null && current !== target && !previous.includes(current)) {
    const proposal = join(backup, "AGENTS.proposed.md");
    writeFileSync(proposal, target);
    return { ready: false, backup, proposal };
  }
  return { ready: true, backup };
}
