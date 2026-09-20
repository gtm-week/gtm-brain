# GTM OS: Dashboard

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

> For humans: understand the company through its contexts, then search or explore for the
> details and their sources. Read here and discuss changes in Codex with Chat about this.

## Steps

Two tools, no shell command, both with `brain` = this workspace folder:

1. `open_dashboard` when the person wants to see it ("open", "show me", `/gtm-os-use-brain`):
   pass `project` from the session hook when this chat is in a linked project. Do not ask
   the person to select it again. The returned URL selects that project; retain its full
   fragment when opening or reusing a tab. Omit `project` in the brain folder for All company.
   Rebuilds the page and starts its local server if needed. Open the exact returned URL in
   the Codex pane with open_in_codex (target type browser), reusing its dashboard tab.
   If this turn opened or touched that tab through the in-app browser (Browser plugin), call
   `tab.markDeliverable()` on it: agent-opened tabs close when the turn ends unless marked,
   and the mark is per turn. It needs no login. If that host tool is unavailable, give the URL
   as a link. Never search for the URL or use Computer Use, Chrome or shell open to display
   the dashboard.
2. `render_dashboard` when they only want it refreshed ("render", "refresh"): rebuilds the page
   and returns the summary line. Give the live address from that line as a link, or the file
   `work/home/index.html` (absolute path) when no server is running.
3. Reply with one line. Do not read the page back into the chat.

## One tab, kept between chats

The session hook requests server startup and refresh in the background. It never makes opening
or reloading a page a prerequisite to answering. Open the in-app dashboard only when asked.

- One dashboard tab, never a second. If a tab already shows the address, reuse it instead of
  opening another, and mark it again in any turn that touches it through the Browser plugin.
- Never close the dashboard during tab cleanup.
- The address lives in `work/dash.json` and outlives the chat that started it.
  `work/session.json` records the latest session; Chat about this opens a new task in the selected project folder, or the brain for other views.
- The dashboard always uses the Codex pane. Legacy `dashboard_browser` values are ignored,
  including `chrome`, without rewriting protected workplace info. The timing setting stays in
  `brain/admin.md`: `dashboard: always` (the default) gives the saved address at chat start,
  `dashboard: on-demand` only when someone asks. Change it through `gtm-os-configure` and
  APPROVE.
- `work/` is ignored by git. The page is disposable: rebuilding it loses nothing, because every
  fact on it is read from `brain/`.

## Read-only viewer, discussion in Codex

Lead with useful information: context summaries, questions, notes and their sources.
Keep labels and guidance that explain the data or the next action. Avoid promotional headings,
slogans and introductory blocks that push the actual information below the fold.
Use compact lists for contexts, destinations, folders and workflows. Keep the appearance
professional: neutral dark surfaces, soft gray controls and muted colors for meaningful status.

Normal memory and entity writes save and commit first, then queue a dashboard refresh.
Do not call `render_dashboard` after every write: queued requests are combined automatically.
The viewer shows pending or failed refreshes and keeps its last valid snapshot. If a refresh
fails, use `render_dashboard` to retry and report its actual result. A pending view does not
mean the saved record was lost. Explicit `render_dashboard` and `open_dashboard` still wait
for the requested page to be built.

The initial page holds recent notes. Use Older notes/Newer notes inside a context for its full
history; questions and decisions have their own older/newer pages. Global search reads older
published history on demand, with grouped results, type filters and pagination. It states when
results are incomplete and offers a retry if a history file cannot be read. Search covers the
saved dashboard snapshot; use `query` in Codex for the latest brain state. Entity detail loads
its citations and recent timeline when opened. Full source histories remain linked from the
entity Markdown. Earlier source records are never removed to shorten a generated brief.
Paged history and entity detail require the live server; a directly opened HTML file is a
saved preview. Open the dashboard when the person needs to browse beyond that preview.

The renderer and the server never write to `brain/`. The server serves files and revision
notifications only. Search, filters, citations and expanding a proposed diff stay in the viewer.
Chat about this and the skill links open `codex://threads/new` with an encoded absolute workspace
folder (`path`) and prepared `prompt`. The person presses Send in Codex to begin.
Right-click an item anywhere in the viewer, or use Shift+F10 on a focused item, for the same
Chat about this handoff scoped to that person, context, note or folder. The draft carries the
whole highlighted card as the person sees it, and saved notes add their record ID, context and
source references. Empty space uses the current view. Opening the menu does not navigate or
change the loaded set; Escape dismisses it. Buttons and links are plain actions: a left click
runs them and a right-click opens nothing. Every Codex handoff shows an "Opening Codex" notice
at once, because the app takes a few seconds to appear; it hides when Codex takes focus.

Overview leads with Needs your attention: up to three pending questions and actual review notices.
Resolve these N prepares a fixed batch of the currently displayed questions and reviews,
including the current search and loaded feed rows. The draft uses question text, context names
and dates, without generated record identifiers. It never starts sync. The use-brain dashboard
resolution procedure matches saved records internally, asks short questions and stops after
the batch. Loading or empty batches cannot launch a resolution task.
It then shows three recent notes with status and context tags, author, recording date,
related entity links, recorded tools and expandable source references. Entity links use
published per-note evidence; tool links explore matching notes. Context lists belong in
the Contexts tab, not Overview.
Contexts opens a searchable list,
with 20 rows at a time, Show more and an archived filter. Its optional memory graph uses
current record counts for node size and shared fork ancestry for connection strength.
Similar text or shared entity names never imply shared memories. Selecting a context opens
its reader; Back to contexts restores the directory. Contexts and the other detailed views
live under Explore; preferences, working folders, company information and connected tools live
under Settings, one card each.
Navigation stays at the top and holds Overview, Explore and Help, preserving the full
reading width beside Codex. The dashboard is dark-only, with no appearance selector. The Overview uses bundled React
and shadcn/ui components; the detailed evidence readers retain their existing navigation.
Installed users do not need npm or network access to load the frontend.

Overview links to the workflow library. Help > Ways to work in Codex lists the shipped GTM OS workflows
in one scrolling list, with group filters, search, plain-language descriptions, example requests and
exact commands. Three steps at the top state what happens: you pick a task, read it in Codex, and send it yourself.
Open in Codex prepares the selected workflow and example in the brain workspace; it does not
execute tools, install a skill or submit a message. Type the same command in an existing project
chat to work there instead. The catalog includes only user workflows shipped by this plugin,
not internal scripts, personal skills or connector tools. It is rebuilt with the dashboard.

Settings > Working folders distinguishes physical Codex project folders from shared knowledge
contexts. Each folder links to the contexts it uses and shows its centrally stored tagged notes. Its chat link
opens that project folder and passes the brain and project on every call. A broken project link
opens the brain with a repair prompt. Other views open the brain.

The prompt briefly names the current topic in the user's language, adding relevant questions or
notices only. Chat is optional even when nothing needs attention. Technical procedures live in
`gtm-os-use-brain`, not the visible draft. Codex reads the latest state and exact question IDs
through the tools, skips resolved questions and discusses related topics. Answer, Drop,
Forget, Approve, Same or Different, connecting tools and changing settings all happen in Codex
through the existing tools and approval procedures. The link itself grants no approval.

Only questions tagged `brain-question` enter the pending brain-question list. Business tasks
remain context information. Older untagged questions remain browsable in their contexts.
Saved answers must point to the question ID through `retracts`. A completed render sends a
revision event and the viewer refreshes, preserving its view, searches and scroll position.
A one-second poll recovers lost events. Summary compilation is independent of question closure.
Connection loss shows the last update time. A file opened without the server is a saved copy;
the chat link still works, but live updates need the served address.

## Tracing a wrong sentence to its note

Compiled summaries and Working guidance carry the memory IDs compilation used. The page turns
each ID into a citation pill showing that note's date and author.

- Hover a pill: the whole note, its author and its context.
- Click it: jumps to that note in its context.
- A grey pill: the ID no longer resolves, because the note was withdrawn or it lives in a
  context this dashboard does not hold. Not a fault.
- No pill on the sentence: nothing sourced it, so no note is to blame. The summary itself is
  wrong; recompile the context.

So when a person says a sentence on the page is wrong: find the sentence, follow its pill to the
note, and correct it in Codex (for example `forget memory m_...`). The summary updates in the
background run. Never correct it by rewriting the summary.

## Hard rules

- Never edit a brain file by hand from here. Corrections go through GTM OS tools in Codex,
  so they are recorded with who and why.
- Never launch the dashboard with Computer Use, Chrome or a shell command.
  `open_dashboard` supplies its local URL; open_in_codex opens the Codex pane.
- If the page looks wrong, the fix is in the notes or the skills, never in the page.

## Source labels and destinations

Sources are collapsed into a counted disclosure with provider pills. Expanding it stays in the
dashboard. A saved HTTP(S) URL opens in a new tab, labelled with its actual host. Existing Codex
conversations show their title and Copy conversation link; the embedded browser does not
reliably dispatch raw task deep links. The user can paste the copied link into Codex chat.
Do not label this copy action as opening a task. Unresolved task references have no link. Bare Gmail, Attio and other connector IDs are not links or searches.
Raw reference IDs stay out of the interface; ask Codex to locate the original when
no direct URL was saved. Note citation pills are separate: they jump to a note in this dashboard.

## Manual Markdown edits

A separate local observer started with the dashboard watches only the brain files, groups
rapid saves, and rebuilds the viewer. The HTTP server still serves files and events only.
Generated cover edits pause that context until reviewed in Codex. Invalid edits remain on disk;
the viewer labels its fallback to the last generated version. No project documents are imported.
