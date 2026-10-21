import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const outputRoot = resolve(root, 'dist');
await rm(outputRoot, { recursive: true, force: true });
const background = await readFile(resolve(root,'src/background/background.js'),'utf8');
const staticBackground = `import * as importedStore from '../lib/complaints-store.mjs';\nimport * as importedForum from '../lib/forum-store.mjs';\nimport '../lib/complaints-core.js';\n` + background
  .replace("const storePromise = import(api.runtime.getURL('lib/complaints-store.mjs'));", 'const storePromise = Promise.resolve(importedStore);')
  .replace("const forumStorePromise = import(api.runtime.getURL('lib/forum-store.mjs'));", 'const forumStorePromise = Promise.resolve(importedForum);')
  .replace("const corePromise = import(api.runtime.getURL('lib/complaints-core.js')).then(() => globalThis.RPNComplaints);", 'const corePromise = Promise.resolve(globalThis.RPNComplaints);');
if (staticBackground.includes('import(api.runtime.getURL(')) throw Error('Chromium service worker still has dynamic imports');
for (const browser of ['chromium', 'firefox', 'firefox-android', 'safari']) {
  const manifestBrowser = browser.startsWith('firefox') ? 'firefox' : 'chromium';
  const dest = resolve(outputRoot, browser);
  await mkdir(dest, {recursive:true});
  for (const part of ['lib','ui','content','background','assets','_locales']) await cp(resolve(root,'src',part),resolve(dest,part),{recursive:true});
  const manifest = JSON.parse(await readFile(resolve(root,'manifests',`${manifestBrowser}.json`),'utf8'));
  if (manifest.version !== '1.0.0') throw Error('Manifest version is not 1.0.0');
  if (browser === 'firefox-android') delete manifest.sidebar_action;
  if (browser === 'safari') {
    delete manifest.side_panel;
    delete manifest.minimum_chrome_version;
    // App-extension packaging, entitlements and signing must occur on Apple platforms.
  }
  if (browser === 'chromium' || browser === 'safari') await writeFile(resolve(dest,'background/background.js'),staticBackground);
  await writeFile(resolve(dest,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(`Created ${browser}`);
}
