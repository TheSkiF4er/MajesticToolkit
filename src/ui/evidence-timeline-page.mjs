// Evidence Timeline 1.8.2 — real case-scoped event editor, video clips and material navigation.
import '../lib/complaints-core.js';
import {escapeHtml} from '../lib/sites.mjs';
import {api} from '../lib/browser.mjs';
import {verifyVaultFile,downloadVaultFile} from '../lib/evidence-vault.mjs';
import '../lib/safe-dom.js';
const C=globalThis.RPNComplaints,esc=v=>escapeHtml(v??'');
const statuses={unverified:'Не проверено',supported:'Подтверждено пользователем',disputed:'Оспаривается'};
const fmtDate=v=>v?new Date(v).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'}):'Время события не указано';
const localDatetime=v=>{if(!v)return '';const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const isVideo=v=>v.kind==='file'?['video/mp4','video/webm'].includes(v.mime):(()=>{try {const u=new URL(v.url);return C.VIDEO_HOSTS.includes(u.hostname)||/\.(mp4|webm)$/i.test(u.pathname);}catch{return false;}})();
export function timelinePanel(c){
 const timeline=C.timelineOrdered(c.timeline),evById=new Map(c.evidence.map(e=>[e.id,e]));
 return `<section class="workflow-panel evidence-timeline"><div class="row spread"><div><h3>Таймлайн событий (${timeline.length})</h3><p class="subtle">Время события, позиция в видео и дата добавления — независимые значения. Статус устанавливается пользователем, не автоматически.</p></div><button type="button" class="button primary" data-case-action="timeline-add" data-id="${esc(c.id)}" ${c.status==='done'?'disabled title="Сначала откройте рассмотрение повторно"':''}>+ Событие</button></div>
 ${timeline.length?`<ol class="timeline-list">${timeline.map(t=>`<li class="timeline-entry"><div class="row spread"><strong>${esc(t.title)}</strong><span class="tag">${esc(statuses[t.status])}</span></div><p class="subtle">${esc(fmtDate(t.occurredAt))}${t.clipEvidenceId?` · Видео: ${esc(C.timecode(t.startSeconds))}${t.endSeconds!==null?'–'+esc(C.timecode(t.endSeconds)):''}`:''}</p>${t.description?`<p>${esc(t.description)}</p>`:''}${t.participants.length?`<p class="subtle">Участники: ${esc(t.participants.join(', '))}</p>`:''}<div class="row">${t.evidenceIds.map(id=>{const ev=evById.get(id);return ev?`<button type="button" class="button secondary" data-case-action="timeline-material" data-id="${esc(c.id)}" data-timeline-event="${esc(t.id)}" data-evidence-id="${esc(id)}">${esc(ev.title)}${id===t.clipEvidenceId?' ▶':''}</button>`:'';}).join('')}</div><div class="row"><button type="button" class="button secondary" data-case-action="timeline-edit" data-id="${esc(c.id)}" data-timeline-event="${esc(t.id)}" ${c.status==='done'?'disabled':''}>Изменить</button><button type="button" class="button danger" data-case-action="timeline-remove" data-id="${esc(c.id)}" data-timeline-event="${esc(t.id)}" ${c.status==='done'?'disabled':''}>Удалить событие</button></div></li>`).join('')}</ol>`:'<p class="subtle">Хронология пуста. Создайте событие и, при необходимости, прикрепите доказательства из жалобы.</p>'}
 </section>`;
}
export function showTimelineDialog(c,id=null){
 const item=id?c.timeline.find(x=>x.id===id):null;if(id&&!item)throw Error('Событие не найдено');
 let dlg=document.getElementById('timeline-dialog');if(!dlg){dlg=document.createElement('dialog');dlg.id='timeline-dialog';document.body.append(dlg);}
 const videos=c.evidence.filter(isVideo);
 const participants=(c.moderation?.players??[]).map(p=>p.id||p.nickname).filter(Boolean);
 const html=`<form id="case-timeline-form"><h2>${item?'Изменить событие':'Новое событие'}</h2><input type="hidden" name="caseId" value="${esc(c.id)}"><input type="hidden" name="eventId" value="${esc(item?.id)}"><input type="hidden" name="expected" value="${esc(c.updatedAt)}">
 <label>Название события<input name="title" maxlength="180" required value="${esc(item?.title)}" placeholder="Начало конфликта"></label>
 <label>Описание и обстоятельства<textarea name="description" maxlength="2000" rows="3" placeholder="Факты и наблюдения, без автоматического вывода о виновности">${esc(item?.description)}</textarea></label>
 <div class="grid"><label>Дата и время события (если достоверно известны)<input type="datetime-local" name="occurredAt" value="${esc(localDatetime(item?.occurredAt))}"></label><label>Статус ручной проверки<select name="status">${Object.entries(statuses).map(([k,v])=>`<option value="${k}" ${k===(item?.status??'unverified')?'selected':''}>${esc(v)}</option>`).join('')}</select></label></div>
 <label>Участники (ID или никнеймы через запятую)<input name="participants" maxlength="1200" value="${esc(item?.participants.join(', '))}" placeholder="Player_One, 12345"></label>${participants.length?`<p class="subtle">Из рассмотрения: ${esc(participants.join(', '))}</p>`:''}
 <fieldset><legend>Доказательства из жалобы</legend>${c.evidence.length?c.evidence.map(e=>`<label class="check"><input name="evidenceIds" type="checkbox" value="${esc(e.id)}" ${item?.evidenceIds.includes(e.id)?'checked':''}> ${esc(e.title)}${e.kind==='file'?' (локальный файл)':''}</label>`).join(''):'<p class="subtle">Сначала прикрепите доказательства к жалобе. Событие можно сохранить без них.</p>'}</fieldset>
 <label>Видеозапись для фрагмента<select name="clipEvidenceId"><option value="">Без видеофрагмента</option>${videos.map(e=>`<option value="${esc(e.id)}" ${e.id===item?.clipEvidenceId?'selected':''}>${esc(e.title)}</option>`).join('')}</select></label>
 <div class="grid"><label>Начало фрагмента, секунды<input name="startSeconds" type="number" min="0" max="86400" step="1" value="${esc(item?.startSeconds)}" placeholder="42"></label><label>Конец, секунды (необязательно)<input name="endSeconds" type="number" min="1" max="86400" step="1" value="${esc(item?.endSeconds)}" placeholder="75"></label></div><p class="subtle">Таймкод — смещение внутри выбранного видео, а не время события. Для разных видеозаписей смещения независимы.</p>
 <div class="dialog-actions"><button type="button" class="button secondary" data-case-action="timeline-cancel">Отмена</button><button type="submit" class="button primary">${item?'Сохранить изменения':'Добавить событие'}</button></div></form>`;
 globalThis.MTSafeDOM.replaceHtml(dlg,html);dlg.showModal();dlg.querySelector('[name=title]')?.focus();return dlg;
}
export function readTimelineForm(form){
 const el=k=>form.elements.namedItem(k),number=k=>el(k).value===''?null:Number(el(k).value);
 const clipEvidenceId=el('clipEvidenceId').value||null;
 const evidenceIds=[...form.querySelectorAll('input[name="evidenceIds"]:checked')].map(x=>x.value);
 if(clipEvidenceId&&!evidenceIds.includes(clipEvidenceId))evidenceIds.push(clipEvidenceId);
 const input={title:el('title').value,description:el('description').value,occurredAt:el('occurredAt').value?new Date(el('occurredAt').value).toISOString():null,status:el('status').value,participants:el('participants').value.split(',').map(s=>s.trim()).filter(Boolean),evidenceIds,clipEvidenceId,startSeconds:number('startSeconds'),endSeconds:number('endSeconds')};
 if(el('eventId').value)input.id=el('eventId').value;
 return {caseId:el('caseId').value,expected:el('expected').value,operation:input.id?'edit':'add',input};
}
function videoUrl(ev,seconds){
 const u=new URL(ev.url);if(seconds!==null){if(['youtube.com','www.youtube.com','youtu.be'].includes(u.hostname))u.searchParams.set('t',String(seconds)+'s');else if(['rutube.ru','www.rutube.ru'].includes(u.hostname))u.searchParams.set('t',String(seconds));else if(/\.(mp4|webm)$/i.test(u.pathname))u.hash='t='+seconds;}
 return u.href;
}
export async function openTimelineMaterial(c,eventId,evidenceId){
 const event=c.timeline.find(x=>x.id===eventId),ev=c.evidence.find(x=>x.id===evidenceId);
 if(!event||!ev||!event.evidenceIds.includes(evidenceId))throw Error('Материал не привязан к этому событию');
 if(ev.kind!=='file')return api.tabs.create({url:videoUrl(ev,event.clipEvidenceId===ev.id?event.startSeconds:ev.seconds)});
 if(!['video/mp4','video/webm'].includes(ev.mime)||event.clipEvidenceId!==ev.id)return downloadVaultFile(ev.vaultId,c.profileId);
 const {blob}=await verifyVaultFile(ev.vaultId,c.profileId);
 const dlg=document.createElement('dialog');dlg.className='vault-preview';const h=document.createElement('h3');h.textContent=ev.title;dlg.append(h);
 const video=document.createElement('video');video.controls=true;video.preload='metadata';video.style.maxWidth='min(80vw,850px)';video.style.maxHeight='65vh';
 const url=URL.createObjectURL(blob);video.src=url;dlg.append(video);
 const close=document.createElement('button');close.type='button';close.className='button secondary';close.textContent='Закрыть';dlg.append(close);document.body.append(dlg);
 video.addEventListener('loadedmetadata',()=>{if(event.startSeconds!==null&&Number.isFinite(video.duration)&&event.startSeconds<video.duration)video.currentTime=event.startSeconds;});
 video.addEventListener('timeupdate',()=>{if(event.endSeconds!==null&&video.currentTime>=event.endSeconds)video.pause();});
 const cleanup=()=>{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);dlg.remove();};
 close.addEventListener('click',()=>dlg.close());dlg.addEventListener('close',cleanup,{once:true});dlg.showModal();return true;
}
