// Government Agencies 2.0.3. Real CRUD over the existing profile-scoped Government Store.
import '../lib/safe-dom.js';
import {escapeHtml as e} from '../lib/sites.mjs';
import {getGovernment,addAgencyUnit,updateAgencyUnit,addAgencyPosition,updateAgencyPosition,addAgencyCompetence,updateAgencyCompetence,addAgencyAssignment,updateAgencyAssignment,deleteGovernment} from '../lib/government-store.mjs';
import {agencyRoster} from '../lib/government-core.mjs';
const {replaceHtml}=globalThis.MTSafeDOM;
const TYPES=['departments','units','positions','competences','assignments'];
const LABELS={departments:'Ведомства',units:'Подразделения',positions:'Должности',competences:'Компетенции',assignments:'Назначения'};
const ACTION_TYPES={unit:[addAgencyUnit,updateAgencyUnit],position:[addAgencyPosition,updateAgencyPosition],competence:[addAgencyCompetence,updateAgencyCompetence],assignment:[addAgencyAssignment,updateAgencyAssignment]};
let tab='departments',filter='',query='';
const by=(rows,type)=>rows.filter(r=>r.type===type);
const agencyItems=(state,all)=>all.filter(r=>r.profileId===state.activeProfileId);
const esc=value=>e(String(value??''));
const option=(id,title,selected)=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(title)}</option>`;
const input=(name,title,value='',max=120,required=true)=>`<label class="field">${esc(title)}<input name="${esc(name)}" value="${esc(value)}" maxlength="${max}" ${required?'required':''}></label>`;
const area=(name,title,value='',max=2000,required=false)=>`<label class="field">${esc(title)}<textarea name="${esc(name)}" maxlength="${max}" rows="3" ${required?'required':''}>${esc(value)}</textarea></label>`;
const select=(name,title,rows,current='',empty='Не выбрано',required=false)=>`<label class="field">${esc(title)}<select name="${esc(name)}" ${required?'required':''}>${required?'':option('',empty,current)}${rows.map(r=>option(r.id,r.title||r.name,current)).join('')}</select></label>`;
const statusChoice=value=>`<label class="field">Состояние<select name="status">${option('active','Действует',value)}${option('archived','Архив',value)}</select></label>`;
const action=(type,id,verb,label,style='secondary')=>`<button type="button" class="button ${style}" data-agency-action="${verb}" data-type="${esc(type)}" data-id="${esc(id)}">${esc(label)}</button>`;
const names=(row,records)=>({department:records.find(r=>r.id===row.departmentId)?.name||'Ведомство недоступно',unit:records.find(r=>r.id===row.unitId)?.name||'Вне подразделения',position:records.find(r=>r.id===row.positionId)?.title||'Должность недоступна'});
export function setAgencyTab(value){if(!TYPES.includes(value))throw Error('Неизвестный раздел реестра');tab=value;}
export function setAgencyFilter(value){filter=String(value||'');}
export function setAgencyQuery(value){query=String(value||'').slice(0,160);}
const matches=(row,all)=>{if(!query.trim())return true;const refs=names(row,all);const text=[...Object.values(refs),...Object.values(row).filter(v=>typeof v==='string'),...(row.competenceIds||[]).map(id=>all.find(r=>r.id===id)?.title||'')].join(' ').toLocaleLowerCase('ru');return query.trim().toLocaleLowerCase('ru').split(/\s+/u).every(t=>text.includes(t));};
const buttons=(r)=>`<div class="row agency-row-actions">${action(r.type,r.id,'edit','Изменить')}${action(r.type,r.id,'toggle-status',r.status==='archived'?'Восстановить':'В архив')}${action(r.type,r.id,'delete','Удалить','danger')}</div>`;
const departmentButtons=d=>`<div class="row agency-row-actions"><button class="button secondary" data-government-action="edit-department" data-id="${esc(d.id)}">Изменить</button>${action('department',d.id,'view','Структура')}${action('department',d.id,'toggle-status',d.status==='archived'?'Восстановить':'В архив')}${action('department',d.id,'delete','Удалить','danger')}</div>`;
function treeItems(items,all){
 const ordered=[];const visit=(parent,depth)=>{for(const u of items.filter(x=>x.parentUnitId===parent).sort((a,b)=>a.name.localeCompare(b.name,'ru'))){ordered.push({...u,depth});visit(u.id,depth+1);}};
 visit('',0);return ordered;
}
function agencyCard(r,all){const name=names(r,all);
 if(r.type==='department')return `<article class="gov-item agency-record"><div><strong>${esc(r.name)} (${esc(r.code)})</strong><p class="subtle">${esc(r.jurisdiction||'Юрисдикция не указана')} · ${r.status==='archived'?'Архив':'Действует'}</p><p>${esc(r.officer)} · ${esc(r.position)}</p>${r.description?`<p>${esc(r.description)}</p>`:''}<p class="subtle">Подразделений: ${all.filter(x=>x.type==='unit'&&x.departmentId===r.id).length} · Должностей: ${all.filter(x=>x.type==='position'&&x.departmentId===r.id).length} · Назначений: ${all.filter(x=>x.type==='assignment'&&x.departmentId===r.id&&!x.endedAt&&x.status==='active').length}</p></div>${departmentButtons(r)}</article>`;
 if(r.type==='unit')return `<article class="gov-item agency-record" style="--agency-depth:${Math.min(r.depth||0,7)}"><div><strong>${esc(r.code)} · ${esc(r.name)}</strong><p class="subtle">${esc(name.department)} · ${r.parentUnitId?`Входит в ${esc(all.find(x=>x.id===r.parentUnitId)?.name||'')}`:'Корневое подразделение'} · ${r.status==='archived'?'Архив':'Действует'}</p>${r.description?`<p>${esc(r.description)}</p>`:''}</div>${buttons(r)}</article>`;
 if(r.type==='competence')return `<article class="gov-item agency-record"><div><strong>${esc(r.code)} · ${esc(r.title)}</strong><p class="subtle">${esc(name.department)} · ${r.status==='archived'?'Архив':'Действует'}</p><p>${esc(r.description)}</p>${r.legalBasis?`<p class="subtle">Основание: ${esc(r.legalBasis)}</p>`:''}<p class="subtle">Применяется к должностям: ${all.filter(x=>x.type==='position'&&x.competenceIds?.includes(r.id)).length}</p></div>${buttons(r)}</article>`;
 if(r.type==='position')return `<article class="gov-item agency-record"><div><strong>${esc(r.title)}${r.rank?' · '+esc(r.rank):''}</strong><p class="subtle">${esc(name.department)} · ${esc(name.unit)} · ${r.status==='archived'?'Архив':'Действует'}</p>${r.description?`<p>${esc(r.description)}</p>`:''}<p class="subtle">Компетенции: ${r.competenceIds.length?r.competenceIds.map(id=>esc(all.find(x=>x.id===id)?.title||'Недоступна')).join(', '):'Не назначены'}</p></div>${buttons(r)}</article>`;
 return `<article class="gov-item agency-record"><div><strong>${esc(r.officer)} · ${esc(name.position)}</strong><p class="subtle">${esc(name.department)} · ${esc(all.find(x=>x.id===all.find(p=>p.id===r.positionId)?.unitId)?.name||'Вне подразделения')} · ${r.endedAt?'Завершено '+esc(r.endedAt):r.status==='archived'?'Архив':'Действует с '+esc(r.startedAt)}</p>${r.notes?`<p>${esc(r.notes)}</p>`:''}${r.history.length?`<details><summary>История изменений (${r.history.length})</summary><ol class="agency-history">${r.history.map(h=>`<li>${esc(h.changedAt.slice(0,16).replace('T',' '))} · ${esc(h.officer)} · ${esc(all.find(p=>p.id===h.positionId)?.title||'Должность недоступна')} · ${esc(h.startedAt)}${h.endedAt?' — '+esc(h.endedAt):''}${h.reason?' · '+esc(h.reason):''}</li>`).join('')}</ol></details>`:''}</div>${buttons(r)}</article>`;
}
export function agencyListHTML(state,records){
 const all=agencyItems(state,records),departments=by(all,'department');
 const selected=departments.some(d=>d.id===filter)?filter:'';
 let result=tab==='departments'?departments:by(all,{units:'unit',positions:'position',competences:'competence',assignments:'assignment'}[tab]).filter(r=>!selected||r.departmentId===selected);
 if(tab==='units')result=treeItems(result,all);
 else result=result.slice().sort((a,b)=>(a.status==='archived')-(b.status==='archived')||a.name?.localeCompare(b.name,'ru')||a.title?.localeCompare(b.title,'ru')||b.updatedAt.localeCompare(a.updatedAt));
 result=result.filter(r=>matches(r,all));
 return `<p class="subtle" role="status">Показано ${result.length} записей · Только текущий профиль</p>${result.map(r=>agencyCard(r,all)).join('')||'<p class="empty">Совпадений нет. Добавьте запись или измените фильтр.</p>'}`;
}
export function agencySection(state,records){
 const all=agencyItems(state,records),deps=by(all,'department'),selected=deps.some(d=>d.id===filter)?filter:'';
 const counts={departments:deps.length,units:by(all,'unit').length,positions:by(all,'position').length,competences:by(all,'competence').length,assignments:by(all,'assignment').length};
 return `<section class="card stack agency-panel"><div class="row spread"><div><h3>Government Agencies · 2.0.3</h3><p class="subtle">Реестр ведомств, подразделений, должностей, компетенций и сотрудников. Изменения сохраняются локально по профилю.</p></div><div class="row"><button type="button" class="button primary" data-government-action="new-department">+ Ведомство</button>${tab!=='departments'?action(tab.slice(0,-1),'','new','+ '+({units:'Подразделение',positions:'Должность',competences:'Компетенция',assignments:'Назначение'}[tab])):''}</div></div>
 <div class="agency-tabs" role="group" aria-label="Разделы государственного реестра">${TYPES.map(t=>`<button type="button" class="button ${tab===t?'primary':'secondary'}" data-agency-action="tab" data-tab="${t}" aria-pressed="${tab===t}">${LABELS[t]} (${counts[t]})</button>`).join('')}</div>
 <div class="agency-filters"><label class="field">Ведомство<select id="agency-filter"><option value="">Все ведомства</option>${deps.map(d=>option(d.id,d.name,selected)).join('')}</select></label><label class="field">Поиск по реестру<input type="search" id="agency-search" maxlength="160" value="${esc(query)}" placeholder="Код, сотрудник, полномочие…"></label>${tab==='assignments'&&selected?action('department',selected,'export-roster','Экспорт CSV'):''}</div>
 <div class="stack" id="agency-results">${agencyListHTML(state,records)}</div>
 <p class="subtle">Компетенции — документируемые RP-полномочия, а не реальные права доступа к игровому серверу. Архивные записи сохраняют связи и историю.</p></section>`;
}
function fieldsFor(type,r,records,departmentId){const all=records.filter(x=>x.departmentId===departmentId),units=by(all,'unit'),positions=by(all,'position'),competences=by(all,'competence');
 const head=`<p class="subtle">Ведомство: ${esc(records.find(d=>d.id===departmentId)?.name||'Недоступно')}</p><input type="hidden" name="departmentId" value="${esc(departmentId)}">`;
 if(type==='unit')return head+input('name','Название подразделения',r?.name)+input('code','Уникальный код',r?.code,35)+select('parentUnitId','Родительское подразделение',units.filter(u=>u.id!==r?.id),r?.parentUnitId||'','Корневое подразделение')+area('description','Назначение подразделения',r?.description)+statusChoice(r?.status||'active');
 if(type==='competence')return head+input('title','Наименование компетенции',r?.title,140)+input('code','Уникальный код',r?.code,35)+area('description','Описание полномочия',r?.description,3000,true)+area('legalBasis','Правовое основание (вводится пользователем)',r?.legalBasis,1500)+statusChoice(r?.status||'active');
 if(type==='position')return head+input('title','Должность',r?.title)+input('rank','Звание / уровень',r?.rank,90,false)+select('unitId','Подразделение',units,r?.unitId||'','Без подразделения')+area('description','Обязанности',r?.description)+`<fieldset class="agency-competence-select"><legend>Компетенции должности</legend>${competences.length?competences.map(c=>`<label class="check"><input type="checkbox" name="competenceIds" value="${esc(c.id)}" ${r?.competenceIds?.includes(c.id)?'checked':''}>${esc(c.code)} · ${esc(c.title)}${c.status==='archived'?' (архив)':''}</label>`).join(''):'<p class="subtle">Сначала создайте компетенции, чтобы назначать их должностям.</p>'}</fieldset>`+statusChoice(r?.status||'active');
 const date=new Date().toISOString().slice(0,10);
 return head+input('officer','ФИО / RP-имя сотрудника',r?.officer,120)+select('positionId','Должность',positions.filter(p=>p.status==='active'||p.id===r?.positionId),r?.positionId||'', 'Выберите должность',true)+`<div class="agency-date-fields"><label class="field">Дата назначения<input type="date" name="startedAt" value="${esc(r?.startedAt||date)}" required></label><label class="field">Дата завершения<input type="date" name="endedAt" value="${esc(r?.endedAt||'')}"></label></div>`+area('notes','Примечание',r?.notes,1500)+statusChoice(r?.status||'active')+(r?input('reason','Причина изменения для истории', '',500,false):'');
}
function openAgencyDialog(type,record,records,departmentId){
 const dialog=document.createElement('dialog');document.getElementById('agency-dialog')?.remove();dialog.id='agency-dialog';dialog.className='gov-dialog agency-dialog';
 const label={unit:'Подразделение',position:'Должность',competence:'Компетенция',assignment:'Назначение'}[type];
 replaceHtml(dialog,`<div class="stack"><div class="row spread"><h3>${record?'Изменить':'Создать'} · ${label}</h3><button type="button" class="button secondary" data-agency-action="close">Закрыть</button></div><form id="agency-form" class="stack"><input type="hidden" name="recordId" value="${esc(record?.id||'')}"><input type="hidden" name="recordType" value="${esc(type)}">${fieldsFor(type,record,records,departmentId)}<div class="row"><button type="submit" class="button primary">Сохранить</button><button type="button" class="button secondary" data-agency-action="close">Отмена</button></div></form></div>`);
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
const downloadCSV=(filename,contents)=>{const blob=new Blob(['\uFEFF'+contents],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);};
const csvCell=v=>{const val=String(v??'');const safe=/^[\s]*[=+\-@\t\r]/.test(val)?"'"+val:val;return '"'+safe.replace(/"/g,'""')+'"';};
export function rosterCSV(records,departmentId){
 const rows=agencyRoster(records,departmentId).sort((a,b)=>a.officer.localeCompare(b.officer,'ru'));
 return [['Сотрудник','Должность','Подразделение','Дата назначения','Дата завершения','Статус','Компетенции','Примечание'],...rows.map(r=>[r.officer,r.position?.title||'',r.unit?.name||'',r.startedAt,r.endedAt,r.status,r.competences.map(c=>c.title).join('; '),r.notes])].map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
export async function handleAgencyAction(button,state,records,refresh,render,feedback){
 const act=button.dataset.agencyAction,type=button.dataset.type,id=button.dataset.id;
 if(act==='tab'){setAgencyTab(button.dataset.tab);render();return;}
 if(act==='close'){button.closest('dialog')?.close();return;}
 if(act==='view'){const d=records.find(r=>r.id===id&&r.profileId===state.activeProfileId&&r.type==='department');if(!d)throw Error('Ведомство не найдено');filter=d.id;tab='units';render();return;}
 if(act==='export-roster'){const d=records.find(r=>r.id===id&&r.profileId===state.activeProfileId&&r.type==='department');if(!d)throw Error('Ведомство не найдено');downloadCSV(`majestic-agency-roster-${d.code.replace(/[^\w-]/g,'_')}-${new Date().toISOString().slice(0,10)}.csv`,rosterCSV(records,id));feedback('Штатный реестр экспортирован');return;}
 if(act==='new'){
  const deps=agencyItems(state,records).filter(r=>r.type==='department'&&r.status!=='archived');
  const dep=deps.find(d=>d.id===filter)||deps[0];if(!dep)throw Error('Сначала создайте действующее ведомство');
  if(type==='assignment'&&!agencyItems(state,records).some(r=>r.type==='position'&&r.departmentId===dep.id&&r.status==='active'))throw Error('Сначала создайте должность');
  openAgencyDialog(type,null,records,dep.id);return;
 }
 const row=records.find(r=>r.id===id&&r.profileId===state.activeProfileId);
 if(!row||(!ACTION_TYPES[row.type]&&row.type!=='department'))throw Error('Запись отсутствует в текущем профиле');
 if(act==='edit'){openAgencyDialog(type,row,records,row.departmentId);return;}
 if(act==='toggle-status'){
  const status=row.status==='archived'?'active':'archived';
  if(!confirm(`${status==='archived'?'Архивировать':'Восстановить'} «${row.name||row.title||row.officer}»?`))return;
  if(row.type==='department'){
   const {updateDepartment}=await import('../lib/government-store.mjs');await updateDepartment(id,{...row,status});
  }else{
   const [_,update]=ACTION_TYPES[row.type];await update(id,{...row,status,reason:'Изменение статуса'});
  }
  await refresh();render();feedback('Статус обновлён');return;
 }
 if(act==='delete'){
  if(!confirm(`Удалить запись «${row.name||row.title||row.officer}»? Если есть связанные данные, удаление будет заблокировано.`))return;
  await deleteGovernment(id);await refresh();render();feedback('Запись удалена');return;
 }
 throw Error('Неизвестное действие Government Agencies');
}
export async function handleAgencySubmit(event,state,refresh,render,feedback){
 const form=event.target,values=Object.fromEntries(new FormData(form).entries()),id=values.recordId,type=values.recordType;
 if(!ACTION_TYPES[type])throw Error('Неизвестный тип записи');
 const savedDepartment=await getGovernment(values.departmentId);
 if(savedDepartment.profileId!==state.activeProfileId||savedDepartment.type!=='department')throw Error('Ведомство не принадлежит текущему профилю');
 if(savedDepartment.status==='archived'&&!id)throw Error('Нельзя добавлять записи в архивное ведомство');
 if(type==='position')values.competenceIds=Array.from(new FormData(form).getAll('competenceIds'));
 const [add,update]=ACTION_TYPES[type];
 if(id){const old=await getGovernment(id);if(old.profileId!==state.activeProfileId||old.type!==type||old.departmentId!==values.departmentId)throw Error('Запись другого ведомства или профиля');await update(id,values);}
 else await add(state.activeProfileId,values);
 form.closest('dialog')?.close();await refresh();render();feedback('Реестр ведомства сохранён');
}
