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
  await parts.getByRole('tab', /^Schema/).tap();
  await expect(screen.getByRole('heading', 'Schema', { level: 2 })).toBeVisible();
  await expect(browser.locator('#cfg-schema article.cfg-kind').first()).toBeVisible();
  // the "Show" selector shows one kind at a time, and picking another kind shows that one
  const pick = browser.locator('#cfg-schema-kind'), cards = browser.locator('#cfg-schema article.cfg-kind');
  await expect(cards).toHaveCount(1);
  const kinds = await browser.evaluate(() => [...document.querySelectorAll('#cfg-schema-kind option')].map(o => (o as HTMLOptionElement).value));
  const labels = await browser.evaluate(() => [...document.querySelectorAll('#cfg-schema-kind option')].map(o => (o.textContent || '').trim()));
  expect(kinds.length).toBeGreaterThan(2);
  const shownId = () => browser.evaluate(() => document.querySelector('#cfg-schema article.cfg-kind')?.id || '');
  expect(await shownId()).toBe('cfg-kind-' + kinds[0]);
  for (const kind of [kinds[1], kinds[kinds.length - 1], kinds[0]]) {
    await pick.selectOption(labels[kinds.indexOf(kind)]);
    await expect(cards).toHaveCount(1);
    expect(await shownId()).toBe('cfg-kind-' + kind);
    expect(await browser.evaluate(() => (document.querySelector('#cfg-schema-kind') as HTMLSelectElement).value)).toBe(kind);
  }
});

test('a document opens rendered; Edit starts editing in the layout last used; Done editing returns to the rendered text', async ({ app, screen, browser }) => {
  const f = fixture(app.baseUrl);
  const written = f.documents.find(d => d.state !== 'not written');
  expect(written).toBeTruthy();
  await app.open('/');
  await screen.getByRole('navigation', 'Main navigation').getByRole('button', 'Configuration').tap();
  await screen.getByRole('table').filter({ has: screen.getByRole('columnheader', 'Document') }).getByRole('button', written!.title).tap();
  const view = browser.locator('#doc-view'), text = browser.locator('#doc-text'), preview = browser.locator('#doc-preview');
  const toolbar = view.getByRole('toolbar', 'Formatting'), edit = view.getByRole('button', 'Edit', { exact: true });
  const done = view.getByRole('button', 'Done editing'), save = view.getByRole('button', 'Save', { exact: true });
  // it opens to be read: the rendered text beside its outline, one Edit button, no editor, no toolbar, no Save
  await expect(view).toHaveAttribute('data-doc-mode', 'preview');
  await expect(edit).toBeVisible();
  await expect(preview).toContainText('Three plans, billed yearly.');
  await expect(preview.getByRole('heading', written!.title, { level: 1 })).toBeVisible();
  for (const hidden of [toolbar, text, done, save]) await expect(hidden).toBeHidden();
  const box = (sel: string) => browser.evaluate((q: string) => { const r = document.querySelector(q)!.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; }, sel);
  // the document's sections are a closed dropdown beside its actions; the text has the body's full width
  await expect(browser.locator('#doc-sections > summary')).toBeVisible();
  await expect(browser.locator('#doc-outline')).toBeHidden();
  const body = await box('#doc-body'), read = await box('#doc-preview');
  expect(read.left - body.left).toBeLessThan(4);   // no column to the left of the text any more
  // Edit: the text area beside the preview, focused, with the formatting toolbar; nothing to save yet
  await edit.tap();
  await expect(view).toHaveAttribute('data-doc-mode', 'split');
  for (const shown of [text, toolbar, preview, done]) await expect(shown).toBeVisible();
  await expect(edit).toBeHidden();
  expect(await browser.evaluate(() => document.activeElement?.id)).toBe('doc-text');
  await expect(save).toBeVisible();
  await expect(save).toBeDisabled();
  // typing enables Save and shows in the preview
  const original: string = await browser.evaluate(() => (document.querySelector('#doc-text') as HTMLTextAreaElement).value);
  expect(original).toContain('Three plans, billed yearly.');
  const typed = 'The yearly discount is two months free.';
  await text.fill(`${original}\n${typed}\n`);
  await expect(save).toBeEnabled();
  await expect(view).toContainText('Unsaved changes');
  await expect(preview).toContainText(typed);
  // Done editing: back to the rendered view with the typed text, Save still offered because it is unsaved
  await done.tap();
  await expect(view).toHaveAttribute('data-doc-mode', 'preview');
  await expect(preview).toContainText(typed);
  for (const hidden of [toolbar, text, done]) await expect(hidden).toBeHidden();
  await expect(edit).toBeVisible();
  await expect(save).toBeVisible();
  await expect(save).toBeEnabled();
  // Edit again keeps what was typed; the Write layout is remembered for the next Edit
  await edit.tap();
  await expect(text).toHaveValue(`${original}\n${typed}\n`);
  await toolbar.getByRole('button', 'Write', { exact: true }).tap();
  await expect(view).toHaveAttribute('data-doc-mode', 'write');
  await expect(preview).toBeHidden();
  await text.fill(original);   // nothing is saved by this test: the text goes back to what the file holds
  await expect(save).toBeDisabled();
  await done.tap();
  await expect(save).toBeHidden();
  await expect(preview).not.toContainText(typed);
  await edit.tap();
  await expect(view).toHaveAttribute('data-doc-mode', 'write');
  await expect(text).toBeVisible();
  expect(await browser.evaluate(() => document.activeElement?.id)).toBe('doc-text');
  await toolbar.getByRole('button', 'Split', { exact: true }).tap();   // leave the default layout for the next test
  await done.tap();
  // a file that is changed only in Codex is read here: no Edit, no editor, no toolbar, no Save
  await screen.getByRole('button', /Configuration$/).first().tap();
  await screen.getByRole('tablist', 'Parts of the configuration').getByRole('tab', /^Rules/).tap();
  await browser.locator('#cfg-rules').getByRole('button', 'Read the whole file').tap();
  await expect(view).toHaveAttribute('data-doc-mode', 'read');
  await expect(preview).toContainText(/\S/);
  await expect(browser.locator('#doc-notice')).toContainText('The rules are changed in Codex');
  for (const absent of [edit, done, save, toolbar, text]) await expect(absent).toHaveCount(0);
});

test('inside an open document the outline scrolls to its heading and a save conflict can be resolved', async ({ app, screen, browser }) => {
  const f = fixture(app.baseUrl);
  const written = f.documents.find(d => d.state !== 'not written');
  await app.open('/');
  await screen.getByRole('navigation', 'Main navigation').getByRole('button', 'Configuration').tap();
  await screen.getByRole('table').filter({ has: screen.getByRole('columnheader', 'Document') }).getByRole('button', written!.title).tap();
  const view = browser.locator('#doc-view'), text = browser.locator('#doc-text'), notice = browser.locator('#doc-notice');
  const item = browser.locator('#doc-outline [data-doc-head]').first(), sections = browser.locator('#doc-sections > summary');
  await expect(item).toBeHidden();
  await sections.tap();
  await expect(item).toBeVisible();
  // a section picked from the dropdown reaches its heading, reading and editing, and never changes the layout
  const scrolled = () => browser.evaluate(() => (window as any).__scrolled as string[]);
  await browser.evaluate(() => { (window as any).__scrolled = []; const was = Element.prototype.scrollIntoView; Element.prototype.scrollIntoView = function (...a: any[]) { (window as any).__scrolled.push(this.id); return was.apply(this, a as any); }; });
  const head = await item.getAttribute('data-doc-head');
  await item.tap();
  expect(await scrolled()).toEqual([head]);
  await expect(item).toBeHidden();   // picking a section closes the dropdown
  await expect(view).toHaveAttribute('data-doc-mode', 'preview');
  await view.getByRole('button', 'Edit', { exact: true }).tap();
  const layout = await view.getAttribute('data-doc-mode');
  await sections.tap();
  await browser.locator('#doc-outline [data-doc-head]').first().tap();
  expect(await scrolled()).toEqual([head, head]);
  await expect(view).toHaveAttribute('data-doc-mode', layout!);
  expect(await browser.evaluate(() => document.activeElement?.id)).toBe('doc-text');
  // the file changed since it was opened (here: the page holds an outdated hash): the save is refused with both ways out
  const original: string = await browser.evaluate(() => (document.querySelector('#doc-text') as HTMLTextAreaElement).value);
  await text.fill(`${original}\nA line that is never saved.\n`);
  await browser.evaluate(() => { const s = (0, eval)('docState'); s.hash = String(s.hash).replace(/[0-9a-f]/g, '0'); });
  await view.getByRole('button', 'Save', { exact: true }).tap();
  await expect(notice).toContainText('This document changed since you opened it. Nothing was saved.');
  const theirs = notice.getByRole('button', "Load the file's version");
  await expect(notice.getByRole('button', 'Save mine over it')).toBeVisible();
  // Load the file's version: the editor holds the file again, the notice goes, nothing is left to save
  await theirs.tap();
  await expect(text).toHaveValue(original);
  await expect(notice).not.toContainText('This document changed');
  await expect(view.getByRole('button', 'Save', { exact: true })).toBeDisabled();
  await expect(view).toHaveAttribute('data-doc-mode', layout!);
  await view.getByRole('button', 'Done editing').tap();
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
