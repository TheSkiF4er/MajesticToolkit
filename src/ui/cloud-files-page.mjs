/** 2.3.8 cloud files: explicit Evidence Vault sharing; no implicit local upload. */
import {escapeHtml as e} from '../lib/sites.mjs';
const btn=(action,label,attrs='')=>`<button class="button secondary" type="button" data-cloud-action="${action}" ${attrs}>${e(label)}</button>`;
const option=(value,label,selected=false)=>`<option value="${e(value)}" ${selected?'selected':''}>${e(label)}</option>`;
let activeId='',activeProfile='',after='';
export async function loadCloudFiles(team,storage,rpc){
 if(!team||!storage?.remote||!storage.chosen)return {team,storage,remote:null};
 const remote=storage.remote;
 if(activeProfile!==remote.id){activeId='';after='';activeProfile=remote.id;}
 const scope={teamId:team.id,cloudProfileId:remote.id,localProfileId:storage.chosen.id};
 const list=await rpc('fileList',{...scope,after});
 const files=list.files||[];
 if(!files.some(f=>f.id===activeId))activeId=files[0]?.id||'';
 const [versions,links,local]=await Promise.all([
   activeId?rpc('fileVersions',{...scope,fileId:activeId}):Promise.resolve({versions:[]}),
   activeId?rpc('fileLinks',{...scope,fileId:activeId}):Promise.resolve({links:[]}),
   team.role==='viewer'?Promise.resolve({choices:[]}):rpc('fileLocalChoices',scope)
 ]);
 return {team,storage,remote,files,nextCursor:list.nextCursor,selected:files.find(x=>x.id===activeId)||null,versions:versions.versions||[],links:links.links||[],choices:local.choices||[]};
}
export function cloudFilesPanel(data){
 if(!data)return '';
 if(data.error)return `<div class="card stack" role="alert"><h3>Cloud Files & Evidence</h3><p>${e(data.error)}</p></div>`;
 if(!data.remote)return `<div class="card stack"><h3>Cloud Files & Evidence · 2.3.8</h3><p class="subtle">Привяжите локальный RP-профиль к облачному для файлов и вложений.</p></div>`;
 const {team,storage,remote,files,selected,versions,links,choices,nextCursor}=data;
 const edit=team.role!=='viewer',scope=`data-team-id="${e(team.id)}" data-cloud-id="${e(remote.id)}" data-local-id="${e(storage.chosen.id)}"`;
 const entries=files.map(f=>`<div class="ws-item"><div><strong>${e(f.title)}</strong><p class="subtle">${e(f.name)} · ${f.size} байт · v${f.version} · ${f.visibility==='team'?'Команда':'Лично'}</p></div>${btn('fileSelect','Открыть',`data-id="${e(f.id)}"`)}</div>`).join('');
 let details='<p class="subtle">Выберите файл.</p>';
 if(selected){
   const attrs=`${scope} data-file-id="${e(selected.id)}" data-version="${selected.version}"`;
   details=`<div class="stack"><h4>${e(selected.title)}</h4><p class="subtle">${e(selected.name)} · ${e(selected.mime)} · ${selected.size} байт · версия ${selected.version}<br>SHA-256: <code>${selected.sha256}</code><br>Доступ: ${selected.visibility==='team'?'всем участникам':'только автору'}</p>
   <div class="row">${btn('fileImport','Получить в локальный Evidence Vault',attrs)}${edit?btn('fileDelete','Удалить с сервера',attrs):''}</div>
   ${edit?`<form id="cloud-files-meta-form" class="stack" ${attrs}><label>Название<input name="title" required maxlength="180" value="${e(selected.title)}"></label><label>Имя файла<input name="name" required maxlength="180" value="${e(selected.name)}"></label><label>Примечание<textarea name="note" maxlength="1000">${e(selected.note)}</textarea></label><label>Доступ<select name="visibility">${option('private','Только я',selected.visibility==='private')}${option('team','Вся команда',selected.visibility==='team')}</select></label><button class="button secondary">Сохранить метаданные как новую версию</button></form>
   <form id="cloud-files-version-form" class="stack" ${attrs}><label>Новая версия из локального Evidence Vault<select name="vaultId" required>${choices.map(v=>option(v.id,v.title+' · '+v.name)).join('')}</select></label><button class="button secondary" ${choices.length?'':'disabled'}>Загрузить новую версию файла</button></form>`:''}
   <h4>Редакции и история</h4><div class="stack">${versions.map(v=>`<div class="ws-item"><div>v${v.version} · ${e(v.title)} · ${v.size} байт · ${e(new Date(v.createdAt).toLocaleString('ru-RU'))}<p class="subtle">${e(v.sha256)}</p></div>${btn('fileImportVersion','Получить версию локально',`${attrs} data-revision="${v.version}"`)}</div>`).join('')}</div>
   <h4>Вложения в командные записи</h4><div class="stack">${links.map(link=>`<div class="ws-item"><div>${e(link.targetType)} · ${e(link.targetKind)} · ${e(link.targetId)}</div>${edit?btn('fileLinkRemove','Открепить',`${attrs} data-link-id="${e(link.id)}"`):''}</div>`).join('')||'<p class="subtle">Файл ещё никуда не прикреплён.</p>'}</div>
   ${edit&&selected.visibility==='team'?`<form id="cloud-files-link-form" ${attrs} class="row"><label>Раздел<select name="targetType"><option value="knowledge">Knowledge Center (опубликованная запись)</option><option value="tactical">Tactical Workspace</option></select></label><label>Тип тактической записи<select name="targetKind">${['','map','plan','airdrop_point','airdrop_event','territory','territory_event'].map(k=>option(k,k||'—')).join('')}</select></label><label>ID материала<input name="targetId" required maxlength="120" placeholder="ID общего материала"></label><button class="button secondary">Прикрепить</button></form>`:''}
   </div>`;
 }
 return `<div class="card stack cloud-files" id="cloud-files-panel"><div class="row spread"><h3>Cloud Files & Evidence · 2.3.8</h3>${btn('fileRefresh','Обновить')}</div>
 <p class="subtle">Без явного действия локальные доказательства не отправляются в облако. Частные файлы доступны только автору, общие — участникам команды. Содержимое проверяется по SHA-256 при загрузке и получении. Не публикуйте материалы с персональными данными без разрешения.</p>
 <div class="row"><span class="tag">${e(team.name)}</span><span class="tag">${e(remote.name)}</span><span class="tag">${e(team.role)}</span></div>
 ${edit?`<form id="cloud-files-upload-form" class="stack" ${scope}><h4>Загрузить из локального Evidence Vault</h4><p class="subtle">Для нового файла сначала добавьте его в раздел Evidence Vault локального профиля.</p><label>Файл<select name="vaultId" required>${choices.map(v=>option(v.id,v.title+' · '+v.name)).join('')}</select></label><label>Доступ<select name="visibility"><option value="private">Только я</option><option value="team">Вся команда</option></select></label><button class="button primary" ${choices.length?'':'disabled'}>Явно загрузить выбранный файл</button></form>`:'<p class="subtle">Viewer может просматривать только общие файлы.</p>'}
 <h4>Файлы на сервере</h4><div class="stack">${entries||'<p class="subtle">Доступных файлов пока нет.</p>'}</div>
 <div class="row">${after?btn('fileFirst','К началу'):''}${nextCursor?btn('fileNext','Следующие 50',`data-cursor="${e(nextCursor)}"`):''}</div>
 <h4>Выбранный файл</h4>${details}</div>`;
}
const scope=element=>({teamId:element.dataset.teamId,cloudProfileId:element.dataset.cloudId,localProfileId:element.dataset.localId});
const record=element=>({...scope(element),fileId:element.dataset.fileId,baseVersion:Number(element.dataset.version)});
export async function handleCloudFilesSubmit(form,feedback,rpc){
 const f=form.elements,action=form.id,base=scope(form);
 if(action==='cloud-files-upload-form'){
   const visibility=f.namedItem('visibility').value;
   if(!confirm(`Передать выбранное доказательство на облачный сервер? Доступ: ${visibility==='team'?'все участники команды':'только вы'}.`))return;
   const result=await rpc('fileUpload',{...base,vaultId:f.namedItem('vaultId').value,visibility});activeId=result.file.id;
   feedback('Файл проверен и загружен на сервер');return;
 }
 if(action==='cloud-files-meta-form'){
   const args={...record(form),name:f.namedItem('name').value,title:f.namedItem('title').value,note:f.namedItem('note').value,visibility:f.namedItem('visibility').value};
   if(args.visibility==='team'&&!confirm('Открыть этот файл для всех участников команды?'))return;
   await rpc('fileMeta',args);feedback('Создана новая версия метаданных');return;
 }
 if(action==='cloud-files-version-form'){
   if(!confirm('Опубликовать новую версию файла? Предыдущие версии останутся доступны.'))return;
   const args={...record(form),vaultId:f.namedItem('vaultId').value};
   const current=(await rpc('fileGet',args)).file;
   if(current.version!==args.baseVersion)throw Error('Версия изменилась, обновите экран');
   await rpc('fileUpdateContent',{...args,visibility:current.visibility,title:current.title,note:current.note});feedback('Новая версия загружена');return;
 }
 if(action==='cloud-files-link-form'){
   const args={...record(form),targetType:f.namedItem('targetType').value,targetKind:f.namedItem('targetKind').value,targetId:f.namedItem('targetId').value.trim()};
   await rpc('fileLinkCreate',args);feedback('Вложение привязано к командной записи');return;
 }
 throw Error('Неизвестная файловая форма');
}
export async function handleCloudFilesAction(button,feedback,rpc){
 const action=button.dataset.cloudAction;
 if(action==='fileRefresh')return;
 if(action==='fileSelect'){activeId=button.dataset.id;return;}
 if(action==='fileFirst'){after='';activeId='';return;}
 if(action==='fileNext'){after=button.dataset.cursor;activeId='';return;}
 const args=record(button);
 if(action==='fileImport'||action==='fileImportVersion'){
   if(!confirm('Получить файл в локальный Evidence Vault? Содержимое будет проверено по SHA-256.'))return;
   const result=await rpc('fileImportLocal',{...args,...(action==='fileImportVersion'?{version:Number(button.dataset.revision)}:{})});
   feedback('Файл сохранён локально: '+result.record.title);return;
 }
 if(action==='fileLinkRemove'){
   if(!confirm('Открепить вложение от записи? Сам файл сохранится.'))return;
   await rpc('fileLinkDelete',{...args,linkId:button.dataset.linkId});feedback('Вложение откреплено');return;
 }
 if(action==='fileDelete'){
   if(!confirm('Безвозвратно удалить облачный файл, его версии и все привязки? Локальный оригинал сохранится.'))return;
   await rpc('fileDelete',args);activeId='';feedback('Облачный файл удалён');return;
 }
 throw Error('Неизвестное файловое действие');
}
