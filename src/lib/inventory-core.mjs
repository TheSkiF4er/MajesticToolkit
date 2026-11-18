/** Trading & Inventory 2.1.3. Immutable, replayable per-profile stock journal.
 * Inventory P&L is distinct from the legacy deal/cash register: neither creates
 * duplicate income or expenses in the old economy ledger. */
import {integer} from './economy-core.mjs';
export const INVENTORY_PREFIX='mtInventoryV213:';
export const MAX_INVENTORY_EVENTS=10000;
export const INVENTORY_KINDS=Object.freeze(['purchase','sale','transfer','reserve','release','writeoff','void']);
export const OWNER_TYPES=Object.freeze(['personal','family','organization']);
const id=(v,label='ID')=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{8,120}$/.test(v))throw Error(`${label}: неверный идентификатор`);return v;};
const txt=(v,label,max,optional=false)=>{if(typeof v!=='string')throw Error(`${label}: требуется текст`);const s=v.trim();if(s.length>max||(!optional&&!s))throw Error(`${label}: неверная длина`);return s;};
const date=v=>{if(typeof v!=='string'||!/^\d{4}-\d\d-\d\d$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error('Некорректная дата движения');return v;};
const stamp=v=>{if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)||!Number.isFinite(Date.parse(v)))throw Error('Неверное время операции');return new Date(v).toISOString();};
function owner(type,name){if(!OWNER_TYPES.includes(type))throw Error('Неизвестный тип владельца');const clean=txt(name??'','Имя владельца',100,type==='personal');if(type!=='personal'&&!clean)throw Error('Укажите семью или организацию');return {type,name:type==='personal'?'':clean};}
export const ownerKey=(type,name)=>`${type}\u001f${type==='personal'?'':name.toLocaleLowerCase('ru')}`;
const sum=(...ns)=>{const v=ns.reduce((a,b)=>a+b,0);if(!Number.isSafeInteger(v)||Math.abs(v)>Number.MAX_SAFE_INTEGER)throw Error('Переполнение суммы в складском журнале');return v;};
export function cleanInventoryEvent(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!INVENTORY_KINDS.includes(input.kind))throw Error('Неизвестная складская операция');
 const base={id:id(input.id),profileId:id(input.profileId,'Профиль'),kind:input.kind,date:date(input.date),createdAt:stamp(input.createdAt),note:txt(input.note??'','Примечание',1000,true)};
 if(input.kind==='void')return {...base,reversesId:id(input.reversesId,'Отменяемая операция')};
 const from=owner(input.ownerType??'personal',input.ownerName??'');
 const event={...base,productId:id(input.productId,'Товар'),lotId:input.kind==='purchase'?base.id:id(input.lotId,'Партия'),quantity:integer(input.quantity,'Количество',1000000,1),ownerType:from.type,ownerName:from.name};
 if(input.kind==='purchase'){
  const tag=txt(input.assetTag??'','Инвентарный номер имущества',100,true);
  if(tag&&event.quantity!==1)throw Error('Имущество с уникальным номером должно иметь количество 1');
  return {...event,unitPrice:integer(input.unitPrice,'Стоимость закупки'),fee:integer(input.fee??0,'Комиссия'),assetTag:tag};
 }
 if(input.kind==='sale')return {...event,unitPrice:integer(input.unitPrice,'Цена продажи'),fee:integer(input.fee??0,'Комиссия')};
 if(input.kind==='transfer'){
  const to=owner(input.toOwnerType,input.toOwnerName??'');
  if(ownerKey(to.type,to.name)===ownerKey(from.type,from.name))throw Error('Нельзя передать товар тому же владельцу');
  return {...event,toOwnerType:to.type,toOwnerName:to.name};
 }
 return event;
}
const uuid=()=>globalThis.crypto?.randomUUID?.()??'stock-'+Date.now().toString(36)+Math.random().toString(36).slice(2,14);
export function newInventoryEvent(profileId,kind,values){return cleanInventoryEvent({...values,id:uuid(),profileId,kind,createdAt:new Date().toISOString()});}
export function inventorySnapshot(events,profileId,products=null){
 if(!Array.isArray(events)||events.length>MAX_INVENTORY_EVENTS)throw Error('Слишком много операций склада');
 const ids=new Set(),clean=events.map(row=>{const e=cleanInventoryEvent(row);if(ids.has(e.id))throw Error('Дублирующийся ID операции склада');ids.add(e.id);if(e.profileId!==profileId)throw Error('Складская запись принадлежит другому профилю');return e;});
 const voided=new Set(),seen=new Map(),positions=new Map();
 for(let i=0;i<clean.length;i++){
  const row=clean[i];if(row.kind==='void'){
   const target=seen.get(row.reversesId);if(!target||target.kind==='void'||voided.has(target.id))throw Error('Недопустимая отмена операции');
   // Undo is safe only for the latest operation of its lot. No dependent
   // inventory movements may be silently rewritten or erased.
   const later=clean.slice(positions.get(target.id)+1,i).some(r=>r.kind!=='void'&&r.lotId===target.lotId&&!voided.has(r.id));
   if(later)throw Error('Нельзя отменить движение, после которого были другие операции по партии');
   voided.add(target.id);
  }else{seen.set(row.id,row);positions.set(row.id,i);}
 }
 const lots=new Map(),assetTags=new Set(),movements=[];
 let purchases=0,sales=0,cogs=0,fees=0,writeoffCost=0;
 const catalog=products===null?null:new Map(products.filter(p=>p.type==='product'&&p.profileId===profileId).map(p=>[p.id,p]));
 for(const row of clean){if(row.kind==='void'||voided.has(row.id))continue;
  if(row.kind==='purchase'){
   if(lots.has(row.id))throw Error('Партия уже существует');
   if(catalog&&!catalog.has(row.productId))throw Error('Товар партии отсутствует в каталоге данного профиля');
   if(row.assetTag){const key=row.assetTag.toLocaleLowerCase('ru');if(assetTags.has(key))throw Error('Инвентарный номер уже используется');assetTags.add(key);}
   const purchased=sum(row.quantity*row.unitPrice,row.fee);purchases=sum(purchases,purchased);
   const key=ownerKey(row.ownerType,row.ownerName);
   lots.set(row.id,{id:row.id,productId:row.productId,quantity:row.quantity,unitCost:row.unitPrice,purchaseFee:row.fee,assetTag:row.assetTag,date:row.date,stock:new Map([[key,{ownerType:row.ownerType,ownerName:row.ownerName,quantity:row.quantity,reserved:0}]]),sold:0,lost:0,allocatedCost:0,proceeds:0,profit:0});
   movements.push({...row,cost:purchased});continue;
  }
  const lot=lots.get(row.lotId);if(!lot||lot.productId!==row.productId)throw Error('Партия отсутствует или относится к другому товару');
  const key=ownerKey(row.ownerType,row.ownerName),bucket=lot.stock.get(key);
  if(!bucket)throw Error('У владельца нет товара этой партии');
  if(row.kind==='reserve'){
   if(bucket.quantity-bucket.reserved<row.quantity)throw Error('Недостаточно доступного остатка для резерва');bucket.reserved+=row.quantity;
  }else if(row.kind==='release'){
   if(bucket.reserved<row.quantity)throw Error('Резерв меньше освобождаемого количества');bucket.reserved-=row.quantity;
  }else{
   if(bucket.quantity-bucket.reserved<row.quantity)throw Error('Недостаточно доступного остатка для операции');
   bucket.quantity-=row.quantity;
   if(row.kind==='transfer'){
    const dest=ownerKey(row.toOwnerType,row.toOwnerName),current=lot.stock.get(dest)||{ownerType:row.toOwnerType,ownerName:row.toOwnerName,quantity:0,reserved:0};
    current.quantity+=row.quantity;lot.stock.set(dest,current);
   }else{
    const previously=lot.sold+lot.lost;
    const allocated=sum(row.quantity*lot.unitCost,Number(BigInt(lot.purchaseFee)*BigInt(previously+row.quantity)/BigInt(lot.quantity)-BigInt(lot.purchaseFee)*BigInt(previously)/BigInt(lot.quantity)));
    lot.allocatedCost=sum(lot.allocatedCost,allocated);
    if(row.kind==='sale'){
     const income=sum(row.quantity*row.unitPrice,-row.fee);
     lot.sold+=row.quantity;lot.proceeds=sum(lot.proceeds,income);lot.profit=sum(lot.profit,income,-allocated);
     sales=sum(sales,income);cogs=sum(cogs,allocated);fees=sum(fees,row.fee);
     movements.push({...row,cost:allocated,proceeds:income,profit:income-allocated});continue;
    }
    lot.lost+=row.quantity;writeoffCost=sum(writeoffCost,allocated);
    movements.push({...row,cost:allocated,profit:-allocated});continue;
   }
  }
  movements.push(row);
 }
 const stock=[];let stockValue=0,stockUnits=0,reservedUnits=0;
 for(const lot of lots.values()){
  const totalOnHand=[...lot.stock.values()].reduce((n,b)=>n+b.quantity,0);
  if(totalOnHand+lot.sold+lot.lost!==lot.quantity)throw Error('Несогласованное движение количества');
  const residual=sum(lot.quantity*lot.unitCost,lot.purchaseFee,-lot.allocatedCost);
  stockValue=sum(stockValue,residual);stockUnits+=totalOnHand;
  for(const bucket of lot.stock.values()){if(!bucket.quantity&&!bucket.reserved)continue;reservedUnits+=bucket.reserved;
   stock.push({lotId:lot.id,productId:lot.productId,assetTag:lot.assetTag,purchaseDate:lot.date,ownerType:bucket.ownerType,ownerName:bucket.ownerName,quantity:bucket.quantity,reserved:bucket.reserved,available:bucket.quantity-bucket.reserved,unitCost:lot.unitCost,lotValue:residual});
  }
 }
 return {events:clean,lots:[...lots.values()].map(({stock:owners,...rest})=>({...rest,owners:[...owners.values()]})),stock,movements,voided,totals:{purchases,sales,cogs,fees,realizedProfit:sum(sales,-cogs,-writeoffCost),tradingProfit:sum(sales,-cogs),writeoffCost,stockValue,stockUnits,reservedUnits}};
}
export function validateInventoryBatches(batches,profileIds=null,marketRows=null){
 if(!Array.isArray(batches)||batches.length>1000)throw Error('Неверный набор складских журналов');
 const ids=new Set(),known=profileIds?new Set(profileIds):null;
 return batches.map(entry=>{
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw Error('Неверный журнал склада');
  const profileId=id(entry.profileId,'Профиль');if(ids.has(profileId))throw Error('Повторяется складской профиль');ids.add(profileId);
  if(known&&!known.has(profileId))throw Error('Склад принадлежит отсутствующему профилю');
  const result=inventorySnapshot(entry.events,profileId,marketRows);
  return {profileId,events:result.events};
 });
}
export function inventoryCsv(snapshot){
 const lookup=new Map(snapshot.movements.map(row=>[row.id,row]));
 const keys=['date','kind','cancelled','reversesId','productId','lotId','quantity','ownerType','ownerName','toOwnerType','toOwnerName','unitPrice','fee','assetTag','note','cost','proceeds','profit'];
 const quoted=v=>{let s=String(v??'');if(/^[\s\x00-\x1f]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return '\ufeff'+[keys.map(quoted).join(';'),...snapshot.events.map(r=>{const operation=lookup.get(r.id)||r;const record={...operation,cancelled:snapshot.voided.has(r.id)?'yes':''};return keys.map(k=>quoted(record[k])).join(';');})].join('\r\n')+'\r\n';
}
