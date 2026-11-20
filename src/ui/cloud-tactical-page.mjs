/** 2.3.7 shared tactical collaboration: explicit publish, edit and import. */
import {escapeHtml as e} from '../lib/sites.mjs';
const LABEL={map:'Карта',plan:'План',airdrop_point:'Точка аирдропа',airdrop_event:'Аирдроп',territory:'Территория',territory_event:'Территориальное событие'};
const option=(v,label,active)=>`<option value="${e(v)}" ${active?'selected':''}>${e(label)}</option>`;
const btn=(action,label,extra='')=>`<button type="button" class="button secondary" data-cloud-action="${action}" ${extra}>${e(label)}</button>`;
let selectedKey='',changeAfter=0,listAfter='',cloudProfile=null;
export async function loadTeamTactical(team,storage,rpc){
 if(!team||!storage?.remote)return {team,storage,remote:null};
 const remote=storage.remote;
 if(cloudProfile!==remote.id){selectedKey='';changeAfter=0;listAfter='';cloudProfile=remote.id;}
 const scope={teamId:team.id,cloudProfileId:remote.id};
 const [list,events,local]=await Promise.all([
  rpc('tacticalList',{...scope,after:listAfter}),rpc('tacticalChanges',{...scope,after:changeAfter}),
  team.role==='viewer'?Promise.resolve({choices:[]}):rpc('tacticalLocalChoices',{...scope,localProfileId:storage.chosen.id})
 ]);
 const records=list.records||[];
 if(!records.some(x=>x.kind+':'+x.id===selectedKey))selectedKey=records[0]?records[0].kind+':'+records[0].id:'';
 return {team,storage,remote,records,events,choices:local.choices||[],selected:records.find(x=>x.kind+':'+x.id===selectedKey)||null,nextCursor:list.nextCursor};
}
function detail(item,scope,editor){
 if(!item)return '<p class="subtle">Выберите командную запись.</p>';
 const r=item.record,kind=item.kind,attrs=`${scope} data-kind="${e(kind)}" data-id="${e(item.id)}" data-version="${item.version}"`;
 const title=r.name||r.title||r.state?.title||item.id;
 const history=r.history||r.events||[];
 const description=kind==='map'?`${r.width} × ${r.height} · ${r.size} байт · ${r.mime} · SHA-256 ${r.sha256}`:
 kind==='plan'?`${r.state.brief||''} · ${r.state.squads.length} отрядов · ${r.state.routes.length} маршрутов`:
 kind==='territory'?`${r.region||''} · ${r.archived?'В архиве':'Активна'}`:
 kind==='airdrop_event'?`Статус: ${r.status} · ${r.scheduledAt}`:
 kind==='airdrop_point'?`${r.description||''} · ${r.x.toFixed(3)}, ${r.y.toFixed(3)}`:
 `${r.date||''} · ${r.status||''}`;
 let form='';
 if(editor&&kind==='plan')form=`<form id="cloud-tactical-edit-form" ${attrs} class="stack"><input type="hidden" name="operation" value="edit"><label>Название<input name="title" required maxlength="120" value="${e(r.state.title)}"></label><label>Описание<textarea name="brief" maxlength="1500">${e(r.state.brief)}</textarea></label><label>Дата ISO (необязательно)<input name="scheduledAt" value="${e(r.state.scheduledAt)}"></label><button class="button secondary">Сохранить новую редакцию</button></form>`;
 if(editor&&kind==='territory')form=`<form id="cloud-tactical-edit-form" ${attrs} class="stack"><input type="hidden" name="operation" value="edit"><label>Название<input name="name" required maxlength="100" value="${e(r.name)}"></label><label>Район<input name="region" maxlength="120" value="${e(r.region)}"></label><label>Заметки<textarea name="notes" maxlength="1000">${e(r.notes)}</textarea></label><button class="button secondary">Сохранить новую редакцию</button></form>`;
 if(editor&&kind==='airdrop_point')form=`<form id="cloud-tactical-edit-form" ${attrs} class="stack"><input type="hidden" name="operation" value="edit"><label>Название<input name="name" required maxlength="100" value="${e(r.name)}"></label><label>Описание<textarea name="description" maxlength="500">${e(r.description)}</textarea></label><label>X (0–1)<input name="x" type="number" min="0" max="1" step="any" value="${r.x}"></label><label>Y (0–1)<input name="y" type="number" min="0" max="1" step="any" value="${r.y}"></label><button class="button secondary">Сохранить новую редакцию</button></form>`;
 if(editor&&kind==='airdrop_event')form=`<form id="cloud-tactical-edit-form" ${attrs} class="stack"><label>Операция<select name="operation">${[['participant-add','Добавить участника'],['participant-remove','Удалить участника'],...(r.status==='planned'?[['start','Начать']]:[]),...(r.status==='active'?[['claim','Заявить получение'],['finish','Завершить'],['cancel','Отменить']]:[]),...(r.status==='claimed'?[['finish','Завершить']]:[]),...(r.status==='planned'?[['cancel','Отменить']]:[])].map(([v,n])=>option(v,n)).join('')}</select></label><label>Участник / получатель / причина<input name="name" maxlength="500"></label><label>Награда<input name="reward" maxlength="300"></label><label>Результат<input name="result" maxlength="500"></label><button class="button secondary">Выполнить действие</button></form>`;
 if(editor&&kind==='territory_event')form=`<form id="cloud-tactical-edit-form" ${attrs} class="stack"><label>Операция<select name="operation">${[['edit','Изменить описание'],['finish','Завершить'],['cancel','Отменить']].filter(([v])=>r.status==='planned'||v==='edit').map(([v,n])=>option(v,n)).join('')}</select></label><label>Название<input name="title" maxlength="120" value="${e(r.title)}"></label><label>Дата<input name="date" type="date" value="${e(r.date)}"></label><label>Заметки<textarea name="notes" maxlength="1000">${e(r.notes)}</textarea></label><label>Победитель<select name="winner"><option value="attacker">Нападающие</option><option value="defender">Защитники</option><option value="draw">Ничья</option></select></label><button class="button secondary">Выполнить действие</button></form>`;
 const archive=editor&&['plan','airdrop_point','territory'].includes(kind)?btn('tacticalArchive',r.state?.archived||r.archived?'Вернуть из архива':'Архивировать',attrs):'';
 return `<div class="stack"><h4>${e(LABEL[kind])}: ${e(title)}</h4><p class="subtle">v${item.version} · изменил ${e(item.updatedBy)} · ${e(new Date(item.updatedAt).toLocaleString('ru-RU'))}</p><p class="subtle">${e(description)}</p>
 ${form}<div class="row">${btn('tacticalImport','Получить в локальный RP-профиль',attrs)}${kind==='map'?btn('tacticalReplaceMap','Разрешить конфликт: заменить локальную карту',attrs):''}${archive}${editor?btn('tacticalDelete','Удалить общую запись',attrs):''}</div>
 <details><summary>Журнал исходной записи (${history.length})</summary><div class="stack">${history.slice(-25).map(ev=>`<p class="subtle">${e(ev.at)} · ${e(ev.kind||ev.action||'изменение')} · ${e(ev.id)}</p>`).join('')||'<p>Карта без журнала операций</p>'}</div></details></div>`;
}
export function teamTacticalPanel(data){
 if(!data)return '';
 if(data.error)return `<div class="card stack" role="alert"><h3>Collaborative Tactical Workspace</h3><p>${e(data.error)}</p></div>`;
 if(!data.remote)return `<div class="card stack"><h3>Collaborative Tactical Workspace · 2.3.7</h3><p class="subtle">Сначала привяжите локальный RP-профиль к командному облачному профилю.</p></div>`;
 const {team,storage,remote,records,events,choices,selected,nextCursor}=data,editor=team.role!=='viewer';
 const attrs=`data-team-id="${e(team.id)}" data-cloud-id="${e(remote.id)}" data-local-id="${e(storage.chosen.id)}"`;
 const list=records.map(x=>`<div class="ws-item"><div><strong>${e(LABEL[x.kind])}: ${e(x.record.title||x.record.name||x.record.state?.title||x.id)}</strong><p class="subtle">v${x.version} · ${e(x.id)}</p></div>${btn('tacticalSelect','Открыть',`data-kind="${e(x.kind)}" data-id="${e(x.id)}"`)}</div>`).join('');
 return `<div class="card stack cloud-tactical" id="cloud-tactical-panel"><div class="row spread"><h3>Collaborative Tactical Workspace · 2.3.7</h3>${btn('tacticalRefresh','Обновить')}</div>
 <p class="subtle">Общие карты с изображениями, планы, аирдропы и территории. Отправка и получение выполняются только вручную. Каждый запрос проверяет роль и версию на сервере. При конфликте (HTTP 409) обновите запись — локальные правки не стираются автоматически.</p>
 <div class="row"><span class="tag">Команда: ${e(team.name)}</span><span class="tag">RP: ${e(remote.name)}</span><span class="tag">${e(team.role)}</span></div>
 ${editor?`<form id="cloud-tactical-publish-form" class="row" ${attrs}><label>Локальная тактическая запись<select name="entry" required>${choices.map(x=>option(x.kind+':'+x.id,`${LABEL[x.kind]} · ${x.title}`)).join('')}</select></label><button class="button primary" ${choices.length?'':'disabled'}>Опубликовать / обновить</button></form><p class="subtle">Для новой карты сначала загрузится проверенная PNG/JPEG/WebP-подложка. В обновлении по существующему ID ожидается актуальная версия.</p>`:'<p class="subtle">Viewer может просматривать общие материалы, но не публиковать и не изменять их.</p>'}
 <h4>Командные записи</h4><div class="stack">${list||'<p class="subtle">Пока нет опубликованных тактических записей.</p>'}</div>${nextCursor?btn('tacticalMoreRecords','Следующие 50 записей',`data-cursor="${e(nextCursor)}"`):''}${listAfter?btn('tacticalFirstRecords','К началу списка'):''}
 <h4>Выбранная запись</h4>${detail(selected,attrs,editor)}
 <h4>Изменения участников</h4><div class="stack">${(events?.changes||[]).slice(-30).map(x=>`<p class="subtle">${e(new Date(x.at).toLocaleString('ru-RU'))} · ${e(x.actorId)} · ${e(x.action)} · ${e(LABEL[x.kind])} ${e(x.id)} · v${x.version}</p>`).join('')||'<p class="subtle">Изменений пока нет.</p>'}</div>
 ${events?.hasMore?btn('tacticalMoreChanges','Следующие изменения',`data-cursor="${events.cursor}"`):''}
 <p class="subtle">Чтобы редактировать карту с разметкой, явно импортируйте её, откройте Tactical Map и опубликуйте новую редакцию. Не импортируйте облачные данные поверх отличающихся локальных журналов без разрешения конфликта.</p></div>`;
}
const scope=element=>({teamId:element.dataset.teamId,cloudProfileId:element.dataset.cloudId,localProfileId:element.dataset.localId});
const row=element=>({...scope(element),kind:element.dataset.kind,id:element.dataset.id,baseVersion:Number(element.dataset.version)});
export async function handleTacticalForm(form,feedback,rpc){
 if(form.id==='cloud-tactical-publish-form'){
  const value=form.elements.namedItem('entry').value,idx=value.indexOf(':');if(idx<0)throw Error('Выберите запись');
  const kind=value.slice(0,idx),localId=value.slice(idx+1),id=kind==='map'?'map-'+form.dataset.cloudId:localId;
  const args={...scope(form),kind,id};
  let version=0;try{version=(await rpc('tacticalGet',args)).entry.version;}catch(error){if(!/не найдена|404|не существует/i.test(error.message))throw error;}
  if(!confirm(`Опубликовать ${LABEL[kind]} в командном облаке? Все участники команды смогут просматривать запись.`))return;
  await rpc('tacticalPublishLocal',{...args,baseVersion:version});feedback('Тактическая запись опубликована');selectedKey=kind+':'+id;return;
 }
 if(form.id==='cloud-tactical-edit-form'){
  const args=row(form),f=form.elements,operation=f.namedItem('operation').value;
  let fields={};
  if(args.kind==='plan'){
   const current=(await rpc('tacticalGet',args)).entry.record.state;
   fields={title:f.namedItem('title').value,brief:f.namedItem('brief').value,scheduledAt:f.namedItem('scheduledAt').value,group:current.group};
  }else if(args.kind==='territory')fields={name:f.namedItem('name').value,region:f.namedItem('region').value,notes:f.namedItem('notes').value};
  else if(args.kind==='airdrop_point'){
   const current=(await rpc('tacticalGet',args)).entry.record;
   fields={name:f.namedItem('name').value,description:f.namedItem('description').value,x:Number(f.namedItem('x').value),y:Number(f.namedItem('y').value),mapSha256:current.mapSha256};
  }else if(args.kind==='airdrop_event'){
   const name=f.namedItem('name').value;
   fields=operation.startsWith('participant-')?{name}:operation==='claim'?{winner:name,reward:f.namedItem('reward').value}:operation==='finish'?{result:f.namedItem('result').value}:operation==='cancel'?{reason:name}:{};
  }else if(args.kind==='territory_event')fields=operation==='edit'?{title:f.namedItem('title').value,date:f.namedItem('date').value,notes:f.namedItem('notes').value}:operation==='finish'?{winner:f.namedItem('winner').value}:{};
  await rpc('tacticalEdit',{...args,operation,fields});feedback('Изменение сохранено в командном журнале');return;
 }
 throw Error('Неизвестная форма Tactical Workspace');
}
export async function handleTacticalAction(button,feedback,rpc){
 const action=button.dataset.cloudAction;
 if(action==='tacticalRefresh')return;
 if(action==='tacticalSelect'){selectedKey=button.dataset.kind+':'+button.dataset.id;return;}
 if(action==='tacticalMoreChanges'){changeAfter=Number(button.dataset.cursor);return;}
 if(action==='tacticalMoreRecords'){listAfter=button.dataset.cursor;selectedKey='';return;}
 if(action==='tacticalFirstRecords'){listAfter='';selectedKey='';return;}
 const args=row(button);
 if(action==='tacticalImport'||action==='tacticalReplaceMap'){
  if(action==='tacticalReplaceMap'&&args.kind!=='map')throw Error('Замена разрешена только для карты');
  if(!confirm(action==='tacticalReplaceMap'?'Безвозвратно заменить локальную карту облачной? Убедитесь, что сохранили нужную разметку. При изменении подложки зависимые планы и аирдропы блокируют замену.':'Получить выбранную запись из команды в локальный RP-профиль? При конфликте существующая локальная запись останется без изменений.'))return;
  const result=await rpc('tacticalImportRemote',{...args,overwriteMap:action==='tacticalReplaceMap'});feedback(result.imported?'Тактическая запись импортирована локально':'Локальная запись уже совпадает');return;
 }
 if(action==='tacticalDelete'){
  if(!confirm('Удалить эту запись из командного облака? Зависимые данные блокируют удаление. Локальные записи не изменятся.'))return;
  await rpc('tacticalDelete',args);selectedKey='';feedback('Командная запись удалена');return;
 }
 if(action==='tacticalArchive'){
  const current=(await rpc('tacticalGet',args)).entry.record;
  await rpc('tacticalEdit',{...args,operation:'archive',fields:{archived:!(current.state?.archived??current.archived)}});feedback('Архивное состояние изменено');return;
 }
 throw Error('Неизвестная операция Tactical Workspace');
}
