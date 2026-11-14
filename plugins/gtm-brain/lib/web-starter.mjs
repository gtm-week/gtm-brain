// Packaging only. Brian's source and procedures are never edited in the bundled snapshot.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { POINTER_START, POINTER_END, commit } from "./brain.mjs";
import { PROJECT_SKILL_DIRS } from "./host.mjs";

const PLUGIN = fileURLToPath(new URL("../", import.meta.url));
const BUNDLE = join(PLUGIN, "starters/web-design-system");
export const WEB_STARTER = "web-design-system";
export const STARTER_MARKER = ".gtm-brain-starter.json";
export const STARTER_REVISION = "92882ac4a37364f9bc7549dfc4f73c3b5e1d7110";
export const STARTER_WORKFLOWS = ["build-design-system", "add-section", "build-landing-page", "deploy-vercel"];
const parse = file => JSON.parse(readFileSync(file, "utf8"));
const json = value => JSON.stringify(value, null, 2) + "\n";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const canonical = path => join(realpathSync(dirname(path)), path.split(/[\\/]/).pop());
const fail = message => { throw new Error(message); };

function filesUnder(root, prefix = "", ownedLink = () => false) {
  return readdirSync(join(root, prefix)).sort().flatMap(name => {
    const path = prefix ? `${prefix}/${name}` : name, stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink()) { if (ownedLink(path)) return []; fail(`Starter contains an unexpected symlink: ${path}`); }
    if (stat.isDirectory()) return filesUnder(root, path, ownedLink);
    if (!stat.isFile()) fail(`Starter contains an unsupported file: ${path}`);
    return [path];
  });
}

export function verifyBundledStarter(bundle = BUNDLE) {
  const manifest = parse(join(bundle, "source.json")), source = join(bundle, "source");
  if (manifest.id !== WEB_STARTER || manifest.format !== 1 || manifest.revision !== STARTER_REVISION) fail("Unsupported bundled starter identity or revision");
  const actual = filesUnder(source), expected = Object.keys(manifest.files).sort();
  if (JSON.stringify(actual.sort()) !== JSON.stringify(expected)) fail("Bundled starter file inventory differs from its pinned source manifest");
  for (const file of expected) if (hash(readFileSync(join(source, file))) !== manifest.files[file]) fail(`Bundled starter differs from Brian's pinned source: ${file}`);
  return manifest;
}

function relocated(file) {
  for (const name of STARTER_WORKFLOWS) {
    const from = `.agents/skills/${name}/`;
    if (file.startsWith(from)) return `docs/workflows/${name}/${file.slice(from.length)}`;
  }
  return file;
}

// This is the complete source-edit allowlist. All other file bytes are copied unchanged.
function packagedBytes(file, bytes) {
  if (file === "package.json") {
    const value = JSON.parse(bytes);
    if (value.scripts.postinstall !== "node scripts/setup-skills.mjs") fail("Unexpected starter postinstall; review packaging before proceeding");
    delete value.scripts.postinstall;
    return Buffer.from(json(value));
  }
  if (file === "package-lock.json") {
    const value = JSON.parse(bytes);
    delete value.packages[""].hasInstallScript;
    return Buffer.from(json(value));
  }
  return bytes;
}

function expectedFiles(bundle = BUNDLE) {
  const manifest = verifyBundledStarter(bundle);
  return new Map(Object.keys(manifest.files).map(file => [relocated(file), packagedBytes(file, readFileSync(join(bundle, "source", file)))]));
}

function safeFile(root, file) {
  let path = root;
  for (const segment of file.split("/")) {
    path = join(path, segment);
    if (lstatSync(path).isSymbolicLink()) fail(`Starter path is a symlink: ${file}`);
  }
  return path;
}

export function verifyPreparedStarter(path) {
  if (lstatSync(path).isSymbolicLink()) fail("Starter destination cannot be a symlink");
  const expected = expectedFiles();
  for (const [file, bytes] of expected) {
    let actual;
    try { actual = readFileSync(safeFile(path, file)); }
    catch (e) { fail(`Prepared starter needs repair; files preserved: ${file} (${e.message})`); }
    if (file === "AGENTS.md" && actual.includes(POINTER_START)) {
      const text = actual.toString(), start = text.indexOf(POINTER_START);
      if (text.indexOf(POINTER_START, start + 1) !== -1 || !text.trimEnd().endsWith(POINTER_END) || text.slice(0, start) !== bytes.toString().trimEnd() + "\n\n") fail("Prepared starter needs repair; files preserved: AGENTS.md");
    } else if (!actual.equals(bytes)) fail(`Prepared starter needs repair; files preserved: ${file}`);
  }
  // No old skill registrations or additional app files may slip into a fresh scaffold.
  for (const file of filesUnderProject(path)) if (!expected.has(file) && file !== STARTER_MARKER && file !== "work/hooks.log") fail(`Prepared starter contains an unexpected file; preserved: ${file}`);
  return true;
}

function filesUnderProject(root) {
  const files = [];
  const marker = parse(safeFile(root, STARTER_MARKER));
  const ownedLink = file => {
    const dir = PROJECT_SKILL_DIRS.find(dir => file.startsWith(dir + "/"));
    if (!dir) return false;
    const id = file.slice(dir.length + 1);
    if (!/^gtm-(?:brain|os)-[a-z0-9][a-z0-9-]*$/.test(id)) return false;
    try {
      const target = resolve(dirname(join(root, file)), readlinkSync(join(root, file)));
      return canonical(target) === canonical(join(marker.brain, ".agents/skills", id));
    } catch { return false; }
  };
  for (const name of readdirSync(root)) {
    if (name === ".git") continue;
    const stat = lstatSync(join(root, name));
    if (stat.isSymbolicLink()) fail(`Prepared starter contains a symlink: ${name}`);
    if (stat.isDirectory()) files.push(...filesUnder(root, name, ownedLink)); else files.push(name);
  }
  return files;
}

export function preparedStarter(path, brain) {
  if (!existsSync(join(path, STARTER_MARKER))) return null;
  if (lstatSync(path).isSymbolicLink()) fail("Starter destination cannot be a symlink");
  const value = parse(safeFile(path, STARTER_MARKER));
  if (value.id !== WEB_STARTER || value.format !== 1 || value.state !== "prepared" || value.revision !== STARTER_REVISION) return null;
  if (value.brain !== realpathSync(brain) || value.path !== canonical(path)) fail("Prepared starter belongs to another brain or location; files preserved");
  verifyPreparedStarter(path);
  return value;
}

export function createStarterProject(path, { brain, slug, title, contexts, by }) {
  // Prepare away from the destination. A failed copy never leaves a half-copied project.
  const expected = expectedFiles(), stage = mkdtempSync(join(dirname(path), ".gtm-web-starter-"));
  let reserved = false;
  try {
    for (const [file, bytes] of expected) { const to = join(stage, file); mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, bytes, { flag: "wx" }); }
    const metadata = { id: WEB_STARTER, format: 1, revision: STARTER_REVISION, release: parse(join(PLUGIN, ".codex-plugin/plugin.json")).version,
      author: "Brian Woloszczak / Peakout", repository: "https://github.com/peakout/gtm-week-design-system", state: "prepared",
      brain: realpathSync(brain), path: canonical(path), slug, title, contexts, by };
    writeFileSync(join(stage, STARTER_MARKER), json(metadata), { flag: "wx" });
    verifyPreparedStarter(stage);
    execFileSync("git", ["init", "-q", "-b", "main", stage], { stdio: "pipe" });
    // lib.commit's activity log is machine-local. Keep Brian's .gitignore unchanged.
    writeFileSync(join(stage, ".git/info/exclude"), "/work/\n", { flag: "a" });
    mkdirSync(path); reserved = true; // exclusive: an occupied destination is never replaced
    renameSync(stage, path); reserved = false;
    return metadata;
  } catch (e) {
    if (reserved) { try { rmdirSync(path); } catch {} } // only our still-empty reservation
    throw e;
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

export function finishStarterProject(path) {
  const file = safeFile(path, STARTER_MARKER), value = parse(file);
  writeFileSync(file, json({ ...value, state: "linked" }));
  const kept = commit(path, [...expectedFiles().keys(), STARTER_MARKER], "Initialize Brian's design-system starter for GTM Brain", { push: false });
  // The committed marker is linked, but a failed commit must leave setup resumable.
  if (!kept.ok) writeFileSync(file, json({ ...value, state: "prepared" }));
  return kept;
}

// Used by project discovery. Custom brand values and new sections are expected here.
// Never compare an established company's app to the original grey starter or rewrite it.
export function readStarterProject(path) {
  if (!existsSync(join(path, STARTER_MARKER))) return null;
  try {
    const value = parse(safeFile(path, STARTER_MARKER));
    const issues = [];
    if (value.id !== WEB_STARTER || value.format !== 1) issues.push("unsupported starter format");
    if (!["prepared", "linked"].includes(value.state)) issues.push("unknown setup state");
    const required = ["package.json", "package-lock.json", "src/styles/global.css", "src/sections/index.ts", "docs/design.md", "docs/seo.md", "scripts/extract.mjs", "scripts/shots.mjs", ...STARTER_WORKFLOWS.map(name => `docs/workflows/${name}/SKILL.md`)];
    for (const file of required) { try { if (!lstatSync(safeFile(path, file)).isFile()) issues.push(`not a file: ${file}`); } catch { issues.push(`missing or unsafe: ${file}`); } }
    if (!issues.length) {
      const css = readFileSync(join(path, "src/styles/global.css"), "utf8");
      if (!css.includes("--site-") || !css.includes("--color-ink") || !css.includes("--color-surface")) issues.push("starter token architecture is missing");
    }
    return { id: value.id, format: value.format, revision: value.revision, release: value.release, state: value.state, compatible: issues.length === 0, issues, dependencies: "not verified", preview: "not verified" };
  } catch (e) { return { id: WEB_STARTER, compatible: false, issues: [e.message] }; }
}
