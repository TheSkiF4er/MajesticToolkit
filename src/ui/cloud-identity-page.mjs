import {api} from '../lib/browser.mjs';
import {escapeHtml as e} from '../lib/sites.mjs';
import {cloudEndpoint,cloudHostPattern} from '../lib/cloud-identity-client.mjs';
import {loadCloudWorkspace,cloudStoragePanel,selectCloudLocalProfile,handleCloudStorageSubmit,handleCloudStorageAction} from './cloud-storage-page.mjs';
import {loadSharedKnowledge,sharedKnowledgePanel,handleSharedKnowledgeSubmit,handleSharedKnowledgeAction} from './cloud-knowledge-page.mjs';
import {loadTeamTactical,teamTacticalPanel,handleTacticalForm,handleTacticalAction} from './cloud-tactical-page.mjs';
import {loadCloudFiles,cloudFilesPanel,handleCloudFilesSubmit,handleCloudFilesAction} from './cloud-files-page.mjs';
import '../lib/safe-dom.js';
const {replaceHtml}=globalThis.MTSafeDOM;
const date=value=>value?new Date(value).toLocaleString('ru-RU'):'—';
const btn=(action,label,extra='')=>`<button type="button" class="button secondary" data-cloud-action="${action}" ${extra}>${label}</button>`;
export async function cloudRpc(action,input={}){
  const result=await api.runtime.sendMessage({type:'MT_CLOUD_IDENTITY',action,input});
  if(!result?.ok)throw Error(result?.error||'Ошибка Cloud Identity');
  return result.value;
}
export function cloudSection(){return `<section class="stack cloud-identity"><div class="card stack"><h3>Облачный аккаунт</h3><p class="subtle">Необязательный облачный вход. Локальные рабочие разделы продолжат работать независимо от облака. В 2.3.8 можно отдельно включить синхронизацию семей, организаций и товаров привязанного RP-профиля.</p><div id="cloud-identity-root" aria-live="polite"><p class="subtle">Проверка статуса аккаунта…</p></div></div></section>`;}
function sessionRow(row){return `<div class="ws-item cloud-session"><div><strong>${e(row.deviceName)}</strong>${row.current?' <span class="tag">Это устройство</span>':''}<p class="subtle">${e(date(row.lastSeenAt))} · до ${e(date(row.expiresAt))}</p></div>${btn('revoke','Отозвать',`data-id="${e(row.id)}" data-current="${row.current?'1':'0'}"`)}</div>`;}
let selectedTeamId=null;
let lastCreatedInvite=null;
const roleLabels={owner:'Владелец',admin:'Администратор',editor:'Редактор',viewer:'Наблюдатель'};
const selectRole=(current,allowAdmin)=>['viewer','editor',...(allowAdmin?['admin']:[])].map(role=>`<option value="${role}" ${role===current?'selected':''}>${roleLabels[role]}</option>`).join('');
function teamPanel(data){
  const {teams=[],team=null,members=[],invitations=[],error=null}=data||{};
  const list=teams.length?teams.map(t=>`<button type="button" class="button ${team?.id===t.id?'primary':'secondary'}" data-cloud-action="teamSelect" data-team-id="${e(t.id)}">${e(t.name)} · ${e(roleLabels[t.role]||t.role)} (${Number(t.memberCount)||0})</button>`).join(''):'<p class="subtle">Вы пока не состоите в командах.</p>';
  const isOwner=team?.role==='owner',manager=isOwner||team?.role==='admin';
  const membersHtml=members.map(member=>{
    const canEdit=isOwner?member.role!=='owner':team.role==='admin'&&['viewer','editor'].includes(member.role);
    const mayRemove=member.role!=='owner'&&(member.id===data.accountId||canEdit);
    return `<div class="ws-item cloud-team-row"><div><strong>${e(member.username)}</strong> <span class="tag">${e(roleLabels[member.role])}</span><p class="subtle">С ${e(date(member.joinedAt))}</p></div><div class="row">${canEdit?`<form class="row" id="cloud-team-role-form" data-team-id="${e(team.id)}" data-member-id="${e(member.id)}"><select name="role" aria-label="Роль ${e(member.username)}">${selectRole(member.role,isOwner)}</select><button class="button secondary" type="submit">Изменить</button></form>`:''}${mayRemove?btn('teamMemberRemove','Исключить',`data-team-id="${e(team.id)}" data-account-id="${e(member.id)}"`):''}</div></div>`;
  }).join('');
  const invitesHtml=invitations.map(invite=>`<div class="ws-item cloud-team-row"><div><strong>${e(roleLabels[invite.role])}</strong>${invite.targetUsername?' · '+e(invite.targetUsername):' · по коду'}<p class="subtle">${e(invite.status)} · до ${e(date(invite.expiresAt))}</p></div>${invite.status==='active'?btn('teamInviteRevoke','Отозвать',`data-team-id="${e(team.id)}" data-invitation-id="${e(invite.id)}"`):''}</div>`).join('');
  const inviteSecret=lastCreatedInvite&&team&&lastCreatedInvite.teamId===team.id?`<div class="cloud-invite-secret" role="status"><label>Одноразовый код приглашения (показывается только сейчас)<input value="${e(lastCreatedInvite.token)}" readonly aria-label="Новый код приглашения"></label><p class="subtle">Передайте код только предполагаемому участнику. Срок — 7 дней; после принятия он больше не работает.</p></div>`:'';
  return `<div class="cloud-account cloud-teams"><h3>Команды и доступы</h3>${error?`<p role="alert">${e(error)}</p>`:''}<div class="cloud-team-forms"><form id="cloud-team-create-form" class="stack"><h4>Создать команду</h4><label>Название<input name="name" required minlength="2" maxlength="80" autocomplete="off"></label><button class="button secondary">Создать</button></form><form id="cloud-team-accept-form" class="stack"><h4>Вступить по приглашению</h4><label>Код приглашения<input name="token" required minlength="43" maxlength="43" autocomplete="off" spellcheck="false"></label><button class="button secondary">Вступить</button></form></div><div class="stack"><h4>Мои команды</h4><div class="row cloud-team-list">${list}</div></div>${!team?'':`<div class="stack cloud-team-detail"><div class="row spread"><h4>${e(team.name)} · ${e(roleLabels[team.role])}</h4><span class="tag">${Number(team.memberCount)||0} участников</span></div><h4>Участники</h4><div class="stack">${membersHtml||'<p class="subtle">Нет участников</p>'}</div>${manager?`<div class="stack"><h4>Приглашения</h4><form id="cloud-team-invite-form" class="row cloud-invite-form" data-team-id="${e(team.id)}"><label>Роль<select name="role">${selectRole('viewer',isOwner)}</select></label><label>Логин (необязательно)<input name="targetUsername" maxlength="32" placeholder="Адресное приглашение"></label><button class="button secondary">Создать приглашение</button></form>${inviteSecret}<div class="stack">${invitesHtml||'<p class="subtle">Приглашений нет.</p>'}</div></div>`:''}${isOwner?`<div class="stack"><h4>Передача владения</h4><form id="cloud-team-transfer-form" class="row" data-team-id="${e(team.id)}"><select name="accountId" required aria-label="Новый владелец"><option value="">Выберите участника</option>${members.filter(m=>m.id!==data.accountId).map(m=>`<option value="${e(m.id)}">${e(m.username)}</option>`).join('')}</select><button class="button secondary">Передать</button></form><div class="row">${btn('teamDelete','Удалить команду',`data-team-id="${e(team.id)}"`)}</div></div>`:`<div class="row">${btn('teamLeave','Покинуть команду',`data-team-id="${e(team.id)}"`)}</div>`}</div>`}</div>`;
}
function authPanel(status,sessions,teamsData,storageData,knowledgeData,tacticalData,filesData){
  const configured=status.configured;
  const url=e(status.origin||'http://127.0.0.1:8787');
  const server=`<form id="cloud-config-form" class="stack"><label>Адрес Cloud Identity Server<input name="origin" required type="url" spellcheck="false" maxlength="300" value="${url}" placeholder="https://identity.example.org"></label><div class="row"><button class="button secondary" type="submit" ${status.authenticated?'disabled':''}>${configured?'Проверить сервер':'Подключить сервер'}</button>${configured?btn('refresh','Обновить статус'):''}</div><p class="subtle">HTTPS для удалённого сервера. HTTP разрешён только для 127.0.0.1 при локальной разработке. Доступ к выбранному серверу запрашивается отдельно.</p></form>`;
  if(status.authenticated){
    return `${server}<div class="cloud-account"><div class="row spread"><div><h3>${e(status.account.username)}</h3><p class="subtle">Аккаунт ${e(status.account.id)} · ${e(status.origin)}</p></div><span class="tag">Подключено</span></div><h4>Активные устройства и сессии</h4><div class="stack">${sessions?.length?sessions.map(sessionRow).join(''):'<p class="subtle">Нет доступных данных о сессиях.</p>'}</div><div class="row">${btn('logout','Выйти на этом устройстве')}${btn('logoutAll','Завершить все сессии')}</div></div>${teamPanel(teamsData)}${cloudStoragePanel(storageData)}${sharedKnowledgePanel(knowledgeData)}${teamTacticalPanel(tacticalData)}${cloudFilesPanel(filesData)}`;
  }
  if(status.offline)return `${server}<div class="cloud-account"><p role="alert">Не удалось подтвердить сессию на сервере. Последний аккаунт: <strong>${e(status.lastAccount||'—')}</strong>. Никакие облачные действия пока недоступны.</p><p class="subtle">${e(status.error||'Нет соединения')}</p><div class="row">${btn('refresh','Повторить проверку')}${btn('forgetLocal','Удалить локальные токены')}</div></div>`;
  return `${server}${status.expired?'<p role="status">Сессия завершена или отозвана. Войдите повторно.</p>':''}${configured?`<div class="cloud-account"><div class="cloud-auth-grid"><form id="cloud-login-form" class="stack"><h3>Войти</h3><label>Логин<input name="username" required minlength="3" maxlength="32" autocomplete="username" pattern="[a-zA-Z][a-zA-Z0-9_.-]{2,31}"></label><label>Пароль<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="current-password"></label><label>Название устройства<input name="deviceName" required maxlength="70" value="Этот браузер"></label><button class="button primary">Войти</button></form><form id="cloud-register-form" class="stack"><h3>Создать аккаунт</h3><label>Логин<input name="username" required minlength="3" maxlength="32" autocomplete="username" pattern="[a-zA-Z][a-zA-Z0-9_.-]{2,31}"></label><label>Пароль (минимум 12 символов)<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><label>Название устройства<input name="deviceName" required maxlength="70" value="Этот браузер"></label><button class="button secondary">Создать аккаунт</button></form></div></div>`:'<p class="subtle">Сначала подключите сервер. На устройстве без собственного сервера облачная авторизация недоступна; локальные функции работают без изменений.</p>'}`;
}
export async function mountCloudIdentity(root,feedback){
  if(!root)return;
  try{
    const status=await cloudRpc('status');
    const sessions=status.authenticated?(await cloudRpc('sessions')).sessions:null;
    let teamsData=null,storageData=null,knowledgeData=null,tacticalData=null,filesData=null;
    if(status.authenticated){
      try{
        const {teams}=await cloudRpc('teams');
        if(!teams.some(x=>x.id===selectedTeamId))selectedTeamId=teams[0]?.id??null;
        teamsData={teams,accountId:status.account.id};
        if(selectedTeamId){
          const team=teams.find(x=>x.id===selectedTeamId);
          const [memberData,inviteData]=await Promise.all([cloudRpc('teamMembers',{teamId:selectedTeamId}),['admin','owner'].includes(team.role)?cloudRpc('teamInvitations',{teamId:selectedTeamId}):Promise.resolve({invitations:[]})]);
          Object.assign(teamsData,{team,members:memberData.members,invitations:inviteData.invitations});
          try{storageData=await loadCloudWorkspace(team,cloudRpc);}catch(error){storageData={error:error.message};}
          try{knowledgeData=await loadSharedKnowledge(team,storageData,cloudRpc);}catch(error){knowledgeData={error:error.message};}
          try{tacticalData=await loadTeamTactical(team,storageData,cloudRpc);}catch(error){tacticalData={error:error.message};}
          try{filesData=await loadCloudFiles(team,storageData,cloudRpc);}catch(error){filesData={error:error.message};}
        }
      }catch(error){teamsData={teams:[],error:'Команды временно недоступны: '+error.message};}
    }else{selectedTeamId=null;lastCreatedInvite=null;}
    if(root.isConnected)replaceHtml(root,authPanel(status,sessions,teamsData,storageData,knowledgeData,tacticalData,filesData));
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
  }else if(id==='cloud-team-create-form'){
    const result=await cloudRpc('teamCreate',{name:form.elements.namedItem('name').value});selectedTeamId=result.team.id;lastCreatedInvite=null;feedback('Команда создана');
  }else if(id==='cloud-team-accept-form'){
    const token=form.elements.namedItem('token').value.trim();form.elements.namedItem('token').value='';
    const result=await cloudRpc('teamAccept',{token});selectedTeamId=result.team.id;lastCreatedInvite=null;feedback('Приглашение принято');
  }else if(id==='cloud-team-invite-form'){
    const teamId=form.dataset.teamId;
    const result=await cloudRpc('teamInvite',{teamId,role:form.elements.namedItem('role').value,targetUsername:form.elements.namedItem('targetUsername').value.trim()});
    lastCreatedInvite={teamId,token:result.token};feedback('Приглашение создано; код покажется один раз');
  }else if(id==='cloud-team-role-form'){
    await cloudRpc('teamMemberRole',{teamId:form.dataset.teamId,accountId:form.dataset.memberId,role:form.elements.namedItem('role').value});feedback('Роль изменена');
  }else if(id==='cloud-team-transfer-form'){
    const accountId=form.elements.namedItem('accountId').value;
    if(!confirm('Передать владение командой этому участнику? Вы станете администратором.'))return;
    await cloudRpc('teamTransfer',{teamId:form.dataset.teamId,accountId});feedback('Владелец изменён');
  }else if(id.startsWith('cloud-files-')){
    await handleCloudFilesSubmit(form,feedback,cloudRpc);
  }else if(id.startsWith('cloud-tactical-')){
    await handleTacticalForm(form,feedback,cloudRpc);
  }else if(id.startsWith('cloud-knowledge-')){
    await handleSharedKnowledgeSubmit(form,feedback,cloudRpc);
  }else if(['cloud-profile-create-form','cloud-profile-bind-form','cloud-profile-import-form','cloud-directory-filter-form'].includes(id)){
    await handleCloudStorageSubmit(form,feedback,cloudRpc);
  }else throw Error('Неизвестная форма Cloud Identity');
  await mountCloudIdentity(document.getElementById('cloud-identity-root'),feedback);
}
export async function handleCloudAction(button,feedback){
  const action=button.dataset.cloudAction;
  if(action?.startsWith('file')){await handleCloudFilesAction(button,feedback,cloudRpc);await mountCloudIdentity(document.getElementById('cloud-identity-root'),feedback);return;}
  if(action?.startsWith('tactical')){await handleTacticalAction(button,feedback,cloudRpc);await mountCloudIdentity(document.getElementById('cloud-identity-root'),feedback);return;}
  if(action?.startsWith('knowledge')){await handleSharedKnowledgeAction(button,feedback,cloudRpc);await mountCloudIdentity(document.getElementById('cloud-identity-root'),feedback);return;}
  if(['cloudUnbind','cloudRefresh','syncEnable','syncDisable','syncNow','syncResolveCloud','syncResolveLocal','directoryFirst','directoryNext'].includes(action)){await handleCloudStorageAction(button,feedback,cloudRpc);await mountCloudIdentity(document.getElementById('cloud-identity-root'),feedback);return;}
  if(action==='refresh'){await mountCloudIdentity(document.getElementById('cloud-identity-root'),feedback);return;}
  if(action==='teamSelect'){
    selectedTeamId=button.dataset.teamId;lastCreatedInvite=null;
    await mountCloudIdentity(document.getElementById('cloud-identity-root'),feedback);return;
  }
  if(['teamInviteRevoke','teamMemberRemove','teamLeave','teamDelete'].includes(action)){
    const names={teamInviteRevoke:'Отозвать приглашение?',teamMemberRemove:'Исключить выбранного участника?',teamLeave:'Покинуть команду?',teamDelete:'Безвозвратно удалить команду, участников и приглашения?'};
    if(!confirm(names[action]))return;
    const input={teamId:button.dataset.teamId,invitationId:button.dataset.invitationId,accountId:button.dataset.accountId};
    await cloudRpc(action,input);
    if(['teamLeave','teamDelete'].includes(action))selectedTeamId=null;
    lastCreatedInvite=null;
    await mountCloudIdentity(document.getElementById('cloud-identity-root'),feedback);
    feedback('Командная операция выполнена');return;
  }
  if(action==='revoke'&&!confirm(button.dataset.current==='1'?'Отозвать текущую сессию?':'Отозвать сессию выбранного устройства?'))return;
  if(action==='logoutAll'&&!confirm('Завершить все облачные сессии на всех устройствах?'))return;
  if(action==='forgetLocal'&&!confirm('Удалить локальные токены без отзыва удалённой сессии? Для безопасности затем завершите её с другого устройства.'))return;
  if(!['revoke','logout','logoutAll','forgetLocal'].includes(action))throw Error('Неизвестная операция Cloud Identity');
  await cloudRpc(action,action==='revoke'?{id:button.dataset.id}:{});
  await mountCloudIdentity(document.getElementById('cloud-identity-root'),feedback);
  feedback(action==='forgetLocal'?'Локальные токены удалены. Удалённая сессия может оставаться активной.':'Операция с сессиями выполнена');
}

export async function changeCloudLocalProfile(localId,feedback){selectCloudLocalProfile(localId);await mountCloudIdentity(document.getElementById('cloud-identity-root'),feedback);}
