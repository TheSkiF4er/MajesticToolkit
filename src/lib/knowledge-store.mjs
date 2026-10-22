import {api} from './browser.mjs';
import {KNOWLEDGE_KEY,emptyKnowledge,validateKnowledge,addKnowledgeResource,addKnowledgeRelation} from './knowledge-core.mjs';
let queue=Promise.resolve();
const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
export async function loadKnowledge(profiles){const raw=(await api.storage.local.get(KNOWLEDGE_KEY))[KNOWLEDGE_KEY];return raw===undefined?emptyKnowledge():validateKnowledge(raw,profiles);}
export function replaceKnowledge(value,profiles){return serial(async()=>{const data=validateKnowledge(value,profiles);await api.storage.local.set({[KNOWLEDGE_KEY]:data});return data;});}
export function updateKnowledge(fn,profiles){return serial(async()=>{const current=await loadKnowledge(profiles);const next=validateKnowledge(fn(current),profiles);await api.storage.local.set({[KNOWLEDGE_KEY]:next});return next;});}
export const saveKnowledgeResource=(profileId,input,profiles)=>updateKnowledge(s=>addKnowledgeResource(s,profileId,input),profiles);
export const saveKnowledgeRelation=(profileId,input,profiles)=>updateKnowledge(s=>addKnowledgeRelation(s,profileId,input),profiles);
export const deleteKnowledgeResource=(id,profiles)=>updateKnowledge(s=>({...s,resources:s.resources.filter(r=>r.id!==id),relations:s.relations.filter(r=>r.from.id!==id&&r.to.id!==id)}),profiles);
export const deleteKnowledgeRelation=(id,profiles)=>updateKnowledge(s=>({...s,relations:s.relations.filter(r=>r.id!==id)}),profiles);
