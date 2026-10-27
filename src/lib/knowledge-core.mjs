/** MajesticToolkit 1.3.0 local knowledge graph. No remote data collection. */
import {googleFileId} from './integration-core.mjs';
export const KNOWLEDGE_KEY='majesticToolkitKnowledgeV13';
export const KNOWLEDGE_LIMITS=Object.freeze({resources:300,relations:2500});
export const KNOWLEDGE_KINDS=Object.freeze(['document','document-template','law','law-memo','government-template','forum-template','external','google-doc','google-sheet']);
export const KNOWLEDGE_LABELS=Object.freeze({'document':'Документ','document-template':'Шаблон документа',law:'Закон','law-memo':'Памятка','government-template':'Процессуальный шаблон','forum-template':'Шаблон форума',external:'Fletcher Wiki / Docossum','google-doc':'Google Docs','google-sheet':'Google Sheets'});
export const KNOWLEDGE_PORTALS=Object.freeze({
 majestic:[{title:'Fletcher Wiki — Majestic RP',url:'https://www.fletcher-wiki.com/majestic'},{title:'Docossum — законодательство',url:'https://docossum.com/'}],
 'russia-online':[{title:'Fletcher Wiki — Russia Online',url:'https://www.fletcher-wiki.com/russiaonline'},{title:'Docossum — законодательство',url:'https://docossum.com/'}],
 other:[{title:'Docossum — законодательство',url:'https://docossum.com/'}]
});
const identifier=v=>{if(typeof v!=='string'||!/^[\w-]{8,128}$/.test(v))throw Error('Неверный идентификатор');return v;};
const text=(s,max,required=true)=>{if(typeof s!=='string'||s.trim().length>max||(required&&!s.trim()))throw Error('Некорректный текст записи');return s.trim();};
export const emptyKnowledge=()=>({version:1,resources:[],relations:[]});
export function googleResourceUrl(kind,id){const file=googleFileId(id);if(kind==='google-doc')return `https://docs.google.com/document/d/${file}/edit`;if(kind==='google-sheet')return `https://docs.google.com/spreadsheets/d/${file}/edit`;throw Error('Неверный вид файла Google');}
export function googleResourceId(kind,urlOrId){const input=text(urlOrId,1000);if(/^[\w-]{10,180}$/.test(input))return googleFileId(input);let u;try{u=new URL(input);}catch{throw Error('Укажите ссылку Google Docs / Sheets или ID');}if(u.protocol!=='https:'||u.hostname!=='docs.google.com'||u.username||u.password||u.port)throw Error('Нужна HTTPS-ссылка Google Docs/Sheets');const type=kind==='google-doc'?'document':'spreadsheets';const m=new RegExp(`^/${type}/d/([\\w-]{10,180})(?:/|$)`).exec(u.pathname);if(!m)throw Error('Неверная ссылка Google');return googleFileId(m[1]);}
export function validateKnowledge(raw,profileIds){if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==1||!Array.isArray(raw.resources)||!Array.isArray(raw.relations)||raw.resources.length>KNOWLEDGE_LIMITS.resources||raw.relations.length>KNOWLEDGE_LIMITS.relations)throw Error('Некорректный формат Центра знаний');
 const profiles=profileIds?new Set(profileIds):null,rs=new Set(),rels=new Set();
 const resources=raw.resources.map(r=>{if(!r||typeof r!=='object'||!['google-doc','google-sheet'].includes(r.kind))throw Error('Неверный Google-шаблон');const id=identifier(r.id),profileId=identifier(r.profileId);if(profiles&&!profiles.has(profileId))throw Error('Google-шаблон относится к отсутствующему профилю');if(rs.has(id))throw Error('Дублирующийся ресурс');rs.add(id);const fileId=googleFileId(r.fileId);return{id,profileId,kind:r.kind,fileId,title:text(r.title,180),notes:text(r.notes??'',1500,false),createdAt:text(r.createdAt,40)};});
 const relations=raw.relations.map(r=>{if(!r||typeof r!=='object')throw Error('Неверная связь');const id=identifier(r.id),profileId=identifier(r.profileId);if(rels.has(id))throw Error('Дублирующийся ID связи');rels.add(id);if(profiles&&!profiles.has(profileId))throw Error('Связь с отсутствующим профилем');const end=x=>{if(!x||!KNOWLEDGE_KINDS.includes(x.kind))throw Error('Недопустимый тип связанного объекта');return {kind:x.kind,id:identifier(x.id)};};const from=end(r.from),to=end(r.to);if(from.kind===to.kind&&from.id===to.id)throw Error('Нельзя связать запись с собой');return{id,profileId,from,to,label:text(r.label,120),notes:text(r.notes??'',1500,false),createdAt:text(r.createdAt,40)};});
 const googleRefs=new Map(resources.map(r=>[`${r.kind}:${r.id}`,r.profileId]));
 for(const r of relations)for(const ref of [r.from,r.to])if(ref.kind==='google-doc'||ref.kind==='google-sheet'){
   if(googleRefs.get(`${ref.kind}:${ref.id}`)!==r.profileId)throw Error('Связь с Google-файлом другого профиля или удалённым файлом');
 }
 return {version:1,resources,relations};
}
export function sourceNodes(profileId,{documents=[],laws=[],government=[],forum=[],links=[],resources=[],sources=[]}={}){
 const nodes=[];const push=(kind,row,title,extra={})=>{if(row?.profileId&&row.profileId!==profileId&&row.profileId!=='*')return;nodes.push({kind,id:row.id,title:String(title||'Без названия'),profileId:row.profileId??'*',...extra});};
 for(const r of documents){push(r.type==='template'?'document-template':'document',r,r.type==='template'?r.title:r.versions?.at(-1)?.title);}
 for(const r of laws){if(r.type==='book')push('law',r,r.title,{url:r.sourceUrl||''});else if(r.type==='memo')push('law-memo',r,r.title);}
 for(const r of government){if(r.type==='template')push('government-template',r,r.title);}
 for(const r of forum)push('forum-template',r,r.label);
 for(const r of links)push('external',r,r.title,{url:r.url,description:r.notes||''});
 for(const r of resources)push(r.kind,r,r.title,{url:googleResourceUrl(r.kind,r.fileId),description:r.notes});
 for(const r of sources)push('external',r,r.title,{url:r.url,description:(r.kind==='forum'?'Форум · ':'Fletcher Wiki · ')+r.body});
 return nodes.sort((a,b)=>a.title.localeCompare(b.title,'ru'));
}
export const nodeKey=n=>`${n.kind}:${n.id}`;
export function relatedLinks(relations,node,profileId){const key=nodeKey(node);return relations.filter(r=>r.profileId===profileId&&(nodeKey(r.from)===key||nodeKey(r.to)===key));}
export function visibleKnowledge(data,profileId,nodes,query='',kind='all'){
 const term=String(query).trim().toLocaleLowerCase('ru');const adjacency=new Map();for(const r of data.relations.filter(r=>r.profileId===profileId))for(const key of [nodeKey(r.from),nodeKey(r.to)])adjacency.set(key,(adjacency.get(key)||0)+1);
 return nodes.filter(n=>(kind==='all'||n.kind===kind)&&(!term||(n.title+' '+(n.description||'')+' '+KNOWLEDGE_LABELS[n.kind]).toLocaleLowerCase('ru').includes(term))).map(n=>({...n,links:adjacency.get(nodeKey(n))||0}));
}
export function addKnowledgeResource(current,profileId,{kind,title,googleUrl,notes=''}){const obj=validateKnowledge(current);if(!['google-doc','google-sheet'].includes(kind))throw Error('Укажите Google Docs или Sheets');if(obj.resources.length>=KNOWLEDGE_LIMITS.resources)throw Error('Лимит шаблонов Google');const fileId=googleResourceId(kind,googleUrl);if(obj.resources.some(r=>r.profileId===profileId&&r.kind===kind&&r.fileId===fileId))throw Error('Этот Google-шаблон уже сохранён');const row={id:crypto.randomUUID(),profileId,kind,fileId,title,notes,createdAt:new Date().toISOString()};return validateKnowledge({...obj,resources:[...obj.resources,row]});}
export function addKnowledgeRelation(current,profileId,{from,to,label,notes=''}){const obj=validateKnowledge(current);if(obj.relations.length>=KNOWLEDGE_LIMITS.relations)throw Error('Лимит связей');if(obj.relations.some(r=>r.profileId===profileId&&((nodeKey(r.from)===nodeKey(from)&&nodeKey(r.to)===nodeKey(to))||(nodeKey(r.from)===nodeKey(to)&&nodeKey(r.to)===nodeKey(from)))))throw Error('Связь уже существует');const row={id:crypto.randomUUID(),profileId,from,to,label,notes,createdAt:new Date().toISOString()};return validateKnowledge({...obj,relations:[...obj.relations,row]});}
