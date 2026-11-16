import './forum-customization.js';
/** Local forum preferences. Included in the existing state/backup envelope. */
export const FORUM_HOSTS = Object.freeze(['forum.majestic-rp.ru','forum.russia.online']);
export const FORUM_DEFAULTS = Object.freeze({enabled:true,binderEnabled:true,navigationEnabled:true,navigationHistory:false,punishmentEnabled:true,panelPosition:'right',appearance:'dark',density:'comfortable'});
const choices = {panelPosition:['left','right'],appearance:['dark','light','system'],density:['comfortable','compact']};
function cleanOptions(value, partial=false) {
  const out = partial ? {} : {...FORUM_DEFAULTS};
  if (value === undefined) return out;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Некорректные настройки форума');
  for (const key of Object.keys(FORUM_DEFAULTS)) {
    if (!Object.hasOwn(value,key)) continue;
    const v=value[key];
    if (choices[key] ? !choices[key].includes(v) : typeof v !== 'boolean') throw Error(`Некорректная настройка форума: ${key}`);
    out[key]=v;
  }
  return out;
}
export function validateForumSettings(value,allowedProfileIds=null) {
  if (value === undefined) return {schemaVersion:1,global:{...FORUM_DEFAULTS},sites:{},profiles:{}};
  if (!value || value.schemaVersion!==1 || !value.sites || typeof value.sites!=='object' || Array.isArray(value.sites)) throw Error('Некорректная версия настроек форума');
  const sites={};
  for(const host of FORUM_HOSTS) if(Object.hasOwn(value.sites,host)) sites[host]=cleanOptions(value.sites[host],true);
  const raw=value.profiles??{};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length>100)throw Error('Некорректные настройки профилей');
  const profiles=Object.fromEntries(Object.entries(raw).filter(([id])=>id.length>0&&id.length<=128&&(!allowedProfileIds||allowedProfileIds.includes(id))).map(([id,v])=>[id,cleanOptions(v,true)]));
  return {schemaVersion:1,global:cleanOptions(value.global),sites,profiles,...(value.customization===undefined?{}:{customization:globalThis.MTForumCustomization.config(value.customization,allowedProfileIds)})};
}
export function forumSettingsFor(value,host,profileId=null) {
  const settings=validateForumSettings(value);
  return {...settings.global,...(FORUM_HOSTS.includes(host)?settings.sites[host]:{}),...(profileId&&Object.hasOwn(settings.profiles,profileId)?settings.profiles[profileId]:{})};
}
export function updateForumSettings(value,scope,patch) {
  const next=validateForumSettings(value);
  if(scope==='global') next.global=cleanOptions(patch);
  else if(FORUM_HOSTS.includes(scope)) {
    if(patch===null) delete next.sites[scope];
    else next.sites[scope]=cleanOptions(patch,true);
  } else if(scope.startsWith('profile:')&&scope.length>8&&scope.length<=136) {
    const id=scope.slice(8),entries=Object.entries(next.profiles).filter(([key])=>key!==id);
    if(patch!==null)entries.push([id,cleanOptions(patch,true)]);
    next.profiles=Object.fromEntries(entries);
  } else throw Error('Неизвестный форум');
  return next;
}
