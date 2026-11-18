/** Active Evidence & Knowledge Graph: source excerpts, live case/rule/decision references. */
import {escapeHtml as e} from '../lib/sites.mjs';
import {listCases} from '../lib/complaints-store.mjs';
import {listRules} from '../lib/rules-store.mjs';
import {exportRegistryData} from '../lib/punishment-registry-store.mjs';
import {listSources} from '../lib/source-library.mjs';
import {saveEvidenceQuote,saveEvidenceLink,deleteEvidenceGraphItem} from '../lib/knowledge-store.mjs';
import {GRAPH_TYPES,GRAPH_RELATIONS,graphNodeKey,evidenceGraphNodes,quoteAvailability,graphLinksForCase,emptyGraph} from '../lib/evidence-knowledge-graph.mjs';
import {api} from '../lib/browser.mjs';
import {loadState} from '../lib/state.mjs';
let cases=[],rules=[],registry=[],caseFilter='',query='',selectedRevision='',selectedExcerpt='';
export async function refreshGraphContext(profiles){[cases,rules]=await Promise.all([listCases(),listRules()]);registry=(await exportRegistryData(typeof profiles[0]==='string'?(await loadState()).profiles:profiles)).records;}
export function setGraphCaseFilter(id=''){caseFilter=String(id).slice(0,128);}
export function setGraphQuery(q=''){query=String(q).slice(0,180);}
const option=(node,sel=false)=>`<option value="${e(graphNodeKey(node))}" ${sel?'selected':''}>${e(GRAPH_TYPES[node.kind])} · ${e(node.title.slice(0,120))}</option>`;
const resolve=v=>{const k=String(v||'').indexOf(':');return k<0?null:{kind:v.slice(0,k),id:v.slice(k+1)};};
export function graphSection(state,knowledge,sources){
 const p=state.profiles.find(p=>p.id===state.activeProfileId);if(!p)return '';
 const graph=knowledge.evidenceGraph??emptyGraph();const nodes=evidenceGraphNodes(p,{sources,cases,rules,registry,graph});const map=new Map(nodes.map(n=>[graphNodeKey(n),n]));
 const own=graph.quotes.filter(q=>q.profileId===p.id),links=graph.links.filter(l=>l.profileId===p.id),eligible=cases.filter(c=>c.profileId===p.id&&new URL(c.url).hostname===(p.project==='majestic'?'forum.majestic-rp.ru':'forum.russia.online'));
 if(caseFilter&&!eligible.some(c=>c.id===caseFilter))caseFilter='';
 const related=caseFilter?graphLinksForCase(graph,p.id,caseFilter,nodes):links;
 const formNodes=(caseFilter?nodes.filter(n=>n.kind==='quote'||n.kind==='rule'||n.kind==='case'&&n.id===caseFilter||n.caseId===caseFilter):[...nodes.filter(n=>n.kind==='quote'),...nodes.filter(n=>n.kind==='rule'),...nodes.filter(n=>n.kind==='case'),...nodes.filter(n=>n.kind==='decision')]).slice(0,1200);
 const needle=query.toLocaleLowerCase('ru').trim();const displayed=related.filter(l=>!needle||[l.note,l.relation,map.get(graphNodeKey(l.from))?.title,map.get(graphNodeKey(l.to))?.title].join(' ').toLocaleLowerCase('ru').includes(needle));
 return `<section class="card stack" id="evidence-knowledge-graph"><h3>Граф доказательств и знаний</h3><p class="subtle">Точные цитаты сохранённых редакций и проверяемые связи между жалобами, событиями, доказательствами, правилами и зарегистрированными решениями. Все связи — локальные утверждения пользователя, не официальное подтверждение фактов.</p><div class="row"><span class="tag">Цитаты: ${own.length}</span><span class="tag">Связи: ${links.length}</span><span class="tag">Узлы: ${nodes.length}</span></div>
 <form id="knowledge-quote-form" class="stack"><h4>Сохранить точную цитату</h4><label class="field">Источник и редакция<select name="revision" required><option value="">Выберите сохранённый источник</option>${sources.filter(s=>s.profileId===p.id).flatMap(s=>[...[[s.id,s.title+' · текущая '+s.capturedAt.slice(0,10)]],...s.revisions.map(r=>[r.id,r.title+' · '+r.capturedAt.slice(0,10)])].map(([rid,title])=>`<option value="${e(s.id+'|'+rid)}" ${selectedRevision===s.id+'|'+rid?'selected':''}>${e(title.slice(0,115))}</option>`)).join('')}</select></label><label class="field">Дословный фрагмент текста<textarea name="quote" required maxlength="1200" rows="3" placeholder="Скопируйте точный фрагмент из выбранной редакции">${e(selectedExcerpt)}</textarea></label><label class="field">Комментарий<input name="note" maxlength="800" placeholder="Для какого обстоятельства используется цитата"></label><button class="button primary" type="submit" ${!sources.some(s=>s.profileId===p.id)?'disabled':''}>Сохранить цитату и SHA-256 редакции</button><p class="subtle">Фрагмент проверяется на точное совпадение в редакции; при повреждённом SHA-256 сохранение блокируется. Цитата не изменяется после обновления источника.</p></form>
 <div class="stack"><h4>Сохранённые цитаты</h4>${own.slice().reverse().slice(0,80).map(q=>{const state=quoteAvailability(q,sources);return `<article class="knowledge-item stack"><div class="row spread"><strong>${e(q.title)}</strong><span class="tag">${state==='available'?'Редакция доступна':state==='snapshot'?'Исторический фрагмент': 'Исходная статья удалена'}</span></div><blockquote>${e(q.quote)}</blockquote><p class="subtle">${e(q.capturedAt)} · SHA-256 ${e(q.sha256.slice(0,20))}… · символы ${q.start}–${q.end}</p><div class="row"><button type="button" class="button secondary" data-graph-action="open-quote" data-id="${e(q.id)}">Открыть источник ↗</button><button type="button" class="button danger" data-graph-action="remove-quote" data-id="${e(q.id)}">Удалить цитату</button></div></article>`;}).join('')||'<p class="empty">Цитат пока нет. Сначала вручную импортируйте статью форума или Fletcher Wiki.</p>'}</div>
 <form id="knowledge-graph-link-form" class="stack"><h4>Связать доказательства, события, правила и решения</h4><p class="subtle">Для выбора события или видеодоказательства сначала выберите конкретную жалобу в фильтре ниже. Без выбранного дела показываются правила, цитаты, жалобы и решения (до 1200 узлов).</p><div class="row"><label class="field">Откуда<select name="from" required><option value="">Узел</option>${formNodes.map(n=>option(n)).join('')}</select></label><label class="field">Куда<select name="to" required><option value="">Узел</option>${formNodes.map(n=>option(n)).join('')}</select></label><label class="field">Вид связи<select name="relation">${Object.entries(GRAPH_RELATIONS).map(([k,v])=>`<option value="${k}">${e(v)}</option>`).join('')}</select></label></div><label class="field">Основание / комментарий<input name="note" maxlength="800" placeholder="Пояснение связи"></label><button type="submit" class="button primary" ${nodes.length<2?'disabled':''}>Сохранить типизированную связь</button></form>
 <div class="row"><label class="field">Дело<select id="knowledge-graph-case-filter"><option value="">Все связанные объекты</option>${eligible.map(c=>`<option value="${e(c.id)}" ${caseFilter===c.id?'selected':''}>${e(c.title.slice(0,110))}</option>`).join('')}</select></label><label class="field">Поиск по связям<input id="knowledge-graph-search" type="search" value="${e(query)}" maxlength="180" placeholder="Цитата, нарушение, событие"></label></div><h4>Связи и обратные ссылки · ${displayed.length}</h4><div class="stack">${displayed.slice().reverse().slice(0,120).map(l=>{const a=map.get(graphNodeKey(l.from)),b=map.get(graphNodeKey(l.to));return `<article class="knowledge-relation"><div><strong>${e(GRAPH_RELATIONS[l.relation])}</strong><div class="subtle">${e(a?.title??'Исторический / удалённый узел')} ↔ ${e(b?.title??'Исторический / удалённый узел')}</div>${[l.from,l.to].filter(n=>n.kind==='rule'&&n.revisionId).map(n=>`<p class="subtle">Редакция правила при создании связи: ${e(n.revisionId)}</p>`).join('')}${l.note?`<p>${e(l.note)}</p>`:''}</div><div class="row">${a?`<button class="button secondary" data-graph-action="open-node" data-node="${e(graphNodeKey(a))}">Перейти к первому ↗</button>`:''}${b?`<button class="button secondary" data-graph-action="open-node" data-node="${e(graphNodeKey(b))}">Ко второму ↗</button>`:''}<button class="button danger" data-graph-action="remove-link" data-id="${e(l.id)}">Удалить связь</button></div></article>`;}).join('')||'<p class="empty">Для выбранного дела связей пока нет.</p>'}</div></section>`;
}
export async function handleGraphSubmit(form,state,knowledge,sources,refresh,render,feedback){
 const data=new FormData(form),p=state.profiles.find(p=>p.id===state.activeProfileId);if(!p)throw Error('Профиль не найден');const profiles=state.profiles.map(x=>x.id);
 if(form.getAttribute('id')==='knowledge-quote-form'){
  const [sourceId,revisionId]=String(data.get('revision')||'').split('|');const current=(await listSources()).find(s=>s.id===sourceId&&s.profileId===p.id);if(!current)throw Error('Источник отсутствует или другого профиля');
  await saveEvidenceQuote(p.id,current,revisionId,String(data.get('quote')||''),String(data.get('note')||''),profiles);
  feedback('Дословная цитата и снимок редакции сохранены');
 }else if(form.getAttribute('id')==='knowledge-graph-link-form'){
  // Re-read all modules at save time: stale case, rules or decision must never be linked.
  await refreshGraphContext(state.profiles);
  const fresh=await (await import('../lib/knowledge-store.mjs')).loadKnowledge(profiles);
  const nodes=evidenceGraphNodes(p,{cases,rules,registry,graph:fresh.evidenceGraph}),from=resolve(data.get('from')),to=resolve(data.get('to'));
  if(!from||!to)throw Error('Выберите два узла');await saveEvidenceLink(p.id,from,to,String(data.get('relation')||''),String(data.get('note')||''),nodes,profiles);
  feedback('Связь сохранена в Центре знаний');
 }else throw Error('Неизвестная форма графа');
 selectedExcerpt='';selectedRevision='';await refresh();render();
}
export async function handleGraphAction(button,state,knowledge,refresh,render,feedback,navigate){
 const action=button.dataset.graphAction,p=state.profiles.find(p=>p.id===state.activeProfileId),id=button.dataset.id,graph=knowledge.evidenceGraph??emptyGraph();if(!p)throw Error('Профиль не найден');
 if(action==='quote-source'){const sourceId=button.dataset.source,revisionId=button.dataset.revision;const row=(await listSources()).find(r=>r.id===sourceId&&r.profileId===p.id);if(!row||revisionId!==row.id&&!row.revisions.some(r=>r.id===revisionId))throw Error('Редакция источника недоступна');selectedRevision=sourceId+'|'+revisionId;selectedExcerpt=String(window.getSelection?.()?.toString()||'').slice(0,1200);render();document.getElementById('knowledge-quote-form')?.scrollIntoView?.({block:'start'});return;}
 if(action==='remove-quote'||action==='remove-link'){
  if(!confirm(action==='remove-link'?'Удалить эту локальную связь?':'Удалить цитату? Источник останется.'))return;
  await deleteEvidenceGraphItem(p.id,action==='remove-quote'?'quote':'link',id,state.profiles.map(x=>x.id));await refresh();render();feedback('Элемент графа удалён');return;
 }
 if(action==='open-quote'){
  const q=graph.quotes.find(x=>x.id===id&&x.profileId===p.id);if(!q)throw Error('Цитата не найдена');await api.tabs.create({url:q.url});return;
 }
 if(action==='open-node'){
  const node=evidenceGraphNodes(p,{cases,rules,registry,graph}).find(n=>graphNodeKey(n)===button.dataset.node);if(!node)throw Error('Узел был удалён');
  if(node.kind==='quote'){const q=graph.quotes.find(q=>q.id===node.id);await api.tabs.create({url:q.url});return;}
  if(node.kind==='rule'){await api.tabs.create({url:api.runtime.getURL('ui/workspace.html?rule='+encodeURIComponent(node.id)+'#rules')});return;}
  if(node.kind==='decision'){await api.tabs.create({url:api.runtime.getURL('ui/workspace.html?moderationTab=registry#moderation')});return;}
  setGraphCaseFilter(node.caseId||node.id);navigate('complaints');return;
 }
 throw Error('Неизвестное действие графа');
}
