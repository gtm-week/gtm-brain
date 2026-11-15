// Where a brain's own files live: the workplace settings, the rules, the schema and the base files. Every reader
// and writer asks here; lib/layout.mjs answers the same for entity pages. No other module names these paths
// (test/brain-paths.test.mjs greps for stragglers).
//
// Three layouts (brain/layout.json, lib/layout-version.mjs), all read:
//   1, 2  brain/admin.md (frontmatter: company, owner, team, tools; prose below), RULES.md and SCHEMA.md at the
//         root, the base files (strategy.md, icp.md, market.md, voice.md, design-system.md and its folder, and
//         any document the team added) at the root.
//   3     about-us/ holds the base files; config/ holds rules.md, schema.md and settings.yaml. settings.yaml is
//         the source of what brain/admin.md held (company, one-liner, owner, team, tools, the settings, the prose
//         as notes); brain/admin.md is gone. Only the brain's owner changes anything under about-us/ or config/
//         (lib/owner.mjs).
// A brain is in layout 3 on disk when config/settings.yaml exists: that file is the marker, so a brain whose
// layout.json is behind still reads from the right place. No imports from the rest of the lib.
import { existsSync } from "node:fs";
import { join } from "node:path";

export const ADMIN_FILE = "brain/admin.md";
export const SETTINGS_FILE = "config/settings.yaml";
export const ABOUT_DIR = "about-us";
export const CONFIG_DIR = "config";
export const ROOT_RULES = "RULES.md";
export const ROOT_SCHEMA = "SCHEMA.md";
export const CONFIG_RULES = "config/rules.md";
export const CONFIG_SCHEMA = "config/schema.md";
/* Before 0.33.9 the where-things-go table was a file of its own at the root; the chat start merges it into the rules. */
export const OLD_WHERE = "WHERE.md";
/* Proposals for the owner (lib/owner.mjs): the proposed files and who asked, shared through git like a note. */
export const PROPOSALS_DIR = "brain/proposals";
/* The proposal a chat writes before approve_change (work/, this machine only). */
export const SETTINGS_PROPOSAL = "work/admin.proposed.md";

/* The shipped templates (plugins/gtm-brain/templates/), whatever the brain's layout. */
export const TEMPLATES = { rules: "RULES.md", schema: "SCHEMA.md", settings: "config/settings.yaml", admin: "brain/admin.md" };

/* Layout 3 on disk: the settings file is there. */
export const inConfigFolders = root => !!root && existsSync(join(root, SETTINGS_FILE));
/* Relative to the brain: where the workplace settings, the rules and the schema are in this brain now. */
export const settingsFile = root => (inConfigFolders(root) ? SETTINGS_FILE : ADMIN_FILE);
export const rulesFile = root => (inConfigFolders(root) ? CONFIG_RULES : ROOT_RULES);
export const schemaFile = root => (inConfigFolders(root) ? CONFIG_SCHEMA : ROOT_SCHEMA);
/* The folder base files go in: about-us in layout 3, the root ("") before. */
export const baseDir = root => (inConfigFolders(root) ? ABOUT_DIR : "");
export const basePath = (root, file) => (baseDir(root) ? `${baseDir(root)}/${file}` : file);
/* A brain folder: either settings file is there. The shell scripts mirror this (session/resolve.sh gtm_brain_is). */
export const isBrain = dir => !!dir && (existsSync(join(dir, ADMIN_FILE)) || existsSync(join(dir, SETTINGS_FILE)));
/* The settings file of a brain, absolute, or null when the folder is not a brain. */
export function settingsPathOf(dir) {
  if (!dir) return null;
  for (const f of [SETTINGS_FILE, ADMIN_FILE]) if (existsSync(join(dir, f))) return join(dir, f);
  return null;
}

/* The folders only the owner changes (layout 3); none before it. */
export const OWNER_DIRS = [ABOUT_DIR, CONFIG_DIR];
export const ownerDirs = root => (inConfigFolders(root) ? OWNER_DIRS : []);
export const isOwnerPath = (root, p) => {
  const path = String(p || "").replace(/^\.\//, "");
  return inConfigFolders(root) && OWNER_DIRS.some(d => path === d || path.startsWith(`${d}/`));
};
/* Files GTM Brain keeps itself at the brain's top: never a document, never a stray file to ask about. */
export const ROOT_KEEP = ["AGENTS.md", "CLAUDE.md", "README.md", OLD_WHERE, ROOT_RULES, ROOT_SCHEMA];
/* Top folders that are never a document's home and never stray; in layout 3 config/ too (settings, not
   documents). A layout 1 or 2 brain may have a config/ folder of the team's own: it stays theirs. */
export const ENGINE_DIRS = ["brain", "work"];
export const engineDirs = root => (inConfigFolders(root) ? [...ENGINE_DIRS, CONFIG_DIR] : ENGINE_DIRS);
/* What lib.guardProtected puts back after a direct edit, in every layout. The settings file of layout 3 is also
   an owner path: the owner's own edit of it is kept (lib/owner.mjs), anyone else's is put back. */
export const PROTECTED_FILES = [ADMIN_FILE, "brain/ontology.ossie.json"];
/* What setup and save commit besides brain/: the managed files at the top, in either layout. */
export const MANAGED_TOP = root => [...(inConfigFolders(root) ? [CONFIG_DIR, ABOUT_DIR] : [ROOT_RULES, ROOT_SCHEMA])];
/* The layout-3 move: each old path and where it goes. Base files are worked out from the documents
   (lib/config-folders.mjs); these are the fixed ones. */
export const FIXED_MOVES = [[ROOT_RULES, CONFIG_RULES], [ROOT_SCHEMA, CONFIG_SCHEMA]];
