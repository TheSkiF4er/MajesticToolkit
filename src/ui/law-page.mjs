import '../lib/safe-dom.js';
const {replaceHtml}=globalThis.MTSafeDOM;
import {listLawRecords,getLawRecord,newLawBook,editLawBook,newLawEdition,chooseLawEdition,markLawSourceChecked,newLawMemo,editLawMemo,toggleLawFavorite,removeLawRecord,replaceLawRecords} from '../lib/law-store.mjs';
import {activeEdition,parseArticles,searchLaws,exportLawDataset,parseLawDataset,exportVerifiedLawDataset,parseVerifiedLawDataset,editionAtDate,applicability,compareLawEditions,makeLawCitation,articleProvisions} from '../lib/law-core.mjs';
import {escapeHtml as e} from '../lib/sites.mjs';

let entries=[],selectedBook='',query='',favOnly=false,selectedTab='articles',selectedEdition='',visible=60;
let asOfDate='',categoryFilter='',compareWith='',compareVisible=30;
export async function refreshLaw(){entries=await listLawRecords();}
export function lawRecords(){return entries;}
const dateNow=()=>new Date().toISOString().slice(0,10);
function saveFile(name,content){const blob=new Blob([content],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const link=(url,title)=>url?`<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(title)} ↗</a>`:'';
function lawDialog(title,body,formType,recordId='',other=''){
  const old=document.getElementById('law-dialog');if(old?.open)old.close();old?.remove();
  const dialog=document.createElement('dialog');dialog.id='law-dialog';
  replaceHtml(dialog,`<form id="law-form"><h2>${e(title)}</h2><input type="hidden" name="formType" value="${e(formType)}"><input type="hidden" name="recordId" value="${e(recordId)}">${other}${body}<div class="dialog-actions"><button type="button" class="button secondary" data-law-action="close">Отмена</button><button type="submit" class="button primary">Сохранить</button></div></form>`);
  document.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.querySelector('input:not([type=hidden]),textarea')?.focus();return dialog;
}
function textField(name,label,value='',extra=''){return `<label class="field">${e(label)}<input name="${e(name)}" value="${e(String(value))}" ${extra}></label>`;}
function dateField(name,label,value='',required=false){return textField(name,label,value,`type="date" ${required?'required':''}`);}
function sourceCheck(){return `<label class="check"><input type="checkbox" name="sourceChecked" value="1"> Я лично проверил ссылку на источник и соответствие текста (без автоматической проверки)</label>`;}
function editorHelp(){return `<p class="subtle">Разделы и главы распознаются по строкам «Раздел I. …», «Глава 1. …». Статьи — «Статья 1. …». Вступление до первой статьи сохраняется как преамбула. Текст и нумерация частей/пунктов не изменяются. Каждая редакция неизменяема.</p>`;}
function bookForm(book=null){
  return `${textField('title','Название нормативного акта',book?.title||'','required maxlength="170"')}
    ${textField('category','Категория (УК, ПК, Конституция и др.)',book?.category||'Закон','required maxlength="90"')}
    ${textField('sourceUrl',book?'Текущая ссылка на источник (HTTPS)':'Ссылка на источник (HTTPS)',book?.sourceUrl||'','type="url" maxlength="1000"')}
    ${dateField('repealedAt','Дата отмены акта (с этой даты акт не действует)',book?.repealedAt||'')}
    ${book?'<p class="subtle">Изменение ссылки на акт не переписывает уже сохранённые ссылки новых редакций.</p>':`
      ${textField('label','Первая редакция','Первая редакция','required maxlength="100"')}
      ${dateField('effectiveDate','Дата вступления в силу',dateNow(),true)}
      ${dateField('expiresAt','Дата прекращения действия редакции (необязательно)')}
      ${textField('amendmentNote','Основание принятия / примечание','', 'maxlength="800"')}
      ${sourceCheck()}
      <label class="field">Текст нормативного акта<textarea name="articlesText" required rows="13" maxlength="2097152" placeholder="Раздел I. Общие положения\nГлава 1. Основные нормы\nСтатья 1. Предмет регулирования\n1. Текст части.\n1.1. Текст пункта."></textarea></label>${editorHelp()}`}`;
}
function editionText(book){
  const ed=activeEdition(book),lines=[];if(ed.preamble)lines.push(ed.preamble);
  let lastSection='',lastChapter='';for(const a of ed.articles){
    if(a.section&&a.section!==lastSection){lines.push(a.section);lastSection=a.section;lastChapter='';}
    if(a.chapter&&a.chapter!==lastChapter){lines.push(a.chapter);lastChapter=a.chapter;}
    lines.push(`Статья ${a.key}. ${a.title}\n${a.text}`);
  }return lines.join('\n\n');
}
function editionForm(book){return `
  ${textField('label','Название новой редакции',`Редакция ${book.editions.length+1}`,'required maxlength="100"')}
  ${dateField('effectiveDate','Дата вступления в силу',dateNow(),true)}
  ${dateField('expiresAt','Дата прекращения действия редакции (необязательно)')}
  ${textField('sourceUrl','Ссылка на текст этой редакции (HTTPS)',book.sourceUrl,'type="url" maxlength="1000"')}
  ${textField('amendmentNote','Основание и описание поправки','', 'maxlength="800"')}
  ${sourceCheck()}
  <label class="field">Полный текст новой редакции<textarea name="articlesText" required rows="16" maxlength="2097152">${e(editionText(book))}</textarea></label>
  <p class="subtle">Предзаполнен текст рабочей редакции. После сохранения он станет новой неизменяемой редакцией; прежний текст, реквизиты и даты сохранятся.</p>${editorHelp()}`;
}
function memoForm(memo=null){return `${textField('title','Заголовок памятки',memo?.title||'','required maxlength="150"')}${textField('category','Категория',memo?.category||'Общее','required maxlength="90"')}<label class="field">Памятка<textarea name="body" rows="11" maxlength="16000" required>${e(memo?.body||'')}</textarea></label>`;}
function stats(profileId){const rows=entries.filter(x=>x.profileId===profileId);return {books:rows.filter(x=>x.type==='book'),memos:rows.filter(x=>x.type==='memo'),favorites:rows.filter(x=>x.type==='favorite')};}
function selectedBookDisplay(profileId){return entries.find(x=>x.id===selectedBook&&x.profileId===profileId&&x.type==='book')||null;}
function bookEdition(book){return selectedEdition?book.editions.find(ed=>ed.id===selectedEdition):asOfDate?editionAtDate(book,asOfDate):activeEdition(book);}
function statusText(book){
  const target=asOfDate||dateNow(),a=applicability(book,target);
  if(a.status==='repealed')return `Отменён с ${book.repealedAt}`;
  if(a.status==='upcoming')return `Ещё не вступил в силу на ${target}`;
  if(a.status==='gap')return `Нет действующей редакции на ${target}`;
  return `Действует на ${target}: ${a.edition.label}`;
}
function comparePanel(book,edition){
  if(!edition||book.editions.length<2)return '';
  const sorted=[...book.editions].sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));
  const previous=sorted.filter(v=>v.effectiveDate<edition.effectiveDate).at(-1)||sorted.find(v=>v.id!==edition.id);
  const source=book.editions.find(v=>v.id===compareWith&&v.id!==edition.id)||previous;
  if(!source)return '';
  const diff=compareLawEditions(book,source.id,edition.id);
  return `<section class="card stack" id="law-compare"><div class="row spread"><div><h4>Сравнение редакций по статьям и пунктам</h4><p class="subtle">Новые: ${diff.added}, изменённые: ${diff.changed}, исключённые: ${diff.removed}. Текст исходных редакций не изменяется.</p></div></div>
  <label class="field">Сравнить выбранную редакцию с<select id="law-compare-edition">${book.editions.filter(ed=>ed.id!==edition.id).map(ed=>`<option value="${e(ed.id)}" ${ed.id===source.id?'selected':''}>${e(ed.label)} · ${e(ed.effectiveDate)}</option>`).join('')}</select></label>
  ${diff.differences.length?diff.differences.slice(0,compareVisible).map(item=>`<article class="law-diff-item"><h4>Статья ${e(item.key)} · ${item.kind==='added'?'Добавлена':item.kind==='removed'?'Исключена':'Изменена'}</h4>
    ${item.before?.title!==item.after?.title?`<p class="subtle">Заголовок: ${e(item.before?.title||'нет')} → ${e(item.after?.title||'нет')}</p>`:''}
    ${(item.before?.chapter!==item.after?.chapter||item.before?.section!==item.after?.section)?`<p class="subtle">Структура: ${e([item.before?.section,item.before?.chapter].filter(Boolean).join(' / ')||'нет')} → ${e([item.after?.section,item.after?.chapter].filter(Boolean).join(' / ')||'нет')}</p>`:''}
    ${item.provisions.length?item.provisions.map(part=>`<div class="law-diff-clause"><small class="subtle">${e(part.key||'Текст')} · ${part.kind==='added'?'добавлен':part.kind==='removed'?'исключён':'изменён'}</small><div class="law-compare-grid"><div><strong>Было</strong><p class="law-text">${e(part.before||'—')}</p></div><div><strong>Стало</strong><p class="law-text">${e(part.after||'—')}</p></div></div></div>`).join(''):'<p class="subtle">Изменились реквизиты статьи, текст совпадает.</p>'}
    </article>`).join(''):'<p class="subtle">Различий в статьях нет.</p>'}
  ${diff.differences.length>compareVisible?'<button class="button secondary" data-law-action="compare-more">Показать ещё отличия</button>':''}</section>`;
}
function bookHeader(book){
  const edition=bookEdition(book),work=activeEdition(book),isWork=edition?.id===book.activeEditionId;
  const selected=(asOfDate?`Срез на ${asOfDate}`:'Ручной выбор рабочей редакции');
  const sourceUrl=edition?(Object.hasOwn(edition,'sourceUrl')?edition.sourceUrl:book.sourceUrl):book.sourceUrl;
  return `<section class="card law-book stack">
    <div class="row spread"><div><div class="eyebrow">${e(book.category)}</div><h3>${e(book.title)}</h3>${link(sourceUrl,edition&&Object.hasOwn(edition,'sourceUrl')?'Источник выбранной редакции':'Текущая ссылка на акт (историческая ссылка не закреплена)')}</div><button class="button secondary" data-law-action="back">← Все акты</button></div>
    <div class="row"><button class="button secondary" data-law-action="edit-book" data-id="${e(book.id)}">Реквизиты и отмена</button><button class="button primary" data-law-action="new-edition" data-id="${e(book.id)}">+ Новая редакция</button><button class="button danger" data-law-action="delete" data-id="${e(book.id)}">Удалить</button></div>
    <p class="law-effectiveness">${e(statusText(book))}</p>
    <label class="field">Просмотр редакции<select id="law-edition"><option value="" ${!selectedEdition?'selected':''}>${e(selected)}${edition?' · '+e(edition.label):''}</option>${[...book.editions].sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)).map(ed=>`<option value="${e(ed.id)}" ${ed.id===selectedEdition?'selected':''}>${e(ed.label)} · с ${ed.effectiveDate}${ed.id===book.activeEditionId?' · рабочая':''}</option>`).join('')}</select></label>
    ${edition?`<p class="subtle">Редакция: ${e(edition.label)} · с ${e(edition.effectiveDate)}${edition.expiresAt?' · до '+e(edition.expiresAt):''} · ${edition.articles.length} статей.</p>
      ${edition.sourceCheckedAt?`<p class="subtle">Источник вручную проверен пользователем ${e(edition.sourceCheckedAt.slice(0,10))}. Это не автоматическая проверка официальности.</p>`:'<p class="law-old">Источник и соответствие текста не подтверждены пользователем.</p>'}
      ${Object.hasOwn(edition,'sourceUrl')&&edition.sourceUrl?`<button class="button secondary" data-law-action="verify-source" data-id="${e(book.id)}" data-edition="${e(edition.id)}" data-checked="${edition.sourceCheckedAt?'1':'0'}">${edition.sourceCheckedAt?'Снять отметку проверки':'Отметить источник проверенным'}</button>`:''}
      ${edition.amendmentNote?`<p class="subtle">Поправка: ${e(edition.amendmentNote)}</p>`:''}
      ${edition.preamble?`<details class="law-preamble"><summary>Преамбула / вводный текст</summary><p class="law-text">${e(edition.preamble)}</p></details>`:''}
      ${!asOfDate&&!isWork?`<p class="law-old">Это историческая редакция. Она не обязательно действовала на дату события.</p><button class="button secondary" data-law-action="activate-edition" data-id="${e(book.id)}" data-edition="${e(edition.id)}">Выбрать как рабочую</button>`:''}`:`<p class="law-old">На выбранную дату применимой редакции нет. Снимок старого текста можно открыть вручную, но он не будет помечен действующим.</p>`}
    <p class="subtle">Рабочая редакция: ${e(work.label)}. Правовая применимость определяется датой вступления в силу, прекращения действия и отмены акта, а не ручным переключением.</p>
   </section>${comparePanel(book,edition)}`;
}
function articleCards(profileId,book){
  const opts={favoritesOnly:favOnly,category:categoryFilter,asOfDate};if(book&&selectedEdition)opts.editionId=selectedEdition;
  const rows=searchLaws(entries,profileId,query,opts).filter(row=>!book||row.book.id===book.id);
  return `<section class="card stack"><div class="row spread"><h3>Статьи (${rows.length})</h3>${book?'':`<p class="subtle">${asOfDate?'Применимые редакции на '+e(asOfDate):'Рабочие редакции каждого акта'}</p>`}</div>
    ${rows.length?rows.slice(0,visible).map(row=>{
      const structure=[row.article.section,row.article.chapter].filter(Boolean),parts=articleProvisions(row.article);
      return `<article class="law-article"><div class="row spread"><div><small class="subtle">${e(row.book.title)} · ${e(row.edition.label)} · с ${e(row.edition.effectiveDate)}</small>
        ${structure.length?`<div class="law-structure">${structure.map(e).join(' / ')}</div>`:''}
        <h4>Статья ${e(row.article.key)}. ${e(row.article.title)}</h4></div>
        <button class="button secondary" data-law-action="favorite" data-id="${e(row.book.id)}" data-key="${e(row.article.key)}" title="Добавить или убрать из избранного" aria-label="${row.favorite?'Убрать из избранного':'Добавить в избранное'}">${row.favorite?'★ Избранное':'☆ Избранное'}</button></div>
        <p class="law-text">${e(row.article.text)}</p><div class="row"><small class="subtle">Частей и пунктов: ${parts.filter(x=>x.key).length}</small>
        <button class="button link" data-law-action="copy-article" data-id="${e(row.book.id)}" data-key="${e(row.article.key)}" data-edition="${e(row.edition.id)}">Копировать статью</button>
        <button class="button link" data-law-action="copy-citation" data-id="${e(row.book.id)}" data-key="${e(row.article.key)}" data-edition="${e(row.edition.id)}">Цитата + SHA-256</button>
        <button class="button link" data-law-action="memo-article" data-id="${e(row.book.id)}" data-key="${e(row.article.key)}" data-edition="${e(row.edition.id)}">Создать памятку</button>
        ${!book?`<button class="button link" data-law-action="open-book" data-id="${e(row.book.id)}">Открыть акт →</button>`:''}</div></article>`;
    }).join(''):'<p class="empty">На выбранную дату или по указанным фильтрам статьи не найдены.</p>'}
    ${rows.length>visible?'<button class="button secondary" data-law-action="more">Показать ещё</button>':''}</section>`;
}
function memoCards(profileId){
  const memos=stats(profileId).memos.filter(m=>!query||[m.title,m.body,m.category].some(v=>v.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))));
  return `<section class="card stack"><div class="row spread"><h3>Памятки (${memos.length})</h3><button class="button primary" data-law-action="new-memo">+ Памятка</button></div>${memos.length?memos.map(m=>`<article class="law-article"><small class="subtle">${e(m.category)}</small><h4>${e(m.title)}</h4><p class="law-text">${e(m.body)}</p><div class="row"><button class="button secondary" data-law-action="edit-memo" data-id="${e(m.id)}">Изменить</button><button class="button secondary" data-law-action="copy-memo" data-id="${e(m.id)}">Копировать</button><button class="button danger" data-law-action="delete" data-id="${e(m.id)}">Удалить</button></div></article>`).join(''):'<p class="empty">Памяток пока нет.</p>'}</section>`;
}
export function lawSection(state){
  const profileId=state.activeProfileId,{books,memos,favorites}=stats(profileId);let book=selectedBookDisplay(profileId);
  if(!book){selectedBook='';selectedEdition='';compareWith='';}
  const categories=[...new Set(books.map(b=>b.category))].sort((a,b)=>a.localeCompare(b,'ru'));
  const displayBooks=books.filter(b=>!categoryFilter||b.category===categoryFilter);
  return `<div class="stack law-advanced"><section class="card stack"><div class="row spread"><div><h3>Law Codex Advanced · 2.0.2</h3><p class="subtle">Нормативная база профиля «${e(state.profiles.find(p=>p.id===profileId)?.name||'')}». Локальное RP-законодательство: официальность источников не проверяется автоматически.</p></div>
    <div class="row"><button class="button primary" data-law-action="new-book">+ Закон</button><button class="button secondary" data-law-action="new-memo">+ Памятка</button></div></div>
    <div class="law-stats"><span>Актов: <b>${books.length}</b></span><span>Редакций: <b>${books.reduce((n,b)=>n+b.editions.length,0)}</b></span><span>Памяток: <b>${memos.length}</b></span><span>Избранных: <b>${favorites.length}</b></span></div>
    <div class="row"><button class="button secondary" data-law-action="export">Экспорт JSON</button><label class="button secondary law-import">Импорт JSON<input type="file" id="law-import-file" accept="application/json,.json" hidden></label></div>
    <p class="subtle">Экспорт Law Codex v2 переносит структуры, даты действия и источники редакций. Импорт v1 и резервные копии Backup v18 поддерживаются.</p></section>
    <section class="card stack"><div class="row"><button class="button ${selectedTab==='articles'?'primary':'secondary'}" data-law-action="tab" data-tab="articles">Статьи</button><button class="button ${selectedTab==='memos'?'primary':'secondary'}" data-law-action="tab" data-tab="memos">Памятки</button></div>
    <label class="field">Поиск<input id="law-search" type="search" autocomplete="off" maxlength="250" placeholder="Статья, глава, раздел, пункт, текст…" value="${e(query)}"></label>
    ${selectedTab==='articles'?`<div class="law-filter-grid"><label class="field">Редакции на дату<input id="law-effective-date" type="date" value="${e(asOfDate)}" aria-label="Редакции на дату"></label>
      <label class="field">Категория<select id="law-category"><option value="">Все категории</option>${categories.map(category=>`<option value="${e(category)}" ${category===categoryFilter?'selected':''}>${e(category)}</option>`).join('')}</select></label></div>
      <div class="row"><label class="check"><input type="checkbox" id="law-only-fav" ${favOnly?'checked':''}> Только избранные статьи</label>${asOfDate?'<button class="button secondary" data-law-action="clear-date">Сбросить дату</button>':''}</div>
      <p class="subtle">Пустая дата — ручная рабочая редакция. Укажите дату события, чтобы показать только нормы, действовавшие тогда. Границы действия: дата начала включается, дата окончания и отмены — нет.</p>`:''}</section>
    ${selectedTab==='memos'?memoCards(profileId):`${book?bookHeader(book):`<section class="card stack"><h3>Нормативные акты</h3>${displayBooks.length?displayBooks.map(b=>{
      const active=asOfDate?editionAtDate(b,asOfDate):activeEdition(b);
      return `<div class="law-book-row"><div><strong>${e(b.title)}</strong><p class="subtle">${e(b.category)} · ${b.editions.length} редакц. · ${active?active.articles.length+' статей':''} ${active?'· '+e(active.effectiveDate):''}</p><p class="subtle">${e(statusText(b))}</p></div><button class="button secondary" data-law-action="open-book" data-id="${e(b.id)}">Открыть</button></div>`;
    }).join(''):'<p class="empty">Нормативных актов пока нет для выбранного фильтра. Добавьте закон с текстом статей.</p>'}</section>`}${articleCards(profileId,book)}`}</div>`;
}
export function setLawQuery(value){query=String(value).slice(0,250);visible=60;}
export function setLawFavOnly(value){favOnly=Boolean(value);visible=60;}
export function setLawEdition(value){selectedEdition=String(value||'');if(selectedEdition)asOfDate='';compareWith='';compareVisible=30;visible=60;}
export function setLawAsOfDate(value){asOfDate=String(value||'');selectedEdition='';compareWith='';compareVisible=30;visible=60;}
export function setLawCategory(value){categoryFilter=String(value||'').slice(0,90);visible=60;}
export function setLawCompareEdition(value){compareWith=String(value||'');compareVisible=30;}
export async function handleLawAction(button,state,render,feedback){
  const act=button.dataset.lawAction,recordId=button.dataset.id,profileId=state.activeProfileId;
  if(act==='close'){document.getElementById('law-dialog')?.close();return;}
  if(act==='tab'){selectedTab=button.dataset.tab;selectedBook='';selectedEdition='';compareWith='';render();return;}
  if(act==='back'){selectedBook='';selectedEdition='';compareWith='';render();return;}
  if(act==='open-book'){selectedBook=recordId;selectedEdition='';compareWith='';compareVisible=30;visible=60;render();return;}
  if(act==='more'){visible+=60;render();return;}
  if(act==='compare-more'){compareVisible+=30;render();return;}
  if(act==='clear-date'){setLawAsOfDate('');render();return;}
  if(act==='new-book'){lawDialog('Новый нормативный акт',bookForm(),'new-book');return;}
  if(act==='new-memo'){lawDialog('Новая памятка',memoForm(),'new-memo');return;}
  if(act==='edit-book'){const book=await getLawRecord(recordId);if(book.profileId!==profileId)throw Error('Неверный профиль');lawDialog('Реквизиты нормативного акта',bookForm(book),'edit-book',recordId);return;}
  if(act==='new-edition'){const book=await getLawRecord(recordId);if(book.profileId!==profileId)throw Error('Неверный профиль');lawDialog('Новая неизменяемая редакция',editionForm(book),'new-edition',recordId);return;}
  if(act==='edit-memo'){const memo=await getLawRecord(recordId);if(memo.profileId!==profileId)throw Error('Неверный профиль');lawDialog('Изменить памятку',memoForm(memo),'edit-memo',recordId);return;}
  if(act==='memo-article'){const book=await getLawRecord(recordId);if(book.profileId!==profileId)throw Error('Неверный профиль');const article=book.editions.find(ed=>ed.id===button.dataset.edition)?.articles.find(a=>a.key===button.dataset.key);if(!article)throw Error('Статья не найдена');lawDialog('Памятка по статье',memoForm({title:`${book.title} · статья ${article.key}`,body:article.text,category:book.category}),'new-memo','',`<input type="hidden" name="bookId" value="${e(recordId)}"><input type="hidden" name="articleKey" value="${e(article.key)}">`);return;}
  if(act==='delete'){const record=await getLawRecord(recordId);if(record.profileId!==profileId)throw Error('Неверный профиль');if(!confirm(`Удалить «${record.title||'избранное'}»${record.type==='book'?' со всеми редакциями, привязанными памятками и избранным':''}?`))return;await removeLawRecord(recordId);if(selectedBook===recordId){selectedBook='';selectedEdition='';}await refreshLaw();render();feedback('Запись удалена');return;}
  if(act==='activate-edition'){const book=await getLawRecord(recordId);if(book.profileId!==profileId)throw Error('Неверный профиль');if(!confirm('Изменить рабочую редакцию? Даты вступления в силу это не изменит.'))return;await chooseLawEdition(recordId,button.dataset.edition);selectedEdition='';await refreshLaw();render();feedback('Рабочая редакция переключена');return;}
  if(act==='verify-source'){
    const book=await getLawRecord(recordId);if(book.profileId!==profileId)throw Error('Неверный профиль');
    const verified=button.dataset.checked!=='1';
    const prompt=verified?'Подтверждаете, что лично открыли ссылку именно этой редакции и сверили текст?': 'Снять отметку ручной проверки источника?';
    if(!confirm(prompt))return;
    await markLawSourceChecked(recordId,button.dataset.edition,verified);await refreshLaw();render();feedback(verified?'Ручная проверка отмечена':'Отметка проверки снята');return;
  }
  if(act==='favorite'){await toggleLawFavorite(profileId,recordId,button.dataset.key);await refreshLaw();render();feedback('Избранное обновлено');return;}
  if(act==='copy-memo'){const memo=await getLawRecord(recordId);if(memo.profileId!==profileId)throw Error('Неверный профиль');await navigator.clipboard.writeText(`${memo.title}\n\n${memo.body}`);feedback('Памятка скопирована');return;}
  if(act==='copy-article'||act==='copy-citation'){
    const book=await getLawRecord(recordId);if(book.profileId!==profileId)throw Error('Неверный профиль');
    const edition=book.editions.find(ed=>ed.id===button.dataset.edition),article=edition?.articles.find(a=>a.key===button.dataset.key);if(!article)throw Error('Статья не найдена');
    const text=act==='copy-citation'?(await makeLawCitation(book,edition.id,article.key)).citation:`${book.title} (${edition.label}, с ${edition.effectiveDate})\nСтатья ${article.key}. ${article.title}\n${article.text}\n${Object.hasOwn(edition,'sourceUrl')?edition.sourceUrl:book.sourceUrl}`;
    await navigator.clipboard.writeText(text);feedback(act==='copy-citation'?'Цитата с SHA-256 скопирована':'Статья скопирована');return;
  }
  if(act==='export'){const data=await exportVerifiedLawDataset(entries,state.profiles.map(p=>p.id));saveFile(`majestictoolkit-law-${dateNow()}.json`,data);feedback('Law Codex экспортирован c SHA-256');return;}
}
export async function handleLawSubmit(event,state,render,feedback){
  const form=event.target,values=Object.fromEntries(new FormData(form).entries()),kind=values.formType,recordId=values.recordId,profileId=state.activeProfileId;
  if(kind==='new-book'){parseArticles(values.articlesText);const book=await newLawBook(profileId,values);selectedBook=book.id;selectedEdition='';selectedTab='articles';asOfDate='';}
  else if(kind==='edit-book'){const old=await getLawRecord(recordId);if(old.profileId!==profileId)throw Error('Неверный профиль');await editLawBook(recordId,values);}
  else if(kind==='new-edition'){parseArticles(values.articlesText);const old=await getLawRecord(recordId);if(old.profileId!==profileId)throw Error('Неверный профиль');await newLawEdition(recordId,values);selectedEdition='';asOfDate='';}
  else if(kind==='new-memo'){await newLawMemo(profileId,values);selectedTab='memos';}
  else if(kind==='edit-memo'){const old=await getLawRecord(recordId);if(old.profileId!==profileId)throw Error('Неверный профиль');await editLawMemo(recordId,values);}
  else throw Error('Неизвестное действие Law Codex');
  form.closest('dialog').close();await refreshLaw();render();feedback('Изменения сохранены');
}
export async function importLawFile(file,state,render,feedback){
  if(file.size>16*1024*1024)throw Error('JSON больше 16 МиБ');
  const records=await parseVerifiedLawDataset(await file.text(),state.profiles.map(p=>p.id));
  if(!confirm(`Импортировать ${records.length} записей Law Codex? Существующие законы и памятки будут заменены. Другие модули останутся без изменений.`))return;
  await replaceLawRecords(records,state.profiles.map(p=>p.id));selectedBook='';selectedEdition='';compareWith='';await refreshLaw();render();feedback('Law Codex импортирован');
}
