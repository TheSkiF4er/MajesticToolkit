// Law Codex Advanced 2.0.2. Browser-local legislation with immutable editions,
// applicability by date, structured acts, clause-level comparisons and hashed citations.
export const LAW_PREFIX = 'majesticLawV5:'; // Keep existing storage and backup keys.
export const LIMITS = Object.freeze({records:1200,books:120,editions:30,articles:650,articleLength:12000,importBytes:2*1024*1024});
const iso = () => new Date().toISOString();
const uid = () => globalThis.crypto?.randomUUID?.() ?? `law-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const str = (value,label,max,allowBlank=false) => {
  if (typeof value !== 'string') throw Error(`Поле «${label}» должно быть текстом`);
  const s=value.trim();
  if (s.length>max||(!allowBlank&&!s)) throw Error(`Некорректное поле «${label}» (1–${max} символов)`);
  return s;
};
const id = v => { const s=str(v,'Идентификатор',120); if(!/^[a-zA-Z0-9_-]{8,120}$/.test(s)) throw Error('Недопустимый идентификатор'); return s; };
const stamp = v => {const s=str(v,'Дата изменения',40);if(!Number.isFinite(Date.parse(s)))throw Error('Неверная дата');return s;};
const date = v => {const s=str(v,'Дата редакции',10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(`${s}T00:00:00Z`))||new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)!==s)throw Error('Неверная дата редакции');return s;};
const optionalDate = v => (v==null||v==='')?'':date(v);
const https = raw => {if(raw===''||raw==null)return '';const s=str(raw,'Источник',1000);let u;try{u=new URL(s);}catch{throw Error('Введите HTTPS-адрес источника');}if(u.protocol!=='https:'||u.username||u.password)throw Error('Источник должен использовать HTTPS без учётных данных');return u.href;};
function articleKey(raw){const s=str(raw,'Номер статьи',50);if(!/^[\p{L}\p{N}][\p{L}\p{N} ._()\-/]{0,49}$/u.test(s))throw Error('Некорректный номер статьи');return s;}
const normalized = value => String(value||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim();

export function cleanArticle(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Некорректная статья');
  const article={key:articleKey(raw.key),title:str(raw.title,'Название статьи',220),text:str(raw.text,'Текст статьи',LIMITS.articleLength)};
  if(raw.section)article.section=str(raw.section,'Раздел',180);
  if(raw.chapter)article.chapter=str(raw.chapter,'Глава',180);
  return article;
}
export function cleanEdition(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Некорректная редакция');
  if(!Array.isArray(raw.articles)||raw.articles.length<1||raw.articles.length>LIMITS.articles)throw Error('Редакция должна содержать от 1 до 650 статей');
  const keys=new Set();const articles=raw.articles.map(value=>{const a=cleanArticle(value);const k=normalized(a.key);if(keys.has(k))throw Error(`Дублируется статья ${a.key}`);keys.add(k);return a;});
  const edition={id:id(raw.id),label:str(raw.label,'Название редакции',100),effectiveDate:date(raw.effectiveDate),createdAt:stamp(raw.createdAt),articles};
  if(raw.expiresAt){edition.expiresAt=date(raw.expiresAt);if(edition.expiresAt<=edition.effectiveDate)throw Error('Дата прекращения действия должна быть позже вступления в силу');}
  if(Object.hasOwn(raw,'sourceUrl'))edition.sourceUrl=https(raw.sourceUrl);
  if(raw.sourceCheckedAt){edition.sourceCheckedAt=stamp(raw.sourceCheckedAt);if(!edition.sourceUrl)throw Error('Подтверждение источника требует ссылки на источник');}
  if(raw.amendmentNote)edition.amendmentNote=str(raw.amendmentNote,'Сведения о поправке',800);
  if(raw.preamble)edition.preamble=str(raw.preamble,'Преамбула',12000);
  return edition;
}
export function cleanLawRecord(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Некорректная запись Law Codex');
  const base={id:id(raw.id),profileId:id(raw.profileId),createdAt:stamp(raw.createdAt),updatedAt:stamp(raw.updatedAt)};
  if(raw.type==='memo')return {...base,type:'memo',title:str(raw.title,'Памятка',150),body:str(raw.body,'Содержание памятки',16000),category:str(raw.category??'Общее','Категория',90),bookId:raw.bookId?id(raw.bookId):'',articleKey:raw.articleKey?articleKey(raw.articleKey):''};
  if(raw.type==='favorite')return {...base,type:'favorite',bookId:id(raw.bookId),articleKey:articleKey(raw.articleKey)};
  if(raw.type!=='book')throw Error('Неизвестный тип записи');
  if(!Array.isArray(raw.editions)||raw.editions.length<1||raw.editions.length>LIMITS.editions)throw Error('Неверное количество редакций');
  const editions=raw.editions.map(cleanEdition);const editionIds=new Set(editions.map(v=>v.id));if(editionIds.size!==editions.length)throw Error('Повторяются идентификаторы редакций');
  const activeEditionId=id(raw.activeEditionId);if(!editionIds.has(activeEditionId))throw Error('Текущая редакция отсутствует');
  const book={...base,type:'book',title:str(raw.title,'Название закона',170),category:str(raw.category??'Закон','Категория',90),sourceUrl:https(raw.sourceUrl),activeEditionId,editions};
  if(raw.repealedAt)book.repealedAt=date(raw.repealedAt);
  return book;
}
export function validateLawRecords(raw,profileIds){
  if(!Array.isArray(raw)||raw.length>LIMITS.records)throw Error('Некорректное количество записей Law Codex');
  const profiles=profileIds?new Set(profileIds):null,ids=new Set(),stars=new Set(),records=raw.map(cleanLawRecord);
  for(const r of records){
    if(ids.has(r.id))throw Error('Повторяющийся ID записи');ids.add(r.id);
    if(profiles&&!profiles.has(r.profileId))throw Error('Запись привязана к отсутствующему профилю');
    if(r.type==='favorite'){const k=`${r.profileId}:${r.bookId}:${normalized(r.articleKey)}`;if(stars.has(k))throw Error('Повторяющееся избранное');stars.add(k);}
  }
  if(records.filter(r=>r.type==='book').length>LIMITS.books)throw Error('Превышен лимит нормативных актов');
  const books=new Map(records.filter(r=>r.type==='book').map(r=>[r.id,r]));
  for(const r of records){if(r.type==='favorite'||(r.type==='memo'&&r.bookId)){
    const book=books.get(r.bookId);if(!book||book.profileId!==r.profileId)throw Error('Ссылка на отсутствующий закон или другой профиль');
    if(r.type==='favorite'&&!book.editions.some(ed=>ed.articles.some(a=>normalized(a.key)===normalized(r.articleKey))))throw Error('Избранная статья отсутствует в истории закона');
  }}
  return records;
}

// The parser preserves a preamble and structural headings, rather than dropping
// non-article lines. The article's original wording is never rewritten.
export function parseLawText(text){
  const source=str(text,'Текст закона',LIMITS.importBytes).replace(/\r\n?/g,'\n');
  const lines=source.split('\n'),articles=[];let section='',chapter='',current=null;
  const preamble=[];
  const articleHeader=/^\s*(?:Статья|Ст\.)\s*([\p{L}\p{N}]+(?:[.\-][\p{L}\p{N}]+)*)\s*[.\-—:)]?\s*(.*)$/iu;
  const sectionHeader=/^\s*(Раздел\s+[\p{L}\p{N}IVXLCDM]+(?:[.\-—:]\s*.*|\s+.*)?)\s*$/iu;
  const chapterHeader=/^\s*(Глава\s+[\p{L}\p{N}IVXLCDM]+(?:[.\-—:]\s*.*|\s+.*)?)\s*$/iu;
  const push=()=>{if(current){current.text=current.text.join('\n').trim()||current.title;articles.push(cleanArticle(current));current=null;}};
  for(const line of lines){
    const found=line.match(articleHeader);
    if(found){push();const title=found[2].trim()||`Статья ${found[1]}`;current={key:found[1],title:title.slice(0,220),text:[],...(section?{section}:{}),...(chapter?{chapter}:{})};continue;}
    const s=line.match(sectionHeader);const c=line.match(chapterHeader);
    if(s||c){push();if(s){section=s[1].trim().slice(0,180);chapter='';}else chapter=c[1].trim().slice(0,180);continue;}
    if(current)current.text.push(line);else if(line.trim())preamble.push(line);
  }
  push();
  if(!articles.length)throw Error('Не найдены заголовки «Статья 1. Название». Добавьте статьи в указанном формате.');
  if(articles.length>LIMITS.articles)throw Error('Редакция содержит слишком много статей');
  const keys=new Set();for(const a of articles){const k=normalized(a.key);if(keys.has(k))throw Error(`Дублируется статья ${a.key}`);keys.add(k);}
  const introduction=preamble.join('\n').trim();if(introduction.length>12000)throw Error('Преамбула превышает 12000 символов');
  return {articles,...(introduction?{preamble:introduction}:{})};
}
export function parseArticles(text){return parseLawText(text).articles;}
function editionContent(fields){return Array.isArray(fields.articles)?{articles:fields.articles.map(cleanArticle),...(fields.preamble?{preamble:fields.preamble}:{})}:parseLawText(fields.articlesText);}
function editionFromFields(fields,ts,sourceUrl){
  const parsed=editionContent(fields);
  return {id:uid(),label:fields.label,effectiveDate:fields.effectiveDate,createdAt:ts,
    ...(fields.expiresAt?{expiresAt:fields.expiresAt}:{}),
    sourceUrl:fields.sourceUrl??sourceUrl,
    ...(fields.sourceChecked?{sourceCheckedAt:ts}:{}),
    ...(fields.amendmentNote?{amendmentNote:fields.amendmentNote}:{}),...parsed};
}
export function createBook(profileId,fields){
  const ts=iso(),lawId=uid(),ed=editionFromFields(fields,ts,fields.sourceUrl||'');
  return cleanLawRecord({id:lawId,profileId,type:'book',title:fields.title,category:fields.category||'Закон',sourceUrl:fields.sourceUrl||'',activeEditionId:ed.id,editions:[ed],...(fields.repealedAt?{repealedAt:fields.repealedAt}:{}),createdAt:ts,updatedAt:ts});
}
export function updateBookMetadata(record,fields){const book=cleanLawRecord(record);if(book.type!=='book')throw Error('Не нормативный акт');const updated={...book,title:fields.title??book.title,category:fields.category??book.category,sourceUrl:fields.sourceUrl??book.sourceUrl,updatedAt:iso()};if(Object.hasOwn(fields,'repealedAt')){if(fields.repealedAt)updated.repealedAt=fields.repealedAt;else delete updated.repealedAt;}return cleanLawRecord(updated);}
export function addEdition(record,fields){
  const book=cleanLawRecord(record);if(book.type!=='book')throw Error('Не нормативный акт');
  if(book.editions.length>=LIMITS.editions)throw Error('Лимит редакций достигнут');
  const ts=iso(),ed=cleanEdition(editionFromFields(fields,ts,book.sourceUrl));
  if(book.editions.some(old=>old.effectiveDate===ed.effectiveDate))throw Error('Уже существует редакция с этой датой вступления в силу');
  return cleanLawRecord({...book,editions:[...book.editions,ed],activeEditionId:ed.id,updatedAt:ts});
}
export function setEditionSourceVerification(record,editionId,verified){
  const book=cleanLawRecord(record);
  if(book.type!=='book')throw Error('Не нормативный акт');
  if(!book.editions.some(ed=>ed.id===editionId))throw Error('Редакция не найдена');
  const now=iso();
  const editions=book.editions.map(ed=>{
    if(ed.id!==editionId)return ed;
    // Legacy editions with no per-edition URL cannot prove a historical source.
    const url=Object.hasOwn(ed,'sourceUrl')?ed.sourceUrl:'';
    if(verified&&!url)throw Error('Для проверки требуется ссылка, закреплённая за этой редакцией');
    const next={...ed};if(verified)next.sourceCheckedAt=now;else delete next.sourceCheckedAt;
    return next;
  });
  return cleanLawRecord({...book,editions,updatedAt:now});
}
export function switchEdition(record,editionId){const book=cleanLawRecord(record);if(book.type!=='book'||!book.editions.some(ed=>ed.id===editionId))throw Error('Редакция не найдена');return cleanLawRecord({...book,activeEditionId:editionId,updatedAt:iso()});}
export function createMemo(profileId,fields){const ts=iso();return cleanLawRecord({id:uid(),profileId,type:'memo',title:fields.title,body:fields.body,category:fields.category||'Общее',bookId:fields.bookId||'',articleKey:fields.articleKey||'',createdAt:ts,updatedAt:ts});}
export function updateMemo(record,fields){const old=cleanLawRecord(record);if(old.type!=='memo')throw Error('Памятка не найдена');return cleanLawRecord({...old,title:fields.title,body:fields.body,category:fields.category||'Общее',bookId:fields.bookId??old.bookId,articleKey:fields.articleKey??old.articleKey,updatedAt:iso()});}
export function makeFavorite(profileId,bookId,articleKeyValue){const ts=iso();return cleanLawRecord({id:uid(),profileId,type:'favorite',bookId,articleKey:articleKeyValue,createdAt:ts,updatedAt:ts});}
export function activeEdition(book){return book.editions.find(ed=>ed.id===book.activeEditionId);}

// Dates are inclusive at start and exclusive at end. A newer edition supersedes
// previous ones by its effective date; a repeal takes precedence over all editions.
export function editionAtDate(book,dateValue){
  const target=date(dateValue);if(book.type!=='book')throw Error('Не нормативный акт');
  if(book.repealedAt&&target>=book.repealedAt)return null;
  const candidates=book.editions.filter(ed=>ed.effectiveDate<=target)
    .sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)||b.createdAt.localeCompare(a.createdAt));
  const current=candidates[0];return current&&(!current.expiresAt||target<current.expiresAt)?current:null;
}
export function applicability(book,dateValue){
  const target=date(dateValue),ed=editionAtDate(book,target);
  const status=ed?'effective':book.repealedAt&&target>=book.repealedAt?'repealed':book.editions.some(v=>v.effectiveDate>target)&&!book.editions.some(v=>v.effectiveDate<=target)?'upcoming':'gap';
  return {status,edition:ed,date:target};
}
export function articleProvisions(article){
  const text=cleanArticle(article).text,lines=text.split('\n'),parts=[];let current=null;
  const marker=/^\s*((?:Часть|ч\.|Пункт|п\.)\s*\d+(?:\.\d+)*|\d+(?:\.\d+)*[.)])(?:\s+|$)/iu;
  for(const line of lines){const m=line.match(marker);if(m){if(current)parts.push(current);current={key:m[1].replace(/[.)]$/,'').replace(/\s+/g,' ').trim(),text:line};}else if(current)current.text+='\n'+line;else if(line.trim())parts.push({key:'',text:line});}
  if(current)parts.push(current);return parts.length?parts:[{key:'',text}];
}
export function compareLawEditions(book,fromId,toId){
  const old=book.editions.find(ed=>ed.id===fromId),current=book.editions.find(ed=>ed.id===toId);
  if(!old||!current)throw Error('Редакция не найдена');
  const former=new Map(old.articles.map(a=>[normalized(a.key),a]));const later=new Map(current.articles.map(a=>[normalized(a.key),a]));
  const differences=[];
  for(const key of new Set([...former.keys(),...later.keys()])){
    const before=former.get(key),after=later.get(key);
    if(before&&after&&before.title===after.title&&before.text===after.text&&before.section===after.section&&before.chapter===after.chapter)continue;
    const kind=!before?'added':!after?'removed':'changed';
    const a=before?articleProvisions(before):[],b=after?articleProvisions(after):[];
    // Preserve repeated unnumbered paragraphs in sequence, rather than overwriting a map entry.
    const identifying=rows=>{const counts=new Map();return rows.map((row,i)=>{const key=normalized(row.key);const n=counts.get(key)||0;counts.set(key,n+1);return {...row,matchId:key?`${key}:${n}`:`text:${i}`};});};
    const oldParts=new Map(identifying(a).map(p=>[p.matchId,p]));const newParts=new Map(identifying(b).map(p=>[p.matchId,p]));
    const provisions=[...new Set([...oldParts.keys(),...newParts.keys()])].flatMap(k=>{const left=oldParts.get(k),right=newParts.get(k);if(left?.text===right?.text)return [];return [{key:right?.key??left?.key??'',kind:!left?'added':!right?'removed':'changed',before:left?.text||'',after:right?.text||''}];});
    differences.push({key:after?.key||before.key,kind,before:before||null,after:after||null,provisions});
  }
  return {from:old,to:current,differences,added:differences.filter(x=>x.kind==='added').length,removed:differences.filter(x=>x.kind==='removed').length,changed:differences.filter(x=>x.kind==='changed').length};
}
export function searchLaws(records,profileId,query,{favoritesOnly=false,category='',editionId='',asOfDate=''}={}){
  if(asOfDate)date(asOfDate);
  const words=normalized(query).split(' ').filter(Boolean),books=records.filter(x=>x.type==='book'&&x.profileId===profileId);
  const favorites=new Set(records.filter(x=>x.type==='favorite'&&x.profileId===profileId).map(x=>`${x.bookId}|${normalized(x.articleKey)}`));const out=[];
  for(const book of books){
    if(category&&book.category!==category)continue;
    const ed=editionId?book.editions.find(x=>x.id===editionId):asOfDate?editionAtDate(book,asOfDate):activeEdition(book);
    if(!ed)continue;
    for(const article of ed.articles){const fav=favorites.has(`${book.id}|${normalized(article.key)}`);if(favoritesOnly&&!fav)continue;
      const doc=normalized(book.title+' '+book.category),heading=normalized(article.key+' '+article.title+' '+(article.section||'')+' '+(article.chapter||'')),content=normalized(article.text);
      if(!words.every(word=>(doc+' '+heading+' '+content).includes(word)))continue;
      const score=words.reduce((n,w)=>n+(heading.includes(w)?5:0)+(doc.includes(w)?3:0)+(content.includes(w)?1:0),0);
      out.push({book,edition:ed,article,favorite:fav,score});
    }
  }
  return out.sort((a,b)=>b.score-a.score||a.book.title.localeCompare(b.book.title,'ru')||a.article.key.localeCompare(b.article.key,'ru',{numeric:true}));
}
// Hash covers the exact snapshot content, not the mutable book metadata. All
// citations explicitly identify the local archive and never claim legal validity.
export async function makeLawCitation(book,editionId,articleNumber){
  const checked=cleanLawRecord(book);if(checked.type!=='book')throw Error('Не нормативный акт');
  const edition=checked.editions.find(x=>x.id===editionId),article=edition?.articles.find(a=>normalized(a.key)===normalized(articleNumber));
  if(!edition||!article)throw Error('Статья или редакция не найдена');
  const sourceUrl=Object.hasOwn(edition,'sourceUrl')?edition.sourceUrl:checked.sourceUrl;
  const snapshot={bookId:checked.id,editionId:edition.id,editionEffectiveDate:edition.effectiveDate,articleKey:article.key,articleTitle:article.title,articleText:article.text,sourceUrl};
  if(!globalThis.crypto?.subtle)throw Error('SHA-256 недоступен: необходим безопасный контекст браузера');
  const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)));
  const sha256=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
  const citation=`${checked.title} · ${edition.label} (с ${edition.effectiveDate})\nСтатья ${article.key}. ${article.title}\n${article.text}\nИсточник редакции: ${sourceUrl||'не указан'}\nРедакция ID: ${edition.id}\nSHA-256 снимка: ${sha256}${edition.sourceCheckedAt?'\nИсточник проверен пользователем: '+edition.sourceCheckedAt:'\nПроверка источника пользователем не отмечена'}`;
  return {snapshot,sha256,citation};
}
export function exportLawDataset(records,profileIds){return JSON.stringify({format:'majestictoolkit-law-dataset',schemaVersion:2,exportedAt:iso(),records:validateLawRecords(records,profileIds)},null,2);}
export function parseLawDataset(text,profileIds){if(typeof text!=='string'||text.length>16*1024*1024)throw Error('Файл превышает 16 МиБ');let obj;try{obj=JSON.parse(text);}catch{throw Error('Некорректный JSON');}if(obj?.format!=='majestictoolkit-law-dataset'||![1,2].includes(obj.schemaVersion))throw Error('Неподдерживаемый формат Law Codex');if(obj.integrity)throw Error('Импорт с SHA-256 требует проверки через parseVerifiedLawDataset');return validateLawRecords(obj.records,profileIds);}

async function sha256Hex(value){
  if(!globalThis.crypto?.subtle)throw Error('SHA-256 недоступен: нужен безопасный контекст');
  const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
}
// Preserve the synchronous legacy API for older clients, but require a digest
// verification before accepting a sealed v2 dataset into real storage.
export async function exportVerifiedLawDataset(records,profileIds){
  const obj=JSON.parse(exportLawDataset(records,profileIds));
  obj.integrity={algorithm:'SHA-256',digest:await sha256Hex(JSON.stringify(obj.records))};
  return JSON.stringify(obj,null,2);
}
export async function parseVerifiedLawDataset(text,profileIds){
  if(typeof text!=='string'||text.length>16*1024*1024)throw Error('Файл превышает 16 МиБ');
  let raw;try{raw=JSON.parse(text);}catch{throw Error('Некорректный JSON');}
  if(raw?.integrity){
    if(raw.schemaVersion!==2||raw.integrity.algorithm!=='SHA-256'||!/^[0-9a-f]{64}$/.test(raw.integrity.digest))throw Error('Некорректная контрольная сумма Law Codex');
    const hash=await sha256Hex(JSON.stringify(raw.records));
    if(hash!==raw.integrity.digest)throw Error('SHA-256 не совпадает: файл изменён или повреждён');
    const copy={...raw};delete copy.integrity;
    return parseLawDataset(JSON.stringify(copy),profileIds);
  }
  return parseLawDataset(text,profileIds);
}
