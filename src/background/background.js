/* Background event handler. There is no network communication. */
const api = globalThis.browser ?? globalThis.chrome;
const SCRIPT_ID = 'rp-nexus-majestic-launcher-v1';
const ORIGIN = 'https://forum.majestic-rp.ru/*';
async function synchronizeLauncher() {
  try {
    const granted = await api.permissions.contains({ origins: [ORIGIN] });
    const registrations = await api.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    const present = registrations.some(s => s.id === SCRIPT_ID);
    if (granted && !present) {
      await api.scripting.registerContentScripts([{ id: SCRIPT_ID, js: ['content/launcher.js'], matches: [ORIGIN], runAt: 'document_idle', allFrames: false, persistAcrossSessions: true }]);
    } else if (!granted && present) {
      await api.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    }
  } catch (error) { console.error('RP Nexus: registration error', error); }
}
api.runtime.onInstalled.addListener(() => { void synchronizeLauncher(); });
api.runtime.onStartup?.addListener(() => { void synchronizeLauncher(); });
api.permissions.onAdded.addListener(() => { void synchronizeLauncher(); });
api.permissions.onRemoved.addListener(() => { void synchronizeLauncher(); });
api.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'RP_NEXUS_OPEN_WORKSPACE' || !sender?.url?.startsWith('https://forum.majestic-rp.ru/')) return;
  void api.tabs.create({ url: api.runtime.getURL('ui/workspace.html') });
});
void synchronizeLauncher();
