import {CATEGORIES,SECTION_FOR,searchRecords,answerLocal,excerpt} from '../lib/productivity-core.mjs';
import {getLocalIndex,invalidateSearch} from '../lib/productivity-search.mjs';
import {escapeHtml as e} from '../lib/sites.mjs';
const esc=x=>e(String(x??''));
let rows=[],loaded=false,query='',category='all',allProfiles=false,details='',answer=null,lastDuration=0;
let currentProfileId=null;
const labels={all:'Все разделы',...CATEGORIES};
export async function refreshProductivitySearch(){rows=await getLocalIndex();loaded=true;renderSearchResults();}
export function clearProductivityCache(){invalidateSearch();loaded=false;}
export function productivitySection(state){
  if(currentProfileId!==state.activeProfileId){answer=null;details='';currentProfileId=state.activeProfileId;}
  return `<div class="stack"><section class="card"><div class="row spread"><div><h3>Единый поиск</h3><p class="lead">Поиск по локальным шаблонам, жалобам, сделкам, законам, ведомствам, документам и закладкам. Без отправки запросов на сервер.</p></div><span class="tag">Ctrl/⌘ + K</span></div>
  <label class="field">Поиск по записям<input id="productivity-search" type="search" autocomplete="off" maxlength="500" placeholder="Номер статьи, жалоба, документ, игрок…" value="${esc(query)}"></label>
  <div class="row"><select id="productivity-category" aria-label="Тип записей">${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${key===category?'selected':''}>${esc(label)}</option>`).join('')}</select><label class="check"><input id="productivity-all-profiles" type="checkbox" ${allProfiles?'checked':''}>Искать во всех профилях</label><button class="button secondary" data-productivity-action="reindex">Обновить индекс</button></div>
  <div id="productivity-results" aria-live="polite">${resultHtml(state)}</div></section>
  <section class="card"><h3>Локальный помощник</h3><p class="subtle">Ответы формируются только из данных, сохранённых в MajesticToolkit. Поддерживаются запросы об общем количестве записей и поиск совпадений; это не генеративный ИИ и не правовая экспертиза.</p><form id="productivity-assistant-form" class="stack"><label class="field">Вопрос<input name="question" id="productivity-question" type="text" maxlength="500" placeholder="Например: статья 12 или сколько жалоб"></label><div class="row"><button class="button primary" type="submit">Найти ответ</button><button class="button secondary" type="button" data-productivity-action="clear-assistant">Очистить</button></div></form><div id="productivity-answer" aria-live="polite">${answerHtml()}</div></section></div>`;
}
function resultHtml(state){
  if(!loaded)return '<p class="subtle">Индекс загружается при открытии раздела…</p>';
  if(!query.trim())return `<div class="productivity-empty"><strong>Готов к поиску</strong><p class="subtle">Индекс: ${rows.length} записей и статей. Введите запрос; поиск выполняется непосредственно в памяти браузера.</p></div>`;
  const started=performance.now();const results=searchRecords(rows,query,{profileId:allProfiles?'':state.activeProfileId,type:category,limit:40});lastDuration=Math.round((performance.now()-started)*10)/10;
  return `<p class="subtle">Совпадений: ${results.length}${results.length===40?' (первые 40)':''} · ${lastDuration.toLocaleString('ru-RU')} мс · индекс: ${rows.length} записей</p><div class="productivity-results">${results.length?results.map(row=>`<article class="productivity-hit" data-productivity-key="${esc(row.key)}"><div class="row spread"><strong>${esc(row.title)}</strong><span class="tag">${esc(CATEGORIES[row.type])}</span></div><p class="subtle">${esc(row.description)}</p><p class="productivity-excerpt">${esc(row.snippet)}</p><div class="row"><button class="button secondary" data-productivity-action="details" data-key="${esc(row.key)}">${details===row.key?'Скрыть':'Просмотреть'} запись</button><button class="button secondary" data-productivity-action="copy" data-key="${esc(row.key)}">Копировать</button><button class="button secondary" data-productivity-action="go" data-target="${esc(SECTION_FOR[row.type])}">Перейти в раздел</button></div>${details===row.key?`<div class="productivity-detail"><p>${esc(row.description)}</p><pre>${esc(row.body||row.title)}</pre>${row.url?`<button class="button secondary" data-productivity-action="source" data-key="${esc(row.key)}">Открыть источник ↗</button>`:''}</div>`:''}</article>`).join(''):'<div class="empty">Совпадений нет. Проверьте запрос, фильтры или профиль.</div>'}</div>`;
}
function answerHtml(){if(!answer)return '';return `<div class="productivity-answer"><pre>${esc(answer.answer)}</pre>${answer.refs.length?`<p class="subtle">Источники в локальном индексе: ${answer.refs.map(r=>esc(r.title)).join(' · ')}</p>`:''}</div>`;}
export function renderSearchResults(state){const el=document.getElementById('productivity-results');if(el&&state)el.innerHTML=resultHtml(state);}
let searchTimer;
export function setSearchQuery(value,state){
  query=String(value).slice(0,500);details='';clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>renderSearchResults(state),120);
}
export function setSearchCategory(value,state){category=Object.hasOwn(labels,value)?value:'all';details='';renderSearchResults(state);}
export function setSearchScope(value,state){allProfiles=Boolean(value);details='';renderSearchResults(state);}
export function searchFocus(){const input=document.getElementById('productivity-search');input?.focus();input?.select();}
export async function handleProductivityAction(btn,state,navigate,feedback){
  const action=btn.dataset.productivityAction;
  if(action==='clear-assistant'){answer=null;const el=document.getElementById('productivity-answer');if(el)el.innerHTML='';const input=document.getElementById('productivity-question');if(input)input.value='';return;}
  if(action==='reindex'){clearProductivityCache();await refreshProductivitySearch();feedback(`Индекс обновлён: ${rows.length} записей`);return;}
  if(action==='go'){navigate(btn.dataset.target);return;}
  const item=rows.find(r=>r.key===btn.dataset.key && (allProfiles||r.profileId===state.activeProfileId||r.profileId==='*'));
  if(!item)throw Error('Запись не найдена');
  if(action==='details'){details=details===item.key?'':item.key;renderSearchResults(state);return;}
  if(action==='copy'){await navigator.clipboard.writeText([item.title,item.description,item.body].filter(Boolean).join('\n\n'));feedback('Запись скопирована');return;}
  if(action==='source'){
    const u=new URL(item.url);if(u.protocol!=='https:'||u.username||u.password)throw Error('Недопустимая ссылка на источник');
    const {openTab}=await import('../lib/browser.mjs');await openTab(u.href);return;
  }
}
export async function answerProductivity(question,state){
  if(!loaded)await refreshProductivitySearch();answer=answerLocal(question,rows,state.activeProfileId);
  const el=document.getElementById('productivity-answer');if(el)el.innerHTML=answerHtml();return answer;
}
