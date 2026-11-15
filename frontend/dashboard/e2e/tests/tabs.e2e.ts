// What a person sees on the live dashboard of a generated brain: the four tabs by pillar under the health line.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { fixture, TABS, PLACES, kindTitle, ENTITY_KIND } from './fixture.ts';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('one flat navigation: Overview first, where the dashboard opens, and every place switches', async ({ app, screen }) => {
  await app.open('/');
  const nav = screen.getByRole('navigation', 'Main navigation');
  for (const place of PLACES) await expect(nav.getByRole('button', place)).toBeVisible();
  await expect(nav.getByRole('button', 'More')).toHaveCount(0);
  await expect(nav.getByRole('button', 'Overview')).toHaveAttribute('aria-current', 'page');
  await expect(screen.getByRole('heading', 'Overview', { level: 1 })).toBeVisible();
  for (const place of [...PLACES.slice(1), PLACES[0]]) {
    await nav.getByRole('button', place).tap();
    await expect(screen.getByRole('heading', place, { level: 1 })).toBeVisible();
    await expect(nav.getByRole('button', place)).toHaveAttribute('aria-current', 'page');
    for (const other of PLACES.filter(t => t !== place)) await expect(screen.getByRole('heading', other, { level: 1 })).toBeHidden();
  }
});

test('Overview says what needs the person, or that nothing does, and the header carries no health line', async ({ app, screen, browser }) => {
  await app.open('/');
  await expect(browser.locator('#ov-inbox').getByRole('heading', /^(Needs your attention|Coming up|Nothing needs you right now)$/, { level: 2 }).first()).toBeVisible();
  await expect(browser.locator('#health-line')).toHaveCount(0);
  await expect(browser.locator('#brain-health')).toHaveText(/^Updated (just now|\d+ minutes? ago|today)/);
  await expect(browser.locator('#brain-health')).toHaveAttribute('title', /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
});

test('Configuration: base documents open in the page; rules and schema are browsed in their own parts', async ({ app, screen, browser }) => {
  const f = fixture(app.baseUrl);
  await app.open('/');
  await screen.getByRole('navigation', 'Main navigation').getByRole('button', 'Configuration').tap();
  const docs = screen.getByRole('table').filter({ has: screen.getByRole('columnheader', 'Document') });
  // every base file has a row, filled or not
  await expect(docs.getByRole('rowheader')).toHaveCount(f.documents.length);
  for (const d of f.documents) {
    const row = docs.getByRole('row').filter({ has: screen.getByRole('rowheader', new RegExp(`^${esc(d.title)}`)) });
    await expect(row).toContainText(d.state);
  }
  await expect(screen.getByRole('heading', /^Base documents/)).toContainText(`${f.documents.filter(d => d.state !== 'not written').length} / `);
  await expect(screen.getByRole('columnheader', 'Applies to')).toHaveCount(0);
  // a written document opens in the dashboard, with its text and the chat link
  const written = f.documents.find(d => d.state !== 'not written');
  if (written) {
    await docs.getByRole('button', written.title).tap();
    await expect(screen.getByRole('heading', written.title, { level: 1 }).first()).toBeVisible();   // the reader's own title and the document's first heading
    await expect(browser.locator('#doc-preview')).toContainText(/\S/);
    await expect(browser.locator('#doc-view').getByRole('link', /^Chat about this/)).toHaveAttribute('href', /^codex:\/\/threads\/new/);
    await screen.getByRole('button', /Configuration$/).first().tap();
  }
  const parts = screen.getByRole('tablist', 'Parts of the configuration');
  await parts.getByRole('tab', /^Rules/).tap();
  await expect(screen.getByRole('heading', 'Rules', { level: 2 })).toBeVisible();
  await expect(browser.locator('#cfg-rules details.cfg-rule').first()).toBeVisible();
  await expect(browser.locator('#cfg-rules')).not.toContainText(/\bP[1-4]\b/);
  await parts.getByRole('tab', /^What the brain records/).tap();
  await expect(screen.getByRole('heading', 'What the brain records', { level: 2 })).toBeVisible();
  await expect(browser.locator('#cfg-schema article.cfg-kind').first()).toBeVisible();
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
  await expect(list.getByRole('option', new RegExp(esc(f.meeting.name))).first()).toBeVisible();
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

test('Memories is one timeline, newest first; a replaced note shows as replaced; the person filter narrows it', async ({ app, screen, browser }) => {
  const f = fixture(app.baseUrl);
  await app.open('/');
  await screen.getByRole('navigation', 'Main navigation').getByRole('button', 'Memories').tap();
  const rows = browser.locator('#pm-list article.pl-note');
  await expect(rows.first()).toBeVisible();
  const dates: string[] = await browser.evaluate(() => [...document.querySelectorAll('#pm-list article.pl-note .pl-date time')].map(t => t.getAttribute('datetime') || ''));
  expect(dates.length).toBeGreaterThan(10);
  for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect([...dates].sort().reverse()).toEqual(dates);
  // current notes by default: the old version of a corrected note is not listed
  await expect(screen.getByText(f.correction.old)).toBeHidden();
  await screen.getByLabel('Show').selectOption('Replaced notes');
  const old = rows.filter({ hasText: f.correction.old });
  await expect(old).toHaveCount(1);
  await expect(old).toContainText('replaced');
  await expect(old).toContainText(f.correction.new);
  await screen.getByLabel('Show').selectOption('Current notes');
  // the person filter keeps only the notes about that person
  const status = browser.locator('#pm-status');
  const before = await status.textContent();
  await screen.getByLabel('Person or company').fill(f.person.name);
  await expect(status).toContainText(`Showing ${f.person.notes.length} of ${f.person.notes.length} notes`);
  await expect(browser.locator('#pm-list article.pl-note .pl-text')).toHaveText(f.person.notes);
  await screen.getByLabel('Person or company').fill('');
  await expect(status).toHaveText(before ?? '');
});

test('Workflows shows each one as a card in plain words; a click shows its steps and its runs', async ({ app, screen, browser }) => {
  const f = fixture(app.baseUrl);
  await app.open('/');
  await screen.getByRole('navigation', 'Main navigation').getByRole('button', 'Workflows').tap();
  // every file under workflows/ has a card, and only those
  await expect(browser.locator('#pw-files article')).toHaveCount(f.workflows.length);
  for (const w of f.workflows) {
    const row = browser.locator('#pw-files article').filter({ has: screen.getByRole('heading', w.title, { level: 3 }) });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`${w.runs} ${w.runs === 1 ? 'run' : 'runs'} in progress`);
    await expect(row).toContainText(w.trigger === 'manual' ? 'You start it by asking Codex' : w.trigger);
  }
  const outbound = browser.locator('#pw-files article').filter({ has: screen.getByRole('heading', 'Outbound', { level: 3 }) });
  await outbound.getByRole('button', 'Outbound').tap();
  await expect(browser.locator('#pw-files article ol.wf-steps li').first()).toBeVisible();
  const run = browser.locator('#pw-files article .pl-runs li').filter({ hasText: f.run.id });
  await expect(run).toHaveCount(1);
  await expect(run).toContainText(new RegExp(esc(f.run.step), 'i'));   // the card writes it mid-sentence ("On step 1 of 4")
  await expect(run).toContainText(f.run.status);
});
