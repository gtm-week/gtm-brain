// The chat start's closing lines, in one process instead of one node per line (each spawn cost about 0.1 s,
// more on a laptop, and they made the first status call slow): the health line, the open brain questions, the documents, the approved
// files, the workflow runs, the stray folders, the rules refresh, RULES.md, Ask the source, SCHEMA.md, the
// paused summaries and the unplaced files, in that order. Each part stands alone: one that fails prints nothing.
//   node start-lines.mjs <root> <project> <templates>
const [root, project = "", templates] = process.argv.slice(2);
const lib = u => import(new URL(`../lib/${u}`, import.meta.url));
const say = s => { if (s) console.log(s); };
const parts = [
  async () => { const l = await lib("brain.mjs"), h = await lib("health-line.mjs"); say(h.healthLine(root, l.meetingOverview(root, { by: l.currentPerson(root) || undefined }))); },
  async () => say((await lib("opening.mjs")).pendingQuestionsLine(root)),   // the brain questions nobody answered yet
  async () => console.log((await lib("documents.mjs")).documentsLine(root, { absolute: !!project })),
  async () => say((await lib("assets.mjs")).assetsLine(root)),
  async () => say((await lib("workflows.mjs")).runsLine(root)),
  async () => { if (!project) say((await lib("documents.mjs")).strayFoldersHint(root)); },
  async () => say((await lib("upgrade-files.mjs")).autoRefresh(root, templates)),
  async () => (await lib("upgrade-files.mjs")).refreshReadme(root, templates),
  async () => { const w = await lib("where.mjs"); w.ensureRules(root, templates); say(w.whereLine(root)); },
  async () => say((await lib("ask-source.mjs")).askSourceLine(root)),
  async () => { const s = await lib("schema.mjs"); s.ensureSchema(root, templates); say(s.schemaLine(root)); },
  async () => say((await lib("brain.mjs")).pausedCoversHint(root)),
  async () => say((await lib("where.mjs")).unplacedHint(root)),
];
for (const part of parts) { try { await part(); } catch {} }
