// The chat start's closing lines, in one process instead of one node per line (each spawn cost about 0.1 s,
// more on a laptop, and they made the first status call slow): the health line, the open brain questions, the documents, the approved
// files, the workflow runs, the stray folders, the rules refresh, the layout upgrade offer, RULES.md, Ask the source, SCHEMA.md, the
// paused summaries and the unplaced files, in that order. Each part stands alone: one that fails prints nothing.
//   node start-lines.mjs <root> <project> <templates>
const [root, project = "", templates] = process.argv.slice(2);
const lib = u => import(new URL(`../lib/${u}`, import.meta.url));
const say = s => { if (s) console.log(s); };
const parts = [
  async () => { const l = await lib("brain.mjs"), h = await lib("health-line.mjs"); say(h.healthLine(root, l.meetingOverview(root, { by: l.currentPerson(root) || undefined }))); },
  // who saves here: known (no by needed), or not yet, with the handles, so the first save passes by and is not refused
  async () => { const l = await lib("brain.mjs"), me = l.currentPerson(root), team = (l.readAdmin(root)?.team || []).map(p => p.handle).filter(Boolean);
    say(me ? `saving as: ${me} (a save needs no by). Do not ask who the person is.` : team.length > 1 ? `saving as: not known in this checkout yet. On the first save pass by = the handle of the person speaking (${team.join(", ")}); if the chat does not say who that is, ask once. It is remembered after that.` : ""); },
  async () => say((await lib("opening.mjs")).pendingQuestionsLine(root)),   // the brain questions nobody answered yet
  async () => console.log((await lib("documents.mjs")).documentsLine(root, { absolute: !!project })),
  async () => say((await lib("assets.mjs")).assetsLine(root)),
  async () => say((await lib("workflows.mjs")).runsLine(root)),
  async () => { if (!project) say((await lib("documents.mjs")).strayFoldersHint(root)); },
  async () => say((await lib("upgrade-files.mjs")).autoRefresh(root, templates)),
  // the team's rules, in the marked block at the top of the brain's AGENTS.md, where Codex reads them before any call
  async () => { if (!process.env.GTM_BRAIN_RUN) (await lib("standing-rules.mjs")).keepRulesBlock(root, "rules: AGENTS.md block refreshed at chat start"); },
  // a brain still in an older file layout, for the person who can say yes to the move: offered, never started (lib/upgrade-files.mjs layoutOffer)
  async () => { if (!project) say((await lib("upgrade-files.mjs")).layoutOffer(root)); },
  async () => (await lib("upgrade-files.mjs")).refreshReadme(root, templates),
  // 0.36: the skills are gtmb-<name>; the brain's own files that still say gtm-brain-<name> are offered for an update (lib/skill-names.mjs)
  async () => { if (!project) say((await lib("skill-names.mjs")).skillNamesLine(root)); },
  async () => { const w = await lib("where.mjs"); w.ensureRules(root, templates); say(w.whereLine(root)); },
  async () => say((await lib("ask-source.mjs")).askSourceLine(root)),
  async () => { const s = await lib("schema.mjs"); s.ensureSchema(root, templates); say(s.schemaLine(root)); },
  async () => say((await lib("brain.mjs")).pausedCoversHint(root)),
  async () => say((await lib("where.mjs")).unplacedHint(root)),
];
for (const part of parts) { try { await part(); } catch {} }
