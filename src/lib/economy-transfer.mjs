/** Marketplace CSV/JSON import with a complete dry run and dedup before the only write. */
import {newMarketRecord,validateMarketplace,MAX_MARKET_ROWS} from './marketplace-core.mjs';
const HEADER=['type','name','category','variant','unit','date','kind','price','quantity','source','url','note','status','postedAt','expiresAt','seller'];
const MAX_BYTES=2*1024*1024,MAX_ROWS=5000;
const norm=v=>String(v??'').trim().toLocaleLowerCase('ru');
const productKey=r=>[norm(r.name),norm(r.category),norm(r.variant)].join('\u001f');
const observedKey=r=>[r.productId,r.date,r.kind,r.price,r.quantity,norm(r.source),r.url].join('\u001f');
const listingKey=r=>[r.productId,r.kind,r.postedAt,r.price,r.quantity,norm(r.seller),norm(r.source),r.url].join('\u001f');
const csvCell=x=>{const str=String(x??'');const safe=/^[=+@\-\t\r']/.test(str)?'\''+str:str;return /[;"\r\n]/.test(safe)?'"'+safe.replaceAll('"','""')+'"':safe;};
function splitCsv(text){
 const source=text.replace(/^\uFEFF/,'');let delimiter=';',inQuote=false,cell='',row=[],rows=[];
 const headerLine=source.slice(0,source.indexOf('\n')<0?source.length:source.indexOf('\n'));
 if(!headerLine.includes(';')&&headerLine.includes(','))delimiter=',';
 for(let i=0;i<source.length;i++){
  const c=source[i];if(inQuote){if(c==='"'&&source[i+1]==='"'){cell+='"';i++;}else if(c==='"')inQuote=false;else cell+=c;}
  else if(c==='"'){if(cell)throw Error('Некорректное экранирование CSV');inQuote=true;}
  else if(c===delimiter){row.push(cell);cell='';}
  else if(c==='\r'||c==='\n'){if(c==='\r'&&source[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x!==''))rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(inQuote)throw Error('Незакрытая кавычка в CSV');row.push(cell);if(row.some(x=>x!==''))rows.push(row);
 if(rows.length>MAX_ROWS+1)throw Error('CSV содержит слишком много строк');if(!rows.length)throw Error('CSV пуст');
 const columns=rows.shift();if(new Set(columns).size!==columns.length||!HEADER.every(c=>columns.includes(c)))throw Error('Заголовок CSV не соответствует формату Marketplace 2.1.9');
 return rows.map((values,i)=>{if(values.length!==columns.length)throw Error(`CSV: неверное число полей в строке ${i+2}`);return Object.fromEntries(columns.map((c,j)=>{let v=values[j];if(v.startsWith("''")||/^'[=+@\-\t\r]/.test(v))v=v.slice(1);return [c,v];}));});
}
export function exportMarketData(market,profileId,format='csv'){
 const rows=validateMarketplace(market).filter(x=>x.profileId===profileId),products=new Map(rows.filter(r=>r.type==='product').map(r=>[r.id,r]));
 const out=[...rows].sort((a,b)=>Number(a.type!=='product')-Number(b.type!=='product')).map(r=>{
  const p=r.type==='product'?r:products.get(r.productId);return Object.fromEntries(HEADER.map(key=>[key,r[key]??(key==='name'||key==='category'||key==='variant'||key==='unit'?p?.[key]??'':'')]));
 });
 if(format==='json')return JSON.stringify({format:'majestictoolkit-market-import',schemaVersion:1,rows:out},null,2);
 if(format!=='csv')throw Error('Неизвестный формат экспорта');
 return '\uFEFF'+HEADER.map(csvCell).join(';')+'\r\n'+out.map(r=>HEADER.map(k=>csvCell(r[k])).join(';')).join('\r\n')+'\r\n';
}
export function parseMarketImport(text,format='csv'){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Файл импорта превышает 2 МиБ');
 let rows;
 if(format==='json'){
  let data;try{data=JSON.parse(text);}catch{throw Error('Некорректный JSON импорта');}
  if(data?.format!=='majestictoolkit-market-import'||data.schemaVersion!==1||!Array.isArray(data.rows))throw Error('Неизвестный формат Marketplace JSON');rows=data.rows;
 }else if(format==='csv')rows=splitCsv(text);else throw Error('Поддерживаются только CSV и JSON');
 if(rows.length>MAX_ROWS||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('Некорректные строки рыночного импорта');
 return rows;
}
export function previewMarketImport(rows,profileId,existing){
 if(!Array.isArray(rows)||rows.length>MAX_ROWS)throw Error('Слишком много импортируемых строк');
 const valid=validateMarketplace(existing),own=valid.filter(r=>r.profileId===profileId);
 const products=new Map(own.filter(r=>r.type==='product').map(r=>[productKey(r),r]));
 const seenPrices=new Set(own.filter(r=>r.type==='price').map(observedKey)),seenListings=new Set(own.filter(r=>r.type==='listing').map(listingKey));
 const added=[],counts={product:0,price:0,listing:0,skipped:0};
 for(let i=0;i<rows.length;i++){
  const input=rows[i];try{
   if(!['product','price','listing'].includes(input.type))throw Error('Неизвестный тип');
   const key=productKey(input),existingProduct=products.get(key);
   if(input.type==='product'){
    if(existingProduct){counts.skipped++;continue;}
    const p=newMarketRecord('product',profileId,{name:input.name,category:input.category,variant:input.variant??'',unit:input.unit||'шт.',note:input.note||''});
    products.set(key,p);added.push(p);counts.product++;continue;
   }
   if(!existingProduct)throw Error('Товар отсутствует. Добавьте строку product выше или создайте товар заранее');
   const fields={...input,productId:existingProduct.id};delete fields.id;delete fields.profileId;
   if(input.type==='price'){
    const item=newMarketRecord('price',profileId,fields),signature=observedKey(item);
    if(seenPrices.has(signature)){counts.skipped++;continue;}seenPrices.add(signature);added.push(item);counts.price++;
   }else{
    const item=newMarketRecord('listing',profileId,fields),signature=listingKey(item);
    if(seenListings.has(signature)){counts.skipped++;continue;}seenListings.add(signature);added.push(item);counts.listing++;
   }
  }catch(e){throw Error(`Импорт, строка ${i+1}: ${e.message}`);}
 }
 if(valid.length+added.length>MAX_MARKET_ROWS)throw Error('Превышен лимит рыночного каталога');
 validateMarketplace([...valid,...added]);
 return {added,counts,total:rows.length,baseline:JSON.stringify(valid.map(r=>[r.id,r.updatedAt]).sort((a,b)=>a[0].localeCompare(b[0])))};
}
export function verifyImportBaseline(preview,existing){const baseline=JSON.stringify(validateMarketplace(existing).map(r=>[r.id,r.updatedAt]).sort((a,b)=>a[0].localeCompare(b[0])));if(preview.baseline!==baseline)throw Error('Рынок изменился после предпросмотра. Проверьте файл повторно');}
