#!/usr/bin/env node
import { memoryIndexMaintenance } from '../../lib/memory-maintenance.mjs';
const [root, ...args] = process.argv.slice(2), options = {};
try {
  for (let i = 0; i < args.length; i += 2) {
    if (!['--mode', '--budget-ms'].includes(args[i]) || args[i + 1] === undefined) throw new Error('Use --mode status|refresh|rebuild and optional --budget-ms 100..5000');
    options[args[i] === '--mode' ? 'mode' : 'budget_ms'] = args[i] === '--mode' ? args[i + 1] : Number(args[i + 1]);
  }
  console.log(JSON.stringify(memoryIndexMaintenance(root, options), null, 2));
} catch (e) { console.error(e.message); process.exitCode = 2; }
