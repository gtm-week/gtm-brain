// The dashboard is a viewer with one exception, the document editor (a person opens a document and saves it,
// through POST /document with the page's token). Nothing else on any page offers an edit or an action, nothing
// the pages send while browsing writes, and nothing shows as an error in the browser console.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { fixture, TABS, PLACES } from './fixture.ts';

// A button's words that would change the brain from the page. Links are judged by where they go instead: a
// prepared chat (codex://threads/new, the person presses Send in Codex), a brain file or a source, read-only.
const ACTION = /^(edit|save|delete|remove|approve|apply|submit|send|run|start|update|create|add|archive|merge|rename|reset|undo|resolve|connect|sync|compile|write|accept|reject|mark|dismiss|confirm|retry|refresh|publish|import|upload|complete|cancel|enable|disable|pause|resume|activate|advance|skip|change|set|new|fix|install|upgrade|restore|retract|correct|remember|forget)\b/i;

// Every page a person can reach from the navigation, and an entity page.
async function visitAll({ app, screen, browser }: any, f: ReturnType<typeof fixture>, each: (where: string) => Promise<void>) {
  await app.open('/');
  const nav = screen.getByRole('navigation', 'Main navigation');
  for (const place of PLACES) { await nav.getByRole('button', place).tap(); await expect(screen.getByRole('heading', place, { level: 1 })).toBeVisible(); await each(place); }
  await nav.getByRole('button', 'Configuration').tap();
  for (const part of [/^Rules/, /^What the brain records/]) { await screen.getByRole('tablist', 'Parts of the configuration').getByRole('tab', part).tap(); await each(`Configuration ${part}`); }
  await screen.getByRole('button', 'Help').tap(); await expect(screen.getByRole('heading', 'Help', { level: 1 })).toBeVisible(); await each('Help');
  await screen.getByRole('button', 'Settings').tap(); await expect(screen.getByRole('heading', 'Settings', { level: 1 })).toBeVisible(); await each('Settings');
  await nav.getByRole('button', 'Entities').tap();
  const search = screen.getByLabel('Find by name, company or email');
  await search.fill(f.person.name); await search.press('Enter');
  await expect(screen.getByRole('heading', f.person.name, { level: 2 })).toBeVisible();
  await each('an entity');
}

test('nothing on the page offers an edit or an action, and nothing it requests writes', async ({ app, screen, browser }) => {
  const f = fixture(app.baseUrl);
  const writes: string[] = [];
  await browser.route('**/*', async route => {
    if (!['GET', 'HEAD'].includes(route.request.method)) writes.push(`${route.request.method} ${route.request.url}`);
    await route.continue();
  });
  await visitAll({ app, screen, browser }, f, async where => {
    const found = await browser.evaluate((pattern: string) => {
      const action = new RegExp(pattern, 'i'), out: string[] = [];
      const shown = (el: Element) => !!(el as HTMLElement).offsetParent || (el as HTMLElement).getClientRects().length > 0;
      const name = (el: Element) => ((el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.textContent || '').trim());
      for (const el of document.querySelectorAll('form')) out.push('a form');
      for (const el of document.querySelectorAll('[contenteditable]:not([contenteditable="false"])')) out.push('an editable region');
      for (const el of document.querySelectorAll('textarea')) if (shown(el)) out.push('a text area');
      for (const el of document.querySelectorAll('input')) if (shown(el) && !['search', 'hidden'].includes((el as HTMLInputElement).type)) out.push(`an input of type ${(el as HTMLInputElement).type}`);
      for (const el of document.querySelectorAll('button, [role="button"], input[type="submit"]')) if (shown(el) && action.test(name(el))) out.push(`control "${name(el)}"`);
      for (const el of document.querySelectorAll('a[href]')) {
        const href = el.getAttribute('href') || '';
        if (shown(el) && !/^(#|\/file\?path=|\/assets\/|\/entity\?|codex:\/\/threads\/new\?|https?:)/.test(href)) out.push(`link to ${href.slice(0, 60)}`);
      }
      return out;
    }, ACTION.source);
    expect({ where, found }).toEqual({ where, found: [] });
  });
  expect(writes).toEqual([]);
});

test('the server behind the page refuses anything but a read, and a save without the page\'s token', async ({ app, browser }) => {
  await app.open('/');
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) for (const path of ['/', '/data.json', '/file?path=RULES.md', '/entity?id=x']) {
    const status = await browser.evaluate(([m, p]: string[]) => fetch(p, { method: m, body: m === 'DELETE' ? undefined : '{}' }).then(r => r.status), [method, path]);
    expect({ method, path, status }).toEqual({ method, path, status: 405 });
  }
  // the one write: only with this page's token; a guessed one, or none, is refused and nothing is written
  for (const token of ['', '0'.repeat(64)]) {
    const status = await browser.evaluate((t: string) => fetch('/document', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gtm-brain-token': t }, body: JSON.stringify({ path: 'strategy.md', body: 'x', hash: '0'.repeat(64) }) }).then(r => r.status), token);
    expect({ token, status }).toEqual({ token, status: 403 });
  }
  for (const method of ['PUT', 'PATCH', 'DELETE']) expect(await browser.evaluate((m: string) => fetch('/document', { method: m }).then(r => r.status), method)).toBe(405);
  expect(await browser.evaluate(() => fetch('/search?q=x', { method: 'POST' }).then(r => r.status))).toBe(405);
});

test('the page shows no console errors on any tab', async ({ app, screen, browser }) => {
  const f = fixture(app.baseUrl);
  const seen: string[] = [];
  await visitAll({ app, screen, browser }, f, async where => {
    const errors = await browser.evaluate(() => (window as any).__e2eErrors ?? null);
    expect(errors).not.toBeNull();   // the init script ran in this page
    for (const e of errors) if (!seen.includes(`${where}: ${e}`)) seen.push(`${where}: ${e}`);
  });
  expect(seen).toEqual([]);
});
