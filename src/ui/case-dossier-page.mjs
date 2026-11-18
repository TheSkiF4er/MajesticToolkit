/** User-initiated, case-scoped dossier preview and offline exports. */
import {getCase} from '../lib/complaints-store.mjs';
import {listRules} from '../lib/rules-store.mjs';
import {listSources} from '../lib/source-library.mjs';
import {loadKnowledge} from '../lib/knowledge-store.mjs';
import {exportRegistryData} from '../lib/punishment-registry-store.mjs';
import {exportModerationOps} from '../lib/moderation-ops-store.mjs';
import {assembleDossier,dossierJson,dossierText,dossierHtml,dossierBBCode,createCaseArchive,verifyCaseArchive} from '../lib/case-dossier.mjs';
const download=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);};
function line(parent,tag,content){const el=document.createElement(tag);el.textContent=String(content);parent.append(el);return el;}
export async function openCaseDossier(state,id,feedback){
 const profile=state.profiles.find(p=>p.id===state.activeProfileId);if(!profile)throw Error('Активный профиль отсутствует');
 const [c,rules,sources,knowledge,registry,operations]=await Promise.all([getCase(id),listRules(),listSources(),loadKnowledge(state.profiles.map(p=>p.id)),exportRegistryData(state.profiles),exportModerationOps(state.profiles)]);
 const ops=operations.profiles?.find(x=>x.profileId===profile.id);
 const dossier=assembleDossier({profile,caseRow:c,rules,sources,knowledge,registry,audit:ops?.audit??[]});
 let dialog=document.getElementById('case-dossier-dialog');if(dialog)dialog.remove();dialog=document.createElement('dialog');dialog.id='case-dossier-dialog';dialog.className='case-dossier-dialog';
 line(dialog,'h2','Досье дела · '+c.title);
 line(dialog,'p',`Тема: ${c.url} · Событий: ${c.timeline.length} · Доказательств: ${c.evidence.length} · Решений реестра: ${dossier.registry.length} · Цитат: ${dossier.knowledge.quotes.length}`);
 const status=line(dialog,'p','Все материалы остаются локальными. Для ZIP проверяется SHA-256 каждого доступного файла.');status.className='subtle';
 const form=document.createElement('form');form.className='stack';form.addEventListener('submit',e=>e.preventDefault());
 const formatLabel=line(form,'label','Формат экспорта');const select=document.createElement('select');select.setAttribute('aria-label','Формат досье');for(const [value,label] of [['zip','ZIP с файлами и манифестом'],['json','JSON'],['html','HTML'],['txt','TXT'],['bbcode','BBCode']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}formatLabel.append(select);
 const includeLabel=document.createElement('label'),evidence=document.createElement('input');evidence.type='checkbox';evidence.checked=true;includeLabel.append(evidence,document.createTextNode(' Включить доказательства и файлы'));form.append(includeLabel);
 const redactLabel=document.createElement('label'),redact=document.createElement('input');redact.type='checkbox';redactLabel.append(redact,document.createTextNode(' Исключить личные заметки, никнеймы и записи реестра'));form.append(redactLabel);
 const preview=document.createElement('pre');preview.className='dossier-preview';preview.style.maxHeight='240px';preview.style.overflow='auto';preview.style.whiteSpace='pre-wrap';preview.style.overflowWrap='anywhere';form.append(preview);
 const update=()=>{preview.textContent=dossierText(dossier,{includeEvidence:evidence.checked,redact:redact.checked}).slice(0,14000);};[select,evidence,redact].forEach(el=>el.addEventListener('change',update));update();
 const buttons=document.createElement('div');buttons.className='row';const submit=document.createElement('button');submit.type='button';submit.className='button primary';submit.textContent='Проверить и скачать';buttons.append(submit);
 const close=document.createElement('button');close.type='button';close.className='button secondary';close.textContent='Закрыть';close.addEventListener('click',()=>dialog.close());buttons.append(close);form.append(buttons);dialog.append(form);
 const verifyLabel=line(dialog,'label','Проверить полученный ZIP-досье');const verifyInput=document.createElement('input');verifyInput.type='file';verifyInput.accept='.zip,application/zip';verifyInput.setAttribute('aria-label','Проверка ZIP-досье');verifyLabel.append(verifyInput);
 const basename=`majestictoolkit-dossier-${c.id}-${new Date().toISOString().slice(0,10)}`;
 let busy=false;
 submit.addEventListener('click',()=>{if(busy)return;busy=true;submit.disabled=true;void(async()=>{
  const options={includeEvidence:evidence.checked,redact:redact.checked};let blob,ext=select.value;
  if(ext==='zip'){
    const result=await createCaseArchive(dossier,options);
    blob=result.blob;
    const missing=result.manifest.files.filter(x=>x.status==='missing');
    if(missing.length&&!confirm(`Не удалось включить ${missing.length} вложений. Они будут отмечены как отсутствующие в манифесте. Скачать неполное досье?`))return;
    const inspected=await verifyCaseArchive(blob);status.textContent=`ZIP проверен: ${inspected.manifest.items.length} файлов; отсутствующих вложений: ${missing.length}`;
  }else{
    const value=ext==='json'?JSON.stringify(dossierJson(dossier,options),null,2):ext==='html'?dossierHtml(dossier,options):ext==='bbcode'?dossierBBCode(dossier,options):dossierText(dossier,options);
    blob=new Blob([value],{type:ext==='json'?'application/json;charset=utf-8':ext==='html'?'text/html;charset=utf-8':'text/plain;charset=utf-8'});
  }
  download(blob,basename+'.'+(ext==='bbcode'?'txt':ext));feedback('Досье сформировано из текущего рассмотрения');
 })().catch(err=>{status.textContent=err.message;feedback(err.message,true);}).finally(()=>{busy=false;submit.disabled=false;});});
 verifyInput.addEventListener('change',()=>{if(!verifyInput.files?.[0])return;void verifyCaseArchive(verifyInput.files[0]).then(({manifest})=>{status.textContent=`Контрольные суммы подтверждены: ${manifest.items.length} файлов, ${manifest.files.filter(f=>f.status==='missing').length} отсутствующих вложений`;feedback('Целостность ZIP-досье проверена');}).catch(err=>{status.textContent=err.message;feedback(err.message,true);}).finally(()=>{verifyInput.value='';});});
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();return dossier;
}
