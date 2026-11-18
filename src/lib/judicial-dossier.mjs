/** Portable judicial dossier assembled from the SAME Court Cases, Document Studio and Evidence Vault.
 * SHA-256 detects corruption, not authorship: this is not a cryptographic signature. */
import {cleanJudicialCase,CASE_STATUSES,CASE_ROLES} from './judicial-case-core.mjs';
import {cleanVaultMetadata,getVaultRecord,verifyVaultFile} from './evidence-vault.mjs';
import {evidenceMatchesVault} from './judicial-evidence-core.mjs';
import {cleanDocumentRecord,verifyProceduralApproval} from './document-core.mjs';
import {cleanGovernment} from './government-core.mjs';
import {makeZip,readZip,encodeJson,decodeJson,digest} from './dossier-archive.mjs';
const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const path=id=>`attachments/${id}.bin`;
export function assembleJudicialDossier(caseRecord,government,documents=[],exportedAt=new Date().toISOString()){
 const row=cleanJudicialCase(caseRecord);
 const peers=government.filter(g=>g.profileId===row.profileId),court=peers.find(g=>g.type==='court'&&g.id===row.courtId);
 if(!court)throw Error('Суд недоступен в текущем профиле');
 const department=peers.find(g=>g.type==='department'&&g.id===court.departmentId);
 if(!department)throw Error('Ведомство суда не найдено');
 const attached=row.documents.map(link=>{
  const source=link.kind==='document'?documents.find(d=>d.type==='document'&&d.id===link.id&&d.profileId===row.profileId):peers.find(g=>g.type===link.kind&&g.id===link.id);
  if(!source)throw Error(`Недоступен приложенный документ: ${link.title}`);
  return {link,record:link.kind==='document'?cleanDocumentRecord(source):cleanGovernment(source)};
 });
 return {format:'majestictoolkit-judicial-dossier',version:1,exportedAt,profileId:row.profileId,case:row,court:cleanGovernment(court),department:cleanGovernment(department),documents:attached};
}
export function judicialDossierText(d){
 const c=d.case,lines=[`СУДЕБНОЕ ДОСЬЕ · Дело № ${c.number}`,c.title,`Суд: ${d.department.name}`,`Статус: ${CASE_STATUSES[c.status]}`,`Категория: ${c.category} · Территория: ${c.territory}`,`Создано: ${c.createdAt}`,`Сформировано: ${d.exportedAt}`,'','ОБСТОЯТЕЛЬСТВА',c.summary,'','УЧАСТНИКИ'];
 for(const p of c.participants)lines.push(`- ${CASE_ROLES[p.role]}: ${p.name}${p.notes?' — '+p.notes:''}`);
 lines.push('','МАТЕРИАЛЫ И ДОКАЗАТЕЛЬСТВА');
 for(const x of c.evidence)lines.push(`- ${x.title} [${x.category}], Vault ${x.vaultId}`,`  ${x.note||'Нет описания'}`,x.snapshot.kind==='file'?`  ${x.snapshot.name} · ${x.snapshot.size} байт · SHA-256 ${x.snapshot.sha256}`:`  HTTPS ${x.snapshot.url}`,`  Заседание: ${x.hearingId||'—'} · Ходатайство: ${x.motionId||'—'}`);
 lines.push('','ПРИЛОЖЕННЫЕ ДОКУМЕНТЫ');
 for(const {link,record} of d.documents){lines.push(`- ${link.title} (${link.kind}; ${record.id})`);if(link.kind==='document'){for(const version of record.versions)lines.push(`  Редакция ${version.number} от ${version.createdAt}: ${version.title}`,version.body);}else if(link.kind==='decision'){lines.push(`  Обстоятельства: ${record.facts}`,`  Основание: ${record.reason}`,`  Решение: ${record.sanction}`);for(const ref of record.references??[])lines.push(`  ${ref.bookTitle}: ${ref.articleKey} (${ref.editionLabel}) — ${ref.articleText}`);}else lines.push(record.body);}
 lines.push('','ЗАСЕДАНИЯ');for(const h of c.hearings)lines.push(`${h.startsAt} · ${h.title} · ${h.status}`,h.minutes||'',h.outcome||'');
 lines.push('','ХОДАТАЙСТВА');for(const m of c.motions)lines.push(`${m.title} · ${m.status}: ${m.request}`,m.resolution||'');
 lines.push('','ПРОЦЕССУАЛЬНЫЕ СРОКИ');for(const x of c.deadlines)lines.push(`${x.dueOn}: ${x.title} · ${x.status}`,x.result||'');
 lines.push('','ЖУРНАЛ ДВИЖЕНИЯ ДЕЛА');for(const h of c.history)lines.push(`${h.at} · ${h.action}: ${h.description}`);
 return lines.join('\n');
}
export function judicialDossierHtml(d){return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Судебное досье № ${escape(d.case.number)}</title><style>body{max-width:920px;margin:2rem auto;padding:0 1.5rem;font:16px/1.5 system-ui;color:#243044}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}</style></head><body><h1>Судебное досье № ${escape(d.case.number)}</h1><pre>${escape(judicialDossierText(d))}</pre></body></html>`;}
export async function createJudicialDossierArchive(d,{includeFiles=true}={}){
 if(d?.format!=='majestictoolkit-judicial-dossier'||d.version!==1)throw Error('Некорректное судебное досье');
 for(const {link,record} of d.documents){if(link.kind==='document')for(const a of record.procedural?.approvals??[])if(!await verifyProceduralApproval(record,a.version))throw Error('Повреждена утверждённая версия документа '+record.id);}
 const entries=[['dossier.json',encodeJson(d)],['report.txt',judicialDossierText(d)],['report.html',judicialDossierHtml(d)]];
 const attachments=[];
 for(const evidence of d.case.evidence){
  const meta=cleanVaultMetadata(evidence.snapshot);if(meta.profileId!==d.profileId)throw Error('Материал другого профиля');
  if(meta.kind==='link'){attachments.push({vaultId:meta.id,status:'external',url:meta.url});continue;}
  if(!includeFiles){attachments.push({vaultId:meta.id,status:'excluded',sha256:meta.sha256});continue;}
  let record;try{record=await getVaultRecord(meta.id);}catch(err){if(!/Материал не найден в локальном хранилище|IndexedDB недоступен/.test(err.message))throw err;}
  if(!record){attachments.push({vaultId:meta.id,status:'missing',sha256:meta.sha256});continue;}
  if(!evidenceMatchesVault(evidence,record.meta))throw Error('Сохранённый снимок доказательства отличается от Evidence Vault: '+meta.id);
  const verified=await verifyVaultFile(meta.id,d.profileId),data=new Uint8Array(await verified.blob.arrayBuffer());
  if(await digest(data)!==meta.sha256)throw Error('Нарушена целостность вложения');
  entries.push([path(meta.id),data]);attachments.push({vaultId:meta.id,status:'included',path:path(meta.id),sha256:meta.sha256,size:data.byteLength});
 }
 const items=[];for(const [name,value] of entries){const bytes=value instanceof Uint8Array?value:new TextEncoder().encode(value);items.push({name,size:bytes.byteLength,sha256:await digest(bytes)});}
 const manifest={format:'majestictoolkit-judicial-dossier-manifest',version:1,profileId:d.profileId,caseId:d.case.id,generatedAt:d.exportedAt,items,attachments};
 entries.push(['manifest.json',encodeJson(manifest)]);
 return {blob:await makeZip(entries),manifest};
}
export async function verifyJudicialDossierArchive(input){
 const entries=await readZip(input),manifest=decodeJson(entries.get('manifest.json'));
 if(manifest?.format!=='majestictoolkit-judicial-dossier-manifest'||manifest.version!==1||!Array.isArray(manifest.items)||!Array.isArray(manifest.attachments))throw Error('Неизвестный формат манифеста судебного досье');
 const names=new Set();for(const item of manifest.items){if(typeof item.name!=='string'||names.has(item.name)||!entries.has(item.name)||!Number.isSafeInteger(item.size)||!(/^[a-f0-9]{64}$/.test(item.sha256))||entries.get(item.name).length!==item.size||await digest(entries.get(item.name))!==item.sha256)throw Error('Повреждён файл судебного досье: '+item.name);names.add(item.name);}
 if(entries.size!==names.size+1||!names.has('dossier.json')||!names.has('report.html')||!names.has('report.txt'))throw Error('Архив содержит незаявленные или отсутствующие файлы');
 const dossier=decodeJson(entries.get('dossier.json'));if(dossier.format!=='majestictoolkit-judicial-dossier'||dossier.version!==1||dossier.case.id!==manifest.caseId||dossier.profileId!==manifest.profileId)throw Error('Досье не совпадает с манифестом');
 const row=cleanJudicialCase(dossier.case),seen=new Set();
 if(row.profileId!==manifest.profileId||dossier.court.profileId!==manifest.profileId||dossier.department.profileId!==manifest.profileId)throw Error('Подмена профиля в досье');
 for(const record of dossier.documents){const link=row.documents.find(x=>x.id===record.link.id&&x.kind===record.link.kind);if(!link||record.record.profileId!==manifest.profileId)throw Error('Нарушена связь документа');if(link.kind==='document'){cleanDocumentRecord(record.record);for(const a of record.record.procedural?.approvals??[])if(!await verifyProceduralApproval(record.record,a.version))throw Error('Повреждена утверждённая редакция документа');}else cleanGovernment(record.record);}
 if(dossier.documents.length!==row.documents.length)throw Error('Не все документы включены в досье');
 if(manifest.attachments.length!==row.evidence.length)throw Error('Не все доказательства описаны в манифесте');
 for(const file of manifest.attachments){if(!file||seen.has(file.vaultId))throw Error('Повторное вложение');seen.add(file.vaultId);const e=row.evidence.find(x=>x.vaultId===file.vaultId);if(!e)throw Error('Лишнее доказательство');const meta=e.snapshot;if(meta.kind==='link'){if(file.status!=='external'||file.url!==meta.url)throw Error('Подменена ссылка');continue;}
  if(file.sha256!==meta.sha256)throw Error('Подменена контрольная сумма доказательства');
  if(file.status==='included'){if(file.path!==path(meta.id)||!names.has(file.path)||file.size!==entries.get(file.path).length||await digest(entries.get(file.path))!==meta.sha256)throw Error('Повреждено вложение');}
  else if(!['missing','excluded'].includes(file.status))throw Error('Неизвестный статус вложения');
 }
 return {dossier,manifest,entries};
}
