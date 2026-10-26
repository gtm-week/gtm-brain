#!/usr/bin/env node
// Write one summary run's NUL-separated Codex arguments and stdin prompt to separate files.
//   node run-args.mjs --files <args file> <prompt file> <plugin> <by> "<stale contexts>" "<stale entity ids>"
// A slim session (2026-10-01: a full one cost about 400k input tokens for one note): the person's
// config is not loaded, so no other plugin, skill or MCP server rides along; the GTM Brain server is
// configured here with GTM_BRAIN_RUN, the brain's AGENTS.md is skipped, and the two procedures are in
// the prompt, so no turn is spent finding or reading them. The person's model choice is kept. A
// custom model provider cannot be carried over by a few keys: then the full config is used.
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [mode, argsFile, promptFile, plugin, by = 'schedule', stale = '', entities = ''] = process.argv.slice(2);
if (mode !== '--files' || !argsFile || !promptFile || !plugin) {
  console.error('Usage: run-args.mjs --files <args file> <prompt file> <plugin> <by> <stale contexts> <stale entity ids>');
  process.exit(2);
}
const read = f => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
const config = read(join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml'));
// top-level keys only: everything before the first [table]
const top = config.split(/^\s*\[/m)[0];
const key = k => { const m = top.match(new RegExp(`^\\s*${k}\\s*=\\s*(.+?)\\s*$`, 'm')); return m ? m[1] : null; };
const provider = key('model_provider');
const slim = !process.env.GTM_BRAIN_COMPILE_FULL_CONFIG && (!provider || /^"(openai)?"$/.test(provider));

const proc = name => read(join(plugin, 'skills/gtm-brain-use-brain/references', name));
const prompt = [
  `You are the scheduled run of the gtm-brain-sync skill: compile summaries, nothing else. brain is ${JSON.stringify(process.cwd())}, by is ${by}. Call the GTM Brain tools directly, without listing or inspecting tools first:`,
  `- compile_facts {brain, context} returns the facts and an as_of id; then compile_apply {brain, context, by, as_of, summary, now} writes the summary (now: the learned working guidance, "" when none).`,
  `- entity_facts {brain, entity} returns an entity's evidence and as_of; then compile_entity {brain, entity, by, as_of, brief} writes its brief.`,
  `- render_dashboard {brain} at the end.`,
  'Batch independent calls (all compile_facts at once, then all compile_apply) when the host lets you run several in one step.',
  stale ? `Compile these contexts whose summary is behind: ${stale}.` : 'No context summary is behind.',
  entities ? `Then compile these entity briefs with entity_facts and compile_entity: ${entities}.` : 'No entity brief is behind.',
  'Then render the dashboard. Do not remember anything or edit identity metadata or workplace info. Each compilation tool commits its own result. Report one line per updated brief or context.',
  stale ? `\n# Compilation procedure\n\n${proc('compile.md')}` : '',
  entities ? `\n# Entity compilation procedure\n\n${proc('entity-compile.md')}` : '',
].join('\n');

const args = ['exec', '--json', '-s', 'workspace-write', '--skip-git-repo-check'];
if (slim) {
  args.push('--ignore-user-config',
    '-c', 'mcp_servers.gtm_brain.command="node"',
    '-c', `mcp_servers.gtm_brain.args=[${JSON.stringify(join(plugin, 'server/server.mjs'))}]`,
    '-c', `mcp_servers.gtm_brain.cwd=${JSON.stringify(plugin)}`,
    '-c', `mcp_servers.gtm_brain.env={GTM_BRAIN_RUN=${JSON.stringify(by)},GTM_BRAIN_TOOLSET="compile"}`,
    '-c', 'mcp_servers.gtm_brain.tool_timeout_sec=600',
    '-c', 'project_doc_max_bytes=0');
  for (const k of ['model', 'model_reasoning_effort', 'service_tier']) { const v = key(k); if (v) args.push('-c', `${k}=${v}`); }
} else args.push('--dangerously-bypass-hook-trust');
args.push('-');
writeFileSync(argsFile, args.join('\0') + '\0', { mode: 0o600 });
writeFileSync(promptFile, prompt, { mode: 0o600 });
