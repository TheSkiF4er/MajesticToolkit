/** User-triggered local snapshots of opened, accessible forum and Fletcher Wiki pages. */
import {api} from './browser.mjs';
export const SOURCE_KEY='majesticToolkitSourceLibraryV154';
export const SOURCE_LIMIT=120;
const hosts=new Set(['forum.majestic-rp.ru','forum.russia.online','fletcher-wiki.com','www.fletcher-wiki.com']);
export function sourceKind(url){
 let u;try{u=new URL(url);}catch{throw Error('Неверный адрес страницы');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!hosts.has(u.hostname.toLowerCase()))throw Error('Допускаются только официальные RP-форумы и Fletcher Wiki');
 return u.hostname.includes('fletcher-wiki.com')?'fletcher':'forum';
}
export function validateSource(row){
 if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Некорректная статья');
 const kind=sourceKind(row.url);const url=new URL(row.url);
 if(row.kind!==kind||!/^[-\w]{8,128}$/.test(row.id)||!/^[-\w]{8,128}$/.test(row.profileId))throw Error('Некорректный ID или источник');
 if(typeof row.title!=='string'||!row.title.trim()||row.title.length>240||typeof row.body!=='string'||row.body.length<30||row.body.length>16000)throw Error('Недопустимый текст статьи');
 if(!Number.isFinite(Date.parse(row.capturedAt)))throw Error('Дата сохранения не распознана');
 url.hash='';url.username='';url.password='';
 return {id:row.id,profileId:row.profileId,kind,url:url.href,title:row.title.trim(),body:row.body.trim(),capturedAt:row.capturedAt};
}
export function validateSources(input){if(!Array.isArray(input)||input.length>SOURCE_LIMIT)throw Error('Превышен лимит сохранённых статей');const all=input.map(validateSource);if(new Set(all.map(x=>x.profileId+'|'+x.url)).size!==all.length)throw Error('Повторные статьи');return all;}
let queue=Promise.resolve();
const serial=fn=>{const r=queue.then(fn);queue=r.catch(()=>{});return r;};
export async function listSources(){const value=(await api.storage.local.get(SOURCE_KEY))[SOURCE_KEY];return value===undefined?[]:validateSources(value);}
export async function saveSource(input){return serial(async()=>{
 const rows=await listSources(),same=rows.find(x=>x.profileId===input.profileId&&x.url===input.url);
 const value=validateSource({...input,id:same?.id??crypto.randomUUID(),capturedAt:new Date().toISOString()});
 const next=[value,...rows.filter(x=>x.id!==value.id)].slice(0,SOURCE_LIMIT);
 await api.storage.local.set({[SOURCE_KEY]:next});return value;
});}
export async function removeSource(id,profileId){return serial(async()=>{
 const all=await listSources();if(!all.some(x=>x.id===id&&x.profileId===profileId))throw Error('Статья не найдена');
 await api.storage.local.set({[SOURCE_KEY]:all.filter(x=>x.id!==id||x.profileId!==profileId)});
});}

export function replaceSources(value){return serial(async()=>{const rows=validateSources(value);await api.storage.local.set({[SOURCE_KEY]:rows});return rows;});}
