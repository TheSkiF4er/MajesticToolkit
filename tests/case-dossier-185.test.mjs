import test from 'node:test';
import assert from 'node:assert/strict';
import {crc32,makeZip,readZip,encodeJson} from '../src/lib/dossier-archive.mjs';
import {assembleDossier,dossierText,dossierJson,dossierHtml,dossierBBCode,createCaseArchive,verifyCaseArchive} from '../src/lib/case-dossier.mjs';
import {makeBackupV17,parseBackupV17,validateVaultInventory,makePortableBackup,parsePortableBackup} from '../src/lib/dossier-backup.mjs';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
import '../src/lib/complaints-core.js';import '../src/lib/forum-core.js';
const state=validateState(defaultState()),profile=state.profiles[0];
const C=globalThis.RPNComplaints;
const created=C.createCase({profileId:profile.id,title:'Evidence dossier <script>',url:'https://forum.majestic-rp.ru/threads/report.185/'});
const caseRow=C.addEvidence(created,{title:'Video',url:'https://youtu.be/testcase',seconds:42,note:'A'});
const opts={profile,caseRow,registry:{version:1,records:[]},knowledge:emptyKnowledge(),sources:[],rules:[],audit:[]};
const emptyBackup={punishments:{version:1,calculators:[],drafts:[]},sections:{version:1,subscriptions:[],inbox:[]},registry:{version:1,records:[]},operations:{version:1,profiles:[]}};
function makeV17(inventory=[]){const args=[state,[],[caseRow],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]];return makeBackupV17(args,emptyBackup.punishments,emptyBackup.sections,emptyBackup.registry,emptyBackup.operations,inventory);}
test('ZIP writer/reader encode UTF-8 and validate CRC for each file',async()=>{
 const zip=await makeZip([['folder/report.txt','Пример обращения'],['manifest.json',encodeJson({version:1})]]);
 assert.equal(zip.type,'application/zip');const result=await readZip(zip);
 assert.equal(new TextDecoder().decode(result.get('folder/report.txt')),'Пример обращения');assert.deepEqual(JSON.parse(new TextDecoder().decode(result.get('manifest.json'))),{version:1});
 assert.equal(crc32(new Uint8Array([49,50,51,52,53,54,55,56,57])),0xcbf43926);
});
test('ZIP rejects traversal, duplicate entry names and unsupported compression',async()=>{
 await assert.rejects(makeZip([['../evil','x']]),/небезопасное/);
 await assert.rejects(makeZip([['a','1'],['a','2']]),/небезопасное/);
 const data=new Uint8Array(await (await makeZip([['a.txt','abc']])).arrayBuffer());data[8]=8;
 await assert.rejects(readZip(data.buffer),/неподдерживаемый ZIP|локальный заголовок/);
});
test('ZIP rejects CRC tampering, extra bytes and damaged central directory',async()=>{
 const bytes=new Uint8Array(await (await makeZip([['a.txt','abc']])).arrayBuffer());const changed=bytes.slice();changed[35]^=8;
 await assert.rejects(readZip(changed.buffer),/CRC-32/);
 const added=new Uint8Array(bytes.length+1);added.set(bytes);await assert.rejects(readZip(added.buffer),/архив/);
 const central=bytes.slice();central[38]^=0xff;await assert.rejects(readZip(central.buffer),/каталог|CRC|ZIP/);
});
test('dossier uses real complaint timeline, evidence and audited events',()=>{
 const d=assembleDossier({...opts,audit:[{id:'audit-185-sample',caseId:caseRow.id,action:'evidence',description:'Видеозапись проверена',at:new Date().toISOString()}]});
 assert.equal(d.case.id,caseRow.id);assert.equal(d.case.evidence.length,1);assert.equal(d.audit.length,1);
 assert.match(dossierText(d),/youtu\.be\/testcase/);
 assert.match(dossierText(d),/Видеозапись проверена/);
 assert.match(dossierHtml(d),/&lt;script&gt;/);
 assert.match(dossierBBCode(d),/Досье дела/);
});
test('dossier rejects another profile or project domain',()=>{
 assert.throws(()=>assembleDossier({...opts,profile:{...profile,id:'other_185_profile'}}),/профил/);
 assert.throws(()=>assembleDossier({...opts,profile:{...profile,project:'russia-online'}}),/профил/);
});
test('privacy options remove evidence, participant details, decision and audit',()=>{
 const d=assembleDossier({...opts,audit:[{id:'audit-185-sample',caseId:caseRow.id,description:'Secret internal',at:'2026-11-18T00:00:00Z',action:'case'}]});
 const redacted=dossierJson(d,{redact:true,includeEvidence:false});
 assert.equal(redacted.case.evidence.length,0);assert.equal(redacted.attachmentIds.length,0);assert.deepEqual(redacted.audit,[]);assert.match(dossierText(d,{includeEvidence:false}),/Скрыты/);
});
test('dossier ZIP verifies SHA-256 of reports and reports missing local attachments',async()=>{
 const d=assembleDossier(opts);const {blob,manifest}=await createCaseArchive(d),verified=await verifyCaseArchive(blob);
 assert.equal(manifest.caseId,d.case.id);assert.equal(manifest.items.length,3);assert.equal(verified.dossier.case.id,caseRow.id);
 const detached=C.addEvidence(caseRow,{title:'Unavailable image',kind:'file',vaultId:'file-185-missing',size:5,mime:'image/png',sha256:'f'.repeat(64)});
 const failed=await createCaseArchive(assembleDossier({...opts,caseRow:detached}));assert.equal(failed.manifest.files[0].status,'missing');
 assert.equal((await verifyCaseArchive(failed.blob)).manifest.files[0].status,'missing');
});
test('dossier rejects forged manifest digest even with valid ZIP CRC',async()=>{
 const d=assembleDossier(opts);const {blob}=await createCaseArchive(d),files=await readZip(blob),manifest=JSON.parse(new TextDecoder().decode(files.get('manifest.json')));
 manifest.items[0].sha256='0'.repeat(64);files.set('manifest.json',encodeJson(manifest));
 const forged=await makeZip([...files.entries()]);await assert.rejects(verifyCaseArchive(forged),/целостност/);
});
test('Backup v17 validates metadata inventory and retains v16 migration',()=>{
 const meta={id:'file-185-photo',profileId:profile.id,kind:'file',title:'PNG',note:'',createdAt:'2026-11-18T00:00:00Z',name:'photo.png',mime:'image/png',size:32,sha256:'a'.repeat(64)};
 const text=makeV17([meta]),parsed=parseBackupV17(text,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(parsed.schemaVersion,17);assert.equal(parsed.evidenceVault[0].sha256,meta.sha256);
 const v16={...JSON.parse(text),schemaVersion:16};delete v16.evidenceVault;
 const prior=parseBackupV17(JSON.stringify(v16),validateState,globalThis.RPNForumCore.cleanTemplate);assert.equal(prior.schemaVersion,16);assert.equal(prior.evidenceVault,null);
 assert.throws(()=>validateVaultInventory([meta,{...meta,id:'file-185-copy',profileId:'foreign-185-profile'}],state.profiles),/профил/);
 assert.throws(()=>validateVaultInventory([meta,meta],state.profiles),/дублируются/);
 const tampered=JSON.parse(text);tampered.evidenceVault[0].sha256='bad';assert.throws(()=>parseBackupV17(JSON.stringify(tampered),validateState,globalThis.RPNForumCore.cleanTemplate),/метаданные/);
});
test('portable Backup v17 roundtrips without binary assets and validates original profile',async()=>{
 const meta={id:'link-185-old',profileId:profile.id,kind:'link',title:'Legacy video',note:'',createdAt:'2026-11-18T00:00:00Z',url:'https://youtu.be/testcase',seconds:12};
 const text=makeV17([meta]);const {blob,manifest}=await makePortableBackup(text,[meta]);assert.equal(manifest.files.length,0);
 const restored=await parsePortableBackup(blob);assert.deepEqual(restored.inventory,[meta]);assert.equal(restored.files.size,0);
 assert.equal(parseBackupV17(restored.json,validateState,globalThis.RPNForumCore.cleanTemplate).schemaVersion,17);
});
test('portable Backup v17 refuses omitted or corrupt required assets',async()=>{
 const meta={id:'file-185-data',profileId:profile.id,kind:'file',title:'PNG',note:'',createdAt:'2026-11-18T00:00:00Z',name:'image.png',mime:'image/png',size:15,sha256:'a'.repeat(64)};
 const text=makeV17([meta]);const malicious=await makeZip([['backup.json',text],['manifest.json',encodeJson({format:'majestictoolkit-portable-backup',version:1,items:[{name:'backup.json',size:new TextEncoder().encode(text).length,sha256:'a'.repeat(64)}],files:[]})]]);
 await assert.rejects(parsePortableBackup(malicious),/Контрольная сумма/);
});
