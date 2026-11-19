/** Organizations & Assets 2.1.5 — editable hierarchy, staff and owned assets. */
import '../lib/safe-dom.js';
import {escapeHtml as e} from '../lib/sites.mjs';
import {formatCurrency} from '../lib/economy-core.mjs';
import {ORGANIZATION_TYPES,ASSET_TYPES,organizationAssetsCsv} from '../lib/organization-core.mjs';
import {listOrganizations,addOrganization,updateOrganization,removeOrganization} from '../lib/organization-store.mjs';
import {loadInventory} from '../lib/inventory-store.mjs';
const {replaceHtml}=globalThis.MTSafeDOM;
const types={business:'Бизнес',criminal:'Криминальная',government:'Государственная',community:'Сообщество',other:'Другая'};
const assets={vehicle:'Транспорт',property:'Недвижимость',equipment:'Оборудование',other:'Прочее'};
const today=()=>new Date().toISOString().slice(0,10);
const field=(name,label,value='',type='text',attrs='')=>`<label class="field">${e(label)}<input name="${e(name)}" type="${e(type)}" value="${e(String(value))}" ${attrs}></label>`;
const choose=(name,label,rows,selected='')=>`<label class="field">${e(label)}<select name="${e(name)}">${rows.map(([v,t])=>`<option value="${e(v)}" ${v===selected?'selected':''}>${e(t)}</option>`).join('')}</select></label>`;
const btn=(action,label,attrs='',kind='secondary')=>`<button type="button" class="button ${kind}" data-org-action="${action}" ${attrs}>${e(label)}</button>`;
const attrs=id=>`data-id="${e(id)}"`;
let records=[],selected=new Map(),queries=new Map(),stock=null,stockProfile='';
export async function refreshOrganizations(profileId=null){records=await listOrganizations();if(profileId){stock=await loadInventory(profileId);stockProfile=profileId;}return records;}
export function setOrganizationQuery(profileId,value){queries.set(profileId,String(value||'').slice(0,120));}
const namedUnit=(org,id)=>!id?'Без подразделения':org.units.find(x=>x.id===id)?.name||'Неизвестное подразделение';
const namedPosition=(org,id)=>org.positions.find(x=>x.id===id)?.name||'Должность удалена';
const namedMember=(org,id)=>!id?'Не назначен':org.members.find(x=>x.id===id)?.player||'Нет участника';
function orgStock(org){return stockProfile===org.profileId?stock?.stock.filter(r=>r.ownerType==='organization'&&r.ownerName.toLocaleLowerCase('ru')===org.name.toLocaleLowerCase('ru'))??[]:[];}
export function organizationSection(state){
 const pid=state.activeProfileId,all=records.filter(x=>x.profileId===pid),query=(queries.get(pid)||'').toLocaleLowerCase('ru');
 const matches=all.filter(x=>!query||[x.name,x.tag,x.description,...x.members.map(m=>m.player),...x.units.map(u=>u.name),...x.positions.map(p=>p.name),...x.assets.map(a=>a.assetTag)].some(s=>s.toLocaleLowerCase('ru').includes(query)));
 const chosen=all.find(x=>x.id===selected.get(pid))??matches[0]??all[0];
 const people=all.reduce((n,o)=>n+o.members.filter(m=>m.active).length,0),assetCount=all.reduce((n,o)=>n+o.assets.filter(a=>!a.retired).length,0);
 const cards=matches.slice(0,150).map(o=>`<article class="economy-hit"><div><strong>${e(o.name)}</strong><p class="subtle">${e(types[o.type])}${o.archived?' · Архив':''} · ${o.members.filter(m=>m.active).length} сотрудников · ${o.assets.filter(a=>!a.retired).length} объектов</p></div>${btn('select','Открыть',attrs(o.id))}</article>`).join('');
 const live=chosen?.members.filter(m=>m.active)??[],activeAssets=chosen?.assets.filter(a=>!a.retired)??[],ware=chosen?orgStock(chosen):[];
 const holdings=ware.reduce((n,s)=>n+s.quantity,0),assetValue=activeAssets.reduce((n,a)=>n+a.value,0);
 return `<section class="card stack" id="organizations-root"><div class="row spread"><div><h3>Organizations & Assets · 2.1.5</h3><p class="subtle">Организационный реестр: штат, подразделения, имущество и история. Складские остатки отражаются по имени владельца, без повторного учёта стоимости.</p></div>${btn('new','+ Организация','','primary')}</div>
 <div class="economy-stats"><div><small>Организаций</small><strong>${all.length}</strong></div><div><small>Активных участников</small><strong>${people}</strong></div><div><small>Активов в реестре</small><strong>${assetCount}</strong></div></div>
 ${field('organizationSearch','Поиск по организациям, сотрудникам, подразделениям и имуществу',queries.get(pid)||'','search','id="organization-search" maxlength="120"')}
 <div class="economy-list">${cards||'<p class="subtle">Организации не найдены.</p>'}</div></section>
 ${chosen?`<section class="card stack" id="organization-detail"><div class="row spread"><div><h3>${e(chosen.name)} ${chosen.archived?'(архив)':''}</h3><p class="subtle">${e(types[chosen.type])} · ${e(chosen.tag||'Без тега')} · ${e(chosen.description||'Описание не заполнено')}</p></div><div class="row">${!chosen.archived?btn('org-edit','Изменить'):btn('archive','Восстановить','data-restore="true"')}${!chosen.archived?btn('archive','Архивировать','','danger'):''}${chosen.events.length<=3?btn('remove','Удалить','','danger'):''}</div></div>
 <div class="economy-stats"><div><small>Активных должностей</small><strong>${chosen.positions.filter(x=>!x.archived).length}</strong></div><div><small>Состав</small><strong>${live.length}</strong></div><div><small>Оценка имущества в реестре</small><strong>${e(formatCurrency(assetValue))}</strong></div><div><small>Товаров на складе</small><strong>${holdings}</strong></div></div>
 <div class="row spread"><h4>Подразделения</h4>${!chosen.archived?btn('unit-add','+ Подразделение'):''}</div>
 <div class="economy-list">${chosen.units.map(u=>`<article class="economy-hit"><div><strong>${e(u.name)}${u.archived?' (архив)':''}</strong><p class="subtle">${u.parentId?`В составе: ${e(namedUnit(chosen,u.parentId))}`:'Корневое подразделение'}</p></div>${!chosen.archived?`<div class="row">${!u.archived?btn('unit-edit','Изменить',attrs(u.id)):''}${btn('unit-archive',u.archived?'Вернуть':'Архив',`${attrs(u.id)} data-restore="${u.archived}"`)}</div>`:''}</article>`).join('')||'<p class="subtle">Подразделений нет.</p>'}</div>
 <div class="row spread"><h4>Должности</h4>${!chosen.archived?btn('position-add','+ Должность'):''}</div>
 <div class="economy-list">${chosen.positions.map(p=>`<article class="economy-hit"><div><strong>${e(p.name)}${p.archived?' (архив)':''}</strong><p class="subtle">${e(namedUnit(chosen,p.unitId))} · приоритет ${p.priority} · сотрудников ${live.filter(m=>m.positionId===p.id).length}</p></div>${!chosen.archived?`<div class="row">${!p.archived?btn('position-edit','Изменить',attrs(p.id)):''}${btn('position-archive',p.archived?'Вернуть':'Архив',`${attrs(p.id)} data-restore="${p.archived}"`)}</div>`:''}</article>`).join('')}</div>
 <div class="row spread"><h4>Состав (${live.length})</h4>${!chosen.archived?btn('member-join','+ Участник'):''}</div>
 <div class="table-scroll"><table class="economy-table"><thead><tr><th>Игрок</th><th>Должность</th><th>Вступил</th><th>Действия</th></tr></thead><tbody>${live.map(m=>`<tr><td>${e(m.player)}</td><td>${e(namedPosition(chosen,m.positionId))}</td><td>${e(m.joinedOn)}</td><td>${!chosen.archived?btn('member-position','Назначение',attrs(m.id))+btn('member-leave','Выход',attrs(m.id),'danger'):''}</td></tr>`).join('')||'<tr><td colspan="4">Участников нет</td></tr>'}</tbody></table></div>
 ${chosen.members.some(m=>!m.active)?`<details><summary>Бывшие сотрудники</summary>${chosen.members.filter(m=>!m.active).map(m=>`<p>${e(m.player)} · ${e(m.joinedOn)} — ${e(m.leftOn)}</p>`).join('')}</details>`:''}
 <div class="row spread"><h4>Имущество организации (${activeAssets.length})</h4><div class="row">${!chosen.archived?btn('asset-add','+ Имущество'):''}${btn('csv','Экспорт CSV')}</div></div>
 <div class="table-scroll"><table class="economy-table"><thead><tr><th>Название / №</th><th>Тип</th><th>Стоимость</th><th>Ответственный</th><th>Действия</th></tr></thead><tbody>${chosen.assets.map(a=>`<tr><td>${e(a.name)}<p class="subtle">${e(a.assetTag)}${a.retired?' · списано':''}</p></td><td>${e(assets[a.type])}</td><td>${e(formatCurrency(a.value))}</td><td>${e(namedMember(chosen,a.memberId))}</td><td>${!chosen.archived?`${!a.retired?btn('asset-edit','Изменить',attrs(a.id))+btn('asset-custodian','Ответственный',attrs(a.id)):''}${btn('asset-retire',a.retired?'Восстановить':'Списать',`${attrs(a.id)} data-restore="${a.retired}"`)}`:''}</td></tr>`).join('')||'<tr><td colspan="5">Имущества нет</td></tr>'}</tbody></table></div>
 <h4>Склад организации · ${holdings} шт.</h4><p class="subtle">Данные из Trading & Inventory по совпадению названия организации. Управление остатками выполняется на вкладке «Склад и имущество»; сумма склада не добавляется к стоимости реестровых активов.</p>
 <div class="economy-list">${ware.slice(0,100).map(s=>`<article class="economy-hit"><span>Товар ${e(s.productId.slice(0,12))} · партия ${e(s.lotId.slice(0,12))}${s.assetTag?' · № '+e(s.assetTag):''}</span><strong>${s.quantity} шт. (${s.reserved} резерв)</strong></article>`).join('')||'<p class="subtle">Остатков на складе организации нет.</p>'}</div>
 <details><summary>Журнал изменений (${chosen.events.length})</summary><div class="economy-list">${chosen.events.slice(-200).reverse().map(ev=>`<div class="economy-hit"><small>${e(ev.at.slice(0,16).replace('T',' '))} · ${e(ev.kind)}</small><span>${e(ev.player||ev.name||ev.assetTag||ev.reason||'—')}</span></div>`).join('')}</div></details></section>`:''}
 <dialog id="organization-dialog" aria-label="Операция с организацией"><form id="organization-form" class="stack"><input type="hidden" name="organizationId"><input type="hidden" name="kind"><input type="hidden" name="targetId"><h3 id="organization-dialog-title">Организация</h3><div id="organization-fields" class="economy-fields"></div><label class="field">Основание / примечание<input name="reason" maxlength="400"></label><div class="row spread">${btn('cancel','Отмена')}<button type="submit" class="button primary">Сохранить</button></div></form></dialog>`;
}
function formFields(kind,org,object){
 if(kind==='new'||kind==='org-edit')return field('name','Название',org?.name||'','text','required maxlength="100"')+field('tag','Тег',org?.tag||'','text','maxlength="24"')+choose('type','Тип организации',ORGANIZATION_TYPES.map(t=>[t,types[t]]),org?.type||'business')+field('description','Описание',org?.description||'','text','maxlength="1000"');
 if(kind==='unit-add'||kind==='unit-edit')return field('name','Подразделение',object?.name||'','text','required maxlength="80"')+choose('parentId','Вышестоящее подразделение',[['','Нет'],...org.units.filter(u=>!u.archived&&u.id!==object?.id).map(u=>[u.id,u.name])],object?.parentId||'');
 if(kind==='position-add'||kind==='position-edit')return field('name','Должность',object?.name||'','text','required maxlength="80"')+choose('unitId','Подразделение',[['','Без подразделения'],...org.units.filter(u=>!u.archived).map(u=>[u.id,u.name])],object?.unitId||'')+field('priority','Приоритет',object?.priority??10,'number','required min="1" max="1000" step="1"');
 if(kind==='member-join'||kind==='member-position')return (kind==='member-join'?field('player','Никнейм','','text','required maxlength="80"'):`<p>${e(object?.player||'')}</p>`)+choose('positionId','Должность',org.positions.filter(p=>!p.archived).map(p=>[p.id,p.name]),object?.positionId||'')+field('date','Дата',today(),'date','required');
 if(kind==='asset-add'||kind==='asset-edit')return field('name','Наименование',object?.name||'','text','required maxlength="120"')+choose('assetType','Категория',ASSET_TYPES.map(t=>[t,assets[t]]),object?.type||'equipment')+field('assetTag','Инвентарный номер',object?.assetTag||'','text','required maxlength="100"')+field('value','Оценка (игровые $)',object?.value??0,'number','required min="0" max="1000000000000" step="1"')+field('note','Описание',object?.note||'','text','maxlength="600"');
 if(kind==='asset-custodian')return choose('memberId','Ответственный',[['','Не назначен'],...org.members.filter(m=>m.active).map(m=>[m.id,m.player])],object?.memberId||'');
 return '';
}
function csvExport(org){const text=organizationAssetsCsv(org,orgStock(org)),blob=new Blob([text],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='organization-assets-'+today()+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function handleOrganizationAction(button,state,render,feedback){
 const kind=button.dataset.orgAction,pid=state.activeProfileId,all=records.filter(o=>o.profileId===pid),org=all.find(o=>o.id===selected.get(pid))??all[0];
 if(kind==='select'){if(!all.some(o=>o.id===button.dataset.id))throw Error('Организация другого профиля');selected.set(pid,button.dataset.id);render();return;}
 if(kind==='cancel'){document.getElementById('organization-dialog')?.close();return;}
 if(kind==='csv'){if(!org)throw Error('Организация не выбрана');csvExport(org);feedback('Имущество выгружено в CSV');return;}
 if(kind!=='new'&&!org)throw Error('Организация не найдена');
 const immediate=['remove','archive','unit-archive','position-archive','member-leave','asset-retire'];
 if(immediate.includes(kind)){
  if(!confirm(kind==='remove'?'Удалить пустую организацию без истории?':'Подтвердить операцию с организацией?'))return;
  if(kind==='remove')await removeOrganization(org.id,pid);
  else {const values={reason:'Изменение через реестр'};
   if(kind==='archive')values.archived=button.dataset.restore!=='true';
   if(kind==='unit-archive'){values.unitId=button.dataset.id;values.archived=button.dataset.restore!=='true';}
   if(kind==='position-archive'){values.positionId=button.dataset.id;values.archived=button.dataset.restore!=='true';}
   if(kind==='member-leave'){values.memberId=button.dataset.id;values.date=today();}
   if(kind==='asset-retire'){values.assetId=button.dataset.id;values.retired=button.dataset.restore!=='true';}
   await updateOrganization(org.id,pid,kind,values);
  }
  await refreshOrganizations(pid);render();feedback('Изменение организации сохранено');return;
 }
 const targetId=button.dataset.id||'';
 const object=kind.startsWith('unit-')?org?.units.find(x=>x.id===targetId):kind.startsWith('position-')?org?.positions.find(x=>x.id===targetId):kind.startsWith('member-')?org?.members.find(x=>x.id===targetId):kind.startsWith('asset-')?org?.assets.find(x=>x.id===targetId):null;
 if(kind.endsWith('-edit')&&!object&&kind!=='org-edit'||kind==='member-position'&&!object||kind==='asset-custodian'&&!object)throw Error('Запись организации не найдена');
 const dialog=document.getElementById('organization-dialog'),form=dialog?.querySelector('form');if(!form)throw Error('Откройте вкладку организаций');
 form.reset();form.elements.namedItem('kind').value=kind;form.elements.namedItem('organizationId').value=org?.id||'';form.elements.namedItem('targetId').value=targetId;
 dialog.querySelector('#organization-dialog-title').textContent=kind==='new'?'Новая организация':kind==='org-edit'?'Изменение организации':kind;
 replaceHtml(dialog.querySelector('#organization-fields'),formFields(kind,org,object));dialog.showModal();
}
export async function handleOrganizationSubmit(form,state,render,feedback){
 const values=Object.fromEntries(new FormData(form).entries()),pid=state.activeProfileId,kind=values.kind,orgId=values.organizationId,target=values.targetId;
 if(kind!=='new'&&!records.some(o=>o.id===orgId&&o.profileId===pid))throw Error('Организация не найдена в профиле');
 delete values.kind;delete values.organizationId;delete values.targetId;
 if(kind.startsWith('unit-')&&kind!=='unit-add')values.unitId=target;
 if(kind.startsWith('position-')&&kind!=='position-add')values.positionId=target;
 if(kind.startsWith('member-')&&kind!=='member-join')values.memberId=target;
 if(kind.startsWith('asset-')&&kind!=='asset-add')values.assetId=target;
 const updated=kind==='new'?await addOrganization(pid,values):await updateOrganization(orgId,pid,kind,values);
 selected.set(pid,updated.id);form.closest('dialog').close();await refreshOrganizations(pid);render();feedback('Реестр организаций обновлён');
}
