// Browser tests of the dashboard (npm run test:e2e). Plain assertions only: no agent steps, no model, no API key.
// The runner gives the app a free port, starts e2e/serve.mjs on it (a generated brain served by the real
// dashboard server) and stops it when the run ends, passes or fails.
import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

export default {
  tests: 'e2e/tests/**/*.e2e.ts',
  targets: [{
    name: 'chromium',
    engine: web({ viewport: { width: 1440, height: 900 }, initScripts: [{ path: 'e2e/console-errors.js' }] }),
    app: {
      url: 'http://127.0.0.1:0',
      command: { executable: process.execPath, args: ['e2e/serve.mjs', '--port', '{port}'], startupTimeout: 120_000, log: '.e2e/logs/serve.log' },
    },
  }],
  // One page at a time: the live revision test saves a note into the brain every test reads.
  workers: 1,
  timeout: 60_000,
  assertionTimeout: 10_000,
  retries: 0,
} satisfies E2EConfig;
