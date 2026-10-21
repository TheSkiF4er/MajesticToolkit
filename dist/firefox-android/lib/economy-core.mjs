// MajesticToolkit 0.4.0: offline accounting and performance models. No external data feeds.
export const PREFIX = 'rpnEconomyV4:';
export const MAX_RECORDS = 6000;
export const TYPES = Object.freeze(['deal', 'cash', 'match']);
export const DEAL_CATEGORIES = Object.freeze(['Транспорт','Предметы','Одежда','Недвижимость','Ресурсы','Другое']);
export const DEAL_STATUS = Object.freeze(['open','closed']);
export const CASH_KINDS = Object.freeze(['income','expense']);
const MAX_MONEY = 1_000_000_000_000;
const safe = (v, name, max, optional=false) => {
  if (typeof v !== 'string') throw Error(`${name}: требуется текст`);
  const n = v.trim();
  if (n.length > max || (!optional && !n)) throw Error(`${name}: неверная длина`);
  return n;
};
export function integer(value, name, max=MAX_MONEY, min=0) {
  if (typeof value === 'string' && !/^(0|[1-9]\d*)$/.test(value)) throw Error(`${name}: требуется целое число`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max || value === '' || value === null || value === undefined || typeof value === 'boolean') throw Error(`${name}: неверное число`);
  return n;
}
const timestamp = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw Error('Некорректная дата записи');
  return new Date(value).toISOString();
};
function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value+'T00:00:00.000Z').toISOString().slice(0,10) !== value) throw Error('Некорректная дата события');
  return value;
}
function id(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,120}$/.test(value)) throw Error('Неверный идентификатор записи'); return value; }
export function cleanRecord(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !TYPES.includes(data.type)) throw Error('Неизвестный тип записи');
  const base = { id:id(data.id), type:data.type, profileId:safe(data.profileId,'Профиль',128), createdAt:timestamp(data.createdAt), updatedAt:timestamp(data.updatedAt) };
  if (data.type === 'deal') {
    if (!DEAL_CATEGORIES.includes(data.category)) throw Error('Неизвестная категория сделки');
    if (!DEAL_STATUS.includes(data.status ?? 'closed')) throw Error('Неизвестный статус сделки');
    const deal = { ...base, date:dateOnly(data.date), title:safe(data.title,'Название сделки',120), category:data.category, status:data.status??'closed',
      quantity:integer(data.quantity,'Количество',1000000,1), buyPrice:integer(data.buyPrice,'Цена покупки'), salePrice:integer(data.salePrice,'Цена продажи'),
      buyFee:integer(data.buyFee,'Расходы на покупку'), saleFee:integer(data.saleFee,'Расходы на продажу'), note:safe(data.note ?? '','Примечание',1000,true) };
    if (![deal.buyPrice*deal.quantity+deal.buyFee,deal.salePrice*deal.quantity-deal.saleFee].every(Number.isSafeInteger)) throw Error('Сумма сделки превышает безопасный лимит');
    return deal;
  }
  if (data.type === 'cash') {
    if (!CASH_KINDS.includes(data.kind)) throw Error('Неверный тип поступления/расхода');
    return { ...base, date:dateOnly(data.date), kind:data.kind, title:safe(data.title,'Категория операции',120), amount:integer(data.amount,'Сумма',MAX_MONEY,1), note:safe(data.note ?? '','Примечание',1000,true) };
  }
  if (!['win','loss','draw'].includes(data.result)) throw Error('Некорректный результат матча');
  return { ...base, date:dateOnly(data.date), player:safe(data.player,'Игрок',80), family:safe(data.family ?? '','Семья',80,true),
    opponent:safe(data.opponent ?? '','Противник',100,true), mode:safe(data.mode ?? 'Капт','Режим',60), result:data.result,
    kills:integer(data.kills,'Убийства',10000), deaths:integer(data.deaths,'Смерти',10000), damage:integer(data.damage,'Урон',10000000), note:safe(data.note ?? '','Примечание',1000,true) };
}
const uid = () => globalThis.crypto?.randomUUID?.() ?? 'rec-' + Date.now().toString(36) + Math.random().toString(36).slice(2,12);
export function createRecord(type, profileId, data) {
  const now = new Date().toISOString();
  return cleanRecord({ ...data, id:uid(), type, profileId, createdAt:now, updatedAt:now });
}
export function editRecord(original, fields) {
  const previous = cleanRecord(original);
  const allowed = previous.type === 'deal' ? ['date','title','category','status','quantity','buyPrice','salePrice','buyFee','saleFee','note'] : previous.type === 'cash' ? ['date','kind','title','amount','note'] : ['date','player','family','opponent','mode','result','kills','deaths','damage','note'];
  return cleanRecord({ ...previous, ...Object.fromEntries(Object.entries(fields).filter(([key])=>allowed.includes(key))), updatedAt:new Date().toISOString() });
}
function checkedSum(...numbers) { const n = numbers.reduce((a,b)=>a+b,0); if (!Number.isSafeInteger(n) || Math.abs(n)>9e15) throw Error('Переполнение суммы'); return n; }
export function dealTotals(deal) {
  const d = cleanRecord(deal);
  if (d.type !== 'deal') throw Error('Нужна сделка');
  const invested = checkedSum(d.buyPrice*d.quantity,d.buyFee);
  const revenue = checkedSum(d.salePrice*d.quantity,-d.saleFee);
  const profit = checkedSum(revenue,-invested);
  return {invested,revenue,profit,roi:invested>0 ? profit/invested*100 : null};
}
export function resaleCalc({quantity,buyPrice,salePrice,buyFee=0,saleFee=0}) {
  return dealTotals(createRecord('deal','calculator',{date:'2026-01-01',title:'Расчёт',category:'Другое',quantity,buyPrice,salePrice,buyFee,saleFee,note:''}));
}
export function craftCalc({units,successPercent,materialCost,feePerAttempt=0,salePrice=0}) {
  const n=integer(units,'Объём',1000000,1);
  const mat=integer(materialCost,'Цена ресурсов'); const fee=integer(feePerAttempt,'Затраты на попытку');const sale=integer(salePrice,'Цена продажи');
  const percent=Number(successPercent);
  if ((typeof successPercent==='string' && !/^\d+(\.\d{1,2})?$/.test(successPercent)) || !Number.isFinite(percent) || percent<=0 || percent>100) throw Error('Шанс крафта должен быть от 0,01 до 100 %');
  const attempts=n/(percent/100);
  const spent=attempts*(mat+fee);
  const revenue=n*sale;
  if (![attempts,spent,revenue].every(Number.isFinite) || spent>9e15 || revenue>9e15) throw Error('Расчёт слишком велик');
  return { attempts,spent,revenue,profit:revenue-spent,breakEven:spent/n };
}
export function workCalc({runs,minutesPerRun,incomePerRun,costPerRun=0}) {
  const n=integer(runs,'Количество рейсов',1000000,1);const minutes=integer(minutesPerRun,'Минуты',1000000,1);
  const income=integer(incomePerRun,'Доход'); const cost=integer(costPerRun,'Расход');
  const revenue=n*income, spent=n*cost, minutesTotal=n*minutes;
  if (![revenue,spent,minutesTotal].every(Number.isSafeInteger)) throw Error('Расчёт слишком велик');
  return {revenue,spent,profit:revenue-spent,hours:minutesTotal/60,perHour:(income-cost)*60/minutes};
}
export function summarizeEconomy(records) {
  let revenue=0, costs=0, profit=0, deals=0, positive=0, openDeals=0, openCapital=0;
  const series=new Map();
  for(const item of records){const r=cleanRecord(item);if(r.type==='match')continue;
    let inc=0, out=0;
    if(r.type==='deal'){const t=dealTotals(r);if(r.status==='open'){openDeals++;openCapital=checkedSum(openCapital,t.invested);continue;}inc=t.revenue;out=t.invested;deals++;if(t.profit>0)positive++;}
    else if(r.kind==='income')inc=r.amount;else out=r.amount;
    revenue=checkedSum(revenue,inc);costs=checkedSum(costs,out);profit=checkedSum(profit,inc,-out);
    const old=series.get(r.date)||{date:r.date,income:0,expense:0,profit:0};
    old.income=checkedSum(old.income,inc);old.expense=checkedSum(old.expense,out);old.profit=checkedSum(old.profit,inc,-out);
    series.set(r.date,old);
  }
  return {revenue,costs,profit,deals,positive,openDeals,openCapital,days:[...series.values()].sort((a,b)=>a.date.localeCompare(b.date))};
}
export function summarizeMatches(records, field='player') {
  if(!['player','family'].includes(field)) throw Error('Неизвестная группировка');
  const groups=new Map();
  for(const input of records){const r=cleanRecord(input);if(r.type!=='match')continue;
    const name=(r[field]||'Без семьи').trim();const key=name.toLocaleLowerCase('ru');
    const row=groups.get(key)||{name,matches:0,wins:0,losses:0,draws:0,kills:0,deaths:0,damage:0};
    row.matches++;row.wins+=+(r.result==='win');row.losses+=+(r.result==='loss');row.draws+=+(r.result==='draw');
    row.kills+=r.kills;row.deaths+=r.deaths;row.damage+=r.damage;groups.set(key,row);
  }
  return [...groups.values()].map(r=>({...r,winRate:100*r.wins/r.matches,kd:r.deaths>0?r.kills/r.deaths:r.kills,avgDamage:r.damage/r.matches})).sort((a,b)=>b.wins-a.wins||b.damage-a.damage||a.name.localeCompare(b.name,'ru'));
}
export function validateRecords(records, profileIds=null) {
  if (!Array.isArray(records)||records.length>MAX_RECORDS) throw Error('Слишком много записей');
  const ids=new Set();return records.map(value=>{const r=cleanRecord(value);if(ids.has(r.id))throw Error('Повторяющиеся ID');ids.add(r.id);
    if(profileIds && !profileIds.includes(r.profileId))throw Error('Запись относится к отсутствующему профилю');return r;});
}
export const formatCurrency = n => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n)+' $';
// CSV output must prevent spreadsheet-formula injection when opened in Google Sheets/Excel.
export function toCsv(records,type){
  if(!TYPES.includes(type))throw Error('Неверный тип CSV');
  const keys=type==='deal' ? ['date','title','category','status','quantity','buyPrice','salePrice','buyFee','saleFee','note'] : type==='cash' ? ['date','kind','title','amount','note'] : ['date','player','family','opponent','mode','result','kills','deaths','damage','note'];
  const items=records.map(cleanRecord).filter(r=>r.type===type);
  const quoted = value => {let s=String(value??'');if(/^[\s\x00-\x1f]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return '\uFEFF'+[keys.map(quoted).join(';'),...items.map(r=>keys.map(k=>quoted(r[k])).join(';'))].join('\r\n')+'\r\n';
}
