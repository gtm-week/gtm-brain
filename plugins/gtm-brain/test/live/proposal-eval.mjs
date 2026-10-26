#!/usr/bin/env node
// Are the right interactions proposed? Two loops, each checked deterministically and, with a key,
// judged by an LLM that sees the same evidence a person would.
//   developer loop: allethic --init against this checkout's server. Deterministic: the six writes of
//                   the model's objects are proposed, session tools are not. Judge: from the catalog
//                   alone, which tools are interactions of the model? Agreement with the pruning.
//   company loop:   a brain seeded with a month of use (recurring actions, the screen reached for, a
//                   tool nobody listed). Deterministic: the advisor raises the three findings. Judge:
//                   given the raw usage, are the findings correct, and is each "do" the right next step?
//   node plugins/gtm-brain/test/live/proposal-eval.mjs            (report.json in the printed folder)
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import * as lib from "../../lib/brain.mjs";
import { loadOntology } from "../../lib/ontology/ontology.mjs";
import { hostCatalog, proposeActions } from "../../lib/ontology/review.mjs";
import { judge } from "./judge.mjs";

const plugin = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const artifacts = mkdtempSync(join(tmpdir(), "gtm-proposal-eval-"));
const env = { ...process.env, PLUGIN_ROOT: plugin, GTM_BRAIN_NO_OPEN: "1", GTM_BRAIN_NO_COMPILE: "1", GTM_BRAIN_NO_COMMIT: "1" };
const report = { artifacts, loops: {} };
console.log(`Artifacts: ${artifacts}`);

/* ---- developer loop ---- */
{
  const tools = await hostCatalog([process.execPath, join(plugin, "server", "server.mjs")], { cwd: plugin, env });
  const raw = JSON.parse(readFileSync(join(plugin, "ontology", "gtm-brain.ossie.json"), "utf8"));
  raw.custom_extensions[0].data.actions = raw.custom_extensions[0].data.actions.filter(a => a.name === "remember");
  const file = join(artifacts, "one-action.ossie.json"); writeFileSync(file, JSON.stringify(raw));
  const onto = await loadOntology(file);
  const { proposed, report: r } = proposeActions(onto, tools);
  const names = proposed.map(p => p.name);
  const expected = ["compile_apply", "new_context", "fork_context", "edit_context", "archive_context", "add_name"];
  const never = ["setup_brain", "update_plugin", "check_environment", "recall", "query", "remember"];   // not proposed: session tools, reads, and the one already described
  const notInteractions = ["setup_brain", "update_plugin", "check_environment", "recall", "query", "render_dashboard", "open_dashboard", "save", "upgrade_brain"];
  const checks = { proposesTheSix: expected.every(n => names.includes(n)), keepsSessionToolsOut: never.every(n => !names.includes(n)), scope: r.scope === "brain" };
  // the judge sees only what init saw: the catalog and the model; it does not see our answer
  const catalog = tools.map(t => `- ${t.name}${t.annotations?.readOnlyHint ? " (read-only)" : ""}${(t.inputSchema?.required || []).includes("brain") ? "" : " (takes no brain)"}: ${String(t.description || "").slice(0, 160)}`).join("\n");
  const verdict = await judge("An ontology models a company brain with three formal objects: contexts (channels of work: rule, summary, guidance), memories (append-only notes), and entities (global identities and cited briefs for people, organizations and products). An interaction of the model is a tool that writes one of those objects. Session, install, dashboard, maintenance and tool-checking operations are not interactions. From the catalog, name the tools that are interactions.",
    `CATALOG:\n${catalog}`, '{"interactions": ["tool", ...], "reasoning": "..."}');
  const agree = verdict.interactions ? { judgeSays: verdict.interactions.sort(), weSay: [...expected, "remember"].sort(), overlap: expected.filter(n => verdict.interactions.includes(n)).length } : null;
  if (agree) checks.judgeAgrees = agree.overlap >= 5 && !notInteractions.some(n => verdict.interactions.includes(n));
  report.loops.developer = { checks, proposed: names, judge: verdict, agreement: agree, status: Object.values(checks).every(Boolean) ? "pass" : "fail" };
  console.log(`developer loop: ${report.loops.developer.status} ${JSON.stringify(checks)}\n  proposed: ${names.join(", ")}${agree ? `\n  judge names: ${agree.judgeSays.join(", ")}` : verdict.skipped ? `\n  judge: skipped (${verdict.skipped})` : verdict.error ? `\n  judge: ${verdict.error}` : ""}`);
}

/* ---- company loop ---- */
{
  const root = mkdtempSync(join(tmpdir(), "gtm-proposal-brain-"));
  execFileSync("bash", [join(plugin, "scripts/gtm-brain-setup/setup.sh"), "--company", "Proposal Fixture", "--one-liner", "Synthetic usage", "--owner", "Marta Nowak <marta@example.test>", "--dashboard", "on-demand"], { cwd: root, env, encoding: "utf8" });
  const by = lib.readAdmin(root).team[0].handle;
  const at = d => new Date(Date.now() - d * 86400000).toISOString();
  const M = (ctx, d, content, extra = {}) => lib.appendMemory(root, ctx, { authors: [by], content, kind: "note", tools: [], people: [], at: at(d), ...extra });
  for (let i = 0; i < 4; i++) M("offer", 20 - i * 4, `Moved the deal with retailer ${i + 1} to the next stage in Attio.`, { tools: ["attio"], actions: [{ tool: "attio", action: "move deal", ref: `deal-${i}` }] });
  for (let i = 0; i < 3; i++) M("offer", 18 - i * 5, `Sent the proposal to retailer ${i + 1}.`, { tools: ["gmail"], actions: [{ tool: "gmail", action: "send proposal", ref: `mail-${i}` }] });
  M("icp", 10, "Checked the returns volume for Castorama in the spreadsheet.", { tools: ["google sheets"] });
  M("offer", 7, "Trial length is fourteen days.", { kind: "decision" });
  mkdirSync(join(root, "work"), { recursive: true });
  const usage = [
    { at: at(9), tool: "mcp__gtm_brain__recall", server: "gtm_brain", name: "recall", computer: false, title: "", error: false },
    { at: at(9), tool: "mcp__gtm_brain__remember", server: "gtm_brain", name: "remember", computer: false, title: "", error: true },
    { at: at(9), tool: "mcp__cua_repl__js", server: "cua_repl", name: "js", computer: true, title: "Read the deal stage from the Attio tab", error: false },
    { at: at(3), tool: "mcp__cua_repl__js", server: "cua_repl", name: "js", computer: true, title: "Open the Attio pipeline board", error: false },
    { at: at(2), tool: "mcp__gtm_brain__query", server: "gtm_brain", name: "query", computer: false, title: "", error: false },
  ];
  for (const u of usage) appendFileSync(join(root, "work", "tool-usage.jsonl"), JSON.stringify(u) + "\n");
  const { findings } = JSON.parse(execFileSync(process.execPath, [join(plugin, "scripts/gtm-brain-advisor/advisor.mjs"), ".", "--json"], { cwd: root, env, encoding: "utf8" }));
  const by_ = Object.fromEntries(findings.map(f => [f.key, f]));
  // the advisor drafts one of the company's interactions from the action that recurs most
  let drafted = null; try { drafted = JSON.parse(readFileSync(join(root, "work", "interaction.proposed.json"), "utf8")); } catch {}
  const checks = { proposal: !drafted && /Say: make "move deal" in attio one of our interactions/.test(findings.filter(f => f.key === "recurring-action").map(f => f.do).join("\n")), computerUse: !!by_["computer-use"] && /2 times/.test(by_["computer-use"].what) && /Attio/.test(by_["computer-use"].what), recurring: !!by_["recurring-action"] && /attio: move deal/.test(by_["recurring-action"].what) && /gmail: send proposal/.test(by_["recurring-action"].what), unlisted: !!by_["tool-unlisted"] && /attio/i.test(by_["tool-unlisted"].what) && /gmail/i.test(by_["tool-unlisted"].what) };
  const raised = findings.filter(f => ["computer-use", "recurring-action", "tool-unlisted"].includes(f.key)).map(f => `- [${f.key}] ${f.what}\n  why: ${f.why}\n  do: ${f.do}`).join("\n") || "(none)";
  const memories = lib.listContexts(root).flatMap(c => c.memories).map(m => `${m.context} ${m.at.slice(0, 10)} tools=${m.tools.join(",") || "-"} actions=${(m.actions || []).map(a => a.tool + ":" + a.action).join(",") || "-"}: ${m.content}`).join("\n");
  const verdict = await judge("A company brain keeps notes with the tools used and the actions done. A weekly advisor reads them and a log of the assistant's tool calls (including Computer Use, where the assistant drove the screen) and raises findings, each with a why and a concrete next step. The check is read-only: for an action that recurs it suggests that the person ask for it to become one of the company's own interactions, and it never writes a proposal itself. Judge the findings: correct=true if each finding is supported by the usage and nothing important is missed; actionable=true if each next step is the right one for that finding; proposalFits=true if no proposal was drafted and the recurring actions are suggested as interactions the person can ask for. List anything missed or wrong.",
    `USAGE (notes):\n${memories}\n\nPROPOSAL FILE WRITTEN BY THE CHECK (expected none):\n${drafted ? JSON.stringify(drafted, null, 1) : "(none)"}\n\nTOOL LOG:\n${usage.map(u => `${u.at.slice(0, 10)} ${u.server}:${u.name}${u.computer ? " COMPUTER USE: " + u.title : ""}${u.error ? " (failed)" : ""}`).join("\n")}\n\nWORKPLACE TOOLS LISTED: ${(lib.readAdmin(root).tools || []).join(", ") || "(none)"}\n\nFINDINGS RAISED:\n${raised}`,
    '{"correct": true|false, "actionable": true|false, "proposalFits": true|false, "score": 0..1, "missed": ["..."], "wrong": ["..."]}');
  if (!verdict.skipped && !verdict.error) checks.judge = !!verdict.correct && !!verdict.actionable && !!verdict.proposalFits;
  report.loops.company = { checks, findings: findings.map(f => ({ key: f.key, what: f.what, do: f.do })), judge: verdict, brain: root, status: Object.values(checks).every(Boolean) ? "pass" : "fail" };
  console.log(`company loop: ${report.loops.company.status} ${JSON.stringify(checks)}\n${raised.split("\n").filter(l => l.startsWith("- ")).map(l => "  " + l.slice(2)).join("\n")}${verdict.skipped ? `\n  judge: skipped (${verdict.skipped})` : verdict.error ? `\n  judge: ${verdict.error}` : `\n  judge: ${verdict.score} missed=${JSON.stringify(verdict.missed)} wrong=${JSON.stringify(verdict.wrong)}`}`);
}
writeFileSync(join(artifacts, "report.json"), JSON.stringify(report, null, 2) + "\n");
if (Object.values(report.loops).some(l => l.status !== "pass")) process.exitCode = 1;
