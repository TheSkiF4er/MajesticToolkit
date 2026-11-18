/** Marketplace 2.1.2: locally sourced product catalog, observed prices and listings.
 * Prices are user observations, never invented quotes or synchronized market feeds. */
import {DEAL_CATEGORIES,integer} from './economy-core.mjs';

export const MARKET_PREFIX='mtMarketplaceV212:';
export const MAX_MARKET_ROWS=12000;
export const MARKET_TYPES=Object.freeze(['product','price','listing']);
export const PRICE_KINDS=Object.freeze(['ask','bid','completed']);
export const LISTING_KINDS=Object.freeze(['sell','buy']);
export const LISTING_STATUSES=Object.freeze(['active','closed','cancelled']);
const text=(value,label,max,optional=false)=>{
 if(typeof value!=='string')throw Error(`${label}: требуется текст`);
 const v=value.trim();if(v.length>max||(!optional&&!v))throw Error(`${label}: неверная длина`);return v;
};
const id=value=>{if(typeof value!=='string'||!/^[\w-]{8,120}$/.test(value))throw Error('Неверный идентификатор рынка');return value;};
const date=value=>{if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('Некорректная дата рынка');return value;};
const stamp=value=>{if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('Некорректное время изменения');return new Date(value).toISOString();};
const sourceURL=value=>{
 if(value===undefined||value===null||value==='')return '';
 const v=text(value,'Ссылка на источник',800);
 let u;try{u=new URL(v);}catch{throw Error('Некорректная ссылка на источник');}
 if(u.protocol!=='https:'||!u.hostname||u.username||u.password)throw Error('Источник должен быть HTTPS без учётных данных');
 return v;
};
export function cleanMarketRecord(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!MARKET_TYPES.includes(input.type))throw Error('Неизвестная запись рынка');
 const base={id:id(input.id),type:input.type,profileId:text(input.profileId,'Профиль',128),createdAt:stamp(input.createdAt),updatedAt:stamp(input.updatedAt)};
 if(input.type==='product'){
  if(!DEAL_CATEGORIES.includes(input.category))throw Error('Неизвестная категория товара');
  return {...base,name:text(input.name,'Название товара',120),category:input.category,variant:text(input.variant??'','Вариант',100,true),unit:text(input.unit??'шт.','Единица измерения',30),note:text(input.note??'','Примечание',1000,true),archived:input.archived===true};
 }
 const productId=id(input.productId);
 if(input.type==='price'){
  if(!PRICE_KINDS.includes(input.kind))throw Error('Неизвестный тип цены');
  return {...base,productId,date:date(input.date),kind:input.kind,price:integer(input.price,'Цена за единицу'),quantity:integer(input.quantity??1,'Количество',1000000,1),source:text(input.source,'Источник наблюдения',160),url:sourceURL(input.url),note:text(input.note??'','Примечание',1000,true)};
 }
 if(!LISTING_KINDS.includes(input.kind)||!LISTING_STATUSES.includes(input.status))throw Error('Некорректный вид или статус объявления');
 const postedAt=date(input.postedAt),expiresAt=input.expiresAt?date(input.expiresAt):'';
 if(expiresAt&&expiresAt<postedAt)throw Error('Окончание объявления раньше публикации');
 return {...base,productId,kind:input.kind,status:input.status,postedAt,expiresAt,price:integer(input.price,'Цена за единицу'),quantity:integer(input.quantity,'Количество',1000000,1),seller:text(input.seller??'','Продавец/покупатель',120,true),source:text(input.source,'Источник объявления',160),url:sourceURL(input.url),note:text(input.note??'','Примечание',1000,true)};
}
const uid=()=>globalThis.crypto?.randomUUID?.()??`market-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
export function newMarketRecord(type,profileId,values){const now=new Date().toISOString();return cleanMarketRecord({...values,id:uid(),type,profileId,createdAt:now,updatedAt:now});}
export function changeMarketRecord(previous,values){const old=cleanMarketRecord(previous);const keys=old.type==='product'?['name','category','variant','unit','note','archived']:old.type==='price'?['date','kind','price','quantity','source','url','note']:['kind','status','postedAt','expiresAt','price','quantity','seller','source','url','note'];return cleanMarketRecord({...old,...Object.fromEntries(Object.entries(values).filter(([k])=>keys.includes(k))),updatedAt:new Date().toISOString()});}
export function validateMarketplace(records,profileIds=null){
 if(!Array.isArray(records)||records.length>MAX_MARKET_ROWS)throw Error('Слишком много рыночных записей');
 const seen=new Set(),ids=profileIds?new Set(profileIds):null;
 const rows=records.map(input=>{const r=cleanMarketRecord(input);if(seen.has(r.id))throw Error('Повторяющийся ID рынка');seen.add(r.id);if(ids&&!ids.has(r.profileId))throw Error('Рыночная запись относится к отсутствующему профилю');return r;});
 const products=new Map(rows.filter(r=>r.type==='product').map(r=>[r.id,r]));
 const names=new Set();for(const p of products.values()){
  const key=[p.profileId,p.category,p.name.toLocaleLowerCase('ru'),p.variant.toLocaleLowerCase('ru')].join('\u001f');
  if(names.has(key))throw Error('Товар с такой категорией, названием и вариантом уже существует в профиле');
  names.add(key);
 }
 for(const r of rows){if(r.type==='product')continue;const product=products.get(r.productId);if(!product||product.profileId!==r.profileId)throw Error(`Рыночная запись ${r.id} ссылается на отсутствующий или чужой товар`);}
 return rows;
}
export function marketStats(rows,profileId,productId='',asOf=new Date().toISOString().slice(0,10)){
 const products=rows.filter(r=>r.profileId===profileId&&r.type==='product');
 const prices=rows.filter(r=>r.profileId===profileId&&r.type==='price'&&(!productId||r.productId===productId)&&r.date<=asOf);
 const listings=rows.filter(r=>r.profileId===profileId&&r.type==='listing'&&(!productId||r.productId===productId));
 const ordered=prices.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt));
 const completed=ordered.filter(r=>r.kind==='completed');
 const values=completed.length?completed.map(r=>r.price):ordered.map(r=>r.price);
 const sorted=values.slice().sort((a,b)=>a-b);
 const median=sorted.length?(sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2):null;
 const active=listings.filter(r=>r.status==='active'&&(!r.expiresAt||r.expiresAt>=asOf));
 const pricesByProduct=new Map();for(const row of ordered){const list=pricesByProduct.get(row.productId)??[];list.push(row);pricesByProduct.set(row.productId,list);}
 return {products,prices:ordered,listings,active,observations:prices.length,median,min:sorted.length?sorted[0]:null,max:sorted.length?sorted.at(-1):null,first:values.length?values[0]:null,last:values.length?values.at(-1):null,priceType:completed.length?'completed':'observed',pricesByProduct};
}
/** Price comparison is descriptive. No independent market API is queried. */
export function compareProductPrices(rows,profileId,productId){
 const stats=marketStats(rows,profileId,productId);const {prices,active}=stats;
 const buy=active.filter(r=>r.kind==='buy').sort((a,b)=>b.price-a.price);
 const sell=active.filter(r=>r.kind==='sell').sort((a,b)=>a.price-b.price);
 const bestBid=buy[0]?.price??null,bestAsk=sell[0]?.price??null;
 return {...stats,bestBid,bestAsk,spread:bestAsk!==null&&bestBid!==null?bestAsk-bestBid:null,
  change:stats.first!==null&&stats.last!==null?stats.last-stats.first:null,
  changePercent:stats.first>0?(stats.last-stats.first)/stats.first*100:null,
  history:prices.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt))};
}
