/** Evidence & Knowledge Graph: explicit, local, profile-scoped user assertions. */
const sourceDigest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
export const GRAPH_TYPES=Object.freeze({quote:'Цитата источника',case:'Жалоба',evidence:'Доказательство',event:'Событие',rule:'Правило',decision:'Решение'});
export const GRAPH_RELATIONS=Object.freeze({supports:'Подтверждает',disputes:'Оспаривает',cites:'Цитирует',applies:'Применимо к',used:'Использовано в',related:'Связано с'});
export const GRAPH_LIMITS=Object.freeze({quotes:500,links:1500,maxQuote:1200,maxBytes:1600000});
const id=v=>typeof v==='string'&&/^[\w-]{8,128}$/.test(v);
const field=(v,max,label,required=true)=>{if(typeof v!=='string'||v.length>max||required&&!v.trim())throw Error('Некорректное поле: '+label);return v.trim();};
const date=v=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const emptyGraph=()=>({version:1,quotes:[],links:[]});
export const graphNodeKey=n=>n.kind+':'+n.id;
export function validateEvidenceGraph(raw,profileIds){
 if(!object(raw)||raw.version!==1||!Array.isArray(raw.quotes)||!Array.isArray(raw.links)||raw.quotes.length>GRAPH_LIMITS.quotes||raw.links.length>GRAPH_LIMITS.links)throw Error('Некорректный граф доказательств');
 const profiles=profileIds?new Set(profileIds):null,quoteIds=new Set(),linkIds=new Set();
 const quotes=raw.quotes.map(q=>{
  if(!object(q)||!id(q.id)||!id(q.profileId)||!id(q.sourceId)||!id(q.revisionId)||!date(q.capturedAt)||!date(q.createdAt)||!digest(q.sha256)||!Number.isInteger(q.start)||q.start<0||!Number.isInteger(q.end)||q.end<=q.start||q.end>16000||quoteIds.has(q.id)||profiles&&!profiles.has(q.profileId))throw Error('Некорректная цитата или профиль');
  quoteIds.add(q.id);const quote=field(q.quote,GRAPH_LIMITS.maxQuote,'цитата');if(quote.length!==q.end-q.start)throw Error('Длина цитаты и диапазон не совпадают');
  const url=new URL(field(q.url,1000,'ссылка'));if(url.protocol!=='https:'||url.username||url.password||url.port||!['forum.majestic-rp.ru','forum.russia.online','fletcher-wiki.com','www.fletcher-wiki.com'].includes(url.hostname))throw Error('Источник цитаты не разрешён');
  return {id:q.id,profileId:q.profileId,sourceId:q.sourceId,revisionId:q.revisionId,sha256:q.sha256,quote,start:q.start,end:q.end,title:field(q.title,240,'заголовок'),url:url.href,capturedAt:q.capturedAt,createdAt:q.createdAt,note:field(q.note??'',800,'заметка',false)};
 });
 const owners=new Map(quotes.map(q=>[q.id,q.profileId]));
 const links=raw.links.map(l=>{
  if(!object(l)||!id(l.id)||!id(l.profileId)||!date(l.createdAt)||linkIds.has(l.id)||profiles&&!profiles.has(l.profileId))throw Error('Неверная связь графа');linkIds.add(l.id);
  const endpoint=r=>{if(!object(r)||!Object.hasOwn(GRAPH_TYPES,r.kind)||!id(r.id))throw Error('Неизвестный тип узла графа');if(r.kind==='quote'&&owners.get(r.id)!==l.profileId)throw Error('Цитата другого профиля или удалена');if(r.revisionId!==undefined&&(r.kind!=='rule'||!id(r.revisionId)))throw Error('Некорректная редакция правила в графе');return {kind:r.kind,id:r.id,...(r.kind==='rule'&&r.revisionId?{revisionId:r.revisionId}:{})};};
  const from=endpoint(l.from),to=endpoint(l.to);if(graphNodeKey(from)===graphNodeKey(to))throw Error('Самосвязь недопустима');
  if(!Object.hasOwn(GRAPH_RELATIONS,l.relation))throw Error('Некорректный тип связи');
  return {id:l.id,profileId:l.profileId,from,to,relation:l.relation,note:field(l.note??'',800,'комментарий',false),createdAt:l.createdAt};
 });
 if(new Set(links.map(l=>[l.profileId,graphNodeKey(l.from),graphNodeKey(l.to),l.relation].join('|'))).size!==links.length)throw Error('Повторная связь графа');
 const clean={version:1,quotes,links};if(new TextEncoder().encode(JSON.stringify(clean)).length>GRAPH_LIMITS.maxBytes)throw Error('Граф превышает лимит 1,6 МБ');return clean;
}
/** A quote is a literal substring of the selected edition. It is never re-resolved to a newer edition. */
export async function addEvidenceQuote(graph,profileId,source,revisionId,excerpt,note=''){
 const g=validateEvidenceGraph(graph);if(!source||source.profileId!==profileId)throw Error('Источник другого профиля');
 const revision=revisionId===source.id?source:source.revisions?.find(r=>r.id===revisionId);
 if(!revision)throw Error('Редакция источника не найдена');const text=field(excerpt,GRAPH_LIMITS.maxQuote,'цитата');
 const start=revision.body.indexOf(text);if(start<0)throw Error('Цитата отсутствует в выбранной редакции — скопируйте точный фрагмент');
 const sha256=await sourceDigest(revision.body);if(revision.sha256&&revision.sha256!==sha256)throw Error('SHA-256 редакции не совпадает. Цитирование заблокировано');
 if(g.quotes.length>=GRAPH_LIMITS.quotes)throw Error('Лимит цитат');
 const stamp=new Date().toISOString();const quote={id:crypto.randomUUID(),profileId,sourceId:source.id,revisionId,sha256,quote:text,start,end:start+text.length,title:revision.title,url:source.url,capturedAt:revision.capturedAt,createdAt:stamp,note};
 return validateEvidenceGraph({...g,quotes:[...g.quotes,quote]});
}
export function quoteAvailability(quote,sources){
 const source=sources.find(s=>s.id===quote.sourceId&&s.profileId===quote.profileId);
 if(!source)return 'missing';
 if([source,...source.revisions].some(r=>r.sha256===quote.sha256&&r.body.slice(quote.start,quote.end)===quote.quote))return 'available';
 return 'snapshot'; // old source edition pruned; immutable excerpt + digest remain
}
export function addEvidenceLink(graph,profileId,from,to,relation,note='',availableNodes=[]){
 const g=validateEvidenceGraph(graph);if(g.links.length>=GRAPH_LIMITS.links)throw Error('Лимит связей графа');
 const scoped=availableNodes.filter(n=>n.profileId===profileId),allowed=new Set(scoped.map(graphNodeKey));
 if(!allowed.has(graphNodeKey(from))||!allowed.has(graphNodeKey(to)))throw Error('Узел отсутствует или относится к другому профилю');
 if(g.links.some(l=>l.profileId===profileId&&graphNodeKey(l.from)===graphNodeKey(from)&&graphNodeKey(l.to)===graphNodeKey(to)&&l.relation===relation))throw Error('Такая связь уже существует');
 const pin=ref=>{const node=scoped.find(n=>graphNodeKey(n)===graphNodeKey(ref));return ref.kind==='rule'?{kind:ref.kind,id:ref.id,revisionId:node?.revisionId}:ref;};
 return validateEvidenceGraph({...g,links:[...g.links,{id:crypto.randomUUID(),profileId,from:pin(from),to:pin(to),relation,note,createdAt:new Date().toISOString()}]});
}
export function removeEvidenceGraphItem(graph,profileId,kind,itemId){
 const g=validateEvidenceGraph(graph);if(kind==='link'){if(!g.links.some(l=>l.id===itemId&&l.profileId===profileId))throw Error('Связь не найдена');return validateEvidenceGraph({...g,links:g.links.filter(l=>l.id!==itemId)});}
 if(kind==='quote'){if(!g.quotes.some(q=>q.id===itemId&&q.profileId===profileId))throw Error('Цитата не найдена');if(g.links.some(l=>l.profileId===profileId&&[l.from,l.to].some(n=>n.kind==='quote'&&n.id===itemId)))throw Error('Сначала удалите связи цитаты');return validateEvidenceGraph({...g,quotes:g.quotes.filter(q=>q.id!==itemId)});}
 throw Error('Неизвестный вид удаления');
}
/** Build live, cross-module destinations. Missing historical endpoints remain visible in link list. */
export function evidenceGraphNodes(profile,{sources=[],cases=[],rules=[],registry=[],graph=emptyGraph()}={}){
 const nodes=[],seen=new Set(),ambiguous=new Set();const push=(kind,id,title,extra={})=>{if(!id||!GRAPH_TYPES[kind])return;const key=kind+':'+id;if(seen.has(key)){ambiguous.add(key);return;}seen.add(key);nodes.push({kind,id,title,profileId:profile.id,...extra});};
 const hostname=profile.project==='majestic'?'forum.majestic-rp.ru':'forum.russia.online';
 for(const c of cases.filter(c=>c.profileId===profile.id&&new URL(c.url).hostname===hostname)){
  push('case',c.id,`Жалоба: ${c.title}`,{caseId:c.id,url:c.url});
  for(const e of c.evidence)push('evidence',e.id,`Доказательство: ${e.title} · ${c.title}`,{caseId:c.id});
  for(const t of c.timeline||[])push('event',t.id,`Событие: ${t.title} · ${c.title}`,{caseId:c.id});
 }
 for(const r of rules.filter(r=>r.profileId===profile.id&&r.project===profile.project&&(!r.server||r.server===profile.server)))push('rule',r.id,`Правило: ${r.revisions.find(v=>v.id===r.activeRevisionId)?.code??''} ${r.revisions.find(v=>v.id===r.activeRevisionId)?.title??''}`,{revisionId:r.activeRevisionId,url:r.revisions.find(v=>v.id===r.activeRevisionId)?.sourceUrl??''});
 for(const r of registry.filter(r=>r.profileId===profile.id&&r.project===profile.project&&r.server===profile.server))push('decision',r.id,`Решение: ${r.title}`,{caseId:r.caseId,url:r.url});
 for(const q of graph.quotes.filter(q=>q.profileId===profile.id))push('quote',q.id,`Цитата: ${q.quote.slice(0,80)}`,{sourceId:q.sourceId,url:q.url});
 return nodes.filter(n=>!ambiguous.has(graphNodeKey(n)));
}
export function graphLinksForCase(graph,profileId,caseId,nodes){
 const scope=new Set(nodes.filter(n=>n.caseId===caseId||n.kind==='case'&&n.id===caseId).map(graphNodeKey));let modified=true;
 while(modified){modified=false;for(const link of graph.links.filter(l=>l.profileId===profileId))if(scope.has(graphNodeKey(link.from))!==scope.has(graphNodeKey(link.to))){scope.add(graphNodeKey(link.from));scope.add(graphNodeKey(link.to));modified=true;}}
 return graph.links.filter(l=>l.profileId===profileId&&(scope.has(graphNodeKey(l.from))||scope.has(graphNodeKey(l.to))));
}
