// The dashboard is a viewer: nothing on any page offers an edit or an action, nothing it sends writes, and
// nothing it does shows as an error in the browser console.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { fixture, TABS } from './fixture.ts';

// A button's words that would change the brain from the page. Links are judged by where they go instead: a
// prepared chat (codex://threads/new, the person presses Send in Codex), a brain file or a source, read-only.
const ACTION = /^(edit|save|delete|remove|approve|apply|submit|send|run|start|update|create|add|archive|merge|rename|reset|undo|resolve|connect|sync|compile|write|accept|reject|mark|dismiss|confirm|retry|refresh|publish|import|upload|complete|cancel|enable|disable|pause|resume|activate|advance|skip|change|set|new|fix|install|upgrade|restore|retract|correct|remember|forget)\b/i;

// Every page a person can reach from the navigation, and an entity page.
async function visitAll({ app, screen, browser }: any, f: ReturnType<typeof fixture>, each: (where: string) => Promise<void>) {
  await app.open('/');
  const nav = screen.getByRole('navigation', 'Main navigation');
  for (const tab of TABS) { await nav.getByRole('button', tab).tap(); await expect(screen.getByRole('heading', tab, { level: 1 })).toBeVisible(); await each(tab); }
  await nav.getByRole('button', 'More').tap();
  for (const sub of ['Overview', 'Explore', 'Help']) {
    await screen.getByRole('navigation', 'More').getByRole('button', sub).tap();
    await expect(screen.getByRole('navigation', 'More').getByRole('button', sub)).toHaveAttribute('aria-current', 'page');
    await each(sub);
  }
  await screen.getByRole('button', 'Settings').tap(); await expect(screen.getByRole('heading', 'Settings', { level: 1 })).toBeVisible(); await each('Settings');
  await nav.getByRole('button', 'Entities').tap();
  await browser.locator('[data-pe-kind="person"]').getByRole('button', f.person.name).tap();
  await expect(screen.getByRole('heading', f.person.name, { level: 1 })).toBeVisible();
  await screen.getByText('Evidence & history').tap();
  await each('an entity page');
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

test('the server behind the page refuses anything but a read', async ({ app, browser }) => {
  await app.open('/');
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) for (const path of ['/', '/data.json', '/file?path=RULES.md', '/entity?id=x']) {
    const status = await browser.evaluate(([m, p]: string[]) => fetch(p, { method: m, body: m === 'DELETE' ? undefined : '{}' }).then(r => r.status), [method, path]);
    expect({ method, path, status }).toEqual({ method, path, status: 405 });
  }
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
