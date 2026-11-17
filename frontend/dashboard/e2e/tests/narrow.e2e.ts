// The dashboard usually sits in Codex's right-hand pane, half of the screen: 640 px wide is the width it is designed
// for, 480 the floor. At both, no view scrolls the page sideways and the controls a person came for are in reach.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { PLACES } from './fixture.ts';

const sideways = (browser: any) => browser.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
// how far past the right edge of the page the first element matching a selector reaches (0 or less: within the width)
const pastEdge = (browser: any, selector: string) => browser.evaluate((sel: string) => { const e = document.querySelector(sel); return e ? Math.ceil(e.getBoundingClientRect().right - document.documentElement.clientWidth) : 9999; }, selector);

for (const width of [640, 480]) {
  test(`a ${width} px pane: every view fits the width, the five places stay reachable, and the key controls show`, async ({ app, screen, browser }) => {
    await browser.setViewport({ width, height: 900 });
    await app.open('/');
    const nav = screen.getByRole('navigation', 'Main navigation');
    for (const place of PLACES) {
      // a place scrolled out of the row is still a button in it; tapping it scrolls it into view
      await nav.getByRole('button', place).tap();
      await expect(screen.getByRole('heading', place, { level: 1 })).toBeVisible();
      await expect(nav.getByRole('button', place)).toBeVisible();
      expect(await sideways(browser)).toBeLessThanOrEqual(0);
    }
    // the search box stays in the header
    await expect(screen.getByRole('combobox', 'Search this brain')).toBeVisible();

    // Overview: each foundation keeps its link to the part and its chat; what each is for folds into one disclosure
    await nav.getByRole('button', 'Overview').tap();
    await expect(browser.locator('#ov-foundations article[data-fd="rules"]').getByRole('button', /^Open the rules/)).toBeVisible();
    await expect(browser.locator('#ov-foundations article[data-fd="docs"] a.fd-go')).toBeVisible();
    await expect(browser.locator('#ov-foundations .fd-use')).toBeHidden();
    await browser.locator('#ov-foundations .fd-lead > summary').tap();
    await expect(browser.locator('#ov-foundations .fd-uses li')).toHaveCount(3);
    // the order holds in a narrow pane, and the skills are one line away
    const top = (sel: string) => browser.evaluate((s: string) => document.querySelector(s)!.getBoundingClientRect().top, sel);
    expect(await top('#ov-more')).toBeLessThan(await top('#ov-soon'));
    expect(await top('#ov-soon')).toBeLessThan(await top('#ov-foundations'));
    await expect(browser.locator('#ov-skills button')).toBeVisible();
    expect(await pastEdge(browser, '#ov-skills button')).toBeLessThanOrEqual(0);

    // Configuration: the parts' tabs come before the summary card, which shows only the part picked
    await nav.getByRole('button', 'Configuration').tap();
    const parts = screen.getByRole('tablist', 'Parts of the configuration');
    await parts.getByRole('tab', /^Base documents/).tap();
    expect(await browser.evaluate(() => document.querySelector('#cfg-tabs')!.getBoundingClientRect().bottom <= document.querySelector('#cfg-peers')!.getBoundingClientRect().top + 1)).toBe(true);
    expect(await browser.evaluate(() => [...document.querySelectorAll('#cfg-peers article.fd-card')].filter(a => a.getClientRects().length).length)).toBe(1);
    // a base document row is one stacked item with its link in reach
    await expect(browser.locator('#cfg-docs tbody tr').first().getByRole('link', /^Write .* with Codex$/)).toBeVisible();
    expect(await pastEdge(browser, '#cfg-docs tbody tr td.pl-go a')).toBeLessThanOrEqual(0);
    expect(await sideways(browser)).toBeLessThanOrEqual(0);

    // Workflows: the explainer is closed, the first workflow's Start in Codex is on the page
    await nav.getByRole('button', 'Workflows').tap();
    await expect(browser.locator('#wf-how')).not.toHaveAttribute('open', '');
    await expect(browser.locator('#wf-how ol.help-steps')).toBeHidden();
    await expect(browser.locator('#pw-files a[data-pw-start]').first()).toBeVisible();
    await browser.locator('#wf-how > summary').tap();
    await expect(browser.locator('#wf-how ol.help-steps')).toBeVisible();
    // Skills: the search and the chips fit; two columns of cards at 640, one at 480, none past the edge
    await browser.locator('#wf-tab-skills').tap();
    await expect(screen.getByRole('searchbox', 'Search skills')).toBeVisible();
    expect(await pastEdge(browser, '#skill-search')).toBeLessThanOrEqual(0);
    const columns = await browser.evaluate(() => new Set([...document.querySelectorAll('#skill-results article.sk-card')].map(a => Math.round(a.getBoundingClientRect().left))).size);
    expect(columns).toBe(width > 560 ? 2 : 1);
    expect(await browser.evaluate(() => [...document.querySelectorAll('#skill-results article.sk-card, #skill-results article.sk-card *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5).length)).toBe(0);
    expect(await browser.evaluate(() => [...document.querySelectorAll('#skill-results article.sk-card')].filter(a => a.scrollWidth > a.clientWidth + 1).length)).toBe(0);
    await screen.getByRole('searchbox', 'Search skills').fill('voice');
    await expect(browser.locator('#skill-results article[data-skill="gtmb-voice"]')).toBeVisible();
    expect(await sideways(browser)).toBeLessThanOrEqual(0);
    await browser.locator('#skill-clear').tap();
    await browser.locator('#wf-tab-workflows').tap();

    // Memories: the filter box is visible and the toolbar wraps inside the width
    await nav.getByRole('button', 'Memories').tap();
    await expect(screen.getByRole('searchbox', /Filter notes/)).toBeVisible();
    expect(await sideways(browser)).toBeLessThanOrEqual(0);

    // a document fits the width too
    await nav.getByRole('button', 'Configuration').tap();
    await browser.locator('#cfg-docs').getByRole('button', 'Pricing').tap();
    await expect(browser.locator('#doc-preview')).toContainText(/\S/);
    expect(await sideways(browser)).toBeLessThanOrEqual(0);
  });
}
