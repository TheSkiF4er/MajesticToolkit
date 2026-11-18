/** Government & Justice GA. A live operational queue and a cross-store integrity
 * check over the ACTUAL records used by Court Cases, Document Studio and Vault.
 * No shadow database or synthetic completion statuses are created here. */
import {validateGovernment,cleanGovernment,GOV_PREFIX} from './government-core.mjs';
import {validateCaseRelations} from './judicial-case-core.mjs';
import {verifyJudgments} from './judicial-decisions-core.mjs';
import {validateDocuments,verifyProceduralApproval,cleanDocumentRecord,DOCUMENT_PREFIX} from './document-core.mjs';
import {cleanLawRecord,LAW_PREFIX} from './law-core.mjs';
import {evidenceMatchesVault} from './judicial-evidence-core.mjs';

const day = now => {const d=new Date(now);if(!Number.isFinite(d.getTime()))throw Error('Некорректная текущая дата');return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
/** Deterministic task queue, profile-scoped. Local calendar day for deadlines,
 * actual UTC instant for hearings. Completed/cancelled work is never resurfaced. */
export function justiceActionQueue(government, profileId, now=new Date()) {
 const current=new Date(now);const today=day(current), nextWeek=new Date(current.getTime()+7*86400000);
 const tasks=[];
 for(const row of government){if(row.type!=='case'||row.profileId!==profileId||row.status==='archived')continue;
  const base={caseId:row.id,number:row.number,caseTitle:row.title};
  for(const d of row.deadlines??[])if(d.status==='open'){
   const status=d.dueOn<today?'overdue':d.dueOn===today?'today':d.dueOn<=day(nextWeek)?'week':null;
   if(status)tasks.push({...base,kind:'deadline',id:d.id,priority:status==='overdue'?0:status==='today'?1:3,label:d.title,when:d.dueOn,status});
  }
  for(const m of row.motions??[])if(m.status==='pending')tasks.push({...base,kind:'motion',id:m.id,priority:2,label:m.title,when:m.filedAt,status:'pending'});
  for(const h of row.hearings??[])if(h.status==='scheduled'){
   const ts=Date.parse(h.startsAt);if(ts<=nextWeek.getTime())tasks.push({...base,kind:'hearing',id:h.id,priority:ts<current.getTime()?0:3,label:h.title,when:h.startsAt,status:ts<current.getTime()?'past':'scheduled'});
  }
  if(row.status==='closed'&&!row.judgments?.length)tasks.push({...base,kind:'judgment',id:row.id,priority:2,label:'Решение не утверждено',when:row.closedAt||row.updatedAt,status:'draft'});
  for(const a of row.appeals??[])if(a.status==='reviewing')tasks.push({...base,kind:'appeal',id:a.id,priority:2,label:'Апелляция на рассмотрении',when:a.filedAt,status:'reviewing'});
 }
 return tasks.sort((a,b)=>a.priority-b.priority||a.when.localeCompare(b.when)||a.number.localeCompare(b.number,'ru')||a.id.localeCompare(b.id));
}
/** Fail-closed cross-store preflight. Prevents partially restoring an invalid
 * judicial backup even when every individual JSON record passed its own parser.
 * `inventory` is metadata; verification of binary IndexedDB files is separate. */
export async function verifyJusticeIntegrity(profiles,government,documents,inventory=null,{checkFiles=null}={}){
 const profileIds=profiles.map(p=>typeof p==='string'?p:p.id);
 const rows=validateGovernment(government,profileIds),docs=validateDocuments(documents,profileIds,rows);
 const vault=inventory===null?null:new Map(inventory.map(item=>[item.id,item]));
 if(vault&&vault.size!==inventory.length)throw Error('Дублирование идентификаторов Evidence Vault');
 const checked=new Set(),files=new Set();let judgments=0,approvals=0,evidence=0,cases=0;
 for(const row of rows){if(row.type!=='case')continue;cases++;
  validateCaseRelations(row,rows,docs);
  await verifyJudgments(row);judgments+=row.judgments.length;
  for(const item of row.evidence){evidence++;
   if(vault){const actual=vault.get(item.vaultId);
    if(!actual||!evidenceMatchesVault(item,actual))throw Error(`Дело № ${row.number}: доказательство «${item.title}» отсутствует или его метаданные изменены`);
   }
   if(checkFiles&&item.snapshot.kind==='file'&&!files.has(item.vaultId)){
    await checkFiles(item.vaultId,row.profileId,item.snapshot);files.add(item.vaultId);
   }
  }
 }
 for(const doc of docs){if(!doc.procedural)continue;
  if(!checked.has(doc.id))for(const approval of doc.procedural.approvals){
   if(!await verifyProceduralApproval(doc,approval.version))throw Error(`Документ ${doc.id}: SHA-256 утверждённой редакции ${approval.version} не совпадает`);
   approvals++;
  }checked.add(doc.id);
 }
 return {cases,judgments,approvals,evidence,documents:docs.length,courts:rows.filter(x=>x.type==='court').length,checkedFiles:files.size};
}

/** List APIs deliberately skip malformed local entries so other UI sections still
 * load. A GA audit or backup must NOT silently discard those entries. */
export function verifyJusticeStorageRows(stored,{profileId=null}={}){
 if(!stored||typeof stored!=='object'||Array.isArray(stored))throw Error('Не удалось прочитать локальные данные');
 const prefixes=[[GOV_PREFIX,cleanGovernment,'Government Tools'],[DOCUMENT_PREFIX,cleanDocumentRecord,'Document Studio'],[LAW_PREFIX,cleanLawRecord,'Law Codex']];
 const counts={government:0,documents:0,laws:0};
 for(const [key,value] of Object.entries(stored))for(const [prefix,clean,label] of prefixes)if(key.startsWith(prefix)&&(!profileId||!value?.profileId||value.profileId===profileId)){
  let row;try{row=clean(value);}catch(error){throw Error(`${label}: повреждена локальная запись ${key}: ${error.message}`);}
  if(key!==prefix+row.id)throw Error(`${label}: ID локальной записи не соответствует ключу ${key}`);
  if(prefix===GOV_PREFIX)counts.government++;
  if(prefix===DOCUMENT_PREFIX)counts.documents++;
  if(prefix===LAW_PREFIX)counts.laws++;
 }
 return counts;
}
