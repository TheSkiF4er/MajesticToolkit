/* Punishment Overlay: all user-controlled content is rendered as text, not HTML. */
(()=>{
 'use strict';
 const types={demorgan:'Demorgan',ban:'Ban',hardban:'HardBan',warn:'WARN',gunban:'GunBan',mute:'Mute',other:'Другое'};
 const units={minutes:'мин.',hours:'ч.',days:'дн.',none:'без срока'};
 const normalize=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/ё/g,'е');
 function create(doc,options){
  let target=null, data=null, scope='', epoch=0, query='', filter='all', category='', type='', selected='', index=0, amount='', page=30, busy=false, message='',loadEpoch=0,focusOnLoad=false;
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function button(text,action,disabled=false){const b=el('button',text,'btn secondary');b.type='button';b.disabled=disabled;b.addEventListener('click',action);return b;}
  function field(tag,label){const n=el(tag,undefined,'field');n.setAttribute('aria-label',label);return n;}
  function select(label,values,value,change){const n=field('select',label);for(const [v,t] of values){const o=el('option',t);o.value=v;n.append(o);}n.value=value;n.addEventListener('change',()=>change(n.value));return n;}
  const actions=()=>el('div',undefined,'actions');
  function status(text){message=text;const n=target?.querySelector('[data-punishment-status]');if(n)n.textContent=text;}
  const active=()=>target&&target.isConnected&&options.active();
  function reset(){++epoch;++loadEpoch;focusOnLoad=false;target=null;data=null;scope='';query='';filter='all';category='';type='';selected='';index=0;amount='';page=30;busy=false;message='';}
  async function request(action,extra={}){const e=epoch,key=scope;const result=await options.request(action,extra);if(e!==epoch||key!==scope||!active())return null;return result;}
  async function load(){const e=epoch, seq=++loadEpoch;try{const result=await request('list');if(!result||seq!==loadEpoch)return;const old=data?.rules.find(r=>r.id===selected);data=result;const next=data.rules.find(r=>r.id===selected);if(!next)selected='';else if(old?.revision.id!==next.revision.id){index=0;amount=next.revision.sanctions[0]?.min??'';}render();if(focusOnLoad){focusOnLoad=false;target?.querySelector('#rpn-punishment-search')?.focus();}}catch(err){if(e===epoch&&active()&&seq===loadEpoch){status(err.message);}}}
  async function mutate(action,extra={}){if(busy)return;busy=true;++loadEpoch;const e=epoch;render();try{const result=await request(action,extra);if(!result)return;if(action==='favorite'||action==='opened'){const r=data.rules.find(r=>r.id===result.id);if(r)Object.assign(r,result);}else data.entries=result.entries;status(action==='add'?'Санкция сохранена в черновике.':'Сохранено.');}catch(err){if(e===epoch)status(err.message);}finally{if(e===epoch){busy=false;if(active())render();}}}
  function pick(rule){selected=rule.id;index=0;amount=rule.revision.sanctions[0]?.min??'';render();void mutate('opened',{ruleId:rule.id});}
  function matches(r){const x=r.revision;const hay=normalize([x.code,x.title,x.category,x.text,...x.aliases,...x.sanctions.map(s=>types[s.type])].join(' '));return (!category||category===x.category)&&(!type||x.sanctions.some(s=>s.type===type))&&(filter!=='favorite'||r.favorite)&&(filter!=='recent'||r.lastOpened)&&normalize(query).trim().split(/\s+/).filter(Boolean).every(t=>hay.includes(t));}
  function renderList(){const list=target?.querySelector('[data-punishment-list]');if(!list||!data)return;list.replaceChildren();const rows=data.rules.filter(matches).sort((a,b)=>filter==='recent'?(b.lastOpened||'').localeCompare(a.lastOpened||''):Number(b.favorite)-Number(a.favorite)||a.revision.title.localeCompare(b.revision.title,'ru'));
   list.append(el('p',`Найдено: ${rows.length}`,'sub'));
   for(const r of rows.slice(0,page)){const card=el('article',undefined,'item'),x=r.revision,b=button(`${r.favorite?'★ ':''}${x.code} — ${x.title}`,()=>pick(r),busy);b.dataset.punishmentRule=r.id;card.append(b,el('p',`${x.category} · ${x.sanctions.map(s=>types[s.type]).join(' / ')}`,'sub'));list.append(card);}
   if(rows.length>page)list.append(button('Показать ещё',()=>{page+=30;renderList();}));
   if(!rows.length)list.append(el('p','Нет совпадений. Добавьте правила или импортируйте набор в рабочем пространстве.','sub'));
  }
  async function preview(mode){if(busy)return;busy=true;const e=epoch;try{const text=await request('preview');if(text===null)return;if(mode==='copy'){await options.copy(text);}else if(mode==='insert'){options.insert(text);}else{const pre=target.querySelector('[data-punishment-preview]');pre.textContent=text;pre.hidden=false;}status(mode==='insert'?'Черновик вставлен. Отправка только вручную.':mode==='copy'?'Черновик скопирован.':'Предпросмотр обновлён.');}catch(err){if(e===epoch)status(err.message);}finally{if(e===epoch)busy=false;}}
  function render(){if(!active())return;target.replaceChildren();target.append(el('b','Правила и наказания'),el('p','Выберите нарушение и одну санкцию. Черновик не назначает наказания и не объединяет сроки.','sub'));
   const top=actions();top.append(button('База правил ↗',options.openRules),button('Обновить',()=>void load(),busy));target.append(top);
   const statusNode=el('p',message,'sub');statusNode.dataset.punishmentStatus='';statusNode.setAttribute('role','status');target.append(statusNode);
   if(!data){target.append(el('p','Загрузка базы правил…','sub'));return;}
   const search=field('input','Поиск нарушений');search.type='search';search.id='rpn-punishment-search';search.maxLength=200;search.placeholder='Номер, DM, PG, название…';search.value=query;search.addEventListener('input',()=>{query=search.value;page=30;renderList();});target.append(search);
   target.append(select('Фильтр правил',[['all','Все'],['favorite','Избранное'],['recent','Недавние']],filter,v=>{filter=v;page=30;renderList();}),select('Категория',[['','Все категории'],...[...new Set(data.rules.map(r=>r.revision.category))].sort().map(v=>[v,v])],category,v=>{category=v;page=30;renderList();}),select('Тип наказания',[['','Все санкции'],...Object.entries(types)],type,v=>{type=v;page=30;renderList();}));
   let captured='';const selectionButton=button('Поиск по выделенному тексту',()=>{const s=(captured||options.selection()).trim().slice(0,200);captured='';if(!s){status('Выделите текст на странице или в редакторе.');return;}query=s;search.value=s;page=30;renderList();});selectionButton.addEventListener('pointerdown',()=>{captured=options.selection();});target.append(selectionButton);
   const r=data.rules.find(x=>x.id===selected);
   if(r){const x=r.revision,s=x.sanctions[index];const card=el('section',undefined,'item');card.dataset.punishmentDetail='';card.append(el('strong',`${x.code} — ${x.title}`),el('p',`${x.category} · ${x.verification==='reviewed'?'Проверено пользователем':'Требует проверки'} · ${new Date(x.createdAt).toLocaleDateString('ru-RU')}`,'sub'));
    const text=el('div',x.text,'punishment-text');card.append(text);if(x.conditions)card.append(el('p',x.conditions,'punishment-text'));
    const source=el('a','Открыть источник ↗','nav-link');source.href=x.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';card.append(source);
    const labels=x.sanctions.map((s,i)=>[String(i),`${types[s.type]}${s.unit==='none'?'':` ${s.min}${s.min===s.max?'':'–'+s.max} ${units[s.unit]}`}`]);
    card.append(select('Выбранная санкция',labels,String(index),v=>{index=Number(v);amount=x.sanctions[index].min??'';render();}));
    if(s){if(s.condition)card.append(el('p',s.condition,'sub'));if(s.unit!=='none'){const n=field('input','Срок наказания');n.type='number';n.min=s.min;n.max=s.max;n.step='1';n.value=amount;n.disabled=s.min===s.max;n.id='rpn-punishment-amount';n.addEventListener('input',()=>{amount=n.value;});card.append(n,el('p',`Допустимо: ${s.min}–${s.max} ${units[s.unit]}`,'sub'));}
     const row=actions();const add=button('В черновик',()=>{const value=s.unit==='none'?null:Number(amount);if(s.unit!=='none'&&(!Number.isSafeInteger(value)||value<s.min||value>s.max)){status('Срок вне допустимого диапазона.');return;}void mutate('add',{ruleId:r.id,revisionId:x.id,index,amount:value});},busy||!data.thread);add.dataset.punishmentAdd='';row.append(add,button(r.favorite?'★ Избранное':'☆ Избранное',()=>void mutate('favorite',{ruleId:r.id,favorite:!r.favorite}),busy));if(options.hasTemplate(r.id))row.append(button('Открыть связанный бинд',()=>options.openTemplate(r.id),busy));card.append(row);}
    target.append(card);
   }
   const list=el('div');list.dataset.punishmentList='';target.append(list);renderList();
   const draft=el('section',undefined,'section');draft.append(el('b',`Черновик темы · ${data.entries.length}`));if(!data.thread)draft.append(el('p','Откройте тему форума, чтобы сохранять выбранные санкции.','sub'));
   for(const entry of data.entries){const card=el('div',undefined,'item');card.append(el('strong',`${entry.code} — ${entry.title}`),el('p',entry.sanction,'sub'));if(entry.stale)card.append(el('p','Устаревшая редакция: удалите и выберите заново.','sub'));if(entry.verification!=='reviewed')card.append(el('p','Требует проверки','sub'));const b=button('Удалить',()=>void mutate('remove',{ruleId:entry.ruleId}),busy);b.dataset.punishmentRemove=entry.ruleId;card.append(b);draft.append(card);}
   const editors=options.editors();if(editors.items.length>1)draft.append(select('Редактор черновика',[['','Выберите редактор'],...editors.items],editors.selected,v=>options.chooseEditor(v)));
   const row=actions();const disabled=busy||!data.entries.length||data.entries.some(x=>x.stale);for(const [label,mode] of [['Предпросмотр','preview'],['Копировать','copy'],['Вставить черновик','insert']]){const b=button(label,()=>void preview(mode),disabled);b.dataset.punishmentPreviewAction=mode;row.append(b);}row.append(button('Очистить',()=>{if(options.confirm('Очистить черновик текущей темы?'))void mutate('clear');},busy||!data.entries.length));draft.append(row);const pre=el('pre',undefined,'punishment-text');pre.dataset.punishmentPreview='';pre.hidden=true;draft.append(pre);target.append(draft);
  }
  function mount(node,key){if(!node)return;const reopening=!target;if(scope!==key){reset();scope=key;}target=node;render();if(!data||reopening)void load();}
  function unmount(){++epoch;target=null;busy=false;}
  return {mount,unmount,reset,refresh:()=>{if(active())void load();},focus:()=>{const input=target?.querySelector('#rpn-punishment-search');if(input)input.focus();else focusOnLoad=true;}};
 }
 globalThis.MTPunishmentOverlay=Object.freeze({create});
})();
