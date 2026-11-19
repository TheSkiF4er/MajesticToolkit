/** Live Tactical evidence/document references, not duplicated uploaded files. */
import '../lib/safe-dom.js';
import {escapeHtml as escape} from '../lib/sites.mjs';
import {listTacticalLinks,addTacticalLink,removeTacticalLink,tacticalLinkReferences} from '../lib/tactical-links-store.mjs';
const {replaceHtml}=globalThis.MTSafeDOM;
const caption={territory:'Территория',airdrop:'Аирдроп',plan:'План',simulation:'Симуляция',document:'Документ',evidence:'Доказательство'};
const text=x=>escape(String(x??''));
const option=(value,name)=>`<option value="${text(value)}">${text(name)}</option>`;
export async function mountTacticalLinks(root,state,feedback){
 if(!root)return;
 const profileId=state.activeProfileId,ids=state.profiles.map(p=>p.id);
 try{
  const [links,refs]=await Promise.all([listTacticalLinks(profileId),tacticalLinkReferences(ids)]);
  if(!root.isConnected)return;
  const owned=rows=>rows.filter(x=>x.profileId===profileId);
  const objects=[...owned(refs.territories).map(x=>({value:'territory:'+x.id,label:'Территория · '+(x.name||x.title||x.id)})),...owned(refs.airdropEvents).map(x=>({value:'airdrop:'+x.id,label:'Аирдроп · '+x.title})),...owned(refs.plans).map(x=>({value:'plan:'+x.id,label:'План · '+x.state.title})),...owned(refs.simulations).map(x=>({value:'simulation:'+x.id,label:'Симуляция · '+x.title}))];
  const sources=[...owned(refs.documents).filter(x=>x.type==='document').map(x=>({value:'document:'+x.id,label:'Документ · '+(x.versions.at(-1)?.title||x.id)})),...owned(refs.evidenceVault).map(x=>({value:'evidence:'+x.id,label:'Доказательство · '+x.title}))];
  const names=new Map([...objects,...sources].map(x=>[x.value,x.label]));
  replaceHtml(root,`<section class="card stack"><h3>Связи тактических событий и источников</h3><p class="subtle">Прикрепляйте существующие документы Document Studio и доказательства Evidence Vault к территориям, аирдропам, планам и симуляциям. Содержимое не копируется. Удаление прикреплённого источника будет заблокировано.</p><form id="tactical-link-form" class="stack"><label class="field">Тактический объект<select name="entity" required>${objects.map(x=>option(x.value,x.label)).join('')}</select></label><label class="field">Источник<select name="source" required>${sources.map(x=>option(x.value,x.label)).join('')}</select></label><label class="field">Примечание<input name="note" maxlength="500" placeholder="Пояснение связи"></label><button type="submit" class="button primary" ${!objects.length||!sources.length?'disabled':''}>Прикрепить источник</button></form><h4>Сохранённые связи · ${links.length}</h4><div class="stack">${links.length?links.map(x=>`<article class="economy-hit"><div><strong>${text(names.get(x.entityType+':'+x.entityId)||caption[x.entityType]+' · '+x.entityId)}</strong><p class="subtle">${text(names.get(x.sourceType+':'+x.sourceId)||caption[x.sourceType]+' · '+x.sourceId)}${x.note?' · '+text(x.note):''}</p></div><button type="button" class="button danger" data-tactical-link-remove="${text(x.id)}">Отвязать</button></article>`).join(''):'<p class="subtle">Сохранённых связей пока нет.</p>'}</div></section>`);
  const form=root.querySelector('#tactical-link-form');
  form?.addEventListener('submit',event=>{event.preventDefault();void(async()=>{
   const [entityType,entityId]=form.elements.namedItem('entity').value.split(':');
   const [sourceType,sourceId]=form.elements.namedItem('source').value.split(':');
   await addTacticalLink(profileId,{entityType,entityId,sourceType,sourceId,note:form.elements.namedItem('note').value},ids);
   feedback('Источник прикреплён');await mountTacticalLinks(root,state,feedback);
  })().catch(err=>feedback(err.message,true));});
  root.querySelectorAll('[data-tactical-link-remove]').forEach(button=>button.addEventListener('click',()=>{void removeTacticalLink(profileId,button.dataset.tacticalLinkRemove).then(()=>{feedback('Связь удалена');return mountTacticalLinks(root,state,feedback);}).catch(err=>feedback(err.message,true));}));
 }catch(error){if(root.isConnected)root.textContent='Не удалось загрузить ссылки: '+error.message;}
}
