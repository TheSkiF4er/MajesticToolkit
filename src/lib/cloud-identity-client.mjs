/** Cloud Identity 2.3.2: privileged background-only credential store + authenticated requests. */
export const CLOUD_CONFIG_KEY='mtCloudIdentityConfigV231';
export const CLOUD_SESSION_KEY='mtCloudIdentitySessionV231';
export function cloudEndpoint(raw){
  if(typeof raw!=='string'||raw.length>300)throw Error('Укажите адрес Cloud Identity Server');
  let url;try{url=new URL(raw.trim());}catch{throw Error('Некорректный адрес Cloud Identity Server');}
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!url.hostname||!['http:','https:'].includes(url.protocol))throw Error('Адрес должен содержать только HTTPS-домен (без пути, логина и параметров)');
  if(url.protocol==='http:'&&url.hostname!=='127.0.0.1')throw Error('HTTP разрешён только для локального сервера 127.0.0.1');
  if(url.origin.length>250)throw Error('Слишком длинный адрес сервера');
  return url.origin;
}
export function cloudHostPattern(origin){const u=new URL(cloudEndpoint(origin));return `${u.protocol}//${u.hostname}/*`;}
function safeCredentials(username,password,deviceName){
  if(typeof username!=='string'||!/^[a-z][a-z0-9_.-]{2,31}$/.test(username.toLowerCase().trim())||typeof password!=='string'||password.length<12||password.length>128||new TextEncoder().encode(password).length>512||typeof deviceName!=='string'||deviceName.trim().length<1||deviceName.trim().length>70)throw Error('Логин: 3–32 латинских символа; пароль: 12–128 символов; укажите устройство');
  return {username:username.toLowerCase().trim(),password,deviceName:deviceName.trim()};
}
export function createCloudIdentityService({storage,permissions,fetchImpl=fetch,now=Date.now}){
  let access=null,queue=Promise.resolve();
  const enqueue=fn=>{const job=queue.then(fn);queue=job.catch(()=>{});return job;};
  const read=async key=>(await storage.get(key))[key];
  const write=async(key,value)=>storage.set({[key]:value});
  const clear=async()=>{access=null;await storage.remove(CLOUD_SESSION_KEY);};
  async function config(){return (await read(CLOUD_CONFIG_KEY))?.origin||'';}
  async function saved(){return await read(CLOUD_SESSION_KEY)||null;}
  async function checked(origin){if(!await permissions.contains({origins:[cloudHostPattern(origin)]}))throw Error('Не предоставлено разрешение на обращение к Cloud Identity Server');}
  async function request(origin,path,{method='GET',body=null,token=null}={}){
    await checked(origin);
    let response;
    try{
      response=await fetchImpl(origin+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)});
    }catch{throw Error('Сервер идентификации недоступен. Проверьте адрес, TLS и подключение');}
    let payload;
    try{payload=await response.json();}catch{throw Error('Сервер вернул некорректный ответ');}
    if(!response.ok){const err=new Error(typeof payload?.error==='string'?payload.error.slice(0,180):`Cloud Identity: HTTP ${response.status}`);err.status=response.status;throw err;}
    return payload;
  }
  async function accept(origin,credentials){
    if(!credentials?.account?.id||!credentials?.account?.username||!credentials?.sessionId||!credentials?.accessToken||!credentials?.refreshToken||!Number.isFinite(Date.parse(credentials.accessExpiresAt)))throw Error('Сервер вернул неполную сессию');
    const record={origin,account:credentials.account,sessionId:credentials.sessionId,refreshToken:credentials.refreshToken};
    // Only the background process handles tokens; never serialize them back to UI.
    await write(CLOUD_SESSION_KEY,record);
    access={token:credentials.accessToken,expires:Date.parse(credentials.accessExpiresAt),sessionId:credentials.sessionId};
    return {authenticated:true,origin,account:credentials.account,sessionId:credentials.sessionId};
  }
  async function refreshActive(){
    const record=await saved();if(!record)return null;
    if(access?.sessionId===record.sessionId&&access.expires>now()+30_000)return {origin:record.origin,token:access.token,record};
    let result;
    try{result=await request(record.origin,'/v1/auth/refresh',{method:'POST',body:{refreshToken:record.refreshToken}});}
    catch(error){if(error.status===401||error.status===403)await clear();throw error;}
    await accept(record.origin,result);
    return {origin:record.origin,token:access.token,record:await saved()};
  }
  async function authed(path,opts={}){
    let session=await refreshActive();if(!session)throw Error('Сначала войдите в облачный аккаунт');
    try{return await request(session.origin,path,{...opts,token:session.token});}
    catch(error){
      if(error.status!==401)throw error;
      // Access revoked/expired. Attempt one refresh; if this fails, credentials are removed.
      access=null;session=await refreshActive();return request(session.origin,path,{...opts,token:session.token});
    }
  }
  async function execute(action,input={}){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Некорректный запрос');
    const origin=await config();
    if(action==='configure'){
      const next=cloudEndpoint(input.origin);
      const existing=await saved();if(existing&&existing.origin!==next)throw Error('Сначала выйдите из текущего аккаунта');
      await checked(next);await request(next,'/v1/health');await write(CLOUD_CONFIG_KEY,{origin:next});return {configured:true,origin:next};
    }
    if(action==='status'){
      const record=await saved();if(!record)return {configured:Boolean(origin),origin,authenticated:false};
      try{const me=await authed('/v1/auth/me');return {configured:true,origin:record.origin,authenticated:true,account:me.account,session:me.session};}
      catch(error){
        if(!await saved())return {configured:Boolean(origin),origin,authenticated:false,expired:true};
        return {configured:true,origin:record.origin,authenticated:false,offline:true,lastAccount:record.account?.username||'',error:error.message};
      }
    }
    if(action==='login'||action==='register'){
      if(!origin)throw Error('Сначала подключите Cloud Identity Server');
      if(await saved())throw Error('Сначала выйдите из текущего облачного аккаунта');
      const body=safeCredentials(input.username,input.password,input.deviceName);
      const result=await request(origin,action==='register'?'/v1/auth/register':'/v1/auth/login',{method:'POST',body});
      return accept(origin,result);
    }
    // Team credentials are never sent to the page. Every team operation runs in background
    // with the current access token and is independently authorized by the server.
    const teamId=input.teamId;
    const teamPath=()=>{
      if(typeof teamId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(teamId))throw Error('Некорректный идентификатор команды');
      return '/v1/teams/'+teamId;
    };
    const memberPath=()=>{
      if(typeof input.accountId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input.accountId))throw Error('Некорректный участник');
      return teamPath()+'/members/'+input.accountId;
    };
    if(action==='teams')return authed('/v1/teams');
    if(action==='teamCreate')return authed('/v1/teams',{method:'POST',body:{name:input.name}});
    if(action==='teamDetail')return authed(teamPath());
    if(action==='teamMembers')return authed(teamPath()+'/members');
    if(action==='teamInvitations')return authed(teamPath()+'/invitations');
    if(action==='teamActivity')return authed(teamPath()+'/activity');
    if(action==='teamInvite')return authed(teamPath()+'/invitations',{method:'POST',body:{role:input.role,targetUsername:input.targetUsername}});
    if(action==='teamAccept')return authed('/v1/teams/invitations/accept',{method:'POST',body:{token:input.token}});
    if(action==='teamInviteRevoke'){
      if(typeof input.invitationId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input.invitationId))throw Error('Некорректное приглашение');
      return authed(teamPath()+'/invitations/'+input.invitationId,{method:'DELETE'});
    }
    if(action==='teamMemberRole')return authed(memberPath(),{method:'PATCH',body:{role:input.role}});
    if(action==='teamMemberRemove')return authed(memberPath(),{method:'DELETE'});
    if(action==='teamTransfer')return authed(teamPath()+'/transfer',{method:'POST',body:{accountId:input.accountId}});
    if(action==='teamLeave')return authed(teamPath()+'/leave',{method:'POST'});
    if(action==='teamDelete')return authed(teamPath(),{method:'DELETE'});
    if(action==='sessions')return authed('/v1/auth/sessions');
    if(action==='revoke'){
      if(typeof input.id!=='string'||!/^[0-9a-f-]{36}$/.test(input.id))throw Error('Некорректный идентификатор сессии');
      const result=await authed('/v1/auth/sessions/'+input.id,{method:'DELETE'});
      if(result.current)await clear();return result;
    }
    if(action==='logout'||action==='logoutAll'){
      await authed(action==='logout'?'/v1/auth/logout':'/v1/auth/logout-all',{method:'POST'});
      await clear();return {ok:true};
    }
    if(action==='forgetLocal'){await clear();return {ok:true,warning:'Токен удалён локально. Удалённая сессия не отозвана.'};}
    throw Error('Неизвестное действие Cloud Identity');
  }
  return {handle:(action,input)=>enqueue(()=>execute(action,input)),cloudEndpoint};
}
