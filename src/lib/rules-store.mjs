import {api} from './browser.mjs';
import {RULES_KEY,validateRules,createRule,reviseRule,updateRule} from './rules-core.mjs';
let queue=Promise.resolve();
function serial(fn){const run=()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request(RULES_KEY,fn):fn();const job=queue.then(run);queue=job.catch(()=>{});return job;}
export async function listRules(){const data=(await api.storage.local.get(RULES_KEY))[RULES_KEY];return data===undefined?[]:validateRules(data);}
async function write(rows,profiles){const clean=validateRules(rows,profiles);await api.storage.local.set({[RULES_KEY]:clean});return clean;}
export function replaceRules(rows,profiles){return serial(()=>write(rows,profiles));}
export function addRule(profile,fields){return serial(async()=>{const rows=await listRules(),r=createRule(profile,fields);await write([...rows,r]);return r;});}
export function mutateRule(profile,id,operation){return serial(async()=>{const rows=await listRules(),r=rows.find(x=>x.id===id&&x.profileId===profile.id&&x.project===profile.project);if(!r)throw Error('Правило не найдено в активном профиле');const next=operation(r);await write(rows.map(x=>x.id===id?next:x));return next;});}
export const saveRuleRevision=(p,id,fields,expected)=>mutateRule(p,id,r=>reviseRule(r,fields,expected));
export const patchRule=(p,id,patch)=>mutateRule(p,id,r=>updateRule(r,patch));
export function removeRuleProfile(profileId){return serial(async()=>write((await listRules()).filter(r=>r.profileId!==profileId)));}
