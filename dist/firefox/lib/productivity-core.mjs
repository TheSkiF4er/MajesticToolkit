// Productivity 0.9.0: deterministic, local-only index. No browser globals or remote calls.
export const CATEGORIES = Object.freeze({forum:'Шаблоны форума',complaints:'Жалобы',economy:'Экономика',law:'Законодательство',government:'Ведомства',documents:'Документы',integrations:'Закладки'});
export const SECTION_FOR = Object.freeze({forum:'forum',complaints:'complaints',economy:'economy',law:'law',government:'government',documents:'documents',integrations:'integrations'});
export const DEFAULT_SHORTCUTS = Object.freeze(['home','search','forum','complaints','economy','law','government','documents']);
export const PRODUCTIVITY_KEY = 'majesticToolkitProductivityV9';
export const ACCENTS = Object.freeze(['blue','teal','violet','amber']);
export const THEME_EXTRAS = Object.freeze(['sepia','contrast']);
export const TYPES = Object.freeze(['all',...Object.keys(CATEGORIES)]);
const clean = v => String(v ?? '').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
const field = v => typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : '');
const flat = (value, max=16000) => String(value ?? '').slice(0,max);
export function defaultProductivity(){ return {accent:'blue',shortcutsEnabled:true,shortcuts:[...DEFAULT_SHORTCUTS]}; }
export function validateProductivity(value){
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('Некорректные настройки Productivity');
  if(!ACCENTS.includes(value.accent) || typeof value.shortcutsEnabled!=='boolean')throw Error('Некорректная палитра или горячие клавиши');
  if(!Array.isArray(value.shortcuts)||value.shortcuts.length!==8||value.shortcuts.some(x=>typeof x!=='string'||!['home','search',...Object.values(SECTION_FOR),'integrations','profiles','sites','settings','backup'].includes(x)))throw Error('Некорректная раскладка горячих клавиш');
  return {accent:value.accent,shortcutsEnabled:value.shortcutsEnabled,shortcuts:[...value.shortcuts]};
}
export function buildSearchRecords({templates=[],cases=[],economy=[],laws=[],government=[],documents=[],links=[]}={}){
  const out=[]; const add=(type,id,profileId,title,description,body,extra={})=>{
    if(!Object.hasOwn(CATEGORIES,type)||typeof id!=='string'||!id||typeof profileId!=='string')return;
    const item={key:`${type}:${id}`,id,type,profileId,title:flat(title,250),description:flat(description,550),body:flat(body),...extra};
    item.text=clean([item.title,item.description,item.body].join(' '));out.push(item);
  };
  for(const x of templates) add('forum',x.id,x.profileId,x.label,x.category,x.text,{url:''});
  for(const x of cases) add('complaints',x.id,x.profileId,x.title,`Статус: ${x.status||'—'} ${x.url||''}`,`${x.note||''} ${x.draft||''} ${(x.evidence||[]).map(y=>`${y.title||''} ${y.note||''}`).join(' ')}`,{url:x.url||''});
  for(const x of economy) add('economy',x.id,x.profileId,x.title||x.player||'Запись',`${x.type||''} ${x.date||''} ${x.family||''}`,x.note||'');
  for(const x of laws){
    if(x.type==='memo')add('law',x.id,x.profileId,x.title,`Памятка · ${x.category||''}`,x.body||'');
    if(x.type==='book'){
      const edition=x.editions?.find(y=>y.id===x.activeEditionId)||x.editions?.at(-1);
      if(!edition)continue;
      add('law',x.id,x.profileId,x.title,`Закон · ${x.category||''} · ${edition.label||''}`, '',{url:x.sourceUrl||''});
      for(const article of edition.articles||[])add('law',`${x.id}/${article.key}`,x.profileId,`Статья ${article.key}. ${article.title}`,`${x.title} · ${edition.label} · ${edition.effectiveDate}`,article.text,{url:x.sourceUrl||''});
    }
  }
  for(const x of government){
    if(x.type==='department')add('government',x.id,x.profileId,x.name,`${x.code||''} · ${x.officer||''} · ${x.position||''}`,x.jurisdiction||'');
    else if(x.type==='template')add('government',x.id,x.profileId,x.title,`Процессуальный шаблон · ${x.category||''}`,x.body||'');
    else add('government',x.id,x.profileId,`Решение ${x.caseNumber||''}`,`${x.status||''} · ${x.subject||''}`,`${x.facts||''} ${x.reason||''} ${x.sanction||''} ${(x.references||[]).map(r=>`${r.bookTitle} ${r.articleKey} ${r.articleText}`).join(' ')}`);
  }
  for(const x of documents){
    if(x.type==='template')add('documents',x.id,x.profileId,x.title,`Шаблон · ${x.category||''}`,x.body||'');
    else {const snapshot=x.versions?.at(-1);if(snapshot)add('documents',x.id,x.profileId,snapshot.title,`Документ · версия ${x.currentVersion}`,`${snapshot.body||''} ${(snapshot.fields||[]).map(f=>f.label||'').join(' ')}`);}
  }
  for(const x of links)add('integrations',x.id,'*',x.title,'Закладка · '+(x.url||''),x.notes||'',{url:x.url||''});
  return out;
}
export function tokenize(input){return [...new Set(clean(input).split(/[^\p{L}\p{N}_-]+/u).filter(x=>x.length>1||/^\d$/.test(x)))].slice(0,12);}
function rank(row,query,tokens){
  const t=clean(row.title),d=clean(row.description),b=row.text;
  if(tokens.some(token=>!row.text.includes(token)))return 0;
  let score=0;
  if(t===query)score+=85;
  if(t.includes(query))score+=45;
  if(d.includes(query))score+=20;
  if(b.includes(query))score+=12;
  for(const token of tokens){if(t.includes(token))score+=12;if(d.includes(token))score+=5;if(b.includes(token))score+=2;}
  return score||1;
}
export function excerpt(row,query,max=230){
  const body=row.body||row.description||row.title;
  if(!body)return '';
  const normalized=clean(body);const tokens=tokenize(query);
  const pos=tokens.map(t=>normalized.indexOf(t)).filter(i=>i>=0).sort((a,b)=>a-b)[0]??0;
  const start=Math.max(0,pos>70?pos-65:0);
  return (start?'…':'')+body.slice(start,start+max)+(start+max<body.length?'…':'');
}
export function searchRecords(rows,query,{profileId='',type='all',limit=40}={}){
  if(!TYPES.includes(type))throw Error('Неизвестный фильтр поиска');
  const q=clean(query);const tokens=tokenize(q);
  if(!tokens.length)return [];
  const found=[];
  for(const row of rows){
    if(profileId&&row.profileId!=='*'&&row.profileId!==profileId)continue;
    if(type!=='all'&&row.type!==type)continue;
    const score=rank(row,q,tokens);if(score)found.push({...row,score,snippet:excerpt(row,q)});
  }
  return found.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title,'ru')).slice(0,Math.min(100,Math.max(1,limit)));
}
export function answerLocal(question,rows,profileId=''){
  const q=clean(question);if(!q||q.length>500)throw Error('Введите вопрос длиной до 500 символов');
  const own=rows.filter(r=>r.profileId===profileId||r.profileId==='*');
  const counts=Object.fromEntries(Object.keys(CATEGORIES).map(type=>[type,own.filter(r=>r.type===type).length]));
  if(/^(сколько|статистика|обзор|количество|что есть|что сохранено)/u.test(q)){
    return {answer:`В активном профиле: ${counts.forum} шаблонов форума, ${counts.complaints} жалоб, ${counts.economy} записей экономики, ${counts.law} документов и статей законодательства, ${counts.government} ведомственных записей, ${counts.documents} документов и шаблонов, ${counts.integrations} закладок.`,refs:[]};
  }
  const results=searchRecords(rows,question,{profileId,limit:5});
  if(!results.length)return {answer:'В локальных данных нет подходящих записей. Импортируйте законы или добавьте записи в соответствующем разделе. Я не использую внешние источники и не подменяю отсутствующие данные догадками.',refs:[]};
  const summary=results.slice(0,3).map(r=>`${r.title} (${CATEGORIES[r.type]}): ${excerpt(r,question,175)}`).join('\n\n');
  return {answer:`Найдено ${results.length} совпадений (максимум 5 показано). Ниже выдержки из сохранённых данных, а не юридическое заключение:\n\n${summary}`,refs:results.map(r=>({key:r.key,title:r.title,type:r.type}))};
}
