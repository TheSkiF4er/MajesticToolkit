import test from 'node:test';
import assert from 'node:assert/strict';
import {
 safeSiteUrl,validateLinks,normalizeClientId,authUrl,parseRedirect,docsPlainText,sheetsGrid,csvOf,cleanGoogleFileList,sheetRange
} from '../src/lib/integration-core.mjs';
const client='123456789000-exampleclientid012345.apps.googleusercontent.com';
const redirect='https://testid.chromiumapp.org/majestictoolkit';
const link={id:'12345678',title:'Правила',url:'https://docossum.com/legal',notes:'Личный раздел'};
test('site URLs accept only explicitly supported HTTPS domains',()=>{
 assert.equal(safeSiteUrl('https://docossum.com/legal'),link.url);
 assert.equal(safeSiteUrl('https://www.fletcher-wiki.com/map'),'https://www.fletcher-wiki.com/map');
 for(const x of ['http://docossum.com','https://docossum.com.evil.com','javascript:alert(1)','https://me:pw@docossum.com','https://docossum.com:444/path'])assert.throws(()=>safeSiteUrl(x));
});
test('bookmark validation rejects collisions, unsafe and overlong entries',()=>{
 assert.deepEqual(validateLinks([link]),[link]);
 assert.throws(()=>validateLinks([link,link]));
 assert.throws(()=>validateLinks([{...link,url:'https://evil.test'}]));
 assert.throws(()=>validateLinks(Array.from({length:151},(_,i)=>({...link,id:'bookmark'+i}))));
});
test('OAuth request is code+PKCE with minimal drive.file scope',()=>{
 assert.equal(normalizeClientId(client),client);
 const url=new URL(authUrl({clientId:client,redirectUri:redirect,state:'state123',challenge:'challenge123'}));
 assert.equal(url.searchParams.get('response_type'),'code');
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.equal(url.searchParams.get('scope'),'https://www.googleapis.com/auth/drive.file');
 assert.equal(url.searchParams.get('client_id'),client);
 assert.throws(()=>normalizeClientId('1234')); 
});
test('OAuth redirect rejects mismatched state or origin',()=>{
 assert.equal(parseRedirect(redirect+'?code=CODE123&state=abc',redirect,'abc'),'CODE123');
 assert.throws(()=>parseRedirect(redirect+'?code=CODE123&state=wrong',redirect,'abc'));
 assert.throws(()=>parseRedirect('https://evil.test/majestictoolkit?code=x&state=abc',redirect,'abc'));
 assert.throws(()=>parseRedirect(redirect+'?error=access_denied&state=abc',redirect,'abc'));
});
test('Google Docs paragraphs and tables are converted to plain text',()=>{
 const doc={tabs:[{documentTab:{body:{content:[{paragraph:{elements:[{textRun:{content:'Привет\n'}}]}},{table:{tableRows:[{tableCells:[{content:[{paragraph:{elements:[{textRun:{content:'Кодекс'}}]}}]}]}]}}]}}}]};
 assert.equal(docsPlainText(doc),'Привет\nКодекс');
 assert.throws(()=>docsPlainText(null));
});
test('Sheets export reflects real local 0.4.0 fields',()=>{
 const rows=sheetsGrid('economy',[{profileId:'p1',type:'deal',date:'2026-10-21',title:'Автомобиль',category:'Транспорт',status:'closed',quantity:2,buyPrice:500,salePrice:800,buyFee:5,saleFee:8,note:'Комментарий'},{profileId:'p2',type:'cash',title:'Другая запись'}],'p1');
 assert.equal(rows.length,2);assert.equal(rows[1][2],'Автомобиль');assert.equal(rows[1][6],'500');assert.equal(rows[1][7],'800');
 const complaints=sheetsGrid('complaints',[{profileId:'p1',title:'Жалоба',url:'https://forum.majestic-rp.ru/t',status:'new',note:'Заметка'}],'p1');assert.equal(complaints[1][4],'Заметка');
 assert.throws(()=>sheetsGrid('bogus',[],'p1'));
});
test('CSV escapes quotes and spreadsheet formula injection',()=>{
 assert.match(csvOf([['=1+1','test,"quoted"'],['@SUM(A1)', '+cmd']]),/^"'=1\+1","test,""quoted"""/);
 assert.ok(csvOf([['-1']]).includes("'-1"));
});
test('validates sheet ranges and Drive file links',()=>{
 assert.equal(sheetRange("O'Keefe"),"'O''Keefe'!A1");
 assert.throws(()=>sheetRange('abc\nnext'));
 const result=cleanGoogleFileList({files:[{id:'abcdefghij123456',name:'Report',webViewLink:'https://evil.test/x'},{id:'abcdefghij123457',name:'Doc',webViewLink:'https://docs.google.com/document/d/abc'}]});
 assert.equal(result[0].webViewLink,'');assert.ok(result[1].webViewLink);
});
