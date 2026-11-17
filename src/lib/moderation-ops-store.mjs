import {api} from './browser.mjs';
import {loadState} from './state.mjs';
import {MOD_OPS_PREFIX,cleanOperations,cleanPolicy,cleanRule,auditEvent,applySla,applyRules} from './moderation-ops-core.mjs';
export const moderationOpsKey=id=>MOD_OPS_PREFIX+id;
export async function moderationOpsFor(profile){const key=moderationOpsKey(profile.id);const raw=(await api.storage.local.get(key))[key];return cleanOperations(raw&&raw.project===profile.project&&raw.server===profile.server?raw:undefined,profile);}
export async function exportModerationOps(profiles){const raw=await api.storage.local.get(null);return validateModerationOpsBackup({version:1,profiles:profiles.filter(p=>raw[moderationOpsKey(p.id)]?.project===p.project&&raw[moderationOpsKey(p.id)]?.server===p.server).map(p=>raw[moderationOpsKey(p.id)])},profiles);}
export function validateModerationOpsBackup(value,profiles){
 if(!value||value.version!==1||!Array.isArray(value.profiles)||value.profiles.length>profiles.length)throw Error('Некорректная копия модерации');
 const seen=new Set();const rows=value.profiles.map(r=>{const p=profiles.find(p=>p.id===r.profileId);if(!p||seen.has(p.id))throw Error('Несовместимые профили в копии модерации');seen.add(p.id);return cleanOperations(r,p);});
 if(new TextEncoder().encode(JSON.stringify(rows)).length>8*1024*1024)throw Error('Копия модерации превышает 8 МиБ');return {version:1,profiles:rows};
}
export async function replaceModerationOps(value,profiles){
 const next=validateModerationOpsBackup(value,profiles),raw=await api.storage.local.get(null);
 const previous=Object.fromEntries(Object.entries(raw).filter(([k])=>k.startsWith(MOD_OPS_PREFIX)));
 const replacement=Object.fromEntries(next.profiles.map(r=>[moderationOpsKey(r.profileId),r]));
 try{if(Object.keys(replacement).length)await api.storage.local.set(replacement);const stale=Object.keys(previous).filter(k=>!Object.hasOwn(replacement,k));if(stale.length)await api.storage.local.remove(stale);}
 catch(err){if(Object.keys(previous).length)await api.storage.local.set(previous);const added=Object.keys(replacement).filter(k=>!Object.hasOwn(previous,k));if(added.length)await api.storage.local.remove(added);throw err;}
}
// All mutations are sequenced through the complaint store's queue, including local rule changes.
export async function changeOpsInternal(profile,action,input={}){
 const ops=await moderationOpsFor(profile);let next=ops;
 if(action==='policy')next={...ops,policy:cleanPolicy(input.policy)};
 else if(action==='rule-add'){
  const r=cleanRule(input.rule);if(ops.rules.length>=30||ops.rules.some(x=>x.id===r.id))throw Error('Лимит или повтор правила автоматизации');next={...ops,rules:[...ops.rules,r]};
 }else if(action==='rule-delete')next={...ops,rules:ops.rules.filter(x=>x.id!==input.id)};
 else if(action==='rule-toggle')next={...ops,rules:ops.rules.map(x=>x.id===input.id?{...x,enabled:!x.enabled}:x)};
 else if(action==='audit-clear'){if(input.confirm!==true)throw Error('Требуется подтверждение');next={...ops,audit:[]};}
 else throw Error('Неизвестная настройка модерации');
 next=auditEvent(next,'system',`Настройка модерации: ${action}`);
 const active=(await loadState()).profiles.find(p=>p.id===profile.id);
 if(!active||active.project!==profile.project||active.server!==profile.server)throw Error('Профиль изменился');
 const validated=cleanOperations(next,profile);await api.storage.local.set({[moderationOpsKey(profile.id)]:validated});return validated;
}
export async function runOverdueAutomationsInternal(profile,cases,now=Date.now()){
 let ops=await moderationOpsFor(profile);const changes={};let count=0;
 for(const c of cases){if(c.profileId!==profile.id||c.status==='done'||!c.deadline||Date.parse(c.deadline)>now)continue;
  const out=applyRules(c,ops,'overdue',new Date(now).toISOString());if(!out.applied.length)continue;
  ops=out.ops;changes['rpnComplaintV3:'+c.id]=out.item;count++;
 }
 if(count){changes[moderationOpsKey(profile.id)]=cleanOperations(ops,profile);await api.storage.local.set(changes);}return count;
}
export async function readAllOps(){const raw=await api.storage.local.get(null);return Object.fromEntries(Object.entries(raw).filter(([k])=>k.startsWith(MOD_OPS_PREFIX)));}
