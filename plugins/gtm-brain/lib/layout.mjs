// Where entity pages, their asset folders and their indexes live. Every reader and writer asks here.
// Two layouts, both always read:
//   flat (brains from before 0.35): brain/entities/<slug>.md, files in brain/entities/<slug>/
//   per kind (setup and upgrade):   brain/entities/<kind folder>/<readable name>-<short id>.md, files in the
//                                   folder of the same name beside it, and an index.md per kind folder
// brain/layout.json says which one a brain is in, for the plugins that read only the flat one: 1 flat, 2 per
// kind (lib/layout-version.mjs). recordKindLayout keeps that number with the files.
// The short id is the first 6 hex characters of the stable id (e_...): it never changes, so a rename moves
// only the readable part and an old asset path still finds its folder.
import { existsSync, readdirSync, lstatSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { DEFAULT_KINDS } from "./kinds.mjs";
import { handleFor } from "./brain.mjs";
import { readLayout, writeLayout, writesLayout, understandsLayout } from "./layout-version.mjs";

export const ENTITIES_DIR = "brain/entities";
export const INDEX_FILE = "index.md";
/* Entity history records (merges, renames, upgrades): an operation history that travels with git. */
export const HISTORY_DIR = `${ENTITIES_DIR}/.history`;
const FOLDERS = { person: "people", organization: "organizations", product: "products", event: "events", tool: "tools", meeting: "meetings", offering: "offerings" };
/* The folder of a kind: its plural. A kind added in SCHEMA.md takes its lowercase plural (case_study -> case-studies). */
export function kindFolder(kind) {
  if (FOLDERS[kind]) return FOLDERS[kind];
  const k = String(kind || "").toLowerCase().replace(/_/g, "-");
  return /[^aeiou]y$/.test(k) ? k.slice(0, -1) + "ies" : /(s|x|z|ch|sh)$/.test(k) ? k + "es" : k + "s";
}
const KNOWN_FOLDERS = new Set([...DEFAULT_KINDS, "meeting"].map(kindFolder));
export const shortId = id => String(id || "").slice(2, 8);
const readable = name => (handleFor(String(name || "")) || "entity").slice(0, 60).replace(/-+$/, "");
/* "Max Jendral", e_3f9a2c... -> max-jendral-3f9a2c */
export const pageName = (name, id) => `${readable(name)}-${shortId(id)}`;
export const kindPagePath = (kind, name, id) => `${ENTITIES_DIR}/${kindFolder(kind)}/${pageName(name, id)}.md`;
export const flatPagePath = slug => `${ENTITIES_DIR}/${slug}.md`;
export const indexPath = kind => `${ENTITIES_DIR}/${kindFolder(kind)}/${INDEX_FILE}`;
/* An entity's files sit in the folder named like its page, beside it. */
export const assetFolder = pagePath => String(pagePath).replace(/\.md$/, "");
/* A page path either layout writes: brain/entities/<slug>.md or brain/entities/<folder>/<slug>.md, never an index. */
export const isPagePath = p => typeof p === "string" && /^brain\/entities\/(?:[a-z0-9-]+\/)?[a-z0-9-]+\.md$/.test(p) && !/^brain\/entities\/[a-z0-9-]+\/index\.md$/.test(p);
export const isKindPagePath = p => isPagePath(p) && /^brain\/entities\/[a-z0-9-]+\/[a-z0-9-]+-[0-9a-f]{6}\.md$/.test(p);
/* The relative link from one page (or brain file) to another brain path, as Markdown writes it. */
export const linkFrom = (fromPath, toPath) => posix.relative(posix.dirname(fromPath), toPath);

const dirOK = path => { try { return lstatSync(path).isDirectory(); } catch { return false; } };
/* The kind folders present: a directory under brain/entities that is not a flat page's file folder
   (no <name>.md beside it), not hidden, and named for a kind or holding an index.md. */
export function kindFolders(root) {
  const dir = join(root, ENTITIES_DIR);
  if (!dirOK(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const flat = new Set(entries.filter(d => d.isFile() && d.name.endsWith(".md")).map(d => d.name.slice(0, -3)));
  const kindPages = name => { try { return readdirSync(join(dir, name)).some(f => /-[0-9a-f]{6}\.md$/.test(f)); } catch { return false; } };
  return entries.filter(d => d.isDirectory() && !d.name.startsWith(".") && !flat.has(d.name) && (KNOWN_FOLDERS.has(d.name) || existsSync(join(dir, d.name, INDEX_FILE)) || kindPages(d.name))).map(d => d.name).sort();
}
/* "kinds" when the brain has kind folders (setup and upgrade make them), else "flat". */
export function layout(root) { return kindFolders(root).length ? "kinds" : "flat"; }
/* The same as the number brain/layout.json records (lib/layout-version.mjs): 2 with kind folders, 1 flat. */
export const diskLayout = root => (layout(root) === "kinds" ? 2 : 1);
/* brain/layout.json follows the files: a brain in kind folders is at least layout 2. Whatever makes kind
   folders calls this right after (setup's startKindLayout, the upgrade's migrateToKindFolders), and lib.commit
   and the chat start call it for a brain a 0.35 pre-release moved while the file still said 1 or was missing.
   A plugin from before kind folders does not raise the number, and a file that cannot be read is left alone.
   Returns the layout written, 0 when the file was right. The caller commits brain/layout.json. */
export function recordKindLayout(root) {
  const recorded = readLayout(root);
  if (recorded.error || recorded.layout >= 2 || understandsLayout() < 2 || layout(root) !== "kinds") return 0;
  const to = Math.max(2, writesLayout());
  return writeLayout(root, { layout: to }) ? to : 0;
}

/* Every entity page, both layouts, relative to the brain and sorted. Index files and asset folders are skipped. */
export function pagePaths(root) {
  const dir = join(root, ENTITIES_DIR);
  if (!dirOK(dir)) return [];
  const out = readdirSync(dir, { withFileTypes: true }).filter(d => !d.isDirectory() && d.name.endsWith(".md")).map(d => `${ENTITIES_DIR}/${d.name}`);
  for (const folder of kindFolders(root)) {
    for (const d of readdirSync(join(dir, folder), { withFileTypes: true })) if (!d.isDirectory() && d.name.endsWith(".md") && d.name !== INDEX_FILE) out.push(`${ENTITIES_DIR}/${folder}/${d.name}`);
  }
  return out.sort();
}
/* The page holding this stable id now (its own page or a redirect), wherever a rename or upgrade moved it. */
export function findPage(root, id) {
  if (!/^e_[0-9a-f]{16}$/.test(id || "")) return null;
  const line = new RegExp(`^id:\\s*["']?${id}["']?\\s*$`, "m");
  for (const p of pagePaths(root)) {
    try { const text = readFileSync(join(root, p), "utf8"), header = text.match(/^---\r?\n([\s\S]*?)\r?\n---/); if (header && line.test(header[1])) return p; } catch {}
  }
  return null;
}
/* An asset path recorded under brain/entities that no longer exists: the same file in the folder that holds
   that short id now (people/max-jendral-3f9a2c/ after a rename to people/max-j-3f9a2c/). Null when none. */
export function movedAsset(root, path) {
  const m = String(path).match(/^brain\/entities\/[a-z0-9-]+\/[a-z0-9-]+-([0-9a-f]{6})\/(.+)$/);
  if (!m) return null;
  for (const folder of kindFolders(root)) {
    let dirs = []; try { dirs = readdirSync(join(root, ENTITIES_DIR, folder), { withFileTypes: true }).filter(d => d.isDirectory() && d.name.endsWith(`-${m[1]}`)); } catch {}
    for (const d of dirs) { const p = `${ENTITIES_DIR}/${folder}/${d.name}/${m[2]}`; if (existsSync(join(root, p))) return p; }
  }
  return null;
}

/* The kinds a flat page may carry: the ones GTM Brain 0.34 reads (it reads only flat pages, and one page of a
   kind it does not know stops every entity read there). Its five defaults plus each "## <Kind>" section of
   SCHEMA.md except Meeting, which 0.34 refuses. A meeting or an offering without its section waits for the
   kind folders ("upgrade the brain"), where 0.34 never looks. */
export const KINDS_034 = ["person", "organization", "product", "event", "tool"];
export function flatKinds(root) {
  let text = ""; try { text = readFileSync(join(root, "SCHEMA.md"), "utf8"); } catch {}
  const sections = [...text.matchAll(/^##[ \t]+([A-Za-z][A-Za-z0-9_]*)[ \t]*$/gm)].map(m => m[1].toLowerCase()).filter(k => k !== "meeting" && k !== "relationships");
  return new Set([...KINDS_034, ...sections]);
}
