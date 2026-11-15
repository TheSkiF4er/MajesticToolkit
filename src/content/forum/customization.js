/* Scoped XenForo customization. Never reparent native forms, intercept submit or hide security UI. */
(() => {
 'use strict';
 const M=globalThis.MTForumCustomization;
 const scope='html[data-mt-forum-custom]';
 const selectors=(parts)=>parts.split(',').map(x=>`${scope} ${x.trim()}`).join(',');
 const rule=(parts,css)=>`${selectors(parts)}{${css}}`;
 const fonts={system:'system-ui,sans-serif',sans:'Arial,sans-serif',serif:'Georgia,serif',mono:'monospace'};
 function css(s,dark){
   const p=M.colors(s,dark);let out='';
   if(p){out+=`${scope}{${Object.entries(p).map(([k,v])=>`--mt-f-${k}:${v}`).join(';')};color-scheme:${['dark','midnight','oled'].includes(s.theme)||(s.theme==='system'&&dark)?'dark':s.theme==='custom'&&M.contrast(p.background,'#ffffff')>M.contrast(p.background,'#000000')?'dark':'light'}}`;
     out+=rule('body,.p-pageWrapper,.p-body', 'background:var(--mt-f-background)!important;color:var(--mt-f-text)!important');
     out+=rule('.p-header,.p-nav,.p-sectionLinks,.p-body-header,.block-container,.block-header,.block-minorHeader,.block-body,.block-footer,.structItem,.node,.message,.message-cell,.message-inner,.message-user,.message-content,.message-body,.bbWrapper,.p-breadcrumbs,.p-footer,.menu-content,.menu-row,.overlay,.overlay-title,.overlay-content,.input,.fr-box,.fr-toolbar,.fr-element,.fr-wrapper,.pageNav-page','background-color:var(--mt-f-surface)!important;color:var(--mt-f-text)!important;border-color:var(--mt-f-border)!important');
     out+=rule('.p-body a:not(.button):not(.label),.p-nav a,.p-sectionLinks a,.p-breadcrumbs a,.p-footer a,.menu-content a:not(.button),.overlay a:not(.button)','color:var(--mt-f-accent)!important');
     out+=rule('.structItem-minor,.node-meta,.message-attribution,.message-userExtras,.u-muted,.p-description,.block-desc,.pairs>dt','color:var(--mt-f-muted)!important');
     out+=rule('.p-body a:focus-visible,.p-nav a:focus-visible,.p-body button:focus-visible,.p-body input:focus-visible','outline:2px solid var(--mt-f-accent)!important;outline-offset:2px');
   }
   if(p||s.radius!==M.defaults.radius)out+=rule('.block-container,.structItem,.message,.input,.fr-box,.menu-content,.overlay',`border-radius:${s.radius}px!important`);
   if(p||s.font!==M.defaults.font||s.fontSize!==M.defaults.fontSize){out+=rule('.p-body,.p-nav,.p-sectionLinks,.p-header,.p-footer',`font-family:${fonts[s.font]};font-size:${s.fontSize}px`);out+=rule('.message-body,.node-title,.structItem-title,.input,.fr-element',`font-size:${s.fontSize}px`);}
   if(s.width!=='original')out+=rule('.p-body-inner,.p-header-inner,.p-nav-inner,.p-sectionLinks-inner,.p-footer-inner',`max-width:${{wide:'1600px',full:'none',narrow:'1000px'}[s.width]}!important;width:100%;box-sizing:border-box`);
   if(s.density==='compact')out+=rule('.node-body,.structItem-cell,.message-cell,.block-header,.block-minorHeader','padding:6px 10px!important')+rule('.node-title,.structItem-title','line-height:1.35');
   if(s.header==='compact')out+=rule('.p-header-content,.p-nav-inner,.p-sectionLinks-inner','padding-top:4px!important;padding-bottom:4px!important')+rule('.p-header-logo img','max-height:44px!important;width:auto');
   if(s.header==='sticky')out+=rule('.p-navSticky','position:sticky!important;top:0;z-index:20');
   // Only a recognized layout with direct content/sidebar children; no DOM relocation.
   if(['left','right'].includes(s.sidebar))out+=`@media(min-width:1000px){${rule('.p-body-main[data-mt-layout]','display:flex!important;align-items:flex-start;gap:16px')}${rule('.p-body-main[data-mt-layout] > .p-body-content','display:block!important;min-width:0;flex:1;width:auto!important;padding:0!important')}${rule('.p-body-main[data-mt-layout] > .p-body-sidebar',`display:block!important;flex:0 0 280px;width:280px!important;max-width:30%;order:${s.sidebar==='left'?-1:1};padding:0!important`)}}`;
   if(s.sidebar==='minimal'||s.reading)out+=rule('.p-body-sidebar [data-widget-key="forum_overview_members_online"],.p-body-sidebar [data-widget-key="forum_overview_forum_statistics"],.p-body-sidebar [data-widget-key="forum_overview_new_posts"]','max-height:9em;overflow:auto');
   if(s.avatar==='small')out+=rule('.message-user .avatar','width:48px!important;height:48px!important');
   if(s.avatar==='round')out+=rule('.message-user .avatar,.message-user .avatar img','border-radius:50%!important');
   if(s.reading)out+=rule('.message-body .bbWrapper','line-height:1.75;overflow-wrap:anywhere')+rule('.message-body','max-width:90ch;margin-inline:auto');
   out+=rule('[data-mt-fold="closed"]','max-height:5em!important;overflow:hidden!important')+rule('button[data-mt-fold-button]','display:block;margin:4px 0;padding:4px 8px;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;cursor:pointer;font:inherit');
   return out;
 }
 function create(doc,readingAction=async()=>''){
   let current=null,style=null,identity='',override=null,controls=null,lastControlKey='',media=null,readingKey='',savedPost='',readingEpoch=0,readingStatus='';
   const layouts=new Set(),buttons=new Map();
   const refreshMedia=()=>apply();
   const effective=()=>current?{...current,reading:override??current.reading}:null;
   function clearNodes(){for(const [el,b] of buttons){b.remove();el.removeAttribute('data-mt-fold');}buttons.clear();for(const el of layouts)el.removeAttribute('data-mt-layout');layouts.clear();}
   function clear(){clearNodes();style?.remove();style=null;doc.documentElement.removeAttribute('data-mt-forum-custom');media?.removeEventListener?.('change',refreshMedia);media=null;current=null;identity='';override=null;controls=null;lastControlKey='';readingKey='';savedPost='';readingStatus='';++readingEpoch;}
   function fold(el,label){if(buttons.has(el))return;const b=doc.createElement('button');b.type='button';b.dataset.mtFoldButton='';b.textContent=`Развернуть ${label}`;b.setAttribute('aria-expanded','false');el.setAttribute('data-mt-fold','closed');b.addEventListener('click',()=>{const open=el.getAttribute('data-mt-fold')==='closed';el.setAttribute('data-mt-fold',open?'open':'closed');b.setAttribute('aria-expanded',String(open));b.textContent=`${open?'Свернуть':'Развернуть'} ${label}`;});el.before(b);buttons.set(el,b);}
   function apply(){const s=effective();if(!s)return;const active=s.theme!=='original'||s.radius!==M.defaults.radius||s.font!==M.defaults.font||s.fontSize!==M.defaults.fontSize||s.width!=='original'||s.density==='compact'||s.header!=='original'||s.sidebar!=='original'||s.avatar!=='original'||s.signatures==='collapse'||s.quotes==='collapse'||s.reading;
     if(!active){clearNodes();style?.remove();style=null;doc.documentElement.removeAttribute('data-mt-forum-custom');return;}
     if(!style){style=doc.createElement('style');style.dataset.mtForumStyle='';}if(!style.isConnected)(doc.head||doc.documentElement).append(style);const next=css(s,!!media?.matches);if(style.textContent!==next)style.textContent=next;if(!doc.documentElement.hasAttribute('data-mt-forum-custom'))doc.documentElement.setAttribute('data-mt-forum-custom','');
     const wanted=new Map();if(s.signatures==='collapse'||s.reading)for(const el of doc.querySelectorAll('article.message .message-signature,.message[data-content] .message-signature'))wanted.set(el,'подпись');if(s.quotes==='collapse'||s.reading)for(const el of doc.querySelectorAll('.message-body .bbCodeBlock--quote'))if(!el.parentElement?.closest('.bbCodeBlock--quote'))wanted.set(el,'цитату');
     for(const [el,b] of buttons)if(!wanted.has(el)||!el.isConnected||!b.isConnected){b.remove();el.removeAttribute('data-mt-fold');buttons.delete(el);}for(const [el,label] of wanted)fold(el,label);
     for(const el of layouts)if(!el.isConnected||!['left','right'].includes(s.sidebar)||!el.querySelector(':scope > .p-body-content')||!el.querySelector(':scope > .p-body-sidebar')){el.removeAttribute('data-mt-layout');layouts.delete(el);}
     if(['left','right'].includes(s.sidebar))for(const el of doc.querySelectorAll('.p-body-main'))if(el.querySelector(':scope > .p-body-content')&&el.querySelector(':scope > .p-body-sidebar')&&!layouts.has(el)){el.setAttribute('data-mt-layout','');layouts.add(el);}
   }
   function posts(){return [...doc.querySelectorAll('article.message[id],.message[data-content][id]')].filter(x=>/^(?:js-)?post-\d+$/.test(x.id)).slice(0,200);}
   function syncReading(){const s=effective(),next=s?.rememberReading&&posts().length?identity+':'+doc.location.pathname:'';if(next===readingKey)return;readingKey=next;savedPost='';readingStatus='';const epoch=++readingEpoch;if(!next)return;void readingAction('get').then(id=>{if(epoch===readingEpoch){savedPost=String(id||'');renderControls(controls);}}).catch(()=>{if(epoch===readingEpoch){readingStatus='Не удалось загрузить место чтения';renderControls(controls);}});}
   function changeReading(action,postId){const epoch=++readingEpoch;void readingAction(action,postId).then(id=>{if(epoch===readingEpoch){savedPost=String(id||'');readingStatus=action==='save'?'Место сохранено':'Место очищено';renderControls(controls);}}).catch(err=>{if(epoch===readingEpoch){readingStatus=err.message||'Не удалось сохранить место';renderControls(controls);}});}
   function renderControls(target){if(!target||!current)return;syncReading();const s=effective(),list=posts();const fingerprint=JSON.stringify([identity,doc.location.pathname,s.reading,s.outline,s.rememberReading,list.map(x=>x.id),savedPost,readingStatus]);if(controls===target&&lastControlKey===fingerprint)return;controls=target;lastControlKey=fingerprint;target.replaceChildren();
     const button=(title,fn)=>{const b=doc.createElement('button');b.type='button';b.className='btn secondary';b.textContent=title;b.addEventListener('click',fn);target.append(b);return b;};
     button(s.reading?'Выйти из режима чтения':'Режим чтения',()=>{override=!effective().reading;apply();renderControls(target);}).setAttribute('aria-pressed',String(s.reading));
     if(!list.length)return;
     button('К первому сообщению',()=>list[0].scrollIntoView({block:'start'}));button('К последнему',()=>list.at(-1).scrollIntoView({block:'start'}));
     if(s.outline){const label=doc.createElement('label');label.className='sub';label.textContent='Сообщения на странице';const select=doc.createElement('select');select.className='field';select.setAttribute('aria-label','Перейти к сообщению');select.append(new Option('Выберите сообщение',''));for(const post of list){const author=post.querySelector('.message-name,.message-userDetails .username')?.textContent?.trim()||'';select.append(new Option('#'+post.id.replace(/^.*post-/,'')+(author?' · '+author.slice(0,70):''),post.id));}select.addEventListener('change',()=>doc.getElementById(select.value)?.scrollIntoView({block:'start'}));label.append(select);target.append(label);}
     if(s.rememberReading){button('Запомнить место',()=>{const post=list.find(x=>x.getBoundingClientRect().bottom>0)||list.at(-1);changeReading('save',post.id);});if(savedPost&&list.some(x=>x.id===savedPost))button('Вернуться к сохранённому',()=>doc.getElementById(savedPost)?.scrollIntoView({block:'start'}));button('Очистить место',()=>changeReading('clear'));if(readingStatus){const msg=doc.createElement('span');msg.className='sub';msg.setAttribute('role','status');msg.textContent=readingStatus;target.append(msg);}}

   }
   function update(raw,id){const next=M.clean(raw);if(identity!==id||JSON.stringify(current)!==JSON.stringify(next)){override=null;identity=id;current=next;}if(!media){media=doc.defaultView.matchMedia('(prefers-color-scheme: dark)');media.addEventListener?.('change',refreshMedia);}apply();syncReading();}
   return {update,clear,refresh(){apply();syncReading();},renderControls};
 }
 globalThis.MTForumStyle=Object.freeze({create,css});
})();
