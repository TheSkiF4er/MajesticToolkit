import test from 'node:test';import assert from 'node:assert/strict';
const local=new Map(),session=new Map(),calls=[],origin='https://testexampleid.chromiumapp.org/majestictoolkit';
const localStore={async get(key){if(key===null)return Object.fromEntries(local);return {[key]:local.get(key)};},async set(values){for(const [k,v] of Object.entries(values))local.set(k,v);},async remove(key){local.delete(key);}};
const sessionStore={async get(key){return {[key]:session.get(key)};},async set(values){for(const [k,v] of Object.entries(values))session.set(k,v);},async remove(key){session.delete(key);}};
let granted=false;
globalThis.browser={storage:{local:localStore,session:sessionStore},permissions:{async request({origins}){assert.equal(origins.length,4);granted=true;return true;}},identity:{getRedirectURL(){return origin;},async launchWebAuthFlow({url,interactive}){assert.equal(interactive,true);const u=new URL(url);assert.ok(u.searchParams.get('code_challenge'));return origin+`?state=${u.searchParams.get('state')}&code=google-code` ;}}};
let expired=false;
const originalFetch=globalThis.fetch;
globalThis.fetch=async (url,options={})=>{
 const u=new URL(url);calls.push({url:String(url),method:options.method||'GET',headers:options.headers,body:options.body});
 const ok=data=>({ok:true,status:200,json:async()=>data});
 if(u.hostname==='oauth2.googleapis.com'){assert.match(String(options.body),/code_verifier=/);return ok({access_token:'tokenXYZ',expires_in:3600});}
 assert.equal(options.headers?.Authorization,'Bearer tokenXYZ');
 if(u.hostname==='docs.googleapis.com') {
  if(u.pathname.endsWith(':batchUpdate'))return ok({replies:[{}]});
  if(options.method==='POST')return ok({documentId:'docid00000012345'});
  return ok({title:'Imported',tabs:[{documentTab:{body:{content:[{paragraph:{elements:[{textRun:{content:'Google doc text\n'}}]}}]}}}]});
 }
 if(u.hostname==='sheets.googleapis.com'){
  if(options.method==='POST')return ok({spreadsheetId:'sheetid00000012345'});
  if(options.method==='PUT')return ok({updatedRows:2});
  return ok({range:'A1:B2',values:[['A','B'],['1','2']]});
 }
 if(u.pathname.includes('/upload/drive/')){assert.match(options.headers['Content-Type'],/multipart\/related/);return ok({id:'backupid00000012345',name:'backup.json'});}
 if(u.pathname==='/drive/v3/files')return ok({files:[{id:'fileid000000123456',name:'Saved backup',mimeType:'application/json'}]});
 throw Error('Unexpected URL '+url);
};
const g=await import('../src/lib/google-client.mjs');
test('Google OAuth PKCE login with no saved permanent token',async()=>{
 const id='123456789000-abcdefghijklmnopq.apps.googleusercontent.com';
 await g.setClientId(id);assert.equal(await g.getClientId(),id);
 assert.equal(await g.googleStatus(),false);await g.connectGoogle();
 assert.equal(granted,true);assert.equal(await g.googleStatus(),true);
 assert.equal(local.has('majesticToolkit:googleSessionToken:v8'),false);
 assert.equal(session.has('majesticToolkit:googleSessionToken:v8'),true);
});
test('Google Docs create+insert text and read existing document',async()=>{
 const d=await g.createGoogleDoc('Закон','Статья 1. Текст');assert.match(d.url,/docs\.google\.com\/document/);
 assert.equal((await g.readGoogleDoc('docid00000012345')).title,'Imported');
 assert.ok(calls.some(c=>c.method==='POST'&&c.url.includes(':batchUpdate')&&String(c.body).includes('Статья 1')));
});
test('Google Sheets create+write and read',async()=>{
 const s=await g.createGoogleSheet('Жалобы',[['Номер','Статус'],['1','Закрыта']]);assert.match(s.url,/spreadsheets/);
 const r=await g.readGoogleSheet('sheetid00000012345','A1:B2');assert.equal(r.values[1][1],'2');
 assert.ok(calls.some(c=>c.method==='PUT'&&c.url.includes('/values/')));
});
test('Drive backup upload and listing',async()=>{
 const d=await g.uploadBackupToDrive('backup.json','{"schemaVersion":8}');assert.equal(d.name,'backup.json');
 const files=await g.listGoogleFiles();assert.equal(files.length,1);
 assert.equal(files[0].id,'fileid000000123456');
});
test('Google URL and input validation blocks arbitrary destinations',async()=>{
 await assert.rejects(()=>g.googleRequest('https://example.org/drive/v3/files'));
 await assert.rejects(()=>g.readGoogleDoc('bad/id'));
 await assert.rejects(()=>g.readGoogleSheet('sheetid00000012345','DROP TABLE'));
});
test('Google signout wipes session token',async()=>{await g.disconnectGoogle();assert.equal(await g.googleStatus(),false);});
test.after(()=>{globalThis.fetch=originalFetch;delete globalThis.browser;});
