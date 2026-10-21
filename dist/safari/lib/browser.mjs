export const api = globalThis.browser ?? globalThis.chrome;
export function isExtensionAvailable() { return Boolean(api?.runtime?.id); }
export async function openWorkspace() { return api.tabs.create({ url: api.runtime.getURL('ui/workspace.html') }); }
export async function openTab(url) { return api.tabs.create({ url }); }
export async function openSidePanel() {
  try {
    if (api.sidebarAction?.open) { await api.sidebarAction.open(); return; }
    if (api.sidePanel?.open) {
      const windows = await api.windows.getCurrent();
      await api.sidePanel.open({ windowId: windows.id });
      return;
    }
  } catch (err) {
    console.warn('MajesticToolkit: side panel unavailable, opening workspace', err);
  }
  return openWorkspace();
}
