// Owner-only changes (layout 3): only the brain's owner (settings.yaml owner; the first owner is who ran setup)
// changes anything under about-us/ or config/ (lib/brain-paths.mjs OWNER_DIRS). Everyone else's change there
// becomes a proposal: the proposed files are kept in brain/proposals/<id>/ (shared through git like a note), a
// note tagged for the owner says who asked and what, the files under about-us/ and config/ stay as committed,
// and the owner's next chat start names it in one line. Only the owner's approval (approve_change, kind
// proposal) applies it. Every approval is recorded as a note of kind decision: who asked, who approved, which
// file, a one-line summary, and the commit (source kind git). query (object approvals) lists them.
//
// Where it is enforced: lib.commit (every writer ends there; a write by someone else under these folders turns
// into a proposal before it is committed), lib.save and the chat start (a hand edit there by someone else is
// kept as a proposal and the committed version comes back, as lib.guardProtected does for protected files;
// the owner's own hand edit is accepted and recorded), and approve.mjs. A teammate who pushes with git directly
// is not stopped by the plugin (MANUAL.md, Who can change the base files).
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync, lstatSync } from "node:fs";
import { join, dirname, posix } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readAdmin, currentPerson, appendMemory, commit, listContexts, logActivity, lineDiff, teamHandle, parseSettings } from "./brain.mjs";
import { inConfigFolders, isOwnerPath, OWNER_DIRS, PROPOSALS_DIR, SETTINGS_FILE } from "./brain-paths.mjs";
import { readLayout } from "./layout-version.mjs";

export const PROPOSAL_TAG = "owner-proposal", APPROVAL_TAG = "approval";
const git = (root, ...a) => execFileSync("git", ["--no-optional-locks", "-C", root, ...a], { encoding: "utf8", stdio: "pipe" });
const gitOK = (root, ...a) => { try { return git(root, ...a); } catch { return null; } };
const plain = s => String(s || "").replace(/[\u2013\u2014\u2015\u2212]/g, "-").replace(/\s+/g, " ").trim();
const nameOf = (root, handle) => (readAdmin(root)?.team || []).find(p => p && p.handle === handle)?.name || handle || "someone";

/* The owner's handle, or null when the settings name none. */
export function ownerOf(root) {
  let o = null;
  // The committed owner decides. The file on disk may be a hand edit nobody approved yet: a teammate who writes
  // their own handle there is not the owner until the owner's save or approval commits it. The file on disk
  // answers only where nothing is committed (setup before its first commit, a brain outside git).
  if (inConfigFolders(root)) { try { o = parseSettings(git(root, "show", `HEAD:${SETTINGS_FILE}`)).fm.owner; } catch {} }
  if (!o) { try { o = readAdmin(root)?.owner; } catch {} }
  return o ? String(o) : null;
}
/* The person in this checkout (work/person.json, else the brain's git email), or by when that is unknown. */
export function personHere(root, by) {
  try { const p = currentPerson(root); if (p) return p; } catch {}
  return by ? teamHandle(root, by) : null;
}
/* Owner rules apply: layout 3 and an owner named. */
export const ownerRules = root => inConfigFolders(root) && !!ownerOf(root);
export const isOwner = (root, who) => !ownerRules(root) || (!!who && who === ownerOf(root));

/* Uncommitted changes under about-us/ and config/, as {path, state}: state is add, edit or delete. Only paths
   inside `within` when given (a commit's own paths: "." or a folder covers what is inside it). */
export function ownerChanges(root, within = null) {
  if (!inConfigFolders(root) || gitOK(root, "rev-parse", "--verify", "-q", "HEAD") === null) return [];
  // -z: paths as they are (a space, a non-ASCII letter), never quoted or escaped
  const out = gitOK(root, "status", "--porcelain", "-z", "--untracked-files=all", "--no-renames", "--", ...OWNER_DIRS) || "";
  const covers = p => !within || within.some(w => { const x = String(w).replace(/^\.\//, "").replace(/\/+$/, ""); return x === "." || x === "" || p === x || p.startsWith(`${x}/`); });
  return out.split("\0").filter(Boolean).map(l => {
    const code = l.slice(0, 2), path = l.slice(3);
    const inHead = gitOK(root, "cat-file", "-e", `HEAD:${path}`) !== null;
    return { path, state: !existsSync(join(root, path)) ? "delete" : inHead ? "edit" : "add", code };
  }).filter(c => isOwnerPath(root, c.path) && covers(c.path) && !(c.state === "delete" && gitOK(root, "cat-file", "-e", `HEAD:${c.path}`) === null));
}

/* Put the committed version back (or remove a file that is not committed): nothing under the owner's folders changes. */
function restore(root, changes) {
  for (const c of changes) {
    const file = join(root, c.path);
    gitOK(root, "reset", "-q", "--", c.path);
    if (c.state === "add") { rmSync(file, { force: true }); continue; }
    const committed = execFileSync("git", ["-C", root, "show", `HEAD:${c.path}`], { stdio: "pipe" });
    mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, committed);
  }
  // a folder a new file brought along, left empty now
  for (const c of changes.filter(c => c.state === "add")) {
    for (let d = dirname(c.path); d && d !== "." && !OWNER_DIRS.includes(d); d = dirname(d)) { try { if (readdirSync(join(root, d)).length) break; rmSync(join(root, d), { recursive: true }); } catch { break; } }
  }
}

const noteContext = root => { const all = listContexts(root).map(c => c.slug); return all.includes("company") ? "company" : all.find(s => !s.startsWith("personal-")) || all[0] || null; };
const commitHash = root => (gitOK(root, "rev-parse", "--short", "HEAD") || "").trim();

/* A teammate's change under the owner's folders, kept for the owner: the files as proposed in
   brain/proposals/<id>/files/, proposal.json (who, when, what, the committed blob each one replaces), and the
   note for the owner. Nothing under about-us/ or config/ is touched here; the caller restores. */
export function proposeChange(root, { by, changes, summary = "" }) {
  const owner = ownerOf(root), at = new Date().toISOString();
  const id = "p_" + createHash("sha256").update(`${at}|${by}|${changes.map(c => c.path).join(",")}`).digest("hex").slice(0, 10);
  const dir = `${PROPOSALS_DIR}/${id}`;
  mkdirSync(join(root, dir, "files"), { recursive: true });
  const files = changes.map(c => {
    if (c.state !== "delete") { const to = join(root, dir, "files", c.path); mkdirSync(dirname(to), { recursive: true }); if (c.content !== undefined) writeFileSync(to, c.content); else copyFileSync(join(root, c.path), to); }
    const base = c.state === "add" ? null : (gitOK(root, "rev-parse", `HEAD:${c.path}`) || "").trim() || null;
    return { path: c.path, change: c.state, base };
  });
  const what = plain(summary) || `${files.length === 1 ? "a change to" : "changes to"} ${files.map(f => f.path).join(", ")}`;
  writeFileSync(join(root, dir, "proposal.json"), JSON.stringify({ id, by: by || null, at, owner, summary: what, files }, null, 2) + "\n");
  const slug = noteContext(root), paths = [dir];
  if (slug && by) {
    try {
      appendMemory(root, slug, { authors: [by], kind: "note", tags: [PROPOSAL_TAG, `for:${owner}`, `proposal:${id}`],
        content: `${nameOf(root, by)} proposes ${files.map(f => `${f.change === "delete" ? "removing" : f.change === "add" ? "adding" : "a change to"} ${f.path}`).join(", ")} for the owner, ${nameOf(root, owner)}, to approve: ${what}. Proposal ${id}; nothing changes until the owner approves it.` });
      paths.push(`brain/contexts/${slug}/memories.jsonl`);
    } catch {}
  }
  const r = commit(root, paths, `proposal ${id} for ${owner}: ${what}`.slice(0, 200), { system: true });
  logActivity(root, "proposal", `${id}: ${files.map(f => f.path).join(", ")} proposed by ${by || "someone"} for ${owner}`);
  return { id, files, summary: what, note: r.note };
}
/* The one line to say after a change became a proposal. */
export const proposalLine = (root, p) => `NOT APPLIED: ${p.files.map(f => f.path).join(", ")} ${p.files.length === 1 ? "is" : "are"} the owner's to change (${nameOf(root, ownerOf(root))}). Kept as proposal ${p.id} for them, the files stay as they were; they see it at their next chat start and approve it or not. Tell the person in one line; do not try another way.`;

/* lib.commit, before anything is staged: a write by someone other than the owner under about-us/ or config/
   becomes a proposal and those files go back to the committed version. Returns {paths, proposal}: the paths
   left to commit and the proposal made (null when none). system: plugin housekeeping (shipped rules and schema
   refreshed, the layout move, setup), never a person's change. */
export function divertCommit(root, paths, message, { system = false } = {}) {
  if (process.env.GTM_BRAIN_NO_COMMIT) return { paths, proposal: null };
  // config/settings.yaml is the marker of layout 3 (lib/brain-paths.mjs). Gone from a brain recorded as layout 3,
  // every rule here would be off and the commit would carry the removal to the team: the committed file comes
  // back first. brain/layout.json is read before git is asked, so a layout 1 or 2 brain pays nothing.
  if (!inConfigFolders(root) && readLayout(root).layout >= 3) {
    try { const committed = execFileSync("git", ["-C", root, "show", `HEAD:${SETTINGS_FILE}`], { stdio: "pipe" }); mkdirSync(dirname(join(root, SETTINGS_FILE)), { recursive: true }); writeFileSync(join(root, SETTINGS_FILE), committed); logActivity(root, "restored", `${SETTINGS_FILE}: it had been deleted; the committed version is back`); } catch {}
  }
  if (system || !inConfigFolders(root)) return { paths, proposal: null };
  const owner = ownerOf(root); if (!owner) return { paths, proposal: null };
  const who = personHere(root);
  if (who && who === owner) return { paths, proposal: null };
  const changes = ownerChanges(root, paths);
  if (!changes.length) return { paths, proposal: null };
  const proposal = proposeChange(root, { by: who, changes, summary: String(message || "").split("\n")[0] });
  restore(root, changes);
  return { paths: paths.filter(p => !isOwnerPath(root, p)), proposal };
}

/* lib.save and the chat start: hand edits under about-us/ and config/. Someone else's: kept as a proposal,
   the committed version back. The owner's: accepted; save commits them and records each (recordOwnEdit). A
   settings file that no longer reads (no company, or no team) is never accepted: it goes back, kept aside. */
export function guardOwnerEdits(root, { by = null } = {}) {
  if (!ownerRules(root) || process.env.GTM_BRAIN_NO_COMMIT) return { accepted: [], proposal: null, restored: [] };
  const changes = ownerChanges(root);
  if (!changes.length) return { accepted: [], proposal: null, restored: [] };
  // settings nobody can read any more go back first, whoever edited them: kept aside, never proposed
  const bad = changes.filter(c => c.path === SETTINGS_FILE && !settingsReadable(root));
  if (bad.length) { keepAside(root, bad); restore(root, bad); }
  const rest = changes.filter(c => !bad.includes(c));
  const who = personHere(root, by), owner = ownerOf(root);
  if ((who && who === owner) || !rest.length) return { accepted: who && who === owner ? rest : [], proposal: null, restored: bad.map(c => c.path) };
  const proposal = proposeChange(root, { by: who, changes: rest, summary: "an edit made by hand" });
  restore(root, rest);
  return { accepted: [], proposal, restored: [...bad, ...rest].map(c => c.path) };
}
function settingsReadable(root) { const a = readAdmin(root); return !!(a && a.company && Array.isArray(a.team) && a.team.length && a.owner); }
function keepAside(root, changes) {
  for (const c of changes) {
    if (c.state === "delete") continue;
    const dir = join(root, "work", "manual-edits", "protected"); mkdirSync(dir, { recursive: true });
    copyFileSync(join(root, c.path), join(dir, `${c.path.replace(/\//g, "__")}.${Date.now()}`));
  }
}
/* The line for a chat start or a save: what happened to the hand edits. */
export function ownerEditNotice(root, g) {
  if (g.proposal) return `${proposalLine(root, g.proposal)}`;
  if (g.restored.length) return `${g.restored.join(", ")}: this edit leaves the settings unreadable (company, owner and team are needed), so the committed version is back and the edit is kept in work/manual-edits/protected/. Tell the person in one line.`;
  return "";
}

/* Every approval, recorded: a decision note (who asked, who approved, which file, a one-line summary) whose
   source is the commit. Committed itself. Returns the note's id, or null when the brain has no context. */
export function recordApproval(root, { asked, approved, files, summary, hash = commitHash(root), outcome = "approved", proposal = null }) {
  const slug = noteContext(root); if (!slug || !approved) return null;
  const list = (files || []).join(", "), what = plain(summary) || "no summary given";
  const verb = outcome === "declined" ? "Declined" : outcome === "own edit" ? "Accepted the owner's own edit of" : "Approved a change to";
  const content = `${verb} ${list}: ${what}. Asked by ${nameOf(root, asked)}, ${outcome === "declined" ? "declined" : "approved"} by ${nameOf(root, approved)}${hash ? `, commit ${hash}` : ""}.`;
  const { rec } = appendMemory(root, slug, { authors: [approved], kind: "decision", content, tags: [APPROVAL_TAG, ...(proposal ? [`proposal:${proposal}`] : []), ...(files || []).slice(0, 5).map(f => `file:${f}`)], source: hash ? [{ kind: "git", ref: hash }] : [] });
  commit(root, [`brain/contexts/${slug}/memories.jsonl`], `approval recorded: ${list}`.slice(0, 200), { system: true });
  return rec.id;
}

/* The proposals waiting, oldest first. brain/proposals/ is shared through git, so a proposal is read as data a
   teammate wrote: it names only files under about-us/ and config/ (never a path that climbs out, never the
   brain's other files), its proposed files are plain files (not links), and its summary is one short line.
   One that does not hold to that is not a proposal: never offered to the owner, never applied. */
const CHANGES = ["add", "edit", "delete"];
function validProposal(root, id, p) {
  if (!p || typeof p !== "object" || !Array.isArray(p.files) || !p.files.length) return null;
  for (const f of p.files) {
    if (!f || typeof f.path !== "string" || !CHANGES.includes(f.change)) return null;
    if (f.path.startsWith("/") || f.path.includes("\\") || posix.normalize(f.path) !== f.path || f.path.split("/").includes("..") || !isOwnerPath(root, f.path) || OWNER_DIRS.includes(f.path)) return null;
    if (f.change !== "delete") { try { if (!lstatSync(join(root, PROPOSALS_DIR, id, "files", f.path)).isFile()) return null; } catch { return null; } }
  }
  return { id, by: typeof p.by === "string" && /^[a-z0-9][a-z0-9-]*$/.test(p.by) ? p.by : null, at: String(p.at || ""), owner: p.owner ? String(p.owner) : null,
    summary: plain(p.summary).slice(0, 200) || "a change", files: p.files.map(f => ({ path: f.path, change: f.change, base: typeof f.base === "string" ? f.base : null })) };
}
export function listProposals(root) {
  const dir = join(root, PROPOSALS_DIR); let ids = [];
  try { ids = readdirSync(dir).filter(n => /^p_[0-9a-f]{10}$/.test(n)).sort(); } catch { return []; }
  return ids.map(id => { try { return validProposal(root, id, JSON.parse(readFileSync(join(dir, id, "proposal.json"), "utf8"))); } catch { return null; } }).filter(Boolean).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
export const readProposal = (root, id) => listProposals(root).find(p => p.id === id) || null;

/* What the owner's form shows: each file's change against the file as it is now. */
export function proposalDiff(root, p) {
  return p.files.map(f => {
    const now = existsSync(join(root, f.path)) ? readFileSync(join(root, f.path), "utf8") : "";
    if (f.change === "delete") return `${f.path}: removed`;
    const raw = readFileSync(join(root, PROPOSALS_DIR, p.id, "files", f.path));
    if (raw.includes(0)) return `${f.path}${f.change === "add" ? " (new)" : ""}: a file that is not text, ${raw.length} bytes`;
    const next = raw.toString("utf8");
    const d = lineDiff(now, next), changed = d.filter(l => /^[-+] /.test(l));
    const moved = f.base && (gitOK(root, "rev-parse", `HEAD:${f.path}`) || "").trim() !== f.base ? " (changed since it was proposed; this replaces that)" : "";
    return `${f.path}${f.change === "add" ? " (new)" : ""}${moved}:\n${changed.slice(0, 40).join("\n")}${changed.length > 40 ? `\n... ${changed.length - 40} more lines` : ""}`;
  }).join("\n\n");
}

/* The owner applies a proposal: the files as proposed, the proposal folder gone, one commit, then the record. */
export function applyProposal(root, id, approver) {
  const p = readProposal(root, id); if (!p) throw new Error(`no proposal ${id} waiting`);
  if (!isOwner(root, approver)) throw new Error(`only the owner, ${nameOf(root, ownerOf(root))}, approves a change to ${p.files.map(f => f.path).join(", ")}`);
  // The settings name the owner and are the marker of this layout: a yes never removes them or leaves them
  // without a company, an owner or a team (the form shows 500 characters; this does not rest on them being read).
  for (const f of p.files.filter(f => f.path === SETTINGS_FILE)) {
    let fm = null; if (f.change !== "delete") { try { fm = parseSettings(readFileSync(join(root, PROPOSALS_DIR, id, "files", f.path), "utf8")).fm; } catch {} }
    if (!fm || !fm.company || !fm.owner || !Array.isArray(fm.team) || !fm.team.length) throw new Error(`proposal ${id} would leave ${SETTINGS_FILE} without a company, an owner or a team. Decline it; the change can be proposed again with those kept`);
  }
  for (const f of p.files) {
    const to = join(root, f.path);
    if (f.change === "delete") { rmSync(to, { force: true }); continue; }
    mkdirSync(dirname(to), { recursive: true }); copyFileSync(join(root, PROPOSALS_DIR, id, "files", f.path), to);
  }
  rmSync(join(root, PROPOSALS_DIR, id), { recursive: true, force: true });
  const r = commit(root, [...p.files.map(f => f.path), `${PROPOSALS_DIR}/${id}`], `approved ${id}: ${p.summary}\n\nAsked by ${p.by || "someone"}, approved by ${approver}.`.slice(0, 400), { system: true });
  const hash = r.ok ? commitHash(root) : "";
  const record = recordApproval(root, { asked: p.by, approved: approver, files: p.files.map(f => f.path), summary: p.summary, hash, proposal: id });
  return { proposal: p, note: r.note, hash, record };
}
/* The owner declines: the proposal folder gone, recorded as declined. */
export function dropProposal(root, id, approver) {
  const p = readProposal(root, id); if (!p) throw new Error(`no proposal ${id} waiting`);
  if (!isOwner(root, approver)) throw new Error(`only the owner, ${nameOf(root, ownerOf(root))}, decides on proposal ${id}`);
  rmSync(join(root, PROPOSALS_DIR, id), { recursive: true, force: true });
  const r = commit(root, [`${PROPOSALS_DIR}/${id}`], `declined ${id}: ${p.summary}`.slice(0, 200), { system: true });
  const record = recordApproval(root, { asked: p.by, approved: approver, files: p.files.map(f => f.path), summary: p.summary, hash: r.ok ? commitHash(root) : "", outcome: "declined", proposal: id });
  return { proposal: p, note: r.note, record };
}

/* The owner's chat start: one line while proposals wait; "" for anyone else, and when none wait. */
export function ownerLine(root) {
  if (!ownerRules(root)) return "";
  const who = personHere(root); if (!who || who !== ownerOf(root)) return "";
  const waiting = listProposals(root); if (!waiting.length) return "";
  const first = waiting[0];
  return `Waiting for your approval (you own about-us/ and config/): ${waiting.length === 1 ? "" : `${waiting.length} proposals, the oldest: `}${nameOf(root, first.by)} proposes ${first.summary} (${first.files.map(f => f.path).join(", ")}, ${first.id}). Say it to the person in one line; approve_change with kind proposal and id ${first.id} shows them the change with an APPROVE choice${waiting.length > 1 ? "; query object approvals lists every one" : ""}.`;
}

/* query (object approvals): the recorded approvals, newest first, then the proposals waiting. */
export function approvalsText(root, memories) {
  const done = memories.filter(m => m.kind === "decision" && (m.tags || []).includes(APPROVAL_TAG)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const waiting = listProposals(root);
  const lines = [`approvals recorded: ${done.length}`, ...done.slice(0, 50).map(m => `- ${String(m.at).slice(0, 10)} ${m.id}: ${m.content}`)];
  lines.push(`proposals waiting for the owner (${nameOf(root, ownerOf(root))}): ${waiting.length}`, ...waiting.map(p => `- ${String(p.at).slice(0, 10)} ${p.id}: ${nameOf(root, p.by)} proposes ${p.summary} (${p.files.map(f => `${f.change} ${f.path}`).join(", ")})`));
  return lines.join("\n");
}
