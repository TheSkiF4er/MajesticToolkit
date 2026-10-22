import test from 'node:test';
import assert from 'node:assert/strict';
const calls=[];
globalThis.browser={storage:{session:{async get(){return {'majesticToolkit:googleSessionToken:v8':{access_token:'fake-test-access-token',expires_at:Date.now()+900000}};}},local:{}},runtime:{id:'test-extension'}};
const {copyGoogleTemplate}=await import('../src/lib/google-client.mjs');
const previousFetch=globalThis.fetch;
test('Google template copy makes a real authenticated Drive file copy request without widening permissions',async()=>{
 globalThis.fetch=async(url,options)=>{
   calls.push({url:String(url),options});
   return {ok:true,status:200,async json(){return {id:'copy_created_000123456',name:'Test'}}};
 };
 try{
  const doc=await copyGoogleTemplate('google-doc','Google_file_id_01234','Новый документ');
  assert.equal(doc.url,'https://docs.google.com/document/d/copy_created_000123456/edit');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://www.googleapis.com/drive/v3/files/Google_file_id_01234/copy?fields=id,name,mimeType,webViewLink');
  assert.equal(calls[0].options.method,'POST');
  assert.equal(calls[0].options.headers.Authorization,'Bearer fake-test-access-token');
  assert.deepEqual(JSON.parse(calls[0].options.body),{name:'Новый документ'});
  const sheet=await copyGoogleTemplate('google-sheet','Google_file_id_01234','Новая таблица');
  assert.match(sheet.url,/spreadsheets\/d\/copy_created/);
  await assert.rejects(()=>copyGoogleTemplate('unknown','Google_file_id_01234','Title'));
 }finally{globalThis.fetch=previousFetch;}
});
test('failed Google Drive copy reports actionable HTTP error; never silently creates a fake file',async()=>{
 globalThis.fetch=async()=>({ok:false,status:403,statusText:'Forbidden',async json(){return {error:{message:'File is outside drive.file access'}}}});
 try{await assert.rejects(()=>copyGoogleTemplate('google-doc','Google_file_id_01234','Copy'),/Google API \(403\)/);}
 finally{globalThis.fetch=previousFetch;}
});
