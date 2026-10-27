import {api} from '../lib/browser.mjs';
import {listTimers} from '../lib/timers-store.mjs';
import {remainingLabel} from '../lib/timers-core.mjs';
import {escapeHtml} from '../lib/sites.mjs';
let timers=[];
const esc=x=>escapeHtml(x ?? '');
export async function refreshTimers(){timers=await listTimers();}
export function timersSection() {
  const now=Date.now(),active=timers.filter(x=>x.status==='active').sort((a,b)=>a.expiresAt-b.expiresAt);
  const finished=timers.filter(x=>x.status==='completed').sort((a,b)=>b.completedAt-a.completedAt);
  const item=t=>`<article class="timer-item" data-timer-id="${esc(t.id)}"><div><strong>${esc(t.title)}</strong><p class="subtle">${t.status==='active'?'Завершение':'Завершён'}: ${esc(new Date(t.expiresAt).toLocaleString('ru-RU'))}</p></div><div class="row"><span class="timer-remaining ${t.status==='completed'?'timer-done':''}" data-timer-until="${t.expiresAt}" ${t.status==='completed'?'data-timer-completed="true"':''}>${t.status==='completed'?'Готово':remainingLabel(t.expiresAt-now)}</span><button type="button" class="button ${t.status==='active'?'danger':'secondary'}" data-timer-action="remove" data-id="${esc(t.id)}">${t.status==='active'?'Отменить':'Удалить'}</button></div></article>`;
  return `<div class="stack"><section class="card"><h3>Новый таймер</h3><p class="subtle">Системное уведомление при завершении, даже если окно MajesticToolkit закрыто. Таймеры хранятся локально; для уведомления браузер должен работать.</p><form id="timer-create-form" class="timer-form"><label class="field">Название<input type="text" name="title" required maxlength="100" placeholder="Например, перерыв" value="Таймер"></label><label class="field">Минуты (1–10080)<input type="number" name="minutes" required min="1" max="10080" step="1" value="15"></label><button type="submit" class="button primary">Запустить таймер</button></form></section><section class="card"><div class="row spread"><h3>Активные (${active.length})</h3><span class="tag">Обновление каждую секунду</span></div>${active.length?active.map(item).join(''):'<p class="subtle">Активных таймеров нет.</p>'}</section><section class="card"><h3>Завершённые (${finished.length})</h3>${finished.length?finished.map(item).join(''):'<p class="subtle">История завершений пуста.</p>'}</section></div>`;
}
async function request(action,params={}) {
  const response=await api.runtime.sendMessage({type:'MAJESTIC_TIMER',action,...params});
  if(!response?.ok)throw Error(response?.error||'Не удалось изменить таймер');
  return response.value;
}
export async function submitTimer(event,render,feedback) {
  event.preventDefault();
  const f=event.target.elements;
  await request('create',{input:{title:f.namedItem('title').value,minutes:Number(f.namedItem('minutes').value)}});
  await refreshTimers();render();feedback('Таймер запущен');
}
export async function handleTimerAction(button,render,feedback) {
  if(button.dataset.timerAction!=='remove')return;
  const timer=timers.find(x=>x.id===button.dataset.id);
  if(!timer)throw Error('Таймер не найден');
  await request('remove',{id:timer.id});
  await refreshTimers();render();feedback(timer.status==='active'?'Таймер отменён':'Запись удалена');
}
export function tickTimers() {
  const now=Date.now();
  document.querySelectorAll('[data-timer-until]:not([data-timer-completed])').forEach(el=>{
    const delta=Number(el.dataset.timerUntil)-now;
    el.textContent=delta>0?remainingLabel(delta):'Завершается…';
  });
}
