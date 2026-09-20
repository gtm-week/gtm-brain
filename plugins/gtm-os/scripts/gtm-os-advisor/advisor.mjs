#!/usr/bin/env node
// The advisor: a health check of the brain from its own files, and three things to do about it.
//   node advisor.mjs <root>            the report, in plain words, for the model to relay
//   node advisor.mjs <root> --json     the findings as data (tests, the dashboard later)
// Reads the brain. The one thing it does: a summary run that should have gone and did not is started again (work/, never brain/).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const lib = await import(new URL("../../lib/brain.mjs", import.meta.url));
const us = await import(new URL("../../lib/user-skills.mjs", import.meta.url));
const args = process.argv.slice(2); const root = args[0] && !args[0].startsWith("--") ? args.shift() : ".";
if (!existsSync(join(root, "brain", "admin.md"))) { console.error("no brain here"); process.exit(1); }
const now = Date.parse(process.env.GTM_OS_NOW || new Date().toISOString());
const days = iso => Math.floor((now - Date.parse(iso)) / 86400000);
const words = s => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const admin = lib.readAdmin(root) || {};
const contexts = lib.listContexts(root), active = contexts.filter(c => c.status === "active");
const names = lib.readNames(root);
let tools = {}; try { tools = JSON.parse(readFileSync(join(root, "work", "tools.json"), "utf8")); } catch {}
const compile = lib.readCompileState(root), busy = lib.compileBusy(root), gaveUp = lib.compileGaveUp(root), plan = lib.compilePlan(root, { now });
const personal = c => /^personal-/.test(c.slug);   // a teammate's own context: never archived, never a finding about quiet
const oldestPending = c => { const p = lib.effectiveMemories(c.memories).filter(m => !c.compiledAt || lib.newer(m.at, c.compiledAt)).map(m => m.at).sort(); return p[0] || null; };

/* every finding: what, why it matters, what to do (a sentence the person can say, or a button on the page), and a weight for the order */
const F = [];
const add = (weight, key, what, why, do_) => F.push({ weight, key, what, why, do: do_ });

// 1. summaries: a run that gave up, or a context whose oldest waiting note is a day old with nothing running and no run due
if (gaveUp) add(100, "summary-failed", `The summary run failed ${compile.attempt || 1} time(s) and gave up (${(compile.contexts || "").replace(/ /g, ", ") || "no context named"}); ${active.filter(c => c.stale).map(c => c.title).join(", ")} still wait.`, "Until it works, the context summaries stop reflecting the notes.", "This one needs a hand: say \"update the summaries now\" in the chat (Codex writes them itself this once); if that fails too, work/hooks.log says why.");
const stalled = c => { const o = oldestPending(c); return c.stale && o && days(o) >= 1 && !busy && !(plan.wait !== null && plan.wait > 0) && !gaveUp; };
// a summary that should have been written and was not is the machine's fault, never the person's todo: the run is started again here
const stalledOnes = active.filter(stalled);
if (stalledOnes.length) { const started = process.env.GTM_OS_NOW ? false : lib.kickCompile(root, { force: true }); add(90, "behind", `${stalledOnes.map(c => c.title).join(", ")} ${stalledOnes.length === 1 ? "has" : "have"} had notes waiting for a summary for ${Math.max(...stalledOnes.map(c => days(oldestPending(c))))} day(s)${stalledOnes.some(c => !c.compiledAt) ? " (never summarised yet)" : ""}.`, "The summary is what every chat reads first; without it a chat reads raw notes, or nothing.", started ? "Nothing: a summary run was started just now and lands in a minute or two." : "Nothing to do by hand; the run starts at the next note or chat."); }
// 2. open questions nobody answered
for (const c of active) for (const m of lib.effectiveMemories(c.memories).filter(m => m.kind === "question" && m.tags.includes("brain-question"))) if (days(m.at) >= 14) add(80, "old-question", `A question in ${c.title} is ${days(m.at)} days old: "${m.content.slice(0, 90)}${m.content.length > 90 ? "..." : ""}"`, "Open questions are the work the brain is waiting on; old ones are either answered elsewhere or dead.", "Review it in its context; answer or drop it in Codex.");
// 2b. a newer plugin where this install came from (work/plugin-version.json, written by the hook's daily check)
let pv = null; try { pv = JSON.parse(readFileSync(join(root, "work", "plugin-version.json"), "utf8")); } catch {}
if (pv && pv.status === "newer") add(85, "plugin-outdated", `GTM OS ${pv.latest} is available; this install is ${pv.installed}.`, "Fixes and new skills arrive only with the update; the brain itself does not change.", "Say in Codex: update GTM OS. Then quit and reopen Codex.");
// 3. tools listed but not reachable; the floor (email, calendar, the CRM) is suggested by the connect check
//    before anyone names it: not connected and not declined is a finding once, never after a decline
const toolKey = t => String(t).toLowerCase().replace(/\s*\(.*\)\s*$/, "").trim();
for (const s of Object.values(tools)) {
  if (!s || !s.suggested || s.declined || (admin.tools || []).some(t => toolKey(t) === toolKey(s.tool))) continue;
  if (String(s.status).startsWith("available")) add(70, "tool-suggested", `${s.tool} is not connected yet${/hubspot/i.test(s.tool) ? " (the CRM the course gives you; Attio works too)" : ""}.`, "Without it the brain misses the pulse of the company.", `Press Connect on the Admin page, or say: connect ${s.tool}. Say: skip ${s.tool} to stop this suggestion.`);
}
for (const t of admin.tools || []) {
  const s = tools[toolKey(t)], st = s ? String(s.status) : "", short = t.replace(/\s*\(.*\)$/, "");
  if (!s || st.startsWith("not checked")) add(70, "tool-unchecked", `${t} is in the workplace info but was never checked${st.includes("failed") ? " (the last check could not run)" : ""}.`, "A tool the brain cannot reach is a promise it cannot keep.", "Say: connect my tools.");
  else if (st.startsWith("available")) add(70, "tool-available", `${t} has an official plugin that is not installed.`, "Notes from it would carry sources and the sync could read it.", "Say in Codex: connect my tools.");
  else if (st === "installed, disabled") add(65, "tool-disabled", `${t}'s plugin is installed but switched off in Codex.`, "Switched off, it reads nothing.", `Enable it in Codex's plugin settings, then say: is ${short} connected?`);
  else if (st.startsWith("not available")) add(30, "tool-blocked", `${t} cannot be connected here: your workspace admin has disabled its plugin.`, "The brain will only ever hear about it through notes you write.", "Ask the workspace admin, or drop it from the tools list (a workplace change, APPROVE).");
  else if (st === "no official plugin") add(30, "tool-manual", `${t} has no official Codex plugin.`, "It can still feed the brain by export or paste; the context rule should say how.", `Say: edit context <context>, add how ${short} is read (export, paste).`);
  else if (st === "installed" && s.test === "fail") add(60, "tool-failing", `${t} is installed but its last read failed${s.note ? ` (${s.note})` : ""}.`, "A failing read usually means the sign-in lapsed.", `Sign in again when Codex asks, then say: is ${short} connected?`);
  else if (st === "installed" && s.test !== "ok") add(50, "tool-untested", `${t} is installed but never read successfully.`, "Installed is not connected; one read test proves the sign-in.", `Say: is ${short} connected?`);
}
// 4. names that may be one entity
for (const m of lib.suggestMerges(names)) add(60, "look-alike", `${m.a} and ${m.b} may be the same ${m.kind}.`, "Two entries split the notes about one thing across two names.", `Say in Codex: ${m.b} is ${m.a} / ${m.b} is not ${m.a}.`);
// 5. quiet contexts, and too many of them
for (const c of active.filter(c => !personal(c))) { const eff = lib.effectiveMemories(c.memories); if (eff.length && c.lastMemory && days(c.lastMemory) >= 30) add(40, "quiet", `${c.title} has had no note for ${days(c.lastMemory)} days.`, "A context nobody writes in is either finished or forgotten.", `Say: archive ${c.slug} (its notes stay searchable), or write what happened.`); if (!eff.length && c.created && days(c.created) >= 14) add(35, "empty", `${c.title} was opened ${days(c.created)} days ago and has no note.`, "An empty context takes a slot on every page and says nothing.", `Say: archive ${c.slug}, or record the first note.`); }
if (active.filter(c => !personal(c)).length > 8) add(45, "too-many", `${active.length} active contexts.`, "Past seven or eight, Home stops being a page one can read.", "Archive the ones that are finished; fold small ones into a bigger one.");
// projects: a linked folder that went quiet, or whose pointer is gone (moved, or the block removed by hand)
for (const p of lib.readProjects(root)) {
  const mine = contexts.flatMap(c => lib.effectiveMemories(c.memories)).filter(m => m.tags.includes(`project:${p.slug}`)).map(m => m.at).sort();
  const last = mine[mine.length - 1] || p.linkedAt;
  if (lib.projectPointerStatus(root, p) !== "ok") add(38, "project-broken", `Project ${p.slug}'s folder has a missing or mismatched pointer (${p.path}).`, "A chat opened there is no longer the project's: its notes lose the tag and its own loaded set.", `Say: link this folder again (/gtm-os-project in ${p.path}), or: unlink project ${p.slug}.`);
  else if (last && days(last) >= 30) add(30, "project-quiet", `Project ${p.slug} has had no note for ${days(last)} days.`, "A project nobody writes from is finished or forgotten.", `Say: unlink project ${p.slug} (its notes keep the tag), or write what happened there.`);
}
// 6. people the brain barely knows
const team = new Set((admin.team || []).map(p => String(p.name || "").toLowerCase()));
const firstOnly = names.filter(n => n.kind === "person" && !team.has(n.name.toLowerCase()) && !n.name.trim().includes(" "));
if (firstOnly.length) add(30, "first-name", `${firstOnly.length} ${firstOnly.length === 1 ? "person is" : "people are"} known by a first name only: ${firstOnly.slice(0, 4).map(n => n.name).join(", ")}${firstOnly.length > 4 ? ", ..." : ""}.`, "A first name alone cannot be matched to an email or a CRM record.", `Say who they are: "${firstOnly[0].name} is <Full Name>".`);
// 7. notes without a trace
const recent = active.flatMap(c => lib.effectiveMemories(c.memories)).filter(m => days(m.at) <= 30 && m.kind === "note");
const bare = recent.filter(m => !m.source.length && !m.people.length && !m.tools.length);
if (recent.length >= 5 && bare.length / recent.length >= 0.7) add(25, "no-sources", `${bare.length} of the last ${recent.length} notes name no person, tool or source.`, "A note with no names and no source is hard to find again and impossible to verify.", "When recording, name who it is about and where it comes from (an email id, a meeting).");
// 8. what every chat loads: the rules, the workplace info, the open covers
const agentsWords = words(existsSync(join(root, "AGENTS.md")) ? readFileSync(join(root, "AGENTS.md"), "utf8") : "");
const loaded = lib.readLoaded(root).map(s => contexts.find(c => c.slug === s)).filter(Boolean);
const coverWords = c => words(c.rule) + words(c.now) + words(c.summary);
// the rules file is the plugin's, the same in every brain: measured apart, so only what this brain adds counts
const load = words(admin.body) + loaded.reduce((n, c) => n + coverWords(c), 0);
for (const c of active) { if (words(c.rule) > 120) add(20, "long-rule", `${c.title}'s standing rule is ${words(c.rule)} words.`, "A rule is read at every load; past a paragraph it is skimmed, not followed.", `Say: edit context ${c.slug}, shorten the rule to the three things that matter.`); if (words(c.now) > 120) add(20, "long-now", `${c.title}'s Next guidance is ${words(c.now)} words.`, "Next guidance should be a few sentences; compile writes it from the notes, so the notes are too many for one summary.", "Fork the biggest thread into its own context, or close what is done."); }
if (load > 2000) add(15, "heavy-load", `Every chat starts by loading about ${load} words of this brain's own (workplace info, ${loaded.length} open context${loaded.length === 1 ? "" : "s"}) on top of the rules (${agentsWords}).`, "The more a chat loads before you speak, the less attention is left for what you say.", "Open fewer contexts at once, and shorten the rules that grew.");

// 9. how the brain is actually used: the tool log the PostToolUse hook writes (work/tool-usage.jsonl), and the
//    actions memories record. The screen reached for, an interaction that keeps recurring, a tool nobody listed.
let usage = []; try { usage = readFileSync(join(root, "work", "tool-usage.jsonl"), "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(u => u && days(u.at) <= 30); } catch {}
const screen = usage.filter(u => u.computer);
if (screen.length) { const titles = [...new Set(screen.map(u => u.title).filter(Boolean))].slice(0, 3); const failedFirst = usage.filter(u => u.server === "gtm_os" && u.error).length; add(75, "computer-use", `Computer Use was used ${screen.length} time${screen.length === 1 ? "" : "s"} in the last 30 days${titles.length ? ` (${titles.join("; ")})` : ""}${failedFirst ? `, and ${failedFirst} GTM OS call${failedFirst === 1 ? "" : "s"} failed in the same period` : ""}.`, "Each one is a GTM OS operation that was missing, failed, or not chosen; the screen is the fallback the policy allows only with approval for that step.", "Say what you were doing when it happened. If a GTM OS tool should have done it, that is a gap for the plugin's review; if the dashboard tab, nothing."); }
const recentAll = active.flatMap(c => lib.effectiveMemories(c.memories).map(m => ({ m, c }))).filter(({ m }) => days(m.at) <= 30);
// Repetition is separate occasions: one batch of thirteen events in an afternoon is one day, not a habit (ALL-213).
const recur = new Map();
for (const { m, c } of recentAll) for (const x of m.actions || []) { if (!x || !x.tool || !x.action) continue; const k = `${x.tool}: ${x.action}`; const r = recur.get(k) || { n: 0, days: new Set(), contexts: new Set() }; r.n++; r.days.add(String(m.at).slice(0, 10)); r.contexts.add(c.slug); recur.set(k, r); }
// Work that repeats on separate days is suggested as a skill of the brain's own (ALL-213): the steps,
// inputs and connector are what a skill keeps. A brain check is read-only and never writes a skill or
// a proposal (ALL-210). An interaction is made only when the person asks for one; a proposal they asked
// for counts as pending only while it is still valid, the same rule the dashboard uses.
const PROPI = join(root, "work", "interaction.proposed.json");
const company = lib.readInteractions(root);
let pendingProposal = null; try { const p = JSON.parse(readFileSync(PROPI, "utf8")); if (!company.error && !lib.validateInteraction(root, p, { existing: company.actions }).length) pendingProposal = p; } catch {}
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const ownSkills = us.listUserSkills(root);
for (const [k, r] of recur) {
  if (r.days.size < 3) continue;
  const [tool, action] = k.split(": "); const name = slug(action);
  const internal = ["gtm-os", "gtm_os", "codex"].includes(tool.toLowerCase());
  const covered = company.actions.some(a => a.tool === tool && (a.name === name || (a.record.action || "").startsWith(`${tool}:${action}`)));
  const has = pendingProposal && pendingProposal.tool === tool && (pendingProposal.name === name || (pendingProposal.record?.action || "").startsWith(`${tool}:${action}`));
  const wanted = us.skillId(`${tool} ${action}`);
  const skill = ownSkills.find(s => s.id === wanted || (s.description.toLowerCase().includes(tool.toLowerCase()) && s.description.toLowerCase().includes(action.toLowerCase())));
  add(55, "recurring-action", `"${k}" was done on ${r.days.size} separate days in the last 30 (${r.n} times; ${[...r.contexts].join(", ")}).`, "Work that repeats is worth keeping as a skill, so every chat does it the same way.", covered ? "It is one of this company's interactions already: the assistant runs it with interact." : internal ? "That is a GTM OS operation: use its tool." : skill ? `The skill ${skill.id} covers it: say /${skill.id}.` : has ? "A proposal is on the dashboard: discuss and approve it in Codex and this becomes an interaction the assistant runs and records the same way each time." : `Say: make a skill for "${action}" in ${tool}.`);
}
if (pendingProposal) add(80, "interaction-proposed", `A new interaction is proposed: ${pendingProposal.name} in ${pendingProposal.tool}.`, "Until it is approved the assistant keeps doing it by hand; once approved it runs and records it the same way every time.", "Review it on the dashboard; approve with APPROVE or drop it in Codex.");
// what people asked (work/turns.jsonl, the UserPromptSubmit hook) against what the reads found: an ask the
// brain had nothing for is a memory gap; the same ask three times is a summary or a rule that should carry it
let turns = []; try { turns = readFileSync(join(root, "work", "turns.jsonl"), "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(t => t && t.kind === "prompt" && t.text && days(t.at) <= 30); } catch {}
const gist = t => String(t).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length > 3).slice(0, 8).join(" ");
const emptyReads = usage.filter(u => u.empty);
const unmet = turns.filter(t => emptyReads.some(u => u.session && u.session === t.session && Date.parse(u.at) >= Date.parse(t.at) && Date.parse(u.at) - Date.parse(t.at) < 10 * 60000));
if (unmet.length) add(65, "asked-empty", `${unmet.length} ask${unmet.length === 1 ? "" : "s"} in the last 30 days found nothing in the brain: "${unmet[0].text.slice(0, 70)}${unmet[0].text.length > 70 ? "..." : ""}"${unmet.length > 1 ? ` and ${unmet.length - 1} more` : ""}.`, "An ask the brain had nothing for is a note nobody wrote, or wrote somewhere it is not found.", "If you know the answer, record it where it belongs; if a tool would know, connect it and let sync read it.");
const askedAgain = new Map(); for (const t of turns) { const g = gist(t.text); if (!g) continue; const r = askedAgain.get(g) || { n: 0, text: t.text }; r.n++; askedAgain.set(g, r); }
for (const [, r] of askedAgain) if (r.n >= 3) add(50, "asked-again", `"${r.text.slice(0, 70)}${r.text.length > 70 ? "..." : ""}" was asked ${r.n} times in the last 30 days.`, "What is asked again and again should be on the summary or in the rule of its context, so the chat starts with it.", "Say: compile <context>, or edit its rule so the answer is there at every load.");
const listed = new Set((admin.tools || []).map(toolKey));
const usedTools = new Set([...recentAll.flatMap(({ m }) => m.tools || []), ...usage.map(u => u.server).filter(s => s && !["gtm_os", "cua_repl", "codex_app", "codex_apps"].includes(s))].map(String));
for (const t of usedTools) if (!listed.has(toolKey(t))) add(45, "tool-unlisted", `${t} is used in the notes but is not in the workplace info.`, "The tools list is what the connect check reads and what every chat is told the company runs on.", `Say: add ${t} to the tools (a workplace change, APPROVE), or: connect ${t}.`);

/* several findings of one kind are one line: "Attio, Gmail and Wispr Flow have official plugins that are not installed" */
const GROUP = { "tool-suggested": (n, xs) => [`${xs.join(", ")} are not connected yet (nobody named them; every company has them${xs.some(x => /hubspot/i.test(x)) ? "; HubSpot is the CRM the course gives you, Attio works too" : ""}).`, "Say in Codex: connect my tools. Say: skip <tool> for any you do not want."], "tool-available": (n, xs) => [`${xs.join(", ")} have official plugins that are not installed.`, "Say in Codex: connect my tools."], "tool-unchecked": (n, xs) => [`${xs.join(", ")} are in the workplace info but were never checked.`, "Say: connect my tools."], "tool-untested": (n, xs) => [`${xs.join(", ")} are installed but never read successfully.`, "Say: are my tools connected? (one read test each)"], "tool-failing": (n, xs) => [`${xs.join(", ")} are installed but their last reads failed.`, "Sign in again when Codex asks, then say: are my tools connected?"], "tool-disabled": (n, xs) => [`${xs.join(", ")} are installed but switched off in Codex.`, "Enable them in Codex's plugin settings."], "tool-blocked": (n, xs) => [`${xs.join(", ")} cannot be connected here (disabled by the workspace admin).`, "Ask the admin, or drop them from the tools list (APPROVE)."], "tool-manual": (n, xs) => [`${xs.join(", ")} have no official Codex plugin.`, "Say how each is read (export, paste) in the fitting context rule."], "old-question": (n, xs) => [`${n} questions are older than two weeks, the oldest in ${xs[0]}.`, "Review them in their contexts and answer or drop them in Codex."], "look-alike": (n, xs) => [`${n} pairs of names may be one entity: ${xs.join("; ")}.`, "Review the Entities page, then tell Codex whether each pair is the same or different."], "quiet": (n, xs) => [`${xs.join(", ")} have had no note for a month or more.`, "Archive what is finished (the notes stay searchable), or write what happened."], "empty": (n, xs) => [`${xs.join(", ")} were opened weeks ago and have no note.`, "Archive them, or record their first note."], "long-rule": (n, xs) => [`The standing rules of ${xs.join(", ")} grew past a paragraph.`, "Say: edit context <slug>, shorten the rule to the three things that matter."], "recurring-action": (n, xs) => [`${n} kinds of work keep repeating: ${xs.join("; ")}.`, "Say: make a skill for any of them."], "tool-unlisted": (n, xs) => [`${xs.join(", ")} are used in the notes but are not in the workplace info.`, "Add them to the tools (a workplace change, APPROVE), or connect them."], "asked-again": (n, xs) => [`${n} asks keep coming back: ${xs.map(x => `"${x}"`).join("; ")}.`, "Put their answers on the summaries or in the rules of their contexts."], "project-broken": (n, xs) => [`${n} project folders lost their pointer: ${xs.join(", ")}.`, "Link them again with /gtm-os-project in each folder, or unlink them."], "project-quiet": (n, xs) => [`${xs.join(", ")} have had no note for a month or more.`, "Unlink what is finished (the notes keep their tag), or write what happened there."] };
const subject = f => ({ "tool-suggested": f.what.split(" is not connected")[0], "tool-available": f.what.split(" has ")[0], "tool-unchecked": f.what.split(" is in ")[0], "tool-untested": f.what.split(" is installed")[0], "tool-failing": f.what.split(" is installed")[0], "tool-disabled": f.what.split("'s plugin")[0], "tool-blocked": f.what.split(" cannot be")[0], "tool-manual": f.what.split(" has no")[0], "old-question": f.what.match(/in (.+?) is \d+ days old/)?.[1] || "", "look-alike": f.what.replace(/ may be the same .*$/, ""), quiet: f.what.split(" has had ")[0], empty: f.what.split(" was opened")[0], "long-rule": f.what.split("'s standing")[0], "recurring-action": f.what.match(/^"(.+?)" was done/)?.[1] || "", "tool-unlisted": f.what.split(" is used")[0], "asked-again": f.what.match(/^"(.+?)" was asked/)?.[1] || "", "project-broken": f.what.replace(/^Project /, "").split("'s folder")[0], "project-quiet": f.what.replace(/^Project /, "").split(" has had")[0] })[f.key];
const grouped = []; const seen = new Map();
for (const f of F) { if (!GROUP[f.key]) { grouped.push(f); continue; } if (!seen.has(f.key)) { seen.set(f.key, { ...f, members: [f] }); grouped.push(seen.get(f.key)); } else seen.get(f.key).members.push(f); }
for (const g of grouped) if (g.members && g.members.length > 1) { const [what, do_] = GROUP[g.key](g.members.length, g.members.map(subject)); g.what = what; g.do = do_; }
for (const g of grouped) delete g.members;
F.length = 0; F.push(...grouped);
F.sort((a, b) => b.weight - a.weight);
const top = F.slice(0, 3);
if (args.includes("--json")) { console.log(JSON.stringify({ findings: F, top, load, contexts: active.length }, null, 1)); process.exit(0); }
console.log(`Brain check: ${active.length} active context${active.length === 1 ? "" : "s"}, ${names.length} entities, ${F.length} finding${F.length === 1 ? "" : "s"}. Every chat loads about ${load + agentsWords} words before the first message (${agentsWords} of rules).`);
if (!F.length) { console.log("\nNothing to improve right now. Keep writing notes with names and sources; the rest follows."); process.exit(0); }
console.log(`\nThree things worth doing:`);
top.forEach((f, i) => console.log(`${i + 1}. ${f.what}\n   Why: ${f.why}\n   Do: ${f.do}`));
if (F.length > 3) console.log(`\nAlso noticed (${F.length - 3} more): ${F.slice(3).map(f => f.what).join(" ")}`);
console.log(`\nThis week: ${top[0].do}`);
