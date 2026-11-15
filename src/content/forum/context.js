/* Context is evaluated against the actual current page on each action. */
(() => {
  'use strict';
  function read(doc, href=doc.location.href) {
    const xf=globalThis.MTXenForo.identify(href,doc);
    if(!xf)return null;
    return {...xf,url:href,title:(doc.querySelector('h1.p-title-value,h1')?.textContent||doc.title).trim().slice(0,250),section:doc.querySelector('.p-breadcrumbs li:last-child a')?.textContent?.trim()||'',kind:xf.thread?'thread':xf.member?'member':'forum'};
  }
  globalThis.MTForumContext=Object.freeze({read});
})();
