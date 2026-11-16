import {getActiveProfile} from '../lib/model.mjs';
import {listRules} from '../lib/rules-store.mjs';
import {listTemplates} from '../lib/forum-store.mjs';
import {listCases} from '../lib/complaints-store.mjs';
import {loadCalculator,listCalculatorDrafts} from '../lib/punishment-calculator-store.mjs';
import {searchRules,currentRevision} from '../lib/rules-core.mjs';
import {assertCaseScope} from '../lib/moderation-core.mjs';
import {api} from '../lib/browser.mjs';
import {loadState} from '../lib/state.mjs';
export const RULES_TABS=['overview','library','calculator'];
export function initialRulesTab(params){if(RULES_TABS.includes(params.get('rulesTab')))return params.get('rulesTab');if(params.get('rule'))return 'library';if(params.get('calculator')==='1'||params.get('caseId')||params.get('thread'))return 'calculator';return 'overview';}
export function rulesExperienceSnapshot(profile,rows,templates,cases,calculator,drafts){
 const rules=searchRules(rows,{profileId:profile.id,project:profile.project,server:profile.server});
 return {rules,reviewed:rules.filter(r=>currentRevision(r).verification==='reviewed').length,templates:templates.filter(t=>t.profileId===profile.id&&t.legacy),cases:cases.filter(c=>{try{assertCaseScope(c,profile);return c.status!=='done';}catch{return false;}}),history:calculator.history,drafts,policy:calculator.policy};
}
export function mountRulesExperience(root,state,feedback){
 if(!root)return;const doc=root.ownerDocument,profile=getActiveProfile(state),params=new URLSearchParams(location.search);let tab=initialRulesTab(params),epoch=0;
 const panels={overview:root.querySelector('#rules-overview'),library:root.querySelector('#rules-root'),calculator:root.querySelector('#punishment-calculator')};
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const btn=(label,fn)=>{const b=el('button',label,'button secondary');b.type='button';b.addEventListener('click',fn);return b;};
 function show(next,persist=true){if(!RULES_TABS.includes(next))return;tab=next;if(persist){const url=new URL(location.href);url.searchParams.set('rulesTab',next);history.replaceState(null,'',url);}for(const [k,n] of Object.entries(panels))n.hidden=k!==next;for(const b of root.querySelectorAll('[data-rules-tab]')){b.setAttribute('aria-pressed',String(b.dataset.rulesTab===next));b.classList.toggle('primary',b.dataset.rulesTab===next);b.classList.toggle('secondary',b.dataset.rulesTab!==next);}if(next==='overview')void refresh();}
 async function openCase(c){try{const p=getActiveProfile(await loadState());if(p.id!==profile.id||p.project!==profile.project||p.server!==profile.server)throw Error('Профиль изменился');const cases=await listCases(),latest=cases.find(x=>x.id===c.id);assertCaseScope(latest,p);await api.tabs.create({url:api.runtime.getURL('ui/workspace.html?calculator=1&calcProfile='+encodeURIComponent(p.id)+'&caseId='+encodeURIComponent(c.id)+'#rules')});}catch(e){feedback(e.message,true);}}
 async function refresh(){const seq=++epoch,target=panels.overview;try{const values=await Promise.all([listRules(),listTemplates(),listCases(),loadCalculator(profile),listCalculatorDrafts(profile)]);if(!root.isConnected||seq!==epoch)return;const d=rulesExperienceSnapshot(profile,...values);target.replaceChildren();const header=el('section',undefined,'card stack');header.append(el('h3','Rules & Punishments'),el('p',profile.name+' · '+profile.server,'subtle'),el('p','Локальная подготовка решений. Наказания и сообщения не отправляются автоматически.','subtle'));const grid=el('div',undefined,'rules-hub-grid');for(const [name,value,action] of [['Правила',d.rules.length,()=>show('library')],['Проверено пользователем',d.reviewed,()=>show('library')],['Связанные бинды',d.templates.length,()=>{const b=root.querySelector('#rules-root [data-action=nav][data-view=forum]');if(b)b.click();else feedback('Библиотека ещё загружается',true);}],['Черновики тем',d.drafts.length,()=>show('calculator')],['Расчёты в истории',d.history.length,()=>show('calculator')],['Открытые жалобы',d.cases.length,()=>{doc.querySelector('.nav [data-view=complaints]')?.click();}]]){const b=btn(name+' · '+value,action);grid.append(b);}header.append(grid,btn('Обновить сводку',()=>void refresh()));target.append(header);
 const favorites=el('section',undefined,'card stack');favorites.append(el('h3','Избранные правила'));const fav=d.rules.filter(r=>r.favorite).slice(0,8);if(!fav.length)favorites.append(el('p','Нет избранных правил.','subtle'));for(const r of fav){const x=currentRevision(r);favorites.append(btn(x.code+' — '+x.title,()=>{show('library');const q=root.querySelector('#rules-query');if(q){q.value=x.code;q.dispatchEvent(new Event('input',{bubbles:true}));}root.querySelector('#rules-list [data-id="'+r.id+'"][data-rules-action=open]')?.click();}));}target.append(favorites);
 const work=el('section',undefined,'card stack');work.append(el('h3','Продолжить рассмотрение'));for(const c of d.cases.filter(c=>c.moderation).slice(0,8))work.append(btn(c.title+' · '+(c.moderation.status==='draft'?'Черновик':c.moderation.status==='reviewed'?'Проверено':'Расчёт'),()=>void openCase(c)));if(!d.cases.some(c=>c.moderation))work.append(el('p','Нет сохранённых рассмотрений.','subtle'));work.append(el('p','Политика: '+d.policy.name,'subtle'),btn('Открыть калькулятор',()=>show('calculator')));target.append(work);
 }catch(e){if(root.isConnected&&seq===epoch){target.replaceChildren(el('p','Не удалось загрузить сводку: '+e.message,'subtle'),btn('Повторить',()=>void refresh()));}}}
 root.addEventListener('click',e=>{const b=e.target.closest('[data-rules-tab]');if(b)show(b.dataset.rulesTab);});
 root.addEventListener('rules-experience-calculator',ev=>{show('calculator');panels.calculator.dispatchEvent(new CustomEvent('calculator-select-rule',{detail:ev.detail}));});
 root.addEventListener('rules-experience-refresh',()=>{if(tab==='overview')void refresh();});show(tab,false);
}
