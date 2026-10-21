(() => {
  if (document.getElementById('rp-nexus-launcher-010')) return;
  const api = globalThis.browser ?? globalThis.chrome;
  if (!api?.runtime?.id) return;
  const root = document.createElement('div');
  root.id = 'rp-nexus-launcher-010';
  root.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483646';
  const shadow = root.attachShadow({ mode: 'closed' });
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Открыть RP Nexus');
  button.title = 'Открыть рабочее пространство RP Nexus';
  button.textContent = 'RN';
  button.style.cssText = 'height:44px;width:44px;border-radius:14px;border:1px solid #8b9ef5;background:#202b59;color:#fff;font:700 14px system-ui,sans-serif;box-shadow:0 7px 18px #0005;cursor:pointer';
  button.addEventListener('click', () => {
    try { const result = api.runtime.sendMessage({ type: 'RP_NEXUS_OPEN_WORKSPACE' }); result?.catch?.(() => {}); }
    catch { button.title = 'Перезагрузите страницу для повторного подключения'; }
  });
  shadow.append(button);
  (document.body ?? document.documentElement).append(root);
})();
