#!/usr/bin/env node
// gtm-os approve: the only sanctioned way brain/admin.md changes.
//   node approve.mjs <root> --diff                 show the diff between admin.md and work/admin.proposed.md
//   node approve.mjs <root> --apply --by <name>    replace admin.md with the proposal, commit, remove the proposal
//   node approve.mjs <root> --interaction --by <name>   append work/interaction.proposed.json to brain/ontology.ossie.json, commit, remove the proposal
// The person types APPROVE in chat; the skill runs --apply only after that. No dependencies.
import { readFileSync, writeFileSync, existsSync, unlinkSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const diff = lib.lineDiff;

const args = process.argv.slice(2); const root = args[0] && !args[0].startsWith("--") ? args.shift() : ".";
const ADMIN = join(root, "brain", "admin.md"), PROP = join(root, "work", "admin.proposed.md");
const opt = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) { opt[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true; }

if (opt.interaction) {
  // --interaction: the only way a company's interaction enters brain/ontology.ossie.json
  const PROPI = join(root, "work", "interaction.proposed.json");
  if (!existsSync(ADMIN)) { console.error("no brain here"); process.exit(1); }
  if (!existsSync(PROPI)) { console.error("no proposal at work/interaction.proposed.json. propose_interaction writes one."); process.exit(1); }
  if (!opt.by || opt.by === true) { console.error("--interaction needs --by <person>"); process.exit(1); }
  const by = lib.teamHandle(root, opt.by); if (!by) { console.error(`--by "${opt.by}" is not in admin.md team.`); process.exit(1); }
  let proposal; try { proposal = JSON.parse(readFileSync(PROPI, "utf8")); } catch (e) { console.error(`the proposal is not valid JSON: ${e.message}`); process.exit(1); }
  const { actions, error } = lib.readInteractions(root); if (error) { console.error(error); process.exit(1); }
  const errs = lib.validateInteraction(root, proposal, { existing: actions }); if (errs.length) { console.error(`not approved: ${errs.join("; ")}`); process.exit(1); }
  try { const dir = join(homedir(), ".gtm-os"); mkdirSync(dir, { recursive: true }); appendFileSync(join(dir, "approvals.log"), `${new Date().toISOString()}\t${process.cwd()}\tontology.ossie.json\tinteraction ${proposal.name} approved by ${by}\n`); }
  catch (e) { console.error(`gtm-os: cannot write the approval record to ~/.gtm-os/approvals.log (${e.code || e.message}). This step must run outside the sandbox: ask Codex to retry with permission, and allow it.`); process.exit(3); }
  lib.writeInteractions(root, [...actions, proposal]);
  const check = lib.readInteractions(root); if (check.error) { console.error(`written but does not load: ${check.error}`); process.exit(1); }
  unlinkSync(PROPI);
  const r = lib.commit(root, [lib.INTERACTIONS_PATH], `interactions: ${proposal.name}\n\n${proposal.tool}: ${proposal.operation}`);
  lib.rerender(root);
  console.log(`added interaction ${proposal.name} (${proposal.tool}) · ${r.note}\nlist_objects shows it from the next call; interact runs it.`);
  process.exit(0);
}
if (!existsSync(ADMIN)) { console.error("no brain/admin.md here"); process.exit(1); }
if (!existsSync(PROP)) { console.error("no proposal at work/admin.proposed.md. Write the full proposed admin.md there first."); process.exit(1); }
const before = readFileSync(ADMIN, "utf8"), after = readFileSync(PROP, "utf8");
if (before === after) { console.error("proposal is identical to admin.md; nothing to approve"); unlinkSync(PROP); process.exit(1); }
if (/[\u2013\u2014\u2015\u2212]/.test(after)) { console.error("proposal contains a long dash; use a plain hyphen"); process.exit(1); }

const d = diff(before, after); const changed = d.filter(l => /^[-+] /.test(l));

if (opt.diff || !opt.apply) {
  console.log(`Proposed change to brain/admin.md (${changed.filter(l => l.startsWith("- ")).length} removed, ${changed.filter(l => l.startsWith("+ ")).length} added):\n`);
  // print changed lines with one line of context each side
  d.forEach((l, k) => { if (/^[-+] /.test(l) || (d[k - 1] && /^[-+] /.test(d[k - 1])) || (d[k + 1] && /^[-+] /.test(d[k + 1]))) console.log(l); });
  console.log("\nType APPROVE in chat to apply.");
  process.exit(0);
}

if (!opt.by || opt.by === true) { console.error("--apply needs --by <person>"); process.exit(1); }
// The approver must be a team member from admin.md; resolve name, email or handle to the handle.
const handle = lib.teamHandle(root, opt.by);
if (!handle) { console.error(`--by "${opt.by}" is not in admin.md team. Use a team member's handle, name or email.`); process.exit(1); }
opt.by = handle;

// Audit line OUTSIDE the project, written before anything changes. Inside Codex's sandbox this
// write is blocked, so the script stops here and Codex asks the person to allow it to run
// outside the sandbox. That prompt is Codex's own: the model cannot answer it. Typing APPROVE in
// chat is the first confirmation; this prompt is the second, and it cannot be replayed.
try {
  const dir = join(homedir(), ".gtm-os"); mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "approvals.log"), `${new Date().toISOString()}\t${process.cwd()}\tadmin.md\tapproved by ${opt.by}\t${changed.length} lines\n`);
} catch (e) {
  console.error(`gtm-os: cannot write the approval record to ~/.gtm-os/approvals.log (${e.code || e.message}). This step must run outside the sandbox: ask Codex to retry with permission, and allow it. Nothing was changed.`);
  process.exit(3);
}
writeFileSync(ADMIN, after); unlinkSync(PROP);
const r = lib.commit(root, ["brain/admin.md"], `admin: change approved by ${opt.by}\n\n${changed.join("\n")}`);
lib.rerender(root);
console.log(`applied brain/admin.md, approved by ${opt.by} · ${r.note}\n${changed.join("\n")}`);
