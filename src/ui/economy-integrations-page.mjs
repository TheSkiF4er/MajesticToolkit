/** User-facing Economy Integrations: document/evidence links and staged CSV/JSON market exchange. */
import {escapeHtml as e} from '../lib/sites.mjs';
import {listMarketplace,appendMarketplaceImport} from '../lib/marketplace-store.mjs';
import {listEconomyLinks,addEconomyLink,removeEconomyLink,economyLinkReferences} from '../lib/economy-links-store.mjs';
import {parseMarketImport,previewMarketImport,verifyImportBaseline,exportMarketData} from '../lib/economy-transfer.mjs';
let current={profileId:'',links:[],refs:null},preview=null;
const download=(name,body,type)=>{const url=URL.createObjectURL(new Blob([body],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);};
export async function refreshEconomyIntegrations(profileIds,activeId){
 const [links,refs]=await Promise.all([listEconomyLinks(activeId),economyLinkReferences(profileIds)]);
 current={profileId:activeId,links,refs};if(preview?.profileId!==activeId)preview=null;
}
const pick=(items,label)=>items.map(r=>`<option value="${e(r.id)}">${e(label(r))}</option>`).join('');
export function economyIntegrationsSection(state){
 const profileId=state.activeProfileId,refs=current.profileId===profileId?current.refs:null,links=current.profileId===profileId?current.links:[],market=refs?.marketplace.filter(r=>r.profileId===profileId&&r.type==='product')??[];
 const entities=[...market.map(r=>({...r,tag:'product',label:'Товар: '+r.name})),...(refs?.families??[]).filter(r=>r.profileId===profileId).map(r=>({...r,tag:'family',label:'Семья: '+r.name})),...(refs?.organizations??[]).filter(r=>r.profileId===profileId).map(r=>({...r,tag:'organization',label:'Организация: '+r.name})),...(refs?.territories??[]).filter(r=>r.profileId===profileId).map(r=>({...r,tag:'territory',label:'Территория: '+r.name}))];
 const sources=[...(refs?.documents??[]).filter(r=>r.profileId===profileId&&r.type==='document').map(r=>({...r,tag:'document',label:'Документ: '+(r.revisions?.at(-1)?.title??r.id)})),...(refs?.evidenceVault??[]).filter(r=>r.profileId===profileId).map(r=>({...r,tag:'evidence',label:'Evidence Vault: '+r.title}))];
 const entityLabel=id=>entities.find(x=>x.id===id)?.label??id,sourceLabel=id=>sources.find(x=>x.id===id)?.label??id;
 return `<section class="card stack" id="economy-integrations"><h3>Economy Integrations & Data Migration · 2.1.9</h3><p class="subtle">Экспортируйте каталог товаров, ценовые наблюдения и объявления в CSV или JSON. Перед импортом выполняется предпросмотр, контроль ссылок на товары и поиск дубликатов. Исходные сделки, финансы и склад остаются без изменений.</p>
 <div class="row"><button type="button" class="button secondary" data-econ-int-action="export" data-format="csv">Экспорт рынка CSV</button><button type="button" class="button secondary" data-econ-int-action="export" data-format="json">Экспорт рынка JSON</button><button type="button" class="button primary" data-econ-int-action="choose">Импорт CSV / JSON</button></div>
 <input id="econ-int-file" type="file" accept=".csv,.json,text/csv,application/json" hidden>
 ${preview?.profileId===profileId?`<div class="card stack" id="econ-import-preview"><h4>Предпросмотр импорта</h4><p>Строк: ${preview.plan.total}; новые товары: ${preview.plan.counts.product}; цены: ${preview.plan.counts.price}; объявления: ${preview.plan.counts.listing}; пропущено дублей: ${preview.plan.counts.skipped}.</p><p class="subtle">Существующие данные не изменены. Файл: ${e(preview.filename)}</p><div class="row"><button type="button" class="button primary" data-econ-int-action="commit">Импортировать ${preview.plan.added.length} записей</button><button type="button" class="button secondary" data-econ-int-action="cancel">Отмена</button></div></div>`:''}</section>
 <section class="card stack"><h3>Связи с документами и доказательствами</h3><p class="subtle">Ссылки по стабильным ID, без копирования файлов из Evidence Vault. Все записи принадлежат текущему RP-профилю.</p>
 ${entities.length&&sources.length?`<form id="econ-int-link-form" class="stack"><label class="field">Объект экономики<select name="entity" required>${entities.map(r=>`<option value="${e(r.tag+':'+r.id)}">${e(r.label)}</option>`).join('')}</select></label><label class="field">Документ или доказательство<select name="source" required>${sources.map(r=>`<option value="${e(r.tag+':'+r.id)}">${e(r.label)}</option>`).join('')}</select></label><label class="field">Причина связи<input name="note" maxlength="500" placeholder="Например, подтверждение покупки"></label><button class="button primary" type="submit">Привязать источник</button></form>`:'<p class="subtle">Для привязки создайте товар, семью, организацию или территорию и документ Document Studio либо материал Evidence Vault.</p>'}
 <div class="stack">${links.length?links.map(r=>`<article class="economy-hit"><div><strong>${e(entityLabel(r.entityId))}</strong><p class="subtle">${e(sourceLabel(r.sourceId))} · ${e(r.note)}</p></div><button type="button" class="button danger" data-econ-int-action="unlink" data-id="${e(r.id)}">Отвязать</button></article>`).join(''):'<p class="subtle">Привязанных материалов нет.</p>'}</div></section>`;
}
export async function handleEconomyIntegrationFile(file,state,render,feedback){
 if(!file||file.size>2*1024*1024)throw Error('Размер файла импорта не должен превышать 2 МиБ');
 const format=file.name.toLowerCase().endsWith('.json')?'json':file.name.toLowerCase().endsWith('.csv')?'csv':null;
 if(!format)throw Error('Для импорта требуется файл CSV или JSON');
 const rows=parseMarketImport(await file.text(),format),market=await listMarketplace();
 preview={profileId:state.activeProfileId,filename:file.name,rows,plan:previewMarketImport(rows,state.activeProfileId,market)};
 render();feedback(`Предпросмотр: ${preview.plan.added.length} новых записей; без изменений в хранилище`);
}
export async function handleEconomyIntegrationAction(button,state,render,feedback){
 const action=button.dataset.econIntAction,profileId=state.activeProfileId;
 if(action==='choose'){document.getElementById('econ-int-file')?.click();return;}
 if(action==='cancel'){preview=null;render();return;}
 if(action==='export'){
  const format=button.dataset.format,market=await listMarketplace(),payload=exportMarketData(market,profileId,format);
  download(`majestic-market-${new Date().toISOString().slice(0,10)}.${format}`,payload,format==='csv'?'text/csv;charset=utf-8':'application/json;charset=utf-8');feedback('Данные рынка выгружены');return;
 }
 if(action==='commit'){
  if(!preview||preview.profileId!==profileId)throw Error('Предпросмотр импорта отсутствует');
  const market=await listMarketplace();verifyImportBaseline(preview.plan,market);
  const next=previewMarketImport(preview.rows,profileId,market);
  if(next.added.length)await appendMarketplaceImport(next.added,preview.plan.baseline,state.profiles.map(p=>p.id));
  preview=null;await refreshEconomyIntegrations(state.profiles.map(p=>p.id),profileId);render();feedback(`Импортировано ${next.added.length} записей рынка`);return;
 }
 if(action==='unlink'){
  if(!confirm('Отвязать документ/доказательство от экономического объекта?'))return;
  await removeEconomyLink(profileId,button.dataset.id);await refreshEconomyIntegrations(state.profiles.map(p=>p.id),profileId);render();feedback('Связь удалена');return;
 }
}
export async function handleEconomyIntegrationSubmit(form,state,render,feedback){
 const data=Object.fromEntries(new FormData(form).entries()),[entityType,entityId]=String(data.entity??'').split(':'),[sourceType,sourceId]=String(data.source??'').split(':');
 await addEconomyLink(state.activeProfileId,{entityType,entityId,sourceType,sourceId,note:data.note??''},state.profiles.map(p=>p.id));
 await refreshEconomyIntegrations(state.profiles.map(p=>p.id),state.activeProfileId);render();feedback('Источник привязан к объекту');
}
