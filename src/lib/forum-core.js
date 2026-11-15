/* MajesticToolkit Forum Toolkit shared runtime (extension pages + isolated content scripts). */
(() => {
  'use strict';
  const MAX_TEMPLATES = 500;
  const KEY_PREFIX = 'rpnForumTemplateV2:';
  const ID_RE = /^[a-zA-Z0-9_-]{8,100}$/;
  const trim = (v, name, max, optional = false) => {
    if (typeof v !== 'string') throw new Error(`Поле «${name}» должно быть строкой`);
    const x = v.trim();
    if ((!optional && !x) || x.length > max) throw new Error(`Недопустимая длина поля «${name}» (до ${max})`);
    return x;
  };
  const variablePattern = /\{\{([a-z][a-z0-9_]*)\}\}/gi;
  const builtin = Object.freeze(['nickname','reason','server','project','thread','url','date','time','selection']);
  function variableNames(text) { return [...new Set([...String(text).matchAll(variablePattern)].map(m=>m[1].toLowerCase()))]; }
  function cleanVariables(raw, text) {
    if (!Array.isArray(raw) || raw.length > 30) throw Error('Не более 30 переменных');
    const seen=new Set(), names=variableNames(text);
    return raw.map(v=>{
      if (!v || typeof v!=='object' || Array.isArray(v)) throw Error('Неверная переменная');
      const key=trim(v.key,'Ключ переменной',40).toLowerCase();
      if(!/^[a-z][a-z0-9_]*$/.test(key)||seen.has(key)||!names.includes(key))throw Error('Повторяющаяся или отсутствующая в тексте переменная: '+key);
      seen.add(key);
      const type=v.type??'text';
      if(!['text','multiline','number','date','url','select','boolean'].includes(type))throw Error('Неизвестный тип переменной');
      const options=type==='select'?(Array.isArray(v.options)&&v.options.length>0&&v.options.length<=30?[...new Set(v.options.map(x=>trim(x,'Вариант',150)))]:null):[];
      if(!options)throw Error('Для списка нужны варианты');
      return {key,label:trim(v.label??key,'Название переменной',90),type,required:v.required===true,options,defaultValue:trim(v.defaultValue??'','Значение по умолчанию',2000,true)};
    });
  }
  function cleanMetadata(obj,text) {
    const out={};
    if(obj.tags!==undefined){if(!Array.isArray(obj.tags)||obj.tags.length>20)throw Error('Не более 20 тегов');out.tags=[...new Set(obj.tags.map(x=>trim(x,'Тег',40)))];}
    if(obj.favorite!==undefined)out.favorite=obj.favorite===true;
    if(obj.order!==undefined){if(!Number.isSafeInteger(obj.order)||obj.order<0||obj.order>1000000)throw Error('Неверный порядок');out.order=obj.order;}
    if(obj.variables!==undefined)out.variables=cleanVariables(obj.variables,text);
    return out;
  }
  const cleanTemplate = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Неверный формат шаблона');
    const id = trim(obj.id, 'ID', 100);
    if (!ID_RE.test(id)) throw new Error('Недопустимый ID шаблона');
    const profileId = trim(obj.profileId, 'Профиль', 128);
    const label = trim(obj.label, 'Название', 90);
    const category = trim(obj.category ?? '', 'Категория', 60, true);
    const text = trim(obj.text, 'Текст', 16000);
    const shortcut = Number(obj.shortcut ?? 0);
    if (!Number.isInteger(shortcut) || shortcut < 0 || shortcut > 9) throw new Error('Клавиша: от 0 до 9');
    const format = obj.format ?? 'bbcode';
    if (!['bbcode', 'plain'].includes(format)) throw new Error('Неизвестный формат');
    const createdAt = trim(obj.createdAt, 'Дата создания', 40);
    const updatedAt = trim(obj.updatedAt, 'Дата изменения', 40);
    if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt))) throw new Error('Неправильная дата');
    const metadata=cleanMetadata(obj,text);
    if(obj.history!==undefined){
      if(!Array.isArray(obj.history)||obj.history.length>10)throw Error('Неверная история шаблона');
      metadata.history=obj.history.map(h=>{
        if(!h||typeof h!=='object')throw Error('Неверная версия шаблона');
        const snapshot=cleanTemplate({...h,id,profileId,createdAt,history:undefined});
        const {id:_id,profileId:_p,createdAt:_c,...rest}=snapshot;return rest;
      });
    }
    return { id, profileId, label, category, text, shortcut, format, createdAt, updatedAt,...metadata };
  };
  const makeId = () => 'tpl_' + (globalThis.crypto?.randomUUID?.().replace(/-/g, '') ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
  const createTemplate = (input, original = null) => cleanTemplate({
    id: original?.id ?? makeId(), profileId: input.profileId, label: input.label,
    category: input.category ?? '', text: input.text, shortcut: Number(input.shortcut ?? 0),
    ...cleanMetadata({...original,...input},input.text), history: original?.history, format: input.format ?? 'bbcode', createdAt: original?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  function interpolate(source, values = {}) {
    const map = Object.create(null);
    for (const [key, value] of Object.entries(values)) if (/^[a-z][a-z0-9_]*$/i.test(key)) map[key.toLowerCase()] = String(value ?? '').slice(0, 500);
    return String(source).replace(/\{\{([a-z][a-z0-9_]*)\}\}/gi, (all, key) => Object.hasOwn(map, key.toLowerCase()) ? map[key.toLowerCase()] : all);
  }
  function fieldsFor(t) {
    const defs=new Map((t.variables??[]).map(v=>[v.key,v]));
    return variableNames(t.text).filter(k=>defs.has(k)||!builtin.includes(k)).map(k=>defs.get(k)??{key:k,label:k,type:'text',required:true,options:[],defaultValue:''});
  }
  function renderTemplate(t, context={}, supplied={}) {
    const values=Object.assign(Object.create(null),context);
    for(const field of fieldsFor(t)){
      let value=String(Object.hasOwn(supplied,field.key)?supplied[field.key]:(Object.hasOwn(context,field.key)?context[field.key]:'')||field.defaultValue||'').trim();
      if(value.length>2000)throw Error('Слишком длинное значение: '+field.label);
      if(!value&&field.required)throw Error('Заполните: '+field.label);
      if(value){
        if(field.type==='number'&&(!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value)||!Number.isFinite(Number(value.replace(',','.')))))throw Error('Введите число: '+field.label);
        if(field.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw Error('Введите дату: '+field.label);
        if(field.type==='url'&&!safeURL(value))throw Error('Введите HTTP(S) ссылку: '+field.label);
        if(field.type==='select'&&!field.options.includes(value))throw Error('Выберите вариант: '+field.label);
        if(field.type==='boolean'&&!['Да','Нет'].includes(value))throw Error('Выберите Да или Нет: '+field.label);
      }
      values[field.key]=value;
    }
    // Values are literal data, not markup. Neutralize brackets in BBCode values to prevent tag injection.
    // Preserve old interpolation behavior for the legacy public helper; only Binder 2 uses strict rendering.
    const result=String(t.text).replace(variablePattern,(all,key)=>{
      key=key.toLowerCase();if(!Object.hasOwn(values,key))return all;
      const v=String(values[key]??'').slice(0,2000);
      return t.format==='bbcode'?v.replace(/\[/g,'［').replace(/\]/g,'］'):v;
    });
    if(result.length>64000)throw Error('Результат превышает 64 000 символов');
    return result;
  }
  function safeURL(input) {
    try { const u = new URL(input); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; }
    catch { return null; }
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Whitelisted BBCode -> HTML for contenteditable rich editors. No arbitrary HTML is trusted.
  function bbcodeToHtml(raw) {
    // Render only recognized, balanced tags; attributes are never parsed as HTML.
    const root={children:[]},stack=[root];
    const simple={b:'strong',i:'em',u:'u',s:'s',quote:'blockquote',code:'pre',list:'ul',li:'li',spoiler:'details',center:'div',left:'div',right:'div',align:'div',color:'span',size:'span',url:'a'};
    const token=/\[(\/?)([a-z]+|\*)(?:=([^\]\r\n]*))?\]/gi;
    const source=String(raw),pushText=t=>{if(t)stack.at(-1).children.push(esc(t).replace(/\r?\n/g,'<br>'));};
    let last=0,m;
    while((m=token.exec(source))){
      pushText(source.slice(last,m.index));last=token.lastIndex;
      const closing=!!m[1],name=m[2].toLowerCase(),arg=(m[3]??'').replace(/^(['"])([\s\S]*)\1$/,'$2');
      if(stack.at(-1).name==='code'&&!(closing&&name==='code')){pushText(m[0]);continue;}
      if(name==='*'&&!closing&&stack.some(n=>n.name==='list')){if(stack.at(-1).name==='li')stack.pop();if(stack.at(-1).name==='list'){const node={name:'li',children:[],raw:'',arg:''};stack.at(-1).children.push(node);stack.push(node);continue;}}
      if(closing&&name==='list'&&stack.at(-1).name==='li')stack.pop();
      if(!Object.hasOwn(simple,name)){pushText(m[0]);continue;}
      if(closing){if(stack.at(-1).name===name){stack.at(-1).closed=true;stack.pop();}else pushText(m[0]);continue;}
      if(stack.length>=32){pushText(m[0]);continue;}
      const node={name,arg,children:[],raw:m[0],closed:false};stack.at(-1).children.push(node);stack.push(node);
    }
    pushText(source.slice(last));
    function render(node){
      if(typeof node==='string')return node;
      const body=node.children.map(render).join('');if(!node.name)return body;
      const name=node.name,arg=node.arg,tag=simple[name];
      if(!node.closed&&name!=='li')return esc(node.raw)+body;
      if(name==='url'){const href=safeURL(arg);return href?`<a href="${esc(href)}" rel="nofollow noopener noreferrer">${body}</a>`:esc(node.raw)+body+'[/url]';}
      if(name==='color')return /^(#[0-9a-f]{3,8}|[a-z]{3,18})$/i.test(arg)?`<span style="color:${arg}">${body}</span>`:body;
      if(name==='size'){const n=Number(arg);return Number.isInteger(n)&&n>=8&&n<=48?`<span style="font-size:${n}px">${body}</span>`:body;}
      if(name==='align'||['center','left','right'].includes(name)){const v=name==='align'?arg:name;return ['left','center','right'].includes(v)?`<div style="text-align:${v}">${body}</div>`:body;}
      if(name==='spoiler')return `<details><summary>${esc(arg||'Спойлер')}</summary>${body}</details>`;
      if(name==='list'&&arg==='1')return `<ol>${body}</ol>`;
      return `<${tag}>${body}</${tag}>`;
    }
    return render(root);
  }
  function selectTemplates(all, profileId, query = '') {
    const q = query.trim().toLocaleLowerCase('ru');
    return all.filter(t => t.profileId === '*' || t.profileId === profileId).filter(t => !q || [t.label, t.category, t.text, ...(t.tags??[])].some(x => x.toLocaleLowerCase('ru').includes(q)))
      .sort((a, b) => a.category.localeCompare(b.category, 'ru') || (a.order??1000000)-(b.order??1000000) || a.label.localeCompare(b.label, 'ru'));
  }
  function libraryTemplates(all,profileId,query='',filter='all',usage={},category='') {
    let rows=selectTemplates(all,profileId,query).filter(t=>!category||t.category===category||t.category.startsWith(category+'/'));
    if(filter==='favorite')rows=rows.filter(t=>t.favorite);
    if(filter==='recent')rows=rows.filter(t=>Object.hasOwn(usage,t.id)).sort((a,b)=>usage[b.id]-usage[a.id]);
    return rows;
  }
  function slotTemplates(all, profileId) {
    const slots = new Map();
    for (const t of selectTemplates(all, profileId)) if (t.shortcut && (!slots.has(t.shortcut) || (slots.get(t.shortcut).profileId === '*' && t.profileId !== '*'))) slots.set(t.shortcut, t);
    return slots;
  }
  function fieldMarkup(field,value='',className=''){
    const name=esc(field.key),v=String(value??''),common=`name="${name}" class="${esc(className)}" ${field.required?'required':''}`;
    const options=field.type==='boolean'?['Да','Нет']:field.options;
    let input;
    if(field.type==='select'||field.type==='boolean')input=`<select ${common}><option value="">— Выберите —</option>${options.map(o=>`<option value="${esc(o)}" ${o===v?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
    else if(field.type==='multiline')input=`<textarea ${common} rows="3" maxlength="2000">${esc(v)}</textarea>`;
    else input=`<input ${common} type="${field.type==='date'?'date':field.type==='url'?'url':'text'}" maxlength="2000" value="${esc(v)}">`;
    return `<label>${esc(field.label)}${field.required?' *':''}${input}</label>`;
  }
  function exportPack(rows,links=[]){return JSON.stringify({format:'majestic-binder-pack',version:1,templates:rows.map(cleanTemplate),links:links.map(l=>({title:l.title,url:l.url}))},null,2);}
  function parseImport(text,profileId){
    if(typeof text!=='string'||new TextEncoder().encode(text).length>8*1024*1024)throw Error('Файл превышает 8 МиБ');
    let pack;try{pack=JSON.parse(text);}catch{throw Error('Некорректный JSON');}
    let rows,links=[],source='native';
    if(pack?.format==='majestic-binder-pack'&&pack.version===1){rows=pack.templates;links=pack.links??[];}
    else if(Array.isArray(pack?.binds)&&Array.isArray(pack.bindFolders)&&Array.isArray(pack.customLinks)){
      source='binds_and_links';if(pack.binds.length>MAX_TEMPLATES||pack.bindFolders.length>MAX_TEMPLATES||pack.customLinks.length>60)throw Error('Превышен лимит записей');
      const folders=new Map(pack.bindFolders.map(f=>[trim(f.id,'ID папки',100),trim(f.name,'Папка',60)]));
      const date=new Date().toISOString();
      rows=pack.binds.map(b=>{
        const id=trim(b.id,'ID бинда',90),label=trim(b.titelOutput,'Название бинда',90),category=folders.get(b.folderId)??'';
        let body=trim(b.textOutput??'','Текст бинда',16000,true);
        if(b.punish?.on===true){
          const p=b.punish,parts=[trim(p.reasonText??label,'Правило',500)];
          const labels={ban:'Ban',hardban:'HardBan',demorgan:'Demorgan',gunban:'GunBan',mute:'Mute'};
          for(const [key,name] of Object.entries(labels)){const r=p.t?.[key];if(r&&Number.isFinite(r.min)&&Number.isFinite(r.max)&&r.min>=0&&r.max>=r.min)parts.push(`${name}: ${r.min===r.max?r.min:r.min+'–'+r.max}${key==='ban'||key==='hardban'?' дн.':key==='demorgan'||key==='mute'?' мин.':''}`);}
          if(p.t?.warn===true||p.warn===true)parts.push('WARN');
          if(typeof p.link==='string'&&safeURL(p.link)&&p.link.startsWith('https://'))parts.push('Источник: '+p.link);
          body=[body,parts.join('\n')].filter(Boolean).join('\n\n');
        }
        if(!body)throw Error('Пустой бинд: '+label);
        const tags=typeof b.color==='string'&&b.color.trim()?['color:'+b.color.trim().slice(0,30)]:[];
        return {id:'legacy_'+id,profileId,label,category,text:body,format:'bbcode',shortcut:0,createdAt:date,updatedAt:date,tags};
      });links=pack.customLinks.map(l=>({title:l.name,url:l.url}));
    }else throw Error('Неподдерживаемый формат набора Binder');
    if(!Array.isArray(rows)||rows.length>MAX_TEMPLATES||!Array.isArray(links)||links.length>60)throw Error('Некорректный набор Binder');
    const seen=new Set(),templates=rows.map(t=>{const row=cleanTemplate({...t,profileId});if(seen.has(row.id))throw Error('Повторяющийся ID');seen.add(row.id);return row;});
    links=links.map(l=>{const title=trim(l.title,'Название ссылки',70),url=trim(l.url,'Ссылка',2048);const safe=safeURL(url);if(!safe||!safe.startsWith('https://')||new URL(safe).port)throw Error('Разрешены только HTTPS-ссылки');return {title,url:safe};});
    return {templates,links,source};
  }
  function parsePack(text,profileId){return parseImport(text,profileId).templates;}
  globalThis.RPNForumCore = Object.freeze({ MAX_TEMPLATES, KEY_PREFIX, cleanTemplate, createTemplate, interpolate, bbcodeToHtml, selectTemplates, slotTemplates, esc, safeURL, fieldsFor, renderTemplate, libraryTemplates, exportPack, parsePack, parseImport, variableNames, builtin, fieldMarkup });
})();
