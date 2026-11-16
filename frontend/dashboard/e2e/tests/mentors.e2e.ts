// The mentors lead what a person can do with Codex: on the Overview and as the first group of Help. A mentor is a
// shipped skill that coaches a person through one piece of GTM work with the brain's context. Each card says its
// promise, the base document it fills and whether that document is filled yet, and opens a prepared chat. The page
// stays a viewer: a card holds a link to Codex and nothing that acts.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { fixture } from './fixture.ts';

// The five base documents setup writes, each with the mentor that fills it.
const FILLS: Record<string, string> = { 'gtmb-strategy': 'Strategy', 'gtmb-icp': 'Ideal customer profile', 'gtmb-market': 'Market', 'gtmb-voice': 'Tone of voice', 'gtmb-design-system': 'Design system' };
const PRODUCES = ['gtmb-market-research', 'gtmb-unit-economics', 'gtmb-deepdive', 'gtmb-build-landing-page'];

test('Overview: Work with a mentor shows each mentor with its promise, its document and whether it is filled, and a prepared chat', async ({ app, browser }) => {
  const f = fixture(app.baseUrl);
  await app.open('/');
  const group = browser.locator('#ov-mentors');
  await expect(group.getByRole('heading', 'Work with a mentor', { level: 2 })).toBeVisible();
  await expect(browser.locator('#ov-mentors article.mentor-card')).toHaveCount(Object.keys(FILLS).length + PRODUCES.length);
  for (const [id, title] of Object.entries(FILLS)) {
    const card = browser.locator(`#ov-mentors article[data-mentor="${id}"]`);
    await expect(card).toBeVisible();
    await expect(browser.locator(`#ov-mentors article[data-mentor="${id}"] .mentor-promise`)).toHaveText(/\S{3}/);
    await expect(browser.locator(`#ov-mentors article[data-mentor="${id}"] .mentor-doc`)).toContainText(`Fills ${title}`);
    // the fixture's starters are not written yet, and the card says so
    const state = f.documents.find(d => d.title === title)!.state;
    await expect(browser.locator(`#ov-mentors article[data-mentor="${id}"] .mentor-doc`)).toContainText(state === 'not written' ? 'not filled yet' : state);
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
