/** Judicial document drafting and human approval (2.0.7).
 * Case-derived fields are copied once; subsequent changes to the case do not
 * silently rewrite the signed/approved document or its revision history. */
export const PROCEDURAL_KINDS=Object.freeze({
 claim:'Исковое заявление',application:'Заявление',motion:'Ходатайство',summons:'Судебная повестка',order:'Судебное определение',decree:'Постановление',minutes:'Протокол судебного заседания',judgment:'Судебное решение',appeal:'Апелляционная жалоба'
});
const parts={
 claim:['ИСКОВОЕ ЗАЯВЛЕНИЕ','Обстоятельства и требования заявителя:','Прошу суд:'],
 application:['ЗАЯВЛЕНИЕ','Основания обращения:','Прошу:'],
 motion:['ХОДАТАЙСТВО','Обстоятельства и мотивировка:','Прошу суд:'],
 summons:['СУДЕБНАЯ ПОВЕСТКА','Сведения о заседании и адресате:','Необходимые действия:'],
 order:['ОПРЕДЕЛЕНИЕ','Установленные обстоятельства:','Суд определил:'],
 decree:['ПОСТАНОВЛЕНИЕ','Основания постановления:','Постановлено:'],
 minutes:['ПРОТОКОЛ СУДЕБНОГО ЗАСЕДАНИЯ','Ход заседания:','Рассмотренные вопросы и итоги:'],
 judgment:['СУДЕБНОЕ РЕШЕНИЕ','Установленные обстоятельства и мотивировка:','Резолютивная часть:'],
 appeal:['АПЕЛЛЯЦИОННАЯ ЖАЛОБА','Обжалуемое решение и доводы:','Прошу апелляционную инстанцию:']
};
const f=(key,label,type='text')=>({key,label,type,required:false,options:[]});
const FIELDS=[f('court_name','Наименование суда'),f('case_number','Номер дела'),f('case_subject','Предмет дела'),f('case_category','Категория дела'),f('territory','Территория'),f('claimants','Заявитель / истец'),f('respondents','Ответчик'),f('judge','Судья'),f('document_date','Дата документа','date'),f('legal_basis','Правовое основание','textarea'),f('statement','Обстоятельства / мотивировка','textarea'),f('resolution','Требования / резолюция','textarea'),f('signer','Подписант')];
export function prepareProceduralDocument(caseRow,government,kind,options={}){
 if(!caseRow||caseRow.type!=='case'||!caseRow.profileId)throw Error('Судебное дело не найдено');
 if(caseRow.status==='archived')throw Error('Для архивного дела новые документы не создаются');
 if(!Object.hasOwn(PROCEDURAL_KINDS,kind))throw Error('Неподдерживаемый вид процессуального документа');
 const court=government.find(x=>x.id===caseRow.courtId&&x.type==='court'&&x.profileId===caseRow.profileId);
 const department=government.find(x=>x.id===court?.departmentId&&x.type==='department'&&x.profileId===caseRow.profileId);
 if(!court||!department)throw Error('Связанный суд или ведомство не найдены');
 const judge=government.find(x=>x.id===caseRow.judgeAssignmentId&&x.type==='assignment'&&x.profileId===caseRow.profileId);
 const participants=role=>caseRow.participants.filter(x=>x.role===role).map(x=>x.name).join(', ');
 const lastHearing=[...(caseRow.hearings??[])].sort((a,b)=>b.startsAt.localeCompare(a.startsAt))[0];
 const lastMotion=(caseRow.motions??[]).at(-1);
 const statement=kind==='minutes'?(lastHearing?.minutes||lastHearing?.agenda||''):kind==='motion'?(lastMotion?.request||caseRow.summary||''):caseRow.summary||'';
 const values={court_name:department.name,case_number:caseRow.number,case_subject:caseRow.title,case_category:caseRow.category,territory:caseRow.territory,claimants:participants('claimant')||participants('other'),respondents:participants('respondent'),judge:judge?.officer||'',document_date:new Date().toISOString().slice(0,10),legal_basis:String(options.legalBasis||'').trim(),statement:String(options.statement||statement).trim().slice(0,6000),resolution:String(options.resolution||'').trim(),signer:String(options.signer||'').trim()};
 const [heading,statementLabel,resolutionLabel]=parts[kind];
 const body=[heading,'Суд: {{court_name}}','Дело № {{case_number}}','Предмет: {{case_subject}}','Категория: {{case_category}} · Территория: {{territory}}','Заявитель: {{claimants}}','Ответчик: {{respondents}}','Судья: {{judge}}','Дата: {{document_date}}','','Правовые основания:','{{legal_basis}}','',statementLabel,'{{statement}}','',resolutionLabel,'{{resolution}}','','Подписант: {{signer}}'].join('\n');
 return {title:`${PROCEDURAL_KINDS[kind]} · № ${caseRow.number}`.slice(0,180),departmentId:department.id,templateId:'',fields:FIELDS.map(x=>({...x})),values,body};
}
const validId=s=>typeof s==='string'&&/^[\w-]{8,128}$/.test(s);
const stamp=s=>typeof s==='string'&&s.length<=40&&Number.isFinite(Date.parse(s));
export function cleanProcedural(raw,versions){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!validId(raw.caseId)||!Object.hasOwn(PROCEDURAL_KINDS,raw.kind))throw Error('Некорректная связь процессуального документа с делом');
 if(!Number.isSafeInteger(raw.sourceRevision)||raw.sourceRevision<1||raw.sourceRevision>100000||!stamp(raw.generatedAt))throw Error('Некорректная исходная редакция судебного дела');
 const approvals=raw.approvals??[];
 if(!Array.isArray(approvals)||approvals.length>versions.length)throw Error('Некорректная история утверждения');
 const seen=new Set();let previous=0;
 const clean=approvals.map(a=>{
  if(!a||typeof a!=='object'||!Number.isSafeInteger(a.version)||a.version<=previous||a.version>versions.length||seen.has(a.version)||!stamp(a.at)||!/^([a-f0-9]{64})$/.test(a.sha256)||typeof a.signer!=='string'||!a.signer.trim()||a.signer.trim().length>150||typeof a.note!=='string'||a.note.length>500)throw Error('Некорректное утверждение документа');
  seen.add(a.version);previous=a.version;return {version:a.version,at:a.at,sha256:a.sha256,signer:a.signer.trim(),note:a.note.trim()};
 });
 return {caseId:raw.caseId,kind:raw.kind,sourceRevision:raw.sourceRevision,generatedAt:raw.generatedAt,approvals:clean};
}
export function proceduralApproval(record,version=record.currentVersion){return record.procedural?.approvals.find(a=>a.version===version)||null;}
export async function sha256Revision(snapshot){if(!globalThis.crypto?.subtle)throw Error('SHA-256 недоступен в этом контексте');const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function verifyProceduralApproval(record,number){const approval=proceduralApproval(record,number);if(!approval)return false;const snapshot=record.versions.find(v=>v.number===number);return !!snapshot&&(await sha256Revision(snapshot))===approval.sha256;}
export async function approveProceduralVersion(record,signer,note=''){
 if(!record?.procedural||record.type!=='document')throw Error('Не процессуальный документ');
 const {currentVersion,versions}=record;
 if(proceduralApproval(record,currentVersion))throw Error('Эта редакция уже утверждена');
 const name=String(signer??'').trim(),comment=String(note??'').trim();
 if(!name||name.length>150||comment.length>500)throw Error('Укажите подписанта (до 150 символов) и комментарий (до 500)');
 const s=versions.at(-1);
 for(const key of ['legal_basis','statement','resolution','signer'])if(s.fields.some(f=>f.key===key)&&!String(s.values[key]||'').trim())throw Error(`Перед утверждением заполните поле «${s.fields.find(f=>f.key===key).label}»`);
 if(s.fields.some(f=>f.key==='signer')&&s.values.signer.trim()!==name)throw Error('Подписант не совпадает с подписантом в документе');
 if(/\{\{[a-z][a-z0-9_]*\}\}/.test(s.body.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g,(_,key)=>s.values[key]??`{{${key}}}`)))throw Error('В тексте остались незаполненные переменные');
 const at=new Date().toISOString(),sha256=await sha256Revision(s);
 return {...record,updatedAt:at,procedural:{...record.procedural,approvals:[...record.procedural.approvals,{version:currentVersion,at,sha256,signer:name,note:comment}]}};
}
