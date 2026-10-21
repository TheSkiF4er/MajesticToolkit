/* RP Nexus v0.2.0: permission-gated local Forum Toolkit registration. */
const api = globalThis.browser ?? globalThis.chrome;
const FORUMS = [
  { id: 'rp-nexus-majestic-forum-v2', origin: 'https://forum.majestic-rp.ru/*' },
  { id: 'rp-nexus-russia-forum-v2', origin: 'https://forum.russia.online/*' }
];
const LEGACY = 'rp-nexus-majestic-launcher-v1';
async function syncForumScripts() {
  try {
    const registrations = await api.scripting.getRegisteredContentScripts();
    if (registrations.some(r => r.id === LEGACY)) await api.scripting.unregisterContentScripts({ ids: [LEGACY] });
    const present = new Set(registrations.map(r => r.id));
    for (const site of FORUMS) {
      const granted = await api.permissions.contains({ origins: [site.origin] });
      if (granted && !present.has(site.id)) await api.scripting.registerContentScripts([{ id: site.id, matches: [site.origin], js: ['lib/forum-core.js', 'content/forum.js'], runAt: 'document_idle', allFrames: false, persistAcrossSessions: true }]);
      if (!granted && present.has(site.id)) await api.scripting.unregisterContentScripts({ ids: [site.id] });
    }
  } catch (error) { console.error('RP Nexus: forum registration failed', error); }
}
api.runtime.onInstalled.addListener(() => { void syncForumScripts(); });
api.runtime.onStartup?.addListener(() => { void syncForumScripts(); });
api.permissions.onAdded.addListener(() => { void syncForumScripts(); });
api.permissions.onRemoved.addListener(() => { void syncForumScripts(); });
api.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'RP_NEXUS_OPEN_WORKSPACE') return;
  let origin;
  try { origin = new URL(sender.url ?? '').origin; } catch { return; }
  if (!FORUMS.some(s => s.origin.startsWith(origin + '/'))) return;
  const suffix = message.view === 'forum' ? '#forum' : '';
  void api.tabs.create({ url: api.runtime.getURL('ui/workspace.html' + suffix) });
});
void syncForumScripts();
