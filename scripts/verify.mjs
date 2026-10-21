import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
for (const browser of ['chromium', 'firefox']) {
  const output = resolve(root, 'dist', browser);
  const m = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'));
  for (const item of [m.action.default_popup, 'ui/workspace.html', 'ui/sidebar.html', 'ui/main.mjs', 'lib/model.mjs', 'lib/state.mjs', 'lib/sites.mjs', 'content/launcher.js', 'background/background.js', ...Object.values(m.icons)]) await access(resolve(output, item));
  if (m.manifest_version !== 3 || m.version !== '0.1.0' || m.optional_host_permissions.length !== 1) throw new Error(`Unexpected manifest for ${browser}`);
  if (browser === 'chromium' && !m.background.service_worker) throw new Error('Missing Chrome service worker');
  if (browser === 'firefox' && (!m.sidebar_action || !m.background.scripts)) throw new Error('Missing Firefox sidebar/background');
  console.log(`${browser}: manifest, entrypoints, icons and optional permissions verified`);
}
