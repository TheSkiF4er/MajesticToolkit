import './xenforo-core.js';
import {api} from './browser.mjs';
const XF=globalThis.MTXenForo;
let sequence=Promise.resolve();
const serialized=fn=>{const result=sequence.then(fn);sequence=result.catch(()=>{});return result;};
export async function listXenForoLinks(){
  const result=await api.storage.local.get(null);
  const rows=[];
  for(const [key,item] of Object.entries(result))if(key.startsWith(XF.PREFIX)){
    try{const value=XF.validateLink(item);if(key===XF.PREFIX+value.id)rows.push(value);}catch(error){console.warn('MajesticToolkit: invalid XenForo navigation item',key,error);}
  }
  return rows;
}
export async function saveXenForoLink(input,id=null){
  return serialized(async()=>{
    const all=await listXenForoLinks(),before=id?all.find(x=>x.id===id):null;
    if(id&&!before)throw Error('Ссылка не найдена');
    if(!before&&all.length>=XF.LIMIT)throw Error('Достигнут лимит ссылок');
    const item=XF.validateLink({...input,id:before?.id||'xf_'+crypto.randomUUID().replaceAll('-',''),createdAt:before?.createdAt||new Date().toISOString()});
    await api.storage.local.set({[XF.PREFIX+item.id]:item});return item;
  });
}
export async function deleteXenForoLink(id){
  if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))throw Error('Некорректный идентификатор');
  return serialized(()=>api.storage.local.remove(XF.PREFIX+id));
}
export async function replaceXenForoLinks(items){
  return serialized(async()=>{
    const clean=XF.validateLinks(items),current=await api.storage.local.get(null),oldKeys=Object.keys(current).filter(k=>k.startsWith(XF.PREFIX));
    const updates=Object.fromEntries(clean.map(x=>[XF.PREFIX+x.id,x]));
    try{
      if(Object.keys(updates).length)await api.storage.local.set(updates);
      const stale=oldKeys.filter(k=>!Object.hasOwn(updates,k));if(stale.length)await api.storage.local.remove(stale);
    }catch(e){
      const rollback=Object.fromEntries(oldKeys.map(k=>[k,current[k]]));if(oldKeys.length)await api.storage.local.set(rollback);
      const added=Object.keys(updates).filter(k=>!oldKeys.includes(k));if(added.length)await api.storage.local.remove(added);throw e;
    }
  });
}
