import {access,readFile,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const permissions=new Set(['storage','activeTab','scripting','sidePanel','alarms','notifications','unlimitedStorage','identity']);
const origins=new Set(['https://forum.majestic-rp.ru/*','https://forum.russia.online/*','https://www.youtube.com/*','https://rutube.ru/*','https://www.twitch.tv/*','https://www.googleapis.com/*','https://docs.googleapis.com/*','https://sheets.googleapis.com/*','https://oauth2.googleapis.com/*']);
async function walk(dir){const nodes=await readdir(dir,{withFileTypes:true});return (await Promise.all(nodes.map(async n=>n.isDirectory()?walk(resolve(dir,n.name)):[resolve(dir,n.name)]))).flat();}
const targets=['chromium','firefox','firefox-android','safari'];
for(const browser of targets){
 const output=resolve(root,'dist',browser),m=JSON.parse(await readFile(resolve(output,'manifest.json'),'utf8'));
 if(m.manifest_version!==3 || m.version!=='1.0.0')throw Error(`${browser}: version / Manifest V3 invalid`);
 if(m.permissions.some(p=>!permissions.has(p)) || m.optional_host_permissions.length!==origins.size || m.optional_host_permissions.some(x=>!origins.has(x)))throw Error(`${browser}: expanded permissions`);
 if(m.host_permissions?.length)throw Error(`${browser}: unsolicited access to websites`);
 if(m.content_security_policy?.extension_pages?.includes('unsafe-eval'))throw Error(`${browser}: unsafe CSP`);
 if(browser==='chromium'||browser==='safari'){
   if(m.background.type!=='module'||!m.background.service_worker)throw Error(`${browser}: service worker must be ESM`);
   const worker=await readFile(resolve(output,m.background.service_worker),'utf8');
   if(!worker.startsWith('import * as importedStore') || /\bimport\s*\(/.test(worker))throw Error(`${browser}: background has dynamic imports`);
 }else if(!m.background.scripts?.length)throw Error(`${browser}: missing background scripts`);
 if(browser==='firefox-android'&&m.sidebar_action)throw Error('Firefox Android must not have desktop sidebar');
 if(browser==='safari'&&m.side_panel)throw Error('Safari should use workspace fallback');
 for(const path of [m.action.default_popup,'ui/workspace.html','ui/sidebar.html','ui/main.mjs','lib/recovery.mjs','lib/state.mjs','content/forum.js','content/evidence.js',...Object.values(m.icons)])await access(resolve(output,path));
 for(const f of await walk(output))if(/\.(m?js)$/.test(f))execFileSync(process.execPath,['--check',f],{stdio:'pipe'});
 console.log(`${browser}: manifest, static scripts, syntax and permissions validated`);
}
const src=await walk(resolve(root,'src'));for(const f of src)if(/\.(m?js)$/.test(f))execFileSync(process.execPath,['--check',f],{stdio:'pipe'});
console.log(`Checked ${src.filter(f=>/\.(m?js)$/.test(f)).length} source modules`);
