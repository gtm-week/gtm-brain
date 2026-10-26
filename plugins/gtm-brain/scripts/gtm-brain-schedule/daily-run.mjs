#!/usr/bin/env node
// One optional daily refresh + compile job. Provider access stays with the host's connectors.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as lib from '../../lib/brain.mjs';

export function dailyRefreshPrompt(root, by) {
  const policy = lib.meetingOverview(root, { by }).policies[0];
  const procedure = fileURLToPath(new URL('../../skills/gtm-brain-use-brain/references/meetings.md', import.meta.url));
  const compile = fileURLToPath(new URL('../../skills/gtm-brain-use-brain/references/compile.md', import.meta.url));
  const entities = fileURLToPath(new URL('../../skills/gtm-brain-use-brain/references/entity-compile.md', import.meta.url));
  return `Run GTM Brain daily maintenance in ${root} for confirmed person ${by}. No interactive questions, external writes, identity edits or new contexts.
${policy ? `Read meeting_overview with by=${by} and follow the submitted policy in memory ${policy.id}. Follow ${procedure}. Fetch new/updated meeting evidence from the selected connected sources, resume partial scopes and processing records, capture through remember with by=${by}, and record per-source coverage separately after checking results. Refresh selected calendar references when calendar_refresh is daily. A failed or unavailable source leaves its coverage incomplete and must not stop other sources or compilation. Do not invent source hooks, use computer controls, infer attendance from calendar, or create missing-transcript tasks from past invitations.` : 'No submitted meeting policy exists. Do not refresh external sources; report that source refresh was skipped and continue compiling saved evidence.'}
Then call compile_facts, compile every stale context following ${compile}, and compile stale entity briefs using entity_facts and compile_entity following ${entities}, with by=schedule. Each writer commits its work. Render the dashboard. Report captured conversations, each source failure or unresolved scope, and summaries updated. Never claim a failed refresh succeeded.`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(process.argv[2] || '.'), by = lib.currentPerson(root, process.argv[3]);
    if (!lib.readAdmin(root) || !by) throw new Error('Pass a brain folder and its confirmed person handle: daily-run.mjs <brain> <by>');
    const run = spawnSync('codex', ['exec', '-s', 'workspace-write', '--skip-git-repo-check', '-'], {
      cwd: root, input: dailyRefreshPrompt(root, by), stdio: ['pipe', 'inherit', 'inherit'],
      env: { ...process.env, GTM_BRAIN_RUN: 'schedule', GTM_BRAIN_NO_COMPILE: '1' },
    });
    if (run.error) throw run.error;
    process.exitCode = run.status ?? 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
