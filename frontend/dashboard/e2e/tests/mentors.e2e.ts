// The foundations (rules, schema, base documents) lead the Overview's own content, under Housekeeping and Coming up;
// the skills are not on it, only one line to them. The skills are one small marketplace in the Workflows tab: a search,
// category chips whose counts are the cards shown, and a card per skill with a prepared chat. Mentors come first. A
// mentor is a shipped skill that coaches a person through one piece of GTM work with the brain's context; its card
// says the base document it fills and whether it is written. The page stays a viewer: links to Codex and in-page
// filtering, nothing that acts.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { fixture } from './fixture.ts';

// The five base documents setup writes, each with the mentor that fills it.
const FILLS: Record<string, string> = { 'gtmb-strategy': 'Strategy', 'gtmb-icp': 'Ideal customer profile', 'gtmb-market': 'Market', 'gtmb-voice': 'Tone of voice', 'gtmb-design-system': 'Design system' };
const PRODUCES = ['gtmb-market-research', 'gtmb-unit-economics', 'gtmb-deepdive', 'gtmb-build-landing-page'];

test('Overview: Housekeeping, Coming up, then Foundations, with the rules, the schema and the base documents counted from the brain', async ({ app, browser }) => {
  const f = fixture(app.baseUrl);
  await app.open('/');
  const section = browser.locator('#ov-foundations');
  await expect(section.getByRole('heading', 'Foundations', { level: 2 })).toBeVisible();
  await expect(browser.locator('#ov-foundations article.fd-card')).toHaveCount(3);
  expect(await browser.evaluate(() => [...document.querySelectorAll('#ov-foundations article.fd-card')].map(a => a.getAttribute('data-fd')))).toEqual(['rules', 'schema', 'docs']);
  // the order: Housekeeping, then Coming up, then Foundations, then one line to the skills; no mentor grid
  const top = (sel: string) => browser.evaluate((s: string) => document.querySelector(s)!.getBoundingClientRect().top, sel);
  expect(await top('#ov-more')).toBeLessThan(await top('#ov-soon'));
  expect(await top('#ov-soon')).toBeLessThan(await top('#ov-foundations'));
  expect(await top('#ov-foundations')).toBeLessThan(await top('#ov-skills'));
  await expect(browser.locator('#ov-more')).toContainText('Housekeeping');
  await expect(browser.locator('#ov-mentors, .view[data-view="home"] article.sk-card, .view[data-view="home"] article.mentor-card')).toHaveCount(0);
  // each part with its real state: the counts are the brain's own
  await expect(browser.locator('#ov-foundations article[data-fd="rules"]')).toContainText(`${f.foundations.rules} rules in ${f.foundations.ruleGroups} groups`);
  await expect(browser.locator('#ov-foundations article[data-fd="schema"]')).toContainText(`${f.foundations.kinds} kinds, ${f.foundations.fields} fields, ${f.foundations.relations} connection types`);
  const written = f.documents.filter(d => d.state !== 'not written');
  await expect(browser.locator('#ov-foundations article[data-fd="docs"]')).toContainText(`${written.length} of ${f.documents.length} written`);
  // every base document is a chip in its state
  const chips = await browser.evaluate(() => [...document.querySelectorAll('#ov-foundations [data-fd-doc]')].map(c => [(c.childNodes[0].textContent || '').trim(), c.getAttribute('data-state')]));
  expect(chips.length).toBe(f.documents.length);
  for (const d of f.documents) expect(chips.some(c => c[0] === d.title && c[1] === d.state)).toBe(true);
  // what is missing is named
  const first = f.documents.find(d => d.state === 'not written')!;
  await expect(browser.locator('#ov-foundations article[data-fd="docs"] .fd-weak')).toContainText(`${first.title} not written:`);
  // two links each: the skill that works on it as a prepared chat, and the part in the dashboard
  await expect(browser.locator('#ov-foundations article[data-fd="rules"] a.fd-go')).toHaveAttribute('href', /^codex:\/\/threads\/new\?path=.+&prompt=%2Fgtmb-rules%0A%0A/);
  await expect(browser.locator('#ov-foundations article[data-fd="schema"] a.fd-go')).toHaveAttribute('href', /^codex:\/\/threads\/new\?path=.+&prompt=%2Fgtmb-schema%0A%0A/);
  await expect(browser.locator('#ov-foundations article[data-fd="docs"] a.fd-go')).toHaveAttribute('href', /^codex:\/\/threads\/new\?path=.+&prompt=%2Fgtmb-strategy%0A%0A/);
  await expect(browser.locator('#ov-foundations form, #ov-foundations input')).toHaveCount(0);
  await browser.locator('#ov-foundations article[data-fd="rules"]').getByRole('button', /^Open the rules/).tap();
  await expect(browser.locator('.view.on h1')).toHaveText('Configuration');
  await expect(browser.locator('#cfg-tab-rules')).toHaveAttribute('aria-selected', 'true');
  await expect(browser.locator('#cfg-rules details.cfg-rule').first()).toBeVisible();
});

test('Overview: the one line to the skills opens the Workflows tab on Skills, mentors first', async ({ app, browser }) => {
  await app.open('/');
  await browser.locator('#ov-skills').getByRole('button', /^All skills, mentors first/).tap();
  await expect(browser.locator('.view.on h1')).toHaveText('Workflows');
  await expect(browser.locator('#wf-tab-skills')).toHaveAttribute('aria-selected', 'true');
  await expect(browser.locator('#skill-results article.sk-card').first()).toHaveAttribute('data-skill-cat', 'mentor');
});

test('Skills: search filters as you type, chips count the cards they show, mentors lead, each card opens a prepared chat', async ({ app, screen, browser }) => {
  const f = fixture(app.baseUrl);
  await app.open('/');
  await screen.getByRole('navigation', 'Main navigation').getByRole('button', 'Workflows').tap();
  await screen.getByRole('tablist', 'Workflows or skills').getByRole('tab', /^Skills/).tap();
  const cards = browser.locator('#skill-results article.sk-card'), all = Object.keys(FILLS).length + PRODUCES.length;
  // mentors first, in the order the catalogue gives
  expect(await browser.evaluate(() => [...document.querySelectorAll('#skill-results article.sk-card')].slice(0, 9).map(a => a.getAttribute('data-skill-cat')))).toEqual(Array(all).fill('mentor'));
  await expect(browser.locator('#skill-groups button').nth(1)).toHaveText(/^mentors\s*\d+$/i);
  // each base-document mentor: the document and its state, the right label, the prepared chat
  for (const [id, title] of Object.entries(FILLS)) {
    const card = browser.locator(`#skill-results article[data-mentor="${id}"]`), doc = browser.locator(`#skill-results article[data-mentor="${id}"] .sk-doc`);
    await expect(doc).toContainText(`Fills ${title}`);
    const d = f.documents.find(x => x.title === title), written = !!d && d.state !== 'not written';
    if (d) await expect(doc).toContainText(written ? 'written' : 'not written');
    await expect(card.getByRole('link', written ? /^Update in Codex/ : /^Open in Codex/)).toHaveAttribute('href', new RegExp(`^codex://threads/new\\?path=.+&prompt=%2F${id}%0A%0A.+`));
  }
  for (const id of PRODUCES) await expect(browser.locator(`#skill-results article[data-mentor="${id}"] .sk-doc`)).toContainText(/You get \S+/);
  // every card: one link with a prepared prompt
  const hrefs = await browser.evaluate(() => [...document.querySelectorAll('#skill-results article.sk-card')].map(a => [...a.querySelectorAll('a[href]')].map(x => x.getAttribute('href'))));
  for (const h of hrefs) { expect(h.length).toBe(1); expect(h[0]).toMatch(/^codex:\/\/threads\/new\?path=.+&prompt=%2Fgtm/); }
  await expect(browser.locator('#pw-skills form')).toHaveCount(0);
  // search: "voice" keeps the tone of voice mentor and drops an unrelated skill
  const box = screen.getByRole('searchbox', 'Search skills');
  await box.fill('voice');
  await expect(browser.locator('#skill-results article[data-skill="gtmb-voice"]')).toBeVisible();
  await expect(browser.locator('#skill-results article[data-skill="gtmb-sync"]')).toHaveCount(0);
  const n = await cards.count();
  await expect(browser.locator('#skill-count')).toHaveText(new RegExp(`^${n} of \\d+ skills$`));
  await expect(browser.locator('#skill-groups button[data-skill-group="all"] .pill-count')).toHaveText(String(n));
  await box.fill('zzqx');
  await expect(browser.locator('#skill-results .sk-empty')).toContainText('Try one word for the work');
  await browser.locator('#skill-clear').tap();
  await expect(box).toHaveValue('');
  // a chip: its count is the number of cards it shows
  for (const cat of ['mentor', 'everyday', 'setup']) {
    const chip = browser.locator(`#skill-groups button[data-skill-group="${cat}"]`);
    const count = Number(await browser.evaluate((c: string) => document.querySelector(`#skill-groups button[data-skill-group="${c}"] .pill-count`)!.textContent, cat));
    await chip.tap();
    await expect(cards).toHaveCount(count);
    await expect(browser.locator(`#skill-results article.sk-card:not([data-skill-cat="${cat}"])`)).toHaveCount(0);
  }
  await expect(browser.locator('#skill-groups button[data-skill-group="mentor"] .pill-count')).toHaveText(String(all));
});

test('Help: a short how-to that leads to the one list of skills', async ({ app, screen, browser }) => {
  await app.open('/#view=skills');
  await expect(screen.getByRole('heading', 'Help', { level: 1 })).toBeVisible();
  await expect(browser.locator('#admin-skills article')).toHaveCount(0);
  await browser.locator('#admin-skills').getByRole('button', /^Browse all \d+ skills/).tap();
  await expect(browser.locator('.view.on h1')).toHaveText('Workflows');
  await expect(browser.locator('#skill-results article.sk-card').first()).toBeVisible();
  for (const command of ['/gtmb-housekeeping', '/gtmb-interaction']) await expect(browser.locator('#skill-results')).toContainText(command);
});
