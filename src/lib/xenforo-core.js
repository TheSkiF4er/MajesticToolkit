/* MajesticToolkit 1.1: shared XenForo DOM adapter. Runs unchanged inside isolated content scripts. */
(() => {
  'use strict';
  const FORUMS = Object.freeze({
    'forum.majestic-rp.ru': Object.freeze({ project: 'majestic', name: 'Majestic RP', nav: ['.p-nav-list', '.p-sectionLinks-list', '.p-nav-inner .p-nav-list'], members: ['/members/'] }),
    'forum.russia.online': Object.freeze({ project: 'russia-online', name: 'Russia Online', nav: ['.p-nav-list', '.p-sectionLinks-list', '.p-nav-inner .p-nav-list'], members: ['/members/'] })
  });
  const LIMIT = 60, BOOKMARK_LIMIT = 300, PREFIX = 'majesticToolkitXfNavV11:';
  const idOk = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(x);
  const profileOk = x => typeof x === 'string' && /^[a-zA-Z0-9_*-]{1,128}$/.test(x);
  const clean = (x, max, field) => {
    if (typeof x !== 'string' || !x.trim() || x.trim().length > max) throw Error(`Некорректное поле: ${field}`);
    return x.trim();
  };
  function domain(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port ? (Object.hasOwn(FORUMS,u.hostname.toLowerCase()) ? u.hostname.toLowerCase() : null) : null; }
    catch { return null; }
  }
  function safeLink(value) {
    const source = clean(value, 2048, 'ссылка');let u;
    try { u = new URL(source); } catch { throw Error('Нужен полный HTTPS-адрес'); }
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password || u.port || /[\x00-\x1f]/.test(source)) throw Error('Разрешены только обычные HTTPS-ссылки без учётных данных');
    return u.href;
  }
  function newLinkId(){const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));return 'xf_'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
  function validateLink(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || !idOk(data.id) || !profileOk(data.profileId)) throw Error('Некорректные данные ссылки');
    const out={ id:data.id, profileId:data.profileId, title:clean(data.title,70,'название'), url:safeLink(data.url), createdAt:typeof data.createdAt==='string'&&Number.isFinite(Date.parse(data.createdAt))?data.createdAt:new Date().toISOString() };
    const options={kind:['link','bookmark'],placement:['header','panel','both'],target:['new','current'],host:['*',...Object.keys(FORUMS)],icon:['link','star','book','folder','chat','law']};
    for(const [key,values] of Object.entries(options))if(Object.hasOwn(data,key)){if(!values.includes(data[key]))throw Error('Некорректное поле: '+key);out[key]=data[key];}
    for(const [key,max] of [['group',160],['note',2000]])if(Object.hasOwn(data,key)){if(typeof data[key]!=='string'||data[key].length>max)throw Error('Некорректное поле: '+key);out[key]=data[key].trim();}
    if(out.group){const parts=out.group.split('/').map(x=>x.trim());if(parts.length>5||parts.some(x=>!x||x.length>50))throw Error('Некорректная группа');out.group=parts.join('/');}
    if(Object.hasOwn(data,'tags')){if(!Array.isArray(data.tags)||data.tags.length>12)throw Error('Некорректные теги');out.tags=[...new Set(data.tags.map(x=>clean(x,40,'тег')))];}
    if(Object.hasOwn(data,'order')){if(!Number.isSafeInteger(data.order)||data.order<0||data.order>1000000)throw Error('Некорректный порядок');out.order=data.order;}
    if(Object.hasOwn(data,'pinned')){if(typeof data.pinned!=='boolean')throw Error('Некорректное закрепление');out.pinned=data.pinned;}
    if(out.kind==='bookmark'){out.url=pageUrl(out.url);if(!domain(out.url)||out.profileId==='*')throw Error('Закладка требует профиль и URL форума');if(out.host&&out.host!=='*'&&out.host!==domain(out.url))throw Error('Домен закладки не совпадает');out.host=domain(out.url);out.placement='panel';}
    if(Object.hasOwn(data,'lastOpened')){if(typeof data.lastOpened!=='string'||!Number.isFinite(Date.parse(data.lastOpened)))throw Error('Некорректная дата открытия');out.lastOpened=data.lastOpened;}
    return out;
  }
  function validateLinks(data) {
    if (!Array.isArray(data) || data.length > LIMIT+BOOKMARK_LIMIT) throw Error(`Максимум ${LIMIT} ссылок и ${BOOKMARK_LIMIT} закладок`);
    const used = new Set();let links=0,bookmarks=0;return data.map(row=>{const link=validateLink(row);if(used.has(link.id))throw Error('Повторный идентификатор ссылки');used.add(link.id);if(link.kind==='bookmark'?++bookmarks>BOOKMARK_LIMIT:++links>LIMIT)throw Error('Превышен лимит навигации');return link;});
  }
  function selectNavigation(rows,profileId,host,zone='all',query=''){
    const words=String(query).toLocaleLowerCase('ru').trim().split(/\s+/).filter(Boolean);
    return rows.filter(x=>(x.profileId==='*'||x.profileId===profileId)&&(!x.host||x.host==='*'||x.host===host)&& (zone==='all'||(zone==='header'?x.kind!=='bookmark'&&['header','both'].includes(x.placement||'both'):x.kind==='bookmark'||['panel','both'].includes(x.placement||'both')))&&words.every(w=>[x.title,x.url,x.group,x.note,...(x.tags||[])].join(' ').toLocaleLowerCase('ru').includes(w))).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||(a.order??1000000)-(b.order??1000000)||a.title.localeCompare(b.title,'ru')||a.id.localeCompare(b.id));
  }
  function pageUrl(value){const u=new URL(safeLink(value));if(!domain(u.href))throw Error('Нужна страница форума');if(!/^\/(?:threads|forums|members|pages)\/[^/]+(?:\/page-\d+)?\/?$/i.test(u.pathname)&&u.pathname!=='/'&&u.pathname!=='/forums/')throw Error('Эта страница не поддерживается');if(/\/(?:login|logout|account|admin|edit|delete|lock|move|reply)(?:\/|$)/i.test(u.pathname))throw Error('Служебная страница');u.search='';if(!/^#(?:js-)?post-\d+$/.test(u.hash))u.hash='';return u.href;}
  function matchingProfile(profiles, activeId, site) {
    const host=domain(site);if(!host)return null;
    const matches=(profiles||[]).filter(p=>domain(p.forumUrl)===host);
    return matches.find(p=>p.id===activeId) || matches[0] || null;
  }
  function identify(href, doc) {
    const host=domain(href);if(!host)return null;
    const u=new URL(href);
    const foundVersion = doc?.querySelector?.('meta[name="generator"]')?.getAttribute('content') || '';
    const hasXf=Boolean(doc?.querySelector?.('.p-nav, .p-header, .block-container, .message--post, [data-xf-init], .p-staffBar')) || /XenForo/i.test(foundVersion);
    return {host,project:FORUMS[host].project,site:FORUMS[host].name,isXenForo:hasXf,thread:/\/threads\/[^/]+/i.test(u.pathname),member:/\/members\/[^/]+/i.test(u.pathname)};
  }
  function memberProfile(doc, href) {
    const context=identify(href,doc);
    if(!context?.member)return null;
    const u=new URL(href), part=u.pathname.match(/\/members\/([^/?#]+)/i)?.[1];if(!part)return null;
    const getText=selectors=>{
      for(const s of selectors){const node=doc.querySelector(s);const text=node?.textContent?.replace(/\s+/g,' ').trim();if(text)return text.slice(0,280);}
      return '';
    };
    const title=getText(['.memberHeader-name','.memberHeader-main h1','.p-title-value','h1']);
    if(!title)return null;
    const subtitle=getText(['.memberHeader-blurb','.memberHeader-userTitle','.userTitle']);
    const stats=[];
    for(const row of Array.from(doc.querySelectorAll('.memberHeader-stats .pairs, .memberHeader-stats dl, .block-body .pairs, .memberHeader-info .pairs')).slice(0,30)) {
      const k=row.querySelector('dt, .pairs-key')?.textContent?.replace(/\s+/g,' ').trim();
      const v=row.querySelector('dd, .pairs-value')?.textContent?.replace(/\s+/g,' ').trim();
      if(k && v && k.length<70 && v.length<130 && !stats.some(x=>x.label===k))stats.push({label:k,value:v});
      if(stats.length>=8)break;
    }
    return {name:title,subtitle,url:u.origin+u.pathname,stats,site:context.site};
  }
  // Never manufacture moderation URLs or submit actions. Only interact with visible native controls.
  function moderationAction(doc,href,action) {
    const ctx=identify(href,doc);if(!ctx?.thread || !['close','move'].includes(action))return null;
    const patterns=action==='move' ? {path:/(?:^|\/)(?:move|move-thread)(?:[\/?#]|$)/i,text:/^(?:переместить|перенести)(?:\s+(?:тему|обсуждение))?$|^move(?: thread)?$/i} :
      {path:/(?:^|\/)(?:lock|unlock|close|open)(?:[\/?#]|$)/i,text:/^(?:закрыть|открыть|заблокировать|разблокировать)(?:\s+(?:тему|обсуждение))?$|^(?:lock|unlock|close|reopen)(?: thread)?$/i};
    const origin=new URL(href).origin;
    for(const node of doc.querySelectorAll('a[href],button[data-xf-click],button[data-href],.menu button')) {
      if(node.closest?.('#rp-nexus-forum-020'))continue;
      if(node.matches?.('[hidden],[aria-disabled="true"],:disabled'))continue;
      if(node.getClientRects && !node.getClientRects().length)continue;
      const raw=node.getAttribute('href') || node.getAttribute('data-href') || '';
      if(raw && raw!=='#') {
        let u;try{u=new URL(raw,href)}catch{continue}
        if(u.origin!==origin)continue;
        if(patterns.path.test(u.pathname) && (/\/threads\//i.test(u.pathname) || node.closest?.('.menu,.block-outer,.p-title-pageAction')))return node;
      }
      const visibleText=node.textContent?.replace(/\s+/g,' ').trim()||'';
      if(node.closest?.('.menu,.block-outer,.p-title-pageAction,.js-threadAction') && patterns.text.test(visibleText))return node;
    }
    return null;
  }
  // A missing reply form is not evidence of a locked thread (guest/no permission).
  // Only explicit visible lock markers or an unambiguous native thread control count.
  function threadState(doc,href){
    if(!identify(href,doc)?.thread)return 'unknown';
    const marker=Array.from(doc.querySelectorAll('.blockStatus-message--locked')).find(n=>!n.closest?.('[hidden],[aria-hidden="true"]')&&(!n.getClientRects||n.getClientRects().length));
    if(marker)return 'closed';
    const control=moderationAction(doc,href,'close');if(!control)return 'unknown';
    const raw=control.getAttribute('href')||control.getAttribute('data-href')||'';
    try{const u=new URL(raw,href);const current=new URL(href);const key=x=>x.pathname.match(/\/threads\/([^/]+)(?:\/|$)/i)?.[1]?.match(/(?:^|\.)(\d+)$/)?.[1];
      if(u.origin===current.origin&&key(u)&&key(u)===key(current)){
        // lock/unlock and close/open controls name the requested next state.
        if(/\/(?:unlock|open)\/?$/i.test(u.pathname))return 'closed';
        if(/\/(?:lock|close)\/?$/i.test(u.pathname))return 'open';
      }
    }catch{}return 'unknown';
  }
  globalThis.MTXenForo = Object.freeze({FORUMS,PREFIX,LIMIT,BOOKMARK_LIMIT,newLinkId,selectNavigation,pageUrl,domain,safeLink,validateLink,validateLinks,matchingProfile,identify,memberProfile,moderationAction,threadState});
})();
