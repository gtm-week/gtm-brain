// The foundations (rules, schema, base documents) lead the Overview; the mentors come under them, as the way to
// fill the base documents and do work from them, and as the first group of Help. A mentor is a shipped skill that
// coaches a person through one piece of GTM work with the brain's context. Each card says its promise and the base
// document it fills, and opens a prepared chat; whether a document is written is said once, in Foundations (and on
// the Help rows). The page stays a viewer: a card holds a link to Codex and nothing that acts.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { fixture } from './fixture.ts';

// The five base documents setup writes, each with the mentor that fills it.
const FILLS: Record<string, string> = { 'gtmb-strategy': 'Strategy', 'gtmb-icp': 'Ideal customer profile', 'gtmb-market': 'Market', 'gtmb-voice': 'Tone of voice', 'gtmb-design-system': 'Design system' };
const PRODUCES = ['gtmb-market-research', 'gtmb-unit-economics', 'gtmb-deepdive', 'gtmb-build-landing-page'];

test('Overview: Foundations sits above the mentors, with the rules, the schema and the base documents counted from the brain', async ({ app, browser }) => {
  const f = fixture(app.baseUrl);
  await app.open('/');
  const section = browser.locator('#ov-foundations');
  await expect(section.getByRole('heading', 'Foundations', { level: 2 })).toBeVisible();
  await expect(browser.locator('#ov-foundations article.fd-card')).toHaveCount(3);
  expect(await browser.evaluate(() => [...document.querySelectorAll('#ov-foundations article.fd-card')].map(a => a.getAttribute('data-fd')))).toEqual(['rules', 'schema', 'docs']);
  // above "Work with a mentor"
  expect(await browser.evaluate(() => document.querySelector('#ov-foundations')!.getBoundingClientRect().bottom <= document.querySelector('#ov-mentors h2')!.getBoundingClientRect().top)).toBe(true);
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

test('Overview: Work with a mentor shows each mentor with its promise and its document, and a prepared chat', async ({ app, browser }) => {
  await app.open('/');
  await expect(browser.locator('#ov-mentors .mentor-lead')).toContainText('Mentors are how you fill the base documents above');
  const group = browser.locator('#ov-mentors');
  await expect(group.getByRole('heading', 'Work with a mentor', { level: 2 })).toBeVisible();
  await expect(browser.locator('#ov-mentors article.mentor-card')).toHaveCount(Object.keys(FILLS).length + PRODUCES.length);
  for (const [id, title] of Object.entries(FILLS)) {
    const card = browser.locator(`#ov-mentors article[data-mentor="${id}"]`);
    await expect(card).toBeVisible();
    await expect(browser.locator(`#ov-mentors article[data-mentor="${id}"] .mentor-promise`)).toHaveText(/\S{3}/);
    await expect(browser.locator(`#ov-mentors article[data-mentor="${id}"] .mentor-doc`)).toContainText(`Fills ${title}`);
    // whether the document is written is Foundations' to say, not the card's
    await expect(browser.locator(`#ov-mentors article[data-mentor="${id}"] .mentor-doc`)).not.toContainText('not filled yet');
    await expect(card.getByRole('link', /^Open in Codex/)).toHaveAttribute('href', new RegExp(`^codex://threads/new\\?path=.+&prompt=%2F${id}%0A%0A`));
  }
  for (const id of PRODUCES) {
    await expect(browser.locator(`#ov-mentors article[data-mentor="${id}"] .mentor-doc`)).toContainText(/You get: \S+/);
    await expect(browser.locator(`#ov-mentors article[data-mentor="${id}"] .mentor-doc`)).toContainText('Reads:');
  }
  // read-only: nothing in a card acts; the one button of the group goes to Help
  await expect(browser.locator('#ov-mentors article button, #ov-mentors form, #ov-mentors input')).toHaveCount(0);
  await group.getByRole('button', /^Everything Codex can do/).tap();
  await expect(browser.locator('.view.on h1')).toHaveText('Help');
});

test('Help: Work with a mentor is the first group, and its pill shows the mentors alone', async ({ app, screen, browser }) => {
  await app.open('/');
  await screen.getByRole('button', 'Help').tap();
  await expect(screen.getByRole('heading', 'Help', { level: 1 })).toBeVisible();
  await expect(browser.locator('#skill-results .skill-group-head').first()).toContainText(/work with a mentor/i);
  await expect(browser.locator('#skill-groups button').nth(1)).toContainText(/work with a mentor/i);
  await expect(browser.locator('#skill-results article[data-mentor="gtmb-icp"] .mentor-doc')).toContainText('Fills Ideal customer profile');
  await browser.locator('#skill-groups button[data-skill-group="mentor"]').tap();
  await expect(browser.locator('#skill-results article.skill-row')).toHaveCount(Object.keys(FILLS).length + PRODUCES.length);
  await expect(browser.locator('#skill-results article.skill-row:not([data-mentor])')).toHaveCount(0);
  // the two commands that had none are in the list
  await browser.locator('#skill-groups button[data-skill-group="all"]').tap();
  for (const command of ['/gtmb-housekeeping', '/gtmb-interaction']) await expect(browser.locator('#skill-results')).toContainText(command);
});
