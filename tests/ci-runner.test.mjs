import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Keep the Playwright browser job on a runner supported by the pinned
// playwright package; ubuntu-latest switched to unsupported Ubuntu 26.04.
const activeWorkflows = [
  '.github/workflows/verify.yml',
  '.github/workflows/release-check.yml',
];

for (const workflow of activeWorkflows) {
  test(`${workflow}: browser-e2e runs on a Playwright-compatible OS`, () => {
    const source = readFileSync(new URL(`../${workflow}`, import.meta.url), 'utf8');
    const jobStart = source.search(/^  browser-e2e:\s*$/m);
    assert.notEqual(jobStart, -1, 'browser-e2e job not found');
    const browserJob = source.slice(jobStart).split(/\n(?=  [a-z][a-z0-9-]*:\s*\n)/)[0];
    assert.match(browserJob, /^    runs-on: ubuntu-24\.04\s*$/m);
    assert.match(browserJob, /python -m pip install playwright==1\.57\.0/);
    assert.match(browserJob, /python -m playwright install --with-deps chromium firefox/);
    assert.match(browserJob, /MAJESTIC_E2E_BROWSERS: chromium,firefox/);
    assert.match(browserJob, /run: python tests\/browser-e2e\.py/);
  });
}
