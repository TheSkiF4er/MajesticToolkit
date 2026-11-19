/** Families & Membership 2.1.4: actual editable rosters and historical RP statistics. */
import '../lib/safe-dom.js';
import {escapeHtml as e} from '../lib/sites.mjs';
import {listFamilies,addFamily,updateFamily,removeFamily} from '../lib/family-store.mjs';
import {familyMatchStats} from '../lib/family-core.mjs';
const {replaceHtml}=globalThis.MTSafeDOM;
let families=[],selected=new Map(),queries=new Map();
export async function refreshFamilies(){families=await listFamilies();return families;}
const today=()=>new Date().toISOString().slice(0,10);
const field=(name,label,value='',type='text',extra='')=>`<label class="field">${label}<input name="${name}" type="${type}" value="${e(String(value))}" ${extra}></label>`;
const rankOptions=(family,selectedRank='')=>`<label class="field">Ранг<select name="rankId">${family.ranks.map(r=>`<option value="${e(r.id)}" ${selectedRank===r.id?'selected':''}>${e(r.name)}</option>`).join('')}</select></label>`;
const btn=(action,label,attrs='',cls='secondary')=>`<button type="button" class="button ${cls}" data-family-action="${action}" ${attrs}>${label}</button>`;
function familyForm(kind,family=null,object=null){
 if(kind==='new'||kind==='family-edit')return `${field('name','Название семьи',family?.name||'','text','maxlength="80" required')}${field('tag','Сокращение',family?.tag||'','text','maxlength="24"')}${field('description','Описание',family?.description||'','text','maxlength="800"')}`;
 if(kind==='rank-add'||kind==='rank-edit')return `${field('rankName','Название ранга',object?.name||'','text','maxlength="60" required')}${field('priority','Приоритет (1 — выше)',object?.priority??10,'number','min="1" max="1000" required')}`;
 if(kind==='join')return `${field('player','Никнейм участника','','text','maxlength="80" required')}${rankOptions(family)}${field('date','Дата вступления',today(),'date','required')}`;
 if(kind==='rank-change')return `${field('player','Участник',object?.player||'','text','disabled')}${rankOptions(family,object?.rankId)}${field('date','Дата назначения',today(),'date','required')}`;
 if(kind==='alias-add')return field('alias','Старое название семьи в матчах','','text','maxlength="80" required');
 return '';
}
export function familiesSection(state,economyRows=[]){
 const profileId=state.activeProfileId,all=families.filter(f=>f.profileId===profileId),query=queries.get(profileId)||'';
 const items=all.filter(f=>!query||[f.name,f.tag,...f.members.map(m=>m.player),...f.aliases].some(x=>x.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))));
 const chosen=all.find(f=>f.id===selected.get(profileId))??items[0];
 const stats=familyMatchStats(all,economyRows.filter(x=>x.profileId===profileId));
 const familyCards=items.map(f=>`<article class="economy-hit"><div><strong>${e(f.name)} ${f.tag?`[${e(f.tag)}]`:''}</strong><p class="subtle">${f.archived?'Архив · ':''}${f.members.filter(m=>m.active).length} участников · ${stats.get(f.id)?.matches??0} матчей</p></div>${btn('select','Открыть',`data-id="${e(f.id)}"`)}</article>`).join('');
 const rankName=id=>chosen?.ranks.find(r=>r.id===id)?.name||'Ранг удалён';
 const active=chosen?.members.filter(m=>m.active)||[],former=chosen?.members.filter(m=>!m.active)||[],s=chosen&&stats.get(chosen.id);
 return `<section class="card stack" id="families-root"><div class="row spread"><div><h3>Families & Membership · 2.1.4</h3><p class="subtle">Локальный реестр, кадровая история и результаты старых матчей. Связь с матчами устанавливается по точному имени или вручную добавленному псевдониму.</p></div>${btn('new','+ Семья','','primary')}</div><div class="economy-stats"><div><small>Семей в профиле</small><strong>${all.length}</strong></div><div><small>Активных участников</small><strong>${all.reduce((n,f)=>n+f.members.filter(m=>m.active).length,0)}</strong></div><div><small>Завершённых назначений</small><strong>${all.reduce((n,f)=>n+f.members.filter(m=>!m.active).length,0)}</strong></div></div><label class="field">Поиск семьи или участника<input type="search" id="families-search" maxlength="120" value="${e(query)}" placeholder="Семья, никнейм, тег"></label><div class="economy-list">${familyCards||'<p class="subtle">Семьи не найдены. Создайте первую запись.</p>'}</div></section>${chosen?`<section class="card stack" id="family-detail"><div class="row spread"><div><h3>${e(chosen.name)} ${chosen.archived?'(архив)':''}</h3><p class="subtle">${e(chosen.description||'Описание не заполнено')} · ${e(chosen.tag||'Без сокращения')}</p></div><div class="row">${!chosen.archived?btn('family-edit','Изменить'):btn('archive','Восстановить','data-restore="true"')}${!chosen.archived?btn('archive','Архивировать','','danger'):''}${!chosen.members.length?btn('remove','Удалить','','danger'):''}</div></div>
 <div class="economy-stats"><div><small>Матчей по имени / псевдонимам</small><strong>${s?.matches??0}</strong></div><div><small>Побед</small><strong>${s?.wins??0}</strong></div><div><small>Win Rate</small><strong>${s?.matches?((s.wins/s.matches)*100).toFixed(1):'0'}%</strong></div><div><small>K/D</small><strong>${s?.deaths?(s.kills/s.deaths).toFixed(2):s?.kills??0}</strong></div></div>
 <div class="row spread"><h4>Ранги</h4>${!chosen.archived?btn('rank-add','+ Ранг'):''}</div><div class="economy-list">${chosen.ranks.map(r=>`<article class="economy-hit"><div><strong>${e(r.name)}</strong><p class="subtle">Приоритет ${r.priority} · участников: ${active.filter(m=>m.rankId===r.id).length}</p></div><div class="row">${!chosen.archived?btn('rank-edit','Изменить',`data-id="${e(r.id)}"`):''}${!chosen.archived&&chosen.ranks.length>1&&!active.some(m=>m.rankId===r.id)?btn('rank-remove','Удалить',`data-id="${e(r.id)}"`,'danger'):''}</div></article>`).join('')}</div>
 <div class="row spread"><h4>Состав (${active.length})</h4><div class="row">${!chosen.archived?btn('join','+ Участник'):''}${btn('csv','CSV состава')}</div></div><div class="table-scroll"><table class="economy-table"><thead><tr><th>Игрок</th><th>Ранг</th><th>Вступил</th><th>Операции</th></tr></thead><tbody>${active.map(m=>`<tr><td>${e(m.player)}</td><td>${e(rankName(m.rankId))}</td><td>${e(m.joinedOn)}</td><td>${!chosen.archived?btn('rank-change','Ранг',`data-id="${e(m.id)}"`)+btn('leave','Выход',`data-id="${e(m.id)}"`,'danger'):''}</td></tr>`).join('')||'<tr><td colspan="4">Нет участников</td></tr>'}</tbody></table></div>
 ${former.length?`<details><summary>Бывшие участники (${former.length})</summary><div class="economy-list">${former.map(m=>`<p>${e(m.player)} · ${e(m.joinedOn)} — ${e(m.leftOn)}</p>`).join('')}</div></details>`:''}
 <div class="row spread"><h4>Исторические названия</h4>${!chosen.archived?btn('alias-add','+ Добавить название'):''}</div><p class="subtle">Псевдонимы связывают старую текстовую статистику с этой семьёй без изменения матчей.</p><div class="economy-list">${chosen.aliases.map(alias=>`<div class="row spread"><span>${e(alias)}</span>${!chosen.archived?btn('alias-remove','Убрать',`data-alias="${e(alias)}"`,'danger'):''}</div>`).join('')||'<p class="subtle">Псевдонимов пока нет.</p>'}</div>
 <details><summary>История изменений (${chosen.events.length})</summary><div class="economy-list">${chosen.events.slice().reverse().slice(0,150).map(ev=>`<div class="economy-hit"><small>${e(ev.at.slice(0,16).replace('T',' '))} · ${e(ev.kind)}</small><span>${e(ev.player||ev.rankName||ev.alias||ev.name||ev.reason||'—')}</span></div>`).join('')}</div></details></section>`:''}
 <dialog id="family-dialog" aria-label="Операции с семьёй"><form id="family-form" class="stack"><input type="hidden" name="familyId"><input type="hidden" name="kind"><input type="hidden" name="targetId"><h3 id="family-dialog-title">Запись семьи</h3><div id="family-fields" class="economy-fields"></div><label class="field">Основание / примечание<input name="reason" maxlength="400"></label><div class="row spread"><button class="button secondary" type="button" data-family-action="cancel">Отмена</button><button class="button primary" type="submit">Сохранить</button></div></form></dialog>`;
}
function downloadCsv(family){
 const rows=[['Никнейм','Ранг','Дата вступления','Дата выхода','Статус'],...family.members.map(m=>[m.player,family.ranks.find(r=>r.id===m.rankId)?.name||'Удалён',m.joinedOn,m.leftOn,m.active?'В составе':'Вышел'])];
 const escape=v=>{let s=String(v??'');if(/^[\s\x00-\x1f]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(escape).join(';')).join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='family-members-'+today()+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function setFamilyQuery(profileId,query){queries.set(profileId,String(query||'').slice(0,120));}
export async function handleFamilyAction(button,state,render,feedback){
 const kind=button.dataset.familyAction,profileId=state.activeProfileId,all=families.filter(x=>x.profileId===profileId),family=all.find(x=>x.id===selected.get(profileId))??all[0];
 if(kind==='select'){if(!all.some(f=>f.id===button.dataset.id))throw Error('Семья другого профиля');selected.set(profileId,button.dataset.id);render();return;}
 if(kind==='cancel'){document.getElementById('family-dialog')?.close();return;}
 if(kind==='csv'){if(!family)throw Error('Выберите семью');downloadCsv(family);feedback('Состав семьи выгружен');return;}
 if(!family&&kind!=='new')throw Error('Семья не найдена');
 if(['archive','rank-remove','alias-remove','leave','remove'].includes(kind)){
  if(!confirm(kind==='remove'?'Удалить семью без кадровой истории?':'Подтвердить изменение семейного реестра?'))return;
  if(kind==='remove')await removeFamily(family.id,profileId);
  else {const value=kind==='archive'?{archived:button.dataset.restore!=='true',reason:'Изменение статуса'}:kind==='rank-remove'?{rankId:button.dataset.id,reason:'Удаление неиспользуемого ранга'}:kind==='alias-remove'?{alias:button.dataset.alias,reason:'Удаление псевдонима'}:{memberId:button.dataset.id,date:today(),reason:'Выход участника'};
   await updateFamily(family.id,profileId,kind,value);
  }
  if(kind==='remove')selected.delete(profileId);await refreshFamilies();render();feedback('Реестр семьи обновлён');return;
 }
 const object=kind==='rank-edit'?family.ranks.find(x=>x.id===button.dataset.id):kind==='rank-change'?family.members.find(x=>x.id===button.dataset.id):null;
 if(!['new','family-edit','rank-add','rank-edit','join','rank-change','alias-add'].includes(kind))throw Error('Неизвестная семейная операция');
 if(['rank-edit','rank-change'].includes(kind)&&!object)throw Error('Ранг или участник не найден');
 const dialog=document.getElementById('family-dialog'),form=dialog?.querySelector('#family-form');if(!form)throw Error('Форма семей недоступна');form.reset();form.elements.namedItem('familyId').value=family?.id||'';form.elements.namedItem('kind').value=kind;form.elements.namedItem('targetId').value=button.dataset.id||'';dialog.querySelector('#family-dialog-title').textContent=kind==='new'?'Новая семья':kind==='join'?'Принять участника':kind==='rank-add'?'Добавить ранг':'Изменение семьи';replaceHtml(dialog.querySelector('#family-fields'),familyForm(kind,kind==='new'?null:family,object));dialog.showModal();
}
export async function handleFamilySubmit(form,state,render,feedback){
 const values=Object.fromEntries(new FormData(form).entries()),{familyId,kind,targetId}=values;delete values.familyId;delete values.kind;delete values.targetId;
 const profileId=state.activeProfileId;let row;
 if(kind==='new')row=await addFamily(profileId,values);
 else {
  if(!families.some(f=>f.id===familyId&&f.profileId===profileId))throw Error('Семья другого профиля');
  if(kind==='rank-edit'||kind==='rank-change')values[kind==='rank-edit'?'rankId':'memberId']=targetId;
  row=await updateFamily(familyId,profileId,kind,values);
 }
 selected.set(profileId,row.id);form.closest('dialog').close();await refreshFamilies();render();feedback('Семья и журнал изменений сохранены');
}
