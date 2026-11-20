/** 2.3.4: durable local-first two-way replication of family/organization records.
 * Disabled by default: enabling a binding explicitly publishes that local profile.
 * All state/outbox/conflicts live in trusted extension storage, never content scripts.
 */
import {FAMILY_PREFIX,cleanFamily,validateFamilies} from './family-core.mjs';
import {ORGANIZATION_PREFIX,cleanOrganization,validateOrganizations} from './organization-core.mjs';
export const CLOUD_SYNC_KEY='mtCloudSyncV234';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const KINDS={family:{prefix:FAMILY_PREFIX,clean:cleanFamily,validate:validateFamilies},organization:{prefix:ORGANIZATION_PREFIX,clean:cleanOrganization,validate:validateOrganizations}};
const opKey=(kind,id)=>`${kind}:${id}`;
const localKey=(kind,id)=>KINDS[kind].prefix+id;
const hash=async(value)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
const normalize=(kind,record,profileId)=>KINDS[kind].clean({...record,profileId});
const checksum=async(kind,record,profileId)=>record?hash(JSON.stringify(normalize(kind,record,profileId))):null;
const newEntry=(cloudProfileId)=>({cloudProfileId,enabled:true,initialized:false,cursor:0,bootstrap:null,shadow:{},outbox:{},conflicts:{},lastSync:null,error:null});
const duplicate=v=>JSON.parse(JSON.stringify(v));
function scopeId(session,teamId,localId){return `${session.origin}|${session.account.id}|${teamId}|${localId}`;}
const status=entry=>({enabled:entry.enabled,cloudProfileId:entry.cloudProfileId,pending:Object.keys(entry.outbox).length,conflicts:Object.entries(entry.conflicts).map(([key,c])=>({key,...c})),lastSync:entry.lastSync,error:entry.error,initialized:entry.initialized,cursor:entry.cursor});
const lock=async(name,fn)=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request(name,{mode:'exclusive'},fn):fn();
export function createCloudSyncController({storage,authed,now=Date.now}){
  const read=async key=>(await storage.get(key))[key];
  const save=async(all)=>storage.set({[CLOUD_SYNC_KEY]:all});
  const allStates=async()=>await read(CLOUD_SYNC_KEY)||{};
  const base=(teamId,cloudProfileId)=>`/v1/teams/${teamId}/cloud/profiles/${cloudProfileId}/sync`;
  function checkProfile(localId){if(typeof localId!=='string'||!/^[\w-]{8,128}$/.test(localId))throw Error('Некорректный локальный RP-профиль');}
  function checkTeam(teamId,cloudProfileId){if(!UUID.test(teamId)||!UUID.test(cloudProfileId))throw Error('Некорректный облачный профиль или команда');}
  async function localRecords(localId){
    const raw=await storage.get(null),result=new Map();
    for(const [kind,config] of Object.entries(KINDS))for(const [key,value] of Object.entries(raw))if(key.startsWith(config.prefix)){
      const record=config.clean(value);
      if(record.id!==key.slice(config.prefix.length))throw Error('Повреждённый локальный ключ: '+key);
      if(record.profileId===localId)result.set(opKey(kind,record.id),{kind,id:record.id,record});
    }
    return result;
  }
  async function digestLocal(entry,localId,kind,id){
    const value=(await storage.get(localKey(kind,id)))[localKey(kind,id)];
    if(!value)return {record:null,checksum:null};
    const record=normalize(kind,value,localId);
    if(record.id!==id||record.profileId!==localId)throw Error('Несовпадение локального профиля');
    return {record,checksum:await checksum(kind,record,entry.cloudProfileId)};
  }
  async function capture(entry,localId){
    const local=await localRecords(localId);
    // Repeatable scan: the queue is stored before any network write. Changes made
    // while an operation is in flight become a subsequent revision after its ACK.
    for(const [key,{kind,id,record}] of local){
      if(entry.conflicts[key]||entry.outbox[key]||Object.keys(entry.outbox).length>=25)continue;
      const current=await checksum(kind,record,entry.cloudProfileId),old=entry.shadow[key];
      if(old?.checksum===current&&!old.deleted)continue;
      entry.outbox[key]={operationId:crypto.randomUUID(),kind,id,baseVersion:old?.version??0,record:normalize(kind,record,entry.cloudProfileId),deleted:false,checksum:current};
    }
    for(const [key,old] of Object.entries(entry.shadow)){
      if(local.has(key)||entry.conflicts[key]||entry.outbox[key]||old.deleted||Object.keys(entry.outbox).length>=25)continue;
      const [kind,id]=key.split(':');
      entry.outbox[key]={operationId:crypto.randomUUID(),kind,id,baseVersion:old.version,deleted:true,checksum:null};
    }
  }
  async function applyRemote(entry,localId,event,force=false){
    const kind=event.kind,id=event.id,key=opKey(kind,id),model=KINDS[kind];
    if(!model||!/^[\w-]{8,120}$/.test(id))throw Error('Недопустимая удалённая запись');
    const name=kind==='family'?'mt-families-v214':'mt-organizations-v215';
    return lock(name,async()=>{
      const raw=await storage.get(null),existing=raw[localKey(kind,id)];
      if(existing&&existing.profileId!==localId)throw Error('ID уже принадлежит другому локальному RP-профилю');
      const current=existing?await checksum(kind,existing,entry.cloudProfileId):null;
      const previous=entry.shadow[key];
      if(!force&&current!==(previous?.checksum??null))throw Error('Запись локально изменена');
      if(event.deleted){
        if(!existing)return;
        // Never bypass domain constraints on local destructive operations.
        const protectedHistory=kind==='family'?(existing.members?.length||existing.events?.length>3):(existing.members?.length||existing.assets?.length||existing.events?.length>3);
        if(protectedHistory)throw Error('Удаление блокировано: у локальной записи есть история или связи');
        const refs=Object.entries(raw).some(([k,v])=>{
          if(k===localKey(kind,id))return false;
          if(/^(mtEconomyLinkV219:|mtTacticalPlanV226:|mtTerritory|mtCrime|mtFinance)/.test(k))return JSON.stringify(v).includes(`"${id}"`);
          if(kind==='organization'&&k.startsWith('mtInventory'))return JSON.stringify(v).toLocaleLowerCase('ru-RU').includes(existing.name.toLocaleLowerCase('ru-RU'));
          return false;
        });
        if(refs)throw Error('Удаление блокировано: локальная запись используется другим разделом');
        await storage.remove(localKey(kind,id));return;
      }
      if(!event.record||event.record.id!==id||event.record.profileId!==entry.cloudProfileId)throw Error('Нарушена принадлежность облачной записи');
      const localRecord=normalize(kind,event.record,localId);
      const valid=Object.entries(raw).filter(([k])=>k.startsWith(model.prefix)&&k!==localKey(kind,id)).map(([,v])=>v);
      model.validate([...valid,localRecord]);
      await storage.set({[localKey(kind,id)]:localRecord});
    });
  }
  function conflict(entry,key,event,error='Параллельные изменения на двух устройствах'){
    const previous=entry.conflicts[key];
    if(previous&&previous.version>event.version)return;
    entry.conflicts[key]={kind:event.kind,id:event.id,version:event.version,deleted:event.deleted,reason:error};
    delete entry.outbox[key];
  }
  async function incorporate(entry,localId,event){
    const key=opKey(event.kind,event.id),previous=entry.shadow[key];
    if(previous&&event.version<previous.version)return;
    if(previous&&event.version===previous.version&&previous.checksum===event.checksum&&previous.deleted===event.deleted)return;
    const local=await digestLocal(entry,localId,event.kind,event.id);
    const pending=entry.outbox[key];
    if(entry.conflicts[key]){conflict(entry,key,event,entry.conflicts[key].reason);return;}
    if(local.checksum===event.checksum && (event.deleted ? local.record===null : local.record!==null)){
      entry.shadow[key]={version:event.version,checksum:event.checksum,deleted:event.deleted};
      if(pending&&pending.checksum===event.checksum&&pending.deleted===event.deleted)delete entry.outbox[key];
      return;
    }
    if(pending||local.checksum!==(previous?.checksum??null)){
      conflict(entry,key,event);return;
    }
    try{await applyRemote(entry,localId,event);}catch(error){conflict(entry,key,event,error.message);return;}
    entry.shadow[key]={version:event.version,checksum:event.checksum,deleted:event.deleted};
  }
  async function bootstrap(entry,localId,url,persist){
    let page=entry.bootstrap||{after:'',watermark:null};
    for(let n=0;n<100;n++){
      const query='?limit=100'+(page.after?'&after='+encodeURIComponent(page.after):'')+(page.watermark===null?'':'&watermark='+page.watermark);
      const response=await authed(url+'/snapshot'+query);
      if(!Array.isArray(response.entries)||!Number.isSafeInteger(response.watermark))throw Error('Некорректный снимок сервера');
      if(page.watermark!==null&&response.watermark!==page.watermark)throw Error('Версия снимка изменилась');
      for(const event of response.entries)await incorporate(entry,localId,event);
      if(!response.nextCursor){entry.initialized=true;entry.cursor=response.watermark;entry.bootstrap=null;await persist();return;}
      if(response.nextCursor===page.after)throw Error('Сервер вернул повторный курсор снимка');
      page={after:response.nextCursor,watermark:response.watermark};entry.bootstrap=page;await persist();
    }
  }
  async function pull(entry,localId,url,persist){
    for(let n=0;n<50;n++){
      const response=await authed(url+'?after='+entry.cursor+'&limit=100');
      if(!Array.isArray(response.changes)||!Number.isSafeInteger(response.cursor))throw Error('Некорректный журнал синхронизации');
      for(const event of response.changes)await incorporate(entry,localId,event);
      if(response.cursor<entry.cursor||response.hasMore&&response.cursor===entry.cursor)throw Error('Сервер вернул некорректный курсор');
      entry.cursor=response.cursor;await persist();
      if(!response.hasMore)return;
    }
  }
  async function upload(entry,localId,url,persist){
    for(const [key,pending] of Object.entries(entry.outbox).slice(0,50)){
      if(entry.conflicts[key])continue;
      // A pending write must never silently replace newer server data.
      let result;
      try{result=await authed(url,{method:'POST',body:{operationId:pending.operationId,kind:pending.kind,id:pending.id,baseVersion:pending.baseVersion,deleted:pending.deleted,record:pending.deleted?null:pending.record}});}
      catch(error){
        if(error.status===409){
          const remote=(await authed(url+'/record/'+pending.kind+'/'+pending.id)).entry;
          if(remote)conflict(entry,key,remote,error.message);
          else conflict(entry,key,{...pending,version:0},error.message);
          await persist();continue;
        }
        throw error;
      }
      entry.shadow[key]={version:result.version,checksum:pending.checksum,deleted:pending.deleted};
      delete entry.outbox[key];await persist();
    }
    await capture(entry,localId);await persist();
  }
  async function runOne(entry,localId,teamId,persist){
    const localState=await read('rpNexusStateV1');
    if(!localState?.profiles?.some(profile=>profile.id===localId))throw Error('Локальный RP-профиль отсутствует: синхронизация остановлена во избежание массового удаления');
    await capture(entry,localId);await persist();
    const url=base(teamId,entry.cloudProfileId);
    if(!entry.initialized)await bootstrap(entry,localId,url,persist);
    if(entry.initialized){await pull(entry,localId,url,persist);await capture(entry,localId);await persist();await upload(entry,localId,url,persist);}
    entry.lastSync=new Date(now()).toISOString();entry.error=null;await persist();
  }
  async function config(session,teamId,localId,cloudProfileId,enabled){
    checkProfile(localId);checkTeam(teamId,cloudProfileId);
    const id=scopeId(session,teamId,localId),all=await allStates();
    const previous=all[id];
    if(previous&&previous.cloudProfileId!==cloudProfileId&&previous.enabled)throw Error('Сначала отключите прежнюю синхронизацию');
    all[id]=previous?.cloudProfileId===cloudProfileId?{...previous,enabled}:enabled?newEntry(cloudProfileId):{...newEntry(cloudProfileId),enabled:false};
    await save(all);return status(all[id]);
  }
  async function inspect(session,teamId,localId){checkProfile(localId);const all=await allStates();return all[scopeId(session,teamId,localId)]?status(all[scopeId(session,teamId,localId)]):{enabled:false,pending:0,conflicts:[],initialized:false};}
  async function run(session,{teamId=null,localId=null}={}){
    const all=await allStates();const result=[];
    for(const [id,entry] of Object.entries(all)){
      const pieces=id.split('|');if(pieces.length!==4||pieces[0]!==session.origin||pieces[1]!==session.account.id||!entry.enabled)continue;
      const [, ,tid,lid]=pieces;if(teamId&&tid!==teamId||localId&&lid!==localId)continue;
      if(!UUID.test(tid)||!UUID.test(entry.cloudProfileId))continue;
      const persist=()=>save(all);
      try{await runOne(entry,lid,tid,persist);}catch(error){entry.error=error.message;await persist();}
      result.push({teamId:tid,localProfileId:lid,...status(entry)});
    }
    return {profiles:result};
  }
  async function resolveConflict(session,{teamId,localId,kind,id,choice}){
    if(!['cloud','local'].includes(choice)||!Object.hasOwn(KINDS,kind)||!/^[\w-]{8,120}$/.test(id))throw Error('Некорректное разрешение конфликта');
    const all=await allStates(),stateKey=scopeId(session,teamId,localId),entry=all[stateKey];
    if(!entry?.enabled||!entry.conflicts[opKey(kind,id)])throw Error('Конфликт не найден');
    const url=base(teamId,entry.cloudProfileId),remote=(await authed(url+'/record/'+kind+'/'+id)).entry;
    if(choice==='cloud'){
      const current=remote||{kind,id,version:0,deleted:true,checksum:null,record:null};
      await applyRemote(entry,localId,current,true);
      if(remote)entry.shadow[opKey(kind,id)]={version:remote.version,checksum:remote.checksum,deleted:remote.deleted};
      else delete entry.shadow[opKey(kind,id)];
    }else{
      // Accept the latest remote generation as the *base*, not its contents.
      // The selected local copy will be written through a conditional update.
      if(remote)entry.shadow[opKey(kind,id)]={version:remote.version,checksum:remote.checksum,deleted:remote.deleted};
      else delete entry.shadow[opKey(kind,id)];
      const current=await digestLocal(entry,localId,kind,id);
      entry.outbox[opKey(kind,id)]={operationId:crypto.randomUUID(),kind,id,baseVersion:remote?.version??0,record:current.record?normalize(kind,current.record,entry.cloudProfileId):undefined,checksum:current.checksum,deleted:current.record===null};
    }
    delete entry.conflicts[opKey(kind,id)];await save(all);
    return status(entry);
  }
  return {config,inspect,run,resolveConflict};
}
