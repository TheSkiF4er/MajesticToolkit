// Law Codex 0.5.0 — self-contained, server-scoped, immutable editions.
export const LAW_PREFIX = 'majesticLawV5:';
export const LIMITS = Object.freeze({records:1200,books:120,editions:30,articles:650,articleLength:12000,importBytes:2*1024*1024});
const MAX_DATE = '9999-12-31';
const iso = () => new Date().toISOString();
const uid = () => globalThis.crypto?.randomUUID?.() ?? `law-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const str = (value, label, max, allowBlank = false) => {
  if(typeof value !== 'string') throw Error(`Поле «${label}» должно быть текстом`);
  const text = value.trim();
  if(text.length > max || (!allowBlank && !text)) throw Error(`Некорректное поле «${label}» (1–${max} символов)`);
  return text;
};
const id = (v) => {const s=str(v,'Идентификатор',120); if(!/^[a-zA-Z0-9_-]{8,120}$/.test(s)) throw Error('Недопустимый идентификатор');return s;};
const stamp = (v) => {const s=str(v,'Дата изменения',40);if(!Number.isFinite(Date.parse(s)))throw Error('Неверная дата');return s;};
const date = (v) => {const s=str(v,'Дата редакции',10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)!==s)throw Error('Неверная дата редакции');return s;};
const https = (raw) => {if(raw === '' || raw === undefined || raw === null)return '';const s=str(raw,'Источник',1000);let u;try{u=new URL(s);}catch{throw Error('Введите HTTPS-адрес источника');}if(u.protocol!=='https:' || u.username || u.password)throw Error('Источник должен использовать HTTPS без учётных данных');return u.href;};
function articleKey(raw){const s=str(raw,'Номер статьи',50);if(!/^[\p{L}\p{N}][\p{L}\p{N} ._()\-/]{0,49}$/u.test(s))throw Error('Некорректный номер статьи');return s;}
export function cleanArticle(raw){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Некорректная статья');return {key:articleKey(raw.key),title:str(raw.title,'Название статьи',220),text:str(raw.text,'Текст статьи',LIMITS.articleLength)};}
export function cleanEdition(raw){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Некорректная редакция');if(!Array.isArray(raw.articles)||raw.articles.length<1||raw.articles.length>LIMITS.articles)throw Error('Редакция должна содержать от 1 до 650 статей');const keys=new Set();const articles=raw.articles.map(value=>{const a=cleanArticle(value);const key=a.key.toLocaleLowerCase('ru');if(keys.has(key))throw Error(`Дублируется статья ${a.key}`);keys.add(key);return a;});return {id:id(raw.id),label:str(raw.label,'Название редакции',100),effectiveDate:date(raw.effectiveDate),createdAt:stamp(raw.createdAt),articles};}
export function cleanLawRecord(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Некорректная запись Law Codex');
  const base={id:id(raw.id),profileId:id(raw.profileId),createdAt:stamp(raw.createdAt),updatedAt:stamp(raw.updatedAt)};
  if(raw.type==='memo') return {...base,type:'memo',title:str(raw.title,'Памятка',150),body:str(raw.body,'Содержание памятки',16000),category:str(raw.category??'Общее','Категория',90),bookId:raw.bookId?id(raw.bookId):'',articleKey:raw.articleKey?articleKey(raw.articleKey):''};
  if(raw.type==='favorite') return {...base,type:'favorite',bookId:id(raw.bookId),articleKey:articleKey(raw.articleKey)};
  if(raw.type!=='book')throw Error('Неизвестный тип записи');
  if(!Array.isArray(raw.editions)||raw.editions.length<1||raw.editions.length>LIMITS.editions)throw Error('Неверное количество редакций');
  const editions=raw.editions.map(cleanEdition);const editionIds=new Set(editions.map(v=>v.id));if(editionIds.size!==editions.length)throw Error('Повторяются идентификаторы редакций');
  const activeEditionId=id(raw.activeEditionId);if(!editionIds.has(activeEditionId))throw Error('Текущая редакция отсутствует');
  return {...base,type:'book',title:str(raw.title,'Название закона',170),category:str(raw.category??'Закон','Категория',90),sourceUrl:https(raw.sourceUrl),activeEditionId,editions};
}
export function validateLawRecords(raw, profileIds){
  if(!Array.isArray(raw)||raw.length>LIMITS.records)throw Error('Некорректное количество записей Law Codex');
  const profiles=profileIds?new Set(profileIds):null;const ids=new Set(),stars=new Set();
  const records=raw.map(cleanLawRecord);
  for(const r of records){if(ids.has(r.id))throw Error('Повторяющийся ID записи');ids.add(r.id);if(profiles&&!profiles.has(r.profileId))throw Error('Запись привязана к отсутствующему профилю');if(r.type==='favorite'){const k=`${r.profileId}:${r.bookId}:${r.articleKey.toLocaleLowerCase('ru')}`;if(stars.has(k))throw Error('Повторяющееся избранное');stars.add(k);}}
  if(records.filter(r=>r.type==='book').length>LIMITS.books)throw Error('Превышен лимит нормативных актов');
  const books=new Map(records.filter(r=>r.type==='book').map(r=>[r.id,r]));
  for(const r of records){if(r.type==='favorite'||r.type==='memo'&&r.bookId){const book=books.get(r.bookId);if(!book||book.profileId!==r.profileId)throw Error('Ссылка на отсутствующий закон или другой профиль');if(r.type==='favorite'&&!book.editions.some(ed=>ed.articles.some(a=>a.key.toLocaleLowerCase('ru')===r.articleKey.toLocaleLowerCase('ru'))))throw Error('Избранная статья отсутствует в истории закона');}}
  return records;
}
export function parseArticles(text){
  const source=str(text,'Текст закона',LIMITS.importBytes);const lines=source.replace(/\r\n?/g,'\n').split('\n');const found=[];let current=null;
  const header=/^\s*(?:Статья|Ст\.)\s*([\p{L}\p{N}]+(?:[.\-][\p{L}\p{N}]+)*)\s*[.\-—:)]?\s*(.*)$/iu;
  for(const line of lines){const m=line.match(header);if(m){if(current)found.push(current);const title=m[2].trim()||`Статья ${m[1]}`;current={key:m[1],title:title.slice(0,220),text:''};}else if(current){current.text+=(current.text?'\n':'')+line;}}
  if(current)found.push(current);
  if(!found.length)throw Error('Не найдены заголовки «Статья 1. Название». Добавьте статьи в указанном формате.');
  const keys=new Set();return found.map(a=>{const article=cleanArticle({...a,text:a.text.trim()||a.title});const key=article.key.toLocaleLowerCase('ru');if(keys.has(key))throw Error(`Дублируется статья ${article.key}`);keys.add(key);return article;});
}
export function createBook(profileId,fields){const ts=iso(),lawId=uid(),editionId=uid();const parsed=Array.isArray(fields.articles)?fields.articles.map(cleanArticle):parseArticles(fields.articlesText);return cleanLawRecord({id:lawId,profileId,type:'book',title:fields.title,category:fields.category||'Закон',sourceUrl:fields.sourceUrl||'',activeEditionId:editionId,editions:[{id:editionId,label:fields.label||'Первая редакция',effectiveDate:fields.effectiveDate,createdAt:ts,articles:parsed}],createdAt:ts,updatedAt:ts});}
export function updateBookMetadata(record,fields){const book=cleanLawRecord(record);if(book.type!=='book')throw Error('Не нормативный акт');return cleanLawRecord({...book,title:fields.title??book.title,category:fields.category??book.category,sourceUrl:fields.sourceUrl??book.sourceUrl,updatedAt:iso()});}
export function addEdition(record,fields){const book=cleanLawRecord(record);if(book.type!=='book')throw Error('Не нормативный акт');if(book.editions.length>=LIMITS.editions)throw Error('Лимит редакций достигнут');const ts=iso();const ed={id:uid(),label:fields.label,effectiveDate:fields.effectiveDate,createdAt:ts,articles:Array.isArray(fields.articles)?fields.articles.map(cleanArticle):parseArticles(fields.articlesText)};return cleanLawRecord({...book,editions:[...book.editions,ed],activeEditionId:ed.id,updatedAt:ts});}
export function switchEdition(record,editionId){const book=cleanLawRecord(record);if(book.type!=='book'||!book.editions.some(ed=>ed.id===editionId))throw Error('Редакция не найдена');return cleanLawRecord({...book,activeEditionId:editionId,updatedAt:iso()});}
export function createMemo(profileId,fields){const ts=iso();return cleanLawRecord({id:uid(),profileId,type:'memo',title:fields.title,body:fields.body,category:fields.category||'Общее',bookId:fields.bookId||'',articleKey:fields.articleKey||'',createdAt:ts,updatedAt:ts});}
export function updateMemo(record,fields){const old=cleanLawRecord(record);if(old.type!=='memo')throw Error('Памятка не найдена');return cleanLawRecord({...old,title:fields.title,body:fields.body,category:fields.category||'Общее',bookId:fields.bookId??old.bookId,articleKey:fields.articleKey??old.articleKey,updatedAt:iso()});}
export function makeFavorite(profileId,bookId,articleKeyValue){const ts=iso();return cleanLawRecord({id:uid(),profileId,type:'favorite',bookId,articleKey:articleKeyValue,createdAt:ts,updatedAt:ts});}
export function activeEdition(book){return book.editions.find(ed=>ed.id===book.activeEditionId);}
const normalized = text => String(text||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
export function searchLaws(records,profileId,query,{favoritesOnly=false,category='',editionId=''}={}){
  const term=normalized(query),words=term.split(' ').filter(Boolean),books=records.filter(x=>x.type==='book'&&x.profileId===profileId);
  const favorites=new Set(records.filter(x=>x.type==='favorite'&&x.profileId===profileId).map(x=>`${x.bookId}|${normalized(x.articleKey)}`));const out=[];
  for(const book of books){if(category&&book.category!==category)continue;const ed=book.editions.find(e=>e.id===(editionId||book.activeEditionId));if(!ed)continue;
    for(const article of ed.articles){const fav=favorites.has(`${book.id}|${normalized(article.key)}`);if(favoritesOnly&&!fav)continue;const doc=normalized(book.title),heading=normalized(article.key+' '+article.title),content=normalized(article.text);if(!words.every(word=>(doc+' '+heading+' '+content).includes(word)))continue;
      const score=words.reduce((n,w)=>n+(heading.includes(w)?5:0)+(doc.includes(w)?3:0)+(content.includes(w)?1:0),0);out.push({book,edition:ed,article,favorite:fav,score});
    }
  }
  return out.sort((a,b)=>b.score-a.score||a.book.title.localeCompare(b.book.title,'ru')||a.article.key.localeCompare(b.article.key,'ru',{numeric:true}));
}
export function exportLawDataset(records,profileIds){return JSON.stringify({format:'majestictoolkit-law-dataset',schemaVersion:1,exportedAt:iso(),records:validateLawRecords(records,profileIds)},null,2);}
export function parseLawDataset(text,profileIds){if(typeof text!=='string'||text.length>16*1024*1024)throw Error('Файл превышает 16 МиБ');let obj;try{obj=JSON.parse(text);}catch{throw Error('Некорректный JSON');}if(obj?.format!=='majestictoolkit-law-dataset'||obj.schemaVersion!==1)throw Error('Неподдерживаемый формат Law Codex');return validateLawRecords(obj.records,profileIds);}
