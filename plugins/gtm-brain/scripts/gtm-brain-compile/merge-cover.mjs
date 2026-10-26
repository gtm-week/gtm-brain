#!/usr/bin/env node
// git merge driver for brain/contexts/*/context.md (merge=gtm-brain-cover, set by lib.ensureMergeSetup):
//   node merge-cover.mjs <base> <ours> <theirs>    the result goes into <ours>, exit 0 = merged
// A summary is one compilation of the notes, not text to splice: keep the side compiled last, whole,
// so its fingerprint stays valid. The notes merged by union are recompiled later (work/merge-stale.json,
// written by the post-merge hook). Same compile time, or none: ours. Never a conflict.
import { readFileSync, writeFileSync } from "node:fs";
const [, ours, theirs] = process.argv.slice(2);
const compiledAt = file => { try { const m = readFileSync(file, "utf8").match(/^---\n[\s\S]*?^compiled_at:\s*"?([^"\n]*)"?\s*$/m); return m && m[1] !== "null" ? Date.parse(m[1]) || 0 : 0; } catch { return 0; } };
try { if (compiledAt(theirs) > compiledAt(ours)) writeFileSync(ours, readFileSync(theirs)); } catch {}
process.exit(0);
