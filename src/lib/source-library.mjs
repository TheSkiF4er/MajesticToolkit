/** User-initiated, local snapshots of accessible forum / Fletcher Wiki pages. */
import {api} from './browser.mjs';
export const SOURCE_KEY='majesticToolkitSourceLibraryV154';
export const SOURCE_LIMIT=120;
export const SOURCE_REVISION_LIMIT=8;
const hosts=new Set(['forum.majestic-rp.ru','forum.russia.online','fletcher-wiki.com','www.fletcher-wiki.com']);
const idOk=value=>typeof value==='string'&&/^[-\w]{8,128}$/.test(value);
const dateOk=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const hashOk=value=>value===null||typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const field=(value,max,name,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error('Недопустимое поле '+name);return value.trim();};
export function sourceKind(value){let u;try{u=new URL(value);}catch{throw Error('Неверный адрес страницы');}if(u.protocol!=='https:'||u.username||u.password||u.port||!hosts.has(u.hostname.toLowerCase()))throw Error('Допускаются только официальные RP-форумы и Fletcher Wiki');return u.hostname.includes('fletcher-wiki.com')?'fletcher':'forum';}
const revision=row=>{if(!row||typeof row!=='object'||Array.isArray(row)||!idOk(row.id)||!dateOk(row.capturedAt)||!hashOk(row.sha256??null))throw Error('Повреждённая редакция источника');return{id:row.id,title:field(row.title,240,'название',true),body:bodyField(row.body),capturedAt:row.capturedAt,sha256:row.sha256??null};};
const bodyField=value=>{if(typeof value!=='string'||value.trim().length<30||value.length>16000)throw Error('Недопустимый текст статьи');return value.trim();};
export function validateSource(row){
 if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Некорректная статья');
 const kind=sourceKind(row.url),url=new URL(row.url);
 if(url.href.length>1000)throw Error('Слишком длинный адрес источника');
 if(row.kind!==kind||!idOk(row.id)||!idOk(row.profileId)||!dateOk(row.capturedAt))throw Error('Некорректный ID или источник');
 const tags=row.tags??[];
 if(!Array.isArray(tags)||tags.length>12||tags.some(t=>typeof t!=='string'||!t.trim()||t.length>48)||new Set(tags.map(t=>t.trim().toLocaleLowerCase('ru'))).size!==tags.length)throw Error('Некорректные теги источника');
 const status=row.status??'unverified';if(!['unverified','reviewed'].includes(status))throw Error('Недопустимый статус проверки источника');
 if(row.favorite!==undefined&&typeof row.favorite!=='boolean')throw Error('Некорректное избранное');
 if(row.checkedAt!==undefined&&!dateOk(row.checkedAt))throw Error('Некорректная дата проверки статьи');
 if(!hashOk(row.sha256??null))throw Error('Некорректный SHA-256');
 const revisions=row.revisions??[];if(!Array.isArray(revisions)||revisions.length>SOURCE_REVISION_LIMIT)throw Error('Превышен лимит редакций статьи');
 const old=revisions.map(revision);if(new Set(old.map(r=>r.id)).size!==old.length||old.some(r=>r.id===row.id))throw Error('Повторная редакция статьи');
 url.hash='';
 return{id:row.id,profileId:row.profileId,kind,url:url.href,title:field(row.title,240,'название',true),body:bodyField(row.body),capturedAt:row.capturedAt,sha256:row.sha256??null,checkedAt:dateOk(row.checkedAt)?row.checkedAt:row.capturedAt,notes:field(row.notes??'',1500,'заметка'),tags:tags.map(t=>t.trim()),status,favorite:row.favorite??false,revisions:old};
}
export function validateSources(input){
 if(!Array.isArray(input)||input.length>SOURCE_LIMIT)throw Error('Превышен лимит сохранённых статей');
 const all=input.map(validateSource);
 if(new Set(all.map(x=>x.profileId+'|'+x.url)).size!==all.length)throw Error('Повторные статьи');
 if(new Set(all.map(x=>x.id)).size!==all.length)throw Error('Повторный ID статьи');
 return all;
}
export async function sourceDigest(body){const bytes=new TextEncoder().encode(body);const buffer=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');}
export async function verifySourceRevision(row){const value=revision(row);return value.sha256===null||await sourceDigest(value.body)===value.sha256;}
let queue=Promise.resolve();const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
export async function listSources(){const raw=(await api.storage.local.get(SOURCE_KEY))[SOURCE_KEY];return raw===undefined?[]:validateSources(raw);}
export function saveSource(input){return serial(async()=>{
 const url=new URL(input.url);sourceKind(input.url);url.hash='';
 const rows=await listSources(),same=rows.find(s=>s.profileId===input.profileId&&s.url===url.href),now=new Date().toISOString();
 const incoming=validateSource({...input,url:url.href,id:same?.id??crypto.randomUUID(),capturedAt:now});
 const changed=!!same&&(same.body!==incoming.body||same.title!==incoming.title);
 const revisions=changed?[...same.revisions,{id:crypto.randomUUID(),title:same.title,body:same.body,capturedAt:same.capturedAt,sha256:same.sha256??await sourceDigest(same.body)}].slice(-SOURCE_REVISION_LIMIT):same?.revisions??[];
 const saved=validateSource({...incoming,revisions,sha256:await sourceDigest(incoming.body),notes:same?.notes??incoming.notes,tags:same?.tags??incoming.tags,status:changed?'unverified':same?.status??incoming.status,favorite:same?.favorite??incoming.favorite,checkedAt:now,capturedAt:changed||!same?now:same.capturedAt});
 const next=[saved,...rows.filter(r=>r.id!==saved.id)];if(next.length>SOURCE_LIMIT)throw Error('Достигнут лимит библиотеки. Удалите лишние статьи.');
 await api.storage.local.set({[SOURCE_KEY]:validateSources(next)});return saved;
});}
export function updateSourceMetadata(id,profileId,patch){return serial(async()=>{
 const rows=await listSources(),index=rows.findIndex(r=>r.id===id&&r.profileId===profileId);if(index<0)throw Error('Статья не найдена');
 if(!patch||typeof patch!=='object'||Object.keys(patch).some(k=>!['notes','tags','status','favorite'].includes(k)))throw Error('Недопустимые поля статьи');
 const updated=validateSource({...rows[index],...patch});rows[index]=updated;await api.storage.local.set({[SOURCE_KEY]:validateSources(rows)});return updated;
});}
export function restoreSourceRevision(id,profileId,revisionId){return serial(async()=>{
 const rows=await listSources(),index=rows.findIndex(r=>r.id===id&&r.profileId===profileId);if(index<0)throw Error('Статья не найдена');const current=rows[index],old=current.revisions.find(r=>r.id===revisionId);if(!old)throw Error('Редакция не найдена');
 if(!await verifySourceRevision(old))throw Error('Контрольная сумма старой редакции не совпадает');
 if(current.sha256&&await sourceDigest(current.body)!==current.sha256)throw Error('Контрольная сумма текущей редакции не совпадает');
 const now=new Date().toISOString();const revised=validateSource({...current,title:old.title,body:old.body,capturedAt:now,checkedAt:now,sha256:await sourceDigest(old.body),status:'unverified',revisions:[...current.revisions,{id:crypto.randomUUID(),title:current.title,body:current.body,capturedAt:current.capturedAt,sha256:current.sha256??await sourceDigest(current.body)}].slice(-SOURCE_REVISION_LIMIT)});
 rows[index]=revised;await api.storage.local.set({[SOURCE_KEY]:validateSources(rows)});return revised;
});}
export function removeSource(id,profileId){return serial(async()=>{const rows=await listSources();if(!rows.some(r=>r.id===id&&r.profileId===profileId))throw Error('Статья не найдена');await api.storage.local.set({[SOURCE_KEY]:rows.filter(r=>r.id!==id||r.profileId!==profileId)});});}
export function replaceSources(input){return serial(async()=>{const rows=validateSources(input);await api.storage.local.set({[SOURCE_KEY]:rows});return rows;});}
