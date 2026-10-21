import {api} from '../lib/browser.mjs';
import {escapeHtml as escape,BOOKMARKS} from '../lib/sites.mjs';
import {getClientId,setClientId,redirectUri,googleStatus,connectGoogle,disconnectGoogle,createGoogleDoc,readGoogleDoc,createGoogleSheet,readGoogleSheet,uploadBackupToDrive,listGoogleFiles,readBackupFromDrive} from '../lib/google-client.mjs';
import {listLinks,addLink,deleteLink} from '../lib/integration-store.mjs';
import {docsPlainText,sheetsGrid,csvOf,googleFileId,safeSiteUrl} from '../lib/integration-core.mjs';
import {documentRecords,refreshDocuments} from './document-page.mjs';
import {governmentRecords} from './government-page.mjs';
import {addStudioDocument} from '../lib/document-store.mjs';
import {listEconomy} from '../lib/economy-store.mjs';
import {listCases} from '../lib/complaints-store.mjs';
let links=[],clientId='',authenticated=false,files=[],tablePreview=[],previewTitle='';
const e=v=>escape(String(v??''));
const sanitizeFileName=s=>String(s||'majestictoolkit').replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]/g,'_').slice(0,90);
function download(name,text,type='text/plain;charset=utf-8'){
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export const externalLinks=()=>links;
export async function refreshIntegrations(){[links,clientId,authenticated]=await Promise.all([listLinks(),getClientId(),googleStatus()]);}
const docRows=profile=>documentRecords().filter(r=>r.profileId===profile&&r.type==='document');
const linkSet=[{name:'Fletcher Wiki',url:'https://fletcher-wiki.com/'},{name:'Docossum',url:'https://docossum.com/'},{name:'Google Docs',url:'https://docs.google.com/'},{name:'Google Sheets',url:'https://sheets.google.com/'}];
export function integrationsSection(state){
  const docs=docRows(state.activeProfileId);
  return `<div class="stack"><section class="card stack"><h3>Google Workspace</h3><p class="subtle">OAuth 2.0 с PKCE, только разрешение drive.file. Токен хранится в session storage расширения и не попадает в резервные копии. Без подключения все остальные модули остаются локальными.</p>
    <p>Состояние: <strong>${authenticated?'Аккаунт подключён':'Не подключён'}</strong></p><p class="subtle">Redirect URI для Google Cloud: <code>${e(getRedirectSafe())}</code></p>
    <form id="google-config-form" class="stack"><label class="field">Google OAuth Client ID (тип Web application)<input name="clientId" autocomplete="off" maxlength="250" required value="${e(clientId)}" placeholder="00000000-xxxx.apps.googleusercontent.com"></label><div class="row"><button class="button secondary" type="submit">Сохранить Client ID</button><button type="button" class="button primary" data-integration-action="connect">Подключить Google</button><button type="button" class="button secondary" data-integration-action="disconnect">Отключить</button></div></form>
    <p class="subtle">В Google Cloud включите Docs API, Sheets API и Drive API. Добавьте указанный Redirect URI в OAuth-клиент. Настроенный Client ID индивидуален для сборки и браузера.</p></section>
    <section class="card stack"><h3>Google Docs</h3><p class="subtle">Создайте документ Google из текущей редакции Document Studio или импортируйте документ, созданный/разрешённый этому OAuth-приложению. Scope drive.file не даёт доступа ко всем файлам пользователя.</p>
    <label class="field">Локальный документ<select id="google-local-doc"><option value="">Выберите документ</option>${docs.map(r=>`<option value="${e(r.id)}">${e(r.versions.at(-1)?.title||'Документ')} · v${r.currentVersion}</option>`).join('')}</select></label>
    <div class="row"><button class="button primary" data-integration-action="export-doc" ${!docs.length?'disabled':''}>Создать Google Doc</button></div>
    <form id="google-import-doc-form" class="row"><label class="field">ID документа Google<input name="id" required placeholder="ID из URL Google Docs"></label><button class="button secondary" type="submit">Импортировать в Document Studio</button></form></section>
    <section class="card stack"><h3>Google Sheets</h3><p class="subtle">Экспорт записей активного профиля в новую таблицу Google с реальными данными. Просмотр доступной таблицы по её ID без изменения содержимого.</p>
    <div class="row"><button class="button primary" data-integration-action="export-economy">Экспорт экономики</button><button class="button secondary" data-integration-action="export-complaints">Экспорт жалоб</button></div>
    <form id="google-read-sheet-form" class="row"><label class="field">ID Google Sheets<input name="id" required placeholder="ID таблицы"></label><label class="field">Диапазон<input name="range" value="A1:Z100" required maxlength="120"></label><button class="button secondary" type="submit">Прочитать диапазон</button></form>
    ${tablePreview.length?`<div class="stack"><strong>${e(previewTitle)}</strong><div style="max-height:290px;overflow:auto"><table><tbody>${tablePreview.slice(0,100).map(row=>`<tr>${row.slice(0,20).map(cell=>`<td>${e(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><button class="button secondary" data-integration-action="sheet-csv">Скачать CSV</button></div>`:''}</section>
    <section class="card stack"><h3>Google Drive</h3><p class="subtle">Сохранение полной резервной копии MajesticToolkit в свой Drive. Ни токены, ни Client ID не включаются в файл копии. Просмотр файлов, доступных данному OAuth-приложению.</p>
    <div class="row"><button class="button primary" data-integration-action="upload-backup">Загрузить резервную копию</button><button class="button secondary" data-integration-action="drive-list">Показать доступные файлы</button></div>
    ${files.length?`<div class="stack">${files.map(x=>`<div class="row spread"><span>${e(x.name)} <small>${e(x.mimeType)}</small></span><span class="row">${x.mimeType==='application/json'?`<button class="button secondary" data-integration-action="download-backup" data-id="${e(x.id)}">Скачать JSON</button>`:''}${x.webViewLink?`<button class="button secondary" data-url="${e(x.webViewLink)}">Открыть ↗</button>`:''}</span></div>`).join('')}</div>`:''}</section>
    <section class="card stack"><h3>Fletcher Wiki и Docossum</h3><p class="subtle">Переходы, персональные ссылки и собственные заметки без автоматического сбора данных, обхода защит, перехвата запросов или выполнения скриптов на внешних сайтах.</p><label class="field">Документ для ручного переноса в Docossum<select id="docossum-document"><option value="">Выберите документ</option>${docs.map(r=>`<option value="${e(r.id)}">${e(r.versions.at(-1)?.title||'Документ')}</option>`).join('')}</select></label><div class="row"><button class="button secondary" data-integration-action="copy-docossum" ${!docs.length?'disabled':''}>Копировать текст документа</button></div><div class="row">${linkSet.slice(0,2).map(x=>`<button class="button secondary" data-url="${e(x.url)}">${e(x.name)} ↗</button>`).join('')}</div>
    <form id="site-link-form" class="stack"><label class="field">Название<input name="title" required maxlength="120" placeholder="Полезная статья"></label><label class="field">HTTPS-ссылка<input name="url" type="url" required maxlength="1000" placeholder="https://docossum.com/..."></label><label class="field">Заметка<textarea name="notes" maxlength="1500" rows="3" placeholder="Личная заметка о странице"></textarea></label><button class="button primary" type="submit">Сохранить закладку</button></form>
    ${links.map(x=>`<article class="card"><div class="row spread"><strong>${e(x.title)}</strong><div class="row"><button class="button secondary" data-url="${e(x.url)}">Открыть ↗</button><button class="button danger" data-integration-action="remove-link" data-id="${e(x.id)}">Удалить</button></div></div><p class="subtle">${e(x.url)}</p>${x.notes?`<p>${e(x.notes)}</p>`:''}</article>`).join('')}</section></div>`;
}
function getRedirectSafe(){try{return redirectUri();}catch{return 'Недоступен для этого браузера';}}
export async function handleIntegrationAction(button,state,render,feedback,createBackup){
  const a=button.dataset.integrationAction,profile=state.activeProfileId;
  if(a==='connect'){await connectGoogle();await refreshIntegrations();render();feedback('Google подключён');return;}
  if(a==='disconnect'){await disconnectGoogle();await refreshIntegrations();render();feedback('Google отключён');return;}
  if(a==='remove-link'){if(!confirm('Удалить закладку?'))return;await deleteLink(button.dataset.id);await refreshIntegrations();render();feedback('Закладка удалена');return;}
  if(a==='copy-docossum'){
    const id=document.getElementById('docossum-document')?.value;const doc=docRows(profile).find(r=>r.id===id);if(!doc)throw Error('Выберите документ');
    const {documentText}=await import('../lib/document-core.mjs');
    if(!navigator.clipboard?.writeText)throw Error('Буфер обмена недоступен в этом браузере');
    await navigator.clipboard.writeText(documentText(doc));feedback('Текст документа скопирован. Вставьте его на Docossum вручную.');return;
  }
  if(a==='export-doc'){
    const id=document.getElementById('google-local-doc')?.value;const doc=docRows(profile).find(r=>r.id===id);if(!doc)throw Error('Выберите документ');
    const {documentText}=await import('../lib/document-core.mjs');const result=await createGoogleDoc(doc.versions.at(-1).title,documentText(doc));
    await api.tabs.create({url:result.url});feedback('Документ создан в Google Docs');return;
  }
  if(a==='export-economy'||a==='export-complaints'){
    const kind=a==='export-economy'?'economy':'complaints';const records=kind==='economy'?await listEconomy():await listCases();
    const rows=sheetsGrid(kind,records,profile);
    if(rows.length===1)throw Error('Нет записей для экспорта');
    const result=await createGoogleSheet(`MajesticToolkit ${kind} ${state.profiles.find(p=>p.id===profile)?.server||''}`,rows);
    await api.tabs.create({url:result.url});feedback(`Экспортировано ${rows.length-1} записей`);return;
  }
  if(a==='upload-backup'){
    const name=`majestictoolkit-backup-0.8.0-${new Date().toISOString().slice(0,10)}.json`;
    const result=await uploadBackupToDrive(name,await createBackup());feedback(`Резервная копия сохранена в Drive: ${result.name||result.id}`);return;
  }
  if(a==='drive-list'){files=await listGoogleFiles();render();feedback(`Доступно файлов: ${files.length}`);return;}
  if(a==='download-backup'){
    const item=files.find(f=>f.id===button.dataset.id&&f.mimeType==='application/json');if(!item)throw Error('Файл не найден');
    const text=await readBackupFromDrive(item.id);JSON.parse(text);download(sanitizeFileName(item.name.replace(/\.json$/i,''))+'.json',text,'application/json');feedback('JSON скачан; восстановите его в разделе «Резервные копии»');return;
  }
  if(a==='sheet-csv'){if(!tablePreview.length)throw Error('Нет данных');download('majestictoolkit-google-sheet.csv','\ufeff'+csvOf(tablePreview),'text/csv;charset=utf-8');feedback('CSV скачан');return;}
}
export async function handleIntegrationSubmit(form,state,render,feedback){
  const data=Object.fromEntries(new FormData(form).entries());
  if(form.id==='google-config-form'){await setClientId(data.clientId);await refreshIntegrations();render();feedback('Client ID сохранён; при необходимости подключите аккаунт снова');return;}
  if(form.id==='site-link-form'){await addLink(data);await refreshIntegrations();render();feedback('Закладка сохранена');return;}
  if(form.id==='google-import-doc-form'){
    const doc=await readGoogleDoc(googleFileId(data.id));const body=docsPlainText(doc);if(!body)throw Error('Документ пуст или имеет неподдерживаемую структуру');
    const title=String(doc.title||'Документ Google').slice(0,180);
    await addStudioDocument(state.activeProfileId,{title,body,fields:[],values:{},departmentId:'',templateId:''},state.profiles.map(p=>p.id),governmentRecords());
    await refreshDocuments();render();feedback('Документ импортирован в Document Studio');return;
  }
  if(form.id==='google-read-sheet-form'){
    const response=await readGoogleSheet(data.id,data.range);
    tablePreview=Array.isArray(response.values)?response.values.slice(0,1000).map(row=>row.map(x=>String(x))):[];
    previewTitle=response.range||'Google Sheets';render();feedback(`Прочитано строк: ${tablePreview.length}`);return;
  }
  throw Error('Неизвестная форма интеграции');
}
