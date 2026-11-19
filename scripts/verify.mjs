import {access,readFile,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const asyncExecFile=promisify(execFile);
async function checkSyntax(files){
 // Bounded parallelism makes full 4-browser checks practical in CI without skipping a file.
 for(let i=0;i<files.length;i+=10)await Promise.all(files.slice(i,i+10).map(file=>asyncExecFile(process.execPath,['--check',file],{maxBuffer:1024*1024})));
}
const root=resolve(import.meta.dirname,'..');
const version=JSON.parse(await readFile(resolve(root,'package.json'),'utf8')).version;
const permissions=new Set(['storage','activeTab','scripting','sidePanel','alarms','notifications','unlimitedStorage','identity']);
const origins=new Set(['https://forum.majestic-rp.ru/*','https://forum.russia.online/*','https://www.youtube.com/*','https://rutube.ru/*','https://www.twitch.tv/*','https://www.googleapis.com/*','https://docs.googleapis.com/*','https://sheets.googleapis.com/*','https://oauth2.googleapis.com/*','https://api.majestic-files.com/*','https://api.majestic-files.net/*','https://fletcher-wiki.com/*','https://www.fletcher-wiki.com/*','http://127.0.0.1/*','https://*/*']);
async function walk(dir){const nodes=await readdir(dir,{withFileTypes:true});return (await Promise.all(nodes.map(async n=>n.isDirectory()?walk(resolve(dir,n.name)):[resolve(dir,n.name)]))).flat();}
const targets=['chromium','firefox','firefox-android','safari'];
for(const browser of targets){
 const output=resolve(root,'dist',browser),m=JSON.parse(await readFile(resolve(output,'manifest.json'),'utf8'));
 if(m.manifest_version!==3 || m.version!==version)throw Error(`${browser}: version / Manifest V3 invalid`);
 if(m.permissions.some(p=>!permissions.has(p)) || m.optional_host_permissions.length!==origins.size || m.optional_host_permissions.some(x=>!origins.has(x)))throw Error(`${browser}: expanded permissions`);
 if(m.host_permissions?.length)throw Error(`${browser}: unsolicited access to websites`);
 if(browser.startsWith('firefox')) {
   const gecko=m.browser_specific_settings?.gecko;
   if(gecko?.id!=='majestictoolkit@theskif4er.github.io')throw Error('Firefox: incorrect add-on ID');
   if(Number(gecko.strict_min_version)<140)throw Error('Firefox: built-in data consent requires 140+');
   if(browser==='firefox-android' && Number(m.browser_specific_settings?.gecko_android?.strict_min_version)<142)throw Error('Firefox Android: built-in consent requires 142+');
   const consent=gecko.data_collection_permissions;
   const expected=['authenticationInfo','personallyIdentifyingInfo','personalCommunications','websiteContent'];
   if(JSON.stringify(consent?.required)!==JSON.stringify(['none']) || JSON.stringify(consent?.optional)!==JSON.stringify(expected))throw Error('Firefox: incorrect optional data disclosure');
   if(gecko.update_url)throw Error('AMO-hosted Firefox must use Mozilla updates');
 }

 if(m.content_security_policy?.extension_pages?.includes('unsafe-eval'))throw Error(`${browser}: unsafe CSP`);
 if(browser==='chromium'||browser==='safari'){
   if(m.background.type!=='module'||!m.background.service_worker)throw Error(`${browser}: service worker must be ESM`);
   const worker=await readFile(resolve(output,m.background.service_worker),'utf8');
   if(!worker.includes("import * as importedStore from '../lib/complaints-store.mjs'") || /\bimport\s*\(/.test(worker))throw Error(`${browser}: background has dynamic imports`);
 }else {
   if(!m.background.scripts?.length||m.background.type!=='module')throw Error(`${browser}: Firefox must use module background scripts`);
   const worker=await readFile(resolve(output,m.background.scripts[0]),'utf8');
   if(!worker.includes("import * as importedStore from '../lib/complaints-store.mjs'")||/\bimport\s*\(/.test(worker))throw Error(`${browser}: Firefox background has dynamic imports`);
 }
 if(browser==='firefox-android'&&m.sidebar_action)throw Error('Firefox Android must not have desktop sidebar');
 if(browser==='safari'&&m.side_panel)throw Error('Safari should use workspace fallback');
 for(const path of [m.action.default_popup,'ui/workspace.html','ui/sidebar.html','ui/main.mjs','lib/recovery.mjs','lib/state.mjs','content/forum.js','content/evidence.js','ui/monitor-page.mjs','lib/monitor-core.mjs','lib/monitor-store.mjs','lib/monitor-backup.mjs','ui/knowledge-page.mjs','lib/knowledge-core.mjs','lib/knowledge-store.mjs','lib/knowledge-backup.mjs','ui/knowledge-page.mjs','lib/knowledge-core.mjs','lib/knowledge-store.mjs','lib/knowledge-backup.mjs',...Object.values(m.icons)])await access(resolve(output,path));
 await checkSyntax((await walk(output)).filter(f=>/\.(m?js)$/.test(f)));
 console.log(`${browser}: manifest, static scripts, syntax and permissions validated`);
}
const src=await walk(resolve(root,'src'));await checkSyntax([resolve(root,'ai-gateway/server.mjs'),resolve(root,'cloud-identity/server.mjs'),...src.filter(f=>/\.(m?js)$/.test(f))]);
console.log(`Checked ${src.filter(f=>/\.(m?js)$/.test(f)).length} source modules`);
