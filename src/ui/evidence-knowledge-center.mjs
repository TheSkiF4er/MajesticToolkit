/** Integrated Evidence & Knowledge workspace. All tabs reuse the production
 * complaint, vault, knowledge, graph and dossier modules; no secondary stores. */
import {getActiveProfile} from '../lib/model.mjs';
import {modifyState,loadState} from '../lib/state.mjs';
import {listCases} from '../lib/complaints-store.mjs';
import {listSources} from '../lib/source-library.mjs';
import {loadKnowledge} from '../lib/knowledge-store.mjs';
import {listVault} from '../lib/evidence-vault.mjs';
import {exportRegistryData} from '../lib/punishment-registry-store.mjs';
import {EVIDENCE_TABS,EVIDENCE_PERIODS,cleanEvidenceKnowledge} from '../lib/evidence-knowledge-prefs.mjs';
import {mountEvidenceVault} from './evidence-vault-page.mjs';
import {mountSectionMonitor} from './section-monitor-page.mjs';
import {focusComplaintCase} from './complaints-page.mjs';
import {openCaseDossier} from './case-dossier-page.mjs';
import {escapeHtml as e} from '../lib/sites.mjs';

const NAMES={overview:'Обзор',vault:'Материалы',timeline:'Таймлайны и дела',library:'Центр знаний',graph:'Граф и цитаты',dossier:'Досье и экспорт'};
const scope=(row,p)=>row.profileId===p.id&&(!row.project||row.project===p.project)&&(!row.server||row.server===p.server);
const isoMs=iso=>{const x=Date.parse(iso??'');return Number.isFinite(x)?x:0;};
export function evidenceKnowledgeSnapshot(profile,cases,vault,sources,knowledge,registry,{days=30,now=Date.now()}={}){
 if(!EVIDENCE_PERIODS.includes(days))throw Error('Некорректный период');
 const own=cases.filter(c=>c.profileId===profile.id&&(!c.moderation||scope(c.moderation,profile)));
 const ownSources=sources.filter(s=>s.profileId===profile.id);
 const ownVault=vault.filter(v=>v.profileId===profile.id);
 const graph=knowledge.evidenceGraph??{quotes:[],links:[]};
 const quotes=graph.quotes.filter(x=>x.profileId===profile.id),links=graph.links.filter(x=>x.profileId===profile.id);
 const collections=(knowledge.collections??[]).filter(x=>x.profileId===profile.id);
 const records=registry.records.filter(r=>scope(r,profile));
 const recent=own.filter(c=>isoMs(c.updatedAt)>=now-days*86400000).sort((a,b)=>isoMs(b.updatedAt)-isoMs(a.updatedAt)).slice(0,8);
 const files=new Set(ownVault.filter(x=>x.kind==='file').map(x=>x.id));
 const referenced=own.flatMap(c=>c.evidence.filter(x=>x.kind==='file'&&x.vaultId));
 const missing=referenced.filter(x=>!files.has(x.vaultId));
 return {profileId:profile.id,days,cases:own.length,events:own.reduce((n,c)=>n+c.timeline.length,0),evidence:own.reduce((n,c)=>n+c.evidence.length,0),vault:ownVault.length,localFiles:files.size,missing:missing.length,sources:ownSources.length,revisions:ownSources.reduce((n,s)=>n+(s.revisions?.length??0),0),collections:collections.length,quotes:quotes.length,links:links.length,decisions:records.length,recent,referenced:referenced.length,sourceRows:ownSources.slice().sort((a,b)=>isoMs(b.capturedAt)-isoMs(a.capturedAt)).slice(0,5)};
}
export function evidenceKnowledgeSection(state,complaintsHtml,knowledgeHtml){
 const p=getActiveProfile(state);
 return `<div class="stack ek-center" id="evidence-knowledge-center"><section class="card stack ek-intro"><div class="row spread"><div><h3>Evidence & Knowledge · 1.9.0</h3><p class="lead">Материалы, события, редакции источников, цитаты и досье — единое локальное рабочее пространство.</p></div><span class="tag">${e(p.name)} · ${e(p.server)}</span></div><p class="subtle">Связи и статусы проверки — утверждения пользователя. SHA-256 удостоверяет целостность локального файла, а не достоверность содержания.</p><nav class="ek-tabs" aria-label="Разделы Evidence & Knowledge" role="tablist">${EVIDENCE_TABS.map(t=>`<button type="button" role="tab" class="button secondary" data-ek-tab="${t}" aria-controls="ek-panel-${t}" aria-selected="false">${e(NAMES[t])}</button>`).join('')}</nav></section>
 <div id="ek-panel-overview" role="tabpanel" data-ek-panel="overview"><section class="card stack" id="ek-summary" aria-live="polite">Загрузка локальных материалов…</section></div>
 <div id="ek-panel-vault" role="tabpanel" data-ek-panel="vault"><div id="ek-vault-slot"></div></div>
 <div id="ek-panel-timeline" role="tabpanel" data-ek-panel="timeline">${complaintsHtml}</div>
 <div id="ek-panel-library" role="tabpanel" data-ek-panel="library">${knowledgeHtml}</div>
 <div id="ek-panel-graph" role="tabpanel" data-ek-panel="graph"><div id="ek-graph-slot"></div></div>
 <div id="ek-panel-dossier" role="tabpanel" data-ek-panel="dossier"><section class="card stack" id="ek-dossier-list">Загрузка досье…</section></div></div>`;
}
export function mountEvidenceKnowledge(root,state,feedback,onCaseChange=async()=>{}){
 if(!root)return;
 const profile=getActiveProfile(state),prefs=cleanEvidenceKnowledge(profile.evidenceKnowledge);
 const vaultSlot=root.querySelector('#ek-vault-slot'),graphSlot=root.querySelector('#ek-graph-slot');
 const vaultRoot=root.querySelector('#evidence-vault-root'),graphRoot=root.querySelector('#evidence-knowledge-graph');
 if(!vaultSlot||!graphSlot||!vaultRoot||!graphRoot)throw Error('Не найдены рабочие модули Evidence & Knowledge');
 vaultSlot.append(vaultRoot);graphSlot.append(graphRoot);
 const monitor=root.querySelector('#section-monitor-root');if(monitor)mountSectionMonitor(monitor,state,feedback);
 // The Vault only receives the current profile; no external server is contacted.
 void mountEvidenceVault(vaultRoot,state,feedback,onCaseChange).catch(err=>{if(vaultRoot.isConnected){vaultRoot.textContent='Локальное хранилище недоступно: '+err.message;}});
 const doc=root.ownerDocument,summary=root.querySelector('#ek-summary'),dossier=root.querySelector('#ek-dossier-list');
 let tab,days=prefs.days,caseId=prefs.caseId,epoch=0;
 const el=(tag,content,cls)=>{const node=doc.createElement(tag);if(content!==undefined)node.textContent=String(content);if(cls)node.className=cls;return node;};
 const button=(caption,fn)=>{const node=el('button',caption,'button secondary');node.type='button';node.addEventListener('click',fn);return node;};
 const latestProfile=async()=>{const current=getActiveProfile(await loadState());if(current.id!==profile.id||current.project!==profile.project||current.server!==profile.server)throw Error('Активный профиль изменился');return current;};
 async function persist(patch){await modifyState(s=>{const current=getActiveProfile(s);if(current.id!==profile.id||current.project!==profile.project||current.server!==profile.server)throw Error('Профиль изменился');return {...s,profiles:s.profiles.map(p=>p.id===profile.id?{...p,evidenceKnowledge:cleanEvidenceKnowledge({...cleanEvidenceKnowledge(p.evidenceKnowledge),...patch})}:p)};});}
 const url=new URL(location.href),fromUrl=url.searchParams.get('evidenceTab'),requestedCase=url.searchParams.get('evidenceCase');
 tab=EVIDENCE_TABS.includes(fromUrl)?fromUrl:prefs.tab;
 if(requestedCase&&/^[\w-]{8,128}$/.test(requestedCase))caseId=requestedCase;
 async function verifyCase(id){await latestProfile();return (await listCases()).find(c=>c.id===id&&c.profileId===profile.id&&(!c.moderation||scope(c.moderation,profile)))??null;}
 async function openCase(id,target='timeline'){
  const c=await verifyCase(id);if(!c)throw Error('Жалоба не относится к активному профилю');caseId=c.id;show(target);void persist({caseId:c.id}).catch(err=>feedback(err.message,true));
  if(target==='timeline'){focusComplaintCase(c.id);root.querySelector('[data-case-card][data-id="'+CSS.escape(c.id)+'"]')?.scrollIntoView?.({block:'nearest'});}
  if(target==='graph'){const field=root.querySelector('#knowledge-graph-case-filter');if(field){field.value=c.id;field.dispatchEvent(new Event('change',{bubbles:true}));}}
 }
 function show(next,save=true){
  if(!EVIDENCE_TABS.includes(next))throw Error('Недоступная вкладка Evidence & Knowledge');tab=next;
  for(const t of EVIDENCE_TABS){const panel=root.querySelector('#ek-panel-'+t),control=root.querySelector('[data-ek-tab="'+t+'"]');panel.hidden=t!==next;control.setAttribute('aria-selected',String(t===next));control.classList.toggle('primary',t===next);control.classList.toggle('secondary',t!==next);control.tabIndex=t===next?0:-1;}
  if(save){const locationUrl=new URL(location.href);locationUrl.searchParams.set('evidenceTab',next);if(caseId)locationUrl.searchParams.set('evidenceCase',caseId);history.replaceState(null,'',locationUrl.href);void persist({tab:next,caseId}).catch(err=>feedback(err.message,true));}
  if(next==='overview')void refresh();if(next==='dossier')void refreshDossier();
 }
 async function getData(){await latestProfile();const [cases,sources,knowledge,registry,vaultResult]=await Promise.all([listCases(),listSources(),loadKnowledge(state.profiles.map(p=>p.id)),exportRegistryData(state.profiles),listVault(profile.id).then(items=>({items,error:null}),error=>({items:[],error:error.message}))]);return {cases,sources,knowledge,registry,vault:vaultResult.items,vaultError:vaultResult.error};}
 const actions=[['Открыть материалы','vault'],['Открыть таймлайны','timeline'],['Библиотека источников','library'],['Связи и цитаты','graph'],['Досье и экспорт','dossier']];
 async function refresh(){const token=++epoch;try{const data=await getData();if(!root.isConnected||token!==epoch)return;const snap=evidenceKnowledgeSnapshot(profile,data.cases,data.vault,data.sources,data.knowledge,data.registry,{days});summary.replaceChildren();
   const heading=el('div',undefined,'row spread'),info=el('div');info.append(el('h3','Сводка Evidence & Knowledge'),el('p',profile.name+' · '+profile.server,'subtle'));heading.append(info);
   const select=el('select');select.setAttribute('aria-label','Период активности');for(const d of EVIDENCE_PERIODS){const opt=el('option',d+' дней');opt.value=String(d);opt.selected=d===days;select.append(opt);}select.addEventListener('change',()=>{days=Number(select.value);void persist({days}).catch(err=>feedback(err.message,true));void refresh();});heading.append(select);summary.append(heading);
   const metrics=el('div',undefined,'ek-metrics');for(const [caption,count,target] of [['Дела',snap.cases,'timeline'],['Доказательства в делах',snap.evidence,'timeline'],['Материалы Vault',snap.vault,'vault'],['События таймлайнов',snap.events,'timeline'],['Источники и редакции',snap.sources+snap.revisions,'library'],['Коллекции',snap.collections,'library'],['Цитаты',snap.quotes,'graph'],['Связи графа',snap.links,'graph'],['Решения реестра',snap.decisions,'dossier']]){const metric=el('button',undefined,'ek-metric');metric.type='button';metric.append(el('strong',count),el('span',caption));metric.addEventListener('click',()=>show(target));metrics.append(metric);}summary.append(metrics);
   if(data.vaultError){const warning=el('p','Не удалось проверить IndexedDB: '+data.vaultError+'. Сводка файлов неполная.', 'ek-integrity-warning');warning.setAttribute('role','status');summary.append(warning);}
   else if(snap.missing){const warning=el('p',`Недоступные локальные файлы, упомянутые в жалобах: ${snap.missing}. Проверяйте переносимый ZIP Backup v17.`, 'ek-integrity-warning');warning.setAttribute('role','status');summary.append(warning);}
   const quick=el('div',undefined,'row wrap');for(const [label,t] of actions)quick.append(button(label,()=>show(t)));summary.append(quick);
   const lists=el('div',undefined,'ek-overview-lists'),recent=el('section',undefined,'card stack');recent.append(el('h4','Последние изменённые дела'));for(const c of snap.recent)recent.append(button(`${c.title} · ${c.timeline.length} событий · ${c.evidence.length} доказательств`,()=>{void openCase(c.id).catch(err=>feedback(err.message,true));}));if(!snap.recent.length)recent.append(el('p','Новых изменений за выбранный период нет.','subtle'));lists.append(recent);
   const sources=el('section',undefined,'card stack');sources.append(el('h4','Последние сохранённые источники'));for(const row of snap.sourceRows)sources.append(button(`${row.title} · ${row.revisions?.length??0} старых редакций`,()=>show('library')));if(!snap.sourceRows.length)sources.append(el('p','Импортированных источников нет.','subtle'));lists.append(sources);summary.append(lists);
  }catch(err){if(root.isConnected&&token===epoch){summary.replaceChildren(el('p','Не удалось загрузить сводку: '+err.message,'subtle'),button('Повторить',()=>void refresh()));}}}
 async function refreshDossier(){const token=++epoch;try{const data=await getData();if(!root.isConnected||token!==epoch)return;const own=data.cases.filter(c=>c.profileId===profile.id&&(!c.moderation||scope(c.moderation,profile))).sort((a,b)=>isoMs(b.updatedAt)-isoMs(a.updatedAt));dossier.replaceChildren(el('h3','Досье и экспорт'),el('p','Выберите дело, проверьте состав материалов и экспортируйте JSON, TXT, HTML, BBCode или ZIP с вложениями.','subtle'));
  const filter=el('input');filter.type='search';filter.placeholder='Название, ссылка, участник или ID дела';filter.maxLength=180;filter.setAttribute('aria-label','Поиск досье');dossier.append(filter);
  const count=el('p',undefined,'subtle'),results=el('div',undefined,'stack');dossier.append(count,results);
  function draw(){const q=filter.value.toLocaleLowerCase('ru').trim();const filtered=own.filter(c=>!q||`${c.id} ${c.title} ${c.url} ${c.note} ${c.moderation?.players?.map(p=>p.id+' '+(p.nickname??'')).join(' ')??''}`.toLocaleLowerCase('ru').includes(q));count.textContent=`Найдено дел: ${filtered.length}. Показано: ${Math.min(filtered.length,100)}.`;results.replaceChildren();
   for(const c of filtered.slice(0,100)){const card=el('article',undefined,'ek-dossier-row');const title=el('div');title.append(el('strong',c.title),el('p',`${c.timeline.length} событий · ${c.evidence.length} доказательств · ${c.status==='done'?'завершено':'в работе'}`,'subtle'));card.append(title);const buttons=el('div',undefined,'row wrap');buttons.append(button('Таймлайн',()=>void openCase(c.id).catch(err=>feedback(err.message,true))),button('Цитаты и связи',()=>void openCase(c.id,'graph').catch(err=>feedback(err.message,true))),button('Досье и экспорт',()=>{void (async()=>{if(!await verifyCase(c.id))throw Error('Дело недоступно');await openCaseDossier(state,c.id,feedback);})().catch(err=>feedback(err.message,true));}));card.append(buttons);results.append(card);}
   if(!filtered.length)results.append(el('p','По запросу не найдены жалобы.','subtle'));
  }
  filter.addEventListener('input',draw);draw();
 }catch(err){if(root.isConnected&&token===epoch)dossier.replaceChildren(el('p','Не удалось открыть досье: '+err.message,'subtle'),button('Повторить',()=>void refreshDossier()));}}
 root.addEventListener('click',event=>{const control=event.target.closest('[data-ek-tab]');if(control&&root.contains(control)){event.preventDefault();event.stopPropagation();show(control.dataset.ekTab);}});
 root.addEventListener('keydown',event=>{const control=event.target.closest('[data-ek-tab]');if(!control||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const i=EVIDENCE_TABS.indexOf(control.dataset.ekTab),index=event.key==='Home'?0:event.key==='End'?EVIDENCE_TABS.length-1:(i+(event.key==='ArrowRight'?1:-1)+EVIDENCE_TABS.length)%EVIDENCE_TABS.length;show(EVIDENCE_TABS[index]);root.querySelector('[data-ek-tab="'+EVIDENCE_TABS[index]+'"]').focus();});
 root.addEventListener('evidence-refresh',()=>{if(tab==='overview')void refresh();if(tab==='dossier')void refreshDossier();});
 show(tab,false);if(caseId&&tab==='timeline')void openCase(caseId,'timeline').catch(err=>feedback(err.message,true));
}
