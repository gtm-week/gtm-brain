// What e2e/serve.mjs made for this run: the brain, what its tabs must show, and how to write to it.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Fixture = {
  root: string; port: number; plugin: string; env: Record<string, string>; by: string;
  kinds: Record<string, number>;
  meeting: { name: string; title: string };
  person: { name: string; notes: string[] };
  correction: { old: string; new: string };
  workflows: { title: string; status: string; trigger: string; runs: number }[];
  run: { id: string; name: string; step: string; status: string; due: string; cancelled: string; states: string[]; stepTitles: string[]; settle: string[] };
  foundations: { rules: number; ruleGroups: number; kinds: number; fields: number; relations: number };
  documents: { title: string; state: string }[];
};

export function fixture(baseUrl: string): Fixture {
  const port = new URL(baseUrl).port;
  return JSON.parse(readFileSync(join(tmpdir(), `gtm-brain-dash-e2e-${port}`, 'fixture.json'), 'utf8'));
}

// Saves one note the way a chat does: the plugin's remember script, which commits and re-renders the dashboard.
export function remember(f: Fixture, content: string): string {
  return execFileSync(process.execPath, [join(f.plugin, 'scripts/gtm-brain-remember/remember.mjs'), f.root, '--by', f.by, '--context', 'company', '--content', content],
    { env: { ...process.env, ...f.env }, encoding: 'utf8', timeout: 60_000 });
}

// The four tabs by pillar, as the navigation names them.
export const TABS = ['Configuration', 'Entities', 'Memories', 'Workflows'] as const;
// The whole navigation, in order: Overview is where the dashboard opens.
export const PLACES = ['Overview', ...TABS] as const;

export const KIND_TITLE: Record<string, string> = { person: 'People', organization: 'Organizations', product: 'Products', event: 'Events', tool: 'Tools' };
export const kindTitle = (k: string) => KIND_TITLE[k] ?? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ') + 's';
// The Entities tab's own words for a kind: plain plurals on its chips.
export const ENTITY_KIND: Record<string, string> = { person: 'People', organization: 'Companies', product: 'Products', event: 'Events', meeting: 'Meetings', tool: 'Tools', offering: 'Offerings' };
