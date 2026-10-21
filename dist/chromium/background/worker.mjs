import * as complaintsStore from '../lib/complaints-store.mjs';
import * as forumStore from '../lib/forum-store.mjs';
/* MajesticToolkit 0.3 — permission-gated forum / evidence integration, local notifications. */
const api = globalThis.browser ?? globalThis.chrome;
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
const storePromise = Promise.resolve(complaintsStore);
const corePromise = Promise.resolve(globalThis.RPNComplaints);
// Content scripts receive only the minimum data required by their visible UI.
// On browsers supporting setAccessLevel, web pages cannot read the full local database.
async function restrictStorageAccess() {
  if (typeof api.storage.local.setAccessLevel === 'function') {
    try { await api.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}); }
    catch (error) { console.warn('MajesticToolkit: storage isolation unavailable',error); }
  }
}
async function contentSnapshot(kind) {
  const state=(await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;
  const profileId=state?.activeProfileId;
  if (typeof profileId !== 'string') return {profile:null,items:[]};
  const profile=state.profiles?.find(p=>p.id===profileId);
  if (!profile) return {profile:null,items:[]};
  if (kind==='forum') {
    const {listTemplates}=forumStore;
    const records=await listTemplates();
    return {profile,items:records.filter(r=>r.profileId===profileId)};
  }
  const {listCases}=await storePromise;
  const records=await listCases();
  return {profile,items:records.filter(r=>r.profileId===profileId).map(r=>({id:r.id,title:r.title}))};
}
const dataPrefix=/^(rpNexusStateV1|rpnForumTemplateV2:|rpnComplaintV3:)/;
let notified=false;
api.storage.onChanged.addListener((changes,area)=>{
  if(area!=='local'||notified||!Object.keys(changes).some(k=>dataPrefix.test(k)))return;
  notified=true;
  // Notification only; no user data are broadcast. Readers request a scoped snapshot.
  Promise.resolve().then(async()=>{
    for(const site of [...FORUMS,...VIDEOS]) {
      if(!await api.permissions.contains({origins:[site.origin]}))continue;
      const tabs=await api.tabs.query({url:[site.origin]});
      await Promise.all(tabs.filter(t=>Number.isInteger(t.id)).map(t=>api.tabs.sendMessage(t.id,{type:'MAJESTIC_DATA_CHANGED'}).catch(()=>{})));
    }
  }).catch(error=>console.warn('MajesticToolkit: content invalidation',error)).finally(()=>{notified=false;});
});
async function syncScripts() {
  try {
    const registrations = await api.scripting.getRegisteredContentScripts();
    const old = registrations.filter(r => LEGACY.includes(r.id)).map(r => r.id);
    if (old.length) await api.scripting.unregisterContentScripts({ids:old});
    const ids = new Set(registrations.map(r => r.id));
    for (const site of [...FORUMS, ...VIDEOS]) {
      const granted = await api.permissions.contains({origins:[site.origin]});
      if (granted && !ids.has(site.id)) {
        const isForum = FORUMS.includes(site);
        await api.scripting.registerContentScripts([{id:site.id,matches:[site.origin],js:isForum ? ['lib/forum-core.js','lib/complaints-core.js','content/forum.js'] : ['lib/complaints-core.js','content/evidence.js'],runAt:'document_idle',allFrames:false,persistAcrossSessions:true}]);
      } else if (!granted && ids.has(site.id)) await api.scripting.unregisterContentScripts({ids:[site.id]});
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
api.notifications.onClicked.addListener(id => {void openCaseFromNotification(id);});
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
  const store = await storePromise;
  const now = Date.now();
  const current = (await store.listCases()).filter(c => c.deadline && c.status !== 'done' && Date.parse(c.deadline) <= now + 15 * 60000);
  for (const item of current) {
    const key = `rpnDeadlineSentV3:${item.id}`;
    const saved = (await api.storage.local.get(key))[key];
    if (saved === item.deadline) continue;
    try {
      await api.notifications.create(`rpn_deadline_${item.id}`, {type:'basic', iconUrl:'assets/icon-128.png',title:'MajesticToolkit · Срок жалобы',message:`${item.title.slice(0,110)}: ${Date.parse(item.deadline) <= now ? 'срок прошёл' : 'менее 15 минут до срока'}.`});
      await api.storage.local.set({[key]:item.deadline});
    } catch(error) { console.warn('MajesticToolkit: уведомление о сроке',error); }
  }
}
async function tick() { try { await scanTabs(); await checkDeadlines(); } catch(error) { console.warn('MajesticToolkit: периодическая проверка',error); } }
function start() {
  void restrictStorageAccess();
  void syncScripts();
  void api.alarms.create('rp-nexus-open-tabs-v3',{periodInMinutes:5}).catch(err => console.warn('MajesticToolkit: alarms',err));
}
api.runtime.onInstalled.addListener(start);
api.runtime.onStartup?.addListener(start);
api.permissions.onAdded.addListener(() => {void syncScripts();});
api.permissions.onRemoved.addListener(() => {void syncScripts();});
api.alarms.onAlarm.addListener(alarm => {if (alarm.name === 'rp-nexus-open-tabs-v3') void tick();});
api.runtime.onMessage.addListener((message,sender,sendResponse) => {
  if (!message || typeof message !== 'object') return;
  const isTrustedExtension = sender.id === api.runtime.id && sender.url?.startsWith(api.runtime.getURL(''));
  const isForum = FORUMS.some(x => sender.url?.startsWith(x.origin.replace('*','')));
  const isVideo = VIDEOS.some(x => sender.url?.startsWith(x.origin.replace('*','')));
  async function task() {
    if (message.type === 'RP_NEXUS_OPEN_WORKSPACE') {
      if (!isForum && !isVideo && !isTrustedExtension) throw Error('Недоверенный источник');
      await api.tabs.create({url:api.runtime.getURL('ui/workspace.html' + (['forum','complaints'].includes(message.view) ? '#'+message.view : ''))});
      return true;
    }
    if (message.type === 'MAJESTIC_CONTENT_READ') {
      if (sender.id !== api.runtime.id) throw Error('Недоверенный источник');
      if (message.kind === 'forum' && isForum) return contentSnapshot('forum');
      if (message.kind === 'evidence' && isVideo) return contentSnapshot('evidence');
      throw Error('Источник не вправе читать эти данные');
    }
    if (message.type === 'RP_NEXUS_SCAN_OPEN_TABS') {
      if (!isTrustedExtension) throw Error('Недоверенный источник');
      return scanTabs();
    }
    const store = await storePromise;
    if (message.type === 'RP_NEXUS_TRACK_CURRENT_THREAD') {
      if (!isForum || !sender.url) throw Error('Сайт не поддерживается');
      const core = await corePromise;
      if (core.threadKey(message.url) !== core.threadKey(sender.url)) throw Error('Тема не совпадает со страницей');
      const saved = (await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;
      const profileId = saved?.activeProfileId;
      if (!profileId) throw Error('Нет активного профиля');
      return store.createComplaint({profileId, url:message.url,title:message.title});
    }
    if (message.type === 'RP_NEXUS_THREAD_OBSERVED') {
      if (!isForum || !sender.url) throw Error('Сайт не поддерживается');
      const core = await corePromise;
      if (core.threadKey(message.url) !== core.threadKey(sender.url)) throw Error('Тема не совпадает со страницей');
      const changes = await store.observeThread(message.url,message.postId);
      for (const item of changes) await notifyChange(item);
      return changes.length;
    }
    if (message.type === 'RP_NEXUS_VIDEO_ADD') {
      if (!isVideo || !sender.url) throw Error('Сайт не поддерживается');
      const url = new URL(message.input?.url);
      if (url.origin !== new URL(sender.url).origin || url.pathname !== new URL(sender.url).pathname) throw Error('Недопустимая ссылка на видео');
      return store.addComplaintEvidence(message.id,message.input);
    }
    if (message.type === 'RP_NEXUS_CASE_MUTATE') {
      if (!isTrustedExtension) throw Error('Недоверенный источник');
      switch(message.action) {
        case 'create': return store.createComplaint(message.input);
        case 'update': return store.editComplaint(message.id,message.patch);
        case 'delete': return store.removeComplaint(message.id);
        case 'addEvidence': return store.addComplaintEvidence(message.id,message.input);
        case 'removeEvidence': return store.removeComplaintEvidence(message.id,message.evidenceId);
        case 'replace': return store.replaceCases(message.cases);
        default: throw Error('Неизвестное действие');
      }
    }
    throw Error('Неизвестный запрос');
  }
  if (!['MAJESTIC_CONTENT_READ','RP_NEXUS_OPEN_WORKSPACE','RP_NEXUS_SCAN_OPEN_TABS','RP_NEXUS_TRACK_CURRENT_THREAD','RP_NEXUS_THREAD_OBSERVED','RP_NEXUS_VIDEO_ADD','RP_NEXUS_CASE_MUTATE'].includes(message.type)) return;
  void task().then(value => sendResponse({ok:true,value})).catch(error => sendResponse({ok:false,error:error?.message || 'Ошибка'}));
  return true;
});
start();
