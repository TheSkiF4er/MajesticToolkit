export const api = globalThis.browser ?? globalThis.chrome;
export function isExtensionAvailable() { return Boolean(api?.runtime?.id); }
export async function openWorkspace() { return api.tabs.create({ url: api.runtime.getURL('ui/workspace.html') }); }
export async function openTab(url) { return api.tabs.create({ url }); }
export async function openSidePanel() {
  try {
    if (api.sidebarAction?.open) { await api.sidebarAction.open(); return; }
    if (api.sidePanel?.open) {
      await api.sidePanel.open({ windowId: api.windows.WINDOW_ID_CURRENT ?? -2 });
      return;
    }
  } catch (err) {
    console.warn('RP Nexus: side panel unavailable, opening workspace', err);
  }
  return openWorkspace();
}
