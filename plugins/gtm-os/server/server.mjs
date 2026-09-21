#!/usr/bin/env node
// gtm-os MCP server: the operations as tools, so a chat shows "Remembering" with the plugin's icon
// instead of a shell command. Stdio JSON-RPC, Node built-ins only. Every tool runs the same
// script the workflow documents, in the brain folder, and returns its text.
//
// The server runs outside Codex's sandbox, so every writer commits what it wrote at once, in the
// person's name; nothing waits for a "save". The save tool keeps edits made by hand outside Codex.
// APPROVE typed in the chat stays a shell step so Codex asks permission for the audit line.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inputSchema as questionSchema } from "../scripts/gtm-os-learn-company/question.mjs";
import { questionInput } from "./question-input.mjs";
import { createInterface } from "node:readline";
import { loadOntology, buildTools, instructionsText } from "../vendor/allethic/index.mjs";
import { createFilesBackend } from "./files-backend.mjs";
import { createMemoryReader } from "./memory-reader.mjs";
import { validateValue } from "../vendor/allethic/validation.mjs";

const P = dirname(dirname(fileURLToPath(import.meta.url)));
const lib = await import(join(P, "lib", "brain.mjs"));
const gl = await import(join(P, "lib", "guidelines.mjs"));
const memoryReader = createMemoryReader();

/* ---------- running an operation script in a brain ---------- */
const run = (cwd, file, args = [], { timeout = 60000, env = {} } = {}) => new Promise(res => {
  const sh = file.endsWith(".sh");
  execFile(sh ? "bash" : process.execPath, [...(sh ? [] : ['--disable-warning=ExperimentalWarning']), join(P, existsSync(join(P, "scripts", file.split("/")[0])) ? "scripts" : "skills", file), ...(sh ? [] : ["."]), ...args],
    { cwd, timeout, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PLUGIN_ROOT: P, ...env } },
    (e, stdout, stderr) => res({ code: e ? (e.code ?? 1) : 0, out: String(stdout || ""), err: String(stderr || "") }));
});
const text = (s, isError = false) => ({ content: [{ type: "text", text: s.trim() || "(nothing to report)" }], ...(isError ? { isError: true } : {}) });
const result = r => text([r.out, r.err].filter(Boolean).join("\n"), r.code !== 0);
const isBrain = p => !!p && existsSync(join(p, "brain", "admin.md"));
const VERSION = (() => { try { return JSON.parse(readFileSync(join(P, ".codex-plugin", "plugin.json"), "utf8")).version || "0.0.0"; } catch { return "0.0.0"; } })();
const brainError = p => text(`${p || "(no path)"} is not a brain: no brain/admin.md there. Pass the workspace folder you are in, or run setup_brain in an empty folder.`, true);
const projectError = (brain, project) => { if (!project) return null; const known = lib.readProjects(brain).map(p => p.slug); return known.includes(project) ? null : text(`no project ${project}; projects: ${known.join(", ") || "none"}. The session hook names the project; omit it in the brain's own chat.`, true); };
const list = a => (Array.isArray(a) ? a : String(a || "").split(",")).map(s => String(s).trim()).filter(Boolean);

/* ---------- the tools ---------- */
const BRAIN = { type: "string", description: "Absolute path of the brain: the workspace folder you are in (it has brain/admin.md)." };
const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const strs = description => ({ type: "array", items: { type: "string" }, description });
const schema = (properties, required = ["brain"]) => ({ type: "object", properties: { brain: BRAIN, ...properties }, required, additionalProperties: false });
const PROJECT = str("The project the session hook named for this chat (its slug); omit in the brain's own chat.");
const TOOLS = [
  { name: "memory_index", title: "Maintaining memory search", readOnly: false,
    description: "Inspect or maintain the local, disposable memory search index. mode status reports freshness, checkpoint progress and disk usage without refreshing. Ordinary remember and query handle additions automatically. Use refresh after a large import or an indexing-in-progress response; each call saves checkpoints. Continue refresh while status is stale or rebuilding, until ready, including after a new chat. Use rebuild to recover a damaged cache or when the person asks for a full rebuild; an unfinished rebuild resumes. Source memories and entity Markdown are preserved. This is search-cache maintenance, not summary or entity-brief compilation. Report progress concisely and never claim completion before ready.",
    inputSchema: schema({ mode: str("status | refresh | rebuild", { enum: ["status", "refresh", "rebuild"] }), budget_ms: { type: "integer", minimum: 100, maximum: 5000, description: "Approximate work budget per call in milliseconds; default 1000. One record, source verification or SQL operation may overrun it." } }, ["brain", "mode"]),
    call: ({ brain, ...args }) => memoryReader.read(brain, "maintenance", args).then(r => text(JSON.stringify(r))) },
  // One native form, three names: the host labels a call by its tool, so a setup step, a settings
  // question and an ordinary work question must not all read "onboarding question" (ALL-203).
  ...[
    ["onboarding_question", "Setup question", "Ask one first-run setup question during gtm-os-start onboarding (who you are, the company, contexts, optional Chrome setup for websites). Not for tools or settings after setup (configuration_question) and not for everyday work (question)."],
    ["configuration_question", "Settings question", "Ask one question about tools, connections, settings or workplace configuration: which tools to connect, an admin.md change, the dashboard. Not for first-run setup (onboarding_question) and not for everyday work (question)."],
    ["question", "Your choice", "Ask one question in everyday work: which context, same as X?, is this a company?, a creative or ordinary choice such as which direction or photo to use. Not for first-run setup (onboarding_question) and not for tools or settings (configuration_question)."],
  ].map(([name, title, purpose]) => ({ name, title, readOnly: true, noBrain: true,
    description: `${purpose} The form waits inside the call for the submitted answer. Prefer it over a question typed into the chat and over async chat questions whenever it is available, including in ordinary mode; in Plan mode use the host's planning question tool instead. Options appear as radio choices; multiple=true uses checkboxes. A choice question is one page; text_label adds a free-text second step, so pass it with options only when a note is needed. Without options the form is one free-text field. Reuse known answers. No account, file or permission changes. Never use it for credentials, security approvals or the protected APPROVE step. Only status answered supplies an answer; declined and cancelled are explicit outcomes, and unanswered supplies no decision.`,
    inputSchema: questionSchema,
    async call(args, requestId) { return text(JSON.stringify(await questions.ask(args, requestId))); } })),
  { name: "update_plugin", title: "Updating GTM OS", readOnly: false, noBrain: true, openWorld: true,
    description: "Check the installed GTM OS plugin (mode check, no remote fetch), or update it from its configured marketplace (mode update, only when the person requests an update). Preserves the repository and branch; local installs refresh from their checkout. Requires an app restart afterward. Does not edit a company brain.",
    inputSchema: { type: "object", properties: { mode: str("check | update", { enum: ["check", "update"] }) }, required: ["mode"], additionalProperties: false },
    call: ({ mode }) => ["check", "update"].includes(mode)
      ? run(P, "gtm-os-update-plugin/update.mjs", [`--${mode}`], { timeout: 300000 }).then(result)
      : text("mode must be check or update", true) },
  { name: "where_we_are", title: "Checking where we are", readOnly: true,
    description: "Locate contexts, loaded contexts and tool status before answering where things stand or what is new. Reports live onboarding state: only an active pending request has a next step. Completed onboarding, missing historical markers and plugin updates do not start onboarding. This state overrides stale summary reminders. This is an orientation map, not a business overview: read supporting memories with query, including relevant unloaded contexts for a company-wide request. Give a concise synthesis of concrete developments and blockers, with a supporting source citation beside each material claim. Counts and summary freshness alone do not establish business status.",
    inputSchema: schema({ project: PROJECT }),
    async call({ brain, project }) {
      const perr = projectError(brain, project); if (perr) return perr;
      const r = await run(brain, "gtm-os-contexts/contexts.mjs", project ? ["--project", project] : []);
      const loaded = lib.readLoaded(brain, project);
      let tools = "";
      // work/tools.json is an object keyed by tool: { attio: { tool, plugin, status, test, note } }
      try {
        const t = JSON.parse(readFileSync(join(brain, "work", "tools.json"), "utf8")), keys = new Set(((lib.readAdmin(brain) || {}).tools || []).map(lib.toolKey));
        tools = Object.entries(t).filter(([k]) => keys.has(k)).map(([, x]) => `${x.tool}: ${x.status}${x.test ? ` (read test ${x.test})` : ""}`).join(", ");
      } catch {}
      return text(`${r.out}${r.err}\nLoaded in this ${project ? `project (${project})` : "chat"}: ${loaded.length ? loaded.join(", ") : "nothing (admin only)"}${tools ? `\nTools: ${tools}` : ""}\n${gl.guidelinesLine(brain)}\nSummaries: updated by themselves in the background (after each saved change); a chat never compiles; when asked, queue the background worker as the compile procedure says` + companyLine(brain) + `\n${lib.onboardingInstruction(brain, { project })}`, r.code !== 0);
    } },
  { name: "list_contexts", title: "Listing the contexts", readOnly: true,
    description: "List the contexts: title, stable slug, standing rule, memory count, summary state and whether loaded in this chat. Choose by title, rule and summary; the rule includes purpose and boundaries. Show titles to the person and use slugs in tool calls. Our company describes the organization that owns this brain; external company findings belong in the relevant topic's context.",
    inputSchema: schema({ project: PROJECT }),
    call: ({ brain, project }) => { const perr = projectError(brain, project); if (perr) return perr; return run(brain, "gtm-os-contexts/contexts.mjs", project ? ["--project", project] : []).then(r => withCompanyLine(brain, result(r))); } },
  { name: "load_context", title: "Loading a context", readOnly: false,
    description: "Load one or more contexts into this chat: their summary, standing rules, learned working guidance, people, tools and last memories. mode add (default) keeps what was loaded; only replaces it; clear unloads everything. The printed block is your working context.",
    inputSchema: schema({ contexts: strs("Context slugs to load, e.g. [\"pipeline\"]"), mode: str("add | only | clear | drop (drop unloads the named contexts and keeps the rest)", { enum: ["add", "only", "clear", "drop"] }), last: { type: "integer", description: "How many recent memories to show per context (default 15)" }, project: PROJECT }),
    call: ({ brain, contexts, mode, last, project }) => { const perr = projectError(brain, project); if (perr) return perr; return run(brain, "gtm-os-load/load.mjs", [...(mode === "clear" ? ["--clear"] : mode === "drop" ? ["--drop", ...list(contexts)] : [...list(contexts), ...(mode === "only" ? ["--only"] : []), ...(last ? ["--last", String(last)] : [])]), ...(project ? ["--project", project] : [])]).then(r => withCompanyLine(brain, result(r))); } },
  { name: "recall", title: "Searching the brain", readOnly: true,
    description: "Search memories by keyword, or read a permanent Markdown entity brief using entity (person is a compatible alias). Context optionally scopes the brief without loading context instructions. Returns identity, cited synthesis when fresh, per-context evidence, history and source pointers. Never writes a person page in work/.",
    inputSchema: schema({ query: str("Keywords to search for"), person: str("Compatible alias for entity"), entity: str("Entity name, alias, email or stable ID"), context: str("Optional context slug for an entity perspective"), project: PROJECT }),
    call: ({ brain, query, person, entity, context, project }) => { const perr = projectError(brain, project); if (perr) return perr; if (!entity && !person) return memoryReader.read(brain, "recall", { query, project }).then(s => text(s)); return run(brain, "gtm-os-recall/recall.mjs", ["--entity", entity || person, ...(context ? ["--context", context] : []), ...(project ? ["--project", project] : [])]).then(result); } },
  { name: "entity_facts", title: "Reading entity evidence", readOnly: true,
    description: "Without entity, list entity briefs needing compilation. With entity, return identity, every relevant effective memory grouped by context, previous brief and the as_of fingerprint for compile_entity. Includes archived contexts without loading their instructions.",
    inputSchema: schema({ entity: str("Entity name, alias or stable ID; omit to list stale briefs") }),
    call: ({ brain, entity }) => run(brain, "gtm-os-entities/compile-entity.mjs", entity ? ["--facts", entity] : []).then(result) },
  { name: "compile_facts", title: "Reading a context's memories", readOnly: true,
    description: "Without context: which contexts are behind (memories newer than the last compile). With context: everything needed to rewrite its cover (rule, current summary, previous working guidance, people, tools, questions, decisions, every effective memory with IDs and source/action references) and the as_of id to pass to compile_apply.",
    inputSchema: schema({ context: str("Context slug; omit to list what is behind") }),
    call: ({ brain, context }) => run(brain, "gtm-os-compile/compile.mjs", context ? ["--facts", context] : ["--stale"]).then(result) },
  { name: "meeting_overview", title: "Reviewing meetings", readOnly: true,
    description: "Read captured conversations, source evidence, outcomes, calendar references, processing gaps and per-person capture decisions. No connector calls. Use before importing or refreshing transcripts and after capture. Transcription records and direct notes drive capture; calendar and CRM matches are optional. Write with remember.meeting; use the returned anchor ID in meeting_id for outcomes or additional sources. Exact source identities reuse anchors. User overrides survive source refresh. Past calendar entries alone never establish occurrence or a missing-transcript task. Read policies and coverage to resume failed sources. by selects a person's preferences; omit to see shared evidence without applying one person's skip to everyone.",
    inputSchema: schema({ by: { type: "string" }, meeting_id: { type: "string" }, entity: { type: "string" }, from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, state: { type: "string", enum: ["captured", "recorded", "planned", "processing", "review", "skipped", "withdrawn"] } }),
    call: ({ brain, ...options }) => run(brain, "gtm-os-recall/meetings.mjs", Object.entries(options).filter(([, v]) => v !== undefined).flatMap(([k, v]) => [`--${k}`, v])).then(result) },
  { name: "customer_overview", title: "Reviewing customers", readOnly: true,
    description: "Read the retained customer roster across contexts: people and companies, including those absent from CRM, with cited status, source links, observation dates, disagreements, scoped capture coverage and suggestions based on tested connectors. Does not call external tools. Call during onboarding after capturing customer evidence, when asked to inspect customers, or before filling gaps. Capture relationships with remember.customer and scoped coverage with remember.customer_coverage. A user correction remains authoritative until corrected by the person. Missing from a CRM search does not mean not a customer. Suggest a specific connected source to check; never treat a listed connector or a contact as verified customer evidence.",
    inputSchema: schema({}),
    call: ({ brain }) => run(brain, "gtm-os-entities/entities.mjs", ["--customers"]).then(result) },
  { name: "render_dashboard", title: "Rendering the dashboard", readOnly: false,
    description: "Rebuild the dashboard page work/home/index.html from the files. Read-only for the brain. Give the person the file as a link.",
    inputSchema: schema({}),
    call: ({ brain }) => run(brain, "gtm-os-render/render.mjs").then(result) },
  { name: "open_dashboard", title: "Opening the dashboard", readOnly: false,
    description: "Rebuild the dashboard and make sure its local server runs. Use it when they ask to open, show or see the dashboard. Always return the local address to open in the Codex pane with open_in_codex, reusing its dashboard tab. The dashboard needs no login. Never search for its address or launch Chrome. Pass the project named by the session hook to open that project view automatically; omit in the brain’s own chat.",
    inputSchema: schema({ project: PROJECT }),
    async call({ brain, project }) {
      const pe = projectError(brain, project); if (pe) return pe;
      const viewing = project ? [`--project=${project}`] : [];
      const started = await run(brain, "../server/dash.mjs", ["--start", ...viewing]);
      const url = started.out.trim().split("\n").pop() || "";
      const r = await run(brain, "gtm-os-render/render.mjs");
      if (!/^http:/.test(url)) return text(`${r.out}${started.err}\nThe dashboard server did not start; the page is at work/home/index.html.`, true);
      return text(`${r.out}\nDashboard: ${url}  Open it in the in-app browser using open_in_codex with target {type: \"browser\", url: this exact address}, reusing the dashboard tab. This local page needs no login. If the host cannot open the pane, give the URL as a link. Never use Computer Use, Chrome, shell open or web search for the dashboard.`);
    } },
  { name: "advise", title: "Checking how the brain is doing", readOnly: true,
    description: "A health check of the brain from its files: summaries behind or failing, questions nobody answered, tools listed but not connected, names that may be one entity, quiet or empty contexts, people known by a first name only, notes without sources, rules that grew, what every chat loads. Returns three things worth doing and one for this week. Reads only.",
    inputSchema: schema({}),
    call: ({ brain }) => run(brain, "gtm-os-advisor/advisor.mjs", []).then(result) },
  { name: "who_is", title: "Looking up who is who", readOnly: true,
    description: "Read saved identity first: exact name, alias, email or stable ID resolves it; partial names, accents and typos return ranked candidates with reasons, emails and source references, never automatic identity changes. Omit name to list everyone. Optional candidates ranks a bounded shortlist already returned by a CRM; it makes no connector calls and saves nothing. For live name search prefer the connector's fuzzy/full-text capability, not equality filters. Zero results never justify merging. Use recall with a confirmed entity ID for its brief.",
    inputSchema: schema({ name: str("Name, alias, email or stable ID; required when ranking source candidates", { minLength: 1, maxLength: 256 }), limit: { type: "integer", minimum: 1, maximum: 10, description: "Candidate limit, default 5; output reports truncation" }, candidates: { type: "array", maxItems: 100, description: "Optional already retrieved CRM shortlist. Preserve returned IDs, names and source references; never invent candidates. Results remain unconfirmed.", items: { type: "object", properties: { id: str("Record ID from the source", { minLength: 1 }), name: str("Returned name", { minLength: 1, maxLength: 256 }), kind: str("Entity kind", { enum: ["person", "organization", "product"] }), aliases: strs("Known source aliases"), emails: strs("Returned email addresses"), reference: { type: "object", properties: { kind: str("Source connector/account", { minLength: 1 }), ref: str("Exact source record URL or scoped ID", { minLength: 1 }) }, required: ["kind", "ref"], additionalProperties: false } }, required: ["id", "name", "reference"], additionalProperties: false } } }),
    call(args) {
      const invalid = validateValue(TOOLS.find(t => t.name === "who_is").inputSchema, args);
      if (invalid) return text(invalid, true);
      const { brain, name, candidates, limit } = args;
      return candidates !== undefined && !name ? text("name is required with candidates", true) : run(brain, "gtm-os-entities/entities.mjs", [...(name !== undefined ? ["--who", name] : []), ...(candidates !== undefined ? ["--candidates", JSON.stringify(candidates)] : []), ...(limit !== undefined ? ["--limit", String(limit)] : [])]).then(result);
    } },
  { name: "check_tools", title: "Checking the tools", readOnly: false,
    description: "Check each tool named in brain/admin.md against the installed Codex plugins: installed, available (with the install command), or no official plugin; and list installed plugins the admin does not mention. Writes work/tools.json.",
    inputSchema: schema({}),
    call: ({ brain }) => run(brain, "gtm-os-connect/connect.mjs", ["--check"], { timeout: 30000, env: { GTM_OS_CODEX_TIMEOUT: "20000" } }).then(result) },
  { name: "mark_tool", title: "Recording a tool check", readOnly: false,
    description: "Record the result of a read test for one tool: ok or fail, with a one-line note. Status skip records that the person declined to connect the tool (it is never proposed again).",
    inputSchema: schema({ tool: str("Tool id, e.g. hubspot"), status: str("ok | fail | skip", { enum: ["ok", "fail", "skip"] }), note: str("What the read test returned, one line (for skip: their words)") }, ["brain", "tool", "status", "note"]),
    call: ({ brain, tool, status, note }) => run(brain, "gtm-os-connect/connect.mjs", status === "skip" ? ["--skip", tool] : ["--mark", tool, status, note]).then(result) },
  { name: "propose_admin_change", title: "Proposing a change to the workplace info", readOnly: false,
    description: "Propose a new brain/admin.md: pass the complete proposed file. It is written to work/admin.proposed.md and the diff comes back. Use the diff internally to explain every substantive change in plain language, including old and new values and removals; do not paste raw diffs unless requested. Ask the person to type APPROVE; applying is the gtm-os-configure workplace-change procedure's shell step, never this tool.",
    inputSchema: schema({ content: str("The complete proposed admin.md, plain hyphens only") }, ["brain", "content"]),
    async call({ brain, content }) {
      mkdirSync(join(brain, "work"), { recursive: true });
      writeFileSync(join(brain, "work", "admin.proposed.md"), String(content));
      return result(await run(brain, "gtm-os-approve/approve.mjs", ["--diff"]));
    } },
  { name: "save", title: "Saving", readOnly: false,
    description: "Keep changes made by hand outside Codex (a cover edited in an editor, the rules after an upgrade). Everything Codex writes is already kept the moment it is written, so normally there is nothing to save; call this only when the person asks to save. Refuses while an admin proposal is pending.",
    inputSchema: schema({ message: str("One line, what changed: e.g. notes: pipeline (3), marketing (1)"), scope: str("all (default) | covers: only brain/contexts/*/context.md, for the scheduled run", { enum: ["all", "covers"] }) }),
    async call({ brain, message, scope }) {
      const r = lib.save(brain, message, { covers: scope === "covers" });
      if (r.ok) lib.rerender(brain);
      return text(r.ok ? r.note : `not saved: ${r.note}`, !r.ok);
    } },
  { name: "check_environment", title: "Checking the machine", readOnly: true, noBrain: true,
    description: "What this machine has: node, codex (version, signed in or not), git, and what the folder is (a brain, empty, or something else). Call this instead of running version or login commands in the shell; it is the only check needed before setup. An existing brain also returns its saved onboarding state and continuation instructions.",
    inputSchema: schema({ folder: str("The folder the person is in (absolute path); optional") }, []),
    async call({ folder, brain }) {
      const sh = (cmd, args) => new Promise(res => execFile(cmd, args, { timeout: 15000, env: process.env }, (e, out, err) => res(e ? null : String(out || err || "").trim().split("\n")[0])));
      const [codex, git, login] = await Promise.all([sh("codex", ["--version"]), sh("git", ["--version"]), sh("codex", ["login", "status"])]);
      const dir = folder || brain || process.cwd(); let what = "not there";
      // the same test setup applies: .git, a README, .gitignore and the plugin's own work/session.json do not count
      try { const files = lib.setupBlockers(dir); what = existsSync(join(dir, "brain", "admin.md")) ? "a brain (set up already)" : files.length ? `not empty (${files.slice(0, 5).join(", ")}${files.length > 5 ? ", ..." : ""}): setup needs an empty folder` : "empty: ready for setup"; } catch {}
      const lines = [`node ${process.version}`, codex ? codex.replace(/^codex-cli\s*/, "codex ") : "codex: not on PATH (the app's own binary still runs this plugin)", login ? `codex sign-in: ${login}` : "codex sign-in: unknown", git ? git.replace(/^git version /, "git ") : "git: not found (setup needs it)", `folder ${dir}: ${what}`];
      if (isBrain(dir)) lines.push(lib.onboardingInstruction(dir));
      return text(lines.join("\n"), !git);
    } },
  { name: "setup_brain", title: "Setting up the brain", readOnly: false, noBrain: true,
    description: "Create a company brain in an empty folder: brain/admin.md from the answers, Our company (company), Strategy (strategy), Market (market), Target customers (icp) and Our offer (offer), plus the creator's personal context, names, AGENTS.md, git and the hooks. Ask the gtm-os-start skill's questions first; call this once with the answers. Saves the pending onboarding flag; creation is the start, then continue discovery in the same chat without asking for another start command.",
    inputSchema: schema({
      folder: str("Absolute path of the empty folder to set up"), company: str("Company name"), one_liner: str("What you sell, to whom"),
      owner: str("Full Name <email> of the person you work for"), team: str("Teammates as Full Name <email>, comma separated; empty for none"),
      tools: str("Tools in use, comma separated, e.g. Attio (CRM), Gmail, Granola"),
      company_rule: str("Optional standing rule for Our company (our own organization)"), strategy: str("Optional standing rule for Strategy"), market: str("Optional standing rule for Market"), icp: str("Optional standing rule for Target customers"), offer: str("Optional standing rule for Our offer"),
      dashboard: str("always (default) | on-demand; either way the dashboard opens in the Codex pane when someone asks", { enum: ["always", "on-demand"] })
    }, ["folder", "company", "one_liner", "owner"]),
    call: ({ folder, company, one_liner, owner, team, tools, company_rule, strategy, market, icp, offer, dashboard }) => run(resolve(folder), "gtm-os-setup/setup.sh", [
      "--company", company, "--one-liner", one_liner, "--owner", owner, ...(team ? ["--team", team] : []), ...(tools ? ["--tools", tools] : []),
      ...(company_rule ? ["--company-rule", company_rule] : []), ...(strategy ? ["--strategy", strategy] : []), ...(market ? ["--market", market] : []), ...(icp ? ["--icp", icp] : []), ...(offer ? ["--offer", offer] : []),
      ...(dashboard ? ["--dashboard", dashboard] : [])
    ], { timeout: 120000 }).then(result) },
  { name: "link_project", title: "Linking a folder as a project", readOnly: false,
    description: "Register a project folder with the shared brain, its AGENTS.md pointer and starting context. For a new project use create:true and default path <brain-root>/<project-slug>, beside brain/ and work/. Creation refuses existing destinations; linking preserves existing files and instructions. Requires consent to capture work in this folder. Infer relevant existing contexts for creation, or pass an empty list; do not ask for context selection or create a matching context. The brain itself and its internal storage cannot become projects. Linked folders are single projects: nested or overlapping project links are refused, including aliases. For subprojects in an external folder, propose separate folders directly inside the brain workspace.",
    inputSchema: schema({ path: str("Absolute folder path; new projects default to a direct child of the brain workspace root"), create: { type: "boolean", description: "True for new-project creation: destination must not exist. Omit when linking an existing folder." }, slug: str("Project slug; defaults from the title, else the folder name"), title: str("Display name; defaults to the folder name"), contexts: strs("Relevant existing active context slugs; may be empty"), by: str("The current person's handle") }, ["brain", "path"]),
    call: ({ brain, path, create, slug, title, contexts, by }) => run(brain, "gtm-os-project/project.mjs", ["--link", path, ...(create ? ["--create"] : []), ...(slug ? ["--slug", slug] : []), ...(title ? ["--title", title] : []), ...(list(contexts).length ? ["--contexts", list(contexts).join(",")] : []), ...(by ? ["--by", by] : [])]).then(result) },
  { name: "unlink_project", title: "Unlinking a project", readOnly: false,
    description: "Stop a folder being a project of this brain: removes its pointer block and its entry; the notes it wrote keep their project tag.",
    inputSchema: schema({ slug: str("The project's slug") }, ["brain", "slug"]),
    call: ({ brain, slug }) => run(brain, "gtm-os-project/project.mjs", ["--unlink", slug]).then(result) },
  { name: "list_projects", title: "Listing the projects", readOnly: true,
    description: "The folders linked to this brain: slug, folder, contexts, loaded set and last note. Set include_available during onboarding to also read existing Codex projects through the host's project/list API. Returns catalog coverage (complete, partial or unavailable); candidates are not capture consent. No project files or conversations are imported.",
    inputSchema: schema({ include_available: { type: "boolean", description: "Also list existing Codex projects as candidates to follow; read-only, with an explicit unavailable fallback on older hosts." } }),
    call: ({ brain, include_available }) => run(brain, "gtm-os-project/project.mjs", ["--list", ...(include_available ? ["--available"] : [])]).then(result) },
  { name: "skill", title: "Your skills", readOnly: false,
    description: "A person's own Codex skills, kept in this brain's .agents/skills (shared with the brain, untouched by updates, shown in Codex as /gtm-os-<name> after the app is quit and reopened). action create writes one from a title, an English description of at most 200 characters and the body (the steps another chat follows); list shows the brain's own and the shipped ones; install fetches a skill folder from a GitHub repo path; remove deletes one. Confirm the draft with the person before create. Never write skill files by hand or with Codex's skill creator in a brain.",
    inputSchema: schema({ action: str("What to do", { enum: ["create", "list", "install", "remove"] }), title: str("create/install: the skill's title; its id is gtm-os-<slug of the title>"), description: str("create: one English sentence, what it does and when it applies, at most 200 characters"), body: str("create: the instructions another chat follows, Markdown"), repo: str("install: owner/repo on GitHub"), path: str("install: the skill folder's path inside the repo"), ref: str("install: branch or tag, default main"), id: str("remove: the skill id, gtm-os-<name>"), by: str("The current person's handle") }, ["brain", "action"]),
    call: ({ brain, action, title, description, body, repo, path, ref, id, by }) => {
      const args = action === "list" ? ["--list"] : action === "remove" ? ["--remove", String(id || "")] : action === "install" ? ["--install", "--repo", String(repo || ""), "--path", String(path || ""), ...(ref ? ["--ref", ref] : []), ...(title ? ["--title", title] : [])] : ["--create", "--title", String(title || ""), "--description", String(description || ""), "--body", String(body || "")];
      return run(brain, "gtm-os-skills/skill.mjs", [...args, ...(by ? ["--by", by] : [])], { timeout: 120000 }).then(result);
    } },
  { name: "guideline", title: "Guidelines", readOnly: false,
    description: "The brand, voice and ICP documents the work must follow, kept in this brain's brain/guidelines as one Markdown file each (tone of voice, design system, target customer definition, ...). action create writes one from a title, applies_to (the kinds of work it governs: copy, outreach, posts, landing pages, creatives, proposals) and the body (the rules themselves); list shows them; show returns one in full; update rewrites only the fields given and keeps hand edits; remove deletes one. Status is draft unless the person approved it. Confirm the draft with the person before create. Before work of a listed kind, read the matching file and follow it (AGENTS.md rule 11).",
    inputSchema: schema({ action: str("What to do", { enum: ["create", "list", "show", "update", "remove"] }), title: str("create/update: the guideline's title; its slug is the handle of the title"), applies_to: strs("create/update: the kinds of work this guideline governs, lowercase, at most 12"), body: str("create/update: the rules, Markdown, under 64 KB"), file: str("create/update: instead of body, the absolute path of a Markdown or text file the person prepared (a design.md, a voice.md); it becomes the body as it is"), status: str("create/update: draft (default) or approved, only on the person's word", { enum: ["draft", "approved"] }), slug: str("show/update/remove: the guideline's slug"), by: str("The current person's handle") }, ["brain", "action"]),
    call: ({ brain, action, title, applies_to, body, file, status, slug, by }) => {
      const fields = [...(title !== undefined ? ["--title", String(title)] : []), ...(applies_to !== undefined ? ["--applies-to", Array.isArray(applies_to) ? applies_to.join(", ") : String(applies_to)] : []), ...(body !== undefined ? ["--body", String(body)] : []), ...(file !== undefined ? ["--file", String(file)] : []), ...(status !== undefined ? ["--status", String(status)] : [])];
      const args = action === "list" ? ["--list"] : action === "show" ? ["--show", String(slug || "")] : action === "remove" ? ["--remove", String(slug || "")] : action === "update" ? ["--update", String(slug || ""), ...fields] : ["--create", ...fields];
      return run(brain, "gtm-os-guidelines/guideline.mjs", [...args, ...(by ? ["--by", by] : [])]).then(result);
    } },
  { name: "list_brains", title: "Listing the brains on this machine", readOnly: true, noBrain: true,
    description: "The company brains this machine has opened (path and company), for linking a folder to one. Empty when none was opened yet in this Codex.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    call: () => { const b = lib.knownBrains(); return text(b.length ? b.map(x => `${x.company}: ${x.path} (last opened ${x.lastOpened.slice(0, 10)})`).join("\n") : "no brain known on this machine yet: open the brain folder in Codex once, or give its path."); } },
  { name: "interact", title: "Doing it and recording it", readOnly: false,
    description: "Run one of this company's own interactions (list_objects shows them): the inputs are checked, the memory the interaction prescribes is recorded through remember (context, people, companies, action), and the reply says exactly what to do in the connector, or to confirm it was done. Never a plugin tool's name: call those directly. Never Computer Use for the connector step.",
    inputSchema: schema({ by: str("The current person's confirmed handle, name or email"), name: str("The interaction's name, from list_objects"), params: { type: "object", description: "The interaction's inputs", additionalProperties: true }, project: PROJECT }, ["brain", "by", "name"]),
    async call({ brain, by, name, params = {}, project }) {
      const pe = projectError(brain, project); if (pe) return pe;
      const { actions, error } = lib.readInteractions(brain);
      if (error) return text(`error: ${error}`, true);
      if (lib.RESERVED_TOOLS.has(name)) return text(`refused: ${name} is a tool of its own; call it`, true);
      const a = actions.find(x => x.name === name);
      if (!a) return text(`refused: no interaction "${name}" here; this company has: ${actions.map(x => x.name).join(", ") || "none yet (propose_interaction adds one)"}`, true);
      const bad = validateValue(a.input_schema, params, name); if (bad) return text(`refused: ${bad}`, true);
      const m = lib.interactionMemory(a, params);
      const r = await run(brain, "gtm-os-remember/remember.mjs", ["--by", by, "--via", "codex", "--context", m.context, "--kind", m.kind, "--content", m.content, ...(m.people.length ? ["--people", m.people.join(", ")] : []), ...(m.companies.length ? ["--companies", m.companies.join(", ")] : []), ...(m.tools.length ? ["--tools", m.tools.join(", ")] : []), ...m.actions.flatMap(x => ["--action", x]), ...(m.tags.length ? ["--tags", m.tags.join(", ")] : []), ...(project ? ["--project", project] : [])]);
      const said = [r.out, r.err].filter(Boolean).join("\n").trim();
      if (r.code !== 0) return text(`${r.code === 2 ? "refused" : "error"}: ${said}`, true);
      return text(`ok: ${name}\n${said}\nNow in ${a.tool}: ${a.operation} If it is already done, nothing more; if it fails, remember the failure as a note.${a.refuse_when ? `\nRefuse when ${a.refuse_when}.` : ""}`);
    } },
  { name: "propose_interaction", title: "Proposing an interaction", readOnly: false,
    description: "Propose one of this company's own interactions from the person's words: name, tool, the operation in words, inputs, and what it records. Validated, then written as work/interaction.proposed.json; the person reviews it on the read-only dashboard and approves it in Codex by typing APPROVE. Never edits brain/ontology.ossie.json.",
    inputSchema: schema({ interaction: { type: "object", description: "name, title, tool, operation, description, input_schema, record {context, kind, content, people, companies, action, tags}, refuse_when", additionalProperties: true } }, ["brain", "interaction"]),
    call({ brain, interaction }) {
      const { actions, error } = lib.readInteractions(brain); if (error) return text(`error: ${error}`, true);
      const errs = lib.validateInteraction(brain, interaction, { existing: actions });
      if (errs.length) return text(`refused: ${errs.join("; ")}`, true);
      mkdirSync(join(brain, "work"), { recursive: true });
      writeFileSync(join(brain, "work", "interaction.proposed.json"), JSON.stringify(interaction, null, 2) + "\n");
      lib.rerender(brain);
      return text(`proposed: ${interaction.name} (${interaction.tool}); the person reviews it on the read-only dashboard and approves it in Codex by typing APPROVE. It records in ${interaction.record.context}: ${interaction.record.content}`);
    } },
  { name: "upgrade_brain", title: "Refreshing the brain's rules", readOnly: false,
    description: "After a plugin update: refresh managed rules and hooks, preserving local edits. Migrate legacy identity registries into permanent entity files, backing up originals and leaving memories unchanged.",
    inputSchema: schema({}),
    call: ({ brain }) => run(brain, "gtm-os-upgrade/upgrade.sh", []).then(result) },
];
// The form tools are listed only to a client that can show forms
const QUESTION_TOOLS = new Set(TOOLS.filter(t => t.inputSchema === questionSchema).map(t => t.name));
// Compilation belongs to the scheduled and background runs (they export GTM_OS_RUN before codex exec).
// A chat never sees these tools: it queues the worker instead (ALL-204 step 1). tools/call still works.
const RUN_ONLY_TOOLS = new Set(["compile_facts", "compile_apply", "compile_entity", "entity_facts"]);
// The reads that query covers (ALL-204 step 2b): never listed; still answering, marked deprecated, for one release.
const RETIRED_READS = { recall: "query (memories with search, or object brief)", who_is: "query (entities with search)", list_contexts: "query (contexts)", list_projects: "query (projects)", list_brains: "query (brains)", customer_overview: "query (customers)", meeting_overview: "query (meetings)", advise: "query (health)", where_we_are: "query (status)" };
const offered = t => !(QUESTION_TOOLS.has(t.name) && !questions.available()) && !(RUN_ONLY_TOOLS.has(t.name) && !process.env.GTM_OS_RUN) && !(t.name in RETIRED_READS);

// Allethic supplies memory capture and structured reads; the host keeps its native forms
// and session operations. One registered tool per operation, with existing names preserved.
const ontology = await loadOntology(join(P, "ontology", "gtm-os.ossie.json"));
// the company's own interactions (brain/ontology.ossie.json): for the catalog, and for interact below.
// The brain is known only per call, so they are read then, never registered as tools of their own.
const companyCatalog = ctx => {
  if (!ctx || !isBrain(ctx.brain)) return "";
  const { actions, error } = lib.readInteractions(ctx.brain);
  if (error) return `(this company's interactions could not be read: ${error})`;
  if (!actions.length) return "";
  const sig = a => `${a.name}(${Object.keys(a.input_schema.properties || {}).map(k => (a.input_schema.required || []).includes(k) ? k : `${k}?`).join(", ")}) [${a.tool}]`;
  return `Interactions of this company (run with interact):\n${actions.map(a => `- ${sig(a)}: ${a.description || a.title}`).join("\n")}`;
};
const companyLine = brain => { if (!isBrain(brain)) return ""; const { actions } = lib.readInteractions(brain); return actions.length ? `\nThis company's interactions: ${actions.map(a => `${a.name} (${a.tool})`).join(", ")}; list_objects shows them, interact runs them.` : ""; };
const withCompanyLine = (brain, t) => { if (!t.isError && t.content?.[0]) t.content[0].text += companyLine(brain); return t; };
const generated = buildTools(ontology, createFilesBackend({ run, memoryRead: memoryReader.read }), { scope: { name: "brain", schema: BRAIN }, extraCatalog: companyCatalog });
for (const tool of generated) {
  if (TOOLS.some(t => t.name === tool.name)) throw new Error(`duplicate tool: ${tool.name}`);
  TOOLS.push({ ...tool, title: tool.title || tool.annotations.title, readOnly: tool.annotations.readOnlyHint, call: args => tool.call(args, {}) });
}

/* One read tool (ALL-204 step 2a). The generated query keeps its rows; the host adds the derived
   reads as objects (views), an entity search that resolves like who_is, and a read-only SQL mode
   over the memory index. describe_object and list_objects say what the SQL sees. */
const VIEWS = { projects: "list_projects", brains: "list_brains", customers: "customer_overview", meetings: "meeting_overview", health: "advise", status: "where_we_are", brief: "recall" };
const SQL_SCHEMA = {
  memories: "rowid, id, context, kind, at, via, content, authors, people, tools, tags, entities, sources (json), supersedes, time. Only visible records: effective, not retracted, not superseded by a fork, and not a retraction note.",
  members: "memory_id, field (people | tools | tags | entities | authors), value. One row per member of a visible memory; join on memories.id.",
  contexts: "slug, title, status, summary, rule, loaded (1 when loaded in this chat).",
  entities: "id, name, kind, subtype, aliases (json), emails (json). The identity registry.",
  keywords: "the full-text index: JOIN keywords k ON k.rowid = m.rowid WHERE keywords MATCH 'word'.",
};
const byName = name => TOOLS.find(t => t.name === name);
const original = new Map(Object.keys(RETIRED_READS).map(name => [name, byName(name).call]));
for (const [name, hint] of Object.entries(RETIRED_READS)) byName(name).call = async args => { const r = await original.get(name)(args); if (r?.content?.[0] && !r.isError) r.content[0].text = `deprecated: use ${hint}.\n${r.content[0].text}`; return r; };
const table = ({ columns, rows, truncated }) => !rows.length ? "no rows" : [columns.join(" | "), ...rows.map(r => columns.map(c => r[c] == null ? "" : typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c])).join(" | ")), `(${rows.length} row${rows.length === 1 ? "" : "s"}${truncated ? ", truncated at the limit" : ""})`].join("\n");
{
  const query = byName("query"), describe = byName("describe_object"), objects = byName("list_objects");
  const datasets = [...query.inputSchema.properties.object.enum];
  const base = query.call, describeBase = describe.call, objectsBase = objects.call;
  query.description = "The one read: rows of one object, newest first (exact filters, free-text search with alias expansion, limit), or one read-only SQL SELECT over the memory index (memories, members, contexts, entities, keywords; describe_object shows the columns) for counts, joins and dates. Derived reads by object: status (where we are: contexts, loaded set, tools, onboarding; call it first), brief (an entity's cited one-page view; search = the name), projects, brains, customers, meetings, health (how the brain is doing). An entities search resolves a name, alias, email or typo to ranked candidates. Answer from the rows; no rows means say so.";
  query.inputSchema = { ...query.inputSchema, required: [], properties: { ...query.inputSchema.properties,
    object: { ...query.inputSchema.properties.object, enum: [...datasets, ...Object.keys(VIEWS)] },
    sql: { type: "string", description: "One SELECT (or WITH ... SELECT) over memories, members, contexts, entities and keywords. Read-only; at most limit rows (default 200)." },
    candidates: { type: "array", items: { type: "object", additionalProperties: true }, description: "With object entities and search: rank this bounded shortlist a CRM returned instead of the registry; no connector calls." },
    project: PROJECT } };
  query.call = async ({ brain, object, sql, search, filters, limit, project, candidates }) => {
    if (sql) { try { return text(table(await memoryReader.read(brain, "sql", { sql, limit }))); } catch (e) { return text(e.message, true); } }
    if (!object) return text("Pass object or sql: query needs one of them.", true);
    if (object === "brief") return search ? original.get("recall")({ brain, entity: search, ...(filters?.context ? { context: filters.context } : {}), ...(project ? { project } : {}) }) : text("brief needs search: the entity name, alias, email or id.", true);
    if (VIEWS[object]) return original.get(VIEWS[object])(object === "brains" ? {} : { brain, ...(project ? { project } : {}), ...(filters && typeof filters === "object" ? filters : {}) });   // a view's options travel in filters (projects: include_available; meetings: its options)
    if (object === "entities" && search && !filters) return original.get("who_is")({ brain, name: search, ...(candidates ? { candidates } : {}) });
    return base({ brain, object, ...(search !== undefined ? { search } : {}), ...(filters !== undefined ? { filters } : {}), ...(limit !== undefined ? { limit } : {}) });
  };
  describe.inputSchema = { ...describe.inputSchema, properties: { ...describe.inputSchema.properties, name: { ...describe.inputSchema.properties.name, enum: [...datasets, ...Object.keys(VIEWS)] } } };
  describe.call = async args => {
    if (VIEWS[args.name]) return text(`${args.name}: a derived read (query with object ${args.name}${args.name === "brief" ? ", search = the entity; filters.context for one perspective" : ""}). ${byName(VIEWS[args.name]).description}`);
    const r = await describeBase(args);
    if (!r.isError && r.content?.[0] && SQL_SCHEMA[args.name]) r.content[0].text += `\nSQL view ${args.name}: ${SQL_SCHEMA[args.name]}\nAlso in SQL: ${Object.keys(SQL_SCHEMA).filter(k => k !== args.name).join(", ")} (query with sql).`;
    return r;
  };
  objects.call = async args => {
    const r = await objectsBase(args);
    if (!r.isError && r.content?.[0]) r.content[0].text += `\nViews (query object): ${Object.keys(VIEWS).join(", ")}.\nSQL: query with sql over memories, members, contexts, entities, keywords; describe_object shows the columns.`;
    return r;
  };
}

const INSTRUCTIONS = "GTM OS: the company brain in this workspace. Pass the workspace folder as brain. Tools return plain text meant for you: report the outcome in one or two sentences in your own words, never paste tool output. Everything a tool writes is kept at once; never ask the person to save, never mention git. save is only for edits made by hand outside Codex, when the person asks. Applying APPROVE is a shell step of the gtm-os-configure workplace-change procedure, not a tool.";

const WORKFLOWS = `During company work, read ${join(P, "skills/gtm-os-use-brain/SKILL.md")} and the internal procedure relevant to the task. Read ${join(P, "skills/gtm-os-configure/SKILL.md")} for workplace changes and APPROVE. Read ${join(P, "skills/gtm-os-configure/references/update-plugin.md")} for plugin updates or brain refresh. Internal operations remain tools; the person does not need to invoke a separate skill for each one.`;

/* ---------- JSON-RPC over stdio ---------- */
const send = m => process.stdout.write(JSON.stringify(m) + "\n");
const questions = questionInput(send);
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(req) {
  const { id, method, params = {} } = req;
  if (method === "initialize") questions.initialize(params.capabilities);
  if (method === "notifications/cancelled") { questions.cancel(params.requestId); return; }
  if (method === "initialize") return reply(id, { protocolVersion: params.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "gtm-os", title: "GTM OS", version: VERSION }, instructions: INSTRUCTIONS + "\n" + instructionsText(ontology) + "\n" + WORKFLOWS + "\nGTM OS speaks English. Author brain records in English. Preserve names, IDs, source quotes, and the exact token APPROVE." });
  if (method === "ping") return reply(id, {});
  if (method === "tools/list") return reply(id, { tools: TOOLS.filter(offered).map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: !!t.openWorld } })) });
  if (method === "tools/call") {
    const tool = TOOLS.find(t => t.name === params.name);
    if (!tool) return fail(id, -32602, `unknown tool ${params.name}`);
    const args = params.arguments || {};
    if (!tool.noBrain && !isBrain(args.brain)) return reply(id, brainError(args.brain));
    // Every writer script logs its change (lib.commit) and re-renders the dashboard itself.
    try { return reply(id, await tool.call(args, id)); } catch (e) { return reply(id, text(`${tool.name} failed: ${e.message}`, true)); }
  }
  if (method === "prompts/list") return reply(id, { prompts: [] });
  if (method === "resources/list") return reply(id, { resources: [] });
  if (id !== undefined) fail(id, -32601, `unknown method ${method}`);
}

let inflight = 0;
createInterface({ input: process.stdin }).on("line", line => {
  let req; try { req = JSON.parse(line); } catch { return; }
  if (req && typeof req === "object" && questions.receive(req)) return;
  if (!(req && typeof req === "object" && req.method)) return;
  inflight++;
  handle(req).catch(e => { if (req.id !== undefined) fail(req.id, -32603, e.message); }).finally(() => inflight--);
});
// Stdin closing means the client is gone; finish what is running, then leave.
process.stdin.on("end", () => {
  questions.close();
  const finish = () => {
    if (inflight) return setTimeout(finish, 50);
    Promise.resolve(memoryReader.close()).finally(() => process.stdout.end(() => process.exit(0)));
  };
  finish();
});
