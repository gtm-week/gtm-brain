process.env.GTM_OS_NO_WATCH = "1";
process.env.GTM_OS_NO_COMPILE = "1"; // Model runs are opt-in through test doubles.
process.env.GTM_OS_NO_SESSION_MAINTENANCE = "1"; // Dedicated worker tests exercise asynchronous startup.
// The dashboard server serves the page and revision events. Mutating requests are refused.
// A fake `codex` on PATH records what it was asked to do.
// Run: node --test 'plugins/gtm-os/test/*.test.mjs'
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, chmodSync, existsSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { request } from "node:http";
// Avoid pooled sockets surviving the intentional server restart in this suite.
const fetch = (url, options = {}) => globalThis.fetch(url, { ...options, headers: { connection: "close", ...options.headers } });
const P = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
// Keep real installation preferences out of synthetic test brains.
process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "gtm-os-test-profile-"));

const root = mkdtempSync(join(tmpdir(), "gtm-os-dash-"));
execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
execFileSync("bash", [`${P}/scripts/gtm-os-setup/setup.sh`, "--company", "Reflow", "--one-liner", "returns automation", "--owner", "Marta Nowak <marta@reflow.io>"], { cwd: root, env: { ...process.env, PLUGIN_ROOT: P } });
const bin = mkdtempSync(join(tmpdir(), "gtm-os-bin-")), calls = join(bin, "calls.txt");
writeFileSync(join(bin, "codex"), `#!/bin/sh\nprintf '%s\\n' "\${GTM_OS_RUN:-chat} $*" >> "${calls}"\n`); chmodSync(join(bin, "codex"), 0o755);
for (const command of ["open", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
  writeFileSync(join(bin, command), `#!/bin/sh\nprintf '%s\\n' "$0 $*" >> "${calls}"\n`); chmodSync(join(bin, command), 0o755);
}
const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PLUGIN_ROOT: P, GTM_OS_NO_OPEN: "1", CODEX_HOME: mkdtempSync(join(tmpdir(), "gtm-os-dash-home-")) };
const lib = await import(`${P}/lib/brain.mjs`);
const dash = (...a) => execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, ...a], { encoding: "utf8", env }).trim();
after(() => { try { dash("--stop"); } catch {} });

test("the session hook keeps edits made by hand outside Codex", () => {
  const cover = join(root, "brain", "contexts", "market", "context.md"); writeFileSync(cover, readFileSync(cover, "utf8") + "\nEdited by hand.\n");
  const out = execFileSync("bash", [`${P}/hooks/session-start.sh`], { cwd: root, encoding: "utf8", env, input: JSON.stringify({ session_id: "thread-123", cwd: root }) });
  for (const name of ["questions", "computer-use"]) {
    const policy = readFileSync(join(P, `policies/${name}.md`), "utf8");
    assert.ok(readFileSync(join(root, "AGENTS.md"), "utf8").includes(policy), `the brain's AGENTS.md carries the shared ${name} policy`);
    assert.ok(!out.includes(policy), `the brain hook does not repeat the ${name} policy the chat already has`);
  }
  assert.match(out, /references\/questions\.md once/);
  assert.match(out, /maintenance requested in the background/);
  execFileSync(process.execPath, [`${P}/hooks/session-maintenance.mjs`, root, '--run'], { env });
  assert.equal(execFileSync("git", ["-C", root, "status", "--short", "--", "brain"], { encoding: "utf8" }).trim(), "", "nothing left unkept");
  assert.match(execFileSync("git", ["-C", root, "log", "-1", "--format=%s"], { encoding: "utf8" }), /kept: edited by hand outside Codex/);
});

test("the session hook records the chat id from its stdin", () => {
  dash('--start');
  const out = execFileSync("bash", [`${P}/hooks/session-start.sh`], { cwd: root, encoding: "utf8", env, input: JSON.stringify({ hook_event_name: "SessionStart", session_id: "thread-123", cwd: root }) });
  assert.equal(JSON.parse(readFileSync(join(root, "work", "session.json"), "utf8")).session_id, "thread-123");
  assert.match(out, /Dashboard: http:\/\/127\.0\.0\.1:\d+\//);
  assert.doesNotMatch(out, /FIRST ACTION OF THIS CHAT/, "ordinary answers never wait for a browser");
  assert.match(out, /open only when asked/);
  const admin = join(root, "brain", "admin.md"); writeFileSync(admin, readFileSync(admin, "utf8").replace("dashboard: always", "dashboard: on-demand"));
  const quiet = execFileSync("bash", [`${P}/hooks/session-start.sh`], { cwd: root, encoding: "utf8", env, input: JSON.stringify({ session_id: "thread-123", cwd: root }) });
  assert.doesNotMatch(quiet, /FIRST ACTION/); assert.match(quiet, /opens it on demand/);
  writeFileSync(admin, readFileSync(admin, "utf8").replace("dashboard: on-demand", "dashboard: always"));
  writeFileSync(admin, readFileSync(admin, "utf8").replace("dashboard: always", "dashboard: always\ndashboard_browser: chrome"));
  const chrome = execFileSync("bash", [`${P}/hooks/session-start.sh`], { cwd: root, encoding: "utf8", env, input: JSON.stringify({ session_id: "thread-123", cwd: root }) });
  assert.doesNotMatch(chrome, /FIRST ACTION/); assert.match(chrome, /Dashboard: http:\/\/127\.0\.0\.1:\d+\//);
  assert.match(chrome, /Codex pane/);
  assert.doesNotMatch(chrome, /Chrome opening is handled/);
  writeFileSync(admin, readFileSync(admin, "utf8").replace("dashboard_browser: chrome\n", ""));
  // a loaded context behind at chat start: the hook starts the background run
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-load/load.mjs`, ".", "icp"], { cwd: root, env });
  execFileSync(process.execPath, [`${P}/scripts/gtm-os-remember/remember.mjs`, ".", "--by", "marta", "--context", "icp", "--content", "First note."], { cwd: root, env: { ...env, GTM_OS_NO_COMPILE: "1" } });
  const bgo = execFileSync("bash", [`${P}/hooks/session-start.sh`], { cwd: root, encoding: "utf8", env: { ...env, GTM_OS_NO_COMPILE: "1" }, input: JSON.stringify({ session_id: "thread-123", cwd: root }) });
  assert.match(bgo, /compile: background \(brain\/admin.md\): the summaries that are behind will be updated by a separate run/);
});

test("a separate run's session hook keeps the person's chat and records its own thread for the dashboard", () => {
  const hook = (id, extra) => execFileSync("bash", [`${P}/hooks/session-start.sh`], { cwd: root, encoding: "utf8", env: { ...env, GTM_OS_NO_COMPILE: "1", ...extra }, input: JSON.stringify({ hook_event_name: "SessionStart", session_id: id, cwd: root }) });
  writeFileSync(join(root, "work", "compile.json"), JSON.stringify({ state: "running", at: new Date().toISOString(), contexts: "icp" }));
  const bg = hook("01a0-bg-run", { GTM_OS_RUN: "background" });
  assert.equal(JSON.parse(readFileSync(join(root, "work", "session.json"), "utf8")).session_id, "thread-123", "the background run is not the person's chat");
  const st = JSON.parse(readFileSync(join(root, "work", "compile.json"), "utf8"));
  assert.equal(st.thread, "01a0-bg-run", "the run's thread is on the state the page reads"); assert.equal(st.state, "running", "the rest of the state is kept");
  assert.doesNotMatch(bg, /FIRST ACTION OF THIS CHAT/, "a run with no person in it opens no dashboard");
  hook("01a0-dash-job", { GTM_OS_RUN: "dashboard" });
  assert.equal(JSON.parse(readFileSync(join(root, "work", "session.json"), "utf8")).session_id, "thread-123");
  assert.equal(JSON.parse(readFileSync(join(root, "work", "compile.json"), "utf8")).thread, "01a0-bg-run", "a dashboard job is not a summary run");
  const chat = hook("thread-123", {});
  assert.match(chat, /Never switch this chat to another Codex thread[^\n]*codex:\/\/threads\//, "the rule reaches every chat");
  assert.equal(lib.readCompileState(root).thread, "01a0-bg-run");
});

test("the server serves the viewer, rejects all writes, and never launches Codex", async () => {
  const url=dash("--start");assert.equal(dash("--start"),url);assert.equal(dash("--url"),url);
  assert.equal((await fetch(url)).status,200);
  const before=lib.readMemories(root,"icp");
  const commands=["load market","APPROVE","APPROVE the interaction","connect my tools","update GTM OS","remember in icp: test","skip onboarding for now"];
  for(const text of commands){const r=await fetch(url+"act",{method:"POST",body:JSON.stringify({text})});assert.equal(r.status,405,text)}
  for(const method of ["PUT","PATCH","DELETE"])assert.equal((await fetch(url+"data.json",{method})).status,405);
  for(const path of ["session","jobs","../brain/admin.md"])assert.equal((await fetch(url+path)).status,404);
  assert.deepEqual(lib.readMemories(root,"icp"),before);
  assert.doesNotMatch(existsSync(calls)?readFileSync(calls,"utf8"):"",/^dashboard exec /m);
  const rebound=await new Promise(res=>request(url+"data.json",{headers:{host:"evil.example:80"}},r=>res(r.statusCode)).end());assert.equal(rebound,403);
  assert.equal((await fetch(url,{method:"HEAD"})).status,200);
  assert.equal(dash("--open"),url);
  assert.equal(dash("--open-chrome"),url);
  dash("--stop");assert.equal(dash("--url"),"");assert.equal(dash("--start"),url);
});

test("legacy dashboard open flags never launch an external browser (ALL-207)", () => {
  const before = existsSync(calls) ? readFileSync(calls, "utf8") : "";
  const url = dash("--start");
  for (const flag of ["--open", "--open-chrome"]) {
    const out = execFileSync(process.execPath, [`${P}/server/dash.mjs`, root, flag], { encoding: "utf8", env: { ...env, GTM_OS_NO_OPEN: "" } }).trim();
    assert.equal(out, url);
  }
  assert.equal(existsSync(calls) ? readFileSync(calls, "utf8") : "", before);
});

test("saving a Codex answer publishes a revision and closes the question before compilation", async t => {
  const question=lib.appendMemory(root,"icp",{authors:["marta"],kind:"question",tags:["brain-question"],content:"Should this be a standing rule?"}).rec;
  const task=lib.appendMemory(root,"icp",{authors:["marta"],kind:"question",content:"Artur to follow up in Attio?"}).rec;
  const render=()=>execFileSync(process.execPath,[`${P}/scripts/gtm-os-render/render.mjs`,root],{env});render();
  const url=dash("--start");
  const previous=await (await fetch(url+"data.json")).json();
  assert.ok(previous.questions.some(m=>m.id===question.id));assert.ok(!previous.questions.some(m=>m.id===task.id));
  assert.ok(previous.contexts.find(c=>c.slug==="icp").memories.some(m=>m.id===task.id));
  const abort=new AbortController();t.after(()=>abort.abort());
  const events=await fetch(url+"events",{signal:abort.signal});assert.equal(events.headers.get("content-type"),"text/event-stream");
  const reader=events.body.getReader();await reader.read();
  execFileSync(process.execPath,[`${P}/scripts/gtm-os-remember/remember.mjs`,root,"--by","marta","--context","icp","--retracts",question.id,"--kind","decision","--content","Use this as our standing rule."],{env:{...env,GTM_OS_NO_COMPILE:"1"}});
  const next=await reader.read();assert.match(new TextDecoder().decode(next.value),/event: revision/);
  const current=await (await fetch(url+"data.json")).json();
  assert.notEqual(current.generatedAt,previous.generatedAt);
  assert.ok(!current.questions.some(m=>m.id===question.id));
  assert.ok(current.decisions.some(m=>m.retracts===question.id));
  assert.equal(current.contexts.find(c=>c.slug==="icp").compiledAt,previous.contexts.find(c=>c.slug==="icp").compiledAt);
  const page=await (await fetch(url)).text();const embedded=JSON.parse(page.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(embedded.generatedAt,current.generatedAt);
  abort.abort();
});

test("proposed changes remain readable without dashboard approvals", () => {
  writeFileSync(join(root,"work","admin.proposed.md"),readFileSync(join(root,"brain","admin.md"),"utf8").replace("returns automation","returns automation for UK retailers"));
  writeFileSync(join(root,"work","interaction.proposed.json"),JSON.stringify({name:"move_deal",title:"Moving a deal",tool:"attio",operation:"Move a deal.",input_schema:{type:"object",properties:{deal:{type:"string"}},required:["deal"]},record:{context:"icp",content:"Moved {deal}."}}));
  execFileSync(process.execPath,[`${P}/scripts/gtm-os-render/render.mjs`,root],{env});
  const data=JSON.parse(readFileSync(join(root,"work","home","data.json"),"utf8"));assert.equal(data.brain,root);
  assert.ok(data.proposal.diff.some(l=>l.includes("UK retailers")));assert.equal(data.interaction.name,"move_deal");
  assert.equal(data.interaction.records,"Moved [deal].","the recorded note reads as a sentence, without template syntax or internal action tags");
  const page=readFileSync(join(root,"work","home","index.html"),"utf8");assert.match(page,/data-exact/);assert.match(page,/id="chat-instruction"/);
  assert.doesNotMatch(page,/data-say=|<form|sayBtn|fetch\("\/act/);
  assert.ok(existsSync(join(root,"work","admin.proposed.md")));assert.ok(existsSync(join(root,"work","interaction.proposed.json")));
  writeFileSync(join(root,"work","admin.proposed.md"),readFileSync(join(root,"brain","admin.md"),"utf8"));
  writeFileSync(join(root,"work","interaction.proposed.json"),JSON.stringify({name:"broken",tool:"",operation:"",record:{context:"nowhere"}}));
  execFileSync(process.execPath,[`${P}/scripts/gtm-os-render/render.mjs`,root],{env});
  const inactive=JSON.parse(readFileSync(join(root,"work","home","data.json"),"utf8"));
  assert.equal(inactive.proposal,null);assert.equal(inactive.interaction,null,"invalid or stale proposals do not request a decision");
});

test("entity Markdown downloads preserve context scope and do not rewrite the saved brief", async () => {
  const e = lib.addName(root, "Robin Page");
  const a = lib.appendMemory(root, "icp", { authors: ["marta-nowak"], people: [e.name], content: "Robin Page coordinates the evaluation." }).rec;
  const b = lib.appendMemory(root, "offer", { authors: ["marta-nowak"], people: [e.name], content: "Robin Page asked about annual pricing." }).rec;
  const claim = (text, memory) => ({ text, memories: [memory.id] });
  lib.compileEntity(root, e.id, { by: "marta-nowak", as_of: lib.entityFacts(root, e.id).as_of, brief: {
    overview: [{ text: "Robin coordinates the evaluation and is reviewing pricing.", memories: [a.id, b.id] }],
    contexts: [
      { context: "icp", summary: [claim("Robin coordinates the evaluation.", a)], open_threads: [] },
      { context: "offer", summary: [claim("Robin asked about annual pricing.", b)], open_threads: [] },
    ], relationships: [],
  } });
  const file = join(root, e._path), before = readFileSync(file, "utf8"), url = dash("--start");
  const response = await fetch(`${url}entity?id=${e.id}&context=icp`), markdown = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/markdown/);
  assert.match(response.headers.get("content-disposition"), /attachment/);
  assert.match(markdown, /Robin coordinates the evaluation/);
  assert.doesNotMatch(markdown, /annual pricing|reviewing pricing/);
  assert.ok(markdown.includes(root), "downloaded source links resolve outside the entities folder");
  assert.equal(readFileSync(file, "utf8"), before);
  assert.equal((await fetch(`${url}entity?id=unknown`)).status, 404);
});


test("project dashboard links are local to each opening and leave the shared server URL unchanged", () => {
  const previous = lib.readProjects(root);
  lib.writeProjects(root, [...previous, { slug: "research", title: "Research", path: join(root, "projects", "research"), contexts: [] }]);
  try {
    const company = dash("--start");
    const scoped = dash("--start", "--project=research");
    assert.equal(scoped, company + "#view=home&project=research");
    assert.equal(dash("--open-chrome", "--project=research"), scoped);
    assert.equal(dash("--url"), company);
    assert.equal(JSON.parse(readFileSync(join(root, "work", "dash.json"), "utf8")).url, company);
    assert.throws(() => dash("--start", "--project=missing"), /Unknown dashboard project/);
  } finally { lib.writeProjects(root, previous); }
});
