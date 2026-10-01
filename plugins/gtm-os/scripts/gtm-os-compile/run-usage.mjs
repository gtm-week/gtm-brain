#!/usr/bin/env node
// Reads `codex exec --json` from stdin: prints the run's last message (the report scheduled-run used
// to tail) and records what the run cost, so a background run is never invisible spend.
//   codex exec --json ... | node run-usage.mjs <brain> <by>
// work/runs.jsonl gets one line per run; work/hooks.log one "tokens" line the dashboard activity shows.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const root = resolve(process.argv[2] || '.'), by = process.argv[3] || 'schedule';
const usage = { input: 0, cached: 0, output: 0 }; let thread = null, last = '', turns = 0;
for await (const line of createInterface({ input: process.stdin })) {
  // Anything that is not an event (a timeout, a crash) is the run's own error output: shown as before.
  let e; try { e = JSON.parse(line); } catch { if (line.trim()) console.log(line); continue; }
  if (e.type === 'thread.started' && e.thread_id) thread = e.thread_id;
  if (e.type === 'turn.completed' && e.usage) {
    turns++;
    usage.input += e.usage.input_tokens || 0; usage.cached += e.usage.cached_input_tokens || 0; usage.output += e.usage.output_tokens || 0;
  }
  if (e.type === 'item.completed' && e.item?.type === 'agent_message' && e.item.text) last = e.item.text;
}
if (last) console.log(last.split('\n').slice(-20).join('\n'));
const at = new Date().toISOString();
try {
  mkdirSync(join(root, 'work'), { recursive: true });
  appendFileSync(join(root, 'work', 'runs.jsonl'), JSON.stringify({ at, by, thread, turns, ...usage }) + '\n');
  const stamp = new Date().toLocaleString('sv-SE').slice(0, 19);
  appendFileSync(join(root, 'work', 'hooks.log'), `${stamp}  scheduled-run  tokens in=${usage.input} cached=${usage.cached} out=${usage.output}${thread ? ` codex://threads/${thread}` : ''}\n`);
} catch {}
