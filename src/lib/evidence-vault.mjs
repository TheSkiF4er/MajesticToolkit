/** Evidence Vault 2.0: local extension-origin IndexedDB, no remote uploads. */
export const VAULT_DB = 'majestictoolkit-evidence-v1';
export const VAULT_LIMITS = Object.freeze({itemsPerProfile:250, fileBytes:32*1024*1024, totalBytes:256*1024*1024});
const ID=/^[\w-]{8,120}$/;
const MIME=Object.freeze({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','application/pdf':'pdf','text/plain':'txt','video/mp4':'mp4','video/webm':'webm','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx'});
const hasOwn=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
function requireId(x,field='ID'){if(typeof x!=='string'||!ID.test(x))throw Error(`${field}: неверное значение`);return x;}
function safeText(x,label,length,optional=false){if(typeof x!=='string'||x.length>length||(!optional&&!x.trim()))throw Error(`${label}: неверное значение`);return x.trim();}
function safeUrl(x){let url;try{url=new URL(x);}catch{throw Error('Неверная ссылка');}if(url.protocol!=='https:'||url.username||url.password||url.port||url.hostname.endsWith('.'))throw Error('Только HTTPS без учётных данных');url.hash='';if(url.href.length>2048)throw Error('Ссылка слишком длинная');return url.href;}
const iso=()=>new Date().toISOString();
export function cleanVaultMetadata(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Некорректная запись хранилища');
 const kind=input.kind;
 if(!['link','file'].includes(kind))throw Error('Неизвестный вид доказательства');
 const value={id:requireId(input.id),profileId:requireId(input.profileId,'Профиль'),kind,title:safeText(input.title,'Название',180),note:safeText(input.note??'','Комментарий',1000,true),createdAt:input.createdAt};
 if(typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))throw Error('Некорректная дата');
 if(kind==='link'){
   value.url=safeUrl(input.url);
   value.seconds=input.seconds==null?null:Number(input.seconds);
   if(value.seconds!==null&&(!Number.isInteger(value.seconds)||value.seconds<0||value.seconds>86400))throw Error('Неверный таймкод');
 }else{
   value.name=safeText(input.name,'Имя файла',180);
   value.mime=input.mime;value.size=input.size;value.sha256=input.sha256;
   if(!hasOwn(MIME,value.mime)||!Number.isSafeInteger(value.size)||value.size<1||value.size>VAULT_LIMITS.fileBytes||typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.sha256))throw Error('Повреждены метаданные файла');
 }
 return value;
}
function checkSignature(bytes,mime){
 const starts=(...sig)=>sig.every((v,i)=>bytes[i]===v);
 if(mime==='image/png')return starts(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a);
 if(mime==='image/jpeg')return starts(0xff,0xd8,0xff);
 if(mime==='image/gif')return starts(0x47,0x49,0x46,0x38)&&[0x37,0x39].includes(bytes[4]);
 if(mime==='image/webp')return String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(mime==='application/pdf')return String.fromCharCode(...bytes.slice(0,5))==='%PDF-';
 if(mime==='video/mp4')return String.fromCharCode(...bytes.slice(4,8))==='ftyp';
 if(mime==='video/webm')return starts(0x1a,0x45,0xdf,0xa3);
 if(mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'||mime==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')return starts(0x50,0x4b,0x03,0x04);
 if(mime==='text/plain')return !bytes.includes(0)&&!bytes.includes(0x1b);
 return false;
}
export function validateFileSignature(bytes,mime){if(!hasOwn(MIME,mime)||!checkSignature(bytes,mime))throw Error('Тип файла не соответствует содержимому или не поддерживается');return true;}
export async function sha256(buffer){if(!globalThis.crypto?.subtle?.digest)throw Error('Для SHA-256 требуется защищённый контекст расширения');const hash=await crypto.subtle.digest('SHA-256',buffer);return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');}
export function openVault(){
 if(typeof indexedDB==='undefined')return Promise.reject(Error('В этом браузере IndexedDB недоступен'));
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(VAULT_DB,1);
  req.onupgradeneeded=()=>{const db=req.result;const store=db.createObjectStore('entries',{keyPath:'id'});store.createIndex('profileId','profileId',{unique:false});};
  req.onerror=()=>reject(req.error??Error('Не удалось открыть хранилище'));
  req.onblocked=()=>reject(Error('Хранилище заблокировано другой вкладкой'));
  req.onsuccess=()=>resolve(req.result);
 });
}
async function perform(mode,operation){const db=await openVault();try{return await new Promise((resolve,reject)=>{
 const tx=db.transaction('entries',mode),store=tx.objectStore('entries');let result;
 try{operation(store,tx,v=>{result=v;});}catch(error){try{tx.abort();}catch{}reject(error);return;}
 tx.oncomplete=()=>resolve(result);
 tx.onerror=()=>reject(tx.error??Error('Ошибка IndexedDB'));
 tx.onabort=()=>reject(tx.error??Error('Операция отменена'));
 });}finally{db.close();}}
export async function listVault(profileId){requireId(profileId,'Профиль');const records=await perform('readonly',(s,tx,done)=>{const req=s.index('profileId').getAll(profileId);req.onsuccess=()=>done(req.result);});return records.map(r=>cleanVaultMetadata(r)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export async function getVaultRecord(id){requireId(id);const value=await perform('readonly',(s,tx,done)=>{const req=s.get(id);req.onsuccess=()=>done(req.result);});if(!value)throw Error('Материал не найден в локальном хранилище');return {meta:cleanVaultMetadata(value),blob:value.kind==='file'?value.blob:null};}
async function insert(record){const next=cleanVaultMetadata(record);const existing=await listVault(next.profileId);// Avoid duplicate files/links; keep the first stable ID so case links stay valid.
 const duplicate=next.kind==='file'?existing.find(x=>x.kind==='file'&&x.sha256===next.sha256&&x.size===next.size):existing.find(x=>x.kind==='link'&&x.url===next.url&&x.seconds===next.seconds&&x.title===next.title);
 if(duplicate)return duplicate;
 if(existing.length>=VAULT_LIMITS.itemsPerProfile)throw Error('Лимит доказательств профиля');
 await perform('readwrite',(s)=>{s.add(record);});return next;
}
export async function addVaultLink(profileId,input){requireId(profileId,'Профиль');return insert({id:crypto.randomUUID(),profileId,kind:'link',title:input.title,note:input.note??'',url:input.url,seconds:input.seconds??null,createdAt:iso()});}
export async function addVaultFile(profileId,file,{title,note=''}={}){
 requireId(profileId,'Профиль');if(!(file instanceof Blob)||!Number.isSafeInteger(file.size)||file.size<1||file.size>VAULT_LIMITS.fileBytes)throw Error('Размер файла: от 1 байта до 32 МиБ');
 const name=safeText(file.name||'attachment','Имя файла',180),mime=(!file.type||file.type==='application/octet-stream')?({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',pdf:'application/pdf',txt:'text/plain',mp4:'video/mp4',webm:'video/webm',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}[name.split('.').at(-1)?.toLowerCase()]||file.type):file.type;
 if(!hasOwn(MIME,mime))throw Error('Неподдерживаемый формат файла');
 const buffer=await file.arrayBuffer();validateFileSignature(new Uint8Array(buffer.slice(0,64)),mime);
 const digest=await sha256(buffer),safeName=title??name;
 const entries=await listVault(profileId);const duplicate=entries.find(e=>e.kind==='file'&&e.sha256===digest&&e.size===file.size);if(duplicate)return duplicate;
 const db=await openVault();let total=0;try{await new Promise((resolve,reject)=>{const tx=db.transaction('entries','readonly');const req=tx.objectStore('entries').openCursor();req.onsuccess=()=>{const cursor=req.result;if(cursor){total+=cursor.value.kind==='file'?cursor.value.size:0;cursor.continue();}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}
 if(total+file.size>VAULT_LIMITS.totalBytes)throw Error('Лимит файлов хранилища 256 МиБ');
 const blob=new Blob([buffer],{type:mime});return insert({id:crypto.randomUUID(),profileId,kind:'file',title:safeName,note,name,mime,size:file.size,sha256:digest,createdAt:iso(),blob});
}
export async function editVaultMetadata(id,profileId,{title,note}){
 requireId(profileId,'Профиль');requireId(id);
 const safeTitle=safeText(title,'Название',180),safeNote=safeText(note??'','Комментарий',1000,true);
 return perform('readwrite',(store,tx,done)=>{
  const req=store.get(id);req.onsuccess=()=>{
   const row=req.result;if(!row||row.profileId!==profileId){tx.abort();return;}
   const next={...row,title:safeTitle,note:safeNote};store.put(next);done(cleanVaultMetadata(next));
  };
 });
}
export async function verifyVaultFile(id,profileId){const {meta,blob}=await getVaultRecord(id);if(meta.profileId!==profileId)throw Error('Материал другого профиля');if(meta.kind!=='file')throw Error('Материал не является файлом');if(!(blob instanceof Blob)||blob.size!==meta.size)throw Error('Файл отсутствует или повреждён');const buf=await blob.arrayBuffer();validateFileSignature(new Uint8Array(buf.slice(0,64)),meta.mime);if(await sha256(buf)!==meta.sha256)throw Error('SHA-256 не совпадает: файл повреждён');return {meta,blob};}
export async function downloadVaultFile(id,profileId){const {meta,blob}=await verifyVaultFile(id,profileId);const url=URL.createObjectURL(blob);try{const a=document.createElement('a');a.href=url;a.download=meta.name;document.body.append(a);a.click();a.remove();}finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}return meta;}
export async function deleteVaultRecord(id,profileId){
 const record=await getVaultRecord(id);if(record.meta.profileId!==profileId)throw Error('Материал другого профиля');
 const {listCases}=await import('./complaints-store.mjs');const cases=await listCases();
 if(cases.some(c=>c.evidence.some(e=>e.vaultId===id)))throw Error('Материал прикреплён к жалобе. Сначала удалите связь из дела.');
 const {exportRegistryData}=await import('./punishment-registry-store.mjs');const {loadState}=await import('./state.mjs');
 const registry=await exportRegistryData((await loadState()).profiles);
 if(registry.records.some(r=>r.evidence?.some(e=>e.vaultId===id)))throw Error('Материал присутствует в зарегистрированном решении и не может быть удалён');
 await perform('readwrite',(s)=>{s.delete(id);});
}

/** Remove files and links only after the profile deletion has committed. */
export async function clearVaultProfile(profileId){
 requireId(profileId,'Профиль');await perform('readwrite',(store)=>{const cursor=store.index('profileId').openCursor(profileId);cursor.onsuccess=()=>{if(cursor.result){cursor.result.delete();cursor.result.continue();}};});
}
