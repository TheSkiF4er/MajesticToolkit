import {FORUM_HOSTS,validateForumSettings,forumSettingsFor} from '../lib/forum-settings.mjs';
import '../lib/safe-dom.js';
const { replaceHtml, insertHtml } = globalThis.MTSafeDOM;
import { api } from '../lib/browser.mjs';
import '../lib/forum-core.js';
import { listTemplates, upsertTemplate, removeTemplate, binderUsage, recordBinderUsage, setBinderFavorite, importBinderPack, bulkBinderTemplates } from '../lib/forum-store.mjs';
import '../lib/xenforo-core.js';
import {listXenForoLinks,saveXenForoLink,deleteXenForoLink,navigationHistory,clearNavigationHistory,markNavigationOpened,reorderNavigation} from '../lib/xenforo-store.mjs';
const C = globalThis.RPNForumCore;
let templates = [];
let forumLinks = [], navHistory=[];
const XF=globalThis.MTXenForo;
export const xenforoLinks=()=>forumLinks;
let draftKey='', draftTimer;
let search = '', libraryFilter='all', libraryCategory='', libraryProfile='', usage={};
const e = C.esc;
export async function refreshForum() { [templates,forumLinks] = await Promise.all([listTemplates(),listXenForoLinks()]);if(libraryProfile){usage=await binderUsage(libraryProfile);navHistory=await navigationHistory(libraryProfile);} }
export async function refreshBinderProfile(profileId){if(libraryProfile!==profileId){libraryProfile=profileId;libraryCategory='';libraryFilter='all';usage=await binderUsage(profileId);navHistory=await navigationHistory(profileId);}}
function libraryRows(current){return C.libraryTemplates(templates,current.id,'',libraryFilter,usage,libraryCategory);}
function downloadPack(rows,links=[]){const url=URL.createObjectURL(new Blob([C.exportPack(rows,links)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='majestic-binder-pack.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function choosePack(){return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.addEventListener('change',()=>resolve(input.files[0]??null),{once:true});input.addEventListener('cancel',()=>resolve(null),{once:true});input.click();});}

function binderDialog(markup){const dialog=document.createElement('dialog');dialog.className='binder-task-dialog';replaceHtml(dialog,markup);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();return dialog;}
function importPreview(pack,profile){
  return new Promise(resolve=>{
    const dialog=binderDialog(`<form class="stack"><h2>Импорт Binder 2.0</h2><p>Профиль: ${e(profile.name)} · ${e(profile.server)}</p><p>${pack.templates.length} шаблонов · ${pack.links.length} ссылок</p>${pack.source==='binds_and_links'?'<p class="subtle">Данные наказаний импортируются только как справочный текст. Калькулятор и его настройки не переносятся.</p>':''}<div class="binder-import-list">${pack.templates.map(t=>`<details><summary>${e(t.label)} · ${e(t.category||'Без папки')}</summary><pre class="template-text">${e(t.text)}</pre></details>`).join('')}${pack.links.map(l=>`<p>${e(l.title)} — ${e(l.url)}</p>`).join('')}</div><label>Конфликты<select name="mode"><option value="skip">Пропустить дубликаты</option><option value="replace">Заменить совпадения</option><option value="add">Создать копии</option></select></label><p class="subtle">Перед записью создаётся точка восстановления. Конфликтующие горячие клавиши отключаются у импортируемых шаблонов.</p><div class="row"><button type="button" class="button secondary" data-cancel>Отмена</button><button class="button primary" type="submit">Импортировать</button></div></form>`);
    dialog.addEventListener('close',()=>resolve(null),{once:true});dialog.querySelector('[data-cancel]').addEventListener('click',()=>dialog.close());
    dialog.querySelector('form').addEventListener('submit',ev=>{ev.preventDefault();resolve(new FormData(ev.target).get('mode'));dialog.close();});
  });
}
function copyTemplateDialog(t,state){
  const p=state.profiles.find(x=>x.id===state.activeProfileId),now=new Date();
  const context={project:p?.project??'',server:p?.server??'',date:now.toLocaleDateString('ru-RU'),time:now.toLocaleTimeString('ru-RU'),thread:'',url:'',selection:'',nickname:'',reason:''};
  const keys=new Set(C.variableNames(t.text)),defined=C.fieldsFor(t),definedKeys=new Set(defined.map(f=>f.key));
  // Context-free workspace can supply values normally obtained from the forum.
  const fields=[...defined,...['nickname','reason','thread','url','selection'].filter(k=>keys.has(k)&&!definedKeys.has(k)).map(k=>({key:k,label:k,type:k==='url'?'url':'text',required:false,options:[],defaultValue:''}))];
  const temp={...t,variables:fields};
  return new Promise(resolve=>{
    const dialog=binderDialog(`<form class="stack"><h2>${e(t.label)}</h2>${fields.map(f=>C.fieldMarkup(f,context[f.key]||f.defaultValue)).join('')}<div class="preview-area" data-preview></div><p class="subtle" role="status" data-error></p><div class="row"><button type="button" class="button secondary" data-cancel>Отмена</button><button type="button" class="button secondary" data-preview-button>Предпросмотр</button><button class="button primary" type="submit">Копировать</button></div></form>`);
    const form=dialog.querySelector('form'),error=dialog.querySelector('[data-error]');
    const result=()=>C.renderTemplate(temp,context,Object.fromEntries(new FormData(form)));
    const preview=()=>{try{const text=result();replaceHtml(dialog.querySelector('[data-preview]'),t.format==='bbcode'?C.bbcodeToHtml(text):e(text).replace(/\n/g,'<br>'));error.textContent='';}catch(err){error.textContent=err.message;}};
    dialog.addEventListener('close',()=>resolve(false),{once:true});dialog.querySelector('[data-cancel]').addEventListener('click',()=>dialog.close());dialog.querySelector('[data-preview-button]').addEventListener('click',preview);form.addEventListener('input',preview);preview();
    form.addEventListener('submit',async ev=>{ev.preventDefault();try{await navigator.clipboard.writeText(result());resolve(true);dialog.close();}catch(err){error.textContent=err.message;}});
  });
}

function settingsCard(state){
  const prefs=validateForumSettings(state.preferences.forum);
  const current=state.profiles.find(p=>p.id===state.activeProfileId);
  const host=globalThis.MTXenForo.domain(current?.forumUrl);
  const form=(scope,title)=>{
    const profileScope=scope.startsWith('profile:');
    const inherited=profileScope?!Object.hasOwn(prefs.profiles,scope.slice(8)):!Object.hasOwn(prefs.sites,scope);
    const values=scope==='global'?prefs.global:profileScope?forumSettingsFor(prefs,host,current.id):forumSettingsFor(prefs,scope);
    const fields=[['enabled','Интеграция с форумом'],['binderEnabled','Биндер и горячие клавиши'],['navigationEnabled','Персональная навигация XenForo'],['navigationHistory','Локальная история посещений (до 50 страниц)']];
    const select=(key,label,options)=>`<label>${label}<select name="${key}">${options.map(([v,t])=>`<option value="${v}" ${values[key]===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
    return `<form data-forum-settings="${e(scope)}" class="stack"><h4>${e(title)}</h4>${scope==='global'?'':`<label><input type="checkbox" name="inherit" ${inherited?'checked':''}> Использовать настройки ${profileScope?'форума':'по умолчанию'}</label>`}${fields.map(([key,label])=>`<label><input type="checkbox" name="${key}" ${values[key]?'checked':''}> ${label}</label>`).join('')}${select('panelPosition','Положение панели',[['right','Справа'],['left','Слева']])}${select('appearance','Тема панели',[['dark','Тёмная'],['light','Светлая'],['system','Системная']])}${select('density','Плотность',[['comfortable','Обычная'],['compact','Компактная']])}<div class="row"><button class="button primary" type="submit">Сохранить</button><button class="button secondary" type="button" data-forum-action="reset-settings" data-id="${e(scope)}">Сбросить</button></div></form>`;
  };
  return `<section class="card stack"><h3>Forum Core · Настройки</h3><p class="subtle">Настройки применяются к открытым вкладкам сразу. Разрешения сайтов остаются независимыми. Для отдельного форума или профиля снимите флажок наследования и сохраните настройки.</p>${form('global','Общие настройки')}${form(FORUM_HOSTS[0],'Majestic RP')}${form(FORUM_HOSTS[1],'Russia Online')}${host?form('profile:'+current.id,'Активный профиль: '+current.name):''}</section>`;
}
const navChoices={kind:[['link','Ссылка меню'],['bookmark','Закладка']],placement:[['both','Шапка и панель'],['header','Шапка'],['panel','Панель']],target:[['new','Новая вкладка'],['current','Текущая вкладка']],host:[['*','Любой форум'],...FORUM_HOSTS.map(h=>[h,h])],icon:[['link','↗ Ссылка'],['star','★ Звезда'],['book','▤ Книга'],['folder','▸ Папка'],['chat','▣ Обсуждение'],['law','§ Закон']]};
function navigationCard(state){
 const current=state.profiles.find(p=>p.id===state.activeProfileId),host=XF.domain(current.forumUrl),rows=XF.selectNavigation(forumLinks,current.id,host);
 const select=(key,label)=>`<label>${label}<select name="${key}">${navChoices[key].map(([v,l])=>`<option value="${e(v)}">${e(l)}</option>`).join('')}</select></label>`;
 return `<section id="navigation-2" class="card stack"><h3>Пользовательская навигация XenForo · Navigation 2.0</h3><p class="subtle">Персональное меню, вложенные группы и закладки. 60 ссылок меню и 300 закладок. Группы задаются путём, например Работа/Жалобы. Закладки всегда в панели и привязаны к профилю.</p>
 <form id="xf-navigation-form" class="stack"><input type="hidden" name="id" value=""><div class="grid"><label>Название<input name="title" maxlength="70" required></label><label>Адрес HTTPS<input name="url" type="url" maxlength="2048" required></label></div><label>Профиль<select name="profileId"><option value="*">Все профили</option>${state.profiles.map(p=>`<option value="${e(p.id)}" ${p.id===state.activeProfileId?'selected':''}>${e(p.name)} · ${e(p.server)}</option>`).join('')}</select></label><div class="grid">${select('kind','Тип')}${select('host','Форум')}${select('placement','Размещение')}${select('target','Открывать')}${select('icon','Иконка')}<label>Группа<input name="group" maxlength="160" placeholder="Работа/Жалобы"></label><label>Порядок<input name="order" type="number" min="0" max="1000000" value="1000000"></label><label>Теги (через запятую)<input name="tags" maxlength="500"></label></div><label>Заметка<textarea name="note" maxlength="2000" rows="2"></textarea></label><label><input type="checkbox" name="pinned"> Закрепить вверху</label><div class="row"><button class="button primary" type="submit">Сохранить</button><button class="button secondary" type="button" data-forum-action="clear-link-form">Новая запись</button></div></form>
 <h4>Меню и закладки активного профиля</h4><label>Фильтр<input type="search" id="xf-nav-filter" placeholder="Название, группа, тег, адрес"></label><div id="xf-nav-rows" class="stack">${rows.map(x=>`<article class="row spread" data-nav-id="${e(x.id)}" data-nav-row="${e([x.title,x.group,x.url,x.note,...(x.tags||[])].join(' ').toLocaleLowerCase('ru'))}"><div><strong>${x.pinned?'★ ':''}${e(x.title)}</strong><p class="subtle">${e(x.kind==='bookmark'?'Закладка':'Ссылка')} · ${e(x.group||'Без группы')} · ${e(x.url)}</p>${x.note?`<p>${e(x.note)}</p>`:''}${x.lastOpened?`<p class="subtle">Открыто: ${e(new Date(x.lastOpened).toLocaleString('ru-RU'))}</p>`:''}</div><div class="row"><span class="nav-drag" draggable="true" data-nav-drag="${e(x.id)}" title="Перетащить для сортировки" aria-label="Перетащить для сортировки">↕</span><button class="button secondary" data-forum-action="move-nav-up" data-id="${e(x.id)}" aria-label="Выше">↑</button><button class="button secondary" data-forum-action="move-nav-down" data-id="${e(x.id)}" aria-label="Ниже">↓</button><button class="button secondary" data-forum-action="edit-link" data-id="${e(x.id)}">Изменить</button><button class="button secondary" data-forum-action="pin-link" data-id="${e(x.id)}">${x.pinned?'Открепить':'Закрепить'}</button><button class="button secondary" data-forum-action="open-link" data-id="${e(x.id)}">Открыть</button><button class="button danger" data-forum-action="remove-link" data-id="${e(x.id)}">Удалить</button></div></article>`).join('')||'<p class="subtle">Нет записей для этого форума.</p>'}</div>
 <h4>Локальная история</h4><p class="subtle">История опциональна, без параметров URL; хранится отдельно от резервной копии.</p><button class="button secondary" data-forum-action="clear-nav-history">Очистить историю профиля</button>${navHistory.map(x=>`<p><a href="${e(x.url)}" target="_blank" rel="noopener noreferrer">${e(x.title)}</a> · ${e(new Date(x.visitedAt).toLocaleString('ru-RU'))}</p>`).join('')||'<p class="subtle">История пуста.</p>'}</section>`;
}
export function forumSection(state) {
  const current = state.profiles.find(x => x.id === state.activeProfileId);
  const matching = C.selectTemplates(templates, current.id);
  const visible=libraryRows(current);
  return `<div class="stack"><section class="card row"><button class="button primary" data-forum-action="show-navigation">Navigation 2.0</button><button class="button secondary" data-forum-action="show-binder">Binder 2.0</button><button class="button secondary" data-forum-action="show-customization">Оформление форума</button></section>${settingsCard(state)}<section class="card stack" id="forum-customization"></section><section class="card"><div class="row spread"><div><h3>Binder 2.0 · Библиотека</h3><p class="subtle">Папки, теги, избранное, типизированные переменные, история версий и Alt+Shift+1…9. Шаблоны привязываются к профилю или доступны глобально.</p></div><button class="button primary" data-forum-action="create">+ Новый шаблон</button></div><div class="row"><input id="forum-search" type="search" placeholder="Поиск по названию, папке, тегам или тексту" value="${e(search)}" aria-label="Поиск шаблонов" style="flex:1;min-width:220px"><span class="tag">${matching.length} доступно · ${templates.length} всего</span></div><div class="row"><label>Папка<select id="binder-category"><option value="">Все папки</option>${[...new Set(matching.map(t=>t.category).filter(Boolean).flatMap(c=>c.split('/').map((_,i,a)=>a.slice(0,i+1).join('/'))))].sort().map(c=>`<option value="${e(c)}" ${c===libraryCategory?'selected':''}>${e(c)}</option>`).join('')}</select></label><label>Показать<select id="binder-filter">${[['all','Все'],['favorite','Избранное'],['recent','Недавние']].map(([v,l])=>`<option value="${v}" ${v===libraryFilter?'selected':''}>${l}</option>`).join('')}</select></label><button class="button secondary" data-forum-action="preset">Готовые шаблоны</button><button class="button secondary" data-forum-action="bulk-move">Переместить выбранные</button><button class="button danger" data-forum-action="bulk-delete">Удалить выбранные</button><button class="button secondary" data-forum-action="export-pack">Экспорт набора</button><button class="button secondary" data-forum-action="import-pack">Импорт набора</button></div></section>
  <div id="forum-items" class="stack">${visible.length ? visible.map(t => `<article class="card" data-template-card ${search.trim()&&!C.selectTemplates([t],current.id,search).length?'hidden':''} data-filter="${e([t.label,t.category,t.text,...(t.tags??[])].join(' ').toLocaleLowerCase('ru'))}"><div class="row spread"><div><label><input type="checkbox" data-binder-select="${e(t.id)}"> <strong>${e(t.label)}</strong></label><p class="subtle">${e(t.category || 'Без категории')} · ${t.profileId === '*' ? 'Все профили' : (current.id === t.profileId ? 'Активный профиль' : 'Другой профиль')} · ${e(t.format.toUpperCase())}${t.tags?.length?' · '+e(t.tags.join(', ')):''}</p></div>${t.shortcut ? `<span class="tag">Alt+Shift+${t.shortcut}</span>` : ''}</div><pre class="template-text">${e(t.text)}</pre><div class="row"><button class="button secondary" data-forum-action="favorite" data-id="${e(t.id)}" aria-pressed="${!!t.favorite}">${t.favorite?'★':'☆'} Избранное</button><button class="button secondary" data-forum-action="duplicate" data-id="${e(t.id)}">Дублировать</button><button class="button secondary" data-forum-action="export-one" data-id="${e(t.id)}">Экспорт</button><button class="button secondary" data-forum-action="copy" data-id="${e(t.id)}">Копировать</button><button class="button secondary" data-forum-action="insert" data-id="${e(t.id)}">Вставить в форум</button><button class="button secondary" data-forum-action="edit" data-id="${e(t.id)}">Редактировать</button><button class="button danger" data-forum-action="delete" data-id="${e(t.id)}">Удалить</button></div></article>`).join('') : '<section class="card empty">Нет шаблонов по выбранному фильтру. Измените фильтр или создайте шаблон.</section>'}</div>
  ${navigationCard(state)}
  <section class="card"><h3>Публичные профили XenForo</h3><p class="subtle">На открытой странице /members/ плавающая панель отображает имя, статус и общедоступные показатели, присутствующие в DOM. Данные не запрашиваются с закрытых страниц и не сохраняются.</p></section>
  <section class="card"><h3>Подстановка переменных</h3><p class="lead"><code>{{nickname}}</code>, <code>{{reason}}</code>, <code>{{server}}</code>, <code>{{project}}</code>, <code>{{thread}}</code>, <code>{{url}}</code>, <code>{{date}}</code>, <code>{{time}}</code>, <code>{{selection}}</code></p><p class="subtle">На форуме {{nickname}} и {{reason}} заполняются в панели MajesticToolkit, {{selection}} берётся из выделения редактора. Новые переменные требуют заполнения; обязательные значения проверяются, а сообщения не отправляются автоматически.</p></section>
  <section class="card"><h3>Инструменты модерации</h3><p class="lead">В плавающей панели на странице темы доступны переходы к штатным действиям закрытия/открытия и перемещения. Они отображаются при наличии таких действий в интерфейсе форума и исполняются только через механизмы сайта. Отдельно подтвердите завершение операции на форуме.</p><p class="subtle">Для работы разрешите доступ в разделе «Сайты и доступ», затем обновите открытую вкладку форума.</p><button class="button secondary" data-action="nav" data-view="sites">Управлять разрешениями</button></section></div>`;
}
function ensureDialog(state) {
  let dlg = document.getElementById('forum-template-dialog');
  if (!dlg) {
    dlg = document.createElement('dialog'); dlg.id = 'forum-template-dialog';
    replaceHtml(dlg, `<form id="forum-template-form"><h2 id="forum-template-title">Шаблон</h2><input name="id" type="hidden"><label>Название<input name="label" maxlength="90" required placeholder="Одобрение жалобы"></label><label>Папка<input name="category" maxlength="60" placeholder="Жалобы/Суд/Общие"></label><div class="grid"><label>Теги (через запятую)<input name="tags" maxlength="820"></label><label>Порядок (меньше — выше)<input name="order" type="number" min="0" max="1000000" value="1000000"></label></div><label>Профиль<select name="profileId"></select></label><div class="grid"><label>Формат<select name="format"><option value="bbcode">BBCode</option><option value="plain">Простой текст</option></select></label><label>Горячая клавиша<select name="shortcut"><option value="0">Без сочетания</option>${Array.from({length:9},(_,i)=>`<option value="${i+1}">Alt+Shift+${i+1}</option>`).join('')}</select></label></div><label>Текст шаблона<textarea name="text" maxlength="16000" rows="8" required spellcheck="true" placeholder="Здравствуйте, {{nickname}}!"></textarea></label><div class="row"><button class="button secondary" type="button" data-bb="b">B</button><button class="button secondary" type="button" data-bb="i">I</button><button class="button secondary" type="button" data-bb="u">U</button><button class="button secondary" type="button" data-bb="url">Ссылка</button><button class="button secondary" type="button" data-bb="quote">Цитата</button></div><div class="row"><button class="button secondary" type="button" data-bb="s">Зачеркнуть</button><button class="button secondary" type="button" data-bb="code">Код</button><button class="button secondary" type="button" data-bb="color">Цвет</button><button class="button secondary" type="button" data-bb="list">Список</button><button class="button secondary" type="button" data-bb="spoiler">Спойлер</button></div><section class="stack"><h3>Переменные</h3><p class="subtle">Добавьте в текст {{decision}} или другой ключ. Настройте тип и обязательность ниже. Стандартные переменные используют контекст форума, пока не переопределены.</p><div id="binder-variable-defs"></div></section><section id="binder-history" class="stack"></section><div class="preview-area"><p class="subtle">Предпросмотр BBCode</p><div id="forum-preview"></div></div><div class="dialog-actions"><button type="button" class="button secondary" data-forum-action="cancel">Отмена</button><button class="button primary" type="submit">Сохранить шаблон</button></div></form>`);
    document.body.append(dlg);
    dlg.addEventListener('input', ev=>{if(ev.target.name==='text')syncVariableDefs(dlg);showPreview(dlg);scheduleDraft(dlg);});
    dlg.addEventListener('change', () => {showPreview(dlg);scheduleDraft(dlg);});
    dlg.addEventListener('click', ev => {
      const tag = ev.target.closest('button[data-bb]')?.dataset.bb;
      if (!tag) return;
      const area = dlg.querySelector('textarea[name="text"]');
      const start = area.selectionStart, end = area.selectionEnd;
      const value = area.value, selection = value.slice(start, end);
      const opening = tag === 'url' ? '[url=https://example.org]' : tag==='color'?'[color=#3366cc]':tag==='list'?'[list][*]':`[${tag}]`;
      const closing = `[/${tag}]`;
      area.setRangeText(opening + selection + closing, start, end, 'end');
      area.focus(); syncVariableDefs(dlg); showPreview(dlg);scheduleDraft(dlg);
    });
  }
  const select = dlg.querySelector('select[name="profileId"]');
  replaceHtml(select, `<option value="*">Все профили</option>` + state.profiles.map(p => `<option value="${e(p.id)}">${e(p.name)} · ${e(p.server)}</option>`).join(''));
  return dlg;
}
function scheduleDraft(dlg){clearTimeout(draftTimer);const key=draftKey;if(!key)return;draftTimer=setTimeout(()=>{try{const form=dlg.querySelector('form'),data=Object.fromEntries(new FormData(form));data.variables=readDefs(dlg);sessionStorage.setItem(key,JSON.stringify(data));}catch{}},250);}
function clearDraft(){clearTimeout(draftTimer);try{if(draftKey)sessionStorage.removeItem(draftKey);}catch{}draftKey='';}
function readDefs(dlg){return [...dlg.querySelectorAll('[data-variable-key]')].filter(row=>row.querySelector('[data-configured]').checked).map(row=>({key:row.dataset.variableKey,label:row.querySelector('[data-label]').value||row.dataset.variableKey,type:row.querySelector('[data-type]').value,required:row.querySelector('[data-required]').checked,options:row.querySelector('[data-options]').value.split('\n').map(x=>x.trim()).filter(Boolean),defaultValue:row.querySelector('[data-default]').value}));}
function syncVariableDefs(dlg,initial){
  const root=dlg.querySelector('#binder-variable-defs'),names=C.variableNames(dlg.querySelector('[name="text"]').value);
  if(!initial&&JSON.stringify([...root.querySelectorAll('[data-variable-key]')].map(r=>r.dataset.variableKey))===JSON.stringify(names))return;
  const previous=new Map((initial??readDefs(dlg)).map(v=>[v.key,v]));
  replaceHtml(root,names.map(key=>{const v=previous.get(key),built=C.builtin.includes(key);return `<fieldset data-variable-key="${e(key)}" class="stack"><legend>${e(key)}</legend><label><input type="checkbox" data-configured ${v||!built?'checked':''}> Настроить поле</label><div class="grid"><label>Название<input data-label maxlength="90" value="${e(v?.label??key)}"></label><label>Тип<select data-type>${[['text','Текст'],['multiline','Многострочный'],['number','Число'],['date','Дата'],['url','Ссылка'],['select','Список'],['boolean','Да / Нет']].map(([type,label])=>`<option value="${type}" ${type===(v?.type??'text')?'selected':''}>${label}</option>`).join('')}</select></label></div><label><input type="checkbox" data-required ${v?.required||(!v&&!built)?'checked':''}> Обязательное поле</label><label>Варианты списка (по одному на строку)<textarea data-options rows="2">${e((v?.options??[]).join('\n'))}</textarea></label><label>Значение по умолчанию<input data-default maxlength="2000" value="${e(v?.defaultValue??'')}"></label></fieldset>`;}).join('')||'<p class="subtle">Нет переменных.</p>');
}
function showPreview(dlg) {
  const text = dlg.querySelector('textarea[name="text"]').value;
  const format = dlg.querySelector('[name="format"]').value;
  const preview = dlg.querySelector('#forum-preview');
  replaceHtml(preview, format === 'bbcode' ? C.bbcodeToHtml(text) : e(text).replace(/\r?\n/g, '<br>'));
}
function editDialog(state, id = null) {
  const dialog = ensureDialog(state);
  const original = id ? templates.find(t => t.id === id) : null;
  if (id && !original) throw new Error('Шаблон не найден');
  clearTimeout(draftTimer);draftKey='mtBinderDraft:'+state.activeProfileId+':'+(id??'new');
  const form = dialog.querySelector('form'); form.reset();
  form.elements.namedItem('id').value = original?.id ?? '';
  form.elements.namedItem('label').value = original?.label ?? '';
  form.elements.namedItem('category').value = original?.category ?? '';
  form.elements.namedItem('profileId').value = original?.profileId ?? state.activeProfileId;
  form.elements.namedItem('format').value = original?.format ?? 'bbcode';
  form.elements.namedItem('shortcut').value = String(original?.shortcut ?? 0);
  form.elements.namedItem('text').value = original?.text ?? '';
  dialog.querySelector('#forum-template-title').textContent = original ? 'Редактировать шаблон' : 'Новый шаблон';
  form.elements.namedItem('tags').value=(original?.tags??[]).join(', ');
  form.elements.namedItem('order').value=String(original?.order??1000000);
  syncVariableDefs(dialog,original?.variables??[]);
  try{const draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(draft&&confirm('Восстановить несохранённый черновик шаблона?')){for(const k of ['label','category','profileId','format','shortcut','text','tags','order'])if(typeof draft[k]==='string')form.elements.namedItem(k).value=draft[k];syncVariableDefs(dialog,draft.variables??[]);}else if(draft)sessionStorage.removeItem(draftKey);}catch{}
  replaceHtml(dialog.querySelector('#binder-history'),original?.history?.length?`<h3>История версий</h3>${original.history.map((h,i)=>`<div class="row spread"><span>${e(h.label)} · ${e(h.updatedAt)}</span><button type="button" class="button secondary" data-forum-action="restore-version" data-id="${e(original.id)}" data-index="${i}">Восстановить</button></div>`).join('')}`:'');
  showPreview(dialog); dialog.showModal(); form.elements.namedItem('label').focus();
}
function resultText(t, state) {
  const profile = state.profiles.find(x => x.id === state.activeProfileId);
  const ts = new Date();
  return C.renderTemplate(t, { project: profile?.project ?? '', server: profile?.server ?? '', date: ts.toLocaleDateString('ru-RU'), time: ts.toLocaleTimeString('ru-RU') });
}
export async function handleForumAction(button, state, rerender, feedback) {
  const action = button.dataset.forumAction;
  if (!action) return false;
  const id = button.dataset.id;
  if(action==='preset'){
    const date=new Date().toISOString(),profileId=state.activeProfileId,rows=[['На рассмотрении','Жалобы','Здравствуйте, {{nickname}}!\nВаше обращение принято на рассмотрение.'],['Запрос доказательств','Жалобы','Здравствуйте, {{nickname}}!\nУточните обстоятельства и приложите доказательства: {{reason}}.'],['Ответ на обращение','Общие','Здравствуйте, {{nickname}}!\n{{reason}}'],['Уведомление ведомства','Государственные структуры','Уведомление: {{subject}}\n{{message}}'],['Судебное уведомление','Суд','По делу {{case_id}}: {{message}}']].map(([label,category,text],i)=>C.cleanTemplate({id:'preset_binder_'+i,profileId,label,category,text,format:'plain',shortcut:0,createdAt:date,updatedAt:date}));
    const text=C.exportPack(rows),pack=C.parseImport(text,profileId),mode=await importPreview(pack,state.profiles.find(p=>p.id===profileId));if(!mode)return true;
    const result=await importBinderPack(text,profileId,mode);await refreshForum();rerender();feedback('Добавлено шаблонов: '+result.imported);return true;
  }
  if(action==='bulk-move'||action==='bulk-delete'){
    const ids=[...document.querySelectorAll('[data-binder-select]:checked')].map(el=>el.dataset.binderSelect);if(!ids.length)throw Error('Выберите шаблоны');
    let folder='';if(action==='bulk-move'){folder=prompt('Новая папка (например Жалобы/Ответы). Пустое значение — без папки.','');if(folder===null)return true;}else if(!confirm('Удалить выбранные шаблоны ('+ids.length+')?'))return true;
    await bulkBinderTemplates(ids,state.activeProfileId,action==='bulk-move'?'move':'delete',folder);await refreshForum();rerender();feedback('Обработано шаблонов: '+ids.length);return true;
  }
  if(action==='filter'){libraryFilter=button.dataset.id;rerender();return true;}
  if(action==='export-pack'){downloadPack(C.selectTemplates(templates,state.activeProfileId),forumLinks.filter(x=>x.kind!=='bookmark'&&(x.profileId==='*'||x.profileId===state.activeProfileId)));return true;}
  if(action==='import-pack'){
    const file=await choosePack();if(!file)return true;if(file.size>8*1024*1024)throw Error('Файл превышает 8 МиБ');
    const text=await file.text(),pack=C.parseImport(text,state.activeProfileId),profile=state.profiles.find(p=>p.id===state.activeProfileId);
    const mode=await importPreview(pack,profile);if(!mode)return true;
    const result=await importBinderPack(text,state.activeProfileId,mode);await refreshForum();rerender();feedback(`Импортировано: ${result.imported} шаблонов, ${result.linksImported} ссылок; пропущено: ${result.skipped}, снято конфликтующих клавиш: ${result.unassigned}`);return true;
  }
  if (action === 'create') { editDialog(state); return true; }
  if (action === 'edit') { editDialog(state, id); return true; }
  if (action === 'cancel') { document.getElementById('forum-template-dialog')?.close(); return true; }
  if(action==='clear-nav-history'){if(confirm('Очистить историю текущего профиля?')){await clearNavigationHistory(state.activeProfileId);await refreshForum();rerender();}return true;}
  if(action==='show-navigation'||action==='show-binder'||action==='show-customization'){document.getElementById(action==='show-navigation'?'navigation-2':action==='show-customization'?'forum-customization':'forum-search')?.scrollIntoView({block:'start'});return true;}
  if(action==='move-nav-up'||action==='move-nav-down'||action==='move-nav-drop'){const host=XF.domain(state.profiles.find(p=>p.id===state.activeProfileId).forumUrl),rows=XF.selectNavigation(forumLinks,state.activeProfileId,host),i=rows.findIndex(x=>x.id===id),j=action==='move-nav-drop'?rows.findIndex(x=>x.id===button.dataset.target):i+(action==='move-nav-up'?-1:1);if(i<0||j<0||j>=rows.length||i===j||!!rows[i].pinned!==!!rows[j].pinned)return true;const [moved]=rows.splice(i,1);rows.splice(j,0,moved);await reorderNavigation(rows.map(x=>x.id),state.activeProfileId,host);await refreshForum();rerender();return true;}
  if(action==='pin-link'||action==='open-link'){const x=forumLinks.find(x=>x.id===id);if(!x||!['*',state.activeProfileId].includes(x.profileId))throw Error('Ссылка не найдена');if(action==='pin-link'){await saveXenForoLink({pinned:!x.pinned},id);await refreshForum();rerender();}else {await api.tabs.create({url:x.url});if(x.kind==='bookmark')await markNavigationOpened(x.id,state.activeProfileId,XF.domain(state.profiles.find(p=>p.id===state.activeProfileId).forumUrl));}return true;}
  if (action === 'clear-link-form') {const f=document.getElementById('xf-navigation-form');f?.reset();if(f)f.elements.namedItem('id').value='';return true;}
  if (action === 'edit-link') {
    const link=forumLinks.find(x=>x.id===id);if(!link)throw Error('Ссылка не найдена');
    const form=document.getElementById('xf-navigation-form');
    for(const field of ['id','title','url','profileId','group','note','kind','host','placement','target','icon','order','tags'])form.elements.namedItem(field).value=field==='tags'?(link.tags||[]).join(', '):link[field]??({kind:'link',host:'*',placement:'both',target:'new',icon:'link',order:1000000}[field]??'');form.elements.namedItem('pinned').checked=!!link.pinned;
    form.elements.namedItem('title').focus();return true;
  }
  if (action === 'remove-link') {
    if(!forumLinks.some(x=>x.id===id))throw Error('Ссылка не найдена');
    if(!confirm('Удалить ссылку из меню форума?'))return true;
    await deleteXenForoLink(id);await refreshForum();rerender();feedback('Пользовательская ссылка удалена');return true;
  }
  const t = templates.find(x => x.id === id);
  if (!t) throw new Error('Шаблон не найден');
  if(action==='favorite'){await setBinderFavorite(t.id,state.activeProfileId,!t.favorite);await refreshForum();rerender();return true;}
  if(action==='duplicate'){await upsertTemplate({...t,label:(t.label.slice(0,78)+' (копия)'),shortcut:0});await refreshForum();rerender();feedback('Копия создана');return true;}
  if(action==='export-one'){downloadPack([t]);return true;}
  if(action==='restore-version'){
    const h=t.history?.[Number(button.dataset.index)];if(!h)throw Error('Версия не найдена');
    if(!confirm('Восстановить сохранённую версию шаблона? Текущая версия останется в истории.'))return true;
    await upsertTemplate({...h,variables:h.variables??[],tags:h.tags??[],profileId:t.profileId,favorite:t.favorite,order:t.order},t.id);document.getElementById('forum-template-dialog')?.close();await refreshForum();rerender();feedback('Версия восстановлена');return true;
  }
  if (action === 'delete') {
    if (!confirm(`Удалить шаблон «${t.label}»?`)) return true;
    await removeTemplate(id); await refreshForum(); rerender(); feedback('Шаблон удалён'); return true;
  }
  if (action === 'copy') {
    if(C.variableNames(t.text).length){if(!await copyTemplateDialog(t,state))return true;}else await navigator.clipboard.writeText(resultText(t,state));
    await recordBinderUsage(state.activeProfileId,t.id);await refreshForum();rerender();feedback('Шаблон скопирован');return true;
  }
  if (action === 'insert') {
    // The workspace is usually the active tab, so a forum tab is normally inactive.
    // Restrict selection to the profile that owns the template to avoid cross-project insertion.
    const profileId = t.profileId === '*' ? state.activeProfileId : t.profileId;
    const profile = state.profiles.find(p => p.id === profileId);
    if (!profile) throw Error('Профиль шаблона не найден');
    const host = (() => {
      try { return new URL(profile.forumUrl).hostname.toLowerCase(); }
      catch { return ''; }
    })();
    const allowedHosts = new Set(['forum.majestic-rp.ru','forum.russia.online']);
    if (!allowedHosts.has(host)) {
      feedback('Для вставки выберите профиль официального форума Majestic RP или Russia Online.', true);
      return true;
    }
    const origin = `https://${host}/*`;
    if (!await api.permissions.contains({origins:[origin]})) {
      feedback('Сначала разрешите доступ к этому форуму в разделе «Сайты и доступ».', true);
      return true;
    }
    const tabs = await api.tabs.query({url:[origin]});
    const candidates = tabs.filter(tab => tab.id && (()=>{
      try { return new URL(tab.url).hostname.toLowerCase() === host; }
      catch { return false; }
    })());
    // Prefer the current window, then the most recently visited matching forum tab.
    candidates.sort((a,b)=>Number(Boolean(b.active))-Number(Boolean(a.active)) ||
      Number(Boolean(b.currentWindow))-Number(Boolean(a.currentWindow)) ||
      (b.lastAccessed||0)-(a.lastAccessed||0));
    if (!candidates.length) {
      feedback('Откройте соответствующий форум и редактор ответа, затем повторите вставку.',true);
      return true;
    }
    let response;
    try { response = await api.tabs.sendMessage(candidates[0].id,{type:'RP_NEXUS_APPLY_TEMPLATE',id,profileId}); }
    catch (error) { throw Error('Нет связи с панелью форума. Проверьте разрешение на сайт и обновите вкладку, затем повторите.'); }
    if (!response?.ok) throw new Error(response?.error || 'Вставка не подтверждена страницей форума');
    if(response.pending){await api.tabs.update(candidates[0].id,{active:true});feedback('Заполните переменные и подтвердите вставку в открытой вкладке форума');return true;}
    feedback('Шаблон вставлен в редактор форума'); return true;
  }
  return true;
}
export async function handleForumSubmit(event, state, rerender, feedback) {
  if (event.target.getAttribute('id')==='xf-navigation-form') {
    event.preventDefault();const elements=event.target.elements;
    const profileId=elements.namedItem('profileId').value;
    if(profileId!=='*'&&!state.profiles.some(x=>x.id===profileId))throw Error('Профиль не найден');
    const id=elements.namedItem('id').value;
    const input={title:elements.namedItem('title').value,url:elements.namedItem('url').value,profileId};
    for(const key of ['kind','host','placement','target','icon','group','note']){const value=elements.namedItem(key)?.value;if(value!==undefined)input[key]=value;}
    const order=elements.namedItem('order')?.value;if(order!==undefined)input.order=Number(order||1000000);
    const tags=elements.namedItem('tags')?.value;if(tags!==undefined)input.tags=tags.split(',').map(x=>x.trim()).filter(Boolean);
    const pinned=elements.namedItem('pinned')?.checked;if(pinned!==undefined)input.pinned=pinned;
    if(input.kind==='bookmark'){const p=state.profiles.find(p=>p.id===profileId);if(!p||XF.domain(p.forumUrl)!==XF.domain(input.url))throw Error('Закладка должна принадлежать форуму выбранного профиля');input.url=XF.pageUrl(input.url);}
    await saveXenForoLink(input,id||null);
    await refreshForum();rerender();feedback('Ссылка сохранена для XenForo');return true;
  }
  if (event.target.getAttribute('id') !== 'forum-template-form') return false;
  event.preventDefault();
  const form = event.target.elements;
  const id = form.namedItem('id').value;
  const input = Object.fromEntries(['label','category','profileId','format','shortcut','text'].map(key => [key, form.namedItem(key).value]));
  const dlg=document.getElementById('forum-template-dialog');
  if(dlg?.querySelectorAll){input.tags=form.namedItem('tags').value.split(',').map(x=>x.trim()).filter(Boolean);input.order=Number(form.namedItem('order').value||1000000);input.variables=readDefs(dlg);}
  if (input.profileId !== '*'  && !state.profiles.some(p => p.id === input.profileId)) throw new Error('Профиль не существует');
  if (input.shortcut !== '0' && templates.some(x => x.id !== id && x.shortcut === Number(input.shortcut) && x.profileId === input.profileId)) throw new Error('Сочетание клавиш уже занято шаблоном в этом профиле');
  await upsertTemplate(input, id || null);
  clearDraft();await refreshForum();
  document.getElementById('forum-template-dialog').close();
  rerender(); feedback('Шаблон сохранён'); return true;
}
export function setBinderFilter(key,value){if(key==='binder-category')libraryCategory=value;else libraryFilter=value;}
export function filterForum(query) {
  search = query;
  const q = search.trim().toLocaleLowerCase('ru');
  for (const card of document.querySelectorAll('[data-template-card]')) card.hidden = !card.dataset.filter.includes(q);
}
