/** Server-backed operational audit and per-user notifications. */
import {escapeHtml as e} from '../lib/sites.mjs';
const date=v=>v?new Date(v).toLocaleString('ru-RU'):'—';
export async function loadCloudOperations(team,rpc){
 const [notifications,audit]=await Promise.all([
  rpc('teamNotifications',{teamId:team.id}),
  ['owner','admin'].includes(team.role)?rpc('teamAudit',{teamId:team.id}):Promise.resolve(null)
 ]);
 return {team,notifications,audit};
}
export function cloudOperationsPanel(data){
 if(!data)return '';
 if(data.error)return `<div class="card stack" role="alert"><h3>Операции Team & Cloud</h3><p>${e(data.error)}</p></div>`;
 const {team,notifications,audit}=data;
 const rows=notifications.notifications.map(n=>`<div class="ws-item"><div><strong>${e(n.event)}</strong><p class="subtle">${e(n.resource)} · ${e(date(n.occurredAt))}${n.readAt?' · прочитано':''}</p></div>${!n.readAt?`<button class="button secondary" type="button" data-cloud-action="opsRead" data-team-id="${e(team.id)}" data-seq="${n.seq}">Прочитано</button>`:''}</div>`).join('');
 const events=audit?.events.map(n=>`<div class="ws-item"><div><strong>${e(n.event)}</strong><p class="subtle">${e(n.resource)} · ${e(date(n.occurredAt))} · ${e(n.actorId||'система')}</p></div></div>`).join('')||'';
 return `<div class="card stack cloud-operations" id="cloud-operations-panel"><div class="row spread"><h3>Team & Cloud · Операции 2.3.9</h3><button class="button secondary" type="button" data-cloud-action="opsRefresh">Обновить</button></div>
 <h4>Уведомления (${Number(notifications.unreadCount)||0} непрочитанных)</h4><div class="stack">${rows||'<p class="subtle">Новых событий нет.</p>'}</div>
 ${audit?`<h4>Аудит команды (последние события)</h4><div class="stack">${events||'<p class="subtle">Записей нет.</p>'}</div>`:''}
 <p class="subtle">Уведомления сохраняются на сервере и доступны другим устройствам этого аккаунта. Резервные копии создаёт администратор сервера через локальный CLI, не через расширение.</p></div>`;
}
