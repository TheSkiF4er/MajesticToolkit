/** Case dossier: read-only snapshot of a real complaint and its linked sources. */
import './complaints-core.js';
import {cleanVaultMetadata,getVaultRecord,verifyVaultFile} from './evidence-vault.mjs';
import {digest,encodeJson,decodeJson,makeZip,readZip} from './dossier-archive.mjs';
const C=globalThis.RPNComplaints;
const text=val=>String(val??'');
const escaped=val=>text(val).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const fileName=id=>`attachments/${id}.bin`;
const ids=arr=>new Set(arr.map(x=>x.id));
const requiredProfile=(profile,caseRow)=>{
 if(!profile||!caseRow||caseRow.profileId!==profile.id||new URL(caseRow.url).hostname!==(profile.project==='majestic'?'forum.majestic-rp.ru':'forum.russia.online'))throw Error('Жалоба не принадлежит текущему профилю и проекту');
};
export function assembleDossier({profile,caseRow,registry,knowledge,sources=[],rules=[],audit=[]}){
 const c=C.cleanCase(caseRow);requiredProfile(profile,c);
 const applicable=Array.isArray(registry?.records)?registry.records.filter(r=>r.caseId===c.id&&r.profileId===profile.id&&r.project===profile.project&&r.server===profile.server):[];
 const evidenceIds=ids(c.evidence),timelineIds=ids(c.timeline),decisionIds=ids(applicable),ruleIds=ids(rules.filter(r=>r.profileId===profile.id&&r.project===profile.project));
 const graph=knowledge?.evidenceGraph??{quotes:[],links:[]};
 const sourceSet=new Set(sources.filter(s=>s.profileId===profile.id).map(s=>s.id));
 const quotes=(graph.quotes??[]).filter(q=>q.profileId===profile.id&&sourceSet.has(q.sourceId));
 const validQuoteIds=ids(quotes);
 const relevantNode=n=>n.kind==='case'&&n.id===c.id || n.kind==='evidence'&&evidenceIds.has(n.id) || n.kind==='event'&&timelineIds.has(n.id) || n.kind==='decision'&&decisionIds.has(n.id) || n.kind==='rule'&&ruleIds.has(n.id);
 const allLinks=(graph.links??[]).filter(l=>l.profileId===profile.id&&(relevantNode(l.from)||relevantNode(l.to)));
 const quoteLinks=allLinks.filter(l=>l.from.kind==='quote'&&validQuoteIds.has(l.from.id)||l.to.kind==='quote'&&validQuoteIds.has(l.to.id));
 const quotedIds=new Set(quoteLinks.flatMap(l=>[l.from,l.to]).filter(n=>n.kind==='quote').map(n=>n.id));
 const graphQuotes=quotes.filter(q=>quotedIds.has(q.id));
 const citedSources=sources.filter(s=>s.profileId===profile.id&&graphQuotes.some(q=>q.sourceId===s.id)).map(s=>({id:s.id,title:s.title,url:s.url,sha256:s.sha256,capturedAt:s.capturedAt,revisions:s.revisions.filter(r=>graphQuotes.some(q=>q.revisionId===r.id)),body:s.body}));
 const caseAudit=audit.filter(a=>a.caseId===c.id).map(a=>({id:a.id,action:a.action,description:a.description,at:a.at}));
 const uniqueEvidence=[...new Set(c.evidence.map(e=>e.vaultId).filter(Boolean))];
 return {format:'majestictoolkit-case-dossier',version:1,exportedAt:new Date().toISOString(),scope:{profileId:profile.id,project:profile.project,server:profile.server},case:c,registry:applicable,knowledge:{quotes:graphQuotes,links:allLinks,sources:citedSources},audit:caseAudit,attachmentIds:uniqueEvidence};
}
export function dossierText(d,options={}){
 const redact=Boolean(options.redact),includeEvidence=options.includeEvidence!==false;
 const c=d.case;
 const out=[`Досье дела: ${c.title}`,`Тема: ${c.url}`,`Проект: ${d.scope.project}; сервер: ${d.scope.server}`,`Статус: ${c.status}`,`Создано: ${c.createdAt}`,`Срок: ${c.deadline??'не указан'}`,`Сформировано: ${d.exportedAt}`,'','Обстоятельства:',redact?'[заметки скрыты]':c.note,'','Хронология:'];
 for(const t of C.timelineOrdered(c.timeline))out.push(`${t.occurredAt??'Время не указано'} · ${t.title} · ${t.status}`,`  ${t.description}`,`  Участники: ${redact?'[скрыты]':t.participants.join(', ')}`,`  Доказательства: ${includeEvidence?t.evidenceIds.join(', '):'[скрыты]'}`,includeEvidence&&t.clipEvidenceId?`  Видео: ${t.clipEvidenceId} ${t.startSeconds??'?'}–${t.endSeconds??'?'} c`:'' );
 out.push('','Доказательства:');
 if(includeEvidence)for(const e of c.evidence)out.push(`- ${e.title}: ${e.kind==='file'?'SHA-256 '+e.sha256:e.url} ${e.seconds??''}`,redact?'':`  ${e.note||''}`);
 else out.push('Скрыты при экспорте');
 out.push('','Сохранённые цитаты и редакции источников:');for(const q of d.knowledge.quotes)out.push(`- ${q.title} · ${q.url}`,`  Редакция ${q.revisionId}: «${q.quote}» · SHA-256 ${q.sha256}`);
 out.push('','Связи доказательств и знаний:');for(const l of d.knowledge.links)out.push(`${l.from.kind}:${l.from.id} — ${l.relation} → ${l.to.kind}:${l.to.id}`);
 out.push('','Рассмотрение и санкции:');
 if(c.moderation){out.push(`Статус расчёта: ${c.moderation.status}`,`Редакция расчёта: ${c.moderation.revision}`);if(!redact)for(const p of c.moderation.players)out.push(`Участник ${p.id}${p.nickname?' / '+p.nickname:''}: ${p.items.map(i=>i.ruleId+' · индекс '+i.index+' · срок '+(i.amount??'?')).join('; ')}`);}
 out.push('','Решения реестра:');
 if(!redact)for(const r of d.registry){out.push(`- ${r.id} · ${r.events?.at(-1)?.state??'reviewed'} · ${r.reviewedAt}`,`  Тип решения: ${r.decision} · Снимок: ${r.snapshotId}`);for(const p of r.result?.players??[])out.push(`  Игрок ${p.id}: ${p.totals.map(t=>t.type+' '+t.amount+' '+t.unit).join('; ')}`);}
 else out.push('[скрыты]');
 out.push('','Черновик решения:',redact?'[скрыт]':c.draft,'','История рассмотрения:');
 if(!redact)for(const h of c.workflow.history)out.push(`${h.at}: ${h.type} — ${h.text}`);else out.push('[скрыта]');
 out.push('','Локальный журнал:');if(!redact)for(const a of d.audit)out.push(`${a.at}: ${a.action} — ${a.description}`);else out.push('[скрыт]');
 return out.filter(v=>v!==undefined).join('\n');
}
export function dossierHtml(d,options={}){const body=dossierText(d,options);return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Досье — ${escaped(d.case.title)}</title><style>body{max-width:900px;margin:3em auto;padding:0 1.5em;font:16px/1.6 system-ui;color:#1c2533}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}</style></head><body><h1>Досье дела</h1><pre>${escaped(body)}</pre></body></html>`;}
export function dossierBBCode(d,options={}){return '[b]Досье дела[/b]\n'+dossierText(d,options).replaceAll('[','［').replaceAll(']','］');}
export function dossierJson(d,options={}){
 const x=structuredClone(d);
 if(options.includeEvidence===false){x.case.evidence=[];x.case.timeline=x.case.timeline.map(t=>({...t,evidenceIds:[],clipEvidenceId:null,startSeconds:null,endSeconds:null}));x.attachmentIds=[];x.knowledge.links=x.knowledge.links.filter(l=>l.from.kind!=='evidence'&&l.to.kind!=='evidence');}
 if(options.redact){x.case.note='';x.case.draft='';x.case.triage.assignee='';x.case.workflow.history=[];delete x.case.moderation;x.case.evidence=x.case.evidence.map(e=>({...e,note:''}));x.case.timeline=x.case.timeline.map(t=>({...t,participants:[]}));x.knowledge.quotes=x.knowledge.quotes.map(q=>({...q,note:''}));x.knowledge.links=x.knowledge.links.map(l=>({...l,note:''}));x.registry=[];x.audit=[];}
 return x;
}
/** Verifies all available files; missing IndexedDB attachments are explicit. */
export async function createCaseArchive(d,{includeEvidence=true,redact=false}={}){
 const dossier=dossierJson(d,{includeEvidence,redact});const entries=[['dossier.json',encodeJson(dossier)],['report.html',dossierHtml(d,{includeEvidence,redact})],['report.txt',dossierText(d,{includeEvidence,redact})]];
 const files=[];
 if(includeEvidence)for(const id of d.attachmentIds){
  const references=d.case.evidence.filter(e=>e.vaultId===id);let metadata=null;
  let record=null;try{record=await getVaultRecord(id);}catch(error){if(!/не найден в локальном хранилище|IndexedDB недоступен/.test(error.message))throw error;}
  if(record){if(record.meta.profileId!==d.scope.profileId)throw Error('Материал другого профиля');metadata=record.meta;
   if(metadata.kind==='file'){
    const verified=await verifyVaultFile(id,d.scope.profileId);const data=new Uint8Array(await verified.blob.arrayBuffer());const sha256=await digest(data);if(sha256!==metadata.sha256)throw Error('SHA-256 не совпадает');
    files.push({id,name:fileName(id),status:'included',meta:metadata,size:data.length,sha256});entries.push([fileName(id),data]);continue;
   }
   files.push({id,status:'external',meta:metadata});continue;
  }else{files.push({id,status:'missing',meta:null,reason:'Вложение отсутствует в локальном IndexedDB',references:references.map(e=>e.id)});}
 }
 const items=[];for(const [name,data] of entries) {const bytes=data instanceof Uint8Array?data:new TextEncoder().encode(data);items.push({name,size:bytes.length,sha256:await digest(bytes)});}
 const manifest={format:'majestictoolkit-dossier-manifest',version:1,caseId:d.case.id,profileId:d.scope.profileId,generatedAt:d.exportedAt,files,items};
 entries.push(['manifest.json',encodeJson(manifest)]);
 return {blob:await makeZip(entries),manifest};
}
export async function verifyCaseArchive(input){
 const entries=await readZip(input),manifest=decodeJson(entries.get('manifest.json'));
 if(manifest?.format!=='majestictoolkit-dossier-manifest'||manifest.version!==1||!Array.isArray(manifest.files)||!Array.isArray(manifest.items))throw Error('Некорректный манифест досье');
 const names=new Set();for(const item of manifest.items){if(!item||typeof item.name!=='string'||names.has(item.name)||!entries.has(item.name)||item.size!==entries.get(item.name).length||!(/^[a-f0-9]{64}$/.test(item.sha256))||await digest(entries.get(item.name))!==item.sha256)throw Error('Нарушена целостность досье: '+String(item?.name));names.add(item.name);}
 if(entries.size!==names.size+1)throw Error('Архив содержит незаявленные файлы');
 const dossier=decodeJson(entries.get('dossier.json'));if(dossier.format!=='majestictoolkit-case-dossier'||dossier.version!==1||dossier.case.id!==manifest.caseId||dossier.scope.profileId!==manifest.profileId)throw Error('Несовпадение досье и манифеста');
 const declaredIds=new Set();for(const file of manifest.files){if(!file||typeof file.id!=='string'||declaredIds.has(file.id))throw Error('Дублирующееся вложение в манифесте');declaredIds.add(file.id);if(file.status==='included'){if(!names.has(file.name)||file.name!==fileName(file.id)||file.size!==entries.get(file.name).length||file.meta.sha256!==file.sha256||await digest(entries.get(file.name))!==file.sha256)throw Error('Повреждено вложение '+file.id);cleanVaultMetadata(file.meta);}else if(!['missing','external'].includes(file.status))throw Error('Неизвестный статус вложения');}
 if(declaredIds.size!==dossier.attachmentIds.length||dossier.attachmentIds.some(id=>!declaredIds.has(id)))throw Error('Манифест не описывает все вложения досье');
 return {dossier,manifest,entries};
}
