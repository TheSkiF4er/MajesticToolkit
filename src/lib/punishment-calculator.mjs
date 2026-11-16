import {currentRevision,searchRules,SANCTIONS,UNITS,ruleSource} from './rules-core.mjs';
// Calculation policies are explicit, local, and never inferred from legacy calcSettings.
const TYPES=Object.keys(SANCTIONS), units=['minutes','hours','days','none'];
const int=(n,min=1,max=1000000)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const text=(v,max)=>{if(typeof v!=='string'||v.length>max)throw Error('Некорректное текстовое поле');return v.trim();};
export const defaultPolicy=()=>({mode:'manual',name:'Ручная проверка',source:'',strategies:{},conversion:null});
export function validatePolicy(p,project){
 if(!p||!['manual','custom','reviewed'].includes(p.mode))throw Error('Некорректная политика');
 const name=text(p.name,120);if(!name)throw Error('Введите название политики');
 const source=p.source?ruleSource(p.source,project):'';if(p.mode==='reviewed'&&!source)throw Error('Для проверенной пользователем политики нужен источник');
 const strategies={};for(const [type,s] of Object.entries(p.strategies||{})){
  if(!TYPES.includes(type)||!s||!['sum','max','manual'].includes(s.method)||!(s.cap===null||int(s.cap)))throw Error('Некорректная стратегия объединения');
  if(s.cap!==null&&(!units.includes(s.unit)||s.unit==='none'||s.method==='manual'))throw Error('Для ограничения нужна единица и метод объединения');
  strategies[type]={method:s.method,cap:s.cap,unit:s.cap===null?null:s.unit};
 }
 let conversion=null;if(p.conversion!=null){const c=p.conversion;if(c.from!=='demorgan'||c.to!=='ban'||!int(c.threshold)||!int(c.step)||!int(c.days)||!int(c.baseDays))throw Error('Некорректная формула преобразования');conversion={from:'demorgan',to:'ban',threshold:c.threshold,step:c.step,days:c.days,baseDays:c.baseDays};}
 if(p.mode==='manual'&&(Object.keys(strategies).length||conversion))throw Error('Ручная политика не выполняет преобразования');
 return {mode:p.mode,name,source,strategies,conversion};
}
export function eligibleRules(rows,profile){return searchRules(rows,{profileId:profile.id,project:profile.project,server:profile.server}).filter(r=>currentRevision(r).sanctions.length);}
export function calculatePunishments(players,rows,profile,inputPolicy){
 const policy=validatePolicy(inputPolicy,profile.project),rules=eligibleRules(rows,profile);
 if(!Array.isArray(players)||!players.length||players.length>20)throw Error('От 1 до 20 участников');
 const ids=new Set();let totalItems=0;
 const results=players.map(p=>{
  const id=text(p.id,80),nickname=text(p.nickname??'',120);if(!id||ids.has(id.toLowerCase()))throw Error('Укажите уникальный ID участника');ids.add(id.toLowerCase());
  if(!Array.isArray(p.items)||!p.items.length||p.items.length>40||(totalItems+=p.items.length)>200)throw Error('От 1 до 40 нарушений на участника, до 200 на расчёт');
  const entries=[],seen=new Set(),counts=new Map();
  for(const item of p.items){const r=rules.find(x=>x.id===item.ruleId),rev=r&&currentRevision(r);if(!rev||rev.id!==item.revisionId)throw Error('Правило недоступно или редакция изменилась');
   if(!int(item.index,0,19)||!rev.sanctions[item.index])throw Error('Неизвестная санкция');const s=rev.sanctions[item.index];
   if(s.unit==='none'?item.amount!==null:!int(item.amount,s.min,s.max))throw Error('Срок вне допустимого диапазона');
   const key=r.id+':'+item.index;if(seen.has(key))throw Error('Повторный выбор одной санкции');seen.add(key);counts.set(r.id,(counts.get(r.id)||0)+1);
   entries.push({ruleId:r.id,revisionId:rev.id,index:item.index,code:rev.code,title:rev.title,source:rev.sourceUrl,verification:rev.verification,conditions:rev.conditions,condition:s.condition,type:s.type,unit:s.unit,amount:item.amount});
  }
  if([...counts.values()].some(n=>n>1)&&p.allowCombined!==true)throw Error('Подтвердите совместимость нескольких санкций одного правила');
  const warnings=[],steps=[],groups=new Map();
  if(policy.mode!=='reviewed')warnings.push('Политика не подтверждена пользователем по источнику.');
  if(entries.some(e=>e.verification!=='reviewed'))warnings.push('Есть непроверенные редакции правил.');
  if(entries.some(e=>e.condition||e.conditions))warnings.push('Проверьте условия и исключения каждого правила.');
  if([...counts.values()].some(n=>n>1))warnings.push('Совместимость санкций подтверждена вручную; проверьте источник.');
  for(const e of entries){const k=e.type+':'+e.unit;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e.amount);}
  const totals=[];let unresolved=false;
  for(const [k,values] of groups){const [type,unit]=k.split(':'),strategy=policy.strategies[type],method=policy.mode==='manual'?'manual':strategy?.method||'manual';
   if(method==='manual'&&values.length>1){unresolved=true;warnings.push(`${SANCTIONS[type]}: требуется выбор политики объединения.`);}
   const amount=unit==='none'?(method==='max'?1:values.length):method==='max'?Math.max(...values):values.reduce((a,b)=>a+b,0);
   steps.push(`${SANCTIONS[type]} (${UNITS[unit]}): ${values.map(v=>v??1).join(method==='max'?', ':' + ')} → ${amount} [${method==='max'?'maximum':method==='sum'?'sum':'промежуточно'}]`);
   totals.push({type,unit,amount,resolved:method!=='manual'||values.length===1});
  }
  // Different units are never implicitly combined; WARN is a count, not duration.
  for(const type of TYPES)if(totals.filter(t=>t.type===type).length>1){unresolved=true;warnings.push(`${SANCTIONS[type]}: разные единицы; требуется ручное решение.`);}
  const c=policy.conversion;
  if(c){const d=totals.find(t=>t.type==='demorgan'&&t.unit==='minutes');if(d&&d.amount>=c.threshold){
   const ban=totals.find(t=>t.type==='ban'&&t.unit==='days');
   if(!d.resolved||totals.some(t=>t.type==='demorgan'&&t.unit!=='minutes')||totals.some(t=>t.type==='ban'&&t.unit!=='days')||(ban&&(!ban.resolved||!['sum','max'].includes(policy.strategies.ban?.method)))){unresolved=true;warnings.push('Преобразование Demorgan → Ban не выполнено: неоднозначная политика или единицы.');}
   else{const converted=c.baseDays+Math.floor((d.amount-c.threshold)/c.step)*c.days;if(converted<1)throw Error('Формула преобразования даёт нулевой срок');steps.push(`Преобразование: ${d.amount} мин. → ${c.baseDays} + floor((${d.amount} − ${c.threshold}) / ${c.step}) × ${c.days} = ${converted} дн. Ban`);totals.splice(totals.indexOf(d),1);if(ban)ban.amount=policy.strategies.ban.method==='max'?Math.max(ban.amount,converted):ban.amount+converted;else totals.push({type:'ban',unit:'days',amount:converted,resolved:true});}
  }}
  for(const t of totals){const s=policy.strategies[t.type];if(s?.cap!==null&&s?.cap!==undefined){if(s.unit!==t.unit||!t.resolved){unresolved=true;warnings.push('Ограничение '+SANCTIONS[t.type]+' не применено: единицы или метод не совпадают.');}else if(t.amount>s.cap){steps.push(`${SANCTIONS[t.type]}: предел ${s.cap} ${UNITS[t.unit]}, ${t.amount} → ${s.cap}`);t.amount=s.cap;}}}
  if(totals.some(t=>t.type==='ban')&&totals.some(t=>t.type==='hardban')){unresolved=true;warnings.push('Ban и HardBan не объединяются автоматически.');}
  return {id,nickname,entries,totals,steps,warnings,unresolved};
 });
 return {policy,profileId:profile.id,project:profile.project,server:profile.server,players:results,createdAt:new Date().toISOString()};
}
export function calculationText(result){return ['Черновик расчёта санкций — не назначение наказания',`Политика: ${result.policy.name} (${result.policy.mode==='reviewed'?'проверена пользователем':result.policy.mode==='custom'?'пользовательская':'ручная'})${result.policy.source?'\nИсточник политики: '+result.policy.source:''}`, ...result.players.map(p=>[`Участник ${p.id}${p.nickname?' — '+p.nickname:''}`, ...p.entries.map(e=>`${e.code} — ${e.title}: ${SANCTIONS[e.type]}${e.unit==='none'?'':` ${e.amount} ${UNITS[e.unit]}`}\nИсточник: ${e.source}\nРедакция: ${e.revisionId}${e.conditions?'\nУсловия: '+e.conditions:''}${e.condition?'\nУсловие санкции: '+e.condition:''}`),...p.steps,`Результат (${p.unresolved?'не завершён, ручная проверка':'предварительный'}): ${p.totals.map(t=>`${SANCTIONS[t.type]} ${t.amount}${t.unit==='none'?' шт.':' '+UNITS[t.unit]}`).join('; ')}`,...p.warnings].join('\n')), 'Публикация и назначение только вручную.'].join('\n\n');}
