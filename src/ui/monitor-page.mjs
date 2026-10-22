import {openTab} from '../lib/browser.mjs';
import {escapeHtml as e} from '../lib/sites.mjs';
import {loadMonitor,favoriteServer,removePlayer,setAutoRefresh} from '../lib/monitor-store.mjs';
import {hasMonitorPermission,requestMonitorPermission,refreshOfficialCatalog,refreshVerifiedOnline} from '../lib/monitor-service.mjs';
import {CATALOG_URL,LIVE_URL} from '../lib/monitor-core.mjs';
let data=null,permission=false,filter='all',error='',busy=false;
export async function refreshMonitor(){[data,permission]=await Promise.all([loadMonitor(),hasMonitorPermission()]);return data;}
export const monitorRecords=()=>data;
const date=value=>value?new Date(value).toLocaleString('ru-RU'):'ещё нет';
const card=entry=>{
 const status=data.live.find(x=>x.id===entry.id);
 const stale=data.liveAt && Date.now()-Date.parse(data.liveAt)>10*60*1000;
 return `<article class="card stack"><div class="row spread"><div><h4>${e(entry.name)} <small>${e(entry.id)}</small></h4><p class="subtle">${entry.project==='majestic'?'Majestic RP':'Россия Онлайн'} · ${e(entry.region)}</p></div><button type="button" class="button secondary" data-monitor-action="favorite" data-id="${e(entry.id)}">${data.favorites.includes(entry.id)?'★ Убрать':'☆ Избранное'}</button></div><div class="row"><span class="tag">${status?.online!==null&&status?.online!==undefined?`${status.online} игроков${stale?' (старый снимок)':''}`:'Онлайн не подтверждён'}</span>${status?.queue!==null&&status?.queue!==undefined?`<span class="tag">Очередь: ${status.queue}</span>`:''}<span class="tag">${status?.availability==='online'?'Работает':status?.availability==='offline'?'Не работает':'Статус неизвестен'}</span></div></article>`;
};
export function monitorSection(state){
 if(!data)return '<section class="card">Загрузка мониторинга…</section>';
 const catalog=data.catalog.filter(s=>filter==='all'||(filter==='favorites'&&data.favorites.includes(s.id))||filter===s.project);
 const players=data.players.filter(x=>x.profileId===state.activeProfileId);
 return `<div class="stack"><section class="card stack"><h3>Server Monitor & Player Profiles</h3><p class="subtle">Каталог загружается непосредственно с публичного API Majestic. Дополнительный источник статистики онлайна опрашивается только после разрешения. Если он не отвечает или не содержит проверяемых значений, онлайн не выдумывается и показывается как недоступный.</p>
   <div class="row"><button class="button primary" data-monitor-action="enable" ${permission?'disabled':''}>${permission?'API разрешён':'Разрешить официальный API'}</button><button class="button secondary" data-monitor-action="catalog" ${!permission||busy?'disabled':''}>Обновить каталог</button><button class="button secondary" data-monitor-action="online" ${!permission||busy||!data.catalog.length?'disabled':''}>Проверить онлайн</button><button class="button secondary" data-monitor-action="source">Открыть источник</button></div>
   <label class="check"><input type="checkbox" id="monitor-auto-refresh" ${data.autoRefresh?'checked':''} ${!permission?'disabled':''}> Обновлять проверенный онлайн каждые 5 минут при открытом рабочем пространстве (после первого успешного запроса)</label><p class="subtle">Каталог: ${date(data.observedAt)} · Онлайн: ${date(data.liveAt)} · Источники: ${e(CATALOG_URL)} и ${e(LIVE_URL)}. Нет опроса в фоне, когда рабочее пространство закрыто.</p>
   ${error?`<p class="error" role="alert">${e(error)}</p>`:''}
  </section>
  <section class="card stack"><div class="row spread"><h3>Серверы (${catalog.length})</h3><select id="monitor-filter" aria-label="Фильтр серверов"><option value="all" ${filter==='all'?'selected':''}>Все</option><option value="favorites" ${filter==='favorites'?'selected':''}>Избранные</option><option value="majestic" ${filter==='majestic'?'selected':''}>Majestic RP</option><option value="russia-online" ${filter==='russia-online'?'selected':''}>Россия Онлайн</option></select></div>
   <div class="grid">${catalog.map(card).join('')||'<p class="subtle">Нет серверов. Предоставьте доступ и нажмите «Обновить каталог».</p>'}</div>
  </section>
  <section class="card stack"><h3>Карточки пользователей XenForo (${players.length})</h3><p class="subtle">Откройте публичную страницу пользователя /members/ на форуме, разверните панель MajesticToolkit и нажмите «Сохранить карточку». Сохраняются только показанные на этой странице сведения. Карточки привязаны к профилю MajesticToolkit; закрытая статистика, персонажи и другие непубличные данные не запрашиваются.</p>
  ${players.map(p=>`<article class="card"><div class="row spread"><div><strong>${e(p.name)}</strong><p>${e(p.subtitle)}</p><p class="subtle">Снимок: ${e(date(p.capturedAt))}</p></div><div class="row"><button class="button secondary" data-url="${e(p.url)}">Открыть профиль</button><button class="button danger" data-monitor-action="delete-player" data-profile="${e(p.profileId)}" data-url-value="${e(p.url)}">Удалить</button></div></div>${p.stats.map(s=>`<div class="row spread"><span>${e(s.label)}</span><strong>${e(s.value)}</strong></div>`).join('')}</article>`).join('')||'<p class="subtle">Карточки ещё не сохранены.</p>'}</section></div>`;
}
export async function setMonitorAutoRefresh(enabled){data=await setAutoRefresh(enabled);}
export function setMonitorFilter(value){filter=['all','favorites','majestic','russia-online'].includes(value)?value:'all';}
export async function handleMonitorAction(button,state,rerender,feedback){
 const action=button.dataset.monitorAction;
 if(action==='source'){await openTab('https://masterlist.majestic-rp.ru/');return;}
 if(action==='enable'){
   // Host permissions request must be first asynchronous operation in a click handler.
   if(!await requestMonitorPermission()){feedback('Доступ к API отклонён',true);return;}
   permission=true;await refreshMonitor();rerender();feedback('Доступ к официальному API предоставлен');return;
 }
 if(action==='favorite'){data=await favoriteServer(button.dataset.id);rerender();return;}
 if(action==='delete-player'){
   if(!confirm('Удалить сохранённую публичную карточку?'))return;
   data=await removePlayer(button.dataset.profile,button.dataset.urlValue);rerender();feedback('Карточка удалена');return;
 }
 if(action==='catalog'||action==='online'){
   if(busy)return;busy=true;error='';rerender();
   try{
     if(action==='catalog'){const list=await refreshOfficialCatalog();feedback(`Обновлено серверов: ${list.length}`);}
     else {const list=await refreshVerifiedOnline();feedback(`Проверены показатели для ${list.length} серверов`);}
   }catch(err){error=err.message;feedback(error,true);}
   finally{busy=false;data=await loadMonitor();rerender();}
 }
}

let pollRunning=false;
export async function tickMonitor(){
 if(pollRunning||busy||!data?.autoRefresh||!data.liveAt||!permission||document.visibilityState==='hidden')return;
 if(Date.now()-Date.parse(data.liveAt)<5*60*1000)return;
 pollRunning=true;
 try{await refreshVerifiedOnline();data=await loadMonitor();error='';}
 catch(err){error='Автообновление: '+err.message;}
 finally{pollRunning=false;}
 return true;
}
