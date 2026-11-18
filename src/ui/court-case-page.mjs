/** Court Case Management 2.0.5: functioning local UI over Government Store. */
import '../lib/safe-dom.js';
import {courtEvidenceHTML} from './court-evidence-page.mjs';
import {courtProceedingsHTML} from './judicial-proceedings-page.mjs';
import {proceedingsSummary,localDay} from '../lib/judicial-proceedings-core.mjs';
import {escapeHtml as e} from '../lib/sites.mjs';
import {CASE_STATUSES,CASE_ROLES,CASE_TRANSITIONS,searchJudicialCases} from '../lib/judicial-case-core.mjs';
import {addJudicialCase,editCourtCase,setCourtCaseStatus,mutateCourtCaseParticipant,mutateCourtCaseDocument,addCourtCaseNote,getGovernment,generateCourtCaseDocument} from '../lib/government-store.mjs';
import {PROCEDURAL_KINDS} from '../lib/procedural-document-core.mjs';
import {refreshDocuments,handleDocumentAction} from './document-page.mjs';
import {findCourtJurisdiction} from '../lib/government-core.mjs';
const {replaceHtml}=globalThis.MTSafeDOM;
const esc=value=>e(String(value??''));
const opt=(value,label,current)=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`;
const field=(name,label,value='',max=160,required=true)=>`<label class="field">${esc(label)}<input name="${esc(name)}" maxlength="${max}" value="${esc(value)}" ${required?'required':''}></label>`;
const area=(name,label,value='',max=9000,required=false)=>`<label class="field">${esc(label)}<textarea name="${esc(name)}" maxlength="${max}" rows="3" ${required?'required':''}>${esc(value)}</textarea></label>`;
const select=(name,label,choices,current='',required=true)=>`<label class="field">${esc(label)}<select name="${esc(name)}" ${required?'required':''}>${required?'':opt('','Не назначено',current)}${choices.map(c=>opt(c.id,c.title,current)).join('')}</select></label>`;
const button=(action,label,id='',style='secondary')=>`<button type="button" class="button ${style}" data-court-case-action="${esc(action)}" data-id="${esc(id)}">${esc(label)}</button>`;
const date=t=>t?new Date(t).toLocaleString('ru-RU'):'';
let chosenCaseId='',query='',filterStatus='',filterCourt='';
function scope(state,records){return records.filter(r=>r.profileId===state.activeProfileId);}
function courtName(court,records){const dept=records.find(r=>r.id===court?.departmentId&&r.type==='department');return dept?.name||'Суд недоступен';}
const caseName=(row,records)=>courtName(records.find(c=>c.id===row.courtId),records);
export function setCourtCaseFilter(name,value){if(name==='query')query=String(value).slice(0,160);else if(name==='status')filterStatus=Object.hasOwn(CASE_STATUSES,value)?value:'';else if(name==='court')filterCourt=String(value);else throw Error('Неизвестный фильтр дела');}
function visible(state,records){return searchJudicialCases(records,state.activeProfileId,query,{status:filterStatus,courtId:filterCourt});}
export function caseListHTML(state,records){const rows=visible(state,records);return `<p class="subtle" role="status">Найдено дел: ${rows.length} · Активный профиль</p>${rows.map(row=>`<article class="justice-result court-case-row"><div><strong>№ ${esc(row.number)} · ${esc(row.title)}</strong><p class="subtle">${esc(CASE_STATUSES[row.status])} · ${esc(caseName(row,records))} · ${esc(row.category)} · ${esc(row.territory)}</p><p class="subtle">Участники: ${row.participants.length} · Заседания: ${(row.hearings??[]).length} · Ходатайства: ${(row.motions??[]).length} · Сроки: ${(row.deadlines??[]).length} · Документы: ${row.documents.length} · Доказательства: ${row.evidence.length} · Обновлено: ${esc(date(row.updatedAt))}</p>${proceedingsSummary(row).overdue.length?`<p class="court-overdue">Просрочено сроков: ${proceedingsSummary(row).overdue.length}</p>`:''}</div>${button('open','Открыть',row.id,'secondary')}</article>`).join('')||'<p class="empty">Судебных дел по заданным фильтрам нет.</p>'}`;}
function proceedingsAlerts(cases){const now=new Date(),to=new Date(now.getTime()+7*86400000),today=localDay(now),lastDay=localDay(to),alerts=[];let pending=0;
 for(const row of cases.filter(c=>!['archived','closed'].includes(c.status))){pending+=(row.motions??[]).filter(m=>m.status==='pending').length;for(const h of row.hearings??[])if(h.status==='scheduled'&&h.endsAt>=now.toISOString()&&h.startsAt<=to.toISOString())alerts.push({kind:'Заседание',date:h.startsAt,title:h.title,case:row});for(const d of row.deadlines??[])if(d.status==='open'&&d.dueOn<=lastDay)alerts.push({kind:d.dueOn<today?'Просрочено':'Срок',date:d.dueOn,title:d.title,case:row});}
 alerts.sort((a,b)=>a.date.localeCompare(b.date));return `<section class="court-proceeding-alerts stack"><div class="row spread"><h4>Сроки и ближайшие заседания</h4><span class="subtle">Не рассмотрено ходатайств: ${pending}</span></div>${alerts.length?alerts.slice(0,20).map(a=>`<article class="justice-result"><div><strong class="${a.kind==='Просрочено'?'court-overdue':''}">${esc(a.kind)} · ${esc(a.date.slice(0,16).replace('T',' '))}</strong><p class="subtle">Дело №${esc(a.case.number)}: ${esc(a.title)}</p></div>${button('open','Открыть дело',a.case.id)}</article>`).join(''):'<p class="subtle">На ближайшие 7 дней заседаний и сроков нет. Просроченных сроков также нет.</p>'}</section>`;}
export function courtCaseSection(state,government,documents=[]){const rows=scope(state,government),courts=rows.filter(r=>r.type==='court'),cases=rows.filter(r=>r.type==='case'),selected=cases.find(r=>r.id===chosenCaseId)||null;
 return `<section class="card stack court-case-panel"><div class="row spread"><div><h3>Судебные дела · 2.0.8</h3><p class="subtle">Регистрация и ведение дел, участники, документы, переходы статусов и журнал действий. Данные сохраняются локально.</p></div>${button('new','+ Судебное дело','','primary')}</div>
 ${proceedingsAlerts(cases)}
 <div class="judicial-form-grid">${field('court-case-search','Поиск по номеру, предмету, участнику и документу',query,160,false).replace('name="court-case-search"','name="court-case-search" id="court-case-search"')}
 ${select('court-case-status-filter','Статус',[{id:'',title:'Все статусы'},...Object.entries(CASE_STATUSES).map(([id,title])=>({id,title}))],filterStatus)}
 ${select('court-case-court-filter','Суд',[{id:'',title:'Все суды'},...courts.map(c=>({id:c.id,title:courtName(c,rows)}))],filterCourt)}</div>
 <div id="court-case-list" class="stack">${caseListHTML(state,government)}</div>
 ${selected?detailHTML(selected,government,documents):''}</section>`;
}
function detailHTML(r,records,documents){const courts=records.filter(c=>c.type==='court'&&c.profileId===r.profileId),court=courts.find(c=>c.id===r.courtId),linked=new Set(r.documents.map(d=>`${d.kind}:${d.id}`));
 const docChoices=[...documents.filter(d=>d.profileId===r.profileId&&d.type==='document').map(d=>({id:d.id,kind:'document',title:d.versions.at(-1).title})),...records.filter(x=>x.profileId===r.profileId&&x.type==='decision').map(d=>({id:d.id,kind:'decision',title:`Решение №${d.caseNumber}: ${d.subject}`})),...records.filter(x=>x.profileId===r.profileId&&x.type==='template').map(d=>({id:d.id,kind:'template',title:d.title}))].filter(d=>!linked.has(`${d.kind}:${d.id}`));
 const active=CASE_TRANSITIONS[r.status]||[];
 let matches=[];try{matches=findCourtJurisdiction(records,r.profileId,{stage:'first',category:r.category,territory:r.territory});}catch{matches=[];}
 const jurisdictionStatus=matches.some(m=>m.court.id===r.courtId)?'Найдено соответствующее правило подсудности':'Подсудность по сохранённым правилам не подтверждена — проверьте вручную';
 return `<section class="card stack court-case-detail" data-case-id="${esc(r.id)}"><div class="row spread"><div><h3>Дело № ${esc(r.number)} — ${esc(r.title)}</h3><p class="subtle">${esc(CASE_STATUSES[r.status])} · ${esc(courtName(court,records))} · Редакция ${r.revision} · Создано ${esc(date(r.createdAt))}</p></div><div class="row">${button('edit','Редактировать',r.id)}${button('close','Закрыть карточку')}</div></div>
 <p>${esc(r.summary||'Описание дела не заполнено.')}</p><p class="subtle">${esc(jurisdictionStatus)}.</p><p class="subtle">Категория: ${esc(r.category)} · Территория: ${esc(r.territory)}${r.judgeAssignmentId?' · Назначенный судья: '+esc(records.find(a=>a.id===r.judgeAssignmentId)?.officer||'недоступен'):''}</p>
 <p class="subtle">Подача: ${esc(date(r.filedAt)||'—')} · Завершение: ${esc(date(r.closedAt)||'—')}</p>
 <h4>Участники (${r.participants.length})</h4><div class="stack">${r.participants.map(p=>`<article class="justice-result"><div><strong>${esc(p.name)}</strong><p class="subtle">${esc(CASE_ROLES[p.role])}${p.notes?' · '+esc(p.notes):''}</p></div><div class="row">${button('participant-edit','Изменить',p.id)}${r.status!=='archived'?`<button type="button" class="button danger" data-court-case-action="participant-remove" data-id="${esc(p.id)}">Удалить</button>`:''}</div></article>`).join('')||'<p class="empty">Участников пока нет.</p>'}</div>
 ${r.status!=='archived'?`<form id="court-case-participant-form" class="stack"><input type="hidden" name="caseId" value="${esc(r.id)}"><h4>Добавить участника</h4><div class="judicial-form-grid">${field('name','ФИО / RP-имя','',150)}${select('role','Процессуальная роль',Object.entries(CASE_ROLES).map(([id,title])=>({id,title})),'claimant')}${field('notes','Примечание','',1000,false)}</div><button type="submit" class="button secondary">Добавить участника</button></form>`:''}
 <h4>Связанные документы (${r.documents.length})</h4><div class="stack">${r.documents.map(d=>`<article class="justice-result"><div><strong>${esc(d.title)}</strong><p class="subtle">${esc(d.kind)} · Добавлено: ${esc(date(d.addedAt))}</p></div><div class="row"><button type="button" class="button secondary" data-justice-action="open" data-kind="${d.kind==='template'?'government-template':d.kind}" data-id="${esc(d.id)}">Открыть</button>${r.status!=='archived' && !(d.kind==='document'&&documents.some(x=>x.id===d.id&&x.procedural?.caseId===r.id))?`<button class="button danger" data-court-case-action="document-remove" data-id="${esc(d.id)}" data-kind="${esc(d.kind)}">Отвязать</button>`:''}</div></article>`).join('')||'<p class="empty">Документы пока не приложены.</p>'}</div>
 ${r.status!=='archived'?`<form id="court-case-document-form" class="stack"><input type="hidden" name="caseId" value="${esc(r.id)}"><h4>Прикрепить существующий документ</h4>${select('link','Документ',docChoices.map(d=>({id:`${d.kind}:${d.id}`,title:`${d.title} (${d.kind})`})),'',true)}<button type="submit" class="button secondary" ${docChoices.length?'':'disabled'}>Прикрепить</button><p class="subtle">Создавать новые файлы можно во вкладке «Документы»; здесь сохраняется связь с реальной записью.</p></form>`:''}
 ${r.status!=='archived'?`<details class="court-procedural-generator"><summary>+ Сформировать процессуальный документ</summary><form id="procedural-generate-form" class="stack"><input type="hidden" name="caseId" value="${esc(r.id)}">${select('kind','Вид документа',Object.entries(PROCEDURAL_KINDS).map(([id,title])=>({id,title})),'claim')}${area('legalBasis','Правовые основания (текст из действующей редакции Law Codex; проверить вручную)','',3500)}${area('resolution','Требования / резолютивная часть (можно заполнить позже в Studio)','',5000)}${field('signer','Подписант (можно указать позже)','',150,false)}<p class="subtle">Суд, дело, стороны, судья, дата и обстоятельства подставляются из сохранённой карточки. Документ будет черновиком; после заполнения обязателен ручной контроль и утверждение. Изменения в деле не переписывают созданную редакцию.</p><button type="submit" class="button primary">Создать черновик и открыть редактор</button></form></details>`:''}
 ${courtEvidenceHTML(r)}
 ${courtProceedingsHTML(r)}
 <h4>Движение дела</h4>${active.length?`<form id="court-case-status-form" class="stack"><input type="hidden" name="caseId" value="${esc(r.id)}">${select('status','Новый статус',active.map(id=>({id,title:CASE_STATUSES[id]})),active[0])}${area('reason','Основание процессуального действия','',600,true)}<button type="submit" class="button primary">Сохранить переход</button></form>`:'<p class="subtle">Доступных переходов нет.</p>'}
 ${r.status!=='archived'?`<form id="court-case-note-form" class="stack"><input type="hidden" name="caseId" value="${esc(r.id)}">${area('note','Запись в журнале дела','',600,true)}<button type="submit" class="button secondary">Добавить запись</button></form>`:''}
 <details><summary>Журнал действий (${r.history.length})</summary><ol class="stack court-case-history">${r.history.slice().reverse().map(h=>`<li><strong>${esc(date(h.at))}</strong> · ${esc(h.description)}${h.from||h.to?` (${esc(CASE_STATUSES[h.from]||h.from)} → ${esc(CASE_STATUSES[h.to]||h.to)})`:''}</li>`).join('')}</ol></details></section>`;
}
function showEditor(state,row,records){const rows=scope(state,records),courts=rows.filter(c=>c.type==='court'&&(c.status==='active'||c.id===row?.courtId)),courtId=row?.courtId||courts[0]?.id||'';
 if(!courts.length)throw Error('Сначала создайте действующий суд в разделе «Суды»');
 const assignments=rows.filter(a=>a.type==='assignment'&&a.departmentId===rows.find(c=>c.id===courtId)?.departmentId&&a.status==='active'&&!a.endedAt);
 const dialog=document.createElement('dialog');document.getElementById('court-case-dialog')?.remove();dialog.id='court-case-dialog';dialog.className='gov-dialog agency-dialog';
 replaceHtml(dialog,`<div class="stack"><div class="row spread"><h3>${row?'Изменить реквизиты':'Регистрация судебного дела'}</h3>${button('dialog-close','Закрыть')}</div><form id="court-case-form" class="stack"><input type="hidden" name="recordId" value="${esc(row?.id||'')}">${select('courtId','Суд',courts.map(c=>({id:c.id,title:courtName(c,rows)})),courtId)}${select('judgeAssignmentId','Судья (назначение в ведомстве суда)',[{id:'',title:'Не назначен'},...assignments.map(a=>({id:a.id,title:a.officer}))],row?.judgeAssignmentId||'',false)}${field('number','Номер дела',row?.number||'',100)}${field('title','Предмет дела',row?.title||'',200)}${field('category','Категория дела',row?.category||'',120)}${field('territory','Территория',row?.territory||'',120)}${area('summary','Обстоятельства дела',row?.summary||'',9000)}<div class="row"><button type="submit" class="button primary">Сохранить</button>${button('dialog-close','Отмена')}</div></form></div>`);
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
function showParticipantEditor(row,p){const dialog=document.createElement('dialog');document.getElementById('court-case-participant-dialog')?.remove();dialog.id='court-case-participant-dialog';dialog.className='gov-dialog agency-dialog';replaceHtml(dialog,`<div class="stack"><h3>Изменить участника</h3><form id="court-case-participant-edit-form" class="stack"><input type="hidden" name="caseId" value="${esc(row.id)}"><input type="hidden" name="participantId" value="${esc(p.id)}">${field('name','ФИО / RP-имя',p.name,150)}${select('role','Роль',Object.entries(CASE_ROLES).map(([id,title])=>({id,title})),p.role)}${field('notes','Примечание',p.notes,1000,false)}<button type="submit" class="button primary">Сохранить</button>${button('dialog-close','Закрыть')}</form></div>`);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();}
export function openCourtCase(id){chosenCaseId=id;}
export async function handleCourtCaseAction(button,state,records,refresh,render,feedback){const action=button.dataset.courtCaseAction,id=button.dataset.id,rows=scope(state,records);if(action==='dialog-close'){button.closest('dialog')?.close();return;}
 if(action==='close'){chosenCaseId='';render();return;}
 if(action==='new'){showEditor(state,null,records);return;}
 const row=rows.find(r=>r.id===(['participant-edit','participant-remove','document-remove'].includes(action)?chosenCaseId:id)&&r.type==='case');if(!row)throw Error('Судебное дело недоступно в этом профиле');
 if(action==='open'){chosenCaseId=row.id;render();return;}
 if(action==='edit'){showEditor(state,row,records);return;}
 if(action==='participant-edit'){const p=row.participants.find(p=>p.id===id);if(!p)throw Error('Участник не найден');showParticipantEditor(row,p);return;}
 if(action==='participant-remove'){if(!confirm('Удалить участника из дела? Действие останется в истории.'))return;await mutateCourtCaseParticipant(row.id,'remove',{id});}
 else if(action==='document-remove'){if(!confirm('Отвязать документ от дела?'))return;await mutateCourtCaseDocument(row.id,'remove',{id,kind:button.dataset.kind});}
 else throw Error('Неизвестное действие судебного дела');await refresh();render();feedback('Дело обновлено');}
export async function handleCourtCaseSubmit(form,state,records,refresh,render,feedback){const values=Object.fromEntries(new FormData(form).entries());const kind=form.getAttribute('id');let row=null;
 if(kind==='court-case-form'){
  const {recordId,...fields}=values;
  const court=records.find(c=>c.id===fields.courtId&&c.profileId===state.activeProfileId&&c.type==='court');if(!court)throw Error('Суд не найден в текущем профиле');
  if(fields.judgeAssignmentId){const a=records.find(x=>x.id===fields.judgeAssignmentId&&x.profileId===state.activeProfileId&&x.type==='assignment'&&x.departmentId===court.departmentId);if(!a)throw Error('Выберите судью из этого суда');}
  if(recordId){const old=await getGovernment(recordId);if(old.type!=='case'||old.profileId!==state.activeProfileId)throw Error('Дело принадлежит другому профилю');row=await editCourtCase(recordId,fields);}else row=await addJudicialCase(state.activeProfileId,fields);
 }else{
  const caseId=values.caseId;const old=await getGovernment(caseId);if(old.type!=='case'||old.profileId!==state.activeProfileId)throw Error('Дело недоступно');
  if(kind==='court-case-participant-form')row=await mutateCourtCaseParticipant(caseId,'add',{name:values.name,role:values.role,notes:values.notes});
  else if(kind==='court-case-participant-edit-form')row=await mutateCourtCaseParticipant(caseId,'edit',{id:values.participantId,name:values.name,role:values.role,notes:values.notes});
  else if(kind==='court-case-status-form')row=await setCourtCaseStatus(caseId,values.status,values.reason);
  else if(kind==='court-case-note-form')row=await addCourtCaseNote(caseId,values.note);
  else if(kind==='procedural-generate-form'){
   const result=await generateCourtCaseDocument(caseId,values.kind,{legalBasis:values.legalBasis,resolution:values.resolution,signer:values.signer},state.profiles.map(p=>p.id));
   row=result.caseRecord;
   chosenCaseId=row.id;
   await refreshDocuments();await refresh();render();
   await handleDocumentAction({dataset:{documentAction:'edit-document',id:result.document.id}},state,render,feedback);
   feedback('Процессуальный черновик создан, приложен к делу и открыт в Document Studio');return;
  }
  else if(kind==='court-case-document-form'){
   const [linkKind,id]=String(values.link??'').split(':');const doc=linkKind==='document'?null:records.find(r=>r.id===id&&r.profileId===state.activeProfileId);const documents=(await import('../lib/document-store.mjs')).listDocumentRecords;const linked=linkKind==='document'?(await documents()).find(r=>r.id===id&&r.profileId===state.activeProfileId&&r.type==='document'):doc;
   if(!linked||!['document','decision','template'].includes(linkKind)||linkKind==='decision'&&linked.type!=='decision'||linkKind==='template'&&linked.type!=='template')throw Error('Документ отсутствует в текущем профиле');
   row=await mutateCourtCaseDocument(caseId,'add',{id,kind:linkKind,title:linkKind==='document'?linked.versions.at(-1).title:linkKind==='decision'?`Решение №${linked.caseNumber}: ${linked.subject}`:linked.title});
  }else throw Error('Неизвестная операция с делом');
 }
 chosenCaseId=row.id;form.closest('dialog')?.close();await refresh();render();feedback('Судебное дело сохранено');}
