#!/usr/bin/env node
// Opt-in real model comparison over a synthetic connector. No production Attio access.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [baseline, candidate, count = '5'] = process.argv.slice(2);
const repetitions = Number(count);
const provider = process.env.GTM_OS_CRM_PROVIDER || 'attio';
if (!['attio', 'hubspot'].includes(provider)) throw new Error('GTM_OS_CRM_PROVIDER must be attio or hubspot');
if (!baseline || !candidate || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) throw new Error('Usage: node attio-write-benchmark.mjs BASELINE_PLUGIN CANDIDATE_PLUGIN [1..10 repetitions, default 5]');
const parent = resolve(process.env.GTM_OS_EVAL_DIR || 'work/all-200/benchmark');
mkdirSync(parent, { recursive: true });
const dir = mkdtempSync(join(parent, 'comparison-'));
const runner = fileURLToPath(new URL('./tool-routing.mjs', import.meta.url));
const results = [];
const median = xs => { const ys = [...xs].sort((a, b) => a - b); const i = Math.floor(ys.length / 2); return ys.length % 2 ? ys[i] : (ys[i - 1] + ys[i]) / 2; };
for (let i = 0; i < repetitions; i++) {
  // Alternate order to reduce time-of-run effects; no competing model runs in this driver.
  for (const variant of i % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
    const base = join(dir, `${i + 1}-${variant}`); mkdirSync(base);
    const start = Date.now();
    const run = await new Promise((done, reject) => {
      const child = spawn(process.execPath, [runner, `${provider}-write`], { env: { ...process.env, GTM_OS_PLUGIN: resolve(variant === 'baseline' ? baseline : candidate), GTM_OS_EVAL_DIR: base }, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', b => { stdout += b; process.stdout.write(b); });
      child.stderr.on('data', b => { stderr += b; });
      child.on('error', reject);
      child.on('close', code => done({ code, stdout, stderr }));
    });
    writeFileSync(join(base, 'runner.log'), run.stdout + '\n' + run.stderr);
    const artifact = /^Artifacts: (.+)$/m.exec(run.stdout)?.[1];
    const report = artifact ? JSON.parse(readFileSync(join(artifact, 'report.json'), 'utf8')) : null;
    results.push({ repetition: i + 1, variant, exit: run.code, elapsed_ms: Date.now() - start, report });
    writeFileSync(join(dir, 'runs.json'), JSON.stringify(results, null, 2));
  }
}
const comparison = ['known', 'missing', 'recovery'].map(mode => {
  const variants = Object.fromEntries(['baseline', 'candidate'].map(variant => {
    const rows = results.filter(r => r.variant === variant).flatMap(r => r.report?.cases.filter(c => c.name === `${provider}-write-${mode}`) || []);
    return [variant, { runs: rows.length, passes: rows.filter(r => r.status === 'pass').length,
      correct: rows.filter(r => r.checks?.process && r.checks?.state && r.checks?.wording && r.checks?.response && r.checks?.judge !== false).length,
      median_ms: rows.length ? median(rows.map(r => r.elapsed_ms)) : null,
      median_connector_calls: rows.length ? median(rows.map(r => r[provider]?.calls ?? 0)) : null }];
  }));
  const allCorrect = Object.values(variants).every(v => v.runs === repetitions && v.correct === repetitions);
  return { mode, ...variants, all_correct: allCorrect,
    reduction: allCorrect && variants.baseline.median_ms > 0 ? 1 - variants.candidate.median_ms / variants.baseline.median_ms : null };
});
const summary = { provider, scope: 'Synthetic connector; model and host elapsed time only. No production connector network or human approval latency measured. Failed runs are retained. Inspect traces and final answers alongside metrics.', repetitions, comparison, runs: join(dir, 'runs.json') };
writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (comparison.some(c => !c.all_correct || c.candidate.passes !== repetitions)) process.exitCode = 1;
