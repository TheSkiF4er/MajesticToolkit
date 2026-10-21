/* On-page, click-to-save evidence only. No recording, uploads or passive collection. */
(() => {
  'use strict';
  if (document.getElementById('rpn-evidence-v3')) return;
  const api = globalThis.browser ?? globalThis.chrome;
  const C = globalThis.RPNComplaints;
  if (!api?.runtime?.id || !C) return;
  let all = [], state, open = false;
  const host = document.createElement('div'); host.id='rpn-evidence-v3';
  host.style.cssText='position:fixed;left:15px;bottom:18px;z-index:2147483646';
  const shadow = host.attachShadow({mode:'open'});
  shadow.innerHTML = `<style>:host{all:initial}*{box-sizing:border-box}button,select,input{font:13px system-ui}.launch{border:1px solid #7189d3;background:#283c8c;color:#fff;border-radius:12px;padding:11px;font-weight:700;cursor:pointer}.panel{display:none;background:#142035;color:#fff;border:1px solid #465d91;box-shadow:0 6px 24px #0008;border-radius:12px;padding:13px;width:min(325px,calc(100vw - 24px));font:13px/1.4 system-ui;margin-bottom:7px}.panel.open{display:block}.row{display:flex;align-items:center;gap:8px;margin:8px 0}.panel select,.panel input{color:#fff;background:#233354;border:1px solid #6276a7;padding:8px;width:100%;border-radius:7px}.panel button{padding:8px;border:1px solid #6076ab;border-radius:8px;color:#fff;background:#344b91;cursor:pointer}.sub{color:#bac7e1;font-size:11px}.info{white-space:pre-wrap;color:#addfc7;font-size:11px;min-height:16px}</style><div class="panel"><strong>RP Nexus · Доказательства</strong><p class="sub">Сохранить ссылку и текущий таймкод видео в жалобу. Видео не скачивается.</p><label>Жалоба<select id="target"></select></label><div class="row"><label style="flex:1">Название<input id="title" maxlength="180" value="Видео" /></label></div><div class="row"><button id="save">Сохранить момент</button><button id="workspace">Жалобы ↗</button></div><p class="info" aria-live="polite"></p></div><button class="launch" aria-expanded="false">RN · Видео</button>`;
  (document.body || document.documentElement).append(host);
  const panel=shadow.querySelector('.panel'),launch=shadow.querySelector('.launch'), select=shadow.querySelector('#target'),info=shadow.querySelector('.info');
  const escape = text => String(text).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function refresh() {
    const records = await api.storage.local.get(null);
    state = records.rpNexusStateV1;
    all = Object.entries(records).filter(([key])=>key.startsWith(C.PREFIX)).flatMap(([key,value])=>{
      try{ const it=C.cleanCase(value); return key===C.PREFIX+it.id && it.profileId===state?.activeProfileId ? [it]:[]; }catch{return [];}
    });
    const current=select.value;
    select.innerHTML=all.length ? all.map(x=>`<option value="${escape(x.id)}">${escape(x.title)}</option>`).join('') : '<option value="">Нет жалоб в активном профиле</option>';
    if(all.some(x=>x.id===current)) select.value=current;
  }
  launch.addEventListener('click',()=>{open=!open; panel.classList.toggle('open',open);launch.setAttribute('aria-expanded',String(open));if(open)void refresh().catch(err=>info.textContent=err.message);});
  shadow.querySelector('#workspace').addEventListener('click',()=>{void api.runtime.sendMessage({type:'RP_NEXUS_OPEN_WORKSPACE',view:'complaints'});});
  // No page interaction outside an explicit user click.
  shadow.querySelector('#save').addEventListener('click',async()=>{
    try {
      if(!select.value) throw Error('Создайте жалобу в RP Nexus');
      const video=document.querySelector('video');
      const seconds=video && Number.isFinite(video.currentTime) && video.currentTime >= 0 ? Math.floor(video.currentTime) : null;
      let title=shadow.querySelector('#title').value.trim() || document.title.slice(0,180);
      const link=location.href;
      const response=await api.runtime.sendMessage({type:'RP_NEXUS_VIDEO_ADD',id:select.value,input:{title,url:link,seconds,note:''}});
      if(!response?.ok) throw Error(response?.error || 'Не удалось сохранить доказательство');
      info.textContent=`Сохранено${seconds===null?'':' · '+C.timecode(seconds)}. Откройте RP Nexus для просмотра.`;
      await refresh();
    }catch(err){info.textContent=err.message;}
  });
  api.storage.onChanged.addListener((changes,area)=>{if(open && area==='local' && Object.keys(changes).some(k=>k=== 'rpNexusStateV1' || k.startsWith(C.PREFIX)))void refresh().catch(()=>{});});
})();
