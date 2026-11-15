/* Idempotent rendering for dynamically replaced desktop and mobile navigation. */
(() => {
  'use strict';
  function create(doc) {
    const owned=new Set();
    function clear(){for(const node of owned)node.remove();owned.clear();}
    function update(host,links){
      const selectors=[...(globalThis.MTXenForo.FORUMS[host]?.nav||[]),'.offCanvasMenu-list'];
      const containers=new Set(selectors.flatMap(s=>Array.from(doc.querySelectorAll(s))));
      for(const node of owned)if(!containers.has(node.parentElement)||!node.isConnected){node.remove();owned.delete(node);}
      for(const container of containers){
        const previous=[...owned].filter(n=>n.parentElement===container);
        const same=previous.length===links.length&&previous.every((n,i)=>n.dataset.mtXfNav===links[i].id&&n.firstElementChild?.textContent===links[i].title&&n.firstElementChild?.href===links[i].url);
        if(same)continue;
        for(const node of previous){node.remove();owned.delete(node);}
        const mobile=container.matches('.offCanvasMenu-list');
        for(const link of links){const el=doc.createElement(mobile?'div':'li');el.dataset.mtXfNav=link.id;el.className=mobile?'offCanvasMenu-linkHolder':'p-navEl';const a=doc.createElement('a');a.className=mobile?'offCanvasMenu-link':'p-navEl-link';a.textContent=link.title;a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';a.title='Пользовательская ссылка MajesticToolkit';el.append(a);container.append(el);owned.add(el);}
      }
    }
    return {update,clear};
  }
  globalThis.MTForumNavigation=Object.freeze({create});
})();
