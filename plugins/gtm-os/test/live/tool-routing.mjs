#!/usr/bin/env node
// Opt-in real Codex evaluation. Uses account sign-in, isolated config and scratch brains.
// Model outcomes are evidence for these prompts only, never a guarantee of tool preference.
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import * as lib from "../../lib/brain.mjs";
import { dailyRefreshPrompt } from '../../scripts/gtm-os-schedule/daily-run.mjs';
import { hubspotWriteCases } from './hubspot-write-cases.mjs';
import { hubspotMetrics } from './hubspot-write-fixture.mjs';
import { attioWriteCases } from './attio-write-cases.mjs';
import { attioMetrics } from './attio-write-fixture.mjs';
import { judge } from "./judge.mjs";
import { contextRoutingCases } from './context-routing-cases.mjs';

// GTM_OS_PLUGIN points the same cases at another build of the plugin: the baseline a before/after claim needs
const plugin = process.env.GTM_OS_PLUGIN ? process.env.GTM_OS_PLUGIN.replace(/\/?$/, "/") : fileURLToPath(new URL("../../", import.meta.url));
const scratchBase = resolve(process.env.GTM_OS_EVAL_DIR || tmpdir());
mkdirSync(scratchBase, { recursive: true });
const artifacts = mkdtempSync(join(scratchBase, "gtm-tool-routing-"));
const fixtureProfile = join(artifacts, "fixture-profile");
mkdirSync(fixtureProfile);
const env = { ...process.env, CODEX_HOME: fixtureProfile, GTM_OS_EVAL_PROFILE: fixtureProfile, PLUGIN_ROOT: plugin, GTM_OS_NO_OPEN: "1", GTM_OS_NO_COMPILE: "1", GTM_OS_NO_COMMIT: "1" };
const run = (root, operation, args) => execFileSync(process.execPath, [join(plugin, existsSync(join(plugin, "scripts", operation.split("/")[0])) ? "scripts" : "skills", operation), ".", ...args], { cwd: root, env, encoding: "utf8", timeout: 30000 });
const readJSONL = path => existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
const rows = (root, ctx = "offer") => lib.readMemories(root, ctx);
const effective = (root, ctx = "offer") => lib.effectiveMemories(rows(root, ctx));
const cover = (root, slug) => lib.listContexts(root).find(c => c.slug === slug);
const QUESTION_TOOLS = ["onboarding_question", "configuration_question", "question"];   // one form, three names (ALL-203)
const asked = c => QUESTION_TOOLS.includes(c.tool);
const noIdentityWrites = calls => !calls.some(c => ['merge_entities', 'add_name', 'update_entity', 'archive_entity', 'undo_entity_merge'].includes(c.tool));
const noConnectorSweep = calls => !calls.some(c => /^fixture_(mail|calendar)/.test(c.tool));
const noRepeatedReads = calls => { const reads = calls.filter(c => ['who_is', 'recall', 'query'].includes(c.tool)).map(c => JSON.stringify([c.tool, c.arguments])); return new Set(reads).size === reads.length; };
const model = process.env.GTM_OS_EVAL_MODEL || "gpt-5.6-sol";   // local testing; a person's own chats use whatever they chose

/* a company with a month of notes: decisions, a question, people, tools and actions, so a run has
   something to find, correct and summarise. Deterministic; the same brain every time. */
function seedBrain(root, by) {
  const at = d => new Date(Date.UTC(2026, 7, d, 9)).toISOString();
  const M = (ctx, d, content, extra = {}) => lib.appendMemory(root, ctx, { authors: [by], content, kind: "note", tools: [], people: [], at: at(d), ...extra });
  run(root, "gtm-os-entities/entities.mjs", ["--add", "Krzysztof Pawlak", "--alias", "Chris", "--email", "chris@bergstrom.test"]);
  run(root, "gtm-os-entities/entities.mjs", ["--add", "Bergstrom Home", "--kind", "company"]);
  run(root, "gtm-os-entities/entities.mjs", ["--add", "Castorama", "--kind", "company"]);
  M("offer", 3, "Trial length is fourteen days.", { kind: "decision" });
  M("offer", 5, "Pricing is per store, not per user.", { kind: "decision" });
  M("offer", 8, "Krzysztof Pawlak owns the Bergstrom Home rollout.", { people: ["Krzysztof Pawlak", "Bergstrom Home"] });
  M("offer", 12, "Bergstrom Home asked for a security review before the pilot.", { people: ["Bergstrom Home"], tools: ["gmail"], source: [{ kind: "gmail", ref: "19fa01" }] });
  M("offer", 15, "Sent the pilot proposal to Bergstrom Home.", { people: ["Bergstrom Home"], tools: ["gmail"], actions: [{ tool: "gmail", action: "send", ref: "19fa02" }] });
  M("icp", 4, "Mid-market retailers with 20 to 200 stores return the most.", { kind: "decision" });
  M("icp", 9, "Castorama fits the profile: 90 stores, returns handled by hand.", { people: ["Castorama"] });
  M("icp", 14, "Does Castorama buy in Q4?", { kind: "question", people: ["Castorama"] });
  M("strategy", 2, "Enterprise adoption is the priority this half.", { kind: "decision" });
  M("market", 6, "Two competitors now offer returns automation in Poland.", { tools: ["web"] });
}

// an interaction a company approved, for the case that runs it through interact
const MOVE_DEAL = { name: "move_deal", title: "Moving a deal", tool: "attio", operation: "Move the deal to the given stage in Attio (Deals > the deal > Stage).", description: "A deal changes stage.",
  input_schema: { type: "object", properties: { deal: { type: "string", description: "Deal or company name" }, stage: { type: "string", enum: ["lead", "proposal", "negotiation", "won", "lost"] }, note: { type: "string" } }, required: ["deal", "stage"], additionalProperties: false },
  record: { context: "pipeline", kind: "note", companies: ["deal"], people: [], content: "Moved {deal} to {stage}.{note? Note: {note}}", action: "attio:move deal:{deal}", tags: ["deal-stage"] } };
const cases = [
  ...contextRoutingCases,
  ...attioWriteCases,
  ...hubspotWriteCases,
  { name: 'dashboard-chrome', workflow: 'gtm-os-use-brain',
    prompt: 'Open the brain dashboard. It is configured to use a separate Chrome window.',
    prepare: root => { const path = join(root, 'brain', 'admin.md'); writeFileSync(path, readFileSync(path, 'utf8').replace('dashboard: always', 'dashboard: always\ndashboard_browser: chrome')); },
    verify: root => existsSync(join(root, 'work', 'home', 'index.html')),
    calls: calls => calls.some(c => c.tool === 'open_dashboard') && !calls.some(c => c.tool === 'computer_use'),
    responseCheck: text => /Codex|127\.0\.0\.1/i.test(text),
    expect: 'The dashboard tool returns a local URL for the Codex pane. The legacy Chrome setting is ignored, with no Computer Use, external browser launch or login.' },
  { name: 'context-switch', workflow: 'gtm-os-use-brain',
    prompt: 'Switch to Strategy so we can work on our expansion plan.',
    verify: root => JSON.stringify(lib.readLoaded(root)) === JSON.stringify(['strategy']),
    calls: calls => calls.some(c => c.tool === 'load_context' && c.arguments.mode === 'only' && c.arguments.contexts.includes('strategy'))
      && !calls.some(c => asked(c) || c.tool === 'new_context'),
    responseCheck: text => !/\bchannels?\b/i.test(text) && /Strategy/i.test(text),
    expect: 'Use the existing Strategy context, replacing the previous loaded set. No chooser or new context. Confirm briefly with the displayed name Strategy and never call it a channel.' },
  { name: 'context-record',
    prompt: 'Remember this decision: our strategic priority this quarter is expansion into the European market.',
    verify: root => effective(root, 'strategy').some(m => /European/.test(m.content) && /expansion/.test(m.content)),
    calls: calls => calls.some(c => c.tool === 'remember') && !calls.some(c => asked(c) || c.tool === 'new_context'),
    responseCheck: text => !/\bchannels?\b/i.test(text) && /Strategy/i.test(text),
    expect: 'Infer Strategy despite Our offer being loaded, record the decision there, and confirm briefly using the displayed name. No classification question, duplicated context or channel terminology.' },
  ...[false, true].map(declined => ({
    name: declined ? "project-create-declined" : "project-create", creation: true,
    workflow: "gtm-os-project", answer: declined ? "^Cancel$" : "^Create project$",
    responseCheck: text => !/\bchannels?\b/i.test(text),
    prompt: "Create a new project called Website in this GTM OS workspace using /gtm-os-project. Keep it as an empty working folder for now. Do not open an application in this synthetic test.",
    verify: root => declined
      ? !existsSync(join(root, "website")) && lib.readProjects(root).length === 0
      : lib.readProjects(root).some(p => p.slug === "website" && p.path === join(root, "website"))
        && lib.readPointer(join(root, "website"))?.slug === "website"
        && !lib.listContexts(root).some(c => c.slug === "website")
        && !existsSync(join(root, "website/brain")),
    calls: calls => {
      const asks = calls.filter(asked);
      const creates = calls.filter(c => c.tool === "link_project");
      return asks.length === 1 && /website/i.test(asks[0].arguments.question)
        && !/channels/i.test(asks[0].arguments.question)
        && !calls.some(c => ["new_context", "setup_brain", "computer_use"].includes(c.tool))
        && (declined ? creates.length === 0 : creates.length === 1 && creates[0].arguments.create === true);
    },
    expect: declined
      ? "One combined location and capture consent question; Cancel leaves the folder uncreated. No channel-selection question, context creation or application opening."
      : "One combined location and capture consent question, then create Website directly inside the fixture workspace and register it with the shared brain. No channel-selection question, duplicate context, external project language or application opening."
  })),
  { name: "external-subproject", project: true, creation: true, answer: "^Create project$",
    prompt: "Create a new Research subproject inside this linked Curriculum project. Keep the new project empty and do not open an application in this synthetic test.",
    verify: root => {
      const projects = lib.readProjects(root), original = projects.find(p => p.slug === "curriculum");
      return !!original && projects.some(p => p.slug === "research" && existsSync(p.path) && realpathSync(p.path) === realpathSync(join(root, "research")))
        && !existsSync(join(original.path, "research")) && !existsSync(join(original.path, "brain"))
        && lib.readPointer(original.path)?.slug === "curriculum";
    },
    calls: calls => {
      const asks = calls.filter(asked), creates = calls.filter(c => c.tool === "link_project");
      return asks.length === 1 && /research/i.test(asks[0].arguments.question)
        && creates.length === 1 && creates[0].arguments.create === true
        && !calls.some(c => ["setup_brain", "new_context", "unlink_project", "computer_use"].includes(c.tool));
    },
    expect: "Propose Research directly inside the existing GTM OS workspace, explaining that Curriculum remains one project; obtain the simulated person's capture and location consent before creating Research there. Preserve Curriculum and create no nested project or second brain. Do not open applications." },
  { name: 'memory-index',
    prompt: 'Rebuild the local memory search index and tell me when it is ready. Preserve all saved company evidence.',
    verify: (root, { before, after }) => JSON.stringify(before) === JSON.stringify(after) && JSON.parse(run(root, 'gtm-os-advisor/memory-index.mjs', ['--mode', 'status'])).status === 'ready',
    calls: calls => calls.some(c => c.tool === 'memory_index' && c.arguments.mode === 'rebuild'),
    expect: 'The local search cache is rebuilt through the maintenance tool, completion is verified, and the saved source memories remain unchanged. No summary compilation, installation or business questions are needed.' },
  { name: "onboarding-return", onboarding: true, answer: "Skip for now|^Skip$", prompt: "I'm back.",
    responseCheck: text => !/\bchannels?\b/i.test(text) && /skills/i.test(text) && /Admin/i.test(text) && /\/gtm-os-sync/.test(text),
    prepare: (root, by) => {
      const titles = ["Who you are", "Company profile", "Your tools", "What is going on", "Running for you"];
      const outcomes = ["Marta Nowak and Routing Fixture confirmed.", "Company profile approved and applied.", "Marta explicitly skipped all connections for now.", "Snapshot confirmed from supplied notes; one-time summary refresh explicitly declined.", "Marta explicitly skipped automations for now."];
      titles.forEach((title, i) => lib.appendMemory(root, "company", { authors: [by], content: `Onboarding step ${i + 1} (${title}): ${outcomes[i]}` }));
      lib.appendMemory(root, "company", { authors: [by], content: "Imported the handoff from the previous assistant; reviewed with Marta." });
      lib.appendMemory(root, "company", { authors: [by], content: "Onboarding continuation v2 step 6: Earlier choices are saved. Next: ask which existing projects to follow; no project choice has been submitted yet." });
    },
    verify: root => lib.readOnboarding(root).status === "completed" && lib.readOnboarding(root).steps.some(s => s.n === 6 && /skip|declin/i.test(s.outcome)) && lib.effectiveMemories(lib.readMemories(root, "personal-marta-nowak")).some(m => m.tags.includes("onboarding-projects") && /skip|declin/i.test(m.content)),
    calls: calls => { const questions = calls.filter(asked); return questions.length === 1 && /project|folder/i.test(questions[0].arguments.question) && calls.some(c => c.tool === "remember") && !calls.some(c => c.tool === "setup_brain"); },
    expect: "On a greeting after a restart, the agent resumes saved onboarding without asking whether to continue. It asks only for the missing project choice, records the simulated person's Skip for now answer, then saves completion. It does not repeat identity, language, tools, snapshot or automations questions, install connections, or refresh declined summaries." },

  { name: 'crm-retained', crm: 'attio',
    prompt: 'What email do we have saved for Artur Ziętara? Include the source link.',
    prepare: (root, by) => { lib.addName(root, 'Artur Ziętara', { emails: ['artur@northstar.fixture.test'], references: [{ kind: 'attio', ref: 'https://crm.fixture.test/work/people/person-1' }] }); lib.appendMemory(root, 'offer', { authors: [by], people: ['Artur Ziętara'], content: 'CRM checked on September 10, 2026: Artur Ziętara at Northstar uses artur@northstar.fixture.test.', source: [{ kind: 'attio', ref: 'https://crm.fixture.test/work/people/person-1' }] }); },
    verify: (root, { before, after }) => JSON.stringify(before) === JSON.stringify(after),
    calls: calls => calls.some(c => ['who_is', 'recall', 'query'].includes(c.tool)) && !calls.some(c => /^(attio_|hubspot_|fixture_)/.test(c.tool)) && noIdentityWrites(calls),
    expect: 'The saved email is artur@northstar.fixture.test with source https://crm.fixture.test/work/people/person-1. This is retained evidence, not a fresh connector check. No external search was needed.' },
  ...['attio', 'hubspot'].map(crm => ({ name: `crm-${crm}`, crm,
    prompt: 'Find Artur Zientara in our connected CRM and show his email and CRM link. I may have misspelled the surname. Do not change any records.',
    verify: (root, { before, after }) => JSON.stringify(before) === JSON.stringify(after) && !lib.readNames(root).some(n => /Ziętara|Zientara/.test(n.name)),
    calls: calls => calls.some(c => c.tool === (crm === 'attio' ? 'attio_search_records' : 'hubspot_search_contacts')) && calls.some(c => c.tool === (crm === 'attio' ? 'attio_get_record' : 'hubspot_get_contact') && c.arguments.id === 'person-1') && noIdentityWrites(calls) && noConnectorSweep(calls),
    expect: 'Artur Ziętara at Northstar, email artur@northstar.fixture.test, CRM link https://crm.fixture.test/work/people/person-1. The supplied spelling was approximate. No records changed and no invented identity merge.' })),
  { name: 'crm-empty', crm: 'empty', answer: 'unresolved|keep|separate|cannot|not merge',
    prompt: 'Look in our connected CRM for Zientara. Could the saved Artur Zientara and Artur Ziętara entries be duplicates? Inspect them and explain what the evidence supports.',
    prepare: root => { lib.addName(root, 'Artur Zientara'); lib.addName(root, 'Artur Ziętara'); },
    verify: (root, { before, after }) => JSON.stringify(before) === JSON.stringify(after) && ['Artur Zientara', 'Artur Ziętara'].every(name => lib.readNames(root).some(e => e.name === name && !e.merge_ids?.length)),
    calls: calls => calls.some(c => c.tool === 'attio_search_records') && calls.filter(c => ['attio_search_records', 'attio_list_records'].includes(c.tool)).length <= 2 && noRepeatedReads(calls) && noIdentityWrites(calls) && noConnectorSweep(calls),
    expect: 'CRM search found no record in the checked scope. Similar spellings are plausible candidates, not evidence that the two saved identities are the same. No merge, alias or false claim of nonexistence. Identity remains unresolved.' },
  { name: "entity-lifecycle", prompt: 'The two person records Krzysztof Pawlak and Christopher Paul are the same person; I confirm the merge and want Krzysztof Pawlak to survive. Combine them and their contact details. Then change his primary name to Krzysztof Paul, remove KP from his aliases if present, and archive his identity. Keep all context notes. Show what changed and how I can restore him.',
    prepare: (root) => { lib.addName(root, "Krzysztof Pawlak", { aliases: ["KP"] }); lib.addName(root, "Christopher Paul", { emails: ["paul@fixture.test"] }); },
    verify: (root, { before, after }) => { const n = lib.readNames(root).find(n => n.name === "Krzysztof Paul"); return !!n && n.status === "archived" && n.merge_ids.length === 1 && n.aliases.includes("Christopher Paul") && !n.aliases.includes("KP") && n.emails.includes("paul@fixture.test") && !lib.readNames(root).some(n => n.name === "Christopher Paul") && before.every(m => after.some(a => JSON.stringify(a) === JSON.stringify(m))); },
    calls: calls => { const merges = calls.filter(c => c.tool === "merge_entities"); return merges.some(c => !c.arguments.as_of) && merges.some(c => c.arguments.as_of) && calls.some(c => c.tool === "update_entity") && calls.some(c => c.tool === "archive_entity"); },
    expect: "The two identities were explicitly merged with Krzysztof Pawlak's ID surviving, renamed Krzysztof Paul, and archived. Contact details are combined, KP is absent, context notes are preserved, and restoration is explained as restoring the archived identity. No claim of permanent data erasure." },

  { name: "entities", prompt: 'Show me the organizations we know about, their company or team classification, which contexts contain evidence about each, and where to read their source notes. Then drill into Bergstrom Home\'s current offer evidence. Do not update anything.',
    verify: (root, { before, after }) => JSON.stringify(before) === JSON.stringify(after) && ["Bergstrom Home", "Castorama"].every(name => lib.readNames(root).some(e => e.name === name && e.kind === "organization" && e.subtype === "company")),
    calls: calls => calls.some(c => c.tool === "query" && c.arguments.object === "entities" && c.arguments.filters?.kind === "organization") && calls.some(c => c.tool === "query" && c.arguments.object === "memories" && c.arguments.filters?.entities) && calls.some(c => (c.tool === "query" && c.arguments.object === "memories" && c.arguments.filters?.entities && c.arguments.filters?.context === "offer") || (c.tool === "recall" && c.arguments.entity && c.arguments.context === "offer")),
    expect: "Bergstrom Home and Castorama are organizations of subtype company. Bergstrom has evidence in offer; Castorama in icp. The offer evidence says Chris owns Bergstrom's rollout, a security review was requested before the pilot, and the pilot proposal was sent. Link the context memory sources. Do not invent a meeting date or claim live connector verification. No memories are changed." },
  { name: "meeting-capture", meetings: true,
    prompt: 'Check all pages of my connected meeting notes for relevant work conversations. Capture what happened and the useful findings in the existing contexts. Keep source links and show the meeting overview. A historical calendar or CRM match is not required. Do not treat an agenda or scheduled recording as a completed conversation.',
    verify: root => { const view=lib.meetingOverview(root); const m=view.meetings.find(m=>m.occurrence==="happened"); return !!m && view.meetings.filter(m=>m.occurrence==="happened").length===1 && m.sources.some(s=>s.ref==="https://meetings.example.test/recording-1?account=work#transcript") && m.outcomes.some(x=>/template|configur/i.test(x.content)) && !view.meetings.some(m=>m.occurrence==="happened"&&m.title.includes("Upcoming")); },
    calls: calls => calls.some(c=>c.tool==="fixture_notes_list"&&c.arguments.cursor==="page-2") && calls.some(c=>c.tool==="fixture_notes_read"&&c.arguments.id==="recording-1") && calls.some(c=>c.tool==="remember"&&(c.arguments.meeting||c.arguments.memories?.some(m=>m.meeting))) && calls.some(c=>c.tool==="query"&&c.arguments.object==="meetings"),
    expect: 'The completed Bergstrom conversation is captured with the original source link and findings. The future agenda is not a happened meeting. No calendar or CRM lookup is required.' },
  { name: "meeting-daily", meetings: true, daily: true,
    prompt: 'Run the configured daily meeting refresh and compilation. Continue with available evidence if a connector fails.',
    verify: root => { const view=lib.meetingOverview(root); return !view.meetings.some(m=>m.evidence.some(e=>e.meeting.reference.ref==="empty-2")&&m.state!=="planned") && view.meetings.some(m=>m.occurrence==="happened"&&m.outcomes.length>0) && view.coverage.some(c=>/calendar/i.test(c.tool)&&c.status==="unavailable") && lib.listContexts(root).some(c=>c.compiledAt&&/template|configur/i.test(c.summary||"")); },
    calls: calls => calls.some(c=>c.tool==="fixture_calendar_list") && calls.some(c=>c.tool==="remember") && calls.some(c=>c.tool==="compile_apply"),
    expect: 'Meeting evidence was saved, calendar failure was reported without blocking compilation, and the summaries use captured evidence. No interactive question or claim of a successful calendar refresh.' },
  { name: "meeting-recollection", prompt: 'Yesterday I spoke informally with Chris about Bergstrom. He said setup takes too long. There was no recording or calendar invitation. Save that conversation and finding in offer, attributed to my recollection, and show it back to me. Do not guess the clock time.',
    verify: root => lib.meetingOverview(root).meetings.some(m=>m.occurrence==="happened" && m.evidence.some(e=>e.meeting.basis==="user"&&e.meeting.evidence==="recollection") && m.outcomes.some(x=>/setup|long/i.test(x.content))),
    calls: calls => calls.some(c=>c.tool==="remember") && calls.some(c=>c.tool==="query"&&c.arguments.object==="meetings"),
    expect: 'An informal conversation and its setup finding are retained, attributed to Marta, without inventing a recording or precise clock time.' },
  { name: "customers", prompt: 'Acme and Helena Novak are paying customers as of September 13, 2026. Neither is in the CRM, and neither has any outstanding task. Please keep both relationships in Target customers, citing my confirmation, then show me the customer overview with its sources and any coverage gaps. Do not contact anyone or update the CRM.',
    verify: root => { const customers=lib.customerOverview(root).customers; return ["Acme","Helena Novak"].every(name=>customers.some(c=>c.name===name&&c.status==="customer"&&c.basis==="user"))&&customers.find(c=>c.name==="Acme")?.kind==="organization"; },
    calls: calls => calls.some(c=>c.tool==="remember")&&calls.some(c=>c.tool==="query"&&c.arguments.object==="customers"),
    expect: "Both Acme (company) and Helena Novak (person) are retained as user-confirmed paying customers in icp despite no CRM records or tasks. The overview cites the user's confirmation and does not claim complete source coverage or invent CRM links." },
  { name: "batch", prompt: 'Save these three distinct findings in offer: "Pilot lasts thirty days." "Security review is due Friday." "Pricing is per store." Then tell me what you saved.',
    verify: root => ["Pilot lasts thirty days.", "Security review is due Friday.", "Pricing is per store."].every(text => effective(root).some(m => m.content === text)),
    calls: calls => calls.some(c => c.tool === "remember" && c.arguments.memories?.length === 3) },
  { name: "correction", seed: "Trial length is fourteen days.", prompt: 'Correct our offer decision: trial length is thirty days, replacing the previous fourteen-day decision. Then find the current offer decisions and report the trial length.',
    verify: root => { const all = rows(root), old = all.find(m => m.content === "Trial length is fourteen days."); return old && all.some(m => m.supersedes === old.id) && !effective(root).some(m => m.id === old.id) && effective(root).some(m => /thirty|30/.test(m.content)); },
    calls: calls => { const write = calls.findIndex(c => c.tool === "remember"); return write >= 0 && calls.slice(write + 1).some(c => c.tool === "query" && c.arguments.object === "memories" && c.arguments.filters?.context === "offer" && c.arguments.filters?.kind === "decision"); } },
  { name: "alias", prompt: 'Find the current offer memories about Chris. Who owns the Bergstrom Home rollout?',
    verify: root => effective(root).some(m => m.people.includes("Krzysztof Pawlak")),
    calls: calls => calls.some(c => (c.tool === "query" && /Chris/i.test(c.arguments.search || "")) || (c.tool === "recall" && /Chris/i.test(c.arguments.query || "")) || c.tool === "who_is"),
    expect: "Krzysztof Pawlak (Chris) owns the Bergstrom Home rollout." },
  // the interactions the ontology now describes: each generated tool, chosen and run
  { name: "open-channel", prompt: 'Open a new channel with slug pipeline titled "Pipeline" whose rule is "Deals in flight: who, stage, next step." Then record in it that Bergstrom Home is at proposal stage. Tell me what you did.',
    verify: root => !!cover(root, "pipeline") && effective(root, "pipeline").some(m => /Bergstrom/.test(m.content)),
    calls: calls => calls.some(c => c.tool === "new_context" && c.arguments.slug === "pipeline") && calls.some(c => c.tool === "remember"),
    expect: "A pipeline channel exists with the given rule and one memory about Bergstrom Home at proposal stage." },
  { name: "edit-rule", prompt: 'Change the standing rule of the offer channel to: "Every price decision names the customer it was made for." Confirm the new rule.',
    verify: root => /names the customer/.test(cover(root, "offer").rule || ""),
    calls: calls => calls.some(c => c.tool === "edit_context" && c.arguments.slug === "offer"),
    expect: "The offer channel's rule is now the given sentence; nothing else changed." },
  { name: "archive", prompt: 'The market channel is finished for now. Archive it and confirm.',
    verify: root => cover(root, "market")?.status === "archived",
    calls: calls => calls.some(c => c.tool === "archive_context" && c.arguments.slug === "market"),
    expect: "The market channel is archived; its notes remain." },
  { name: "name", prompt: '"KP" is another way people write Krzysztof Pawlak. Register that, then tell me his email.',
    verify: root => { const n = lib.readNames(root).find(n => n.name === "Krzysztof Pawlak"); return !!n && n.aliases.includes("KP"); },
    calls: calls => calls.some(c => c.tool === "add_name" && /KP/.test(JSON.stringify(c.arguments))),
    expect: "KP is an alias of Krzysztof Pawlak; his email is chris@bergstrom.test." },
  { name: "fork", prompt: 'Fork the offer channel into a new channel with slug bergstrom titled "Bergstrom Home", keeping only the memories that mention Bergstrom. Tell me how many memories it holds.',
    verify: root => { const c = cover(root, "bergstrom"); return !!c && effective(root, "bergstrom").length >= 2 && effective(root, "bergstrom").every(m => /Bergstrom/.test(m.content)) && cover(root, "offer").status === "active"; },
    calls: calls => calls.some(c => c.tool === "fork_context" && c.arguments.from === "offer" && c.arguments.slug === "bergstrom"),
    expect: "A bergstrom channel forked from offer holds the three Bergstrom Home memories (rollout owner, security review, proposal sent); offer is unchanged." },
  // everyday work: remember holds the note back (a look-alike first name); the right move is one native
  // question, then remember again with the answer. The proxy answers as the person: someone new.
  { name: "ask", answer: "new|else|different|not|another|inn|now", prompt: 'Remember in offer: Krzysztof Nowak from Castorama asked for a volume discount. Then confirm what you saved.',
    verify: root => effective(root).some(m => /volume discount/.test(m.content) && m.people.includes("Krzysztof Nowak")) && lib.readNames(root).some(n => n.name === "Krzysztof Nowak") && !lib.readNames(root).find(n => n.name === "Krzysztof Pawlak").aliases.some(a => /Nowak/.test(a)),
    calls: calls => { const q = calls.findIndex(asked); return q >= 0 && calls.slice(q + 1).some(c => c.tool === "remember"); },
    expect: "Krzysztof Nowak was recorded as a new person, not merged with Krzysztof Pawlak; the assistant asked through the question form before saving and the note about the volume discount is in offer." },
  { name: "interact", interaction: true, prompt: 'Move the Castorama deal to the proposal stage in Attio and note that they asked for a discount. Then tell me what you did and what was recorded.',
    verify: root => { const m = lib.effectiveMemories(lib.readMemories(root, "pipeline")).find(x => /Castorama/.test(x.content) && /proposal/.test(x.content)); return !!m && m.actions.some(a => a.tool === "attio" && a.action === "move deal") && m.people.includes("Castorama"); },
    calls: calls => calls.some(c => c.tool === "interact" && c.arguments.name === "move_deal" && /Castorama/.test(JSON.stringify(c.arguments.params))),
    expect: "The move was recorded in pipeline through the company's move_deal interaction (Castorama, stage proposal, the discount note), and the move itself was done with the Attio tool (simulated), not by hand and not through the screen." },
  // a chat opened in a linked folder: the hook names the project, the note is tagged with it, the person hears the name, never the path
  { name: "project", project: true, prompt: 'Note that the M2 curriculum draft is due Friday. Then tell me where you kept it and which project it belongs to.',
    verify: root => lib.listContexts(root).filter(c => c.status === "active").some(c => lib.effectiveMemories(lib.readMemories(root, c.slug)).some(m => /M2/.test(m.content) && /Friday/.test(m.content) && m.tags.includes("project:curriculum"))),
    calls: calls => calls.some(c => c.tool === "remember" && c.arguments.project === "curriculum"),
    expect: "The note is kept in a fitting channel, tagged with the project curriculum; the answer names the project as curriculum, names the channel it chose, and prints no folder path." },
  { name: "project-interact", project: true, interaction: true, prompt: 'Move the Castorama deal to the proposal stage in Attio and note that they asked for a discount. Then tell me what was recorded and which project it belongs to.',
    verify: root => { const m = lib.effectiveMemories(lib.readMemories(root, "pipeline")).find(x => /Castorama/.test(x.content) && /proposal/.test(x.content)); return !!m && m.tags.includes("project:curriculum"); },
    calls: calls => calls.some(c => c.tool === "interact" && c.arguments.name === "move_deal" && c.arguments.project === "curriculum"),
    expect: "The move was recorded in pipeline through move_deal, tagged with the project curriculum; the answer names the project as curriculum and prints no folder path." },
  { name: "compile", prompt: 'Update the offer channel summary and working guidance from its memories.',
    verify: root => { const c = cover(root, "offer"); return !!c.compiledAt && /fourteen|14|per store|Bergstrom/i.test(c.summary || ""); },
    calls: calls => { const f = calls.findIndex(c => c.tool === "compile_facts"); return f >= 0 && calls.slice(f + 1).some(c => c.tool === "compile_apply" && c.arguments.context === "offer"); },
    expect: "The offer summary mentions the fourteen-day trial, per-store pricing and the Bergstrom Home rollout, and nothing not in the memories." },
  { name: "compile-guidance", prompt: 'Refresh the offer context from its saved memories so the next chat can pick up the work.',
    prepare: (root, by) => {
      const lesson = lib.appendMemory(root, "offer", { authors: [by], content: "For renewal planning in this CRM, use renewal_end; close_date is the original sale date. This was verified against the renewal records.", tools: ["attio"], source: [{ kind: "attio", ref: "fixture/renewal-fields" }] }).rec;
      lib.appendMemory(root, "offer", { authors: [by], content: "Marta needs to confirm Bergstrom Home's renewal owner by Friday.", people: ["Bergstrom Home"], source: [{ kind: "user", ref: by }] });
      const c = cover(root, "offer");
      lib.writeContext(root, "offer", { ...c.fm, rule: c.rule, now: `Use renewal_end for renewal dates (${lesson.id}).\n\nConfirm Bergstrom Home's renewal owner by Friday.` });
    },
    verify: (root, { before, after }) => {
      const c = cover(root, "offer"), lesson = effective(root).find(m => m.content.startsWith("For renewal planning in this CRM"));
      return !!c.compiledAt && c.now.includes("renewal_end") && c.now.includes(lesson.id) && !/owner|Friday/i.test(c.now)
        && /owner/i.test(c.summary) && /Friday/i.test(c.summary) && c.rule === lib.DEFAULT_CONTEXTS.find(c => c.slug === "offer").rule
        && JSON.stringify(before) === JSON.stringify(after);
    },
    calls: calls => calls.some(c => c.tool === "compile_facts") && calls.some(c => c.tool === "compile_apply" && c.arguments.context === "offer"),
    expect: "Working guidance retains the verified renewal_end method with its memory citation. The Friday owner follow-up is in the summary and existing memory, not working guidance. Standing instructions and source memories are unchanged." },
  { name: "compile-empty", prompt: 'Refresh the offer context from its saved memories so the next chat can pick up the work.',
    prepare: (root, by) => {
      lib.appendMemory(root, "offer", { authors: [by], content: "Marta needs to confirm Bergstrom Home's renewal owner by Friday.", people: ["Bergstrom Home"], source: [{ kind: "user", ref: by }] });
      const c = cover(root, "offer");
      lib.writeContext(root, "offer", { ...c.fm, rule: c.rule, now: "Confirm Bergstrom Home's renewal owner by Friday." });
    },
    verify: (root, { before, after }) => {
      const c = cover(root, "offer");
      return !!c.compiledAt && c.now === "" && /owner/i.test(c.summary) && /Friday/i.test(c.summary)
        && c.rule === lib.DEFAULT_CONTEXTS.find(c => c.slug === "offer").rule && JSON.stringify(before) === JSON.stringify(after);
    },
    calls: calls => calls.some(c => c.tool === "compile_apply" && c.arguments.context === "offer" && c.arguments.now === ""),
    expect: "Working guidance is empty because the records teach no reusable method. The Friday renewal-owner follow-up remains in the summary and existing memory. No generic guidance or new memories are invented." },
];

/* the judge reads the final answer against the seeded notes and the state change */
const channels = root => lib.listContexts(root).map(c => `${c.slug} [${c.status}] "${c.title}"${c.rule ? ` rule: ${String(c.rule).replace(/\s+/g, " ").slice(0, 120)}` : ""}${c.compiledAt ? ` summary at ${c.compiledAt.slice(0, 16)}` : ""}`).join("\n");
async function judgeAnswer(scenario, { root, before, after, final, calls, channelsBefore, records }) {
  const line = m => `${m.context} ${m.at.slice(0, 10)} [${m.kind}] ${m.content}${m.people?.length ? ` (people: ${m.people.join(", ")})` : ""}${m.tools?.length ? ` (tools: ${m.tools.join(", ")})` : ""}${m.actions?.length ? ` (actions: ${m.actions.map(a => `${a.tool}:${a.action}${a.ref ? ":" + a.ref : ""}`).join(", ")})` : ""}${m.tags?.length ? ` (tags: ${m.tags.join(", ")})` : ""}${m.supersedes ? ` (corrects ${m.supersedes})` : ""}`;
  const memories = before.map(line).join("\n");
  // the registry is part of the brain: a name's aliases and email are facts the answer may use
  const registry = lib.readNames(root).map(n => `${n.name}${n.kind !== "person" ? ` (${n.kind})` : ""}${n.aliases.length ? `; also ${n.aliases.join(", ")}` : ""}${n.emails.length ? `; email ${n.emails.join(", ")}` : ""}`).join("\n") || "(empty)";
  const added = after.filter(a => !before.some(b => b.id === a.id)).map(line).join("\n") || "(none)";
  return judge("You judge an assistant's answer against a company's brain: its channels (status, rule, summary), its notes and its names registry. A change between CHANNELS BEFORE and AFTER is evidence of an action taken. Use those, the notes added, and any supplied project state and recorded tool results as truth. faithful=false if the answer states anything the notes do not support or contradicts them; complete=false if the request's outcome is not established.",
    `CHANNELS BEFORE:\n${channelsBefore}\n\nCHANNELS AFTER THE RUN:\n${channels(root)}\n\nNOTES BEFORE:\n${memories}\n\nNAMES REGISTRY (after the run):\n${registry}\n\nNOTES ADDED BY THE RUN:\n${added}\n\nPROJECT STATE AND TOOL RESULTS:\n${/^(hubspot-)?write-/.test(scenario.crm || "") ? JSON.stringify(records.filter(r => r.kind === "result" && r.tool?.startsWith(`${scenario.provider || "attio"}_`))) : scenario.creation ? JSON.stringify({ projects: lib.readProjects(root).map(p => ({ ...p, pointer: lib.readPointer(p.path), hasBrain: existsSync(join(p.path, "brain")) })), results: records.filter(r => r.kind === "result" && [...QUESTION_TOOLS, "link_project"].includes(r.tool)) }) : "(not applicable)"}\n\nTOOLS CALLED: ${calls.map(c => c.tool).join(", ") || "none"}\n\nREQUEST:\n${scenario.prompt}\n\nEXPECTED OUTCOME: ${scenario.expect || "(see request)"}\n\nANSWER:\n${final || "(empty)"}`,
    '{"faithful": true|false, "complete": true|false, "score": 0..1, "issues": ["..."]}');
}

const selected = process.argv[2] ? cases.filter(c => c.name === process.argv[2] || (process.argv[2] === 'crm' && c.name.startsWith('crm-')) || (['attio-write', 'hubspot-write'].includes(process.argv[2]) && c.name.startsWith(`${process.argv[2]}-`))) : cases;
if (!selected.length) throw new Error(`case must be one of ${cases.map(c => c.name).join(", ")}`);
const report = { scope: "Real Codex with production MCP and a simulated computer-use competitor. No real UI, external connectors or Desktop configuration are exercised. No before/after improvement claim.", plugin, model, artifacts, cases: [] };
console.log(`Artifacts: ${artifacts}`);
for (const scenario of selected) {
  const root = mkdtempSync(join(scratchBase, `gtm-routing-${scenario.name}-`));
  const trace = join(artifacts, `${scenario.name}-mcp.jsonl`);
  const events = join(artifacts, `${scenario.name}-agent.jsonl`);
  const final = join(artifacts, `${scenario.name}-final.txt`);
  try {
    // Artifacts may live under the contributor checkout. Give the fixture its own git
    // repository so setup can never adopt or configure the parent repository.
    execFileSync("git", ["init", "-q", root], { env });
    execFileSync("bash", [join(plugin, "scripts/gtm-os-setup/setup.sh"), "--company", "Routing Fixture", "--one-liner", "Synthetic integration test", "--owner", "Marta Nowak <marta@example.test>", "--dashboard", "on-demand", ...(/^(hubspot-)?write-/.test(scenario.crm || "") ? ["--tools", scenario.provider || "attio"] : [])], { cwd: root, env, encoding: "utf8", timeout: 30000 });
    const by = lib.readAdmin(root).team[0].handle;
    seedBrain(root, by);
    if (scenario.daily) lib.appendMemory(root, `personal-${by}`, { authors: [by], content: "Capture work conversations and refresh the primary calendar daily.", source: [{kind:"user",ref:by}], meeting_policy: {by,sources:["fixture-notes/work"],calendars:["fixture-calendar/primary"],include:["Customer conversations", "Internal work"],exclude:["Personal"],calendar_refresh:"daily"} });
    scenario.prepare?.(root, by);
    if (scenario.interaction) { run(root, "gtm-os-contexts/contexts.mjs", ["--new", "pipeline", "Pipeline", "Deals in flight."]); lib.writeInteractions(root, [MOVE_DEAL]); }
    run(root, "gtm-os-load/load.mjs", ["offer", "--only"]);
    let cwd = root;
    if (scenario.project) { cwd = mkdtempSync(join(tmpdir(), "gtm-routing-folder-")); run(root, "gtm-os-project/project.mjs", ["--link", cwd, "--slug", "curriculum", "--title", "Curriculum", "--contexts", "icp"]); }
    const allRows = r => lib.listContexts(r).flatMap(c => c.memories);
    const before = allRows(root); const channelsBefore = channels(root);
    writeFileSync(join(artifacts, `${scenario.name}-before.json`), JSON.stringify(before, null, 2));
    const onboardingContext = scenario.onboarding ? `\n\nSession context from GTM OS:\n${lib.onboardingInstruction(root)}\nOwning workflow: ${join(plugin, "skills/gtm-os-start/SKILL.md")}` : "";
    const prompt = `This is a synthetic GTM OS company brain at ${root}. You work for Marta Nowak, confirmed handle ${by}${scenario.project ? "; this chat is in a linked project folder" : "; offer is loaded"}. Use only this synthetic brain and plugin workflow instructions. Do not read real account data, assistant archives or other company files; report out-of-scope steps instead. Use the available application capabilities to complete the request. The plugin build under test is ${plugin}; use its skills/${scenario.workflow || "gtm-os-use-brain"}/SKILL.md and its referenced procedures for this evaluation.${onboardingContext}\n\n${scenario.daily ? dailyRefreshPrompt(root, by) : scenario.prompt}`;
    writeFileSync(join(artifacts, `${scenario.name}-prompt.txt`), prompt);
    console.log(`Running ${scenario.name} in ${root}`);
    const args = ["exec", "--ignore-user-config", "--ephemeral", "--json", "--sandbox", "read-only", "-C", cwd, "-m", model, ...(scenario.project ? ["--skip-git-repo-check"] : []),
      "-c", "features.apps=false", "-c", "approval_policy=\"never\"",
      "-c", `mcp_servers.gtm_os_eval.command=${JSON.stringify(process.execPath)}`,
      "-c", `mcp_servers.gtm_os_eval.args=${JSON.stringify([fileURLToPath(new URL("./tool-routing-proxy.mjs", import.meta.url)), root, trace, scenario.answer || "", scenario.meetings ? "meetings" : scenario.onboarding ? "onboarding" : scenario.creation ? "projects" : "", scenario.crm || "", plugin])}`,
      "-c", "mcp_servers.gtm_os_eval.tool_timeout_sec=60", "-o", final, "-"];
    if (/^(hubspot-)?write-/.test(scenario.crm || '')) args.splice(args.length - 1, 0,
      '-c', 'mcp_servers.gtm_os_eval.required=true', '-c', 'mcp_servers.gtm_os_eval.startup_timeout_sec=60');
    const agentStarted = Date.now();
    const result = await new Promise((resolve, reject) => {
      const agentEnv = { ...env };
      if (scenario.daily || /^compile/.test(scenario.name)) agentEnv.GTM_OS_RUN = "eval";   // compile tools are offered only to runs (ALL-204)
      if (process.env.CODEX_HOME) agentEnv.CODEX_HOME = process.env.CODEX_HOME; else delete agentEnv.CODEX_HOME;
      const child = spawn("codex", args, { cwd, env: agentEnv, stdio: ["pipe", "pipe", "pipe"] });
      let out = "", err = "", timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, scenario.daily ? 360000 : 180000);
      child.stdout.on("data", data => { out += data; }); child.stderr.on("data", data => { err += data; });
      child.on("error", error => { clearTimeout(timer); reject(error); });
      child.on("close", code => { clearTimeout(timer); writeFileSync(events, out); writeFileSync(join(artifacts, `${scenario.name}-stderr.log`), err); resolve({ code, timedOut }); });
      child.stdin.end(prompt);
    });
    const records = readJSONL(trace), calls = records.filter(r => r.kind === "call"), asked = records.filter(r => r.kind === "question");
    const elapsed_ms = Date.now() - agentStarted;
    const tool_timings = calls.map(c => { const end = records.find(r => r.kind === "result" && r.id === c.id && r.tool === c.tool); return { tool: c.tool, elapsed_ms: end ? Date.parse(end.at) - Date.parse(c.at) : null }; });
    const after = allRows(root);
    writeFileSync(join(artifacts, `${scenario.name}-after.json`), JSON.stringify(after, null, 2));
    const finalText = existsSync(final) ? readFileSync(final, "utf8").trim() : "";
    const checks = { process: result.code === 0 && !result.timedOut, catalog: records.some(r => r.kind === "catalog" && r.tools.some(t => t.name === "computer_use") && r.tools.some(t => t.name === "remember")), route: scenario.calls(calls), state: !!scenario.verify(root, { before, after, trace }), screenOnlyWithApproval: (() => { const idx = records.map((r, i) => ({ r, i })); const asks = idx.filter(x => x.r.kind === "question").map(x => x.i); return idx.filter(x => x.r.kind === "call" && x.r.tool === "computer_use").every(x => asks.some(a => a < x.i)); })(), response: !!finalText, ...(scenario.project ? { noPath: !finalText.includes(cwd) } : {}) };
    const verdict = await judgeAnswer(scenario, { root, before, after, final: finalText, calls, channelsBefore, records });
    if (scenario.responseCheck) checks.wording = scenario.responseCheck(finalText);
    if (scenario.retention) checks.retention = scenario.retention(root, { before, after });
    if (!verdict.skipped && !verdict.error) checks.judge = !!verdict.faithful && !!verdict.complete;
    if (/^(hubspot-)?write-/.test(scenario.crm || '') && verdict.error) checks.judge = false;
    checks.build = records.some(r => r.kind === 'build' && r.server === join(plugin, 'server/server.mjs'));
    const status = Object.values(checks).every(Boolean) ? "pass" : "fail";
    report.cases.push({ name: scenario.name, status, checks, exit: result.code, timedOut: result.timedOut, elapsed_ms, tool_timings, ...(/^(hubspot-)?write-/.test(scenario.crm || "") ? { [scenario.provider || "attio"]: scenario.provider === "hubspot" ? hubspotMetrics(calls) : attioMetrics(calls), fixture_errors: records.filter(r => r.kind === "result" && r.tool?.startsWith(`${scenario.provider || "attio"}_`) && r.result?.error).length } : {}), judge: verdict, tools: calls.map(c => c.tool), asked: asked.map(q => ({ question: q.message, options: q.options, answered: q.answered })), brain: root, trace, events, final });
    for (const q of asked) console.log(`  asked: "${q.message}" ${JSON.stringify(q.options)} -> ${JSON.stringify(q.answered)}`);
    console.log(`${scenario.name}: ${status} ${JSON.stringify(checks)}${result.timedOut ? "  TIMED OUT" : result.code ? `  exit ${result.code}` : ""}  tools: ${calls.map(c => c.tool).join(" > ") || "none"}${verdict.skipped ? `  judge: skipped (${verdict.skipped})` : verdict.error ? `  judge: ${verdict.error}` : `  judge: ${verdict.score} ${(verdict.issues || []).join("; ")}`}`);
  } catch (error) { report.cases.push({ name: scenario.name, status: "fail", error: error.message, brain: root }); console.error(`${scenario.name}: ${error.message}`); }
}
writeFileSync(join(artifacts, "report.json"), JSON.stringify(report, null, 2) + "\n");
if (report.cases.some(c => c.status !== "pass")) process.exitCode = 1;
