#!/usr/bin/env node
// Live saving scenarios: each sentence goes through real Codex (codex exec) on its own copy of a test
// brain, and the table says whether Codex asked or saved, and what. The proof for behaviour changes
// before handing them over (2026-11-12: failures were found by hand, one at a time).
//   node test/live/scenarios.mjs [brain folder, default ~/Documents/new-brain] [case ids, comma]
// codex exec has no question box: a question shows as text ending in "?". The box itself stays a manual check.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";

const P = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const source = process.argv[2] || join(homedir(), "Documents", "new-brain");
const only = (process.argv[3] || "").split(",").filter(Boolean);
const by = JSON.parse(readFileSync(join(source, "work", "person.json"), "utf8")).handle || "maciej-konczal";

const notes = root => readdirSync(join(root, "brain", "contexts")).flatMap(c => { try { return readFileSync(join(root, "brain", "contexts", c, "memories.jsonl"), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } });
const seed = (root, content, people, extra = []) => execFileSync(process.execPath, [`${P}/scripts/gtm-brain-remember/remember.mjs`, ".", "--by", by, "--context", "company", "--content", content, ...(people ? ["--people", people] : []), ...extra], { cwd: root, env: { ...process.env, GTM_BRAIN_RUN: "scenario", GTM_BRAIN_NO_COMPILE: "1" }, stdio: "ignore" });

// expect: "ask" (a question, nothing new saved), "save" (a new note, no question) or "answer" (no save);
// check(result) adds what must be true of the saved note or the reply
const CASES = [
  { id: "forget", say: "Forget that Lena runs the workshop.", setup: r => seed(r, "Lena Dumos will run the workshop.", "Lena Dumos"), expect: "save", check: x => x.added.some(m => m.retracts) || "withdrawn with retracts (F1)" },
  { id: "next-saturday", say: "Can we meet next Saturday?", expect: "ask", check: x => /14/.test(x.reply) && /21/.test(x.reply) || "both dates offered (D2)" },
  { id: "new-surname", say: "Florian Kim joined Globex as head of sales.", expect: "save", check: x => x.added.some(m => (m.people || []).includes("Florian Kim")) || "saved as Florian Kim (P4)" },
  { id: "which-florian", say: "lorian called me about the venue.", setup: r => seed(r, "Florian Kim joined Globex as head of sales.", "Florian Kim", ["--new", "Florian Kim"]), expect: "ask", check: x => /Weber/.test(x.reply) && /Kim/.test(x.reply) || "both Florians offered (P2, W1)" },
  { id: "typo-surname", say: "Lena Dumas will host the panel.", expect: "ask", check: x => /Dumos/.test(x.reply) || "same as Lena Dumos? (P4)" },
  { id: "plain-friday", say: "Ola will send the deck on Friday.", expect: "save", check: x => x.added.some(m => /13 Nov|2026-11-13|November 13|13 November/.test(m.content)) || "Friday written as 13 Nov (D1)" },
  { id: "market-research", say: "Create a new context for market research", expect: "ask", check: x => !x.newContexts.length || `created ${x.newContexts} (X3)` },
  { id: "project-context", say: "Create a new context for the Berlin event", expect: "any", check: x => !x.newContexts.length || `created ${x.newContexts} (X1)` },
  { id: "how-it-works", say: "How does the brain work, and can I edit admin.md myself?", expect: "answer", check: x => /APPROVE/.test(x.reply) || "says APPROVE" },
  { id: "why-saved", say: "Why did you save that Florian Weber is the keynote speaker? That should go to Strategy from now on.", expect: "any", check: x => /RULES\.md/.test(x.reply) || "offers a RULES.md line (R2)" },
].filter(c => !only.length || only.includes(c.id));

async function run(c) {
  const root = mkdtempSync(join(tmpdir(), `gtm-scenario-${c.id}-`));
  execFileSync("git", ["clone", "-q", source, root]);
  mkdirSync(join(root, "work"), { recursive: true });
  for (const f of ["projects.json", "person.json"]) if (existsSync(join(source, "work", f))) writeFileSync(join(root, "work", f), readFileSync(join(source, "work", f), "utf8").replaceAll(source, root));
  c.setup?.(root);
  const before = new Set(notes(root).map(m => m.id)), ctxBefore = new Set(readdirSync(join(root, "brain", "contexts")));
  const out = join(root, "..", `${c.id}-reply.txt`);
  await new Promise(res => { const p = spawn("codex", ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-o", out, c.say], { cwd: root, stdio: ["ignore", "ignore", "ignore"] }); p.on("close", res); });
  const reply = existsSync(out) ? readFileSync(out, "utf8").trim() : "";
  const added = notes(root).filter(m => !before.has(m.id)), newContexts = readdirSync(join(root, "brain", "contexts")).filter(d => !ctxBefore.has(d));
  const asked = /\?\s*(\n|$)|\?\s*\n\s*1[.)]/.test(reply) || /\n\s*1[.)] /.test(reply);
  const shape = c.expect === "any" ? true : c.expect === "ask" ? asked && !added.length : c.expect === "save" ? added.length > 0 && !asked : !added.length;
  const checked = c.check({ reply, added, newContexts });
  return { id: c.id, pass: shape && checked === true, got: `${asked ? "asked" : added.length ? "saved" : "answered"}${added.length ? ` ${added.length} note(s)` : ""}`, why: checked === true ? (shape ? "" : `expected ${c.expect}`) : checked, reply: reply.replace(/\s+/g, " ").slice(0, 140) };
}

const results = [];
for (let i = 0; i < CASES.length; i += 4) results.push(...await Promise.all(CASES.slice(i, i + 4).map(run)));
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(16)} ${r.got.padEnd(18)} ${r.why ? `(${r.why}) ` : ""}| ${r.reply}`);
console.log(`\n${results.filter(r => r.pass).length} of ${results.length} pass`);
process.exitCode = results.every(r => r.pass) ? 0 : 1;
