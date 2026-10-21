import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const outputRoot = resolve(root, 'dist');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const platforms = ['chromium', 'firefox', 'firefox-android', 'safari'];
await rm(outputRoot, { recursive: true, force: true });
for (const browser of platforms) {
  const dest = resolve(outputRoot, browser);
  await mkdir(dest, { recursive: true });
  for (const part of ['lib', 'ui', 'content', 'background', 'assets', '_locales']) {
    await cp(resolve(root, 'src', part), resolve(dest, part), { recursive: true });
  }
  if (browser === 'chromium' || browser === 'safari') {
    // MV3 service workers do NOT support dynamic import(). Bundle a static ESM entry.
    let worker = await readFile(resolve(root,'src/background/background.js'),'utf8');
    const changes = [
      ["const storePromise = import(api.runtime.getURL('lib/complaints-store.mjs'));", 'const storePromise = Promise.resolve(complaintsStore);'],
      ["const corePromise = import(api.runtime.getURL('lib/complaints-core.js')).then(() => globalThis.RPNComplaints);", 'const corePromise = Promise.resolve(globalThis.RPNComplaints);'],
      ["const {listTemplates}=await import(api.runtime.getURL('lib/forum-store.mjs'));", 'const {listTemplates}=forumStore;']
    ];
    for (const [oldText,newText] of changes) {
      if(!worker.includes(oldText))throw Error(`Worker generation: missing ${oldText}`);
      worker=worker.replace(oldText,newText);
    }
    if(/\bimport\s*\(/.test(worker))throw Error('Dynamic imports are prohibited in MV3 service worker');
    const imports = "import * as complaintsStore from '../lib/complaints-store.mjs';\nimport * as forumStore from '../lib/forum-store.mjs';\n";
    await writeFile(resolve(dest,'background/worker.mjs'), imports+worker);
  }
  const manifest = JSON.parse(await readFile(resolve(root, 'manifests', `${browser}.json`), 'utf8'));
  if (manifest.version !== pkg.version || manifest.manifest_version !== 3) throw Error(`${browser}: version mismatch`);
  await writeFile(resolve(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Created ${dest}`);
}
