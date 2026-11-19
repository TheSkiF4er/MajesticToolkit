import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import '../src/lib/complaints-core.js';import '../src/lib/forum-core.js';
import {defaultState,validateState} from '../src/lib/model.mjs';
import {defaultProductivity} from '../src/lib/productivity-core.mjs';
import {emptyMonitor} from '../src/lib/monitor-core.mjs';
import {emptyKnowledge} from '../src/lib/knowledge-core.mjs';
import {createPlan,mutatePlan,PLAN_PREFIX} from '../src/lib/tactical-planning-core.mjs';
import {createTacticalSimulation,SIMULATION_PREFIX} from '../src/lib/tactical-simulation-core.mjs';
import {newAirdropPoint,newAirdropEvent,AIRDROP_POINT_PREFIX,AIRDROP_EVENT_PREFIX} from '../src/lib/tactical-airdrop-core.mjs';
import {makeBackupV21,parseBackupV21,validateTacticalSnapshot} from '../src/lib/tactical-backup-v21.mjs';
import {makeBackupV20} from '../src/lib/economy-backup-v20.mjs';
import {makePortableBackup,parsePortableBackup} from '../src/lib/dossier-backup.mjs';
import {digest,makeZip,readZip,encodeJson} from '../src/lib/dossier-archive.mjs';
import {newTacticalLink,validateTacticalLinks} from '../src/lib/tactical-links-core.mjs';
const state=defaultState(),pid=state.activeProfileId;
const baseArgs=[[state,[],[],[],[],[],[],[],defaultProductivity(),[],emptyMonitor(),emptyKnowledge(),globalThis.RPNForumCore.cleanTemplate,[],[]],{version:1,calculators:[],drafts:[]},{version:1,subscriptions:[],inbox:[]},{version:1,records:[]},{version:1,profiles:[]},[],null,[],[],[],[],[],[],[],[]];
// A real 1x1 PNG. Image signature/size/sha are validated independently of metadata.
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/kJkAAAAASUVORK5CYII=','base64'));
const empty=()=>({maps:[],airdropPoints:[],airdropEvents:[],plans:[],simulations:[]});
async function sample(){
 const sha=await digest(png),meta={profileId:pid,name:'Тестовая карта',mime:'image/png',size:png.length,width:1,height:1,sha256:sha,updatedAt:'2026-11-19T10:00:00.000Z',annotationsRevision:0,view:{centerX:.5,centerY:.5,zoom:1},anchors:[]};
 let plan=createPlan(pid,{title:'Маршрут RP',mapSha256:sha});
 plan=mutatePlan(plan,'add-point',{id:'point_start_229',name:'Старт',kind:'rally',x:.1,y:.1,squadId:''});
 plan=mutatePlan(plan,'add-point',{id:'point_end_229',name:'Финиш',kind:'objective',x:.9,y:.9,squadId:''});
 plan=mutatePlan(plan,'add-route',{id:'route_alpha_229',name:'Route',pointIds:['point_start_229','point_end_229'],speed:5,squadId:''});
 const run=createTacticalSimulation(pid,plan,'RP Simulation',{seed:42},{width:1,height:1});
 const point=newAirdropPoint(pid,{name:'Точка 1',description:'',x:.5,y:.5,mapSha256:sha});
 const event=newAirdropEvent(pid,{title:'Аирдроп',pointId:point.id,scheduledAt:'2026-11-19T10:00:00.000Z',durationMinutes:30,notes:''});
 return {sha,meta,plan,run,point,event,snapshot:{maps:[meta],airdropPoints:[point],airdropEvents:[event],plans:[plan],simulations:[run]}};
}
test('Backup v21 parses and exports validated tactical journals, map layers and chronology',async()=>{
 const {snapshot}=await sample(),json=await makeBackupV21(baseArgs,snapshot);
 const parsed=await parseBackupV21(json,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(parsed.schemaVersion,21);assert.equal(parsed.tactical.maps[0].profileId,pid);
 assert.equal(parsed.tactical.airdropEvents.length,1);assert.equal(parsed.tactical.plans.length,1);assert.equal(parsed.tactical.simulations.length,1);
 assert.equal(validateTacticalSnapshot(parsed.tactical,state.profiles).plans.length,1);
});
test('Backup v21 rejects tampered references, foreign profiles and simulations',async()=>{
 const {snapshot}=await sample();const raw=JSON.parse(await makeBackupV21(baseArgs,snapshot));
 raw.tactical.maps[0].sha256='b'.repeat(64);
 await assert.rejects(parseBackupV21(JSON.stringify(raw),validateState,globalThis.RPNForumCore.cleanTemplate),/подложк|карты|карте/);
 raw.tactical.maps[0].sha256=snapshot.maps[0].sha256;raw.tactical.simulations[0].result.primary.conflictCount=99;
 await assert.rejects(parseBackupV21(JSON.stringify(raw),validateState,globalThis.RPNForumCore.cleanTemplate),/поврежд|измен/);
 raw.tactical.simulations=snapshot.simulations;raw.tactical.airdropPoints[0].profileId='other_profile_229';
 await assert.rejects(parseBackupV21(JSON.stringify(raw),validateState,globalThis.RPNForumCore.cleanTemplate),/Чужой профиль/);
});
test('ZIP v21 carries full image and detects tampering, missing map and unsafe manifests',async()=>{
 const {snapshot,sha}=await sample(),json=await makeBackupV21(baseArgs,snapshot);
 const packed=await makePortableBackup(json,[],new Map([[pid,png]]));
 const parsed=await parsePortableBackup(packed.blob);
 assert.equal(parsed.manifest.version,2);assert.equal(parsed.maps.size,1);assert.equal(await digest(parsed.maps.get(pid)),sha);
 await assert.rejects(makePortableBackup(json,[],new Map()),/изображени|карты/);
 const entries=await readZip(packed.blob),manifest=JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
 const tampered=entries.get(`maps/${pid}.bin`).slice();tampered[10]^=0x40;
 // Make a syntactically valid ZIP and check SHA, not just the CRC.
 entries.set(`maps/${pid}.bin`,tampered);
 const bad=await makeZip([...entries]);await assert.rejects(parsePortableBackup(bad),/Контрольная сумма/);
 assert.equal(manifest.maps.length,1);
});
test('JSON-only v21 fails closed for missing map, accepts existing matching image',async()=>{
 const {snapshot}=await sample(),{resolveTacticalFiles}=await import('../src/lib/tactical-backup-store.mjs');
 await assert.rejects(resolveTacticalFiles(snapshot,new Map(),new Map()),/переносимый ZIP/);
 assert.equal((await resolveTacticalFiles(snapshot,new Map(),new Map([[pid,png]]))).get(pid).length,png.length);
 const forged=png.slice();forged[14]^=1;
 await assert.rejects(resolveTacticalFiles(snapshot,new Map([[pid,forged]]),new Map()),/переносимый ZIP/);
});
test('Legacy Backup v20 parses without overwriting tactical data, old portable ZIP remains valid',async()=>{
 const legacy=await makeBackupV20(...baseArgs),restored=await parseBackupV21(legacy,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(restored.schemaVersion,20);assert.equal(restored.tactical,null);
 const packed=await makePortableBackup(legacy,[]);const parsed=await parsePortableBackup(packed.blob);
 assert.equal(parsed.manifest.version,1);assert.equal(parsed.maps.size,0);
});

test('real cross-module link validation keeps Evidence Vault and Document Studio references in v21',async()=>{
 const {snapshot,event}=await sample();
 const evidence={id:'evidence_tactical_229',profileId:pid,kind:'link',title:'Ссылка на RP-доказательство',note:'',url:'https://forum.example.net/evidence',seconds:null,createdAt:'2026-11-19T10:00:00.000Z'};
 const link=newTacticalLink(pid,{entityType:'airdrop',entityId:event.id,sourceType:'evidence',sourceId:evidence.id,note:'Подтверждение аирдропа'});
 const refs={territories:[],airdropEvents:[event],plans:snapshot.plans,simulations:snapshot.simulations,documents:[],evidenceVault:[evidence]};
 assert.equal(validateTacticalLinks([link],[pid],refs).length,1);
 assert.throws(()=>validateTacticalLinks([link,link],[pid],refs),/Дубликат/);
 assert.throws(()=>validateTacticalLinks([link],[pid],{...refs,evidenceVault:[]}),/отсутствует/);
 assert.throws(()=>validateTacticalLinks([{...link,profileId:'unknown_229'}],[pid],refs),/профиль/);
 const args=baseArgs.map((x,i)=>i===0?[...x]:x);args[5]=[evidence];
 const raw=await makeBackupV21(args,{...snapshot,links:[link]});
 const parsed=await parseBackupV21(raw,validateState,globalThis.RPNForumCore.cleanTemplate);
 assert.equal(parsed.tactical.links.length,1);assert.equal(parsed.tactical.links[0].sourceId,evidence.id);
 const tamper=JSON.parse(raw);tamper.evidenceVault=[];
 await assert.rejects(parseBackupV21(JSON.stringify(tamper),validateState,globalThis.RPNForumCore.cleanTemplate),/отсутствует/);
});
