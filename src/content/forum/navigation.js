/* Own only Toolkit nodes; native XenForo menu and event handlers remain intact. */
(() => {
  'use strict';
  const icons={link:'↗',star:'★',book:'▤',folder:'▸',chat:'▣',law:'§'};
  function create(doc) {
    const owned=new Map();let listening=false;
    function closeOutside(event){for(const [node] of owned)if(!node.contains(event.target)){const details=node.querySelector('details');if(details)details.open=false;}}
    function clear(){for(const [node] of owned)node.remove();owned.clear();if(listening){doc.removeEventListener('click',closeOutside,true);listening=false;}}
    function anchor(link,mobile){const a=doc.createElement('a');a.className=mobile?'offCanvasMenu-link':'p-navEl-link';a.textContent=(link.icon?icons[link.icon]+' ':'')+(link.pinned?'★ ':'')+link.title;a.href=link.url;a.target=link.target==='current'?'_self':'_blank';a.rel='noopener noreferrer';a.title=link.note||'Пользовательская ссылка MajesticToolkit';return a;}
    function update(host,links){
      if(!listening){doc.addEventListener('click',closeOutside,true);listening=true;}
      const selectors=[...(globalThis.MTXenForo.FORUMS[host]?.nav||[]),'.offCanvasMenu-list'];
      const containers=new Set(selectors.flatMap(s=>Array.from(doc.querySelectorAll(s))));
      for(const [node] of owned)if(!containers.has(node.parentElement)||!node.isConnected){node.remove();owned.delete(node);}
      for(const container of containers){
        const previous=[...owned].filter(([n])=>n.parentElement===container);
        const grouped=new Map();for(const link of links){const key=link.group?'group:'+link.group.split('/')[0]:link.id;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(link);}
        const entries=[...grouped];const same=previous.length===entries.length&&previous.every(([n,s],i)=>s===JSON.stringify(entries[i])&&n.childElementCount>0);
        if(same)continue;
        for(const [node] of previous){node.remove();owned.delete(node);}
        const mobile=container.matches('.offCanvasMenu-list');
        for(const entry of entries){const [key,rows]=entry,el=doc.createElement(mobile?'div':'li');el.dataset.mtXfNav=key;el.className=mobile?'offCanvasMenu-linkHolder':'p-navEl';
          if(!key.startsWith('group:'))el.append(anchor(rows[0],mobile));
          else {const details=doc.createElement('details'),summary=doc.createElement('summary');summary.textContent=key.slice(6);summary.className=mobile?'offCanvasMenu-link':'p-navEl-link';summary.style.cursor='pointer';details.append(summary);const list=doc.createElement('div');list.style.cssText='position:'+(mobile?'static':'fixed')+';background:Canvas;color:CanvasText;border:1px solid GrayText;padding:8px;min-width:180px;max-width:300px;max-height:50vh;overflow:auto;z-index:1000';
            const groups=new Map([['',list]]);for(const row of rows){const parts=row.group.split('/').slice(1);let parent=list,path='';for(const part of parts){path+='/'+part;if(!groups.has(path)){const d=doc.createElement('details'),s=doc.createElement('summary');s.textContent=part;d.append(s);parent.append(d);groups.set(path,d);}parent=groups.get(path);}const a=anchor(row,mobile);a.style.cssText='display:block;color:inherit;padding:6px;white-space:normal';parent.append(a);}details.append(list);if(!mobile)details.addEventListener('toggle',()=>{if(!details.open)return;const rect=summary.getBoundingClientRect(),w=doc.documentElement.clientWidth;list.style.left=Math.max(4,Math.min(rect.left,w-308))+'px';list.style.top=Math.min(rect.bottom,doc.documentElement.clientHeight-80)+'px';});el.append(details);}
          container.append(el);owned.set(el,JSON.stringify(entry));}
      }
    }
    return {update,clear};
  }
  globalThis.MTForumNavigation=Object.freeze({create});
})();
