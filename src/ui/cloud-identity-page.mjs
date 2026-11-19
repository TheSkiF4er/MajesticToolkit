import {api} from '../lib/browser.mjs';
import {escapeHtml as e} from '../lib/sites.mjs';
import {cloudEndpoint,cloudHostPattern} from '../lib/cloud-identity-client.mjs';
import '../lib/safe-dom.js';
const {replaceHtml}=globalThis.MTSafeDOM;
const date=value=>value?new Date(value).toLocaleString('ru-RU'):'—';
const btn=(action,label,extra='')=>`<button type="button" class="button secondary" data-cloud-action="${action}" ${extra}>${label}</button>`;
export async function cloudRpc(action,input={}){
  const result=await api.runtime.sendMessage({type:'MT_CLOUD_IDENTITY',action,input});
  if(!result?.ok)throw Error(result?.error||'Ошибка Cloud Identity');
  return result.value;
}
export function cloudSection(){return `<section class="stack cloud-identity"><div class="card stack"><h3>Облачный аккаунт</h3><p class="subtle">Необязательный облачный вход. Данные Tactical Toolkit и других рабочих разделов продолжают храниться локально: их синхронизация в 2.3.1 не включена.</p><div id="cloud-identity-root" aria-live="polite"><p class="subtle">Проверка статуса аккаунта…</p></div></div></section>`;}
function sessionRow(row){return `<div class="ws-item cloud-session"><div><strong>${e(row.deviceName)}</strong>${row.current?' <span class="tag">Это устройство</span>':''}<p class="subtle">${e(date(row.lastSeenAt))} · до ${e(date(row.expiresAt))}</p></div>${btn('revoke','Отозвать',`data-id="${e(row.id)}" data-current="${row.current?'1':'0'}"`)}</div>`;}
function authPanel(status,sessions){
  const configured=status.configured;
  const url=e(status.origin||'http://127.0.0.1:8787');
  const server=`<form id="cloud-config-form" class="stack"><label>Адрес Cloud Identity Server<input name="origin" required type="url" spellcheck="false" maxlength="300" value="${url}" placeholder="https://identity.example.org"></label><div class="row"><button class="button secondary" type="submit" ${status.authenticated?'disabled':''}>${configured?'Проверить сервер':'Подключить сервер'}</button>${configured?btn('refresh','Обновить статус'):''}</div><p class="subtle">HTTPS для удалённого сервера. HTTP разрешён только для 127.0.0.1 при локальной разработке. Доступ к выбранному серверу запрашивается отдельно.</p></form>`;
  if(status.authenticated){
    return `${server}<div class="cloud-account"><div class="row spread"><div><h3>${e(status.account.username)}</h3><p class="subtle">Аккаунт ${e(status.account.id)} · ${e(status.origin)}</p></div><span class="tag">Подключено</span></div><h4>Активные устройства и сессии</h4><div class="stack">${sessions?.length?sessions.map(sessionRow).join(''):'<p class="subtle">Нет доступных данных о сессиях.</p>'}</div><div class="row">${btn('logout','Выйти на этом устройстве')}${btn('logoutAll','Завершить все сессии')}</div></div>`;
  }
  if(status.offline)return `${server}<div class="cloud-account"><p role="alert">Не удалось подтвердить сессию на сервере. Последний аккаунт: <strong>${e(status.lastAccount||'—')}</strong>. Никакие облачные действия пока недоступны.</p><p class="subtle">${e(status.error||'Нет соединения')}</p><div class="row">${btn('refresh','Повторить проверку')}${btn('forgetLocal','Удалить локальные токены')}</div></div>`;
  return `${server}${status.expired?'<p role="status">Сессия завершена или отозвана. Войдите повторно.</p>':''}${configured?`<div class="cloud-account"><div class="cloud-auth-grid"><form id="cloud-login-form" class="stack"><h3>Войти</h3><label>Логин<input name="username" required minlength="3" maxlength="32" autocomplete="username" pattern="[a-zA-Z][a-zA-Z0-9_.-]{2,31}"></label><label>Пароль<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="current-password"></label><label>Название устройства<input name="deviceName" required maxlength="70" value="Этот браузер"></label><button class="button primary">Войти</button></form><form id="cloud-register-form" class="stack"><h3>Создать аккаунт</h3><label>Логин<input name="username" required minlength="3" maxlength="32" autocomplete="username" pattern="[a-zA-Z][a-zA-Z0-9_.-]{2,31}"></label><label>Пароль (минимум 12 символов)<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><label>Название устройства<input name="deviceName" required maxlength="70" value="Этот браузер"></label><button class="button secondary">Создать аккаунт</button></form></div></div>`:'<p class="subtle">Сначала подключите сервер. На устройстве без собственного сервера облачная авторизация недоступна; локальные функции работают без изменений.</p>'}`;
}
export async function mountCloudIdentity(root,feedback){
  if(!root)return;
  try{
    const status=await cloudRpc('status');
    const sessions=status.authenticated?(await cloudRpc('sessions')).sessions:null;
    if(root.isConnected)replaceHtml(root,authPanel(status,sessions));
  }catch(error){if(root.isConnected){root.textContent='Не удалось проверить облачную сессию: '+error.message;feedback(error.message,true);}}
}
export async function handleCloudSubmit(form,feedback){
  const id=form.getAttribute('id');
  if(id==='cloud-config-form'){
    // Browser user activation must reach permissions.request() before the first await.
    const origin=cloudEndpoint(form.elements.namedItem('origin').value);
    const granted=await api.permissions.request({origins:[cloudHostPattern(origin)]});
    if(!granted)throw Error('Разрешение на сервер не предоставлено');
    await cloudRpc('configure',{origin});feedback('Cloud Identity Server подключён');
  }else if(id==='cloud-login-form'||id==='cloud-register-form'){
    const username=form.elements.namedItem('username').value,password=form.elements.namedItem('password').value,deviceName=form.elements.namedItem('deviceName').value;
    form.elements.namedItem('password').value='';
    await cloudRpc(id==='cloud-login-form'?'login':'register',{username,password,deviceName});feedback('Облачная сессия активна');
  }else throw Error('Неизвестная форма Cloud Identity');
  await mountCloudIdentity(document.getElementById('cloud-identity-root'),feedback);
}
export async function handleCloudAction(button,feedback){
  const action=button.dataset.cloudAction;
  if(action==='refresh'){await mountCloudIdentity(document.getElementById('cloud-identity-root'),feedback);return;}
  if(action==='revoke'&&!confirm(button.dataset.current==='1'?'Отозвать текущую сессию?':'Отозвать сессию выбранного устройства?'))return;
  if(action==='logoutAll'&&!confirm('Завершить все облачные сессии на всех устройствах?'))return;
  if(action==='forgetLocal'&&!confirm('Удалить локальные токены без отзыва удалённой сессии? Для безопасности затем завершите её с другого устройства.'))return;
  if(!['revoke','logout','logoutAll','forgetLocal'].includes(action))throw Error('Неизвестная операция Cloud Identity');
  await cloudRpc(action,action==='revoke'?{id:button.dataset.id}:{});
  await mountCloudIdentity(document.getElementById('cloud-identity-root'),feedback);
  feedback(action==='forgetLocal'?'Локальные токены удалены. Удалённая сессия может оставаться активной.':'Операция с сессиями выполнена');
}
