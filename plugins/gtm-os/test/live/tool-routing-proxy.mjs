// Evaluation-only proxy: production MCP operations scoped to one synthetic brain,
// plus a harmless simulated computer-use alternative. No application UI is accessed.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { appendFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { meetingFixtureTools, meetingFixtureResult, upcomingCalendarTool, upcomingCalendarResult } from './meeting-source-fixture.mjs';
import { hubspotWriteTools, createHubspotWriteFixture } from './hubspot-write-fixture.mjs';
import { attioWriteTools, createAttioWriteFixture } from './attio-write-fixture.mjs';
import { crmFixtureTools, crmFixtureResult } from './crm-search-fixture.mjs';
import { listContexts } from "../../lib/brain.mjs";

const [brain, trace, answerPattern, meetingFixture, crmFixture, pluginBuild] = process.argv.slice(2);   // answerPattern: which option the simulated person picks (regex); else the first
const attioWrites = crmFixture?.startsWith('write-') ? createAttioWriteFixture(crmFixture.slice(6)) : null;
const hubspotWrites = crmFixture?.startsWith('hubspot-write-') ? createHubspotWriteFixture(crmFixture.slice(14)) : null;
const crmTools = hubspotWrites ? hubspotWriteTools : attioWrites ? attioWriteTools : crmFixture ? crmFixtureTools(crmFixture) : [];
const root = realpathSync(brain);
// read again at every call: a run may open a channel and then write into it
const contexts = () => new Set(listContexts(root).map(c => c.slug));
const allowed = new Set(["memory_index", "check_environment", "list_projects", "update_entity", "merge_entities", "archive_entity", "undo_entity_merge", "meeting_overview", "render_dashboard", "open_dashboard", "entity_facts", "compile_entity", "customer_overview", "list_objects", "describe_object", "query", "remember", "recall", "load_context", "list_contexts", "who_is", "where_we_are", "onboarding_question",
  "compile_facts", "compile_apply", "new_context", "fork_context", "edit_context", "archive_context", "add_name", "interact", "propose_interaction",
  "question", "configuration_question", "guideline", "document", "skill"]);   // the everyday question form and the two document tools the skill cases exercise
if (meetingFixture === "projects") allowed.add("link_project");
// a simulated connector, the way a real environment has Attio's own tools: the doing has a legitimate path
const connector = { name: "attio_move_deal", description: "Attio (simulated): move a deal to a stage. Returns ok. No real CRM is touched.", inputSchema: { type: "object", properties: { deal: { type: "string" }, stage: { type: "string" } }, required: ["deal", "stage"], additionalProperties: false }, annotations: { title: "Attio (simulated)", readOnlyHint: false, destructiveHint: false, openWorldHint: false } };   // open-world tools need an approval the eval never gives
const fallback = { name: "computer_use", description: "Simulated computer interface for the synthetic GTM OS fixture. Inspect its dashboard or attempt a UI action. This does not control a real application.", inputSchema: { type: "object", properties: { action: { type: "string" } }, required: ["action"], additionalProperties: false }, annotations: { readOnlyHint: true, openWorldHint: false } };
// the server under test: this plugin's, or the build GTM_OS_PLUGIN names (a baseline run)
const build = pluginBuild || process.env.GTM_OS_PLUGIN;
const serverFile = build ? `${build.replace(/\/?$/, "")}/server/server.mjs` : fileURLToPath(new URL("../../server/server.mjs", import.meta.url));
const child = spawn(process.execPath, [serverFile], { stdio: ["pipe", "pipe", "inherit"], env: { ...process.env, ...(process.env.GTM_OS_EVAL_PROFILE ? { CODEX_HOME: process.env.GTM_OS_EVAL_PROFILE } : {}), GTM_OS_NO_OPEN: "1", GTM_OS_NO_COMPILE: "1", GTM_OS_NO_COMMIT: process.env.GTM_OS_EVAL_COMMIT === "1" ? "" : "1" } });
const pending = new Map();
const log = record => appendFileSync(trace, JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n");
log({ kind: 'build', server: serverFile });
const send = message => process.stdout.write(JSON.stringify(message) + "\n");
const result = (id, text, isError = false) => send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) } });
// The native question form, answered here: the server asks the client (elicitation/create), the
// simulated person picks the option the pattern names (else the first, the recommended one), or
// types "yes" when there are no options. Logged as a question and an answer, never shown to Codex.
const answerForm = req => {
  const props = req.params?.requestedSchema?.properties || {}; const options = props.selection?.enum || props.selection?.items?.enum || [];
  const re = answerPattern ? new RegExp(answerPattern, "i") : null;
  const pick = options.find(o => re && re.test(o)) || options[0] || null;
  const content = pick ? (props.selection?.type === "array" ? { selection: [pick], text: "" } : { selection: pick, text: "" }) : { text: "yes" };
  log({ kind: "question", message: req.params?.message, options, answered: content });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { action: "accept", content } }) + "\n");
};
createInterface({ input: child.stdout }).on("line", line => {
  const response = JSON.parse(line);
  if (response.method === "elicitation/create") return answerForm(response);
  const request = pending.get(response.id); pending.delete(response.id);
  if (request?.method === "tools/list") {
    response.result.tools = [...response.result.tools.filter(t => allowed.has(t.name)), connector, ...(meetingFixture === "meetings" ? meetingFixtureTools : []), ...(meetingFixture === "onboarding-calendar" ? [upcomingCalendarTool] : []), ...crmTools, fallback];
    log({ kind: "catalog", tools: response.result.tools });
  }
  if (request?.method === "tools/call") log({ kind: "result", id: response.id, tool: request.params.name, result: response.result, error: response.error });
  send(response);
});
createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line);
  // the server only raises forms for a client that says it can show them: this proxy can
  if (request.method === "initialize") { request.params = { ...(request.params || {}), capabilities: { ...(request.params?.capabilities || {}), elicitation: { form: {} } } }; line = JSON.stringify(request); }
  if (request.method === "tools/call") {
    const { name, arguments: args } = request.params;
    log({ kind: "call", id: request.id, tool: name, arguments: args });
    if (crmTools.some(t => t.name === name)) {
      const data = hubspotWrites ? hubspotWrites.call(name, args) : attioWrites ? attioWrites.call(name, args) : crmFixtureResult(crmFixture, name, args);
      if (hubspotWrites) writeFileSync(`${trace}.hubspot-state.json`, JSON.stringify(hubspotWrites.state, null, 2));
      if (attioWrites) writeFileSync(`${trace}.attio-state.json`, JSON.stringify(attioWrites.state, null, 2));
      log({ kind: "result", id: request.id, tool: name, result: data });
      return result(request.id, JSON.stringify(data), !!data.error);
    }
    if (meetingFixture === "meetings" && meetingFixtureTools.some(t => t.name === name)) {
      const data = meetingFixtureResult(name, args);
      log({ kind: "result", id: request.id, tool: name, result: data });
      return result(request.id, JSON.stringify(data), !!data.error);
    }
    if (name === "computer_use") return result(request.id, "Simulation only: UI fallback attempted. No UI access or writes occurred.", true);
    if (name === "attio_move_deal") return result(request.id, `ok: ${args?.deal || "the deal"} is now at stage ${args?.stage || "?"} in Attio (simulated).`);
    if (meetingFixture === "onboarding-calendar" && name === upcomingCalendarTool.name) {
      const data = upcomingCalendarResult();
      log({ kind: "result", id: request.id, tool: name, result: data });
      return result(request.id, JSON.stringify(data));
    }
    if (meetingFixture?.startsWith("onboarding") && name === "list_projects" && args?.brain === root) {
      const data = { projects: [], codex: { status: "unavailable", projects: [], note: "Synthetic fixture: no host project catalog. Ask the person about existing folders or an explicit skip." } };
      log({ kind: "result", id: request.id, tool: name, result: data });
      return result(request.id, JSON.stringify(data));
    }
    if (!allowed.has(name)) return result(request.id, "Operation outside this synthetic evaluation", true);
    if (name === "link_project") {
      let parent; try { parent = realpathSync(dirname(resolve(args.path))); } catch {}
      if (parent !== root || args.create !== true) return result(request.id, "Only creation directly inside the synthetic brain workspace is allowed", true);
    }
    if (["onboarding_question", "configuration_question", "question"].includes(name)) { pending.set(request.id, request); child.stdin.write(line + "\n"); return; }   // no brain argument: nothing to scope
    let actual; try { actual = realpathSync(args?.brain || (name === "check_environment" ? args?.folder : undefined)); } catch {}
    if (actual !== root) return result(request.id, "Only the synthetic evaluation brain is allowed", true);
    const requestedContexts = [args.context, ...(Array.isArray(args.contexts) ? args.contexts : []), ...(Array.isArray(args.memories) ? args.memories.map(m => m?.context) : [])].filter(c => c !== undefined);
    const known = contexts();
    if (requestedContexts.some(c => !known.has(c))) return result(request.id, "Only existing synthetic contexts are allowed", true);
  }
  if (request.id !== undefined) pending.set(request.id, request);
  child.stdin.write(line + "\n");
});
process.stdin.on("end", () => child.stdin.end());
process.on("SIGTERM", () => child.kill());
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code || 0; process.stdout.end(); });
