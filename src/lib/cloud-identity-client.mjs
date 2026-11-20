/** Cloud Identity 2.3.3: privileged background-only credential store + authenticated requests. */
import {createCloudSyncController} from './cloud-sync-client.mjs';
import {sharedSourceSnapshot,sharedSourceStorageKey} from './shared-knowledge-source.mjs';
import {localTacticalChoices,localTacticalRecord,tacticalRecordForProfile,editSharedTacticalRecord,applyTacticalCloudRecord} from './cloud-tactical-source.mjs';
export const CLOUD_CONFIG_KEY='mtCloudIdentityConfigV231';
export const CLOUD_SESSION_KEY='mtCloudIdentitySessionV231';
export const CLOUD_BINDINGS_KEY='mtCloudProfileBindingsV233';
export function cloudEndpoint(raw){
  if(typeof raw!=='string'||raw.length>300)throw Error('Укажите адрес Cloud Identity Server');
  let url;try{url=new URL(raw.trim());}catch{throw Error('Некорректный адрес Cloud Identity Server');}
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!url.hostname||!['http:','https:'].includes(url.protocol))throw Error('Адрес должен содержать только HTTPS-домен (без пути, логина и параметров)');
  if(url.protocol==='http:'&&url.hostname!=='127.0.0.1')throw Error('HTTP разрешён только для локального сервера 127.0.0.1');
  if(url.origin.length>250)throw Error('Слишком длинный адрес сервера');
  return url.origin;
}
export function cloudHostPattern(origin){const u=new URL(cloudEndpoint(origin));return `${u.protocol}//${u.hostname}/*`;}
function safeCredentials(username,password,deviceName){
  if(typeof username!=='string'||!/^[a-z][a-z0-9_.-]{2,31}$/.test(username.toLowerCase().trim())||typeof password!=='string'||password.length<12||password.length>128||new TextEncoder().encode(password).length>512||typeof deviceName!=='string'||deviceName.trim().length<1||deviceName.trim().length>70)throw Error('Логин: 3–32 латинских символа; пароль: 12–128 символов; укажите устройство');
  return {username:username.toLowerCase().trim(),password,deviceName:deviceName.trim()};
}
export function createCloudIdentityService({storage,permissions,fetchImpl=fetch,now=Date.now}){
  let access=null,queue=Promise.resolve();
  const enqueue=fn=>{const job=queue.then(fn);queue=job.catch(()=>{});return job;};
  const read=async key=>(await storage.get(key))[key];
  const write=async(key,value)=>storage.set({[key]:value});
  const clear=async()=>{access=null;await storage.remove(CLOUD_SESSION_KEY);};
  const sync=createCloudSyncController({storage,authed:(path,options)=>authed(path,options),now});
  async function config(){return (await read(CLOUD_CONFIG_KEY))?.origin||'';}
  async function saved(){return await read(CLOUD_SESSION_KEY)||null;}
  async function checked(origin){if(!await permissions.contains({origins:[cloudHostPattern(origin)]}))throw Error('Не предоставлено разрешение на обращение к Cloud Identity Server');}
  async function request(origin,path,{method='GET',body=null,token=null}={}){
    await checked(origin);
    let response;
    try{
      response=await fetchImpl(origin+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)});
    }catch{throw Error('Сервер идентификации недоступен. Проверьте адрес, TLS и подключение');}
    let payload;
    try{payload=await response.json();}catch{throw Error('Сервер вернул некорректный ответ');}
    if(!response.ok){const err=new Error(typeof payload?.error==='string'?payload.error.slice(0,180):`Cloud Identity: HTTP ${response.status}`);err.status=response.status;throw err;}
    return payload;
  }
  /** Binary map transfers run in the background: no bearer token or 25 MiB blob reaches the UI. */
  async function tacticalBinary(path,{method='GET',blob=null,mime=null}={}){
    let session=await refreshActive();if(!session)throw Error('Войдите в облачный аккаунт');
    const perform=async token=>{
      await checked(session.origin);
      const res=await fetchImpl(session.origin+path,{method,body:blob??undefined,headers:{Authorization:'Bearer '+token,...(mime?{'Content-Type':mime}:{})},cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(120000)});
      if(!res.ok){let error;try{error=(await res.json()).error;}catch{}const e=new Error(error||'Ошибка передачи карты: '+res.status);e.status=res.status;throw e;}
      if(method!=='GET')return res.json();
      const maxBytes=25*1024*1024,expected=Number(res.headers.get('content-length'));
      if(expected>maxBytes)throw Error('Ответ карты превышает лимит 25 МиБ');
      if(!res.body?.getReader)throw Error('Не удалось получить поток изображения карты');
      const pieces=[];let size=0,reader=res.body.getReader();
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw Error('Ответ карты превышает лимит 25 МиБ');}pieces.push(value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;
      for(const part of pieces){bytes.set(part,offset);offset+=part.byteLength;}
      return bytes;
    };
    try{return await perform(session.token);}catch(error){
      if(error.status!==401)throw error;
      access=null;session=await refreshActive();return perform(session.token);
    }
  }
  /** Stream binary evidence through the privileged background only; never expose bearer
   * credentials to extension pages. We also verify downloaded SHA-256 before local import. */
  async function fileBinary(path,{method='GET',blob=null,meta=null,baseVersion=null,sha256=null}={}){
    let session=await refreshActive();if(!session)throw Error('Войдите в облачный аккаунт');
    const transfer=async token=>{
      await checked(session.origin);
      const headers={Authorization:'Bearer '+token};
      if(blob){
        headers['Content-Type']=blob.type;
        headers['X-MT-Sha256']=sha256;
        headers['X-MT-File-Meta']=btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(meta)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
        if(baseVersion!==null)headers['X-MT-Base-Version']=String(baseVersion);
      }
      let response;
      try{response=await fetchImpl(session.origin+path,{method,headers,body:blob||undefined,cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(120000)});}
      catch{throw Error('Не удалось передать файл: сервер недоступен');}
      if(!response.ok){let err;try{err=(await response.json()).error;}catch{}const error=new Error(err||'Ошибка файлового хранилища: '+response.status);error.status=response.status;throw error;}
      if(method!=='GET')return response.json();
      const limit=32*1024*1024;
      if(Number(response.headers.get('content-length'))>limit)throw Error('Файл превышает лимит 32 МиБ');
      if(!response.body?.getReader)throw Error('Сервер не вернул поток файла');
      const parts=[];let size=0;const reader=response.body.getReader();
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('Файл превышает лимит 32 МиБ');}parts.push(value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
      const expected=response.headers.get('x-mt-sha256');
      if(expected!==hash)throw Error('SHA-256 скачанного файла не совпадает');
      const mime=response.headers.get('x-mt-mime');
      return {bytes,mime,sha256:hash};
    };
    try{return await transfer(session.token);}catch(error){if(error.status!==401)throw error;access=null;session=await refreshActive();return transfer(session.token);}
  }
  async function accept(origin,credentials){
    if(!credentials?.account?.id||!credentials?.account?.username||!credentials?.sessionId||!credentials?.accessToken||!credentials?.refreshToken||!Number.isFinite(Date.parse(credentials.accessExpiresAt)))throw Error('Сервер вернул неполную сессию');
    const record={origin,account:credentials.account,sessionId:credentials.sessionId,refreshToken:credentials.refreshToken};
    // Only the background process handles tokens; never serialize them back to UI.
    await write(CLOUD_SESSION_KEY,record);
    access={token:credentials.accessToken,expires:Date.parse(credentials.accessExpiresAt),sessionId:credentials.sessionId};
    return {authenticated:true,origin,account:credentials.account,sessionId:credentials.sessionId};
  }
  async function refreshActive(){
    const record=await saved();if(!record)return null;
    if(access?.sessionId===record.sessionId&&access.expires>now()+30_000)return {origin:record.origin,token:access.token,record};
    let result;
    try{result=await request(record.origin,'/v1/auth/refresh',{method:'POST',body:{refreshToken:record.refreshToken}});}
    catch(error){if(error.status===401||error.status===403)await clear();throw error;}
    await accept(record.origin,result);
    return {origin:record.origin,token:access.token,record:await saved()};
  }
  async function authed(path,opts={}){
    let session=await refreshActive();if(!session)throw Error('Сначала войдите в облачный аккаунт');
    try{return await request(session.origin,path,{...opts,token:session.token});}
    catch(error){
      if(error.status!==401)throw error;
      // Access revoked/expired. Attempt one refresh; if this fails, credentials are removed.
      access=null;session=await refreshActive();return request(session.origin,path,{...opts,token:session.token});
    }
  }
  async function execute(action,input={}){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Некорректный запрос');
    const origin=await config();
    if(action==='configure'){
      const next=cloudEndpoint(input.origin);
      const existing=await saved();if(existing&&existing.origin!==next)throw Error('Сначала выйдите из текущего аккаунта');
      await checked(next);await request(next,'/v1/health');await write(CLOUD_CONFIG_KEY,{origin:next});return {configured:true,origin:next};
    }
    if(action==='status'){
      const record=await saved();if(!record)return {configured:Boolean(origin),origin,authenticated:false};
      try{const me=await authed('/v1/auth/me');return {configured:true,origin:record.origin,authenticated:true,account:me.account,session:me.session};}
      catch(error){
        if(!await saved())return {configured:Boolean(origin),origin,authenticated:false,expired:true};
        return {configured:true,origin:record.origin,authenticated:false,offline:true,lastAccount:record.account?.username||'',error:error.message};
      }
    }
    if(action==='login'||action==='register'){
      if(!origin)throw Error('Сначала подключите Cloud Identity Server');
      if(await saved())throw Error('Сначала выйдите из текущего облачного аккаунта');
      const body=safeCredentials(input.username,input.password,input.deviceName);
      const result=await request(origin,action==='register'?'/v1/auth/register':'/v1/auth/login',{method:'POST',body});
      return accept(origin,result);
    }
    // Team credentials are never sent to the page. Every team operation runs in background
    // with the current access token and is independently authorized by the server.
    if(action==='syncTick'){
      const session=await saved();
      if(!session)return {profiles:[]};
      // Capture and persist edits even when the server is offline; the controller
      // obtains/refreshes credentials only when it reaches a network operation.
      return sync.run({origin:session.origin,account:session.account},{teamId:input.teamId||null,localId:input.localProfileId||null});
    }
    const teamId=input.teamId;
    const teamPath=()=>{
      if(typeof teamId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(teamId))throw Error('Некорректный идентификатор команды');
      return '/v1/teams/'+teamId;
    };
    const memberPath=()=>{
      if(typeof input.accountId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input.accountId))throw Error('Некорректный участник');
      return teamPath()+'/members/'+input.accountId;
    };
    // Local profile bindings are scoped to origin, authenticated account, team and local RP profile.
    // These mappings never expose refresh or access tokens to extension pages.
    const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
    const cloudPath=()=>teamPath()+'/cloud/profiles';
    const cloudProfilePath=()=>{
      if(!uuid(input.cloudProfileId))throw Error('Некорректный облачный RP-профиль');
      return cloudPath()+'/'+input.cloudProfileId;
    };
    if(['cloudBindings','cloudBind','cloudUnbind'].includes(action)){
      // Always authenticate even for local metadata so that a revoked session cannot
      // continue operating with a stale team association.
      const session=await refreshActive();if(!session)throw Error('Сначала войдите в облачный аккаунт');
      const live=await authed(cloudPath());
      const scope=[session.origin,session.record.account.id,teamId].join('|');
      const all=(await read(CLOUD_BINDINGS_KEY))||{};
      const bindings=all[scope]&&typeof all[scope]==='object'?all[scope]:{};
      if(action==='cloudBindings')return {bindings:Object.fromEntries(Object.entries(bindings).filter(([,id])=>live.profiles.some(p=>p.id===id))),profiles:live.profiles};
      const localId=input.localProfileId;
      if(typeof localId!=='string'||!/^[\w-]{8,128}$/.test(localId))throw Error('Некорректный локальный RP-профиль');
      const localState=(await read('rpNexusStateV1'));
      const local=localState?.profiles?.find(p=>p.id===localId);
      if(!local)throw Error('Локальный RP-профиль отсутствует');
      if(action==='cloudBind'){
        if(bindings[localId]&&bindings[localId]!==input.cloudProfileId&&(await sync.inspect({origin:session.origin,account:session.record.account},teamId,localId)).enabled)throw Error('Сначала отключите синхронизацию перед сменой облачного RP-профиля');
        const remote=live.profiles.find(p=>p.id===input.cloudProfileId);
        if(!remote)throw Error('Облачный RP-профиль не найден');
        if(local.project!==remote.project||local.server!==remote.server)throw Error('RP-проект и сервер локального и облачного профиля должны совпадать');
        bindings[localId]=remote.id;
      }else {
        if(bindings[localId])await sync.config({origin:session.origin,account:session.record.account},teamId,localId,bindings[localId],false);
        delete bindings[localId];
      }
      all[scope]=bindings;await write(CLOUD_BINDINGS_KEY,all);return {bindings};
    }
    if(['syncStatus','syncEnable','syncDisable','syncNow','syncResolve'].includes(action)){
      const record=await saved();if(!record)throw Error('Сначала войдите в облачный аккаунт');
      const session={origin:record.origin,account:record.account};
      const localId=input.localProfileId;
      if(typeof localId!=='string'||!/^[\w-]{8,128}$/.test(localId))throw Error('Некорректный локальный RP-профиль');
      const scope=[record.origin,record.account.id,teamId].join('|');
      const all=(await read(CLOUD_BINDINGS_KEY))||{};
      const bound=all[scope]?.[localId];
      if(!bound)throw Error('Локальный RP-профиль не привязан к этому облачному профилю');
      if(action==='syncStatus')return sync.inspect(session,teamId,localId);
      if(action==='syncEnable'||action==='syncDisable'){
        // Re-check team membership and cloud profile consistency before enabling.
        const profiles=(await authed(cloudPath())).profiles;
        const local=(await read('rpNexusStateV1'))?.profiles?.find(x=>x.id===localId);
        const remote=profiles.find(x=>x.id===bound);
        if(!local||!remote||local.project!==remote.project||local.server!==remote.server)throw Error('Привязка RP-профиля устарела');
        const state=await sync.config(session,teamId,localId,bound,action==='syncEnable');
        if(action==='syncEnable')return (await sync.run(session,{teamId,localId})).profiles[0]||state;
        return state;
      }
      if(action==='syncNow')return (await sync.run(session,{teamId,localId})).profiles[0]||sync.inspect(session,teamId,localId);
      if(action==='syncResolve')return sync.resolveConflict(session,{teamId,localId,kind:input.kind,id:input.id,choice:input.choice});
    }
    if(action==='cloudProfiles')return authed(cloudPath());
    if(action==='cloudProfileCreate')return authed(cloudPath(),{method:'POST',body:{name:input.name,project:input.project,server:input.server}});
    if(action.startsWith('file')){
      const root=cloudProfilePath()+'/files';
      const fileId=input.fileId;
      const filePath=()=>{if(!uuid(fileId))throw Error('Некорректный идентификатор файла');return root+'/'+fileId;};
      const bound=async()=>{
        const live=await execute('cloudBindings',{teamId});
        const local=(await read('rpNexusStateV1'))?.profiles?.find(p=>p.id===input.localProfileId);
        const remote=live.profiles.find(p=>p.id===input.cloudProfileId);
        if(!local||!remote||live.bindings[local.id]!==remote.id||local.project!==remote.project||local.server!==remote.server)throw Error('Требуется привязанный локальный RP-профиль');
      };
      if(action==='fileList'){
        if(input.after&&!uuid(input.after))throw Error('Неверный курсор');
        return authed(root+'?'+new URLSearchParams({after:input.after||''}));
      }
      if(action==='fileGet')return authed(filePath());
      if(action==='fileVersions')return authed(filePath()+'/versions');
      if(action==='fileLinks')return authed(filePath()+'/links');
      if(action==='fileLocalChoices'){
        await bound();const {listVault}=await import('./evidence-vault.mjs');
        return {choices:(await listVault(input.localProfileId)).filter(x=>x.kind==='file')};
      }
      if(action==='fileUpload'||action==='fileUpdateContent'){
        await bound();const {verifyVaultFile}=await import('./evidence-vault.mjs');
        const {meta,blob}=await verifyVaultFile(input.vaultId,input.localProfileId);
        const visibility=input.visibility==='team'?'team':'private';
        const fileMeta={name:meta.name,title:input.title??meta.title,note:input.note??meta.note,visibility};
        if(action==='fileUpdateContent'){
          if(!Number.isSafeInteger(input.baseVersion)||input.baseVersion<1)throw Error('Неверная версия файла');
          return fileBinary(filePath()+'/versions',{method:'PUT',blob,meta:fileMeta,baseVersion:input.baseVersion,sha256:meta.sha256});
        }
        return fileBinary(root,{method:'POST',blob,meta:fileMeta,sha256:meta.sha256});
      }
      if(action==='fileImportLocal'){
        await bound();
        const row=(await authed(filePath())).file;
        const ver=input.version;
        if(ver!==undefined&&(!Number.isSafeInteger(ver)||ver<1||ver>100))throw Error('Неверная версия файла');
        const versions=ver?(await authed(filePath()+'/versions')).versions:null;
        const selected=ver?versions?.find(v=>v.version===ver):row;
        if(!selected)throw Error('Версия не найдена');
        const bin=await fileBinary(filePath()+(ver?'/versions/'+ver:'/content'));
        if(bin.sha256!==selected.sha256||bin.mime!==selected.mime||bin.bytes.byteLength!==selected.size)throw Error('Метаданные облачного файла не совпадают с содержимым');
        const {addVaultFile,validateFileSignature}=await import('./evidence-vault.mjs');
        validateFileSignature(bin.bytes.slice(0,64),bin.mime);
        const file=new Blob([bin.bytes],{type:bin.mime});file.name=selected.name;
        const added=await addVaultFile(input.localProfileId,file,{title:selected.title,note:selected.note});
        return {imported:true,record:added};
      }
      if(action==='fileMeta')return authed(filePath(),{method:'PATCH',body:{baseVersion:input.baseVersion,name:input.name,title:input.title,note:input.note,visibility:input.visibility}});
      if(action==='fileDelete')return authed(filePath(),{method:'DELETE',body:{baseVersion:input.baseVersion}});
      if(action==='fileLinkCreate')return authed(filePath()+'/links',{method:'POST',body:{targetType:input.targetType,targetKind:input.targetKind,targetId:input.targetId}});
      if(action==='fileLinkDelete'){
        if(!uuid(input.linkId))throw Error('Некорректная ссылка вложения');
        return authed(filePath()+'/links/'+input.linkId,{method:'DELETE',body:{}});
      }
      throw Error('Неизвестная файловая операция');
    }
    if(action.startsWith('knowledge')){
      const root=cloudProfilePath()+'/knowledge';
      const itemId=input.itemId;
      const itemPath=()=>{if(!uuid(itemId))throw Error('Некорректный идентификатор материала');return root+'/'+itemId;};
      if(action.startsWith('knowledgeCollection')){
        const collectionRoot=root+'/collections';
        const collectionPath=()=>{if(!uuid(input.collectionId))throw Error('Некорректная коллекция');return collectionRoot+'/'+input.collectionId;};
        if(action==='knowledgeCollections')return authed(collectionRoot);
        if(action==='knowledgeCollectionCreate')return authed(collectionRoot,{method:'POST',body:{title:input.title,notes:input.notes}});
        if(action==='knowledgeCollectionGet')return authed(collectionPath());
        if(action==='knowledgeCollectionUpdate')return authed(collectionPath(),{method:'PATCH',body:{title:input.title,notes:input.notes,baseVersion:input.baseVersion}});
        if(action==='knowledgeCollectionDelete')return authed(collectionPath(),{method:'DELETE',body:{baseVersion:input.baseVersion}});
        if(action==='knowledgeCollectionAdd')return authed(collectionPath()+'/items',{method:'POST',body:{itemId:input.itemId,baseVersion:input.baseVersion}});
        if(action==='knowledgeCollectionRemove'){
          if(!uuid(input.itemId))throw Error('Некорректный материал');
          return authed(collectionPath()+'/items/'+input.itemId,{method:'DELETE',body:{baseVersion:input.baseVersion}});
        }
        throw Error('Неизвестная операция коллекции');
      }
      if(action==='knowledgeList'){
        if(input.kind&&!['note','law','forum-template','government-template','document-template'].includes(input.kind)||typeof (input.q??'')!=='string'||(input.q??'').length>80||typeof (input.after??'')!=='string'||(input.after??'').length>40||!['all','published','review'].includes(input.scope||'all'))throw Error('Некорректный фильтр материалов');
        return authed(root+'?'+new URLSearchParams({kind:input.kind??'',q:input.q??'',after:input.after??'',scope:input.scope??'all'}));
      }
      if(action==='knowledgeGet')return authed(itemPath());
      if(action==='knowledgeHistory')return authed(itemPath()+'/revisions');
      if(action==='knowledgeEvents')return authed(itemPath()+'/events');
      if(action==='knowledgeImport'){
        const localId=input.localProfileId;
        const live=await execute('cloudBindings',{teamId});
        if(typeof localId!=='string'||live.bindings[localId]!==input.cloudProfileId)throw Error('Локальный RP-профиль не привязан к выбранному облачному');
        const key=sharedSourceStorageKey(input.sourceKind,input.sourceId);
        const raw=await read(key);
        if(!raw)throw Error('Локальная запись не найдена');
        const snapshot=sharedSourceSnapshot(input.sourceKind,raw,localId);
        return authed(root,{method:'POST',body:snapshot});
      }
      if(action==='knowledgeCreate')return authed(root,{method:'POST',body:{kind:input.kind,title:input.title,category:input.category,body:input.body}});
      if(action==='knowledgeEdit')return authed(itemPath(),{method:'PATCH',body:{baseRevision:input.baseRevision,title:input.title,category:input.category,body:input.body}});
      if(['knowledgeSubmit','knowledgeReview','knowledgePublish','knowledgeRestore','knowledgeArchive'].includes(action)){
        const operation={knowledgeSubmit:'submit',knowledgeReview:'review',knowledgePublish:'publish',knowledgeRestore:'restore',knowledgeArchive:'archive'}[action];
        return authed(itemPath()+'/'+operation,{method:'POST',body:{baseRevision:input.baseRevision,decision:input.decision,note:input.note,targetRevision:input.targetRevision}});
      }
      throw Error('Неизвестная операция с общим материалом');
    }
    if(action.startsWith('tactical')){
      const root=cloudProfilePath()+'/tactical';
      const kinds=['map','plan','airdrop_point','airdrop_event','territory','territory_event'];
      const checkEntry=()=>{
        if(!kinds.includes(input.kind)||typeof input.id!=='string'||!/^[\w-]{8,120}$/.test(input.id))throw Error('Некорректная тактическая запись');
        if(input.kind==='map'&&input.id!=='map-'+input.cloudProfileId)throw Error('Неверный идентификатор карты');
      };
      const recordPath=()=>{checkEntry();return root+'/'+input.kind+'/'+input.id;};
      const bound=async()=>{
        if(typeof input.localProfileId!=='string'||!/^[\w-]{8,120}$/.test(input.localProfileId))throw Error('Некорректный локальный профиль');
        const bindings=await execute('cloudBindings',{teamId});
        const cloud=bindings.profiles.find(p=>p.id===input.cloudProfileId);
        const local=(await read('rpNexusStateV1'))?.profiles?.find(p=>p.id===input.localProfileId);
        if(!local||!cloud||bindings.bindings[local.id]!==cloud.id||local.project!==cloud.project||local.server!==cloud.server)throw Error('Локальный и облачный RP-профили не совпадают');
      };
      if(action==='tacticalList'){
        if(input.after&&!/^(?:map|plan|airdrop_point|airdrop_event|territory|territory_event):[\w-]{8,120}$/.test(input.after))throw Error('Неверный курсор');
        return authed(root+'?'+new URLSearchParams({after:input.after||''}));
      }
      if(action==='tacticalChanges'){
        const after=input.after??0;
        if(!Number.isSafeInteger(after)||after<0)throw Error('Неверный курсор истории');
        return authed(root+'/changes?after='+after+'&limit=100');
      }
      if(action==='tacticalLocalChoices'){await bound();return {choices:await localTacticalChoices(input.localProfileId)};}
      if(action==='tacticalGet')return authed(recordPath());
      if(action==='tacticalPublishLocal'){
        checkEntry();await bound();
        if(!Number.isSafeInteger(input.baseVersion)||input.baseVersion<0)throw Error('Неверная версия');
        const local=await localTacticalRecord(input.localProfileId,input.kind,input.kind==='map'?'map-'+input.localProfileId:input.id);
        if(!local)throw Error('Локальная запись отсутствует');
        const normalized=tacticalRecordForProfile(input.kind,local,input.cloudProfileId);
        if(input.kind==='map'){
          const {getTacticalMap}=await import('./tactical-map-store.mjs');
          const image=await getTacticalMap(input.localProfileId);
          await tacticalBinary(root+'/image/'+image.meta.sha256,{method:'PUT',blob:image.blob,mime:image.meta.mime});
        }
        return authed(recordPath(),{method:'PUT',body:{operationId:crypto.randomUUID(),baseVersion:input.baseVersion,record:normalized}});
      }
      if(action==='tacticalEdit'){
        checkEntry();
        if(!Number.isSafeInteger(input.baseVersion)||input.baseVersion<1||typeof input.operation!=='string'||!input.fields||typeof input.fields!=='object'||Array.isArray(input.fields))throw Error('Неверная редакция или действие');
        const current=(await authed(recordPath())).entry;
        if(current.version!==input.baseVersion)throw Error('Конфликт редакций: обновите данные, прежде чем сохранять изменения');
        const next=editSharedTacticalRecord(input.kind,current.record,input.operation,input.fields);
        return authed(recordPath(),{method:'PUT',body:{operationId:crypto.randomUUID(),baseVersion:input.baseVersion,record:next}});
      }
      if(action==='tacticalDelete'){
        checkEntry();
        if(!Number.isSafeInteger(input.baseVersion)||input.baseVersion<1)throw Error('Неверная редакция');
        return authed(recordPath(),{method:'DELETE',body:{operationId:crypto.randomUUID(),baseVersion:input.baseVersion}});
      }
      if(action==='tacticalImportRemote'){
        checkEntry();await bound();
        const remote=(await authed(recordPath())).entry;
        let bytes=null;
        if(input.kind==='map')bytes=await tacticalBinary(root+'/image/'+remote.record.sha256);
        return applyTacticalCloudRecord(input.localProfileId,input.kind,remote.record,bytes,{overwriteMap:input.overwriteMap===true});
      }
      throw Error('Неизвестная тактическая операция');
    }
    if(action==='cloudDirectory'){
      const allowed=['family','organization','participant','asset','product'];
      if(!allowed.includes(input.kind)||typeof (input.q??'')!=='string'||(input.q??'').length>80||typeof (input.after??'')!=='string'||(input.after??'').length>128)throw Error('Некорректные параметры общего справочника');
      const query=new URLSearchParams({kind:input.kind,q:input.q??'',after:input.after??'',limit:'30'});
      return authed(cloudProfilePath()+'/directory?'+query);
    }
    if(action==='cloudRecords'){
      const kind=input.kind?('?kind='+encodeURIComponent(input.kind)+(input.after?'&after='+encodeURIComponent(input.after):'')):(input.after?'?after='+encodeURIComponent(input.after):'');
      return authed(cloudProfilePath()+'/records'+kind);
    }
    if(action==='cloudImport'){
      if(!Array.isArray(input.records)||input.records.length<1||input.records.length>20)throw Error('Выберите до 20 записей за запрос');
      const live=await execute('cloudBindings',{teamId});
      if(!input.records.every(item=>item&&['family','organization','product'].includes(item.kind)&&item.record&&live.bindings[item.record.profileId]===input.cloudProfileId))throw Error('Записи не принадлежат привязанному локальному RP-профилю');
      return authed(cloudProfilePath()+'/records',{method:'POST',body:{records:input.records}});
    }
    if(action==='teams')return authed('/v1/teams');
    if(action==='teamCreate')return authed('/v1/teams',{method:'POST',body:{name:input.name}});
    if(action==='teamDetail')return authed(teamPath());
    if(action==='teamMembers')return authed(teamPath()+'/members');
    if(action==='teamInvitations')return authed(teamPath()+'/invitations');
    if(action==='teamActivity')return authed(teamPath()+'/activity');
    if(action==='teamAudit')return authed(teamPath()+'/audit');
    if(action==='teamNotifications')return authed(teamPath()+'/notifications');
    if(action==='teamNotificationRead'){
      if(!Number.isSafeInteger(input.seq)||input.seq<1)throw Error('Неверное уведомление');
      return authed(teamPath()+'/notifications/'+input.seq+'/read',{method:'POST'});
    }
    if(action==='teamInvite')return authed(teamPath()+'/invitations',{method:'POST',body:{role:input.role,targetUsername:input.targetUsername}});
    if(action==='teamAccept')return authed('/v1/teams/invitations/accept',{method:'POST',body:{token:input.token}});
    if(action==='teamInviteRevoke'){
      if(typeof input.invitationId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input.invitationId))throw Error('Некорректное приглашение');
      return authed(teamPath()+'/invitations/'+input.invitationId,{method:'DELETE'});
    }
    if(action==='teamMemberRole')return authed(memberPath(),{method:'PATCH',body:{role:input.role}});
    if(action==='teamMemberRemove')return authed(memberPath(),{method:'DELETE'});
    if(action==='teamTransfer')return authed(teamPath()+'/transfer',{method:'POST',body:{accountId:input.accountId}});
    if(action==='teamLeave')return authed(teamPath()+'/leave',{method:'POST'});
    if(action==='teamDelete')return authed(teamPath(),{method:'DELETE'});
    if(action==='sessions')return authed('/v1/auth/sessions');
    if(action==='revoke'){
      if(typeof input.id!=='string'||!/^[0-9a-f-]{36}$/.test(input.id))throw Error('Некорректный идентификатор сессии');
      const result=await authed('/v1/auth/sessions/'+input.id,{method:'DELETE'});
      if(result.current)await clear();return result;
    }
    if(action==='logout'||action==='logoutAll'){
      await authed(action==='logout'?'/v1/auth/logout':'/v1/auth/logout-all',{method:'POST'});
      await clear();return {ok:true};
    }
    if(action==='forgetLocal'){await clear();return {ok:true,warning:'Токен удалён локально. Удалённая сессия не отозвана.'};}
    throw Error('Неизвестное действие Cloud Identity');
  }
  return {handle:(action,input)=>enqueue(()=>execute(action,input)),cloudEndpoint};
}
