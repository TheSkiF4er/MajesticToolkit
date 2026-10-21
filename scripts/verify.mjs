import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
for (const browser of ['chromium', 'firefox']) {
  const output = resolve(root, 'dist', browser);
  const m = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'));
  for (const item of [m.action.default_popup, 'ui/workspace.html', 'ui/sidebar.html', 'ui/main.mjs', 'lib/model.mjs', 'lib/state.mjs', 'lib/sites.mjs', 'content/forum.js', 'lib/forum-core.js', 'lib/forum-store.mjs', 'ui/forum-page.mjs', 'ui/complaints-page.mjs', 'lib/complaints-core.js', 'lib/complaints-store.mjs', 'lib/economy-core.mjs', 'lib/economy-store.mjs', 'lib/economy-backup.mjs', 'ui/economy-page.mjs', 'lib/law-core.mjs', 'lib/law-store.mjs', 'lib/law-backup.mjs', 'ui/law-page.mjs', 'lib/government-core.mjs', 'lib/government-store.mjs', 'lib/government-backup.mjs', 'ui/government-page.mjs', 'ui/document-page.mjs', 'lib/document-core.mjs', 'lib/document-store.mjs', 'lib/document-backup.mjs', 'lib/document-pdf.mjs', 'lib/productivity-core.mjs', 'lib/productivity-store.mjs', 'lib/productivity-search.mjs', 'lib/productivity-backup.mjs', 'ui/productivity-page.mjs', 'lib/google-client.mjs', 'lib/integration-core.mjs', 'lib/integration-store.mjs', 'lib/integration-backup.mjs', 'ui/integrations-page.mjs', 'content/evidence.js', 'background/background.js', ...Object.values(m.icons)]) await access(resolve(output, item));
  if (m.manifest_version !== 3 || m.version !== '0.9.0' || m.optional_host_permissions.length !== 9) throw new Error(`Unexpected manifest for ${browser}`);
  if (browser === 'chromium' && !m.background.service_worker) throw new Error('Missing Chrome service worker');
  if (browser === 'firefox' && (!m.sidebar_action || !m.background.scripts)) throw new Error('Missing Firefox sidebar/background');
  console.log(`${browser}: manifest, entrypoints, icons and optional permissions verified`);
}
