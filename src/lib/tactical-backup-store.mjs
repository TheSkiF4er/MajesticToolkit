import {withTacticalWriteLock} from './tactical-lock.mjs';
/** Real local tactical backup operations: durable records and separately stored binary maps. */
import {api} from './browser.mjs';
import {getTacticalMap,replaceTacticalMaps,snapshotAllTacticalMaps} from './tactical-map-store.mjs';
import {listAirdrops} from './tactical-airdrop-store.mjs';
import {listTacticalPlans} from './tactical-planning-store.mjs';
import {listTacticalSimulations} from './tactical-simulation-store.mjs';
import {AIRDROP_POINT_PREFIX,AIRDROP_EVENT_PREFIX} from './tactical-airdrop-core.mjs';
import {PLAN_PREFIX} from './tactical-planning-core.mjs';
import {SIMULATION_PREFIX} from './tactical-simulation-core.mjs';
import {validateTacticalSnapshot} from './tactical-backup-v21.mjs';
import {digest} from './dossier-archive.mjs';
import {listTacticalLinks} from './tactical-links-store.mjs';
import {TACTICAL_LINK_PREFIX} from './tactical-links-core.mjs';
const prefixes=[AIRDROP_POINT_PREFIX,AIRDROP_EVENT_PREFIX,PLAN_PREFIX,SIMULATION_PREFIX,TACTICAL_LINK_PREFIX];
const locked=withTacticalWriteLock;
const keyFor=(r,prefix)=>prefix+r.id;
export function collectTacticalBackup(profiles){return locked(async()=>{
 const maps=[],files=new Map();
 for(const profile of profiles){const map=await getTacticalMap(profile.id);if(map){maps.push(map.meta);files.set(profile.id,new Uint8Array(await map.blob.arrayBuffer()));}}
 const airdrops=await listAirdrops();
 return {snapshot:{maps,airdropPoints:airdrops.points,airdropEvents:airdrops.events,plans:await listTacticalPlans(),simulations:await listTacticalSimulations(),links:await listTacticalLinks()},files};
});}
const buildRows=snapshot=>Object.fromEntries([
 ...snapshot.airdropPoints.map(x=>[keyFor(x,AIRDROP_POINT_PREFIX),x]),
 ...snapshot.airdropEvents.map(x=>[keyFor(x,AIRDROP_EVENT_PREFIX),x]),
 ...snapshot.plans.map(x=>[keyFor(x,PLAN_PREFIX),x]),
 ...snapshot.simulations.map(x=>[keyFor(x,SIMULATION_PREFIX),x]),
 ...(snapshot.links??[]).map(x=>[keyFor(x,TACTICAL_LINK_PREFIX),x])]);
/** Refuses missing image bytes before changing ANY store. Existing maps can satisfy a JSON-only restore. */
export async function resolveTacticalFiles(snapshot,inputFiles=new Map(),currentFiles=new Map()){
 const files=new Map();for(const meta of snapshot.maps){
  const bytes=inputFiles.get(meta.profileId)??currentFiles.get(meta.profileId);
  if(!(bytes instanceof Uint8Array)||bytes.length!==meta.size||await digest(bytes)!==meta.sha256)throw Error('Backup v21: карта '+meta.profileId+' отсутствует или не соответствует SHA-256. Используйте переносимый ZIP v21');
  files.set(meta.profileId,bytes);
 }return files;
}
/** Replacement is strict and rollback-aware. A single IndexedDB transaction swaps all map images. */
export function replaceTacticalBackup(snapshot,files,profiles,deps){return locked(async()=>{
 const next=validateTacticalSnapshot(snapshot,profiles,deps);
 const beforeStorage=await api.storage.local.get(null),beforeRows=Object.fromEntries(Object.entries(beforeStorage).filter(([key])=>prefixes.some(p=>key.startsWith(p))));
 const before=await snapshotAllTacticalMaps();
 const verified=await resolveTacticalFiles(next,files,before.files);
 const rows=buildRows(next),oldKeys=Object.keys(beforeRows),remove=oldKeys.filter(k=>!Object.hasOwn(rows,k));
 try{
  if(Object.keys(rows).length)await api.storage.local.set(rows);
  if(remove.length)await api.storage.local.remove(remove);
  await replaceTacticalMaps(next.maps,verified);
 }catch(error){
  try{
   const added=Object.keys(rows).filter(k=>!Object.hasOwn(beforeRows,k));
   if(added.length)await api.storage.local.remove(added);
   if(oldKeys.length)await api.storage.local.set(beforeRows);
   await replaceTacticalMaps(before.maps,before.files);
  }catch(rollback){throw new AggregateError([error,rollback],'Backup v21: восстановление и откат тактических данных завершились ошибкой');}
  throw error;
 }
 return next;
});}
