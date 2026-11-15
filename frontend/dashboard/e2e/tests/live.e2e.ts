// A note saved while the dashboard is open reaches the page on its own: the plugin's remember script commits
// and re-renders, the server sends a revision event, the page refreshes itself and keeps the tab the person
// was on. The test never reloads.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { fixture, remember } from './fixture.ts';

test('a note saved with the plugin reaches the open page without a reload', async ({ app, screen, browser }) => {
  const f = fixture(app.baseUrl);
  await app.open('/');
  await screen.getByRole('navigation', 'Main navigation').getByRole('button', 'Memories').tap();
  await expect(screen.getByRole('heading', 'Memories', { level: 1 })).toBeVisible();
  const text = `Live revision check ${Date.now()}: the buyer asked for a January pilot.`;
  await expect(screen.getByText(text)).toBeHidden();
  remember(f, text);
  await expect(browser.locator('#pm-list article.pl-note .pl-text').first()).toHaveText(text, { timeout: 30_000 });
  await expect(screen.getByRole('heading', 'Memories', { level: 1 })).toBeVisible();
  await expect(screen.getByRole('navigation', 'Main navigation').getByRole('button', 'Memories')).toHaveAttribute('aria-current', 'page');
});
