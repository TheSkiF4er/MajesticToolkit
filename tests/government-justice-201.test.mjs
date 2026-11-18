import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
const memory={};
const local={
  async get(key){if(key===null)return structuredClone(memory);if(typeof key==='string')return Object.hasOwn(memory,key)?{[key]:structuredClone(memory[key])}:{};if(Array.isArray(key))return Object.fromEntries(key.filter(k=>Object.hasOwn(memory,k)).map(k=>[k,structuredClone(memory[k])]));return {};},
  async set(entries){Object.assign(memory,structuredClone(entries));},
  async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete memory[k];}
};
globalThis.chrome={storage:{local}};
const gov=await import('../src/lib/government-store.mjs');
const law=await import('../src/lib/law-store.mjs');
const docs=await import('../src/lib/document-store.mjs');
const ui=await import('../src/ui/government-justice-page.mjs');
const core=await import('../src/lib/government-justice-core.mjs');
const A='profile_majestic_201',B='profile_russia_201';
const state={activeProfileId:A,profiles:[{id:A,name:'Верховный суд',server:'SkiF4er'},{id:B,name:'Другой профиль',server:'Beta'}]};
const fields={name:'Окружной суд',code:'DC',jurisdiction:'San Andreas',officer:'Jane Bailey',position:'Судья'};
const lawFields={title:'Уголовный кодекс',category:'Кодекс',label:'Первая редакция',effectiveDate:'2026-10-01',articlesText:'Статья 12. Право на защиту\nОбеспечение процессуальных гарантий участника.'};
beforeEach(()=>{for(const k of Object.keys(memory))delete memory[k];});
async function refresh(){await Promise.all([ui.loadJusticeWorkspace(state),ui.changeJusticeTab(state,'overview'),law.listLawRecords(),gov.listGovernment()]);await Promise.all([import('../src/ui/government-page.mjs').then(m=>m.refreshGovernment()),import('../src/ui/law-page.mjs').then(m=>m.refreshLaw()),import('../src/ui/document-page.mjs').then(m=>m.refreshDocuments())]);}
test('full real-store government / law / decision / document workflow appears without duplicating records',async()=>{
  const department=await gov.addDepartment(A,fields);
  const book=await law.newLawBook(A,lawFields);
  const decision=await gov.addDecision(A,{departmentId:department.id,caseNumber:'SC-201',subject:'Jane Doe',facts:'Обстоятельства установлены',reason:'Применена норма',sanction:'Отклонить иск',notes:'Принято в заседании',selections:[{bookId:book.id,editionId:book.activeEditionId,articleKey:'12'}]},[book]);
  const document=await docs.addStudioDocument(A,{title:'Судебный протокол',body:'Рассмотрено дело SC-201',fields:[],values:{},departmentId:department.id},[A,B],[department]);
  const govtTemplate=await gov.addTemplate(A,{title:'Процессуальное определение',body:'{officer} {subject}',departmentId:department.id});
  await refresh();
  const snap=core.justiceSnapshot(A,await gov.listGovernment(),await law.listLawRecords(),await docs.listDocumentRecords());
  assert.equal(snap.courts.length,1);assert.equal(snap.decisions.length,1);assert.equal(snap.books.length,1);assert.equal(snap.documents.length,1);assert.equal(snap.governmentTemplates.length,1);assert.equal(snap.articles,1);
  assert.equal(core.justiceSearch(snap,'процессуальных гарантий').length,1);
  assert.equal(core.justiceSearch(snap,'SC-201').length,2);
  assert.equal(ui.justiceRecord(state,'decision',decision.id).id,decision.id);
  assert.match(ui.governmentJusticeSection(state),/SC-201/);
  assert.match(ui.governmentJusticeSection(state),/Процессуальный шаблон/);
  const other=await gov.addDepartment(B,{...fields,name:'Секретный департамент',code:'XX'});
  await refresh();
  assert.equal(ui.justiceRecord(state,'department',other.id),null);
  assert.doesNotMatch(ui.governmentJusticeSection(state),/Секретный департамент/);
  assert.equal((await gov.getGovernment(department.id)).name,fields.name);
  assert.equal((await docs.getDocumentRecord(document.id)).currentVersion,1);
  assert.equal((await law.getLawRecord(book.id)).title,lawFields.title);
  assert.equal((await gov.getGovernment(govtTemplate.id)).title,'Процессуальное определение');
});
test('persistent per-profile tabs and recent real records survive reload, reject foreign/removed records',async()=>{
  const dep=await gov.addDepartment(A,fields);await refresh();
  await ui.changeJusticeTab(state,'courts');await ui.rememberJusticeOpen(state,'department',dep.id);
  await ui.loadJusticeWorkspace(state);
  assert.equal(ui.currentJusticeTab(A),'courts');assert.equal(ui.currentJusticeTab(B),'overview');
  assert.match(ui.governmentJusticeSection(state),/Окружной суд/);
  assert.equal(memory[core.JUSTICE_UI_KEY].recent[0].id,dep.id);
  assert.throws(()=>core.rememberJusticeRecord(memory[core.JUSTICE_UI_KEY],A,'decision','<img src=x>',[A,B]));
  assert.throws(()=>core.selectJusticeTab(memory[core.JUSTICE_UI_KEY],B,'unknown',[A,B]));
  const filtered=core.cleanJusticeUI({...memory[core.JUSTICE_UI_KEY],tabs:{[A]:'courts',[B]:'documents'},recent:[...memory[core.JUSTICE_UI_KEY].recent,{profileId:B,kind:'department',id:dep.id,openedAt:123}]},[A]);
  assert.equal(filtered.tabs[B],undefined);assert.equal(filtered.recent.length,1);
  await gov.deleteGovernment(dep.id);await import('../src/ui/government-page.mjs').then(m=>m.refreshGovernment());
  assert.equal(ui.justiceRecord(state,'department',dep.id),null);
  assert.doesNotMatch(ui.governmentJusticeSection(state),/Окружной суд/);
});
test('court detection uses actual word boundaries instead of matching госУДарственный, and searches are XSS-safe',async()=>{
  assert.equal(core.isCourtDepartment({type:'department',name:'Государственный департамент',code:'GOV'}),false);
  assert.equal(core.isCourtDepartment({type:'department',name:'Апелляционный суд',code:'AC'}),true);
  assert.equal(core.isCourtDepartment({type:'department',name:'District Court',code:'DC'}),true);
  const dep=await gov.addDepartment(A,{...fields,name:'Суд <img src=x onerror=alert(1)>'});
  await refresh();
  ui.setJusticeQuery('суд');
  const html=ui.justiceSearchHTML(state);
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);
  assert.equal(ui.justiceRecord(state,'department',dep.id)?.tab,'courts');
  assert.equal(core.justiceSearch(core.justiceSnapshot(B,await gov.listGovernment()),'суд').length,0);
  ui.setJusticeQuery('');
});
