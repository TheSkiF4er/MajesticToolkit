/* MajesticToolkit 1.1: shared XenForo DOM adapter. Runs unchanged inside isolated content scripts. */
(() => {
  'use strict';
  const FORUMS = Object.freeze({
    'forum.majestic-rp.ru': Object.freeze({ project: 'majestic', name: 'Majestic RP', nav: ['.p-nav-list', '.p-sectionLinks-list', '.p-nav-inner .p-nav-list'], members: ['/members/'] }),
    'forum.russia.online': Object.freeze({ project: 'russia-online', name: 'Russia Online', nav: ['.p-nav-list', '.p-sectionLinks-list', '.p-nav-inner .p-nav-list'], members: ['/members/'] })
  });
  const LIMIT = 60, PREFIX = 'majesticToolkitXfNavV11:';
  const idOk = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(x);
  const profileOk = x => typeof x === 'string' && /^[a-zA-Z0-9_*-]{1,128}$/.test(x);
  const clean = (x, max, field) => {
    if (typeof x !== 'string' || !x.trim() || x.trim().length > max) throw Error(`Некорректное поле: ${field}`);
    return x.trim();
  };
  function domain(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port ? (FORUMS[u.hostname.toLowerCase()] ? u.hostname.toLowerCase() : null) : null; }
    catch { return null; }
  }
  function safeLink(value) {
    const source = clean(value, 2048, 'ссылка');let u;
    try { u = new URL(source); } catch { throw Error('Нужен полный HTTPS-адрес'); }
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password || u.port || /[\x00-\x1f]/.test(source)) throw Error('Разрешены только обычные HTTPS-ссылки без учётных данных');
    return u.href;
  }
  function validateLink(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || !idOk(data.id) || !profileOk(data.profileId)) throw Error('Некорректные данные ссылки');
    return { id:data.id, profileId:data.profileId, title:clean(data.title,70,'название'), url:safeLink(data.url), createdAt:typeof data.createdAt==='string'&&Number.isFinite(Date.parse(data.createdAt))?data.createdAt:new Date().toISOString() };
  }
  function validateLinks(data) {
    if (!Array.isArray(data) || data.length > LIMIT) throw Error(`Максимум ${LIMIT} пользовательских ссылок`);
    const used = new Set();return data.map(row=>{const link=validateLink(row);if(used.has(link.id))throw Error('Повторный идентификатор ссылки');used.add(link.id);return link;});
  }
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
  globalThis.MTXenForo = Object.freeze({FORUMS,PREFIX,LIMIT,domain,safeLink,validateLink,validateLinks,matchingProfile,identify,memberProfile,moderationAction});
})();
