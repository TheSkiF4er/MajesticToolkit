// Government & Justice 2.0.1: read-only workspace projection of the existing stores.
// The workspace never creates a second copy of a law, decision or document.
export const JUSTICE_TABS = Object.freeze(['overview','courts','agencies','law','decisions','documents']);
export const JUSTICE_UI_KEY = 'mtGovernmentJusticeWorkspaceV201';
export const JUSTICE_OPEN_KINDS = Object.freeze(['department','unit','position','competence','assignment','decision','government-template','book','memo','document','document-template','court','jurisdiction']);
const courtPattern = /(?:^|[^\p{L}\p{N}])(?:суд(?:а|е|ом|ы|ья|ьи|ей|ов|ебн[\p{L}]*)?|court|judicial|justice)(?=$|[^\p{L}\p{N}])/iu;
const asText = value => typeof value === 'string' ? value : '';
export function isCourtDepartment(row){return row?.type === 'department' && courtPattern.test([row.name,row.code,row.jurisdiction,row.position].map(asText).join(' '));}
const safeDate = row => asText(row?.updatedAt || row?.createdAt);
export function justiceSnapshot(profileId, government=[], law=[], documents=[]) {
  if(typeof profileId!=='string'||!profileId)throw Error('Выберите профиль');
  const gov=government.filter(x=>x.profileId===profileId);
  const legal=law.filter(x=>x.profileId===profileId);
  const docs=documents.filter(x=>x.profileId===profileId);
  const departments=gov.filter(x=>x.type==='department');
  const decisions=gov.filter(x=>x.type==='decision');
  const courtIds=new Set(gov.filter(x=>x.type==='court').map(x=>x.departmentId));
  const courts=departments.filter(x=>courtIds.has(x.id)||isCourtDepartment(x));
  const books=legal.filter(x=>x.type==='book');
  const rows=[];
  for(const g of gov){
    if(g.type==='department')rows.push({kind:'department',id:g.id,tab:courtIds.has(g.id)||isCourtDepartment(g)?'courts':'agencies',title:g.name,description:[g.code,g.officer,g.position,g.jurisdiction].join(' · '),text:[g.name,g.code,g.officer,g.position,g.jurisdiction].join(' '),updatedAt:safeDate(g)});
    else if(g.type==='unit')rows.push({kind:'unit',id:g.id,tab:'agencies',title:`${g.code} · ${g.name}`,description:`Подразделение · ${departments.find(d=>d.id===g.departmentId)?.name||''}`,text:[g.name,g.code,g.description,departments.find(d=>d.id===g.departmentId)?.name].join(' '),updatedAt:safeDate(g)});
    else if(g.type==='competence')rows.push({kind:'competence',id:g.id,tab:'agencies',title:`${g.code} · ${g.title}`,description:`Компетенция · ${departments.find(d=>d.id===g.departmentId)?.name||''}`,text:[g.code,g.title,g.description,g.legalBasis,departments.find(d=>d.id===g.departmentId)?.name].join(' '),updatedAt:safeDate(g)});
    else if(g.type==='position')rows.push({kind:'position',id:g.id,tab:'agencies',title:g.title,description:`Должность · ${departments.find(d=>d.id===g.departmentId)?.name||''}`,text:[g.title,g.rank,g.description,...g.competenceIds.map(id=>gov.find(x=>x.id===id)?.title||''),departments.find(d=>d.id===g.departmentId)?.name].join(' '),updatedAt:safeDate(g)});
    else if(g.type==='assignment')rows.push({kind:'assignment',id:g.id,tab:'agencies',title:g.officer,description:`Назначение · ${gov.find(d=>d.id===g.positionId)?.title||''}`,text:[g.officer,g.startedAt,g.endedAt,g.notes,gov.find(d=>d.id===g.positionId)?.title,departments.find(d=>d.id===g.departmentId)?.name].join(' '),updatedAt:safeDate(g)});
    else if(g.type==='court')rows.push({kind:'court',id:g.id,tab:'courts',title:`${departments.find(d=>d.id===g.departmentId)?.name||'Суд недоступен'}`,description:`Судебная инстанция · ${g.level}`,text:[g.level,g.venue,g.description,departments.find(d=>d.id===g.departmentId)?.name].join(' '),updatedAt:safeDate(g)});
    else if(g.type==='jurisdiction')rows.push({kind:'jurisdiction',id:g.id,tab:'courts',title:`${g.category} · ${g.territory}`,description:`Подсудность · ${g.stage} · ${departments.find(d=>d.id===gov.find(c=>c.id===g.courtId)?.departmentId)?.name||''}`,text:[g.category,g.territory,g.stage,g.legalBasis,departments.find(d=>d.id===gov.find(c=>c.id===g.courtId)?.departmentId)?.name].join(' '),updatedAt:safeDate(g)});
    else if(g.type==='decision')rows.push({kind:'decision',id:g.id,tab:'decisions',title:`№ ${g.caseNumber} — ${g.subject}`,description:`${g.status==='final'?'Утверждено':'Черновик'} · ${departments.find(d=>d.id===g.departmentId)?.name||'Ведомство недоступно'}`,text:[g.caseNumber,g.subject,g.facts,g.reason,g.sanction,g.notes].join(' '),updatedAt:safeDate(g)});
    else if(g.type==='template')rows.push({kind:'government-template',id:g.id,tab:'documents',title:g.title,description:`Процессуальный шаблон · ${g.category}`,text:[g.title,g.category,g.body].join(' '),updatedAt:safeDate(g)});
  }
  for(const l of legal){
    if(l.type==='book'){
      const edition=l.editions?.find(x=>x.id===l.activeEditionId)||l.editions?.at(-1);
      rows.push({kind:'book',id:l.id,tab:'law',title:l.title,description:`Нормативный акт · ${l.category} · ${edition?.articles?.length||0} статей`,text:[l.title,l.category,l.sourceUrl,edition?.label,...(edition?.articles||[]).map(a=>[a.key,a.title,a.text].join(' '))].join(' '),updatedAt:safeDate(l)});
    } else if(l.type==='memo')rows.push({kind:'memo',id:l.id,tab:'law',title:l.title,description:`Памятка · ${l.category}`,text:[l.title,l.body,l.category].join(' '),updatedAt:safeDate(l)});
  }
  for(const d of docs){
    const version=d.type==='document'?d.versions?.at(-1):null;
    const title=version?.title||d.title;
    rows.push({kind:d.type==='template'?'document-template':'document',id:d.id,tab:'documents',title,description:d.type==='template'?`Шаблон Document Studio · ${d.category}`:`Документ · версия ${d.currentVersion}`,text:[title,version?.body||d.body,d.category].join(' '),updatedAt:safeDate(d)});
  }
  rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.title.localeCompare(b.title,'ru'));
  return {profileId,departments,units:gov.filter(x=>x.type==='unit'),positions:gov.filter(x=>x.type==='position'),competences:gov.filter(x=>x.type==='competence'),assignments:gov.filter(x=>x.type==='assignment'),courts,courtRegistry:gov.filter(x=>x.type==='court'),jurisdictions:gov.filter(x=>x.type==='jurisdiction'),decisions,books,
    governmentTemplates:gov.filter(x=>x.type==='template'),documents:docs.filter(x=>x.type==='document'),documentTemplates:docs.filter(x=>x.type==='template'),
    memos:legal.filter(x=>x.type==='memo'),articles:books.reduce((n,b)=>n+(b.editions?.find(e=>e.id===b.activeEditionId)?.articles?.length||0),0),
    rows};
}
export function justiceSearch(snapshot, rawQuery='', limit=80){
  const query=String(rawQuery).trim().toLocaleLowerCase('ru').slice(0,160);
  if(!query)return snapshot.rows.slice(0,Math.max(0,Math.min(80,limit)));
  const tokens=query.split(/\s+/u).filter(Boolean);
  return snapshot.rows.filter(row=>tokens.every(t=>row.text.toLocaleLowerCase('ru').includes(t))).slice(0,Math.max(0,Math.min(80,limit)));
}
export function cleanJusticeUI(raw, validProfiles=[]){
  const profiles=new Set(validProfiles);
  const out={tabs:{},recent:[]};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
  if(raw.tabs&&typeof raw.tabs==='object'&&!Array.isArray(raw.tabs))for(const [id,tab] of Object.entries(raw.tabs))if(profiles.has(id)&&JUSTICE_TABS.includes(tab))out.tabs[id]=tab;
  if(Array.isArray(raw.recent)){
    const seen=new Set();
    for(const r of raw.recent.slice(0,50)){
      if(!r||!profiles.has(r.profileId)||!JUSTICE_OPEN_KINDS.includes(r.kind)||typeof r.id!=='string'||!/^[\w-]{8,128}$/.test(r.id)||!Number.isFinite(r.openedAt)||r.openedAt<0)continue;
      const key=`${r.profileId}:${r.kind}:${r.id}`;if(seen.has(key))continue;seen.add(key);
      out.recent.push({profileId:r.profileId,kind:r.kind,id:r.id,openedAt:r.openedAt});
      if(out.recent.length>=30)break;
    }
  }
  return out;
}
export function selectJusticeTab(ui,profileId,tab,profiles){
  if(!JUSTICE_TABS.includes(tab)||!profiles.includes(profileId))throw Error('Недоступная вкладка или профиль');
  return {...cleanJusticeUI(ui,profiles),tabs:{...cleanJusticeUI(ui,profiles).tabs,[profileId]:tab}};
}
export function rememberJusticeRecord(ui,profileId,kind,id,profiles,openedAt=Date.now()){
  if(!JUSTICE_OPEN_KINDS.includes(kind)||!profiles.includes(profileId)||typeof id!=='string'||!/^[\w-]{8,128}$/.test(id))throw Error('Недоступная запись');
  const clean=cleanJusticeUI(ui,profiles);
  return {...clean,recent:[{profileId,kind,id,openedAt},...clean.recent.filter(r=>!(r.profileId===profileId&&r.kind===kind&&r.id===id))].slice(0,30)};
}
