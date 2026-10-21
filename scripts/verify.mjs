import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
for (const browser of ['chromium','firefox','firefox-android','safari']) {
  const output=resolve(root,'dist',browser);
  const m=JSON.parse(await readFile(resolve(output,'manifest.json'),'utf8'));
  for(const item of [m.action.default_popup,'ui/workspace.html','ui/sidebar.html','ui/main.mjs','lib/recovery.mjs','lib/model.mjs','lib/state.mjs','lib/sites.mjs','content/forum.js','content/evidence.js','lib/forum-core.js','lib/forum-store.mjs','ui/forum-page.mjs','ui/complaints-page.mjs','lib/complaints-store.mjs','ui/economy-page.mjs','lib/economy-store.mjs','ui/law-page.mjs','lib/law-store.mjs','ui/government-page.mjs','lib/government-store.mjs','ui/document-page.mjs','lib/document-pdf.mjs','ui/productivity-page.mjs','lib/google-client.mjs','ui/integrations-page.mjs','background/background.js',...Object.values(m.icons)]) await access(resolve(output,item));
  if(m.manifest_version!==3||m.version!==pkg.version)throw Error(`${browser}: manifest version`);
  if(m.optional_host_permissions?.length!==9)throw Error(`${browser}: optional permissions`);
  if(browser==='chromium'&&(!m.background.service_worker||m.background.type!=='module'||!m.side_panel))throw Error('Chromium background/sidepanel');
  if(browser==='firefox'&&(!m.background.scripts||!m.sidebar_action))throw Error('Firefox desktop background/sidebar');
  if(browser==='firefox-android'&&(!m.background.scripts||m.sidebar_action))throw Error('Firefox Android sidebar');
  if(browser==='safari'&&(!m.background.service_worker||m.background.type!=='module'||m.side_panel||m.sidebar_action))throw Error('Safari background');
  if(['chromium','safari'].includes(browser)) {
    const worker=await readFile(resolve(output,'background/worker.mjs'),'utf8');
    if(/\bimport\s*\(/.test(worker))throw Error(`${browser}: dynamic import in worker`);
    if(!worker.includes("import * as complaintsStore from '../lib/complaints-store.mjs'"))throw Error('Worker dependencies missing');
  }
  console.log(`${browser}: manifests and entrypoints verified`);
}
