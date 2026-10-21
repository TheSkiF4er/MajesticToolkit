// MajesticToolkit 0.8.0 — data validation and serialization (no network side effects).
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const LINK_KEY = 'majesticToolkit:externalLinks:v8';
export const CLIENT_ID_KEY = 'majesticToolkit:googleClientId:v8';
const allowedHosts = new Set(['docossum.com','www.docossum.com','fletcher-wiki.com','www.fletcher-wiki.com']);
const trim = (x, max, label) => { if (typeof x !== 'string' || x.trim().length > max || !x.trim()) throw Error(`Некорректное поле: ${label}`); return x.trim(); };
export function safeSiteUrl(value) {
  const text = trim(value, 1000, 'URL'); let url;
  try { url = new URL(text); } catch { throw Error('Введите полный HTTPS-адрес'); }
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase()) || url.username || url.password || url.port || url.hash.length > 300) throw Error('Разрешены только HTTPS-ссылки Docossum и Fletcher Wiki');
  return url.href;
}
export function validateLinks(data) {
  if (!Array.isArray(data) || data.length > 150) throw Error('Максимум 150 внешних закладок');
  const ids = new Set();
  return data.map(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(item.id) || ids.has(item.id)) throw Error('Некорректный ID закладки');
    ids.add(item.id);
    return {id:item.id,title:trim(item.title,120,'название'),url:safeSiteUrl(item.url),notes:typeof item.notes==='string'?item.notes.slice(0,1500):''};
  });
}
export function normalizeClientId(value) {
  const id=trim(value,250,'OAuth Client ID');
  if (!/^\d{8,}-[a-z0-9_-]{10,}\.apps\.googleusercontent\.com$/i.test(id)) throw Error('Нужен Client ID приложения Google OAuth, не Client Secret');
  return id;
}
export function googleFileId(value) {
  if (typeof value !== 'string' || !/^[\w-]{10,180}$/.test(value)) throw Error('Некорректный идентификатор файла Google');
  return value;
}
export function sheetRange(value) {
  const name = trim(value,100,'лист').replace(/^'+|'+$/g,'');
  if (/[\r\n\x00-\x1f]/.test(name)) throw Error('Некорректное название листа');
  return `'${name.replaceAll("'", "''")}'!A1`;
}
export function sheetsGrid(kind,records,profileId) {
  if(!Array.isArray(records))throw Error('Ожидался список записей');
  const items = records.filter(x=>x?.profileId===profileId);
  let rows;
  if(kind==='economy') {
    rows=[['Тип','Дата','Название / игрок','Категория / семья','Статус / результат','Количество','Покупка','Продажа','Комиссия покупки','Комиссия продажи','Доход / расход','Убийства','Смерти','Урон','Комментарий']];
    for(const r of items) rows.push([
      r.type??'',r.date??'',r.title??r.player??'',r.category??r.family??'',r.status??r.result??r.kind??'',
      r.quantity??'',r.buyPrice??'',r.salePrice??'',r.buyFee??'',r.saleFee??'',r.amount??'',r.kills??'',r.deaths??'',r.damage??'',r.note??''
    ]);
  } else if(kind==='complaints') {
    rows=[['Тема','URL','Статус','Срок','Заметки','Черновик','Обновлено']];
    for(const r of items) rows.push([r.title??'',r.url??'',r.status??'',r.deadline??'',r.note??'',r.draft??'',r.updatedAt??'']);
  } else throw Error('Неподдерживаемый тип экспорта');
  return rows.map(row=>row.map(x=>x==null?'':(typeof x==='object'?JSON.stringify(x):String(x))));
}
export function csvOf(rows) {
  // Protect CSV opened in spreadsheet applications from formula execution.
  return rows.map(row=>row.map(cell=>{
    let text=String(cell??'');
    if(/^[\t\r\n ]*[=+@-]/.test(text))text="'"+text;
    return `"${text.replaceAll('"','""')}"`;
  }).join(',')).join('\r\n')+'\r\n';
}
export function docsPlainText(document) {
  if(!document || typeof document !== 'object')throw Error('Некорректный документ Google');
  const collect = (nodes) => (nodes||[]).flatMap(node=> {
    if(node.paragraph)return [(node.paragraph.elements||[]).map(x=>x.textRun?.content??'').join('')];
    if(node.table)return node.table.tableRows?.flatMap(row=>row.tableCells?.map(cell=>collect(cell.content).join(''))??[])??[];
    return [];
  });
  const body=collect(document.body?.content ?? (document.tabs?.flatMap(t=>t.documentTab?.body?.content||[]) || [])).join('');
  return body.slice(0,60000).trim();
}
export function authUrl({clientId,redirectUri,state,challenge}) {
  normalizeClientId(clientId);
  if (!/^https:\/\/[a-z0-9.-]+\/(?:[\w/-]+)?$/i.test(redirectUri)) throw Error('Неверный адрес OAuth redirect');
  const q=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:GOOGLE_SCOPE,access_type:'online',prompt:'consent',state,code_challenge:challenge,code_challenge_method:'S256'});
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}
export function parseRedirect(full,expected,state) {
  const result=new URL(full),target=new URL(expected);
  if(result.origin!==target.origin||result.pathname!==target.pathname)throw Error('OAuth redirect не совпадает');
  if(result.searchParams.get('state')!==state)throw Error('OAuth state не совпадает');
  if(result.searchParams.has('error')) throw Error(`Google OAuth: ${result.searchParams.get('error')}`);
  const code=result.searchParams.get('code');if(!code)throw Error('Google не вернул код авторизации');return code;
}
export function cleanGoogleFileList(data) {
  if(!Array.isArray(data?.files))throw Error('Некорректный ответ Google Drive');
  return data.files.slice(0,50).filter(x=>x&&typeof x.id==='string').map(x=>({id:googleFileId(x.id),name:String(x.name||'Без названия').slice(0,180),mimeType:String(x.mimeType||''),modifiedTime:String(x.modifiedTime||''),webViewLink:typeof x.webViewLink==='string'&&/^https:\/\/(?:drive|docs)\.google\.com\//.test(x.webViewLink)?x.webViewLink:''}));
}
