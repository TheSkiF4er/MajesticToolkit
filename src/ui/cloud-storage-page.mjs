/** 2.3.3 explicit RP-profile linking + selected local record migration. */
import {loadState} from '../lib/state.mjs';
import {listFamilies} from '../lib/family-store.mjs';
import {listOrganizations} from '../lib/organization-store.mjs';
import {listMarketplace} from '../lib/marketplace-store.mjs';
import {escapeHtml as e} from '../lib/sites.mjs';
let localSelection=null;
let directoryFilter={kind:'family',q:'',after:''};
let previousDirectoryProfile=null;
const DIRECTORY_KINDS={family:'Семьи',organization:'Организации',participant:'Участники',asset:'Имущество',product:'Товары'};
const option=(id,label,selected)=>`<option value="${e(id)}" ${selected?'selected':''}>${e(label)}</option>`;
const date=value=>value?new Date(value).toLocaleString('ru-RU'):'—';
const btn=(action,label,extra='')=>`<button type="button" class="button secondary" data-cloud-action="${action}" ${extra}>${label}</button>`;

export async function loadCloudWorkspace(team,rpc){
  const local=await loadState();
  if(!local.profiles.some(p=>p.id===localSelection))localSelection=local.activeProfileId;
  const {bindings,profiles}=await rpc('cloudBindings',{teamId:team.id});
  const chosen=local.profiles.find(p=>p.id===localSelection);
  const remote=profiles.find(p=>p.id===bindings[chosen.id]);
  const [families,organizations,marketplace,records]=await Promise.all([
    listFamilies(chosen.id),listOrganizations(chosen.id),listMarketplace(chosen.id),remote?rpc('cloudRecords',{teamId:team.id,cloudProfileId:remote.id}):Promise.resolve(null)
  ]);
  if(previousDirectoryProfile!==remote?.id){directoryFilter={kind:'family',q:'',after:''};previousDirectoryProfile=remote?.id??null;}
  const products=marketplace.filter(row=>row.type==='product');
  const directory=remote?await rpc('cloudDirectory',{teamId:team.id,cloudProfileId:remote.id,...directoryFilter}):null;
  const sync=remote?await rpc('syncStatus',{teamId:team.id,localProfileId:chosen.id}):null;
  return {team,local,chosen,remote,profiles,bindings,families,organizations,products,records,sync,directory,directoryFilter:{...directoryFilter}};
}

export function cloudStoragePanel(data){
  if(!data)return '';
  const {team,local,chosen,remote,profiles,bindings,families,organizations,products,records,sync,directory,directoryFilter,error}=data;
  if(error)return `<div class="card stack"><h3>Cloud Storage & Migration</h3><p role="alert">${e(error)}</p></div>`;
  const manager=['owner','admin'].includes(team.role),editor=manager||team.role==='editor';
  const localOptions=local.profiles.map(p=>option(p.id,`${p.name} · ${p.project} / ${p.server}`,p.id===chosen.id)).join('');
  const available=profiles.filter(p=>p.project===chosen.project&&p.server===chosen.server);
  const cloudOptions=available.map(p=>option(p.id,p.name,p.id===remote?.id)).join('');
  const choice=(kind,r)=>`<label class="cloud-record-choice"><input type="checkbox" name="record" value="${e(kind+':'+r.id)}"><span><strong>${e(r.name)}</strong><small class="subtle">${({family:'Семья',organization:'Организация',product:'Товар'})[kind]} · ${e(r.id)}</small></span></label>`;
  const entries=[...families.map(f=>choice('family',f)),...organizations.map(o=>choice('organization',o)),...products.map(p=>choice('product',p))];
  const profileList=profiles.map(p=>`<div class="ws-item"><div><strong>${e(p.name)}</strong><p class="subtle">${e(p.project)} / ${e(p.server)} · ${Number(p.recordCount)||0} записей</p></div></div>`).join('');
  const recent=(records?.records||[]).map(r=>`<div class="ws-item"><div><strong>${e(r.record?.name||r.id)}</strong><p class="subtle">${e(({family:'Семья',organization:'Организация',product:'Товар'})[r.kind]||r.kind)} · v${Number(r.version)} · ${e(date(r.importedAt))}</p></div></div>`).join('');
  const directoryRows=(directory?.entries||[]).map(row=>{
    const r=row.record||{};
    const sub=row.kind==='participant'?`${r.sourceName} · ${r.active?'В составе':'Выбыл'}`:
      row.kind==='asset'?`${r.sourceName} · ${r.assetTag} · ${r.retired?'Списано':'На балансе'}`:
      row.kind==='product'?`${r.category} · ${r.variant||r.unit} · ${r.archived?'Архив':'Активен'}`:
      `${r.archived?'Архив':'Активно'} · ${r.memberCount||0} участников`;
    return `<div class="ws-item"><div><strong>${e(row.name)}</strong><p class="subtle">${e(sub)} · ${e(row.sourceKind)} / ${e(row.sourceId)}</p></div></div>`;
  }).join('');
  const directoryHtml=remote?`<div class="stack"><h4>Единые командные справочники</h4><p class="subtle">Справочники доступны всем ролям. Редактирование через исходные разделы «Семьи», «Организации» и «Marketplace» при правах Editor+. Участники и имущество автоматически выводятся из актуальной истории семей/организаций, без дублирования записей.</p>
    <form id="cloud-directory-filter-form" class="row" data-team-id="${e(team.id)}"><label>Раздел<select name="kind">${Object.entries(DIRECTORY_KINDS).map(([kind,label])=>option(kind,label,kind===directoryFilter.kind)).join('')}</select></label><label>Поиск по названию<input name="q" value="${e(directoryFilter.q)}" maxlength="80" placeholder="Название или никнейм"></label><button class="button secondary">Найти</button></form>
    <div class="stack">${directoryRows||'<p class="subtle">Совпадений пока нет.</p>'}</div>
    <div class="row">${directoryFilter.after?btn('directoryFirst','В начало'):''}${directory?.nextCursor?btn('directoryNext','Следующие 30',`data-after="${e(directory.nextCursor)}"`):''}</div>
    <p class="subtle">Показаны серверные данные с учётом роли команды. Локальные цены, объявления, складские операции и остальные разделы не публикуются.</p></div>`:'';
  const syncAttrs=`data-team-id="${e(team.id)}" data-local-id="${e(chosen.id)}"`;
  const conflicts=(sync?.conflicts||[]).map(c=>`<div class="ws-item"><div><strong>${e(({family:'Семья',organization:'Организация',product:'Товар'})[c.kind]||c.kind)} · ${e(c.id)}</strong><p class="subtle">${e(c.reason)} · версия ${Number(c.version)||0}</p></div><div class="row">${btn('syncResolveCloud','Взять облачную',`${syncAttrs} data-kind="${e(c.kind)}" data-id="${e(c.id)}"`)}${editor?btn('syncResolveLocal','Оставить локальную',`${syncAttrs} data-kind="${e(c.kind)}" data-id="${e(c.id)}"`):''}</div></div>`).join('');
  const syncHtml=remote?`<div class="stack cloud-sync"><h4>Multi-Device Sync & Shared Directories · 2.3.5</h4>
     <p class="subtle">Синхронизация семей, организаций и товарного каталога между устройствами с офлайн-очередью. Участники и имущество обновляются из их исходных журналов. Подключается отдельно для каждого локального RP-профиля. Другие данные расширения не публикуются.</p>
     <div class="row"><span class="tag">${sync?.enabled?(sync.error?'Ошибка / офлайн':sync.conflicts.length?'Требуется разрешить конфликты':'Автоматическая синхронизация'):'Выключена'}</span>${sync?.enabled?btn('syncDisable','Отключить',syncAttrs):editor?btn('syncEnable','Включить синхронизацию',syncAttrs):''}${sync?.enabled?btn('syncNow','Синхронизировать сейчас',syncAttrs):''}</div>
     ${sync?.enabled?`<p class="subtle">Ожидают отправки: ${Number(sync.pending)||0}; конфликтов: ${sync.conflicts.length}; последняя успешная проверка: ${e(date(sync.lastSync))}.</p>${sync.error?`<p role="alert">${e(sync.error)}</p>`:''}${conflicts?`<h4>Разрешение конфликтов</h4><div class="stack">${conflicts}</div>`:''}`:''}</div>`:'';
  return `<div class="card stack cloud-storage" id="cloud-storage-panel"><h3>Shared Directories · 2.3.5</h3><p class="subtle">Перенос выбранных семей, организаций и товаров по-прежнему доступен отдельно от автоматической синхронизации. Локальные записи не удаляются при включении облака.</p>
    <div class="stack"><h4>Облачные RP-профили команды</h4>${profileList||'<p class="subtle">Профили ещё не созданы.</p>'}
    ${manager?`<form id="cloud-profile-create-form" class="row cloud-profile-form" data-team-id="${e(team.id)}"><label>Название облачного профиля<input name="name" required minlength="2" maxlength="64" value="${e(chosen.name)}"></label><input type="hidden" name="project" value="${e(chosen.project)}"><input type="hidden" name="server" value="${e(chosen.server)}"><button class="button secondary">Создать из выбранного локального</button></form>`:''}</div>
    <div class="stack"><h4>Подключение локального RP-профиля</h4><label>Локальный профиль<select id="cloud-local-profile" data-team-id="${e(team.id)}">${localOptions}</select></label><p class="subtle">Проект: ${e(chosen.project)} · сервер: ${e(chosen.server)}</p>
    ${available.length?`<form id="cloud-profile-bind-form" class="row" data-team-id="${e(team.id)}" data-local-id="${e(chosen.id)}"><label>Облачный профиль<select name="cloudProfileId" required>${cloudOptions}</select></label><button class="button secondary">${remote?'Изменить привязку':'Привязать профиль'}</button></form>`:'<p class="subtle">Нет подходящих облачных профилей. Создайте профиль с таким же проектом и сервером.</p>'}
    ${remote?`<div class="row"><span class="tag">Привязан: ${e(remote.name)}</span>${btn('cloudUnbind','Отвязать',`data-team-id="${e(team.id)}" data-local-id="${e(chosen.id)}"`)}</div>`:''}</div>
    ${syncHtml}
    ${directoryHtml}
    ${remote?`<div class="stack"><h4>Выборочный перенос в «${e(remote.name)}»</h4>${editor?`<form id="cloud-profile-import-form" class="stack" data-team-id="${e(team.id)}" data-cloud-id="${e(remote.id)}" data-local-id="${e(chosen.id)}"><p class="subtle">Отметьте нужные записи. При наличии совпадающего ID с другими данными сервер вернёт конфликт и не выполнит перезапись.</p><div class="cloud-records">${entries.slice(0,250).join('')||'<p class="subtle">В этом локальном профиле пока нет семей, организаций и товаров.</p>'}</div>${entries.length>250?'<p class="subtle">Показаны первые 250 записей; для переноса остальных сократите локальную выборку.</p>':''}<button class="button primary" ${!entries.length?'disabled':''}>Перенести выбранные записи</button></form>`:'<p class="subtle">Для импорта необходима роль Editor, Admin или Owner.</p>'}
    <div class="stack"><h4>Данные на сервере</h4>${recent||'<p class="subtle">Сервер пока не содержит импортированных записей.</p>'}${records?.nextCursor?'<p class="subtle">Показаны первые 20 записей. Для полного просмотра используйте постраничный API.</p>':''}<div class="row">${btn('cloudRefresh','Обновить хранилище')}</div></div></div>`:''}
  </div>`;
}
export function selectCloudLocalProfile(id){localSelection=id;}
export async function handleCloudStorageSubmit(form,feedback,rpc){
  const id=form.id,teamId=form.dataset.teamId;
  if(id==='cloud-directory-filter-form'){
    const kind=form.elements.namedItem('kind').value,q=form.elements.namedItem('q').value.trim();
    if(!Object.hasOwn(DIRECTORY_KINDS,kind)||q.length>80)throw Error('Некорректный поиск по справочнику');
    directoryFilter={kind,q,after:''};return;
  }
  if(id==='cloud-profile-create-form'){
    const name=form.elements.namedItem('name').value;
    const state=await loadState(),source=state.profiles.find(p=>p.id===localSelection);
    if(!source)throw Error('Локальный профиль удалён');
    const result=await rpc('cloudProfileCreate',{teamId,name,project:source.project,server:source.server});
    await rpc('cloudBind',{teamId,cloudProfileId:result.profile.id,localProfileId:source.id});
    feedback('Облачный RP-профиль создан и подключён');return;
  }
  if(id==='cloud-profile-bind-form'){
    await rpc('cloudBind',{teamId,localProfileId:form.dataset.localId,cloudProfileId:form.elements.namedItem('cloudProfileId').value});
    feedback('RP-профиль подключён к облачному пространству');return;
  }
  if(id==='cloud-profile-import-form'){
    const chosen=[...form.querySelectorAll('input[name="record"]:checked')].map(x=>x.value);
    if(!chosen.length)throw Error('Выберите записи для переноса');
    if(!confirm(`Перенести ${chosen.length} записей в командное облако? Их смогут читать участники команды.`))return;
    const state=await loadState(),localId=form.dataset.localId;
    if(!state.profiles.some(p=>p.id===localId))throw Error('Локальный профиль удалён');
    const [families,organizations,marketplace]=await Promise.all([listFamilies(localId),listOrganizations(localId),listMarketplace(localId)]);
    const byId=new Map([...families.map(record=>['family:'+record.id,{kind:'family',record}]),...organizations.map(record=>['organization:'+record.id,{kind:'organization',record}]),...marketplace.filter(record=>record.type==='product').map(record=>['product:'+record.id,{kind:'product',record}])]);
    if(chosen.some(key=>!byId.has(key)))throw Error('Выбранная запись была удалена; обновите список');
    let imported=0,unchanged=0;
    // Chunked HTTP writes preserve a bounded payload. Completed chunks are durable;
    // retries are idempotent because server compares canonical record hashes.
    let batch=[],size=0;
    const send=async()=>{if(!batch.length)return;const result=await rpc('cloudImport',{teamId,cloudProfileId:form.dataset.cloudId,records:batch});imported+=result.imported;unchanged+=result.unchanged;batch=[];size=0;};
    try{
      for(const key of chosen){const item=byId.get(key);const bytes=new TextEncoder().encode(JSON.stringify(item)).length;
        if(bytes>155*1024)throw Error('Запись '+key+' превышает лимит 155 КБ');
        if(batch.length===20||size+bytes>430*1024)await send();
        batch.push(item);size+=bytes;
      }
      await send();
    }catch(error){throw Error(`Перенесено ${imported}, без изменений ${unchanged}. Оставшиеся записи не перенесены: ${error.message}`);}
    feedback(`Перенос завершён: новых ${imported}, уже существовали ${unchanged}. Локальные записи не изменены.`);return;
  }
  throw Error('Неизвестная форма Cloud Storage');
}
export async function handleCloudStorageAction(button,feedback,rpc){
  const action=button.dataset.cloudAction;
  if(action==='cloudUnbind'){
    if(!confirm('Отвязать локальный профиль? Его данные останутся локально, облачные записи останутся на сервере.'))return;
    await rpc('cloudUnbind',{teamId:button.dataset.teamId,localProfileId:button.dataset.localId});
    feedback('Локальная привязка удалена; облачные записи сохранены');return;
  }
  if(['syncEnable','syncDisable','syncNow','syncResolveCloud','syncResolveLocal'].includes(action)){
    const input={teamId:button.dataset.teamId,localProfileId:button.dataset.localId};
    if(action==='syncEnable'&&!confirm('Включить автоматическую синхронизацию? ВСЕ локальные семьи, организации и товары каталога этого RP-профиля будут опубликованы для участников команды, включая записи, не выбранные при ручном переносе.'))return;
    if(action==='syncDisable'&&!confirm('Выключить автоматическую синхронизацию? Неотправленные изменения останутся локально в очереди.'))return;
    if(action.startsWith('syncResolve')){
      if(!confirm(action==='syncResolveCloud'?'Принять облачную версию? Локальные изменения этой записи будут заменены (удаление может быть ограничено связями).':'Отправить локальную версию поверх текущей облачной редакции?'))return;
      await rpc('syncResolve',{...input,kind:button.dataset.kind,id:button.dataset.id,choice:action==='syncResolveCloud'?'cloud':'local'});
      feedback('Выбор разрешения конфликта сохранён');return;
    }
    const result=await rpc(({syncEnable:'syncEnable',syncDisable:'syncDisable',syncNow:'syncNow'})[action],input);
    feedback(action==='syncDisable'?'Синхронизация отключена':result.error?'Изменения сохранены локально: '+result.error:'Синхронизация выполнена');return;
  }
  if(action==='directoryFirst'){directoryFilter={...directoryFilter,after:''};return;}
  if(action==='directoryNext'){if(!/^[A-Za-z0-9_-]{8,128}$/.test(button.dataset.after||''))throw Error('Некорректный курсор');directoryFilter={...directoryFilter,after:button.dataset.after};return;}
  if(action==='cloudRefresh')return;
  throw Error('Неизвестная операция Cloud Storage');
}
