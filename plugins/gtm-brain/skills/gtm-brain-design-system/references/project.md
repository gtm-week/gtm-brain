# Resolve and prepare the shared website project

These are GTM Brain integration instructions. Brian's technical procedures remain unchanged
in the company project's `docs/workflows/`. All source-relative commands in them run with
that project as cwd, never the brain root or plugin installation.

## Find the project before creating anything

1. Resolve the existing brain from this chat or project pointer; otherwise use `query`
   (brains) and `check_environment`. The plugin checkout is not a company brain.
2. Call `query` with `object: projects`. Reuse the linked website whose starter is
   `web-design-system`, whose pointer is valid and whose starter format is compatible.
   Prefer the explicitly named company project. If several apply, ask one native question
   naming the actual candidates; do not make another copy per campaign.
3. Read its `.gtm-brain-starter.json`, `AGENTS.md` and relevant procedure. The supported
   format is 1, with `src/styles/global.css`, `src/sections/index.ts`, the design/SEO manuals
   and all four retained workflows. Query reports missing files and incompatible formats.
   On incompatibility, preserve the project and propose a specific repair. Never replace
   it with a fresh starter or apply the latest plugin template over company work.
   If its state is `prepared`, finish the recorded setup before building, even if its pointer
   and registry already exist. Resolve any reported Git error, then retry the same
   `link_project` creation call with its original name, path and starting contexts.
4. If no project exists, use the first-use flow below through
   [Build our design system](../SKILL.md), then resume the original request.
   Inspect the default destination first, including a prepared starter that was not yet
   registered. A random existing website is not automatically compatible.

## First use

Follow the validation and capture-consent rules in
[Projects](../../gtm-brain-project/SKILL.md). Default to `<brain-root>/website`.
One question can cover creating Website there, saving its work to the company brain and
adding a draft guide pointing to its design system. Reuse consent already given for these
steps; do not ask again. Use native [question handling](../../gtm-brain-start/references/questions.md).

Call `link_project` with `create: true`, `starter: "web-design-system"`, the absolute
`brain` and `path`, title Website, slug website, inferred relevant active `contexts` (or an
empty list), and known `by`. Respect an explicitly chosen alternate location and name.
The tool prepares the pinned source, its own local Git history and brain pointer. It does
not install dependencies, create a GitHub repository or deploy. Do not clone upstream,
copy the template yourself or use the individual-skill installer.

The tool reports source preparation separately from dependency and preview readiness.
If interrupted during source preparation, linking or the initial commit, retry the same call only for the recorded `prepared`
starter. The tool checks its original brain, destination and source before resuming.
If it reports changed files, preserve them and present the repair; do not delete the folder.
Once linked, reuse it even if installation or preview startup failed.

Continue in this chat with explicit project paths. The generic project tool's optional
opening instructions do not require ending the current build or creating another chat.

## Dependencies and local preview

Read the project's package engines and use a matching Node runtime. Through the shell's
normal permissions, run `npm ci` in the project when dependencies are absent or incomplete,
then `npx playwright install chromium` when the installed Playwright browser is missing.
Use the retained lockfile; report install errors without changing versions or replacing
Brian's implementation. Fix network, runtime or browser availability separately.

Start `npm run dev` through the shell and inspect its actual URL and response. Use that URL
for screenshots (including `SHOTS_URL` if the port differs). A started process alone is not
a working preview. After a failure, inspect and retry the failed setup step without
recreating the project. Never claim dependencies or previews were verified from the marker.

## Company context and one design guide

Read the relevant company strategy, ICP, offer, voice and approved design documents through
the existing brain tools and document workflow. Reuse submitted brief content exactly;
do not invent customer claims, quotes, results or missing brand decisions.

Create the agreed draft guide with `document` (`action: create`, title Web design system,
folder `brand`, `applies_to: [design, websites, landing pages]`). Its body names the project
slug and absolute path, points to `docs/design.md`, `src/styles/global.css` and the local
`/design-system` catalogue, and says to reuse that project for later campaigns. Record its
actual review state and outstanding substitutions. Keep values, token tables and component
instructions in the project, not a second design contract in the brain. Use a relative link
from the guide where possible as well as the machine's resolved path.

If a guide already points there, reuse it. Preserve any existing company design contract;
do not overwrite it or create a conflicting guide. Follow the document workflow for a
needed change. Only the person's review can mark a design document approved.

## Procedure names and release boundary

| Original procedure | GTM Brain workflow |
|---|---|
| `build-design-system` | `/gtm-brain-design-system` |
| `add-section` | `/gtm-brain-add-section` |
| `build-landing-page` | `/gtm-brain-build-landing-page` |
| `deploy-vercel` | `/gtm-brain-publish-website` |

The original README and AGENTS retain their upstream installation descriptions. In this
package the four procedures live at `docs/workflows/<original-name>/SKILL.md`, not
`.agents/skills/`; npm does not install duplicate skills. Load the procedure from the
company project so it matches that project's starter revision.

Building ends locally. For a live site, keep Brian's branch and review discipline, but
leave pushes, hosted previews, merges and deployment steps for a separate publishing
request. A local build request does not authorise them. Plugin updates never rewrite the
project or its saved procedures. Review shared design changes against existing pages.
