// Protect locally edited instructions before refreshing plugin-owned files.
import { existsSync, readFileSync, mkdirSync, copyFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { readAdmin, readNames } from "./brain.mjs";

// Shared with the upgrade matrix tests. Aliases point to the same immutable snapshot.
export const legacyTemplates = JSON.parse(readFileSync(new URL("../templates/legacy/manifest.json", import.meta.url), "utf8"));

/* Why the rules changed, one line per release that changed them (the version that shipped the
   change). Every template change adds a line here: an offer to refresh says what it fixes. */
export const rulesWhy = JSON.parse(readFileSync(new URL("../templates/legacy/why.json", import.meta.url), "utf8"));
const versionParts = v => String(v).split(/[^0-9]+/).filter(Boolean).map(Number);
const newer = (a, b) => { const x = versionParts(a), y = versionParts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
/* The newest shipped version whose rules the brain's AGENTS.md matches (null when current, custom
   or missing) and the reasons for every rule change since then, oldest first. */
export function rulesReasons(root, templates) {
  const company = readAdmin(root)?.company; const path = join(root, "AGENTS.md");
  if (!company || !existsSync(path)) return { from: null, reasons: [] };
  const current = readFileSync(path, "utf8");
  const matches = Object.entries(legacyTemplates).filter(([, file]) => readFileSync(join(templates, "legacy", file), "utf8").replaceAll("{{COMPANY}}", company) === current).map(([v]) => v);
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

/* Where a brain's rules stand against the plugin: current, a shipped older version (legacy),
   edited by hand (custom), or missing. The session hook says so; nothing is changed here. */
export function rulesState(root, templates) {
  const company = readAdmin(root)?.company; if (!company) return "missing";
  const path = join(root, "AGENTS.md"); if (!existsSync(path)) return "missing";
  const render = file => readFileSync(file, "utf8").replaceAll("{{COMPANY}}", company);
  const current = readFileSync(path, "utf8");
  if (current === render(join(templates, "AGENTS.md"))) return "current";
  return [...new Set(Object.values(legacyTemplates))].some(file => render(join(templates, "legacy", file)) === current) ? "legacy" : "custom";
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
