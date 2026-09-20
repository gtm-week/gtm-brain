import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Run the actual viewer helpers in separate processes so the timezone is independent
// of the test runner and of the machine generating the dashboard.
function display(TZ, at) {
  const script = `
    import { localDateTime as toolTime } from './plugins/gtm-os/lib/brain.mjs';
    import { readFileSync } from 'node:fs';
    import { createContext, runInContext } from 'node:vm';
    const source = readFileSync('plugins/gtm-os/scripts/gtm-os-render/home.template.html', 'utf8');
    const ctx = createContext({ D: { contexts: [] } });
    runInContext(source.slice(source.indexOf('const esc=s=>'), source.indexOf('const LIVE=')), ctx);
    runInContext(source.slice(source.indexOf('const ini='), source.indexOf('function renderChannels')), ctx);
    ctx.note = { at: ${JSON.stringify(at)}, id: 'm_123456', authors: ['Arthur'], kind: 'note', tools: [], content: 'Test', actions: [], source: [] };
    ctx.toolTime = toolTime(ctx.note.at);
    console.log(JSON.stringify(runInContext('({toolTime,time:localTime(note.at),day:localDate(note.at),full:recordingTime(note),citation:citeDate(note.at),html:msgHtml(note)})', ctx)));
  `;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' }));
}

test('Arthur recording at 19:00 UTC is displayed as 21:00 in Warsaw', () => {
  const result = display('Europe/Warsaw', '2026-09-13T19:00:00Z');
  assert.equal(result.time, '21:00');
  assert.match(result.full, /Recorded: 2026-09-13 21:00 /);
  assert.match(result.html, />Recorded: 21:00<\/span>/);
});

test('local recording dates and citations cross midnight together', () => {
  const result = display('Europe/Warsaw', '2026-09-13T23:30:00Z');
  assert.equal(result.day, '2026-09-14');
  assert.equal(result.citation, '14 Sep');
  assert.match(result.full, /Recorded: 2026-09-14 01:30 /);
  assert.equal(display('America/Los_Angeles', '2026-09-14T01:30:00Z').day, '2026-09-13');
});

test('timezone conversion follows winter time, UTC and fractional offsets', () => {
  assert.equal(display('Europe/Warsaw', '2026-01-13T19:00:00Z').time, '20:00');
  assert.equal(display('UTC', '2026-09-13T19:00:00Z').time, '19:00');
  assert.equal(display('Asia/Kolkata', '2026-09-13T19:00:00Z').time, '00:30');
});


test('tool output uses the host timezone with an explicit UTC offset', () => {
  assert.equal(display('Europe/Warsaw', '2026-09-13T19:00:00Z').toolTime, '2026-09-13 21:00:00 GMT+2');
  assert.equal(display('Europe/Warsaw', '2026-01-13T19:00:00Z').toolTime, '2026-01-13 20:00:00 GMT+1');
  assert.equal(display('Asia/Kolkata', '2026-09-13T19:00:00Z').toolTime, '2026-09-14 00:30:00 GMT+5:30');
});

test('date-only events and missing or invalid timestamps are not shifted or invented', () => {
  for (const at of ['2026-09-13', '', 'unknown']) {
    const result = display('America/Los_Angeles', at);
    assert.equal(result.day, at);
    assert.equal(result.toolTime, at);
    assert.equal(result.full, 'Recorded: ' + at);
  }
});
