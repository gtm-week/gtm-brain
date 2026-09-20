#!/usr/bin/env node
// Read-only meeting projection. Capture stays with remember.
import { meetingOverview } from '../../lib/brain.mjs';
const [root, ...args] = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) options[args[i].replace(/^--/, '')] = args[i + 1];
try { console.log(JSON.stringify(meetingOverview(root, options), null, 2)); }
catch (error) { console.error(error.message); process.exitCode = 2; }
