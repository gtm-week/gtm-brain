// Where a brain's files live: the workplace settings, the rules, the schema, the base files, the folder of entity pages,
// the notes, the topic covers, the layout file and this computer's own folder. Every reader and writer asks
// here; lib/layout.mjs builds entity page names on top of it. No other module names these paths
// (test/brain-paths.test.mjs greps for stragglers).
//
// Four layouts (layout.json, lib/layout-version.mjs), all read:
//   1, 2  brain/admin.md (frontmatter: company, owner, team, tools; prose below), RULES.md and SCHEMA.md at the
//         root, the base files (strategy.md, icp.md, market.md, voice.md, design-system.md and its folder, and
//         any document the team added) at the root.
//   3     about-us/ holds the base files; config/ holds rules.md, schema.md and settings.yaml. settings.yaml is
//         the source of what brain/admin.md held (company, one-liner, owner, team, tools, the settings, the prose
//         as notes); brain/admin.md is gone. Only the brain's owner changes anything under about-us/ or config/
//         (lib/owner.mjs).
//   4     the folders are the dashboard's tabs, and there is no brain/ and no visible work/:
//           configuration/   about-us/ (the base files), rules.md, schema.md, settings.yaml, interactions.json
//                            (the company's own interactions), proposals/ (teammates' changes waiting for the owner)
//           entities/        <kind folder>/<name>-<short id>.md, no generated index.md
//           memories/        <YYYY-MM>.jsonl, one append-only file per calendar month (UTC) of a note's `at`;
//                            topics/<slug>.md, what a context cover is in layouts 1 to 3
//           workflows/       as before
//           layout.json      at the top
//           .gtm-brain/      this computer only, gitignored: what work/ holds in layouts 1 to 3
//         Only the owner changes configuration/ (proposals/ excepted: that is where the others' changes wait).
// A brain is in layout 4 on disk when configuration/settings.yaml exists, in layout 3 when config/settings.yaml
// does: the settings file is the marker, so a brain whose layout.json is behind still reads from the right place.
// No imports from the rest of the lib.
import { existsSync, readdirSync } from "node:fs";
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
export const SETTINGS_PROPOSAL = "work/admin.proposed.md";   // layouts 1 to 3; settingsProposal(root) answers for the brain

/* The shipped templates (plugins/gtm-brain/templates/), whatever the brain's layout. */
export const TEMPLATES = { rules: "RULES.md", schema: "SCHEMA.md", settings: "config/settings.yaml", admin: "brain/admin.md" };

/* Layout 4 on disk: its settings file is there. */
export const SETTINGS_FILE4 = "configuration/settings.yaml";
export const CONFIGURATION_DIR = "configuration";
export const ABOUT_DIR4 = "configuration/about-us";
export const inLayout4 = root => !!root && existsSync(join(root, SETTINGS_FILE4));
/* Layout 3 or 4 on disk: settings.yaml, base files in their folder, an owner. */
export const inConfigFolders = root => !!root && (existsSync(join(root, SETTINGS_FILE)) || existsSync(join(root, SETTINGS_FILE4)));
/* The folder of rules, schema and settings ("" before layout 3), and the base files' folder ("" before it: the root). */
export const configDir = root => (inLayout4(root) ? CONFIGURATION_DIR : inConfigFolders(root) ? CONFIG_DIR : "");
export const aboutDir = root => (inLayout4(root) ? ABOUT_DIR4 : inConfigFolders(root) ? ABOUT_DIR : "");
/* Relative to the brain: where the workplace settings, the rules and the schema are in this brain now. */
export const settingsFile = root => (inLayout4(root) ? SETTINGS_FILE4 : inConfigFolders(root) ? SETTINGS_FILE : ADMIN_FILE);
export const rulesFile = root => (inLayout4(root) ? "configuration/rules.md" : inConfigFolders(root) ? CONFIG_RULES : ROOT_RULES);
export const schemaFile = root => (inLayout4(root) ? "configuration/schema.md" : inConfigFolders(root) ? CONFIG_SCHEMA : ROOT_SCHEMA);
/* The folder base files go in: about-us in layout 3, configuration/about-us in 4, the root ("") before. */
export const baseDir = aboutDir;
export const basePath = (root, file) => (baseDir(root) ? `${baseDir(root)}/${file}` : file);
/* A brain folder: a settings file is there. The shell scripts mirror this (session/resolve.sh gtm_brain_is). */
const SETTINGS_FILES = [SETTINGS_FILE4, SETTINGS_FILE, ADMIN_FILE];
export const isBrain = dir => !!dir && SETTINGS_FILES.some(f => existsSync(join(dir, f)));
/* The settings file of a brain, absolute, or null when the folder is not a brain. */
export function settingsPathOf(dir) {
  if (!dir) return null;
  for (const f of SETTINGS_FILES) if (existsSync(join(dir, f))) return join(dir, f);
  return null;
}

/* ---------- what brain/ held in layouts 1 to 3 ---------- */
/* Entity pages: brain/entities, or entities at the top in layout 4. Old notes and pages name the first; a path
   read from them goes through herePath. */
export const ENTITIES_OLD = "brain/entities";
export const ENTITIES_DIR4 = "entities";
export const entitiesDir = root => (inLayout4(root) ? ENTITIES_DIR4 : ENTITIES_OLD);
/* A path under the entity pages as either layout writes it -> its part below that folder, or null. */
export const underEntities = p => { const m = /^(?:brain\/)?entities\/(.+)$/.exec(String(p || "")); return m ? m[1] : null; };
/* A recorded path (a note's asset, a page's link) as this brain keeps it now: brain/entities/... is entities/...
   in layout 4. Anything else comes back unchanged. */
export const herePath = (root, p) => { const s = String(p || ""); return inLayout4(root) && s.startsWith(`${ENTITIES_OLD}/`) ? s.slice("brain/".length) : s; };
/* The layout file. */
export const LAYOUT_FILE_OLD = "brain/layout.json";
export const LAYOUT_FILE4 = "layout.json";
/* A layout 4 brain whose settings file was deleted by hand still has its layout.json at the top and no brain/. */
export const layoutFile = root => (inLayout4(root) || (!!root && !existsSync(join(root, "brain")) && existsSync(join(root, LAYOUT_FILE4))) ? LAYOUT_FILE4 : LAYOUT_FILE_OLD);
/* The company's own interactions: the same Ossie file (ALLETHIC block and all) under either name. */
export const INTERACTIONS_OLD = "brain/ontology.ossie.json";
export const INTERACTIONS_FILE4 = "configuration/interactions.json";
export const interactionsFile = root => (inLayout4(root) ? INTERACTIONS_FILE4 : INTERACTIONS_OLD);
/* Proposals for the owner (lib/owner.mjs): the proposed files and who asked, shared through git like a note. */
export const proposalsDir = root => (inLayout4(root) ? "configuration/proposals" : PROPOSALS_DIR);

/* ---------- notes and topics ---------- */
/* Layouts 1 to 3: brain/contexts/<slug>/context.md (the cover) and memories.jsonl (the notes) per context.
   Layout 4: memories/topics/<slug>.md is the cover (a topic), and every note is a line of memories/<YYYY-MM>.jsonl,
   the month (UTC) of its `at`; its topic is the record's `context` field. */
export const CONTEXTS_DIR = "brain/contexts";
export const NOTES_DIR = "memories";
export const TOPICS_DIR = "memories/topics";
export const monthly = inLayout4;
/* The folder the covers are in, and one cover. */
export const coversDir = root => (inLayout4(root) ? TOPICS_DIR : CONTEXTS_DIR);
export const coverFile = (root, slug) => (inLayout4(root) ? `${TOPICS_DIR}/${slug}.md` : `${CONTEXTS_DIR}/${slug}/context.md`);
/* "2026-11" for a note's `at`; "undated" when it is no date (never written by the lib, which validates `at`). */
export function monthOf(at) {
  const t = Date.parse(at);
  if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 7);
  const m = /^(\d{4}-\d{2})/.exec(String(at || "")); return m ? m[1] : "undated";
}
export const monthFile = at => `${NOTES_DIR}/${monthOf(at)}.jsonl`;
const NOTE_FILE = /^(?:\d{4}-\d{2}|undated)\.jsonl$/;
/* The file a note of this context with this `at` is appended to. */
export const notesFileFor = (root, slug, at) => (inLayout4(root) ? monthFile(at) : `${CONTEXTS_DIR}/${slug}/memories.jsonl`);
/* Every file that holds notes, relative and sorted (months in order). Layouts 1 to 3: one per context folder. */
export function noteFiles(root) {
  try {
    if (inLayout4(root)) return readdirSync(join(root, NOTES_DIR)).filter(f => NOTE_FILE.test(f)).sort().map(f => `${NOTES_DIR}/${f}`);
    return readdirSync(join(root, CONTEXTS_DIR), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => `${CONTEXTS_DIR}/${d.name}/memories.jsonl`).filter(f => existsSync(join(root, f))).sort();
  } catch { return []; }
}
/* Is this relative path a file of notes, in either form? */
export const isNotesPath = p => /^brain\/contexts\/[^/]+\/memories\.jsonl$/.test(String(p)) || (/^memories\/[^/]+\.jsonl$/.test(String(p)) && NOTE_FILE.test(String(p).slice(NOTES_DIR.length + 1)));
/* git pathspecs: every notes file, every cover. */
export const notesGlob = root => (inLayout4(root) ? `:(glob)${NOTES_DIR}/*.jsonl` : `:(glob)${CONTEXTS_DIR}/*/memories.jsonl`);
export const coversGlob = root => (inLayout4(root) ? `:(glob)${TOPICS_DIR}/*.md` : `:(glob)${CONTEXTS_DIR}/*/context.md`);
/* What a commit of a note names: the files a note of this context may have been appended to. A month file is
   shared by every topic, so every notes file is named and git keeps what changed (never the covers beside them). */
export const notesCommitPaths = (root, slug) => (inLayout4(root) ? noteFiles(root) : [`${CONTEXTS_DIR}/${slug}/memories.jsonl`]);
/* What a commit of a new or changed topic names. */
export const contextCommitPaths = (root, slug) => (inLayout4(root) ? [coverFile(root, slug), ...noteFiles(root)] : [`${CONTEXTS_DIR}/${slug}`]);
/* The lines .gitattributes carries: notes merge as lines, the newer summary is kept. */
export const mergeAttributes = root => (inLayout4(root)
  ? [`${NOTES_DIR}/*.jsonl merge=union`, `${TOPICS_DIR}/*.md merge=gtm-brain-cover`, `${ENTITIES_DIR4}/.history/events.jsonl merge=union`]
  : [`${CONTEXTS_DIR}/*/memories.jsonl merge=union`, `${CONTEXTS_DIR}/*/context.md merge=gtm-brain-cover`, `${ENTITIES_OLD}/.history/events.jsonl merge=union`]);

/* ---------- this computer's own folder ---------- */
/* work/ in layouts 1 to 3; .gtm-brain/ in layout 4, hidden so the brain shows only its four folders. Gitignored
   in both. workDir is absolute, workName the folder's name for a text or a path relative to the brain. A folder
   that is not a brain yet (setup, a test's scratch folder) answers work. */
export const WORK_OLD = "work";
export const WORK_DIR4 = ".gtm-brain";
export const workName = root => (inLayout4(root) ? WORK_DIR4 : WORK_OLD);
export const workDir = root => join(root, workName(root));
export const workPath = (root, ...parts) => join(root, workName(root), ...parts);
/* The proposal a chat writes before approve_change, relative to the brain. */
export const settingsProposal = root => `${workName(root)}/admin.proposed.md`;
/* A task's throwaway files in layout 4: .gtm-brain/scratch/, apart from the plugin's own state. */
export const scratchName = root => (inLayout4(root) ? `${WORK_DIR4}/scratch` : WORK_OLD);

/* The folders only the owner changes: about-us/ and config/ in layout 3, configuration/ in 4, none before. */
export const OWNER_DIRS = [ABOUT_DIR, CONFIG_DIR];
export const ownerDirs = root => (inLayout4(root) ? [CONFIGURATION_DIR] : inConfigFolders(root) ? OWNER_DIRS : []);
export const isOwnerPath = (root, p) => {
  const path = String(p || "").replace(/^\.\//, "");
  if (inLayout4(root) && (path === "configuration/proposals" || path.startsWith("configuration/proposals/"))) return false;
  return ownerDirs(root).some(d => path === d || path.startsWith(`${d}/`));
};
/* Files GTM Brain keeps itself at the brain's top: never a document, never a stray file to ask about. */
export const ROOT_KEEP = ["AGENTS.md", "CLAUDE.md", "README.md", OLD_WHERE, ROOT_RULES, ROOT_SCHEMA];
/* Top folders that are never a document's home and never stray; in layout 3 config/ too (settings, not
   documents), in layout 4 the four tab folders that are not documents' (configuration/ is entered only for
   about-us/, lib/documents.mjs). A layout 1 or 2 brain may have a config/ folder of the team's own: it stays theirs. */
export const ENGINE_DIRS = ["brain", "work"];
export const engineDirs = root => (inLayout4(root) ? [...ENGINE_DIRS, CONFIGURATION_DIR, ENTITIES_DIR4, NOTES_DIR, WORK_DIR4] : inConfigFolders(root) ? [...ENGINE_DIRS, CONFIG_DIR] : ENGINE_DIRS);
/* What lib.guardProtected puts back after a direct edit. The settings file of layouts 3 and 4 is also an owner
   path: the owner's own edit of it is kept (lib/owner.mjs), anyone else's is put back. */
export const PROTECTED_FILES = [ADMIN_FILE, INTERACTIONS_OLD];
export const protectedFiles = root => (inLayout4(root) ? [INTERACTIONS_FILE4] : PROTECTED_FILES);
/* What setup and save commit besides brain/: the managed files at the top, in each layout. */
export const MANAGED_TOP = root => (inLayout4(root) ? [CONFIGURATION_DIR, ENTITIES_DIR4, NOTES_DIR, LAYOUT_FILE4] : inConfigFolders(root) ? [CONFIG_DIR, ABOUT_DIR] : [ROOT_RULES, ROOT_SCHEMA]);
/* The layout-3 move: each old path and where it goes. Base files are worked out from the documents
   (lib/config-folders.mjs); these are the fixed ones. */
export const FIXED_MOVES = [[ROOT_RULES, CONFIG_RULES], [ROOT_SCHEMA, CONFIG_SCHEMA]];
// The page a starter document has beside it (the design system as HTML): GTM Brain writes it, so it is no stray file.
export const PAGE_FILES = ["design-system.html"];
