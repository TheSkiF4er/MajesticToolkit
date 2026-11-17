/** Evidence Vault UI: extension-only local files; no external uploads. */
import {addVaultFile,addVaultLink,listVault,downloadVaultFile,verifyVaultFile,getVaultRecord,deleteVaultRecord,editVaultMetadata,VAULT_LIMITS} from '../lib/evidence-vault.mjs';
import {listCases} from '../lib/complaints-store.mjs';
import {api} from '../lib/browser.mjs';
import {escapeHtml as e} from '../lib/sites.mjs';
const date=iso=>new Date(iso).toLocaleString('ru-RU');
const esc=v=>e(String(v??''));
export async function mountEvidenceVault(root,state,feedback,onAttached){
 if(!root)return;
 const profileId=state.activeProfileId;
 root.innerHTML=`<section class="card stack evidence-vault"><div class="row spread"><div><h3>Evidence Vault 2.0 · локальные материалы</h3><p class="subtle">Файлы хранятся в IndexedDB на этом устройстве, SHA-256 проверяется перед скачиванием и прикреплением. Ссылки сохраняются без загрузки содержимого сайта.</p></div><span class="tag">1.8.1</span></div>
 <div class="grid"><form id="vault-upload-form" class="stack"><strong>Добавить файл</strong><label>Название<input name="title" maxlength="180" placeholder="Необязательно"></label><label>Файл (до 32 МиБ)<input name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,video/mp4,video/webm,.docx,.xlsx" required></label><label>Комментарий<input name="note" maxlength="1000"></label><button type="submit" class="button primary">Сохранить локально</button></form>
 <form id="vault-link-form" class="stack"><strong>Добавить ссылку</strong><label>Название<input name="title" required maxlength="180"></label><label>HTTPS-ссылка<input name="url" type="url" required maxlength="2048"></label><label>Таймкод, секунды<input name="seconds" type="number" min="0" max="86400"></label><label>Комментарий<input name="note" maxlength="1000"></label><button type="submit" class="button secondary">Сохранить ссылку</button></form></div>
 <div class="row"><label class="field" style="flex:1">Прикрепить выбранный материал к жалобе<select id="vault-case" aria-label="Целевая жалоба"><option value="">Выберите жалобу</option></select></label><label class="field" style="flex:1">Поиск материалов<input id="vault-search" type="search" aria-label="Поиск материалов" maxlength="180" placeholder="Название или SHA-256"></label></div>
 <div class="row"><button type="button" class="button secondary" id="vault-migrate">Импортировать существующие ссылки из жалоб</button></div><p class="subtle" id="vault-summary">Загрузка данных…</p><div id="vault-items" class="stack"></div><p class="subtle">Обычная JSON-копия Backup v16 содержит ссылки на файлы и метаданные в жалобах, но не сами двоичные вложения IndexedDB. Скачайте нужные файлы отдельно перед переносом или удалением расширения.</p></section>`;
 const fileForm=root.querySelector('#vault-upload-form'),linkForm=root.querySelector('#vault-link-form'),list=root.querySelector('#vault-items'),select=root.querySelector('#vault-case'),search=root.querySelector('#vault-search');
 let records=[],cases=[],busy=false;
 async function refresh(){
  [records,cases]=await Promise.all([listVault(profileId),listCases()]);
  if(!root.isConnected)return;
  const current=select.value;select.innerHTML='<option value="">Выберите жалобу</option>'+cases.filter(x=>x.profileId===profileId).map(x=>`<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('');select.value=cases.some(x=>x.id===current&&x.profileId===profileId)?current:'';
  draw();
 }
 function draw(){
  if(!root.isConnected)return;
  const q=search.value.toLowerCase().trim(),data=records.filter(x=>`${x.title} ${x.note} ${x.kind==='file'?x.sha256:x.url}`.toLowerCase().includes(q));
  root.querySelector('#vault-summary').textContent=`Материалов: ${records.length} · Файлы: ${records.filter(x=>x.kind==='file').length} · Использовано: ${(records.reduce((n,x)=>n+(x.kind==='file'?x.size:0),0)/1048576).toFixed(1)} МиБ / ${VAULT_LIMITS.totalBytes/1048576} МиБ`;
  list.innerHTML=data.length?data.map(x=>`<div class="case-evidence"><div><strong>${esc(x.title)}</strong> <span class="tag">${x.kind==='file'?esc(x.mime):'HTTPS-ссылка'}</span><p class="subtle">${esc(x.note)} · ${esc(date(x.createdAt))}</p><small>${x.kind==='file'?`${esc(x.name)} · ${(x.size/1048576).toFixed(2)} МиБ · SHA-256: ${esc(x.sha256)}`:esc(x.url)+(x.seconds!=null?' · '+x.seconds+' c':'')}</small></div><div class="row"><button type="button" class="button secondary" data-vault-action="${x.kind==='file'?'verify':'open'}" data-id="${esc(x.id)}">${x.kind==='file'?'Проверить SHA-256':'Открыть ↗'}</button>${x.kind==='file'?`<button type="button" class="button secondary" data-vault-action="preview" data-id="${esc(x.id)}">Просмотр</button><button type="button" class="button secondary" data-vault-action="download" data-id="${esc(x.id)}">Скачать</button>`:''}<button type="button" class="button secondary" data-vault-action="edit" data-id="${esc(x.id)}">Изменить</button><button type="button" class="button primary" data-vault-action="attach" data-id="${esc(x.id)}">К жалобе</button><button type="button" class="button danger" data-vault-action="delete" data-id="${esc(x.id)}">Удалить</button></div></div>`).join(''):'<p class="subtle">Материалов нет. Добавьте файл или HTTPS-ссылку.</p>';
 }
 async function perform(fn){if(busy)return;busy=true;try{await fn();}catch(error){feedback(error.message,true);}finally{busy=false;}}
 fileForm.addEventListener('submit',event=>{event.preventDefault();void perform(async()=>{
  const f=fileForm.elements.file.files?.[0];if(!f)throw Error('Выберите файл');const title=fileForm.elements.title.value.trim()||f.name;
  await addVaultFile(profileId,f,{title,note:fileForm.elements.note.value});fileForm.reset();await refresh();feedback('Файл сохранён локально с SHA-256');
 });});
 linkForm.addEventListener('submit',event=>{event.preventDefault();void perform(async()=>{
  const f=linkForm.elements;await addVaultLink(profileId,{title:f.title.value,url:f.url.value,seconds:f.seconds.value===''?null:Number(f.seconds.value),note:f.note.value});linkForm.reset();await refresh();feedback('Ссылка добавлена');
 });});
 root.querySelector('#vault-migrate').addEventListener('click',()=>{void perform(async()=>{
    const previous=cases.filter(c=>c.profileId===profileId).flatMap(c=>c.evidence.filter(x=>x.kind!=='file'&&!x.vaultId).map(x=>({caseId:c.id,item:x})));
    if(!previous.length){feedback('Все ссылки уже связаны с Evidence Vault');return;}
    if(!confirm(`Перенести ${previous.length} старых ссылок из жалоб в Evidence Vault без изменения ID доказательств?`))return;
    let updated=0;
    const known=new Map(records.filter(x=>x.kind==='link').map(x=>[JSON.stringify([x.url,x.seconds,x.title]),x]));
    for(const {caseId,item} of previous){
      const key=JSON.stringify([item.url,item.seconds,item.title]);
      const meta=known.get(key)??await addVaultLink(profileId,{title:item.title,url:item.url,seconds:item.seconds,note:item.note});
      known.set(key,meta);
      const result=await api.runtime.sendMessage({type:'RP_NEXUS_CASE_MUTATE',action:'linkEvidence',id:caseId,evidenceId:item.id,vaultId:meta.id});
      if(!result?.ok)throw Error(`Перенесено ${updated} из ${previous.length}: ${result?.error||'ошибка связи'}`);
      updated++;
    }
    await onAttached?.();feedback(`Перенесено ссылок без изменения ID: ${updated}`);
  });});
 search.addEventListener('input',draw);
 list.addEventListener('click',event=>{
  const button=event.target.closest('[data-vault-action]');if(!button)return;
  void perform(async()=>{
   const item=records.find(x=>x.id===button.dataset.id);if(!item)throw Error('Материал не найден');const action=button.dataset.vaultAction;
   if(action==='attach'){
    const target=cases.find(c=>c.id===select.value&&c.profileId===profileId);if(!target)throw Error('Выберите жалобу текущего профиля');
    if(target.evidence.some(x=>x.vaultId===item.id))throw Error('Материал уже прикреплён к этой жалобе');
    const response=await api.runtime.sendMessage({type:'RP_NEXUS_CASE_MUTATE',action:'addEvidence',id:target.id,input:{vaultId:item.id}});
    if(!response?.ok)throw Error(response?.error||'Не удалось прикрепить доказательство');
    await onAttached?.();feedback('Материал прикреплён к жалобе');return;
   }
   if(action==='edit'){
     const title=prompt('Название материала',item.title);if(title===null)return;
     const note=prompt('Комментарий',item.note);if(note===null)return;
     await editVaultMetadata(item.id,profileId,{title,note});await refresh();feedback('Метаданные обновлены. Уже прикреплённые к делам снимки не меняются.');return;
   }
   if(action==='delete'){if(!confirm(`Удалить «${item.title}» из локального хранилища?`))return;await deleteVaultRecord(item.id,profileId);await refresh();feedback('Материал удалён');return;}
   if(action==='open'){await (globalThis.browser??globalThis.chrome).tabs.create({url:item.url});return;}
   if(action==='verify'){await verifyVaultFile(item.id,profileId);feedback('SHA-256 совпадает, файл цел');return;}
   if(action==='download'){await downloadVaultFile(item.id,profileId);feedback('Файл проверен и скачан');return;}
   if(action==='preview'){
     const {meta,blob}=await verifyVaultFile(item.id,profileId);const dlg=document.createElement('dialog');dlg.className='vault-preview';const title=document.createElement('h3');title.textContent=meta.title;dlg.append(title);
     let resourceUrl;
     if(meta.mime.startsWith('image/')||meta.mime.startsWith('video/')){
       resourceUrl=URL.createObjectURL(blob);const media=document.createElement(meta.mime.startsWith('image/')?'img':'video');media.src=resourceUrl;media.style.maxWidth='min(75vw,850px)';media.style.maxHeight='65vh';if(media.nodeName==='VIDEO')media.controls=true;else media.alt=meta.title;dlg.append(media);
     }else if(meta.mime==='text/plain'){const pre=document.createElement('pre');pre.textContent=(await blob.slice(0,50000).text());pre.style.maxWidth='75vw';pre.style.maxHeight='60vh';pre.style.overflow='auto';dlg.append(pre);}else{const info=document.createElement('p');info.textContent='PDF можно скачать после проверки контрольной суммы.';dlg.append(info);}
     const close=document.createElement('button');close.type='button';close.className='button secondary';close.textContent='Закрыть';dlg.append(close);document.body.append(dlg);
     const cleanup=()=>{if(resourceUrl)URL.revokeObjectURL(resourceUrl);dlg.remove();};close.addEventListener('click',()=>dlg.close());dlg.addEventListener('close',cleanup,{once:true});dlg.showModal();
   }
  });
 });
 await refresh();
}
