// Local sequential queue: never posts, never claims that a forum action succeeded.
export const BATCH_LIMIT=100;
export const BATCH_STATES=Object.freeze({pending:'Ожидает',opened:'Тема открыта',inserted:'Черновик вставлен',done:'Обработка отмечена',skipped:'Пропущена'});
export function cleanModerationBatch(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>BATCH_LIMIT)throw Error('Некорректная очередь модерации');
 const ids=new Set();return value.map(x=>{
  if(!x||typeof x!=='object'||typeof x.caseId!=='string'||!/^[\w-]{8,120}$/.test(x.caseId)||ids.has(x.caseId)||!Object.hasOwn(BATCH_STATES,x.status)||typeof x.updatedAt!=='string'||!Number.isFinite(Date.parse(x.updatedAt)))throw Error('Некорректная запись очереди');
  ids.add(x.caseId);return {caseId:x.caseId,status:x.status,updatedAt:x.updatedAt};
 });
}
export function buildModerationBatch(ids,cases,profile,now=new Date().toISOString()){
 if(!Array.isArray(ids)||!ids.length||ids.length>BATCH_LIMIT||new Set(ids).size!==ids.length)throw Error('Выберите до 100 разных жалоб');
 return cleanModerationBatch(ids.map(id=>{const c=cases.find(x=>x.id===id&&x.profileId===profile.id);if(!c||c.triage?.queue==='archived'||new URL(c.url).hostname!==new URL(profile.forumUrl).hostname)throw Error('Жалоба недоступна в текущем профиле');return {caseId:id,status:'pending',updatedAt:now};}));
}
export function batchTransition(queue,id,status,expected,now=new Date().toISOString()){
 const rows=cleanModerationBatch(queue),x=rows.find(r=>r.caseId===id);if(!x||x.status!==expected)throw Error('Очередь изменилась');
 const allowed={pending:['opened','inserted','skipped'],opened:['opened','inserted','skipped'],inserted:['done','pending','skipped'],done:['pending'],skipped:['pending']};
 if(!allowed[x.status].includes(status))throw Error('Недопустимый переход очереди');
 return cleanModerationBatch(rows.map(r=>r.caseId===id?{...r,status,updatedAt:now}:r));
}
