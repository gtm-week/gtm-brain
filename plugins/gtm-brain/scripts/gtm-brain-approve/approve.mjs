#!/usr/bin/env node
// gtm-brain approve: the only sanctioned way the workplace settings change (brain/admin.md, or config/settings.yaml
// in layout 3: lib/brain-paths.mjs), and the way an owner applies a teammate's proposal (lib/owner.mjs).
//   node approve.mjs <root> --diff                 show the diff between the settings and work/admin.proposed.md
//   node approve.mjs <root> --apply --by <name>    replace the settings with the proposal, commit, remove the proposal
//   node approve.mjs <root> --interaction --by <name>   append work/interaction.proposed.json to brain/ontology.ossie.json, commit, remove the proposal
//   node approve.mjs <root> --proposal <id> --diff                show a teammate's proposal against the files as they are
//   node approve.mjs <root> --proposal <id> --apply --by <name>   the owner applies it (layout 3)
//   node approve.mjs <root> --proposal <id> --drop --by <name>    the owner declines it
// --apply, --interaction and --drop run only with the person's APPROVE: a single-use ticket approve_change issues
// after they chose APPROVE in its form (lib.issueApproval / takeApproval), or, in a terminal, the word typed
// here. A chat's shell has neither. In layout 3 only the owner approves a settings change or a proposal; anyone
// else's settings change becomes a proposal for the owner. Every approval is recorded as a decision note
// (lib/owner.mjs recordApproval). No dependencies.
import { readFileSync, writeFileSync, existsSync, unlinkSync, appendFileSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";
import { workDir } from '../../lib/brain-paths.mjs';
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
// an approved change may carry a team rule: the AGENTS.md block follows it (lib/standing-rules.mjs)
const rulesBlock = async () => { try { (await import(new URL("../../lib/standing-rules.mjs", import.meta.url))).keepRulesBlock(root, "rules: AGENTS.md block refreshed after an approval"); } catch {} };
const owner = await import(new URL("../../lib/owner.mjs", import.meta.url));
const paths = await import(new URL("../../lib/brain-paths.mjs", import.meta.url));
const diff = lib.lineDiff;

const args = process.argv.slice(2); const root = args[0] && !args[0].startsWith("--") ? args.shift() : ".";
const SETTINGS = paths.settingsFile(root), ADMIN = join(root, SETTINGS), PROP = join(root, paths.settingsProposal(root));
const opt = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) { opt[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true; }
const kind = opt.proposal ? "proposal" : opt.interaction ? "interaction" : "admin";

// The person's APPROVE: the form's ticket (approve_change), or typed here when a person runs this in a terminal.
async function personApproved() {
  if (process.env.GTM_BRAIN_APPROVAL_TICKET) return lib.takeApproval(root, kind, process.env.GTM_BRAIN_APPROVAL_TICKET);
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await new Promise(done => rl.question("Type APPROVE to apply this change: ", done)); rl.close();
  return typed.trim() === "APPROVE";
}
const NOT_APPROVED = "not applied: this needs the person's APPROVE. Call the approve_change tool, whose form asks them; never run this script to apply.";
const writes = opt.apply || opt.interaction || opt.drop;
if (!lib.isBrain(root)) { console.error("no brain here"); process.exit(1); }
// Who approves: the person in this checkout (work/person.json, else the brain's git email), else --by.
const approver = () => {
  if (!opt.by || opt.by === true) { console.error(`--${opt.drop ? "drop" : opt.interaction ? "interaction" : "apply"} needs --by <person>`); process.exit(1); }
  const named = lib.teamHandle(root, opt.by); if (!named) { console.error(`--by "${opt.by}" is not in the team (${SETTINGS}). Use a team member's handle, name or email.`); process.exit(1); }
  return owner.personHere(root, named) || named;
};
const audit = what => {
  try { const dir = join(homedir(), ".gtm-brain"); mkdirSync(dir, { recursive: true }); appendFileSync(join(dir, "approvals.log"), `${new Date().toISOString()}\t${process.cwd()}\t${what}\n`); }
  catch (e) { console.error(`gtm-brain: cannot write the approval record to ~/.gtm-brain/approvals.log (${e.code || e.message}). Nothing was changed.`); process.exit(3); }
};

if (opt.proposal) {
  const p = owner.readProposal(root, String(opt.proposal));
  if (!p) { console.error(`no proposal ${opt.proposal} waiting (query object approvals lists them)`); process.exit(1); }
  if (!writes) { console.log(`Proposal ${p.id} from ${p.by || "someone"} (${String(p.at).slice(0, 10)}): ${p.summary}\n\n${owner.proposalDiff(root, p)}\n\nApply it with approve_change (kind proposal, id ${p.id}): its form asks the owner for APPROVE.`); process.exit(0); }
  const by = approver();
  if (!owner.isOwner(root, by)) { console.error(`not applied: only the owner (${owner.ownerOf(root)}) decides on proposal ${p.id}.`); process.exit(5); }
  if (!(await personApproved())) { console.error(NOT_APPROVED); process.exit(4); }
  audit(`${p.id}\t${opt.drop ? "declined" : "approved"} by ${by}\t${p.files.map(f => f.path).join(",")}`);
  let r; try { r = opt.drop ? owner.dropProposal(root, p.id, by) : owner.applyProposal(root, p.id, by); } catch (e) { console.error(`not applied: ${e.message}.`); process.exit(1); }
  if (!opt.drop) await rulesBlock();
  lib.rerender(root);
  console.log(`${opt.drop ? "declined" : "applied"} proposal ${p.id} (${p.files.map(f => f.path).join(", ")}), asked by ${p.by || "someone"}, ${opt.drop ? "declined" : "approved"} by ${by} · ${r.note}${r.record ? ` · recorded as ${r.record}` : ""}`);
  process.exit(0);
}

// --propose: a teammate's settings change in layout 3, kept for the owner. Applies nothing, so it needs no APPROVE.
if (opt.propose) {
  if (!existsSync(PROP)) { console.error(`no proposal at ${paths.settingsProposal(root)}.`); process.exit(1); }
  const by = approver();
  if (owner.isOwner(root, by)) { console.error("you own this brain: approve the change with approve_change (kind admin) instead."); process.exit(1); }
  const before = readFileSync(ADMIN, "utf8"), after = readFileSync(PROP, "utf8"), n = diff(before, after).filter(l => /^[-+] /.test(l)).length;
  if (before === after) { console.error(`proposal is identical to ${SETTINGS}; nothing to propose`); unlinkSync(PROP); process.exit(1); }
  const p = owner.proposeChange(root, { by, changes: [{ path: SETTINGS, state: "edit", content: after }], summary: `a change to the workplace settings (${n} line${n === 1 ? "" : "s"})` });
  unlinkSync(PROP); lib.rerender(root);
  console.log(owner.proposalLine(root, p));
  process.exit(0);
}
if (writes && !(await personApproved())) { console.error(NOT_APPROVED); process.exit(4); }

if (opt.interaction) {
  // --interaction: the only way a company's interaction enters brain/ontology.ossie.json
  const PROPI = join(workDir(root), "interaction.proposed.json");
  if (!existsSync(PROPI)) { console.error(`no proposal at ${lib.workName(root)}/interaction.proposed.json. propose_interaction writes one.`); process.exit(1); }
  const by = approver();
  let proposal; try { proposal = JSON.parse(readFileSync(PROPI, "utf8")); } catch (e) { console.error(`the proposal is not valid JSON: ${e.message}`); process.exit(1); }
  const { actions, error } = lib.readInteractions(root); if (error) { console.error(error); process.exit(1); }
  const errs = lib.validateInteraction(root, proposal, { existing: actions }); if (errs.length) { console.error(`not approved: ${errs.join("; ")}`); process.exit(1); }
  audit(`ontology.ossie.json\tinteraction ${proposal.name} approved by ${by}`);
  lib.writeInteractions(root, [...actions, proposal]);
  const check = lib.readInteractions(root); if (check.error) { console.error(`written but does not load: ${check.error}`); process.exit(1); }
  unlinkSync(PROPI);
  const where = proposal.external === false ? "record only" : proposal.tool;
  const r = lib.commit(root, [lib.interactionsFile(root)], `interactions: ${proposal.name}\n\n${proposal.external === false ? "record only: no tool step" : `${proposal.tool}: ${proposal.operation}`}`, { system: true });
  let record = null; try { if (r.ok) record = owner.recordApproval(root, { asked: by, approved: by, files: [lib.interactionsFile(root)], summary: `interaction ${proposal.name} (${where})` }); } catch {}
  await rulesBlock();
  lib.rerender(root);
  console.log(`added interaction ${proposal.name} (${where}) · ${r.note}${record ? ` · recorded as ${record}` : ""}\nlist_objects shows it from the next call; interact runs it.`);
  process.exit(0);
}
if (!existsSync(ADMIN)) { console.error(`no ${SETTINGS} here`); process.exit(1); }
if (!existsSync(PROP)) { console.error(`no proposal at ${paths.settingsProposal(root)}. Write the full proposed ${SETTINGS} there first.`); process.exit(1); }
const before = readFileSync(ADMIN, "utf8"), after = readFileSync(PROP, "utf8");
if (before === after) { console.error(`proposal is identical to ${SETTINGS}; nothing to approve`); unlinkSync(PROP); process.exit(1); }
if (/[\u2013\u2014\u2015\u2212]/.test(after)) { console.error("proposal contains a long dash; use a plain hyphen"); process.exit(1); }
// Layout 3: the settings are plain key: value lines, and they name the owner. A proposal in the old admin.md
// shape (--- fences) or without a company, an owner or a team would leave a brain nobody can read: refused here,
// at the diff, before any form.
if (paths.inConfigFolders(root)) {
  let fm = {}; try { fm = lib.parseSettings(after).fm; } catch {}
  if (/^---\s*$/m.test(after) || !fm.company || !fm.owner || !Array.isArray(fm.team) || !fm.team.length) { console.error(`not a settings file: ${SETTINGS} is plain "key: value" lines with no --- fences, and keeps company, owner and team. Write the complete file again, starting from ${SETTINGS} as it is now.`); unlinkSync(PROP); process.exit(1); }
}

const d = diff(before, after); const changed = d.filter(l => /^[-+] /.test(l));

if (opt.diff || !opt.apply) {
  console.log(`Proposed change to ${SETTINGS} (${changed.filter(l => l.startsWith("- ")).length} removed, ${changed.filter(l => l.startsWith("+ ")).length} added):\n`);
  // print changed lines with one line of context each side
  d.forEach((l, k) => { if (/^[-+] /.test(l) || (d[k - 1] && /^[-+] /.test(d[k - 1])) || (d[k + 1] && /^[-+] /.test(d[k + 1]))) console.log(l); });
  console.log("\nApply it with approve_change: its form asks the person for APPROVE.");
  process.exit(0);
}

const by = approver();
// Layout 3: the settings are the owner's. Anyone else's approved change waits for the owner as a proposal.
if (!owner.isOwner(root, by)) {
  const p = owner.proposeChange(root, { by, changes: [{ path: SETTINGS, state: "edit", content: after }], summary: `a change to the workplace settings (${changed.length} line${changed.length === 1 ? "" : "s"})` });
  unlinkSync(PROP); lib.rerender(root);
  console.log(owner.proposalLine(root, p));
  process.exit(0);
}
audit(`${SETTINGS}\tapproved by ${by}\t${changed.length} lines`);
writeFileSync(ADMIN, after); unlinkSync(PROP);
const r = lib.commit(root, [SETTINGS], `admin: change approved by ${by}\n\n${changed.join("\n")}`, { system: true });
await rulesBlock();
let record = null; try { if (r.ok) record = owner.recordApproval(root, { asked: by, approved: by, files: [SETTINGS], summary: `${changed.length} line${changed.length === 1 ? "" : "s"} changed: ${changed.slice(0, 2).map(l => l.slice(2).trim()).join("; ").slice(0, 160)}` }); } catch {}
lib.rerender(root);
console.log(`applied ${SETTINGS}, approved by ${by} · ${r.note}${record ? ` · recorded as ${record}` : ""}\n${changed.join("\n")}`);
