import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const outputRoot = resolve(root, 'dist');
await rm(outputRoot, { recursive: true, force: true });
for (const browser of ['chromium', 'firefox']) {
  const dest = resolve(outputRoot, browser);
  await mkdir(dest, { recursive: true });
  for (const part of ['lib', 'ui', 'content', 'background', 'assets', '_locales']) await cp(resolve(root, 'src', part), resolve(dest, part), { recursive: true });
  const manifest = JSON.parse(await readFile(resolve(root, 'manifests', `${browser}.json`), 'utf8'));
  if (manifest.version !== '0.2.0') throw new Error('Unexpected manifest version');
  await writeFile(resolve(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Created ${dest}`);
}
