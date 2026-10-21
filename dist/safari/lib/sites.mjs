export const FORUM_SITE = {
  id: 'majestic-forum', name: 'Majestic RP Forum', origin: 'https://forum.majestic-rp.ru/*', url: 'https://forum.majestic-rp.ru/', description: 'Добавляет небольшую кнопку MajesticToolkit на страницах форума. Содержимое страниц не собирается.'
};
export const RUSSIA_FORUM = { id: 'russia-forum', name: 'Russia Online Forum', origin: 'https://forum.russia.online/*', url: 'https://forum.russia.online/' };
export const BOOKMARKS = Object.freeze([
  { name: 'Majestic RP Forum', url: 'https://forum.majestic-rp.ru/', detail: 'Официальный форум Majestic RP' },
  { name: 'Fletcher Wiki', url: 'https://fletcher-wiki.com/', detail: 'Каталоги, игровые калькуляторы и статистика' },
  { name: 'Docossum', url: 'https://docossum.com/', detail: 'Законодательство, памятки и документы' },
  { name: 'Google Docs', url: 'https://docs.google.com/document/u/0/', detail: 'Документы Google' },
  { name: 'Google Sheets', url: 'https://docs.google.com/spreadsheets/u/0/', detail: 'Таблицы Google' }
]);
export function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
