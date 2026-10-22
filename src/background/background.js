/* MajesticToolkit background: static ES module dependencies for all browsers. */
import * as importedStore from '../lib/complaints-store.mjs';
import * as importedForum from '../lib/forum-store.mjs';
import * as importedMonitor from '../lib/monitor-store.mjs';
import * as importedXenForo from '../lib/xenforo-store.mjs';
import '../lib/xenforo-core.js';
import '../lib/complaints-core.js';
import {contentSender,extensionPageSender,matchingForumProfile,validatePayloadSize} from '../lib/message-security.mjs';
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
      const granted = await api.permissions.contains({origins:[site.origin]});
      const isForum = FORUMS.includes(site);
      const wanted={id:site.id,matches:[site.origin],js:isForum ? ['lib/safe-dom.js','lib/forum-core.js','lib/xenforo-core.js','lib/complaints-core.js','content/forum.js'] : ['lib/safe-dom.js','lib/complaints-core.js','content/evidence.js'],runAt:'document_idle',allFrames:false,persistAcrossSessions:true};
      const current=byId.get(site.id);
      const obsolete=current&&(JSON.stringify(current.js)!==JSON.stringify(wanted.js) || JSON.stringify(current.matches)!==JSON.stringify(wanted.matches) || current.runAt!==wanted.runAt || current.allFrames!==false);
      // Persisted registrations from a previous version must be replaced on upgrade.
      if(current&&(!granted||obsolete))await api.scripting.unregisterContentScripts({ids:[site.id]});
      if(granted&&(!current||obsolete))await api.scripting.registerContentScripts([wanted]);
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
  const store=await storePromise;
  const core=await corePromise;
  const now=Date.now();
  const levels={ '24h':'менее суток до срока','1h':'менее часа до срока','15m':'менее 15 минут до срока',overdue:'срок истёк' };
  for(const item of await store.listCases()){
    if(!item.deadline||item.status==='done')continue;
    const tier=core.deadlineTier(item.deadline,now);
    if(!tier)continue;
    const key=`majesticDeadlineV14:${item.id}`;
    const saved=(await api.storage.local.get(key))[key];
    if(saved?.deadline===item.deadline && saved?.tier===tier)continue;
    try {
      await api.notifications.create(`rpn_deadline_${item.id}`,{type:'basic',iconUrl:'assets/icon-128.png',title:'MajesticToolkit · Срок жалобы',message:`${item.title.slice(0,110)}: ${levels[tier]}.`});
      await api.storage.local.set({[key]:{deadline:item.deadline,tier}});
    }catch(error){console.warn('MajesticToolkit: уведомление о сроке',error);}
  }
}
async function tick() { try { await scanTabs(); await checkDeadlines(); } catch(error) { console.warn('MajesticToolkit: периодическая проверка',error); } }
function start() {
  // Content scripts are not permitted to read extension-owned storage where supported.
  void (async()=>{
    try { await api.storage.local.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'}); }
    catch(error){console.warn('MajesticToolkit: storage access level unsupported',error);}
    await syncScripts();
  })();
  void api.alarms.create('rp-nexus-open-tabs-v3',{periodInMinutes:5}).catch(err => console.warn('MajesticToolkit: alarms',err));
}
api.runtime.onInstalled.addListener(start);
api.runtime.onStartup?.addListener(start);
api.storage.onChanged.addListener((changes,area) => {
  if (area !== 'local' || !Object.keys(changes).some(k=> k==='rpNexusStateV1'||k.startsWith('rpnForumTemplateV2:')||k.startsWith('majesticToolkitXfNavV11:'))) return;
  void api.tabs.query({}).then(tabs=>Promise.allSettled(tabs.filter(t=>t.id&&FORUMS.some(f=>t.url?.startsWith(f.origin.slice(0,-1)))).map(t=>api.tabs.sendMessage(t.id,{type:'RP_NEXUS_REFRESH_FORUM_DATA'})))).catch(()=>{});
});
api.permissions.onAdded.addListener(() => {void syncScripts();});
api.permissions.onRemoved.addListener(() => {void syncScripts();});
api.alarms.onAlarm.addListener(alarm => {if (alarm.name === 'rp-nexus-open-tabs-v3') void tick();});
api.runtime.onMessage.addListener((message,sender,sendResponse) => {
  if (!message || typeof message !== 'object') return;
  const isTrustedExtension=extensionPageSender(sender,api.runtime);
  const isForum=contentSender(sender,api.runtime.id,'forum');
  const isVideo=contentSender(sender,api.runtime.id,'video');
  async function task() {
    validatePayloadSize(message);
    if (message.type === 'RP_NEXUS_OPEN_WORKSPACE') {
      if (!isForum && !isVideo && !isTrustedExtension) throw Error('Недоверенный источник');
      await api.tabs.create({url:api.runtime.getURL('ui/workspace.html' + (['forum','complaints'].includes(message.view) ? '#'+message.view : ''))});
      return true;
    }
    if (message.type === 'RP_NEXUS_SCAN_OPEN_TABS') {
      if (!isTrustedExtension) throw Error('Недоверенный источник');
      return scanTabs();
    }
    if (message.type === 'RP_NEXUS_FORUM_DATA') {
      if (!isForum) throw Error('Недоверенный источник');
      const state = (await api.storage.local.get('rpNexusStateV1')).rpNexusStateV1;
      if (!state?.activeProfileId) return {profile:null, templates:[]};
      const {listTemplates} = await forumStorePromise;
      // Select only a profile belonging to the sender's forum, not an unrelated active project.
      const profile = globalThis.MTXenForo.matchingProfile(state.profiles,state.activeProfileId,sender.url);
      if (!profile) return {profile:null,templates:[],links:[]};
      const templates = (await listTemplates()).filter(t=>t.profileId==='*'||t.profileId===profile.id);
      const links = (await importedXenForo.listXenForoLinks()).filter(x=>x.profileId==='*'||x.profileId===profile.id);
      return {profile:{id:profile.id,name:profile.name,project:profile.project,server:profile.server},templates,links};
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
      const changes = await store.observeThread(message.url,message.postId,profile.id);
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
        case 'create': return store.createComplaint(message.input);
        case 'update': return store.editComplaint(message.id,message.patch);
        case 'delete': return store.removeComplaint(message.id);
        case 'addEvidence': return store.addComplaintEvidence(message.id,message.input);
        case 'removeEvidence': return store.removeComplaintEvidence(message.id,message.evidenceId);
        case 'replace': return store.replaceCases(message.cases);
        case 'workflow': return store.mutateCaseWorkflow(message.id,message.workflowAction,message.payload);
        default: throw Error('Неизвестное действие');
      }
    }
    throw Error('Неизвестный запрос');
  }
  if (!['RP_NEXUS_OPEN_WORKSPACE','RP_NEXUS_SCAN_OPEN_TABS','RP_NEXUS_TRACK_CURRENT_THREAD','RP_NEXUS_THREAD_OBSERVED','RP_NEXUS_VIDEO_ADD','RP_NEXUS_CASE_MUTATE','RP_NEXUS_FORUM_DATA','RP_NEXUS_VIDEO_CASES','MAJESTIC_SAVE_PUBLIC_PLAYER'].includes(message.type)) return;
  void task().then(value => sendResponse({ok:true,value})).catch(error => sendResponse({ok:false,error:error?.message || 'Ошибка'}));
  return true;
});
start();
