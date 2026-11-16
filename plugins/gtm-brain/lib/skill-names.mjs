// Since 0.36 the shipped skills are named gtmb-<name>; until 0.35 they were gtm-brain-<name>. The plugin's own
// files follow with the update. A brain's own files (its README, rules, workflow documents, base documents and
// the skills made in it) may still tell people to type the old names: this module finds those files, says so
// once at a chat start, and rewrites them on the person's yes. Operation scripts keep their folders
// (scripts/gtm-brain-*), and a skill a team made itself keeps its name.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { aboutDir, configDir, isOwnerPath } from "./brain-paths.mjs";
import { isOwner, personHere } from "./owner.mjs";

export const RENAMED = ["add-section", "build-landing-page", "clay-setup", "configure", "deepdive", "define-icp", "design-system", "freckle-setup",
  "heyreach-setup", "market-desk-research", "project", "publish-website", "rules", "schema", "skill", "start", "strategy", "surfer-setup", "sync",
  "todo", "unit-economics", "use-brain", "voice", "woodpecker-setup", "workflow", "zynt-setup"];
const old = () => new RegExp(`(?<!scripts/)gtm-brain-(${[...RENAMED].sort((a, b) => b.length - a.length).join("|")})(?![a-z0-9-])`, "g");
export const hasOldSkillNames = text => old().test(String(text || ""));
export const renameSkillNames = text => String(text || "").replace(old(), "gtmb-$1");
/* What the person typed, as the skill it is now: "/gtm-brain-rules" is "/gtmb-rules". */
export const currentSkillName = name => renameSkillNames(String(name || "").trim());

// AGENTS.md and CLAUDE.md are the rulebook, refreshed by the update itself; .claude belongs to Claude.
const SKIP = new Set(["AGENTS.md", "CLAUDE.md"]);
const md = (root, dir) => { try { return readdirSync(join(root, dir)).filter(f => f.endsWith(".md") && !(dir === "" && SKIP.has(f))).map(f => (dir ? `${dir}/${f}` : f)); } catch { return []; } };
const madeSkills = root => { try { return readdirSync(join(root, ".agents/skills")).map(d => `.agents/skills/${d}/SKILL.md`).filter(f => existsSync(join(root, f))); } catch { return []; } };
/* The brain's own files that still name a shipped skill the old way, as paths from the brain's top. */
export function filesWithOldSkillNames(root) {
  const files = [...md(root, ""), ...[aboutDir(root), configDir(root)].filter(Boolean).flatMap(d => md(root, d)), ...md(root, "workflows"), ...madeSkills(root)];
  return files.filter(f => { try { return statSync(join(root, f)).size < 2_000_000 && hasOldSkillNames(readFileSync(join(root, f), "utf8")); } catch { return false; } });
}
/* The chat start's line: the short names, always for a person who may type an old one, and the files to offer. */
export function skillNamesLine(root) {
  if (process.env.GTM_BRAIN_RUN) return "";
  let files = []; try { files = filesWithOldSkillNames(root); } catch {}
  if (!files.length) return "";
  return `GTM Brain: the skills have short names since 0.36: /gtm-brain-<name> is now /gtmb-<name> (/gtmb-rules, /gtmb-schema, /gtmb-todo). When the person types an old name, run the skill under its new name and say the new name once. ${files.length} of this brain's own files still use the old names (${files.slice(0, 6).join(", ")}${files.length > 6 ? ", ..." : ""}). Offer once, in one line at the end of your first reply, to update them; ask yes or no, and only on yes call upgrade_brain with skill_names: true. Notes are never rewritten.`;
}
/* Rewrite the old names in the brain's own files. A teammate's run leaves the owner's folders alone and says so. */
export function rewriteSkillNames(root, { by = null } = {}) {
  const owner = isOwner(root, personHere(root, by)), changed = [], left = [];
  for (const f of filesWithOldSkillNames(root)) {
    if (isOwnerPath(root, f) && !owner) { left.push(f); continue; }
    const at = join(root, f), text = readFileSync(at, "utf8"), next = renameSkillNames(text);
    if (next !== text) { writeFileSync(at, next); changed.push(f); }
  }
  return { changed, left };
}
