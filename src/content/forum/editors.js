/* Isolated editor integration. Never targets unrelated search/profile/password fields. */
(() => {
  'use strict';
  const SELECTOR = ['.fr-element[contenteditable="true"]','.js-editor[contenteditable="true"]','.message-editor [contenteditable="true"]','[data-xf-init~="editor"] [contenteditable="true"]','textarea[name="message"]','textarea[name="message_html"]','.js-quickReply textarea','[data-xf-init~="editor"] textarea','textarea[placeholder*="сообщен"]'].join(',');
  const isVisible = el => el.isConnected && el.getClientRects().length > 0 && !el.closest('[hidden],[inert],[aria-hidden="true"]') && !['hidden','collapse'].includes(getComputedStyle(el).visibility);
  function create(doc, {onChange=()=>{}}={}) {
    let active=null, listening=false, ranges=new WeakMap();
    function valid(el) {
      return el instanceof HTMLElement && el.matches(SELECTOR) && !el.closest('#rp-nexus-forum-020') && isVisible(el) && (el instanceof HTMLTextAreaElement ? !el.disabled&&!el.readOnly : el.isContentEditable);
    }
    function resolve(node) { const el=node instanceof Element ? node.closest(SELECTOR) : null; return valid(el)?el:null; }
    function candidates() {
      const all=[...doc.querySelectorAll(SELECTOR)].filter(valid);
      // A visible reply overlay takes precedence over the background quick reply.
      const modal=all.filter(el=>el.closest('dialog[open],.overlay-container.is-active,.overlay.is-active,[role="dialog"][aria-modal="true"]'));
      return modal.length?modal:all;
    }
    function contained(el,range) {return !!range && el.contains(range.startContainer) && el.contains(range.endContainer);}
    function selectionRange(el) {const s=doc.getSelection();const r=s?.rangeCount?s.getRangeAt(0):null;return contained(el,r)?r:null;}
    function remember(el) {if(!valid(el))return;const r=selectionRange(el);if(r)ranges.set(el,r.cloneRange());}
    function focus(ev) {const el=resolve(ev.target);if(el){active=el;remember(el);onChange();}}
    function selection() {if(active)remember(active);}
    function start(){if(listening)return;listening=true;doc.addEventListener('focusin',focus,true);doc.addEventListener('selectionchange',selection);}
    function stop(){if(!listening)return;listening=false;doc.removeEventListener('focusin',focus,true);doc.removeEventListener('selectionchange',selection);active=null;ranges=new WeakMap();}
    function find(){const focused=resolve(doc.activeElement);const list=candidates();if(focused&&list.includes(focused))return focused;if(valid(active)&&list.includes(active))return active;if(active&&!valid(active))return null;return list.length===1?list[0]:null;}
    function choose(el){if(!valid(el)||!candidates().includes(el))return false;active=el;return true;}
    function selected(el){if(!valid(el))return '';if(el instanceof HTMLTextAreaElement)return el.value.slice(el.selectionStart,el.selectionEnd);const r=selectionRange(el)||ranges.get(el);return contained(el,r)?r.toString():'';}
    function insert(el,text,format,mode='cursor') {
      if(!valid(el))throw Error('Редактор больше недоступен');
      if(!['cursor','start','end'].includes(mode))throw Error('Неизвестный режим вставки');
      const C=globalThis.RPNForumCore;
      if(el instanceof HTMLTextAreaElement){
        const start=mode==='start'?0:mode==='end'?el.value.length:el.selectionStart??el.value.length;
        const end=mode==='cursor'?el.selectionEnd??start:start;
        el.focus();el.setSelectionRange(start,end);
        let native=false;try{native=doc.execCommand('insertText',false,text);}catch{}
        if(!native){el.setRangeText(text,start,end,'end');el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));}
        el.dispatchEvent(new Event('change',{bubbles:true}));active=el;return;
      }
      // Capture the range before focus can trigger selectionchange in a different editor.
      const saved=selectionRange(el)||ranges.get(el);el.focus();const sel=doc.getSelection();
      let range=mode==='cursor'&&contained(el,saved)?saved.cloneRange():doc.createRange();
      if(mode!=='cursor'||!contained(el,saved)){range.selectNodeContents(el);range.collapse(mode==='start');}
      sel.removeAllRanges();sel.addRange(range);
      const markup=format==='bbcode'?C.bbcodeToHtml(text):C.esc(text).replace(/\r?\n/g,'<br>');
      const fragment=globalThis.MTSafeDOM.htmlFragment(markup);
      // Serialize only the allow-listed reconstructed DOM before handing it to native editing.
      const wrapper=doc.createElement('div');wrapper.append(fragment.cloneNode(true));
      let handled=false;try{handled=doc.execCommand('insertHTML',false,wrapper.innerHTML);}catch{}
      if(!handled){range.deleteContents();const last=fragment.lastChild;range.insertNode(fragment);if(last){range.setStartAfter(last);range.collapse(true);sel.removeAllRanges();sel.addRange(range);}el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste',data:text}));}
      active=el;remember(el);
    }
    return {start,stop,find,choose,candidates,resolve,selected,insert};
  }
  globalThis.MTForumEditors=Object.freeze({create});
})();
