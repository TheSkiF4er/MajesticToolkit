import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import '../src/lib/safe-dom.js';

const {safeUrl,safeStyle} = globalThis.MTSafeDOM;
const read = path => readFile(new URL(path,import.meta.url),'utf8');

test('safe DOM refuses executable or credential-bearing navigation URLs',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,<script>x</script>','vbscript:evil()','https://user:pass@example.org/','//example.org','not-a-url'])assert.equal(safeUrl(url),false,url);
  for(const url of ['https://forum.majestic-rp.ru/threads/1/','http://example.org/','#info'])assert.equal(safeUrl(url),true,url);
});

test('safe DOM discards CSS resource loads and expressions',()=>{
  assert.equal(safeStyle('width:53.6%;color:#fff'),'width:53.6%;color:#fff');
  assert.equal(safeStyle('background:url(https://attacker.invalid/a);width:25%'),'width:25%');
  assert.equal(safeStyle('color:expression(alert(1))'),'');
  assert.equal(safeStyle('font-size:13px;flex:1'),'font-size:13px;flex:1');
});

test('no dynamic HTML insertion sinks remain in source UI and content scripts',async()=>{
 const files=['ui/complaints-page.mjs','ui/government-page.mjs','ui/law-page.mjs','ui/economy-page.mjs','ui/document-page.mjs','ui/productivity-page.mjs','ui/forum-page.mjs','ui/main.mjs','content/forum.js','content/evidence.js'];
 for(const file of files){
  const s=await read('../src/'+file);
  const staticEvidence=file==='content/evidence.js' ? s.replace(/shadow\.innerHTML\s*=\s*`<style>[\s\S]*?`;(?=\s*\(document\.body)/,'') : s;
  assert.doesNotMatch(staticEvidence,/\.innerHTML\s*=|\.outerHTML\s*=|\.insertAdjacentHTML\s*\(|\.createContextualFragment\s*\(/,file);
 }
});

test('Firefox backgrounds are static ES modules and content scripts load sanitizer first',async()=>{
 const bg=await read('../src/background/background.js');
 assert.doesNotMatch(bg,/\bimport\s*\(/);
 assert.match(bg,/import \* as importedStore from/);
 assert.match(bg,/\['lib\/safe-dom\.js','lib\/forum-core\.js'/);
 assert.match(bg,/\['lib\/safe-dom\.js','lib\/complaints-core\.js'/);
 for(const target of ['firefox','firefox-android']){
  const manifest=JSON.parse(await read(`../manifests/${target}.json`));
  assert.equal(manifest.background.type,'module');
 }
});

test('package license matches LICENSE and reproducible Mozilla build script is provided',async()=>{
 const p=JSON.parse(await read('../package.json'));
 assert.equal(p.license,'MPL-2.0');
 assert.match(await read('../LICENSE'),/^Mozilla Public License Version 2\.0/);
 assert.ok(p.scripts['build-for-amo']);
 assert.match(await read('../.gitignore'),/\/dist\//);
 assert.match(await read('../.gitignore'),/\/release\//);
});
