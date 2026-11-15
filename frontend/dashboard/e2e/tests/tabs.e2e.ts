// What a person sees on the live dashboard of a generated brain: the four tabs by pillar under the health line.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { fixture, TABS, kindTitle, ENTITY_KIND } from './fixture.ts';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('the four tabs exist, open on Configuration and switch', async ({ app, screen }) => {
  await app.open('/');
  const nav = screen.getByRole('navigation', 'Main navigation');
  for (const tab of TABS) await expect(nav.getByRole('button', tab)).toBeVisible();
  await expect(nav.getByRole('button', 'Configuration')).toHaveAttribute('aria-current', 'page');
  await expect(screen.getByRole('heading', 'Configuration', { level: 1 })).toBeVisible();
  for (const tab of [...TABS.slice(1), TABS[0]]) {
    await nav.getByRole('button', tab).tap();
    await expect(screen.getByRole('heading', tab, { level: 1 })).toBeVisible();
    await expect(nav.getByRole('button', tab)).toHaveAttribute('aria-current', 'page');
    for (const other of TABS.filter(t => t !== tab)) await expect(screen.getByRole('heading', other, { level: 1 })).toBeHidden();
  }
});

test('the health line shows above the tabs', async ({ app, browser }) => {
  await app.open('/');
  const line = browser.locator('#health-line');
  await expect(line).toBeVisible();
  await expect(line).toHaveText(/^Health \S.{10,}/i);
});

test('Configuration lists the base files with their state, RULES.md and SCHEMA.md', async ({ app, screen }) => {
  const f = fixture(app.baseUrl);
  await app.open('/');
  const docs = screen.getByRole('table').filter({ has: screen.getByRole('columnheader', 'Document') });
  // every base file has a row, filled or not
  await expect(docs.getByRole('rowheader')).toHaveCount(f.documents.length);
  for (const d of f.documents) {
    const row = docs.getByRole('row').filter({ has: screen.getByRole('rowheader', new RegExp(`^${esc(d.title)}`)) });
    await expect(row).toContainText(d.state);
  }
  await expect(screen.getByRole('heading', /^Base documents/)).toContainText(`${f.documents.filter(d => d.state !== 'not written').length} / `);
  for (const file of ['RULES.md', 'SCHEMA.md']) {
    await expect(screen.getByRole('heading', file, { level: 2 })).toBeVisible();
    // a brain on layout 3 keeps the two files in config/ (config/rules.md); older layouts keep them at the top
    await expect(screen.getByRole('link', new RegExp(`^Open (config/)?${file.replace('.', '\\.')}$`, 'i'))).toHaveAttribute('href', new RegExp(`^/file\\?path=(config(/|%2F))?${file.replace('.', '\\.')}$`, 'i'));
  }
});

test('Entities: a list to pick from with a count per kind, and the picked entity with its notes beside it', async ({ app, screen, browser }) => {
  const f = fixture(app.baseUrl);
  await app.open('/');
  await screen.getByRole('navigation', 'Main navigation').getByRole('button', 'Entities').tap();
  // one chip per kind that has entities, in plain plural words, with the brain's count
  const total = Object.values(f.kinds).reduce((a, b) => a + b, 0);
  await expect(browser.locator('#ent-kinds [data-ent-kind=""]')).toHaveText(new RegExp(`^All\\s*${total}$`));
  for (const [kind, count] of Object.entries(f.kinds)) {
    if (count) await expect(browser.locator(`#ent-kinds [data-ent-kind="${kind}"]`)).toHaveText(new RegExp(`^${esc(ENTITY_KIND[kind] ?? kindTitle(kind))}\\s*${count}$`));
    else await expect(browser.locator(`#ent-kinds [data-ent-kind="${kind}"]`)).toHaveCount(0);
  }
  const list = screen.getByRole('listbox');
  // the meeting is an entity of its own
  await browser.locator('#ent-kinds [data-ent-kind="meeting"]').tap();
  await expect(list.getByRole('option', new RegExp(esc(f.meeting.name)))).toBeVisible();
  await browser.locator('#ent-kinds [data-ent-kind=""]').tap();
  // typing narrows the list; Enter opens the highlighted row beside it
  const search = screen.getByLabel('Find by name, company or email');
  await search.fill(f.person.name);
  await expect(list.getByRole('option')).toHaveCount(1);
  await expect(list.getByRole('option')).toContainText(`${f.person.notes.length} notes`);
  await search.press('Enter');
  await expect(screen.getByRole('heading', f.person.name, { level: 2 })).toBeVisible();
  await expect(list).toBeVisible();
  for (const note of f.person.notes) await expect(browser.locator('#ent-detail')).toContainText(note);
  await expect(browser.locator('#ent-detail').getByRole('link', new RegExp(`^Chat about ${esc(f.person.name)}$`))).toHaveAttribute('href', /^codex:\/\/threads\/new/);
});

test('Memories lists notes newest first, shows a replaced note as replaced, and the entity search filters', async ({ app, screen, browser }) => {
  const f = fixture(app.baseUrl);
  await app.open('/');
  await screen.getByRole('navigation', 'Main navigation').getByRole('button', 'Memories').tap();
  const rows = browser.locator('#pm-list article.pl-note');
  await expect(rows.first()).toBeVisible();
  const dates = (await browser.locator('#pm-list article.pl-note .pl-date').allTextContents()).map(t => t.slice(0, 10));
  expect(dates.length).toBeGreaterThan(10);
  for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect([...dates].sort().reverse()).toEqual(dates);
  // in force by default: the old version of a corrected note is not listed, its correction says what it replaces
  await expect(screen.getByText(f.correction.old)).toBeHidden();
  await screen.getByLabel('State').selectOption('Replaced');
  const old = rows.filter({ hasText: f.correction.old });
  await expect(old).toHaveCount(1);
  await expect(old).toContainText('replaced');
  await expect(old).toContainText(`Replaced by`);
  await expect(old).toContainText(f.correction.new);
  await screen.getByLabel('State').selectOption('In force');
  // the entity search keeps only the notes about that entity
  const status = browser.locator('#pm-status');
  const before = await status.textContent();
  await screen.getByLabel('Entity').fill(f.person.name);
  await expect(status).toContainText(`Showing ${f.person.notes.length} of ${f.person.notes.length} notes`);
  await expect(browser.locator('#pm-list article.pl-note .pl-text')).toHaveText(f.person.notes);
  await screen.getByLabel('Entity').fill('');
  await expect(status).toHaveText(before ?? '');
});

test('Workflows shows each file with its status and trigger, and the run in progress', async ({ app, screen, browser }) => {
  const f = fixture(app.baseUrl);
  await app.open('/');
  await screen.getByRole('navigation', 'Main navigation').getByRole('button', 'Workflows').tap();
  // every file under workflows/ has a card, and only those
  await expect(browser.locator('#pw-files article')).toHaveCount(f.workflows.length);
  for (const w of f.workflows) {
    const row = browser.locator('#pw-files article').filter({ has: screen.getByRole('heading', w.title, { level: 3 }) });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(w.status);
    await expect(row).toContainText(`Trigger: ${w.trigger}`);
    await expect(row).toContainText(`${w.runs} ${w.runs === 1 ? 'run' : 'runs'} in progress`);
  }
  const outbound = browser.locator('#pw-files article').filter({ has: screen.getByRole('heading', 'Outbound', { level: 3 }) });
  const run = browser.locator('#pw-files article .pl-runs li').filter({ hasText: f.run.id });
  await expect(run).toHaveCount(1);
  await expect(run).toContainText(f.run.step);
  await expect(run).toContainText(f.run.status);
  await expect(outbound).toContainText(f.run.id);
});
