import {addEvidenceQuote,addEvidenceLink,removeEvidenceGraphItem} from './evidence-knowledge-graph.mjs';
import {api} from './browser.mjs';
import {KNOWLEDGE_KEY,emptyKnowledge,validateKnowledge,addKnowledgeResource,addKnowledgeRelation,addKnowledgeCollection,setKnowledgeCollectionMember,removeKnowledgeCollection} from './knowledge-core.mjs';
let queue=Promise.resolve();
const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
export async function loadKnowledge(profiles){const raw=(await api.storage.local.get(KNOWLEDGE_KEY))[KNOWLEDGE_KEY];return raw===undefined?emptyKnowledge():validateKnowledge(raw,profiles);}
export function replaceKnowledge(value,profiles){return serial(async()=>{const data=validateKnowledge(value,profiles);await api.storage.local.set({[KNOWLEDGE_KEY]:data});return data;});}
export function updateKnowledge(fn,profiles){return serial(async()=>{const current=await loadKnowledge(profiles);const next=validateKnowledge(await fn(current),profiles);await api.storage.local.set({[KNOWLEDGE_KEY]:next});return next;});}
export const saveKnowledgeResource=(profileId,input,profiles)=>updateKnowledge(s=>addKnowledgeResource(s,profileId,input),profiles);
export const saveKnowledgeRelation=(profileId,input,profiles)=>updateKnowledge(s=>addKnowledgeRelation(s,profileId,input),profiles);
export const deleteKnowledgeResource=(id,profiles)=>updateKnowledge(s=>({...s,resources:s.resources.filter(r=>r.id!==id),relations:s.relations.filter(r=>r.from.id!==id&&r.to.id!==id),collections:(s.collections||[]).map(c=>({...c,members:c.members.filter(m=>!m.endsWith(':'+id))}))}),profiles);
export const deleteKnowledgeRelation=(id,profiles)=>updateKnowledge(s=>({...s,relations:s.relations.filter(r=>r.id!==id)}),profiles);

export const saveKnowledgeCollection=(profileId,input,profiles)=>updateKnowledge(s=>addKnowledgeCollection(s,profileId,input),profiles);
export const changeKnowledgeCollectionMember=(profileId,id,node,enabled,profiles)=>updateKnowledge(s=>setKnowledgeCollectionMember(s,profileId,id,node,enabled),profiles);
export const deleteKnowledgeCollection=(profileId,id,profiles)=>updateKnowledge(s=>removeKnowledgeCollection(s,profileId,id),profiles);

/** All graph mutations use the same serialized knowledge store and backup schema. */
export const saveEvidenceQuote=(profileId,source,revisionId,quote,note,profiles)=>updateKnowledge(async data=>({...data,evidenceGraph:await addEvidenceQuote(data.evidenceGraph,profileId,source,revisionId,quote,note)}),profiles);
export const saveEvidenceLink=(profileId,from,to,relation,note,nodes,profiles)=>updateKnowledge(data=>({...data,evidenceGraph:addEvidenceLink(data.evidenceGraph,profileId,from,to,relation,note,nodes)}),profiles);
export const deleteEvidenceGraphItem=(profileId,kind,id,profiles)=>updateKnowledge(data=>({...data,evidenceGraph:removeEvidenceGraphItem(data.evidenceGraph,profileId,kind,id)}),profiles);
