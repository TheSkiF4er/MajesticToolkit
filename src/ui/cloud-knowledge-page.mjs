/** 2.3.6 shared cloud knowledge: actual remote collaboration and moderated publication. */
import {listLawRecords} from '../lib/law-store.mjs';
import {listTemplates} from '../lib/forum-store.mjs';
import {listGovernment} from '../lib/government-store.mjs';
import {listDocumentRecords} from '../lib/document-store.mjs';
import {escapeHtml as e} from '../lib/sites.mjs';
const LABELS={note:'База знаний',law:'Закон', 'forum-template':'Шаблон форума','government-template':'Процессуальный шаблон','document-template':'Шаблон документа'};
const STATUSES={draft:'Черновик',review:'На согласовании',approved:'Согласовано',rejected:'Отклонено',published:'Опубликовано'};
const option=(value,label,active)=>`<option value="${e(value)}" ${active?'selected':''}>${e(label)}</option>`;
const btn=(action,label,extra='')=>`<button class="button secondary" type="button" data-cloud-action="${action}" ${extra}>${e(label)}</button>`;
let state={cloudProfileId:null,itemId:null,collectionId:null,kind:'',scope:'all',q:'',after:''};
const selectProfile=id=>{if(state.cloudProfileId!==id){state={cloudProfileId:id,itemId:null,collectionId:null,kind:'',scope:'all',q:'',after:''};}};
export async function loadSharedKnowledge(team,storage,rpc){
  const profiles=storage?.profiles||[],profile=profiles.find(p=>p.id===state.cloudProfileId)||storage?.remote||profiles[0];
  if(!profile)return {team,profiles,profile:null};
  selectProfile(profile.id);
  const access={teamId:team.id,cloudProfileId:profile.id};
  const [list,collectionsResponse]=await Promise.all([rpc('knowledgeList',{...access,kind:state.kind,scope:state.scope,q:state.q,after:state.after}),rpc('knowledgeCollections',access)]);
  const collections=collectionsResponse.collections||[];
  if(!collections.some(c=>c.id===state.collectionId))state.collectionId=collections[0]?.id||null;
  const collection=state.collectionId?(await rpc('knowledgeCollectionGet',{...access,collectionId:state.collectionId})):null;
  if(!state.itemId)state.itemId=list.items[0]?.id||null;
  const item=state.itemId?(await rpc('knowledgeGet',{...access,itemId:state.itemId})).item:null;
  const [history,events]=item&&team.role!=='viewer'?await Promise.all([
    rpc('knowledgeHistory',{...access,itemId:item.id}),rpc('knowledgeEvents',{...access,itemId:item.id})
  ]):[null,null];
  let sources=[];
  if(['owner','admin','editor'].includes(team.role)&&storage?.remote?.id===profile.id){
    const localId=storage.chosen.id;
    const [laws,forum,government,documents]=await Promise.all([listLawRecords(),listTemplates(),listGovernment(),listDocumentRecords()]);
    sources=[...laws.filter(x=>x.profileId===localId&&['book','memo'].includes(x.type)).map(x=>({kind:'law',id:x.id,name:x.title})),
      ...forum.filter(x=>x.profileId===localId).map(x=>({kind:'forum-template',id:x.id,name:x.label})),
      ...government.filter(x=>x.profileId===localId&&x.type==='template').map(x=>({kind:'government-template',id:x.id,name:x.title})),
      ...documents.filter(x=>x.profileId===localId&&x.type==='template').map(x=>({kind:'document-template',id:x.id,name:x.title}))].slice(0,350);
  }
  return {team,storage,profiles,profile,list,item,history,events,sources,collections,collection,filter:{...state}};
}
export function sharedKnowledgePanel(data){
  if(!data)return '';
  if(data.error)return `<div class="card stack" role="alert"><h3>Shared Knowledge & Templates</h3><p>${e(data.error)}</p></div>`;
  const {team,storage,profile,profiles,list,item,history,events,sources,collections=[],collection,filter}=data;
  const editor=['owner','admin','editor'].includes(team.role),manager=['owner','admin'].includes(team.role);
  const access=profile?`data-team-id="${e(team.id)}" data-cloud-id="${e(profile.id)}"`:'';
  const profileSelect=profiles.length?`<form id="cloud-knowledge-profile-form" class="row"> <label>Командный RP-профиль<select name="cloudProfileId">${profiles.map(p=>option(p.id,p.name,p.id===profile?.id)).join('')}</select></label><button class="button secondary">Открыть</button></form>`:'';
  if(!profile)return `<div class="card stack cloud-knowledge"><h3>Shared Knowledge & Templates · 2.3.6</h3><p class="subtle">Для командных материалов создайте облачный RP-профиль.</p></div>`;
  const listRows=(list?.items||[]).map(x=>`<div class="ws-item"><div><strong>${e(x.title)}</strong><p class="subtle">${e(LABELS[x.kind])} · ${e(x.category)} · v${Number(x.revision)} · ${e(STATUSES[x.status]||x.status)}${x.publishedRevision?' · опубликовано v'+x.publishedRevision:''}</p></div>${btn('knowledgeSelect','Открыть',`${access} data-id="${e(x.id)}"`)}</div>`).join('');
  const collectionRow=collection?.collection;
  const collectionHtml=`<div class="stack shared-collections"><h4>Коллекции Knowledge Center</h4>
    <div class="row">${collections.map(c=>btn('knowledgeCollectionSelect',c.title,`${access} data-id="${e(c.id)}"`)).join('')||'<p class="subtle">Коллекций пока нет.</p>'}</div>
    ${collectionRow?`<div class="stack"><p class="subtle">Выбрана: ${e(collectionRow.title)} · версия ${Number(collectionRow.version)} · ${e(collectionRow.notes)}</p>
      <div class="stack">${(collection.items||[]).map(x=>`<div class="ws-item"><span>${e(x.title)}</span>${editor?btn('knowledgeCollectionRemove','Исключить',`${access} data-collection-id="${e(collectionRow.id)}" data-item-id="${e(x.id)}" data-version="${collectionRow.version}"`):''}</div>`).join('')||'<p class="subtle">В коллекции нет материалов.</p>'}</div>
      ${item&&editor?btn('knowledgeCollectionAdd','Добавить выбранный материал',`${access} data-collection-id="${e(collectionRow.id)}" data-item-id="${e(item.id)}" data-version="${collectionRow.version}"`):''}
      ${manager?btn('knowledgeCollectionDelete','Удалить коллекцию (не материалы)',`${access} data-collection-id="${e(collectionRow.id)}" data-version="${collectionRow.version}"`):''}
      ${editor?`<form id="cloud-knowledge-collection-edit-form" ${access} data-collection-id="${e(collectionRow.id)}" data-version="${collectionRow.version}" class="row"><label>Название<input name="title" required maxlength="120" value="${e(collectionRow.title)}"></label><label>Описание<input name="notes" maxlength="800" value="${e(collectionRow.notes)}"></label><button class="button secondary">Изменить</button></form>`:''}</div>`:''}
    ${editor?`<form id="cloud-knowledge-collection-create-form" class="row" ${access}><label>Новая коллекция<input name="title" required maxlength="120" placeholder="Название"></label><label>Описание<input name="notes" maxlength="800"></label><button class="button secondary">Создать коллекцию</button></form>`:''}
  </div>`;
  const current=item?`<div class="stack shared-knowledge-detail"><h4>${e(LABELS[item.kind])}: ${e(item.title)}</h4><p class="subtle">${e(STATUSES[item.status])} · редакция ${Number(item.revision)} · опубликованная редакция ${item.publishedRevision||'нет'}</p>
      <p class="subtle">SHA-256 текущей редакции: <code>${e(item.sha256)}</code></p>
      ${editor?`<form class="stack" id="cloud-knowledge-edit-form" ${access} data-id="${e(item.id)}" data-revision="${Number(item.revision)}"><label>Название<input name="title" required maxlength="180" value="${e(item.title)}"></label><label>Категория<input name="category" required maxlength="90" value="${e(item.category)}"></label><label>Содержимое<textarea name="body" rows="10" required maxlength="60000">${e(item.body)}</textarea></label><div class="row"><button class="button secondary" ${!['draft','rejected','published'].includes(item.status)?'disabled':''}>Сохранить новую редакцию</button></div></form>`:`<div class="stack"><h4>Опубликованный текст</h4><pre class="cloud-knowledge-content">${e(item.body)}</pre></div>`}
      ${editor?`<div class="row">${['draft','rejected'].includes(item.status)?btn('knowledgeSubmit','Отправить на согласование',`${access} data-id="${e(item.id)}" data-revision="${item.revision}"`):''}${item.status==='approved'&&manager?btn('knowledgePublish','Опубликовать согласованную редакцию',`${access} data-id="${e(item.id)}" data-revision="${item.revision}"`):''}${item.publishedRevision&&manager?btn('knowledgeArchive','Снять с публикации',`${access} data-id="${e(item.id)}" data-revision="${item.revision}"`):''}</div>
      ${item.status==='review'&&manager?`<form id="cloud-knowledge-review-form" ${access} data-id="${e(item.id)}" data-revision="${item.revision}" class="row"><label>Решение<select name="decision"><option value="approve">Согласовать</option><option value="reject">Отклонить</option></select></label><label>Комментарий<input name="note" maxlength="1000" placeholder="Причина или замечание"></label><button class="button secondary">Принять решение</button></form>`:''}
      ${item.published&&item.published.revision!==item.revision?`<div class="stack"><h4>Текущая опубликованная редакция v${Number(item.published.revision)}</h4><pre class="cloud-knowledge-content">${e(item.published.body)}</pre></div>`:''}
      <h4>История редакций</h4><div class="stack">${(history?.revisions||[]).map(r=>`<div class="ws-item"><div>v${r.revision} · ${e(r.title)} · ${e(new Date(r.createdAt).toLocaleString('ru-RU'))}<p class="subtle">${e(r.sha256)}</p></div>${['draft','rejected','published'].includes(item.status)?btn('knowledgeRestore','Восстановить как новую редакцию',`${access} data-id="${e(item.id)}" data-revision="${item.revision}" data-target-revision="${r.revision}"`):''}</div>`).join('')}</div>
      <h4>Журнал согласования</h4><div class="stack">${(events?.events||[]).map(ev=>`<p class="subtle">${e(new Date(ev.at).toLocaleString('ru-RU'))} · ${e(ev.action)} · v${ev.revision} · ${e(ev.actorId)}${ev.note?' · '+e(ev.note):''}</p>`).join('')}</div>`:''}
    </div>`:'';
  return `<div class="card stack cloud-knowledge" id="cloud-knowledge-panel"><h3>Shared Knowledge & Templates · 2.3.6</h3><p class="subtle">Общие заметки, законы и шаблоны. Каждая редакция сохраняется в облаке. Публикация требует проверки другим администратором, а незавершённые правки не меняют опубликованный текст. Локальные источники остаются нетронутыми.</p>
    ${profileSelect}
    ${collectionHtml}
    <form id="cloud-knowledge-filter-form" class="row" ${access}><label>Раздел<select name="kind">${[option('','Все типы',!filter.kind),...Object.entries(LABELS).map(([key,label])=>option(key,label,filter.kind===key))].join('')}</select></label><label>Статус<select name="scope">${[['all','Все доступные'],['published','Опубликовано'],['review','На согласовании']].filter(([key])=>key!=='review'||editor).map(([key,label])=>option(key,label,filter.scope===key)).join('')}</select></label><label>Поиск<input name="q" maxlength="80" value="${e(filter.q)}" placeholder="Название"></label><button class="button secondary">Найти</button></form>
    <div class="stack">${listRows||'<p class="subtle">Материалов пока нет.</p>'}</div>
    ${list?.nextCursor?btn('knowledgeNext','Ещё материалы',`${access} data-after="${e(list.nextCursor)}"`):''}${filter.after?btn('knowledgeFirst','Первая страница',access):''}
    ${current}
    ${editor?`<div class="stack"><h4>Новая запись базы знаний</h4><form class="stack" id="cloud-knowledge-create-form" ${access}><label>Тип<select name="kind">${Object.entries(LABELS).map(([key,label])=>option(key,label,key==='note')).join('')}</select></label><label>Название<input name="title" required maxlength="180"></label><label>Категория<input name="category" required maxlength="90" value="Общее"></label><label>Текст<textarea name="body" required maxlength="60000" rows="6"></textarea></label><button class="button primary">Создать черновик</button></form></div>
    ${sources.length?`<div class="stack"><h4>Импорт из локального RP-профиля</h4><p class="subtle">Выберите источник. В облаке появится новый черновик; его смогут читать редакторы команды после импорта, но публикация потребует согласования.</p><form id="cloud-knowledge-import-form" class="row" ${access} data-local-id="${e(storage.chosen.id)}"><label>Запись<select name="source">${sources.map(x=>option(x.kind+':'+x.id,`${LABELS[x.kind]}: ${x.name}`,false)).join('')}</select></label><button class="button secondary">Импортировать черновик</button></form></div>`:''}</div>`:''}</div>`;
}
export async function handleSharedKnowledgeSubmit(form,feedback,rpc){
 const id=form.id,access={teamId:form.dataset.teamId,cloudProfileId:form.dataset.cloudId};
 if(id==='cloud-knowledge-profile-form'){selectProfile(form.elements.namedItem('cloudProfileId').value);return;}
 if(id==='cloud-knowledge-filter-form'){
   state={...state,kind:form.elements.namedItem('kind').value,scope:form.elements.namedItem('scope').value,q:form.elements.namedItem('q').value.trim(),itemId:null,after:''};return;
 }
 if(id==='cloud-knowledge-collection-create-form'||id==='cloud-knowledge-collection-edit-form'){
   const input={...access,title:form.elements.namedItem('title').value,notes:form.elements.namedItem('notes').value};
   const result=await rpc(id.endsWith('create-form')?'knowledgeCollectionCreate':'knowledgeCollectionUpdate',id.endsWith('create-form')?input:{...input,collectionId:form.dataset.collectionId,baseVersion:Number(form.dataset.version)});
   state.collectionId=result.collection.id;feedback('Коллекция сохранена');return;
 }
 if(id==='cloud-knowledge-import-form'){
   const value=form.elements.namedItem('source').value,sep=value.indexOf(':');
   if(sep<1)throw Error('Выберите источник');
   if(!confirm('Создать общий командный черновик из выбранной локальной записи?'))return;
   const result=await rpc('knowledgeImport',{...access,localProfileId:form.dataset.localId,sourceKind:value.slice(0,sep),sourceId:value.slice(sep+1)});
   state.itemId=result.item.id;state.after='';state.kind='';state.q='';state.scope='all';feedback('Локальная запись скопирована в командный черновик');return;
 }
 if(id==='cloud-knowledge-create-form'||id==='cloud-knowledge-edit-form'){
   const body={...access,kind:form.elements.namedItem('kind')?.value,title:form.elements.namedItem('title').value,category:form.elements.namedItem('category').value,body:form.elements.namedItem('body').value};
   const result=await rpc(id==='cloud-knowledge-create-form'?'knowledgeCreate':'knowledgeEdit',id==='cloud-knowledge-create-form'?body:{...body,itemId:form.dataset.id,baseRevision:Number(form.dataset.revision)});
   state.itemId=result.item.id;state.after='';state.kind='';state.q='';state.scope='all';feedback('Неизменяемая редакция сохранена');return;
 }
 if(id==='cloud-knowledge-review-form'){
   const decision=form.elements.namedItem('decision').value,note=form.elements.namedItem('note').value;
   const result=await rpc('knowledgeReview',{...access,itemId:form.dataset.id,baseRevision:Number(form.dataset.revision),decision,note});
   feedback(result.item.status==='approved'?'Редакция согласована':'Редакция отклонена');return;
 }
 throw Error('Неизвестная форма общих материалов');
}
export async function handleSharedKnowledgeAction(button,feedback,rpc){
 const action=button.dataset.cloudAction,access={teamId:button.dataset.teamId,cloudProfileId:button.dataset.cloudId};
 if(action==='knowledgeCollectionSelect'){state.collectionId=button.dataset.id;return;}
 if(action?.startsWith('knowledgeCollection')){
   const input={...access,collectionId:button.dataset.collectionId,itemId:button.dataset.itemId,baseVersion:Number(button.dataset.version)};
   if(action==='knowledgeCollectionDelete'&&!confirm('Удалить коллекцию? Сами материалы сохранятся.'))return;
   if(action==='knowledgeCollectionRemove'&&!confirm('Исключить материал из коллекции?'))return;
   await rpc(action,input);
   if(action==='knowledgeCollectionDelete')state.collectionId=null;
   feedback('Состав коллекции обновлён');return;
 }
 if(action==='knowledgeSelect'){state.itemId=button.dataset.id;return;}
 if(action==='knowledgeFirst'){state.after='';state.itemId=null;return;}
 if(action==='knowledgeNext'){state.after=button.dataset.after;state.itemId=null;return;}
 const input={...access,itemId:button.dataset.id,baseRevision:Number(button.dataset.revision)};
 if(action==='knowledgeRestore'){
   if(!confirm('Скопировать выбранную историческую редакцию в новый черновик?'))return;
   await rpc('knowledgeRestore',{...input,targetRevision:Number(button.dataset.targetRevision)});feedback('Редакция восстановлена в новый черновик');return;
 }
 const phrases={knowledgeSubmit:'Отправить текущую редакцию на согласование?',knowledgePublish:'Опубликовать согласованную редакцию для всех участников?',knowledgeArchive:'Снять опубликованный материал с доступа читателей?'};
 if(!Object.hasOwn(phrases,action))throw Error('Неизвестная операция материала');
 if(!confirm(phrases[action]))return;
 await rpc(action,input);feedback('Статус материала обновлён');
}
