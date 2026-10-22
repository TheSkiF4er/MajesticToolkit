// Google API operations run only on explicit user actions. No server, secrets or refresh tokens.
import { api } from './browser.mjs';
import { GOOGLE_SCOPE, CLIENT_ID_KEY,normalizeClientId,authUrl,parseRedirect,googleFileId,sheetRange,cleanGoogleFileList } from './integration-core.mjs';
const origins=['https://www.googleapis.com/*','https://docs.googleapis.com/*','https://sheets.googleapis.com/*','https://oauth2.googleapis.com/*'];
const TOKEN_KEY='majesticToolkit:googleSessionToken:v8';
let volatileToken=null;
export const googleOrigins=origins;
export async function getClientId(){const data=await api.storage.local.get(CLIENT_ID_KEY);return data[CLIENT_ID_KEY]||'';}
export async function setClientId(value){const id=normalizeClientId(value);await api.storage.local.set({[CLIENT_ID_KEY]:id});await disconnectGoogle();return id;}
export function redirectUri(){if(!api.identity?.getRedirectURL)throw Error('Браузер не поддерживает WebExtension Identity API');return api.identity.getRedirectURL('majestictoolkit');}
async function cryptoChallenge() {
  const bytes=crypto.getRandomValues(new Uint8Array(32));const verifier=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
  const challenge=btoa(String.fromCharCode(...digest)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  return {verifier,challenge,state:crypto.randomUUID()};
}
async function setSession(token){volatileToken=token;try {await api.storage.session?.set({[TOKEN_KEY]:token});}catch{/* Session storage unavailable: page session still works */}}
async function readSession(){if(volatileToken)return volatileToken;try{const s=await api.storage.session?.get(TOKEN_KEY);return s?.[TOKEN_KEY]||null;}catch{return null;}}
export async function disconnectGoogle(){volatileToken=null;try{await api.storage.session?.remove(TOKEN_KEY);}catch{/* noop */}}
export async function googleStatus(){const session=await readSession();return Boolean(session?.access_token&&session.expires_at>Date.now()+60000);}
// Firefox 140+/Android 142+: optional collection must be explicitly allowed before
// user-selected documents, authentication and exports leave the local browser.
// Other browsers receive their ordinary optional host permission prompt.
export const GOOGLE_DATA_COLLECTION=['authenticationInfo','personallyIdentifyingInfo','personalCommunications','websiteContent'];
export function googlePermissionRequest(){
  const declared=api.runtime?.getManifest?.()?.browser_specific_settings?.gecko?.data_collection_permissions;
  return declared?.optional ? {origins,data_collection:GOOGLE_DATA_COLLECTION} : {origins};
}
export async function connectGoogle(){
  // Request both host and data consent from the original user click. No Google
  // traffic (including the OAuth flow) is started until both are granted.
  if(!await api.permissions.request(googlePermissionRequest()))throw Error('Доступ к Google APIs или согласие на передачу данных не предоставлены');
  const clientId=await getClientId();if(!clientId)throw Error('Укажите Google OAuth Client ID');
  const redirect=redirectUri();
  const {state,verifier,challenge}=await cryptoChallenge();
  const target=authUrl({clientId,redirectUri:redirect,state,challenge});
  const result=await api.identity.launchWebAuthFlow({url:target,interactive:true});
  if(!result)throw Error('Авторизация Google не завершена');
  const code=parseRedirect(result,redirect,state);
  const body=new URLSearchParams({client_id:clientId,code,code_verifier:verifier,redirect_uri:redirect,grant_type:'authorization_code'});
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||typeof data.access_token!=='string')throw Error(data.error_description||data.error||'Ошибка получения Google OAuth token');
  const token={access_token:data.access_token,expires_at:Date.now()+Math.max(30,Number(data.expires_in)||3600)*1000,scope:GOOGLE_SCOPE};
  await setSession(token);return true;
}
async function accessToken(){const token=await readSession();if(!token||token.expires_at<Date.now()+60000)throw Error('Сессия Google истекла. Подключите аккаунт снова.');return token.access_token;}
export async function googleRequest(url,options={}) {
  const u=new URL(url);
  if(u.protocol!=='https:'||!['www.googleapis.com','docs.googleapis.com','sheets.googleapis.com'].includes(u.hostname))throw Error('Недопустимый домен Google API');
  const access=await accessToken();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try {
    const response=await fetch(u,{...options,signal:controller.signal,headers:{...options.headers,Authorization:`Bearer ${access}`}});
    if(response.status===204)return {};
    const result=await response.json().catch(()=>({}));
    if(!response.ok){if(response.status===401)await disconnectGoogle();throw Error(`Google API (${response.status}): ${String(result.error?.message||response.statusText).slice(0,250)}`);}
    return result;
  } catch(error) {if(error.name==='AbortError')throw Error('Google API не ответил за 25 секунд');throw error;}
  finally {clearTimeout(timer);}
}
export async function createGoogleDoc(title,body){
  if(typeof title!=='string'||!title.trim()||title.length>180||typeof body!=='string'||body.length>60000)throw Error('Некорректный документ');
  const doc=await googleRequest('https://docs.googleapis.com/v1/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:title.trim()})});
  if(!doc.documentId)throw Error('Документ не создан');
  try{if(body)await googleRequest(`https://docs.googleapis.com/v1/documents/${googleFileId(doc.documentId)}:batchUpdate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:[{insertText:{endOfSegmentLocation:{},text:body}}]})});}
  catch(error){throw Error(`Документ создан, но текст не записан: ${error.message}. ID: ${doc.documentId}`);}
  return {id:doc.documentId,url:`https://docs.google.com/document/d/${doc.documentId}/edit`};
}
export async function readGoogleDoc(id){return googleRequest(`https://docs.googleapis.com/v1/documents/${googleFileId(id)}?includeTabsContent=true`);}
export async function createGoogleSheet(title,rows){
  if(typeof title!=='string'||!title.trim()||title.length>180||!Array.isArray(rows)||rows.length>10000||rows.some(r=>!Array.isArray(r)||r.length>30))throw Error('Некорректные данные таблицы');
  const response=await googleRequest('https://sheets.googleapis.com/v4/spreadsheets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({properties:{title:title.trim()},sheets:[{properties:{title:'Экспорт'}}]})});
  if(!response.spreadsheetId)throw Error('Не удалось создать таблицу');
  const id=googleFileId(response.spreadsheetId);
  try{await googleRequest(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(sheetRange('Экспорт'))}?valueInputOption=RAW`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:rows})});}
  catch(err){throw Error(`Таблица создана, но экспорт не завершён: ${err.message}. ID: ${id}`);}
  return {id,url:`https://docs.google.com/spreadsheets/d/${id}/edit`};
}
export async function readGoogleSheet(id,range='A1:Z1000') {
  if(typeof range!=='string'||range.length>120||!/^([\w -]{1,80}!)?\$?[A-Z]{1,3}\$?\d+:\$?[A-Z]{1,3}\$?\d+$/i.test(range))throw Error('Укажите диапазон, например A1:Z100');
  return googleRequest(`https://sheets.googleapis.com/v4/spreadsheets/${googleFileId(id)}/values/${encodeURIComponent(range)}`);
}
export async function uploadBackupToDrive(name,text) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>48*1024*1024)throw Error('Некорректный или слишком большой файл копии');
  const boundary=`majestic${crypto.randomUUID().replaceAll('-','')}`;
  const metadata=JSON.stringify({name:name.slice(0,200),mimeType:'application/json',description:'MajesticToolkit local backup'});
  const blob=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,text,`\r\n--${boundary}--\r\n`]);
  return googleRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body:blob});
}
export async function listGoogleFiles(){const data=await googleRequest('https://www.googleapis.com/drive/v3/files?pageSize=50&orderBy=modifiedTime%20desc&fields=files(id,name,mimeType,modifiedTime,webViewLink),nextPageToken&q=trashed%3Dfalse');return cleanGoogleFileList(data);}
export async function readBackupFromDrive(id){const access=await accessToken();const url=`https://www.googleapis.com/drive/v3/files/${googleFileId(id)}?alt=media`;const r=await fetch(url,{headers:{Authorization:`Bearer ${access}`}});if(!r.ok)throw Error(`Google Drive: HTTP ${r.status}`);if(Number(r.headers.get('content-length')||0)>48*1024*1024)throw Error('Файл больше 48 МиБ');const text=await r.text();if(new TextEncoder().encode(text).length>48*1024*1024)throw Error('Файл больше 48 МиБ');return text;}
