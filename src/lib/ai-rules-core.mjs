/** Grounded, user-selected retrieval. No network, state writes, embeddings or inference. */
import {currentRevision,formatSanction} from './rules-core.mjs';
import {sourceDigest} from './source-library.mjs';
export const MAX_RULES_SOURCES=5;
export const MAX_RULES_EXCERPT=1800;
const norm=v=>String(v??'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е');
const words=q=>[...new Set(norm(q).match(/[\p{L}\p{N}]+(?:\.[\p{N}]+)*/gu)||[])].filter(x=>x.length>1).slice(0,18);
const validProfile=p=>p&&typeof p.id==='string'&&typeof p.project==='string'&&typeof p.server==='string';
function score(text,title,code,tokens){const body=norm(text),heading=norm(title),id=norm(code);let score=0;for(const t of tokens){if(id===t)score+=24;else if(id.startsWith(t)&&t.length>2)score+=9;if(heading.includes(t))score+=11;if(body.includes(t))score+=2;}return score;}
function excerpt(text,tokens){const raw=String(text||'');if(raw.length<=MAX_RULES_EXCERPT)return raw;const lower=norm(raw);let first=tokens.map(t=>lower.indexOf(t)).filter(i=>i>=0).sort((a,b)=>a-b)[0]??0;const from=Math.max(0,first-240);return (from?'…':'')+raw.slice(from,from+MAX_RULES_EXCERPT-2)+(raw.length>from+MAX_RULES_EXCERPT-2?'…':'');}
function safeCandidate(kind,id,revisionId,title,sourceUrl,code,verification,capturedAt,body,tokens,bonus=0){
 const points=score(body,title,code,tokens)+bonus;
 return {key:`${kind}:${id}:${revisionId}`,kind,id,revisionId,title,sourceUrl,code,verification,capturedAt,text:excerpt(body,tokens),points};
}
/** Does not silently use other profiles, another server or unreviewed revisions. */
export function findAIRulesSources(profile,query,rules,sources,{includeUnverified=false,includeHistory=false,limit=10}={}){
 if(!validProfile(profile)||typeof query!=='string'||!query.trim()||query.length>5000)throw Error('Некорректный профиль или вопрос');
 if(!Array.isArray(rules)||!Array.isArray(sources))throw Error('Некорректная база источников');
 const tokens=words(query);if(!tokens.length)return [];
 const candidates=[];
 for(const r of rules){if(r.profileId!==profile.id||r.project!==profile.project||r.archived||r.server&&r.server!==profile.server)continue;
  const revs=includeHistory?r.revisions:[currentRevision(r)];
  for(const v of revs){if(!v||!includeUnverified&&v.verification!=='reviewed')continue;
   const sanctions=v.sanctions?.map(formatSanction).join('; ')||'не указаны';
   const body=`${v.code} — ${v.title}\n${v.text}\nУсловия: ${v.conditions||'не указаны'}\nСанкции (допустимые альтернативы): ${sanctions}`;
   const c=safeCandidate('rule',r.id,v.id,`${v.code} — ${v.title}`,v.sourceUrl,v.code,v.verification,v.createdAt,body,tokens, v.aliases?.some(a=>tokens.some(t=>norm(a)===t))?24:0);
   if(c.points>0)candidates.push({...c,historical:v.id!==r.activeRevisionId});
  }
 }
 for(const s of sources){if(s.profileId!==profile.id)continue;
  // Forum source snapshots must belong to the active project's host.
  if(s.kind==='forum'){
   const host=new URL(s.url).hostname;
   if(profile.project==='majestic'&&host!=='forum.majestic-rp.ru'||profile.project==='russia-online'&&host!=='forum.russia.online')continue;
  }
  const revisions=[{id:s.id,title:s.title,body:s.body,capturedAt:s.capturedAt,sha256:s.sha256,historical:false},...(includeHistory?s.revisions.map(r=>({...r,historical:true})):[])];
  for(const v of revisions){const verification=v.historical?'unverified':s.status;if(!includeUnverified&&verification!=='reviewed')continue;
   const c=safeCandidate('source',s.id,v.id,v.title,s.url,'',verification,v.capturedAt,v.body,tokens,0);
   if(c.points>0)candidates.push({...c,historical:v.historical,sha256:v.sha256});
  }
 }
 return candidates.sort((a,b)=>b.points-a.points||a.kind.localeCompare(b.kind)||a.key.localeCompare(b.key)).slice(0,Math.max(1,Math.min(20,limit)));
}
/** Before transmission, verify selection against current storage and current/source historical hashes. */
export async function confirmAIRulesSelection(profile,chosen,rules,sources,{includeUnverified=false}={}){
 if(!validProfile(profile)||!Array.isArray(chosen)||!chosen.length||chosen.length>MAX_RULES_SOURCES)throw Error('Выберите от 1 до 5 источников');
 const keys=new Set();const result=[];
 for(const item of chosen){if(keys.has(item.key))throw Error('Источник выбран повторно');keys.add(item.key);
  let source;
  if(item.kind==='rule'){
   const r=rules.find(r=>r.id===item.id&&r.profileId===profile.id&&r.project===profile.project&&!r.archived&&(!r.server||r.server===profile.server));
   const v=r?.revisions.find(v=>v.id===item.revisionId);if(!v)throw Error('Правило или его редакция больше недоступны');
   const text=`${v.code} — ${v.title}\n${v.text}\nУсловия: ${v.conditions||'не указаны'}\nСанкции (допустимые альтернативы): ${v.sanctions?.map(formatSanction).join('; ')||'не указаны'}`;
   source={id:r.id,revisionId:v.id,title:`${v.code} — ${v.title}`,sourceUrl:v.sourceUrl,code:v.code,verification:v.verification,capturedAt:v.createdAt,body:text};
  }else if(item.kind==='source'){
   const s=sources.find(s=>s.id===item.id&&s.profileId===profile.id);if(!s)throw Error('Статья не найдена');
   if(s.kind==='forum'){const host=new URL(s.url).hostname;if(profile.project==='majestic'&&host!=='forum.majestic-rp.ru'||profile.project==='russia-online'&&host!=='forum.russia.online')throw Error('Источник другого проекта');}
   const v=s.id===item.revisionId?{id:s.id,title:s.title,body:s.body,capturedAt:s.capturedAt,sha256:s.sha256}:s.revisions.find(r=>r.id===item.revisionId);
   if(!v)throw Error('Редакция статьи недоступна');
   if(v.sha256&&await sourceDigest(v.body)!==v.sha256)throw Error('SHA-256 статьи не совпадает');
   source={id:s.id,revisionId:v.id,title:v.title,sourceUrl:s.url,code:'',verification:s.id===v.id?s.status:'unverified',capturedAt:v.capturedAt,body:v.body};
  }else throw Error('Неизвестный тип источника');
  if(!includeUnverified&&source.verification!=='reviewed')throw Error('Источник требует проверки пользователем');
  if(source.title!==item.title||source.sourceUrl!==item.sourceUrl||source.verification!==item.verification||source.capturedAt!==item.capturedAt||!source.body.includes(item.text.replace(/^…|…$/g,'')))throw Error('Источник изменился. Обновите поиск и подтвердите заново.');
  result.push({kind:item.kind,id:source.id,revisionId:source.revisionId,title:source.title,sourceUrl:source.sourceUrl,code:source.code,verification:source.verification,capturedAt:source.capturedAt,text:item.text});
 }
 return result;
}
/** Validated gateway wire shape. No profile, user ID, local note, or full library. */
export function rulesWireSources(sources){if(!Array.isArray(sources)||sources.length<1||sources.length>MAX_RULES_SOURCES)throw Error('Выберите источники');return sources.map((s,i)=>{
 if(!['rule','source'].includes(s.kind)||typeof s.text!=='string'||s.text.length>MAX_RULES_EXCERPT+8||!s.text.trim()||typeof s.title!=='string'||s.title.length>330||typeof s.sourceUrl!=='string'||!s.sourceUrl.startsWith('https://'))throw Error('Некорректный источник AI');
 return {ref:i+1,kind:s.kind,title:s.title,code:s.code||'',revisionId:s.revisionId,verification:s.verification,capturedAt:s.capturedAt,sourceUrl:s.sourceUrl,text:s.text};
 });}
export function markUnsupportedCitations(answer,count){let invalid=false;const text=String(answer).replace(/\[(\d{1,3})\]/g,(full,n)=>{if(Number(n)>=1&&Number(n)<=count)return full;invalid=true;return '[неподтверждённая ссылка]';});return{text,invalid};}
