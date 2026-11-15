/* One observer, bounded scheduling, deterministic disposal and BFCache recovery. */
(() => {
  'use strict';
  function create(doc, onUpdate) {
    let observer=null,timer=null,active=false,lastURL='';
    function flush(){timer=null;if(!active)return;const href=doc.location.href;const changed=href!==lastURL;lastURL=href;onUpdate(changed);}
    function schedule(){if(active&&timer===null)timer=setTimeout(flush,100);}
    function start(){if(active)return;active=true;lastURL=doc.location.href;observer=new MutationObserver(schedule);observer.observe(doc.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-hidden','contenteditable','disabled','readonly','class','style','inert']});window.addEventListener('popstate',schedule);window.addEventListener('hashchange',schedule);schedule();}
    function stop(){active=false;observer?.disconnect();observer=null;clearTimeout(timer);timer=null;window.removeEventListener('popstate',schedule);window.removeEventListener('hashchange',schedule);}
    return {start,stop,schedule};
  }
  globalThis.MTForumLifecycle=Object.freeze({create});
})();
