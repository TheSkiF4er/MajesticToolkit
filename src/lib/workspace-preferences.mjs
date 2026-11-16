export const WIDGETS=Object.freeze(['binder','bookmarks','complaints','timers','documents','servers']);
export function workspacePreferences(value){
  if(value===undefined)return {order:[...WIDGETS],hidden:[]};
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.order)||!Array.isArray(value.hidden))throw Error('Некорректные настройки рабочего пространства');
  const {order,hidden}=value;
  if(order.length!==WIDGETS.length||new Set(order).size!==WIDGETS.length||order.some(x=>!WIDGETS.includes(x))||hidden.length>WIDGETS.length||new Set(hidden).size!==hidden.length||hidden.some(x=>!WIDGETS.includes(x)))throw Error('Некорректный список виджетов');
  return {order:[...order],hidden:[...hidden]};
}
export function changeWidget(value,id,action){
  const next=workspacePreferences(value);if(!WIDGETS.includes(id))throw Error('Неизвестный виджет');
  if(action==='toggle')next.hidden=next.hidden.includes(id)?next.hidden.filter(x=>x!==id):[...next.hidden,id];
  else if(action==='up'||action==='down'){const i=next.order.indexOf(id),j=i+(action==='up'?-1:1);if(j>=0&&j<next.order.length)[next.order[i],next.order[j]]=[next.order[j],next.order[i]];}
  else throw Error('Неизвестное действие');return next;
}
