import {MARKET_PREFIX} from '../lib/marketplace-core.mjs';
import {createCloudIdentityService} from '../lib/cloud-identity-client.mjs';
import {FAMILY_PREFIX} from '../lib/family-core.mjs';
import {ORGANIZATION_PREFIX} from '../lib/organization-core.mjs';
import {getVaultRecord,verifyVaultFile} from '../lib/evidence-vault.mjs';
import {moderationOpsFor} from '../lib/moderation-ops-store.mjs';
import {registryAction} from '../lib/punishment-registry-store.mjs';
import {sectionAction,sectionView,scanSections,SECTION_KEY} from '../lib/section-monitor-store.mjs';
import {punishmentOverlay,OVERLAY_PREFIX,overlayThread} from '../lib/punishment-overlay-store.mjs';
import {RULES_KEY} from '../lib/rules-core.mjs';
import {readingPosition} from '../lib/forum-reading-store.mjs';
import {getLocalIndex,invalidateSearch} from '../lib/productivity-search.mjs';
import {searchRecords,SECTION_FOR} from '../lib/productivity-core.mjs';
import {modifyState,loadState} from '../lib/state.mjs';
import {selectProfile} from '../lib/model.mjs';
import {forumSettingsFor} from '../lib/forum-settings.mjs';
/* MajesticToolkit background: static ES module dependencies for all browsers. */
import * as importedStore from '../lib/complaints-store.mjs';
import * as importedForum from '../lib/forum-store.mjs';
import * as importedMonitor from '../lib/monitor-store.mjs';
import * as importedXenForo from '../lib/xenforo-store.mjs';
import {listTimers,addTimer,completeTimer,removeTimer} from '../lib/timers-store.mjs';
import {ALARM_PREFIX,NOTIFICATION_PREFIX,timerAlarm,timerNotification} from '../lib/timers-core.mjs';
import '../lib/xenforo-core.js';
import '../lib/complaints-core.js';
import {contentSender,extensionPageSender,matchingForumProfile,validatePayloadSize} from '../lib/message-security.mjs';
const api = globalThis.browser ?? globalThis.chrome;
const cloudIdentity=createCloudIdentityService({storage:api.storage.local,permissions:api.permissions});
const FORUMS = [
  { id:'rp-nexus-majestic-forum-v3', origin:'https://forum.majestic-rp.ru/*' },
  { id:'rp-nexus-russia-forum-v3', origin:'https://forum.russia.online/*' }
];
const VIDEOS = [
  { id:'rp-nexus-youtube-v3', origin:'https://www.youtube.com/*' },
  { id:'rp-nexus-rutube-v3', origin:'https://rutube.ru/*' },
  { id:'rp-nexus-twitch-v3', origin:'https://www.twitch.tv/*' }
];
const LEGACY = ['rp-nexus-majestic-launcher-v1','rp-nexus-majestic-forum-v2','rp-nexus-russia-forum-v2'];
const storePromise = Promise.resolve(importedStore);
const forumStorePromise = Promise.resolve(importedForum);
const corePromise = Promise.resolve(globalThis.RPNComplaints);
async function syncScripts() {
  try {
    const registrations = await api.scripting.getRegisteredContentScripts();
    const old = registrations.filter(r => LEGACY.includes(r.id)).map(r => r.id);
    if (old.length) await api.scripting.unregisterContentScripts({ids:old});
    const byId = new Map(registrations.map(r=>[r.id,r]));
    for (const site of [...FORUMS, ...VIDEOS]) {
      try {
        const granted = await api.permissions.contains({origins:[site.origin]});
        const isForum = FORUMS.includes(site);
        const wanted={id:site.id,matches:[site.origin],js:isForum ? ['lib/safe-dom.js','lib/forum-core.js','lib/xenforo-core.js','lib/complaints-core.js','lib/forum-customization.js','content/forum/context.js','content/forum/editors.js','content/forum/navigation.js','content/forum/lifecycle.js','content/forum/customization.js','content/forum/punishment-overlay.js','lib/section-monitor-core.js','content/forum/section-scanner.js','content/forum.js'] : ['lib/safe-dom.js','lib/complaints-core.js','content/evidence.js'],runAt:'document_idle',allFrames:false,persistAcrossSessions:true};
        const current=byId.get(site.id);
        const obsolete=current&&(JSON.stringify(current.js)!==JSON.stringify(wanted.js) || JSON.stringify(current.matches)!==JSON.stringify(wanted.matches) || current.runAt!==wanted.runAt || current.allFrames!==false);
        // Persisted registrations from a previous version must be replaced on upgrade.
        if(current&&(!granted||obsolete))await api.scripting.unregisterContentScripts({ids:[site.id]});
        if(granted&&(!current||obsolete)) {
          await api.scripting.registerContentScripts([wanted]);
          // registerContentScripts only affects future navigations. Enable on existing tabs now.
          // The content scripts guard against duplicate initialization on the same document.
          try {
            const tabs = await api.tabs.query({url:[site.origin]});
            await Promise.allSettled(tabs.filter(tab=>Number.isInteger(tab.id)&&tab.id>=0).map(tab=>
              api.scripting.executeScript({target:{tabId:tab.id},files:wanted.js}).then(()=>isForum?api.tabs.sendMessage(tab.id,{type:'RP_NEXUS_REFRESH_FORUM_DATA'}).catch(()=>{}):undefined)
            ));
          } catch (error) {
            console.warn('MajesticToolkit: existing tabs will need refresh',site.origin,error);
          }
        }
      } catch(error) { console.error('MajesticToolkit: не удалось настроить сайт',site.origin,error); }
    }
  } catch (error) { console.error('MajesticToolkit: не удалось зарегистрировать скрипты',error); }
}
async function openCaseFromNotification(notificationId) {
  const match = /^(?:rpn_reply_|rpn_deadline_)([\w-]{8,120})$/.exec(notificationId);
  if (!match) return;
  try { const {getCase} = await storePromise; const record = await getCase(match[1]); await api.tabs.create({url:record.url}); }
  catch (error) { console.warn('MajesticToolkit: переход из уведомления',error); }
  await api.notifications.clear(notificationId).catch(() => {});
}
async function handleTimerAlarm(id) {
  const timer=await completeTimer(id);
  if(!timer)return;
  try {
    await api.notifications.create(timerNotification(timer.id),{type:'basic',iconUrl:'assets/icon-128.png',title:'MajesticToolkit · Таймер завершён',message:timer.title});
  } catch(error) { console.warn('MajesticToolkit: уведомление таймера недоступно',error); }
}
async function restoreTimerAlarms() {
  const now=Date.now();
  const timers=await listTimers();
  for(const timer of timers) {
    if(timer.status!=='active')continue;
    if(timer.expiresAt<=now)await handleTimerAlarm(timer.id);
    else await api.alarms.create(timerAlarm(timer.id),{when:timer.expiresAt});
  }
}
api.notifications.onClicked.addListener(id => {
  if(id.startsWith('mt_section_')){void (async()=>{const data=(await api.storage.local.get(SECTION_KEY))[SECTION_KEY];const sub=data?.subscriptions?.find(s=>s.id===id.slice('mt_section_'.length));if(sub)await api.tabs.create({url:api.runtime.getURL('ui/workspace.html?sectionMonitor='+encodeURIComponent(sub.profileId)+'#complaints')});await api.notifications.clear(id);})().catch(()=>{});return;}
  if(id.startsWith(NOTIFICATION_PREFIX)) {
    void api.tabs.create({url:api.runtime.getURL('ui/workspace.html#timers')}).catch(error=>console.warn('MajesticToolkit: таймеры',error));
    void api.notifications.clear(id).catch(()=>{});
    return;
  }
  void openCaseFromNotification(id);
});
async function notifyChange(c) {
  try { await api.notifications.create(`rpn_reply_${c.id}`,{type:'basic',iconUrl:'assets/icon-128.png',title:'MajesticToolkit · Новые сообщения',message:`${c.title.slice(0,100)}: найдены новые ответы. Откройте тему для проверки.`}); }
  catch (error) {console.warn('MajesticToolkit: уведомление не показано',error);}
}
async function scanTabs() {
  let count = 0;
  for (const forum of FORUMS) {
    if (!await api.permissions.contains({origins:[forum.origin]})) continue;
    const tabs = await api.tabs.query({url:[forum.origin]});
    for (const tab of tabs) {
      if (!tab.id || !tab.url || !/\/threads\//i.test(new URL(tab.url).pathname)) continue;
      try { await api.tabs.sendMessage(tab.id,{type:'RP_NEXUS_SCAN_THREAD'}); count++; }
      catch { /* Navigating or unloaded tabs are expected. */ }
    }
  }
  return count;
}
async function checkDeadlines() {
  const store=await storePromise;
  const now=Date.now(),savedState=(await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;
  const profiles=savedState?.profiles??[];
  const ops=await Promise.all(profiles.map(async p=>[p.id,await moderationOpsFor(p)]));
  const policies=new Map(ops);
  for(const item of await store.listCases()){
    if(!item.deadline||item.status==='done')continue;
    const policy=policies.get(item.profileId)?.policy;
    if(policy?.notifications===false)continue;
    const remaining=(Date.parse(item.deadline)-now)/60000;
    const levels=policy?.alerts??[1440,60,15,0];
    const tier=levels.filter(m=>remaining<=m).sort((a,b)=>a-b)[0];
    if(tier===undefined)continue;
    const key=`majesticDeadlineV14:${item.id}`;
    const saved=(await api.storage.local.get(key))[key];
    if(saved?.deadline===item.deadline && saved?.tier===tier)continue;
    const description=tier===0?'срок истёк':`до срока осталось не более ${tier} минут`;
    try {
      await api.notifications.create(`rpn_deadline_${item.id}`,{type:'basic',iconUrl:'assets/icon-128.png',title:'MajesticToolkit · Срок жалобы',message:`${item.title.slice(0,110)}: ${description}.`});
      await api.storage.local.set({[key]:{deadline:item.deadline,tier}});
      await store.recordDeadlineNotification(item.id,tier).catch(err=>console.warn('MajesticToolkit: журнал уведомлений',err));
    }catch(error){console.warn('MajesticToolkit: уведомление о сроке',error);}
  }
  // Local rules are idempotent; they never send actions to XenForo.
  for(const [id,config] of ops)if(config.rules.some(r=>r.enabled&&r.trigger==='overdue')){
    try{await store.runOverdueAutomations(id,now);}
    catch(error){console.warn('MajesticToolkit: автоматизация срока',error);}
  }
}
async function tick() { try { await scanTabs(); await checkDeadlines(); await scanSections(); } catch(error) { console.warn('MajesticToolkit: периодическая проверка',error); } }
let pendingSync=Promise.resolve();
function scheduleSyncScripts(){
  // Two permission events may fire before Chrome has persisted the first registration.
  const job=pendingSync.then(syncScripts);
  pendingSync=job.catch(error=>console.error('MajesticToolkit: синхронизация скриптов',error));
  return job;
}
function start() {
  // Content scripts are not permitted to read extension-owned storage where supported.
  void (async()=>{
    try { await api.storage.local.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'}); }
    catch(error){console.warn('MajesticToolkit: storage access level unsupported',error);}
    await scheduleSyncScripts();
  })();
  void api.alarms.create('mt-cloud-sync-v234',{periodInMinutes:1}).catch(error=>console.warn('MajesticToolkit: cloud sync alarm',error));
  void cloudIdentity.handle('syncTick',{}).catch(error=>console.warn('MajesticToolkit: cloud sync startup',error));
  void api.alarms.create('rp-nexus-open-tabs-v3',{periodInMinutes:5}).catch(err => console.warn('MajesticToolkit: alarms',err));
  void restoreTimerAlarms().catch(error=>console.warn('MajesticToolkit: восстановление таймеров',error));
}
api.runtime.onInstalled.addListener(start);
api.runtime.onStartup?.addListener(start);
api.storage.onChanged.addListener((changes,area) => {
  if(area==='local'&&Object.keys(changes).some(k=>k.startsWith(FAMILY_PREFIX)||k.startsWith(ORGANIZATION_PREFIX)||k.startsWith(MARKET_PREFIX))){
    void cloudIdentity.handle('syncTick',{}).catch(error=>console.warn('MajesticToolkit: cloud sync changes',error));
  }
  if(area==='local'){
    const draftProfiles=Object.keys(changes).filter(k=>k.startsWith(OVERLAY_PREFIX)).map(k=>k.slice(OVERLAY_PREFIX.length));
    if(draftProfiles.length)void api.tabs.query({}).then(tabs=>Promise.allSettled(tabs.filter(t=>t.id&&FORUMS.some(f=>t.url?.startsWith(f.origin.slice(0,-1)))).flatMap(t=>draftProfiles.map(profileId=>api.tabs.sendMessage(t.id,{type:'MT_PUNISHMENT_DRAFT_CHANGED',profileId}))))).catch(()=>{});
  }
  if(area==='local'&&Object.keys(changes).some(k=>!k.startsWith('mtNavigationHistory:')&&!k.startsWith(OVERLAY_PREFIX)))invalidateSearch();
  if (area !== 'local' || !Object.keys(changes).some(k=> k===RULES_KEY||k==='rpNexusStateV1'||k.startsWith('rpnForumTemplateV2:')||k.startsWith('majesticToolkitXfNavV11:')||k.startsWith('mtNavigationHistory:')||k.startsWith('rpnComplaintV3:'))) return;
  void api.tabs.query({}).then(tabs=>Promise.allSettled(tabs.filter(t=>t.id&&FORUMS.some(f=>t.url?.startsWith(f.origin.slice(0,-1)))).map(t=>api.tabs.sendMessage(t.id,{type:'RP_NEXUS_REFRESH_FORUM_DATA'})))).catch(()=>{});
});
api.permissions.onAdded.addListener(() => {void scheduleSyncScripts();});
api.permissions.onRemoved.addListener(() => {
  void scheduleSyncScripts();
  // Revoked hosts may no longer expose tab URLs; notify existing content scripts by tab ID.
  void (async()=>{const hosts=[];for(const site of FORUMS)if(!await api.permissions.contains({origins:[site.origin]}))hosts.push(new URL(site.origin).hostname);if(!hosts.length)return;const tabs=await api.tabs.query({});await Promise.allSettled(tabs.filter(t=>Number.isInteger(t.id)).map(t=>api.tabs.sendMessage(t.id,{type:'RP_NEXUS_FORUM_PERMISSION_REVOKED',hosts})));})().catch(()=>{});
});
api.alarms.onAlarm.addListener(alarm => {if(alarm.name==='mt-cloud-sync-v234')void cloudIdentity.handle('syncTick',{}).catch(error=>console.warn('MajesticToolkit: sync retry',error));
  if (alarm.name === 'rp-nexus-open-tabs-v3') void tick();
  if(alarm.name.startsWith(ALARM_PREFIX))void handleTimerAlarm(alarm.name.slice(ALARM_PREFIX.length)).catch(error=>console.warn('MajesticToolkit: завершение таймера',error));
});
api.runtime.onMessage.addListener((message,sender,sendResponse) => {
  if (!message || typeof message !== 'object') return;
  const isTrustedExtension=extensionPageSender(sender,api.runtime);
  const isForum=contentSender(sender,api.runtime.id,'forum');
  const isVideo=contentSender(sender,api.runtime.id,'video');
  async function task() {
    validatePayloadSize(message,isTrustedExtension&&message.type==='RP_NEXUS_CASE_MUTATE'&&message.action==='moderation'?350000:message.type==='MT_CLOUD_IDENTITY'&&message.action==='cloudImport'&&isTrustedExtension?600000:65536);
    if(isForum && message.type!=='RP_NEXUS_FORUM_DATA' && !await api.permissions.contains({origins:[`https://${new URL(sender.url).hostname}/*`]}))throw Error('Доступ к форуму отозван');
    if(message.type==='MT_CLOUD_IDENTITY'){if(!isTrustedExtension)throw Error('Недоверенный источник Cloud Identity');return cloudIdentity.handle(message.action,message.input);}
    if(message.type==='MT_SECTION_MONITOR'){if(!isTrustedExtension)throw Error('Недоверенный источник');if(message.action==='list')return sectionView(message.profileId);if(message.action==='scan')return scanSections(message.profileId,message.input?.id??null);return sectionAction(message.profileId,message.action,message.input);}
    if(message.type==='MT_NATIVE_MODERATION'){
      if(!isForum)throw Error('Недоверенный источник');
      const state=await api.storage.local.get('rpNexusStateV1'),v=state.rpNexusStateV1,XF=globalThis.MTXenForo;
      const host=XF.domain(sender.url),p=XF.matchingProfile(v?.profiles,v?.activeProfileId,sender.url);
      if(!p||p.id!==message.profileId||!forumSettingsFor(v.preferences?.forum,host,p.id).enabled||!Object.hasOwn(XF.MODERATION_ACTIONS,message.action))throw Error('Контекст модерации изменился');
      if(!/^\/threads\/(?:[^/]+\.)?\d+(?:\/page-\d+)?\/?$/i.test(new URL(sender.url).pathname))throw Error('Нужна страница конкретной темы');
      const key=globalThis.RPNComplaints.threadKey(sender.url),c=(await importedStore.listCases()).find(x=>x.profileId===p.id&&x.threadKey===key);
      if(c)await importedStore.mutateCaseWorkflow(c.id,'note',{text:'Запрошено штатное действие XenForo: '+XF.MODERATION_ACTIONS[message.action]+'. Результат не подтверждён.'});
      return true;
    }
    if (message.type === 'RP_NEXUS_OPEN_WORKSPACE') {
      if (!isForum && !isVideo && !isTrustedExtension) throw Error('Недоверенный источник');
      if(message.view==='evidence-case'){
        if(!isForum)throw Error('Нужна тема форума');
        const v=(await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;
        const p=globalThis.MTXenForo.matchingProfile(v?.profiles,v?.activeProfileId,sender.url);
        const key=globalThis.RPNComplaints.threadKey(sender.url);
        const c=(await importedStore.listCases()).find(x=>x.profileId===p?.id&&x.threadKey===key);
        if(!c||p.id!==v.activeProfileId)throw Error('Выберите профиль жалобы');
        await api.tabs.create({url:api.runtime.getURL('ui/workspace.html?evidenceTab=timeline&evidenceCase='+encodeURIComponent(c.id)+'#evidence')});return true;
      }
      if(message.view==='registry'){
        if(!isForum)throw Error('Нужна тема форума');const v=(await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1,p=globalThis.MTXenForo.matchingProfile(v?.profiles,v?.activeProfileId,sender.url);const key=globalThis.RPNComplaints.threadKey(sender.url);const c=(await importedStore.listCases()).find(x=>x.profileId===p?.id&&x.threadKey===key);if(!c||p.id!==v.activeProfileId)throw Error('Выберите профиль жалобы');await api.tabs.create({url:api.runtime.getURL('ui/workspace.html?rulesTab=registry&registryCase='+encodeURIComponent(c.id)+'#rules')});return true;
      }
      if(message.view==='calculator'){
        const params=new URLSearchParams({calculator:'1'});
        if(isForum){const state=(await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;const profile=globalThis.MTXenForo.matchingProfile(state?.profiles,state?.activeProfileId,sender.url);const thread=overlayThread(sender.url);if(profile&&thread){params.set('thread',thread);params.set('calcProfile',profile.id);const c=(await importedStore.listCases()).find(c=>c.profileId===profile.id&&c.threadKey===thread);if(c)params.set('caseId',c.id);}}
        await api.tabs.create({url:api.runtime.getURL('ui/workspace.html?'+params+'#rules')});return true;
      }
      await api.tabs.create({url:api.runtime.getURL('ui/workspace.html' + (['customization','navigation','binder'].includes(message.view)?'?section='+message.view+'#forum':['home','forum','complaints','moderation','search','knowledge','evidence','profiles','timers','monitor','economy','rules','law','government','documents','integrations','settings'].includes(message.view) ? '#'+message.view : ''))});
      return true;
    }
    if(message.type === 'MAJESTIC_TIMER') {
      if(!isTrustedExtension)throw Error('Недоверенный источник');
      if(message.action==='create') {
        const timer=await addTimer(message.input);
        try{await api.alarms.create(timerAlarm(timer.id),{when:timer.expiresAt});}
        catch(error){await removeTimer(timer.id);throw error;}
        return timer;
      }
      if(message.action==='remove') {
        const id=message.id;
        if(typeof id!=='string'||!/^[a-z0-9-]{8,100}$/i.test(id))throw Error('Неверный ID таймера');
        await removeTimer(id);
        await api.alarms.clear(timerAlarm(id));
        await api.notifications.clear(timerNotification(id)).catch(()=>{});
        return true;
      }
      throw Error('Неизвестная операция таймера');
    }
    if (message.type === 'RP_NEXUS_SCAN_OPEN_TABS') {
      if (!isTrustedExtension) throw Error('Недоверенный источник');
      return scanTabs();
    }
    if (message.type === 'RP_NEXUS_FORUM_DATA') {
      if (!isForum) throw Error('Недоверенный источник');
      const host=globalThis.MTXenForo.domain(sender.url);
      if(!await api.permissions.contains({origins:[`https://${host}/*`]}))return {allowed:false,profile:null,templates:[],links:[]};
      const state = (await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;
      const profile = globalThis.MTXenForo.matchingProfile(state?.profiles,state?.activeProfileId,sender.url);
      const settings=forumSettingsFor(state?.preferences?.forum,host,profile?.id);
      settings.customization=globalThis.MTForumCustomization.resolve(state?.preferences?.forum?.customization,host,profile?.id);
      if (!profile || !settings.enabled) return {profile:null,templates:[],links:[],settings};
      const {listTemplates,binderUsage} = await forumStorePromise;
      // Select only a profile belonging to the sender's forum, not an unrelated active project.
      const templates = (await listTemplates()).filter(t=>t.profileId==='*'||t.profileId===profile.id);
      const links = globalThis.MTXenForo.selectNavigation(await importedXenForo.listXenForoLinks(),profile.id,host);
      const navigationHistory=settings.navigationEnabled&&settings.navigationHistory?await importedXenForo.navigationHistory(profile.id):[];
      const forumProfiles=state.profiles.filter(p=>globalThis.MTXenForo.domain(p.forumUrl)===host).map(({id,name,server})=>({id,name,server}));
      let currentCase=null;try{const key=globalThis.RPNComplaints.threadKey(sender.url),store=await storePromise;const match=(await store.listCases()).find(c=>c.profileId===profile.id&&c.threadKey===key);if(match)currentCase={id:match.id,title:match.title,status:match.status,deadline:match.deadline,moderationStatus:match.moderation?.status??null,violations:match.moderation?.players.reduce((n,p)=>n+p.items.length,0)??0};}catch{}
      return {profile:{id:profile.id,name:profile.name,project:profile.project,server:profile.server},templates,links,settings,navigationHistory,forumProfiles,currentCase,usage:await binderUsage(profile.id)};
    }
    if(message.type==='MT_PUNISHMENT_OVERLAY'){
      if(!isForum)throw Error('Недоверенный источник');
      const state=(await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;
      const XF=globalThis.MTXenForo,host=XF.domain(sender.url),profile=XF.matchingProfile(state?.profiles,state?.activeProfileId,sender.url);
      const settings=forumSettingsFor(state?.preferences?.forum,host,profile?.id);
      if(!profile||profile.project!==XF.FORUMS[host]?.project||!settings.enabled||!settings.punishmentEnabled||message.profileId!==profile.id)throw Error('Оверлей отключён или профиль изменился');
      return punishmentOverlay(profile,sender.url,message);
    }
    if(message.type==='MT_FORUM_READING'){
      if(!isForum)throw Error('Недоверенный источник');
      const state=(await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;
      const XF=globalThis.MTXenForo,host=XF.domain(sender.url),profile=XF.matchingProfile(state?.profiles,state?.activeProfileId,sender.url);
      const settings=forumSettingsFor(state?.preferences?.forum,host,profile?.id);
      const appearance=globalThis.MTForumCustomization.resolve(state?.preferences?.forum?.customization,host,profile?.id);
      if(!profile||!settings.enabled||message.profileId!==profile.id||(!appearance.rememberReading&&message.action!=='clear'))throw Error('Запоминание места чтения отключено или профиль изменился');
      return readingPosition(profile.id,sender.url,message.action,message.postId);
    }
    if(message.type==='MT_NAVIGATION_ACTION'){
      if(!isForum)throw Error('Недоверенный источник');
      const state=(await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;
      const XF=globalThis.MTXenForo,host=XF.domain(sender.url),profile=XF.matchingProfile(state?.profiles,state?.activeProfileId,sender.url);
      const settings=forumSettingsFor(state?.preferences?.forum,host,profile?.id);
      if(!profile||!settings.enabled||(!settings.navigationEnabled&&message.action!=='switch-profile')||message.profileId!==profile.id)throw Error('Навигация отключена или профиль изменился');
      if(message.action==='opened')return importedXenForo.markNavigationOpened(message.id,profile.id,host);
      if(message.action==='bookmark')return importedXenForo.saveCurrentBookmark(profile.id,sender.url,message.title);
      if(message.action==='visit'){if(!settings.navigationHistory)return [];return importedXenForo.recordNavigationVisit(profile.id,sender.url,message.title);}
      if(message.action==='clear-history')return importedXenForo.clearNavigationHistory(profile.id);
      if(message.action==='switch-profile'){
        await modifyState(current=>{const p=current.profiles.find(p=>p.id===message.id);if(!p||XF.domain(p.forumUrl)!==host)throw Error('Профиль другого форума');return selectProfile(current,p.id);});return true;
      }
      if(message.action==='search'){
        if(typeof message.query!=='string'||message.query.length>200)throw Error('Некорректный запрос');
        const rows=searchRecords(await getLocalIndex(),message.query,{profileId:profile.id,host,limit:15});
        return rows.filter(r=>r.type!=='navigation'||!r.host||r.host==='*'||r.host===host).map(r=>{let url='';try{if(r.url)url=XF.safeLink(r.url);}catch{}return {key:r.key,title:r.title,type:r.type,view:SECTION_FOR[r.type],url};});
      }
      throw Error('Неизвестное действие навигации');
    }
    if(message.type==='MT_BINDER_ACTION'){
      if(!isForum)throw Error('Недоверенный источник');
      const state=(await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;
      const profile=globalThis.MTXenForo.matchingProfile(state?.profiles,state?.activeProfileId,sender.url);
      const settings=forumSettingsFor(state?.preferences?.forum,globalThis.MTXenForo.domain(sender.url),profile?.id);
      if(!profile||!settings.enabled||!settings.binderEnabled)throw Error('Биндер отключён');
      if(message.profileId!==profile.id)throw Error('Профиль форума изменился');
      const store=await forumStorePromise;
      if(message.action==='use')return store.recordBinderUsage(profile.id,message.id);
      if(message.action==='favorite')return store.setBinderFavorite(message.id,profile.id,message.favorite);
      throw Error('Неизвестное действие биндера');
    }
    if (message.type === 'MAJESTIC_SAVE_PUBLIC_PLAYER') {
      if(!isForum||!sender.url)throw Error('Запрос принят только с поддерживаемого форума');
      const profile=(await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;
      const linked=globalThis.MTXenForo.matchingProfile(profile?.profiles,profile?.activeProfileId,sender.url);
      if(!linked)throw Error('Не найден профиль для этого форума');
      const card=message.card;
      const actual=new URL(sender.url),target=new URL(card?.url);
      if(actual.origin!==target.origin||actual.pathname!==target.pathname||!/^\/members\/[^/]+/i.test(actual.pathname))throw Error('Сохранять можно только открытую публичную страницу пользователя');
      const validated={...card,profileId:linked.id,url:actual.origin+actual.pathname,capturedAt:new Date().toISOString()};
      await importedMonitor.storePlayer(validated);
      return {saved:true,name:validated.name};
    }
    if (message.type === 'RP_NEXUS_VIDEO_CASES') {
      if (!isVideo) throw Error('Недоверенный источник');
      const state = (await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;
      if (!state?.activeProfileId) return [];
      const {listCases} = await storePromise;
      return (await listCases()).filter(c=>c.profileId===state.activeProfileId).map(c=>({id:c.id,title:c.title}));
    }
    const store = await storePromise;
    if (message.type === 'RP_NEXUS_TRACK_CURRENT_THREAD') {
      if (!isForum || !sender.url) throw Error('Сайт не поддерживается');
      const core = await corePromise;
      if (core.threadKey(message.url) !== core.threadKey(sender.url)) throw Error('Тема не совпадает со страницей');
      const saved = (await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;
      const profile=matchingForumProfile(saved,sender.url,globalThis.MTXenForo);
      return store.createComplaint({profileId:profile.id, url:message.url,title:message.title});
    }
    if (message.type === 'RP_NEXUS_THREAD_OBSERVED') {
      if (!isForum || !sender.url) throw Error('Сайт не поддерживается');
      const core = await corePromise;
      if (core.threadKey(message.url) !== core.threadKey(sender.url)) throw Error('Тема не совпадает со страницей');
      const saved=(await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;
      const profile=matchingForumProfile(saved,sender.url,globalThis.MTXenForo);
      const changes = await store.observeThread(message.url,message.postId,profile.id,message.forumState??'unknown');
      for (const item of changes) await notifyChange(item);
      return changes.length;
    }
    if (message.type === 'RP_NEXUS_VIDEO_ADD') {
      if (!isVideo || !sender.url) throw Error('Сайт не поддерживается');
      const url = new URL(message.input?.url);
      if (url.origin !== new URL(sender.url).origin || url.pathname !== new URL(sender.url).pathname) throw Error('Недопустимая ссылка на видео');
      const current=(await store.getCase(message.id));
      const state=(await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;
      if(current.profileId!==state?.activeProfileId)throw Error('Жалоба принадлежит другому профилю');
      return store.addComplaintEvidence(message.id,message.input);
    }
    if (message.type === 'RP_NEXUS_CASE_MUTATE') {
      if (!isTrustedExtension) throw Error('Недоверенный источник');
      switch(message.action) {
        case 'registry': return registryAction(message.profileId,message.operation,message.input);
        case 'queue': return store.mutateComplaintQueue(message.profileId,message.ids,message.operation,message.input);
        case 'moderation-ops': {
          if(message.operation==='apply-sla')return store.applyPolicyToUnscheduled(message.profileId);
          if(message.operation==='run-overdue')return store.runOverdueAutomations(message.profileId);
          return store.mutateModerationOperations(message.profileId,message.operation,message.input);
        }
        case 'ai-draft': return store.saveComplaintAIDraft(message.id,message.profileId,message.expectedAt,message.text);
        case 'create': return store.createComplaint(message.input);
        case 'update': return store.editComplaint(message.id,message.patch);
        case 'delete': return store.removeComplaint(message.id);
        case 'addEvidence': {
          if(message.input?.vaultId){
            const current=await store.getCase(message.id);
            if((await loadState()).activeProfileId!==current.profileId)throw Error('Активный профиль изменился');
            const vault=await getVaultRecord(message.input.vaultId);
            if(vault.meta.profileId!==current.profileId)throw Error('Доказательство другого профиля');
            if(vault.meta.kind==='file')await verifyVaultFile(vault.meta.id,current.profileId);
            return store.addComplaintEvidence(message.id,{...vault.meta,vaultId:vault.meta.id});
          }
          if(message.input?.kind==='file')throw Error('Локальный файл можно прикрепить только из Evidence Vault');
          return store.addComplaintEvidence(message.id,message.input);
        }
        case 'linkEvidence':{
          const current=await store.getCase(message.id);
          if((await loadState()).activeProfileId!==current.profileId)throw Error('Активный профиль изменился');
          const record=await getVaultRecord(message.vaultId);
          const existing=current.evidence.find(x=>x.id===message.evidenceId);
          if(!existing||existing.kind==='file'||existing.vaultId||record.meta.kind!=='link'||record.meta.profileId!==current.profileId||existing.url!==record.meta.url||existing.seconds!==record.meta.seconds)throw Error('Ссылка не соответствует доказательству жалобы');
          return store.linkComplaintEvidence(current.id,existing.id,record.meta.id);
        }
        case 'timeline': return store.mutateCaseTimeline(message.id,message.operation,message.input,message.expected??null);
        case 'removeEvidence': return store.removeComplaintEvidence(message.id,message.evidenceId);
        case 'replace': return store.replaceCases(message.cases);
        case 'workflow': return store.mutateCaseWorkflow(message.id,message.workflowAction,message.payload);
        case 'moderation': return store.mutateModeration(message.id,message.operation,message.input);
        default: throw Error('Неизвестное действие');
      }
    }
    throw Error('Неизвестный запрос');
  }
  if (!['RP_NEXUS_OPEN_WORKSPACE','RP_NEXUS_SCAN_OPEN_TABS','RP_NEXUS_TRACK_CURRENT_THREAD','RP_NEXUS_THREAD_OBSERVED','RP_NEXUS_VIDEO_ADD','RP_NEXUS_CASE_MUTATE','RP_NEXUS_FORUM_DATA','RP_NEXUS_VIDEO_CASES','MAJESTIC_SAVE_PUBLIC_PLAYER','MAJESTIC_TIMER','MT_BINDER_ACTION','MT_NAVIGATION_ACTION','MT_FORUM_READING','MT_PUNISHMENT_OVERLAY','MT_SECTION_MONITOR','MT_NATIVE_MODERATION','MT_CLOUD_IDENTITY'].includes(message.type)) return;
  void task().then(value => sendResponse({ok:true,value})).catch(error => sendResponse({ok:false,error:error?.message || 'Ошибка'}));
  return true;
});
start();
