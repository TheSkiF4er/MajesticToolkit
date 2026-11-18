// Judicial System 2.0.4 — real CRUD/routing backed by existing Government Store.
import '../lib/safe-dom.js';
import {escapeHtml as e} from '../lib/sites.mjs';
import {COURT_LEVELS,COURT_STAGES,findCourtJurisdiction,agencyRoster} from '../lib/government-core.mjs';
import {getGovernment,listGovernment,addCourt,updateCourt,addCourtJurisdiction,updateCourtJurisdiction,deleteGovernment} from '../lib/government-store.mjs';
const {replaceHtml}=globalThis.MTSafeDOM;
let tab='registry', route=null;
const esc=v=>e(String(v??''));
const btn=(action,label,id='',kind='',style='secondary')=>`<button type="button" class="button ${style}" data-court-action="${action}" data-id="${esc(id)}" data-kind="${esc(kind)}">${esc(label)}</button>`;
const option=(id,title,selected='')=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(title)}</option>`;
const select=(name,label,choices,value='',empty='Выберите',required=false)=>`<label class="field">${esc(label)}<select name="${esc(name)}" ${required?'required':''}>${required?'':option('',empty,value)}${choices.map(c=>option(c.id,c.title,value)).join('')}</select></label>`;
const input=(name,label,value='',max=120,required=true)=>`<label class="field">${esc(label)}<input name="${esc(name)}" value="${esc(value)}" maxlength="${max}" ${required?'required':''}></label>`;
const area=(name,label,value='',max=2000,required=false)=>`<label class="field">${esc(label)}<textarea rows="3" maxlength="${max}" name="${esc(name)}" ${required?'required':''}>${esc(value)}</textarea></label>`;
const active=state=>state.activeProfileId;
const scope=(state,records)=>records.filter(r=>r.profileId===active(state));
const courtInfo=(rows,c)=>rows.find(x=>x.type==='department'&&x.id===c.departmentId);
export function setCourtTab(value){if(!['registry','jurisdiction','route'].includes(value))throw Error('Недоступный раздел судебной системы');tab=value;}
function courtTree(courts){const items=[];const walk=(parent,depth)=>{for(const court of courts.filter(c=>c.parentCourtId===parent).sort((a,b)=>a.level.localeCompare(b.level)||a.id.localeCompare(b.id))){items.push({...court,depth});walk(court.id,depth+1);}};walk('',0);return items;}
export function courtRegistrySection(state,government){
 const rows=scope(state,government),courts=rows.filter(r=>r.type==='court'),rules=rows.filter(r=>r.type==='jurisdiction'),deps=rows.filter(r=>r.type==='department');
 const legacy=deps.filter(d=>/(?:суд|court|judicial)/iu.test([d.name,d.code,d.jurisdiction].join(' '))&&!courts.some(c=>c.departmentId===d.id));
 const showTab=(value,label,count)=>`<button type="button" class="button ${tab===value?'primary':'secondary'}" data-court-action="tab" data-tab="${value}" aria-pressed="${tab===value}">${label}${count===undefined?'':` (${count})`}</button>`;
 return `<section class="card stack judicial-panel"><div class="row spread"><div><h3>Судебная система · 2.0.4</h3><p class="subtle">Явный реестр судов, связь с ведомствами, иерархия инстанций и настраиваемая RP-подсудность. Данные локальные и ограничены текущим профилем.</p></div><div class="row">${btn('new-court','+ Суд','','','primary')}<button class="button secondary" type="button" data-government-action="new-department">+ Ведомство для суда</button></div></div>
 <div class="agency-tabs" role="group" aria-label="Судебные инструменты">${showTab('registry','Суды и иерархия',courts.length)}${showTab('jurisdiction','Правила подсудности',rules.length)}${showTab('route','Проверить подсудность')}</div>
 ${tab==='registry'?courtRegistryHTML(rows,courts,rules,legacy):tab==='jurisdiction'?jurisdictionHTML(rows,courts,rules):routeHTML(state,government,courts,rules)}
 <p class="subtle">Подсудность определяется настроенными пользователем RP-правилами, а не автоматически проверенным законодательством. Совпадения служат подсказкой для ручной проверки.</p></section>`;
}
function courtRegistryHTML(rows,courts,rules,legacy){return `<div class="stack"><p class="subtle">Вышестоящий суд указан в карточке нижестоящего. Архивные суды исключены из подбора подсудности.</p>
 ${courtTree(courts).map(c=>{const dep=courtInfo(rows,c),parent=courts.find(x=>x.id===c.parentCourtId),staff=agencyRoster(rows,c.departmentId).filter(r=>r.status==='active'&&!r.endedAt&&r.position?.status==='active');const decisions=rows.filter(r=>r.type==='decision'&&r.departmentId===c.departmentId);
 return `<article class="gov-item judicial-court" style="--agency-depth:${Math.min(c.depth,7)}"><div><strong>${esc(dep?.name||'Недоступное ведомство')} (${esc(dep?.code||'')})</strong><p class="subtle">${esc(COURT_LEVELS[c.level])} · ${c.status==='active'?'Действует':'Архив'}${parent?' · Вышестоящий: '+esc(courtInfo(rows,parent)?.name||''):' · Верхний узел'}</p>${c.venue?`<p>Место заседаний: ${esc(c.venue)}</p>`:''}${c.description?`<p>${esc(c.description)}</p>`:''}<p class="subtle">Правил подсудности: ${rules.filter(r=>r.courtId===c.id).length} · Назначений: ${staff.length} · Решений: ${decisions.length}</p>
 ${staff.length?`<details><summary>Состав и должностные лица (${staff.length})</summary><ul>${staff.map(r=>`<li>${esc(r.officer)} — ${esc(r.position?.title||'Должность недоступна')} (${esc(r.startedAt)})</li>`).join('')}</ul></details>`:''}</div><div class="row judicial-actions">${btn('edit-court','Настроить',c.id)}${btn('new-rule','+ Подсудность',c.id)}${btn('toggle',c.status==='active'?'В архив':'Восстановить',c.id,'court')}${btn('delete','Удалить',c.id,'court','danger')}</div></article>`;}).join('')||'<p class="empty">Суды пока не настроены. Создайте ведомство или привяжите существующее.</p>'}
 ${legacy.length?`<section class="stack"><h4>Судебные ведомства без судебного профиля (${legacy.length})</h4>${legacy.map(d=>`<article class="justice-result"><div><strong>${esc(d.name)}</strong><p class="subtle">${esc(d.jurisdiction)} · ${esc(d.officer)} · ${esc(d.position)}</p></div>${btn('new-court','Настроить суд',d.id)}</article>`).join('')}</section>`:''}</div>`;}
function jurisdictionHTML(rows,courts,rules){return `<div class="stack"><div class="row spread"><p class="subtle">Категория и территория могут быть точным текстом или символом * (все). Для каждого правила требуется указанное пользователем правовое основание.</p>${btn('new-rule','+ Правило','','','primary')}</div>
 ${rules.slice().sort((a,b)=>(a.status==='archived')-(b.status==='archived')||b.priority-a.priority).map(r=>{const c=courts.find(c=>c.id===r.courtId);const dep=c&&courtInfo(rows,c);return `<article class="gov-item"><div><strong>${esc(r.category)} · ${esc(r.territory)}</strong><p class="subtle">${esc(dep?.name||'Суд недоступен')} · ${esc(COURT_STAGES[r.stage])} · ${r.status==='active'?'Действует':'Архив'} · Приоритет: ${r.priority}</p><p>${esc(r.legalBasis)}</p></div><div class="row judicial-actions">${btn('edit-rule','Изменить',r.id)}${btn('toggle',r.status==='active'?'В архив':'Восстановить',r.id,'jurisdiction')}${btn('delete','Удалить',r.id,'jurisdiction','danger')}</div></article>`;}).join('')||'<p class="empty">Нет правил подсудности. Добавьте правило для конкретного суда.</p>'}</div>`;}
function routeHTML(state,government,courts,rules){const values=route?.profileId===active(state)?route.values:{};const choices=Object.entries(COURT_STAGES).map(([id,title])=>({id,title}));const allowed=courts.filter(c=>c.status==='active').map(c=>({id:c.id,title:courtInfo(government,c)?.name||'Суд недоступен'}));
 return `<div class="stack"><form id="court-route-form" class="stack"><div class="judicial-form-grid">${select('stage','Стадия производства',choices,values.stage||'first','',true)}${input('category','Категория дела',values.category||'',120)}${input('territory','Территория',values.territory||'',120)}${select('originCourtId','Исходная инстанция для обжалования',allowed,values.originCourtId||'','Нет')}</div><button type="submit" class="button primary">Проверить подсудность</button></form>
 ${route?.profileId===active(state)?`<section class="stack" aria-live="polite"><h4>Найденные варианты: ${route.results.length}</h4>${route.results.length>1?'<p class="subtle">Несколько судов подходят под запрос. Проверьте основания вручную; автоматический выбор суда не производится.</p>':''}${route.results.map(item=>`<article class="justice-result"><div><strong>${esc(item.department.name)}</strong><p class="subtle">${esc(COURT_LEVELS[item.court.level])} · Категория: ${esc(item.rule.category)} · Территория: ${esc(item.rule.territory)} · Приоритет: ${item.rule.priority}</p><p>Основание: ${esc(item.rule.legalBasis)}</p></div>${btn('edit-court','Суд',item.court.id)}</article>`).join('')||'<p class="empty">Подходящие действующие правила не найдены. Проверьте конфигурацию судов и подсудности.</p>'}</section>`:'<p class="subtle">Укажите параметры дела, чтобы увидеть подходящие суды и основания из сохранённых правил.</p>'}</div>`;
}
function showDialog(kind,record,records,departmentId=''){
 const court=kind==='court',courts=records.filter(x=>x.type==='court'),deps=records.filter(x=>x.type==='department'&&x.status!=='archived'&&(court?!courts.some(c=>c.departmentId===x.id&&c.id!==record?.id):true));
 const fields=court?
 `${select('departmentId','Судебное ведомство',deps.map(d=>({id:d.id,title:`${d.name} (${d.code})`})),record?.departmentId||departmentId,'',true)}${select('level','Тип инстанции',Object.entries(COURT_LEVELS).map(([id,title])=>({id,title})),record?.level||'first','',true)}${select('parentCourtId','Вышестоящий суд',courts.filter(c=>c.id!==record?.id&&c.status==='active').map(c=>({id:c.id,title:records.find(d=>d.id===c.departmentId)?.name||c.id})),record?.parentCourtId||'','Верхняя инстанция')}${input('venue','Место заседаний',record?.venue||'',180,false)}${area('description','Описание и особенности компетенции',record?.description)}${select('status','Состояние',[{id:'active',title:'Действует'},{id:'archived',title:'Архив'}],record?.status||'active','',true)}`:
 `${select('courtId','Суд',courts.filter(c=>c.status==='active'||c.id===record?.courtId).map(c=>({id:c.id,title:records.find(d=>d.id===c.departmentId)?.name||c.id})),record?.courtId||departmentId,'',true)}${select('stage','Стадия',Object.entries(COURT_STAGES).map(([id,title])=>({id,title})),record?.stage||'first','',true)}${input('category','Категория (* — все)',record?.category||'*')}${input('territory','Территория (* — все)',record?.territory||'*')}${area('legalBasis','Правовое основание (RP-норма)',record?.legalBasis||'',1500,true)}<label class="field">Приоритет (0–100)<input type="number" min="0" max="100" step="1" name="priority" value="${record?.priority??0}" required></label>${select('status','Состояние',[{id:'active',title:'Действует'},{id:'archived',title:'Архив'}],record?.status||'active','',true)}`;
 if(court&&!deps.length)throw Error('Нет свободных действующих ведомств. Сначала создайте ведомство или восстановите архивное.');
 if(!court&&!courts.length)throw Error('Сначала настройте судебный профиль.');
 document.getElementById('judicial-dialog')?.remove();const dialog=document.createElement('dialog');dialog.id='judicial-dialog';dialog.className='gov-dialog judicial-dialog';
 replaceHtml(dialog,`<div class="stack"><div class="row spread"><h3>${record?'Изменить':'Создать'} · ${court?'суд':'правило подсудности'}</h3>${btn('close','Закрыть')}</div><form id="judicial-form" class="stack"><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="recordId" value="${esc(record?.id||'')}">${fields}<div class="row"><button class="button primary" type="submit">Сохранить</button>${btn('close','Отмена')}</div></form></div>`);
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
export async function handleCourtAction(button,state,records,refresh,render,feedback){
 const action=button.dataset.courtAction,id=button.dataset.id,kind=button.dataset.kind;
 if(action==='tab'){setCourtTab(button.dataset.tab);render();return;}
 if(action==='close'){button.closest('dialog')?.close();return;}
 const rows=scope(state,records);
 if(action==='new-court'||action==='new-rule'){showDialog(action==='new-court'?'court':'jurisdiction',null,rows,id);return;}
 const row=rows.find(r=>r.id===id);
 if(!row||!['court','jurisdiction'].includes(row.type))throw Error('Запись суда недоступна в текущем профиле');
 if(action==='edit-court'||action==='edit-rule'){showDialog(row.type,row,rows);return;}
 if(action==='toggle'){const status=row.status==='active'?'archived':'active';if(!confirm(`${status==='active'?'Восстановить':'Архивировать'} запись?`))return;const update=row.type==='court'?updateCourt:updateCourtJurisdiction;await update(row.id,{...row,status});}
 else if(action==='delete'){if(!confirm('Удалить запись? Связанные записи блокируют удаление.'))return;await deleteGovernment(id);}
 else throw Error('Неизвестная операция судебной системы');
 route=null;await refresh();render();feedback('Судебный реестр сохранён');
}
export async function handleCourtSubmit(form,state,refresh,render,feedback){
 const values=Object.fromEntries(new FormData(form).entries());
 if(form.id==='court-route-form'){
   const results=findCourtJurisdiction(scope(state,await listGovernment()),state.activeProfileId,values);
   route={profileId:active(state),values,results};render();return;
 }
 if(form.id!=='judicial-form')throw Error('Неизвестная форма суда');
 const {kind,recordId,...fields}=values,all=await listGovernment();
 if(kind==='court'){
   const dept=all.find(r=>r.id===fields.departmentId&&r.profileId===active(state)&&r.type==='department');if(!dept)throw Error('Судебное ведомство отсутствует в текущем профиле');
 }else if(kind==='jurisdiction'){
   const court=all.find(r=>r.id===fields.courtId&&r.profileId===active(state)&&r.type==='court');if(!court)throw Error('Суд отсутствует в текущем профиле');
   fields.priority=Number(fields.priority);
 }else throw Error('Неизвестный тип записи суда');
 if(recordId){const original=await getGovernment(recordId);if(original.profileId!==active(state)||original.type!==kind)throw Error('Запись другого профиля');await (kind==='court'?updateCourt:updateCourtJurisdiction)(recordId,fields);}
 else await (kind==='court'?addCourt:addCourtJurisdiction)(active(state),fields);
 form.closest('dialog')?.close();route=null;await refresh();render();feedback('Судебная система сохранена');
}
