/** Serialize tactical writes across panels and, where supported, browser contexts.
 * A common lock prevents map replacement racing new dependent records or a restore.
 */
let pending=Promise.resolve();
const LOCK_NAME='majestictoolkit-tactical-write-v230';
export function withTacticalWriteLock(work){
 if(typeof work!=='function')throw new TypeError('Tactical write requires a callback');
 const run=()=>globalThis.navigator?.locks?.request
  ?globalThis.navigator.locks.request(LOCK_NAME,{mode:'exclusive'},work)
  :work();
 const task=pending.then(run);
 pending=task.catch(()=>{});
 return task;
}
